import { describe, expect, it } from "vitest";
import { createBlockInstance, createCourseDocument } from "@pixestudio/core";
import { validateCourseDocumentBlocks } from "@pixestudio/blocks";
import { createProjectArchive, parseProjectArchive, saveAtomically } from "../src/index";

describe("format .pixe", () => {
  it("sérialise et rouvre un projet avec ses informations", () => {
    const document = createCourseDocument("Cours de test");
    const restored = parseProjectArchive(createProjectArchive(document, validateCourseDocumentBlocks), validateCourseDocumentBlocks);
    expect(restored.document).toEqual(document);
    expect(restored.manifest.files).toContain("course.json");
  });

  it("préserve les assets embarqués dans une archive", async () => {
    const document = createCourseDocument();
    const writes: Record<string, Uint8Array> = {};
    await saveAtomically("cours.pixe", new Uint8Array([1, 2, 3]), {
      async write(path, bytes) { writes[path] = bytes; },
      async replace(from, to) { writes[to] = writes[from]; delete writes[from]; }
    });
    expect(writes["cours.pixe"]).toEqual(new Uint8Array([1, 2, 3]));
    expect(document.assets).toEqual([]);
  });

  it("refuse un bloc invalide à la frontière de sauvegarde", () => {
    const document = createCourseDocument();
    document.pages[0].blocks.push({ ...createBlockInstance("text"), content: { text: "x".repeat(10001) } });
    expect(() => createProjectArchive(document, validateCourseDocumentBlocks)).toThrow(/invalide|limites/);
  });

  it("signale un projet corrompu ou incompatible", () => {
    expect(() => parseProjectArchive(new Uint8Array([1, 2, 3]), validateCourseDocumentBlocks)).toThrow(/corrompu|valide|court/);
  });

  it("refuse une archive trop volumineuse avant décompression", () => {
    expect(() => parseProjectArchive(new Uint8Array(50 * 1024 * 1024 + 1), validateCourseDocumentBlocks)).toThrow(/50 Mo|court|ZIP/);
  });
});
