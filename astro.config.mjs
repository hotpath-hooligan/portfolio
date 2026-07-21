// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Static output, served as plain files. SITE gives absolute URLs in the
  // build; BASE is the subpath when deploying to a GitHub Pages project site.
  site: process.env.SITE ?? 'https://example.com',
  base: process.env.BASE ?? '/',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },
});
