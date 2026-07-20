import { tokenize } from '../src/lib/search/tokenize.ts';
import type { Chunk } from '../src/lib/search/types.ts';

/** Target chunk size in tokens; chunks below MIN are merged into their neighbour. */
export const TARGET_TOKENS = 160;
export const MIN_TOKENS = 25;
export const OVERLAP_TOKENS = 30;

export { slugify } from '../src/lib/slug.ts';

/** Strip markdown syntax and HTML comments down to plain prose for embedding. */
export function toPlainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments (the TODO stubs)
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split long prose on paragraph boundaries, packing paragraphs up to
 * TARGET_TOKENS and carrying OVERLAP_TOKENS of trailing context into the next
 * chunk so a sentence spanning a boundary stays retrievable from both sides.
 *
 * Paragraph-aligned splitting beats fixed windows here because the source is
 * hand-written prose, not a transcript — mid-sentence cuts would show up
 * directly in the citations we render under each answer.
 */
export function splitProse(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const out: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const p of paragraphs) {
    const n = tokenize(p).length;
    if (currentTokens > 0 && currentTokens + n > TARGET_TOKENS) {
      out.push(current.join('\n\n'));
      // Carry the tail of the previous chunk forward as overlap.
      const tail = current[current.length - 1] ?? '';
      const tailWords = tail.split(/\s+/);
      current =
        tailWords.length > OVERLAP_TOKENS
          ? [tailWords.slice(-OVERLAP_TOKENS).join(' ')]
          : [tail];
      currentTokens = tokenize(current[0] ?? '').length;
    }
    current.push(p);
    currentTokens += n;
  }
  if (current.length) out.push(current.join('\n\n'));

  // Fold a runt final chunk back into its predecessor.
  if (out.length > 1 && tokenize(out[out.length - 1]!).length < MIN_TOKENS) {
    const last = out.pop()!;
    out[out.length - 1] += '\n\n' + last;
  }
  return out;
}

/** Helper for assembling a chunk with a generated id. */
export function makeChunk(
  collection: string,
  slug: string,
  n: number,
  title: string,
  url: string,
  text: string,
  keywords?: string,
): Chunk {
  const chunk: Chunk = {
    id: `${collection}/${slug}#${n}`,
    collection,
    title,
    url,
    text: text.trim(),
  };
  if (keywords) chunk.keywords = keywords;
  return chunk;
}
