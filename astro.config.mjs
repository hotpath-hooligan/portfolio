// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Astro emits absolute asset URLs, so it has to be told where it will be
  // served from. The custom domain in public/CNAME serves this repo at the
  // root, so `base` is '/' rather than the repo name it would be on a bare
  // github.io project site.
  site: 'https://aryankapoor.me',
  base: '/',

  vite: {
    plugins: [tailwindcss()],
  },
});
