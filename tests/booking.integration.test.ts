import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { reconcileReservation } from '../functions/src/reconcile';
import type Stripe from 'stripe';
import { reserve, settle, recordRefund } from '../functions/src/bookings';
import { demoEvents } from '../src/data';
const projectId = 'demo-kagomeet';
const app = initializeApp({ projectId }, 'integration');
const db = getFirestore(app);
let rules: Awaited<ReturnType<typeof initializeTestEnvironment>>;
const now = Date.now();
const event = {
  ...demoEvents[0],
  id: 'test-event',
  startsAt: new Date(now + 86400000).toISOString(),
  endsAt: new Date(now + 93600000).toISOString(),
  maleCapacity: 2,
  femaleCapacity: 2,
  reservedMale: 0,
  reservedFemale: 0,
  confirmedMale: 0,
  confirmedFemale: 0,
  createdAt: now,
  updatedAt: now,
};
function input(email = `${randomUUID()}@example.com`) {
  return {
    eventId: event.id,
    idempotencyKey: randomUUID(),
    name: 'テスト 太郎',
    gender: 'male' as const,
    age: 25,
    email,
    phone: '09012345678',
    terms: true as const,
  };
}
beforeAll(async () => {
  rules = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => {
  await rules.clearFirestore();
  await db.collection('events').doc(event.id).set(event);
});
afterAll(async () => {
  await rules.cleanup();
  await deleteApp(app);
});
describe('Firestore reservation transactions', () => {
  it('never exceeds capacity under concurrent requests', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserve(db, input())));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const e = (await db.collection('events').doc(event.id).get()).data()!;
    expect(e.reservedMale).toBe(2);
    expect(e.reservedFemale).toBe(0);
  });
  it('retries of one request reserve exactly one seat and preserve token', async () => {
    const data = input();
    const results = await Promise.all([reserve(db, data), reserve(db, data), reserve(db, data)]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.token)).size).toBe(1);
    expect((await db.collection('events').doc(event.id).get()).data()!.reservedMale).toBe(1);
  });
  it('rejects reuse of an idempotency key with changed applicant information', async () => {
    const data = input();
    await reserve(db, data);
    await expect(reserve(db, { ...data, gender: 'female' })).rejects.toThrow(
      '入力内容が変わりました',
    );
  });
  it('prevents a second checkout for the same email even with a different key', async () => {
    const data = input('same@example.com');
    await reserve(db, data);
    await expect(reserve(db, { ...data, idempotencyKey: randomUUID() })).rejects.toThrow(
      '申し込み済み',
    );
    expect((await db.collection('events').doc(event.id).get()).data()!.reservedMale).toBe(1);
  });
  it('allows a new booking after the original checkout expires', async () => {
    const data = input('again@example.com');
    const b = await reserve(db, data);
    await settle(db, {
      bookingId: b.id,
      webhookId: 'exp-rebook',
      kind: 'expired',
      sessionId: 'cs-old',
    });
    await expect(reserve(db, { ...data, idempotencyKey: randomUUID() })).resolves.toHaveProperty(
      'status',
      'holding',
    );
  });
  it('does not trust browser pricing; uses event-specific gender price', async () => {
    const b = await reserve(db, { ...input(), gender: 'female' });
    expect(b.amount).toBe(event.femalePrice);
  });
  it('confirmation is atomic, idempotent and queues exactly one email', async () => {
    const b = await reserve(db, input());
    const args = {
      bookingId: b.id,
      webhookId: 'evt_paid',
      kind: 'paid' as const,
      sessionId: 'cs_test',
      amount: b.amount,
      currency: 'jpy',
      paymentIntentId: 'pi_test',
    };
    await settle(db, args);
    await settle(db, args);
    await settle(db, { ...args, webhookId: 'evt_paid_again' });
    const e = (await db.collection('events').doc(event.id).get()).data()!;
    expect(e.reservedMale).toBe(0);
    expect(e.confirmedMale).toBe(1);
    expect((await db.collection('bookings').doc(b.id).get()).data()!.status).toBe('paid');
    expect((await db.collection('mailQueue').get()).size).toBe(1);
  });
  it('rejects mismatched amount, currency and checkout session without changing counters', async () => {
    const b = await reserve(db, input());
    await db.collection('bookings').doc(b.id).update({ sessionId: 'cs_correct' });
    const args = {
      bookingId: b.id,
      webhookId: 'evt_bad',
      kind: 'paid' as const,
      sessionId: 'cs_correct',
      amount: b.amount,
      currency: 'jpy',
      paymentIntentId: 'pi_test',
    };
    await expect(settle(db, { ...args, amount: 1 })).rejects.toThrow('Payment mismatch');
    await expect(settle(db, { ...args, currency: 'usd' })).rejects.toThrow('Payment mismatch');
    await expect(settle(db, { ...args, sessionId: 'cs_wrong' })).rejects.toThrow(
      'Session mismatch',
    );
    expect((await db.collection('events').doc(event.id).get()).data()!.reservedMale).toBe(1);
  });
  it('expiration releases once, and a late expired notification does not undo paid booking', async () => {
    const b = await reserve(db, input());
    await settle(db, { bookingId: b.id, webhookId: 'exp1', kind: 'expired', sessionId: 'cs_one' });
    await settle(db, { bookingId: b.id, webhookId: 'exp2', kind: 'expired', sessionId: 'cs_one' });
    expect((await db.collection('events').doc(event.id).get()).data()!.reservedMale).toBe(0);
    const p = await reserve(db, input());
    await settle(db, {
      bookingId: p.id,
      webhookId: 'paid',
      kind: 'paid',
      sessionId: 'cs_two',
      amount: p.amount,
      currency: 'jpy',
      paymentIntentId: 'pi_two',
    });
    await settle(db, {
      bookingId: p.id,
      webhookId: 'late_exp',
      kind: 'expired',
      sessionId: 'cs_two',
    });
    expect((await db.collection('bookings').doc(p.id).get()).data()!.status).toBe('paid');
    expect((await db.collection('events').doc(event.id).get()).data()!.confirmedMale).toBe(1);
  });
  it('partial refund retains seat; full refund releases once and queues notification', async () => {
    const b = await reserve(db, input());
    await settle(db, {
      bookingId: b.id,
      webhookId: 'paid',
      kind: 'paid',
      sessionId: 'cs',
      amount: b.amount,
      currency: 'jpy',
      paymentIntentId: 'pi',
    });
    await recordRefund(db, b.id, 1000, 'partial');
    expect((await db.collection('events').doc(event.id).get()).data()!.confirmedMale).toBe(1);
    await recordRefund(db, b.id, b.amount, 'full');
    await recordRefund(db, b.id, b.amount, 'full_again');
    expect((await db.collection('events').doc(event.id).get()).data()!.confirmedMale).toBe(0);
    expect((await db.collection('bookings').doc(b.id).get()).data()!.refundedAmount).toBe(b.amount);
    expect((await db.collection('mailQueue').get()).size).toBe(2);
  });
  it('retries an out-of-order refund instead of losing it', async () => {
    const b = await reserve(db, input());
    await expect(recordRefund(db, b.id, b.amount, 'out_of_order')).rejects.toThrow('Retry refund');
    expect((await db.collection('stripeEvents').doc('out_of_order').get()).exists).toBe(false);
  });
});
describe('reservation reconciliation against authoritative Stripe state', () => {
  async function expired() {
    const b = await reserve(db, input());
    b.expiresAt = Date.now() - 1000;
    await db.collection('bookings').doc(b.id).update({ expiresAt: b.expiresAt });
    return b;
  }
  it('recovers a paid session that won a race with expiration', async () => {
    const b = await expired();
    b.sessionId = 'cs_race';
    await db.collection('bookings').doc(b.id).update({ sessionId: b.sessionId });
    let calls = 0;
    const client = {
      checkout: {
        sessions: {
          retrieve: async () =>
            ++calls === 1
              ? { id: 'cs_race', status: 'open' }
              : {
                  id: 'cs_race',
                  status: 'complete',
                  payment_status: 'paid',
                  amount_total: b.amount,
                  currency: 'jpy',
                  payment_intent: 'pi_race',
                },
          expire: async () => {
            throw new Error('already complete');
          },
        },
      },
    } as unknown as Stripe;
    await reconcileReservation(db, client, b);
    expect((await db.collection('bookings').doc(b.id).get()).data()!.status).toBe('paid');
    expect((await db.collection('events').doc(event.id).get()).data()!.confirmedMale).toBe(1);
  });
  it('does not release a seat on an ambiguous Stripe API failure', async () => {
    const b = await expired();
    const client = {
      checkout: {
        sessions: {
          list: () => ({
            async *[Symbol.asyncIterator]() {
              throw new Error('network failure');
            },
          }),
        },
      },
    } as unknown as Stripe;
    await expect(reconcileReservation(db, client, b)).rejects.toThrow('network failure');
    expect((await db.collection('bookings').doc(b.id).get()).data()!.status).toBe('holding');
  });
  it('finds an orphan session, expires it remotely, then releases the seat', async () => {
    const b = await expired();
    let remotelyExpired = false;
    const client = {
      checkout: {
        sessions: {
          list: () => ({
            async *[Symbol.asyncIterator]() {
              yield { id: 'cs_orphan', status: 'open', metadata: { bookingId: b.id } };
            },
          }),
          expire: async () => {
            remotelyExpired = true;
            return { id: 'cs_orphan', status: 'expired', payment_status: 'unpaid' };
          },
        },
      },
    } as unknown as Stripe;
    await reconcileReservation(db, client, b);
    expect(remotelyExpired).toBe(true);
    expect((await db.collection('bookings').doc(b.id).get()).data()!.status).toBe('expired');
    expect((await db.collection('events').doc(event.id).get()).data()!.reservedMale).toBe(0);
  });
  it('releases a reservation that never obtained a Stripe session', async () => {
    const b = await expired();
    const client = {
      checkout: { sessions: { list: () => ({ async *[Symbol.asyncIterator]() {} }) } },
    } as unknown as Stripe;
    await reconcileReservation(db, client, b);
    expect((await db.collection('bookings').doc(b.id).get()).data()!.status).toBe('expired');
  });
});
describe('Firestore security rules', () => {
  for (const role of ['anonymous', 'member', 'admin'])
    it(`${role} cannot read PII or directly write event prices/reservations`, async () => {
      const client =
        role === 'anonymous'
          ? rules.unauthenticatedContext().firestore()
          : rules.authenticatedContext(role, role === 'admin' ? { admin: true } : {}).firestore();
      await assertFails(getDoc(doc(client, 'bookings', 'private')));
      await assertFails(setDoc(doc(client, 'events', event.id), { malePrice: 1 }));
      await assertFails(setDoc(doc(client, 'bookings', 'fake'), { status: 'paid' }));
      await assertFails(getDoc(doc(client, 'mailQueue', 'private')));
    });
});
