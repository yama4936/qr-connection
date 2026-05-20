import Foundation

struct ErasureShard {
    let index: Int
    let data: Data
}

struct DecodeErasureOptions {
    let dataShards: Int
    let parityShards: Int
    let shardSize: Int
    let originalSize: Int
}

enum ErasureCodecError: LocalizedError {
    case invalidDataShards
    case invalidParityShards
    case tooManyShards
    case divideByZero
    case dataTooLargeForShards
    case notEnoughShards
    case originalSizeTooLarge
    case invalidShardIndex(Int)
    case shardSizeMismatch
    case notEnoughUniqueShards
    case notInvertible
    case invalidShardConfiguration

    var errorDescription: String? {
        switch self {
        case .invalidDataShards:
            return "dataShards must be a positive integer."
        case .invalidParityShards:
            return "parityShards must be a positive integer."
        case .tooManyShards:
            return "dataShards + parityShards must be 256 or less."
        case .divideByZero:
            return "Cannot divide by zero in GF(256)."
        case .dataTooLargeForShards:
            return "Input data does not fit in the requested data shards."
        case .notEnoughShards:
            return "Not enough shards to restore data."
        case .originalSizeTooLarge:
            return "originalSize exceeds data shard capacity."
        case let .invalidShardIndex(index):
            return "Invalid shard index \(index)."
        case .shardSizeMismatch:
            return "Shard size mismatch."
        case .notEnoughUniqueShards:
            return "Not enough unique shards to restore data."
        case .notInvertible:
            return "Erasure decode matrix is not invertible."
        case .invalidShardConfiguration:
            return "Invalid shard configuration."
        }
    }
}

enum ErasureCodec {
    private static let gfSize = 256
    private static let gfPoly = 0x11d
    private static let maxShards = 256

    private static let expTable: [UInt8] = {
        var table = [UInt8](repeating: 0, count: gfSize * 2)
        var log = [UInt8](repeating: 0, count: gfSize)

        var value = 1
        for index in 0..<(gfSize - 1) {
            table[index] = UInt8(value)
            log[value] = UInt8(index)

            value <<= 1
            if (value & gfSize) != 0 {
                value ^= gfPoly
            }
        }

        for index in (gfSize - 1)..<table.count {
            table[index] = table[index - (gfSize - 1)]
        }

        return table
    }()

    private static let logTable: [UInt8] = {
        var table = [UInt8](repeating: 0, count: gfSize)
        var value = 1

        for index in 0..<(gfSize - 1) {
            table[value] = UInt8(index)
            value <<= 1
            if (value & gfSize) != 0 {
                value ^= gfPoly
            }
        }

        return table
    }()

    static func decodeErasure(
        shards: [ErasureShard],
        options: DecodeErasureOptions
    ) throws -> Data {
        try validateShardCounts(dataShards: options.dataShards, parityShards: options.parityShards)

        if shards.count < options.dataShards {
            throw ErasureCodecError.notEnoughShards
        }

        if options.originalSize > options.dataShards * options.shardSize {
            throw ErasureCodecError.originalSizeTooLarge
        }

        let totalShards = options.dataShards + options.parityShards
        var unique: [Int: Data] = [:]

        for shard in shards {
            if shard.index < 0 || shard.index >= totalShards {
                throw ErasureCodecError.invalidShardIndex(shard.index)
            }

            if shard.data.count != options.shardSize {
                throw ErasureCodecError.shardSizeMismatch
            }

            if unique[shard.index] == nil {
                unique[shard.index] = shard.data
            }
        }

        if unique.count < options.dataShards {
            throw ErasureCodecError.notEnoughUniqueShards
        }

        let selected = unique
            .sorted(by: { $0.key < $1.key })
            .prefix(options.dataShards)

        let parityRows = try createCauchyRows(
            dataShards: options.dataShards,
            parityShards: options.parityShards
        )

        let decodeMatrix = try selected.map { entry in
            try createEncodingRow(
                shardIndex: entry.key,
                dataShards: options.dataShards,
                parityRows: parityRows
            )
        }
        let inverted = try invertMatrix(decodeMatrix)

        let selectedShards = selected.map(\.value)
        let restoredParts = try multiplyRowsByShards(
            rows: inverted,
            shards: selectedShards,
            shardSize: options.shardSize
        )

        var restored = Data(count: options.dataShards * options.shardSize)
        for (shardIndex, shard) in restoredParts.enumerated() {
            let start = shardIndex * options.shardSize
            restored.replaceSubrange(start..<(start + options.shardSize), with: shard)
        }

        return restored.prefix(options.originalSize)
    }

    private static func validateShardCounts(dataShards: Int, parityShards: Int) throws {
        if dataShards <= 0 {
            throw ErasureCodecError.invalidDataShards
        }

        if parityShards <= 0 {
            throw ErasureCodecError.invalidParityShards
        }

        if dataShards + parityShards > maxShards {
            throw ErasureCodecError.tooManyShards
        }
    }

    private static func gfMul(_ left: UInt8, _ right: UInt8) -> UInt8 {
        if left == 0 || right == 0 {
            return 0
        }

        let li = Int(logTable[Int(left)])
        let ri = Int(logTable[Int(right)])
        return expTable[li + ri]
    }

    private static func gfDiv(_ left: UInt8, _ right: UInt8) throws -> UInt8 {
        if right == 0 {
            throw ErasureCodecError.divideByZero
        }

        if left == 0 {
            return 0
        }

        let li = Int(logTable[Int(left)])
        let ri = Int(logTable[Int(right)])
        return expTable[li + 255 - ri]
    }

    private static func gfInv(_ value: UInt8) throws -> UInt8 {
        try gfDiv(1, value)
    }

    private static func createCauchyRows(
        dataShards: Int,
        parityShards: Int
    ) throws -> [[UInt8]] {
        var rows: [[UInt8]] = []

        for row in 0..<parityShards {
            var coefficients: [UInt8] = []
            for column in 0..<dataShards {
                let denominator = UInt8(row ^ (parityShards + column))
                coefficients.append(try gfInv(denominator))
            }
            rows.append(coefficients)
        }

        return rows
    }

    private static func createEncodingRow(
        shardIndex: Int,
        dataShards: Int,
        parityRows: [[UInt8]]
    ) throws -> [UInt8] {
        if shardIndex < dataShards {
            var row = [UInt8](repeating: 0, count: dataShards)
            row[shardIndex] = 1
            return row
        }

        let parityIndex = shardIndex - dataShards
        guard parityIndex >= 0, parityIndex < parityRows.count else {
            throw ErasureCodecError.invalidShardIndex(shardIndex)
        }

        return parityRows[parityIndex]
    }

    private static func invertMatrix(_ matrix: [[UInt8]]) throws -> [[UInt8]] {
        let size = matrix.count

        for row in matrix where row.count != size {
            throw ErasureCodecError.invalidShardConfiguration
        }

        var augmented = matrix.enumerated().map { rowIndex, row in
            row + (0..<size).map { columnIndex in
                UInt8(columnIndex == rowIndex ? 1 : 0)
            }
        }

        for column in 0..<size {
            var pivotRow = column
            while pivotRow < size && augmented[pivotRow][column] == 0 {
                pivotRow += 1
            }

            if pivotRow == size {
                throw ErasureCodecError.notInvertible
            }

            if pivotRow != column {
                augmented.swapAt(column, pivotRow)
            }

            let pivot = augmented[column][column]
            if pivot != 1 {
                let pivotInv = try gfInv(pivot)
                for targetColumn in 0..<(size * 2) {
                    augmented[column][targetColumn] = gfMul(augmented[column][targetColumn], pivotInv)
                }
            }

            for row in 0..<size {
                if row == column {
                    continue
                }

                let factor = augmented[row][column]
                if factor == 0 {
                    continue
                }

                for targetColumn in 0..<(size * 2) {
                    let multiplied = gfMul(factor, augmented[column][targetColumn])
                    augmented[row][targetColumn] ^= multiplied
                }
            }
        }

        return augmented.map { Array($0[size..<(size * 2)]) }
    }

    private static func multiplyRowsByShards(
        rows: [[UInt8]],
        shards: [Data],
        shardSize: Int
    ) throws -> [Data] {
        var outputs: [Data] = []
        let shardBytes = shards.map(Array.init)

        for row in rows {
            var output = [UInt8](repeating: 0, count: shardSize)

            for sourceIndex in shardBytes.indices {
                let coefficient = row[sourceIndex]
                if coefficient == 0 {
                    continue
                }

                let source = shardBytes[sourceIndex]
                for byteIndex in 0..<shardSize {
                    output[byteIndex] ^= gfMul(coefficient, source[byteIndex])
                }
            }

            outputs.append(Data(output))
        }

        return outputs
    }
}
