// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Static output, served as plain files. SITE gives absolute URLs in the
  // build; BASE is the subpath when deploying to a GitHub Pages project site.
  //
  // `||` rather than `??`: an unset GitHub Actions variable expands to an empty
  // string, not undefined, and Astro rejects `site: ""` as an invalid URL.
  site: process.env.SITE || undefined,
  base: process.env.BASE || '/',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },
});
