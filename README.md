# Instant AR Two-Shot

Instant AR Two-Shot は、Cloudflare Pages に静的デプロイできる WebXR ベースのモバイル AR アプリです。ページを開くとカメラが起動し、床を検出して用意した 3D モデルを自動で設置し続けます。端末を動かしてツーショットを撮影してください。必要最小限の実装にまとめています。

## 特徴
- **即時カメラ起動**: ページ読み込み直後に `immersive-ar` セッションを開始し、許可がブロックされた場合だけ再開ボタンを提示します。
- **床ヒットテストとアンカー固定**: WebXR Hit Test + Anchors を利用し、最初に検出した床面にモデルを固定したまま表示し続けます。
- **Three.js による軽量表示**: GLB を読み込み、環境光とリテイクルを最小 UI で構成。
- **Safari フォールバック**: もし Safari で WebXR が使えない場合は Quick Look (USDZ) をワンタップで起動できます。
- **Cloudflare Pages 対応**: `public/` 配下に静的アセットを配置するだけでデプロイできます。

## 対応ブラウザ
- Android Chrome 121 以降 (WebXR AR 完全対応。非対応端末は「Scene Viewerで開く」でGoogle Scene Viewerに遷移)
- iOS 17 以降の Safari (WebXR AR 対応)。iOS Chrome / Firefox / Edge は Quick Look フォールバックのみで、ボタンを押すと Safari で開き直す案内を表示します。
- その他ブラウザでは利用できません。

> **Note:** 多くのブラウザではユーザー操作なしのカメラ起動が制限されています。自動開始がブロックされた場合、画面下部に「ARを再開」ボタンが表示されるのでタップしてください。

## セットアップ
1. 3D アセットを `public/assets/` に配置します。
   - WebXR 用 GLB: `model.glb`
   - iOS Quick Look 用 USDZ (任意): `model.usdz`
2. 必要に応じて `public/style.css` で UI の色味を調整します。
3. モデルサイズが大きい場合は Three.js 側でスケール調整してください (`public/app.js` 内の `modelRoot` 読み込み後に設定できます)。

## ローカル確認
WebXR の AR セッションは `https://` もしくは `http://localhost` でのみ動作します。

```bash
# localhost は HTTP でも安全扱いされます
cd public
python -m http.server 8080 --bind 0.0.0.0
# ブラウザで http://localhost:8080 へアクセス
```

```bash
# HTTPS 対応の静的サーバ例 (mkcert + http-server)
cd public
npx http-server --ssl --cert ../localhost+1.pem --key ../localhost+1-key.pem
# ブラウザで https://localhost:8080 にアクセス
# wordnet: 192.168.10.17
# coins wireless: 130.158.222.226
# 家: 192.168.0.108
```

簡易確認だけなら Chrome DevTools の「センサー > エミュレーション」で WebXR AR をエミュレートできますが、実動作は実機で確認してください。

## Cloudflare Pages へデプロイ
```bash
npm install
npm run build
wrangler pages deploy dist
```
ダッシュボードから作成する場合もビルドコマンドを `npm run build`、出力ディレクトリを `dist` に設定してください。

## 撮影について
- WebXR セッション中のスクリーンキャプチャは端末の標準スクリーンショット機能を利用してください。
- Safari で Quick Look (USDZ) を開いた後は、右上のキューブ状アイコンをタップすると AR 表示に切り替わります。AR 表示時は画面下のシャッターボタンで背景付き写真を撮影できます。

## 技術スタック
- [Three.js](https://threejs.org/) (CDN @ `0.160.0`)
- WebXR Device API (Hit Test / Anchors / DOM Overlay)
- 静的ホスティング: Cloudflare Pages
