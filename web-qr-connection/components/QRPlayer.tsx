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

type QRPlayerMetrics = {
  displayedQrCount: number;
  displayedUniqueIndexCount: number;
  actualSwitchIntervalMs: number | null;
  switchJitterMs: number | null;
  qrRenderDurationMs: number | null;
  qrRenderErrorCount: number;
};

type QRPlayerTiming = {
  lastSwitchAt: number | null;
  displayedIndices: Set<number>;
};

const INITIAL_PLAYER_METRICS: QRPlayerMetrics = {
  displayedQrCount: 0,
  displayedUniqueIndexCount: 0,
  actualSwitchIntervalMs: null,
  switchJitterMs: null,
  qrRenderDurationMs: null,
  qrRenderErrorCount: 0,
};

function createInitialPlayerMetrics(): QRPlayerMetrics {
  return { ...INITIAL_PLAYER_METRICS };
}

function createInitialPlayerTiming(): QRPlayerTiming {
  return {
    lastSwitchAt: null,
    displayedIndices: new Set<number>(),
  };
}

function formatMetricNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatMetricMs(value: number | null): string {
  return value === null ? "-" : `${formatMetricNumber(value)}ms`;
}

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
  const [metrics, setMetrics] = useState<QRPlayerMetrics>(
    createInitialPlayerMetrics,
  );
  const metricsRef = useRef<QRPlayerMetrics>(createInitialPlayerMetrics());
  const timingRef = useRef<QRPlayerTiming>(createInitialPlayerTiming());
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
    if (payloads.length === 0) {
      return;
    }

    const now = performance.now();
    const timing = timingRef.current;
    const lastSwitchAt = timing.lastSwitchAt;
    const actualSwitchIntervalMs =
      lastSwitchAt === null ? null : now - lastSwitchAt;

    timing.lastSwitchAt = now;
    timing.displayedIndices.add(currentIndex);
    metricsRef.current.displayedQrCount += 1;
    metricsRef.current.displayedUniqueIndexCount = timing.displayedIndices.size;
    metricsRef.current.actualSwitchIntervalMs = actualSwitchIntervalMs;
    metricsRef.current.switchJitterMs =
      actualSwitchIntervalMs === null ? null : actualSwitchIntervalMs - intervalMs;
  }, [currentIndex, intervalMs, payloads.length]);

  useEffect(() => {
    if (!canvasRef.current || !currentPayload) {
      return;
    }

    const renderStartedAt = performance.now();
    QRCode.toCanvas(
      canvasRef.current,
      JSON.stringify(currentPayload),
      {
        margin: 1,
        width: 420,
        errorCorrectionLevel: "M",
      },
      (error) => {
        metricsRef.current.qrRenderDurationMs =
          performance.now() - renderStartedAt;

        if (error) {
          metricsRef.current.qrRenderErrorCount += 1;
          onError?.("QR生成に失敗しました。");
        }
      },
    );
  }, [currentPayload, onError]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMetrics({ ...metricsRef.current });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <canvas ref={canvasRef} className="mx-auto block max-w-full" />
      <div className="grid gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
        <p>configured interval: {intervalMs}ms</p>
        <p>displayed QR: {metrics.displayedQrCount}</p>
        <p>unique index: {metrics.displayedUniqueIndexCount}</p>
        <p>actual interval: {formatMetricMs(metrics.actualSwitchIntervalMs)}</p>
        <p>switch jitter: {formatMetricMs(metrics.switchJitterMs)}</p>
        <p>render time: {formatMetricMs(metrics.qrRenderDurationMs)}</p>
        <p>render errors: {metrics.qrRenderErrorCount}</p>
      </div>
    </div>
  );
}
