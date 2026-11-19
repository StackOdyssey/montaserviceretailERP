# ERPSoftware — MegaPlan & Feature Tracker
**Clone of** `C:\Dev\ERP_System` (BM Motors ERP) @ commit `c102f00` (includes parked payment-terms work)
**Purpose:** Retail-shop ERP version ("Détail"), cloned from the wholesale codebase, targeting feature parity + improvements over the legacy Bestway/POSIX system analysed in `Legacy_Analysis\POS_CLONE_SPEC.md` + `ANALYSIS.md` §11.
**Rule:** same as before — tracker is source of truth; update after every work block; no production deploy without explicit owner approval.
**Boundary (user, 2026-11-12):** ALL new work lands HERE in `D:\Dev\ERPSoftware` — never in `C:\Dev\ERP_System` (the wholesale repo stays untouched, including its tracked docs like `AGENTS.md`/`LEGACY_MEGAPLAN_TRACKER.md`). Merge-back to wholesale is a separate explicit decision, only after approval + finished work.
**Local-only mode (user, 2026-11-12):** NO commits, NO pushes, NO git ops, NO Cloud Run deploys, NO Neon/prod changes. Plain file edits + local dev server only. Exception: the `retail` Neon branch stays as the simulation DB (isolated prod copy — app can't boot without it). Going live with any of this = separate explicit decision later.
**⚠️ DELIVERY TODO — RE-ENABLE IAP (user, 2026-11-14):** Cloud IAP was **DISABLED** on prod `erp-system` (europe-west1, erp-syste) so dev testing works from any device/browser without Google sign-in. App is now public at `erp-system-rckq4hfmga-ew.a.run.app` (PIN pad is the only gate). **Re-enable at delivery:** `gcloud run services update erp-system --region europe-west1 --project erp-syste --iap` (invoker-iam-disabled stays `true`; authorized member was `davidsmithny01@gmail.com` `iap.httpsResourceAccessor`, owner's Gmail still pending — see AGENTS.md).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · blocked `(!)` · legacy ref = legacy route/table

---

## ⏸ RESUME STATE (saved 2026-11-15)

**Where we are: PHASE 2 COMPLETE + M1 + M2 COMPLETE (all live-verified).** Next pending user decision: **M3** barcode EAN13 + label print (needs shop label-printer model — OPEN DECISION) **vs D1 pilot** (legacy data pull — user asked side question, answer = YES possible, pilot offered, awaiting choice).

**Legacy data access CONFIRMED (2026-11-15):** full shop DB is on this machine — `D:\Montassir ERP Software\Apps` AMPPS bundle with `mysql\bin\mysqld.exe` + `mysqldump.exe`; datadir `mysql\data\Bestway_BMM` = ~113 InnoDB tables (.frm/.ibd, intact ibdata/ib_logfile). MySQL NOT currently running — boot via `mysqld.exe --datadir` then dump. Root creds in `www\Bestway\config\_incl_connection.php` (local dev only — never write to repo/commit). Mapping: `SCHEMA_MAP.md` covers all tables; `clientproduits` → `customer_product_prices` = 1:1 post-M1. Caveats: ID remap (sku/name+phone join keys), DH→cents, ~110 open credit tickets → opening receivable docs, latin1/utf8 normalize, hosted `bashaniadmin` DB needs explicit owner auth. Phase 4 D1–D3 already plans this; a **pilot dump of produits+client+clientproduits was offered** — awaiting user pick (M3 vs pilot).

**M2 live-verified (2026-11-15, :3001):** client quick-create at till already existed (`CustomerSelect` "Créer la fiche sans quitter la caisse" → `Client POS Test M2` #297 created + auto-selected, header shows fiche). Product quick-create NEW: `src/components/pos/ProductCreateModal.tsx` via PackagePlus icon in the product search row → réf/désignation/prix vente+achat/stock/barcode/marque/catégorie (datalist, new allowed) → `saveProduct` → prepended to grid + `ProductQuickAddModal` opens immediately for qty → cart line. Verified réf **9001 "produit test m2" 25 DH stock 3** → tile + cart line 25 DH. Stock-0 note: created-but-invisible (sellableProducts filter). Zero new console errors, tsc+eslint clean.

**M1 live-verified (2026-11-15, :3001):** `/clients` → ClientDrawer "Tarifs" → `CustomerPricesModal` (search/add/edit/save/remove overrides). Created `Client Tarif Test` + override on 1020: `prix_fixe 35 DH` + `designation_fixe PLAQ. FREIN C50 SPECIAL` (catalog 40). POS: client selected → tile shows `35,00 DH★` + custom designation; QuickAdd modal price 35 (struck 40) + sous-total 35; cart line 35 DH custom label; **sale validated espèce → InvoiceModal direct, NO PRIX_HORS_CATALOGUE** (resolved price accepted by off-catalog guard); revert to comptoir → tile back to `plaquette frein c50` 40 DH. Bug found+fixed: QuickAdd sous-total used catalog price (`salePriceRetailCents`) not resolved `priceHtCents`.

- `src/db/schema.ts` +`customerProductPrices` (customer_id, product_id, prix_fixe_ht_cents?, designation_fixe?, unique customer+product) — migration **0037** applied to retail branch
- `src/lib/pricing.ts` (new): `resolvePrice` override → `customers.default_price_level_id`→`product_prices` → catalog; `acceptedCatalogPrices` for guard
- `src/lib/actions/pricing.ts` (new): `getCustomerPricing`/`searchProductsForPricing`/`upsertCustomerPrice`/`removeCustomerPrice` — all `assertAuthenticated`
- `src/lib/actions/sales.ts`: off-catalog guard accepts resolved client prices w/o overrideReason (negotiated prices still audited)
- `src/app/pos/page.tsx`: `pricingOverrides` map, resolve on addToCart/quick-add/scan, cart reprices on client change, restores catalog on revert; `ProductGrid` gets pricing prop (tile ★ + resolved price + custom designation); `ProductQuickAddModal` gets `displayName`/`priceHtCents` props
- `src/components/customers/CustomerPricesModal.tsx` (new) + `ClientDrawer.tsx` "Tarifs" button + `clients/page.tsx` wiring
- tsc + eslint clean on touched files (pre-existing `<img>` warnings only)
- M2: `src/components/pos/ProductCreateModal.tsx` (new — till product create), `pos/page.tsx` (+PackagePlus search btn, `isProductCreateOpen`, onCreated → prepend grid + open QuickAdd)
- **Test data on retail branch (cleanup later):** client `Client Tarif Test` + `customer_product_prices` override (1020 → 35 DH/`PLAQ. FREIN C50 SPECIAL`), client #297 `Client POS Test M2`, product `9001` (25 DH, stock 3), open journée w/ 350 DH float + M1 test sale 35 DH + M2 test sale(s)

**Was (saved 2026-11-14): PHASE 2 COMPLETE — C1–C8 all live-verified end-to-end.**

**Full till lifecycle live-verified (2026-11-14, :3001):** open 550 DH by coupures (2×200+100+50) → sale 40 DH espèces → dépense 10 DH "Café caisse test" → stats exact (CA net 40, tiroir 580 = 550+40−10, dépense listée) → Situation + Règlement modals open → clôture with declared 575 → écart −5,00 DH recorded + close ticket (Imprimer/Terminer) → **gate re-arms automatically**. Zero console errors.

- ✅ Wired into `page.tsx`: `journee`+`journeeChecked` state → `getOpenTillDay` on mount → blocking `TillGateModal` → "Caisse" dropdown in header (Journée — chiffres / Dépense caisse / Règlement client / Situation clients / Clôturer) → `onClosed` sets journee=null → gate re-arms
- ✅ **C7 plafond**: `users.plafond_cents` (migration **0036** applied), plafond field in UsersSection (create + inline edit), `getTillStats` returns actor `plafondCents`, warning banners in TillStatsModal + CloseDayModal when cashDrawer > plafond, post-sale drawer re-check after Espèces leg → warn. Warning-level (not blocking) per legacy `employe.plafond` semantics
- ✅ **Fix — `"use server"` export bug**: `TILL_DECLARED_METHODS` const moved out of `till.ts` into new `src/lib/till-constants.ts` (non-server module); `TillModals.tsx` imports from there. A `"use server"` file may only export async fns — same class of bug as the earlier `OPERATIONS_LOG_LABELS` one in AGENTS.md
- tsc + eslint clean on all touched files

**POS UI tweaks live-verified same session:** client/vendeur bar moved above panier (2/3–1/3, h-12, bold), AppShell padding `p-4 md:p-6`→`p-2`, Brut/Net HT bold, qty capped at **remaining** stock (modal shows "Déjà X — reste Y" / blocks at 100%, scan-add + cart ± + numpad Qté all clamped, "stock max atteint" warn).

Earlier: **bugfix photo upload rewritten** — browser→R2 presigned PUT was blocked by bucket CORS (allows `localhost:3000` + Cloud Run origins only; clone runs on :3001 → preflight 403 → `photo_url` stayed NULL). Replaced with **server-side upload proxy**: `uploadPhoto(FormData)` Server Action → `uploadObject()` in `storage.ts` signs+PUTs via aws4fetch server-side — no browser CORS at all, works on any port/domain. `createPresignedUpload` kept for verify scripts. `bodySizeLimit: "8mb"` added under `experimental.serverActions`. **Live-verified**: /stock → edit 1020 → PNG injected → WebP compressed → R2 PUT 200 → preview → save → `photo_url` persisted + serves 200 + renders in catalogue view. Zero console errors, tsc+eslint clean.

**New/changed uncommitted files (all intentional — no-git rule):**
- `src/app/pos/page.tsx` — rebuilt: cart table + selectable lines + numpad ops + split pay + scan-first + park/recall + hides stock-0 products
- `src/components/pos/CartTable.tsx` (new), `NumpadPanel.tsx` (new), `SplitPaymentModal.tsx` (new), `LineActionModal.tsx` (new)
- R6: `TicketPrintView.tsx` (new, thermal 72mm `@page ticket`), `TicketsModal.tsx` (new, day list + reprint + cancel + Retour), `InvoiceModal.tsx` (Ticket button), `globals.css` (thermal @page)
- R7: `ReturnModal.tsx` (new, per-line qty → `createAvoir` RETOUR), `sales-documents.ts` (avoir lineHt prorated net-of-line-discount), `sales.ts` (`getDayTickets` + AVOIR/DEVIS)
- Phase 2 (done): `src/lib/actions/till.ts` (new), `src/components/pos/TillModals.tsx` (new, 6 modals), `src/lib/till-constants.ts` (new — shared consts, kept out of the `"use server"` file), `schema.ts` (+`cashier_days`, +`expenses.journee_id`, +`users.plafond_cents`), migrations `0035_damp_ultimates.sql` + `0036_chunky_payback.sql`
- C7: `src/lib/actions/users.ts` (+plafond in load/save), `src/lib/action-validation.ts` (+`plafondCents` in saveUserSchema), `src/components/settings/UsersSection.tsx` (+plafond field create/edit)
- POS UI (2026-11-14): `page.tsx` (client/vendeur bar above panier 2/3–1/3, remaining-stock caps in addToCart/scan/Qté, till wiring), `AppShell.tsx` (`p-2`), `NumpadPanel.tsx` (Brut/Net HT bold), `ProductQuickAddModal.tsx` (remaining-stock cap + in-cart banner), `UsersSection.tsx` (plafond)
- Quick-pay per method added (2026-11-13): Chèque/TPE/Effet buttons in NumpadPanel → modal opens with leg prefilled at total (`initialMethod` prop); effet legs get N° + échéance fields; chèque/effet keep fiche-client gate. Verified live: **BL-2026-00104 PAYE 40 DH CARTE_BANCAIRE ref TPE-445566** in sales_tenders; chèque opens w/ n°+banque required + customer block.
- `CartSidebar.tsx` + `PaymentModal.tsx` DELETED (replaced)
- `src/lib/storage.ts` — refactored: `uploadObject()` server-side PUT (new), `createPresignedUpload` kept, shared `validateImageUpload`/`r2Client`/`buildKey`, BusinessError messages
- `src/lib/actions/media.ts` — `getPhotoUploadUrl` → `uploadPhoto(FormData)` ActionResult
- `src/components/stock/ProductModal.tsx` + `src/components/expenses/ExpenseModal.tsx` — FormData→`uploadPhoto` (unwrap)
- `next.config.ts` — `bodySizeLimit: "8mb"` added
- Earlier R5 files unchanged: `schema.ts`, `sales.ts`, `shared.ts`, `action-validation.ts`, `money.ts`, migration 0033

**Env:** dev server on **:3001** (`:3000` was taken — check `netstat` before assuming) · retail branch `br-dry-feather-b134yukf` · PIN `2636` (PIN-pad login, click digits) · IronBee `execute` needs `code` param

**Live-verified on retail branch:** scan-add `1020` → Rem% −5 → R.For 35 (motif) → split Espèces 20 (reçu 50 → rendu 30) + CB 13.25 réf TPE-998877 → **BL-2026-00102 PAYE** → 2 `sales_tenders` rows + line `price_forced`/`discount_percent`. Then OFFERT → 0-DH quick-cash → **BL-2026-00103 PAYE** + `PRIX_FIXE` audit "1 article(s) offert(s)". Edge bugs found+fixed: 0-amount leg zod reject → empty tenders + ESPECES fallback. tsc+eslint clean.

---

## PHASE 0 — CLONE & BASELINE
- [x] P0.1 git clone `C:\Dev\ERP_System` → `D:\Dev\ERPSoftware` (all branches, HEAD @ c102f00)
- [x] P0.2 copy `.env.local`, `AGENTS.md` mods, `New_logo.png`, `SECURITY_AUDIT_2026-11-07.md`
- [x] P0.3 `npm ci` in `erp-inventory/` — 415 pkgs, ~3min
- [x] P0.4 verify `npm run dev` boots + login works against DB — `/login` 200 (19.5KB), `/` 307→login, ready 1.7s
- [x] P0.5 **DECISION (user, 2026-11-12): each business line gets its OWN database** → retail gets a dedicated Neon branch; wholesale keeps prod DB; quads/buggys gets a third later
  - [x] P0.5a create Neon branch `retail` (copy-on-write incl. prod data so login/demo works) — `br-dry-feather-b134yukf`, endpoint `ep-restless-silence-b1vfmgz3`, parent `br-fancy-block-b13o37dw` (prod), created 2026-11-12
  - [x] P0.5b point clone `.env.local` at retail branch + run pending migrations — DATABASE_URL/UNPOOLED → `ep-restless-silence-b1vfmgz3` (new role password from branch conn string; prod branch password differs)
- [x] P0.6 run migrations on the retail DB — `npm run db:migrate` OK (2026-11-12); branch verified: 1 user, 428 products copied from prod
- [ ] P0.7 rename/branding pass: app name + logo slot for the retail business
- [ ] P0.8 first commit "clone baseline" on new branch `feat/retail-pos`

## PHASE 1 — POS SCREEN (the cash-register core)  · legacy `?page=posixmag`
Clone `posix_mag.php` + `posix_controller.php` behavior; fixes built in.

**GAP AUDIT (2026-11-12, done):** backend spine already strong — atomic tx, idempotency key, gapless sequences, off-catalog price REFUSAL + `PRIX_FIXE` audit (forced-price guard exists server-side!), 7/9 tender codes in enum, `commercialId`/`livreurId` snapshot, acompte FIFO auto-apply, barcode col + search, DEVIS ready. **Verdict: extend backend, rebuild screen.** Real gaps: `tenders[]` split payments (single `paymentMethod` today → need `sales_tenders` table + N payment rows + change), line-level fields (label/offert/per-line remise — line selection + forced-price UI missing), touch layout, scan-first input, parked_carts, thermal ticket, POS returns, till (Phase 2).
- [x] R1 **Layout**: cart table (sélection) + numpad cluster + panneau encaissement droit — `page.tsx` rebuilt, `CartTable`/`NumpadPanel` (2026-11-13). Reste : left dock icons + stats jour (Phase 2 C8).
- [x] R2 **Product input**: scan-first — Enter sur réf/SKU exact ou EAN13 ajoute qté 1 direct (recherche fraîche `getProducts`), sinon filtre · done 2026-11-13
- [x] R3 **Line ops on selected row**: Qté, Rem% (cap 10 client+serveur), **R.For** (TTC + motif obligatoire → `priceForced` + audit `PRIX_FIXE`), **Offert** (⇔ prix 0 + overrideReason auto), **Libellé** (`customLabel`), Sup.Ligne, Vider panier · done 2026-11-13. Park = `Attente`/`Rappel` server-side (R10 ✓)
- [x] R4 **Payment modal (split)**: `SplitPaymentModal` — jambes illimitées parmi 8 méthodes (Espèce+reçu→rendu, CB, Chèque num/banque/payee/dates, Virement, Versement, Effet LCN, Bon réduction, Avoir), reliquat→crédit (fiche exigée), dépassement bloqué, plafond crédit warn · done 2026-11-13. Acompte-consume reste via acompte FIFO serveur (pas de jambe dédiée).
- [x] R5 **Sale POST**: one atomic transaction (doc+lines+stock↓+tenders+doc-number) · structured JSON (replaces `;;`/`|||`) · idempotency key · server-authoritative price/tax/qty · legacy `ajaxPosixMagAdd`
  - done 2026-11-12: `sales_tenders` table + `tenders[]` input (8 methods incl. BON_REDUCTION/AVOIR), per-leg `customer_payments`, `cash_received_cents`→derived rendu (no legacy RENDU row), `sales_lines`+`unit_price_ttc_cents`/`custom_label`/`is_free`/`price_forced`, per-line `discountPercent` in `calculateDocumentTotals`, line-discount server cap 10%, TTC→HT derive + HT↔TTC coherence ±2c, OFFERT⇔price 0, zod+tenders validation (sum≤TTC, espèce received≥part), fallback single-leg for old callers. Migration 0033 on retail branch. **Live-verified**: BL-2026-00101 cash sale → sales_tenders row + PAYE doc on retail branch. tsc+eslint clean.
- [x] R6 **Ticket print** (thermal 80mm) + day-tickets list + reprint + full cancel · legacy `ticketPosixD`, `PrintBLTTC`, `annuleBLPosix`
  - done 2026-11-13: `getDayTickets(fromIso)` (BL/FACTURE/BC today + lines + tenders) · `TicketPrintView.tsx` (72mm monospace ticket — company header, lines w/ customLabel/OFFERT/remise, remises lignes+globale, per-leg tenders + reçu/rendu + réfs + échéances, crédit restant, footerText; `@page ticket` named 80mm page) · `TicketsModal.tsx` (heure/n°/client/modes/total/statut + réimprimer + annuler BL|BC via `cancelDocument`, total journée) · InvoiceModal + `Ticket`/`A4` buttons · POS header `Tickets` button · globals.css `@page ticket`. **Live-verified**: 3 tickets du jour listés (Esp/TPE/Esp+TPE) + ticket BL-102 rendu exact (35 −5%→33.25, Esp 20/reçu 50/rendu 30, TPE réf) + BL-103→ANNULE + cancelled_at.
- [x] R7 **Returns**: partial return from ticket → AVOIR + restock · legacy `ajaxPosixRetVenteAdd`, `ModalRetour`
  - done 2026-11-13: `ReturnModal.tsx` (per-line qty pickers → `createAvoir` RETOUR → success view + thermal ticket print) · `TicketsModal` Retour button per BL/FACTURE + AVOIR/DEVIS listed + day total = net (sales − avoirs) · `TicketPrintView` labels AVOIR/DEVIS · **bugfix in `createAvoir`**: line refund now prorates net-of-line-discount (was `unitPrice × qty` → over-refunded discounted lines). **Live-verified**: Retour sur BL-2026-00104 → AV-2026-00001 40 DH VALIDE, `AVOIR_RETOUR` movement +1 @ coût 3000, stock 1020: 997→998, audit `AVOIR_EMIS`, day total 73,25→33,25, ticket "AVOIR / RETOUR" prints.
- [x] R8 **Devis** from cart · legacy `data-choix=devis`
  - done 2026-11-13: `DEVIS` in `POS_DOC_TYPES` · `isDevis` hides pay buttons → "Émettre le devis" direct (ESPECES/0 payé, statut VALIDE, hors stock) · TicketPrintView/InvoiceModal masquent règlement · DEVIS annulable + listé. **Live-verified**: DV-2026-00001 80 DH VALIDE, 0 tenders, 0 stock_moves, ticket sans règlement.
- [x] R9 **Vendeur attribution** per sale · legacy `employe_comsecteurid` — commission/objectif reporting = Phase 3 (commercial dashboard)
  - done 2026-11-13: `getStaff("COMMERCIAL")` → select vendeur sous la carte client (sticky session) → `commercialId` sur `createSalesDocument` → `commercial_id/name` snapshot sur le doc + "Vendeur : X" sur le ticket. **Live-verified**: BL-2026-00105 KARIM, 23,33 DH, ticket affiche vendeur.
- [x] R10 **Mise en attente** (park/recall cart w/ client+vendeur) · legacy `ajax_setMiseEnAttente.php`
  - done 2026-11-13: `parked_carts` table (migration 0034 — ligne métier, docType, client, vendeur, payload jsonb, actor) · `src/lib/actions/parked-carts.ts` (parkPosCart / listParkedCarts / recallParkedCart SELECT FOR UPDATE+delete atomique / dropParkedCart) · page.tsx basculé localStorage → serveur (multi-poste). **Live-verified**: Attente→row+PARK_TICKET, Rappel→panier restauré+RECALL_TICKET, abandon→DROP_TICKET.
- [x] R11 **Abandoned-cart audit**: cancelled carts archived (our audit log row, not a duplicate table) · legacy `ajaxPosixTicketAnnulerAdd`/`mouvement_err`
  - done avec R10 : audit_logs PARK_TICKET / RECALL_TICKET / DROP_TICKET avec actor + détails. **Vérifié** : rows gerant horodatées.

## PHASE 2 — CAISSE / TILL MANAGEMENT
- [x] C1 **Journée open**: wired — gate blocks POS until `openTillDay` (journee state + mount check) · legacy `journee_start` — live-verified
- [x] C2 **Fond de caisse**: 10 coupures persistées en `float_denominations` jsonb (vs legacy cosmétique) — live-verified 550 DH · legacy `#ModalFondCaisse`
- [x] C3 **Clôture journée**: `closeTillDay` (FOR UPDATE, snapshots déclaré+théorique, écart audit) + CloseDayModal — live-verified écart −5 DH + close ticket + gate re-arms · legacy `cloture_journee`
- [x] C4 **Dépense at till**: `recordTillExpense` + `expenses.journee_id` — live-verified 10 DH appears in stats drawer math · legacy `caisse_dep`
- [x] C5 **Règlement crédits**: TillSettlementModal → `recordCustomerPayment` (FIFO spread) — opens from Caisse menu, live-verified · legacy `#ModalReglement`
- [x] C6 **Situation clients**: TillSituationModal → `getCustomerAging` — opens from Caisse menu, live-verified · legacy `#ModalSituationClt`
- [x] C7 **Session lock** (LockScreen ✓) + **plafond/liquidité**: `users.plafond_cents` (mig 0036) + stats exposure + warn banners + post-sale check — warning-level per legacy semantics · legacy `employe.plafond`
- [x] C8 **Live stats**: `getTillStats` + TillStatsModal ("Journée — chiffres" menu) — live-verified CA 40 / tiroir 580 / dépense −10 · per-mode encaissé + unpaid list

## PHASE 3 — RETAIL COMMERCIAL FEATURES
- [x] M1 **Per-client price + custom designation** (`clientproduits`-equivalent): `customer_product_prices` (mig 0037) + resolver `src/lib/pricing.ts` (override → default_price_level → catalog) + `actions/pricing.ts` CRUD + `CustomerPricesModal` via "Tarifs" btn in ClientDrawer + POS: tile shows resolved price+★+designation, QuickAdd/grid/scan resolved, cart reprices on client change, sales off-catalog guard accepts resolved prices — **live-verified**: override 35 DH + `PLAQ. FREIN C50 SPECIAL` on `Client Tarif Test`/1020 → tile 35★, cart line 35, sale validated no PRIX_HORS_CATALOGUE, revert→catalog 40. Tier pricing (demi-gros/gros via price_levels) wired through resolver, UI mgmt exists in /stock prices.
- [x] M2 **Quick-add client & product** at till: client create existed (`CustomerSelect` "Créer la fiche" → saveCustomer + auto-select, live-verified `Client POS Test M2` #297); product create = new `ProductCreateModal` (réf/désignation/prix vente+achat/stock/barcode/marque/catégorie) via PackagePlus btn in search row → `saveProduct` → prepended to grid + QuickAdd opens — **live-verified** réf 9001 25 DH stock 3 → cart line. legacy `#responsive_clt`, `produitAddPosix`
- [ ] M3 **Barcode EAN13 generation + label print** · legacy `?page=genecb` (secure endpoint, no hardcoded creds)
- [ ] M4 **Catalogue photo** browse · legacy `?page=produitCatalogue`
- [ ] M5 **Inventory at till** per warehouse incl. `inv_zero` · legacy `#INVENTAIRE`/`AjaxInventaireDepotAdd`
- [ ] M6 **Promo engine** (buy X get Y gift, `ajaxTestActionMarketing`) — LATER
- [ ] M7 Samples (échantillons), consignation/chevalet — LATER (other doc types)

## PHASE 4 — DATA MIGRATION (retail shop)
- [ ] D1 export products/clients/stock/open-credits from legacy DB (format: CSV/SQL via mysqldump :3307 — decide scope w/ owner)
- [ ] D2 import + reconcile (products w/ tiers+barcodes+stock, clients w/ `raisonsociale`, **the ~110 open credit tickets → opening receivables**)
- [ ] D3 doc-counter init (BL_/RET_/DV_ prefixes, no collisions)

## PHASE 5 — OFFLINE RESILIENCE (replaces local-server model)
- [ ] O1 IndexedDB outbox: sale queued offline → POST on reconnect w/ client UUID (idempotent)
- [ ] O2 temp `OFFLINE-*` ref → definitive server ref on sync; negative-stock flag path
- [ ] O3 "last sync" indicator per till + owner-visible sync status

## PHASE 6 — MULTI-BUSINESS ROLLOUT
- [ ] B1 **Wholesale** = current prod ERP (done)
- [ ] B2 **Retail** = this clone (phases 1–5)
- [ ] B3 **Quads/Buggys** = variant — rental/return docs (`location`, damage/km return), fleet-as-"stock"; needs gap analysis vs legacy `forfait`/chevalet/consignation
- [ ] B4 **Owner remote dashboard**: live sales per business/till — the feature legacy CANNOT do (local-only architecture). Reuse `/comptabilite` + day panels + per-business switcher.

## FIXES WE APPLY EVERYWHERE (vs legacy bugs — see spec §B2/§C)
1. Atomic transactions (no partial writes) · 2. Unique doc numbers via DB sequence · 3. Server-authoritative price/tax/discount/stock · 4. Structured JSON payloads (no `;;`) · 5. Real auth + server-side permission checks (forced price, discounts, close) · 6. Per-line tax (no hardcoded /1.2) · 7. Credit flag recomputed from tenders · 8. Ledgered change/discount rows kept but as proper tender/refund records

## OPEN DECISIONS
- Retail DB: separate Neon branch (default) vs shared prod — **P0.5**
- Barcode label printer model at the shop? (affects M3)
- Offline scope: full cart offline vs sale-finalization only (O1 scope decision before Phase 5)
- Legacy data scope: full import vs opening-state only (D1)

## LOG
- 2026-11-12 — repo cloned to `D:\Dev\ERPSoftware` @ c102f00; env copied; npm ci done; dev server verified (/login 200, auth 307); baseline commit `chore: clone baseline + retail megaplan tracker`; tracker created from `POS_CLONE_SPEC.md` (live-verified) + `ANALYSIS.md` §11
- 2026-11-12 — retail Neon branch + env wire + migrations (P0.5/P0.6); preview Server Action fix; local-only mode set
- 2026-11-12 — POS gap audit vs spec → verdict "extend backend, rebuild screen"; **R5 shipped** (sales_tenders + tenders[] + line metadata, migration 0033, live-verified BL-2026-00101); progress paused before R1/R3/R4 screen rebuild — see RESUME STATE
- 2026-11-13 — **R1+R2+R3+R4 shipped**: POS screen rebuilt (CartTable sélection, NumpadPanel Qté/R.For/Rem%/Offert/Libellé/Attente/Rappel/Vider, SplitPaymentModal 8 méthodes, scan-first Enter). Live: split Espèces+CB BL-2026-00102 → 2 tender rows; OFFERT BL-2026-00103 0 DH → PRIX_FIXE audit. Edge fix: vente 0 DH → tenders vide + ESPECES (zod ≥1 item). CartSidebar+PaymentModal supprimés. Dev server :3001.
- 2026-11-14 — **IAP DISABLED on prod `erp-system`** (user request, dev phase — blocked testing from devices without `davidsmithny01@gmail.com`). Verified `/login` 200 public. MUST re-enable at delivery — command in header ⚠️ DELIVERY TODO.
- 2026-11-15 — **M1 shipped + live-verified**: `customer_product_prices` (mig 0037), resolver override→level→catalog, pricing CRUD actions, CustomerPricesModal ("Tarifs" in ClientDrawer), POS resolved price+designation+★ + cart reprice on client change, off-catalog guard accepts resolved prices. Verified: Client Tarif Test/1020 35 DH + PLAQ. FREIN C50 SPECIAL → sale validated, revert → 40 DH catalog. Bugfix: QuickAdd sous-total resolved price.
- 2026-11-15 — **M2 shipped + live-verified**: `ProductCreateModal` (new) + PackagePlus btn in POS search row → `saveProduct` → grid + QuickAdd; client quick-create confirmed working (Client POS Test M2 #297). Test data on retail branch: product 9001, client #297.
- 2026-11-15 — save-for-resume: M1+M2 done; legacy DB confirmed extractable on-machine (AMPPS mysqld at `D:\Montassir ERP Software\Apps`); awaiting user pick: M3 (needs label-printer model) vs D1 pilot dump.
- 2026-11-16 — **D1+D2 staging import DONE + reconciled**: `erp-inventory/scripts/migration/import-legacy.mjs` (mysql2 → Neon, `--apply --wipe`, idempotent via TRUNCATE + `legacy_map`). Staging branch `br-mute-moon-b1xywfd6` (off retail, project twilight-pine-29350562) holds FULL verified import: 854 produits · 67 clients · 844 docs (BL_100..BL_943 verbatim, 21 ANNULE, dates preserved) · 2 303 lines · 557 tenders + 195 règlements · 197 dépenses · 11 staff · 7 catégories · stock 37 777 (stock.qte truth). Σ docs = **879 685,52 DH exact**. Client debt = 153 127 DH = legacy-UI 152 647 + flagged BL_524 ghost (480). Semantics decoded: `montant_credit`=stale cache (UI uses total−payments); REMISE GLOBAL legs=real post-total discount counted toward settlement; REMISE LIGNE legs=shadows (inside prix_fixe); etat=8 legs≠payment; etat=35 legs=achat shadows; orphan line #2418 (BL_944 abandoned ticket) → legacy_map. Sequences: BL next=944 (id_tik). **DECIDED: new docs keep `{prefix}{year}-{seq}` → `BL-2026-00944`**. Anomalies only: BL_257 (no legs→PAYE), BL_524 (kept owed, flagged). **USER RULE: NO retail/prod mutation — retail branch `br-dry-feather-b134yukf` UNTOUCHED; import to live ONLY after user creates a Google Cloud Run project for this ERP.** Next: user creates GCP project → retail reset + identical import + reconcile → UI verify.
- 2026-11-19 — **Staging import v2 + UI verification DONE**: fixed app-model mismatches (total_ttc=net-of-remise per-doc via `remiseEff=min(remiseG, mvt-settled)`; `customer_payments` now gets EVERY leg like app's "Règlement à la vente" rows — 751 rows). Dashboard/règlements verified live on :3001 w/ `.env.local`→staging (backup `.env.local.retail-backup`): **Créances 150 262 DH / 17 clients** = legacy ledger netting (doc-list view 152 647 + BL_524 ghost 480 − double-paid docs BL_320/755/898 2 950 + comptoir gap 85). Real data confirmed in UI: BL_943 RABIAA BASSIM crédit, all 16 debtors + comptoir, Grossiste/Détail tags, dates verbatim. Legacy data quirks preserved (not bugs): BL_524 owed, 3 docs paid twice, client "Bashin Montassir" has a URL in his contact field. Still NO prod — retail branch untouched, awaiting GCP project.
