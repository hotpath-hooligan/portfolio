/**
 * Retrieval smoke set: real questions a visitor would ask, pinned to the chunk
 * that should answer them. This is the regression net for content edits — add
 * a bullet to the resume and this tells you whether it broke anything else.
 *
 * Runs against the built index, so `npm run build:index` must have run first.
 * BM25 only: that is Tier 1, what every visitor gets without downloading a
 * model, and it is the path that must never silently degrade.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchBm25 } from './bm25.ts';
import type { Bm25Index, Chunk } from './types.ts';

let chunks: Chunk[];
let index: Bm25Index;

before(async () => {
  chunks = JSON.parse(await readFile('public/search/chunks.json', 'utf8'));
  index = JSON.parse(await readFile('public/search/bm25.json', 'utf8'));
});

/** [question, expected chunk id, max acceptable rank] */
const CASES: [string, string, number][] = [
  ['what does he use for RBAC?', 'experience/ericsson#4', 3],
  ['how does he handle authorization?', 'experience/ericsson#4', 3],
  ['does he know Kubernetes?', 'certifications/cka#0', 3],
  ['is he certified?', 'certifications/cka#0', 3],
  ['tell me about remote access', 'experience/ericsson#2', 3],
  ['what did he build with Kafka?', 'experience/ericsson#3', 3],
  ['has he worked with LLMs?', 'experience/ericsson#5', 3],
  ['speedtest and network diagnostics', 'experience/ericsson#1', 3],
  ['where did he go to college?', 'education/rnsit#0', 3],
  ['what databases does he know?', 'skills/index#4', 3],
  ['what languages does he program in?', 'skills/index#0', 3],
  ['monitoring and observability tools', 'skills/index#5', 3],
  ['tell me about the NES emulator', 'projects/nes-emulator#0', 3],
  ['did he write a network stack?', 'projects/go-netstack#0', 3],
  ['what games has he made?', 'projects/pixel-souls#0', 3],
  ['where does he work now?', 'experience/ericsson#0', 5],
  ['what did he do before Ericsson?', 'experience/codehall#0', 5],
  // Contact details are only answerable because profile is a content
  // collection rather than markup in index.astro.
  ['how do I contact him?', 'profile/index#0', 3],
  ['what is his email?', 'profile/index#0', 3],
  ['who is Aryan Kapoor?', 'profile/index#0', 3],
  ['where is he based?', 'profile/index#0', 3],
];

for (const [query, expectedId, maxRank] of CASES) {
  test(`retrieval: ${query}`, () => {
    const hits = searchBm25(index, query, 10);
    const ids = hits.map((h) => chunks[h.index]!.id);
    const rank = ids.indexOf(expectedId);
    assert.notEqual(rank, -1, `${expectedId} not retrieved at all. Got: ${ids.slice(0, 5).join(', ')}`);
    assert.ok(
      rank < maxRank,
      `${expectedId} ranked ${rank + 1}, expected top ${maxRank}. Got: ${ids.slice(0, 5).join(', ')}`,
    );
  });
}

test('nonsense queries retrieve nothing to be grounded on', () => {
  const hits = searchBm25(index, 'zxcvbnm qwertyuiop', 10);
  assert.equal(hits.length, 0);
});

test('every chunk has a resolvable deep link', () => {
  for (const c of chunks) {
    assert.match(c.url, /^\/(#[a-z0-9-]+|projects\/[a-z0-9-]+\/)$/, `bad url on ${c.id}: ${c.url}`);
  }
});
