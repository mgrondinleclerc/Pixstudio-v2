import { describe, expect, it } from "vitest";
import {
  addBlockCommand,
  createBlockInstance,
  createCourseDocument,
  createPage,
  createPageCommand,
  CourseDocumentSchema,
  deleteBlockCommand,
  HistoryManager,
  migrateDocument,
  updateBlockCommand,
  updateCourseTitle
} from "../src/index";

describe("core du document", () => {
  it("crée un cours valide avec une page", () => {
    const document = createCourseDocument();
    expect(CourseDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.pages).toHaveLength(1);
    expect(document.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gère les commandes et undo/redo", () => {
    const document = createCourseDocument();
    const history = new HistoryManager(document);
    const page = createPage("Deuxième page");
    history.execute(createPageCommand(page));
    expect(history.document.pages).toHaveLength(2);
    history.undo();
    expect(history.document.pages).toHaveLength(1);
    history.redo();
    expect(history.document.pages).toHaveLength(2);

    const block = createBlockInstance("text");
    history.execute(addBlockCommand(document.pages[0].id, block));
    const changed = { ...block, content: { text: "Texte modifié" } };
    history.execute(updateBlockCommand(document.pages[0].id, block, changed));
    expect(history.document.pages[0].blocks[0].content).toEqual({ text: "Texte modifié" });
    history.undo();
    expect(history.document.pages[0].blocks[0].content).toEqual({});

    history.execute(updateCourseTitle("Titre modifié"));
    history.undo();
    expect(history.document.title).toBe("Mon nouveau cours");
  });

  it("restaure un bloc supprimé à son index d’origine", () => {
    const document = createCourseDocument();
    const pageId = document.pages[0].id;
    const first = createBlockInstance("title");
    const middle = createBlockInstance("text");
    const last = createBlockInstance("image");
    const history = new HistoryManager(document);

    history.execute(addBlockCommand(pageId, first));
    history.execute(addBlockCommand(pageId, middle));
    history.execute(addBlockCommand(pageId, last));
    history.execute(deleteBlockCommand(pageId, middle, 1));
    history.undo();

    expect(history.document.pages[0].blocks.map((block) => block.id)).toEqual([first.id, middle.id, last.id]);
  });

  it("migre un document v0 et rejette une version future", () => {
    const document = createCourseDocument();
    const legacy = { ...document, formatVersion: 0, theme: undefined, assets: undefined, tableOfContents: undefined };
    const migrated = migrateDocument(legacy);
    expect(migrated.formatVersion).toBe(1);
    expect(migrated.tableOfContents).toEqual({ enabled: false, title: "Table des matières", pageIds: [document.pages[0].id], labels: {}, parentByPage: {} });
    expect(() => migrateDocument({ ...document, formatVersion: 99 })).toThrow(/future/);
  });

  it("rejette une structure invalide", () => {
    expect(() => migrateDocument({ formatVersion: 1, title: "incomplet" })).toThrow();
  });
});
