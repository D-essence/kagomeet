import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
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
/** Confirm a venue-payment registration and claim its seat in one transaction. */
export async function registerOnsite(db: Firestore, input: CheckoutInput, now = Date.now()) {
  const id = createHash('sha256').update(input.idempotencyKey).digest('hex');
  const participantKey = createHash('sha256')
    .update(`${input.eventId}:${input.email.toLowerCase()}`)
    .digest('hex');
  const ref = db.collection('bookings').doc(id);
  const eventRef = db.collection('events').doc(input.eventId);
  const uniqueRef = db.collection('participantKeys').doc(participantKey);
  return db.runTransaction(async (tx) => {
    const [prior, eventSnap, duplicate] = await Promise.all([
      tx.get(ref), tx.get(eventRef), tx.get(uniqueRef),
    ]);
    if (prior.exists) {
      const booking = prior.data() as Booking;
      if (booking.fingerprint !== fingerprint(input))
        throw new AppError(409, '入力内容が変わりました。再度お申し込みください');
      if (booking.status === 'cancelled') throw new AppError(409, 'この申し込みはキャンセル済みです');
      return booking;
    }
    if (duplicate.exists) throw new AppError(409, 'このメールアドレスでは申し込み済みです');
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
      status: 'confirmed',
      createdAt: now,
      checkedIn: false,
      received: false,
      termsVersion: TERMS_VERSION,
    };
    const field = input.gender === 'male' ? 'confirmedMale' : 'confirmedFemale';
    tx.update(eventRef, { [field]: event[field] + 1 });
    tx.create(ref, booking);
    tx.create(uniqueRef, { bookingId: id });
    return booking;
  });
}
export async function cancelOnsite(db: Firestore, bookingId: string, token: string, now = Date.now()) {
  const ref = db.collection('bookings').doc(bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const booking = snap.data() as Booking | undefined;
    if (!booking || !timingSafeToken(booking.token, token)) throw new AppError(404, '申し込みが見つかりません');
    if (booking.status === 'cancelled') return booking;
    if (booking.status !== 'confirmed') throw new AppError(409, 'この申し込みはキャンセルできません');
    const eventRef = db.collection('events').doc(booking.eventId);
    const eventSnap = await tx.get(eventRef);
    const event = eventSnap.data() as EventRecord | undefined;
    if (!event || Date.parse(event.startsAt) <= now + 2 * 3600000)
      throw new AppError(409, 'オンラインでのキャンセル期限を過ぎています。運営にご連絡ください');
    if (booking.received) throw new AppError(409, 'お支払い済みのため、運営にご連絡ください');
    const field = booking.gender === 'male' ? 'confirmedMale' : 'confirmedFemale';
    if (event[field] <= 0) throw new AppError(409, '予約人数の確認に失敗しました');
    tx.update(eventRef, { [field]: event[field] - 1 });
    tx.update(ref, { status: 'cancelled', checkedIn: false, cancelledAt: now });
    tx.delete(db.collection('participantKeys').doc(booking.participantKey));
    return { ...booking, status: 'cancelled' as const, cancelledAt: now };
  });
}
function timingSafeToken(expected: string, actual: string) {
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
