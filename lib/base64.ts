const BYTE_BLOCK_SIZE = 0x8000;

export function uint8ArrayToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < data.length; i += BYTE_BLOCK_SIZE) {
    const chunk = data.subarray(i, i + BYTE_BLOCK_SIZE);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
