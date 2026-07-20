/**
 * Compile-time index builder.
 *
 * Reads `src/content/ * * / *.md` directly (via gray-matter) rather than through
 * Astro's content layer, so it stays a plain Node script that can be run and
 * tested on its own — `npm run build:index`.
 *
 * Emits into `public/search/`:
 *   chunks.json    the retrievable units, with deep links
 *   bm25.json      inverted index
 *   vectors.bin    int8-quantised MiniLM embeddings
 *   manifest.json  hash + shape, for cache-busting
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import matter from 'gray-matter';

import { tokenize } from '../src/lib/search/tokenize.ts';
import { buildBm25 } from '../src/lib/search/bm25.ts';
import { packVectors, normalize } from '../src/lib/search/vector.ts';
import type { Chunk, Manifest } from '../src/lib/search/types.ts';
import { slugify, toPlainText, splitProse, makeChunk } from './chunk.ts';

const CONTENT_DIR = 'src/content';
const OUT_DIR = 'public/search';
const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIMS = 384;

interface Entry {
  slug: string;
  data: Record<string, any>;
  body: string;
}

async function readCollection(name: string): Promise<Entry[]> {
  let files: string[];
  try {
    files = await readdir(join(CONTENT_DIR, name));
  } catch {
    return [];
  }
  const entries: Entry[] = [];
  for (const f of files.filter((f) => extname(f) === '.md')) {
    const raw = await readFile(join(CONTENT_DIR, name, f), 'utf8');
    const { data, content } = matter(raw);
    // Draft entries are excluded from the index entirely. The chat citing a
    // half-written TODO stub as fact would be worse than it not knowing.
    if (data.draft === true) continue;
    entries.push({ slug: basename(f, '.md'), data, body: toPlainText(content) });
  }
  return entries;
}

/** Chunk each collection using its structure rather than blind text splitting. */
async function collectChunks(): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  // --- Experience: one chunk for the tenure, one per named workstream. -----
  // Splitting on highlights is what lets the chat answer "tell me about Remote
  // Connect" with just that project instead of the whole Ericsson entry.
  for (const e of await readCollection('experience')) {
    const { company, role, start, end, summary, highlights = [] } = e.data;
    const anchor = `/#${slugify(company)}`;
    const current = String(end).toLowerCase() === 'present';
    const header = current
      ? `Aryan Kapoor currently works as ${role} at ${company}, since ${start}.`
      : `Aryan Kapoor previously worked as ${role} at ${company}, from ${start} to ${end}.`;
    // "What did he do before X" is a common question that no single chunk
    // answers lexically, since a past role never names the role that followed
    // it. These keywords give past roles the vocabulary to be found that way.
    const tenureKeywords = current
      ? 'current present now latest recent job role employer company'
      : 'previous former prior past earlier before ex last job role employer company';
    chunks.push(
      makeChunk(
        'experience',
        e.slug,
        0,
        `${company} · ${role}`,
        anchor,
        [header, summary, e.body].filter(Boolean).join('\n\n'),
        tenureKeywords,
      ),
    );
    highlights.forEach((h: any, i: number) => {
      const tech = h.tech?.length ? `\n\nTechnologies: ${h.tech.join(', ')}.` : '';
      chunks.push(
        makeChunk(
          'experience',
          e.slug,
          i + 1,
          `${company} · ${h.name}`,
          `/#${slugify(h.name)}`,
          `${h.name} — a project at ${company} (${role}, ${start} to ${end}).\n\n${h.detail}${tech}`,
        ),
      );
    });
  }

  // --- Projects: blurb + body, split if the body runs long. ---------------
  for (const p of await readCollection('projects')) {
    const { title, blurb, stack = [], repo } = p.data;
    const url = `/projects/${p.slug}/`;
    const head = [
      `${title} is a personal project by Aryan Kapoor.`,
      blurb,
      stack.length ? `Built with ${stack.join(', ')}.` : '',
      repo ? `Source: ${repo}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const parts = splitProse([head, p.body].filter(Boolean).join('\n\n'));
    parts.forEach((text, i) => chunks.push(makeChunk('projects', p.slug, i, title, url, text)));
  }

  // --- Skills: one chunk per group, plus the prose. ------------------------
  // Per-group chunks keep "what databases does he know" from retrieving the
  // entire skills matrix, where the answer would be buried among 40 terms.
  for (const s of await readCollection('skills')) {
    const groups = s.data.groups ?? [];
    groups.forEach((g: any, i: number) => {
      chunks.push(
        makeChunk(
          'skills',
          s.slug,
          i,
          `Skills · ${g.name}`,
          '/#skills',
          `Aryan Kapoor's ${g.name} skills: ${g.items.join(', ')}.`,
        ),
      );
    });
    if (s.body) {
      chunks.push(
        makeChunk('skills', s.slug, groups.length, 'Skills · Overview', '/#skills', s.body),
      );
    }
  }

  // --- Certifications -----------------------------------------------------
  for (const c of await readCollection('certifications')) {
    const { name, issuer, credentialId, date } = c.data;
    chunks.push(
      makeChunk(
        'certifications',
        c.slug,
        0,
        name,
        '/#certifications',
        [
          `${name} — a certification held by Aryan Kapoor, issued by ${issuer} in ${date}.`,
          credentialId ? `Credential ID ${credentialId}.` : '',
          c.body,
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
    );
  }

  // --- Education ----------------------------------------------------------
  for (const ed of await readCollection('education')) {
    const { institution, degree, location, start, end } = ed.data;
    chunks.push(
      makeChunk(
        'education',
        ed.slug,
        0,
        institution,
        '/#education',
        [
          `Aryan Kapoor studied ${degree} at ${institution}${location ? `, ${location}` : ''}, from ${start} to ${end}.`,
          ed.body,
        ]
          .filter(Boolean)
          .join('\n\n'),
        'education college university school graduated graduation degree bachelor undergraduate btech academic studies',
      ),
    );
  }

  // --- About & interests: free prose, paragraph-packed. -------------------
  for (const a of await readCollection('about')) {
    splitProse(a.body).forEach((text, i) =>
      chunks.push(makeChunk('about', a.slug, i, 'About Aryan Kapoor', '/#about', text)),
    );
  }
  for (const it of await readCollection('interests')) {
    const { title, label } = it.data;
    splitProse([`${title} is a personal interest of Aryan Kapoor (${label}).`, it.body].join('\n\n')).forEach(
      (text, i) =>
        chunks.push(makeChunk('interests', it.slug, i, `Interest · ${title}`, '/#interests', text)),
    );
  }

  return chunks.filter((c) => c.text.length > 0);
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  // Imported lazily: it pulls in onnxruntime-node, which is slow to load and
  // pointless when this module is imported by tests that only exercise chunking.
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
  const out: Float32Array[] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await extractor(batch, { pooling: 'mean', normalize: true });
    const dims = res.dims as number[];
    const flat = res.data as Float32Array;
    const rows = dims[0]!;
    const width = dims[dims.length - 1]!;
    if (width !== DIMS) throw new Error(`expected ${DIMS} dims from ${EMBED_MODEL}, got ${width}`);
    for (let r = 0; r < rows; r++) {
      out.push(normalize(Float32Array.from(flat.subarray(r * width, (r + 1) * width))));
    }
    process.stdout.write(`\r  embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
  }
  process.stdout.write('\n');
  return out;
}

async function main() {
  const t0 = Date.now();
  const chunks = await collectChunks();
  if (chunks.length === 0) throw new Error('no chunks produced — is src/content populated?');
  console.log(`chunked ${chunks.length} units from ${CONTENT_DIR}`);

  // The collection name is indexed too: it is a free, reliable signal that
  // "education" queries should reach the education entry even when the prose
  // never uses the word.
  const tokenized = chunks.map((c) =>
    tokenize([c.collection, c.title, c.text, c.keywords].filter(Boolean).join('\n')),
  );
  const empty = tokenized.findIndex((t) => t.length === 0);
  if (empty !== -1) throw new Error(`chunk ${chunks[empty]!.id} tokenized to nothing`);
  const bm25 = buildBm25(tokenized);
  console.log(`built BM25 index: ${Object.keys(bm25.postings).length} terms`);

  const vectors = await embed(chunks.map((c) => `${c.title}. ${c.text}`));
  const packed = packVectors(vectors, DIMS);

  const hash = createHash('sha256')
    .update(JSON.stringify(chunks))
    .update(packed)
    .digest('hex')
    .slice(0, 12);

  const manifest: Manifest = {
    hash,
    chunkCount: chunks.length,
    dims: DIMS,
    embedModel: EMBED_MODEL,
    builtAt: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(join(OUT_DIR, 'chunks.json'), JSON.stringify(chunks)),
    writeFile(join(OUT_DIR, 'bm25.json'), JSON.stringify(bm25)),
    writeFile(join(OUT_DIR, 'vectors.bin'), packed),
    writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2)),
  ]);

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `wrote ${OUT_DIR}/ hash=${hash} ` +
      `chunks=${kb(JSON.stringify(chunks).length)} ` +
      `bm25=${kb(JSON.stringify(bm25).length)} ` +
      `vectors=${kb(packed.byteLength)} ` +
      `in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
