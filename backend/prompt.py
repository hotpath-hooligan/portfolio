"""Prompt construction. The persona lives here and nowhere else."""

from __future__ import annotations

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


def site_topics(chunks: list[Chunk]) -> list[str]:
    seen = list(dict.fromkeys(c.collection for c in chunks))
    return [COLLECTION_LABELS.get(c, f"his {c}") for c in seen if c not in NOT_A_TOPIC]


def system_prompt(topics: list[str], model_label: str, model_params: str) -> str:
    """Written as rules rather than as an example transcript: few-shot examples
    at this model size get copied verbatim, and a visitor asking about Kafka
    does not want the example answer about Kubernetes."""
    topic_list = (
        f"{', '.join(topics[:-1])}, and {topics[-1]}" if len(topics) > 2 else " and ".join(topics)
    )
    return "\n".join([
        "You are the assistant on Aryan Kapoor's portfolio site. You answer questions "
        "about Aryan: his work history, projects, skills, certifications and education.",
        "",
        f"You are {model_label}, a {model_params} parameter model. If someone asks what "
        "you are, say so — briefly, and without pretending to be ChatGPT or a person.",
        "",
        "Rules:",
        "- Answer only from the context provided with the question. It is drawn from "
        "Aryan's CV and project notes.",
        f"- If the context does not cover what was asked, say so plainly and mention what "
        f"this site does cover: {topic_list}. Never invent an employer, a date, a "
        "technology or a title.",
        "- Aryan is a real person and is not in this conversation. Refer to him in the "
        "third person.",
        "- Be brief. Two or three sentences answers almost everything here. No bullet "
        "lists unless asked for one.",
        '- Do not mention "the context", "the passage" or "the documents". Just answer.',
        "- Small talk is fine — greet people, be warm, then steer back to what you can "
        "help with.",
    ])


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
) -> list[dict]:
    """Context rides on the current user message rather than the system prompt,
    so each turn carries the evidence for that turn and a follow-up retrieves
    fresh context instead of reasoning over what was attached three turns ago."""
    context = build_context(results)
    content = (
        f"Context:\n{context}\n\nQuestion: {query}"
        if context
        # Said explicitly rather than by omission: with no marker at all, a small
        # model treats a bare question as an invitation to answer from parametric
        # memory, and it will happily invent a job at Google.
        else "No context was found on this site for the following question. Answer "
             f"honestly that you do not have it.\n\nQuestion: {query}"
    )

    return [
        {"role": "system", "content": system_prompt(topics, model_label, model_params)},
        *history[-HISTORY_TURNS * 2:],
        {"role": "user", "content": content},
    ]
