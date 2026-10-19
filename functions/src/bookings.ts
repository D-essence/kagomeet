import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AppError,
  TERMS_VERSION,
  validateEligibility,
  type Booking,
  type CheckoutInput,
  type EventRecord,
} from './domain.js';
export function fingerprint(input: CheckoutInput) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export async function reserve(
  db: Firestore,
  input: CheckoutInput,
  now = Date.now(),
): Promise<Booking> {
  const id = createHash('sha256').update(input.idempotencyKey).digest('hex');
  const participantKey = createHash('sha256')
    .update(`${input.eventId}:${input.email.toLowerCase()}`)
    .digest('hex');
  const uniqueRef = db.collection('participantKeys').doc(participantKey);
  const ref = db.collection('bookings').doc(id),
    eventRef = db.collection('events').doc(input.eventId);
  return db.runTransaction(async (tx) => {
    const [prior, eventSnap, duplicate] = await Promise.all([
      tx.get(ref),
      tx.get(eventRef),
      tx.get(uniqueRef),
    ]);
    if (prior.exists) {
      const booking = prior.data() as Booking;
      if (booking.fingerprint !== fingerprint(input))
        throw new AppError(409, '入力内容が変わりました。再度お申し込みください');
      if (booking.status !== 'holding')
        throw new AppError(409, 'この申し込みは処理済みです。確認画面をご確認ください');
      return booking;
    }
    if (duplicate.exists)
      throw new AppError(
        409,
        'このメールアドレスでは申し込み済み、または決済待ちです。確認メールをご確認いただくか、約30分後に再度お試しください',
      );
    if (!eventSnap.exists) throw new AppError(404, 'イベントが見つかりません');
    const event = eventSnap.data() as EventRecord;
    validateEligibility(event, input, now);
    const { idempotencyKey: _, terms: __, ...customer } = input;
    const booking: Booking = {
      ...customer,
      id,
      participantKey,
      token: randomUUID(),
      fingerprint: fingerprint(input),
      eventTitle: event.title,
      amount: input.gender === 'male' ? event.malePrice : event.femalePrice,
      status: 'holding',
      createdAt: now,
      expiresAt: now + 31 * 60000,
      sessionId: null,
      paymentIntentId: null,
      checkedIn: false,
      refundedAmount: 0,
      termsVersion: TERMS_VERSION,
    };
    const field = input.gender === 'male' ? 'reservedMale' : 'reservedFemale';
    tx.update(eventRef, { [field]: event[field] + 1 });
    tx.create(ref, booking);
    tx.create(uniqueRef, { bookingId: id });
    return booking;
  });
}
export async function settle(
  db: Firestore,
  args: {
    bookingId: string;
    webhookId: string;
    kind: 'paid' | 'expired';
    sessionId: string;
    amount?: number;
    currency?: string;
    paymentIntentId?: string;
  },
) {
  const ref = db.collection('bookings').doc(args.bookingId),
    webhookRef = db.collection('stripeEvents').doc(args.webhookId);
  return db.runTransaction(async (tx) => {
    const [snap, seen] = await Promise.all([tx.get(ref), tx.get(webhookRef)]);
    if (seen.exists) return;
    if (!snap.exists) throw new AppError(404, 'Booking missing');
    const booking = snap.data() as Booking;
    const eventRef = db.collection('events').doc(booking.eventId),
      eventSnap = await tx.get(eventRef);
    const event = eventSnap.data() as EventRecord;
    if (booking.sessionId && booking.sessionId !== args.sessionId)
      throw new AppError(409, 'Session mismatch');
    if (
      args.kind === 'paid' &&
      (args.amount !== booking.amount || args.currency !== 'jpy' || !args.paymentIntentId)
    )
      throw new AppError(409, 'Payment mismatch');
    if (booking.status === 'holding') {
      const reserved = booking.gender === 'male' ? 'reservedMale' : 'reservedFemale';
      const confirmed = booking.gender === 'male' ? 'confirmedMale' : 'confirmedFemale';
      if (event[reserved] <= 0) throw new AppError(409, 'Reservation counter mismatch');
      tx.update(eventRef, {
        [reserved]: event[reserved] - 1,
        ...(args.kind === 'paid' ? { [confirmed]: event[confirmed] + 1 } : {}),
      });
      tx.update(ref, {
        status: args.kind,
        sessionId: args.sessionId,
        ...(args.kind === 'paid'
          ? { paidAt: Date.now(), paymentIntentId: args.paymentIntentId }
          : {}),
      });
      if (args.kind === 'expired')
        tx.delete(db.collection('participantKeys').doc(booking.participantKey));
      if (args.kind === 'paid')
        tx.set(db.collection('mailQueue').doc(`confirmation-${booking.id}`), {
          bookingId: booking.id,
          kind: 'confirmation',
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        });
    } else if (args.kind === 'paid' && booking.status === 'expired') {
      // An expired Stripe Checkout Session cannot be paid. Do not hide an invariant violation.
      throw new AppError(409, 'Payment after released reservation');
    }
    tx.create(webhookRef, { type: args.kind, createdAt: Date.now() });
  });
}
export async function recordRefund(
  db: Firestore,
  bookingId: string,
  amount: number,
  webhookId: string,
) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('bookings').doc(bookingId),
      seenRef = db.collection('stripeEvents').doc(webhookId);
    const [snap, seen] = await Promise.all([tx.get(ref), tx.get(seenRef)]);
    if (seen.exists) return;
    if (!snap.exists) throw new AppError(404, 'Booking missing');
    const b = snap.data() as Booking;
    const eventRef = db.collection('events').doc(b.eventId),
      eventSnap = await tx.get(eventRef);
    if (amount > b.refundedAmount && b.status === 'paid') {
      const full = amount >= b.amount;
      tx.update(ref, {
        refundedAmount: amount,
        ...(full ? { status: 'refunded', checkedIn: false } : {}),
      });
      if (full) {
        tx.delete(db.collection('participantKeys').doc(b.participantKey));
        const field = b.gender === 'male' ? 'confirmedMale' : 'confirmedFemale';
        const count = (eventSnap.data() as EventRecord)[field];
        if (count <= 0) throw new AppError(409, 'Confirmed counter mismatch');
        tx.update(eventRef, { [field]: count - 1 });
        tx.set(db.collection('mailQueue').doc(`refund-${b.id}`), {
          bookingId: b.id,
          kind: 'refund',
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        });
      }
    } else if (b.status === 'holding')
      throw new AppError(409, 'Retry refund after payment webhook');
    tx.create(seenRef, { type: 'refund', createdAt: Date.now() });
  });
}
