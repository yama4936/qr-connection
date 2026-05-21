"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [showDebug, setShowDebug] = useState(false);
  const [debugStats, setDebugStats] = useState<ReceiveDebugStats>(INITIAL_DEBUG_STATS);
  const [lastReject, setLastReject] = useState<LastReject | null>(null);
  const payloadVersionRef = useRef<1 | 2 | null>(null);
  const sessionRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const requiredTotalRef = useRef(0);
  const groupCountRef = useRef(0);
  const checksumRef = useRef<string | null>(null);
  const payloadTypeRef = useRef<QRPayloadType | null>(null);
  const chunksRef = useRef<Map<number, string>>(new Map());
  const erasureShardsRef = useRef<Map<string, QRPayloadV2>>(new Map());

  const receivedCount = payloadVersion === 2 ? erasureShards.size : chunks.size;
  const progressTotal = requiredTotal || total || 0;
  const remainingRequired =
    progressTotal > 0 ? Math.max(progressTotal - receivedCount, 0) : 0;

  const handleScan = useCallback(
    (qrText: string) => {
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
          setDebugStats((prev) => ({ ...prev, duplicateChunk: prev.duplicateChunk + 1 }));
          return;
        }

        const next = new Map(erasureShardsRef.current);
        next.set(key, payload);
        erasureShardsRef.current = next;
        setErasureShards(next);
        setDebugStats((prev) =>
          existing
            ? { ...prev, replacedChunk: prev.replacedChunk + 1 }
            : { ...prev, acceptedChunk: prev.acceptedChunk + 1 },
        );
        return;
      }

      const existingChunk = chunksRef.current.get(payload.index);

      if (existingChunk === payload.data) {
        setDebugStats((prev) => ({ ...prev, duplicateChunk: prev.duplicateChunk + 1 }));
        return;
      }

      const next = new Map(chunksRef.current);
      next.set(payload.index, payload.data);
      chunksRef.current = next;
      setChunks(next);
      setDebugStats((prev) =>
        typeof existingChunk === "string"
          ? { ...prev, replacedChunk: prev.replacedChunk + 1 }
          : { ...prev, acceptedChunk: prev.acceptedChunk + 1 },
      );
    },
    [],
  );

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
        const restored =
          payloadVersion === 2
            ? restoreErasurePayload(erasureShards)
            : restorePayload(chunks, total);
        const restoredChecksum = await sha256(restored);

        if (isCancelled) {
          return;
        }

        if (restoredChecksum !== checksum) {
          setError("復元後checksumが一致しませんでした。");
          return;
        }

        setError(null);
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
  }, [chunks, checksum, erasureShards, payloadVersion, result, total]);

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
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-3 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4 sm:px-4 sm:py-4 lg:min-h-screen lg:gap-6 lg:px-6 lg:py-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">QR転送 受信側</h1>
        <Link href="/" className="text-sm font-medium text-slate-600 underline">
          トップへ戻る
        </Link>
      </header>

      <section className="grid gap-3 lg:grid-cols-2">
        <QRScanner
          onScan={handleScan}
          onError={setError}
          compact
          showDebug={showDebug}
        />

        <div className="space-y-3">
          <TransferProgress
            label="読み取り状況"
            current={receivedCount}
            total={progressTotal}
          />
          <p className="text-xs text-slate-500">
            未取得（必要分）: {progressTotal > 0 ? `${remainingRequired}件` : "-"}
          </p>
          {currentSessionId ? (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
              sessionId: {currentSessionId} / type: {payloadType ?? "-"} / mode:{" "}
              {payloadVersion === 2 ? "erasure" : "legacy"} / total: {total}
              {payloadVersion === 2 ? ` / groups: ${groupCount}` : ""}
            </p>
          ) : null}

          {showDebug ? (
            <details className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                デバッグ詳細
              </summary>
              <div className="mt-3 space-y-3">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <h2 className="text-sm font-semibold text-slate-700">デバッグ</h2>
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
                </section>
              </div>
            </details>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDebug((prev) => !prev)}
              aria-pressed={showDebug}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                showDebug
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              デバッグ: {showDebug ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              リセット
            </button>
          </div>
        </div>
      </section>

      {result || error ? (
        <ResultViewer
          result={result}
          payloadType={payloadType}
          copied={copied}
          error={error}
          onCopy={handleCopy}
        />
      ) : (
        <section className="hidden rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm lg:block">
          QRを必要数読み取ると、ここに復元結果が表示されます。
        </section>
      )}
    </main>
  );
}
