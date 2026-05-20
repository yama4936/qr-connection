import Foundation

enum ByteFormatter {
    static func kilobytesString(_ bytes: Int) -> String {
        let value = Double(bytes) / 1024
        return String(format: "%.1fKB", value)
    }
}
