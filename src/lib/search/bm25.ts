import type { Bm25Index, Hit } from './types.ts';
import { tokenizeQuery } from './tokenize.ts';

/** Okapi BM25 free parameters. Standard defaults; the corpus is too small to tune. */
export const K1 = 1.5;
export const B = 0.75;

/**
 * Build the inverted index from already-tokenized documents.
 * Lives here rather than in the build script so the runtime can be tested
 * against an index built by the exact code that ships.
 */
export function buildBm25(docs: string[][]): Bm25Index {
  const postings: Record<string, [number, number][]> = {};
  const docLen: number[] = [];

  docs.forEach((terms, i) => {
    docLen.push(terms.length);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, count] of tf) {
      (postings[term] ??= []).push([i, count]);
    }
  });

  const total = docLen.reduce((a, b) => a + b, 0);
  return {
    N: docs.length,
    avgDocLen: docs.length ? total / docs.length : 0,
    docLen,
    postings,
  };
}

/**
 * Score a raw query string against the index.
 *
 * Uses the standard BM25 IDF with the +1 shift, which keeps the value positive
 * for terms appearing in more than half the corpus — without it, on a corpus
 * this small, a common term like "Ericsson" would score *negatively* and push
 * relevant chunks down.
 */
export function searchBm25(index: Bm25Index, query: string, limit = 20): Hit[] {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const scores = new Map<number, number>();
  const { N, avgDocLen, docLen, postings } = index;

  // A term repeated in the query (or reached twice via aliases) should not be
  // double-counted, so collapse to unique terms first.
  for (const term of new Set(terms)) {
    const list = postings[term];
    if (!list) continue;
    const df = list.length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

    for (const [docId, tf] of list) {
      const norm = tf * (K1 + 1);
      const denom = tf + K1 * (1 - B + (B * docLen[docId]!) / (avgDocLen || 1));
      scores.set(docId, (scores.get(docId) ?? 0) + idf * (norm / denom));
    }
  }

  return [...scores.entries()]
    .map(([index, score]) => ({ index, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
