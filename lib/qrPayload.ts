import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import { joinChunks, splitString } from "@/lib/chunk";
import { sha256 } from "@/lib/checksum";
import { compressText, decompressText } from "@/lib/compress";
import {
  CHUNK_SIZE,
  HARD_MAX_SIZE,
  PAYLOAD_VERSION,
  type QRPayloadType,
  type QRPayload,
} from "@/types/qr";

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isQRPayload(value: unknown): value is QRPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<Record<keyof QRPayload, unknown>>;
  return (
    payload.version === PAYLOAD_VERSION &&
    typeof payload.sessionId === "string" &&
    payload.sessionId.length > 0 &&
    Number.isInteger(payload.index) &&
    Number.isInteger(payload.total) &&
    typeof payload.encoding === "string" &&
    payload.encoding === "base64" &&
    typeof payload.compression === "string" &&
    payload.compression === "deflate" &&
    typeof payload.payloadType === "string" &&
    (payload.payloadType === "text" || payload.payloadType === "jpeg") &&
    typeof payload.data === "string" &&
    typeof payload.checksum === "string"
  );
}

export async function createPayloads(
  text: string,
  payloadType: QRPayloadType = "text",
  originalSizeBytes?: number,
): Promise<QRPayload[]> {
  const rawSizeBytes = originalSizeBytes ?? new TextEncoder().encode(text).length;
  if (rawSizeBytes > HARD_MAX_SIZE) {
    throw new Error(
      `Input is too large. Limit is ${HARD_MAX_SIZE} bytes for MVP.`,
    );
  }

  const compressed = compressText(text);
  const base64 = uint8ArrayToBase64(compressed);
  const chunks = splitString(base64, CHUNK_SIZE);
  const nonEmptyChunks = chunks.length > 0 ? chunks : [""];
  const checksum = await sha256(text);
  const sessionId = createSessionId();

  return nonEmptyChunks.map((chunk, index) => ({
    version: PAYLOAD_VERSION,
    sessionId,
    index,
    total: nonEmptyChunks.length,
    encoding: "base64",
    compression: "deflate",
    payloadType,
    data: chunk,
    checksum,
  }));
}

export function parsePayload(raw: string): QRPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isQRPayload(parsed)) {
      return null;
    }

    if (parsed.total <= 0) {
      return null;
    }

    if (parsed.index < 0 || parsed.index >= parsed.total) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function restorePayload(chunks: Map<number, string>, total: number): string {
  const joined = joinChunks(chunks, total);
  const compressed = base64ToUint8Array(joined);
  return decompressText(compressed);
}
