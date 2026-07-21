---
title: An Evidence-Grounded LLM Assistant for Network Troubleshooting
blurb: >-
  Evolving a retrieval bot into a tenant-aware assistant that answers from cited
  sources, queries live telemetry in natural language, and runs resumable
  multi-step diagnostics.
role: Contributed to the RAG pipeline, the troubleshooting state graph, and the retrieval evaluation method.
domain: [LangGraph, AWS Bedrock, RAG, OpenSearch, Rasa, DynamoDB, Text-to-SQL]
highlight: AI-Based NetCloud Assistant (ANA)
order: 80
---

## Where it started

The first generation was a retrieval assistant over a large technical
documentation library. It leaned on predefined intents and returned ranked
titles, section links, and product table rows — useful, but it returned
*evidence*, not answers, and it could not connect product guidance to live
network data or to a multi-step diagnosis.

## Where it went

Four layers, deliberately separated.

**Interaction.** An authenticated conversational channel handles deterministic
routing, with the sender identity derived from JWT claims so tenant scoping is
structural rather than prompt-level.

**Retrieval and generation.** A question is classified, then lexical and
semantic retrieval run *in parallel* over the same index. Results are fused with
weighted reciprocal-rank fusion, reranked with a cross-encoder over a small
candidate set, enriched with neighbouring chunks so an answer isn't cut off at a
chunk boundary, and only then handed to the model — which generates with sources
and confidence metadata attached.

**Guided troubleshooting as a durable state graph.** Collect context → classify
the issue → retrieve runbook knowledge → *grade its relevance* → ask for
clarification if needed → build a plan → execute diagnostic tools in parallel →
decide whether to continue or stop. Checkpoints persist to DynamoDB, so a long
workflow survives a pod restart and resumes elsewhere; progress streams to the
user over Redis and websockets rather than leaving them watching a spinner.

**Analytics in natural language.** A schema-aware text-to-SQL path selects the
right table grain for the question's time range and retention, corrects
malformed SQL, and formats results — over telemetry normalised into
pre-aggregated time grains by streaming consumers upstream.

## The hardest part

Balancing answer quality and flexible reasoning against latency, determinism,
and safety.

A single large model call is simple and completely opaque — when it is wrong you
have no idea which step failed. A fully deterministic intent system is
inspectable and generalises badly. The resolution was a hybrid: **rules and
authenticated service boundaries for control, retrieval and tools for evidence,
and the model only inside bounded graph nodes.**

Concretely that meant capping refinement loops, reranking a small candidate set
rather than a large one, parallelising independent work, checkpointing long
flows, and preserving explicit clarification and confirmation points. It is more
complex than one prompt. The payoff is that failures became *observable and
recoverable* instead of hidden inside a generation.

## Evaluation, which is the part worth stealing

The strongest thing here isn't an architecture diagram, it's the measurement
discipline. There is no single meaningful "accuracy" number for a system like
this, so we measured failure surfaces separately:

- **Corpus coverage** — evaluated only on questions whose ground truth still
  existed in the current corpus, so retrieval wasn't penalised for missing
  source material. That separates a content problem from a retrieval problem.
- **Intent and routing** on manually labelled questions plus generated
  paraphrases.
- **Entity and slot capture** for domain terminology, acronyms, and phrasing
  that doesn't match the source text.
- **Paraphrase robustness** on variants of the same question — a different
  cohort from the retrieval set, and never blended with it.
- **Fallback rate and latency** tracked as their own snapshots.

The rule we held to: always state the dataset, the denominator, the top-K
criterion, and the release stage. A single blended score across those cohorts
would have been meaningless and reassuring at the same time, which is the worst
combination.

## What I'd say about the limits

Retrieval quality degrades quietly as a corpus changes underneath you, so
ingestion — access and locale filtering, deduplication, handling updates, and
*retiring deleted documents* — matters as much as the ranking stack. Grounding
gives you citations, not correctness. And the step from "guided diagnosis" to
"executes actions on the network" is a governance problem before it is an
engineering one: it needs approval gates and audit before autonomy, not after.
