import pako from 'pako';
import { createHash } from 'node:crypto';
import { encodeErasure } from './lib/erasure.ts';

const ERASURE_SHARD_SIZE = 300;
const DEFAULT_ERASURE_PARITY_RATIO = 0.3;
const sessionId = 'test-session';
const text = 'hello world '.repeat(200);

const checksum = createHash('sha256').update(text).digest('hex');
const compressed = pako.deflate(new TextEncoder().encode(text));
const groupCapacity = 10 * ERASURE_SHARD_SIZE;
const groupCount = Math.max(1, Math.ceil(compressed.length / groupCapacity));

type Payload = Record<string, unknown>;

const groups: {
  groupIndex: number;
  groupSize: number;
  dataShards: number;
  parityShards: number;
  totalShards: number;
  shardSize: number;
  shards: Uint8Array[];
}[] = [];

for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
  const start = groupIndex * groupCapacity;
  const groupBytes = compressed.subarray(start, start + groupCapacity);
  const dataShards = Math.max(1, Math.ceil(groupBytes.length / ERASURE_SHARD_SIZE));
  const parityShards = Math.max(1, Math.ceil(dataShards * DEFAULT_ERASURE_PARITY_RATIO));
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

const payloads: Payload[] = groups.flatMap((group) =>
  group.shards.map((shard, shardIndex) => ({
    version: 2,
    sessionId,
    scheme: 'reed-solomon-erasure',
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
    originalSize: text.length,
    compressedSize: compressed.length,
    encoding: 'base64',
    compression: 'deflate',
    payloadType: 'text',
    data: Buffer.from(shard).toString('base64'),
    checksum,
  })),
);

const out = {
  text,
  payloads,
};

console.log(JSON.stringify(out));
