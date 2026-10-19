import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
await fs.mkdir('test-results', { recursive: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
async function noOverflow() {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    `Horizontal overflow: ${page.url()}`,
  );
}
async function visit(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await noOverflow();
}
try {
  await visit('/');
  await page.screenshot({ path: 'test-results/home-desktop.png' });
  assert.equal(
    (await page.locator('h1').innerText()).replace(/\n/g, ''),
    '鹿児島で、気軽につながる。',
  );
  await page.getByRole('button', { name: '国分 準備中', exact: true }).click();
  await page.getByText('国分での開催を準備しています。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '天文館', exact: true }).click();
  await page.locator('.event-card').first().waitFor();
  assert.equal(await page.locator('.event-card').count(), 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await visit('/');
  await page.screenshot({ path: 'test-results/home-mobile.png' });
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await page.locator('#mobile-menu').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#mobile-menu').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#mobile-menu').count(), 0);
  await visit('/events?area=kanoya');
  await page.getByText('鹿屋での開催を準備しています。', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'すべて', exact: true }).click();
  await page.locator('.event-card').first().waitFor();
  assert.equal(await page.locator('.event-card').count(), 3);
  await page.screenshot({ path: 'test-results/events-mobile.png', fullPage: true });
  await visit('/events/sample-friday');
  await page.screenshot({ path: 'test-results/detail-mobile.png', fullPage: true });
  await page.locator('.mobile-booking a').click();
  await page.getByLabel('お名前').fill('鹿児島 花子');
  await page.getByRole('radio', { name: /女性/ }).check();
  await page.getByLabel('年齢', { exact: false }).first().fill('26');
  await page.getByLabel('メールアドレス').fill('hanako@example.com');
  await page.getByLabel('電話番号').fill('09012345678');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '入力内容を確認する' }).click();
  await page.getByRole('heading', { name: 'お申し込み内容の確認' }).waitFor();
  await noOverflow();
  await page.screenshot({ path: 'test-results/apply-review-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'デモの確認画面へ' }).click();
  await page.getByText('実際の予約・決済・メール送信は行っていません。', { exact: true }).waitFor();
  await visit('/faq');
  await page.locator('summary').first().click();
  assert.equal(await page.locator('details[open]').count(), 1);
  for (const path of ['/about', '/contact', '/terms', '/privacy', '/legal', '/not-found'])
    await visit(path);
  await visit('/contact');
  await page.getByLabel('お名前').fill('鹿児島 花子');
  await page.getByLabel('メールアドレス').fill('hanako@example.com');
  await page.getByLabel('お問い合わせ内容').fill('初参加の持ち物について確認したいです。');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'デモの入力内容を確認する' }).click();
  await page.getByText('デモモードのため、実際の送信はしていません。').waitFor();
  await visit('/admin');
  await page.getByRole('button', { name: 'デモ管理画面を見る' }).click();
  await page.getByRole('heading', { name: 'イベント管理' }).waitFor();
  await noOverflow();
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'イベントを作成', exact: true }).click();
  await page.getByLabel('イベント名', { exact: true }).fill('国分のノンアルコール交流会');
  await page.getByLabel('開催エリア').selectOption('kokubu');
  await page.getByLabel('会場名', { exact: true }).fill('サンプルカフェ');
  await page.getByLabel('会場住所').fill('鹿児島県霧島市国分中央');
  await page.getByLabel('飲酒を伴うイベント（20歳以上）').uncheck();
  await page.getByLabel('対象年齢（下限）').fill('18');
  await page
    .getByLabel('イベントの説明')
    .fill('同世代でお茶を飲みながらゆったり交流するノンアルコールイベントです。');
  await page.locator('input[type=file]').setInputFiles('public/images/hero.png');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'この範囲で使用する' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'イベントを保存', exact: true }).click();
  await page.getByRole('heading', { name: '国分のノンアルコール交流会', exact: true }).waitFor();
  await page.getByRole('button', { name: '売上', exact: true }).click();
  await page.getByText('売上データはまだありません。').waitFor();
  await noOverflow();
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of [
    '/',
    '/events',
    '/events/sample-friday',
    '/events/sample-friday/apply',
    '/faq',
    '/admin',
  ])
    await visit(path);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop/mobile 390px/320px, area filters, menus, event detail, application review/demo confirmation, FAQ, legal pages, contact, admin create/crop, sales and overflow checks.',
  );
} finally {
  await browser.close();
}
