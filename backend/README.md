# Chat backend

Retrieval-augmented chat over the site's content, deployed on Modal.

## Shape

| Container | Hardware | Job |
| --- | --- | --- |
| `web` | CPU | FastAPI. Holds the index and the MiniLM embedder, retrieves, streams SSE. |
| `Model` | L4 GPU | One vLLM engine per catalog entry, started only when that model is asked for. |

Both scale to zero. The browser talks only to `web`, and only ever sends a
question — no index, no weights, no embedder reaches the client.

## The index

Built once as a Modal **image build step** (`build_index.py`), from the markdown
in `../src/content` which is copied into the image. The artifacts —
`chunks.json`, `bm25.json`, `vectors.npy` — are baked into the image layer at
`/srv/index`.

That means the index is immutable, versioned with the deploy, and free at
container start: no download, no volume, no rebuild. It also cannot drift from
the content that produced it. **Editing content requires a redeploy.**

## Models

| Key | Repo |
| --- | --- |
| `lfm2-230m` | `LiquidAI/LFM2.5-230M` |
| `lfm2-350m` | `LiquidAI/LFM2.5-350M` |
| `qwen-0.8b` | `Qwen/Qwen3.5-0.8B` (default) |

Served in bf16 — all three together are under 3 GB, so weights are baked into
the image rather than downloaded on first request. Add or swap models in
`models.py`, and mirror the change in `src/lib/chat/models.ts` for the picker.

## Deploy

CI does this on every push that touches `backend/` or `src/content/`. By hand:

```sh
pip install -r requirements.txt
modal setup
modal deploy app.py
```

The endpoint URL is derived from the workspace and app names, so it is stable
across redeploys: `https://<workspace>--portfolio-chat-web.modal.run`. The
frontend hardcodes it in `src/lib/chat/client.ts`, and the CORS allowlist is
`ALLOWED_ORIGINS` in `app.py`.

`modal serve app.py` gives the same thing as a temporary deployment that
reloads on edit.

## API

`POST /chat` — `{ query, history: [{role, content}], model }`, replies
`text/event-stream`:

```
event: sources
data: {"sources": [{"id": "...", "title": "...", "url": "..."}]}

event: token
data: {"text": "He "}

event: done
data: {}
```

`event: error` carries a message instead of the stream dying silently.

`GET /models` — the catalog, for keeping a client in sync.

## Retrieval

BM25 and dense cosine, fused with Reciprocal Rank Fusion on **rank** rather
than score: BM25 is an unbounded sum of IDF terms and cosine sits in [-1, 1],
so blending the raw numbers needs constants that drift as content is added.

Grounding is decided by lexical overlap, with the cosine arm as a fallback for
a real question phrased outside the corpus vocabulary. Ungrounded questions
still go through the selected model, but with an unsupported-question prompt
that asks it to state the site's limits and offer covered topics.

Before retrieval, pure conversational turns such as greetings, thanks, and
model-identity questions are routed to a conversational prompt. Grounded,
unsupported, and conversational turns all remain model-generated; the server
does not return canned replies. Keeping the three prompt modes separate avoids
giving a small model contradictory instructions about both greeting the visitor
and refusing for lack of portfolio evidence.

`tokens.py` is shared by the builder and query time. Never fork it: if the
build stems "Kubernetes" to `kubernet` and a query stems it to `kubernetes`,
every lookup misses silently and the index looks empty rather than broken.
