---
title: Policy-as-Code Authorization for a Polyglot Microservice Platform
blurb: >-
  Moving authorization out of service code and stale JWT claims into a central
  decision service, with tenant-defined roles that propagate without redeploying
  anything.
role: Worked on the policy model, the decision-plane contract, and the shared client adapter.
domain: [Open Policy Agent, Rego, Kubernetes, RBAC, Java, Python]
highlight: Roles and Permissions Framework
order: 85
---

## The problem

Authorization logic was spread across service code, with legacy permission data
baked into JWTs. That works for a fixed set of roles. It does not work when
tenants want to define their own roles, when enforcement has to be consistent at
the API, account, *and* individual-object level, and when the services doing the
enforcing are written in three different languages.

Baking permissions into a token has a specific failure mode worth naming: the
token becomes a stale copy of a mutable permission graph. Change a role and
every already-issued token is wrong until it expires.

## The design

Split into a control plane and a decision plane, with a deliberately small
contract between them.

**Control plane.** One service owns the administrative model — actors, custom
roles, scopes, permissions, resources — in a relational database. It compiles
those records into reusable policy statements plus compact role data,
fingerprints the output, and publishes it as Kubernetes ConfigMaps.

**Decision plane.** A stateless policy engine evaluates those rules. Each
replica runs a sidecar that watches for ConfigMap changes and loads them into
its local engine over localhost, skipping content already present by
fingerprint. Policy changes reach decisions without redeploying a single
consuming service and without the engine needing a database.

**The token contract.** The JWT carries an *opaque role reference*, not
permissions. The engine resolves that reference against current role and scope
data at decision time. Roles can change without reissuing tokens, and service
integrations stay stable because the token shape never grows.

**Request modelling.** Services don't send raw URLs. A shared adapter normalises
a route to a stable template, then an API map resolves (service, path,
transport, method) to a required action and resource. Permission identity is a
logical service name plus a normalised route template — never a deployment
hostname — so the model survives gateway routing and environment differences.

**Three enforcement points.** A *pre-check* before data retrieval rejects
obvious endpoint-level failures. A *filter* constrains list queries by allowed
account before records are loaded. A *post-check* evaluates the objects actually
returned, because some conditions depend on attributes only known after
retrieval. Skipping the third is exactly how object-level authorization gaps
happen.

Grants compose as OR between complete grants and AND within one grant. That
distinction sounds pedantic until you get it wrong: if condition categories can
each independently select a *different* statement, you can assemble a synthetic
grant nobody was actually given. It deserves explicit adversarial tests, not
just happy-path ones.

## Tradeoffs

- **A central decision point** gives polyglot services one policy language and
  releases policy independently of application deploys. It also adds a
  synchronous network hop and makes authorization depend on a shared service —
  so it evaluates in memory behind several replicas, with probes, timeouts, and
  request-local decision caching.
- **ConfigMaps as the delivery mechanism** are Kubernetes-native, need no extra
  datastore, and version cleanly. They also have size limits and converge
  eventually across replicas, so a malformed partial update is an availability
  concern. Fingerprints, startup bundling, and sync-status annotations reduce
  that; genuine scale would justify signed bundles from object storage instead.
- **The opaque role reference** keeps tokens small and stable, at the cost of
  making synchronized role data a hard dependency — and a role change can affect
  an already-active session.
- **Route templates as the permission vocabulary** let the same map generate
  both backend enforcement and the UI's "what can this user do" view. But
  templates and API maps must be updated together: an unmapped route is a
  security-relevant hole, so map completeness needs a contract test comparing
  deployed routes against the map.
- **Running legacy and new authorization side by side** during rollout keeps
  existing users working and surfaces mismatches in log-only mode. It also means
  enforcement is combined permissively at that stage, so a new-model denial
  cannot revoke a legacy grant. That is acceptable *only* as a time-boxed
  migration state with a measured cutover.

## The honest caveats

The permissions-discovery endpoint driving which actions a UI shows is a
*hint*, not enforcement — the backend still checks every request. The cached
decision key must include object identity, or two object checks on the same
route can reuse the first decision. And the engine trusts the caller for
identity and resource context by design, which keeps it stateless but means bad
client input produces bad decisions; that boundary wants schema validation.

The thing I'd build next is a cross-repository end-to-end test: today the
control plane, the sync sidecar, the engine, and the client library are each
well tested in isolation and mocked at the seams, which is precisely where
contract drift hides.
