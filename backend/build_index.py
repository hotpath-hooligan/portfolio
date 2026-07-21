"""Index builder, run once as a Modal image build step.

The result is baked into the image layer, so it is immutable, versioned with the
deploy, and costs a container nothing at start: no download, no volume, no
rebuild. The index can never drift from the content that produced it.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from corpus import collect_chunks
from retrieval import Chunk, build_bm25, index_text
from tokens import tokenize

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DIMS = 384

CONTENT_DIR = Path("/srv/content")
INDEX_DIR = Path("/srv/index")


def embed_texts(texts: list[str]) -> np.ndarray:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(EMBED_MODEL)
    vectors = model.encode(texts, batch_size=32, normalize_embeddings=True)
    return np.asarray(vectors, dtype=np.float32)


def build(content_dir: Path = CONTENT_DIR, out_dir: Path = INDEX_DIR) -> None:
    chunks = collect_chunks(content_dir)
    if not chunks:
        raise RuntimeError(f"no chunks produced — is {content_dir} populated?")

    tokenized = [tokenize(index_text(c)) for c in chunks]
    empty = next((c for c, t in zip(chunks, tokenized) if not t), None)
    if empty is not None:
        raise RuntimeError(f"chunk {empty.id} tokenized to nothing")

    bm25 = build_bm25(tokenized)
    vectors = embed_texts([f"{c.title}. {c.text}" for c in chunks])
    if vectors.shape[1] != DIMS:
        raise RuntimeError(f"expected {DIMS} dims from {EMBED_MODEL}, got {vectors.shape[1]}")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "chunks.json").write_text(json.dumps([c.to_json() for c in chunks]))
    (out_dir / "bm25.json").write_text(json.dumps(bm25.to_json()))
    np.save(out_dir / "vectors.npy", vectors)

    print(
        f"indexed {len(chunks)} chunks, {len(bm25.postings)} terms, "
        f"{vectors.shape} vectors -> {out_dir}"
    )


def load(index_dir: Path = INDEX_DIR) -> tuple[list[Chunk], "Bm25Index", np.ndarray]:  # noqa: F821
    from retrieval import Bm25Index

    chunks = [Chunk.from_json(c) for c in json.loads((index_dir / "chunks.json").read_text())]
    bm25 = Bm25Index.from_json(json.loads((index_dir / "bm25.json").read_text()))
    vectors = np.load(index_dir / "vectors.npy")
    return chunks, bm25, vectors


if __name__ == "__main__":
    build()
