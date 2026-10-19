import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const [projectId, uid] = process.argv.slice(2);
if (!projectId || !uid || projectId.startsWith('demo-'))
  throw new Error(
    'Usage: node scripts/grant-admin.mjs <verified-project-id> <existing-auth-user-uid>',
  );
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
await auth.revokeRefreshTokens(uid);
console.log('Admin claim granted. The user must sign in again.');
