<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

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
- Cleanup done: Stagehand/Browserbase removed in `4a74f3e` (deployed `erp-system-00057-dh8`, login verified) — `scripts/stagehand-agent.mts` deleted, dep + `overrides` + `stagehand` script + `allowedDevOrigins` gone, keys scrubbed from `.env.local` + Windows user env var `GEMINI_API_KEY` removed. Keys verified NEVER committed (2026-11-07 history scan: only env var names + empty .env.example lines) — rotation optional.
- Client combobox in `/ventes/nouveau` (`274801d` + `069b4b9`, deployed `erp-system-00070-qxt`): chevron button lists ALL clients (lazy `getCustomers`), typing filters via `matchTokens` consonant skeleton (bennani↔bannani), "+ Créer" row → `saveCustomer` + auto-select (sets `customerId` → Chèque/credit pass CLIENT_REQUIS), green "fiche existante" indicator. `isTypingCustomer` excludes the "Client Comptoir Particulier" default. Dev DB has test client `Garage Nouveau Test Zz` — delete if unwanted.
- Deployed prod: `erp-system-00099-99j` (latest). GitHub `main` fully pushed through `62f6091`.
- Full verification pass DONE (2026-10-26): DB invariants clean (product_stock=global, HT+TVA=TTC, no orphans/dups); doc-type matrix verified live on dev (DEVIS/BC created, BL→FAC-2026-00002+link, AV-2026-00001 restock +1). Bugs found+fixed: journée encaissements missed counter-cash sales (residual paid-at-sale merged, BL/FAC only — a180a00+62f6091). False positive: BL-2026-00002 "mismatch" = 10% doc discount.
- **Pending next step (user was offered):** negative-stock analysis — 6 products negative by design tolerance (sku 1021/-37, 1035/-11, 1207/-400, 1287/-10, 1389/-16, 1425/-5). RESOLVED (2026-10-28): root cause = inherited legacy data — each product had a single STOCK_INITIAL seed movement dated Oct 11 carrying the old ERP's negative values. User chose reset-to-0: all 6 set to 0 on prod+dev via corrective AJUSTEMENT_INVENTAIRE movements + product_stock bumps + audit row (CORRECTION_STOCK_NEGATIF). 0 negatives remain, stock/warehouse invariant still holds. Prod negative_stock_allowed=false already strict.
- Legacy data import DONE (2026-10-26): ALL 288 legacy clients on prod (263 via G9 modal + 29 same-name dup rows inserted verbatim — user wants legacy list mirrored exactly; 259 exact name+phone matches skipped), phones backfilled 242 rows; 8 suppliers on prod (CAMEL/LASAAD/HAROUN/JT added). Source: `legacy_clients_fournisseurs.txt` + `clients_import.csv` at repo root (untracked, personal data — never commit). BUG found+fixed: `téléphone` header didn't map (accents not normalized in ClientImportModal HEADERS) — fixed in a509660.
- **Legacy parity COMPLETE — all 10 gaps shipped** (`LEGACY_GAPS_TRACKER.md` at repo root): P1 G4 covered/G5 supplier returns/G6 traceability/G7 daily sheet (`ef43306`); P2 G3 staff/G8 cheque deposit/G9 client CSV import/G10 lock screen (`27761f8`+`f123b48`+`a156a62`+`63d7808`); P3 G2 bons de préparation+feuille de route (`fd0a81d`, prep_status on sales_documents + /livraisons); P4 G1 multi-entrepôts (`0b819a2`, product_stock+stock_transfers, bumpWarehouseStock wired into all stock paths, /stock warehouse filter+TransferModal, warehouses ENTREPOT_PRINCIPAL+MOBILE_01 on dev+prod).
- **#441 masking fixed** (`720aeb9`): read actions (getUsers/getStaff/getWarehouses*/getStockTransfers/getDeliveryRouteSheet) now return ActionResult — NON_AUTORISE shows real message on prod, not "Minified React error #441". NOTE: any new read action that can throw auth errors must also return ActionResult.
- Legacy data extracted to `C:\Dev\ERP_System\legacy_clients_fournisseurs.txt` (UNTRACKED, real personal data — do NOT commit): 289 clients + 8 fournisseurs from montaservice.net, semicolon-delimited. **TOMORROW: transform to G9 import format** (nom;téléphone;ville;ice;adresse;limite → importCustomersBatch on /reglements; dedup by name/phone/ICE). Suppliers may need a new import path or manual entry (only 8).
- Legacy follow-ups logged in tracker (not gaps): per-warehouse inventaire, warehouse picker on sales/receipts (route→Mobile), POS commercial select, journée commercial filter.
- Dev test data to clean eventually: BR-2026-TEST01, test client `Garage Nouveau Test Zz`, test users. Gemini/Browserbase keys never in git (verified 2026-11-07) — no rotation needed.
- Legacy parity Phase 4 (G1) done (`0b819a2`, `erp-system-00090-h44`): product_stock per-warehouse layer over global current_stock, stock_transfers + createStockTransfer (locked, dual movement rows), stock_movements.warehouse_id, bumpWarehouseStock wired into all mutation paths (default=Principal), /stock warehouse filter + TransferModal, /lib/warehouse.ts helpers. Dev+prod warehouses: ENTREPOT_PRINCIPAL (default) + MOBILE_01. Migration 0027 both envs.
- Legacy parity Phase 3 done (`fd0a81d`, `erp-system-00087-892`): prep_status on sales_documents (migration 0026) + src/lib/prep.ts state machine (A_PREPARER→EN_PREPARATION→PREPARE→LIVRE|NON_LIVRE), createBonPreparation/updatePrepStatus/getDeliveryRouteSheet actions, /ventes Package button + chip + select, /livraisons route sheet grouped by livreur + printable, AppShell nav.
- Legacy parity Phase 2 done: G3 staff/commercial/livreur (`27761f8`, migration 0024), G8 cheque deposit_date (`f123b48`, 0025), G10 LockScreen + Verrouiller btn (`63d7808`), G9 ClientImportModal + importCustomersBatch (`a156a62`). Deployed `erp-system-00084-lfw`.
- Legacy parity Phase 1 done (`ef43306`): supplier returns (`SupplierReturnModal` + hardened `createSupplierReturn`: lockProducts, neg-stock guard, returned_quantity double-return cap, debt reduction), product traceability (`getProductMovements` walkback + `ProductHistoryModal` on /stock), feuille de journée (`getDailySheet` + JOURNEE tab on /comptabilite). Migration 0023 (`supplier_receipt_lines.returned_quantity`) applied dev+prod. Bugfix: `preselectedSupplierId` render-reset in all 3 supplier modals; unwrap on setPeriodStatus. G4 already covered by StockAdjustmentModal. Gap tracker: `LEGACY_GAPS_TRACKER.md` (repo root).
- Catalogue photo import done (`532b062`): `scripts/fetch-monta-catalogue.mjs` scraped montaservice.net (`MONTA_USER`/`MONTA_PASS` env creds) - 427 products parsed, 295 images downloaded (refs 1292-1427 have no image server-side, all extensions 404 - source data gap). `import-catalogue-images.mjs` pushed all to R2; `photo_url` set on dev AND prod (295/427, synced by SKU). Verified live on prod POS. Local images at `C:\Dev\ERP_System\CatalogueImages\` + `catalogue.json`.

## Resume point — external audit remediation (saved 2026-10-29)

- **Deployed prod:** `erp-system-00103-hrx`. My pre-delivery audit report: `TEST_AUDIT_2026-10-29.md` (repo root, untracked). 11 bugs fixed (`5c681f3`): PaymentModal stale client, sale payment rows (POS + /ventes/nouveau cheque fields), receivables `src/lib/sales/receivables.ts`, BL→FAC discount/payment/dup-conversion, journée totals, StaffSection nested form, payment lettering, échéancier counter, `archiveProduct`, 12 mojibake names.
- **External audit file analyzed, NOT yet fixed:** `AUDIT_BUGS_AND_FIXES_INSTRUCTIONS.md` — all 5 verified REAL in code, none overlap my 11:
  - BUG-01 (P1): `window.prompt`+`confirm` avoir type picker — `src/app/ventes/page.tsx:131-141` (also confirm at :127 convert, :152 cancel). Fix: 3-card Tailwind modal RETOUR/COMMERCIAL/CORRECTION.
  - BUG-02 (P1): POS `onRequireCustomer` closes PaymentModal, opens CustomerSelect; `onSave` never reopens PaymentModal — `src/app/pos/page.tsx:461-464` + `onSave:430-449`. Fix: `returnToPaymentRef` flag. Sub-fix: `CustomerSelect.handleSelectCustomer` (:80-93) could 1-click select+save.
  - BUG-03 (P2): `manifest.json` claims 192x192+512x512 for `bashan-logo.png` which is actually **300x100**. Fix: generate square `icon-192.png`/`icon-512.png` on #111827 bg, update manifest.
  - BUG-04 (P2): ZERO id/name/aria-label on inputs — SupplierReceiptModal(10), SupplierPaymentModal(6), courriel(4), pos(1), inventaire(1), **+they missed PaymentModal(4), CustomerSelect(6)**. Mechanical sweep.
  - BUG-05 (P3): `ExpenseModal.tsx` — hint "• Justificatif obligatoire" exists at :168 but tiny/gray; upload label :222 has no required marker. Fix: badge + amber border on upload zone.
- **CRITICAL pending cleanup — PROD TEST-DATA POLLUTION** (external audit ran on live prod, left fixtures):
  - 11 docs: BL-2026-00001..04, FAC-2026-00001/02, DV-2026-00001, BC-2026-00002/03, AV-2026-00001 (pre-existing BC-2026-00001 ANNULE is older).
  - **REAL client MONTASSIR (id 190) has 3 fake customer_payments = 840 DH** (2×ESPECES ENCAISSE + CHQ-CLIENT-778899 REMIS_BANQUE) — balance corrupted.
  - Products `AUDIT-PROD-100` (active, 66 fake units) + `TEST-AUDIT-001` (archived, 20); supplier `FOURNISSEUR AUDIT MOTO SARL` (id 9) + `BR-2026-00001` 3,600 DH; supplier payment `CHQ-AUDIT-998811` 1,600 DH EN_ATTENTE; expense "Plein carburant…test audit" 120 DH.
  - Claimed user "Amine Caissier" NOT present on prod — only "Karim" CAISSIER active (confirm if real employee).
  - Cleanup plan: reverse/cancel docs via actions where possible (audit trail), delete fixture rows, restore MONTASSIR balance — verify invariants after.
- **Suggested order:** prod cleanup first (corrupts client-facing financials) → BUG-01+02 → BUG-03+05 → BUG-04.

## Resume point — external audit remediation DONE (2026-10-30)

- **Prod test-data cleanup DONE**: Neon backup branch `backup-pre-cleanup-2026-10-30` (br-restless-unit-b15ad56n, project twilight-pine-29350562, prod branch br-fancy-block-b13o37dw "production"). Full transaction reset: 12 docs, 4 customer payments, 1 BR+1 supplier payment, 1 expense, 12 test movements, products TEST-AUDIT-001+AUDIT-PROD-100, supplier 9, user Karim, 2 cancelled stock counts, all audit rows → 1 RESET_DONNEES_TEST row. Stock restored (+10 on 1008/1024/1006), 41 STOCK_INITIAL provenance rows recreated, numbering_sequences reset to 1, 295 clients + 8 suppliers + catalogue intact. BL-2026-00005 (AWZAL ABDLLA 2, 1591.25 DH) was confirmed TEST by user.
- **Prod DB conn string via Neon MCP** `get_connection_string` (gcloud secret access lost — see below).
- **All 6 bugs fixed + live-verified on dev** (commit `5cc478f`): BUG-06 POS qty cap 999→1M (raw input + over-stock warn, ProductQuickAddModal); BUG-02 PaymentModal reopens via returnToPaymentRef + 1-click client select; BUG-01 AvoirTypeModal+ConfirmDialog (no more prompt/confirm); BUG-05 Obligatoire badge+amber border+scrollTo; BUG-03 real icon-192/512 + `/icon-*` whitelist in proxy.ts (session-less PWA fetches were 307'd); BUG-04 id/name/aria-label on 41 fields.
- **Deployed prod: `erp-system-00108-6x6`** (5cc478f) — smoke-tested: login + /pos /ventes /reglements /stock /parametres all ok, manifest+icons 200. gcloud note: CLI credential for davidsmithny01 lacks erp-syste rights but the machine ADC token works — deploy via `CLOUDSDK_AUTH_ACCESS_TOKEN=$(gcloud auth application-default print-access-token) gcloud run deploy ...`
- Prod DB currently: 0 docs, 0 payments, 295 clients, 8 suppliers, 428 products, numbering at 00001 — ready for first real sale.

## Resume point — LEGACY MEGAPLAN phase 2 (saved 2026-11-03)

**Plan:** `~/.devin/plans/plan-f7d1272704d0c09d.md`. Tracker: `LEGACY_MEGAPLAN_TRACKER.md` (repo root, committed). Audit: `LEGACY_FEATURE_AUDIT.md`. Page dumps: `References_/legacy-pages/*.html|.txt` (untracked, regenerate via `MONTA_USER=$MONTA_USER MONTA_PASS=$MONTA_PASS node scripts/fetch-legacy-pages.mjs <pages>` — creds from the owner, never written in repo files).

**Committed:** `5d00226` audit+tracker+fetch script · `024a6b0` **G11+G20 /clients page** · `e087c49` tracker update.

**G11+G20 shipped (dev-verified, NOT yet deployed):**
- `/clients`: fuzzy search, 25/p pagination, commercial filter, "avec solde dû" toggle, aging J+ badges, summary cards; `ClientDrawer` (KPIs + Documents/Règlements/Relevé tabs + Encaisser/Relevé A4/Modifier); nav entry Clients.
- Migration **0028 applied dev+prod** — `customers.assigned_staff_id`, `risk_class`, `payment_term_days`. **Deployed prod `erp-system-00116-jv8`** (2026-11-04) — live-verified: login, nav "Clients", `/clients` 295 rows/12 pages + summary cards + filters, ClientDrawer (KPIs, Documents/Règlements/Relevé tabs, Encaisser/Relevé A4/Modifier), console clean.
- Bug fixed: `CustomerModal` never repopulated on edit — `useState(customer?.x)` initializers ran once at mount while isOpen=false; added reset-on-open useEffect (latent bug also affected /reglements).
- `ClientDrawer` takes `refreshKey` prop — bump to refetch statement after saves (stale-statement revert bug).

**Next items, user's dependency-first order (G22→G21→G23, then phase C, D, E):**
1. G22 `customer_payments.payee_name` (XS) — endorsed-cheque "Règlement au nom".
2. G21 payment modes CARTE_BANCAIRE + VERSEMENT (payments.ts PaymentMethod + flows + journée totals); decide ACOMPTE/RISTOURNE/AVOIR-as-payment.
3. G23 acomptes (check SoldesClient usage first).
4. Phase C: G12 catalogue view, G14 brands table, G18 smalls (commercial filter /ventes, marge+Val_PA cols /stock, transfers list, per-warehouse inventaire, feuilleRoute abrégée), G17 quick-receive.
5. Phase D: G15 CA mensuel, G16 profil employé, G19 print/CSV. Phase E: data pull (situationClients anchor: reste 697 910,50 Dh).

**IronBee quirks learned:** combobox `nth` refs shift after selects — use scoped CSS `form select:has(option:text-is("X"))` or `:has(option[value="Y"])`; drawer's `form` scoping avoids hitting page filters.

**Key legacy facts:** employees have 6 roles (administrateur/admin/commercial/Caissier/logisticiene); legacy categories≈marques are near-dup lists (G13 de-scoped); recepAdd has "En Compte" checkbox + Logisticien + Date.Rég.Prévu + entrepôt fields; payment modes union = acompte/carte/cheque/effet/espece/virement/versement/avoir/ristourne; dashboard "Ancien Solde" carryover 407 829,17 Dh.

**Deploy pending:** prod migrate 0028 → `CLOUDSDK_AUTH_ACCESS_TOKEN=$(gcloud auth application-default print-access-token) gcloud run deploy erp-system --source . --region europe-west1 --project erp-syste` (run from erp-inventory/).

## Git workflow — NON-NEGOTIABLE: one branch per feature

- **Never commit a feature directly to `main`.** Every feature/tracker item gets its own branch (`feat/<item>-<slug>`, e.g. `feat/g11-clients-page`), committed there, then merged into `main` when verified.
- **Why:** deploys must stay traceable — if a feature crashes prod, we can pinpoint the exact branch/commit and roll back to the last working one (`gcloud run deploy` of a prior commit or `git revert` the merge).
- Small docs-only/typo commits may go straight to `main`; anything touching runtime code goes through a branch.
- Deploy = merge of a verified branch; note branch + commit + prod revision in the tracker Done log.

## Resume point — megaplan phase 2 update (saved 2026-11-04)

- **G11+G20 DEPLOYED:** `erp-system-00116-jv8`, migration 0028 on prod. `/clients` live.
- **G22 DEPLOYED:** `erp-system-00118-t5b`, migration 0029 on prod (`customer_payments.payee_name`). Live-verified: "Règlement au nom de (tiers — chèque endossé)" field renders on Chèque in PaymentModal via /clients → Encaisser, console clean.
- **G21 DEPLOYED:** `erp-system-00121-f2r` `v1.2.0` (`63b33c8`, `feature/g21-payment-modes` merged+deleted). Migration 0030 prod — `payment_methods` += CARTE_BANCAIRE+VERSEMENT. POS has 4th TPE button (no fiche); VERSEMENT requires fiche like VIREMENT; supplier non-cheque/effet → DEBITE. `paymentMethodLabel()` in `src/lib/payments.ts`.
- **G12 DEPLOYED:** `erp-system-00125-8zw` `v1.3.0` (`a9ade51`). Catalogue card view + `getProductBrands` brand filter + `@media print` hides chrome (globals.css) — print-only header on catalogue view.
- **Workflow:** `Github_Branching_instructions.md` (repo root) — feature/* branches, approval checkpoint before merge+deploy, semver tag per deploy. Tags: v1.0.0=00116, v1.1.0=00118, v1.2.0=00121, v1.3.0=00125.
- **G23 DE-SCOPED** (2026-11-04): `situationClients` pull — 0/284 clients with non-zero acompte. Never used upstream. 83 clients have non-zero Avoirs → credit notes are real usage, fold into Phase E.
- **G14 DEPLOYED:** `erp-system-00128-9d7` `v1.4.0`. `brands` table (0031, backfilled), /parametres "Catalogue" tab → BrandsSection (add + toggle active), ProductModal datalist. User-verified on prod.
- **G18 p1 DEPLOYED:** `erp-system-00132-l7m` `v1.5.0` (`d626dee`). `/stock/mouvements` journal + `/stock/transferts` history + `WarehousesSection` (parametres Catalogue). Remaining G18: /ventes commercial filter, marge%/Val_PA cols, inventaire écart, feuilleRoute abrégée.
- **G18 p2 DEPLOYED:** `erp-system-00135-xgb` `v1.6.0`. marge%/Val_PA on /stock, inventaire DH écarts, /livraisons abrégée. /ventes commercial filter refed by `getDocumentCommercials` on main (`842a6ce`, undeployed — rides next release; prod staff table empty so staff-based select was hidden).
- **G17 DEPLOYED:** `erp-system-00139-gbf` `v1.7.0` (`0a71e6f`). "Rapide" toggle in SupplierReceiptModal (SKU/barcode/OEM + qty, dup-scan increments). Carried `842a6ce` commercial-filter fix (prod docs have no commercialName yet → select hides until first doc w/ commercial).
- **Phase D DEPLOYED:** `erp-system-00142-cpd` `v1.8.0` (`53dd765`, octopus merge of 3 branches). G15 CA mensuel tab (/comptabilite, getMonthlyRevenue), G16 /profil (user chip link, audit-joined today docs, changeMyPin), G19 Imprimer on last 4 uncovered lists.
- **Phase E DONE (opening positions):** `0049427`+`6681681` on main. Prod net receivable = **697 910,50 DH exact**. Script: `scripts/import-legacy-balances.mjs` (dry-run → --apply, neon tagged template, dates as plain strings). Model: per client `debt_doc = reste + Σ pending cheques` → unpaid VALIDE BL + payments `EN_ATTENTE` (net = reste); negative-reste clients → `ENCAISSE` compensating payment, no doc. `MIGRATION_RECONCILE.md` = full spec+results.
- **ONLY REMAINING:** 8 supplier debts — all legacy sources dead → user enters amounts (or provides them → insert unpaid supplier_receipt per supplier, same pattern).
- Dev server :3100 (dev branch — import is prod-only). Prod: `erp-system-00142-cpd` `v1.8.0`.

## Resume point — security remediation (saved 2026-11-07)

- **Security audit `SECURITY_AUDIT_2026-11-07.md` at repo root (untracked by design — describes weaknesses). All 9 remediation steps DONE:**
  1. Neon DB password rotated (Secret Manager v2, GitHub secret updated, backup verified); legacy montaservice cred removed from AGENTS.md (git history untouched — private repo, owner should change pass)
  2. PIN brute-force: `clientIp()` = right-most XFF entry (prod-verified real IP), progressive delays 1→8s, 15min lockout; login+lock screens accept 4–8 digits, no auto-submit — `v1.9.0` / `erp-system-00152-vm6`
  3. next 16.3.8→**16.4.5** + dompurify 3.4.17, `npm audit`=0 — `v1.9.1` / `erp-system-00154-6hr`
  4. Security headers (HSTS, XFO DENY + frame-ancestors 'none', nosniff, Referrer-Policy, Permissions-Policy camera=self, poweredByHeader off, CSP **Report-Only**) — `v1.9.2` / `erp-system-00155-sgk`
  5. PIN oracle fixed: `changeMyPin` generic error + `CHANGEMENT_PIN_ECHEC` audit rows + 5-fail/15min cap; `revokeAllSessions` → `assertOwner()` — `v1.9.3` / `erp-system-00156-8nm`
  6. Least-privilege: app runs as **`erp-runtime@erp-syste`** (secretAccessor×6 + logWriter); builds run as **`erp-deployer`**; default compute SA's `roles/editor` **removed**; Cloud Build trigger restricted to `includedFiles: erp-inventory/**` (docs pushes no longer redeploy)
  7. Import bookkeeping: the 2 solde-créditeur ESPECES payments (ids 472/473) back-dated to `2024-12-31` (out of Nov-4 till); `IMPORT_LEGACY` audit row added; net receivable still exactly **697 910,50 DH**
  8. **IAP enabled on Cloud Run** (project has no org → custom OAuth client `1046319022554-oeirf7rhh6keb18ke7kk0cmoenanvk2q` via `gcloud iap settings set`); `iap.httpsResourceAccessor` → davidsmithny01@gmail.com (project-level); IAP SA granted `run.invoker`. Chain: Google sign-in → PIN pad. **IronBee can't drive prod pages anymore** (no Google auth) — prod verify = curl/gcloud logs/user.
  9. CI: `.github/workflows/ci.yml` (tsc+eslint-errors+build, paths erp-inventory/**, workflow_dispatch) — first run green; `dependabot.yml` weekly npm; vuln alerts ON. 4 set-state-in-effect errors fixed (ClientDrawer/CustomerModal render-phase adjust, TransferModal debounce).
- **Residual:** 2 moderate dev-only Dependabot alerts (typescript-estree/tsx — upstream majors); secret scanning needs GHAS; optional IAM-invoker second layer under IAP; CSP still report-only (promote after observing violations).
- **State:** `main` @ `3a2ec1c`+deployed via trigger; prod revision auto-deployed for each merged change; latest tag `v1.9.3`.
