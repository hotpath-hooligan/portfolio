"""Modal deployment: retrieval on CPU, generation on GPU.

Two container types, both scaling to zero.

  web    FastAPI. Holds the index and the embedder, does retrieval, streams the
         answer back as SSE. Cheap enough to keep warm.
  Model  One vLLM engine per catalog entry, parametrized by key so the three
         models share a single class and only the requested one ever starts.

The browser talks only to `web`, and only ever sends a question — no index, no
weights and no embedder reach the client.

Deliberately no `from __future__ import annotations` here, unlike the rest of
the package: it turns every annotation into a string, and `modal.parameter()`
resolves the declared type at class-definition time. With it, `model_key: str`
arrives as the *string* `'str'` and the deploy dies on a missing encoder.
"""

import json
import os
from pathlib import Path

import modal

from models import DEFAULT_KEY, MODELS, model_by_key

APP_NAME = "portfolio-chat"
REPO_ROOT = Path(__file__).parent.parent

# Origins allowed to call the API. The site is static and public; this only
# keeps other people's pages from spending your GPU budget.
#
# Read here at deploy time and baked into the image below, because this module
# is imported again inside the container, where the deploying shell's
# environment does not exist — reading it there would silently fall back to
# localhost and block the real site.
# `or` rather than a default: an unset GitHub Actions variable arrives as an
# empty string, which would reach json.loads() in the container and fail on the
# first request instead of here.
ALLOWED_ORIGINS = os.environ.get("CHAT_ALLOWED_ORIGINS") or '["http://localhost:4321"]'

# Parsed at deploy time purely to fail fast: a malformed value would otherwise
# deploy cleanly and 500 on every chat request.
json.loads(ALLOWED_ORIGINS)

app = modal.App(APP_NAME)

HF_CACHE = "/root/.cache/huggingface"
SOURCE = ["tokens", "retrieval", "corpus", "prompt", "models", "build_index"]


def _download_weights() -> None:
    from huggingface_hub import snapshot_download

    for entry in MODELS:
        snapshot_download(entry.repo, ignore_patterns=["*.pt", "*.pth", "*.gguf"])


def _build_index() -> None:
    from build_index import build

    build()


vllm_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("vllm==0.11.0", "huggingface_hub[hf_transfer]==0.35.3")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": HF_CACHE, "VLLM_USE_V1": "1"})
    .add_local_python_source(*SOURCE, copy=True)
    # Baked rather than downloaded on first request: all three together are
    # under 3 GB in fp16, and a cold start that also pulls weights is the
    # difference between a pause and an abandoned page.
    .run_function(_download_weights)
)

api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi[standard]==0.115.6",
        "numpy==2.2.1",
        "sentence-transformers==3.3.1",
        "python-frontmatter==1.1.0",
        "huggingface_hub[hf_transfer]==0.35.3",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "HF_HOME": HF_CACHE,
        "CHAT_ALLOWED_ORIGINS": ALLOWED_ORIGINS,
    })
    .add_local_python_source(*SOURCE, copy=True)
    .add_local_dir(REPO_ROOT / "src" / "content", "/srv/content", copy=True)
    .run_function(_build_index)
)


@app.cls(
    image=vllm_image,
    gpu="L4",
    scaledown_window=300,
    timeout=600,
)
@modal.concurrent(max_inputs=8)
class Model:
    model_key: str = modal.parameter(default=DEFAULT_KEY)

    @modal.enter()
    def start(self) -> None:
        from transformers import AutoTokenizer
        from vllm import AsyncEngineArgs, AsyncLLMEngine

        self.entry = model_by_key(self.model_key)
        self.tokenizer = AutoTokenizer.from_pretrained(self.entry.repo)
        self.engine = AsyncLLMEngine.from_engine_args(
            AsyncEngineArgs(
                model=self.entry.repo,
                dtype="bfloat16",
                # These models carry 32k-262k windows. The prompt is a system
                # block, four chunks and four turns; reserving the full window
                # would waste most of the GPU on an empty KV cache.
                max_model_len=8192,
                gpu_memory_utilization=0.60,
                enforce_eager=True,
                disable_log_stats=True,
            )
        )

    @modal.method()
    async def generate(self, messages: list[dict], max_tokens: int = 400):
        from vllm import SamplingParams

        kwargs = {"enable_thinking": False} if self.entry.disable_thinking else {}
        prompt = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, **kwargs
        )
        params = SamplingParams(
            # Low but not zero: greedy decoding makes every greeting identical
            # and every refusal word-for-word the same, which reads as canned.
            temperature=0.4,
            top_p=0.9,
            max_tokens=max_tokens,
        )

        sent = 0
        request_id = f"{self.entry.key}-{id(messages)}"
        async for output in self.engine.generate(prompt, params, request_id):
            text = output.outputs[0].text
            if len(text) > sent:
                yield text[sent:]
                sent = len(text)


@app.function(image=api_image, scaledown_window=600, timeout=900)
@modal.concurrent(max_inputs=32)
@modal.asgi_app()
def web():
    import numpy as np
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel
    from sentence_transformers import SentenceTransformer

    import build_index
    from prompt import build_messages, site_topics
    from retrieval import (
        Result,
        fuse,
        is_grounded,
        mentions_subject,
        profile_chunk,
        search_bm25,
        search_vectors,
    )

    chunks, bm25, vectors = build_index.load()
    embedder = SentenceTransformer(build_index.EMBED_MODEL)
    topics = site_topics(chunks)

    api = FastAPI(title="portfolio-chat")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=json.loads(os.environ["CHAT_ALLOWED_ORIGINS"]),
        allow_methods=["POST", "GET"],
        allow_headers=["content-type"],
    )

    class Turn(BaseModel):
        role: str
        content: str

    class Ask(BaseModel):
        query: str
        history: list[Turn] = []
        model: str = DEFAULT_KEY

    @api.get("/models")
    def list_models() -> dict:
        return {
            "default": DEFAULT_KEY,
            "models": [
                {"key": m.key, "label": m.label, "params": m.params, "blurb": m.blurb}
                for m in MODELS
            ],
        }

    def retrieve(query: str):
        vector = embedder.encode(query, normalize_embeddings=True).astype(np.float32)
        bm25_hits = search_bm25(bm25, query, 20)
        vector_hits = search_vectors(vectors, vector, 20)
        results = fuse(chunks, bm25_hits, vector_hits, 6)
        grounded = is_grounded(results, bm25_hits, vector_hits[0][1] if vector_hits else None)

        # "What does he do?" is a fair question that retrieves nothing: it is
        # entirely stopwords. Fall back to the bio, so the model still writes
        # the answer but has something true to write it from.
        if not grounded and mentions_subject(query):
            profile = profile_chunk(chunks)
            if profile is not None:
                return [Result(chunk=profile, score=0.0, bm25_rank=None, vector_rank=None)], True
        return results, grounded

    @api.post("/chat")
    async def chat(ask: Ask) -> StreamingResponse:
        entry = model_by_key(ask.model)
        results, grounded = retrieve(ask.query)
        messages = build_messages(
            query=ask.query,
            results=results if grounded else [],
            history=[t.model_dump() for t in ask.history],
            topics=topics,
            model_label=entry.label,
            model_params=entry.params,
        )

        async def stream():
            sources = [
                {"id": r.chunk.id, "title": r.chunk.title, "url": r.chunk.url}
                for r in (results[:3] if grounded else [])
            ]
            yield _event("sources", {"sources": sources})
            try:
                async for delta in Model(model_key=entry.key).generate.remote_gen.aio(messages):
                    yield _event("token", {"text": delta})
            except Exception as err:  # surfaced in the UI rather than a dead stream
                yield _event("error", {"message": str(err)})
            yield _event("done", {})

        return StreamingResponse(stream(), media_type="text/event-stream")

    return api


def _event(name: str, payload: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(payload)}\n\n"
