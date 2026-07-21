---
title: Replacing a Shared Read Dependency With Event-Driven Materialized Views
blurb: >-
  Moving shared reference-data reads off a central service's synchronous API and
  onto per-service Redis projections maintained from a Kafka change stream.
role: Worked on the specification-driven maintainer and client model, atomic indexing, freshness checks, and replay-based recovery.
domain: [Kafka, Redis, Lua, Python, Event-Driven Architecture]
highlight: Core Facts
order: 90
---

## The problem

Microservices across the platform needed the same shared domain data — devices,
accounts, customers, groups, feature entitlements. They all got it by calling
one central service's authenticated cache API, which meant every consumer added
synchronous traffic and a hard runtime dependency on that service and its
database.

Three consequences compounded. A noisy or misbehaving consumer could degrade
services that had nothing to do with it. Every consumer fate-shared with the
data owner's availability, even though most of them only wanted a *copy of the
data*, not live computation. And the original design notes recorded database
failover on the central service taking as long as ten minutes — a shared failure
domain nobody had chosen deliberately.

## The design

Invert the read path. The data owner captures changes transactionally into
change-log tables and publishes keyed updates and tombstones to Kafka. Each
consuming service embeds a maintainer that tails those topics and projects the
fields it actually wants into **its own** Redis. Reads become local Redis
lookups instead of authenticated HTTP calls across the network.

The important word is *projection*, not *cache*. Redis holds a rebuildable
materialized view; the owner remains the system of record.

What made it a framework rather than one service's plumbing:

- **Declarative specifications.** Each fact type declares its topic, version,
  field projection, transforms, filters, secondary indexes, and relationships.
  One generic maintainer and one generic client then serve many fact types, and
  each service selects only the subset it needs — which is also what keeps
  memory and unnecessary data exposure down.
- **Atomic mutation in Lua.** A single script replaces the primary value, the
  ordering metadata, and every secondary index membership in one Redis-side
  operation. Without that, a crash between writing a value and updating its
  index leaves the projection permanently inconsistent.
- **Replay-safe ordering.** The same script compares the event's Kafka timestamp
  (falling back to offset) against what is stored and rejects anything older, so
  duplicates are idempotent and a replay cannot clobber a newer live write.
- **Freshness as an explicit decision point.** The maintainer writes expiring
  check-in keys; before a read, the client verifies them against a configurable
  maximum lag and raises rather than silently serving data of unknown age. The
  caller then owns whether to fail closed, degrade, or fall back.

## Recovery, which is where the design earns its keep

Two consumers, different jobs. The **primary** follows the tail of the log and
applies live changes. The **recovery** consumer normally sits paused; every few
seconds it compares its assigned partitions against a set of markers stored per
specification *version*. If a partition is missing a marker, it resumes that
partition, seeks to the beginning, and replays retained history through the
*current* specification — while the primary keeps applying live writes in
parallel. The Lua ordering check is what makes running both at once safe.

That single mechanism covers three separate problems: Redis data loss, a schema
change that needs backfill, and an operator-forced rebuild. Delete the version
marker and recovery treats it as a rebuild.

The consequence for rollouts is that migrations must be *additive and ordered*:
bump the specification and let recovery finish first, then deploy code that
requires the new field. During replay, reads can legitimately observe old and
new shapes at once.

## Tradeoffs

| Decision | Buys | Costs |
|---|---|---|
| Async projection over synchronous reads | Owner off the normal read path; consumers isolated and independently scalable | Eventual consistency; debugging now spans database, publisher, Kafka, maintainer, and Redis |
| Service-owned Redis over one shared projection service | Failure isolation, no extra network hop, per-service data subsets | Redis capacity and operational work duplicated per adopter |
| Primary plus separate replay consumer | Live writes continue during rebuild; the cache is disposable | Replay depends on Kafka retention and can be slow; mixed-version reads while it runs |
| Redis sets as secondary indexes | Local equality and intersection queries with no database call | Memory and write amplification per index; hot values produce large sets |
| Lag checks that fail rather than serve stale data | Correctness-sensitive callers get an explicit decision point | Failing closed costs availability; check-ins prove maintainer liveness, not end-to-end source freshness |
| Library embedded per service, not a central tier | No extra request tier; integrates with each service's lifecycle | Version fragmentation; every service must upgrade to get a fix |

## What I'd be careful not to overclaim

This is an architectural bulkhead, not a request-level circuit breaker. It
removes the central service from the *normal* path; it does not make consumers
immune to its absence during a rebuild. Self-healing is bounded by Kafka
retention. And the capture-to-publish relay acknowledges rows around an
asynchronous publish rather than after confirmed delivery — a real gap that
wants a proper transactional outbox before anyone calls the pipeline
at-least-once end to end.

The next things worth building are end-to-end source-to-projection lag as a
first-class metric, explicit recovery-readiness signalling, and closing that
delivery-confirmation gap.
