# KAGOMEET（カゴミー）

鹿児島・天文館を中心とした飲み会・交流イベントの公式サイト。国分・鹿屋もエリアとして設定でき、開催がない地域は準備中と表示します。

## 現在の状態

公開サイト、管理画面、Firebase向けのバックエンドを実装しています。ローカルのFirebaseエミュレーターで検証できます。**本番のFirebase/Stripe/メール配信への接続と、実際の公開・カード決済はまだ完了していません。** サンプルの会場・日程は実開催ではありません。

- 公開：トップ、イベント一覧・エリア絞り込み、詳細・地図、申し込み入力・確認、決済状況、FAQ、初参加ガイド、お問い合わせ、規約、プライバシー、特商法表記。
- 管理：Firebase Authログイン、管理者権限、イベント作成・編集・削除、3:2画像トリミングとStorage保存、男女別料金・定員、参加者検索・出欠、全額返金依頼、イベント別売上、問い合わせ一覧、メール再送。
- 予約：Firestoreトランザクションによる仮予約、Stripe Checkout、署名検証付きWebhook、冪等処理、失効照合、返金・確認メールのキュー。

参考サイトの実ブラウザ調査は [docs/design-research.md](docs/design-research.md)。資産の出典は [docs/assets.md](docs/assets.md)。

## 開発環境

Node.js **22.18以降の22系**を推奨。Cloud FunctionsはNode.js 22。エミュレーターにはJava 21を推奨します。M1 MacBook Air 8GBでもフロントだけの開発は可能です。Firebaseエミュレーターをすべて動かす検証はクラウド環境を推奨します。

```bash
npm ci
```

クラウドでは各タスクが隔離されています。既存の `/workspace/kagomeet` を使い、明示的に依頼されない限りGit worktreeを作らないでください。

### 画面を確認するデモ

`.env.local` に次を設定します。このファイルはGit管理外です。

```dotenv
VITE_DEMO_MODE=true
```

```bash
npm run dev
```

開発サーバーは5173番ポート。デモの表示は明示的で、決済やメール送信を装いません。`/admin` の「デモ管理画面を見る」では一時的な編集ができ、再読み込みで元に戻ります。実際の参加者情報や認証を迂回する機能はありません。

### Firebaseエミュレーターで動かす

```bash
npm run setup:emulators
npm run emulators
```

別ターミナルで実行：

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
npm run seed
npm run dev:emulator
```

フロントは5174番ポート、Authは9099、Firestoreは8080、Functionsは5001、Storageは9199です。ブラウザのホスト名は `localhost` を使用してください。Functionsの `APP_URL` と一致させています。

`setup:emulators` はGit管理外のローカル設定のみ作成し、既存ファイルを上書きしません。Stripe/Resendの値は**実在しないエミュレーター専用の検証用文字列**です。外部サービスを呼ぶ用途には使えません。決済受付は無効です。

エミュレーター専用ユーザー：

| 権限         | メールアドレス         | パスワード           |
| ------------ | ---------------------- | -------------------- |
| 管理者       | `admin@kagomeet.test`  | `LocalDemoOnly2026!` |
| 一般ユーザー | `member@kagomeet.test` | `LocalDemoOnly2026!` |

このアカウントは本番では作成しません。seedスクリプトはループバックのエミュレーター接続以外を拒否します。

## テスト

```bash
npm run typecheck
npm test                 # 純粋な入力・参加条件のテスト
npm run test:rules       # Firestoreの実エミュレーターで予約競合・ルールも検証
```

デモの開発サーバーを起動した状態で：

```bash
npm run test:browser
```

Chrome/Chromiumを使い、PC・390px・320pxの画面、フィルター、フォーム、FAQ、管理の作成・トリミング、横はみ出しをチェックします。Linuxの既定パスは `/usr/bin/chromium`。Macなどでは `CHROMIUM_PATH` にChromeの実行ファイルのパスを指定できます。

エミュレーターを停止した状態で、全体の連携テスト：

```bash
npm run test:integration
```

このコマンドはエミュレーター内のテスト用データを消去します。`demo-kagomeet` 専用です。実際のAuthトークンによる401/403、CRUD、Storageへの画像アップロード、署名検証、Webhook二重送信、出欠、売上、問い合わせを確認します。Stripeの署名はローカルの検証用secretで生成し、実課金は行いません。期限切れ時のStripe照合ではSDK応答を模擬し、API失敗時に席を誤解放しないことも確認します。

スケジューラーは通常のローカルエミュレーターでは自動実行されません。本番またはステージングで期限切れ処理・メール配信の最終確認が必要です。

## 本番のFirebaseプロジェクト `kagomeet` を接続

### 1. Firebase Console

1. `kagomeet` にWebアプリを登録し、Firebaseの `firebaseConfig` を確認します。
2. FirestoreをNativeモードで作成。推奨ロケーションは東京 `asia-northeast1`。作成後に変更できないため、既存DBがある場合はそのロケーションに合わせます。
3. Authenticationでメール/パスワードを有効化。一般ユーザー用の公開登録画面は設けていません。運営アカウントはConsoleで作成します。
4. Storageを有効化します。Consoleに表示される実際のbucket名を使用します（`kagomeet.firebasestorage.app` 等。推測で決めないこと）。
5. Cloud Functions・Secret Manager・Cloud Schedulerを使うため、Blazeプランと課金設定が必要です。
6. App CheckにWebアプリを登録し、reCAPTCHA v3のサイトキーを取得します。公開ドメインを許可し、`VITE_RECAPTCHA_SITE_KEY` に設定します。APIの公開書き込みは本番ではApp Check検証が必須です。ローカルエミュレーターだけは免除されます。

### 2. 公開側の環境変数

`.env.example` を参考に `.env.production.local` を作成します。`.env.local` のデモ設定より本番モードの設定を優先させるため、本番用ファイルを分けます。

```dotenv
VITE_DEMO_MODE=false
VITE_USE_EMULATORS=false
VITE_FIREBASE_PROJECT_ID=kagomeet
VITE_FIREBASE_API_KEY=FirebaseのWeb公開設定
VITE_FIREBASE_AUTH_DOMAIN=kagomeet.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=Consoleで確認したbucket
VITE_FIREBASE_APP_ID=Consoleで確認したappId
VITE_RECAPTCHA_SITE_KEY=公開用サイトキー
VITE_API_BASE=/api
VITE_BUSINESS_NAME=実際の販売事業者名
VITE_BUSINESS_REPRESENTATIVE=実際の運営責任者名
VITE_BUSINESS_ADDRESS=公開する所在地
VITE_BUSINESS_PHONE=問い合わせ電話番号
VITE_SUPPORT_EMAIL=実際に受信できる窓口メール
```

`VITE_` で始まる値はブラウザへ公開されます。**Stripe秘密鍵・Webhook署名secret・サービスアカウント秘密鍵・メール配信APIキーをVITE変数に入れないでください。** FirebaseのWeb APIキーは公開設定ですが、API制限・Firestore/Storageルール・App Checkを併用します。

### 3. Firebaseのデプロイ権限

現在のクラウドには `kagomeet` を操作できるGoogle Cloud/Firebase認証が設定されていません。利用者の認証済みの端末では、次のようにFirebase CLIでログインします。

```bash
npx firebase login
npx firebase projects:list
```

サイトの見た目だけを先に確認する場合は、クラウド環境の設定を保存・Publishした後、同環境のターミナルで `npx firebase login --no-localhost` を実行できます。表示されたURLを自分のブラウザで開き、Googleログインで取得した認証コードを**ターミナルに直接**入力します。認証コードやトークンをチャット・リポジトリへ貼らないでください。`npx firebase projects:list` で `kagomeet` が見えることを確認してから、次を実行します。

```bash
npm run deploy:demo-preview
```

コマンドが返す `web.app` の期限付きURLで、スマートフォンからも操作できるサンプルサイトを確認できます。7日で期限切れになり、通常の本番URLは変更しません。サンプル画面には申込・決済が実際には行われない旨が表示されます。実運営サイトの公開には、以下の残りの設定と `npm run deploy` が必要です。

クラウドに設定済みのGCP接続を利用する場合は、その接続の対応CLI/ADC設定を使用してください。既存の認証を上書きしたり、秘密鍵をリポジトリへ置いたりしないでください。

管理者権限の付与は、対象プロジェクトの権限を持つADCが利用できる端末で実行します。

```bash
node scripts/grant-admin.mjs kagomeet FIREBASE_AUTH_USER_UID
```

Firebase Consoleで作成した**本人のUID**を指定します。既存のcustom claimsを保持して `admin: true` を追加し、既存トークンを失効させます。再ログイン後に有効です。ブラウザ側のフラグだけで管理者を判定せず、全管理APIでIDトークンと失効・custom claimを検証します。

### 4. Functionsの設定とStripe

`functions/.env.example` を参考に `functions/.env.kagomeet` を作成します。

```dotenv
APP_URL=https://kagomeet.web.app
MAIL_FROM=KAGOMEET <bookings@認証済みの送信ドメイン>
SUPPORT_EMAIL=窓口メールアドレス
SALES_ENABLED=false
```

`APP_URL` は末尾スラッシュなし、実際の公開先と一致させてください。独自ドメインを使う場合はこの値とAuthの承認済みドメイン、reCAPTCHAの許可ドメインを変更します。

Stripeでアカウントの審査・事業者設定を完了し、まずテストモードで検証してください。キーの値はCLIの安全な入力先からGoogle Secret Managerへ登録します。

```bash
npx firebase functions:secrets:set STRIPE_SECRET_KEY --project kagomeet
npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project kagomeet
npx firebase functions:secrets:set RESEND_API_KEY --project kagomeet
```

StripeのWebhook送信先：

```text
https://asia-northeast1-kagomeet.cloudfunctions.net/api/api/stripe/webhook
```

Hosting公開後は `https://kagomeet.web.app/api/stripe/webhook` も利用できます。**片方だけ**を登録してください。Functions URLの `/api/api/` はFunction名とExpressルートの組み合わせです。

購読イベント：

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

決済方法はカードに限定しています。遅延型の銀行決済等を追加する場合は、pending/failedの状態遷移と在庫保持を追加検証してください。Webhookの署名secretは該当endpointのものを使います。テスト用と本番用を混在させないでください。

Webhookの受信にはログインやApp Checkを求めず、**raw bodyに対するStripe署名**を検証します。不正な署名は400。確定時にはsession ID・金額・JPY通貨・PaymentIntent IDも検証します。

### 5. 確認メール

Resendで送信ドメインの所有権確認、SPF/DKIMを設定し、`MAIL_FROM` をそのドメインにします。`RESEND_API_KEY` はSecret Managerに保存します。`SUPPORT_EMAIL` を返信先として設定します。

決済確定・全額返金で `mailQueue` に登録し、1分ごとの関数で送信します。最大10回試行し、未送信・失敗は管理画面の「お問い合わせ・メール」から確認・再送できます。送信にはジョブIDの冪等キーを使用します。返金後に遅れて送られる参加確定メールは抑止します。

### 6. ルール・インデックス・公開

`firestore.rules` はクライアントからの全DBアクセスを禁止しています。公開イベントもAPIを通して必要情報だけを返します。予約情報・売上・在庫をクライアントから直接変更できません。Storageはイベント画像の公開読取のみ許可し、アップロードはadmin claim必須、画像形式・5MB以下に制限します。

```bash
npm run check:production
npm run deploy
```

`deploy` は公開用変数・運営者情報・デモ無効を確認し、ビルド後にHosting、Functions、ルール、インデックスをデプロイします。事前にFirebaseの認証とSecret Managerの登録が必要です。インデックスの構築完了を待ってください。

最初は `SALES_ENABLED=false` で公開し、次のチェックをステージングまたは限定したテストイベントで完了してから `true` に変更し、Functionsを再デプロイします。本番の実開催にはStripeの本番キー／本番Webhookを使用してください。

## 公開前のチェック

- 実際の販売事業者情報、問い合わせ先、対象年齢、会場・開催日時・男女別料金と定員が正しい。
- キャンセル規定を運営者が確認済み。現在は「開催7日前の同時刻まで全額返金、以降の参加者都合は返金対象外、運営都合の中止は全額返金」という案です。変更時は規約・FAQ・フォーム・特商法表記を合わせて修正する。
- デモモードとエミュレーター接続が無効。サンプルイベントを本番へ登録しない。
- Stripeテストカードで申込→Checkout→Webhook→確定→確認メールを確認。
- Checkoutを閉じたときの再開、未決済の失効と在庫復元を確認。
- 同じ申し込みの再送、別キーで同じメールの二重申し込み、残り1席への同時申込を確認。
- 管理者の出欠・売上・返金を確認。返金Webhook→席の復元→返金メールまで確認。
- 実メールの受信と管理画面からの再送を確認。Functions/Scheduler/Secret Managerの権限・ログを確認。
- App Checkの有効トークンで公開フォームが送信でき、欠落トークンは拒否される。
- HTTPS、公開ドメイン、Auth許可ドメイン、CSP、Googleマップ表示、スマホ実機を確認。

## 予約・決済の設計

1. APIは入力値と年齢、公開状態、開催2時間前の受付期限を検証します。価格はブラウザの値を使いません。
2. イベントと予約を同じFirestoreトランザクションで処理。男女ごとに `reserved + confirmed < capacity` を確認します。
3. UUIDの申込キーから予約IDを導出。同じキーで内容が変わる場合は拒否。同一イベント・同一メールは別キーでも二重予約できません。
4. 仮予約は約31分。固定した金額・期限・予約IDを使い、Stripeへ同じ冪等キーを送ります。APIの通信結果が曖昧でも席を即時解放しません。
5. 署名検証済みWebhookで仮予約から参加確定へ移動し、在庫とメール登録を原子的に更新。既処理Webhookは再適用しません。
6. 5分ごとの期限切れ処理はStripeでセッションを確認・失効させてから席を戻します。決済済みなら確定へ復旧します。session IDの保存に失敗した場合もStripeを全ページ照合し、通信失敗時は在庫を保持します。
7. 全額返金は管理者のみ実行でき、Stripe返金の冪等キーを使用。返金通知で確定人数を減らします。一部返金は記録しますが席は維持します。
8. 確認画面は予約IDだけでなくランダムな確認トークンが必要です。APIは連絡先などの個人情報を返さず、確認URLを外部へReferer送信しません。

## 運用上の注意

- 開催2時間前に新規受付を止めます。予約者がいるイベントの日時・会場・年齢条件・料金・公開状態の変更を禁止しています。説明文・注意事項・定員の増加は可能です。
- 中止・削除は、参加者への連絡と返金、仮予約の失効が完了してから行います。削除は論理削除で、売上履歴を維持します。
- 売上は税込、Stripe手数料控除前。決済総額・返金額・差引額を分けます。
- 問い合わせはDBへ保存され、管理画面の最新100件に表示されます。運営者への自動通知メールは送らないため、管理画面を定期的に確認してください。
- レート制限はIP単位、フォーム送信は10分で15回、状況照会は10分で120回。Firestore TTLで制限用データを整理します。
- 不要な参加者情報を保管し続けないよう、運営者が保存期間・削除手順を決めてください。削除前に法定保存義務と決済の照合を確認します。
- Functionsのログに顧客入力、Stripeリクエスト、秘密鍵を出力しません。Webhookやメールの失敗はジョブIDで確認します。
- `@grpc/grpc-js` と `uuid` は既知問題の修正版へ依存解決を上書きしています。ルートとFunctionsの両方でlockfileを固定しています。

## ファイル構成

```text
src/                     公開画面・管理画面・ローカルのサンプルデータ
functions/src/domain.ts  入力・参加条件の検証
functions/src/bookings.ts 在庫・予約・確定・返金のトランザクション
functions/src/reconcile.ts Stripeとの失効・決済状態の照合
functions/src/index.ts   HTTP API・Webhook・定期処理・メール
scripts/                 起動補助・権限付与・公開チェック・ブラウザ検証
firestore.rules          クライアントDBアクセスの制限
storage.rules            管理者画像アップロード制限
firestore.indexes.json   複合インデックス・TTL
firebase.json            Hosting・Functions・エミュレーター設定
```
