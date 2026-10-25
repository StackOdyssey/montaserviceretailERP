# Legacy Parity Tracker — BestWay (montaservice.net) → BM Motors ERP

Tracks closing the feature gaps identified in `LEGACY_GAP_ANALYSIS.md`.
Work items are ordered by value/effort — tackle top-down. Check off `[x]` as items ship; record commit + prod revision in the Done log.

Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏭️ skipped/de-scoped

---

## Phase 1 — Quick wins (dead code exists, daily ops value)

### ✅ G4 — Manual stock movements — **ALREADY COVERED** (StockAdjustmentModal)
**Found during impl:** `/stock` already has `StockAdjustmentModal` (Entrée/Sortie/Inventaire + motif audit obligatoire) → `recordStockMovement` (locked, CMUP, negative-stock guard, audit actor). `writeOffStock` dead code remains but is redundant — superseded.
- [ ] UI: "Ajustement stock" action on `/stock` product rows (or product detail) — qty + nature (CASSE/EXPIRE/PERTE/ENTREE_MANUELLE) + note
- [ ] Wire existing `writeOffStock` (verify it locks products via `lockProducts` + updates CMUP correctly or leaves CMUP untouched for write-offs)
- [ ] Audit log entry with `actor_name` (replaces legacy "employé responsable")
- [ ] Show adjustments in `/operations-log` (should already flow via audit)
- **Verify:** adjust stock on dev → check `stock_movements` row + product stock + audit; prod deploy.
- Effort: S · Deps: none

### ✅ G5 — Supplier returns
**Legacy:** `retoursFrn` — return goods to supplier.
**Ours:** `createSupplierReturn` in `src/lib/actions/sales-stock.ts` is dead code.
- [x] `SupplierReturnModal` on `/fournisseurs` ("Retour" button per supplier → receipt pick → per-line qty capped at remaining → reason)
- [x] `createSupplierReturn` hardened: lockProducts, negative-stock guard (`settings.negative_stock_allowed`), `BR_ANNULE` check, `returned_quantity` caps double-returns, reduces receipt HT/TVA/TTC (dette ↓), `RETOUR_FOURNISSEUR` movement + audit
- [x] `supplier_receipt_lines.returned_quantity` (migration 0023)
- [x] **Verified dev:** return 5×sku1072 → stock 423→418, returned_quantity=5, BR 12000→6000¢ TTC, movement + audit rows
- Effort: S · Deps: none

### ✅ G6 — Product traceability view
**Legacy:** `produitHist` — per-product ledger (movement #, price, stock before→after, session, warehouse).
**Ours:** `stock_movements` rows written by sales/receipts/adjustments — no reader UI.
- [x] `getProductMovements(productId, {limit,offset})` — paginated, stock avant/après recalculated by walkback from currentStock
- [x] `ProductHistoryModal` on `/stock` row (History icon) — date, type, qty, coût, stock avant→après, reason + pagination
- [x] **Verified dev:** modal renders movement rows w/ before→after (Stock initial 0→0 for sku 1001)
- Effort: S · Deps: none (data already flows)

### ✅ G7 — Feuille de journée (daily close report)
**Legacy:** date-range sheet filterable by commercial + caissier, printable per-caissier.
**Ours:** `/operations-log` = audit, `/comptabilite` = TVA/CA — no per-day close.
- [x] `getDailySheet(from,to)` — ventes/docType (VALIDE+PAYE), encaissements/mode, décaissements FRS/mode, dépenses, caisse espèces nette, annulés count
- [x] "Feuille de journée" tab on `/comptabilite` — date range + Afficher + Imprimer + 4 summary cards + 3 breakdown tables
- [ ] Per-caissier filter — deferred to G3 (no actor on docs yet)
- [x] **Verified dev:** tab renders all sections (0s for today — no sales today)
- Effort: M · Deps: none (G3 makes caissier filter richer later)

---

## Phase 2 — Personnel attribution (unlocks delivery workflow)

### ⬜ G3 — Commercial / livreur on sales docs
**Legacy:** Commercial + Livreur columns on BL/BP/retours; feuilleJournee filters by them.
- [ ] Decide model: extend `users` (role=COMMERCIAL/LIVREUR) or separate employees table → **ask user how vendeurs/livreurs log in today**
- [ ] Schema: `sales_documents.commercial_id` (+ optional `livreur_id`) — migration
- [ ] UI: commercial picker on `/ventes/nouveau` + POS (default = session user?)
- [ ] Surface: doc list column, print view, feuille de journée filter, per-commercial CA stat
- **Verify:** create BL with commercial → shows on doc + print + daily sheet filter.
- Effort: M · Deps: model decision

### ⬜ G8 — Cheque "date de dépôt" (deposit tracking)
**Legacy:** ListeChequesClts has Date Dépôt + Etat (reçu→déposé→encaissé).
**Ours:** échéancier tracks due date + status only.
- [ ] Schema: `payments.deposit_date` (nullable) — migration
- [ ] UI: deposit date column + "marquer déposé" on `/reglements` échéancier row
- [ ] Status flow: EN_ATTENTE → DEPOSE → ENCAISSE/REJETE
- Effort: S · Deps: none

### ⬜ G9 — Client CSV import
**Legacy:** `clientImport` — bulk client file import.
- [ ] Extend CSV import pattern (like products) → clients: name, phone, city, ICE, credit limit
- [ ] Dedup on import via existing `findCustomerDuplicates`/fuzzy match
- Effort: S · Deps: none · **Note:** only needed if bulk client list exists outside ERP — confirm need

### ⬜ G10 — Lock screen
**Legacy:** `lockCompte` — instant PIN lock without losing session context.
- [ ] Client-side lock overlay: PIN pad → verify against session user PIN → unlock (no re-login)
- Effort: S · Deps: none · **Nice-to-have** for counter use

---

## Phase 3 — Delivery workflow (only if delivery round still runs)

### ⬜ G2a — Bons de préparation (picking slips)
**Legacy:** `bps`/`bpAdd` — Ref|Client|Commercial|Total|Accord|Etat livraison.
- [ ] New doc: `PREPARATION` state on sales doc or separate `bons_preparation` table — design decision
- [ ] Status flow: BROUILLON → A_PREPARER → PREPARE (accord) → LIVRE → facture/BL
- [ ] UI: list + create from order + accord action + print (pick list)
- Effort: L · Deps: G3

### ⬜ G2b — Feuille de route / expédition
**Legacy:** date-filtered route sheets assigning BLs to livreurs, printable.
- [ ] Route sheet: group validated docs by livreur+date, printable per driver
- [ ] Delivery status update (LIVRE/NON_LIVRE) writing back to docs
- Effort: M · Deps: G3 (livreur entity), G2a helps

---

## Phase 4 — Multi-warehouse (largest lift)

### ⬜ G1 — Entrepôts (Principal + Mobile)
**Legacy:** `entrepots`, `transfert`, per-warehouse `inventaires`, `stockMagasin`, entrepôt on movements.
**Ours:** `warehouses` table + `products.warehouseId` exist but unused — single global stock.
- [x] **DECISION:** in scope — product completeness for resale (multi-tenant prospects may use van/shop stock) even if current owner doesn't
- [ ] Schema: `product_stock` (product_id, warehouse_id, qty) replacing global `currentStock` semantics; default warehouse migration
- [ ] Transfers: `stock_transfers` doc + action (out of source, into dest, locked)
- [ ] Sales/receipts specify warehouse (default = Principal; POS = Principal, route sales = Mobile?)
- [ ] Inventaire per warehouse (scope existing stock-counts)
- [ ] `stockMagasin` equivalent = /stock filtered by warehouse
- Effort: XL · Deps: decision + touches every stock path — do last

---

## De-scoped / covered already

| Item | Verdict |
|---|---|
| Bons de retour clients | ✅ covered by AVOIR `avType=RETOUR` (restocks) |
| Chèques échéancier | ✅ covered (G8 adds deposit date only) |
| Devis, BL→Facture, réceptions FRS, dépenses, clients/fournisseurs | ✅ covered |
| Catalogue + photos + CSV export | ✅ covered (better: R2, pagination) |
| Annulation docs | ✅ covered (un-cancel intentionally absent) |
| Approvisionnement/reorder view | ⏭️ low-stock counters on `/stock` suffice for now |
| `retoursFrn` legacy page | broken upstream too (47B response) |

## Done log

| Date | Item | Commit | Prod revision |
|---|---|---|---|
| 2026-10-25 | G5+G6+G7 (+G4 already-covered, modal preselect fix) | `ef43306` | _deploying_ |

## Scope decision (2026-10-25)

ALL gaps are in scope — owner confirmed resale intent; legacy parity = product completeness.
Phases still ordered by value/effort. Open questions below become design decisions, not gates.

## Open questions (design, not gates)

1. **Is the Entrepôt Mobile (van) still operating?** — gates all of Phase 4
2. Do vendeurs/livreurs need login accounts, or are they name-only attributions? — shapes G3
3. Do we still do picking/delivery rounds (feuille de route), or counter sales only? — gates Phase 3
4. Is there a bulk client list to import? — gates G9
