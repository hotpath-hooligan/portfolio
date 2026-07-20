/**
 * Answer-quality probe for the generation model.
 *
 * Runs the real prompt builder over the real index and prints what the model
 * actually says, next to the top retrieved chunk. The comparison is the point:
 * a small seq2seq model that merely echoes its context is not adding anything
 * over the free extractive path, and that is a product decision, not a bug.
 *
 *   npx tsx scripts/eval-model.ts [modelId]
 */
import { readFile } from 'node:fs/promises';
import { searchBm25 } from '../src/lib/search/bm25.ts';
import { fuse } from '../src/lib/search/fuse.ts';
import { buildPrompt } from '../src/lib/chat/prompt.ts';
import { rejectAnswer, cleanAnswer } from '../src/lib/chat/postprocess.ts';
import type { Bm25Index, Chunk } from '../src/lib/search/types.ts';

const MODEL = process.argv[2] ?? 'Xenova/LaMini-Flan-T5-77M';

const QUESTIONS = [
  'What does he use for authorization?',
  'Tell me about Remote Connect',
  'What databases has he worked with?',
  'Is he certified in anything?',
  'Where did he go to college?',
  'Has he worked with LLMs?',
  'What programming languages does he know?',
];

/** Fraction of the answer's words that appear verbatim, in order, in the context. */
function echoRatio(answer: string, context: string): number {
  const a = answer.toLowerCase().split(/\s+/).filter(Boolean);
  if (a.length === 0) return 1;
  const c = context.toLowerCase();
  let longest = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + longest + 1; j <= a.length; j++) {
      if (c.includes(a.slice(i, j).join(' '))) longest = Math.max(longest, j - i);
      else break;
    }
  }
  return longest / a.length;
}

const chunks: Chunk[] = JSON.parse(await readFile('public/search/chunks.json', 'utf8'));
const bm25: Bm25Index = JSON.parse(await readFile('public/search/bm25.json', 'utf8'));

const { pipeline } = await import('@huggingface/transformers');
console.log(`loading ${MODEL} …`);
const gen: any = await pipeline('text2text-generation', MODEL, { dtype: 'q8' });

let echoSum = 0;
let accepted = 0;
for (const q of QUESTIONS) {
  const results = fuse(chunks, searchBm25(bm25, q, 20), null, 6);
  const prompt = buildPrompt(q, results);
  const t0 = Date.now();
  const out = await gen(prompt, { max_new_tokens: 160, do_sample: false, repetition_penalty: 1.15 });
  const answer = cleanAnswer(String(out[0]?.generated_text ?? ''));

  const context = results.slice(0, 3).map((r) => r.chunk.text).join(' ');
  const echo = echoRatio(answer, context);
  echoSum += echo;

  const rejected = rejectAnswer(answer);
  if (!rejected) accepted++;

  console.log(`\n────────────────────────────────────────`);
  console.log(`Q: ${q}`);
  console.log(`   top chunk : ${results[0]?.chunk.title}`);
  console.log(`   answer    : ${answer}`);
  console.log(`   gate      : ${rejected ? `REJECTED (${rejected}) → snippet fallback` : 'accepted'}`);
  console.log(`   echo      : ${(echo * 100).toFixed(0)}% verbatim   (${Date.now() - t0}ms)`);
}

console.log(`\n────────────────────────────────────────`);
console.log(`gate accepted ${accepted}/${QUESTIONS.length} generated answers`);
console.log(`the rest fall back to extractive snippets, which are always correct`);
console.log(`mean echo ratio: ${((echoSum / QUESTIONS.length) * 100).toFixed(0)}%`);
console.log('(high echo = the model is copying context, not composing an answer)');
