# QR 転送アプリの代替方式調査

調査日: 2026-05-20

## 目的

このアプリは、PC 側の `/send` でテキストまたは JPEG を圧縮・分割し、複数 QR として画面表示し、スマホ側の `/receive` がカメラで読み取って復元する、サーバー保存なし・ブラウザ完結型の QR 転送アプリである。

目的は、ネットワーク通信やサーバー保存を使わず、PC 画面をスマホカメラで読み取るだけでファイルやテキストを受け渡すことである。現在は QR を使っているが、より高速・安定・大容量な方式がないかを調査した。

## 結論

短期的には、QR を完全に捨てるよりも、現行 QR プロトコルを改善するのが最も現実的である。中期的には、画面全体を通信路として使う独自のカラータイル方式を PoC する価値が高い。

標準 2D コードへの単純な置き換えだけでは、QR より劇的には良くならない。Aztec、Data Matrix、PDF417 はブラウザ実装しやすい一方、最大容量や画面カメラ転送での実効速度は QR を大きく上回りにくい。

最も伸びしろがあるのは、QR のような汎用デコーダではなく、ファイル転送専用に設計した Screen-Camera Communication 方式である。ただし、色判定、台形補正、フレーム同期、誤り訂正を自前で実装する必要がある。

## 現行方式の評価

現行方式の良い点:

- バックエンド不要で、データがサーバーに残らない。
- payload に `version`、`sessionId`、`index`、`total`、`checksum` があり、復元の基本構造が明確。
- HTTPS や iPhone のカメラ制約への注意が README と UI に入っている。
- MVP として送信、受信、chunk 収集、SHA-256 検証の骨格ができている。

現行方式の制約:

- base64 化により、元データより文字数が増える。
- 450 文字単位の固定 chunk は安全寄りだが、QR 1 枚あたりの実効容量を十分に使い切れていない可能性がある。
- 連番 chunk 方式のため、途中の QR を読み逃すと復元が止まりやすい。
- JPEG はすでに圧縮済みなので、deflate の効果が小さいことが多い。
- スキャン速度は QR デコーダ、カメラ FPS、画面更新、ユーザーの手ブレに強く依存する。

## 候補方式の比較

| 方式 | 実装難度 | 期待容量・速度 | 安定性 | 採用優先度 | コメント |
| --- | --- | --- | --- | --- | --- |
| 現行 QR 改良 | 低 | 中 | 高 | 高 | 最短で改善できる。エンコード方式と欠落耐性を改善する。 |
| 複数 QR 同時表示 | 中 | 中から高 | 中 | 高 | 1 画面に複数 QR を並べ、同時検出できれば単純に並列化できる。 |
| Aztec Code | 中 | 中 | 中 | 中 | quiet zone 不要で画面表示と相性は悪くないが、容量面で QR を大きく超えない。 |
| Data Matrix | 中 | 低から中 | 中 | 低 | 小面積用途には強いが、大容量ファイル転送の主役にはしにくい。 |
| PDF417 | 中 | 低から中 | 中 | 低 | 横長で ID カード用途に強いが、スマホ画面での高速転送には向きにくい。 |
| JAB Code | 高 | 高 | 未検証 | 中 | カラー 2D コード。高密度化できるが、ブラウザでの安定運用は要検証。 |
| 独自カラータイル方式 | 高 | 高 | PoC 次第 | 高 | ファイル転送専用なら本命。画面全体を通信路にできる。 |
| 不可視・半不可視 SCC | 非常に高 | 中から高 | 研究段階 | 低 | UX は良いが、ML デコーダや細かいカメラ制御が必要になりやすい。 |

## 推奨ロードマップ

### 1. 現行 QR 方式を改善する

最初にやるべき改善は、既存の構造を保ったまま転送効率と欠落耐性を上げることである。

- base64 の代わりに Base45 などを検討し、QR の alphanumeric mode を活用する。
- 1 chunk の文字数を固定 450 から、QR バージョンと誤り訂正レベルに応じた動的値へ変更する。
- QR の error correction level を用途別に選べるようにする。
- 連番 chunk だけでなく、fountain code や erasure code を導入し、読み逃しに強くする。
- JPEG は deflate 前提ではなく、必要に応じてリサイズ、品質調整、WebP 変換なども検討する。

### 2. 複数 QR 同時表示を試す

1 枚の QR を高速に切り替える方式に加えて、1 画面に複数 QR を並べる方式を試す。スマホ側で複数コードを同時検出できる場合、実効スループットを上げられる。

検証ポイント:

- `html5-qrcode` または `zxing-wasm` で複数 QR を安定検出できるか。
- スマホ画面上で QR が小さくなりすぎないか。
- 角度、距離、手ブレで検出率がどの程度落ちるか。

### 3. 標準 2D コードを比較 PoC する

Aztec、Data Matrix、PDF417 は標準規格であり、`BarcodeDetector`、ZXing 系ライブラリ、`zxing-wasm` で扱える可能性がある。

ただし、最大容量だけを見ると QR を大きく超える候補ではない。目的は本採用ではなく、実機での読み取り速度、画面表示との相性、ブラウザ実装の安定性を比較することである。

### 4. 独自カラータイル方式を PoC する

中期的な本命は、QR ではなく画面全体を通信路にする方式である。

想定設計:

- PC 側は Canvas にカラーグリッドを連続表示する。
- スマホ側はカメラ映像から四隅マーカーを検出する。
- 台形補正後、各セルの色を読み取る。
- 各フレームに `sessionId`、`frameId`、payload、CRC、FEC parity を含める。
- RGB ではなく HSV、YCbCr、OKLAB など、明るさ変動に強い色空間で分類する。
- 最初は 4 色、安定したら 8 色へ増やす。
- confidence が低いセルやフレームは捨て、FEC で復元する。

この方式は汎用 QR リーダーでは読めないが、ファイル転送専用であれば QR より高い実効速度を狙える。

## 技術的な注意点

### 色は思ったより不安定

画面表示された RGB 値は、スマホカメラでは同じ RGB として取れない。原因は、画面の輝度、色温度、環境光、カメラの自動露出、ホワイトバランス、手ブレ、ピント、モニタの個体差である。

カラー方式を採用する場合は、送信開始時にキャリブレーションフレームを表示し、受信側がその端末・環境での色クラスタを学習する構成が必要になる。

### フレーム同期が難しい

画面のリフレッシュレートとカメラ FPS は同期していない。高速にフレームを切り替えるほど、カメラには前後フレームが混ざって見えることがある。

対策:

- フレーム ID を必ず入れる。
- 同じフレームを複数回表示する。
- 開始・同期用のパターンを入れる。
- 欠落・重複を前提にした復元方式にする。

### 順番依存を減らす

ファイル転送では、すべての chunk を順番通り読む必要がある方式は体験が悪い。QR 改良でもカラータイル方式でも、最終的には fountain code や Reed-Solomon などで「必要数集まれば復元できる」方式に寄せるのが望ましい。

## 関連研究・参考資料

### 標準 2D コード

- [QR Code version and capacity - DENSO WAVE](https://www.qrcode.com/en/about/version.html/versionPage/index.html)
- [ISO/IEC 23634:2022 - JAB Code](https://www.iso.org/standard/76478.html)
- [jabcode/jabcode - GitHub](https://github.com/jabcode/jabcode)
- [ISO/IEC 24778:2024 - Aztec Code](https://standards.iteh.ai/catalog/standards/iso/fde3ddcd-a78a-4f3e-aab5-3278eed2c281/iso-iec-24778-2024)
- [ISO/IEC 16022:2024 - Data Matrix](https://www.iso.org/standard/80926.html)

### ブラウザ実装・ライブラリ

- [MDN Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)
- [zxing-wasm](https://zxing-wasm.deno.dev/)
- [html5-qrcode supported code formats](https://scanapp.org/html5-qrcode-docs/docs/supported_code_formats)

### Screen-Camera Communication / Optical Camera Communication

- [Display Field Communication: Enabling Seamless Data Exchange in Screen-Camera Environments, 2024](https://www.mdpi.com/2304-6732/11/11/1000)
- [Performance Analysis of a Color-Code-Based Optical Camera Communication System, 2024](https://www.mdpi.com/2076-3417/14/19/9102)
- [Revelio: A Real-World Screen-Camera Communication System with Visually Imperceptible Data Embedding, 2025](https://arxiv.org/abs/2501.02349)
- [A Novel Frame Identification and Synchronization Technique for Smartphone Visible Light Communication Systems Based on CNN, 2025](https://arxiv.org/abs/2506.23004)
- [Channel characterization in screen-to-camera based optical camera communication, 2025](https://arxiv.org/abs/2506.23005)
- [Passive Screen-to-Camera Communication, 2024](https://arxiv.org/abs/2403.16185)
- [DeepLight: Robust and Unobtrusive Real-time Screen-Camera Communication, 2021](https://arxiv.org/abs/2105.05092)
- [ChromaCode: A Fully Imperceptible Screen-Camera Communication System, 2018](https://www.cs.purdue.edu/homes/chunyi/pubs/mobicom18-zhang.pdf)
- [PixNet: Interference-Free Wireless Links Using LCD-Camera Pairs, 2010](https://people.csail.mit.edu/nabeel/pixnet-mobicom10.pdf)
- [COBRA: Color Barcode Streaming for Smartphone Systems, 2012](https://www.yumpu.com/en/document/view/4350371/cobra-color-barcode-streaming-for-smartphone-systems)

## 最終判断

このアプリの次の一手としては、次の順番が妥当である。

1. 現行 QR 方式の chunk サイズ、エンコード方式、欠落耐性を改善する。
2. 複数 QR 同時表示を試す。
3. `zxing-wasm` で Aztec、Data Matrix、PDF417 の比較 PoC を作る。
4. 別ブランチまたは実験ページで、Canvas ベースのカラータイル転送を PoC する。

最終的に大容量・高速化を本気で狙うなら、標準 2D コードではなく、ファイル転送専用の Screen-Camera Communication プロトコルを設計する方がよい。
