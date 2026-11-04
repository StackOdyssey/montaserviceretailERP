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

## Open items after import

- Payments history (`paiementClients` 54KB) — history-only, optional
- Supplier balances — 8 suppliers via per-supplier fiche
- Historical docs headers (optional, IMPORT status)
- Final reconcile table vs 697 910,50 + per-supplier sums
