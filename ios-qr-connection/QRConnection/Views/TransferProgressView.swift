import SwiftUI

struct TransferProgressView: View {
    let label: String
    let current: Int
    let total: Int
    let indices: [Int]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.headline)
            Text("\(current) / \(total)")
                .font(.system(size: 28, weight: .bold, design: .rounded))

            if !indices.isEmpty {
                Text(indices.map(String.init).joined(separator: ", "))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(AppColors.panelBackground, in: RoundedRectangle(cornerRadius: 12))
    }
}
