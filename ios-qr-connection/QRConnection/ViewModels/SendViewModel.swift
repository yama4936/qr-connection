import Foundation

@MainActor
final class SendViewModel: ObservableObject {
    @Published var text = ""
    @Published var sourceData = ""
    @Published var sourceType: PayloadType = .text
    @Published var payloads: [QRPayload] = [] {
        didSet {
            normalizePlaybackState()
        }
    }
    @Published var intervalMs = 500 {
        didSet {
            restartTimerIfNeeded()
        }
    }
    @Published var isPlaying = false {
        didSet {
            if isPlaying {
                startTimer()
            } else {
                stopTimer()
            }
        }
    }
    @Published var currentIndex = 0
    @Published var originalBytes = 0
    @Published var compressedBytes = 0
    @Published var warningMessage: String?
    @Published var errorMessage: String?
    @Published var isReadingFile = false
    @Published var loadedFileName: String?
    @Published var loadedFileBytes = 0
    @Published var chunkSelectionInput = ""
    @Published var selectedChunkIndices: [Int]? {
        didSet {
            normalizePlaybackState()
        }
    }
    @Published var chunkSelectionError: String?

    private var timer: Timer?
    private var currentDisplayPosition = 0

    var hasPayloads: Bool {
        !payloads.isEmpty
    }

    var previewImageData: Data? {
        guard sourceType == .jpeg, sourceData.hasPrefix("data:image/jpeg;base64,") else {
            return nil
        }

        return DataURLCodec.decode(sourceData)
    }

    var playbackChunkCountText: String {
        if let selectedChunkIndices {
            return "\(selectedChunkIndices.count) chunk"
        }
        return "全chunk"
    }

    deinit {
        timer?.invalidate()
    }

    func handleTextChanged(_ value: String) {
        text = value
        sourceData = value
        sourceType = .text
        loadedFileName = nil
        loadedFileBytes = 0
    }

    func handleGenerate() {
        errorMessage = nil
        warningMessage = nil
        isPlaying = false

        if sourceType == .text && sourceData.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            errorMessage = "テキストを入力してください。"
            return
        }

        if sourceData.isEmpty {
            errorMessage = "送信するデータがありません。"
            return
        }

        do {
            let rawBytesLength: Int
            if (sourceType == .jpeg || sourceType == .pdf) && loadedFileBytes > 0 {
                rawBytesLength = loadedFileBytes
            } else {
                rawBytesLength = Data(sourceData.utf8).count
            }

            let hardMaxSize = TransferConstants.hardMax(for: sourceType)
            if rawBytesLength > hardMaxSize {
                payloads = []
                switch sourceType {
                case .jpeg:
                    errorMessage = "2MBを超えるJPEGは送信できません。"
                case .pdf:
                    errorMessage = "2MBを超えるPDFは送信できません。"
                case .text:
                    errorMessage = "300KBを超えるデータは送信できません。"
                }
                return
            }

            if rawBytesLength > TransferConstants.recommendedMaxSize {
                warningMessage = "100KBを超えています。読み取り失敗率が上がる可能性があります。"
            }

            let output = try QRPayloadCodec.createPayloads(
                source: sourceData,
                payloadType: sourceType,
                originalSizeBytes: (sourceType == .jpeg || sourceType == .pdf) && loadedFileBytes > 0
                    ? loadedFileBytes
                    : nil
            )

            originalBytes = output.originalBytes
            compressedBytes = output.compressedBytes
            payloads = output.payloads
            chunkSelectionInput = ""
            selectedChunkIndices = nil
            chunkSelectionError = nil
            isPlaying = true
        } catch {
            payloads = []
            errorMessage = error.localizedDescription.isEmpty ? "QR生成に失敗しました。" : error.localizedDescription
        }
    }

    func loadFile(url: URL) async {
        errorMessage = nil
        warningMessage = nil
        isReadingFile = true

        defer {
            isReadingFile = false
        }

        do {
            let loaded = try FileSourceDecoder.decodeFile(at: url)
            let hardMaxSize = TransferConstants.hardMax(for: loaded.payloadType)

            if loaded.fileBytes > hardMaxSize {
                switch loaded.payloadType {
                case .jpeg:
                    errorMessage = "2MBを超えるJPEGは送信できません。"
                case .pdf:
                    errorMessage = "2MBを超えるPDFは送信できません。"
                case .text:
                    errorMessage = "300KBを超えるファイルは送信できません。"
                }
                return
            }

            text = loaded.displayText
            sourceData = loaded.sourceData
            sourceType = loaded.payloadType
            loadedFileName = loaded.fileName
            loadedFileBytes = loaded.fileBytes
            resetGeneratedState()

            if loaded.fileBytes > TransferConstants.recommendedMaxSize {
                switch loaded.payloadType {
                case .jpeg:
                    warningMessage = "100KBを超えるJPEGです。読み取り失敗率が上がる可能性があります。"
                case .pdf:
                    warningMessage = "100KBを超えるPDFです。読み取り失敗率が上がる可能性があります。"
                case .text:
                    warningMessage = "100KBを超えるファイルです。読み取り失敗率が上がる可能性があります。"
                }
            }
        } catch {
            errorMessage = error.localizedDescription.isEmpty
                ? "ファイルの読み込みに失敗しました。UTF-8テキスト、JPEG、PDFを選択してください。"
                : error.localizedDescription
        }
    }

    func startPlayback() {
        guard !payloads.isEmpty else { return }
        isPlaying = true
    }

    func stopPlayback() {
        isPlaying = false
    }

    func handleApplyChunkSelection() {
        let parseResult = parseChunkIndexInput(chunkSelectionInput, total: payloads.count)
        switch parseResult {
        case let .success(indices):
            selectedChunkIndices = indices
            chunkSelectionError = nil
            isPlaying = true
        case let .failure(message):
            chunkSelectionError = message
        }
    }

    func handleClearChunkSelection() {
        selectedChunkIndices = nil
        chunkSelectionError = nil
        isPlaying = !payloads.isEmpty
    }

    func currentPayload() -> QRPayload? {
        guard !payloads.isEmpty else {
            return nil
        }

        let indices = playbackIndices()
        guard !indices.isEmpty else {
            return payloads.first
        }

        let selectedIndex = indices[safe: currentDisplayPosition] ?? indices[0]
        return payloads[safe: selectedIndex]
    }

    func currentIndexLabel() -> String {
        guard !payloads.isEmpty else {
            return "- / -"
        }

        return "\(currentIndex) / \(max(payloads.count - 1, 0))"
    }

    private func resetGeneratedState() {
        payloads = []
        isPlaying = false
        currentIndex = 0
        originalBytes = 0
        compressedBytes = 0
        chunkSelectionInput = ""
        selectedChunkIndices = nil
        chunkSelectionError = nil
    }

    private func playbackIndices() -> [Int] {
        let allIndices = Array(payloads.indices)

        guard let selectedChunkIndices, !selectedChunkIndices.isEmpty else {
            return allIndices
        }

        let filtered = Array(Set(selectedChunkIndices)).sorted().filter {
            $0 >= 0 && $0 < payloads.count
        }

        return filtered.isEmpty ? allIndices : filtered
    }

    private func normalizePlaybackState() {
        currentDisplayPosition = 0
        updateCurrentIndex()

        if payloads.isEmpty {
            isPlaying = false
        }
    }

    private func updateCurrentIndex() {
        let indices = playbackIndices()
        guard !indices.isEmpty else {
            currentIndex = 0
            return
        }

        if currentDisplayPosition >= indices.count {
            currentDisplayPosition = 0
        }

        currentIndex = indices[currentDisplayPosition]
    }

    private func restartTimerIfNeeded() {
        guard isPlaying else {
            return
        }

        startTimer()
    }

    private func startTimer() {
        stopTimer()

        guard !payloads.isEmpty else {
            isPlaying = false
            return
        }

        let interval = max(0.1, Double(intervalMs) / 1000)
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.tick()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        let indices = playbackIndices()
        guard !indices.isEmpty else {
            return
        }

        currentDisplayPosition = (currentDisplayPosition + 1) % indices.count
        updateCurrentIndex()
    }

    private enum ParsedChunkIndices {
        case success([Int])
        case failure(String)
    }

    private func parseChunkIndexInput(_ input: String, total: Int) -> ParsedChunkIndices {
        if total <= 0 {
            return .failure("先にQRを生成してください。")
        }

        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return .failure("再表示するchunk indexを入力してください。")
        }

        let maxIndex = total - 1
        var selected = Set<Int>()
        let separators = CharacterSet(charactersIn: ",、 \t\n")
        let tokens = trimmed.components(separatedBy: separators).filter { !$0.isEmpty }

        for token in tokens {
            let parts = token.split(separator: "-", omittingEmptySubsequences: false)

            if parts.count == 2,
               let start = Int(parts[0]),
               let end = Int(parts[1]) {
                if start > end {
                    return .failure("\(token) は小さい順に指定してください。")
                }

                if start < 0 || end > maxIndex {
                    return .failure("chunk indexは0から\(maxIndex)の範囲で指定してください。")
                }

                for index in start...end {
                    selected.insert(index)
                }
                continue
            }

            guard let index = Int(token) else {
                return .failure("chunk indexは数字、カンマ、範囲（例: 2-5）で指定してください。")
            }

            if index < 0 || index > maxIndex {
                return .failure("chunk indexは0から\(maxIndex)の範囲で指定してください。")
            }

            selected.insert(index)
        }

        let sorted = selected.sorted()
        return .success(sorted)
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        guard index >= 0, index < count else { return nil }
        return self[index]
    }
}
