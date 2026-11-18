import { describe, expect, it } from "vitest";
import { blockDefinitions, getBlockDefinition, isSafeImageSource, validateCourseDocumentBlocks, validateBlockInstance } from "../src/index";
import { createCourseDocument } from "@pixestudio/core";

describe("registre de blocs", () => {
  it("expose les trois blocs disponibles avec des valeurs valides", () => {
    expect(blockDefinitions.map((block) => block.type)).toEqual(["title", "text", "image"]);
    for (const definition of blockDefinitions) {
      const block = definition.createDefault();
      expect(definition.validate(block)).toBe(true);
      expect(definition.migrate({ ...block, version: 0 }).version).toBe(1);
      expect(definition.renderEditor({ block, context: "editor" })).toBeTruthy();
      expect(definition.renderLearner({ block, context: "learner" })).toBeTruthy();
    }
  });

  it("rejette le contenu invalide", () => {
    const text = blockDefinitions.find((block) => block.type === "text")!;
    const block = text.createDefault();
    expect(text.validate({ ...block, content: { unexpected: true } })).toBe(false);
  });

  it("ne permet pas aux blocs image de charger une URL distante", () => {
    const image = blockDefinitions.find((block) => block.type === "image")!;
    const block = image.createDefault();
    expect(isSafeImageSource("https://exemple.test/image.png")).toBe(false);
    expect(image.validate({ ...block, content: { src: "https://exemple.test/image.png", alt: "" } })).toBe(false);
    expect(getBlockDefinition("bloc-futur").label).toBe("Bloc indisponible");
  });

  it("applique les validations du registre aux documents importés", () => {
    const document = createCourseDocument();
    const text = blockDefinitions.find((block) => block.type === "text")!;
    const block = text.createDefault();
    document.pages[0].blocks.push(block);
    expect(validateCourseDocumentBlocks(document)).toEqual(document);
    expect(() => validateBlockInstance({ ...block, content: { text: "x".repeat(10001) } })).toThrow(/invalide|limites/);
    expect(validateBlockInstance({ ...block, version: 0 }).version).toBe(1);
  });
});
