import Foundation

struct PayloadCreationOutput {
    let payloads: [QRPayload]
    let originalBytes: Int
    let compressedBytes: Int
}

enum QRPayloadCodecError: LocalizedError {
    case inputTooLarge(limit: Int, payloadType: PayloadType)
    case base64DecodeFailed
    case invalidErasureShard
    case missingErasureGroup(Int)
    case missingErasureConfiguration

    var errorDescription: String? {
        switch self {
        case let .inputTooLarge(limit, payloadType):
            return "Input is too large. Limit is \(limit) bytes for \(payloadType.rawValue)."
        case .base64DecodeFailed:
            return "Invalid base64 payload data."
        case .invalidErasureShard:
            return "Invalid erasure shard payload."
        case let .missingErasureGroup(groupIndex):
            return "Not enough shards for group \(groupIndex)."
        case .missingErasureConfiguration:
            return "Missing erasure payload configuration."
        }
    }
}

enum QRPayloadCodec {
    static func createPayloads(
        source: String,
        payloadType: PayloadType = .text,
        originalSizeBytes: Int? = nil
    ) throws -> PayloadCreationOutput {
        let rawSizeBytes = originalSizeBytes ?? Data(source.utf8).count
        let limit = TransferConstants.hardMax(for: payloadType)

        guard rawSizeBytes <= limit else {
            throw QRPayloadCodecError.inputTooLarge(limit: limit, payloadType: payloadType)
        }

        let compressed = try CompressionCodec.compressText(source)
        let base64 = Base64Codec.encode(compressed)
        let chunks = try ChunkCodec.splitString(base64, chunkSize: TransferConstants.chunkSize)
        let nonEmptyChunks = chunks.isEmpty ? [""] : chunks
        let checksum = Checksum.sha256Hex(source)
        let sessionId = UUID().uuidString

        let payloads = nonEmptyChunks.enumerated().map { index, chunk in
            QRPayload(
                version: TransferConstants.payloadVersion,
                sessionId: sessionId,
                index: index,
                total: nonEmptyChunks.count,
                encoding: "base64",
                compression: "deflate",
                payloadType: payloadType,
                data: chunk,
                checksum: checksum
            )
        }

        return PayloadCreationOutput(
            payloads: payloads,
            originalBytes: rawSizeBytes,
            compressedBytes: compressed.count
        )
    }

    static func parsePayloadDetailed(raw: String) -> ParsePayloadResult {
        guard let rawData = raw.data(using: .utf8) else {
            return .failure(.jsonParseError)
        }

        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: rawData)
        } catch {
            return .failure(.jsonParseError)
        }

        guard JSONSerialization.isValidJSONObject(object),
              let normalizedData = try? JSONSerialization.data(withJSONObject: object),
              let payload = try? JSONDecoder().decode(QRPayload.self, from: normalizedData)
        else {
            return .failure(.shapeMismatch)
        }

        guard payload.encoding == "base64", payload.compression == "deflate" else {
            return .failure(.shapeMismatch)
        }

        guard payload.total > 0 else {
            return .failure(.invalidTotal)
        }

        guard payload.index >= 0, payload.index < payload.total else {
            return .failure(.invalidIndex)
        }

        if payload.version == TransferConstants.payloadVersion {
            return .success(payload)
        }

        if payload.version == TransferConstants.erasurePayloadVersion {
            guard payload.scheme == TransferConstants.erasureScheme else {
                return .failure(.shapeMismatch)
            }

            guard let required = payload.required,
                  required > 0,
                  required <= payload.total
            else {
                return .failure(.invalidTotal)
            }

            guard let groupCount = payload.groupCount,
                  let groupIndex = payload.groupIndex,
                  let dataShards = payload.dataShards,
                  let parityShards = payload.parityShards,
                  let totalShards = payload.totalShards,
                  let shardIndex = payload.shardIndex,
                  let shardSize = payload.shardSize,
                  let groupSize = payload.groupSize,
                  let originalSize = payload.originalSize,
                  let compressedSize = payload.compressedSize
            else {
                return .failure(.shapeMismatch)
            }

            if groupCount <= 0 ||
                groupIndex < 0 || groupIndex >= groupCount ||
                dataShards <= 0 ||
                parityShards <= 0 ||
                totalShards != dataShards + parityShards ||
                shardIndex < 0 || shardIndex >= totalShards ||
                shardSize <= 0 ||
                groupSize < 0 || groupSize > dataShards * shardSize ||
                originalSize < 0 ||
                compressedSize < 0 {
                return .failure(.invalidIndex)
            }

            return .success(payload)
        }

        return .failure(.shapeMismatch)
    }

    static func restorePayload(chunks: [Int: String], total: Int) throws -> String {
        let joined = try ChunkCodec.joinChunks(chunks, total: total)
        guard let compressed = Base64Codec.decode(joined) else {
            throw QRPayloadCodecError.base64DecodeFailed
        }

        return try CompressionCodec.decompressText(compressed)
    }

    static func erasureShardKey(_ payload: QRPayload) -> String? {
        guard payload.version == TransferConstants.erasurePayloadVersion,
              let groupIndex = payload.groupIndex,
              let shardIndex = payload.shardIndex
        else {
            return nil
        }

        return "\(groupIndex):\(shardIndex)"
    }

    static func canRestoreErasurePayloads(shards: [String: QRPayload]) -> Bool {
        guard let first = shards.values.first,
              first.version == TransferConstants.erasurePayloadVersion,
              let groupCount = first.groupCount
        else {
            return false
        }

        for groupIndex in 0..<groupCount {
            var received = 0
            var required = 0

            for shard in shards.values where shard.groupIndex == groupIndex {
                received += 1
                required = shard.dataShards ?? 0
            }

            if required == 0 || received < required {
                return false
            }
        }

        return true
    }

    static func restoreErasurePayload(shards: [String: QRPayload]) throws -> String {
        guard let first = shards.values.first,
              let groupCount = first.groupCount,
              let compressedSize = first.compressedSize
        else {
            throw QRPayloadCodecError.missingErasureConfiguration
        }

        var restoredGroups: [Data] = []

        for groupIndex in 0..<groupCount {
            let groupPayloads = shards.values.filter { $0.groupIndex == groupIndex }
            guard let groupHeader = groupPayloads.first,
                  let dataShards = groupHeader.dataShards,
                  let parityShards = groupHeader.parityShards,
                  let shardSize = groupHeader.shardSize,
                  let groupSize = groupHeader.groupSize
            else {
                throw QRPayloadCodecError.missingErasureConfiguration
            }

            if groupPayloads.count < dataShards {
                throw QRPayloadCodecError.missingErasureGroup(groupIndex)
            }

            let erasureShards: [ErasureShard] = try groupPayloads.map { payload in
                guard let shardIndex = payload.shardIndex,
                      let data = Base64Codec.decode(payload.data)
                else {
                    throw QRPayloadCodecError.invalidErasureShard
                }

                return ErasureShard(index: shardIndex, data: data)
            }

            let restoredGroup = try ErasureCodec.decodeErasure(
                shards: erasureShards,
                options: DecodeErasureOptions(
                    dataShards: dataShards,
                    parityShards: parityShards,
                    shardSize: shardSize,
                    originalSize: groupSize
                )
            )

            restoredGroups.append(restoredGroup)
        }

        let compressed = combineData(parts: restoredGroups, totalSize: compressedSize)
        return try CompressionCodec.decompressText(compressed)
    }

    private static func combineData(parts: [Data], totalSize: Int) -> Data {
        var combined = Data(capacity: totalSize)

        for part in parts {
            if combined.count >= totalSize {
                break
            }

            let remaining = totalSize - combined.count
            if part.count <= remaining {
                combined.append(part)
            } else {
                combined.append(part.prefix(remaining))
            }
        }

        return combined
    }
}
