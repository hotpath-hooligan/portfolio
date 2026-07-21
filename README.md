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
cp .env.example .env      # set PUBLIC_CHAT_API
make dev                  # http://localhost:4321
```

The chat needs a backend. Either point `PUBLIC_CHAT_API` at a deployed one, or
run `make serve-backend` for a temporary Modal deployment that reloads on edit.

## Deploying

Two workflows, each triggered by the paths it owns:

| Workflow | Fires on | Does |
| --- | --- | --- |
| `deploy-backend.yml` | `backend/**`, `src/content/**` | `modal deploy` |
| `deploy-pages.yml` | everything else | Astro build → GitHub Pages |

Content changes fire **both**: the site rebuilds its pages, and the backend
rebuilds the search index that is baked into its image.

### One-time setup

1. **Modal.** `pip install modal && modal setup`, then create a token at
   [modal.com/settings/tokens](https://modal.com/settings/tokens).
2. **GitHub Pages.** Settings → Pages → Source: **GitHub Actions**.
3. **Repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `MODAL_TOKEN_ID` | from the Modal token |
   | `MODAL_TOKEN_SECRET` | from the Modal token |

4. **Repository variables**, same page:

   | Variable | Value | Notes |
   | --- | --- | --- |
   | `SITE` | `https://hotpath-hooligan.github.io` | absolute site URL |
   | `BASE` | `/portfolio/` | repo name; `/` only for a user site |
   | `PUBLIC_CHAT_API` | `https://<workspace>--portfolio-chat-web.modal.run` | printed by the first deploy |
   | `CHAT_ALLOWED_ORIGINS` | `["https://hotpath-hooligan.github.io"]` | JSON array; CORS allowlist |

**Deploy the backend first** — it prints the endpoint URL that
`PUBLIC_CHAT_API` needs, and that URL is baked into the site bundle at build
time. Run `make deploy` locally once, set the variable, then let CI take over.

No Hugging Face token is needed; all three model repos are public.

Backend details — models, retrieval, the API contract — are in
[backend/README.md](backend/README.md).
