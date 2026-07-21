// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Astro emits absolute asset URLs, so it has to be told the subpath it will
  // be served from. `base` is the repo name because this is a GitHub *project*
  // site; it would be '/' for hotpath-hooligan.github.io itself.
  site: 'https://hotpath-hooligan.github.io',
  base: '/portfolio/',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },
});
