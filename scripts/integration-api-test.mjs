import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { reserve } from '../functions/lib/bookings.js';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080')
  throw new Error('Local emulator only');
initializeApp({ projectId: 'demo-kagomeet' });
const db = getFirestore();
const base = 'http://127.0.0.1:5001/demo-kagomeet/asia-northeast1/api/api';
async function token(email) {
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-emulator-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'LocalDemoOnly2026!', returnSecureToken: true }),
    },
  );
  const data = await r.json();
  assert.equal(r.status, 200);
  return data.idToken;
}
async function call(path, method = 'GET', body, auth) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { status: r.status, data };
}
const admin = await token('admin@kagomeet.test'),
  member = await token('member@kagomeet.test');
assert.equal((await call('/health')).status, 200);
assert.equal((await call('/admin/events')).status, 401);
assert.equal((await call('/admin/events', 'GET', undefined, member)).status, 403);
const event = {
  title: 'API統合テストの交流会',
  area: 'tenmonkan',
  venue: 'エミュレーター会場',
  address: '鹿児島県鹿児島市東千石町',
  startsAt: new Date(Date.now() + 10 * 86400000).toISOString(),
  endsAt: new Date(Date.now() + 10 * 86400000 + 7200000).toISOString(),
  minAge: 20,
  maxAge: 35,
  alcohol: true,
  malePrice: 4200,
  femalePrice: 2600,
  maleCapacity: 2,
  femaleCapacity: 2,
  description: 'エミュレーターでのAPI統合テストです。実際の開催はありません。',
  conditions: '20歳以上',
  schedule: [{ time: '19:00', text: '受付' }],
  notes: 'テスト',
  image: '/images/hero.png',
  tag: 'テスト',
  status: 'published',
};
const created = await call('/admin/events', 'POST', event, admin);
assert.equal(created.status, 201, JSON.stringify(created.data));
const eventId = created.data.id;
assert.equal((await call(`/events/${eventId}`)).data.maleRemaining, 2);
assert.equal(
  (await call(`/admin/events/${eventId}`, 'PUT', { ...event, minAge: 18 }, admin)).status,
  400,
);
assert.equal((await call('/checkout', 'POST', {})).status, 503);
const b = await reserve(db, {
  eventId,
  idempotencyKey: randomUUID(),
  name: '検証 太郎',
  gender: 'male',
  age: 25,
  email: `${randomUUID()}@example.test`,
  phone: '09012345678',
  terms: true,
});
await db.collection('bookings').doc(b.id).update({ sessionId: 'cs_emulator_test' });
const eventPayload = {
  id: `evt_${randomUUID()}`,
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_emulator_test',
      object: 'checkout.session',
      metadata: { bookingId: b.id },
      payment_status: 'paid',
      status: 'complete',
      amount_total: b.amount,
      currency: 'jpy',
      payment_intent: 'pi_emulator_test',
    },
  },
};
const raw = JSON.stringify(eventPayload);
const client = new Stripe('not-a-real-credential');
const signature = client.webhooks.generateTestHeaderString({
  payload: raw,
  secret: 'emulator-signature-fixture',
});
async function webhook(sig) {
  return fetch(base + '/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: raw,
  });
}
assert.equal((await webhook('invalid')).status, 400);
assert.equal((await db.collection('bookings').doc(b.id).get()).data().status, 'holding');
assert.equal((await webhook(signature)).status, 200);
assert.equal((await webhook(signature)).status, 200);
const persisted = (await db.collection('events').doc(eventId).get()).data();
assert.equal(persisted.confirmedMale, 1);
assert.equal(persisted.reservedMale, 0);
assert.equal(
  (await call('/booking/status', 'POST', { bookingId: b.id, token: randomUUID() })).status,
  404,
);
assert.equal(
  (await call('/booking/status', 'POST', { bookingId: b.id, token: b.token })).data.status,
  'paid',
);
assert.equal(
  (await call(`/admin/bookings/${b.id}/attendance`, 'PATCH', { checkedIn: true }, member)).status,
  403,
);
assert.equal(
  (await call(`/admin/bookings/${b.id}/attendance`, 'PATCH', { checkedIn: true }, admin)).status,
  200,
);
assert.equal((await db.collection('bookings').doc(b.id).get()).data().checkedIn, true);
assert.equal((await call(`/admin/events/${eventId}`, 'DELETE', undefined, admin)).status, 409);
const list = await call(`/admin/bookings?eventId=${eventId}`, 'GET', undefined, admin);
assert.equal(list.status, 200);
assert.equal(list.data.items.length, 1);
assert.equal('token' in list.data.items[0], false);
const sales = await call('/admin/sales', 'GET', undefined, admin);
assert.equal(sales.status, 200, JSON.stringify(sales.data));
assert.equal(sales.data.find((x) => x.eventId === eventId).gross, 4200);
assert.equal(
  (
    await call('/contact', 'POST', {
      name: '問い合わせ 太郎',
      email: 'inquiry@example.test',
      category: 'テスト',
      message: 'エミュレーターでのお問い合わせ保存確認です。',
      consent: true,
    })
  ).status,
  201,
);
assert.ok((await call('/admin/inquiries', 'GET', undefined, admin)).data.length > 0);
const disposable = await call('/admin/events', 'POST', { ...event, status: 'draft' }, admin);
assert.equal(
  (await call(`/admin/events/${disposable.data.id}`, 'DELETE', undefined, admin)).status,
  200,
);
assert.equal((await call(`/events/${disposable.data.id}`)).status, 404);
console.log(
  'PASS: live Functions/Auth/Firestore API: admin 401/403, CRUD, validation, sales guard, invalid/valid/duplicate signed webhook, booking token privacy, attendance, sales aggregation, contact, booked-event deletion protection.',
);
