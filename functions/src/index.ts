import express, { type Request, type Response, type NextFunction } from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { AggregateField, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import Stripe from 'stripe';
import { z } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError, checkoutSchema, eventSchema, type Booking, type EventRecord } from './domain.js';
import { reserve, settle, recordRefund } from './bookings.js';
import { reconcileReservation } from './reconcile.js';
initializeApp();
const db = getFirestore();
const stripeKey = defineSecret('STRIPE_SECRET_KEY');
const webhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const resendKey = defineSecret('RESEND_API_KEY');
const appUrl = defineString('APP_URL', { default: 'http://localhost:5173' });
const mailFrom = defineString('MAIL_FROM', { default: '' });
const supportEmail = defineString('SUPPORT_EMAIL', { default: '' });
const salesEnabled = defineString('SALES_ENABLED', { default: 'false' });
const stripe = () => new Stripe(stripeKey.value(), { maxNetworkRetries: 2 });
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff');
  const origin = req.get('origin');
  if (origin && origin !== appUrl.value())
    return res.status(403).json({ error: '許可されていないアクセスです' });
  if (origin) res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res
      .set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck')
      .set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    return res.sendStatus(204);
  }
  next();
});
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
async function handleSession(session: Stripe.Checkout.Session, webhookId: string) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;
  if (session.payment_status === 'paid')
    await settle(db, {
      bookingId,
      webhookId,
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
    await settle(db, { bookingId, webhookId, kind: 'expired', sessionId: session.id });
}
// Signature verification must receive the exact bytes; never parse JSON before this route.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  route(async (req, res) => {
    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(
        (req as Request & { rawBody?: Buffer }).rawBody ?? req.body,
        req.get('stripe-signature') ?? '',
        webhookSecret.value(),
      );
    } catch {
      return res.status(400).send('Invalid signature');
    }
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_succeeded'
    )
      await handleSession(event.data.object as Stripe.Checkout.Session, event.id);
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const pi =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (pi) {
        // PaymentIntent metadata also handles refund notifications arriving before checkout completion.
        const intent = await stripe().paymentIntents.retrieve(pi);
        if (intent.metadata.bookingId)
          await recordRefund(db, intent.metadata.bookingId, charge.amount_refunded, event.id);
      }
    }
    return res.json({ received: true });
  }),
);
app.use(express.json({ limit: '64kb' }));
async function rateLimit(req: Request, scope: string, limit: number) {
  const window = Math.floor(Date.now() / 600000);
  const id = createHash('sha256').update(`${scope}:${req.ip}:${window}`).digest('hex');
  await db.runTransaction(async (tx) => {
    const ref = db.collection('rateLimits').doc(id),
      snap = await tx.get(ref);
    const count = snap.data()?.count ?? 0;
    if (count >= limit) throw new AppError(429, 'しばらく時間をおいて再度お試しください');
    tx.set(ref, { count: count + 1, expiresAt: new Date(Date.now() + 24 * 3600000) });
  });
}
async function publicWrite(req: Request) {
  await rateLimit(req, 'public', 15);
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    const token = req.get('X-Firebase-AppCheck');
    if (!token) throw new AppError(403, 'ページを再読み込みしてお試しください');
    try {
      await getAppCheck().verifyToken(token);
    } catch {
      throw new AppError(403, 'アクセス確認に失敗しました');
    }
  }
}
async function admin(req: Request) {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AppError(401, 'ログインしてください');
  try {
    const claims = await getAuth().verifyIdToken(token, true);
    if (claims.admin !== true) throw new AppError(403, '管理者権限がありません');
    return claims.uid;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(401, '再度ログインしてください');
  }
}
function publicEvent(e: EventRecord) {
  const { reservedMale, reservedFemale, confirmedMale, confirmedFemale, ...data } = e;
  return {
    ...data,
    maleRemaining: Math.max(0, e.maleCapacity - reservedMale - confirmedMale),
    femaleRemaining: Math.max(0, e.femaleCapacity - reservedFemale - confirmedFemale),
  };
}
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get(
  '/api/events',
  route(async (_req, res) => {
    const snap = await db.collection('events').where('status', '==', 'published').get();
    return res.json(
      snap.docs
        .map((d) => publicEvent({ ...d.data(), id: d.id } as EventRecord))
        .filter((e) => Date.parse(e.endsAt) > Date.now())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    );
  }),
);
app.get(
  '/api/events/:id',
  route(async (req, res) => {
    const snap = await db.collection('events').doc(req.params.id).get();
    if (!snap.exists || snap.data()?.status !== 'published')
      throw new AppError(404, 'イベントが見つかりません');
    return res.json(publicEvent({ ...snap.data(), id: snap.id } as EventRecord));
  }),
);
app.post(
  '/api/checkout',
  route(async (req, res) => {
    if (salesEnabled.value() !== 'true') throw new AppError(503, '現在、受付開始の準備中です');
    await publicWrite(req);
    const input = checkoutSchema.parse(req.body);
    const booking = await reserve(db, input);
    const client = stripe();
    let session: Stripe.Checkout.Session;
    if (booking.sessionId) session = await client.checkout.sessions.retrieve(booking.sessionId);
    else {
      // Every retry uses the same reservation, price, token, expiration and Stripe idempotency key.
      // Ambiguous network failures keep the seat reserved until reconciliation.
      session = await client.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: booking.email,
          client_reference_id: booking.id,
          metadata: { bookingId: booking.id },
          payment_intent_data: { metadata: { bookingId: booking.id } },
          line_items: [
            {
              price_data: {
                currency: 'jpy',
                unit_amount: booking.amount,
                product_data: {
                  name: booking.eventTitle,
                  description: booking.gender === 'male' ? '男性 1名' : '女性 1名',
                },
              },
              quantity: 1,
            },
          ],
          expires_at: Math.floor(booking.expiresAt / 1000),
          success_url: `${appUrl.value()}/complete?booking=${booking.id}&token=${booking.token}`,
          cancel_url: `${appUrl.value()}/complete?booking=${booking.id}&token=${booking.token}&cancelled=1`,
          locale: 'ja',
        },
        { idempotencyKey: `checkout-${booking.id}` },
      );
      await db.collection('bookings').doc(booking.id).update({ sessionId: session.id });
    }
    if (session.status !== 'open' || !session.url)
      throw new AppError(409, '決済の受付期間が終了しました。確認画面をご確認ください');
    return res.json({ url: session.url, bookingId: booking.id, token: booking.token });
  }),
);
app.post(
  '/api/booking/status',
  route(async (req, res) => {
    await rateLimit(req, 'status', 120);
    const { bookingId, token } = z
      .object({ bookingId: z.string().regex(/^[a-f0-9]{64}$/), token: z.uuid() })
      .parse(req.body);
    const snap = await db.collection('bookings').doc(bookingId).get(),
      b = snap.data() as Booking | undefined;
    if (!b || !timingSafeEqual(Buffer.from(b.token), Buffer.from(token)))
      throw new AppError(404, '申し込みが見つかりません');
    return res.json({
      id: b.id,
      eventId: b.eventId,
      eventTitle: b.eventTitle,
      status: b.status,
      amount: b.amount,
      refundedAmount: b.refundedAmount,
      expiresAt: b.expiresAt,
    });
  }),
);
app.post(
  '/api/booking/resume',
  route(async (req, res) => {
    await publicWrite(req);
    const { bookingId, token } = z
      .object({ bookingId: z.string().regex(/^[a-f0-9]{64}$/), token: z.uuid() })
      .parse(req.body);
    const b = (await db.collection('bookings').doc(bookingId).get()).data() as Booking | undefined;
    if (!b || !timingSafeEqual(Buffer.from(b.token), Buffer.from(token)))
      throw new AppError(404, '申し込みが見つかりません');
    if (b.status !== 'holding' || !b.sessionId)
      throw new AppError(409, '現在、決済を再開できません。申し込み状況をご確認ください');
    const session = await stripe().checkout.sessions.retrieve(b.sessionId);
    if (session.status !== 'open' || !session.url)
      throw new AppError(409, '決済の受付が終了しています。申し込み状況を再確認してください');
    return res.json({ url: session.url });
  }),
);
app.post(
  '/api/contact',
  route(async (req, res) => {
    await publicWrite(req);
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.email().max(254),
        category: z.string().max(40),
        message: z.string().trim().min(10).max(4000),
        consent: z.literal(true),
      })
      .parse(req.body);
    await db.collection('inquiries').add({ ...data, createdAt: Date.now(), status: 'new' });
    return res.status(201).json({ ok: true });
  }),
);
app.use('/api/admin', (req, _res, next) => {
  admin(req)
    .then((uid) => {
      (req as Request & { adminUid?: string }).adminUid = uid;
      next();
    })
    .catch(next);
});
app.get(
  '/api/admin/events',
  route(async (_req, res) => {
    const snap = await db.collection('events').orderBy('startsAt', 'desc').get();
    return res.json(
      snap.docs.filter((d) => !d.data().deletedAt).map((d) => ({ ...d.data(), id: d.id })),
    );
  }),
);
app.post(
  '/api/admin/events',
  route(async (req, res) => {
    const data = eventSchema.parse(req.body);
    const ref = db.collection('events').doc();
    await ref.set({
      ...data,
      id: ref.id,
      reservedMale: 0,
      reservedFemale: 0,
      confirmedMale: 0,
      confirmedFemale: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return res.status(201).json({ id: ref.id });
  }),
);
app.put(
  '/api/admin/events/:id',
  route(async (req, res) => {
    const data = eventSchema.parse(req.body),
      ref = db.collection('events').doc(req.params.id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError(404, 'イベントが見つかりません');
      const e = snap.data() as EventRecord;
      if (
        data.maleCapacity < e.reservedMale + e.confirmedMale ||
        data.femaleCapacity < e.reservedFemale + e.confirmedFemale
      )
        throw new AppError(409, '予約済み人数より定員を減らすことはできません');
      const active = e.reservedMale + e.reservedFemale + e.confirmedMale + e.confirmedFemale;
      if (active > 0) {
        const locked = [
          'startsAt',
          'endsAt',
          'area',
          'venue',
          'address',
          'minAge',
          'maxAge',
          'alcohol',
          'malePrice',
          'femalePrice',
          'status',
        ] as const;
        if (locked.some((k) => e[k] !== data[k]))
          throw new AppError(
            409,
            '予約があるため日時・会場・参加条件・料金・公開状態は変更できません。中止時は返金と仮予約の失効を先に完了してください',
          );
      }
      tx.update(ref, { ...data, updatedAt: Date.now() });
    });
    return res.json({ ok: true });
  }),
);
app.delete(
  '/api/admin/events/:id',
  route(async (req, res) => {
    const ref = db.collection('events').doc(req.params.id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError(404, 'イベントが見つかりません');
      const e = snap.data() as EventRecord;
      if (e.reservedMale + e.reservedFemale + e.confirmedMale + e.confirmedFemale > 0)
        throw new AppError(
          409,
          '予約のあるイベントは削除できません。先に返金と仮予約の失効を完了してください',
        );
      tx.update(ref, { deletedAt: Date.now(), status: 'cancelled' });
    });
    return res.json({ ok: true });
  }),
);
app.get(
  '/api/admin/bookings',
  route(async (req, res) => {
    const eventId = z
      .string()
      .regex(/^[\w-]{1,100}$/)
      .parse(req.query.eventId);
    // An event has at most 1,000 active seats; include historical/refunded records through pagination.
    let query = db
      .collection('bookings')
      .where('eventId', '==', eventId)
      .orderBy('createdAt', 'desc')
      .orderBy('__name__')
      .limit(100);
    if (req.query.cursor) {
      const cursor = await db
        .collection('bookings')
        .doc(
          z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(req.query.cursor),
        )
        .get();
      if (cursor.exists && cursor.data()?.eventId === eventId) query = query.startAfter(cursor);
    }
    const snap = await query.get();
    return res.json({
      items: snap.docs.map((d) => {
        const { token: _, fingerprint: __, participantKey: ___, ...data } = d.data();
        return data;
      }),
      cursor: snap.size === 100 ? snap.docs.at(-1)?.id : null,
    });
  }),
);
app.patch(
  '/api/admin/bookings/:id/attendance',
  route(async (req, res) => {
    const { checkedIn } = z.object({ checkedIn: z.boolean() }).parse(req.body);
    const ref = db.collection('bookings').doc(req.params.id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.status !== 'paid')
        throw new AppError(409, '決済確定済みの参加者のみ出欠を変更できます');
      tx.update(ref, { checkedIn });
    });
    return res.json({ ok: true });
  }),
);
app.post(
  '/api/admin/bookings/:id/refund',
  route(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(300) }).parse(req.body);
    const ref = db.collection('bookings').doc(req.params.id),
      snap = await ref.get();
    const b = snap.data() as Booking | undefined;
    if (!b || b.status !== 'paid' || !b.paymentIntentId)
      throw new AppError(409, '返金できる決済がありません');
    const refund = await stripe().refunds.create(
      {
        payment_intent: b.paymentIntentId,
        amount: b.amount - b.refundedAmount,
        reason: 'requested_by_customer',
        metadata: { bookingId: b.id },
      },
      { idempotencyKey: `refund-${b.id}` },
    );
    await ref.update({ refundReason: reason, refundId: refund.id });
    // Only the verified Stripe webhook releases the seat and marks this booking refunded.
    return res.json({ ok: true, status: refund.status });
  }),
);
app.get(
  '/api/admin/sales',
  route(async (_req, res) => {
    const events = await db.collection('events').get();
    const rows = await Promise.all(
      events.docs.map(async (event) => {
        const result = await db
          .collection('bookings')
          .where('eventId', '==', event.id)
          .where('status', 'in', ['paid', 'refunded'])
          .aggregate({
            gross: AggregateField.sum('amount'),
            refunded: AggregateField.sum('refundedAmount'),
            bookings: AggregateField.count(),
          })
          .get();
        return { eventId: event.id, title: event.data().title, ...result.data() };
      }),
    );
    return res.json(rows);
  }),
);
app.get(
  '/api/admin/inquiries',
  route(async (_req, res) => {
    const snap = await db.collection('inquiries').orderBy('createdAt', 'desc').limit(100).get();
    return res.json(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
  }),
);
app.get(
  '/api/admin/mail',
  route(async (_req, res) => {
    const snap = await db
      .collection('mailQueue')
      .where('status', 'in', ['pending', 'failed'])
      .limit(100)
      .get();
    return res.json(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
  }),
);
app.post(
  '/api/admin/mail/:id/retry',
  route(async (req, res) => {
    await db.collection('mailQueue').doc(req.params.id).update({ status: 'pending', attempts: 0 });
    return res.json({ ok: true });
  }),
);
app.use((_req, res) => res.status(404).json({ error: 'ページが見つかりません' }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: err.issues.map((i) => i.message).join(' / ') });
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  // Do not log customer details, Stripe requests, tokens or raw exception payloads.
  logger.error('API operation failed', { type: err instanceof Error ? err.name : 'unknown' });
  return res
    .status(500)
    .json({ error: '処理を完了できませんでした。時間をおいて再度お試しください' });
});
export const api = onRequest(
  {
    region: 'asia-northeast1',
    secrets: [stripeKey, webhookSecret],
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  app,
);

export const expireReservations = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'asia-northeast1',
    secrets: [stripeKey],
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const snap = await db
      .collection('bookings')
      .where('status', '==', 'holding')
      .where('expiresAt', '<=', Date.now())
      .limit(100)
      .get();
    const client = stripe();
    for (const doc of snap.docs) {
      const b = doc.data() as Booking;
      try {
        await reconcileReservation(db, client, b);
      } catch {
        logger.error('Reservation reconciliation failed', { bookingId: b.id });
      }
    }
  },
);
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const sendBookingMail = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'asia-northeast1',
    secrets: [resendKey],
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    if (!mailFrom.value()) {
      logger.error('MAIL_FROM is required');
      return;
    }
    const jobs = await db.collection('mailQueue').where('status', '==', 'pending').limit(30).get();
    for (const job of jobs.docs) {
      const data = job.data();
      if (data.attempts >= 10) {
        await job.ref.update({ status: 'failed' });
        continue;
      }
      const b = (await db.collection('bookings').doc(data.bookingId).get()).data() as Booking;
      const event = (await db.collection('events').doc(b.eventId).get()).data() as EventRecord;
      try {
        const refunded = data.kind === 'refund';
        if (!refunded && b.status !== 'paid') {
          await job.ref.update({ status: 'superseded' });
          continue;
        }
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey.value()}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': job.id,
          },
          body: JSON.stringify({
            from: mailFrom.value(),
            to: [b.email],
            reply_to: supportEmail.value() || undefined,
            subject: refunded
              ? '【KAGOMEET】キャンセル・返金のお知らせ'
              : '【KAGOMEET】参加申し込みが確定しました',
            html: `<p>${escapeHtml(b.name)} 様</p><p>${refunded ? 'お申し込みのキャンセルと返金を受け付けました。カードへの反映には通常5〜10営業日かかります。' : 'お申し込みありがとうございます。当日は年齢確認ができる公的な身分証をお持ちください。'}</p><h2>${escapeHtml(b.eventTitle)}</h2><p>${escapeHtml(new Date(event.startsAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))}<br>${escapeHtml(event.venue)}<br>${escapeHtml(event.address)}</p><p>お支払い：¥${b.amount.toLocaleString('ja-JP')}（税込）</p><p><a href="${appUrl.value()}/complete?booking=${b.id}&token=${b.token}">申し込み内容を確認する</a></p>`,
          }),
        });
        if (!response.ok) throw new Error('Mail provider error');
        await job.ref.update({ status: 'sent', sentAt: Date.now() });
      } catch {
        await job.ref.update({ attempts: data.attempts + 1 });
        logger.error('Email delivery failed', { jobId: job.id });
      }
    }
  },
);
