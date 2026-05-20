import Foundation

enum DataURLCodec {
    static func encode(mimeType: String, data: Data) -> String {
        "data:\(mimeType);base64,\(data.base64EncodedString())"
    }

    static func decode(_ dataURL: String) -> Data? {
        guard let markerRange = dataURL.range(of: "base64,") else {
            return nil
        }

        let base64Start = markerRange.upperBound
        let base64 = String(dataURL[base64Start...])
        return Data(base64Encoded: base64)
    }
}
