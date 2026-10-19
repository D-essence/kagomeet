import { z } from 'zod';
export const areas = ['tenmonkan', 'kokubu', 'kanoya'] as const;
export const genderSchema = z.enum(['male', 'female']);
export const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    area: z.enum(areas),
    venue: z.string().trim().min(1).max(120),
    address: z.string().trim().min(5).max(250),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    minAge: z.number().int().min(18).max(80),
    maxAge: z.number().int().min(18).max(80),
    alcohol: z.boolean(),
    malePrice: z.number().int().min(100).max(100000),
    femalePrice: z.number().int().min(100).max(100000),
    maleCapacity: z.number().int().min(1).max(500),
    femaleCapacity: z.number().int().min(1).max(500),
    description: z.string().trim().min(10).max(5000),
    conditions: z.string().trim().min(1).max(2000),
    schedule: z
      .array(z.object({ time: z.string().max(30), text: z.string().min(1).max(200) }))
      .min(1)
      .max(20),
    notes: z.string().max(3000),
    image: z.string().max(1000),
    tag: z.string().max(40),
    status: z.enum(['draft', 'published', 'cancelled']),
  })
  .superRefine((e, ctx) => {
    if (e.maxAge < e.minAge)
      ctx.addIssue({
        code: 'custom',
        message: '対象年齢の上限を確認してください',
        path: ['maxAge'],
      });
    if (e.alcohol && e.minAge < 20)
      ctx.addIssue({
        code: 'custom',
        message: '飲酒を伴うイベントは20歳以上です',
        path: ['minAge'],
      });
    if (Date.parse(e.endsAt) <= Date.parse(e.startsAt))
      ctx.addIssue({ code: 'custom', message: '終了は開始より後にしてください', path: ['endsAt'] });
    if (
      e.image &&
      !e.image.startsWith('/images/') &&
      !/^https:\/\/firebasestorage\.googleapis\.com\//.test(e.image) &&
      !(
        process.env.FUNCTIONS_EMULATOR === 'true' &&
        /^http:\/\/(127\.0\.0\.1|localhost):9199\//.test(e.image)
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'アップロードした画像を使用してください',
        path: ['image'],
      });
  });
export type EventInput = z.infer<typeof eventSchema>;
export type EventRecord = EventInput & {
  id: string;
  reservedMale: number;
  reservedFemale: number;
  confirmedMale: number;
  confirmedFemale: number;
  createdAt: number;
  updatedAt: number;
};
export const checkoutSchema = z.object({
  eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(2).max(80),
  gender: genderSchema,
  age: z.number().int().min(18).max(80),
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  phone: z
    .string()
    .transform((s) => s.replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(/^0\d{9,10}$/)),
  terms: z.literal(true),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type Booking = Omit<CheckoutInput, 'idempotencyKey' | 'terms'> & {
  id: string;
  token: string;
  fingerprint: string;
  participantKey: string;
  eventTitle: string;
  amount: number;
  status: 'holding' | 'paid' | 'expired' | 'refunded';
  createdAt: number;
  expiresAt: number;
  sessionId: string | null;
  paymentIntentId: string | null;
  checkedIn: boolean;
  refundedAmount: number;
  termsVersion: string;
  paidAt?: number;
  refundReason?: string;
};
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function validateEligibility(event: EventRecord, input: CheckoutInput, now = Date.now()) {
  if (event.status !== 'published' || Date.parse(event.startsAt) <= now + 2 * 3600000)
    throw new AppError(409, 'このイベントの受付は終了しました');
  if (input.age < event.minAge || input.age > event.maxAge || (event.alcohol && input.age < 20))
    throw new AppError(400, '対象年齢をご確認ください');
  const suffix = input.gender === 'male' ? 'Male' : 'Female';
  const capacity = input.gender === 'male' ? event.maleCapacity : event.femaleCapacity;
  if (event[`reserved${suffix}`] + event[`confirmed${suffix}`] >= capacity)
    throw new AppError(409, '選択された区分は満席です');
}
export const TERMS_VERSION = '2026-10-19';
