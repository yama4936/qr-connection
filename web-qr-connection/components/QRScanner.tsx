"use client";

import { useEffect, useId, useRef, useState } from "react";

type QRScannerProps = {
  onScan: (decodedText: string) => void;
  onError: (message: string) => void;
  compact?: boolean;
};

type QRScannerDebugStats = {
  decodedCount: number;
  noCodeFrameCount: number;
  frameErrorCount: number;
  lastFrameStatus: string;
  lastFrameError: string;
};

type FrameScanError = {
  type?: number;
};

const NO_CODE_FOUND_ERROR_TYPE = 2;

const INITIAL_DEBUG_STATS: QRScannerDebugStats = {
  decodedCount: 0,
  noCodeFrameCount: 0,
  frameErrorCount: 0,
  lastFrameStatus: "待機中",
  lastFrameError: "",
};

function createInitialDebugStats(): QRScannerDebugStats {
  return { ...INITIAL_DEBUG_STATS };
}

function getCameraErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }

  return "";
}

function getCameraErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function formatCameraError(error: unknown): string {
  const name = getCameraErrorName(error);
  const message = getCameraErrorMessage(error);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "カメラ権限が拒否されています。ブラウザ設定でこのサイトのカメラを許可してください。";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "利用可能なカメラが見つかりません。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "カメラが他アプリで使用中のため開始できません。";
  }

  if (name === "OverconstrainedError") {
    return "この端末で要求したカメラ条件を満たせませんでした。";
  }

  if (message) {
    return `カメラの起動に失敗しました: ${message}`;
  }

  return "カメラの起動に失敗しました。権限とブラウザ設定を確認してください。";
}

function shouldTryCameraIdFallback(error: unknown): boolean {
  const name = getCameraErrorName(error);
  return (
    name === "OverconstrainedError" ||
    name === "NotFoundError" ||
    name === "DevicesNotFoundError"
  );
}

function isNoCodeFoundFrame(
  errorMessage: string,
  error?: FrameScanError,
): boolean {
  return (
    error?.type === NO_CODE_FOUND_ERROR_TYPE ||
    /no multiformat readers|no code found|notfoundexception/i.test(errorMessage)
  );
}

function getQrboxSize(
  viewfinderWidth: number,
  viewfinderHeight: number,
): { width: number; height: number } {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const edge = Math.floor(Math.max(100, Math.min(420, minEdge - 24, minEdge * 0.86)));

  return { width: edge, height: edge };
}

export function QRScanner({ onScan, onError, compact = false }: QRScannerProps) {
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
  } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<QRScannerDebugStats>(
    createInitialDebugStats,
  );
  const debugRef = useRef<QRScannerDebugStats>(createInitialDebugStats());
  const [runtimeInfo] = useState<{
    origin: string;
    isSecureContext: boolean;
  } | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return {
      origin: window.location.origin,
      isSecureContext: window.isSecureContext,
    };
  });
  const rawId = useId();
  const containerId = `qr-reader-${rawId.replace(/:/g, "")}`;

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      await scanner.stop();
    } catch {
      // ignore stop errors
    }

    try {
      scanner.clear();
    } catch {
      // ignore clear errors
    }

    scannerRef.current = null;
    setIsScanning(false);
  };

  const startScanner = async () => {
    if (isStarting || isScanning) {
      return;
    }

    if (
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      const message = [
        "iPhoneでカメラを使うにはHTTPSが必要です。",
        `現在のURL: ${window.location.origin}`,
        "PCのIPアドレス(http://192.168.x.x:3000)では動作しません。",
      ].join(" ");
      setLocalError(message);
      onError(message);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const message =
        "このブラウザではカメラAPIが利用できません。Safariで開くか、アプリ内ブラウザではなく通常ブラウザで開いてください。";
      setLocalError(message);
      onError(message);
      return;
    }

    setLocalError(null);
    setIsStarting(true);
    debugRef.current = {
      ...createInitialDebugStats(),
      lastFrameStatus: "カメラ起動中",
    };
    setDebugStats({ ...debugRef.current });

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      const scanConfig = {
        fps: 12,
        qrbox: getQrboxSize,
      };
      const onScanSuccess = (decodedText: string) => {
        debugRef.current.decodedCount += 1;
        debugRef.current.lastFrameStatus = "読み取り成功";
        debugRef.current.lastFrameError = "";
        onScan(decodedText);
      };
      const onScanFrameError = (
        errorMessage: string,
        error?: FrameScanError,
      ) => {
        if (isNoCodeFoundFrame(errorMessage, error)) {
          debugRef.current.noCodeFrameCount += 1;
          debugRef.current.lastFrameStatus = "QR探索中";
          debugRef.current.lastFrameError = "";
          return;
        }

        debugRef.current.frameErrorCount += 1;
        debugRef.current.lastFrameStatus = "デコードエラー";
        debugRef.current.lastFrameError = errorMessage;
      };

      try {
        await scanner.start(
          { facingMode: "environment" },
          scanConfig,
          onScanSuccess,
          onScanFrameError,
        );
      } catch (startError) {
        if (!shouldTryCameraIdFallback(startError)) {
          throw startError;
        }

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) {
          throw startError;
        }

        const preferredCamera =
          cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ??
          cameras[0];

        await scanner.start(
          preferredCamera.id,
          scanConfig,
          onScanSuccess,
          onScanFrameError,
        );
      }

      setIsScanning(true);
    } catch (error) {
      const message = formatCameraError(error);
      setLocalError(message);
      onError(message);

      if (scannerRef.current) {
        await stopScanner();
      }
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDebugStats({ ...debugRef.current });
    }, 1000);

    return () => {
      window.clearInterval(timer);
      void stopScanner();
    };
  }, []);

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${
        compact ? "space-y-2 p-3" : "space-y-3 p-4"
      }`}
    >
      <h2 className="text-sm font-semibold text-slate-700">QR読み取り</h2>
      <div
        id={containerId}
        className={`overflow-hidden rounded-md bg-slate-100 ${
          compact ? "min-h-56" : "min-h-64"
        }`}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void startScanner()}
          disabled={isStarting || isScanning}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isStarting ? "起動中..." : "カメラ開始"}
        </button>
        <button
          type="button"
          onClick={() => void stopScanner()}
          disabled={!isScanning}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          停止
        </button>
      </div>
      {compact ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            診断情報
          </summary>
          <div className="mt-2 space-y-1">
            {runtimeInfo ? (
              <p className="text-slate-500">
                {runtimeInfo.isSecureContext ? "secure context" : "insecure context"} /{" "}
                {runtimeInfo.origin}
              </p>
            ) : null}
            <p>decoded: {debugStats.decodedCount}</p>
            <p>QR未検出フレーム: {debugStats.noCodeFrameCount}</p>
            <p>decoder errors: {debugStats.frameErrorCount}</p>
            <p>scan status: {debugStats.lastFrameStatus}</p>
            {debugStats.lastFrameError ? (
              <p className="break-all">last decoder detail: {debugStats.lastFrameError}</p>
            ) : null}
          </div>
        </details>
      ) : (
        <>
          {runtimeInfo ? (
            <p className="text-xs text-slate-500">
              {runtimeInfo.isSecureContext ? "secure context" : "insecure context"} /{" "}
              {runtimeInfo.origin}
            </p>
          ) : null}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p>decoded: {debugStats.decodedCount}</p>
            <p>QR未検出フレーム: {debugStats.noCodeFrameCount}</p>
            <p>decoder errors: {debugStats.frameErrorCount}</p>
            <p>scan status: {debugStats.lastFrameStatus}</p>
            {debugStats.lastFrameError ? (
              <p className="break-all">last decoder detail: {debugStats.lastFrameError}</p>
            ) : null}
          </div>
        </>
      )}
      {localError ? <p className="text-sm text-red-600">{localError}</p> : null}
    </section>
  );
}
