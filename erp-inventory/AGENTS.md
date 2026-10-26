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
- **Prod masks Server Action errors** ("Minified React error #441") — business rules must be RETURNED not thrown. Pattern: `src/lib/action-result.ts` (`ActionResult<T>`, `actionResult(fn)`, `BusinessError`, `businessMessage` whitelist, client-side `unwrap()`). All mutation actions return `ActionResult` (`bb9924b` sale + `8c32787` sweep of ~30 actions/35 files); callers do `unwrap(await fn())` so existing try/catch→toast paths show real messages. Deployed `erp-system-00065-clt`.
- Light-theme only by design: `dark:` variant converted to class-based in `globals.css` (`@custom-variant dark (&:where(.dark, .dark *))`, never active) + `color-scheme: light` — vestigial `dark:` classes made inputs unreadable on mobile dark mode. Fixed in `911d2b8`, deployed `erp-system-00059-scj`, verified dark-mode emulated on prod.
- Cleanup done: Stagehand/Browserbase removed in `4a74f3e` (deployed `erp-system-00057-dh8`, login verified) — `scripts/stagehand-agent.mts` deleted, dep + `overrides` + `stagehand` script + `allowedDevOrigins` gone, keys scrubbed from `.env.local` + Windows user env var `GEMINI_API_KEY` removed. **ACTION REQUIRED (user):** rotate `GEMINI_API_KEY` + `BROWSERBASE_API_KEY` at Google AI Studio / Browserbase — both were committed in git history earlier.
- Client combobox in `/ventes/nouveau` (`274801d` + `069b4b9`, deployed `erp-system-00070-qxt`): chevron button lists ALL clients (lazy `getCustomers`), typing filters via `matchTokens` consonant skeleton (bennani↔bannani), "+ Créer" row → `saveCustomer` + auto-select (sets `customerId` → Chèque/credit pass CLIENT_REQUIS), green "fiche existante" indicator. `isTypingCustomer` excludes the "Client Comptoir Particulier" default. Dev DB has test client `Garage Nouveau Test Zz` — delete if unwanted.
- Deployed prod: `erp-system-00099-99j` (latest). GitHub `main` fully pushed through `62f6091`.
- Full verification pass DONE (2026-10-26): DB invariants clean (product_stock=global, HT+TVA=TTC, no orphans/dups); doc-type matrix verified live on dev (DEVIS/BC created, BL→FAC-2026-00002+link, AV-2026-00001 restock +1). Bugs found+fixed: journée encaissements missed counter-cash sales (residual paid-at-sale merged, BL/FAC only — a180a00+62f6091). False positive: BL-2026-00002 "mismatch" = 10% doc discount.
- **Pending next step (user was offered):** negative-stock analysis — 6 products negative by design tolerance (sku 1021/-37, 1035/-11, 1207/-400, 1287/-10, 1389/-16, 1425/-5). Step 1: pull movement history per product to explain why negative (sales without BR?). Step 2: owner physical count via /stock/inventaire. Step 3: optionally flip negative_stock_allowed OFF + strict default for resale.
- Legacy data import DONE (2026-10-26): ALL 288 legacy clients on prod (263 via G9 modal + 29 same-name dup rows inserted verbatim — user wants legacy list mirrored exactly; 259 exact name+phone matches skipped), phones backfilled 242 rows; 8 suppliers on prod (CAMEL/LASAAD/HAROUN/JT added). Source: `legacy_clients_fournisseurs.txt` + `clients_import.csv` at repo root (untracked, personal data — never commit). BUG found+fixed: `téléphone` header didn't map (accents not normalized in ClientImportModal HEADERS) — fixed in a509660.
- **Legacy parity COMPLETE — all 10 gaps shipped** (`LEGACY_GAPS_TRACKER.md` at repo root): P1 G4 covered/G5 supplier returns/G6 traceability/G7 daily sheet (`ef43306`); P2 G3 staff/G8 cheque deposit/G9 client CSV import/G10 lock screen (`27761f8`+`f123b48`+`a156a62`+`63d7808`); P3 G2 bons de préparation+feuille de route (`fd0a81d`, prep_status on sales_documents + /livraisons); P4 G1 multi-entrepôts (`0b819a2`, product_stock+stock_transfers, bumpWarehouseStock wired into all stock paths, /stock warehouse filter+TransferModal, warehouses ENTREPOT_PRINCIPAL+MOBILE_01 on dev+prod).
- **#441 masking fixed** (`720aeb9`): read actions (getUsers/getStaff/getWarehouses*/getStockTransfers/getDeliveryRouteSheet) now return ActionResult — NON_AUTORISE shows real message on prod, not "Minified React error #441". NOTE: any new read action that can throw auth errors must also return ActionResult.
- Legacy data extracted to `C:\Dev\ERP_System\legacy_clients_fournisseurs.txt` (UNTRACKED, real personal data — do NOT commit): 289 clients + 8 fournisseurs from montaservice.net, semicolon-delimited. **TOMORROW: transform to G9 import format** (nom;téléphone;ville;ice;adresse;limite → importCustomersBatch on /reglements; dedup by name/phone/ICE). Suppliers may need a new import path or manual entry (only 8).
- Legacy follow-ups logged in tracker (not gaps): per-warehouse inventaire, warehouse picker on sales/receipts (route→Mobile), POS commercial select, journée commercial filter.
- Dev test data to clean eventually: BR-2026-TEST01, test client `Garage Nouveau Test Zz`, test users. Prod: rotate `GEMINI_API_KEY`/`BROWSERBASE_API_KEY` (still outstanding — only user can do it).
- Legacy parity Phase 4 (G1) done (`0b819a2`, `erp-system-00090-h44`): product_stock per-warehouse layer over global current_stock, stock_transfers + createStockTransfer (locked, dual movement rows), stock_movements.warehouse_id, bumpWarehouseStock wired into all mutation paths (default=Principal), /stock warehouse filter + TransferModal, /lib/warehouse.ts helpers. Dev+prod warehouses: ENTREPOT_PRINCIPAL (default) + MOBILE_01. Migration 0027 both envs.
- Legacy parity Phase 3 done (`fd0a81d`, `erp-system-00087-892`): prep_status on sales_documents (migration 0026) + src/lib/prep.ts state machine (A_PREPARER→EN_PREPARATION→PREPARE→LIVRE|NON_LIVRE), createBonPreparation/updatePrepStatus/getDeliveryRouteSheet actions, /ventes Package button + chip + select, /livraisons route sheet grouped by livreur + printable, AppShell nav.
- Legacy parity Phase 2 done: G3 staff/commercial/livreur (`27761f8`, migration 0024), G8 cheque deposit_date (`f123b48`, 0025), G10 LockScreen + Verrouiller btn (`63d7808`), G9 ClientImportModal + importCustomersBatch (`a156a62`). Deployed `erp-system-00084-lfw`.
- Legacy parity Phase 1 done (`ef43306`): supplier returns (`SupplierReturnModal` + hardened `createSupplierReturn`: lockProducts, neg-stock guard, returned_quantity double-return cap, debt reduction), product traceability (`getProductMovements` walkback + `ProductHistoryModal` on /stock), feuille de journée (`getDailySheet` + JOURNEE tab on /comptabilite). Migration 0023 (`supplier_receipt_lines.returned_quantity`) applied dev+prod. Bugfix: `preselectedSupplierId` render-reset in all 3 supplier modals; unwrap on setPeriodStatus. G4 already covered by StockAdjustmentModal. Gap tracker: `LEGACY_GAPS_TRACKER.md` (repo root).
- Catalogue photo import done (`532b062`): `scripts/fetch-monta-catalogue.mjs` scraped montaservice.net (`MONTA_USER`/`MONTA_PASS` env creds) - 427 products parsed, 295 images downloaded (refs 1292-1427 have no image server-side, all extensions 404 - source data gap). `import-catalogue-images.mjs` pushed all to R2; `photo_url` set on dev AND prod (295/427, synced by SKU). Verified live on prod POS. Local images at `C:\Dev\ERP_System\CatalogueImages\` + `catalogue.json`.
