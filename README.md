# Portfolio

A static Astro portfolio with Markdown content.

## Development

```sh
npm install
npm run dev
```

The development server runs at `http://localhost:4321`.

## Content

Portfolio content lives in `src/content/`. See [CONTENT.md](CONTENT.md) for the
available collections and frontmatter fields.

## Build and deploy

```sh
npm run build
npm run preview
```

The production build is written to `dist/`. Pushes to `main` are deployed to
GitHub Pages by `.github/workflows/deploy-pages.yml`.
