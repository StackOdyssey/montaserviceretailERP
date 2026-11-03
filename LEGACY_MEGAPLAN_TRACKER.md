# Legacy Megaplan Tracker — BestWay → BM Motors ERP (phase 2)

Continuation of `LEGACY_GAPS_TRACKER.md` (G1–G10 done). Source: `LEGACY_FEATURE_AUDIT.md` (2026-11-03 re-crawl, 42 routes).
Each item is built + verified (IronBee, tsc/build) + committed + deployed **one at a time, with user go-ahead**.

Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏭️ de-scoped

---

## Phase A — Clients (user-flagged)

### ⬜ G11 — Page `/clients` dédiée
**Legacy:** `clients` + `clientEdit` + `CltsPosix` + `EtatVenteCltPosix`.
- [ ] Route `/clients` + nav entry (Ventes group, between Ventes and Règlements)
- [ ] Paginated searchable list (295 rows): fuzzy `matchTokens`, columns Nom|Tél|Ville|ICE|Collaborateur|Solde dû|badge aging
- [ ] Fiche client: create/edit via existing `saveCustomer` — add fields (see G20)
- [ ] Drawer per client: infos + documents + paiements + solde + relevé (`getCustomerStatement`) + "Encaisser" → PaymentModal
- [ ] *Better than legacy:* fuzzy dedup hint on create, real-time solde, aging badge, mobile layout
- Effort: M · Deps: none · Verify: dev CRUD + drawer + prod deploy

### ⬜ G20 — Champs fiche client manquants
**Legacy:** collaborateur assigné, classification risque (normal/roi/douteux/litigieux/arnaqueur), échéance jours, type client (Normal/Semi-Grossiste/Grossiste/VIP).
- [ ] `customers.assigned_staff_id` (→ staff COMMERCIAL), `risk_class`, `payment_term_days`
- [ ] Fiche UI + filter "par collaborateur" sur `/clients` (legacy filter parity)
- [ ] Map: isWholesale ↔ Grossiste types (keep existing flags, expose type select)
- Effort: S · Deps: migration · Verify: edit + filter

## Phase B — Règlements gaps

### ⬜ G21 — Modes de règlement manquants
**Legacy:** acompte, carte bancaire, versement, avoir, ristourne — ours: 4 modes.
- [ ] Add `CARTE_BANCAIRE` (TPE counter sales) + `VERSEMENT` to PaymentMethod + labels + flows
- [ ] Decide ACOMPTE (→ G23), RISTOURNE (rebate credit — likely maps to AVOIR), AVOIR-as-payment (apply credit note to doc — check lettering logic)
- Effort: S-M · Deps: touches receivables math — careful · Verify: payment each mode → journée totals

### ⬜ G22 — Chèque "Règlement au nom" (tiers endossé)
**Legacy:** ListeChequesClts column "Régelement au Nom" — endorsed 3rd-party cheques are real usage.
- [ ] `customer_payments.payee_name` (migration)
- [ ] PaymentModal field (cheque/effet only) + échéancier column
- Effort: XS · Deps: migration

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
| 2026-11-03 | Legacy re-audit (42 routes) + audit doc + this tracker | — | — |
