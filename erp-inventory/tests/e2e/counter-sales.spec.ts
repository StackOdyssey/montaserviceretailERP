import { test, expect } from "@playwright/test";

test.describe("Parcours Vente Comptoir, Remise %, BL & A4 sur iPhone 17 Pro Max", () => {
  test("1. Le tableau de bord et le PWA shell s'affichent correctement en français", async ({
    page,
  }) => {
    await page.goto("/");
    // Vérification de la langue stricte 100% française et des KPI
    await expect(page).toHaveTitle(/BM Motors/);
    await expect(page.locator("h1")).toContainText("Tableau de Bord & Comptoir");
    await expect(page.getByText("Ventes du Jour (TTC)")).toBeVisible();
    await expect(page.getByText("SARL BM Motors")).toBeVisible();
  });

  test("2. Création rapide d'un Bon de Livraison au comptoir avec Remise personnalisée en %", async ({
    page,
  }) => {
    await page.goto("/ventes/nouveau");

    // Vérifier l'écran de caisse POS
    await expect(page.locator("h1")).toContainText("Caisse & Nouveau Bon de Livraison");

    // 1. Ajouter un article du catalogue au panier
    const addFirstItemButton = page.locator("button:has-text('Ajouter')").first();
    await expect(addFirstItemButton).toBeVisible();
    await addFirstItemButton.click();

    // 2. Vérifier que l'article est présent dans le panier
    await expect(page.getByText("Panier en cours")).toBeVisible();

    // 3. Modifier la remise personnalisée à 10%
    const remiseInput = page.locator("input[placeholder='0']").first();
    if (await remiseInput.isVisible()) {
      await remiseInput.fill("10");
    }

    // 4. Vérifier les blocs de calcul obligatoires sous le Total Brut HT
    await expect(page.getByText("Total Brut HT")).toBeVisible();
    await expect(page.getByText("TVA (10%)")).toBeVisible();
    await expect(page.getByText("Total TTC (Net à payer)")).toBeVisible();

    // 5. Sélectionner le mode de règlement (Espèces ou À Crédit)
    const especesBtn = page.getByRole("button", { name: "Espèces" });
    if (await especesBtn.isVisible()) {
      await especesBtn.click();
    }

    // 6. Valider le Bon de Livraison
    const validateBtn = page.getByRole("button", { name: /Valider & Émettre le BL/i });
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();

    // 7. Vérifier que la modale d'impression A4 et de partage apparaît
    await expect(page.getByText("BON DE LIVRAISON")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Imprimer A4")).toBeVisible();
    await expect(page.getByText("WhatsApp")).toBeVisible();
  });

  test("3. Le module Règlements Clients affiche les soldes et l'échéancier des chèques", async ({
    page,
  }) => {
    await page.goto("/reglements");
    await expect(page.locator("h1")).toContainText("Règlements & Crédits Clients");
    await expect(page.getByText("Créances Clients Totales")).toBeVisible();
    await expect(page.getByText("Chèques & Effets en portefeuille")).toBeVisible();

    // Cliquer sur l'onglet Échéancier
    await page.getByRole("button", { name: /Échéancier Chèques/i }).click();
    await expect(page.getByText("Gestion du portefeuille d'effets")).toBeVisible();
  });

  test("4. Le module Comptabilité & TVA affiche les calculs et permet l'export", async ({
    page,
  }) => {
    await page.goto("/comptabilite");
    await expect(page.locator("h1")).toContainText("Rapports, Marges & Export TVA 10%");
    await expect(page.getByText("TVA Collectée (10%)")).toBeVisible();
    await expect(page.getByText("TVA Déductible (10%)")).toBeVisible();
    await expect(page.getByText("Exporter CSV Comptable")).toBeVisible();
  });
});
