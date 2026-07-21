---
title: Portfolio RAG Assistant
blurb: >-
  A portfolio that answers questions about its own content using hybrid search
  and scale-to-zero, self-hosted small-model inference.
stack: [Astro, React, FastAPI, RAG, BM25, vLLM, Modal]
repo: https://github.com/hotpath-hooligan/portfolio
demo: https://hotpath-hooligan.github.io/portfolio/
featured: true
order: 5
---

This portfolio is a static Astro and React site paired with a FastAPI retrieval-
augmented chat service. The browser sends only the question and a bounded turn
history; retrieval, embeddings, prompts, and model inference stay in the
backend, which streams answers and citations over server-sent events.

The content pipeline uses structure rather than fixed-size splitting. Experience
highlights, skill groups, projects, and individual case-study headings become
separate citation-ready chunks. Exact terminology is retrieved through a custom
BM25 inverted index, while normalized sentence-transformer embeddings cover
semantic matches. Reciprocal Rank Fusion combines the lexical and dense ranks,
and explicit grounding thresholds keep unrelated context out of the prompt.

The search index—chunks, BM25 postings, and dense vectors—is built from the same
published content as the site and baked into the backend image, so citations
cannot drift from a deployment. FastAPI and the embedder run on a CPU container;
selectable small language models run through vLLM on an L4 GPU. Both tiers use
Modal's scale-to-zero lifecycle, keeping an otherwise GPU-backed interactive
demo inexpensive when idle.
