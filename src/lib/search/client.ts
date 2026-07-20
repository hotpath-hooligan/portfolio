import type { Bm25Index, Chunk, Manifest, RankedResult } from './types.ts';
import { searchBm25 } from './bm25.ts';
import { searchVectors, unpackVectors, type VectorStore } from './vector.ts';
import { fuse, isGrounded } from './fuse.ts';

const BASE = '/search';

export interface SearchIndex {
  manifest: Manifest;
  chunks: Chunk[];
  bm25: Bm25Index;
  vectors: VectorStore;
}

let cached: Promise<SearchIndex> | null = null;

/**
 * Fetch the compile-time index. ~26 KB total, so it loads on first chat open
 * with no user-visible delay — this is the Tier 1 path every visitor gets
 * without downloading a model.
 */
export function loadIndex(): Promise<SearchIndex> {
  cached ??= (async () => {
    const manifest: Manifest = await fetch(`${BASE}/manifest.json`).then((r) => r.json());
    // Hash-busting: content changes produce a new hash, so a stale CDN copy of
    // chunks.json can never pair with a fresh vectors.bin.
    const v = `?v=${manifest.hash}`;
    const [chunks, bm25, vectorBuf] = await Promise.all([
      fetch(`${BASE}/chunks.json${v}`).then((r) => r.json()),
      fetch(`${BASE}/bm25.json${v}`).then((r) => r.json()),
      fetch(`${BASE}/vectors.bin${v}`).then((r) => r.arrayBuffer()),
    ]);
    return {
      manifest,
      chunks,
      bm25,
      vectors: unpackVectors(vectorBuf, manifest.chunkCount, manifest.dims),
    };
  })();
  return cached;
}

export interface SearchResult {
  results: RankedResult[];
  grounded: boolean;
  /** True when the vector retriever contributed (i.e. the embedder is loaded). */
  hybrid: boolean;
}

/**
 * Retrieve for a query. `queryVector` is null until the embedding model has
 * been downloaded, in which case this degrades to pure BM25 rather than
 * failing — Tier 1 must stay fully functional.
 */
export function search(
  index: SearchIndex,
  query: string,
  queryVector: Float32Array | null,
  limit = 6,
): SearchResult {
  const bm25Hits = searchBm25(index.bm25, query, 20);
  const vectorHits = queryVector ? searchVectors(index.vectors, queryVector, 20) : null;
  const results = fuse(index.chunks, bm25Hits, vectorHits, limit);
  return { results, grounded: isGrounded(results), hybrid: vectorHits !== null };
}
