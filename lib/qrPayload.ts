import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import { joinChunks, splitString } from "@/lib/chunk";
import { sha256 } from "@/lib/checksum";
import { compressText, decompressText } from "@/lib/compress";
import { decodeErasure, encodeErasure, type ErasureShard } from "@/lib/erasure";
import {
  CHUNK_SIZE,
  DEFAULT_ERASURE_PARITY_RATIO,
  ERASURE_DATA_SHARDS,
  ERASURE_PAYLOAD_VERSION,
  ERASURE_SHARD_SIZE,
  HARD_MAX_JPEG_SIZE,
  HARD_MAX_PDF_SIZE,
  HARD_MAX_SIZE,
  PAYLOAD_VERSION,
  type QRPayloadType,
  type QRPayload,
  type QRPayloadV1,
  type QRPayloadV2,
} from "@/types/qr";

export type ParsePayloadIssue =
  | "json_parse_error"
  | "shape_mismatch"
  | "invalid_total"
  | "invalid_index";

export type ParsePayloadResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; issue: ParsePayloadIssue };

export type CreateErasurePayloadsOptions = {
  parityRatio?: number;
};

type EncodedErasureGroup = {
  groupIndex: number;
  groupSize: number;
  dataShards: number;
  parityShards: number;
  totalShards: number;
  shardSize: number;
  shards: Uint8Array[];
};

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPayloadType(value: unknown): value is QRPayloadType {
  return value === "text" || value === "jpeg" || value === "pdf";
}

function isQRPayloadV1(value: unknown): value is QRPayloadV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<Record<keyof QRPayloadV1, unknown>>;
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
    isPayloadType(payload.payloadType) &&
    typeof payload.data === "string" &&
    typeof payload.checksum === "string"
  );
}

function isQRPayloadV2(value: unknown): value is QRPayloadV2 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<Record<keyof QRPayloadV2, unknown>>;
  return (
    payload.version === ERASURE_PAYLOAD_VERSION &&
    typeof payload.sessionId === "string" &&
    payload.sessionId.length > 0 &&
    payload.scheme === "reed-solomon-erasure" &&
    Number.isInteger(payload.index) &&
    Number.isInteger(payload.total) &&
    Number.isInteger(payload.required) &&
    Number.isInteger(payload.groupIndex) &&
    Number.isInteger(payload.groupCount) &&
    Number.isInteger(payload.shardIndex) &&
    Number.isInteger(payload.dataShards) &&
    Number.isInteger(payload.parityShards) &&
    Number.isInteger(payload.totalShards) &&
    Number.isInteger(payload.shardSize) &&
    Number.isInteger(payload.groupSize) &&
    Number.isInteger(payload.originalSize) &&
    Number.isInteger(payload.compressedSize) &&
    payload.encoding === "base64" &&
    payload.compression === "deflate" &&
    typeof payload.payloadType === "string" &&
    isPayloadType(payload.payloadType) &&
    typeof payload.data === "string" &&
    typeof payload.checksum === "string"
  );
}

function isQRPayload(value: unknown): value is QRPayload {
  return isQRPayloadV1(value) || isQRPayloadV2(value);
}

function hardMaxSizeFor(payloadType: QRPayloadType): number {
  if (payloadType === "jpeg") {
    return HARD_MAX_JPEG_SIZE;
  }

  if (payloadType === "pdf") {
    return HARD_MAX_PDF_SIZE;
  }

  return HARD_MAX_SIZE;
}

function assertInputSize(
  rawSizeBytes: number,
  payloadType: QRPayloadType,
): void {
  const hardMaxSize = hardMaxSizeFor(payloadType);
  if (rawSizeBytes > hardMaxSize) {
    throw new Error(
      `Input is too large. Limit is ${hardMaxSize} bytes for ${payloadType}.`,
    );
  }
}

function combineBytes(parts: Uint8Array[], totalSize: number): Uint8Array {
  const output = new Uint8Array(totalSize);
  let offset = 0;

  for (const part of parts) {
    output.set(part.subarray(0, Math.min(part.length, totalSize - offset)), offset);
    offset += part.length;
    if (offset >= totalSize) {
      break;
    }
  }

  return output;
}

function erasureGroupCapacity(): number {
  return ERASURE_DATA_SHARDS * ERASURE_SHARD_SIZE;
}

function parityShardsFor(dataShards: number, parityRatio: number): number {
  if (!Number.isFinite(parityRatio) || parityRatio <= 0) {
    throw new Error("parityRatio must be greater than 0.");
  }

  return Math.max(1, Math.ceil(dataShards * parityRatio));
}

export async function createPayloads(
  text: string,
  payloadType: QRPayloadType = "text",
  originalSizeBytes?: number,
): Promise<QRPayload[]> {
  const rawSizeBytes = originalSizeBytes ?? new TextEncoder().encode(text).length;
  assertInputSize(rawSizeBytes, payloadType);

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

export async function createErasurePayloads(
  text: string,
  payloadType: QRPayloadType = "text",
  originalSizeBytes?: number,
  options: CreateErasurePayloadsOptions = {},
): Promise<QRPayloadV2[]> {
  const rawSizeBytes = originalSizeBytes ?? new TextEncoder().encode(text).length;
  assertInputSize(rawSizeBytes, payloadType);

  const compressed = compressText(text);
  const checksum = await sha256(text);
  const sessionId = createSessionId();
  const parityRatio = options.parityRatio ?? DEFAULT_ERASURE_PARITY_RATIO;
  const groupCapacity = erasureGroupCapacity();
  const groupCount = Math.max(1, Math.ceil(compressed.length / groupCapacity));
  const groups: EncodedErasureGroup[] = [];

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const start = groupIndex * groupCapacity;
    const groupBytes = compressed.subarray(start, start + groupCapacity);
    const dataShards = Math.max(
      1,
      Math.ceil(groupBytes.length / ERASURE_SHARD_SIZE),
    );
    const parityShards = parityShardsFor(dataShards, parityRatio);
    const encoded = encodeErasure(groupBytes, {
      dataShards,
      parityShards,
      shardSize: ERASURE_SHARD_SIZE,
    });

    groups.push({
      groupIndex,
      groupSize: groupBytes.length,
      dataShards,
      parityShards,
      totalShards: dataShards + parityShards,
      shardSize: encoded.shardSize,
      shards: encoded.shards,
    });
  }

  const required = groups.reduce((sum, group) => sum + group.dataShards, 0);
  const total = groups.reduce((sum, group) => sum + group.totalShards, 0);
  let globalIndex = 0;

  return groups.flatMap((group) =>
    group.shards.map((shard, shardIndex) => ({
      version: ERASURE_PAYLOAD_VERSION,
      sessionId,
      scheme: "reed-solomon-erasure",
      index: globalIndex++,
      total,
      required,
      groupIndex: group.groupIndex,
      groupCount,
      shardIndex,
      dataShards: group.dataShards,
      parityShards: group.parityShards,
      totalShards: group.totalShards,
      shardSize: group.shardSize,
      groupSize: group.groupSize,
      originalSize: rawSizeBytes,
      compressedSize: compressed.length,
      encoding: "base64",
      compression: "deflate",
      payloadType,
      data: uint8ArrayToBase64(shard),
      checksum,
    })),
  );
}

export function parsePayload(raw: string): QRPayload | null {
  const result = parsePayloadDetailed(raw);
  return result.ok ? result.payload : null;
}

export function parsePayloadDetailed(raw: string): ParsePayloadResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isQRPayload(parsed)) {
      return { ok: false, issue: "shape_mismatch" };
    }

    if (parsed.total <= 0) {
      return { ok: false, issue: "invalid_total" };
    }

    if (parsed.index < 0 || parsed.index >= parsed.total) {
      return { ok: false, issue: "invalid_index" };
    }

    if (parsed.version === ERASURE_PAYLOAD_VERSION) {
      if (parsed.required <= 0 || parsed.required > parsed.total) {
        return { ok: false, issue: "invalid_total" };
      }

      if (
        parsed.groupCount <= 0 ||
        parsed.groupIndex < 0 ||
        parsed.groupIndex >= parsed.groupCount ||
        parsed.dataShards <= 0 ||
        parsed.parityShards <= 0 ||
        parsed.totalShards !== parsed.dataShards + parsed.parityShards ||
        parsed.shardIndex < 0 ||
        parsed.shardIndex >= parsed.totalShards ||
        parsed.shardSize <= 0 ||
        parsed.groupSize < 0 ||
        parsed.groupSize > parsed.dataShards * parsed.shardSize ||
        parsed.originalSize < 0 ||
        parsed.compressedSize < 0
      ) {
        return { ok: false, issue: "invalid_index" };
      }
    }

    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, issue: "json_parse_error" };
  }
}

export function restorePayload(chunks: Map<number, string>, total: number): string {
  const joined = joinChunks(chunks, total);
  const compressed = base64ToUint8Array(joined);
  return decompressText(compressed);
}

export function erasureShardKey(payload: QRPayloadV2): string {
  return `${payload.groupIndex}:${payload.shardIndex}`;
}

export function canRestoreErasurePayloads(
  shards: Map<string, QRPayloadV2>,
): boolean {
  const first = shards.values().next().value;
  if (!first) {
    return false;
  }

  for (let groupIndex = 0; groupIndex < first.groupCount; groupIndex += 1) {
    let received = 0;
    let required = 0;

    for (const shard of shards.values()) {
      if (shard.groupIndex !== groupIndex) {
        continue;
      }

      received += 1;
      required = shard.dataShards;
    }

    if (received < required || required === 0) {
      return false;
    }
  }

  return true;
}

export function restoreErasurePayload(
  shards: Map<string, QRPayloadV2>,
): string {
  const first = shards.values().next().value;
  if (!first) {
    throw new Error("No erasure shards available.");
  }

  const restoredGroups: Uint8Array[] = [];

  for (let groupIndex = 0; groupIndex < first.groupCount; groupIndex += 1) {
    const groupPayloads = Array.from(shards.values()).filter(
      (shard) => shard.groupIndex === groupIndex,
    );
    const groupHeader = groupPayloads[0];

    if (!groupHeader || groupPayloads.length < groupHeader.dataShards) {
      throw new Error(`Not enough shards for group ${groupIndex}.`);
    }

    const erasureShards: ErasureShard[] = groupPayloads.map((payload) => ({
      index: payload.shardIndex,
      data: base64ToUint8Array(payload.data),
    }));
    const restoredGroup = decodeErasure(erasureShards, {
      dataShards: groupHeader.dataShards,
      parityShards: groupHeader.parityShards,
      shardSize: groupHeader.shardSize,
      originalSize: groupHeader.groupSize,
    });

    restoredGroups.push(restoredGroup);
  }

  const compressed = combineBytes(restoredGroups, first.compressedSize);
  return decompressText(compressed);
}
