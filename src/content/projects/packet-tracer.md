---
title: Packet Tracer
blurb: >-
  An interactive Ethernet and IPv4 packet-flow simulator written in Go and
  delivered to the browser through WebAssembly.
stack: [Go, WebAssembly, Networking, TCP/IP]
repo: https://github.com/hotpath-hooligan/packet_tracer
demo: https://hotpath-hooligan.github.io/packet_tracer/
featured: true
order: 8
---

Packet Tracer implements the mechanisms behind a small routed network: Ethernet
switching, IEEE 802.1D spanning tree, 802.1Q VLANs, ARP, ICMP, LLDP, static and
RIP routing, and RFC 2003 IP-in-IP tunneling. The native CLI carries simulated
frames over local UDP sockets; the browser version compiles the same Go model to
WebAssembly. It is the current evolution of the earlier Go-Netstack project.

The interactive UI makes each forwarding decision inspectable. A user can play
or step through ARP, ICMP, and LLDP events, then inspect interface state, STP
roles, MAC and ARP tables, routes, and discovered neighbors at that point in the
trace. Built-in scenarios cover switching, VLAN trunks, inter-VLAN routing,
route selection, STP failover, and campus topologies.

Custom YAML topologies stay entirely in the browser and can model up to one
hundred devices. Building the simulator meant treating protocol state as part of
the explanation: ARP cache changes, spanning-tree convergence, split-horizon
behavior, and encapsulation decisions need to be visible rather than hidden
behind a final successful ping.
