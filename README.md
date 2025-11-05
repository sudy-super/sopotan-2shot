# SopoShot

## 動作テスト
```bash
cd public
python -m http.server 8080 --bind 0.0.0.0
```
HTTPSが必要な場合は同梱の自己署名証明書を発行したうえで
```bash
cd public
npx http-server --ssl --cert ../localhost+1.pem --key ../localhost+1-key.pem
# ブラウザ: https://localhost:8080
```
