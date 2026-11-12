# ERPSoftware — MegaPlan & Feature Tracker
**Clone of** `C:\Dev\ERP_System` (BM Motors ERP) @ commit `c102f00` (includes parked payment-terms work)
**Purpose:** Retail-shop ERP version ("Détail"), cloned from the wholesale codebase, targeting feature parity + improvements over the legacy Bestway/POSIX system analysed in `Legacy_Analysis\POS_CLONE_SPEC.md` + `ANALYSIS.md` §11.
**Rule:** same as before — tracker is source of truth; update after every work block; no production deploy without explicit owner approval.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · blocked `(!)` · legacy ref = legacy route/table

---

## PHASE 0 — CLONE & BASELINE
- [x] P0.1 git clone `C:\Dev\ERP_System` → `D:\Dev\ERPSoftware` (all branches, HEAD @ c102f00)
- [x] P0.2 copy `.env.local`, `AGENTS.md` mods, `New_logo.png`, `SECURITY_AUDIT_2026-11-07.md`
- [~] P0.3 `npm ci` in `erp-inventory/` — RUNNING (bg shell a84966)
- [ ] P0.4 verify `npm run dev` boots + login works against DB
- [ ] P0.5 **DECISION:** retail DB = new Neon branch/project vs shared prod DB → default: **separate Neon branch** (retail data isolated from wholesale)
- [ ] P0.6 run migrations on the retail DB (incl. `0032_payment_terms` — feature branch already merged in this clone's HEAD)
- [ ] P0.7 rename/branding pass: app name + logo slot for the retail business
- [ ] P0.8 first commit "clone baseline" on new branch `feat/retail-pos`

## PHASE 1 — POS SCREEN (the cash-register core)  · legacy `?page=posixmag`
Clone `posix_mag.php` + `posix_controller.php` behavior; fixes built in.
- [ ] R1 **Layout**: left big-button column (Annuler/Suppr ligne/Valider/Espèce/CB/Crédit/Retour/Devis), cart grid w/ category group headers, right dock icons, numpad cluster, live right panels — rebuild `src/app/pos/page.tsx`
- [ ] R2 **Product input**: `#searchCB`-style barcode field w/ 12-digit→id / 13-digit→barcode rules + select2 search + category/photo browse · legacy `ajaxProdGetProductByCB`
- [ ] R3 **Line ops on selected row**: qty, line % remise, **forced TTC price (R.For)**, **offert (free)**, **line rename**, park ticket · legacy `btn_even_*`
  - ⭐ fix: server-side validation — forced price needs permission + floor (no negative/zero w/o manager); % cap enforced server-side; price increases flagged in audit
- [ ] R4 **Payment modal (split)**: Espèce(+rendu display), CB+num, **3 chèques** (num/date encaissement/payee), Virement+num, Bon réduction (verify), **Avoir-as-tender** (verify), **Acompte consume**, Crédit (requires named client ≠ comptoir) · legacy `#paiementModal`
- [ ] R5 **Sale POST**: one atomic transaction (doc+lines+stock↓+tenders+doc-number) · structured JSON (replaces `;;`/`|||`) · idempotency key · server-authoritative price/tax/qty · legacy `ajaxPosixMagAdd`
- [ ] R6 **Ticket print** (thermal 50-80mm) + day-tickets list + reprint + full cancel (soft `etat`, audit row) · legacy `ticketPosixD`, `PrintBLTTC`, `annuleBLPosix`
- [ ] R7 **Returns**: cart-as-return + partial return from ticket · legacy `ajaxPosixRetVenteAdd`, `ModalRetour`
- [ ] R8 **Devis** from cart · legacy `data-choix=devis`
- [ ] R9 **Vendeur attribution** per sale + commission/objective link · legacy `employe_comsecteurid`, `paiement.id_objectif`
- [ ] R10 **Mise en attente** (park/recall cart w/ client+vendeur) · legacy `ajax_setMiseEnAttente.php`
- [ ] R11 **Abandoned-cart audit**: cancelled carts archived (our audit log row, not a duplicate table) · legacy `ajaxPosixTicketAnnulerAdd`/`mouvement_err`

## PHASE 2 — CAISSE / TILL MANAGEMENT
- [ ] C1 **Journée open**: cashier-only float entry at POS start; "journée déjà ouverte" detection per till · legacy `journee_start`/`ajaxGetJourneeInfo`/`caisse_start`
- [ ] C2 **Fond de caisse**: 10-denomination bill/coin counter — ⭐ actually persisted (legacy modal was cosmetic-only) · legacy `#ModalFondCaisse` + `paiement type=53`
- [ ] C3 **Clôture journée**: theoretical vs declared per mode (Esp/CB/Chq/Eff), variance, observation, "ventes non réglées" list, ticket+A4 print — **cashier-only** · legacy `clotureJournee*`/`ajaxEncCaisse`/`cloture_journee`/`tresorerie`
- [ ] C4 **Dépense at till**: category select, fournisseur, pièce#, mode, caisse_dep (till vs main) · legacy `ajaxBpDepenses`/`achat` (we'll use a clean `expense` record, not `achat` abuse)
- [ ] C5 **Règlement crédits**: open-debt doc picker per client, amount+mode+date+piece, spread across docs, receipt print · legacy `#ModalReglement`/`ajaxBpNewReglementCltPosix`
- [ ] C6 **Situation clients** panel at till · legacy `#ModalSituationClt`
- [ ] C7 **Session lock** (already exists — verify) + **cashier plafond/liquidité** enforcement · legacy `employe.plafond`, error `t=10`
- [ ] C8 **Right-panel live stats**: day sales detail, CA by mode, expenses, returns, store objective · legacy `posixmag` right column

## PHASE 3 — RETAIL COMMERCIAL FEATURES
- [ ] M1 **Per-client price + custom designation** (`clientproduits`-equivalent) + tier pricing public/demi-grossiste/grossiste on client.type — server-side price resolver
- [ ] M2 **Quick-add client & product** at till · legacy `#responsive_clt`, `produitAddPosix`
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
- 2026-11-12 — repo cloned to `D:\Dev\ERPSoftware` @ c102f00; env copied; npm ci running; tracker created from `POS_CLONE_SPEC.md` (live-verified) + `ANALYSIS.md` §11
