"""Hybrid retrieval: BM25 + dense vectors, fused on rank."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Iterable

import numpy as np

from tokens import tokenize, tokenize_query

# Okapi BM25 free parameters. Standard defaults; the corpus is too small to tune.
K1 = 1.5
B = 0.75

# RRF smoothing constant, from Cormack et al. Not sensitive at this corpus size.
RRF_K = 60

# Minimum fused score to count as grounded. A single retriever placing a chunk
# first contributes 1/61; this accepts a lone top-3 hit and rejects the tail.
GROUNDING_THRESHOLD = 1 / (RRF_K + 3)

# Minimum cosine for the vector arm alone to establish grounding. Measured:
# junk queries top out around 0.21, real questions with no lexical overlap reach
# 0.25-0.66. A false negative here is a polite "I don't have that"; a false
# positive is a confident irrelevant answer.
VECTOR_GROUNDING_COSINE = 0.35


@dataclass
class Chunk:
    id: str
    collection: str
    title: str
    url: str
    text: str
    # Extra terms folded into BM25 only: never embedded, never cited, never put
    # in the prompt. The vocabulary people search with is not the vocabulary
    # good prose uses ("where did he go to college").
    keywords: str = ""

    def to_json(self) -> dict:
        out = {
            "id": self.id,
            "collection": self.collection,
            "title": self.title,
            "url": self.url,
            "text": self.text,
        }
        if self.keywords:
            out["keywords"] = self.keywords
        return out

    @staticmethod
    def from_json(raw: dict) -> "Chunk":
        return Chunk(
            id=raw["id"],
            collection=raw["collection"],
            title=raw["title"],
            url=raw["url"],
            text=raw["text"],
            keywords=raw.get("keywords", ""),
        )


@dataclass
class Bm25Index:
    n: int
    avg_doc_len: float
    doc_len: list[int]
    # term -> [(chunk index, term frequency)]. Document frequency is the posting
    # list length, so it is not stored separately.
    postings: dict[str, list[tuple[int, int]]] = field(default_factory=dict)

    def to_json(self) -> dict:
        return {
            "n": self.n,
            "avgDocLen": self.avg_doc_len,
            "docLen": self.doc_len,
            "postings": {t: [list(p) for p in ps] for t, ps in self.postings.items()},
        }

    @staticmethod
    def from_json(raw: dict) -> "Bm25Index":
        return Bm25Index(
            n=raw["n"],
            avg_doc_len=raw["avgDocLen"],
            doc_len=raw["docLen"],
            postings={t: [tuple(p) for p in ps] for t, ps in raw["postings"].items()},
        )


@dataclass
class Result:
    chunk: Chunk
    score: float
    bm25_rank: int | None
    vector_rank: int | None


def build_bm25(docs: Iterable[list[str]]) -> Bm25Index:
    postings: dict[str, list[tuple[int, int]]] = {}
    doc_len: list[int] = []

    for i, terms in enumerate(docs):
        doc_len.append(len(terms))
        tf: dict[str, int] = {}
        for t in terms:
            tf[t] = tf.get(t, 0) + 1
        for term, count in tf.items():
            postings.setdefault(term, []).append((i, count))

    n = len(doc_len)
    return Bm25Index(
        n=n,
        avg_doc_len=(sum(doc_len) / n) if n else 0.0,
        doc_len=doc_len,
        postings=postings,
    )


def index_text(chunk: Chunk) -> str:
    """What BM25 sees. The collection name is a free, reliable signal."""
    return "\n".join(
        p for p in (chunk.collection, chunk.title, chunk.text, chunk.keywords) if p
    )


def search_bm25(index: Bm25Index, query: str, limit: int = 20) -> list[tuple[int, float]]:
    """Standard BM25 with the +1 IDF shift, which keeps terms appearing in more
    than half the corpus from scoring negatively."""
    terms = tokenize_query(query)
    if not terms:
        return []

    scores: dict[int, float] = {}
    # A term repeated in the query, or reached twice via aliases, must not be
    # counted twice.
    for term in set(terms):
        postings = index.postings.get(term)
        if not postings:
            continue
        df = len(postings)
        idf = math.log(1 + (index.n - df + 0.5) / (df + 0.5))
        for doc_id, tf in postings:
            norm = tf * (K1 + 1)
            denom = tf + K1 * (
                1 - B + B * index.doc_len[doc_id] / (index.avg_doc_len or 1)
            )
            scores[doc_id] = scores.get(doc_id, 0.0) + idf * (norm / denom)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return ranked[:limit]


def search_vectors(
    vectors: np.ndarray, query: np.ndarray, limit: int = 20
) -> list[tuple[int, float]]:
    """Cosine against every chunk. Both sides are L2-normalised, so this is a
    dot product. Brute force is correct at ~120 chunks; an ANN index would be
    pure ceremony."""
    sims = vectors @ query
    top = np.argsort(-sims)[:limit]
    return [(int(i), float(sims[i])) for i in top]


def fuse(
    chunks: list[Chunk],
    bm25_hits: list[tuple[int, float]],
    vector_hits: list[tuple[int, float]],
    limit: int = 6,
) -> list[Result]:
    """Reciprocal Rank Fusion.

    Fused on rank, not score: BM25 is an unbounded sum of IDF terms while cosine
    sits in [-1, 1], so any weighted blend of the raw numbers needs constants
    that drift every time content is added. Ranks are already commensurable.
    """
    bm25_rank = {i: r for r, (i, _) in enumerate(bm25_hits)}
    vector_rank = {i: r for r, (i, _) in enumerate(vector_hits)}

    scores: dict[int, float] = {}
    for ranks in (bm25_rank, vector_rank):
        for idx, rank in ranks.items():
            scores[idx] = scores.get(idx, 0.0) + 1 / (RRF_K + rank + 1)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        Result(
            chunk=chunks[idx],
            score=score,
            bm25_rank=bm25_rank.get(idx),
            vector_rank=vector_rank.get(idx),
        )
        for idx, score in ranked
    ]


def is_grounded(
    results: list[Result],
    bm25_hits: list[tuple[int, float]],
    top_vector_score: float | None,
) -> bool:
    """Whether there is anything worth answering from.

    Fused rank cannot decide this alone: the vector arm has no similarity floor,
    so its top hit always clears GROUNDING_THRESHOLD and every query would look
    grounded. Lexical overlap is the reliable signal; the cosine arm is the
    fallback for a real question phrased outside the corpus vocabulary.
    """
    if not results or results[0].score < GROUNDING_THRESHOLD:
        return False
    if bm25_hits:
        return True
    return top_vector_score is not None and top_vector_score >= VECTOR_GROUNDING_COSINE


# "Who is he", "what does he do" tokenize to nothing at all — every word is a
# stopword — so BM25 has no term to score. Third person is the one signal that
# the question is about Aryan anyway, and it selects the profile chunk.
_THIRD_PERSON = re.compile(r"\b(he|him|his|aryan|kapoor)\b", re.I)


def mentions_subject(query: str) -> bool:
    return bool(_THIRD_PERSON.search(query))


def profile_chunk(chunks: list[Chunk]) -> Chunk | None:
    return next((c for c in chunks if c.collection == "profile"), None)
