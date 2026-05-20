"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import type { QRPayload } from "@/types/qr";

type QRPlayerProps = {
  payloads: QRPayload[];
  intervalMs: number;
  isPlaying: boolean;
  displayIndices?: number[];
  onCurrentIndexChange?: (index: number) => void;
  onError?: (message: string) => void;
};

export function QRPlayer({
  payloads,
  intervalMs,
  isPlaying,
  displayIndices,
  onCurrentIndexChange,
  onError,
}: QRPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentDisplayPosition, setCurrentDisplayPosition] = useState(0);
  const playbackIndices = useMemo(() => {
    const allIndices = payloads.map((_, index) => index);
    if (!displayIndices || displayIndices.length === 0) {
      return allIndices;
    }

    const uniqueIndices = Array.from(new Set(displayIndices)).filter(
      (index) => index >= 0 && index < payloads.length,
    );
    return uniqueIndices.length > 0 ? uniqueIndices : allIndices;
  }, [displayIndices, payloads]);
  const safeDisplayPosition =
    playbackIndices.length > 0 ? currentDisplayPosition % playbackIndices.length : 0;
  const currentIndex = playbackIndices[safeDisplayPosition] ?? 0;

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
        width: 420,
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
    if (!isPlaying || playbackIndices.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentDisplayPosition((prev) => (prev + 1) % playbackIndices.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, isPlaying, playbackIndices.length]);

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
