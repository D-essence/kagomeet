import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Use npm run test:integration to start isolated emulators.');
const run = (cmd) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env: process.env });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(cmd.join(' ') + ' failed: ' + code)),
    );
    p.on('error', reject);
  });
let server;
try {
  await run(['npm', 'test']);
  await run(['npm', 'run', 'seed']);
  await run(['node', 'scripts/integration-api-test.mjs']);
  try {
    await fetch('http://localhost:5174');
  } catch {
    server = spawn('npm', ['run', 'dev:emulator', '--', '--strictPort'], {
      stdio: 'inherit',
      detached: true,
    });
  }
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://localhost:5174');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  if (!ready) throw new Error('Emulator frontend did not start');
  await run(['node', 'scripts/browser-emulator-test.mjs']);
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM');
}
