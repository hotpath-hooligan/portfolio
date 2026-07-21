---
title: Scaling Past a Monolithic Database With Whole-Stack Regional Shards
blurb: >-
  When a tenant's shard is an entire AWS account, VPC, cluster, and datastore
  set — and every service has to deploy identically into all of them.
role: Owned service infrastructure delivery into the shard fleet; wired dependencies, state, and capacity across environments.
domain: [Terraform, Terragrunt, Kubernetes, AWS, Helm]
order: 55
---

## What "sharding" means here

Not database sharding. Each tenant is assigned to a **complete regional
deployment** — its own cloud account, VPC, compute cluster, services, and data
stores. A small global control plane knows the tenant-to-shard mapping;
everything else about that tenant lives inside the shard.

The drivers were stacked:

- The monolith's relational database had a **vertical scaling ceiling** that was
  coming into view.
- Noisy tenants could affect one another with no boundary between them.
- Customers required data residency in specific countries and regions.
- Regional deployment cut latency.

The honest framing of the choice: a whole-stack boundary addressed the tightly
coupled database ceiling **immediately**, while microservice extraction
continued on a much longer timescale. The team knowingly accepted duplicated
infrastructure and fleet-management overhead to buy that time.

## Keeping clients shard-agnostic

Existing web, mobile, and API clients could not be asked to learn about shards.
Three flows, three answers:

- **Browsers** hit a global URL and get redirected to the shard-specific
  application URL after login, with cookies scoped so one shard cannot overwrite
  another's session.
- **API clients** are handled at the edge: a worker extracts the credential,
  checks a short-lived edge cache, resolves credential → tenant → home shard on
  a miss, rewrites the hostname, and proxies. Requests without a usable token,
  or whose lookup fails, fall through to the original shard — favouring
  availability and backward compatibility, which makes downstream authorization
  non-negotiable rather than a formality.
- **Devices** must select a shard *before* establishing a long-lived TLS
  connection, so resolution happens in a dedicated origin tier ahead of the
  connection rather than after it.

## What I actually owned

Making one service deploy consistently across the whole fleet, which is a
different problem from designing the fleet.

I added the shared cache configuration for a diagnostics service, including
key-expiry event behaviour, and wired its infrastructure layer to consume subnet
and security-group outputs from the core cloud layer — then propagated the
generated endpoint into the application layer across eleven development, test,
and production environments. Later I introduced a reusable default for its
internal-event consumer with an explicit replica count in every production-class
environment.

The point of that second change is worth more than it sounds: it replaced
implicit, environment-by-environment sizing with an explicit, reviewable
default. Common behaviour lives in hierarchical defaults; shard-level overrides
exist **only** where production sizing genuinely differs. Before, you could not
answer "how much capacity does this consumer have in Australia?" without reading
that environment's state.

I also extended the bootstrap workflow with conditional retained static IPs and
safe import of existing addresses, standardised CDN-backed SDK endpoints across
environments and corrected production endpoint routing in three of them, and
added deployment wiring for a service's broker credentials through the
dependency graph.

## How hundreds of units deploy safely

A configuration hierarchy — global, account, region, shard, service — with
encrypted overrides and CI checks for invalid inputs, redundant overrides, and
incomplete key coverage. The orchestration layer turns infrastructure outputs
and inputs into an ordered dependency DAG, while immutable version pins and
separate state files constrain the blast radius of any single change. A single
production shard runs to nearly two hundred deployable units.

The operational risks are exactly what that description implies: partial
deployments leaving a shard half-applied, cross-state coupling making an
innocuous change land somewhere unexpected, and version skew — intentional
during a staged rollout, and a debugging nightmare when it isn't.

## The genuinely hard problem: moving a tenant

Changing the directory entry is only the routing cutover, and it's the easy
part. A safe move has to coordinate cached mappings at the edge and in every
service, transactional data, asynchronous in-flight work, provisioning records,
traffic already mid-request, validation that the move succeeded, a rollback path
if it didn't, and cross-shard reporting that must keep working throughout.

That is why automated tenant movement stayed open work while the rest shipped.
It's the sort of thing that looks like a data migration and is actually a
distributed consistency problem.

## What I'd prioritise next

Explicit cache invalidation for tenant moves; an automated migration state
machine rather than a runbook; rendered configuration diffs so a shard change is
reviewable before apply; a fleet version inventory so skew is visible rather
than discovered; credential rotation outside the apply cycle; and
disaster-recovery exercises with *measured* recovery objectives instead of
documented intentions.

## A note on numbers

Capacity figures in the architecture documents — the fleet size a single
database could hold, the fleet size the sharded design targets — are design
estimates, not measured outcomes. I keep those separate from anything I'd
present as an achieved result, because the difference matters and it's the first
thing a good interviewer will probe.
