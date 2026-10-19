export type Area = 'tenmonkan' | 'kokubu' | 'kanoya';
export type Gender = 'male' | 'female';
export interface EventData {
  id: string;
  title: string;
  area: Area;
  venue: string;
  address: string;
  startsAt: string;
  endsAt: string;
  minAge: number;
  maxAge: number;
  alcohol: boolean;
  malePrice: number;
  femalePrice: number;
  maleCapacity: number;
  femaleCapacity: number;
  maleRemaining: number;
  femaleRemaining: number;
  description: string;
  conditions: string;
  schedule: { time: string; text: string }[];
  notes: string;
  image: string;
  tag: string;
  status: 'draft' | 'published' | 'cancelled';
  reservedMale?: number;
  reservedFemale?: number;
  confirmedMale?: number;
  confirmedFemale?: number;
}
export interface Participant {
  id: string;
  eventId: string;
  eventTitle: string;
  name: string;
  gender: Gender;
  age: number;
  email: string;
  phone: string;
  amount: number;
  refundedAmount: number;
  status: 'holding' | 'paid' | 'expired' | 'refunded';
  checkedIn: boolean;
  createdAt: number;
}
export const areas: Record<Area, string> = { tenmonkan: '天文館', kokubu: '国分', kanoya: '鹿屋' };
export const cities: Record<Area, string> = {
  tenmonkan: '鹿児島市',
  kokubu: '霧島市',
  kanoya: '鹿屋市',
};
export const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
export function dateParts(s: string) {
  const d = new Date(s);
  return {
    month: new Intl.DateTimeFormat('ja-JP', { month: 'numeric', timeZone: 'Asia/Tokyo' })
      .format(d)
      .replace('月', ''),
    day: new Intl.DateTimeFormat('ja-JP', { day: 'numeric', timeZone: 'Asia/Tokyo' })
      .format(d)
      .replace('日', ''),
    weekday: new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(
      d,
    ),
    time: new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(d),
  };
}
export const fullDate = (s: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(s));
