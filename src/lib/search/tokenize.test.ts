import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, tokenizeQuery } from './tokenize.ts';

test('build/query tokenizers agree on shared vocabulary', () => {
  // The core invariant: any term a document produces must be reachable from a
  // query containing that same term. Divergence here makes the index look
  // empty rather than broken, so it is pinned first.
  const samples = [
    'Kubernetes',
    'Open Policy Agent',
    'event-driven microservices',
    'Apache Guacamole session brokering',
    'RFC 2003-compliant IP-in-IP tunneling',
    'PostgreSQL, Cassandra, Redis',
  ];
  for (const s of samples) {
    const docTerms = tokenize(s);
    const queryTerms = tokenizeQuery(s);
    for (const t of docTerms) {
      assert.ok(
        queryTerms.includes(t),
        `query tokenizer dropped ${JSON.stringify(t)} from ${JSON.stringify(s)}`,
      );
    }
  }
});

test('punctuated technical literals survive splitting', () => {
  assert.deepEqual(tokenize('C++'), ['c++']);
  assert.deepEqual(tokenize('CI/CD'), ['ci/cd']);
  assert.deepEqual(tokenize('Express.js'), ['express.js']);
  // Not a known literal: split into useful parts rather than dropped.
  assert.deepEqual(tokenize('foo/bar'), ['foo', 'bar']);
});

test('diacritics and smart punctuation normalise to ASCII', () => {
  assert.deepEqual(tokenize('café'), tokenize('cafe'));
  assert.deepEqual(tokenize('don’t'), tokenize("don't"));
  assert.deepEqual(tokenize('a—b'), tokenize('a-b'));
});

test('stemmer collapses inflections without mangling tech nouns', () => {
  assert.equal(tokenize('streaming')[0], tokenize('streams')[0]);
  assert.equal(tokenize('designed')[0], tokenize('design')[0]);
  assert.equal(tokenize('libraries')[0], tokenize('library')[0]);
  // -ss/-us/-is words must not lose their tail.
  assert.equal(tokenize('kubernetes')[0], 'kubernetes');
  assert.equal(tokenize('access')[0], 'access');
});

test('single-letter languages are not stopworded away', () => {
  assert.deepEqual(tokenize('C'), ['c']);
  assert.deepEqual(tokenize('Go'), ['go']);
});

test('query aliases expand to corpus vocabulary', () => {
  const q = tokenizeQuery('does he know k8s?');
  assert.ok(q.includes('kubernetes'), `expected kubernetes in ${q.join(',')}`);
  assert.ok(q.includes('k8s'), 'literal term must still be scored');

  const rbac = tokenizeQuery('rbac');
  assert.ok(rbac.includes('opa'));

  // Alias expansion must actually reach terms the documents contain: this is
  // the whole point of the map, so assert overlap rather than membership.
  const doc = tokenize('Built a fine-grained RBAC framework using Open Policy Agent (OPA)');
  assert.ok(
    tokenizeQuery('how does he do authorization?').some((t) => doc.includes(t)),
    'authorization query must share a term with the OPA chunk',
  );
});

test('term frequency ordering is preserved', () => {
  assert.deepEqual(tokenize('kafka redis kafka'), ['kafka', 'redis', 'kafka']);
});
