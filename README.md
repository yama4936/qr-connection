# qr-connection

QRコードを使って、デバイス間でテキスト・JPEG・PDFを転送するプロジェクトです。  
現在は以下の2実装を同じリポジトリで管理しています。

- `web-qr-connection`: Next.js (Web)
- `ios-qr-connection`: SwiftUI (iOS / macOS)

## ディレクトリ構成

```text
qr-connection/
├─ web-qr-connection/   # Next.js app
├─ ios-qr-connection/   # Xcode project / SwiftUI app
├─ AGENTS.md
└─ README.md
```

## Web版（Next.js）

### 前提

- Node.js 20+ 推奨
- npm

### セットアップ

```bash
cd web-qr-connection
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

- ブラウザで `http://localhost:3000` を開く
- 送信画面: `/send`
- 受信画面: `/receive`

### 利用できるデータ

- テキスト（UTF-8）
- JPEG（Data URL化して転送）
- PDF（Data URL化して転送）

### 転送モード

- `Legacy v1`: chunk分割ベース
- `Erasure v2`: Reed-Solomon方式の冗長化付き（欠損耐性あり）

### サイズ制限（実装値）

- テキスト等: 最大 `300KB`
- JPEG: 最大 `2MB`
- PDF: 最大 `2MB`
- 推奨サイズ目安: `100KB` 以下

## iOS / macOS版（SwiftUI）

`ios-qr-connection/` にXcodeプロジェクトがあります。

### 開き方

- `ios-qr-connection/QRConnection.xcodeproj` をXcodeで開く

### ターゲット

- `QRConnection-iOS`（iOS 17.0+）
- `QRConnection-macOS`（macOS 14.0+）

### 補足

- `project.yml`（XcodeGen設定）も同梱しています。

## iPhoneでWebカメラを使う場合の注意

iPhone SafariでQRスキャンを使う場合は、通常 `https` が必要です。  
ローカル開発URL（`http://192.168.x.x:3000` など）ではカメラ許可に失敗することがあります。

例（トンネル利用）:

```bash
cd web-qr-connection
npm run dev
npx ngrok http 3000
```

発行された `https` URL をSafariで直接開いてください。

## よく使うコマンド（Web）

```bash
cd web-qr-connection
npm run dev
npm run lint
npm run build
npm run start
```

