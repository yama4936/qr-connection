import SwiftUI
import UniformTypeIdentifiers

struct ResultPanel: View {
    let result: String
    let payloadType: PayloadType?
    let copied: Bool
    let errorMessage: String?
    let onCopy: () -> Void

    @Environment(\.openURL) private var openURL

    @State private var exportDocument = BinaryTransferDocument(data: Data())
    @State private var exportType: UTType = .data
    @State private var exportFilename = "received"
    @State private var isExporting = false

    private var isJpegData: Bool {
        payloadType == .jpeg && result.hasPrefix("data:image/jpeg;base64,")
    }

    private var isPdfData: Bool {
        payloadType == .pdf && result.hasPrefix("data:application/pdf;base64,")
    }

    private var decodedResultData: Data? {
        DataURLCodec.decode(result)
    }

    private var resultImage: PlatformImage? {
        guard isJpegData, let data = decodedResultData else {
            return nil
        }

        return PlatformImage(data: data)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("復元結果")
                .font(.headline)

            if isJpegData, let image = resultImage {
                PlatformImageView(image: image)
                    .scaledToFit()
                    .frame(maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )

                Button("JPEGを保存") {
                    startExport(data: decodedResultData, type: .jpeg, fileName: "received")
                }
                .buttonStyle(.bordered)
            } else if isPdfData {
                HStack(spacing: 8) {
                    Button("PDFを開く") {
                        openPDFPreview()
                    }
                    .buttonStyle(.bordered)

                    Button("PDFを保存") {
                        startExport(data: decodedResultData, type: .pdf, fileName: "received")
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                TextEditor(text: .constant(result))
                    .frame(minHeight: 160)
                    .font(.system(.body, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button(copied ? "コピー済み" : "コピー") {
                onCopy()
            }
            .buttonStyle(.borderedProminent)
            .disabled(result.isEmpty)
        }
        .padding()
        .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: exportType,
            defaultFilename: exportFilename
        ) { _ in
            // no-op
        }
    }

    private func startExport(data: Data?, type: UTType, fileName: String) {
        guard let data else {
            return
        }

        exportDocument = BinaryTransferDocument(data: data)
        exportType = type
        exportFilename = fileName
        isExporting = true
    }

    private func openPDFPreview() {
        guard let data = decodedResultData else {
            return
        }

        do {
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("received-\(UUID().uuidString).pdf")
            try data.write(to: tempURL, options: .atomic)
            openURL(tempURL)
        } catch {
            // Keep UI simple for MVP.
        }
    }
}
