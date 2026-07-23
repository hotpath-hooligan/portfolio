---
title: Advanced Shortest Paths
blurb: >-
  Bidirectional Dijkstra, A*, contraction hierarchies, and Held–Karp — the
  algorithms that make road-network and social-graph queries fast.
stack: [Python, Java, Graph Algorithms]
repo: https://github.com/hotpath-hooligan/advanced_shortest_path
order: 2
---

Four shortest-path implementations over directed, non-negative weighted graphs,
each targeting a different reason plain Dijkstra is too slow.

**Bidirectional Dijkstra** searches forward from the source and backward from
the target simultaneously, meeting in the middle — used here for a
friend-suggestion distance query on a social graph. **A\*** adds a
coordinate-based heuristic so the search is pulled toward the target instead of
expanding uniformly in every direction. **Contraction hierarchies** shift the
cost to a preprocessing phase: nodes are contracted in importance order with
shortcut edges added to preserve distances, after which road-network queries
resolve in a small fraction of the original search space. **Held–Karp** solves
the travelling salesman problem exactly by dynamic programming over subsets,
trading exponential memory for a guaranteed optimum on small instances.

The value in writing all four together is seeing what each one actually buys:
bidirectional search halves the explored radius, A\* trades admissibility for
direction, contraction hierarchies pay once to make every later query cheap, and
Held–Karp shows where exact methods stop being viable at all.
