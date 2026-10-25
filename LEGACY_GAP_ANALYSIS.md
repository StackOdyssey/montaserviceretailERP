# Legacy System Gap Analysis — montaservice.net ("BestWay") vs BM Motors ERP

Date: 2026-10-25 · Source: live crawl of `montaservice.net/web` (account `Montassir`) + codebase inspection

## 1. Legacy system profile

- **Stack:** classic PHP server-rendered app (`index.php?page=<route>`), jQuery/Bootstrap front-end, PHPSESSID cookie auth, per-page role gating (Montassir's account is denied ~11 routes: devis, réceptions, situation clients, categories/marques/familles admin, achats POS, paiement FRS, inventaires, CA-mois).
- **Vendor:** "BestWay" © 2015-2023 by k-kamal.
- **38 routes discovered** incl. `bpAdd`, `retourAdd`, `entrepotAdd/Edit`, `clientImport`, `ExportListProduit`, `Implistecaissiers`.
- Data model observed: products keyed by numeric Ref (= our SKU), photo `produits/<ref>.jpg`, columns PV TTC + Marque. Clients incl. "CLIENT DE PASSAGE" (= our "Client Comptoir Particulier").

## 2. Feature map — old → new

| Legacy feature | Route(s) | Current ERP equivalent | Status |
|---|---|---|---|
| Point de vente | `posix`, `blAddPosix` | `/pos` (BL/Facture/BC) | ✅ covered + better (idempotency, photos) |
| Bons de livraison | `bls` | `/ventes` + `/ventes/nouveau` | ✅ covered |
| Devis | `devis` | `DEVIS` doc type | ✅ covered |
| Factures | (via BL→Facture) | `convertBlToFacture` | ✅ covered |
| Bons de Retour Clients | `retours`, `retourAdd` | `AVOIR` `avType=RETOUR` (restocks) | ✅ functionally covered |
| Chèques | `ListeChequesClts` | `/reglements` échéancier (dueDate+status) | 🟡 partial — no "date dépôt" (deposit) field |
| Clients / Situation clients | `clients`, `situationClients` | `/reglements` + `CustomerStatementModal` + fuzzy combobox | ✅ covered + better (dedup) |
| Fournisseurs / situation / paiement | `fournisseur`, `situationFournisseurs`, `paiementFournisseurs` | `/fournisseurs` full suite | ✅ covered |
| Réceptions FRS | `receptions`, `recepAdd` | `SupplierReceiptModal` (BR doc type) | ✅ covered |
| Dépenses | `depenses` | `/depenses` | ✅ covered |
| Produits / catalogue / export | `produits`, `produitCatalogue`, `ExportListProduit` | `/stock` + CsvModal + R2 photos | ✅ covered + better |
| Marques / catégories | `marques`, `categories` | `brand` + `categoryId` fields, filters | ✅ covered (no admin UI, seed-level) |
| Etat de stock / magasin | `stock`, `stockMagasin` | `/stock` paginated | ✅ covered |
| Inventaires | `inventaires` | `/stock/inventaire` + stock-counts | ✅ covered (single warehouse) |
| Import produits / alimentation | `produitImport` | `/stock` CSV import | 🟡 partial — no "stock feed" mode (receipt covers it) |
| Import clients | `clientImport` | — none (manual create only) | 🟡 minor gap |
| Traçabilité produits | `produitHist` | `stock_movements` table (writes only) + `/operations-log` | 🟡 data exists, **no UI** |
| CA mensuel / stats | `CAmois`, `feuilleJournee` | `/comptabilite` reports | 🟡 partial — see gap G7 |
| Employés / profil | `employeFiche`, `lockCompte` | `users` table + parametres | 🟡 partial — no lock screen |
| Annulation BL | `blPrintANNULER`, `annulerAnnulation` | `cancelDocument` (ANNULE status, audit) | ✅ covered (un-cancel intentionally absent) |
| **Entrepôts (multi-warehouse)** | `entrepots`, `transfert`, `stockMagasin` | `warehouses` table — **dead schema** | ❌ missing |
| **Bons de préparation** | `bps`, `bpAdd` | — none | ❌ missing |
| **Expédition / feuille de route** | `feuilleRoute` | — none | ❌ missing |
| **Commerciaux / livreurs** | (columns on BL, BP, retours) | — none | ❌ missing |
| **Mouvements manuels de stock** | `mvtStockSortie` | `writeOffStock` — dead action | ❌ missing UI |
| **Retours FRS** | `retoursFrn` | `createSupplierReturn` — dead action | ❌ missing UI |

## 3. The real gaps (what the old system does that ours doesn't)

### G1 — Multi-warehouse: Principal + "Entrepot Mobile_01" ❗
The old system has **two warehouses**: `Entrepot Principal` and `Entrepot Mobile_01` — almost certainly a **delivery van** (stock that leaves with the driver on rounds). Pages: warehouse CRUD, `transfert` (source→destination moves), per-warehouse `inventaires`, `stockMagasin` storefront view, movements carry an `entrepot` column.
**Our schema anticipated this** (`warehouses` table, `products.warehouseId`) but nothing uses it — single global `currentStock`.
*Impact:* if the driver still sells from the van, van stock is invisible/untracked → stock errors and no way to reconcile.

### G2 — Delivery workflow: bons de préparation + feuille de route ❗
- `bps`: picking slips — Ref | Client | **Commercial** | Total | **Accord** | **Etat de livraison**. A prepare→approve→deliver step between order and BL.
- `feuilleRoute`: date-filtered **route sheets assigning deliveries to livreurs** (delivery drivers), with printable per-driver lists.
**Ours:** nothing — a sale jumps straight to a BL document. No picking status, no driver assignment, no delivery confirmation state.

### G3 — Commercial / livreur attribution ❗
Old BL/BP/retour rows carry **Commercial** (BRAHIM BELLA, Fadoua, Montassir…) and **Livreur** columns; `feuilleJournee` filters by commercial AND caissier. **Ours:** sales docs have no salesperson field; audit `actor_name` only records who *entered* it, not who *sold/delivered* it. No per-commercial revenue tracking.

### G4 — Manual stock movements UI
`mvtStockSortie`: manual in/out adjustments with nature, responsible employee, warehouse, session. **Ours:** `writeOffStock` exists in `sales-stock.ts` but has **zero callers** — no UI to write off broken/expired stock or do manual adjustments outside a sale/receipt/inventory.

### G5 — Supplier returns UI
`retoursFrn` exists in the old app. **Ours:** `createSupplierReturn` is dead code — no way to return goods to a supplier (creates the reverse flow: stock out + supplier credit).

### G6 — Product traceability view
`produitHist`: per-product movement ledger — N° movement, price at movement, **stock before → qty → stock after**, session, warehouse. **Ours:** `stock_movements` rows are written but there's no screen to read them — only the generic audit log. For "who touched stock on part X and when" you currently query the DB.

### G7 — Feuille de journée (daily close / Z-report)
Old: date-range daily sheet filterable by **commercial** and **caissier**, plus printable per-caissier list (`Implistecaissiers`). **Ours:** `/operations-log` (audit trail) + `/comptabilite` (TVA/CA) — no consolidated "today by cashier: sales, encaissements, espèces vs chèques" close report.

### Minor gaps
- **Date de dépôt** on cheques (deposit vs due vs cleared — we track due + status only).
- **Client CSV import** (`clientImport` — bulk client migration).
- **Lock screen** (`lockCompte` — instant lock without full logout; nice for the counter).
- **Approvisionnement** page (restock suggestions — we have low-stock counters on /stock but no dedicated reorder view).

## 4. What the new system does better (don't regress these)

- Idempotent sales (no duplicate BL on retry) — old system has no such protection
- Multi-user PINs + owner/caissier roles + actor audit attribution
- Structured business errors (ActionResult) vs silent PHP failures
- Fuzzy client combobox (spelling-variant dedup) — old system just has a flat select
- R2-hosted product photos — old system's are local files (and 132 are broken there)
- Session revocation, PIN lockout, zod validation, transactional stock+CMUP with row locks
- PWA + Cloud Run + Neon (the old PHP app is tied to its host)

## 5. Recommendation order (if/when implementing)

1. **G4 + G5** — small: both have dead server actions already; each is a modal + table page. Highest value/effort ratio (real daily ops: damaged goods, returns to supplier).
2. **G6** — read-only product-history tab (data already in `stock_movements`).
3. **G7** — daily close report (aggregations over existing tables).
4. **G3** — commercial field on sales_documents + per-seller stats (needed before G2).
5. **G2** — BP/picking + livreur only if the delivery round is still active.
6. **G1** — multi-warehouse is the biggest lift (stock becomes per-warehouse: schema has seeds but `currentStock` is global; needs stock_by_warehouse + transfer docs + inventory scoping). **Decide first whether Mobile_01 is still real** — if the van doesn't run anymore, skip it entirely.

## 6. Notes on coverage

- ~11 legacy routes were access-denied for this account (devis, réceptions, situations, catalogue admin, achats POS, paiements FRS, inventaires, CA-mois) — assessed via menu labels + observable schema only, not page contents.
- `retoursFrn` returned an empty body (47B) — possibly broken in the old system too.
- `CAmois` returned 0 bytes (needs POST/params).
