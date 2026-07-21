"""The model catalog. Mirrored in src/lib/chat/models.ts for the picker UI."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelEntry:
    key: str
    repo: str
    label: str
    params: str
    blurb: str
    # Qwen3 ships a chat template with a reasoning mode that emits <think>
    # blocks. Two sentences of CV answer do not need a visible monologue.
    disable_thinking: bool = False


MODELS: list[ModelEntry] = [
    ModelEntry(
        key="lfm2-230m",
        repo="LiquidAI/LFM2.5-230M",
        label="LFM2.5 230M",
        params="230 million",
        blurb="Smallest and quickest. Terse, sticks close to what it is given.",
    ),
    ModelEntry(
        key="lfm2-350m",
        repo="LiquidAI/LFM2.5-350M",
        label="LFM2.5 350M",
        params="350 million",
        blurb="More fluent than the 230M for barely more latency.",
    ),
    ModelEntry(
        key="qwen-0.8b",
        repo="Qwen/Qwen3.5-0.8B",
        label="Qwen3.5 0.8B",
        params="800 million",
        blurb="The most capable of the three. Best at following the context.",
        disable_thinking=True,
    ),
]

DEFAULT_KEY = "lfm2-230m"

BY_KEY = {m.key: m for m in MODELS}


def model_by_key(key: str) -> ModelEntry:
    return BY_KEY.get(key) or BY_KEY[DEFAULT_KEY]
