"use client";

import Link from "next/link";
import { type ChangeEvent, type DragEvent, useState } from "react";

import { QRPlayer } from "@/components/QRPlayer";
import { uint8ArrayToBase64 } from "@/lib/base64";
import { compressText } from "@/lib/compress";
import { createPayloads } from "@/lib/qrPayload";
import {
  HARD_MAX_SIZE,
  RECOMMENDED_MAX_SIZE,
  type QRPayload,
  type QRPayloadType,
} from "@/types/qr";

const INTERVAL_OPTIONS = [300, 500, 1000] as const;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function isProbablyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let suspicious = 0;

  for (const byte of sample) {
    const isControl =
      byte === 0 || (byte < 7 || (byte > 14 && byte < 32) || byte === 127);
    if (isControl) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length > 0.3;
}

function isJpegFile(file: File): boolean {
  return file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
}

export default function SendPage() {
  const [text, setText] = useState("");
  const [sourceData, setSourceData] = useState("");
  const [sourceType, setSourceType] = useState<QRPayloadType>("text");
  const [payloads, setPayloads] = useState<QRPayload[]>([]);
  const [intervalMs, setIntervalMs] = useState<(typeof INTERVAL_OPTIONS)[number]>(
    500,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [originalBytes, setOriginalBytes] = useState(0);
  const [compressedBytes, setCompressedBytes] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [loadedFileBytes, setLoadedFileBytes] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const resetGeneratedState = () => {
    setPayloads([]);
    setIsPlaying(false);
    setCurrentIndex(0);
    setOriginalBytes(0);
    setCompressedBytes(0);
  };

  const handleGenerate = async () => {
    setError(null);
    setWarning(null);
    setIsPlaying(false);
    setCurrentIndex(0);

    if (sourceType === "text" && !sourceData.trim()) {
      setError("テキストを入力してください。");
      return;
    }

    if (!sourceData) {
      setError("送信するデータがありません。");
      return;
    }

    try {
      const rawBytesLength =
        sourceType === "jpeg" && loadedFileBytes > 0
          ? loadedFileBytes
          : new TextEncoder().encode(sourceData).length;

      if (rawBytesLength > HARD_MAX_SIZE) {
        setPayloads([]);
        setError("300KBを超えるデータはMVPでは送信できません。");
        return;
      }

      if (rawBytesLength > RECOMMENDED_MAX_SIZE) {
        setWarning("100KBを超えています。読み取り失敗率が上がる可能性があります。");
      }

      const compressed = compressText(sourceData);
      const generated = await createPayloads(
        sourceData,
        sourceType,
        sourceType === "jpeg" && loadedFileBytes > 0 ? loadedFileBytes : undefined,
      );

      setOriginalBytes(rawBytesLength);
      setCompressedBytes(compressed.length);
      setPayloads(generated);
      setIsPlaying(true);
    } catch (createError) {
      setPayloads([]);
      const message =
        createError instanceof Error
          ? createError.message
          : "QR生成に失敗しました。";
      setError(message);
    }
  };

  const readFileIntoSource = async (file: File) => {
    setError(null);
    setWarning(null);
    setIsReadingFile(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length > HARD_MAX_SIZE) {
        setError("300KBを超えるファイルはMVPでは送信できません。");
        return;
      }

      if (isJpegFile(file)) {
        const dataUrl = `data:image/jpeg;base64,${uint8ArrayToBase64(bytes)}`;

        setText(`[JPEG] ${file.name}`);
        setSourceData(dataUrl);
        setSourceType("jpeg");
        setLoadedFileName(file.name);
        setLoadedFileBytes(bytes.length);
        resetGeneratedState();

        if (bytes.length > RECOMMENDED_MAX_SIZE) {
          setWarning(
            "100KBを超えるJPEGです。読み取り失敗率が上がる可能性があります。",
          );
        }
        return;
      }

      if (isProbablyBinary(bytes)) {
        setError("このファイル形式は未対応です。UTF-8テキストまたはJPEGを選択してください。");
        return;
      }

      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

      setText(decoded);
      setSourceData(decoded);
      setSourceType("text");
      setLoadedFileName(file.name);
      setLoadedFileBytes(bytes.length);
      resetGeneratedState();

      if (bytes.length > RECOMMENDED_MAX_SIZE) {
        setWarning(
          "100KBを超えるファイルです。読み取り失敗率が上がる可能性があります。",
        );
      }
    } catch {
      setError("ファイルの読み込みに失敗しました。UTF-8テキストまたはJPEGを選択してください。");
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    void readFileIntoSource(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    void readFileIntoSource(file);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    setSourceData(value);
    setSourceType("text");
    setLoadedFileName(null);
    setLoadedFileBytes(0);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">PC → スマホ QR転送</h1>
        <Link href="/" className="text-sm font-medium text-slate-600 underline">
          トップへ戻る
        </Link>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="source-text" className="text-sm font-semibold text-slate-700">
          テキスト入力
        </label>
        <textarea
          id="source-text"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          className="h-48 w-full resize-y rounded-md border border-slate-300 p-3 text-sm text-slate-800"
          placeholder="転送したいテキストやURLを入力"
        />
        {sourceType === "jpeg" && sourceData.startsWith("data:image/jpeg;base64,") ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceData}
              alt="読み込み済みJPEG"
              className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
            />
          </>
        ) : null}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-md border border-dashed p-4 text-sm ${
            isDraggingFile
              ? "border-slate-800 bg-slate-100 text-slate-900"
              : "border-slate-300 bg-slate-50 text-slate-600"
          }`}
        >
          <p>ここにファイルをドロップ（UTF-8テキスト / JPEG）</p>
          <div className="mt-3 flex items-center gap-3">
            <label className="inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              ファイル選択
              <input
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
                disabled={isReadingFile}
                accept=".txt,.md,.json,.csv,.tsv,.log,.yml,.yaml,.xml,.html,.css,.js,.ts,.tsx,.jpg,.jpeg,image/jpeg,text/*,application/json"
              />
            </label>
            <span className="text-xs text-slate-500">
              {isReadingFile ? "読み込み中..." : "txt / md / json / jpeg"}
            </span>
          </div>
          {loadedFileName ? (
            <p className="mt-2 text-xs text-slate-600">
              読み込み済み: {loadedFileName} ({formatBytes(loadedFileBytes)})
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          QR生成
        </button>
        {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <QRPlayer
          key={payloads[0]?.sessionId ?? "empty"}
          payloads={payloads}
          intervalMs={intervalMs}
          isPlaying={isPlaying}
          onCurrentIndexChange={setCurrentIndex}
          onError={setError}
        />

        <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">表示制御</h2>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setIntervalMs(option)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  intervalMs === option
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700"
                }`}
              >
                {option}ms
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              disabled={payloads.length === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              開始
            </button>
            <button
              type="button"
              onClick={() => setIsPlaying(false)}
              disabled={payloads.length === 0}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              停止
            </button>
          </div>
          <div className="space-y-1 text-sm text-slate-700">
            <p>種別: {sourceType === "jpeg" ? "jpeg" : "text"}</p>
            <p>
              現在:{" "}
              {payloads.length > 0 ? `${currentIndex + 1} / ${payloads.length}` : "- / -"}
            </p>
            <p>元データ: {formatBytes(originalBytes)}</p>
            <p>圧縮後: {formatBytes(compressedBytes)}</p>
            <p>QR数: {payloads.length}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
