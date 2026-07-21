import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Base is the collection's own directory, not `src/content`, so entry ids are
 * bare slugs (`packet-tracer`) rather than paths (`projects/packet-tracer`) —
 * otherwise `/projects/[slug]` builds as `/projects/projects/packet-tracer`.
 */
const md = (dir: string) => glob({ pattern: '*.md', base: `./src/content/${dir}` });

/**
 * Shared across every collection. Draft entries are skipped by both the page
 * renderers and the backend index builder, so half-written content can live in
 * the repo without the chat citing it as fact.
 */
const base = {
  draft: z.boolean().default(false),
};

/**
 * Identity and contact details. A collection rather than constants in the page
 * so the chat can answer "how do I contact him?" — details living only in page
 * markup never reach the search index.
 */
const profile = defineCollection({
  loader: md('profile'),
  schema: z.object({
    ...base,
    name: z.string(),
    /** One line under the name. */
    tagline: z.string(),
    location: z.string().optional(),
    email: z.string().optional(),
    links: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .default([]),
    /**
     * Path to a .glb under `src/assets/`, relative to this file. Omit and the
     * hero simply renders without an avatar — nothing else changes.
     */
    avatar: z.string().optional(),
  }),
});

/** Free-form prose sections rendered as a single block (About, Interests). */
const prose = defineCollection({
  loader: md('about'),
  schema: z.object({
    ...base,
    title: z.string(),
    /** Rendered as the section subtitle. */
    tagline: z.string().optional(),
    order: z.number().default(0),
  }),
});

const interests = defineCollection({
  loader: md('interests'),
  schema: z.object({
    ...base,
    title: z.string(),
    /** Short label shown on the card, e.g. "Retro hardware". */
    label: z.string(),
    icon: z.string().optional(),
    order: z.number().default(0),
  }),
});

const experience = defineCollection({
  loader: md('experience'),
  schema: z.object({
    ...base,
    company: z.string(),
    role: z.string(),
    location: z.string().optional(),
    start: z.string(), // "Nov 2021" — kept as display text, sorted via `order`
    end: z.string(), // "Present"
    /** Higher = more recent. Drives reverse-chronological ordering. */
    order: z.number(),
    summary: z.string(),
    /**
     * Named workstreams. Each becomes its own retrieval chunk so the chat can
     * cite "Remote Connect" without dragging in the whole Ericsson tenure.
     */
    highlights: z
      .array(
        z.object({
          name: z.string(),
          detail: z.string(),
          tech: z.array(z.string()).default([]),
        }),
      )
      .default([]),
  }),
});

const projects = defineCollection({
  loader: md('projects'),
  // Function form so `image()` is available: it validates the file exists at
  // build time and hands the page a processed asset (WebP/AVIF, srcset,
  // intrinsic dimensions) instead of a bare string path.
  schema: ({ image }) =>
    z.object({
      ...base,
      title: z.string(),
      blurb: z.string(),
      /** Card and page hero. Omit and a generated placeholder renders instead. */
      cover: image().optional(),
      gallery: z
        .array(z.object({ src: image(), alt: z.string() }))
        .default([]),
      stack: z.array(z.string()).default([]),
      repo: z.string().url().optional(),
      demo: z.string().url().optional(),
      year: z.string().optional(),
      featured: z.boolean().default(false),
      order: z.number().default(0),
    }),
});

/**
 * Long-form engineering case studies — the "how did you actually decide that"
 * layer under an experience highlight.
 *
 * Deliberately anonymised: no employer product names, internal service
 * codenames, repository paths, or version identifiers. These describe systems
 * problems, not a specific company's systems. Anything that would only make
 * sense to someone inside the org has been rewritten or dropped.
 */
const stories = defineCollection({
  loader: md('stories'),
  schema: z.object({
    ...base,
    title: z.string(),
    blurb: z.string(),
    /** What was personally owned, in one clause. Keeps the claims honest. */
    role: z.string(),
    /** Technologies and domains, shown as chips and folded into the index. */
    domain: z.array(z.string()).default([]),
    /**
     * Name of the `experience` highlight this expands on, if any. Used to link
     * the two together — matched against `highlights[].name`, so it must be
     * spelled identically.
     */
    highlight: z.string().optional(),
    order: z.number().default(0),
  }),
});

const skills = defineCollection({
  loader: md('skills'),
  schema: z.object({
    ...base,
    title: z.string(),
    order: z.number().default(0),
    groups: z.array(
      z.object({
        name: z.string(),
        items: z.array(z.string()),
      }),
    ),
  }),
});

const certifications = defineCollection({
  loader: md('certifications'),
  schema: z.object({
    ...base,
    name: z.string(),
    issuer: z.string(),
    credentialId: z.string().optional(),
    /** Display text, e.g. "April 2026". */
    date: z.string(),
    url: z.string().url().optional(),
    order: z.number().default(0),
  }),
});

const education = defineCollection({
  loader: md('education'),
  schema: z.object({
    ...base,
    institution: z.string(),
    degree: z.string(),
    location: z.string().optional(),
    start: z.string(),
    end: z.string(),
    order: z.number().default(0),
  }),
});

export const collections = {
  profile,
  about: prose,
  interests,
  experience,
  stories,
  projects,
  skills,
  certifications,
  education,
};
