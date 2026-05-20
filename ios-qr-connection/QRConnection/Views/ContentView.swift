import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            SendTransferView()
                .tabItem {
                    Label("送信", systemImage: "square.and.arrow.up")
                }

            ReceiveTransferView()
                .tabItem {
                    Label("受信", systemImage: "qrcode.viewfinder")
                }
        }
    }
}
