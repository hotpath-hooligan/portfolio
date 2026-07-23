# Filling in your content

Everything on the site comes from Markdown in `src/content/`. Edit a file, run
`npm run dev`, and the page updates.

**The `draft` flag.** Every entry supports `draft: true`. A draft is excluded
from the site, so half-written notes can sit in the repo. Delete the line to
publish.

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
  - name: Remote Connect # becomes its own anchor
    detail: >-
      What you built, at what scale, and what you decided.
    tech: [Apache Guacamole, SSH, RDP]
---
Optional prose below the frontmatter — context about the org or the constraints.
```

Split work into named highlights rather than a flat bullet list so visitors can
scan the role quickly and link directly to each workstream.

Write `detail` with concrete numbers ("10,000+ concurrent sessions",
"sub-5-second"). Specifics are easier for readers to understand and verify.

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

A single file containing the grouped skills matrix.

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

Keep groups to 6–10 items. A 40-item list reads as a keyword dump.

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

Keep the About entry focused on the engineering through-line and the kinds of
problems you want to work on; resume bullets belong in Experience.

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
the NES emulator started" is worth reading; "I enjoy technology" is not.

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
phone: +91 9504638049
links:
  - label: GitHub
    url: https://github.com/...
  - label: LinkedIn
    url: https://www.linkedin.com/in/...
---
Prose below this frontmatter is currently not rendered.
```

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
