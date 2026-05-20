export type QRPayloadType = "text" | "jpeg" | "pdf";

export type QRPayloadV1 = {
  version: 1;
  sessionId: string;
  index: number;
  total: number;
  encoding: "base64";
  compression: "deflate";
  payloadType: QRPayloadType;
  data: string;
  checksum: string;
};

export type QRPayloadV2 = {
  version: 2;
  sessionId: string;
  scheme: "reed-solomon-erasure";
  index: number;
  total: number;
  required: number;
  groupIndex: number;
  groupCount: number;
  shardIndex: number;
  dataShards: number;
  parityShards: number;
  totalShards: number;
  shardSize: number;
  groupSize: number;
  originalSize: number;
  compressedSize: number;
  encoding: "base64";
  compression: "deflate";
  payloadType: QRPayloadType;
  data: string;
  checksum: string;
};

export type QRPayload = QRPayloadV1 | QRPayloadV2;

export const PAYLOAD_VERSION = 1 as const;
export const ERASURE_PAYLOAD_VERSION = 2 as const;
// Keep QR density lower for mobile camera stability.
export const CHUNK_SIZE = 450;
export const ERASURE_SHARD_SIZE = 300;
export const ERASURE_DATA_SHARDS = 10;
export const DEFAULT_ERASURE_PARITY_RATIO = 0.3;
export const RECOMMENDED_MAX_SIZE = 100 * 1024;
export const HARD_MAX_JPEG_SIZE = 2 * 1024 * 1024;
export const HARD_MAX_PDF_SIZE = 2 * 1024 * 1024;
export const HARD_MAX_SIZE = 300 * 1024;
