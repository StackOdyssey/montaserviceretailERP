# POS Tiers — Guide caissier (1 page)

## Vente au comptoir (sans fiche)
1. Laissez `Client Comptoir Particulier`.
2. Validez en `BL` + `Espèces` uniquement.
3. `FACTURE`, `Chèque`, `Crédit` sont bloqués sans fiche — c'est normal.

## Client existant
1. Bouton client → tapez nom, tél, ville ou ICE (recherche auto).
2. Vérifiez ville + solde + plafond, cliquez pour sélectionner.
3. `Confirmer le client`, puis encaissez.

## Nouveau client (sans quitter la caisse)
1. Bouton client → tapez nom + téléphone* + ville.
2. Cochez `Professionnel` si société → ICE 15 chiffres obligatoire.
3. `Créer la fiche sans quitter la caisse`.
4. Si `Doublon potentiel` → cliquez `Sélectionner` au lieu de recréer.
5. Le panier est conservé. En cas d'annulation, rouvrez le bouton client.

## Fournisseur / arrivage (BR)
1. `Nouvel Arrivage (BR)` → recherchez le fournisseur.
2. Introuvable → `Nouveau fournisseur ici` (nom* + contact/tél/ville/ICE).
3. Si doublon proposé → sélectionnez-le.
4. Sans fiche, `Valider l'entrée en stock` reste désactivé. Jamais de BR anonyme.

## Règles à retenir
- Comptoir = espèces + BL/BC uniquement.
- Crédit/chèque/virement/FACTURE = fiche obligatoire.
- Pro = ICE 15 chiffres, sinon FACTURE bloquée.
- Téléphone obligatoire à la création (anti-doublon).
- Créations POS tracées (audit `CREATION_CLIENT` / `CREATION_FOURNISSEUR`).
- Doublons importés : utilisez la fusion (`mergeCustomers` / `mergeSuppliers`), ne recréez pas.
