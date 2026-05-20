export type ErasureShard = {
  index: number;
  data: Uint8Array;
};

export type EncodeErasureOptions = {
  dataShards: number;
  parityShards: number;
  shardSize?: number;
};

export type DecodeErasureOptions = {
  dataShards: number;
  parityShards: number;
  shardSize: number;
  originalSize: number;
};

export type EncodedErasure = {
  shards: Uint8Array[];
  shardSize: number;
};

const GF_SIZE = 256;
const GF_POLY = 0x11d;
const MAX_SHARDS = 256;

const EXP_TABLE = new Uint8Array(GF_SIZE * 2);
const LOG_TABLE = new Uint8Array(GF_SIZE);

let value = 1;
for (let index = 0; index < GF_SIZE - 1; index += 1) {
  EXP_TABLE[index] = value;
  LOG_TABLE[value] = index;
  value <<= 1;
  if (value & GF_SIZE) {
    value ^= GF_POLY;
  }
}

for (let index = GF_SIZE - 1; index < EXP_TABLE.length; index += 1) {
  EXP_TABLE[index] = EXP_TABLE[index - (GF_SIZE - 1)];
}

function gfMul(left: number, right: number): number {
  if (left === 0 || right === 0) {
    return 0;
  }

  return EXP_TABLE[LOG_TABLE[left] + LOG_TABLE[right]];
}

function gfDiv(left: number, right: number): number {
  if (right === 0) {
    throw new Error("Cannot divide by zero in GF(256).");
  }

  if (left === 0) {
    return 0;
  }

  return EXP_TABLE[LOG_TABLE[left] + 255 - LOG_TABLE[right]];
}

function gfInv(valueToInvert: number): number {
  return gfDiv(1, valueToInvert);
}

function validateShardCounts(dataShards: number, parityShards: number) {
  if (!Number.isInteger(dataShards) || dataShards <= 0) {
    throw new Error("dataShards must be a positive integer.");
  }

  if (!Number.isInteger(parityShards) || parityShards <= 0) {
    throw new Error("parityShards must be a positive integer.");
  }

  if (dataShards + parityShards > MAX_SHARDS) {
    throw new Error("dataShards + parityShards must be 256 or less.");
  }
}

function createCauchyRows(dataShards: number, parityShards: number): number[][] {
  const rows: number[][] = [];

  for (let row = 0; row < parityShards; row += 1) {
    const coefficients: number[] = [];
    for (let column = 0; column < dataShards; column += 1) {
      coefficients.push(gfInv(row ^ (parityShards + column)));
    }
    rows.push(coefficients);
  }

  return rows;
}

function createEncodingRow(
  shardIndex: number,
  dataShards: number,
  parityRows: number[][],
): number[] {
  if (shardIndex < dataShards) {
    const row = new Array<number>(dataShards).fill(0);
    row[shardIndex] = 1;
    return row;
  }

  const parityIndex = shardIndex - dataShards;
  const row = parityRows[parityIndex];
  if (!row) {
    throw new Error(`Invalid shard index ${shardIndex}.`);
  }

  return row;
}

function invertMatrix(matrix: number[][]): number[][] {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) =>
      columnIndex === rowIndex ? 1 : 0,
    ),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    while (pivotRow < size && augmented[pivotRow][column] === 0) {
      pivotRow += 1;
    }

    if (pivotRow === size) {
      throw new Error("Erasure decode matrix is not invertible.");
    }

    if (pivotRow !== column) {
      const temp = augmented[column];
      augmented[column] = augmented[pivotRow];
      augmented[pivotRow] = temp;
    }

    const pivot = augmented[column][column];
    if (pivot !== 1) {
      const pivotInv = gfInv(pivot);
      for (let targetColumn = 0; targetColumn < size * 2; targetColumn += 1) {
        augmented[column][targetColumn] = gfMul(
          augmented[column][targetColumn],
          pivotInv,
        );
      }
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      if (factor === 0) {
        continue;
      }

      for (let targetColumn = 0; targetColumn < size * 2; targetColumn += 1) {
        augmented[row][targetColumn] ^=
          gfMul(factor, augmented[column][targetColumn]);
      }
    }
  }

  return augmented.map((row) => row.slice(size));
}

function multiplyRowsByShards(
  rows: number[][],
  shards: Uint8Array[],
  shardSize: number,
): Uint8Array[] {
  return rows.map((row) => {
    const output = new Uint8Array(shardSize);

    for (let sourceIndex = 0; sourceIndex < shards.length; sourceIndex += 1) {
      const coefficient = row[sourceIndex];
      if (coefficient === 0) {
        continue;
      }

      const shard = shards[sourceIndex];
      for (let byteIndex = 0; byteIndex < shardSize; byteIndex += 1) {
        output[byteIndex] ^= gfMul(coefficient, shard[byteIndex]);
      }
    }

    return output;
  });
}

export function encodeErasure(
  data: Uint8Array,
  { dataShards, parityShards, shardSize }: EncodeErasureOptions,
): EncodedErasure {
  validateShardCounts(dataShards, parityShards);

  const resolvedShardSize =
    shardSize ?? Math.max(1, Math.ceil(data.length / dataShards));

  if (!Number.isInteger(resolvedShardSize) || resolvedShardSize <= 0) {
    throw new Error("shardSize must be a positive integer.");
  }

  if (data.length > dataShards * resolvedShardSize) {
    throw new Error("Input data does not fit in the requested data shards.");
  }

  const dataParts = Array.from({ length: dataShards }, (_, shardIndex) => {
    const shard = new Uint8Array(resolvedShardSize);
    const start = shardIndex * resolvedShardSize;
    const end = Math.min(start + resolvedShardSize, data.length);
    shard.set(data.subarray(start, end));
    return shard;
  });
  const parityRows = createCauchyRows(dataShards, parityShards);
  const parityParts = multiplyRowsByShards(
    parityRows,
    dataParts,
    resolvedShardSize,
  );

  return {
    shards: [...dataParts, ...parityParts],
    shardSize: resolvedShardSize,
  };
}

export function decodeErasure(
  shards: ErasureShard[],
  { dataShards, parityShards, shardSize, originalSize }: DecodeErasureOptions,
): Uint8Array {
  validateShardCounts(dataShards, parityShards);

  if (shards.length < dataShards) {
    throw new Error("Not enough shards to restore data.");
  }

  if (originalSize > dataShards * shardSize) {
    throw new Error("originalSize exceeds data shard capacity.");
  }

  const totalShards = dataShards + parityShards;
  const uniqueShards = new Map<number, Uint8Array>();

  for (const shard of shards) {
    if (!Number.isInteger(shard.index) || shard.index < 0 || shard.index >= totalShards) {
      throw new Error(`Invalid shard index ${shard.index}.`);
    }

    if (shard.data.length !== shardSize) {
      throw new Error("Shard size mismatch.");
    }

    if (!uniqueShards.has(shard.index)) {
      uniqueShards.set(shard.index, shard.data);
    }
  }

  if (uniqueShards.size < dataShards) {
    throw new Error("Not enough unique shards to restore data.");
  }

  const selected = Array.from(uniqueShards.entries())
    .sort(([left], [right]) => left - right)
    .slice(0, dataShards);
  const parityRows = createCauchyRows(dataShards, parityShards);
  const decodeMatrix = selected.map(([shardIndex]) =>
    createEncodingRow(shardIndex, dataShards, parityRows),
  );
  const invertedMatrix = invertMatrix(decodeMatrix);
  const restoredDataParts = multiplyRowsByShards(
    invertedMatrix,
    selected.map(([, shard]) => shard),
    shardSize,
  );
  const restored = new Uint8Array(dataShards * shardSize);

  restoredDataParts.forEach((shard, shardIndex) => {
    restored.set(shard, shardIndex * shardSize);
  });

  return restored.slice(0, originalSize);
}
