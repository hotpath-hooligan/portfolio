---
company: Ericsson
role: SDE 3
start: Nov 2021
end: Present
order: 2
summary: >-
  Owns platform-level systems across remote diagnostics, secure access, and
  authorization for Ericsson's enterprise networking products — several of which
  became foundational frameworks adopted across the wider microservice platform.
highlights:
  - name: Speedtest Framework
    detail: >-
      Led a team to own end-to-end design and delivery of a remote diagnostics
      platform processing over 2 million speedtest runs per month to assess WAN
      performance across Ericsson devices. Drove expansion into a full
      troubleshooting suite — ping, traceroute, packet capture — with inbuilt
      automation enabling customers to perform preemptive network monitoring.
    tech: [Distributed Systems, Network Diagnostics, Automation]
  - name: Remote Connect
    detail: >-
      Architected and delivered a secure remote access system supporting 10,000+
      concurrent sessions across HTTP, SSH, RDP, and VNC with sub-5-second
      connection times, deployed as part of Ericsson's SASE solution. Drove design
      decisions on session brokering (Apache Guacamole) and automatic device
      discovery via DHCP.
    tech: [Apache Guacamole, SSH, RDP, VNC, DHCP, SASE]
  - name: Core Facts
    detail: >-
      Designed and implemented a distributed, event-driven framework that
      eliminated direct database dependency — streaming entity state via Kafka
      into per-service Redis caches. Adopted across a large number of
      microservices on the platform.
    tech: [Kafka, Redis, Event-Driven Architecture, Microservices]
  - name: Roles and Permissions Framework
    detail: >-
      Built a fine-grained RBAC framework using Open Policy Agent (OPA) for
      declarative, AWS IAM-style policy enforcement, driving platform-wide
      adoption across all microservices.
    tech: [Open Policy Agent, RBAC, Authorization, Rego]
  - name: AI-Based NetCloud Assistant (ANA)
    detail: >-
      Contributed to an LLM-powered agentic troubleshooting system using LangGraph
      and AWS Bedrock (Claude), featuring tool-use orchestration, RAG-based
      knowledge retrieval (OpenSearch), and a dual-pipeline Rasa NLU chatbot with
      custom LLM intent classifiers and real-time WebSocket streaming.
    tech: [LangGraph, AWS Bedrock, RAG, OpenSearch, Rasa NLU, WebSockets]
---

Ericsson's enterprise networking platform serves managed WAN, security, and
diagnostics to large fleets of deployed devices. My work there has spanned the
data plane (diagnostics and remote access at scale) and the platform substrate
(event-driven state distribution, authorization) — with the more recent work
moving into LLM-based operator tooling.
