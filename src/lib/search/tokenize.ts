/**
 * The single tokenizer used by BOTH `scripts/build-index.ts` and the browser
 * runtime. Never fork this logic — if the build tokenizes "Kubernetes" to
 * `kubernet` and the query tokenizes it to `kubernetes`, every lookup silently
 * misses and the index looks empty rather than broken. `tokenize.test.ts` pins
 * the behaviour.
 */

/**
 * Tokens kept verbatim, before any splitting. These are the identifiers whose
 * punctuation carries meaning — a generic splitter turns "c++" into "c" and
 * ".net" into "net", collapsing them into unrelated terms.
 */
const LITERALS = new Set([
  'c++',
  'c#',
  'f#',
  '.net',
  'node.js',
  'next.js',
  'express.js',
  'vue.js',
  'ci/cd',
  'tcp/ip',
  'l2/l3',
]);

/**
 * Deliberately small. An aggressive stoplist hurts on a corpus this size: "go"
 * is a language, "c" is a language, and "it" appears in "IT infrastructure".
 * Only words that carry no retrieval signal anywhere in this corpus are listed.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having', 'of', 'in',
  'on', 'at', 'to', 'from', 'by', 'for', 'with', 'about', 'into', 'over',
  'under', 'as', 'so', 'too', 'very', 'can', 'will', 'just', 'not', 'no',
  'i', 'you', 'he', 'she', 'they', 'we', 'me', 'him', 'her', 'them', 'us',
  'my', 'your', 'his', 'their', 'our', 'its',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'there', 'here', 'also', 'more', 'most', 'some', 'any', 'all', 'each',
]);

/**
 * Query-time expansion. Recruiters type "k8s" and "ML"; the resume says
 * "Kubernetes" and "AI/ML". On a ~120-chunk corpus a curated alias map
 * outperforms anything clever, and it costs nothing at runtime.
 *
 * Keys are matched post-normalisation, pre-stemming. Values are appended to
 * the query token list, not substituted, so the literal term still scores.
 */
const ALIASES: Record<string, string[]> = {
  k8s: ['kubernetes'],
  kube: ['kubernetes'],
  rbac: ['roles', 'permissions', 'authorization', 'opa'],
  opa: ['open', 'policy', 'agent', 'rbac'],
  // Inverse direction matters as much as the abbreviation direction: people ask
  // "how does he handle authorization", not "does he know RBAC".
  authorization: ['rbac', 'opa', 'permissions', 'roles'],
  authorisation: ['rbac', 'opa', 'permissions', 'roles'],
  authz: ['rbac', 'opa', 'permissions'],
  auth: ['rbac', 'opa', 'permissions'],
  permissions: ['rbac', 'opa', 'roles'],
  security: ['rbac', 'opa', 'sase', 'secure'],
  llm: ['ai', 'language', 'model', 'bedrock', 'langgraph'],
  ai: ['llm', 'ml'],
  ml: ['ai', 'machine', 'learning'],
  rag: ['retrieval', 'opensearch', 'embeddings'],
  js: ['javascript'],
  ts: ['typescript'],
  golang: ['go'],
  py: ['python'],
  k8: ['kubernetes'],
  aws: ['amazon', 'cloud'],
  gcp: ['google', 'cloud'],
  db: ['database'],
  sql: ['postgresql', 'database'],
  postgres: ['postgresql'],
  psql: ['postgresql'],
  mq: ['kafka', 'rabbitmq', 'messaging'],
  rmq: ['rabbitmq', 'messaging'],
  cicd: ['ci', 'cd', 'jenkins', 'pipeline'],
  devops: ['infrastructure', 'kubernetes', 'docker', 'terraform'],
  sre: ['observability', 'infrastructure'],
  cka: ['certified', 'kubernetes', 'administrator', 'certification'],
  cert: ['certification'],
  certs: ['certification'],
  uni: ['university', 'education'],
  college: ['education', 'university'],
  degree: ['education', 'bachelor'],
  school: ['education'],
  job: ['experience', 'work', 'role'],
  jobs: ['experience', 'work', 'role'],
  employer: ['company', 'experience'],
  nes: ['nintendo', 'emulator'],
  emu: ['emulator'],
  hobby: ['interests'],
  hobbies: ['interests'],
  contact: ['email', 'linkedin', 'github'],
};

/** Strip diacritics and normalise unicode punctuation to ASCII equivalents. */
function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase();
}

/**
 * Proper nouns the stemmer must not touch. Suffix stripping is a heuristic
 * about English inflection, and technology names are not inflected English:
 * "Kubernetes" would otherwise stem to "kubernete" and "Pixel Souls" to "soul",
 * splitting each term from every query that spells it correctly.
 *
 * Only terms that actually appear in this corpus need listing.
 */
const NEVER_STEM = new Set([
  'kubernetes', 'redis', 'kafka', 'aws', 'jenkins', 'terraform', 'docker',
  'django', 'express', 'grpc', 'ethereum', 'dapps', 'langgraph', 'bedrock',
  'rasa', 'opensearch', 'postgresql', 'cassandra', 'elasticsearch', 'dynamodb',
  'mongodb', 'redshift', 'rabbitmq', 'datadog', 'prometheus', 'grafana',
  'envoy', 'haproxy', 'opa', 'guacamole', 'netstack', 'pygame', 'golang',
  'typescript', 'javascript', 'python', 'java', 'ericsson', 'codehall',
  'nintendo', 'souls', 'facts', 'sase', 'dhcp', 'vlans', 'rip', 'arp',
  'https', 'ssh', 'rdp', 'vnc', 'efk', 'cka', 'cncf', 'rnsit', 'nes', 'apu',
  'ppu', 'analytics', 'devops', 'ios', 'kubernetes-native',
]);

/**
 * Light suffix stripper. Deliberately NOT a full Porter stemmer: Porter is
 * lossy in ways that bite a technical corpus (it maps "operations" and
 * "operator" together but also mangles "kubernetes"), and a subtle bug in 100
 * lines of rules is far more expensive here than under-stemming.
 */
function stem(token: string): string {
  if (token.length <= 3) return token;
  if (NEVER_STEM.has(token)) return token;
  // Irregulars worth having on this corpus.
  if (token === 'ran') return 'run';
  if (token === 'built') return 'build';
  if (token === 'led') return 'lead';

  let t = token;
  // Plurals / third person.
  if (/[^aeiou]ies$/.test(t)) t = t.slice(0, -3) + 'y'; // libraries -> library
  else if (/(ss|us|is)$/.test(t)) {
    /* keep: kubernetes-like words, "access", "status" */
  } else if (/(ches|shes|xes|zes|ses)$/.test(t)) t = t.slice(0, -2);
  else if (/[^s]s$/.test(t)) t = t.slice(0, -1);

  if (t.length <= 3) return t;
  // Verb forms.
  if (/ing$/.test(t) && t.length > 5) t = t.slice(0, -3);
  else if (/edly$/.test(t)) t = t.slice(0, -4);
  else if (/ed$/.test(t) && t.length > 4) t = t.slice(0, -2);

  // Collapse the doubled consonant left by -ing/-ed (streaming -> stream).
  if (/([bdfglmnprt])\1$/.test(t)) t = t.slice(0, -1);
  return t;
}

/** Split normalised text into raw terms, preserving punctuated literals. */
function split(text: string): string[] {
  const out: string[] = [];
  // Match literals first, then generic alphanumeric runs (allowing internal
  // + # . / so "c++" and "ci/cd" survive to the literal check).
  const re = /[a-z0-9]+(?:[+#./][a-z0-9+#]*)*|[+#.][a-z0-9]+/g;
  for (const m of text.matchAll(re)) {
    let tok = m[0];
    if (LITERALS.has(tok)) {
      out.push(tok);
      continue;
    }
    // Strip trailing punctuation left by sentence ends ("kafka." -> "kafka").
    tok = tok.replace(/[.+#/]+$/, '');
    if (!tok) continue;
    if (LITERALS.has(tok)) {
      out.push(tok);
      continue;
    }
    // Break remaining compounds on separators, keeping each side.
    if (/[./]/.test(tok)) {
      for (const part of tok.split(/[./]+/)) if (part) out.push(part);
    } else {
      out.push(tok);
    }
  }
  return out;
}

/**
 * Tokenize document text for indexing. Returns stemmed, stopword-filtered
 * terms in order (order matters: term frequency is computed from this).
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const raw of split(normalize(text))) {
    if (STOPWORDS.has(raw)) continue;
    const s = LITERALS.has(raw) ? raw : stem(raw);
    if (!s || STOPWORDS.has(s)) continue;
    terms.push(s);
  }
  return terms;
}

/**
 * Tokenize a user query. Identical to {@link tokenize} plus alias expansion,
 * so "k8s experience" also matches the Kubernetes and CKA chunks.
 */
export function tokenizeQuery(text: string): string[] {
  const terms: string[] = [];
  const seenAlias = new Set<string>();
  for (const raw of split(normalize(text))) {
    if (!STOPWORDS.has(raw)) {
      const s = LITERALS.has(raw) ? raw : stem(raw);
      if (s && !STOPWORDS.has(s)) terms.push(s);
    }
    // Alias lookup uses the UNSTEMMED form so the map stays readable.
    const expansions = ALIASES[raw];
    if (expansions && !seenAlias.has(raw)) {
      seenAlias.add(raw);
      for (const e of expansions) {
        const s = LITERALS.has(e) ? e : stem(e);
        if (s && !STOPWORDS.has(s)) terms.push(s);
      }
    }
  }
  return terms;
}
