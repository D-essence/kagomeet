import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://localhost:5174/admin', { waitUntil: 'networkidle' });
  await page.getByLabel('メールアドレス').fill('member@kagomeet.test');
  await page.getByLabel('パスワード', { exact: true }).fill('LocalDemoOnly2026!');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.getByText('このアカウントには管理者権限がありません。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '別のアカウントでログイン' }).click();
  await page.getByLabel('メールアドレス').fill('admin@kagomeet.test');
  await page.getByLabel('パスワード', { exact: true }).fill('LocalDemoOnly2026!');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.getByRole('heading', { name: 'イベント管理' }).waitFor();
  const title = `ブラウザ保存テスト ${Date.now()}`;
  await page.getByRole('button', { name: 'イベントを作成', exact: true }).click();
  await page.getByLabel('イベント名', { exact: true }).fill(title);
  await page.getByLabel('開催エリア').selectOption('kanoya');
  await page.getByLabel('公開状態').selectOption('published');
  await page.getByLabel('会場名', { exact: true }).fill('鹿屋テストカフェ');
  await page.getByLabel('会場住所').fill('鹿児島県鹿屋市北田町');
  await page
    .getByLabel('イベントの説明')
    .fill('ブラウザからFirestoreへ保存し、公開画面から確認するテストイベントです。');
  await page.locator('input[type=file]').setInputFiles('public/images/hero.png');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('slider', { name: '画像の拡大率' }).fill('1.5');
  await page.getByRole('button', { name: 'この範囲で使用する' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'イベントを保存', exact: true }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.goto('http://localhost:5174/events?area=kanoya', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.getByRole('heading', { name: title, exact: true }).getByRole('link').click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  assert.equal(
    await page.locator('.detail-visual img').evaluate((e) => e.complete && e.naturalWidth > 0),
    true,
  );
  await page.screenshot({ path: 'test-results/live-event-mobile.png' });
  await page.goto('http://localhost:5174/admin', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'イベント管理' }).waitFor();
  await page.getByRole('button', { name: '参加者', exact: true }).click();
  await page
    .getByLabel('イベント', { exact: true })
    .selectOption({ label: 'API統合テストの交流会' });
  await page.getByText('検証 太郎', { exact: true }).waitFor();
  await page.getByPlaceholder('名前・メール・電話番号・状況').fill('検証 太郎');
  const attendance = page.getByRole('checkbox', { name: '出席', exact: true });
  if (await attendance.isChecked())
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/attendance') && r.status() === 200),
      attendance.uncheck(),
    ]);
  await page.screenshot({ path: 'test-results/participants-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '売上', exact: true }).click();
  await page.getByRole('heading', { name: 'イベント別売上', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'API統合テストの交流会', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'イベント', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `${title}を削除`, exact: true }).click();
  await page.getByText('イベントを削除しました。', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real Auth emulator member rejection/admin login, Firestore event create/reload/filter, Storage crop/upload/render, participant search/attendance, sales and deletion.',
  );
} finally {
  await browser.close();
}
