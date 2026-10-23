<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes (BM Motors ERP)

- Verify: `npx tsc --noEmit -p .`, `npm run build`, `npm run db:migrate` (dev Neon branch from `.env.local`). Lint has pre-existing errors (no-unescaped-entities, AppShell `set-state-in-effect`) — only check files you touched.
- AppShell: every hook MUST run before the `pathname === "/login"` early return — it stays mounted across `/login` → `/` navigations; a conditional return before hooks throws React's "Expected static flag was missing".
- Money tests: `money.test.ts` uses an extensionless import; run via a temp copy that rewrites `./money` → `./money.ts`, then `node --experimental-strip-types --test`.
- Port 3000 is often taken by another local app: run `npx next dev -p 3100`.
- Every exported Server Action must call `assertAuthenticated()` (`src/lib/action-guard.ts`); owner-only mutations use `assertOwner()`. Unauthenticated layout reads live in `src/lib/queries/layout.ts` (not `"use server"`).
- Any transaction that reads then rewrites `products.currentStock/cmupCents` must call `lockProducts(tx, ids)` (`src/lib/stock-lock.ts`) first.
- Sessions: HMAC via `node:crypto` (proxy runs on Node in Next 16); `settings.session_version` revokes all sessions. Session payload carries `{user, role, uid}` — `uid=null` for the ADMIN_PIN master session.
- Multi-user: `users` table holds display name + `pin_hmac` (`pinHmac()` in `src/lib/auth.ts`, no salt — lookup key; secret is `SESSION_SECRET`). Login resolves PIN → user; `ADMIN_PIN` remains master fallback. Roles: `CAISSIER` (daily ops) / `PROPRIETAIRE` (owner). Audit rows carry `actor_name` via `currentActor()`.

## IronBee DevTools MCP (browser verification)

- Registered in `.devin/config.json` (repo root) and `~/.cursor/mcp.json`: `ironbee-dt-browser`, `ironbee-dt-node`, `ironbee-dt-backend` — all `npx -y @ironbee-ai/devtools` (v0.52.0), `TELEMETRY_ENABLE=false`. Verified via MCP handshake; tools load at session start.
- Rule `.cursor/rules/ironbee-devtools-use.mdc` mandates IronBee for browser verification (still lists node/backend as OFF — stale, all three are registered).
- Backend `db_*` tools support Neon Postgres but need `DATABASE_URL` via `connectionStringEnv` — deliberately NOT in config files (secret). Wire later via gitignored env or user-level config if wanted.

## Bugs fixed by live browser testing

- `src/app/ventes/nouveau/page.tsx`: `handleSelectCustomerMatch` discarded `c.id` → credit sales always failed `CLIENT_REQUIS`. Fixed by adding `customerId` state + passing it to `createSalesDocument`.
- `src/lib/actions/operations-log.ts`: `export const OPERATIONS_LOG_LABELS` in a `"use server"` file → every action POST 500'd ("can only export async functions"). Removed `export` (internal-only). Page rendered fine — actions were silently broken.

## Environments / deploy

- **Dev** = `.env.local` `DATABASE_URL` → Neon endpoint `ep-autumn-resonance-…` (`neondb`). **Prod** = Cloud Run service `erp-system` (project `erp-syste`, europe-west1, `erp-system-rckq4hfmga-ew.a.run.app`) → secret `DATABASE_URL` in Secret Manager → different Neon endpoint `ep-rough-frost-…`.
- **Deploys do NOT auto-migrate** (Dockerfile only runs `node server.js`). After any schema change, run `db:migrate` against prod BEFORE/with the deploy: fetch the secret via `gcloud secrets versions access latest --secret=DATABASE_URL --project=erp-syste`, pass as `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (strip `-pooler.` from host for DDL). gcloud is authenticated on this machine.
- `cloudrun.yaml` is a stale template (placeholders, wrong secret name `NEON_DATABASE_URL`) — do not trust it.
- Test data on dev: client `Garage Agent Test` (id 5), supplier `Fournisseur Agent Test`, BL-2026-00005/00006.

## Session state — resume point

- **All work committed** on `main` through `b7df03e`:
  - `05f5a25` live-test bug fixes · `62832e7` Stagehand harness · `08f94f1` cosmetic warnings
  - `b826245` audit Phase 1: zod validation on risky mutations, per-IP PIN lockout (`audit_logs.ip_address`), audit entries for product/stock edits, direct guard on `setPeriodLock`
  - `9353914` audit Phase 2: sale idempotency (`sales_documents.idempotency_key` unique + per-cart UUID on both sale pages, server dedup + unique-violation fallback), product-count query + `/stock` truncation banner, `SupplierReceiptModal` catalog `.catch`
  - `b7df03e` audit Phase 3: multi-user (`users` table + `src/lib/actions/users.ts` + `UsersSection.tsx` in parametres security tab), session `{user,role,uid}`, `assertOwner()` on settings/period-lock/cancel/stock-count/user-mgmt, `actor_name` audit attribution
- Migrations 0020+0021+0022 applied to **dev AND prod** (verified on both).
  - `2331e53` polish: global `ToastProvider` (AppShell, aria-live) replacing all 11 `alert()` calls; lint 77 errors → 0 (typed catches, action-derived param types, entities, set-state-in-effect, Date.now() purity, unused imports); shared `useCustomerSearch` hook for /ventes/nouveau + POS CustomerSelect
  - `034d687` refactor: `sales.ts` (1168→~500 lines) split into `lib/sales/shared.ts` (types/mapDoc/requireDb) + `actions/sales-documents.ts` (email/print/convert/avoir/cancel) + `actions/sales-stock.ts` (dead exports writeOffStock/createSupplierReturn — no callers); server pagination on `/stock` (50/page, per-tab counts) + `/ventes` (25/page) via `limit`/`offset` on `getProducts`/`getSalesDocuments` + new `getSalesDocumentsCount`; CsvModal export fetches full catalog
- Migrations 0020+0021+0022 applied to **dev AND prod** (verified on both).
- Live-verified via IronBee: master PIN login → user creation → caissier login (PIN 1234) → `NON_AUTORISE` on `getUsers` → sale `BL-2026-00008` → `actor_name='Caissier Test'` in audit log. Polish pass: toast on invalid VAT rate, customer typeahead selection in both pickers, zero console errors. Refactor pass: /stock pager (Page 2 → SKUs 1051+), /ventes pager + filtered count, print view via sales-documents actions.
- Dev DB test user `Caissier Test` (PIN 1234) deactivated (`is_active=false`) — audit history preserved.
- Full codebase audit report at repo root `CODEBASE_AUDIT_2026-10-22.md` (uncommitted by design).
- Audit items all done. **Deployed to prod**: `erp-system-00055-z29` (`034d687` pushed + deployed), verified live — login, `/stock` pager Page 1→2 (1001→1051).
- **Prod masks Server Action errors** ("Minified React error #441") — business rules must be RETURNED not thrown: `createSalesDocument` returns `{ok,document}|{ok:false,error}` via `businessMessage()`/`BusinessError`/prefix whitelist in `lib/sales/shared.ts` (`bb9924b`, deployed `erp-system-00062-x7s`, verified CLIENT_REQUIS visible on prod). Other actions (cancel/convert/avoir/settings/payments) still throw — same mask applies to their toasts if they ever fail on prod.
- Light-theme only by design: `dark:` variant converted to class-based in `globals.css` (`@custom-variant dark (&:where(.dark, .dark *))`, never active) + `color-scheme: light` — vestigial `dark:` classes made inputs unreadable on mobile dark mode. Fixed in `911d2b8`, deployed `erp-system-00059-scj`, verified dark-mode emulated on prod.
- Cleanup done: Stagehand/Browserbase removed in `4a74f3e` (deployed `erp-system-00057-dh8`, login verified) — `scripts/stagehand-agent.mts` deleted, dep + `overrides` + `stagehand` script + `allowedDevOrigins` gone, keys scrubbed from `.env.local` + Windows user env var `GEMINI_API_KEY` removed. **ACTION REQUIRED (user):** rotate `GEMINI_API_KEY` + `BROWSERBASE_API_KEY` at Google AI Studio / Browserbase — both were committed in git history earlier.
