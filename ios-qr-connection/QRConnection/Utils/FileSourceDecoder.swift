import Foundation
import UniformTypeIdentifiers

struct FileLoadResult {
    let payloadType: PayloadType
    let sourceData: String
    let displayText: String
    let fileName: String
    let fileBytes: Int
}

enum FileSourceDecoderError: LocalizedError {
    case readFailed
    case unsupportedFormat
    case invalidUTF8

    var errorDescription: String? {
        switch self {
        case .readFailed:
            return "ファイルの読み込みに失敗しました。"
        case .unsupportedFormat:
            return "このファイル形式は未対応です。UTF-8テキスト、JPEG、PDFを選択してください。"
        case .invalidUTF8:
            return "UTF-8テキストとして読み取れませんでした。"
        }
    }
}

enum FileSourceDecoder {
    static func decodeFile(at url: URL) throws -> FileLoadResult {
        let didAccessScopedResource = url.startAccessingSecurityScopedResource()
        defer {
            if didAccessScopedResource {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let data: Data
        do {
            data = try Data(contentsOf: url, options: [.mappedIfSafe])
        } catch {
            throw FileSourceDecoderError.readFailed
        }

        let fileName = url.lastPathComponent
        let bytes = [UInt8](data)

        if isJpegFile(url: url, bytes: bytes) {
            return FileLoadResult(
                payloadType: .jpeg,
                sourceData: DataURLCodec.encode(mimeType: "image/jpeg", data: data),
                displayText: "[JPEG] \(fileName)",
                fileName: fileName,
                fileBytes: data.count
            )
        }

        if isPdfFile(url: url, bytes: bytes) {
            return FileLoadResult(
                payloadType: .pdf,
                sourceData: DataURLCodec.encode(mimeType: "application/pdf", data: data),
                displayText: "[PDF] \(fileName)",
                fileName: fileName,
                fileBytes: data.count
            )
        }

        if isProbablyBinary(bytes) {
            throw FileSourceDecoderError.unsupportedFormat
        }

        guard let decoded = String(data: data, encoding: .utf8) else {
            throw FileSourceDecoderError.invalidUTF8
        }

        return FileLoadResult(
            payloadType: .text,
            sourceData: decoded,
            displayText: decoded,
            fileName: fileName,
            fileBytes: data.count
        )
    }

    private static func isJpegFile(url: URL, bytes: [UInt8]) -> Bool {
        if url.pathExtension.lowercased() == "jpg" || url.pathExtension.lowercased() == "jpeg" {
            return true
        }

        if let type = UTType(filenameExtension: url.pathExtension), type.conforms(to: .jpeg) {
            return true
        }

        return bytes.count >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
    }

    private static func isPdfFile(url: URL, bytes: [UInt8]) -> Bool {
        if url.pathExtension.lowercased() == "pdf" {
            return true
        }

        if let type = UTType(filenameExtension: url.pathExtension), type.conforms(to: .pdf) {
            return true
        }

        let pdfHeader = [UInt8]("%PDF".utf8)
        return bytes.starts(with: pdfHeader)
    }

    private static func isProbablyBinary(_ bytes: [UInt8]) -> Bool {
        guard !bytes.isEmpty else {
            return false
        }

        let sampleSize = min(bytes.count, 4096)
        let sample = bytes.prefix(sampleSize)
        let suspicious = sample.reduce(into: 0) { count, byte in
            let isControl = byte == 0 || (byte < 7 || (byte > 14 && byte < 32) || byte == 127)
            if isControl {
                count += 1
            }
        }

        return Double(suspicious) / Double(sample.count) > 0.3
    }
}
