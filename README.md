# KAGOMEET

鹿児島のイベントを公開し、参加申込と当日の受付を管理するサイトです。Firebase Hosting、Cloud Functions、Firestore、Storage、Authentication、App Check を使用します。参加費は会場払いで、オンライン決済はありません。

## 公開サイトと管理画面

- 公開サイト: https://kagomeet.web.app/
- 管理画面: https://kagomeet.web.app/admin
- 管理者: `functions/.env.kagomeet` の `ADMIN_EMAIL` に設定した Google アカウントだけが利用できます。API でも Firebase ID トークンを検証します。

イベントは管理画面から作成・下書き保存・公開・編集・削除できます。イベント画像は管理画面から切り抜いてアップロードします。公開画面には検索、地域・カテゴリ・開催日での絞り込み、一覧／カレンダー表示、詳細、申込、申込状況とキャンセル、FAQ、お問い合わせを用意しています。管理画面では参加者、出欠、会場での入金、イベント別集計、問い合わせ、公式 Instagram／LINE の URL を管理します。SNS URL を保存すると、公開サイトのアイコンから移動できます。

申込は Firestore のトランザクションで男女別定員と重複メールアドレスを確認します。同じリクエストの再送は冪等処理されます。申込完了画面の URL と受付番号を参加者が保管してください。開催2時間前まで、未払いの申込はその画面からキャンセルできます。問い合わせ・申込の書き込みには App Check とレート制限を適用します。

## ローカル開発

Node.js 22 以上で実行します。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Firebase エミュレーターを使う場合は `npm run setup:emulators` でローカル設定を作り、別のターミナルで `npm run emulators` と `npm run dev:emulator` を起動します。既存のローカル設定は上書きしません。エミュレーター環境では App Check 検証を省略します。

```sh
npm test
npm run typecheck
npm run test:browser
```

ブラウザーテストには Chromium が必要です。必要に応じて `CHROMIUM_PATH` を指定してください。

## 本番設定とデプロイ

`.env.production.local` に Firebase Web アプリ設定、App Check の reCAPTCHA Enterprise サイトキー、運営名を設定します。`functions/.env.kagomeet` には `APP_URL` と `ADMIN_EMAIL` を設定します。双方の `REGISTRATIONS_ENABLED` を `true` にすると申込を受け付けます。これらのローカル設定は Git に含めません。

```sh
npm run build:production
firebase deploy --project kagomeet
```

Firestore のクライアント読み書きは拒否し、公開データと管理機能は Functions 経由にしています。Storage ではイベント画像の公開読み取りだけを許し、アップロードは認証済み管理者向け API で処理します。Firebase App Check に Web アプリと reCAPTCHA Enterprise サイトキーを登録しました。Cloud Functions・Firestore・Storage は東京リージョン、Hosting は Firebase のグローバル配信です。

## 運用上の注意

- 実イベントと Instagram／LINE URL は管理画面から登録してください。初期状態で実在しないイベントや SNS URL は公開しません。
- 申込後の自動メール送信は実装していません。参加者には完了画面の URL を保存してもらう案内を表示します。日程変更や中止の連絡は運営が参加者一覧を参照して行います。
- 事業者所在地・電話番号は現在のサイトには表示していません。イベントの販売形態に応じた表示義務を運営側で確認してください。
