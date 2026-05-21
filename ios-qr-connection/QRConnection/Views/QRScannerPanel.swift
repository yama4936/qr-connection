import SwiftUI

struct QRScannerPanel: View {
    let onScan: (String) -> Void
    let onError: (String) -> Void
    var showDebug = true

    @StateObject private var scannerManager = QRScannerManager()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("QR読み取り")
                .font(.headline)

            CameraPreview(session: scannerManager.session)
                .frame(minHeight: 260)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )

            HStack(spacing: 8) {
                Button(scannerManager.isStarting ? "起動中..." : "カメラ開始") {
                    scannerManager.start()
                }
                .buttonStyle(.borderedProminent)
                .disabled(scannerManager.isStarting || scannerManager.isScanning)

                Button("停止") {
                    scannerManager.stop()
                }
                .buttonStyle(.bordered)
                .disabled(!scannerManager.isScanning)
            }

            if showDebug {
                DisclosureGroup("診断情報") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("decoded: \(scannerManager.debugStats.decodedCount)")
                        Text("frame errors: \(scannerManager.debugStats.frameErrorCount)")
                        Text("last frame error: \(scannerManager.debugStats.lastFrameError.isEmpty ? "-" : scannerManager.debugStats.lastFrameError)")
                            .lineLimit(2)
                            .truncationMode(.middle)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            }

            if let localError = scannerManager.localError {
                Text(localError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))
        .onAppear {
            scannerManager.onScan = onScan
            scannerManager.onError = onError
        }
        .onDisappear {
            scannerManager.stop()
        }
    }
}
