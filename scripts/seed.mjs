import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
// This command is deliberately incapable of writing sample users or events into production.
if (
  !/^127\.0\.0\.1:8080$|^localhost:8080$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
  !/^127\.0\.0\.1:9099$|^localhost:9099$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '')
)
  throw new Error(
    'Start local demo-kagomeet emulators and set both emulator host variables. Production seeding is prohibited.',
  );
initializeApp({ projectId: 'demo-kagomeet' });
const { demoEvents } = await import('../src/data.ts');
const db = getFirestore();
for (const event of demoEvents) {
  await db
    .collection('events')
    .doc(event.id)
    .set({
      ...event,
      startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      reservedMale: 0,
      reservedFemale: 0,
      confirmedMale: 0,
      confirmedFemale: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
}
const auth = getAuth();
for (const [uid, email, admin] of [
  ['local-admin', 'admin@kagomeet.test', true],
  ['local-member', 'member@kagomeet.test', false],
]) {
  try {
    await auth.createUser({ uid, email, password: 'LocalDemoOnly2026!' });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') throw e;
  }
  await auth.setCustomUserClaims(uid, { admin });
}
console.log('Seeded local demo events and two emulator-only users. No production access.');
