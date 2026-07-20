/**
 * Answer-quality gate.
 *
 * Measured behaviour of LaMini-Flan-T5-77M on this corpus (scripts/eval-model.ts):
 * it produces a good short answer for roughly two thirds of questions, and for
 * the rest it emits a refusal — "the provided context does not mention…" — even
 * when the answer is sitting in the context it was given.
 *
 * That makes the model *optional* rather than authoritative. This module
 * decides, per answer, whether the generated text is better than the extractive
 * snippet we would otherwise show. If it is not, we fall back. The model can
 * then only ever improve on the free baseline, never degrade it — which is the
 * only defensible way to ship a 77M-parameter model in front of someone's CV.
 *
 * (SmolLM2-135M-Instruct was evaluated as the alternative and rejected: it
 * fabricated databases and job titles outright, which is far worse than a
 * refusal. Prefer a model that fails closed.)
 */

/** The model declining to answer, in the many phrasings it uses. */
const REFUSAL =
  /\b(?:does not|doesn't|do not|don't)\s+(?:contain|provide|mention|specify|have|know)|no (?:information|mention|answer)|not (?:provided|mentioned|specified|clear)|cannot be answered|unable to answer/i;

/** Chat-assistant boilerplate leaking from instruction tuning data. */
const BOILERPLATE =
  /as an ai language model|i'm sorry, but|i am sorry, but|real-time information|could you please (?:provide|clarify)/i;

/**
 * The model often echoes the prompt's own label before its answer
 * ("Answer: Aryan Kapoor studied…"). That is cosmetic, not a quality signal —
 * stripping it rescues genuinely good answers that would otherwise be thrown
 * away, which is where two of the best eval answers were being lost.
 */
const SCAFFOLD_PREFIX = /^(?:answer|context|question)\s*:\s*/i;

/**
 * Any answer that talks *about* its context rather than about Aryan is a
 * failure, however fluent: "Aryan Kapoor's database has been analyzed by the
 * context provided" is grammatical and completely empty.
 */
const META = /\bcontext\b|\bthe (?:provided|given) (?:information|text|passage)\b/i;

/**
 * Detect the degenerate repetition loop small decoders fall into, e.g.
 * "He started as a Software Engineer at Codehall in July 2020. He started as…".
 */
function isRepetitive(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 20) return false;
  // A healthy sentence has high type/token ratio; a loop collapses it.
  const unique = new Set(words).size;
  if (unique / words.length < 0.45) return true;

  // Also catch an exact clause repeated three or more times.
  const clauses = text.split(/[.;]\s+/).map((c) => c.trim().toLowerCase()).filter((c) => c.length > 12);
  const counts = new Map<string, number>();
  for (const c of clauses) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 3);
}

export type Rejection = 'empty' | 'refusal' | 'boilerplate' | 'meta' | 'repetition' | 'too-short';

/** Remove the model's echoed prompt label. Safe to run on any answer. */
export function cleanAnswer(answer: string): string {
  return answer.trim().replace(SCAFFOLD_PREFIX, '').trim();
}

/**
 * Returns the reason the cleaned answer should be discarded, or null if it is
 * worth showing in place of the extractive snippet.
 */
export function rejectAnswer(answer: string): Rejection | null {
  const text = cleanAnswer(answer);
  if (!text) return 'empty';
  if (REFUSAL.test(text)) return 'refusal';
  if (BOILERPLATE.test(text)) return 'boilerplate';
  if (META.test(text)) return 'meta';
  if (isRepetitive(text)) return 'repetition';
  // Anything this short is a fragment, not an answer.
  if (text.split(/\s+/).length < 4) return 'too-short';
  return null;
}

/**
 * Trim an extractive snippet to something readable as a chat reply — the raw
 * chunk opens with generated scaffolding ("X — a project at Ericsson (SDE 3,
 * Nov 2021 to Present).") that reads oddly as an answer.
 */
export function toSnippet(chunkText: string, maxChars = 420): string {
  const text = chunkText.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = cut.lastIndexOf('. ');
  return (lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…');
}
