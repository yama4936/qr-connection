import Foundation

struct ReceiveDebugStats {
    var parsedOk = 0
    var jsonParseError = 0
    var shapeMismatch = 0
    var invalidTotal = 0
    var invalidIndex = 0
    var ignoredSessionMismatch = 0
    var ignoredTotalMismatch = 0
    var ignoredChecksumMismatch = 0
    var ignoredTypeMismatch = 0
    var ignoredVersionMismatch = 0
    var duplicateChunk = 0
    var acceptedChunk = 0
    var replacedChunk = 0
}

@MainActor
final class ReceiveViewModel: ObservableObject {
    @Published var payloadVersion: Int?
    @Published var currentSessionId: String?
    @Published var total = 0
    @Published var requiredTotal = 0
    @Published var groupCount = 0
    @Published var checksum: String?
    @Published var payloadType: PayloadType?
    @Published var chunks: [Int: String] = [:]
    @Published var erasureShards: [String: QRPayload] = [:]
    @Published var result = ""
    @Published var copied = false
    @Published var errorMessage: String?
    @Published var debugStats = ReceiveDebugStats()

    private var payloadVersionRef: Int?
    private var sessionRef: String?
    private var totalRef = 0
    private var requiredTotalRef = 0
    private var groupCountRef = 0
    private var checksumRef: String?
    private var payloadTypeRef: PayloadType?

    var receivedIndices: [Int] {
        if payloadVersionRef == TransferConstants.erasurePayloadVersion {
            return erasureShards.values.map(\.index).sorted()
        }

        return chunks.keys.sorted()
    }

    var missingIndices: [Int] {
        guard total > 0 else {
            return []
        }

        let set = Set(receivedIndices)
        return (0..<total).filter { !set.contains($0) }
    }

    var receivedCount: Int {
        payloadVersionRef == TransferConstants.erasurePayloadVersion
            ? erasureShards.count
            : chunks.count
    }

    var progressTotal: Int {
        requiredTotal > 0 ? requiredTotal : total
    }

    func handleScan(_ raw: String) {
        let parsed = QRPayloadCodec.parsePayloadDetailed(raw: raw)

        switch parsed {
        case let .failure(issue):
            switch issue {
            case .jsonParseError:
                debugStats.jsonParseError += 1
            case .shapeMismatch:
                debugStats.shapeMismatch += 1
            case .invalidTotal:
                debugStats.invalidTotal += 1
            case .invalidIndex:
                debugStats.invalidIndex += 1
            }
            return

        case let .success(payload):
            debugStats.parsedOk += 1

            if sessionRef == nil {
                let required = payload.version == TransferConstants.erasurePayloadVersion
                    ? (payload.required ?? payload.total)
                    : payload.total

                payloadVersionRef = payload.version
                sessionRef = payload.sessionId
                totalRef = payload.total
                requiredTotalRef = required
                groupCountRef = payload.version == TransferConstants.erasurePayloadVersion
                    ? (payload.groupCount ?? 0)
                    : 0
                checksumRef = payload.checksum
                payloadTypeRef = payload.payloadType

                payloadVersion = payload.version
                currentSessionId = payload.sessionId
                total = payload.total
                requiredTotal = required
                groupCount = payload.version == TransferConstants.erasurePayloadVersion
                    ? (payload.groupCount ?? 0)
                    : 0
                checksum = payload.checksum
                payloadType = payload.payloadType
            }

            if payload.sessionId != sessionRef {
                debugStats.ignoredSessionMismatch += 1
                return
            }

            if payload.version != payloadVersionRef {
                debugStats.ignoredVersionMismatch += 1
                return
            }

            if payload.total != totalRef {
                debugStats.ignoredTotalMismatch += 1
                return
            }

            if payload.version == TransferConstants.erasurePayloadVersion {
                if payload.required != requiredTotalRef || payload.groupCount != groupCountRef {
                    debugStats.ignoredTotalMismatch += 1
                    return
                }
            }

            if payload.checksum != checksumRef {
                debugStats.ignoredChecksumMismatch += 1
                return
            }

            if payload.payloadType != payloadTypeRef {
                debugStats.ignoredTypeMismatch += 1
                return
            }

            if payload.version == TransferConstants.erasurePayloadVersion {
                guard let key = QRPayloadCodec.erasureShardKey(payload) else {
                    debugStats.invalidIndex += 1
                    return
                }

                let existing = erasureShards[key]
                if let existing, existing.data == payload.data {
                    debugStats.duplicateChunk += 1
                    return
                }

                erasureShards[key] = payload
                if existing == nil {
                    debugStats.acceptedChunk += 1
                } else {
                    debugStats.replacedChunk += 1
                }
            } else {
                let existing = chunks[payload.index]
                if existing == payload.data {
                    debugStats.duplicateChunk += 1
                    return
                }

                chunks[payload.index] = payload.data
                if existing == nil {
                    debugStats.acceptedChunk += 1
                } else {
                    debugStats.replacedChunk += 1
                }
            }

            restoreIfPossible()
        }
    }

    func copyResult() {
        guard !result.isEmpty else {
            return
        }

        Clipboard.copy(result)

        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.copied = false
        }
    }

    func reset() {
        payloadVersionRef = nil
        sessionRef = nil
        totalRef = 0
        requiredTotalRef = 0
        groupCountRef = 0
        checksumRef = nil
        payloadTypeRef = nil
        payloadVersion = nil
        currentSessionId = nil
        total = 0
        requiredTotal = 0
        groupCount = 0
        checksum = nil
        payloadType = nil
        chunks = [:]
        erasureShards = [:]
        result = ""
        copied = false
        errorMessage = nil
        debugStats = ReceiveDebugStats()
    }

    private func restoreIfPossible() {
        guard result.isEmpty, let checksumRef, let payloadVersionRef else {
            return
        }

        do {
            let restored: String
            if payloadVersionRef == TransferConstants.erasurePayloadVersion {
                if !QRPayloadCodec.canRestoreErasurePayloads(shards: erasureShards) {
                    return
                }
                restored = try QRPayloadCodec.restoreErasurePayload(shards: erasureShards)
            } else {
                if chunks.count != totalRef {
                    return
                }
                restored = try QRPayloadCodec.restorePayload(chunks: chunks, total: totalRef)
            }

            let restoredChecksum = Checksum.sha256Hex(restored)
            if restoredChecksum != checksumRef {
                errorMessage = "復元後checksumが一致しませんでした。"
                return
            }

            errorMessage = nil
            result = restored
        } catch {
            errorMessage = error.localizedDescription.isEmpty ? "復元処理に失敗しました。" : error.localizedDescription
        }
    }
}
