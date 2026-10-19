import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
  'VITE_RECAPTCHA_SITE_KEY',
  'VITE_BUSINESS_NAME',
  'VITE_BUSINESS_REPRESENTATIVE',
  'VITE_BUSINESS_ADDRESS',
  'VITE_BUSINESS_PHONE',
  'VITE_SUPPORT_EMAIL',
];
const missing = required.filter((k) => !env[k] || /YOUR_|未設定|example\./i.test(env[k]));
if (env.VITE_DEMO_MODE !== 'false') missing.push('VITE_DEMO_MODE must be false');
if (env.VITE_USE_EMULATORS === 'true') missing.push('VITE_USE_EMULATORS must be false');
if (env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-'))
  missing.push('A real Firebase project is required');
if (missing.length) {
  console.error(
    'Production deployment is blocked. Configure the following names (values are not logged):\n' +
      missing.map((k) => '- ' + k).join('\n'),
  );
  process.exit(1);
}
console.log(
  'Public deployment configuration checks passed. Complete the Stripe/email live acceptance checklist separately.',
);
