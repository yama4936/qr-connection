export type QRPayloadType = "text" | "jpeg";

export type QRPayload = {
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

export const PAYLOAD_VERSION = 1 as const;
export const CHUNK_SIZE = 800;
export const RECOMMENDED_MAX_SIZE = 100 * 1024;
export const HARD_MAX_SIZE = 300 * 1024;
