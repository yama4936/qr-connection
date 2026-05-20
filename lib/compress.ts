import pako from "pako";

export function compressText(text: string): Uint8Array {
  const input = new TextEncoder().encode(text);
  return pako.deflate(input);
}

export function decompressText(data: Uint8Array): string {
  const inflated = pako.inflate(data);
  return new TextDecoder().decode(inflated);
}
