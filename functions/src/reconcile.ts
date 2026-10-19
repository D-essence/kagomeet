import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import type { Booking } from './domain.js';
import { settle } from './bookings.js';
export async function reconcileReservation(db: Firestore, client: Stripe, booking: Booking) {
  if (booking.status !== 'holding' || booking.expiresAt > Date.now()) return;
  let session: Stripe.Checkout.Session | undefined;
  if (booking.sessionId) session = await client.checkout.sessions.retrieve(booking.sessionId);
  else {
    // A timeout can leave a created Stripe session without a stored ID. Fully paginate
    // the creation interval; any API failure throws and leaves inventory reserved.
    for await (const item of client.checkout.sessions.list({
      created: {
        gte: Math.floor(booking.createdAt / 1000) - 5,
        lte: Math.floor(booking.expiresAt / 1000),
      },
      limit: 100,
    })) {
      if (item.metadata?.bookingId === booking.id) {
        session = item;
        break;
      }
    }
    if (session) await db.collection('bookings').doc(booking.id).update({ sessionId: session.id });
  }
  if (!session) {
    // The fixed expires_at has elapsed; no new Stripe session can be created for it.
    await settle(db, {
      bookingId: booking.id,
      webhookId: `no-session-${booking.id}`,
      sessionId: 'none',
      kind: 'expired',
    });
    return;
  }
  if (session.status === 'open') {
    try {
      session = await client.checkout.sessions.expire(session.id);
    } catch {
      session = await client.checkout.sessions.retrieve(session.id);
    }
  }
  if (session.payment_status === 'paid')
    await settle(db, {
      bookingId: booking.id,
      webhookId: `reconcile-${session.id}-paid`,
      kind: 'paid',
      sessionId: session.id,
      amount: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
      paymentIntentId:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id,
    });
  else if (session.status === 'expired')
    await settle(db, {
      bookingId: booking.id,
      webhookId: `reconcile-${session.id}-expired`,
      kind: 'expired',
      sessionId: session.id,
    });
  // An unresolved/processing payment retains inventory until its authoritative state is known.
}
