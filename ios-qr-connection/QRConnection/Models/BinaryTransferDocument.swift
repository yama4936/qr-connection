import SwiftUI
import UniformTypeIdentifiers

struct BinaryTransferDocument: FileDocument {
    static var readableContentTypes: [UTType] = [.data, .jpeg, .pdf]

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        self.data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
