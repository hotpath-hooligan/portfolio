# Filling in your content

Everything on the site comes from Markdown in `src/content/`. Edit a file, run
`npm run dev`, and the page updates.

**The `draft` flag.** Every entry supports `draft: true`. A draft is excluded
from the site *and* from the chat index, so half-written notes can sit in the
repo without the assistant quoting them as fact. Delete the line to publish.

**After editing, always redeploy the backend:**

```bash
make deploy   # rebuilds the chat's search index from your content
```

The chat's index is built from this content and baked into the backend image,
so the assistant keeps answering from the old content until you redeploy. The
site itself updates on its own build.

---

## Experience — `src/content/experience/*.md`

One file per employer. `order` is the sort key: **higher = more recent**.

```yaml
---
company: Ericsson
role: SDE 3
location: Bangalore, India # optional
start: Nov 2021 # free text, shown as-is
end: Present # "Present" marks it as your current role
order: 2 # higher = listed first
summary: >-
  One or two sentences on what you owned there.
highlights:
  - name: Remote Connect # becomes its own anchor + chat citation
    detail: >-
      What you built, at what scale, and what you decided.
    tech: [Apache Guacamole, SSH, RDP]
---
Optional prose below the frontmatter — context about the org or the constraints.
```

Each `highlights` entry becomes a **separately retrievable chunk**, so the chat
can answer "tell me about Remote Connect" with just that project instead of your
whole tenure. Split your work into named workstreams rather than a flat bullet
list — it measurably improves the answers.

Write `detail` with concrete numbers ("10,000+ concurrent sessions",
"sub-5-second"). Retrieval and the model both do better with specifics, and so
do human readers.

## Case studies — `src/content/stories/*.md`

Long-form write-ups of the work in `experience`. One file per system, rendered at
`/stories/<filename>/`.

```yaml
---
title: Replacing a Shared Read Dependency With Event-Driven Materialized Views
blurb: >-
  One or two sentences. Shown in the list and used as the page description.
role: What you personally owned, in one clause.
domain: [Kafka, Redis, Lua] # chips, and indexed
highlight: Core Facts # optional: links to that experience highlight
order: 90 # higher = listed first
---
## The problem
## The design
## Tradeoffs
```

**Every `##` heading becomes its own chunk.** That is the whole point: "what
were the tradeoffs on X" retrieves the tradeoffs section, not the entire case
study. Write headings as the questions people actually ask — *The problem*,
*What shipped*, *Tradeoffs*, *What I'd fix first* — and keep sections to a few
paragraphs each.

`highlight` must match a `highlights[].name` in an `experience` entry exactly;
it renders as a link back to that anchor on the home page.

**Before adding one, read it as a stranger would.** These are the most detailed
pages on the site and the easiest place to leak an employer's internals. No
internal service or product codenames, no repository paths, no version
identifiers, no unreleased roadmap. Describe the systems problem, not the
company's system. Numbers need to be ones you could defend publicly — order-of-
magnitude scale is fine, an internal SLO is not.

## Projects — `src/content/projects/*.md`

One file per project. Each gets its own page at `/projects/<filename>/`.

```yaml
---
title: NES Emulator
blurb: One sentence. Shown on the card and used as the page description.
stack: [C, Systems Programming]
repo: https://github.com/... # optional
demo: https://... # optional
year: '2023' # optional
featured: true # optional
order: 3 # higher = listed first
---
The long version. Two or three paragraphs.

What made it hard is more interesting than what it does — that's the part
that shows how you think.
```

## Skills — `src/content/skills/index.md`

A single file. Each group becomes its own chunk, so "what databases does he
know" retrieves just that row instead of the whole matrix.

```yaml
---
title: Skills
groups:
  - name: Languages
    items: [Python, Go, C]
  - name: Databases & Messaging
    items: [PostgreSQL, Redis, Kafka]
---
Optional prose on where your strengths actually are.
```

Keep groups to 6–10 items. A 40-item list reads as a keyword dump and dilutes
retrieval.

## Education — `src/content/education/*.md`

```yaml
---
institution: R.N.S Institute of Technology
degree: Bachelor of Technology in Computer Science
location: Bangalore, India # optional
start: '2016' # quote bare years, or YAML reads them as numbers
end: '2020'
order: 1
---
```

## Certifications — `src/content/certifications/*.md`

```yaml
---
name: Certified Kubernetes Administrator (CKA)
issuer: Cloud Native Computing Foundation (CNCF)
credentialId: LF-3who9yimkz # optional
date: April 2026
url: https://... # optional, link to the credential
order: 1
---
Optional: what the cert actually covers.
```

## About — `src/content/about/index.md`

The published About entry gives both the page and the chat a concise answer to
"tell me about yourself." Keep it focused on the engineering through-line and
the kinds of problems you want to work on; resume bullets belong in Experience.

```yaml
---
title: About
tagline: One line under the heading # optional
order: 0
---
Two or three paragraphs.
```

Worth covering: what problems you want handed to you (the honest answer, not
the resume answer); the through-line connecting the emulator, the network
stack, and the platform work — there clearly is one; and whether you're open to
opportunities.

## Interests — `src/content/interests/*.md`

One file per interest. Delete `example-interest.md` once you've added real ones.

```yaml
---
title: Retro hardware
label: 6502-era systems # 2-3 word chip on the card
icon: 🕹 # optional emoji
order: 1
---
A short paragraph.
```

Specific beats generic. "I have a soft spot for 6502-era hardware, which is how
the NES emulator started" is worth reading; "I enjoy technology" is not. These
become their own chat chunks — they're what lets the assistant answer the
non-work questions.

---

## Profile — `src/content/profile/index.md`

Your name, tagline, location, and links. This file is **required** — the build
fails without it, deliberately, rather than rendering a nameless page.

```yaml
---
name: Aryan Kapoor
tagline: >-
  One or two lines under your name.
location: Bangalore, India
email: you@example.com
links:
  - label: GitHub
    url: https://github.com/...
  - label: LinkedIn
    url: https://www.linkedin.com/in/...
avatar: ../../assets/avatar.glb # optional, see below
---
Prose here is indexed for the chat but not rendered — a good place to say how
you prefer to be reached, or that you're open to opportunities.
```

This is also what lets the chat answer "how do I contact him?" and "who is
Aryan Kapoor?" — details living only in page markup never reach the index.

---

## Images

Put files in `src/assets/projects/` and reference them **relative to the
Markdown file**. Astro converts to WebP/AVIF, generates a responsive `srcset`,
and reserves layout space automatically.

```yaml
---
title: NES Emulator
cover: ../../assets/projects/nes-hero.png
gallery:
  - src: ../../assets/projects/nes-ppu.png
    alt: PPU debug view showing nametable contents
  - src: ../../assets/projects/nes-cpu.png
    alt: Cycle-accurate CPU trace next to a reference log
---
```

- `cover` — card thumbnail and page hero. **Omit it** and a coloured
  placeholder with the project's initials renders instead, derived from the
  title so it stays stable across builds. Nothing breaks; add covers whenever.
- `gallery` — optional grid on the detail page. `alt` is required, and it's
  shown as the caption, so write it as a real description.

Source images want to be ~1600px wide; Astro downsizes from there. Use PNG for
UI screenshots, JPG for photos. A wrong path fails the **build**, not the page.

## 3D avatar

`src/assets/avatar.glb` currently holds a **placeholder** — the CC0
"RobotExpressive" model from the three.js examples. Replace it with your own
and the hero picks it up automatically.

The easiest route to a real one: [Ready Player Me](https://readyplayer.me)
makes a rigged avatar from a selfie and exports `.glb` free. Drop the export at
`src/assets/avatar.glb`, or point `avatar:` in the profile at any other path
under `src/assets/`.

Keep it **under ~3 MB** — it's on top of ~180 KB (gzipped) of three.js. If you
export from Blender, decimate the mesh and bake textures to 1K first.

The component handles the rest: it normalises any model to a consistent size,
plays an idle animation if the file has one, and turns the model toward the
cursor. Remove the `avatar:` line to drop 3D entirely; the hero just renders
without it.

**It is deliberately not loaded for everyone.** three.js and the model are
dynamically imported only when the hero scrolls into view, and skipped
completely for `prefers-reduced-motion` users and devices reporting ≤2 CPU
cores. Rendering pauses when the avatar is off-screen rather than spinning the
GPU for the whole session.
