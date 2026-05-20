import Foundation

enum PayloadType: String, Codable, CaseIterable, Identifiable {
    case text
    case jpeg
    case pdf

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .text:
            return "text"
        case .jpeg:
            return "jpeg"
        case .pdf:
            return "pdf"
        }
    }
}

struct QRPayload: Codable, Equatable {
    let version: Int
    let sessionId: String
    let index: Int
    let total: Int
    let encoding: String
    let compression: String
    let payloadType: PayloadType
    let data: String
    let checksum: String
    let scheme: String?
    let required: Int?
    let groupIndex: Int?
    let groupCount: Int?
    let shardIndex: Int?
    let dataShards: Int?
    let parityShards: Int?
    let totalShards: Int?
    let shardSize: Int?
    let groupSize: Int?
    let originalSize: Int?
    let compressedSize: Int?

    init(
        version: Int,
        sessionId: String,
        index: Int,
        total: Int,
        encoding: String,
        compression: String,
        payloadType: PayloadType,
        data: String,
        checksum: String,
        scheme: String? = nil,
        required: Int? = nil,
        groupIndex: Int? = nil,
        groupCount: Int? = nil,
        shardIndex: Int? = nil,
        dataShards: Int? = nil,
        parityShards: Int? = nil,
        totalShards: Int? = nil,
        shardSize: Int? = nil,
        groupSize: Int? = nil,
        originalSize: Int? = nil,
        compressedSize: Int? = nil
    ) {
        self.version = version
        self.sessionId = sessionId
        self.index = index
        self.total = total
        self.encoding = encoding
        self.compression = compression
        self.payloadType = payloadType
        self.data = data
        self.checksum = checksum
        self.scheme = scheme
        self.required = required
        self.groupIndex = groupIndex
        self.groupCount = groupCount
        self.shardIndex = shardIndex
        self.dataShards = dataShards
        self.parityShards = parityShards
        self.totalShards = totalShards
        self.shardSize = shardSize
        self.groupSize = groupSize
        self.originalSize = originalSize
        self.compressedSize = compressedSize
    }
}

enum ParsePayloadIssue {
    case jsonParseError
    case shapeMismatch
    case invalidTotal
    case invalidIndex
}

enum ParsePayloadResult {
    case success(QRPayload)
    case failure(ParsePayloadIssue)
}

enum TransferConstants {
    static let payloadVersion = 1
    static let erasurePayloadVersion = 2
    static let erasureScheme = "reed-solomon-erasure"
    static let erasureShardSize = 300
    static let erasureDataShards = 10
    static let defaultErasureParityRatio = 0.3
    static let chunkSize = 450
    static let recommendedMaxSize = 100 * 1024
    static let hardMaxTextSize = 300 * 1024
    static let hardMaxBinarySize = 2 * 1024 * 1024

    static func hardMax(for payloadType: PayloadType) -> Int {
        switch payloadType {
        case .text:
            return hardMaxTextSize
        case .jpeg, .pdf:
            return hardMaxBinarySize
        }
    }
}
