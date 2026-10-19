import { describe, it, expect } from 'vitest';
import {
  eventSchema,
  checkoutSchema,
  validateEligibility,
  type EventRecord,
} from '../functions/src/domain';
import { demoEvents } from '../src/data';
const event = {
  ...demoEvents[0],
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 93600000).toISOString(),
  reservedMale: 0,
  reservedFemale: 0,
  confirmedMale: 0,
  confirmedFemale: 0,
  createdAt: 0,
  updatedAt: 0,
} as EventRecord;
const input = {
  eventId: event.id,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  name: 'テスト 太郎',
  gender: 'male' as const,
  age: 25,
  email: 'USER@EXAMPLE.COM',
  phone: '090-1234-5678',
  terms: true as const,
};
describe('event and applicant validation', () => {
  it('normalizes email and telephone, rejects unknown payment parameters', () => {
    const result = checkoutSchema.parse({ ...input, amount: 1 });
    expect(result.email).toBe('user@example.com');
    expect(result.phone).toBe('09012345678');
    expect(result).not.toHaveProperty('amount');
  });
  it('rejects unaccepted terms and malformed identifiers', () => {
    expect(() => checkoutSchema.parse({ ...input, terms: false })).toThrow();
    expect(() => checkoutSchema.parse({ ...input, eventId: '../../events' })).toThrow();
  });
  it('rejects alcohol events for under 20 and inverted age ranges', () => {
    expect(() => eventSchema.parse({ ...event, minAge: 18 })).toThrow();
    expect(() => eventSchema.parse({ ...event, minAge: 35, maxAge: 25 })).toThrow();
  });
  it('allows an 18+ nonalcohol event', () => {
    expect(eventSchema.parse({ ...event, minAge: 18, alcohol: false }).minAge).toBe(18);
  });
  it('rejects unsafe image URLs, invalid prices and reversed schedule', () => {
    expect(() => eventSchema.parse({ ...event, image: 'javascript:alert(1)' })).toThrow();
    expect(() => eventSchema.parse({ ...event, malePrice: 0 })).toThrow();
    expect(() => eventSchema.parse({ ...event, endsAt: event.startsAt })).toThrow();
  });
  it('checks age, deadline, visibility and gender-specific capacity', () => {
    expect(() => validateEligibility(event, input)).not.toThrow();
    expect(() => validateEligibility(event, { ...input, age: 19 })).toThrow();
    expect(() => validateEligibility({ ...event, status: 'draft' }, input)).toThrow();
    expect(() =>
      validateEligibility(
        { ...event, startsAt: new Date(Date.now() + 3600000).toISOString() },
        input,
      ),
    ).toThrow();
    expect(() => validateEligibility({ ...event, confirmedMale: 12 }, input)).toThrow();
    expect(() => validateEligibility({ ...event, confirmedFemale: 12 }, input)).not.toThrow();
  });
});
