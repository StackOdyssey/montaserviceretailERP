# Migration réconciliation — legacy (montaservice.net) → new ERP

**Date pull:** 2026-11-04 · Sources: `References_/legacy-pages/*.html` (UNTRACKED — personal data, never commit)

## Data inventory (verified)

| Source | Rows | Meaning |
|---|---|---|
| `situationClients` | 284 clients | 40 open balances, **total reste 697 910,50 DH** (anchor ✓) |
| `ListeChequesClts` | 511 cheques/effets | 43 ENCAISSER · **448 A DEPOSER · 19 RETARD DEPOT · 1 Impayé** → 467 open ≈ **6 426 001 DH** |
| `CreditsClients` | 73 | settled-movements journal — no open items |
| `situationFournisseurs` | dead | fallback: `fournisseurSituation&id=` per supplier (8) |
| `EncoursClient` ×40 | PDF statements | per-doc detail deferred (PDF streams, not parsed) |
| Prod DB (new) | — | clients 295 · products 428 · **0 docs / 0 payments / 0 receipts** |

User confirmed: **all pulled data is real** — insert as typed records so future calculations work.

## Import model (decided)

Client solde rule (our app): `BL/FACTURE +1, AVOIR −1`, payments subtract regardless of cheque status.
Legacy `reste` already nets in-hand cheques ⇒ for every client:

- `debt_doc_total = legacy_reste + Σ(pending cheques of that client)`
- Insert one unpaid `sales_documents` BL per affected client: `docType=BL`, `status=VALIDE`, `paidAmountCents=0`, `totalTtcCents = debt_doc_total`, `docNumber=BL-2026-XXXX` (sequence-continuing), `notes=IMPORT LEGACY`, `docDate` = pull date
- Insert their pending cheques as `customer_payments`: `paymentMethod` CHEQUE→`CHEQUE` / EFFET→`EFFET_LCN`, `status=EN_ATTENTE` (deposit lifecycle continues in-app), `reference` = num piece, `dueDate` = Date Dépôt, `payeeName` = Régelement au Nom, `paymentDate` = Date Réglement, `customerId` = matched prod customer
- Net effect per client = exact `legacy_reste`; zero-reste cheque-holders net to 0

Name matching: legacy name → prod `customers.name` (imported verbatim, expect near-exact; report unmatched).

## Executed 2026-11-04 — `scripts/import-legacy-balances.mjs --apply`

- **99 BL docs** `BL-2026-00001..00099` (VALIDE, unpaid, `IMPORT LEGACY` notes) = reste + in-hand cheques per client
- **467 payments `EN_ATTENTE`** linked to their client's doc — mode (CHEQUE/EFFET_LCN), reference, échéance (Date Dépôt), `payee_name`
- **2 credit-balance payments `ENCAISSE`**: HICHAM AZAZ −13 823 + ABDERRAHMANE ARIHA −1 390 (negative-reste clients can't carry a doc — modelled as received overpayment)
- Name matching: **0 unmatched** of 99 plan clients
- **Reconcile: net client receivable = 697 910,50 DH ✓** (docs 7 139 124,50 − payments 6 441 214,00); per-client net = legacy reste, **0 mismatches**
- `BL` numbering sequence consumed through 00099 — app continues at 00100

## Open items after import — resolved

- **Supplier balances — DEAD SOURCE.** `situationFournisseurs` (8B), `fournisseurSituation&id=` (8B ×8), `paiementFournisseurs` (500) all return empty. `receptions` lists BR totals but no per-supplier reste. → **Manual entry needed** (8 suppliers — user supplies amounts or bank statement).
- **Payments history — DEAD SOURCE.** `paiementClients` page returns no rows. Would have been reference-only anyway (importing history without its docs would corrupt balances).
- **Historical doc headers** — `bls`/`devis`/`receptions` lists live; optional archive pull, skipped (opening positions already reconciled; headers would add archive value only).
- Client Acomptes: 0/284 — confirmed unused (G23 de-scoped). Avoirs: 83 clients hold non-zero balances — already net into client solde; no separate import needed.
