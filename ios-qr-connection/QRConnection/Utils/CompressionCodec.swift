import Foundation
import zlib

enum CompressionCodecError: LocalizedError {
    case processingFailed
    case invalidUTF8

    var errorDescription: String? {
        switch self {
        case .processingFailed:
            return "Compression stream processing failed."
        case .invalidUTF8:
            return "Inflated bytes are not valid UTF-8 text."
        }
    }
}

enum CompressionCodec {
    private static let bufferSize = 64 * 1024
    private static let zlibWindowBits = Int32(MAX_WBITS)
    private static let rawWindowBits = -Int32(MAX_WBITS)

    static func compressText(_ text: String) throws -> Data {
        try deflateData(Data(text.utf8))
    }

    static func decompressText(_ data: Data) throws -> String {
        let inflated: Data
        do {
            // Web sender uses zlib-wrapped deflate (pako.deflate), so decode that first.
            inflated = try inflateData(data, windowBits: zlibWindowBits)
        } catch {
            // Backward compatibility for older iOS builds that emitted raw deflate.
            inflated = try inflateData(data, windowBits: rawWindowBits)
        }

        guard let text = String(data: inflated, encoding: .utf8) else {
            throw CompressionCodecError.invalidUTF8
        }

        return text
    }

    private static func deflateData(_ data: Data) throws -> Data {
        var stream = z_stream()
        stream.zalloc = nil
        stream.zfree = nil
        stream.opaque = nil

        guard deflateInit_(
            &stream,
            Z_DEFAULT_COMPRESSION,
            ZLIB_VERSION,
            Int32(MemoryLayout<z_stream>.size)
        ) == Z_OK else {
            throw CompressionCodecError.processingFailed
        }
        defer {
            deflateEnd(&stream)
        }

        let inputBytes = [UInt8](data)
        var output = Data()
        var outputBuffer = [UInt8](repeating: 0, count: bufferSize)

        return try inputBytes.withUnsafeBufferPointer { inputBuffer in
            stream.next_in = UnsafeMutablePointer<Bytef>(
                mutating: inputBuffer.baseAddress
            )
            stream.avail_in = uInt(inputBuffer.count)

            while true {
                let status: Int32
                let produced: Int
                (status, produced) = outputBuffer.withUnsafeMutableBufferPointer { buffer in
                    stream.next_out = buffer.baseAddress
                    stream.avail_out = uInt(buffer.count)
                    let status = zlib.deflate(&stream, Z_FINISH)
                    let produced = buffer.count - Int(stream.avail_out)
                    return (status, produced)
                }

                if produced > 0 {
                    output.append(outputBuffer, count: produced)
                }

                if status == Z_STREAM_END {
                    return output
                }

                if status != Z_OK {
                    throw CompressionCodecError.processingFailed
                }
            }
        }
    }

    private static func inflateData(_ data: Data, windowBits: Int32) throws -> Data {
        var stream = z_stream()
        stream.zalloc = nil
        stream.zfree = nil
        stream.opaque = nil

        guard inflateInit2_(
            &stream,
            windowBits,
            ZLIB_VERSION,
            Int32(MemoryLayout<z_stream>.size)
        ) == Z_OK else {
            throw CompressionCodecError.processingFailed
        }
        defer {
            inflateEnd(&stream)
        }

        let inputBytes = [UInt8](data)
        var output = Data()
        var outputBuffer = [UInt8](repeating: 0, count: bufferSize)

        return try inputBytes.withUnsafeBufferPointer { inputBuffer in
            stream.next_in = UnsafeMutablePointer<Bytef>(
                mutating: inputBuffer.baseAddress
            )
            stream.avail_in = uInt(inputBuffer.count)

            while true {
                let status: Int32
                let produced: Int
                (status, produced) = outputBuffer.withUnsafeMutableBufferPointer { buffer in
                    stream.next_out = buffer.baseAddress
                    stream.avail_out = uInt(buffer.count)
                    let status = zlib.inflate(&stream, Z_NO_FLUSH)
                    let produced = buffer.count - Int(stream.avail_out)
                    return (status, produced)
                }

                if produced > 0 {
                    output.append(outputBuffer, count: produced)
                }

                if status == Z_STREAM_END {
                    return output
                }

                if status != Z_OK {
                    throw CompressionCodecError.processingFailed
                }
            }
        }
    }
}
