---
title: Per-Endpoint Public Routing for Clients That Cannot Be Upgraded
blurb: >-
  Giving ~100 individually-addressable measurement servers stable public
  reachability without changing an already-deployed client fleet, and without a
  load balancer per endpoint.
role: Designed and shipped the routing architecture, the reconciliation controller, and the protocol patch.
domain: [AWS, Kubernetes, Networking, Terraform, Python]
highlight: Speedtest Framework
order: 100
---

## The problem

A WAN performance measurement platform was moving off on-premise infrastructure
onto managed Kubernetes. It runs throughput tests between probes deployed in the
field and a fleet of measurement servers.

The binding constraint: **the probes were already deployed and could not be
updated.** No new agent version, no config push, no DNS indirection. All a probe
does is connect to an IP and a port — that is the entire contract. Routing had
to be a pure function of destination IP and destination port.

A second constraint made it harder. The measurement protocol is not
single-connection: the client opens a control connection, and the server replies
on that channel with the port to use for the *data* connection. So the server
has to know, and truthfully advertise, its own externally-reachable port.

And the scale target was ~100 concurrently addressable endpoints, each
individually reachable — explicitly *not* load balanced. The product measures
the path to a *specific* endpoint, so "spray traffic across healthy backends" is
a correctness bug, not a feature.

## Two designs that didn't survive

**One load balancer per endpoint** was the obvious cloud-native answer and it
worked functionally. It died on economics: load balancers bill per-hour plus per
capacity unit, and we needed one per endpoint, so cost scaled linearly with the
fleet. At ~100 endpoints — with a roadmap to more — the monthly bill for what is
essentially a NAT rule was indefensible. It also consumed elastic IPs and pushed
against account-level quotas, which turns every capacity increase into a support
ticket.

**A shared L4 proxy** collapsed those N load balancers into one public entry
point doing port-based demultiplexing. Two things killed it. Operationally, the
proxy became stateful infrastructure we owned: pods are ephemeral, so every
reschedule changes a backend IP, and the backend map needed continuous
regeneration and reload. We would have been writing a control plane for a proxy
in order to avoid writing a control plane — and still owning its availability,
scaling, and upgrade story. It was also an extra in-path hop that could distort
the very latency numbers the product exists to measure. On security, the proxy
node had to be publicly exposed, putting a general-purpose L4 proxy with a wide
open port range in front of our private network.

## What shipped

The cloud provider has a primitive that is an exact fit: an accelerator mode
that does **deterministic, stateless mapping from (public IP, public port) to
(private subnet IP, destination port)** instead of load balancing. The mapping
is computed from the subnet CIDR and the destination port list — it is not a
table anyone maintains, and it does not drift.

That property answers the original constraint directly. The client's contract is
"IP and port"; this primitive's contract is "IP and port determine the
destination." They compose exactly.

- **Terraform** provisions the accelerator, a listener over a wide port range,
  and an endpoint group whose members are the cluster's **private** subnets.
- **Default deny.** Every mapping exists in a denied state from creation.
  Traffic flows only for (pod IP, port) pairs explicitly allow-listed. Nothing
  is reachable by accident — the security property the proxy design could not
  offer.
- **A reconciliation controller** watches labelled pods. On pod-ready it
  resolves the pod IP to its subnet by CIDR arithmetic — no cloud API call in
  the hot path — allows the pair, reads back the assigned port mapping, and
  annotates the pod with it. On not-ready, delete, or IP change it denies the
  old address and allows the new one. Standard desired-versus-observed
  reconcile, so it is idempotent and safe to restart.
- **The protocol patch.** This was the subtle part. The accelerator translates
  ports, so a client hitting public port 54853 lands on pod port 12866. But the
  stock server advertises *its own local* data port on the control channel. The
  client would then dial the public port of that number — which maps to a
  completely different pod. Tests failed in a way that looked like random
  cross-talk. We added a flag letting the server listen locally on one port
  while advertising another, and each pod discovers its own assigned ports at
  startup by querying the mapping API for its own IP. Mappings are readable
  while still denied, so startup does not race the controller.

## Results

- ~100 pods individually addressable from the public internet on stable
  IP+port pairs, with **no client-side change** — the migration was invisible to
  the field fleet.
- Cost went from N load balancers to one accelerator: flat, plus data transfer,
  instead of linear in endpoint count.
- **Pods stayed on private subnets with no public IPs**, and reachability became
  default-deny with an explicit per-(IP, port) allow-list. Strictly better
  posture than either earlier design.
- Traffic enters at the nearest edge location over the provider's backbone
  rather than the public middle mile, which *stabilises* the measured path — and
  removes the proxy hop that would have biased results.

## Tradeoffs I'd name unprompted

- **We now maintain a protocol fork.** Small and well-scoped, and cross-compiled
  for two architectures, but real. Neither rejected design needed it, because
  neither translated ports.
- **Port assignment is derived, not chosen.** You cannot guess which port
  belongs to which pod; debugging means reading a pod annotation or calling the
  mapping API. Mitigated by annotating every pod and by a lookup helper script.
- **Ports change when a pod's IP changes.** Anything caching that mapping across
  a reschedule is wrong.
- **Fleet size is bounded by the provisioned listener port range.** Comfortable
  headroom for the roadmap, but it is a ceiling, not elasticity.
- **The controller runs single-replica with no leader election.** Reconciliation
  is idempotent and watch-driven, so a restart re-derives state from the API
  server. A few seconds of control-plane downtime delays reachability for new
  pods and breaks nothing in flight, because the data path is stateless.
- **Failure is fail-closed.** If the controller is down, new pods come up
  unreachable rather than reachable-but-unrouted. For a system whose front door
  is the public internet, that is the correct default.

## The actual lesson

The two failed attempts weren't waste — they were how we found out what we were
optimising for. The first taught us the cost model was the binding constraint.
The second taught us that "one public front door" is only a win if you don't
have to *operate* the front door, and that an in-path proxy is disqualifying for
a latency-measurement product specifically. Once both were explicit, the
accelerator stopped looking exotic and started looking like the only primitive
that satisfied all three axes at once.
