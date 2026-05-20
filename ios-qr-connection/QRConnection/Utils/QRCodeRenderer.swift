import CoreGraphics
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation

enum QRCodeRenderer {
    private static let context = CIContext(options: nil)

    static func makeImage(from payload: QRPayload, dimension: CGFloat = 420) -> PlatformImage? {
        guard let encoded = try? JSONEncoder().encode(payload) else {
            return nil
        }

        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(encoded)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else {
            return nil
        }

        let extent = outputImage.extent.integral
        let longestEdge = max(extent.width, extent.height)
        let scale = max(floor(dimension / longestEdge), 1)
        let transformed = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else {
            return nil
        }

        #if os(iOS)
        return PlatformImage(cgImage: cgImage)
        #elseif os(macOS)
        return PlatformImage(cgImage: cgImage, size: NSSize(width: transformed.extent.width, height: transformed.extent.height))
        #endif
    }
}
