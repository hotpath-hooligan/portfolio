/**
 * Every string in this file is a real, verbatim output observed from
 * LaMini-Flan-T5-77M or SmolLM2-135M-Instruct while running
 * `scripts/eval-model.ts` against this corpus. They are the specification:
 * the gate exists to sort exactly these cases.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rejectAnswer, cleanAnswer, toSnippet } from './postprocess.ts';

test('accepts genuinely good answers', () => {
  const good = [
    'Remote Connect is a project at Ericsson (SDE 3, Nov 2021 to present).',
    'Aryan Kapoor studied Bachelor of Technology in Computer Science at R.N.S Institute of Technology, Bangalore, India from 2016 to 2020.',
    'Aryan Kapoor is a certified Kubernetes Administrator (CKA) and issued by Cloud Native Computing Foundation (CNCF) in April 2026.',
    'The programming languages that Aryan Kapoor knows are Python, Java, Go, JavaScript, TypeScript, C.',
  ];
  for (const a of good) assert.equal(rejectAnswer(a), null, `wrongly rejected: ${a}`);
});

test('rejects refusals so the snippet can answer instead', () => {
  // The model emits these even when the answer is in the context it was given.
  const refusals = [
    'The provided context does not provide information on what he uses for authorization.',
    'The context does not contain the answer.',
    "The context does not contain the answer, so I don't know.",
    'The provided information does not specify what he uses for authorization.',
    'The answer is not provided in the given information.',
  ];
  for (const a of refusals) assert.ok(rejectAnswer(a), `should have rejected: ${a}`);
});

test('rejects fluent but empty meta-answers', () => {
  assert.equal(
    rejectAnswer('Aryan Kapoor’s database has been analyzed by the context provided.'),
    'meta',
  );
});

test('rejects chat-assistant boilerplate', () => {
  assert.ok(
    rejectAnswer(
      "I'm sorry, but as an AI language model, I do not have access to real-time information.",
    ),
  );
  assert.ok(rejectAnswer('I am sorry, but the question is not clear. Could you please clarify?'));
});

test('rejects the repetition loops small decoders fall into', () => {
  // SmolLM2-135M-Instruct, verbatim.
  assert.equal(
    rejectAnswer(
      "Aryan Kapoor's Observability skills: Aryan Kapoor's Observability skills: " +
        "Aryan Kapoor's Observability skills: Aryan Kapoor's Observability skills: " +
        "Aryan Kapoor's Observability skills:",
    ),
    'repetition',
  );
  assert.equal(
    rejectAnswer(
      'Aryan Kapoor, a Software Engineer at Codehall, started working as a Software Engineer at Codehall in July 2020. ' +
        'He started as a Software Engineer at Codehall in July 2020 and worked as a Software Engineer at Codehall in July 2020. ' +
        'He started as a Software Engineer at Codehall in July 2020 and worked as a Software Engineer at Codehall in July 2020.',
    ),
    'repetition',
  );
});

test('a long correct answer is not mistaken for repetition', () => {
  // Legitimately repeats "Aryan Kapoor" and list punctuation; must survive.
  const a =
    'Aryan Kapoor has worked with PostgreSQL, Cassandra, Redis, Elasticsearch, DynamoDB, ' +
    'MongoDB, Redshift, OpenSearch, Kafka and RabbitMQ across his platform work at Ericsson.';
  assert.equal(rejectAnswer(a), null);
});

test('strips the echoed prompt label without discarding the answer', () => {
  assert.equal(cleanAnswer('Answer: Aryan Kapoor studied at R.N.S.'), 'Aryan Kapoor studied at R.N.S.');
  assert.equal(cleanAnswer('  Context:  something '), 'something');
  assert.equal(cleanAnswer('No label here.'), 'No label here.');
});

test('rejects fragments', () => {
  assert.equal(rejectAnswer('Ericsson.'), 'too-short');
  assert.equal(rejectAnswer(''), 'empty');
});

test('snippets cut on sentence boundaries', () => {
  const long = 'First sentence here. Second sentence here. ' + 'x'.repeat(500);
  const s = toSnippet(long, 60);
  assert.ok(s.length <= 61, `too long: ${s.length}`);
  assert.ok(s.endsWith('.') || s.endsWith('…'), `bad ending: ${s}`);
  assert.equal(toSnippet('Short one.', 60), 'Short one.');
});
