# Integration Plan

## Backend
- Project folder: api
- Run command: func start --port 7071
- Build command: python -m pip install -r api/requirements.txt
- Health endpoint: GET /api/health
- API routes:
  - GET /api/health
  - GET /api/search
  - GET /api/playbooks
  - POST /api/playbooks
  - GET /api/playbooks/{playbookId}
  - PATCH /api/playbooks/{playbookId}
  - DELETE /api/playbooks/{playbookId}
  - GET /api/playbooks/{playbookId}/plays
  - POST /api/playbooks/{playbookId}/plays
  - GET /api/playbooks/{playbookId}/plays/{playId}
  - PATCH /api/playbooks/{playbookId}/plays/{playId}
  - DELETE /api/playbooks/{playbookId}/plays/{playId}
  - GET /api/playbooks/{playbookId}/slides
  - POST /api/playbooks/{playbookId}/slides
  - GET /api/playbooks/{playbookId}/slides/{slideId}
  - PATCH /api/playbooks/{playbookId}/slides/{slideId}
  - DELETE /api/playbooks/{playbookId}/slides/{slideId}
  - POST /api/exports
  - GET /api/exports/{id}

## Frontend
- Project folder: frontend
- Build command: npm --prefix frontend run build
- Dev command: npm --prefix frontend run dev -- --host 0.0.0.0
- API seam: frontend/src/api/index.ts
- Mock files to delete or replace:
  - frontend/src/api/mockClient.ts
  - frontend/src/mocks/**
  - frontend/src/api/previewState.ts
  - frontend/src/api/previewStateSwitcher.*
  - any locally duplicated types under frontend/src/types/**
- Shared types: use the app-shared package location created in the scaffold, typically frontend/src/shared or a monorepo shared package, and import via the workspace alias defined in the scaffold

## Database
- Type: Azure Cosmos DB NoSQL API with the local Cosmos DB Emulator
- Migration tool: explicit versioned container schema + adapter updates; no ORM seed generation
- Connection env vars:
  - COSMOS_ENDPOINT
  - COSMOS_KEY
  - COSMOS_DATABASE
  - COSMOS_CONTAINER
  - AZURE_FUNCTIONS_ENVIRONMENT
- No seed data is to be created.

## Integration Results

- Added `api/migrations/001-storage-schema.json`, a versioned Cosmos database/container schema definition with no records or seed data.
- Added the live API dispatcher in `api/function_app.py` for health, search, playbook, play, slide, and export routes.
- Added the frontend live client at `frontend/src/api/client.js`, exported through `frontend/src/api/index.js`, and configured the Vite `/api` proxy for port 7071.
- Wired the existing React screen to live health and playbook requests; frontend build completed successfully and no mock or preview-state files are present.
- Installed Python 3.11 and Azure Functions Core Tools 4.14.0; the Functions host runs on port 7071 against the local Cosmos emulator.
- Backend verification passed: `GET /api/health` returned 200, empty `GET /api/playbooks` returned 200, and a create/list persistence round trip returned 201/200. The temporary verification document was deleted afterward.
- Frontend server verification passed with HTTP 200 at `/`; the Vite `/api/health` proxy returned 200 from the running Cosmos-backed API.

## Services
- Essential:
  - Authentication and role enforcement
  - Playbook and membership service
  - Play/slide CRUD and revision service
  - Search and metadata service
  - Export job orchestration
  - Storage adapter service
- Enhancement:
  - Media asset processing
  - Analytics and audit logging
  - UI sync and notifications

## Validation notes
- Frontend smoke test: build + local preview only; API wiring is done in the integration phase.
- Backend smoke test: GET /api/health and then probe each route inventory above from a running local Functions host.
- Local environment caveat: this workspace shell does not currently have a Python runtime installed, so Python-based API validation must be performed in a machine or dev container that has Python available.
