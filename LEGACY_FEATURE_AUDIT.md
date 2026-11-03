# Legacy Feature Audit — montaservice.net ("BestWay") vs BM Motors ERP

Date: 2026-11-03 · Source: live re-crawl of `montaservice.net/web` (account Montassir, id 4) — 42 routes probed, HTML dumps in `References_/legacy-pages/` (untracked). Supersedes `LEGACY_GAP_ANALYSIS.md` (2026-10-25).

Legend: ✅ covered · 🟡 partial · ❌ missing · 💀 broken upstream (PHP error / empty / 500 — can't audit, likely unmaintained) · 🚫 denied to this account

---

## A. Tableau de bord & navigation

### `index` — Tableau de bord
- **What:** KPI cards: Chiffre Journée, Crédit Client (ventes+solde), Réglements Crédit, REST CREDIT, Ancien Solde (407 829,17 Dh — carryover balance), Valeur Stock, Objectif du mois, Achats Frs, Crédit Frs, Dépenses. "Détails Journée" table (Ref|Date|Client|Commercial|Livreur|Montant) + ticket counters (encours/annulé/retourné/validé/facturé).
- **Ours:** `/` dashboard — ✅ covered.
- **Better:** show commercial/livreur on today's sales (we already store them).

### `menu` — Tile launcher
- **What:** big-image shortcut grid → retours, stockMagasin, CataloguePhoto, paiementClientAdd, depenses, FrsPosix, produitImport, receptions, objectifsListe. Touch-friendly home for counter staff.
- **Ours:** sidebar nav + dashboard — ✅ covered conceptually. Optional: quick-actions row on `/` for caissier sessions.

## B. Écritures (sales documents)

### `devis`, `bls`, `retours`, `bps` — document lists
- **What:** date-range + client + commercial filters; columns Ref|Client|Commercial|(Livreur)|Montant/Total|Accord|Etat livraison|Action. `ventes` page = same BL list + "TOTAL VENTES JOURNEE TTC".
- **Ours:** `/ventes` + `/ventes/nouveau` + `/pos` + prep_status + AVOIR/RETOUR — ✅ covered.
- **Gap:** no **commercial filter** on `/ventes` (data shown, not filterable) → tracker G18.

### `feuilleRoute` — Expédition
- **What:** two printable route sheets — full + **"abrégée"** — filtered by date + livreur.
- **Ours:** `/livraisons` — ✅ covered; abridged variant = trivial follow-up.

### `paiementClientAdd` — Règlement client (allocation UX)
- **What:** pick client → table of open items (Commercial|Montant|Réglé|Reste|Action = per-doc lettering) → payment form: montant, mode (CHEQUE/EFFET/ESPECE/VIREMENT/VERSEMENT/AVOIR/RISTOURNE), numéro, date échéance.
- **Ours:** PaymentModal + lettering — ✅ covered.
- **Gaps:** payment modes — legacy has **CARTE BANCAIRE, VERSEMENT, ACOMPTE (soldes), RISTOURNE**; ours = ESPECES/CHEQUE/EFFET_LCN/VIREMENT → tracker G21.

### `SoldesClient` — acomptes clients
- **What:** per-client advance/credit deposits ("Détails Solde|Mnt_Solde|Réglement|Reste"), commercial filter, modes incl. `acompte`, `carte`.
- **Ours:** ❌ no customer advance (acompte) concept → tracker G23 (assess real usage first — acompte columns exist in situationClients).

### `CreditsClients` / `paiementClients` — open items + payment history
- **What:** CreditsClients = unpaid BL list w/ per-doc "Ajouter Réglement". paiementClients = payment ledger (Date|N°MVT|Client|Montant|Total Réglement|Mode|Reste|Échéance) + totals (vente crédit/réglé/reste) + print.
- **Ours:** `/reglements` receivables + échéancier — ✅ covered (our receivables.ts is more accurate).
- **Data pull:** CreditsClients = the **open-items source** for migration.

### `situationClients` — receivables positions
- **What:** per-client columns: Réglement/Solde N-1 | Réglement/Livraison | Avoirs | Acompte Clt | Acompte P_Clt | Total Mouvement | Total Réglement | Reste à payer. **Totals: ventes 22 722 153,00 Dh · réglé 22 024 242,50 Dh · non réglé 697 910,50 Dh** (2026-11-03) — the reconciliation anchor for the data pull.
- **Ours:** `/reglements` + statement modal — ✅ covered.

### `ListeChequesClts` — chèques
- **What:** date+client filters; columns Client|Date Réglement|Mode|Num Pièce|Montant|**Date Dépôt**|**Règlement au Nom**|Etat (A DEPOSER etc.). Live rows show **endorsed third-party cheques** ("THAMI ELBOHALI (AVU 987937)" paid via client SAID RILANI).
- **Ours:** échéancier + deposit_date (G8) — 🟡 missing **payee / "au nom de" field** for endorsed cheques → tracker G22.

## C. Catalogue & stock

### `produits` / `produitsPosix` / `produitCatalogue` / `CataloguePhoto`
- **What:** `produits` = admin list; `produitsPosix` = touch list (Ref|Photo|Désignation|PV TTC|Marque); `produitCatalogue` = catalogue view filtered by fournisseur + marque, printable; `CataloguePhoto` = photo grid (2.2MB inline images).
- **Ours:** `/stock` table + `/pos` photos + CSV — 🟡 no shareable/printable **catalogue view** → tracker G12 (catalogue print view or /stock display mode).

### `stock` — Etat de stock
- **What:** filters entrepôt + fournisseur + marque + nature; columns Ref|Code Barre|Désignation|Marque|Nature|Fournisseur|Qté|**C.R HT|P.V HT|T.Marge %|Val_PA_HT**|Entrepôt.
- **Ours:** `/stock` — 🟡 missing **marge % & valeur de stock (Val_PA)** columns + marque/nature filters → tracker G19/reporting item.

### `stockMagasin` — storefront stock
- **What:** simplified printable stock sheet (Code|Désignation|Catégorie|Qté|PV) + categorie filter + Imprimer. Basically "Etat de stock" lite for the counter.
- **Ours:** covered by `/stock` + print — ✅ after G19 adds a print button.

### `entrepots` / `transfert` / `inventaires` / `mvtStockSortie`
- **What:** 2 warehouses (Principal, Mobile_01). Transfert list (source/dest/date filters, print). Inventaires: entrepôt + type filters, Valeur.Selection/Valeur.Inventaire/**Ecart** columns, statuses encours/validé/annulé; Actions menu → importer, **etiquet_section / etiquet_zone (label printing — empty upstream 💀)**, ExportListProduit. mvtStockSortie: sortie/entrée forms (observation, employé responsable, produit, coût, qte) + N°MVT/date/employé filters.
- **Ours:** multi-warehouse + transfers + inventory + adjustments — 🟡 gaps: **transfers list page**, per-warehouse inventory, inventory **écart value** columns → tracker G18 (small follow-ups already logged).

### `produitImport` — CSV import modes
- **What:** 5 modes: IMPORTPDTS (create), IMPORTPDTSFRS (create+supplier), IMPORTCRETINT (create+integrate stock), **COMPOSTION (kit/bundle products)**, ALIMENTATION (restock). Templates downloadable.
- **Ours:** product CSV import + receipts — 🟡 no "import + stock intake" mode, no kit products (likely unused upstream — de-scope unless data says otherwise).

### `familles` / `categories` / `marques` — taxonomy
- **What:** THREE parallel lists, but: categories=8 rows (BAILIAN, JT PIECES, JMC, LIFA MOTO, PYRAMIDS, AUTRES, SAMUNIC, CAMEL), marques=7 rows (same minus CAMEL — near-duplicate), **familles=1 row ("PAR DEFAUT" under catégorie BAILIAN — feature unused)**. Legacy "catégorie" is really the bike-brand/compatibility group; "marque" is a parallel duplicate of it.
- **Ours:** categories table + brand free-text — **G13 DE-SCOPED** (familles unused upstream; our category = their categorie). **G14: brand admin** — replace free-text brand with managed list (datalist + parametres CRUD) → tracker.

## D. Clients

### `clients` — client list
- **What:** search by code + raison sociale; columns ID|ICE|Raison sociale|Représentant|**Collaborateur**|Adresse|Email|Tel|Échance|**Type Cts**|Date création. Quick links: paiementClientAdd, paiementClients, situationClients.
- **Ours:** clients only inside `/reglements` (user-flagged gap) — ❌ **G11: dedicated `/clients` page**.

### `clientEdit` — fiche client
- **What:** tabs Libellés/Profil/Caractéristiques/Statistiques. Fields: ICE, CIN, raison sociale, tel, gsm, adresse, mail, D.naissance; **Type (Normal/Semi-Grossiste/Grossiste/VIP)**; **Classification (normal/roi/douteux/litigieux/arnaqueur)**; **Collaborateur (commercial assigné)**; Représentant, Mode paiement, Circuit, Zone, Secteur, Statut (Société/Magasin/P.physique); Échéance jours, Taux TVA, **Taux Ristourne**, Plafond CA, Plafond Crédit, Solde RN; Visibilité on/off; "Évolutions CA" chart placeholder.
- **Ours:** name/phone/email/city/address/ice/CIN/isWholesale/isProfessional/priceLevel/creditLimit/paymentTerms/representative — 🟡 missing **collaborateur assigné, classification risque, échéance en jours** → fold into G11 scope.

### `CltsPosix` / `EtatVenteCltPosix` — client list + état ventes
- **What:** touch client list → per-client sales statement (embeds PDF print docs).
- **Ours:** covered by G11 drawer + CustomerStatementModal — ✅ once G11 lands.

## E. Fournisseurs

### `fournisseur` / `receptions` / `recepAdd` / `retoursFrn` / `FrsPosix` / `EtatAchatFrsPosix` / `fournisseurProduct` / `situationFournisseurs` / `paiementFournisseurs`
- **What:** supplier list (ID|ICE|Raison|Représentant|Collaborateur|Échance|création); receptions journal (Ref CMD, Resp.Stock, Lieu livraison, Livreur, Transport, TTC — REC_1 = "INTEGRATION SAMUNIC.CSV" 8.4M Dh stock intake); recepAdd: frs + code/ICE/tel/rep + **"En Compte" checkbox** + **Logisticien** + **Date.Rég.Prévu** + entrepôt. `retoursFrn` 💀 (47B). `situationFournisseurs`/`paiementFournisseurs` 💀/🚫.
- **Ours:** `/fournisseurs` suite + SupplierReceiptModal + SupplierReturnModal — 🟡 missing **Date.Rég.Prévu (expected payment date) on BR** + "En compte" flag? (check) → small tracker item.

## F. Statistiques & employés

### `feuilleJournee`
- **What:** date range + commercial + caissier filters (⚠️ both selects named `idcai` — they collide, likely broken upstream; page 500s).
- **Ours:** JOURNEE tab `/comptabilite` — ✅ covered; commercial/caissier filter = follow-up (needs actor on docs — partially there via audit actor).

### `CAmois` — CA mensuel 💀 (500)
- **What:** monthly revenue stats — page dead upstream. Dashboard shows "Total Objectif : November" → linked to `objectifsListe` (also 500) = **monthly sales objectives/targets**.
- **Ours:** journée (daily) only — ❌ **G15: CA mensuel view** (CA TTC by month, per commercial, per client; compare vs optional target).

### `employes` / `employeFiche` / `employeAdd` / `employeDesactive`
- **What:** full employee account mgmt: 13 accounts, profiles administrateur|admin|commercial|Caissier|logisticiene; fiche = identity fields + level + secteur + matricule véhicule + plafond. "Suivre/Message" buttons (CRM-y, unused).
- **Ours:** `users` (CAISSIER/PROPRIETAIRE login) + `staff` (name-only attribution) — 🟡 **G16: employee profile page** (own fiche, PIN change, "mes ventes du jour"); richer roles = optional.

### `produitHist` — traçabilité
- ✅ covered (ProductHistoryModal, G6).

### `objectifsListe` — objectifs de vente 💀 (500)
- Sales targets per month shown on dashboard. → optional tracker item G24.

## G. POS & divers

### `posix` / `blAddPosix` — covered ✅ (`/pos`)
### `posixrecep` 💀 "Illegal argument to a regular expression" · `AchaPosix` 💀 8B — quick-purchase screens, dead upstream → G17: quick-receive mode (barcode-first BR) as our better version.
### `paiementClientAddFact`, `ticketPosixPAI`, `PaiementAddEdit`, `bRAddEdit`, `brPrint`, `blPrintANNULER`, `annulerAnnulation`, `clientAdd`, `marqueImport`, `clientImport`, `ExportListProduit`, `VenteClt`, `etiquet_*` — variants/sub-pages of covered features; etiquet_* empty 💀.
### `lockCompte` ✅ LockScreen (G10) · `logout` ✅

---

## Payment modes — full union observed
acompte · carte bancaire · cheque · effet · espece · virement · versement · avoir · ristourne
Ours: ESPECES · CHEQUE · EFFET_LCN · VIREMENT → **missing CARTE, VERSEMENT/ACOMPTE, AVOIR-as-payment, RISTOURNE** (G21).

## Employee roles observed
administrateur, admin, commercial, Caissier, logisticiene (13 accounts incl. duplicates) — ours: CAISSIER/PROPRIETAIRE logins + staff attribution.

## Data-pull anchors (for migration phase)
- `situationClients`: reste à payer total **697 910,50 Dh** (ventes 22.7M / réglé 22.0M) — top-level reconcile check.
- `CreditsClients`: per-BL open items (N° MVT = BL_nnn).
- `ListeChequesClts`: pending cheques w/ Num Pièce + Date Dépôt + Etat + payee name.
- Client ids 2001099–2001397 (~300 rows incl. heavy duplicates — legacy never deduped).
- Receptions = REC_n refs incl. bulk "INTEGRATION ... .CSV" intakes.
- "Ancien Solde" carryover: 407 829,17 Dh on dashboard.
