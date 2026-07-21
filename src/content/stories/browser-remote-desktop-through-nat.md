---
title: Browser-Based Remote Desktop Into Networks Behind NAT
blurb: >-
  Zero-install RDP and VNC access to machines on private customer networks,
  reached through a device-originated reverse SSH tunnel with no inbound
  firewall change.
role: Worked on session lifecycle orchestration, the routing and authorization path, and the edge agent.
domain: [Apache Guacamole, SSH, Kubernetes, Envoy, WebSockets, RabbitMQ]
highlight: Remote Connect
order: 95
---

## The problem

Support engineers needed to reach Windows RDP and VNC desktops sitting on
private networks behind managed routers. Those sites typically use NAT, carrier
networks, and restrictive firewalls. Requiring a VPN client or an inbound port
forward was operationally unrealistic — and a browser cannot speak RDP or VNC
anyway.

So: authorize a user, reach a specific LAN IP and port without touching the
customer firewall, isolate every session, detect tunnel failure, scale across a
large device fleet, and clean up every temporary resource afterwards.

## Shape of the solution

Split cleanly into a control plane and a data plane.

**Control plane.** The API validates identity, tenant and policy access, and
feature entitlement, then creates session state and an ephemeral SSH keypair and
asynchronously provisions a single-use SSH server pod. It pushes the LAN target,
pod address, and key down to the router's config channel.

**The tunnel.** A small agent on the router picks that up and opens an
*outbound* SSH connection carrying a generic TCP reverse forward: cloud port →
LAN IP:port. Outbound is the whole trick — the router can traverse NAT and
restrictive firewalls on its own, so no customer-side listener or VPN route is
needed. An optional public SSH gateway gives one entry point and keeps cluster
pod IPs private; it validates the per-session key and pins it to exactly one
destination pod.

**Data plane.** Browser HTTPS/WSS terminates at the public edge. A proxy tier
verifies *two* tokens and routes the WebSocket to a chosen translation pod,
where a protocol daemon acts as the actual RDP/VNC client and converts the
session into drawing instructions the browser renders. The browser never speaks
RDP or VNC at all.

## The parts that were actually hard

**Binding the right user to the right dynamic backend.** Sessions are
short-lived and their backend is chosen at runtime, so there is no static route
to authorize against. We used two JWTs with different issuers: one proves *who
the user is*, one proves *which short-lived backend that user may reach*. The
edge proxy validates both and requires their subject claims to match. That
specifically defeats token splicing — pairing one user's identity token with
another user's destination token.

**WebSocket affinity without sticky load balancing.** Desktop sessions are
long-lived and pod-local. Rather than introduce load-balancer session state, the
orchestrator selects a translation pod up front and *signs that pod's address
into the routing token*. The proxy forwards to the signed target. Routing stays
stateless and deterministic, and the tier scales horizontally.

**Getting long setup off the request path.** Provisioning a pod, installing the
agent, and waiting for a router callback is far too long to hold an HTTP worker.
We moved the lifecycle into a durable queue consumer driven by callbacks, so the
API returns immediately, worker restarts don't strand sessions, and lifecycle
capacity scales separately from API capacity.

**Fitting the agent on the device.** The edge agent ships for five router
architectures on constrained hardware, so the SSH client is a size-optimised
implementation, and tunnelled sockets are marked so they participate in the
device's existing traffic-accounting path.

## Isolation model

One session gets one disposable SSH server pod and one ephemeral key. Deletion
*is* revocation. Session pods run in a dedicated namespace with bounded
resources and a deny-egress policy, plus configured expiry, duplicate-safe
teardown, and a janitor that reaps orphans when normal cleanup is missed.

## Tradeoffs

- **Protocol translation instead of a native client** buys zero-install browser
  access and one UI for both protocols, and costs latency, CPU, and an extra
  failure tier. Some native capabilities — device redirection, UDP
  acceleration — are simply unavailable, because the reverse forward is TCP-only.
- **Reverse SSH instead of a VPN** works through NAT with a narrow, temporary
  path, but it is *not* out-of-band management. If the router or its WAN link is
  down, this design cannot reach anything; that failure class needs a BMC or a
  console server.
- **A protocol-agnostic edge agent** means one mechanism serves RDP, VNC, SSH,
  and HTTP alike — and means there is no protocol-aware health check. Reported
  readiness proves SSH authenticated, not that the final desktop is usable.
- **A pod per session** gives a small blast radius and clean ownership, and
  costs cold-start latency and pod/IP pressure at scale. Prewarming a few trades
  idle cost for setup time.
- **Signed pod affinity has no mid-session failover** — deliberately. Losing the
  pod ends the session; there is no transparent reconnect, and an existing TCP
  desktop session cannot be migrated. Recovery means a new connection.

## What I'd fix first

Replace the browser-readable session token with an authenticated-encryption
scheme or a short opaque handle resolved server-side; pin SSH host keys; require
TLS with certificate verification for managed targets rather than accepting any
negotiated security mode for field-device compatibility; add a real
reverse-listener readiness probe instead of inferring readiness from
authentication success; and index key fingerprints directly rather than scanning
active session records during gateway authentication.
