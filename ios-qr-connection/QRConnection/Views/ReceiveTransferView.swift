import SwiftUI

struct ReceiveTransferView: View {
    @StateObject private var viewModel = ReceiveViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("スマホでQRを読み取り")
                    .font(.largeTitle.bold())

                QRScannerPanel(
                    onScan: { decodedText in
                        viewModel.handleScan(decodedText)
                    },
                    onError: { message in
                        viewModel.errorMessage = message
                    }
                )

                VStack(alignment: .leading, spacing: 12) {
                    TransferProgressView(
                        label: "読み取り状況",
                        current: viewModel.receivedCount,
                        total: viewModel.progressTotal,
                        indices: viewModel.receivedIndices
                    )

                    if let currentSessionId = viewModel.currentSessionId {
                        Text(
                            "sessionId: \(currentSessionId) / type: \(viewModel.payloadType?.displayName ?? "-") / mode: \(viewModel.payloadVersion == TransferConstants.erasurePayloadVersion ? "erasure" : "legacy") / total: \(viewModel.total)\(viewModel.payloadVersion == TransferConstants.erasurePayloadVersion ? " / groups: \(viewModel.groupCount)" : "")"
                        )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 10))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("読み取り済みindex")
                            .font(.headline)
                        Text(viewModel.receivedIndices.isEmpty ? "-" : viewModel.receivedIndices.map(String.init).joined(separator: ", "))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("未取得chunk index")
                            .font(.headline)
                        Text(viewModel.total <= 0 ? "-" : (viewModel.missingIndices.isEmpty ? "なし" : viewModel.missingIndices.map(String.init).joined(separator: ", ")))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))

                    debugPanel

                    Button("リセット") {
                        viewModel.reset()
                    }
                    .buttonStyle(.bordered)
                }

                ResultPanel(
                    result: viewModel.result,
                    payloadType: viewModel.payloadType,
                    copied: viewModel.copied,
                    errorMessage: viewModel.errorMessage,
                    onCopy: {
                        viewModel.copyResult()
                    }
                )
            }
            .padding(20)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(AppColors.pageBackground)
    }

    private var debugPanel: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("デバッグ")
                .font(.headline)
            Text("parsed ok: \(viewModel.debugStats.parsedOk)")
            Text("json parse error: \(viewModel.debugStats.jsonParseError)")
            Text("shape mismatch: \(viewModel.debugStats.shapeMismatch)")
            Text("invalid total/index: \(viewModel.debugStats.invalidTotal) / \(viewModel.debugStats.invalidIndex)")
            Text("session mismatch: \(viewModel.debugStats.ignoredSessionMismatch)")
            Text("total mismatch: \(viewModel.debugStats.ignoredTotalMismatch)")
            Text("checksum mismatch: \(viewModel.debugStats.ignoredChecksumMismatch)")
            Text("type mismatch: \(viewModel.debugStats.ignoredTypeMismatch)")
            Text("version mismatch: \(viewModel.debugStats.ignoredVersionMismatch)")
            Text("accepted/duplicate/replaced: \(viewModel.debugStats.acceptedChunk) / \(viewModel.debugStats.duplicateChunk) / \(viewModel.debugStats.replacedChunk)")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}
