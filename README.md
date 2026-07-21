# Portfolio

A static Astro site with a retrieval-augmented chat that answers questions about
its own content.

Two deployable pieces, and only one of them is a server:

| Piece | What it is | Where it runs |
| --- | --- | --- |
| Site | Astro static build (`dist/`) | GitHub Pages, or any static host |
| Chat backend | FastAPI + vLLM | Modal, scale-to-zero |

Content lives in `src/content/` as Markdown — see [CONTENT.md](CONTENT.md).

## Running it

```sh
npm install
make dev                  # http://localhost:4321
```

The chat talks to the deployed backend by default. To work against a local
one, run `make serve-backend` and put the temporary URL it prints in
`PUBLIC_CHAT_API` — the only environment variable this project reads.

## Deploying

Two workflows, each triggered by the paths it owns:

| Workflow | Fires on | Does |
| --- | --- | --- |
| `deploy-backend.yml` | `backend/**`, `src/content/**` | `modal deploy` |
| `deploy-pages.yml` | everything else | Astro build → GitHub Pages |

Content changes fire **both**: the site rebuilds its pages, and the backend
rebuilds the search index that is baked into its image.

### One-time setup

1. **GitHub Pages.** Settings → Pages → Source: **GitHub Actions**.
2. **Two repository secrets**, from [modal.com/settings/tokens](https://modal.com/settings/tokens):

   | Secret | |
   | --- | --- |
   | `MODAL_TOKEN_ID` | Modal API token |
   | `MODAL_TOKEN_SECRET` | Modal API token |

That is the whole configuration. There are no repository variables: the site
URL, the base path, the API endpoint and the CORS allowlist are all public
values that never change, so they live in `astro.config.mjs`,
`src/lib/chat/client.ts` and `backend/app.py` rather than in CI settings.

No Hugging Face token is needed; all three model repos are public.

Backend details — models, retrieval, the API contract — are in
[backend/README.md](backend/README.md).
