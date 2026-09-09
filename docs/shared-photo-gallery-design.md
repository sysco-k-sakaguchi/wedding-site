# 「みんなの写真」MVP 設計メモ

## 画面と導線

- URL は `/photos`。既存の `/gallery`（二人の前撮り写真）とは用途を分ける。
- トップページの `Information > Photo` に「写真を見る・追加する」導線を追加する。
- `/photos` は、共有コード入力、アップロード、カテゴリー絞り込み、写真グリッド、選択ダウンロード、拡大表示を1ページにまとめる。
- 管理操作は `/photos/admin` に分離する。

## データモデル

写真メタデータは D1 の `photos` テーブルに保存する。主な列は、ID、元ファイル名、原本・サムネイルのキー、MIME、サイズ、幅・高さ、カテゴリー、投稿者名、コメント、投稿日時、表示状態、SHA-256 ハッシュ。ハッシュを一意にして同一画像の重複登録を抑える。

## API

- `GET /api/photos/session`: 認証状態、カテゴリー、アップロード上限
- `POST /api/photos/access`: 共有コード認証
- `POST /api/photos/admin/access`: 管理コード認証
- `GET /api/photos`: 表示中写真の一覧
- `POST /api/photos`: 画像1枚のアップロード（UIは最大20枚を順次送信）
- `GET /api/photos/:id`: 詳細
- `GET /api/photos/:id/thumbnail`: サムネイル
- `GET /api/photos/:id/download`: 原本
- `POST /api/photos/download`: 選択写真を固定した短期ダウンロードURLを発行
- `GET /api/photos/download/:jobId`: 選択写真のZIPをストリーミング取得
- `POST /api/photos/download-all`: 全表示写真を固定した短期ダウンロードURLを発行
- `GET /api/admin/photos`: 管理用一覧（非表示を含む）
- `PATCH /api/admin/photos/:id`: 表示・非表示
- `DELETE /api/admin/photos/:id`: 原本、サムネイル、メタデータを削除

## 保存・画像処理・ZIP

- ローカル開発では Miniflare のローカル D1/R2 を利用し、ブラウザや再読み込みをまたいで共有・永続化する。
- 保存処理は `PhotoStorage` インターフェースの背後へ置き、原本・サムネイル・取得・削除・ストリーム取得を画面/APIから分離する。
- JPEG、PNG、WebPを署名と画像寸法で検査し、Cloudflare Images binding でデコードできたものだけを受理する。サムネイルはWebPへ変換し、EXIFを含めない。原本は画質維持のため変更せず保存するため、原本のEXIFは残る。
- HEIC/HEIFは今回のWorker構成で確実な変換経路がないため、明示エラーにする。本番対応案をREADMEに残す。
- ZIPはWorkerからバックプレッシャー対応でストリーミング生成し、画像全体をサーバーやブラウザで一括メモリ展開しない。選択写真はD1の10分有効・1回限りのjobへ固定し、カテゴリー別フォルダと一意な安全名を使う。

## アクセス制御と管理

- `PHOTO_ACCESS_CODE` と `PHOTO_ADMIN_CODE` を環境変数で設定する。
- 認証後は `HttpOnly`、`SameSite=Strict`、署名・有効期限付きCookieを使う。秘密値はクライアントへ渡さない。
- 更新系APIは同一Originを確認し、二重送信をUI、`batchId + fileIndex` の一意制約、画像ハッシュで抑える。
- `/photos` と `/photos/admin` は `noindex, nofollow`。写真バイナリ/APIは認証Cookieなしで返さない。
- 管理者は非表示・再表示・削除と投稿者名・コメント確認ができる。

## 本番移行

- Sites側でD1/R2を作成・接続し、環境変数を安全に登録する。
- アクセスコードを十分長い値へ変更し、容量・リクエスト制限、バックアップ、監視、保持期間を決める。
- 必要なら `PhotoStorage` の実装をS3互換、R2、Supabase Storage等へ差し替える。
- HEIC/HEIF変換が必要なら、対応ランタイムまたは画像変換サービスを追加する。
