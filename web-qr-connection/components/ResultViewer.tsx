"use client";

import type { QRPayloadType } from "@/types/qr";

type ResultViewerProps = {
  result: string;
  payloadType: QRPayloadType | null;
  copied: boolean;
  error: string | null;
  onCopy: () => void;
};

export function ResultViewer({
  result,
  payloadType,
  copied,
  error,
  onCopy,
}: ResultViewerProps) {
  const isJpegData = payloadType === "jpeg" && result.startsWith("data:image/jpeg;base64,");
  const isPdfData = payloadType === "pdf" && result.startsWith("data:application/pdf;base64,");

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">復元結果</h2>
      {isJpegData ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result}
            alt="復元されたJPEG"
            className="max-h-80 w-full rounded-md border border-slate-300 object-contain"
          />
          <a
            href={result}
            download="received.jpg"
            className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            JPEGを保存
          </a>
        </div>
      ) : isPdfData ? (
        <div className="space-y-3">
          <a
            href={result}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            PDFを開く
          </a>
          <a
            href={result}
            download="received.pdf"
            className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            PDFを保存
          </a>
        </div>
      ) : (
        <textarea
          value={result}
          readOnly
          className="h-40 w-full resize-y rounded-md border border-slate-300 p-3 text-sm text-slate-800"
          placeholder="QRをすべて読み込むとここに復元結果が表示されます。"
        />
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={onCopy}
        disabled={!result}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {copied ? "コピー済み" : "コピー"}
      </button>
    </section>
  );
}
