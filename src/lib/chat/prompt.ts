import type { RankedResult } from '../search/types.ts';

/** How many retrieved chunks to place in the prompt. */
export const CONTEXT_CHUNKS = 3;
/** Character budget per chunk. LaMini's encoder window is 512 tokens total. */
const CHUNK_CHARS = 600;

/**
 * Build the seq2seq prompt for LaMini-Flan-T5.
 *
 * T5 is trained on short, imperative task descriptions, not chat transcripts —
 * a long system-prompt preamble measurably degrades a 77M model rather than
 * steering it. The instruction is therefore one line, placed before the
 * context, with the question last so it sits closest to the generation point.
 */
export function buildPrompt(query: string, results: RankedResult[]): string {
  const context = results
    .slice(0, CONTEXT_CHUNKS)
    .map((r, i) => {
      const text = r.chunk.text.replace(/\s+/g, ' ').trim();
      const clipped = text.length > CHUNK_CHARS ? text.slice(0, CHUNK_CHARS) + '…' : text;
      return `[${i + 1}] ${clipped}`;
    })
    .join('\n');

  return [
    'Answer the question about Aryan Kapoor using only the context below.',
    "If the context does not contain the answer, say you don't know.",
    '',
    'Context:',
    context,
    '',
    `Question: ${query}`,
    'Answer:',
  ].join('\n');
}

/**
 * Shown instead of calling the model when retrieval found nothing above the
 * grounding threshold. Refusing at the retrieval layer is far more reliable
 * than hoping a 77M model honours "say you don't know" — it has no relevant
 * context to be faithful to, so anything it produces would be invention.
 */
export function ungroundedReply(nearest: RankedResult[]): string {
  const topics = nearest.slice(0, 3).map((r) => r.chunk.title);
  const suggestion = topics.length
    ? ` You could ask about ${topics.slice(0, 2).join(' or ')} instead.`
    : '';
  return `I don't have anything on this site about that.${suggestion}`;
}
