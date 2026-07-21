---
title: An SD-WAN Overlay Dataplane, and the MTU Bug Hiding in Its Topology
blurb: >-
  A userspace DPDK forwarding path doing GRE encapsulation, WAN bonding, and
  FEC — and the interface-role split that removed a structural fragmentation
  problem.
role: Traced and redesigned the tunnel interface and addressing model; worked on the userspace forwarding path.
domain: [DPDK, C, Go, GRE, IPsec, Networking]
order: 70
---

## The system

An encrypted, routable Layer-3 overlay across multiple unreliable WAN links —
cellular, Wi-Fi, Ethernet, satellite. On the branch router, a DPDK user-mode
driver takes packets from Linux through virtual interfaces and performs GRE
encapsulation and decapsulation, DSCP-aware bonding across links, packet
duplication with deduplication, sequence-aware reordering, forward error
correction, and quality-of-experience measurement.

The deliberate boundary: **Linux keeps routing, NAT, IKEv2, and IPsec; the
userspace path handles only the packet transformations that benefit from DPDK.**
Reimplementing key exchange and policy in the fast path would have hugely
expanded the security and lifecycle surface for no real gain.

Alongside it, a Go control application receives new-flow events from a gateway
dataplane over shared memory, enriches them with identity and destination
context, evaluates policy, allocates addressing, and returns forwarding
decisions — keeping per-flow decision-making off the packet fast path entirely.

## The bug that was really a topology problem

The first design used the *same* per-tunnel virtual interface for plaintext
packets going into the userspace driver and GRE packets coming back out. That
quietly coupled two different MTU requirements onto one interface.

Concretely: a 1,350-byte inner packet becomes at least 1,378 bytes once you add
the outer IPv4 header, the GRE header, and the GRE key — 28 bytes of base
overhead before bonding sequence numbers and IPsec add more. So a packet that
fit perfectly on the way *in* could fragment on the way *out*, purely because
encapsulation happened on the return trip from userspace. Larger traffic could
end up fragmented on both sides.

Raising the MTU doesn't fix it. The inner and outer paths genuinely have
different sizes, the underlay may not accept a larger frame, and a bigger number
does nothing about tunnel identity, reverse routing, or per-WAN policy
selection.

**The fix was to model the two packet forms explicitly.** Each tunnel keeps its
own virtual *receive* interface for plaintext, while all encapsulated traffic
leaves through one shared *transmit* interface sized for outer packets.

That created a second problem: with one shared transmit path, how does the
return traffic know which tunnel it belongs to, and which WAN it should leave
by? Solved with an addressing scheme carved out of a reserved documentation
range — per-tunnel /30 link networks for the point-to-point receive interfaces,
plus a shared /25 giving each tunnel a unique NAT identity on the transmit side.
Each tunnel gets a distinct internal source address; firmware installs
source-based routing plus SNAT to the selected WAN address on egress and DNAT
back to that tunnel identity on ingress.

That one identity does three jobs at once: it avoids a source address Linux
would reject as martian, it identifies the originating tunnel on the return
path, and it lets Linux select the correct WAN, SNAT rule, and IPsec policy.

The hard part was never GRE encapsulation. It was maintaining a correct
*bidirectional* mapping across the kernel/userspace boundary — inner route to
tunnel, tunnel to internal identity, identity to dynamic WAN, and the reverse
path after IPsec decryption — including cleanup and restart replay.

## Why GRE and IPsec, both

They solve different problems. GRE gives a keyed, routable Layer-3 overlay and
carries tunnel identity; it is not secure on its own. IPsec authenticates and
encrypts packets crossing the public underlay, and keeping it in Linux reuses a
mature IKEv2 and policy lifecycle rather than rebuilding it.

The payoff is session continuity: the customer's inner addresses and ports never
change inside the GRE header, so when the selected WAN link changes, only the
outer path and source address change. The application session survives a link
switch because the stable overlay is decoupled from the changing underlay.

## Tradeoffs

- **WAN resilience mechanisms trade bandwidth and CPU for link behaviour.**
  Duplication protects against loss by sending the same data twice; FEC spends
  bandwidth on recoverability; interleaving aggregates throughput at the cost of
  reordering state. All of them are DSCP-selectable per traffic class precisely
  because none is universally correct.
- **Full tunnel vs. split tunnel vs. direct breakout.** Full tunnel centralises
  egress and policy but consumes hub capacity and needs explicit exclusions for
  management, NTP, and certificate traffic. Direct local breakout — guest Wi-Fi
  straight to the internet — cuts latency and tunnel load but needs careful route
  and security planning. As spoke networks multiply, a dynamic routing protocol
  eventually beats a large static route set, at the cost of a more complex
  control plane.
- **The interface table is bounded**, and the shared transmit interface consumes
  an entry, so tunnel capacity is a real ceiling to design against rather than
  something that scales freely.

## What I'd refuse to claim

That duplication gives "zero packet loss" — it gives loss *protection*, under
some failure modes. And any specific failover timing figure without a test
report behind it. Those numbers are exactly the kind that get quoted back at you
in an incident review.
