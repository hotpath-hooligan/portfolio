---
company: Ericsson
role: Software Engineer III
start: Nov 2021
end: Present
order: 2
summary: >-
  Owns platform-level systems across remote diagnostics, secure access, event-driven
  data distribution, and authorization for Ericsson's enterprise networking products —
  several of which became foundational frameworks adopted across the wider microservice
  platform. Work spans the device data plane, the platform substrate, the multi-region
  deployment fleet, and more recently LLM-based operator tooling.
highlights:
  - name: Speedtest Framework
    detail: >-
      Led a team to own end-to-end design and delivery of a remote diagnostics
      platform processing over 2 million speedtest runs per month to assess WAN
      performance across Ericsson devices. Drove expansion into a full
      troubleshooting suite — ping, traceroute, packet capture — with inbuilt
      automation enabling customers to perform preemptive network monitoring.
      Routed test traffic through AWS Global Accelerator so ~100 individually
      addressable measurement servers gained stable public reachability without
      changing an already-deployed probe fleet.
    tech: [Distributed Systems, Network Diagnostics, AWS Global Accelerator, Kubernetes, Automation]
  - name: Remote Connect
    detail: >-
      Architected and delivered a secure remote access system supporting 10,000+
      concurrent sessions across HTTP, SSH, RDP, and VNC with sub-5-second
      connection times, deployed as part of Ericsson's SASE solution. Drove design
      decisions on session brokering (Apache Guacamole) and automatic device
      discovery via DHCP, reaching machines on private customer networks through a
      device-originated reverse tunnel with no inbound firewall change.
    tech: [Apache Guacamole, SSH, RDP, VNC, DHCP, SASE]
  - name: Core Facts
    detail: >-
      Designed and implemented a distributed, event-driven framework that
      eliminated direct database dependency — streaming entity state via Kafka
      into per-service Redis caches, with atomic Lua-backed indexing, freshness
      guardrails, and replay-based cache rebuilds. Adopted across a large number
      of microservices on the platform.
    tech: [Kafka, Redis, Lua, Event-Driven Architecture, Microservices]
  - name: Roles and Permissions Framework
    detail: >-
      Built a fine-grained, multi-tenant RBAC framework using Open Policy Agent
      (OPA) for declarative, AWS IAM-style policy enforcement, letting 20+
      microservices define their own roles and enforce authorization consistently
      at the API, account, and individual-object level across three languages.
    tech: [Open Policy Agent, RBAC, Rego, Authorization, Java, Python]
  - name: AI-Based NetCloud Assistant (ANA)
    detail: >-
      Contributed to an LLM-powered agentic troubleshooting system using LangGraph
      and AWS Bedrock (Claude), featuring tool-use orchestration, RAG-based
      knowledge retrieval (OpenSearch), and a dual-pipeline Rasa NLU chatbot with
      custom LLM intent classifiers and real-time WebSocket streaming.
    tech: [LangGraph, AWS Bedrock, RAG, OpenSearch, Rasa NLU, WebSockets]
  - name: Remote Task Execution Framework
    detail: >-
      Owned the response-correlation and worker-decoupling path of an asynchronous
      RPC framework that lets any cloud workflow run commands on intermittently
      connected devices behind NAT — without the caller knowing which gateway
      process owns the device socket. Backend logic moved off the connection tier,
      so backend and schema changes stopped disturbing live device connections.
    tech: [RabbitMQ, Redis, Python, TLS, Distributed Systems]
  - name: Common Data Platform
    detail: >-
      Worked on the streaming funnel service, Avro schema-contract enforcement, and
      the data-lake ingest path of a Kafka-backed platform that treats data as the
      first-class component. Normalized raw device telemetry into 20+
      schema-managed topics and used Kafka Streams windowing to compute 15-minute
      and hourly rollups, with a lake path from raw events to partitioned analytics.
    tech: [Kafka, Kafka Streams, Avro, Schema Registry, Java, Spark, S3]
  - name: Regional Stack Sharding
    detail: >-
      Owned service infrastructure delivery into a fleet of whole-stack regional
      shards — each tenant assigned to a complete deployment with its own AWS
      account, VPC, cluster, and data stores. Wired dependencies, state, and
      capacity across production-class shards in the US, Europe, and Australia,
      lifting the monolithic database ceiling and meeting data-residency
      requirements.
    tech: [Terraform, Terragrunt, Kubernetes, AWS, Helm]
  - name: SD-WAN Overlay Dataplane
    detail: >-
      Worked on a DPDK userspace forwarding path doing GRE encapsulation,
      DSCP-aware WAN bonding, packet duplication, reordering, and forward error
      correction across unreliable links. Traced a structural GRE MTU
      fragmentation problem to the tunnel interface and addressing model, then
      redesigned the per-tunnel receive and shared transmit split that removed it.
    tech: [DPDK, C, Go, GRE, IPsec, Networking]
  - name: Single-VM Private Deployment
    detail: >-
      Contributed the device stream server, cloud-abstraction layer, and
      on-premise network design that let an eight-service, seven-datastore cloud
      product ship as one self-contained air-gapped VM appliance — installable in
      about fifteen minutes with no outbound internet access, from the same
      codebase as the cloud build.
    tech: [Go, Kubernetes, Kafka, Cilium, TLS, Redis]
---

Ericsson's enterprise networking platform serves managed WAN, security, and
diagnostics to large fleets of deployed devices. My work there has spanned the
data plane (diagnostics, remote access, and SD-WAN forwarding at scale), the
platform substrate (event-driven state distribution, streaming data contracts,
authorization), and the delivery fleet (regional shards, air-gapped on-premise
packaging) — with the more recent work moving into LLM-based operator tooling.
