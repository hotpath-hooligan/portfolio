"""Prompt construction. The persona lives here and nowhere else."""

from __future__ import annotations

import re

from retrieval import Chunk, Result

# How many retrieved chunks go in the prompt, and the character budget for each.
CONTEXT_CHUNKS = 4
CHUNK_CHARS = 900

# Turns kept in addition to the current question. Enough for "and what about the
# second one?" to resolve. Trimmed rather than summarized: summarizing costs a
# whole extra generation pass and nobody interrogates a portfolio for twenty turns.
HISTORY_TURNS = 4

COLLECTION_LABELS = {
    "experience": "where he has worked",
    "projects": "what he has built",
    "stories": "engineering case studies he has written",
    "skills": "the technologies he uses",
    "certifications": "his certifications",
    "education": "his education",
}

# The bio is not a topic to suggest asking about.
NOT_A_TOPIC = {"profile", "about"}

CONVERSATIONAL = "conversational"
GROUNDED = "grounded"
UNSUPPORTED = "unsupported"

# These are routing rules, not canned answers. Pure conversational turns do not
# need retrieval, but still go through the selected model with a prompt tailored
# to the turn. Full matches are intentional: "hi, what databases does he use?"
# is a portfolio question and must still retrieve evidence.
_CONVERSATIONAL = tuple(
    re.compile(pattern, re.I)
    for pattern in (
        r"(?:hi+|hello|hey+|hiya|howdy|greetings|yo)(?:\s+there)?",
        r"good\s+(?:morning|afternoon|evening)",
        r"how\s+are\s+you(?:\s+doing)?",
        r"(?:who|what)\s+are\s+you(?:\s+exactly)?",
        r"(?:what|which)\s+(?:ai\s+)?model\s+are\s+you(?:\s+(?:using|running))?",
        r"tell\s+me\s+about\s+yourself",
        r"(?:what\s+can\s+you\s+do|how\s+can\s+you\s+help|help)",
        r"(?:thanks|thank\s+you|cheers)(?:\s+very\s+much)?",
        r"(?:bye|goodbye|see\s+you|good\s+night)",
    )
)


def site_topics(chunks: list[Chunk]) -> list[str]:
    seen = list(dict.fromkeys(c.collection for c in chunks))
    return [COLLECTION_LABELS.get(c, f"his {c}") for c in seen if c not in NOT_A_TOPIC]


def is_conversational(query: str) -> bool:
    """Whether a turn can be answered without portfolio retrieval."""
    normalized = " ".join(query.strip().split()).strip(".,!?;: ")
    return any(pattern.fullmatch(normalized) for pattern in _CONVERSATIONAL)


def _topic_list(topics: list[str]) -> str:
    if not topics:
        return "Aryan's portfolio"
    if len(topics) == 1:
        return topics[0]
    if len(topics) == 2:
        return " and ".join(topics)
    return f"{', '.join(topics[:-1])}, and {topics[-1]}"


def system_prompt(
    topics: list[str], model_label: str, model_params: str, mode: str = GROUNDED
) -> str:
    """Written as rules rather than as an example transcript: few-shot examples
    at this model size get copied verbatim, and a visitor asking about Kafka
    does not want the example answer about Kubernetes."""
    topic_list = _topic_list(topics)
    common = [
        "You are the assistant on Aryan Kapoor's portfolio site. You answer questions "
        "about Aryan: his work history, projects, skills, certifications and education.",
        "",
        f"You are {model_label}, a {model_params} parameter model. If someone asks what "
        "you are, say so — briefly, and without pretending to be ChatGPT or a person.",
        "- Aryan is a real person and is not in this conversation. Refer to him in the "
        "third person.",
        "- Be brief. Two or three sentences answers almost everything here. No bullet "
        "lists unless asked for one.",
        '- Do not mention "the context", "the passage" or "the documents". Just answer.',
    ]

    if mode == CONVERSATIONAL:
        rules = [
            "",
            "This is a conversational message, not a request for portfolio facts.",
            "- Respond naturally and warmly.",
            "- If asked about your identity, state the model name and size given above.",
            f"- When useful, briefly offer to answer questions about {topic_list}.",
            "- Do not claim that information or context is missing.",
        ]
    elif mode == GROUNDED:
        rules = [
            "",
            "The visitor's question is covered by the portfolio information supplied with it.",
            "- Answer only from that information. It comes from Aryan's CV and project notes.",
            "- Never invent an employer, date, technology, title, or other fact.",
        ]
    elif mode == UNSUPPORTED:
        rules = [
            "",
            "The visitor's question is not covered by Aryan's portfolio.",
            "- Say plainly that this site does not provide that information.",
            f"- Briefly offer the areas you can answer instead: {topic_list}.",
            "- Do not attempt to answer the unsupported question from general knowledge.",
        ]
    else:
        raise ValueError(f"unknown prompt mode: {mode}")

    return "\n".join([*common, *rules])


def _condense(text: str) -> str:
    clean = " ".join(text.split())
    return clean[:CHUNK_CHARS] + "…" if len(clean) > CHUNK_CHARS else clean


def build_context(results: list[Result]) -> str:
    """Titles are included so the model can attribute ("on Remote Connect, he…")
    instead of running two unrelated roles together into one sentence."""
    return "\n\n".join(
        f"[{r.chunk.title}] {_condense(r.chunk.text)}" for r in results[:CONTEXT_CHUNKS]
    )


def build_messages(
    query: str,
    results: list[Result],
    history: list[dict],
    topics: list[str],
    model_label: str,
    model_params: str,
    mode: str = GROUNDED,
) -> list[dict]:
    """Context rides on the current user message rather than the system prompt,
    so each turn carries the evidence for that turn and a follow-up retrieves
    fresh context instead of reasoning over what was attached three turns ago."""
    if mode not in {CONVERSATIONAL, GROUNDED, UNSUPPORTED}:
        raise ValueError(f"unknown prompt mode: {mode}")

    context = build_context(results)
    if mode == GROUNDED:
        if not context:
            raise ValueError("grounded prompts require at least one result")
        content = f"Portfolio information:\n{context}\n\nQuestion: {query}"
    else:
        content = f"Visitor message: {query}"

    # Prior generated refusals can make a tiny model repeat itself even after a
    # visitor changes to small talk. History is useful for grounded follow-ups,
    # but conversational and unsupported turns are deliberately self-contained.
    visible_history = history[-HISTORY_TURNS * 2:] if mode == GROUNDED else []

    return [
        {
            "role": "system",
            "content": system_prompt(topics, model_label, model_params, mode),
        },
        *visible_history,
        {"role": "user", "content": content},
    ]
