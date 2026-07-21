"""Tokenizer shared by the index builder and query time.

Never fork this logic: if the build stems "Kubernetes" to `kubernet` and a query
stems it to `kubernetes`, every lookup misses silently and the index looks empty
rather than broken.
"""

from __future__ import annotations

import re
import unicodedata

# Identifiers whose punctuation carries meaning. A generic splitter turns "c++"
# into "c" and ".net" into "net".
LITERALS = {
    "c++", "c#", "f#", ".net", "node.js", "next.js",
    "express.js", "vue.js", "ci/cd", "tcp/ip", "l2/l3",
}

# Deliberately small. "go" is a language, "c" is a language, "it" appears in
# "IT infrastructure".
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this",
    "these", "those", "is", "are", "was", "were", "be", "been", "being", "am",
    "do", "does", "did", "doing", "have", "has", "had", "having", "of", "in",
    "on", "at", "to", "from", "by", "for", "with", "about", "into", "over",
    "under", "as", "so", "too", "very", "can", "will", "just", "not", "no",
    "i", "you", "he", "she", "they", "we", "me", "him", "her", "them", "us",
    "my", "your", "his", "their", "our", "its",
    "what", "which", "who", "whom", "when", "where", "why", "how",
    "there", "here", "also", "more", "most", "some", "any", "all", "each",
}

# Query-time expansion. Recruiters type "k8s"; the CV says "Kubernetes". On a
# corpus this size a curated alias map beats anything clever. Values are
# appended, not substituted, so the literal term still scores.
ALIASES: dict[str, list[str]] = {
    "k8s": ["kubernetes"],
    "k8": ["kubernetes"],
    "kube": ["kubernetes"],
    "rbac": ["roles", "permissions", "authorization", "opa"],
    "opa": ["open", "policy", "agent", "rbac"],
    "authorization": ["rbac", "opa", "permissions", "roles"],
    "authorisation": ["rbac", "opa", "permissions", "roles"],
    "authz": ["rbac", "opa", "permissions"],
    "auth": ["rbac", "opa", "permissions"],
    "permissions": ["rbac", "opa", "roles"],
    "security": ["rbac", "opa", "sase", "secure"],
    "llm": ["ai", "language", "model", "bedrock", "langgraph"],
    "ai": ["llm", "ml"],
    "ml": ["ai", "machine", "learning"],
    "rag": ["retrieval", "opensearch", "embeddings"],
    "js": ["javascript"],
    "ts": ["typescript"],
    "golang": ["go"],
    "py": ["python"],
    "aws": ["amazon", "cloud"],
    "gcp": ["google", "cloud"],
    "db": ["database"],
    "sql": ["postgresql", "database"],
    "postgres": ["postgresql"],
    "psql": ["postgresql"],
    "mq": ["kafka", "rabbitmq", "messaging"],
    "rmq": ["rabbitmq", "messaging"],
    "cicd": ["ci", "cd", "jenkins", "pipeline"],
    "devops": ["infrastructure", "kubernetes", "docker", "terraform"],
    "sre": ["observability", "infrastructure"],
    "cka": ["certified", "kubernetes", "administrator", "certification"],
    "cert": ["certification"],
    "certs": ["certification"],
    "uni": ["university", "education"],
    "college": ["education", "university"],
    "degree": ["education", "bachelor"],
    "school": ["education"],
    "job": ["experience", "work", "role"],
    "jobs": ["experience", "work", "role"],
    "employer": ["company", "experience"],
    "nes": ["nintendo", "emulator"],
    "emu": ["emulator"],
    "hobby": ["interests"],
    "hobbies": ["interests"],
    "contact": ["email", "linkedin", "github"],
}

# Suffix stripping is a heuristic about English inflection, and technology names
# are not inflected English: "Kubernetes" would stem to "kubernete".
NEVER_STEM = {
    "kubernetes", "redis", "kafka", "aws", "jenkins", "terraform", "docker",
    "django", "express", "grpc", "ethereum", "dapps", "langgraph", "bedrock",
    "rasa", "opensearch", "postgresql", "cassandra", "elasticsearch", "dynamodb",
    "mongodb", "redshift", "rabbitmq", "datadog", "prometheus", "grafana",
    "envoy", "haproxy", "opa", "guacamole", "netstack", "pygame", "golang",
    "typescript", "javascript", "python", "java", "ericsson", "codehall",
    "nintendo", "souls", "facts", "sase", "dhcp", "vlans", "rip", "arp",
    "https", "ssh", "rdp", "vnc", "efk", "cka", "cncf", "rnsit", "nes", "apu",
    "ppu", "analytics", "devops", "ios", "kubernetes-native",
}

_TERM_RE = re.compile(r"[a-z0-9]+(?:[+#./][a-z0-9+#]*)*|[+#.][a-z0-9]+")
_QUOTES = str.maketrans({"‘": "'", "’": "'", "‛": "'",
                        "“": '"', "”": '"'})
_DASHES = re.compile(r"[‐-―]")


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _DASHES.sub("-", stripped.translate(_QUOTES)).lower()


def stem(token: str) -> str:
    """Light suffix stripper, deliberately not Porter.

    Porter is lossy in ways that bite a technical corpus, and a subtle bug in a
    hundred lines of rules costs more here than under-stemming does.
    """
    if len(token) <= 3 or token in NEVER_STEM:
        return token
    if token == "ran":
        return "run"
    if token == "built":
        return "build"
    if token == "led":
        return "lead"

    t = token
    if re.search(r"[^aeiou]ies$", t):
        t = t[:-3] + "y"
    elif re.search(r"(ss|us|is)$", t):
        pass  # "access", "status", kubernetes-like words
    elif re.search(r"(ches|shes|xes|zes|ses)$", t):
        t = t[:-2]
    elif re.search(r"[^s]s$", t):
        t = t[:-1]

    if len(t) <= 3:
        return t

    if t.endswith("ing") and len(t) > 5:
        t = t[:-3]
    elif t.endswith("edly"):
        t = t[:-4]
    elif t.endswith("ed") and len(t) > 4:
        t = t[:-2]

    # Collapse the doubled consonant left by -ing/-ed (streaming -> stream).
    if re.search(r"([bdfglmnprt])\1$", t):
        t = t[:-1]
    return t


def split(text: str) -> list[str]:
    out: list[str] = []
    for match in _TERM_RE.finditer(text):
        tok = match.group(0)
        if tok in LITERALS:
            out.append(tok)
            continue
        tok = re.sub(r"[.+#/]+$", "", tok)
        if not tok:
            continue
        if tok in LITERALS:
            out.append(tok)
            continue
        if re.search(r"[./]", tok):
            out.extend(p for p in re.split(r"[./]+", tok) if p)
        else:
            out.append(tok)
    return out


def tokenize(text: str) -> list[str]:
    """Tokenize document text for indexing. Order matters: tf is counted here."""
    terms: list[str] = []
    for raw in split(normalize(text)):
        if raw in STOPWORDS:
            continue
        s = raw if raw in LITERALS else stem(raw)
        if s and s not in STOPWORDS:
            terms.append(s)
    return terms


def tokenize_query(text: str) -> list[str]:
    """As `tokenize`, plus alias expansion off the unstemmed form."""
    terms: list[str] = []
    seen: set[str] = set()
    for raw in split(normalize(text)):
        if raw not in STOPWORDS:
            s = raw if raw in LITERALS else stem(raw)
            if s and s not in STOPWORDS:
                terms.append(s)
        if raw in ALIASES and raw not in seen:
            seen.add(raw)
            for alias in ALIASES[raw]:
                s = alias if alias in LITERALS else stem(alias)
                if s and s not in STOPWORDS:
                    terms.append(s)
    return terms
