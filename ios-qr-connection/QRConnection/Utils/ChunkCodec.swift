import Foundation

enum ChunkCodecError: LocalizedError {
    case invalidChunkSize
    case invalidTotal
    case missingChunk(Int)

    var errorDescription: String? {
        switch self {
        case .invalidChunkSize:
            return "chunkSize must be greater than 0."
        case .invalidTotal:
            return "total must be greater than 0."
        case let .missingChunk(index):
            return "Missing chunk at index \(index)."
        }
    }
}

enum ChunkCodec {
    static func splitString(_ input: String, chunkSize: Int) throws -> [String] {
        guard chunkSize > 0 else {
            throw ChunkCodecError.invalidChunkSize
        }

        var chunks: [String] = []
        var startIndex = input.startIndex

        while startIndex < input.endIndex {
            let endIndex = input.index(startIndex, offsetBy: chunkSize, limitedBy: input.endIndex) ?? input.endIndex
            chunks.append(String(input[startIndex..<endIndex]))
            startIndex = endIndex
        }

        return chunks
    }

    static func joinChunks(_ chunks: [Int: String], total: Int) throws -> String {
        guard total > 0 else {
            throw ChunkCodecError.invalidTotal
        }

        var merged = ""
        for index in 0..<total {
            guard let value = chunks[index] else {
                throw ChunkCodecError.missingChunk(index)
            }
            merged += value
        }

        return merged
    }
}
