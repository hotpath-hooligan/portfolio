---
title: Asynchronous Remote Execution Against Devices Behind NAT
blurb: >-
  A connection-aware RPC framework letting any cloud workflow run commands on
  intermittently-connected devices without knowing which process owns the
  socket.
role: Owned the response-correlation and worker-decoupling path.
domain: [RabbitMQ, Redis, Python, TLS, Distributed Systems]
order: 60
---

## The problem

A fleet of cellular routers, frequently behind NAT, often on slow or unstable
links. Cloud services still needed to push configuration, collect status, run
diagnostics, install event listeners, and resynchronise a device after
reconnect.

Two structural facts made this awkward. The long-lived gateway processes owned
the *only* reachable socket to each device. And backend behaviour had
accumulated in a single worker tier, so it could not scale independently — and
deploying a backend or schema change risked disturbing live device connections.

### Why the connection is outbound

Devices have private, changing addresses behind customer firewalls or
carrier-grade NAT. The cloud **cannot** dial them: there's no NAT mapping for an
unsolicited inbound packet, so it's dropped. Requiring public addresses or port
forwards would be operationally unrealistic and would create a new inbound
attack surface.

So the device opens an outbound TLS connection to a known gateway. That creates
the NAT mapping and the permitted flow, and because TCP is full duplex the cloud
can send commands back over the already-established connection. Keeping it open
also amortises TLS and authentication and keeps command latency low.

The price is precisely what makes the rest of this design necessary: **stateful
socket ownership.** Every task has to reach the exact process and the exact
connection that owns the live flow.

## The design

A message-driven RPC pipeline with the routing lookup made explicit.

1. **Task envelopes** standardise on system, command, options, and — when a
   result is wanted — a response ID plus a return destination. Typed helpers
   cover configuration, file transfer, stream control, and event triggers.
2. **Route resolution before publish.** The library looks up the device's
   current gateway route *and exact connection ID* in a client-state cache, then
   publishes through a direct exchange to the per-process queue that owns that
   socket. The caller never knows or cares which process that is.
3. **Two response strategies, deliberately.** Short synchronous web requests use
   a directly-waitable in-process future and a private reply queue. Distributed
   workflows instead represent the continuation as an *importable callback plus
   JSON arguments*, stored in Redis under the connection and response ID — so
   **any** compatible worker can reconstruct and run it when the reply arrives.
   That is what lets response processing and connection handling scale and
   deploy independently.
4. **The gateway stays narrow.** It handles asynchronous socket and protocol
   work only, translating between queue messages and the device's persistent
   stream. Slow database and business work stays off the socket event loop.
5. **Connection-aware lifecycle.** One-shot and repeating futures, cancellation
   when the device is offline, cleanup of connection-scoped callbacks on
   observed disconnect, reconnect viability checks, and TTLs as the fallback for
   a disconnect event that was missed.
6. **Push filtering to the edge.** Installable device-side event triggers with
   bounded memory- and file-backed store-and-forward holds, so telemetry is
   qualified on the device instead of polled from the cloud — and selected events
   survive a WAN outage.

## Results

A shared mechanism used across dozens of modules and workflows — configuration
sync, device health, firmware and app orchestration, link discovery, logging.
Socket ownership, task creation, and response processing became independently
scalable and deployable; backend changes no longer had to ship alongside the
stateful connection tier. The connection tier is capacity-planned per pod with
readiness limits, a process-local hard connection cap, jittered reconnect
backoff, and controlled draining during rollouts — because a naive rollout of a
tier holding thousands of persistent connections is a self-inflicted reconnect
storm.

## What this framework is not

Worth stating plainly, because these get assumed:

- **It is not a durable job scheduler.** It is connection-aware RPC. If a device
  is offline, work is cancelled, not queued indefinitely.
- **It does not provide exactly-once execution.** For an operation like a reboot
  that may drop the connection before replying, *submission* and *confirmed
  execution* are deliberately different outcomes. Idempotency is the caller's
  responsibility.
- **The remote code path is a trusted control-plane capability, not a security
  sandbox.** I'd rather say that than let someone infer a boundary that isn't
  there. The work I did do here was narrowing serialization risk on selected
  paths — moving file reads off arbitrary deserialization, restricting the legacy
  decoder's opcode set, and storing distributed callbacks as module and function
  names plus JSON arguments rather than pickled objects. Trusted legacy paths
  still exist elsewhere.

## Tradeoffs

- **Persistent connections** buy low latency and NAT traversal, and cost
  stateful ownership, keepalives, reconnect storms, and route-staleness handling.
- **Redis-backed distributed callbacks** decouple the tiers, and require the
  continuation to be an importable reference — so a rename in the wrong place
  breaks in-flight work. The descriptor is versioned and validated for that
  reason.
- **Edge triggers** cut cloud polling and cellular bandwidth substantially, and
  move logic onto devices that are expensive to update — so trigger definitions
  must be reinstallable and authoritative from the cloud on reconnect.
- **Correlation IDs and causality tracing** are non-optional at this hop count.
  Debugging a request that crosses a caller, a cache, a broker, a socket, a
  device, and a different worker on the way back is impossible without them.
