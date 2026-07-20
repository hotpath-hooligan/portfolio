---
title: Go-Netstack
blurb: >-
  A userspace network stack in Go — L2/L3 switching, VLANs, RIP routing, ARP, and
  IP-in-IP tunneling.
stack: [Go, Networking, TCP/IP, Routing]
featured: true
order: 2
---

A network stack implementation in Go featuring Layer 2/3 switching, VLAN
support, the RIP routing protocol, ARP resolution, and RFC 2003-compliant
IP-in-IP tunneling with Explicit Route Object capabilities.

Building a stack from the frame up forces you to confront the parts that are
invisible when you use a kernel's: ARP cache invalidation, split-horizon in
distance-vector routing, and the encapsulation bookkeeping that IP-in-IP needs
to avoid MTU black holes.
