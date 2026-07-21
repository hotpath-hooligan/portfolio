"""Markdown content -> retrievable chunks.

Chunking follows the structure the content already has — headings, highlights,
skill groups — rather than blind text splitting, because those boundaries are
almost exactly the questions people ask, and because every chunk boundary shows
up directly in the citations rendered under an answer.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import frontmatter

from retrieval import Chunk
from tokens import tokenize

TARGET_TOKENS = 160
MIN_TOKENS = 25
OVERLAP_TOKENS = 30


def slugify(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", stripped))


def to_plain_text(md: str) -> str:
    """Strip markdown down to prose for embedding."""
    out = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    out = re.sub(r"```.*?```", " ", out, flags=re.S)
    out = re.sub(r"`([^`]+)`", r"\1", out)
    out = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", out)
    out = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", out)
    out = re.sub(r"^#{1,6}\s+", "", out, flags=re.M)
    out = re.sub(r"^[-*+]\s+", "", out, flags=re.M)
    out = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", out)
    out = re.sub(r"^>\s?", "", out, flags=re.M)
    out = out.replace("\r", "")
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def split_prose(text: str) -> list[str]:
    """Pack paragraphs up to TARGET_TOKENS, carrying OVERLAP_TOKENS of trailing
    context forward so a sentence spanning a boundary stays retrievable from
    both sides."""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if not paragraphs:
        return []

    out: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for p in paragraphs:
        n = len(tokenize(p))
        if current_tokens > 0 and current_tokens + n > TARGET_TOKENS:
            out.append("\n\n".join(current))
            tail = current[-1]
            tail_words = tail.split()
            current = [
                " ".join(tail_words[-OVERLAP_TOKENS:])
                if len(tail_words) > OVERLAP_TOKENS
                else tail
            ]
            current_tokens = len(tokenize(current[0]))
        current.append(p)
        current_tokens += n

    if current:
        out.append("\n\n".join(current))

    # Fold a runt final chunk back into its predecessor.
    if len(out) > 1 and len(tokenize(out[-1])) < MIN_TOKENS:
        last = out.pop()
        out[-1] += "\n\n" + last
    return out


def split_sections(md: str) -> list[tuple[str, str]]:
    """Split on `##` headings. Anything before the first heading comes back with
    an empty heading so an intro is not lost."""
    out: list[tuple[str, str]] = []
    heading = ""
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        text = to_plain_text("\n".join(buf))
        if text:
            out.append((heading, text))
        buf = []

    for line in md.split("\n"):
        m = re.match(r"^##\s+(.*)$", line)
        if m:
            flush()
            heading = m.group(1).strip()
        else:
            buf.append(line)
    flush()
    return out


def _read_collection(content_dir: Path, name: str) -> list[dict]:
    directory = content_dir / name
    if not directory.is_dir():
        return []

    entries = []
    for path in sorted(directory.glob("*.md")):
        post = frontmatter.load(path)
        # Draft entries are excluded entirely: the chat citing a half-written
        # stub as fact would be worse than it not knowing.
        if post.metadata.get("draft") is True:
            continue
        entries.append(
            {
                "slug": path.stem,
                "data": post.metadata,
                "body": to_plain_text(post.content),
                "raw": post.content,
            }
        )
    return entries


def _chunk(
    collection: str, slug: str, n: int, title: str, url: str, text: str, keywords: str = ""
) -> Chunk:
    return Chunk(
        id=f"{collection}/{slug}#{n}",
        collection=collection,
        title=title,
        url=url,
        text=text.strip(),
        keywords=keywords,
    )


def collect_chunks(content_dir: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    read = lambda name: _read_collection(content_dir, name)  # noqa: E731

    # Experience: one chunk for the tenure, one per named workstream, so "tell
    # me about Remote Connect" retrieves that and not the whole Ericsson entry.
    roles = sorted(read("experience"), key=lambda e: e["data"].get("order", 0), reverse=True)
    for idx, e in enumerate(roles):
        d = e["data"]
        company, role = d["company"], d["role"]
        start, end = d["start"], d["end"]
        current = str(end).lower() == "present"
        header = (
            f"Aryan Kapoor currently works as {role} at {company}, since {start}."
            if current
            else f"Aryan Kapoor previously worked as {role} at {company}, from {start} to {end}."
        )
        # "What did he do before X" is answered by no single chunk lexically: a
        # past role never names the role that followed it. Naming the later
        # companies here is what carries the distinctive query token to the
        # right entry — "before" alone is a common word whose IDF collapses.
        later = " ".join(str(r["data"]["company"]) for r in roles[:idx])
        tenure_keywords = " ".join(
            [
                "current present now latest recent"
                if current
                else f"previous former prior past earlier before ex last {later}",
                "job role employer company",
            ]
        )
        body = "\n\n".join(p for p in (header, d.get("summary"), e["body"]) if p)
        chunks.append(
            _chunk("experience", e["slug"], 0, f"{company} · {role}",
                   f"/#{slugify(company)}", body, tenure_keywords)
        )
        for i, h in enumerate(d.get("highlights") or []):
            tech = f"\n\nTechnologies: {', '.join(h['tech'])}." if h.get("tech") else ""
            chunks.append(
                _chunk(
                    "experience", e["slug"], i + 1, f"{company} · {h['name']}",
                    f"/#{slugify(h['name'])}",
                    f"{h['name']} — a project at {company} ({role}, {start} to {end})."
                    f"\n\n{h['detail']}{tech}",
                )
            )

    # Stories: one chunk per `##` section. The sections map almost one-to-one
    # onto the questions asked of them, and every chunk repeats the story title
    # so a section named "The problem" still retrieves for its subject.
    for s in read("stories"):
        d = s["data"]
        title = d["title"]
        url = f"/stories/{s['slug']}/"
        n = 0
        head = [
            f"{title} — an engineering case study by Aryan Kapoor.",
            d.get("blurb"),
            f"His role: {d['role']}" if d.get("role") else "",
            f"Involved {', '.join(d['domain'])}." if d.get("domain") else "",
        ]
        chunks.append(
            _chunk("stories", s["slug"], n, title, url,
                   "\n\n".join(p for p in head if p),
                   "case study deep dive architecture design decision tradeoff")
        )
        n += 1
        for heading, text in split_sections(s["raw"]):
            for part in split_prose(text):
                chunks.append(
                    _chunk(
                        "stories", s["slug"], n,
                        f"{title} · {heading}" if heading else title, url,
                        f"{f'{heading}, from ' if heading else ''}"
                        f"Aryan Kapoor's case study on {title}.\n\n{part}",
                    )
                )
                n += 1

    for p in read("projects"):
        d = p["data"]
        title = d["title"]
        head = " ".join(
            x for x in (
                f"{title} is a personal project by Aryan Kapoor.",
                d.get("blurb"),
                f"Built with {', '.join(d['stack'])}." if d.get("stack") else "",
                f"Source: {d['repo']}" if d.get("repo") else "",
            ) if x
        )
        body = "\n\n".join(x for x in (head, p["body"]) if x)
        for i, text in enumerate(split_prose(body)):
            chunks.append(_chunk("projects", p["slug"], i, title, f"/projects/{p['slug']}/", text))

    # Per-group skill chunks keep "what databases does he know" from retrieving
    # the entire matrix, where the answer would be buried among forty terms.
    for s in read("skills"):
        groups = s["data"].get("groups") or []
        for i, g in enumerate(groups):
            chunks.append(
                _chunk("skills", s["slug"], i, f"Skills · {g['name']}", "/#skills",
                       f"Aryan Kapoor's {g['name']} skills: {', '.join(g['items'])}.")
            )
        if s["body"]:
            chunks.append(
                _chunk("skills", s["slug"], len(groups), "Skills · Overview", "/#skills", s["body"])
            )

    for c in read("certifications"):
        d = c["data"]
        body = [
            f"{d['name']} — a certification held by Aryan Kapoor, "
            f"issued by {d['issuer']} in {d['date']}.",
            f"Credential ID {d['credentialId']}." if d.get("credentialId") else "",
            c["body"],
        ]
        chunks.append(
            _chunk("certifications", c["slug"], 0, d["name"], "/#certifications",
                   "\n\n".join(p for p in body if p))
        )

    for ed in read("education"):
        d = ed["data"]
        where = f", {d['location']}" if d.get("location") else ""
        body = [
            f"Aryan Kapoor studied {d['degree']} at {d['institution']}{where}, "
            f"from {d['start']} to {d['end']}.",
            ed["body"],
        ]
        chunks.append(
            _chunk("education", ed["slug"], 0, d["institution"], "/#education",
                   "\n\n".join(p for p in body if p),
                   "education college university school graduated graduation degree "
                   "bachelor undergraduate btech academic studies")
        )

    # Profile is indexed so "how do I get in touch" is answerable at all — those
    # details otherwise exist only in page markup, where the chat cannot see them.
    for p in read("profile"):
        d = p["data"]
        contact = " ".join(
            x for x in (
                f"Email: {d['email']}." if d.get("email") else "",
                *(f"{l['label']}: {l['url']}." for l in (d.get("links") or [])),
            ) if x
        )
        where = f" based in {d['location']}" if d.get("location") else ""
        body = [
            f"{d['name']} is a software engineer{where}.",
            d.get("tagline"),
            contact,
            p["body"],
        ]
        chunks.append(
            _chunk("profile", p["slug"], 0, d["name"], "/#top",
                   "\n\n".join(x for x in body if x),
                   "contact reach email hire linkedin github resume cv who is intro "
                   "introduction about name based located location")
        )

    for a in read("about"):
        for i, text in enumerate(split_prose(a["body"])):
            chunks.append(_chunk("about", a["slug"], i, "About Aryan Kapoor", "/#about", text))

    for it in read("interests"):
        d = it["data"]
        body = f"{d['title']} is a personal interest of Aryan Kapoor ({d['label']}).\n\n{it['body']}"
        for i, text in enumerate(split_prose(body)):
            chunks.append(
                _chunk("interests", it["slug"], i, f"Interest · {d['title']}", "/#interests", text)
            )

    return [c for c in chunks if c.text]
