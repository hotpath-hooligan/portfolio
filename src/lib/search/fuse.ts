import type { Chunk, Hit, RankedResult } from './types.ts';

/**
 * RRF smoothing constant. 60 is the value from the original Cormack et al.
 * paper and is not sensitive at this corpus size.
 */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion.
 *
 * We fuse on RANK, not score, deliberately: BM25 scores are unbounded sums of
 * IDF terms while cosine sits in [-1, 1], so any weighted blend of the raw
 * numbers would need normalisation constants that drift every time content is
 * added. Ranks are already commensurable.
 */
export function rrf(lists: Hit[][], limit = 8): Hit[] {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      scores.set(hit.index, (scores.get(hit.index) ?? 0) + 1 / (RRF_K + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([index, score]) => ({ index, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Fuse BM25 and (optional) vector hits into presentable results.
 *
 * `vectorHits` is null in Tier 1, before the embedding model is downloaded —
 * fusion then degrades to plain BM25 ordering, which is exactly what we want.
 */
export function fuse(
  chunks: Chunk[],
  bm25Hits: Hit[],
  vectorHits: Hit[] | null,
  limit = 8,
): RankedResult[] {
  const bm25Rank = new Map(bm25Hits.map((h, i) => [h.index, i]));
  const vectorRank = new Map((vectorHits ?? []).map((h, i) => [h.index, i]));

  const lists = vectorHits ? [bm25Hits, vectorHits] : [bm25Hits];
  return rrf(lists, limit).map(({ index, score }) => ({
    chunk: chunks[index]!,
    score,
    bm25Rank: bm25Rank.get(index) ?? null,
    vectorRank: vectorRank.get(index) ?? null,
  }));
}

/**
 * Minimum fused score for an answer to be considered grounded.
 *
 * A single retriever placing a chunk first contributes 1/61 ≈ 0.0164; both
 * retrievers agreeing on first place gives ≈ 0.0328. This threshold accepts a
 * lone top-3 hit but rejects the long tail, which is what stops a 77M-parameter
 * model being handed irrelevant context and inventing a job history from it.
 */
export const GROUNDING_THRESHOLD = 1 / (RRF_K + 3);

export function isGrounded(results: RankedResult[]): boolean {
  return results.length > 0 && results[0]!.score >= GROUNDING_THRESHOLD;
}
