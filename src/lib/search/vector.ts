import type { Hit } from './types.ts';

/**
 * Doc vectors are L2-normalised float32, then quantised to int8 with one scale
 * per vector. At 384 dims that is 384 bytes + 4 bytes per chunk — roughly 46 KB
 * for this corpus, versus 184 KB as float32, with negligible ranking impact.
 *
 * Layout of `vectors.bin`:
 *   [0, N*4)                float32 scales, one per chunk
 *   [N*4, N*4 + N*dims)     int8 components, row-major
 */
export interface VectorStore {
  count: number;
  dims: number;
  scales: Float32Array;
  data: Int8Array;
}

/** Quantise one L2-normalised vector to int8 plus a scale. */
export function quantize(vec: Float32Array): { q: Int8Array; scale: number } {
  let max = 0;
  for (const v of vec) {
    const a = Math.abs(v);
    if (a > max) max = a;
  }
  // A zero vector would produce scale 0 and NaN on dequantise.
  const scale = max === 0 ? 1 : max / 127;
  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    q[i] = Math.max(-127, Math.min(127, Math.round(vec[i]! / scale)));
  }
  return { q, scale };
}

/** Pack quantised vectors into the single binary blob described above. */
export function packVectors(vectors: Float32Array[], dims: number): Uint8Array {
  const n = vectors.length;
  const buf = new ArrayBuffer(n * 4 + n * dims);
  const scales = new Float32Array(buf, 0, n);
  const data = new Int8Array(buf, n * 4, n * dims);
  vectors.forEach((v, i) => {
    const { q, scale } = quantize(v);
    scales[i] = scale;
    data.set(q, i * dims);
  });
  return new Uint8Array(buf);
}

export function unpackVectors(buf: ArrayBuffer, count: number, dims: number): VectorStore {
  return {
    count,
    dims,
    scales: new Float32Array(buf, 0, count),
    data: new Int8Array(buf, count * 4, count * dims),
  };
}

/**
 * Cosine similarity against every chunk. The query vector stays float32 — only
 * the stored side is quantised — so we take the dot product directly and apply
 * the per-row scale once at the end rather than dequantising into a temporary.
 *
 * Brute force is correct here: 120 chunks x 384 dims is ~46k multiply-adds,
 * microseconds in JS. An ANN index at this size would be pure ceremony.
 */
export function searchVectors(store: VectorStore, query: Float32Array, limit = 20): Hit[] {
  const { count, dims, scales, data } = store;
  const hits: Hit[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * dims;
    let dot = 0;
    for (let d = 0; d < dims; d++) dot += query[d]! * data[base + d]!;
    hits.push({ index: i, score: dot * scales[i]! });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** L2-normalise in place and return the same array, for chaining. */
export function normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
  }
  return vec;
}
