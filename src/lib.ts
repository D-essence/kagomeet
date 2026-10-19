import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
} from 'firebase/app-check';
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
export const configured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID,
);
const app = configured
  ? initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
  : null;
export const auth = app ? getAuth(app) : null;
export const storage = app ? getStorage(app) : null;
const emulator = import.meta.env.VITE_USE_EMULATORS === 'true';
if (emulator && auth && storage) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
let appCheck: AppCheck | null = null;
if (app && !emulator && import.meta.env.VITE_RECAPTCHA_SITE_KEY)
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
export async function api<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (admin) {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error('ログインしてください');
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (appCheck && options.method && options.method !== 'GET')
    headers.set('X-Firebase-AppCheck', (await getToken(appCheck)).token);
  const response = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}${path}`, {
    ...options,
    headers,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('サーバーに接続できません。時間をおいて再度お試しください');
  }
  if (!response.ok) throw new Error(data.error || '処理に失敗しました');
  return data;
}
export const business = {
  name: import.meta.env.VITE_BUSINESS_NAME || '',
  representative: import.meta.env.VITE_BUSINESS_REPRESENTATIVE || '',
  address: import.meta.env.VITE_BUSINESS_ADDRESS || '',
  phone: import.meta.env.VITE_BUSINESS_PHONE || '',
  email: import.meta.env.VITE_SUPPORT_EMAIL || '',
};
