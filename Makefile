.PHONY: dev build preview deploy serve-backend

# Site on http://localhost:4321, talking to the deployed backend.
dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

# Deploy the chat backend (models, index, API) to Modal.
deploy:
	cd backend && modal deploy app.py

# Temporary Modal deployment that reloads on edit, for working on the backend.
serve-backend:
	cd backend && modal serve app.py
