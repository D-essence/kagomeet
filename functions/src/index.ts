import express, { type Request, type Response, type NextFunction } from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, checkoutSchema, eventSchema, type Booking, type EventRecord } from './domain.js';
import { registerOnsite, cancelOnsite } from './bookings.js';
initializeApp();
const db = getFirestore();
const appUrl = defineString('APP_URL', { default: 'http://localhost:5173' });
const adminEmail = defineString('ADMIN_EMAIL', { default: '' });
const registrationsEnabled = defineString('REGISTRATIONS_ENABLED', { default: 'false' });
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
app.post('/api/admin/images', (req, _res, next) => { admin(req).then(() => next()).catch(next); },
  express.json({ limit: '7mb' }), route(async (req, res) => {
    const { base64, contentType } = z.object({ base64: z.string().max(7_000_000), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).parse(req.body);
    const bytes = Buffer.from(base64, 'base64');
    const valid = contentType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8
      : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new AppError(400, '画像形式またはサイズを確認してください');
    const bucket = getStorage().bucket('kagomeet.firebasestorage.app');
    const path = `event-images/${randomUUID()}.${contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'}`;
    const downloadToken = randomUUID();
    await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: downloadToken } } });
    return res.status(201).json({ url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}` });
  }));
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
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    const token = req.get('X-Firebase-AppCheck');
    if (!token) throw new AppError(403, 'ページを再読み込みしてお試しください');
    try {
      await getAppCheck().verifyToken(token);
    } catch {
      throw new AppError(403, 'アクセス確認に失敗しました');
    }
  }
  await rateLimit(req, 'public', 15);
}
async function admin(req: Request) {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AppError(401, 'ログインしてください');
  try {
    const claims = await getAuth().verifyIdToken(token, true);
    const owner = adminEmail.value().trim().toLowerCase();
    const googleOwner = owner && claims.email_verified === true && claims.email?.toLowerCase() === owner && claims.firebase.sign_in_provider === 'google.com';
    if (!googleOwner) throw new AppError(403, '管理者権限がありません');
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
    registrationCount: confirmedMale + confirmedFemale,
  };
}
const socialUrl = (domains: string[]) => z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}, '公式の HTTPS URL を入力してください');
const socialSchema = z.object({
  instagramUrl: socialUrl(['instagram.com']),
  lineUrl: socialUrl(['line.me', 'lin.ee']),
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/settings', route(async (_req, res) => {
  const settings = (await db.collection('settings').doc('public').get()).data();
  return res.json({ instagramUrl: settings?.instagramUrl || '', lineUrl: settings?.lineUrl || '' });
}));
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
  '/api/bookings',
  route(async (req, res) => {
    if (registrationsEnabled.value() !== 'true') throw new AppError(503, '現在、受付開始の準備中です');
    await publicWrite(req);
    const booking = await registerOnsite(db, checkoutSchema.parse(req.body));
    return res.status(201).json({ bookingId: booking.id, token: booking.token });
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
    if (!b || !safeToken(b.token, token))
      throw new AppError(404, '申し込みが見つかりません');
    return res.json({
      id: b.id,
      eventId: b.eventId,
      eventTitle: b.eventTitle,
      status: b.status,
      amount: b.amount,
      received: Boolean(b.received),
      checkedIn: b.checkedIn,
    });
  }),
);
app.post(
  '/api/booking/cancel',
  route(async (req, res) => {
    await publicWrite(req);
    const { bookingId, token } = z
      .object({ bookingId: z.string().regex(/^[a-f0-9]{64}$/), token: z.uuid() })
      .parse(req.body);
    await cancelOnsite(db, bookingId, token);
    return res.json({ ok: true });
  }),
);
function safeToken(expected: string, actual: string) {
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
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
app.get('/api/admin/session', (_req, res) => res.json({ ok: true }));
app.get('/api/admin/settings', route(async (_req, res) => {
  const settings = (await db.collection('settings').doc('public').get()).data();
  return res.json({ instagramUrl: settings?.instagramUrl || '', lineUrl: settings?.lineUrl || '' });
}));
app.put('/api/admin/settings', route(async (req, res) => {
  const data = socialSchema.parse(req.body);
  await db.collection('settings').doc('public').set({ ...data, updatedAt: Date.now() }, { merge: true });
  return res.json(data);
}));
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
            '申し込みがあるため日時・会場・参加条件・料金・公開状態は変更できません。運営上の変更は参加者への連絡を先に行ってください',
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
          '申し込みのあるイベントは削除できません。参加者への対応を先に行ってください',
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
    // Include cancelled records through pagination so the attendance history remains available.
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
      if (snap.data()?.status !== 'confirmed')
        throw new AppError(409, '参加確定済みの方のみ受付できます');
      tx.update(ref, { checkedIn });
    });
    return res.json({ ok: true });
  }),
);
app.patch('/api/admin/bookings/:id/payment', route(async (req, res) => {
  const { received } = z.object({ received: z.boolean() }).parse(req.body);
  const ref = db.collection('bookings').doc(req.params.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.status !== 'confirmed') throw new AppError(409, '参加確定済みの方のみ集金を記録できます');
    tx.update(ref, { received, receivedAt: received ? Date.now() : null });
  });
  return res.json({ ok: true });
}));
app.get(
  '/api/admin/sales',
  route(async (_req, res) => {
    const events = await db.collection('events').get();
    const rows = await Promise.all(
      events.docs.map(async (event) => {
        const snap = await db.collection('bookings').where('eventId', '==', event.id)
          .where('status', '==', 'confirmed').get();
        const bookings = snap.docs.map((d) => d.data() as Booking);
        return {
          eventId: event.id, title: event.data().title,
          gross: bookings.reduce((sum, b) => sum + (b.received ? b.amount : 0), 0),
          outstanding: bookings.reduce((sum, b) => sum + (b.received ? 0 : b.amount), 0),
          bookings: bookings.length,
          receivedCount: bookings.filter((b) => b.received).length,
        };
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
app.use((_req, res) => res.status(404).json({ error: 'ページが見つかりません' }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: err.issues.map((i) => i.message).join(' / ') });
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  // Do not log customer details, tokens or raw exception payloads.
  logger.error('API operation failed', { type: err instanceof Error ? err.name : 'unknown' });
  return res
    .status(500)
    .json({ error: '処理を完了できませんでした。時間をおいて再度お試しください' });
});
export const api = onRequest(
  {
    region: 'asia-northeast1',
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  app,
);
