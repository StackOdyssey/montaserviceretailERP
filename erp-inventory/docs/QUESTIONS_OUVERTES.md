# Questions ouvertes — décisions requises

Ces points attendent une décision du **comptable** ou du **propriétaire**. Le système
applique déjà, pour chacun, un comportement **sûr par défaut** (fail-closed ou inerte).
Aucune de ces décisions ne doit être tranchée par un développeur.

Registre de référence dans le code : `src/lib/open-questions.ts` (source de vérité unique,
également affichée dans **Paramètres → Décisions & Questions**).

| Code | Statut | Comportement appliqué par défaut |
| --- | --- | --- |
| `DGI-e-invoicing` | Bloquant | Aucun envoi vers la DGI ; export UBL 2.1 local uniquement |
| `Retention-Q4` | Bloquant | Archivage append-only, aucune purge, soft-delete seulement |
| `Prix-negocie` | À décider | Prix hors catalogue refusé sauf motif tracé (PRIX_FIXE) |
| `Acomptes-Q19` | À décider | Acomptes non gérés ; TVA assise sur documents validés |
| `Side2-Q16-Q19` | À décider | Champs véhicule spécifiques non collectés |
| `Templates-Q13-Q16` | À décider | Modèle provisoire §6A |
| `Identite-individuel-Q14` | À décider | Particulier : nom + téléphone seulement, sans pièce d'identité |

---

## 1. Périmètre et date d'entrée en vigueur de la facturation électronique DGI — `DGI-e-invoicing`

- **Contexte.** La DGI déploie progressivement la facturation électronique au Maroc ; le
  périmètre (obligation, format, plateforme) et la date d'obligation pour BM Motors ne sont
  pas confirmés.
- **Impact.** Détermine si, quand et sous quel format le système devra transmettre les
  factures à la DGI (API, dépôt de fichiers, UBL…).
- **Décision requise.** Confirmer le périmètre et la date d'entrée en vigueur **avant toute
  intégration**.
- **Défaut appliqué (sûr).** Readiness uniquement : aucun envoi réseau. L'export UBL 2.1 est
  généré localement et l'intégration est désactivée (variable `DGI_ENABLED` absente =
  désactivée).
- **Câblage.** `src/lib/actions/dgi.ts` (`getDocumentUbl`, `isDgiIntegrationEnabled`),
  `src/lib/ubl.ts`.

## 2. Durée de conservation des archives (§9 Q4) — `Retention-Q4`

- **Contexte.** La durée légale de conservation (documents comptables, pièces, exports) est
  contradictoire entre les sources et doit être tranchée.
- **Impact.** Détermine la politique de purge/archivage : combien de temps on conserve,
  quand on supprime, et sous quel verrouillage.
- **Décision requise.** Trancher la durée de conservation **avant de durcir** l'archivage de
  la Phase 9.
- **Défaut appliqué (sûr).** Append-only : aucune suppression ni purge automatique. Les
  manifestes d'archivage (SHA-256) sont conservés indéfiniment ; les suppressions sont
  logiques (soft-delete).
- **Câblage.** `scripts/backup-to-r2.mjs` (ignore toute demande de purge),
  `src/lib/actions/dgi.ts` (`createArchiveManifest`).

## 3. Politique de prix négocié (« prix fixé » audité) — `Prix-negocie`

- **Contexte.** Les prix sont résolus côté serveur depuis la base (prix de détail / gros). Un
  vendeur peut-il fixer un prix hors catalogue, et sous quelles conditions ?
- **Impact.** Détermine s'il faut autoriser une saisie de prix manuelle, la journaliser, et à
  qui l'autoriser.
- **Décision requise.** Choisir : prix catalogue imposé, ou prix négocié autorisé avec motif
  tracé dans le journal d'audit.
- **Défaut appliqué (sûr).** Fail-closed : un prix hors catalogue (≠ détail et ≠ gros) est
  refusé sauf si un motif d'override est fourni ; l'override est journalisé (`PRIX_FIXE`).
- **Câblage.** `src/lib/actions/sales.ts` (`createSalesDocument`, garde `PRIX_HORS_CATALOGUE`).

## 4. Acomptes clients (Side 2) et fait générateur de TVA (Q19) — `Acomptes-Q19`

- **Contexte.** Sur les commandes de véhicules (Side 2), un acompte peut être versé avant
  facturation. Le moment de l'exigibilité de la TVA dépend du régime (`vat_regime`).
- **Impact.** Détermine le rattachement acompte ↔ facture, la date de TVA et l'impact sur les
  états.
- **Décision requise.** Confirmer si l'on gère les acomptes au démarrage et leur traitement
  TVA selon `vat_regime`.
- **Défaut appliqué (sûr).** Non implémenté : aucun encaissement d'acompte avant facturation ;
  la TVA est assise sur les documents validés uniquement.
- **Câblage.** `src/lib/actions/sales.ts` (modèle document), à câbler avec `settings.vat_regime`.

## 5. Champs à collecter pour les véhicules (Side 2) — `Side2-Q16-Q19`

- **Contexte.** La vente de véhicules nécessite des champs spécifiques non confirmés (numéro de
  série/VIN, garantie, date de livraison, accessoires, caution éventuelle).
- **Impact.** Détermine le schéma des lignes/documents Side 2 et les mentions imprimées.
- **Décision requise.** Lister précisément les champs obligatoires et optionnels (Q16/Q19).
- **Défaut appliqué (sûr).** Champs non collectés : la saisie se limite aux pièces communes.
- **Câblage.** `src/db/schema.ts` (`sales_lines.stock_unit_id`), `src/app/stock/vehicules`.

## 6. Réponses propriétaire Q13–Q16 : modèles d'impression — `Templates-Q13-Q16`

- **Contexte.** L'apparence et le contenu exacts des documents imprimés (devis, BC, BL,
  facture, avoir) dépendent des réponses Q13 à Q16.
- **Impact.** Détermine la mise en page finale et les mentions légales/commerciales.
- **Décision requise.** Obtenir les réponses Q13–Q16 pour figer les modèles.
- **Défaut appliqué (sûr).** Modèle provisoire §6A : TVA masquable uniquement sur BL/BC/DEVIS
  (PIECES) ; FAC et AV affichent toujours HT/TVA/TTC ; bloc société issu de `settings`.
- **Câblage.** `src/components/sales/DocumentPrintView.tsx`.

## 7. Champs d'identité minimaux des particuliers (CNDP) — `Identite-individuel-Q14`

- **Contexte.** Collecter un numéro de pièce d'identité pour un particulier peut poser une
  question de conformité (CNDP / protection des données).
- **Impact.** Détermine les champs obligatoires d'une fiche particulier et ce qui est imprimé.
- **Décision requise.** Confirmer si un numéro de pièce d'identité est requis, ou si le minimum
  (nom, téléphone) suffit (Q14).
- **Défaut appliqué (sûr).** Minimum collecté : nom + téléphone (nom seul obligatoire). Aucun
  numéro d'identité demandé pour un particulier ; ICE obligatoire uniquement pour un
  professionnel (B2B).
- **Câblage.** `src/components/customers/CustomerModal.tsx`, `src/lib/actions/customers.ts`.
