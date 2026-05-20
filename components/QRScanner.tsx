"use client";

import { useEffect, useId, useRef, useState } from "react";

type QRScannerProps = {
  onScan: (decodedText: string) => void;
  onError: (message: string) => void;
};

function formatCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

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
  const name = error instanceof Error ? error.name : "";
  return (
    name === "OverconstrainedError" ||
    name === "NotFoundError" ||
    name === "DevicesNotFoundError"
  );
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
  } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState({
    decodedCount: 0,
    frameErrorCount: 0,
    lastFrameError: "",
  });
  const debugRef = useRef({
    decodedCount: 0,
    frameErrorCount: 0,
    lastFrameError: "",
  });
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

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      const scanConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      };
      const onScanSuccess = (decodedText: string) => {
        debugRef.current.decodedCount += 1;
        onScan(decodedText);
      };
      const onScanFrameError = (errorMessage: string) => {
        debugRef.current.frameErrorCount += 1;
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
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">QR読み取り</h2>
      <div id={containerId} className="min-h-64 overflow-hidden rounded-md bg-slate-100" />
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
      {runtimeInfo ? (
        <p className="text-xs text-slate-500">
          {runtimeInfo.isSecureContext ? "secure context" : "insecure context"} /{" "}
          {runtimeInfo.origin}
        </p>
      ) : null}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p>decoded: {debugStats.decodedCount}</p>
        <p>frame errors: {debugStats.frameErrorCount}</p>
        <p className="break-all">last frame error: {debugStats.lastFrameError || "-"}</p>
      </div>
      {localError ? <p className="text-sm text-red-600">{localError}</p> : null}
    </section>
  );
}
