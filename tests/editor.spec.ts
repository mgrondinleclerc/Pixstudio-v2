import { test, expect } from "@playwright/test";

test("créer, modifier et prévisualiser un cours", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();
  await expect(page.getByText("Votre page est prête")).toBeVisible();
  await page.getByRole("button", { name: /Titre/ }).click();
  await page.getByRole("button", { name: /Texte/ }).click();
  await page.getByLabel("Texte").fill("Un texte pédagogique vérifiable.");
  const previewPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Aperçu/ }).click();
  const preview = await previewPromise;
  await preview.waitForLoadState();
  await expect(preview.getByText("Un texte pédagogique vérifiable.")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Fermer" })).toBeVisible();
  const previewClosed = preview.waitForEvent("close");
  await preview.getByRole("button", { name: "Fermer" }).click();
  await previewClosed;
  await expect(page.locator(".scene-block")).toHaveCount(2);
});

test("ajouter une table des matières et naviguer dans l’aperçu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();
  await page.getByTitle("Ajouter une page").click();
  await page.getByLabel("Titre de la page").fill("Évaluation finale");
  await page.getByLabel("Titre de la page").press("Enter");
  await page.getByRole("button", { name: /Texte/ }).click();
  await page.getByLabel("Texte").fill("Votre résultat est prêt.");
  await page.getByTitle("Ajouter une page").click();
  await page.getByLabel("Titre de la page").fill("Récapitulatif");
  await page.getByLabel("Titre de la page").press("Enter");
  await page.getByTitle("Ajouter une page").click();
  await page.getByLabel("Titre de la page").fill("Conclusion");
  await page.getByLabel("Titre de la page").press("Enter");

  const settingsPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Table des matières" }).click();
  const settings = await settingsPromise;
  await settings.waitForLoadState();
  await expect(settings.getByText("Guidez les apprenants dans leur parcours.")).toBeVisible();
  await expect(settings.getByRole("button", { name: "Fermer" })).toBeVisible();
  const tocToggle = settings.locator(".toc-switch");
  await tocToggle.click();
  await expect(tocToggle).toHaveAttribute("aria-pressed", "true");
  const tocTitle = settings.getByLabel("Titre de la table des matières");
  await tocTitle.fill("Plan du cours");
  await tocTitle.press("Enter");
  await expect(tocTitle).toHaveValue("Plan du cours");
  const firstLabel = settings.getByLabel("Nom dans la table des matières pour Bienvenue");
  await firstLabel.fill("Introduction");
  await firstLabel.blur();
  const secondRow = settings.locator(".toc-page-selection-row").nth(1);
  const secondIndentButton = secondRow.locator(".toc-page-level-button.indent");
  const secondOutdentButton = secondRow.locator(".toc-page-level-button.outdent");
  await secondIndentButton.click();
  await expect(secondRow).toHaveCSS("margin-left", "18px");
  await secondOutdentButton.click();
  await expect(secondRow).toHaveCSS("margin-left", "0px");
  await secondIndentButton.click();
  await expect(secondRow).toHaveCSS("margin-left", "18px");

  const thirdRow = settings.locator(".toc-page-selection-row").nth(2);
  const thirdIndentButton = thirdRow.locator(".toc-page-level-button.indent");
  await thirdIndentButton.click();
  await expect(thirdRow).toHaveCSS("margin-left", "18px");
  await thirdIndentButton.click();
  await expect(thirdRow).toHaveCSS("margin-left", "36px");

  const fourthRow = settings.locator(".toc-page-selection-row").nth(3);
  const fourthIndentButton = fourthRow.locator(".toc-page-level-button.indent");
  await fourthIndentButton.click();
  await expect(fourthRow).toHaveCSS("margin-left", "18px");
  await fourthIndentButton.click();
  await expect(fourthRow).toHaveCSS("margin-left", "36px");
  await expect(settings.locator(".toc-page-selection-row").nth(2)).toHaveCSS("margin-left", "36px");
  await settings.locator(".toc-page-selection-row").nth(2).locator(".toc-page-check").click();
  const settingsClosed = settings.waitForEvent("close");
  await settings.getByRole("button", { name: "Fermer" }).click();
  await settingsClosed;

  await page.locator(".page-row").first().locator(".page-item").click();
  await expect(page.locator(".page-label").first()).toHaveText("Bienvenue");

  const previewPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Aperçu/ }).click();
  const preview = await previewPromise;
  await preview.waitForLoadState();

  await expect(preview.locator(".preview-toc")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Plan du cours" })).toBeVisible();
  await expect(preview.locator(".preview-toc-list li")).toHaveCount(3);
  await expect(preview.getByRole("button", { name: /Introduction/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /Évaluation finale/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /Conclusion/ })).toBeVisible();
  await expect(preview.locator(".preview-toc-list li").nth(1)).toHaveCSS("padding-left", "16px");
  await expect(preview.locator(".preview-toc-list li").nth(2)).toHaveCSS("padding-left", "32px");
  await expect(preview.locator(".preview-bottom-navigation")).toBeVisible();
  await expect(preview.locator(".preview-bottom-status")).toContainText("1 / 3");
  await expect(preview.getByRole("button", { name: /Précédente/ })).toBeDisabled();
  await preview.getByRole("button", { name: /Suivante/ }).click();
  await expect(preview.locator(".preview-bottom-status")).toContainText("2 / 3");
  await expect(preview.locator(".preview-toc-list li").nth(1)).toHaveClass(/is-active/);
  await preview.getByRole("button", { name: /Suivante/ }).click();
  await expect(preview.locator(".preview-bottom-status")).toContainText("3 / 3");
  await expect(preview.locator(".preview-toc-list li").nth(2)).toHaveClass(/is-active/);
  await expect(preview.getByRole("button", { name: /Suivante/ })).toBeDisabled();
});

test("adapter l’éditeur aux petits écrans sans débordement de la fenêtre", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();
  await expect(page.locator(".workspace")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator(".canvas-scroll")).toHaveCSS("overflow-x", "auto");
});

test("conserver les coordonnées des blocs dans l’aperçu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();
  await page.getByRole("button", { name: /Titre/ }).click();

  const positionInputs = page.locator(".inspector input[type=number]");
  await positionInputs.nth(0).fill("180");
  await positionInputs.nth(1).fill("120");

  await page.getByRole("button", { name: /Texte/ }).click();
  await positionInputs.nth(0).fill("320");
  await positionInputs.nth(1).fill("260");

  const editorPositions = await page.locator(".scene-block").evaluateAll((blocks) => blocks.map((block) => ({
    left: getComputedStyle(block).left,
    top: getComputedStyle(block).top
  })));
  const editorCanvasBox = await page.locator(".scene").boundingBox();
  const editorContentBoxes = await Promise.all([
    page.locator(".block-title").boundingBox(),
    page.locator(".block-text").boundingBox()
  ]);
  expect(editorCanvasBox).not.toBeNull();
  expect(editorContentBoxes[0]).not.toBeNull();
  expect(editorContentBoxes[1]).not.toBeNull();

  const previewPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Aperçu/ }).click();
  const preview = await previewPromise;
  await preview.waitForLoadState();

  const previewPositions = await preview.locator(".preview-block").evaluateAll((blocks) => blocks.map((block) => ({
    left: getComputedStyle(block).left,
    top: getComputedStyle(block).top
  })));
  const previewPageBox = await preview.locator(".preview-page").boundingBox();
  const previewContentBoxes = await Promise.all([
    preview.locator(".block-title").boundingBox(),
    preview.locator(".block-text").boundingBox()
  ]);
  expect(previewPageBox).not.toBeNull();
  expect(previewContentBoxes[0]).not.toBeNull();
  expect(previewContentBoxes[1]).not.toBeNull();

  expect(previewPositions).toEqual(editorPositions);
  expect(previewContentBoxes[0]!.x - previewPageBox!.x).toBeCloseTo(editorContentBoxes[0]!.x - editorCanvasBox!.x, 0);
  expect(previewContentBoxes[0]!.y - previewPageBox!.y).toBeCloseTo(editorContentBoxes[0]!.y - editorCanvasBox!.y, 0);
  expect(previewContentBoxes[1]!.x - previewPageBox!.x).toBeCloseTo(editorContentBoxes[1]!.x - editorCanvasBox!.x, 0);
  expect(previewContentBoxes[1]!.y - previewPageBox!.y).toBeCloseTo(editorContentBoxes[1]!.y - editorCanvasBox!.y, 0);
});

test("ajouter et gérer un bloc depuis les menus contextuels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();

  await page.locator(".scene").click({ button: "right", position: { x: 180, y: 140 } });
  await expect(page.getByRole("menu", { name: "Ajouter un bloc" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Titre" }).click();
  await expect(page.locator(".scene-block")).toHaveCount(1);
  const placement = await page.locator(".scene").evaluate((scene) => {
    const block = scene.querySelector<HTMLElement>(".scene-block")!;
    return {
      left: Number.parseFloat(getComputedStyle(block).left),
      top: Number.parseFloat(getComputedStyle(block).top),
      width: Number.parseFloat(getComputedStyle(block).width),
      sceneWidth: scene.clientWidth
    };
  });
  expect(placement.left).toBeLessThanOrEqual(180);
  expect(placement.left + placement.width).toBeLessThanOrEqual(placement.sceneWidth);
  expect(placement.top).toBeGreaterThanOrEqual(140);
  expect(placement.top).toBeLessThanOrEqual(141);

  await page.locator(".scene-block").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Dupliquer le bloc" }).click();
  await expect(page.locator(".scene-block")).toHaveCount(2);

  await page.locator(".scene-block").first().click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Supprimer le bloc" }).click();
  await expect(page.locator(".scene-block")).toHaveCount(1);
});

test("afficher la grille et activer le magnétisme", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();

  await expect(page.locator(".scene-grid")).toBeVisible();
  await page.getByRole("button", { name: "Masquer la grille" }).click();
  await expect(page.locator(".scene-grid")).toHaveCount(0);
  await page.getByRole("button", { name: "Afficher la grille" }).click();
  await expect(page.locator(".scene-grid")).toBeVisible();

  const snapButton = page.getByRole("button", { name: "Activer le magnétisme" });
  await snapButton.click();
  await expect(page.getByRole("button", { name: "Désactiver le magnétisme" })).toHaveAttribute("aria-pressed", "true");
});

test("ajouter une image par glisser-déposer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();

  await page.locator(".scene").evaluate((scene) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pixel.png", { type: "image/png" }));
    scene.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });

  await expect(page.locator(".block-image")).toBeVisible();
  await expect(page.locator(".block-image")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator(".image-source-summary strong")).toHaveText("Image intégrée au projet");
  await expect(page.getByRole("button", { name: "Remplacer l’image…" })).toBeVisible();
  await expect(page.locator('input[value^="data:image"]')).toHaveCount(0);
});

test("renommer et réordonner les pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();

  await page.getByRole("button", { name: "Renommer Bienvenue" }).click();
  const pageNameInput = page.getByRole("textbox", { name: "Nom de la page" });
  await pageNameInput.fill("Introduction");
  await pageNameInput.press("Enter");
  await expect(page.getByRole("button", { name: "Renommer Introduction" })).toBeVisible();

  await page.getByTitle("Ajouter une page").click();
  await page.locator(".page-row").nth(0).locator(".page-item").click();
  await expect(page.locator(".page-row").nth(0).locator(".page-item")).toHaveAttribute("aria-current", "page");
  await page.locator(".page-row").nth(1).locator(".page-item").click();
  await expect(page.locator(".page-row").nth(1).locator(".page-item")).toHaveAttribute("aria-current", "page");
  const sourceRow = page.locator(".page-row").nth(1);
  const targetRow = page.locator(".page-row").nth(0);
  const sourceBox = await sourceRow.boundingBox();
  const targetBox = await targetRow.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Impossible de mesurer les pages à réordonner");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".page-label").nth(0)).toHaveText("Page 2");
  await expect(page.locator(".page-label").nth(1)).toHaveText("Introduction");

  await page.locator(".page-row").nth(1).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Actions pour Introduction" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Supprimer la page" }).click();
  await expect(page.locator(".page-row")).toHaveCount(1);
  await expect(page.locator(".page-label").first()).toHaveText("Page 2");
});

test("regrouper l’annulation d’une saisie et d’un déplacement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Nouveau cours/ }).click();
  await page.getByRole("button", { name: /Texte/ }).click();

  const text = page.getByLabel("Texte");
  const defaultText = await text.inputValue();
  await text.fill("");
  await text.pressSequentially("ABC", { delay: 10 });
  await page.getByTitle("Annuler").click();
  await expect(text).toHaveValue(defaultText);

  await page.getByRole("button", { name: /Titre/ }).click();
  const positionInput = page.locator(".inspector input[type=number]").nth(0);
  const startX = Number(await positionInput.inputValue());
  const block = page.locator(".scene-block").last();
  const box = await block.boundingBox();
  if (!box) throw new Error("Impossible de mesurer le bloc à déplacer");
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 30, { steps: 20 });
  await page.mouse.up();
  expect(Number(await positionInput.inputValue())).toBeGreaterThan(startX);
  await page.getByTitle("Annuler").click();
  await expect(positionInput).toHaveValue(String(startX));
});
