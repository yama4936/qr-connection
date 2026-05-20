import AVFoundation
import Foundation

struct ScannerDebugStats {
    var decodedCount = 0
    var frameErrorCount = 0
    var lastFrameError = ""
}

enum ScannerStartError: LocalizedError {
    case permissionDenied
    case cameraUnavailable
    case inputNotSupported
    case outputNotSupported
    case qrMetadataNotSupported

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "カメラ権限が拒否されています。設定からこのアプリのカメラ許可を有効にしてください。"
        case .cameraUnavailable:
            return "利用可能なカメラが見つかりません。"
        case .inputNotSupported:
            return "カメラ入力の初期化に失敗しました。"
        case .outputNotSupported:
            return "QR読み取り出力を追加できませんでした。"
        case .qrMetadataNotSupported:
            return "この端末ではQR読み取りメタデータが利用できません。"
        }
    }
}

@MainActor
final class QRScannerManager: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    @Published var isStarting = false
    @Published var isScanning = false
    @Published var localError: String?
    @Published var debugStats = ScannerDebugStats()

    let session = AVCaptureSession()

    var onScan: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let metadataOutput = AVCaptureMetadataOutput()
    private var isConfigured = false

    deinit {
        session.stopRunning()
    }

    func start() {
        guard !isStarting, !isScanning else {
            return
        }

        isStarting = true
        localError = nil

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            do {
                try configureIfNeeded()
                if !session.isRunning {
                    session.startRunning()
                }
                isStarting = false
                isScanning = true
            } catch {
                handleStartFailure(error)
            }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self else { return }
                Task { @MainActor in
                    if granted {
                        self.start()
                    } else {
                        self.handleStartFailure(ScannerStartError.permissionDenied)
                    }
                }
            }
        default:
            handleStartFailure(ScannerStartError.permissionDenied)
        }
    }

    func stop() {
        if session.isRunning {
            session.stopRunning()
        }

        isScanning = false
        isStarting = false
    }

    private func configureIfNeeded() throws {
        guard !isConfigured else {
            return
        }

        session.beginConfiguration()
        session.sessionPreset = .high

        defer {
            session.commitConfiguration()
        }

        #if os(iOS)
        let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video)
        #elseif os(macOS)
        let device = AVCaptureDevice.default(for: .video)
        #endif

        guard let cameraDevice = device else {
            throw ScannerStartError.cameraUnavailable
        }

        let input = try AVCaptureDeviceInput(device: cameraDevice)
        guard session.canAddInput(input) else {
            throw ScannerStartError.inputNotSupported
        }
        session.addInput(input)

        guard session.canAddOutput(metadataOutput) else {
            throw ScannerStartError.outputNotSupported
        }

        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)

        if metadataOutput.availableMetadataObjectTypes.contains(.qr) {
            metadataOutput.metadataObjectTypes = [.qr]
        } else {
            throw ScannerStartError.qrMetadataNotSupported
        }

        isConfigured = true
    }

    private func handleStartFailure(_ error: Error) {
        debugStats.frameErrorCount += 1
        debugStats.lastFrameError = error.localizedDescription

        localError = formatCameraError(error)
        if let localError {
            onError?(localError)
        }

        isStarting = false
        isScanning = false
    }

    private func formatCameraError(_ error: Error) -> String {
        if let scannerError = error as? ScannerStartError {
            return scannerError.errorDescription ?? "カメラの起動に失敗しました。"
        }

        let nsError = error as NSError
        if nsError.domain == AVFoundationErrorDomain,
           let code = AVError.Code(rawValue: nsError.code) {
            switch code {
            case .applicationIsNotAuthorizedToUseDevice:
                return "カメラ権限が拒否されています。設定から許可してください。"
            case .deviceAlreadyUsedByAnotherSession:
                return "カメラが他アプリで使用中のため開始できません。"
            default:
                break
            }
        }

        if !error.localizedDescription.isEmpty {
            return "カメラの起動に失敗しました: \(error.localizedDescription)"
        }

        return "カメラの起動に失敗しました。権限と端末設定を確認してください。"
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let readable = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              readable.type == .qr,
              let decodedText = readable.stringValue
        else {
            return
        }

        Task { @MainActor [weak self] in
            guard let self else { return }
            self.debugStats.decodedCount += 1
            self.onScan?(decodedText)
        }
    }
}
