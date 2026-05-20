import Foundation

enum Base64Codec {
    static func encode(_ data: Data) -> String {
        data.base64EncodedString()
    }

    static func decode(_ base64: String) -> Data? {
        Data(base64Encoded: base64)
    }
}
