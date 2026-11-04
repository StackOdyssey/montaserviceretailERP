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

### ⬜ G21 — Modes de règlement manquants
**Legacy:** acompte, carte bancaire, versement, avoir, ristourne — ours: 4 modes.
- [ ] Add `CARTE_BANCAIRE` (TPE counter sales) + `VERSEMENT` to PaymentMethod + labels + flows
- [ ] Decide ACOMPTE (→ G23), RISTOURNE (rebate credit — likely maps to AVOIR), AVOIR-as-payment (apply credit note to doc — check lettering logic)
- Effort: S-M · Deps: touches receivables math — careful · Verify: payment each mode → journée totals

### ✅ G22 — Chèque "Règlement au nom" (tiers endossé)
**Legacy:** ListeChequesClts column "Régelement au Nom" — endorsed 3rd-party cheques are real usage.
- [x] `customer_payments.payee_name` (migration 0029 — dev applied, prod pending deploy)
- [x] PaymentModal field on CHEQUE/EFFET_LCN + `payeeName` on CustomerPaymentItem
- [x] Verified dev: field renders in cheque block (branch `feat/g22-payee-name` merged `977edb0`)
- Effort: XS · Deploy: prod migration 0029 + deploy pending

### ⬜ G23 — Acomptes clients (assess first)
**Legacy:** SoldesClient — advance deposits tracked per client, "Acompte Clt/P_Clt" columns in situation.
- [ ] Check upstream usage volume first (SoldesClient data pull); if real: `customer_advances` or negative payments + solde display on /clients drawer
- Effort: M · Deps: G11, data check — may de-scope

## Phase C — Stock & catalogue

### ⬜ G12 — Vue catalogue produits
**Legacy:** produitCatalogue (frs+marque filters, print) + CataloguePhoto (photo grid).
- [ ] "Vue catalogue" toggle on `/stock`: card grid w/ photos (R2 `photo_url` already on 295 products), marque/categorie filters, print stylesheet → shareable catalogue
- Effort: S · Deps: none

### ⬜ G14 — Marques gérées
**Legacy:** marques CRUD list (7 rows) + marqueImport; ours: free-text `products.brand`.
- [ ] `brands` table + CRUD in /parametres (or /stock sub-tab) + datalist on ProductModal
- [ ] Backfill distinct brands from products
- Effort: S · Deps: migration

### ⬜ G18 — Petites parités stock/ventes
- [ ] `/ventes`: filtre par commercial (data déjà affichée)
- [ ] `/stock`: colonnes Marge % + Valeur stock (Val_PA) + filtre marque/nature (cf. legacy stock page)
- [ ] Liste des transferts (stock_transfers reader UI) + inventaire par entrepôt + colonnes écart valeur
- [ ] feuilleRoute "abrégée" = print variant on `/livraisons`
- Effort: M (bundle of smalls) · Deps: none

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
