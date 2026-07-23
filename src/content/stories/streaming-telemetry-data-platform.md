---
title: Making Data the First-Class Component of a Microservice Platform
blurb: >-
  A Kafka-backed data platform with enforced Avro contracts, a streaming
  normalization and rollup engine, and a lake path from raw events to
  partitioned analytics.
role: Worked on the streaming funnel service, schema-contract enforcement, and the lake ingest path.
domain: [Kafka, Kafka Streams, Avro, Java, Spark, S3, RocksDB]
highlight: Common Data Platform
order: 75
---

## The problem

The platform had grown from a monolith into dozens of microservices, but each
was built to serve *external customers* rather than the system. If one service
needed device location, it called a core service synchronously. Three problems
compounded:

1. **Direct coupling** — a new integration required code changes on both sides.
2. **Load concentration** — core services carried traffic unrelated to their own
   function.
3. **Fate sharing** — if the data-owning service was down, the consumer degraded
   even though it only needed a *copy of the data*.

On top of that, several teams had independently shipped device-side collection
code, so the fleet was being asked for overlapping data multiple times.

The inversion: **data is the first-class component, and services exist to add
value to the data.**

## Three pieces

### A schema contract layer

Every managed topic is backed by a registered Avro schema, served with
governance metadata alongside it — owner, retention, sensitivity annotations,
customer-visibility flags. The rule enforced in CI is **forward-transitive
evolution**: a pre-commit job validates schema structure and blocks consumers
pinning invalid versions.

The mechanism that makes independent deploys actually work is wire-level
versioning: the writer's schema version is prefixed onto the payload, and
consumers resolve writer-versus-reader schemas at deserialization. Without that,
"producers and consumers version independently" is a slogan rather than a
property.

Schema-usage tracking closes the loop — a producer can see who depends on each
version before changing it.

### A streaming normalization and rollup engine

A Java service consumes bundled raw device JSON, normalises two different wire
styles — nested objects and dot-notation flat keys — into one tree, and fans it
out into 20+ schema-managed topics. Malformed or unrecognised bundles route to a
rejected-data topic for study and replay instead of being dropped.

On top of that sit near-real-time rollups: per tenant/device/interface/metric
tumbling aggregations at 15-minute and 1-hour grains, driven by **declarative
config** so adding a rolled-up metric is a configuration change, not a code
change.

Two decisions there are worth defending:

**Replacing the stock windowed-aggregate topology with a custom processor over a
plain key-value store.** The library's windowing plus suppression worked but
carried a large state-store footprint and emitted duplicate and estimated
results at deadlines. The custom implementation cut the footprint and removed
those emissions. The cost is that a non-windowed store has no retention
semantics, so it needed wall-clock punctuated garbage collection with an
explicit retention window — a real obligation the framework had been handling.

**Bucketing on event time, not ingest time.** A custom timestamp extractor uses
the device's own collection time, so buffered or bursty samples land in the
right window. With zero grace, records for an already-closed window are
intentionally dropped, plus a far-future-timestamp failsafe so one corrupt
sample cannot poison later windows.

Change detection became a streaming primitive too: configurable field-comparison
processors emit typed change events with from/to payloads, and a header-gated
"live mode" fork mirrors a copy to low-latency topics for UI streaming.

### A lake path

A consumer deserializes and re-serializes each record against a *pinned* schema
version, buffers per partition, and streams multipart uploads targeting large
objects — **committing offsets only after the upload closes.** That gives
at-least-once ingest with no partial-file corruption, which is the property that
actually matters downstream.

A Spark job then transforms to columnar format partitioned by date and tenant,
with job state tracked externally and a weekly maintenance job handling retention
deletes, snapshot expiry, orphan-file removal, and compaction — the unglamorous
work that keeps query performance and storage cost flat as volume grows.

## Operating it

A funnel service at this position is a single point of pressure, so: consumer
lag as the primary SLI, RocksDB and stream-state metrics exported for
dashboards, large batched polls, tuned off-heap block cache and write buffers,
and a health monitor that exits the pod when all stream threads have been dead
for 30 seconds so the orchestrator restarts it. The uncaught-exception handler
is deliberately scoped to shut down the *client*, not the application — one bad
instance must not take every instance down with it.

## Tradeoffs

- **Publish/subscribe over direct API calls** removes coupling and load
  concentration, and replaces them with schema governance work and eventual
  consistency. Someone now owns the contract layer, forever.
- **One writer, many readers** means adding a consumer needs zero producer
  changes — and means a badly modelled topic is expensive to fix later, because
  you no longer know everyone reading it without usage tracking.
- **Custom stream processing over framework defaults** bought correctness and
  memory back, and took on retention and correctness responsibilities the
  framework had owned. That's a fair trade only with tests around window
  boundaries, which is exactly where the bugs were.
- **Zero grace on windows** is a deliberate correctness-over-completeness call:
  late data is dropped rather than silently corrupting a published aggregate.
