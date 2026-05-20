import SwiftUI
import UniformTypeIdentifiers

struct SendTransferView: View {
    @StateObject private var viewModel = SendViewModel()
    @State private var isFileImporterPresented = false

    private let intervalOptions = [300, 500, 1000]

    private var qrImage: PlatformImage? {
        guard let payload = viewModel.currentPayload() else {
            return nil
        }
        return QRCodeRenderer.makeImage(from: payload)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("PC → スマホ QR転送")
                    .font(.largeTitle.bold())

                inputPanel
                qrPanel
            }
            .padding(20)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(AppColors.pageBackground)
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case let .success(urls):
                guard let url = urls.first else {
                    return
                }

                Task {
                    await viewModel.loadFile(url: url)
                }
            case let .failure(error):
                viewModel.errorMessage = error.localizedDescription
            }
        }
    }

    private var inputPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("テキスト入力")
                .font(.headline)

            TextEditor(text: Binding(
                get: { viewModel.text },
                set: { viewModel.handleTextChanged($0) }
            ))
            .font(.system(.body, design: .monospaced))
            .frame(minHeight: 190)
            .padding(6)
            .background(Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

            if let imageData = viewModel.previewImageData,
               let image = PlatformImage(data: imageData) {
                PlatformImageView(image: image)
                    .scaledToFit()
                    .frame(maxHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("ファイル選択（UTF-8テキスト / JPEG / PDF）")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    Button("ファイル選択") {
                        isFileImporterPresented = true
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.isReadingFile)

                    Text(viewModel.isReadingFile ? "読み込み中..." : "txt / md / json / jpeg / pdf")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let loadedFileName = viewModel.loadedFileName {
                    Text("読み込み済み: \(loadedFileName) (\(ByteFormatter.kilobytesString(viewModel.loadedFileBytes)))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Button("QR生成") {
                viewModel.handleGenerate()
            }
            .buttonStyle(.borderedProminent)

            if let warning = viewModel.warningMessage {
                Text(warning)
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))
    }

    private var qrPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let qrImage {
                PlatformImageView(image: qrImage)
                    .scaledToFit()
                    .frame(maxWidth: .infinity, minHeight: 320, maxHeight: 420)
                    .padding(12)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                    )
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.gray.opacity(0.08))
                    .frame(height: 360)
                    .overlay(
                        Text("QRを生成するとここに表示されます。")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    )
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("表示制御")
                    .font(.headline)

                HStack(spacing: 8) {
                    ForEach(intervalOptions, id: \.self) { option in
                        if viewModel.intervalMs == option {
                            Button("\(option)ms") {
                                viewModel.intervalMs = option
                            }
                            .buttonStyle(.borderedProminent)
                        } else {
                            Button("\(option)ms") {
                                viewModel.intervalMs = option
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }

                HStack(spacing: 8) {
                    Button("開始") {
                        viewModel.startPlayback()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!viewModel.hasPayloads)

                    Button("停止") {
                        viewModel.stopPlayback()
                    }
                    .buttonStyle(.bordered)
                    .disabled(!viewModel.hasPayloads)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("指定chunk再表示")
                        .font(.subheadline.weight(.semibold))

                    TextField("例: 0, 2, 5-7", text: $viewModel.chunkSelectionInput)
                        .textFieldStyle(.roundedBorder)
                        .disabled(!viewModel.hasPayloads)

                    HStack(spacing: 8) {
                        Button("指定のみ表示") {
                            viewModel.handleApplyChunkSelection()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!viewModel.hasPayloads)

                        Button("全chunk表示") {
                            viewModel.handleClearChunkSelection()
                        }
                        .buttonStyle(.bordered)
                        .disabled(!viewModel.hasPayloads)
                    }

                    if let chunkSelectionError = viewModel.chunkSelectionError {
                        Text(chunkSelectionError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    if let selected = viewModel.selectedChunkIndices {
                        Text("指定中: \(selected.map(String.init).joined(separator: ", "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("種別: \(viewModel.sourceType.displayName)")
                    Text("現在index: \(viewModel.currentIndexLabel())")
                    Text("表示対象: \(viewModel.playbackChunkCountText)")
                    Text("元データ: \(ByteFormatter.kilobytesString(viewModel.originalBytes))")
                    Text("圧縮後: \(ByteFormatter.kilobytesString(viewModel.compressedBytes))")
                    Text("QR数: \(viewModel.payloads.count)")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))
    }
}
