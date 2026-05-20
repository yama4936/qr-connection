export function splitString(input: string, chunkSize: number): string[] {
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0.");
  }

  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }

  return chunks;
}

export function joinChunks(chunks: Map<number, string>, total: number): string {
  if (total <= 0) {
    throw new Error("total must be greater than 0.");
  }

  let merged = "";
  for (let index = 0; index < total; index += 1) {
    const value = chunks.get(index);
    if (typeof value !== "string") {
      throw new Error(`Missing chunk at index ${index}.`);
    }
    merged += value;
  }

  return merged;
}
