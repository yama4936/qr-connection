import SwiftUI

struct PlatformImageView: View {
    let image: PlatformImage

    var body: some View {
        #if os(iOS)
        Image(uiImage: image)
            .resizable()
        #elseif os(macOS)
        Image(nsImage: image)
            .resizable()
        #endif
    }
}
