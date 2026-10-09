# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Account Implementation: Local Milestone

The local account/workspace foundation is implemented. This is not a production
Entra, Paddle, or Resend integration yet.

### Available Locally

- Profile name/coaching title and personal theme, field standard, and timezone preferences.
- Individual and Team switcher under the app-bar user icon, with per-tab selection.
- Workspace-bound requests, isolated libraries, scoped Owner/Admin/Coach capabilities.
- Save/Discard/Cancel navigation, including base-play and adjustment drafts.
- Account-menu Sign Out uses the same unsaved-change guard, clears the selected
	workspace, and blocks authenticated frontend requests for this tab. The signed-out
	state survives reloads; Sign In restores the configured development identity.
	This is local session handling, not production provider logout or token revocation.
- Team name/defaults, roster roles/removal, seven-day invitations, resend/revoke,
	reserved seats, and recipient-bound single-use acceptance.
- Encrypted email capture only: no invitations are sent to real recipients.
- Annual local Owner fixtures, read-only lifecycle checks, usage/caps and billing summary.
- Legacy playbooks stay in Individual; they are not moved to the local Team.

Individual and Team each have separate limits: 100 playbooks, 100 game plans,
5,000 plays across all playbooks, and 5,000 scouting plays across all game plans.
The ten Team seats include the Owner and pending unexpired invitations.

### Record Status

Playbooks, Game Plans, Plays, and Scout Plays persist `recordStatus` as `Active`
or `Archived`; existing records without the field are treated as Active.
Each grid starts with Active selected. The toolbar menu's left pane is labeled View and contains
mutually exclusive Active/Archived choices; its right pane is labeled Actions
and contains grid commands. A Status column immediately before row actions displays the saved value.
An archive icon and Archived label beside the toolbar menu identify the Archived view.
Archive requires confirmation and hides the record from the default view.
Archived rows offer Restore, which sets the status back to Active.

Archive/Restore requires edit access. Archiving keeps all data, descendants,
page positions, and quota usage intact; child statuses are unchanged.
Delete remains permanent, including scoped descendants. Page reordering is
available only when every row is visible; mixed Active/Archived libraries cannot
be reordered while one status is hidden. The schema manifest is
`api/migrations/004-record-status-schema.json`.

### Local Configuration

Keep the existing development credentials in the ignored API local settings and
frontend environment files. The frontend template is `.env.example`. Never use
frontend environment variables for Paddle/Resend backend keys.

API values (in `api/local.settings.json` under `Values`):

| Setting | Local Value |
| --- | --- |
| `AUTH_MODE` | `development` |
| `BILLING_MODE` | `mock` |
| `APP_ENVIRONMENT` | `local` |
| `DEV_USER_ID` | `local-coach`, or your existing configured identity |
| `DEV_USER_EMAIL` | Optional controlled Gmail alias for acceptance tests |
| `APP_PUBLIC_URL` | `http://localhost:5173`, matching the running frontend |
| `DEV_AUTH_SECRET` | Existing local secret, matching the frontend |
| `CONTENT_LIMIT_PLAYBOOKS` | `100` |
| `CONTENT_LIMIT_GAME_PLANS` | `100` |
| `CONTENT_LIMIT_PLAYS` | `5000` |
| `CONTENT_LIMIT_SCOUT_PLAYS` | `5000` |

Content limits are read by the API at startup. Set the corresponding Function App
Settings in Azure to override them without rebuilding; omitted settings use the
defaults shown above. Values must be non-negative integers.

An explicitly development-authenticated, non-Azure local runtime defaults to mock
billing if `BILLING_MODE` is omitted. Set it explicitly for clarity. The configured
default identity automatically receives Individual and local Team annual fixtures.
Other development identities get their own Individual trial and no automatic Team
access. Seed operations are idempotent and do not reset deliberately expired fixtures.

Mock mode refuses deployed Azure runtimes, production environment settings, and
non-loopback Cosmos endpoints. It never becomes a fallback for provider failures.
Do not expose the development frontend/API or development secret publicly.

The encrypted local invitation outbox derives its capture key from the backend
development secret. Rotating that secret makes old captured payloads unreadable;
revoke/reissue pending test invitations. Production will require an explicit
`EMAIL_OUTBOX_KEY` and a real Resend sender/dispatcher, not this derived local key.
Captured links are available only to authenticated Team Admins/Owners and disappear
after acceptance or revocation. To simulate the invited identity locally, use its
email as `VITE_DEV_USER_ID` in a separate development configuration with the matching
local secret. This is a dev fixture, not proof of real email verification.

### Run and Verify

Use the workspace tasks for the API, frontend, and Docker emulators. Vite is normally
at `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:7071`.
Tasks currently install requirements into their terminal's Python environment;
tests below explicitly use the workspace virtual environment.

From the workspace root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r api/requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s api -p test_auth.py
npm --prefix frontend run build
npm --prefix frontend run lint
```

If Dropbox/Windows locks the existing build output, use a temporary output directory:

```powershell
npm --prefix frontend run build -- --outDir "$env:TEMP/blitzboard-account-build"
```

The API tests cover isolation, forged ownership, roles, expiry, retained read access,
quota/seat concurrency, token expiry/rotation/revocation, encrypted capture, and
legacy preservation. Browser checks also exercised mobile layout, dirty navigation,
workspace-specific designer saves, and Cosmos create/delete quota accounting.

### Storage and Failure Recovery

The schema manifest is `api/migrations/003-workspace-accounts-schema.json`.
Existing content keeps its entity-type partition and immutable `ownerId`; new
content adds `workspaceId` and `createdBy`. Legacy owner-only records resolve only
inside their owner's Individual workspace. No blanket content transfer is performed.

Cosmos uses a workspace control partition for an ETag-protected usage ledger and
mutation lock. The memory test adapter uses a reentrant lock. Capacity is reserved
before writing content; a crash or uncertain write can leave conservative extra
reservations rather than allowing quota overflow. Actual deletions release capacity.
Collection deletion removes its scoped descendants.

Locks deliberately have no automatic expiry/takeover: that would allow overlapping
writers. A process crash can leave a workspace busy. Recovery must first stop all
writers, establish that no operation is active, reconcile actual scoped records with
the usage ledger, and only then remove the abandoned lock. Do not clear live locks or
blindly reset counters. Automated crash recovery and resumable multi-record cleanup
are production follow-ups, not guaranteed by the local tests.

### Remaining Provider and Production Work

The chosen providers and product rules remain the implementation contract:

- **Entra External ID:** email/password hosted signup/signin, MSAL, token/scope and
	verified-email validation. Non-development API authentication still fails closed
	with `AUTH_NOT_CONFIGURED`; no tenant integration is present yet.
- **Paddle Billing:** sandbox products/prices, verified checkout/webhooks, customer
	portal and credit isolation, immediate prorated interval previews/changes and
	confirmed refunds. Billing actions currently return `BILLING_NOT_CONNECTED`; mock
	Annual status is not a Paddle subscription, receipt, or payment.
- **Resend:** verified domain, sending keys, quota-aware dispatcher, signed delivery
	webhooks, suppression/retry/dead-letter handling. The current outbox captures
	encrypted messages only; it does not implement network delivery or scheduled reminders.
- **Lifecycle operations:** production ownership-transfer/account-deletion flows,
	persisted provider failure/refund transitions, retention warning jobs and verified
	deletion/backup/legal retention. The current API enforces computed read-only and
	eighteen-month read access boundaries, but does not automatically erase content.

Provider setup can run in parallel with local development. Do not deploy this
milestone as a fully integrated production account system. Use separate sandbox
data instead of granting fixture entitlements to real payment tests.
