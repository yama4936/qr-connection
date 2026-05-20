"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { QRScanner } from "@/components/QRScanner";
import { ResultViewer } from "@/components/ResultViewer";
import { TransferProgress } from "@/components/TransferProgress";
import { sha256 } from "@/lib/checksum";
import { parsePayload, restorePayload } from "@/lib/qrPayload";
import type { QRPayloadType } from "@/types/qr";

export default function ReceivePage() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [payloadType, setPayloadType] = useState<QRPayloadType | null>(null);
  const [chunks, setChunks] = useState<Map<number, string>>(new Map());
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const checksumRef = useRef<string | null>(null);
  const payloadTypeRef = useRef<QRPayloadType | null>(null);

  const receivedIndices = useMemo(
    () => Array.from(chunks.keys()).sort((a, b) => a - b),
    [chunks],
  );

  const handleScan = useCallback(
    (qrText: string) => {
      const payload = parsePayload(qrText);
      if (!payload) {
        return;
      }

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
        return;
      }

      if (payload.total !== totalRef.current) {
        return;
      }

      if (payload.checksum !== checksumRef.current) {
        return;
      }

      if (payload.payloadType !== payloadTypeRef.current) {
        return;
      }

      setChunks((prev) => {
        if (prev.has(payload.index)) {
          return prev;
        }

        const next = new Map(prev);
        next.set(payload.index, payload.data);
        return next;
      });
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
    setChunks(new Map());
    setResult("");
    setCopied(false);
    setError(null);
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
