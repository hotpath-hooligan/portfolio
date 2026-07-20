import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Base is the collection's own directory, not `src/content`, so entry ids are
 * bare slugs (`go-netstack`) rather than paths (`projects/go-netstack`) —
 * otherwise `/projects/[slug]` builds as `/projects/projects/go-netstack`.
 */
const md = (dir: string) => glob({ pattern: '*.md', base: `./src/content/${dir}` });

/**
 * Shared across every collection. Draft entries are skipped by both the page
 * renderers and `scripts/build-index.mjs`, so half-written content can live in
 * the repo without the chat citing it as fact.
 */
const base = {
  draft: z.boolean().default(false),
};

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
  schema: z.object({
    ...base,
    title: z.string(),
    blurb: z.string(),
    stack: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    year: z.string().optional(),
    featured: z.boolean().default(false),
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
  about: prose,
  interests,
  experience,
  projects,
  skills,
  certifications,
  education,
};
