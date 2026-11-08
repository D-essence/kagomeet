import fs from 'node:fs';
const files = {
  '.env.emulator.local': `VITE_DEMO_MODE=false\nVITE_USE_EMULATORS=true\nVITE_FIREBASE_API_KEY=demo-emulator-key\nVITE_FIREBASE_AUTH_DOMAIN=demo-kagomeet.firebaseapp.com\nVITE_FIREBASE_PROJECT_ID=demo-kagomeet\nVITE_FIREBASE_STORAGE_BUCKET=demo-kagomeet.appspot.com\nVITE_FIREBASE_APP_ID=demo-emulator-app\n`,
  'functions/.env.demo-kagomeet': `APP_URL=http://localhost:5174\nADMIN_EMAIL=admin@kagomeet.test\nREGISTRATIONS_ENABLED=true\n`,
};
for (const [name, value] of Object.entries(files)) {
  if (fs.existsSync(name)) {
    console.log('Preserved ' + name);
    continue;
  }
  fs.writeFileSync(name, value, { mode: 0o600 });
  console.log('Created ' + name);
}
