# Masato & Haruka Wedding Site

Next.js / vinext / Cloudflare Worker で動くウェディングサイトです。既存の招待状と編集済みギャラリーに加え、ゲスト同士で当日の写真を共有する「みんなの写真」MVPを実装しています。

## ページ

- `/` — ウェディング招待状。`Information > Guest Album` から共有アルバムへ移動できます。
- `/gallery` — 二人の既存写真を閲覧する編集済みギャラリーです。
- `/photos` — 共有コードで利用する「みんなの写真」です。
- `/photos/admin` — 投稿確認、非表示・再表示、完全削除を行う管理画面です。

`/photos` と `/photos/admin` はメタデータ、HTTPヘッダー、`robots.txt` のすべてで検索インデックスを拒否します。画像APIも認証Cookieなしでは利用できません。

## ローカル起動

必要環境は Node.js 22.13.0 以上と npm です。

```bash
npm install
cp .env.example .env.local
```

`.env.local` に互いに異なる値を設定してください。ゲスト共有コードは案内しやすい値にできますが、管理者コードは推測されにくい長い値、`PHOTO_SESSION_SECRET` は32文字以上のランダム値が必須です。

```dotenv
PHOTO_ACCESS_CODE=ゲストへ伝える共有コード
PHOTO_ADMIN_CODE=管理者だけが知る別のコード
PHOTO_SESSION_SECRET=32文字以上のランダムな秘密値
PHOTO_VARIANT_MODE=transform
```

起動します。

```bash
npm run dev
```

表示されたローカルURL（通常は `http://localhost:3000`）を開きます。`.env.local` はGit管理されません。実際の秘密値を `.env.example` やソースへ書かないでください。

## ローカル保存

ローカル開発ではCloudflare MiniflareのD1とR2を使用します。

- D1: 写真メタデータ、アップロードバッチ、短期ZIP job、SHA-256重複判定、簡易レート制限。写真を参照しない期限切れバッチと期限切れjobは後続作成時に削除
- R2: 原本、サムネイル、表示画像。ブラウザーからの新規投稿は480px / 1600px以内のJPEGを原本と一緒に送ります。旧raw APIは互換性を保持し、`transform`モードでは640px / 1920pxのWebP、`original`モードでは入力画像をそのまま使用
- 保存先: プロジェクト配下の `.wrangler/state`（Git対象外）

ブラウザのLocalStorageへ写真は保存しません。同じ開発サーバーへ接続する別ブラウザからも同じ写真を参照でき、ページ再読み込みや通常のdev server再起動をまたいで残ります。

閲覧中は画面付近のサムネイルだけを取得し、拡大時はサムネイルを先に表示してから表示用画像へ切り替えます。失敗した画像は個別に再試行できます。取得済み画像はページ内メモリだけに保持し、目安12MB・40件のLRUで表示中の画像を保護します。ページ離脱・認証切れで破棄し、画像APIの`private, no-store`と認証は維持します。保存とZIPは原本を使います。

既存写真の軽量化は管理者用 `scripts/optimize-photos.mjs` を使用します。Node.jsと既存のSharp依存が必要です。`PHOTO_OPTIMIZE_BASE_URL`と`PHOTO_ADMIN_CODE`を設定し、まず`--dry-run --audit outputs/photo-light-plan.json`で確認します。`--apply --audit outputs/photo-light-applied.json`で派生画像だけを更新し、配信JPEGのデコード・容量・縦横比と全原本のハッシュ、写真一覧・公開状態の不変を照合します。途中で停止しても最適化済みの写真は再更新しません。監査ファイルはGit対象外の`outputs/`へ保存してください。

バックアップする場合はdev serverを停止し、`.wrangler/state` を日時付きの別ディレクトリへコピーしてください。初期化は、そのバックアップを確認したうえで `.wrangler` を退避してから行います。`public/images` は静的同期時に再生成されるため、投稿写真の保存先には使用していません。

## 2026-10-02 の更新

独自ドメイン `masato-haruka-wedding.com` は GitHub Pages の `main` / ルートを静的配信しています。`/photos` の React ページと Worker API はこの配信方式では実行されず、共有ボタンのリンク先が404になります。招待状はそのまま保持し、共有アプリを既存 Sites プロジェクトに配置して、専用ボタンだけを絶対URLへ接続する構成です。

- 招待状の変更は共有ボタンの濃い黄色、共有アプリへのリンク、および既存の日英選択の引き継ぎのみ。
- ゲスト画面は本文18px、明示的な「追加」「保存」、日本語 / English、複数選択、任意項目の折りたたみ、通信切断時の再送に対応。
- ゲストのパスワードはホスティングの secret `PHOTO_ACCESS_CODE` で設定。ソースに実値を埋め込みません。全角数字と前後の空白にも対応します。
- 公開アーカイブは `.openai/hosting.json`、`dist/server`、`dist/client` に加えて、ソースの `drizzle` をアーカイブ直下へ収録します。ビルド内の `.openai/drizzle` だけでは本番migrationが検出されません。
- 本番D1のスキーマ作成はデプロイ時のSQL migrationが担当。ローカル開発のみ `PHOTO_LOCAL_SETUP=1` により初期化します。
- Sitesの共有画面は所有者の承認により「リンクからアクセス可」で公開します。写真/API自体は共有パスワードと署名Cookieで保護されます。
- 本番の `original` モードは1枚5MB、40MP。選択枚数・1時間の投稿枚数は無制限（内部バッチは10枚ずつ）。ローカルに既存の投稿があっても、それらは自動的に本番へ送られません。

## 写真機能

- JPEG / PNG / WebP、1枚20MB、内部バッチ20枚が初期値です。選択総数に制限はなく、必要なときにバッチを分けて同時2件で送ります。
- スマートフォンの写真ライブラリ、PCのファイル選択、ドラッグ＆ドロップ、複数選択に対応します。
- アップロード前プレビュー、場面、任意の投稿者名・コメント、ファイル別進捗・成否を表示します。
- 画像本体は1枚ずつraw bodyで送り、Content-Lengthに依存しない上限付きストリーム読込を行います。magic bytes、MIME、寸法、総画素数、実デコードで検証し、検出MIMEから安全な拡張子を付けます。入力ファイル名を保存キーには使いません。
- 原本・サムネイル・表示画像の3書込み完了後にD1へ登録します。D1のcommit結果が不確定な場合はIDとhashを再照合し、登録済みオブジェクトを誤削除しない安全側の補償処理を行います。
- SHA-256、バッチID、ファイル位置によって重複登録や再送を抑えます。
- 一覧は新しい順、`すべて / 挙式 / 披露宴 / その他` で絞り込みます。
- 選択状態は絞り込みを切り替えても維持します。個別原本、選択ZIP、全件ZIPを取得できます。
- ZIPはサーバー側でR2から1件ずつバックプレッシャー対応ストリーミングし、カテゴリー別フォルダと一意な安全名を使用します。選択・全件とも、容量を事前検査したうえで10分有効・原子的に1回だけ消費できる短期URLを発行し、ブラウザの通常ダウンロードへ渡します。ブラウザメモリへZIP全体を展開しません。
- 現行writerはZIP64非対応のため、4GiB境界または65,535件を超える場合は壊れたZIPを返さず、処理開始前に明示エラーにします。本番でこの規模が見込まれる場合はZIP64対応writerまたはカテゴリー別分割を導入してください。
- 拡大表示は表示用画像を使い、前後・Home/End・Esc・閉じるボタンに対応します。`transform`モードではWebP、`original`モードでは入力画像の形式です。

HEIC / HEIFは現在のWorker構成では確実に変換できないため、壊れた対応にせず明示的に拒否します。iPhone側で「互換性優先」またはJPEGへ変換してから追加してください。本番で必須にする場合は、対応ランタイムでJPEGへデコード・再エンコードする処理を `ImageProcessor` 相当の境界へ追加します。

JPEGのEXIF Orientationは寸法検査で考慮し、Cloudflare Imagesが表示用・サムネイルの向きを正規化します。派生WebPにはEXIFを含めません。原画質の個別・ZIPダウンロードを保証するため、原本は変更せず保存し、GPSを含むEXIFが残る可能性があります。本番方針として、原本も再エンコードして位置情報を削除するか、原画質保持を優先するかを明示的に決定してください。

## アクセス制御と管理

- ゲストコードと管理コードは環境変数で分離します。同じ値の場合は設定不備として写真機能をfail-closedにします。
- 認証後はHMAC署名・期限付きの `HttpOnly` / `SameSite=Strict` Cookieを使用します。HTTPS時は `Secure` も付きます。
- 更新系APIは同一Origin、`Sec-Fetch-Site`、CSRFトークンを検査します。
- 認証失敗はD1のIPハッシュ単位で15分あたり10回、アップロードは `PHOTO_UPLOADS_PER_HOUR` が正のときnonce付き署名セッション単位と高めのIP副次上限の両方でレート制限します。共有回線でゲスト全員を巻き込みにくくしつつ、再認証やCSRF Cookie書換えだけでは無制限に回避できません。
- 管理者は投稿者名・コメントを確認し、公開中の写真を非表示・再表示できます。
- 「完全に削除」は確認後、まず非表示にしてからD1メタデータとR2の原本・派生画像を削除します。復元できないため、必要なら事前にバックアップしてください。

ゲストには管理権限を渡さず、管理コードをブラウザJavaScriptへ埋め込まないでください。

## 設定値

| 環境変数 | 必須 | 初期値 / 用途 |
| --- | --- | --- |
| `PHOTO_ACCESS_CODE` | 必須 | ゲスト共有コード |
| `PHOTO_ADMIN_CODE` | 必須 | 管理者専用コード |
| `PHOTO_SESSION_SECRET` | 必須 | Cookie署名。32文字以上 |
| `PHOTO_MAX_FILE_BYTES` | 任意 | `20000000`。Images Binding上限に合わせ最大20MB |
| `PHOTO_MAX_FILES_PER_BATCH` | 任意 | 内部バッチサイズ `20`（選択総数の上限ではありません） |
| `PHOTO_MAX_PIXELS` | 任意 | `100000000` |
| `PHOTO_UPLOADS_PER_HOUR` | 任意 | 省略時は署名セッション単位で `60`。`0`で投稿・バッチ作成の回数制限を解除 |
| `PHOTO_VARIANT_MODE` | 任意 | `transform`。Images Bindingがない環境では明示的に`original` |

カテゴリーは [worker/photo-utils.ts](worker/photo-utils.ts) の定義をAPIから画面へ渡しており、追加時に表示箇所を個別修正する必要はありません。

## テストと品質確認

```bash
npm run lint
npm run typecheck
npm run check:modules
npm test
npm run build
```

ローカルAPI統合テストは、別ターミナルでdev serverを起動してから実行します。テストは自身が登録した写真を最後に完全削除します。

```bash
PHOTO_ACCESS_CODE=integration-guest \
PHOTO_ADMIN_CODE=integration-admin \
PHOTO_SESSION_SECRET=integration-session-secret-at-least-32-characters \
npm run dev

PHOTO_ACCESS_CODE=integration-guest \
PHOTO_ADMIN_CODE=integration-admin \
PHOTO_TEST_BASE_URL=http://localhost:3000 \
npm run test:integration
```

統合テストは匿名・ゲスト・管理者Cookieを分離し、CSRF、複数raw upload、冪等再送、再取得、20MB実サイズ上限、派生画像、原本一致、危険な元拡張子の正規化、破損・許可MIME間不一致・重複拒否、カテゴリー、短期jobの匿名拒否・同時取得時の原子的1回消費、選択ZIPと全件ZIPの解凍・原本一致・同名保持、非表示後の詳細・派生・原本・予約済みZIP遮断、再表示、管理者削除まで確認します。localhost以外への書込みは明示opt-inなしで拒否します。format専用スクリプトは既存プロジェクトにないため、lintとTypeScriptで整合性を確認します。

2026-09-01時点で `npm audit --omit=dev` は0件です。全依存監査には、現行vinextが利用する `image-size` のhigh 2件が残ります。修正にはvinext 1.0 betaへの破壊的移行が必要なため `--force` は使っていません。本番公開前にvinextの互換性確認を伴う更新を行ってください。

設計判断は [docs/shared-photo-gallery-design.md](docs/shared-photo-gallery-design.md)、バス案内の注意点は [docs/bus-source-notes.md](docs/bus-source-notes.md) にあります。

## 本番運用の設定

公開先の準備では、以下の設定を確認します。本人限定での公開と、ゲストへの公開範囲の変更は区別してください。

1. 対象ホスティング環境で非公開D1データベースとR2バケットを作成し、`.openai/hosting.json` の `DB` / `PHOTOS` バインディングを実リソースへ接続します。
2. `drizzle/0001_shared_photo_gallery.sql` を本番D1へ適用します。ローカルでは初回アクセス時にも同一スキーマを安全に作成します。
3. Cloudflare Images Binding `IMAGES` が利用できる環境では `PHOTO_VARIANT_MODE=transform`、利用できないSites環境では `PHOTO_VARIANT_MODE=original` を設定します。`original`ではサムネイル・表示画像も原本相当となるため、ファイル上限とEXIFの扱いに注意してください。
4. `PHOTO_ACCESS_CODE`、別の十分長い `PHOTO_ADMIN_CODE`、32文字以上の `PHOTO_SESSION_SECRET` をホスティング側のsecret bindingとして登録します。共有コードを含む実値はGitへ入れません。production buildではローカル `.env` をinline `vars` へ展開しません。
   Sitesで`original`モードを使う場合は、確認済みの運用値として `PHOTO_MAX_FILE_BYTES=5000000`、`PHOTO_MAX_FILES_PER_BATCH=10`、`PHOTO_MAX_PIXELS=40000000`、`PHOTO_UPLOADS_PER_HOUR=0` を併せて設定します。
5. 独自ドメインとHTTPS、Cookie、CSP、`robots.txt`、実端末からのアクセスを確認します。
6. R2の容量上限・ライフサイクル、D1/R2のバックアップ、復元訓練、監視、保持期間、費用アラートを決めます。
7. D1とR2を定期照合し、不確定commit時に安全側で残した孤立オブジェクトを監査・整理するreconcilerを用意します。
8. 想定人数と回線でアップロード・ZIP負荷を確認し、必要に応じてレート制限とCloudflareのCPU/転送枠を調整します。
9. 4GiB超の一括取得が見込まれる場合はZIP64対応writerまたは分割ダウンロードへ移行します。
10. HEIC、原本EXIF、モデレーション、削除保持期間の本番方針を決定します。

保存層は [worker/photo-storage.ts](worker/photo-storage.ts) へ分離されています。S3互換、Cloudflare R2、Supabase Storageなどへ移す場合は、原本・派生画像の保存、取得、削除、ダウンロードストリームの実装を差し替え、APIとUIは維持できます。

## API概要

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/photos/session` | 認証状態、カテゴリー、制限 |
| `POST` / `DELETE` | `/api/photos/access` | ゲスト認証 / ログアウト |
| `POST` | `/api/photos/admin/access` | 管理者認証 |
| `POST` | `/api/photos/batches` | 最大枚数を固定したアップロードバッチ作成 |
| `GET` / `POST` | `/api/photos` | 一覧 / 画像1枚アップロード |
| `GET` | `/api/photos/:id` | 詳細 |
| `GET` | `/api/photos/:id/thumbnail` | 軽量サムネイル（最適化済みは480px以内・200KB以内のJPEG） |
| `GET` | `/api/photos/:id/view` | 拡大表示画像（最適化済みは1600px以内・900KB以内のJPEG） |
| `GET` | `/api/photos/:id/download` | 原本ダウンロード |
| `GET` | `/api/photos/:id/original` | スマホの保存・共有用の原本表示（認証必須、inline） |
| `POST` | `/api/photos/download` | 選択写真を検証し、10分有効・1回限りの短期URLを発行 |
| `GET` | `/api/photos/download/:jobId` | jobに固定したZIPをストリーミング取得 |
| `POST` | `/api/photos/download-all` | 全表示写真を検証し、同じ短期URLを発行 |
| `GET` | `/api/admin/photos` | 非表示を含む管理一覧 |
| `PUT` | `/api/admin/photos/:id/variants` | 管理者認証・CSRF・原本hashを照合し、表示用JPEGだけを追加・更新 |
| `PATCH` / `DELETE` | `/api/admin/photos/:id` | 公開状態変更 / 完全削除 |

## 写真の閲覧とファイル保存

すべての端末で「ファイルに保存」から認証付きの原本ダウンロードを利用します。保存先は端末のファイル／ダウンロードです。写真ライブラリへの直接保存やWeb Share APIは使わず、長押しの操作手順も表示しません。原本と撮影日情報は保持します。

写真をタップすると拡大表示します。選択・全件のZIP保存は「まとめて保存」に収め、日英切替、投稿進捗、失敗時の再送を維持します。投稿中の個別保存は別タブを使い、認証切れの応答でも投稿中のページに影響させません。

既存の `/photos/save/:id` URLは、写真の表示・ファイル保存・一覧に戻る操作だけの短い画面として維持します。詳細・画像・ダウンロードは既存の認証と非表示制御を通ります。

写真専用ドメイン `photos.masato-haruka-wedding.com` をSitesに登録済みです。DNS検証・HTTPSが有効になるまでは現在の公開URLを使用します。新ドメインの `/` は `/photos` へ移動し、既存の招待状ドメインは維持します。
