import { create } from "zustand";
import {
  addBlockCommand,
  BlockInstance,
  CourseDocument,
  createCourseDocument,
  createPage,
  createPageCommand,
  createStableId,
  deleteBlockCommand,
  deletePageCommand,
  HistoryManager,
  TableOfContentsSettings,
  movePageCommand,
  updateBlockCommand,
  updateCourseTableOfContents,
  updateCourseTitle,
  updatePageTitle
} from "@pixestudio/core";
import { getBlockDefinition, validateBlockInstance, validateCourseDocumentBlocks } from "@pixestudio/blocks";
import { constrainBlockToSize, DEFAULT_SCENE_SIZE } from "./sceneGeometry";

type EditorMode = "editor" | "preview";
type BlockPosition = { x: number; y: number };

type EditorStore = {
  document: CourseDocument | null;
  history: HistoryManager | null;
  currentPageId: string | null;
  selectedBlockId: string | null;
  mode: EditorMode;
  lastSavedPath: string | null;
  createCourse: () => void;
  loadDocument: (document: CourseDocument) => void;
  selectPage: (pageId: string) => void;
  selectBlock: (blockId: string | null) => void;
  setMode: (mode: EditorMode) => void;
  updateTitle: (title: string) => void;
  updateTableOfContents: (patch: Partial<TableOfContentsSettings>) => void;
  toggleTableOfContents: () => void;
  updatePageTitle: (title: string) => void;
  addPage: () => void;
  removePage: (pageId: string) => void;
  renamePage: (pageId: string, title: string) => void;
  movePage: (pageId: string, targetIndex: number) => void;
  addBlock: (type: string, position?: BlockPosition) => void;
  addImageBlock: (source: string, alt: string, position?: BlockPosition, sourcePath?: string) => void;
  duplicateBlock: (blockId: string) => void;
  updateBlock: (block: BlockInstance) => void;
  updateBlockTransient: (block: BlockInstance) => void;
  commitBlockInteraction: (blockId: string) => void;
  removeBlock: (blockId: string) => void;
  removeSelectedBlock: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (path?: string) => void;
};

function sync(set: (value: Partial<EditorStore>) => void, history: HistoryManager, extra: Partial<EditorStore> = {}): void {
  set({ document: history.document, ...extra });
}

function replaceBlock(document: CourseDocument, pageId: string, block: BlockInstance): CourseDocument {
  return {
    ...document,
    pages: document.pages.map((page) => page.id === pageId
      ? { ...page, blocks: page.blocks.map((candidate) => candidate.id === block.id ? block : candidate) }
      : page)
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: null,
  history: null,
  currentPageId: null,
  selectedBlockId: null,
  mode: "editor",
  lastSavedPath: null,
  createCourse: () => {
    const document = createCourseDocument();
    const history = new HistoryManager(document);
    set({ document, history, currentPageId: document.pages[0].id, selectedBlockId: null, mode: "editor", lastSavedPath: null });
  },
  loadDocument: (document) => {
    const validatedDocument = validateCourseDocumentBlocks(document);
    const history = new HistoryManager(validatedDocument);
    set({ document: validatedDocument, history, currentPageId: validatedDocument.pages[0]?.id ?? null, selectedBlockId: null, mode: "editor", lastSavedPath: null });
  },
  selectPage: (pageId) => set({ currentPageId: pageId, selectedBlockId: null }),
  selectBlock: (blockId) => set({ selectedBlockId: blockId }),
  setMode: (mode) => set({ mode, selectedBlockId: mode === "preview" ? null : get().selectedBlockId }),
  updateTitle: (title) => {
    const history = get().history;
    if (!history) return;
    sync(set, history, {});
    history.execute(updateCourseTitle(title));
    sync(set, history);
  },
  updateTableOfContents: (patch) => {
    const { history } = get();
    if (!history) return;
    history.execute(updateCourseTableOfContents({ ...history.document.tableOfContents, ...patch }));
    sync(set, history);
  },
  toggleTableOfContents: () => {
    const { history } = get();
    if (!history) return;
    const settings = history.document.tableOfContents;
    history.execute(updateCourseTableOfContents({ ...settings, enabled: !settings.enabled }));
    sync(set, history);
  },
  updatePageTitle: (title) => {
    const { history, currentPageId } = get();
    if (!history || !currentPageId) return;
    history.execute(updatePageTitle(currentPageId, title));
    sync(set, history);
  },
  addPage: () => {
    const history = get().history;
    if (!history) return;
    const page = createPage(`Page ${history.document.pages.length + 1}`);
    history.execute(createPageCommand(page));
    sync(set, history, { currentPageId: page.id, selectedBlockId: null });
  },
  removePage: (pageId) => {
    const { history, currentPageId, selectedBlockId } = get();
    if (!history || history.document.pages.length <= 1) return;
    const index = history.document.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const page = history.document.pages[index];
    history.execute(deletePageCommand(page, index));
    if (currentPageId !== pageId) {
      sync(set, history, { selectedBlockId });
      return;
    }
    const nextPage = history.document.pages[Math.max(0, index - 1)];
    sync(set, history, { currentPageId: nextPage?.id ?? null, selectedBlockId: null });
  },
  renamePage: (pageId, title) => {
    const history = get().history;
    if (!history) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    history.execute(updatePageTitle(pageId, trimmedTitle));
    sync(set, history);
  },
  movePage: (pageId, targetIndex) => {
    const { history } = get();
    if (!history) return;
    const currentIndex = history.document.pages.findIndex((page) => page.id === pageId);
    if (currentIndex < 0 || currentIndex === targetIndex) return;
    history.execute(movePageCommand(pageId, targetIndex));
    sync(set, history);
  },
  addBlock: (type, position) => {
    const { history, currentPageId } = get();
    if (!history || !currentPageId) return;
    const defaultBlock = getBlockDefinition(type).createDefault();
    const currentPage = history.document.pages.find((page) => page.id === currentPageId);
    const fallbackPosition = currentPage
      ? { x: 60 + currentPage.blocks.length * 24, y: 48 + currentPage.blocks.length * 24 }
      : { x: 60, y: 48 };
    const block = constrainBlockToSize({
      ...defaultBlock,
      x: position?.x ?? fallbackPosition.x,
      y: position?.y ?? fallbackPosition.y
    }, DEFAULT_SCENE_SIZE);
    history.execute(addBlockCommand(currentPageId, block));
    sync(set, history, { selectedBlockId: block.id });
  },
  addImageBlock: (source, alt, position, sourcePath) => {
    const { history, currentPageId } = get();
    if (!history || !currentPageId) return;
    const page = history.document.pages.find((candidate) => candidate.id === currentPageId);
    const image = getBlockDefinition("image").createDefault();
    const block = constrainBlockToSize({
      ...image,
      x: position?.x ?? (page ? 60 + page.blocks.length * 24 : 60),
      y: position?.y ?? (page ? 48 + page.blocks.length * 24 : 48),
      content: { ...image.content, src: source, alt: alt.slice(0, 500), ...(sourcePath ? { sourcePath: sourcePath.slice(0, 2000) } : {}) }
    }, DEFAULT_SCENE_SIZE);
    history.execute(addBlockCommand(currentPageId, block));
    sync(set, history, { selectedBlockId: block.id });
  },
  duplicateBlock: (blockId) => {
    const { history, currentPageId } = get();
    if (!history || !currentPageId) return;
    const page = history.document.pages.find((candidate) => candidate.id === currentPageId);
    const source = page?.blocks.find((candidate) => candidate.id === blockId);
    if (!source) return;
    const duplicate = constrainBlockToSize({
      ...source,
      id: createStableId(),
      x: Math.max(0, source.x + 24),
      y: Math.max(0, source.y + 24),
      content: structuredClone(source.content),
      style: structuredClone(source.style)
    }, DEFAULT_SCENE_SIZE);
    history.execute(addBlockCommand(currentPageId, duplicate));
    sync(set, history, { selectedBlockId: duplicate.id });
  },
  updateBlock: (block) => {
    const { history, currentPageId } = get();
    if (!history || !currentPageId) return;
    let validatedBlock: BlockInstance;
    try {
      validatedBlock = validateBlockInstance(block);
    } catch {
      return;
    }
    const page = history.document.pages.find((candidate) => candidate.id === currentPageId);
    const before = page?.blocks.find((candidate) => candidate.id === validatedBlock.id);
    if (!before) return;
    if (JSON.stringify(before) === JSON.stringify(validatedBlock)) return;
    history.execute(updateBlockCommand(currentPageId, before, validatedBlock));
    sync(set, history);
  },
  updateBlockTransient: (block) => {
    const { document, currentPageId } = get();
    if (!document || !currentPageId) return;
    let validatedBlock: BlockInstance;
    try {
      validatedBlock = validateBlockInstance(block);
    } catch {
      return;
    }
    const page = document.pages.find((candidate) => candidate.id === currentPageId);
    if (!page?.blocks.some((candidate) => candidate.id === validatedBlock.id)) return;
    set({ document: replaceBlock(document, currentPageId, validatedBlock) });
  },
  commitBlockInteraction: (blockId) => {
    const { document, history, currentPageId } = get();
    if (!document || !history || !currentPageId) return;
    const livePage = document.pages.find((candidate) => candidate.id === currentPageId);
    const historyPage = history.document.pages.find((candidate) => candidate.id === currentPageId);
    const after = livePage?.blocks.find((candidate) => candidate.id === blockId);
    const before = historyPage?.blocks.find((candidate) => candidate.id === blockId);
    if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return;
    history.execute(updateBlockCommand(currentPageId, before, after));
    sync(set, history);
  },
  removeBlock: (blockId) => {
    const { history, currentPageId, selectedBlockId } = get();
    if (!history || !currentPageId) return;
    const page = history.document.pages.find((candidate) => candidate.id === currentPageId);
    const block = page?.blocks.find((candidate) => candidate.id === blockId);
    if (!page || !block) return;
    const index = page.blocks.findIndex((candidate) => candidate.id === blockId);
    history.execute(deleteBlockCommand(currentPageId, block, index));
    sync(set, history, { selectedBlockId: selectedBlockId === blockId ? null : selectedBlockId });
  },
  removeSelectedBlock: () => {
    const selectedBlockId = get().selectedBlockId;
    if (selectedBlockId) get().removeBlock(selectedBlockId);
  },
  undo: () => {
    const history = get().history;
    if (!history) return;
    history.undo();
    sync(set, history);
  },
  redo: () => {
    const history = get().history;
    if (!history) return;
    history.redo();
    sync(set, history);
  },
  markSaved: (path) => {
    const history = get().history;
    if (!history) return;
    history.markSaved();
    set({ lastSavedPath: path ?? get().lastSavedPath, document: history.document });
  }
}));
