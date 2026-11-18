import { BlockInstance, CourseDocument, Page, TableOfContentsSettings } from "./types";

export type DocumentCommand = {
  label: string;
  execute(document: CourseDocument): CourseDocument;
  undo(document: CourseDocument): CourseDocument;
};

function updatePage(document: CourseDocument, pageId: string, updater: (page: Page) => Page): CourseDocument {
  return {
    ...document,
    pages: document.pages.map((page) => page.id === pageId ? updater(page) : page)
  };
}

export function updateCourseTitle(title: string): DocumentCommand {
  let previousTitle: string | undefined;
  return {
    label: "Modifier le titre du cours",
    execute: (document) => {
      previousTitle = document.title;
      return { ...document, title };
    },
    undo: (document) => ({ ...document, title: previousTitle ?? document.title })
  };
}

export function updateCourseTableOfContents(settings: TableOfContentsSettings): DocumentCommand {
  let previous: TableOfContentsSettings | undefined;
  return {
    label: settings.enabled ? "Ajouter la table des matières" : "Masquer la table des matières",
    execute: (document) => {
      previous = document.tableOfContents;
      return { ...document, tableOfContents: { ...settings } };
    },
    undo: (document) => ({ ...document, tableOfContents: previous ?? document.tableOfContents })
  };
}

export function createPageCommand(page: Page): DocumentCommand {
  return {
    label: "Créer une page",
    execute: (document) => ({
      ...document,
      pages: [...document.pages, page],
      tableOfContents: { ...document.tableOfContents, pageIds: [...new Set([...document.tableOfContents.pageIds, page.id])] }
    }),
    undo: (document) => ({
      ...document,
      pages: document.pages.filter((candidate) => candidate.id !== page.id),
      tableOfContents: { ...document.tableOfContents, pageIds: document.tableOfContents.pageIds.filter((id) => id !== page.id) }
    })
  };
}

export function deletePageCommand(page: Page, index: number): DocumentCommand {
  let previousTableOfContents: CourseDocument["tableOfContents"] | undefined;
  return {
    label: "Supprimer une page",
    execute: (document) => {
      previousTableOfContents = document.tableOfContents;
      const labels = { ...document.tableOfContents.labels };
      delete labels[page.id];
      const parentByPage = { ...document.tableOfContents.parentByPage };
      delete parentByPage[page.id];
      Object.keys(parentByPage).forEach((childId) => {
        if (parentByPage[childId] === page.id) parentByPage[childId] = null;
      });
      return {
        ...document,
        pages: document.pages.filter((candidate) => candidate.id !== page.id),
        tableOfContents: {
          ...document.tableOfContents,
          pageIds: document.tableOfContents.pageIds.filter((id) => id !== page.id),
          labels,
          parentByPage
        }
      };
    },
    undo: (document) => {
      const pages = [...document.pages];
      pages.splice(Math.min(index, pages.length), 0, page);
      return { ...document, pages, tableOfContents: previousTableOfContents ?? document.tableOfContents };
    }
  };
}

export function updatePageTitle(pageId: string, title: string): DocumentCommand {
  let previousTitle: string | undefined;
  return {
    label: "Modifier le titre de la page",
    execute: (document) => updatePage(document, pageId, (page) => {
      previousTitle = page.title;
      return { ...page, title };
    }),
    undo: (document) => updatePage(document, pageId, (page) => ({ ...page, title: previousTitle ?? page.title }))
  };
}

export function movePageCommand(pageId: string, targetIndex: number): DocumentCommand {
  let originalIndex = -1;
  const move = (document: CourseDocument, index: number): CourseDocument => {
    const currentIndex = document.pages.findIndex((page) => page.id === pageId);
    if (currentIndex < 0) return document;
    const pages = [...document.pages];
    const [page] = pages.splice(currentIndex, 1);
    pages.splice(Math.max(0, Math.min(index, pages.length)), 0, page);
    return { ...document, pages };
  };
  return {
    label: "Réordonner les pages",
    execute: (document) => {
      originalIndex = document.pages.findIndex((page) => page.id === pageId);
      return move(document, targetIndex);
    },
    undo: (document) => move(document, originalIndex)
  };
}

export function addBlockCommand(pageId: string, block: BlockInstance): DocumentCommand {
  return {
    label: `Ajouter le bloc ${block.type}`,
    execute: (document) => updatePage(document, pageId, (page) => ({ ...page, blocks: [...page.blocks, block] })),
    undo: (document) => updatePage(document, pageId, (page) => ({ ...page, blocks: page.blocks.filter((candidate) => candidate.id !== block.id) }))
  };
}

export function deleteBlockCommand(pageId: string, block: BlockInstance, index: number): DocumentCommand {
  return {
    label: "Supprimer un bloc",
    execute: (document) => updatePage(document, pageId, (page) => ({ ...page, blocks: page.blocks.filter((candidate) => candidate.id !== block.id) })),
    undo: (document) => updatePage(document, pageId, (page) => {
      const blocks = [...page.blocks];
      blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
      return { ...page, blocks };
    })
  };
}

export function updateBlockCommand(pageId: string, before: BlockInstance, after: BlockInstance): DocumentCommand {
  const replace = (document: CourseDocument, block: BlockInstance) => updatePage(document, pageId, (page) => ({
    ...page,
    blocks: page.blocks.map((candidate) => candidate.id === block.id ? block : candidate)
  }));
  return {
    label: "Modifier un bloc",
    execute: (document) => replace(document, after),
    undo: (document) => replace(document, before)
  };
}

export class HistoryManager {
  private current: CourseDocument;
  private readonly undoStack: DocumentCommand[] = [];
  private readonly redoStack: DocumentCommand[] = [];
  private saved = true;

  constructor(document: CourseDocument) {
    this.current = document;
  }

  get document(): CourseDocument { return this.current; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get isDirty(): boolean { return !this.saved; }

  execute(command: DocumentCommand): CourseDocument {
    this.current = command.execute(this.current);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.saved = false;
    return this.current;
  }

  undo(): CourseDocument {
    const command = this.undoStack.pop();
    if (!command) return this.current;
    this.current = command.undo(this.current);
    this.redoStack.push(command);
    this.saved = false;
    return this.current;
  }

  redo(): CourseDocument {
    const command = this.redoStack.pop();
    if (!command) return this.current;
    this.current = command.execute(this.current);
    this.undoStack.push(command);
    this.saved = false;
    return this.current;
  }

  markSaved(): void { this.saved = true; }
}
