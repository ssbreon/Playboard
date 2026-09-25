# Coaches Playboard for Defense

**Status**: Integrated
**Created**: 2026-09-24
**Mode**: Azure project planning

## 1. Product Summary

**Product**: Coaches Playboard for Defense

**Goal**: Deliver a responsive defensive football playbook editor where coordinators can design, adjust, annotate, organize, search, and export plays and playbooks.

**Primary users**: Defensive coordinators and coaching staff managing owned playbooks with coordinator/owner, assistant/editor, and viewer access.

**Scope**: Ship the first usable editor with 11v11, 7v7, and 4v4 field presets; base plays; named formation-adjustment slides; player symbols; routes, blitzes, zones, man indicators, alignments, responsibilities, annotations; drag/select/delete/clear; undo/redo; play library foundations; and print-ready PDF export for a play or complete playbook.

**Deferred**: Scouting/video analysis and practice scheduling.

## 2. Services

### Playboard web app

- **Type**: Frontend
- **Runtime**: Existing React 19 + Vite application
- **Language**: JavaScript/JSX
- **Rendering**: Responsive native SVG field editor with React pointer events
- **Responsibilities**: Editing canvas, play controls, library/search UI, annotation tools, authentication state, API integration, and export initiation/download experience.

### Playbook API

- **Type**: Backend
- **Runtime**: Existing Azure Functions Python v2 programming model
- **Language**: Python
- **Responsibilities**: Authentication boundary, ownership and role authorization, play/playbook CRUD, slide/version persistence, search and metadata endpoints, export job/data endpoints, and storage adapters.

## 3. Architecture

The frontend remains the existing Vite React app and communicates with an HTTP Azure Functions API. The API owns authorization and persistence; the browser never treats local identity or client-side ownership checks as sufficient. A storage abstraction keeps local Azurite development compatible with Azure Table Storage and Blob Storage in deployed environments.

Playbook records, membership, roles, revisions, slide metadata, and searchable fields use Azure Table Storage. PDF exports, uploaded assets, and future media-backed artifacts use Blob Storage. Export requests return a job or generated artifact reference so the UI can show progress and download the resulting file.

Authentication uses an external OIDC provider, with Microsoft Entra External ID and Google federation as the preferred deployment direction. Local development may use an explicit development identity behind a flag and local secret; production API routes must validate the external token and enforce ownership/role rules server-side. No plaintext passwords or Google credentials are stored.

## 4. Data Model & API

**Core entities**: User, Playbook, Membership, Play, Slide, Revision, Annotation, ExportJob, and Asset.

**Authorization roles**: Coordinator/owner manages the playbook and membership; assistant/editor can edit permitted content; viewer can read and export according to policy.

**API groups**:

- `GET/POST/PATCH/DELETE /api/playbooks` and nested play/slide routes for CRUD and revisions.
- `GET /api/search` for playbook and metadata search foundations.
- `POST /api/exports` and `GET /api/exports/{id}` for export requests and status/data retrieval.
- `GET /api/health` for local and deployed health checks.

**Storage rules**: Use Azurite-compatible Table and Blob SDK adapters locally; keep connection configuration in environment settings; keep record schemas versionable so revisions and future migrations remain explicit.

## 5. Implementation Phases

1. Replace the starter screen with the responsive playboard shell, field presets, toolbars, play library foundation, and accessible interaction states.
2. Implement normalized play/slide data and SVG editing interactions for players, routes, zones, blitzes, man indicators, alignments, responsibilities, annotations, selection, deletion, clear, and undo/redo.
3. Add API service boundaries and Azure Functions routes for authentication-aware playbook CRUD, membership/role checks, revisions, search metadata, and export jobs.
4. Add Table Storage and Blob Storage adapters compatible with Azurite, environment configuration, and migration/seed data for representative defensive plays.
5. Wire sign-in/session handling, protected UI states, error/loading/empty states, PDF export for one play and a whole playbook, and responsive print styling.
6. Validate frontend build/lint, API tests, authorization cases, storage behavior against Azurite, export output, and desktop/mobile workflows.

## 6. Design System & UI

**Component Library**: Fluent UI v9

**Visual direction**: A focused coaching workbench with a deep green field surface, warm paper-white panels, charcoal text, and measured amber/orange action accents. The field is the primary workspace; controls stay dense, legible, and keyboard accessible.

**Layout**: Persistent play library/navigation rail on wide screens, compact top toolbar, central responsive field editor, and contextual inspector for selected objects. On small screens the library and inspector become slide-over panels while the field preserves a stable aspect ratio.

**Interaction principles**: Use familiar icon buttons with tooltips for editing tools, segmented controls for field size and editor modes, explicit toggles for display layers, search input for play library filtering, and clear focus/selection states. Use Fluent UI primitives for buttons, dialogs, menus, inputs, tabs, tooltips, and notifications.

**Key views**: Playbook library, play editor, slide/version strip, selected-object inspector, export dialog, sign-in/loading/error states, and print layout.

## 7. Security & Operations

- Validate external OIDC tokens in the Python API and authorize every playbook and export operation by membership and role.
- Keep development identity behind an explicit development-only flag and local secret; never ship it enabled in production.
- Store secrets and connection strings in environment configuration or managed settings, never source files.
- Use least-privilege storage access and scoped blob download references for exports.
- Add structured request logging without recording tokens or sensitive credentials.
- Provide health checks, clear API error contracts, and deployment configuration for Azure Functions, Static Web Apps or equivalent frontend hosting, Table Storage, and Blob Storage.

## 8. Validation & Handoff

**Frontend checks**: `npm run lint` and `npm run build` from `frontend/`; verify field presets, pointer interactions, keyboard access, undo/redo, search, responsive layouts, and print output.

**Backend checks**: Python unit/API tests for validation, role enforcement, CRUD, revision persistence, export lifecycle, and Azurite adapters; verify `GET /api/health` locally.

**Acceptance criteria**: A signed-in coordinator can create and edit a defensive play, save named slides and revisions, manage permitted collaborators, search the play library, export one play or an entire playbook, and recover cleanly from loading, validation, authorization, and storage errors on desktop and mobile layouts.

**Handoff**: After explicit plan approval, hand off to `azure-project-scaffold` to execute this approved plan in the existing workspace without replacing the React/Vite frontend or Python Azure Functions API.
