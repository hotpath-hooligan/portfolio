/** Wire format for the compile-time index in `public/search/`. */

/** One retrievable unit of content. Kept small — this JSON ships to everyone. */
export interface Chunk {
  /** Stable across builds: `${collection}/${slug}#${n}`. */
  id: string;
  collection: string;
  /** Human-facing source name, e.g. "Ericsson · Remote Connect". */
  title: string;
  /** Deep link to the rendered section, e.g. "/#remote-connect". */
  url: string;
  /** Raw prose. This is what gets embedded and what the LLM sees as context. */
  text: string;
  /**
   * Extra terms folded into the BM25 index only — never embedded, never shown
   * as a citation, never placed in the LLM prompt.
   *
   * Exists because the vocabulary people search with is not always the
   * vocabulary good prose uses: nobody writes "he graduated from this college
   * and university" in a bio, but plenty of visitors type "where did he go to
   * college". Keeping these out of `text` means the retrieval fix cannot leak
   * into the generated answer as stilted phrasing.
   */
  keywords?: string;
}

export interface Bm25Index {
  /** Document count. */
  N: number;
  avgDocLen: number;
  /** Token count per chunk, parallel to `chunks`. */
  docLen: number[];
  /**
   * term -> [chunkIndex, termFrequency][]. Document frequency is the posting
   * list length, so it is not stored separately.
   */
  postings: Record<string, [number, number][]>;
}

export interface Manifest {
  /** Content hash; used for cache-busting the fetch. */
  hash: string;
  chunkCount: number;
  /** Embedding dimensionality (384 for all-MiniLM-L6-v2). */
  dims: number;
  embedModel: string;
  builtAt: string;
}

/** A scored hit, before or after fusion. */
export interface Hit {
  index: number;
  score: number;
}

export interface RankedResult {
  chunk: Chunk;
  score: number;
  /** Per-retriever ranks, for debugging and for the "why this?" affordance. */
  bm25Rank: number | null;
  vectorRank: number | null;
}
