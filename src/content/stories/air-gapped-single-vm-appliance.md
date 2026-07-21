---
title: Collapsing a Cloud Platform Into an Air-Gapped Single-VM Appliance
blurb: >-
  Shipping an eight-service, seven-datastore cloud product as one self-contained
  VM that installs in fifteen minutes with no internet access — from the same
  codebase.
role: Worked on the device stream server, the cloud abstraction layer, and the on-premise network design.
domain: [Go, Kubernetes, Kafka, Cilium, TLS, Redis]
order: 65
---

## The problem

The product ran in two government cloud regions as eight microservices over
managed Kafka, relational, cache, object-storage, and identity services.
Regulated and critical-infrastructure customers wanted the same product
**on-premise and air-gapped**, installed by their own administrators — who are
network engineers, not Kubernetes operators.

The constraint that shaped everything: ship a single-VM deployment **without
forking the codebase**, and make installation something an admin finishes in an
afternoon with no outbound internet access.

## How it was done

**A cloud-abstraction layer earned its keep.** Storage, queue, key-value,
secrets, and identity were already behind adapter interfaces. Adding a `PRIVATE`
mode meant pointing those interfaces at drop-in open-source equivalents — the
managed object store swapped for a gateway implementation, managed Kafka for a
compatible broker, managed cache for a compatible cache, the managed identity
provider for a self-hosted OIDC server, and a relational database standing in
for the cloud key-value stores. **No application-layer fork.**

**K3S on a single VM, not docker-compose.** The tempting shortcut was compose,
which would have been simpler for one VM. Choosing lightweight Kubernetes
instead kept the Helm charts, manifests, and operational runbooks *shared* with
the cloud deployments — so a change ships to all three targets, and the on-prem
build doesn't quietly rot.

**A host-level OCI registry outside the cluster** makes every image pull local.
That's what makes the air gap real rather than aspirational, and it removes
registry credentials from the install entirely.

**One ingress IP, three ports.** All ingress — HTTPS for browsers, TLS
passthrough for the device protocol, and plain HTTP for firmware download —
consolidated onto a single gateway address. The customer's firewall needs
exactly three DNAT rules.

Packaged as an OVA with a single install script taking an IP, a certificate, a
key, and a domain. Roughly ten to fifteen minutes to install; the minimum
hardware profile supports thousands of devices and the large profile several
times that.

## Two problems worth spelling out

### One NIC, two IPs

The initial appliance design gave the VM two network interfaces — one for
management, one for application traffic. Customers kept misconfiguring the
second one: wrong VLAN, wrong subnet, asymmetric routing. It dominated support
load during pilots.

The fix was to keep *two IPs* but put them on *one interface in the same
subnet*: a configured address for SSH and the cluster API, and a floating
application address that the CNI's L2 announcement owns and publishes by
gratuitous ARP. The application IP is never configured on the interface at all.

The lesson wasn't really technical. "Two IPs" and "two NICs" had been conflated
in the original document, and naming that distinction explicitly removed most of
the confusion by itself. The two real prerequisites — reserve both addresses,
and permit gratuitous ARP if dynamic ARP inspection is on — then fit in two
lines of documentation.

### Routing a message to a device on a specific pod

Devices hold persistent TLS connections to *one specific* stream-server pod. Any
other service — config push, firmware upgrade, reboot — needs to reach that exact
device, has no idea which pod owns it, and pods scale and restart underneath.

Rather than add a service-discovery layer or let services call the stream server
directly, each pod **creates a Kafka topic named after itself** on startup and
deletes it on shutdown, with stale topics reaped. On device bind, the pod
publishes its device-to-topic mapping to a status topic, cached in the shared
key-value store. Senders look up the topic and produce a message with a session
header; the owning pod dispatches by session ID to the right connection channel.
Replies correlate through a response ID registered in a callback cache.

The result: zero direct HTTP calls into the stream server, pods scale and
restart without any other service changing, and per-device ordering is preserved
by partitioning on device ID.

**The tradeoff I'd name unprompted:** dynamic per-pod topics add churn to the
broker and depend on cleanup actually working. The per-session channel buffer is
small and **overflow drops with a warning** — a deliberate choice to protect the
pod from one slow device, but it means the command path is at-most-once and
correctness lives in the retry layer, not the transport. That has to be said out
loud, because "reliable command delivery" is what people will assume.

## Other tradeoffs

- **Logical database indices per service** in one shared cache let seven
  services use identical key patterns without collision, documented as a
  contract table. Honest caveat: logical databases are a *namespacing
  convention*, not isolation — shared memory, shared eviction, and a flush hits
  everything. Right call for a single-VM appliance, wrong one for the clustered
  cloud deployment.
- **One codebase, three deployment targets** means every new target is cheap and
  every abstraction leak is expensive. The abstraction layer paid for itself the
  moment a third target appeared.
- **The expensive part was never the application code.** It was the
  *operational* surface — DNS, certificates, NTP, ARP — which is what actually
  breaks at customer sites.

## Compliance as an engineering constraint

The regulated deployment made the supply chain a design problem: code is
developed outside the authorization boundary, but everything crossing into it
must be signed, scanned, and attributable. That became a four-phase lifecycle —
development with dependency scanning, packaging where the pipeline aborts on any
new critical or high finding, an in-boundary staging step that verifies
signatures and digests before copying artifacts in, and production behind
two-person approval with time-limited, session-recorded credentials.

Static database credentials were removed entirely in favour of workload
identity, so no pod holds a password to any datastore.
