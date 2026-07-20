import type { RankedResult } from '../search/types.ts';

/**
 * How many retrieved chunks to place in the prompt.
 *
 * Two, not three, and measured rather than guessed: with three chunks the model
 * answered 2/6 eval questions, with two it answered 4/6. The third chunk is
 * usually only loosely related, and a 77M model reads that dilution as "the
 * context doesn't cover this" and refuses. Retrieval quality matters more than
 * retrieval quantity at this model size.
 */
export const CONTEXT_CHUNKS = 2;
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
  // No [1] [2] numbering: the markers gave the model something to talk about
  // instead of answering, and it cannot produce citations anyway — those come
  // from the retriever, which actually knows the provenance.
  const context = results
    .slice(0, CONTEXT_CHUNKS)
    .map((r) => {
      const text = r.chunk.text.replace(/\s+/g, ' ').trim();
      return text.length > CHUNK_CHARS ? text.slice(0, CHUNK_CHARS) + '…' : text;
    })
    .join(' ');

  // Note the absence of "if the context doesn't contain the answer, say you
  // don't know". That clause is standard RAG advice and it actively breaks a
  // 77M model: measured over the eval set it caused false refusals on 4 of 7
  // questions whose answers were sitting in the retrieved context. The escape
  // hatch is easier for a small model to reach for than the actual answer.
  //
  // We can drop it because refusal is already handled upstream and better:
  // GROUNDING_THRESHOLD in fuse.ts decides whether there is anything worth
  // answering from, and the model is never called when there isn't. One
  // decision, made by the component that has the evidence to make it.
  // The instruction line stays. Dropping it (bare SQuAD-style context +
  // question) made the model fluent but ungrounded — in evaluation it invented
  // "He has worked with LLMs for several years" from context that said no such
  // thing. With the instruction it refuses instead, and a refusal is
  // recoverable: postprocess.ts catches it and falls back to the snippet.
  return [
    'Answer the question about Aryan Kapoor using the context below.',
    '',
    `Context: ${context}`,
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
