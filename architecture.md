# ARCHITECTURE TECHNIQUE & GUIDE DE MODULARISATION : ERP BM MOTORS
**Document de Référence pour Agents IA & Ingénieurs Développeurs**  
**Cible :** `c:\Dev\ERP_System` & `c:\Dev\ERP_System\erp-inventory`  
**Pattern :** Monolithe Modulaire (Modular Monolith / Domain-Driven Isolation)  
**Objectif :** Évolutivité sans friction, réutilisabilité maximale et interdiction stricte du couplage spaghetti.

> **Statut (2026-10-17) : architecture CIBLE, non appliquée.** Le code actuel vit dans `erp-inventory/src/lib/actions/*.ts` (Server Actions par domaine) et `src/lib/*` (logique pure). La migration est incrémentale, sans refactor « big-bang » : premier noyau partagé = `src/lib/stock-lock.ts` + `src/lib/stock.ts` (futur `inventoryService`). Les règles ci-dessous s'appliquent au code nouveau ; l'existant y converge au fil des chantiers.

---

## 1. VISION & PRINCIPES FONDAMENTAUX D'ARCHITECTURE

Un ERP de distribution et de gestion commerciale (grossiste/détail moto au Maroc) ne doit **JAMAIS** devenir un monolithe spaghetti où chaque fichier importe directement les données et les tables des autres.

### Les 4 Règles d'Or Inviolables
1. **Règle de l'Isolation Modulaire (Single Ownership) :**
   Chaque domaine métier (Stocks, Ventes, Fournisseurs, Trésorerie, etc.) est encapsulé dans un **Module Autonome**. Un module possède ses propres modèles de données, sa logique métier, ses Server Actions et ses composants d'interface.
2. **Règle de l'Interface Publique (`index.ts` / Barrel Export) :**
   Un module extérieur n'a le droit d'importer des éléments d'un autre module que via le fichier `index.ts` racine de ce module. **Tout accès à des fichiers internes (`/internal/`, `/service.ts`, `/queries.ts`) depuis un autre module est strictement interdit.**
3. **Règle d'Intégrité de Base de Données (No Cross-Table Mutations) :**
   Un module ne modifie **JAMAIS** directement les tables SQL d'un autre module. Par exemple, le module Ventes ne fait pas de `UPDATE products SET current_stock = ...`. Il invoque le service public du module Stock : `inventoryService.recordMovement(...)`.
4. **Règle de Découplage de la Présentation (App Router Minima) :**
   Les dossiers dans `src/app/*` ne doivent contenir **aucune logique métier ni aucune requête SQL directe**. Ils ne font que consommer les Server Actions et assembler les composants fournis par les modules respectifs.

---

## 2. STRUCTURE CIBLE DU CODE SOURCE (`src/modules/`)

L'architecture migre vers une organisation modulaire stricte :

```
src/
├── core/                           # [Kernel Partagé] Utilitaires universels & infrastructure
│   ├── db/                         # Client Neon Drizzle & configuration pooler
│   ├── auth/                       # Gardes de session & authentification
│   ├── env/                        # Validation Zod des variables d'environnement
│   ├── money/                      # Logique pure de calcul en centimes (MAD)
│   ├── sequences/                  # Compteur atomique de numérotation légale (Gapless)
│   └── errors/                     # Classes d'erreurs standardisées (DomainError, UnauthorizedError)
│
├── modules/                        # [Domaines Métier Découplés]
│   ├── inventory/                  # Module 1 : Catalogue, Stock & Moteur CMUP
│   ├── sales/                      # Module 2 : Ventes, Devis, BL, Factures & Comptoir
│   ├── customers/                  # Module 3 : Répertoire Clients, Soldes & Créances
│   ├── purchasing/                 # Module 4 : Fournisseurs, Bons de Réception (BR) & Import
│   ├── treasury/                   # Module 5 : Règlements, Caisse, Chèques & Effets LCN
│   ├── expenses/                   # Module 6 : Dépenses opérationnelles & Charges
│   ├── accounting/                 # Module 7 : Fiscalité (TVA), P&L, Grand Livre & Bilan
│   ├── settings/                   # Module 8 : Lignes Métier, Paramètres Magasin
│   └── communications/             # Module 9 : Génération PDF & Envois d'e-mails (Resend)
│
├── components/                     # [Composants UI Communs / Design System]
│   ├── ui/                         # Boutons, Modales, Badges, Inputs réutilisables
│   └── layout/                     # AppShell, Navigation latérale, En-tête
│
└── app/                            # [Next.js App Router - Simple Couche de Routing]
    ├── (auth)/login/
    ├── stock/
    ├── ventes/
    ├── reglements/
    ├── fournisseurs/
    ├── depenses/
    ├── comptabilite/
    └── parametres/
```

---

## 3. ANATOMIE STANDARD D'UN MODULE

Chaque module situé dans `src/modules/<nom>/` doit suivre rigoureusement la structure interne suivante :

```
src/modules/inventory/
├── schema.ts         # Définitions de tables Drizzle appartenant à ce domaine
├── types.ts          # Interfaces DTOs, Enums et types du domaine
├── service.ts        # Moteur métier pur et logique transactionnelle (indépendant de React)
├── actions.ts        # Server Actions ("use server") sécurisées par action-guard
├── components/       # Composants React spécifiques à ce domaine (formulaires, tableaux)
│   ├── ProductTable.tsx
│   └── StockAdjustmentModal.tsx
└── index.ts          # Contrat d'interface publique du module (Seul point d'entrée autorisé)
```

### Exemple de Contrat Public (`index.ts`)
```typescript
// src/modules/inventory/index.ts
// ✅ UNIQUEMENT ce qui est exporté ici est accessible par les autres modules !

export * from "./types";
export { getProducts, getProductById, saveProduct } from "./actions";
export { inventoryService } from "./service"; // Utilisé par sales et purchasing
export { ProductPickerModal } from "./components/ProductPickerModal";
```

---

## 4. CARTOGRAPHIE DÉTAILLÉE DES 9 MODULES MÉTIER

### Module 1 : `inventory` (Catalogue, Pièces & Stocks)
- **Responsabilité Unique :** Gérer les références produits, les pièces détachées, la catégorisation, l'inventaire physique, le grand livre des mouvements (`stock_movements`) et la valorisation CMUP.
- **Tables Drizzle Détenues :**
  - `products`, `categories`, `stock_movements`, `stock_counts`, `stock_count_lines`.
- **Services Clés :**
  - `inventoryService.recordMovement(tx, { productId, quantity, movementType, unitCostCents, reason })`
  - `inventoryService.calculateCmup(productId)`
  - `inventoryService.verifyStockAvailability(productId, requestedQty)`
- **Interdictions :**
  - Ne doit pas manipuler de factures ou de clients.

---

### Module 2 : `sales` (Ventes, Comptoir & Facturation)
- **Responsabilité Unique :** Gérer le cycle de vente (Devis ➔ Bon de Commande ➔ Bon de Livraison ➔ Facture ➔ Avoir).
- **Tables Drizzle Détenues :**
  - `sales_documents`, `sales_document_lines`.
- **Services Clés :**
  - `salesService.createDocument(data)` : Transaction atomique qui crée le document, réserve la numérotation via `core/sequences` et demande la sortie de stock à `inventoryService`.
  - `salesService.convertBlToInvoice(blId)`
- **Dépendances Légitimes Autorisées :**
  - `inventory` (pour vérifier le stock et créer les mouvements de sortie).
  - `customers` (pour vérifier le crédit et associer la vente).
  - `treasury` (pour enregistrer l'encaissement comptoir immédiat).

---

### Module 3 : `customers` (CRM, Répertoire & Créances)
- **Responsabilité Unique :** Gestion de la fiche client (Raison sociale, ICE, Téléphone, Ville, Plafond de crédit autorisé), calcul en direct du solde dû et de l'historique d'achat.
- **Tables Drizzle Détenues :**
  - `customers`.
- **Services Clés :**
  - `customerService.getAccountStatement(customerId)`
  - `customerService.checkCreditLimit(customerId, newOrderAmountCents)`
- **Interdictions :**
  - Ne crée pas de documents de vente ; ne modifie pas les stocks.

---

### Module 4 : `purchasing` (Fournisseurs, Arrivages & Bons de Réception)
- **Responsabilité Unique :** Gestion des fournisseurs (fabricants Chine Bashan, grossistes Derb Omar), Bons de Réception (BR), dédouanement et réassortiment de stock.
- **Tables Drizzle Détenues :**
  - `suppliers`, `supplier_receipts`, `supplier_receipt_lines`.
- **Services Clés :**
  - `purchasingService.receiveShipment(receiptData)` : Transaction atomique créant le BR et déclenchant une entrée positive valorisée dans `inventoryService` pour recalculer le CMUP.
- **Dépendances Légitimes :**
  - `inventory` (mise à jour du stock et calcul du CMUP).
  - `treasury` (enregistrement des paiements fournisseurs).

---

### Module 5 : `treasury` (Trésorerie, Règlements & Effets de Commerce)
- **Responsabilité Unique :** Gestion des encaissements clients et décaissements fournisseurs, gestion des modes de règlement marocains (Espèces, Chèques, Effets LCN, Virement), suivi des statuts (`EN_PORTEFEUILLE`, `DEBITE`, `IMPAYE`).
- **Tables Drizzle Détenues :**
  - `customer_payments`, `supplier_payments`, `cash_registers`.
- **Services Clés :**
  - `treasuryService.recordPayment(paymentData)`
  - `treasuryService.reconcileCheckOrDraft(paymentId, status)`
  - `treasuryService.getDailyCashBalance(date)`

---

### Module 6 : `expenses` (Charges d'Exploitation & Dépenses)
- **Responsabilité Unique :** Saisie et catégorisation des charges d'exploitation (Loyer, électricité, transport, fournitures, salaires) avec justificatifs et TVA déductible.
- **Tables Drizzle Détenues :**
  - `expenses`, `expense_categories`.
- **Services Clés :**
  - `expenseService.recordExpense(data)`
  - `expenseService.getMonthExpensesTotal()`

---

### Module 7 : `accounting` (Fiscalité TVA, P&L & Déclarations)
- **Responsabilité Unique :** Consolidation financière pour l'expert-comptable de BM Motors (TVA collectée vs déductible, calcul de marge brute réelle, compte de résultat analytique).
- **Tables Détenues :** Vues et tables de clôture comptable.
- **Services Clés :**
  - `accountingService.generateTvaReturn(month, year)` : Calcule la TVA à reverser selon le taux légal (20% pour les pièces).
  - `accountingService.getIncomeStatement(period)`
- **Interaction :** Consomme en lecture seule les interfaces de `sales`, `purchasing`, `expenses`.

---

### Module 8 : `settings` (Lignes Métier & Configuration Système)
- **Responsabilité Unique :** Configuration globale de l'entreprise (Lignes métier : Vente Pièces vs Véhicules, taux de TVA applicables, mentions légales, coordonnées magasin).
- **Tables Drizzle Détenues :**
  - `business_lines`, `system_parameters`, `store_profiles`.
- **Services Clés :**
  - `settingsService.getParameter(key)`
  - `settingsService.getActiveBusinessLine(code)`

---

### Module 9 : `communications` (Édition de Documents & Envoi d'E-mails)
- **Responsabilité Unique :** Moteur d'impression PDF (Bons de Livraison, Factures conformes DGI) et envoi automatisé via l'API Resend.
- **Tables Drizzle Détenues :**
  - `email_logs`.
- **Services Clés :**
  - `communicationService.sendDocumentByEmail(docType, docId, recipientEmail)`
  - `communicationService.generatePdfStream(docType, docId)`

---

## 5. RÈGLES DE COLLABORATION INTER-MODULES (PATTERNS TRANSACTIONNELS)

### Cas d'Usage : Validation d'un Bon de Livraison avec Sortie de Stock
Lorsque le module `sales` doit valider une vente et impacter le stock :

```
Client (Navigateur)
       │
       ▼ [RPC Server Action]
src/modules/sales/actions.ts : createSalesDocument()
       │
       ▼ [Vérification Session]
src/core/auth : assertAuthenticated()
       │
       ▼ [Exécution Métier]
src/modules/sales/service.ts : salesService.createDocument()
       │
       ├─► tx.execute(core/sequences : getNextSequenceNumber("BL", 2026))
       │
       ├─► tx.insert(sales_documents + sales_document_lines)
       │
       ├─► inventoryService.recordMovement(tx, { productId, quantity: -line.qty, ... })
       │      │
       │      └─► tx.insert(stock_movements)
       │      └─► tx.update(products : currentStock = currentStock - line.qty)
       │
       └─► treasuryService.recordImmediateCounterPayment(tx, paymentData) [Si payé cash]
```

> **Règle Cruciale :** Toutes ces opérations s'exécutent au sein du **même contexte de transaction PostgreSQL (`tx`)**. Si l'une d'elles échoue (ex: stock insuffisant ou erreur de numérotation), **toute la transaction est annulée (ROLLBACK complet)**.

---

## 6. MATRICE DES DÉPENDANCES AUTORISÉES (ANTI-SPAGHETTI)

Cette matrice définit quels modules ont le droit d'importer quels autres modules :

| Module Appelant | `core` | `inventory` | `customers` | `sales` | `purchasing` | `treasury` | `expenses` | `accounting` | `settings` | `communications` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`inventory`** | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **`customers`** | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`sales`** | ✅ | ✅ | ✅ | — | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **`purchasing`**| ✅ | ✅ | ❌ | ❌ | — | ✅ | ❌ | ❌ | ✅ | ❌ |
| **`treasury`** | ✅ | ❌ | ✅ | ✅ (ID) | ✅ (ID)| — | ❌ | ❌ | ❌ | ❌ |
| **`expenses`** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | — | ❌ | ✅ | ❌ |
| **`accounting`**| ✅ | ✅ (Read)| ✅ (Read)| ✅ (Read)| ✅ (Read)| ✅ (Read)| ✅ (Read)| — | ✅ | ❌ |
| **`settings`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ |
| **`communications`** | ✅ | ❌ | ✅ (Read) | ✅ (Read) | ✅ (Read) | ❌ | ❌ | ❌ | ✅ | — |

*(Légende : ✅ = Import autorisé via `index.ts` uniquement | ❌ = Import formellement interdit)*

**Règle `communications` :** le module lit (lecture seule) le destinataire (`customers`), le document à imprimer/envoyer (`sales`), le fournisseur ou le BR (`purchasing`) et l'identité société / en-tête (`settings`). **Aucun module métier n'importe `communications`** (colonne entièrement ❌) : l'envoi d'un e-mail ou la génération d'un PDF est orchestré par la couche `app/` (Server Action de page) ou par un événement, jamais par un service métier. Cela évite les cycles `sales ⇄ communications` et `purchasing ⇄ communications`.

---

## 7. CONSIGNES STRICTES POUR L'AGENT IA DORS ET DÉJÀ EN CHARGE DU CODE

L'agent IA développeur doit respecter les règles suivantes à chaque modification :

1. **Ne créez jamais de Server Action orpheline dans `src/lib/actions/` :** Toute nouvelle action doit appartenir à son module dédié (`src/modules/<nom>/actions.ts`).
2. **Ne stockez jamais d'état dans une variable mémoire JS :** Aucune variable `let memoryItems = []` n'est acceptée. Tout état réside dans PostgreSQL via Drizzle.
3. **Protégez systématiquement chaque Server Action :** Utilisez `authenticatedAction(...)` ou `assertAuthenticated()` au début de chaque fonction.
4. **Isolez la logique métier dans `service.ts` :** Les fichiers `actions.ts` ne font que valider les entrées et appeler `service.ts`. Ils ne doivent pas contenir de requêtes SQL brutes réparties partout.
5. **Respectez l'étanchéité des modules :** Si le module Vente a besoin d'une information de stock, demandez-la à `inventoryService.ts`. N'allez jamais écrire de requête SQL qui tape sur `products` directement depuis `sales`.

---
*Ce document sert de contrat d'architecture inviolable pour tout développement sur le projet ERP BM Motors.*
