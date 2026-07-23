---
title: Song Recommender
blurb: >-
  Popularity and item-item collaborative filtering over implicit listening data,
  compared with precision@k and recall@k.
stack: [Python, Recommender Systems, Jupyter]
repo: https://github.com/hotpath-hooligan/song_recommender
order: 1
---

A small recommender built on implicit feedback: every row of the input data is
treated as an interaction between a user and a song, with no metadata, ratings,
audio features, or learned embeddings involved.

The **popularity model** is the non-personalized baseline — songs ranked by
interaction count, the same ten returned to everyone. It cannot adapt to
individual taste, but it recommends to a completely new user, which the
personalized model cannot.

The **item-item collaborative filter** compares songs by the sets of users who
listened to them, scoring pairs with Jaccard similarity. A user's
recommendations are the mean similarity between each candidate song and every
song already in their history, with heard songs and zero-score candidates
removed. Using sets rather than counts means repeated plays by one user do not
inflate similarity. It is memory-based: training stores the interaction data,
and similarities are computed at request time.

Both models are evaluated on held-out interactions with precision@k and
recall@k for k = 1..10, macro-averaged across a deterministically sampled set of
users present in both splits — which is what makes the comparison between the
personalized model and the baseline meaningful rather than anecdotal.
