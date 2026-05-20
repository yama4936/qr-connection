## QR Transfer App

PCで生成した複数QRをスマホで読み取り、データを復元するWebアプリです。

## Getting Started

開発サーバーを起動:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## iPhoneでカメラが起動しないとき

- `http://192.168.x.x:3000` のようなURLは `insecure context` になるため、iPhoneでカメラは起動しません。
- iPhone側は **HTTPSのURL** で開いてください。
- アプリ内ブラウザ（LINE/Slack/X内ブラウザ等）ではなく、Safariで直接開いてください。

HTTPS URLを手早く用意する例:

```bash
# 開発サーバー起動
npm run dev

# 別ターミナルでトンネル作成（https URLが発行される）
npx ngrok http 3000
```

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- qrcode
- html5-qrcode
- pako
