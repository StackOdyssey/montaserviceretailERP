# Questions ouvertes — décisions requises

Ces points attendent une décision du **comptable** ou du **propriétaire**. Le système
applique déjà, pour chacun, un comportement **sûr par défaut** (fail-closed ou inerte).
Aucune de ces décisions ne doit être tranchée par un développeur.

Registre de référence dans le code : `src/lib/open-questions.ts` (source de vérité unique,
également affichée dans **Paramètres → Décisions & Questions**).

| Code | Statut | Réponse retenue | Comportement appliqué |
| --- | --- | --- | --- |
| `DGI-e-invoicing` | Répondu | Ignorer pour l'instant (cible 1er janvier 2027) | Aucun envoi DGI ; export UBL 2.1 local |
| `Retention-Q4` | Répondu | 10 ans | Append-only, aucune purge applicative (lifecycle R2) |
| `Prix-negocie` | Répondu | Seul l'administrateur gère les prix | Prix hors catalogue refusé sauf motif tracé (PRIX_FIXE) |
| `Acomptes-Q19` | Répondu | Oui | Acomptes imputés automatiquement (FIFO) sur le nouveau document |
| `Side2-Q16-Q19` | Répondu | Annuler la vente des véhicules (Side 2) | Page /stock/vehicules supprimée ; seule la ligne PIECES reste |
| `Templates-Q13-Q16` | Répondu | Seule la remise est affichée ; TVA jamais affichée | Documents sans TVA, remise + total ; TVA paramétrable |
| `Identite-individuel-Q14` | Répondu | Champ pièce d'identité optionnel | Champ présent, non bloquant ; ICE seulement en B2B |

---

## 1. Périmètre et date d'entrée en vigueur de la facturation électronique DGI — `DGI-e-invoicing`

- **Contexte.** La DGI déploie progressivement la facturation électronique au Maroc ; le
  périmètre (obligation, format, plateforme) et la date d'obligation pour BM Motors ne sont
  pas confirmés.
  Reponse : ignore l'étape pour l'instant
- **Impact.** Détermine si, quand et sous quel format le système devra transmettre les
  factures à la DGI (API, dépôt de fichiers, UBL…).
  Reponse : ignore l'étape pour l'instant
- **Décision requise.** Confirmer le périmètre et la date d'entrée en vigueur **avant toute
  intégration**.
  1 Jan 2027
- **Défaut appliqué (sûr).** Readiness uniquement : aucun envoi réseau. L'export UBL 2.1 est
  généré localement et l'intégration est désactivée (variable `DGI_ENABLED` absente =
  désactivée).
  Reponse : ignore l'étape pour l'instant
- **Câblage.** `src/lib/actions/dgi.ts` (`getDocumentUbl`, `isDgiIntegrationEnabled`),
  `src/lib/ubl.ts`.

## 2. Durée de conservation des archives (§9 Q4) — `Retention-Q4`

- **Contexte.** La durée légale de conservation (documents comptables, pièces, exports) est
  contradictoire entre les sources et doit être tranchée.
  Reponse : 10 ans
- **Impact.** Détermine la politique de purge/archivage : combien de temps on conserve,
  quand on supprime, et sous quel verrouillage.
  Reponse : 10 ans
- **Décision requise.** Trancher la durée de conservation **avant de durcir** l'archivage de
  la Phase 9. 
  Reponse : 10 ans
- **Défaut appliqué (sûr).** Append-only : aucune suppression ni purge automatique. Les
  manifestes d'archivage (SHA-256) sont conservés indéfiniment ; les suppressions sont
  logiques (soft-delete).
- **Câblage.** `scripts/backup-to-r2.mjs` (ignore toute demande de purge),
  `src/lib/actions/dgi.ts` (`createArchiveManifest`).

## 3. Politique de prix négocié (« prix fixé » audité) — `Prix-negocie`

- **Contexte.** Les prix sont résolus côté serveur depuis la base (prix de détail / gros). Un
  vendeur peut-il fixer un prix hors catalogue, et sous quelles conditions ?
  réponse : Seul l'administrateur gére les prix
- **Impact.** Détermine s'il faut autoriser une saisie de prix manuelle, la journaliser, et à
  qui l'autoriser.
réponse : oui et Seul l'administrateur gére les prix
- **Décision requise.** Choisir : prix catalogue imposé, ou prix négocié autorisé avec motif
  tracé dans le journal d'audit.
  réponse : Seul l'administrateur gére les prix
- **Défaut appliqué (sûr).** Fail-closed : un prix hors catalogue (≠ détail et ≠ gros) est
  refusé sauf si un motif d'override est fourni ; l'override est journalisé (`PRIX_FIXE`).
  réponse : Seul l'administrateur gére les prix
- **Câblage.** `src/lib/actions/sales.ts` (`createSalesDocument`, garde `PRIX_HORS_CATALOGUE`).

## 4. Acomptes clients (Side 2) et fait générateur de TVA (Q19) — `Acomptes-Q19`

- **Contexte.** Sur les commandes de véhicules (Side 2), un acompte peut être versé avant
  facturation. Le moment de l'exigibilité de la TVA dépend du régime (`vat_regime`).
- **Impact.** Détermine le rattachement acompte ↔ facture, la date de TVA et l'impact sur les
  états.
- **Décision requise.** Confirmer si l'on gère les acomptes au démarrage et leur traitement
  TVA selon `vat_regime`.
  oui
- **Défaut appliqué (sûr).** Non implémenté : aucun encaissement d'acompte avant facturation ;
  la TVA est assise sur les documents validés uniquement.
- **Câblage.** `src/lib/actions/sales.ts` (modèle document), à câbler avec `settings.vat_regime`.

## 5. Champs à collecter pour les véhicules (Side 2) — `Side2-Q16-Q19` 

- **Contexte.** La vente de véhicules nécessite des champs spécifiques non confirmés (numéro de
  série/VIN, garantie, date de livraison, accessoires, caution éventuelle).
- **Impact.** Détermine le schéma des lignes/documents Side 2 et les mentions imprimées.
- **Décision requise.** Lister précisément les champs obligatoires et optionnels (Q16/Q19).
répose : annule la vente des véhicule (side 2) dans le project
- **Défaut appliqué (sûr).** Champs non collectés : la saisie se limite aux pièces communes.
- **Câblage.** `src/db/schema.ts` (`sales_lines.stock_unit_id`), `src/app/stock/vehicules`.

## 6. Réponses propriétaire Q13–Q16 : modèles d'impression — `Templates-Q13-Q16`

- **Contexte.** L'apparence et le contenu exacts des documents imprimés (devis, BC, BL,
  facture, avoir) dépendent des réponses Q13 à Q16.
- **Impact.** Détermine la mise en page finale et les mentions légales/commerciales.
- **Décision requise.** Obtenir les réponses Q13–Q16 pour figer les modèles.
- **Défaut appliqué (sûr).** Modèle provisoire §6A : TVA masquable uniquement sur BL/BC/DEVIS
  (PIECES) ; FAC et AV affichent toujours HT/TVA/TTC ; bloc société issu de `settings`.
  réponse : seulement la remise est affiché sur les documents (BL, FAC, BC, DEVIS, AV) TVA saisié dans le settings mais pas affichable sur les documents : 
  model de document à utiliser : C:\Dev\ERP_System\References_\Model_facture
- **Câblage.** `src/components/sales/DocumentPrintView.tsx`.

## 7. Champs d'identité minimaux des particuliers (CNDP) — `Identite-individuel-Q14`

- **Contexte.** Collecter un numéro de pièce d'identité pour un particulier peut poser une
  question de conformité (CNDP / protection des données).
- **Impact.** Détermine les champs obligatoires d'une fiche particulier et ce qui est imprimé.
- **Décision requise.** Confirmer si un numéro de pièce d'identité est requis, ou si le minimum
  (nom, téléphone) suffit (Q14).
  ajoute le champs pièce d'identité mais rend le optionel comme ça si il n'est pas saisie il ne bloque pas l'enregistrement du client dans la base de donnée
- **Défaut appliqué (sûr).** Minimum collecté : nom + téléphone (nom seul obligatoire). Aucun
  numéro d'identité demandé pour un particulier ; ICE obligatoire uniquement pour un
  professionnel (B2B).
- **Câblage.** `src/components/customers/CustomerModal.tsx`, `src/lib/actions/customers.ts`.
