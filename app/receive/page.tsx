"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { QRScanner } from "@/components/QRScanner";
import { ResultViewer } from "@/components/ResultViewer";
import { TransferProgress } from "@/components/TransferProgress";
import { sha256 } from "@/lib/checksum";
import { parsePayloadDetailed, restorePayload } from "@/lib/qrPayload";
import type { QRPayloadType } from "@/types/qr";

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
  duplicateChunk: number;
  acceptedChunk: number;
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
  duplicateChunk: 0,
  acceptedChunk: 0,
};

export default function ReceivePage() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [payloadType, setPayloadType] = useState<QRPayloadType | null>(null);
  const [chunks, setChunks] = useState<Map<number, string>>(new Map());
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<ReceiveDebugStats>(INITIAL_DEBUG_STATS);
  const sessionRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const checksumRef = useRef<string | null>(null);
  const payloadTypeRef = useRef<QRPayloadType | null>(null);
  const chunksRef = useRef<Map<number, string>>(new Map());

  const receivedIndices = useMemo(
    () => Array.from(chunks.keys()).sort((a, b) => a - b),
    [chunks],
  );

  const handleScan = useCallback(
    (qrText: string) => {
      const parsed = parsePayloadDetailed(qrText);
      if (!parsed.ok) {
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
        sessionRef.current = payload.sessionId;
        totalRef.current = payload.total;
        checksumRef.current = payload.checksum;
        payloadTypeRef.current = payload.payloadType;

        setCurrentSessionId(payload.sessionId);
        setTotal(payload.total);
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

      if (payload.total !== totalRef.current) {
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

      if (chunksRef.current.has(payload.index)) {
        setDebugStats((prev) => ({ ...prev, duplicateChunk: prev.duplicateChunk + 1 }));
        return;
      }

      const next = new Map(chunksRef.current);
      next.set(payload.index, payload.data);
      chunksRef.current = next;
      setChunks(next);
      setDebugStats((prev) => ({ ...prev, acceptedChunk: prev.acceptedChunk + 1 }));
    },
    [],
  );

  useEffect(() => {
    if (!checksum || total <= 0 || chunks.size !== total || result) {
      return;
    }

    let isCancelled = false;

    const restore = async () => {
      try {
        const restored = restorePayload(chunks, total);
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
  }, [chunks, checksum, result, total]);

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
    sessionRef.current = null;
    totalRef.current = 0;
    checksumRef.current = null;
    payloadTypeRef.current = null;
    setCurrentSessionId(null);
    setTotal(0);
    setChecksum(null);
    setPayloadType(null);
    chunksRef.current = new Map();
    setChunks(chunksRef.current);
    setResult("");
    setCopied(false);
    setError(null);
    setDebugStats(INITIAL_DEBUG_STATS);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">スマホでQRを読み取り</h1>
        <Link href="/" className="text-sm font-medium text-slate-600 underline">
          トップへ戻る
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <QRScanner onScan={handleScan} onError={setError} />

        <div className="space-y-4">
          <TransferProgress
            label="読み取り状況"
            current={chunks.size}
            total={total || 0}
            indices={receivedIndices}
          />
          {currentSessionId ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
              sessionId: {currentSessionId} / type: {payloadType ?? "-"}
            </p>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">読み取り済みindex</h2>
            <p className="mt-2 break-words text-sm text-slate-700">
              {receivedIndices.length > 0 ? receivedIndices.join(", ") : "-"}
            </p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">デバッグ</h2>
            <p>parsed ok: {debugStats.parsedOk}</p>
            <p>json parse error: {debugStats.jsonParseError}</p>
            <p>shape mismatch: {debugStats.shapeMismatch}</p>
            <p>invalid total/index: {debugStats.invalidTotal} / {debugStats.invalidIndex}</p>
            <p>session mismatch: {debugStats.ignoredSessionMismatch}</p>
            <p>total mismatch: {debugStats.ignoredTotalMismatch}</p>
            <p>checksum mismatch: {debugStats.ignoredChecksumMismatch}</p>
            <p>type mismatch: {debugStats.ignoredTypeMismatch}</p>
            <p>accepted/duplicate: {debugStats.acceptedChunk} / {debugStats.duplicateChunk}</p>
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
