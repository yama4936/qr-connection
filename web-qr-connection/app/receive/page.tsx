"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { QRScanner } from "@/components/QRScanner";
import { ResultViewer } from "@/components/ResultViewer";
import { TransferProgress } from "@/components/TransferProgress";
import { sha256 } from "@/lib/checksum";
import {
  canRestoreErasurePayloads,
  erasureShardKey,
  parsePayloadDetailed,
  restoreErasurePayload,
  restorePayload,
} from "@/lib/qrPayload";
import type { QRPayloadType, QRPayloadV2 } from "@/types/qr";

type ReceiveDebugStats = {
  parsedOk: number;
  jsonParseError: number;
  shapeMismatch: number;
  invalidTotal: number;
  invalidIndex: number;
  ignoredSessionMismatch: number;
  ignoredTotalMismatch: number;
  ignoredChecksumMismatch: number;
  ignoredTypeMismatch: number;
  ignoredVersionMismatch: number;
  duplicateChunk: number;
  acceptedChunk: number;
  replacedChunk: number;
};

type LastReject = {
  issue: string;
  preview: string;
  keys: string[];
  version: string;
};

type ReceiveRuntimeMetrics = {
  scannerStartedAtMs: number | null;
  elapsedMs: number;
  timeToFirstChunkMs: number | null;
  timeToCompleteMs: number | null;
  restoreDurationMs: number | null;
  acceptedChunkPerSec: number;
  acceptedChunkCount: number;
  duplicateChunkCount: number;
  replacedChunkCount: number;
  lastAcceptedIndex: number | null;
};

type ReceiveRuntimeTracker = ReceiveRuntimeMetrics & {
  lastStatsAtMs: number | null;
  lastStatsAcceptedChunkCount: number;
};

const INITIAL_DEBUG_STATS: ReceiveDebugStats = {
  parsedOk: 0,
  jsonParseError: 0,
  shapeMismatch: 0,
  invalidTotal: 0,
  invalidIndex: 0,
  ignoredSessionMismatch: 0,
  ignoredTotalMismatch: 0,
  ignoredChecksumMismatch: 0,
  ignoredTypeMismatch: 0,
  ignoredVersionMismatch: 0,
  duplicateChunk: 0,
  acceptedChunk: 0,
  replacedChunk: 0,
};

function createInitialRuntimeTracker(): ReceiveRuntimeTracker {
  return {
    scannerStartedAtMs: null,
    elapsedMs: 0,
    timeToFirstChunkMs: null,
    timeToCompleteMs: null,
    restoreDurationMs: null,
    acceptedChunkPerSec: 0,
    acceptedChunkCount: 0,
    duplicateChunkCount: 0,
    replacedChunkCount: 0,
    lastAcceptedIndex: null,
    lastStatsAtMs: null,
    lastStatsAcceptedChunkCount: 0,
  };
}

function toRuntimeMetrics(tracker: ReceiveRuntimeTracker): ReceiveRuntimeMetrics {
  return {
    scannerStartedAtMs: tracker.scannerStartedAtMs,
    elapsedMs: tracker.elapsedMs,
    timeToFirstChunkMs: tracker.timeToFirstChunkMs,
    timeToCompleteMs: tracker.timeToCompleteMs,
    restoreDurationMs: tracker.restoreDurationMs,
    acceptedChunkPerSec: tracker.acceptedChunkPerSec,
    acceptedChunkCount: tracker.acceptedChunkCount,
    duplicateChunkCount: tracker.duplicateChunkCount,
    replacedChunkCount: tracker.replacedChunkCount,
    lastAcceptedIndex: tracker.lastAcceptedIndex,
  };
}

function formatMetricNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatMetricMs(value: number | null): string {
  return value === null ? "-" : `${formatMetricNumber(value)}ms`;
}

export default function ReceivePage() {
  const [payloadVersion, setPayloadVersion] = useState<1 | 2 | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [requiredTotal, setRequiredTotal] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [payloadType, setPayloadType] = useState<QRPayloadType | null>(null);
  const [chunks, setChunks] = useState<Map<number, string>>(new Map());
  const [erasureShards, setErasureShards] = useState<Map<string, QRPayloadV2>>(
    new Map(),
  );
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<ReceiveDebugStats>(INITIAL_DEBUG_STATS);
  const [lastReject, setLastReject] = useState<LastReject | null>(null);
  const [runtimeMetrics, setRuntimeMetrics] = useState<ReceiveRuntimeMetrics>(() =>
    toRuntimeMetrics(createInitialRuntimeTracker()),
  );
  const [metricsCopied, setMetricsCopied] = useState(false);
  const payloadVersionRef = useRef<1 | 2 | null>(null);
  const sessionRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const requiredTotalRef = useRef(0);
  const groupCountRef = useRef(0);
  const checksumRef = useRef<string | null>(null);
  const payloadTypeRef = useRef<QRPayloadType | null>(null);
  const chunksRef = useRef<Map<number, string>>(new Map());
  const erasureShardsRef = useRef<Map<string, QRPayloadV2>>(new Map());
  const runtimeMetricsRef = useRef<ReceiveRuntimeTracker>(
    createInitialRuntimeTracker(),
  );

  const receivedIndices = useMemo(
    () =>
      payloadVersion === 2
        ? Array.from(erasureShards.values())
            .map((payload) => payload.index)
            .sort((a, b) => a - b)
        : Array.from(chunks.keys()).sort((a, b) => a - b),
    [chunks, erasureShards, payloadVersion],
  );
  const missingIndices = useMemo(() => {
    if (total <= 0) {
      return [];
    }

    const receivedSet = new Set(receivedIndices);
    const indices: number[] = [];
    for (let index = 0; index < total; index += 1) {
      if (!receivedSet.has(index)) {
        indices.push(index);
      }
    }
    return indices;
  }, [receivedIndices, total]);
  const receivedCount = payloadVersion === 2 ? erasureShards.size : chunks.size;
  const progressTotal = requiredTotal || total || 0;

  const resetRuntimeMetrics = useCallback(() => {
    runtimeMetricsRef.current = createInitialRuntimeTracker();
    setRuntimeMetrics(toRuntimeMetrics(runtimeMetricsRef.current));
    setMetricsCopied(false);
  }, []);

  const handleScannerStart = useCallback(() => {
    const now = performance.now();

    runtimeMetricsRef.current = {
      ...createInitialRuntimeTracker(),
      scannerStartedAtMs: now,
      lastStatsAtMs: now,
    };
    setRuntimeMetrics(toRuntimeMetrics(runtimeMetricsRef.current));
    setMetricsCopied(false);
  }, []);

  const ensureRuntimeStarted = useCallback(() => {
    if (runtimeMetricsRef.current.scannerStartedAtMs !== null) {
      return;
    }

    const now = performance.now();
    runtimeMetricsRef.current.scannerStartedAtMs = now;
    runtimeMetricsRef.current.lastStatsAtMs = now;
    setRuntimeMetrics(toRuntimeMetrics(runtimeMetricsRef.current));
  }, []);

  const recordRuntimeEvent = useCallback(
    (event: "accepted" | "duplicate" | "replaced", index: number) => {
      ensureRuntimeStarted();

      const now = performance.now();
      const metrics = runtimeMetricsRef.current;
      const startedAt = metrics.scannerStartedAtMs ?? now;

      if (event === "accepted") {
        metrics.acceptedChunkCount += 1;
        metrics.lastAcceptedIndex = index;

        if (metrics.timeToFirstChunkMs === null) {
          metrics.timeToFirstChunkMs = now - startedAt;
        }
      } else if (event === "duplicate") {
        metrics.duplicateChunkCount += 1;
      } else {
        metrics.replacedChunkCount += 1;
      }
    },
    [ensureRuntimeStarted],
  );

  const markTransferComplete = useCallback(
    (restoreDurationMs: number) => {
      ensureRuntimeStarted();

      const now = performance.now();
      const metrics = runtimeMetricsRef.current;
      const startedAt = metrics.scannerStartedAtMs ?? now;

      metrics.elapsedMs = now - startedAt;
      metrics.timeToCompleteMs = metrics.timeToCompleteMs ?? now - startedAt;
      metrics.restoreDurationMs = restoreDurationMs;
      setRuntimeMetrics(toRuntimeMetrics(metrics));
    },
    [ensureRuntimeStarted],
  );

  const handleScan = useCallback(
    (qrText: string) => {
      ensureRuntimeStarted();

      const parsed = parsePayloadDetailed(qrText);
      if (!parsed.ok) {
        const preview =
          qrText.length > 140 ? `${qrText.slice(0, 140)}...` : qrText;

        if (parsed.issue === "shape_mismatch") {
          try {
            const parsedRaw: unknown = JSON.parse(qrText);
            if (typeof parsedRaw === "object" && parsedRaw !== null) {
              const record = parsedRaw as Record<string, unknown>;
              setLastReject({
                issue: parsed.issue,
                preview,
                keys: Object.keys(record).slice(0, 20),
                version: String(record.version ?? "-"),
              });
            } else {
              setLastReject({
                issue: parsed.issue,
                preview,
                keys: [],
                version: "-",
              });
            }
          } catch {
            setLastReject({
              issue: parsed.issue,
              preview,
              keys: [],
              version: "-",
            });
          }
        } else {
          setLastReject({
            issue: parsed.issue,
            preview,
            keys: [],
            version: "-",
          });
        }

        if (parsed.issue === "json_parse_error") {
          setDebugStats((prev) => ({ ...prev, jsonParseError: prev.jsonParseError + 1 }));
        } else if (parsed.issue === "shape_mismatch") {
          setDebugStats((prev) => ({ ...prev, shapeMismatch: prev.shapeMismatch + 1 }));
        } else if (parsed.issue === "invalid_total") {
          setDebugStats((prev) => ({ ...prev, invalidTotal: prev.invalidTotal + 1 }));
        } else if (parsed.issue === "invalid_index") {
          setDebugStats((prev) => ({ ...prev, invalidIndex: prev.invalidIndex + 1 }));
        }
        return;
      }
      const payload = parsed.payload;

      setDebugStats((prev) => ({ ...prev, parsedOk: prev.parsedOk + 1 }));

      if (!sessionRef.current) {
        const required = payload.version === 2 ? payload.required : payload.total;

        payloadVersionRef.current = payload.version;
        sessionRef.current = payload.sessionId;
        totalRef.current = payload.total;
        requiredTotalRef.current = required;
        groupCountRef.current = payload.version === 2 ? payload.groupCount : 0;
        checksumRef.current = payload.checksum;
        payloadTypeRef.current = payload.payloadType;

        setPayloadVersion(payload.version);
        setCurrentSessionId(payload.sessionId);
        setTotal(payload.total);
        setRequiredTotal(required);
        setGroupCount(payload.version === 2 ? payload.groupCount : 0);
        setChecksum(payload.checksum);
        setPayloadType(payload.payloadType);
      }

      if (payload.sessionId !== sessionRef.current) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredSessionMismatch: prev.ignoredSessionMismatch + 1,
        }));
        return;
      }

      if (payload.version !== payloadVersionRef.current) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredVersionMismatch: prev.ignoredVersionMismatch + 1,
        }));
        return;
      }

      if (payload.total !== totalRef.current) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredTotalMismatch: prev.ignoredTotalMismatch + 1,
        }));
        return;
      }

      if (
        payload.version === 2 &&
        (payload.required !== requiredTotalRef.current ||
          payload.groupCount !== groupCountRef.current)
      ) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredTotalMismatch: prev.ignoredTotalMismatch + 1,
        }));
        return;
      }

      if (payload.checksum !== checksumRef.current) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredChecksumMismatch: prev.ignoredChecksumMismatch + 1,
        }));
        return;
      }

      if (payload.payloadType !== payloadTypeRef.current) {
        setDebugStats((prev) => ({
          ...prev,
          ignoredTypeMismatch: prev.ignoredTypeMismatch + 1,
        }));
        return;
      }

      if (payload.version === 2) {
        const key = erasureShardKey(payload);
        const existing = erasureShardsRef.current.get(key);

        if (existing && existing.data === payload.data) {
          recordRuntimeEvent("duplicate", payload.index);
          setDebugStats((prev) => ({ ...prev, duplicateChunk: prev.duplicateChunk + 1 }));
          return;
        }

        const next = new Map(erasureShardsRef.current);
        next.set(key, payload);
        erasureShardsRef.current = next;
        setErasureShards(next);
        recordRuntimeEvent(existing ? "replaced" : "accepted", payload.index);
        setDebugStats((prev) =>
          existing
            ? { ...prev, replacedChunk: prev.replacedChunk + 1 }
            : { ...prev, acceptedChunk: prev.acceptedChunk + 1 },
        );
        return;
      }

      const existingChunk = chunksRef.current.get(payload.index);

      if (existingChunk === payload.data) {
        recordRuntimeEvent("duplicate", payload.index);
        setDebugStats((prev) => ({ ...prev, duplicateChunk: prev.duplicateChunk + 1 }));
        return;
      }

      const next = new Map(chunksRef.current);
      next.set(payload.index, payload.data);
      chunksRef.current = next;
      setChunks(next);
      recordRuntimeEvent(
        typeof existingChunk === "string" ? "replaced" : "accepted",
        payload.index,
      );
      setDebugStats((prev) =>
        typeof existingChunk === "string"
          ? { ...prev, replacedChunk: prev.replacedChunk + 1 }
          : { ...prev, acceptedChunk: prev.acceptedChunk + 1 },
      );
    },
    [ensureRuntimeStarted, recordRuntimeEvent],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const metrics = runtimeMetricsRef.current;

      if (metrics.scannerStartedAtMs === null) {
        return;
      }

      const now = performance.now();
      const lastStatsAtMs = metrics.lastStatsAtMs;

      metrics.elapsedMs = now - metrics.scannerStartedAtMs;

      if (lastStatsAtMs !== null) {
        const elapsedMs = now - lastStatsAtMs;
        const acceptedDelta =
          metrics.acceptedChunkCount - metrics.lastStatsAcceptedChunkCount;
        metrics.acceptedChunkPerSec =
          elapsedMs > 0 ? (acceptedDelta / elapsedMs) * 1000 : 0;
      }

      metrics.lastStatsAtMs = now;
      metrics.lastStatsAcceptedChunkCount = metrics.acceptedChunkCount;
      setRuntimeMetrics(toRuntimeMetrics(metrics));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!checksum || total <= 0 || result || !payloadVersion) {
      return;
    }

    if (payloadVersion === 1 && chunks.size !== total) {
      return;
    }

    if (payloadVersion === 2 && !canRestoreErasurePayloads(erasureShards)) {
      return;
    }

    let isCancelled = false;

    const restore = async () => {
      try {
        const restoreStartedAt = performance.now();
        const restored =
          payloadVersion === 2
            ? restoreErasurePayload(erasureShards)
            : restorePayload(chunks, total);
        const restoredChecksum = await sha256(restored);
        const restoreDurationMs = performance.now() - restoreStartedAt;

        if (isCancelled) {
          return;
        }

        if (restoredChecksum !== checksum) {
          setError("復元後checksumが一致しませんでした。");
          return;
        }

        setError(null);
        markTransferComplete(restoreDurationMs);
        setResult(restored);
      } catch (restoreError) {
        const message =
          restoreError instanceof Error
            ? restoreError.message
            : "復元処理に失敗しました。";
        setError(message);
      }
    };

    void restore();

    return () => {
      isCancelled = true;
    };
  }, [
    chunks,
    checksum,
    erasureShards,
    markTransferComplete,
    payloadVersion,
    result,
    total,
  ]);

  const handleCopy = async () => {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("コピーに失敗しました。ブラウザの権限を確認してください。");
    }
  };

  const handleReset = () => {
    payloadVersionRef.current = null;
    sessionRef.current = null;
    totalRef.current = 0;
    requiredTotalRef.current = 0;
    groupCountRef.current = 0;
    checksumRef.current = null;
    payloadTypeRef.current = null;
    setPayloadVersion(null);
    setCurrentSessionId(null);
    setTotal(0);
    setRequiredTotal(0);
    setGroupCount(0);
    setChecksum(null);
    setPayloadType(null);
    chunksRef.current = new Map();
    setChunks(chunksRef.current);
    erasureShardsRef.current = new Map();
    setErasureShards(erasureShardsRef.current);
    setResult("");
    setCopied(false);
    setError(null);
    setLastReject(null);
    setDebugStats(INITIAL_DEBUG_STATS);
    resetRuntimeMetrics();
  };

  const handleCopyMetrics = async () => {
    const summary = {
      generatedAt: new Date().toISOString(),
      sessionId: currentSessionId,
      payloadVersion,
      payloadType,
      total,
      requiredTotal,
      groupCount,
      receivedCount,
      progressTotal,
      debugStats,
      runtimeMetrics,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      setMetricsCopied(true);
      window.setTimeout(() => setMetricsCopied(false), 1200);
    } catch {
      setError("計測サマリーのコピーに失敗しました。ブラウザの権限を確認してください。");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">QR転送 受信側</h1>
        <Link href="/" className="text-sm font-medium text-slate-600 underline">
          トップへ戻る
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <QRScanner
          onScan={handleScan}
          onError={setError}
          onScannerStart={handleScannerStart}
        />

        <div className="space-y-4">
          <TransferProgress
            label="読み取り状況"
            current={receivedCount}
            total={progressTotal}
            indices={receivedIndices}
          />
          {currentSessionId ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
              sessionId: {currentSessionId} / type: {payloadType ?? "-"} / mode:{" "}
              {payloadVersion === 2 ? "erasure" : "legacy"} / total: {total}
              {payloadVersion === 2 ? ` / groups: ${groupCount}` : ""}
            </p>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">読み取り済みindex</h2>
            <p className="mt-2 break-words text-sm text-slate-700">
              {receivedIndices.length > 0 ? receivedIndices.join(", ") : "-"}
            </p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">
              未取得QR index
            </h2>
            <p className="mt-2 break-words text-sm text-slate-700">
              {total <= 0
                ? "-"
                : missingIndices.length > 0
                  ? missingIndices.join(", ")
                  : "なし"}
            </p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">デバッグ</h2>
            <div className="mb-3 grid gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <p>elapsed: {formatMetricMs(runtimeMetrics.elapsedMs)}</p>
              <p>accepted/sec: {formatMetricNumber(runtimeMetrics.acceptedChunkPerSec)}</p>
              <p>time to first chunk: {formatMetricMs(runtimeMetrics.timeToFirstChunkMs)}</p>
              <p>time to complete: {formatMetricMs(runtimeMetrics.timeToCompleteMs)}</p>
              <p>restore duration: {formatMetricMs(runtimeMetrics.restoreDurationMs)}</p>
              <p>runtime accepted: {runtimeMetrics.acceptedChunkCount}</p>
              <p>runtime duplicate: {runtimeMetrics.duplicateChunkCount}</p>
              <p>runtime replaced: {runtimeMetrics.replacedChunkCount}</p>
              <p>last accepted index: {runtimeMetrics.lastAcceptedIndex ?? "-"}</p>
            </div>
            <p>parsed ok: {debugStats.parsedOk}</p>
            <p>json parse error: {debugStats.jsonParseError}</p>
            <p>shape mismatch: {debugStats.shapeMismatch}</p>
            <p>invalid total/index: {debugStats.invalidTotal} / {debugStats.invalidIndex}</p>
            <p>session mismatch: {debugStats.ignoredSessionMismatch}</p>
            <p>total mismatch: {debugStats.ignoredTotalMismatch}</p>
            <p>checksum mismatch: {debugStats.ignoredChecksumMismatch}</p>
            <p>type mismatch: {debugStats.ignoredTypeMismatch}</p>
            <p>version mismatch: {debugStats.ignoredVersionMismatch}</p>
            <p>accepted/duplicate/replaced: {debugStats.acceptedChunk} / {debugStats.duplicateChunk} / {debugStats.replacedChunk}</p>
            {lastReject ? (
              <>
                <p>last reject issue: {lastReject.issue}</p>
                <p>last reject version: {lastReject.version}</p>
                <p>last reject keys: {lastReject.keys.length ? lastReject.keys.join(", ") : "-"}</p>
                <p className="break-all">last reject preview: {lastReject.preview}</p>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void handleCopyMetrics()}
              className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
            >
              {metricsCopied ? "コピー済み" : "計測サマリーをコピー"}
            </button>
          </section>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            リセット
          </button>
        </div>
      </section>

      <ResultViewer
        result={result}
        payloadType={payloadType}
        copied={copied}
        error={error}
        onCopy={handleCopy}
      />
    </main>
  );
}
