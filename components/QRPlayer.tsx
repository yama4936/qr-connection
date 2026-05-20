"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import type { QRPayload } from "@/types/qr";

type QRPlayerProps = {
  payloads: QRPayload[];
  intervalMs: number;
  isPlaying: boolean;
  onCurrentIndexChange?: (index: number) => void;
  onError?: (message: string) => void;
};

export function QRPlayer({
  payloads,
  intervalMs,
  isPlaying,
  onCurrentIndexChange,
  onError,
}: QRPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentPayload = useMemo(
    () => payloads[currentIndex] ?? null,
    [currentIndex, payloads],
  );

  useEffect(() => {
    onCurrentIndexChange?.(currentIndex);
  }, [currentIndex, onCurrentIndexChange]);

  useEffect(() => {
    if (!canvasRef.current || !currentPayload) {
      return;
    }

    QRCode.toCanvas(
      canvasRef.current,
      JSON.stringify(currentPayload),
      {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
      },
      (error) => {
        if (error) {
          onError?.("QR生成に失敗しました。");
        }
      },
    );
  }, [currentPayload, onError]);

  useEffect(() => {
    if (!isPlaying || payloads.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % payloads.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, isPlaying, payloads.length]);

  if (payloads.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        QRを生成するとここに表示されます。
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <canvas ref={canvasRef} className="mx-auto block max-w-full" />
    </div>
  );
}
