# Legacy Megaplan Tracker — BestWay → BM Motors ERP (phase 2)

Continuation of `LEGACY_GAPS_TRACKER.md` (G1–G10 done). Source: `LEGACY_FEATURE_AUDIT.md` (2026-11-03 re-crawl, 42 routes).
Each item is built + verified (IronBee, tsc/build) + committed + deployed **one at a time, with user go-ahead**.

Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏭️ de-scoped

---

## Phase A — Clients (user-flagged)

### ✅ G11 — Page `/clients` dédiée
**Legacy:** `clients` + `clientEdit` + `CltsPosix` + `EtatVenteCltPosix`.
- [x] Route `/clients` + nav entry (between Ventes and Règlements)
- [x] Paginated (25/p) searchable list: `matchTokens`, colonnes Client(badges)|Contact|Commercial|Solde dû|Impayés + "Avec solde dû" toggle + aging badge J+
- [x] `ClientDrawer`: header fiche + KPIs (facturé/réglé/dû) + onglets Documents/Règlements/Relevé + Encaisser→PaymentModal, Relevé A4→CustomerStatementModal, Modifier→CustomerModal
- [x] Summary cards + commercial filter + Import CSV reuse
- [x] **Bug trouvé+corrigé:** `CustomerModal` useState init-only → fiche vide en édition (aussi latent sur /reglements); ajout reset-on-open `useEffect`
- [x] **Verified dev:** edit Garage Agent Test → staff=1/ROI/30j persistés; drawer refetch via refreshKey
- Effort: M · Deps: none

### ✅ G20 — Champs fiche client manquants (livré avec G11)
**Legacy:** collaborateur assigné, classification risque, échéance jours.
- [x] `customers.assigned_staff_id` → staff, `risk_class` (NORMAL/ROI/DOUTEUX/LITIGIEUX/ARNAQUEUR), `payment_term_days` — migration 0028 (dev appliquée, prod à faire au déploiement)
- [x] CustomerModal: select commercial (getStaff), classification, échéance
- [x] `/clients`: filtre par commercial + badges risque/aging
- [x] Prod migration 0028 — appliquée au déploiement (`erp-system-00116-jv8`)

## Phase B — Règlements gaps

### ✅ G21 — Modes de règlement manquants
**Legacy:** acompte, carte bancaire, versement, avoir, ristourne — ours: 4 modes.
- [x] `CARTE_BANCAIRE` + `VERSEMENT` seeded in `payment_methods` (migration 0030) — auto-flows to all method pickers
- [x] POS: TPE button added (4th method, no fiche required like ESPECES); `/ventes/nouveau`: réf+banque fields for VIREMENT/VERSEMENT/CARTE_BANCAIRE; PaymentModal: versement ref+bank block
- [x] Types/zod unions widened; `paymentMethodLabel()` helper in `lib/payments.ts` for raw-code displays
- [x] Supplier payments: new modes → DEBITE immediately (only CHEQUE/EFFET_LCN stay EN_ATTENTE)
- [x] **Decisions:** ACOMPTE → G23 (needs advances design + usage check) · RISTOURNE → covered by AVOIR `COMMERCIAL` · AVOIR-as-payment → de-scoped (avoirs already net into solde via doc math)
- [x] **Verified dev:** VERSEMENT 150 DH → Encaissé + journée VERSEMENT group; POS TPE BL-2026-00017 no-fiche + journée CARTE_BANCAIRE group; 6 buttons in PaymentModal/SupplierModal
- Effort: S-M · Deployed `erp-system-00121-f2r` (`v1.2.0`, migration 0030 prod applied, live-verified 6 methods in PaymentModal)

### ✅ G22 — Chèque "Règlement au nom" (tiers endossé)
**Legacy:** ListeChequesClts column "Régelement au Nom" — endorsed 3rd-party cheques are real usage.
- [x] `customer_payments.payee_name` (migration 0029 — dev+prod applied)
- [x] PaymentModal field on CHEQUE/EFFET_LCN + `payeeName` on CustomerPaymentItem
- [x] Verified dev: field renders in cheque block (branch `feat/g22-payee-name` merged `977edb0`)
- [x] Verified prod: `erp-system-00118-t5b` — "Règlement au nom de (tiers — chèque endossé)" field renders on Chèque selection, console clean
- Effort: XS · Deployed `erp-system-00118-t5b`

### ⏭️ G23 — Acomptes clients (DE-SCOPED 2026-11-04)
**Legacy:** SoldesClient — advance deposits tracked per client, "Acompte Clt/P_Clt" columns in situation.
- Data pull on `situationClients` (284 clients): **0 non-zero acompte balances** — columns exist but feature never used (same as G13 familles).
- No `customer_advances` table needed. Note: 83 clients DO have non-zero **Avoirs** — credit notes are real usage; fold into Phase E data pull.

## Phase C — Stock & catalogue

### ✅ G12 — Vue catalogue produits
**Legacy:** produitCatalogue (frs+marque filters, print) + CataloguePhoto (photo grid).
- [x] "Vue catalogue" toggle on `/stock` (List/LayoutGrid icons): card grid w/ photo, SKU, marque, prix vente, stock badge — partage même pagination/filtres serveur
- [x] `getProductBrands` + `brand` filter param on getProducts/getProductsCount → select "Toutes marques"
- [x] Print stylesheet: `@media print` hides app chrome (globals.css), print-only header (société, nb articles, filtres actifs, date), "Imprimer" button → shareable catalogue
- [x] **Verified dev:** 50 cards page 1, JMC filter → 34 produits, print button present
- Effort: S · Deployed `erp-system-00125-8zw` (`v1.3.0`, no migration — live-verified 50 cards + marque filter + print btn)

### ✅ G14 — Marques gérées
**Legacy:** marques CRUD list (7 rows) + marqueImport; ours: free-text `products.brand`.
- [x] `brands` table (migration 0031 + backfill DISTINCT from products) + `lib/actions/brands.ts` (getBrands/saveBrand/setBrandActive + audit)
- [x] `BrandsSection` in /parametres new "Catalogue" tab (add + activate/deactivate chips)
- [x] ProductModal: `<datalist>` suggestions from active brands (free-text still allowed)
- [x] Verified: tsc + build clean, migration dev applied
- Effort: S · Deployed `erp-system-00128-9d7` (`v1.4.0`, migration 0031 prod applied, live-verified: add/deactivate marque)

### ✅ G18 — Petites parités stock/ventes
- [x] `/ventes`: filtre par commercial (server-side, `commercialName` on docs + `getStaff("COMMERCIAL")` select)
- [x] `/stock`: colonnes Marge % (sous PV) + Valeur stock Val_PA (sous stock) — filtre marque ✅ (G12)
- [x] Liste des transferts → `/stock/transferts` (source/dest filters, expandable lines, print)
- [x] + `/stock/mouvements` journal global (nature/entrepôt/recherche) via `getStockMovements`
- [x] + Entrepôts CRUD → `WarehousesSection` in /parametres Catalogue (`saveWarehouse`, owner, audit)
- [x] Inventaire écart valeur → Val.Sélection/Inventaire/Écart (DH) on count list (legacy Valeur.Selection/Inventaire/Ecart) — par-entrepôt de-scoped (no warehouse_id on stock_counts)
- [x] feuilleRoute "abrégée" → Complète/Abrégée toggle on `/livraisons` (signature column, drops commercial/statut/action)
- Effort: M · Part 1 `erp-system-00132-l7m` `v1.5.0` · Part 2 on `feature/g18-parities-2` (no migration)

### ⬜ G17 — Réception rapide (posixrecep/AchaPosix — 💀 upstream)
- [ ] Quick-receive mode in SupplierReceiptModal: barcode/SKU-first entry, qty-only lines, no per-line price required, mobile-optimized
- Effort: S-M · Deps: none

### ⏭️ G13 — Familles (DE-SCOPED)
1 row "PAR DEFAUT" upstream — feature never used. Our categories = their categories. No action.

## Phase D — Reporting & profil

### ⬜ G15 — CA mensuel (+ objectifs)
**Legacy:** CAmois + objectifsListe (both 💀) — dashboard "Total Objectif : November".
- [ ] `/comptabilite` new tab "CA mensuel": CA TTC by month ×12, per commercial, per client top-N, vs prior year
- [ ] Optional: `sales_targets` table (month, commercial, target) + progress bar on dashboard
- Effort: M · Deps: none

### ⬜ G16 — Profil employé
**Legacy:** employeFiche + employes (13 accounts, 6 profiles).
- [ ] Self page (parametres or user menu): own name, change own PIN, "mes ventes du jour"
- [ ] Optional: role labels beyond CAISSIER/PROPRIETAIRE (display only — keep auth model)
- Effort: S · Deps: none

### ⬜ G19 — Imprimer / PDF / CSV partout
**Legacy:** Imprimer+ImpEtat on every list, brPrint, ticketPosixPAI, ExportListProduit.
- [ ] Audit each list: `/stock`, `/ventes`, `/reglements`, `/clients`, `/fournisseurs`, `/livraisons`, `/comptabilite` tabs, `/depenses`, `/operations-log` → print stylesheet or CSV export where missing
- Effort: M · Deps: after G11

## Phase E — Data pull (last, before legacy shutdown)
- [ ] Open items: CreditsClients (unpaid BLs) + ListeChequesClts (pending cheques w/ échéances + payee) → import as open docs/payments
- [ ] Verify vs `situationClients` total reste **697 910,50 Dh** + situationFournisseurs (page 💀 — fallback: supplier balances via fournisseurSituation&id=N per supplier)
- [ ] Doc headers by year via dateD/dateF POST on bls/devis/retours/receptions → historical docs (IMPORT status, no stock replay)
- [ ] Payments history (paiementClients rows) + depenses
- [ ] `MIGRATION_RECONCILE.md`: per-entity counts + sums old vs new
- [ ] Fallback: open items + last 12 months; older = CSV archive only

## Newly discovered & de-scoped
| Item | Verdict |
|---|---|
| COMPOSITION import mode (kit products) | ⏭️ no evidence of use; revisit if owner asks for kits |
| etiquet_section/zone (barcode labels) | ⏭️ empty upstream |
| objet "Suivre/Message" CRM buttons | ⏭️ dead UI upstream |
| menu tile launcher | ⏭️ nav covers it |
| stockMagasin | ⏭️ covered by /stock + G19 print |
| Employee vehicle matricule | ⏭️ single van, staff name suffices |

## Done log
| Date | Item | Commit | Prod revision |
|---|---|---|---|
| 2026-11-03 | Legacy re-audit (42 routes) + audit doc + this tracker | `5d00226` | — |
| 2026-11-03 | G11+G20 /clients page + fiche fields + CustomerModal stale-state fix | `024a6b0` | `erp-system-00116-jv8` (migration 0028 prod applied, live-verified /clients + drawer, console clean) |
| 2026-11-04 | G22 payee_name on cheques/effets (`feat/g22-payee-name`) | `977edb0` | `erp-system-00118-t5b` (migration 0029 prod applied, live-verified payee field on Chèque, console clean) |
| 2026-11-04 | G21 CARTE_BANCAIRE + VERSEMENT modes (`feature/g21-payment-modes`) | `63b33c8` | `erp-system-00121-f2r` `v1.2.0` (migration 0030 prod, live-verified 6 methods incl. TPE+Versement) |
| 2026-11-04 | G23 de-scoped — 0/284 acomptes upstream | `d85c9b3` | — |
| 2026-11-04 | G12 vue catalogue + marque filter + print (`feature/g12-catalogue-view`) | `a9ade51` | `erp-system-00125-8zw` `v1.3.0` (live-verified cards+filter+print btn) |
| 2026-11-04 | G14 marques gérées (`feature/g14-brands`) | `310c4b9` | `erp-system-00128-9d7` `v1.4.0` (migration 0031, user-verified) |
| 2026-11-04 | G18 p1 mouvements + transferts + entrepôts (`feature/g18-stock-parities`) | `d626dee` | `erp-system-00132-l7m` `v1.5.0` (live-verified) |
