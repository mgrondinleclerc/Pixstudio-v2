import { useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { blockDefinitions, getBlockDefinition, validateCourseDocumentBlocks } from "@pixestudio/blocks";
import { BlockInstance, CourseDocument, migrateDocument } from "@pixestudio/core";
import { createProjectArchive, MAX_PROJECT_BYTES, parseProjectArchive } from "@pixestudio/project-format";
import { BlockLibrary } from "./components/BlockLibrary";
import { AddBlockContextMenu, BlockContextMenu } from "./components/BlockContextMenus";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { PageList } from "./components/PageList";
import { PageContextMenu } from "./components/PageContextMenu";
import type { ContextMenuPosition } from "./components/ContextMenu";
import { snapBlockPosition, snapBlockSize, snapToGrid } from "./canvasGrid";
import { imageBytesToEmbeddedSource, imageFileToEmbeddedSource, imageMimeTypeFromPath, imageNameFromPath } from "./imageImport";
import { constrainBlockToScene, MIN_BLOCK_HEIGHT, MIN_BLOCK_WIDTH, resizeBlockFromPointer } from "./sceneGeometry";
import { useEditorStore } from "./store";

const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

async function closeSecondaryWindow(): Promise<void> {
  if (isTauri()) {
    const currentWindow = getCurrentWebviewWindow();
    try {
      await currentWindow.close();
    } catch {
      await currentWindow.destroy();
    }
    return;
  }
  window.close();
}
const PREVIEW_STORAGE_KEY = "pixestudio-preview-document";
const PREVIEW_CHANNEL_NAME = "pixestudio-preview";
const TOC_SETTINGS_STORAGE_KEY = "pixestudio-toc-settings-document";
const TOC_SETTINGS_CHANNEL_NAME = "pixestudio-toc-settings";

type PreviewPayload = { document: CourseDocument; pageId: string | null };
type TocSettingsPayload = { document: CourseDocument };
type PreviewMessage =
  | { type: "request" }
  | { type: "payload"; payload: PreviewPayload };
type TocSettingsMessage =
  | { type: "request" }
  | { type: "payload"; payload: TocSettingsPayload }
  | { type: "update"; settings: CourseDocument["tableOfContents"] };
type ContextMenuState =
  | { target: "canvas"; position: ContextMenuPosition }
  | { target: "block"; position: ContextMenuPosition; blockId: string }
  | { target: "page"; position: ContextMenuPosition; pageId: string };
type BlockInteraction =
  | { mode: "move"; id: string; originX: number; originY: number; startClientX: number; startClientY: number }
  | { mode: "resize"; id: string; startWidth: number; startHeight: number; startClientX: number; startClientY: number };
type CanvasPreferences = { showGrid: boolean; snapToGrid: boolean };
type CanvasPoint = { x: number; y: number };

const CANVAS_PREFERENCES_KEY = "pixestudio-canvas-preferences";
const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = { showGrid: true, snapToGrid: false };

function readCanvasPreferences(): CanvasPreferences {
  try {
    const raw = localStorage.getItem(CANVAS_PREFERENCES_KEY);
    if (!raw) return DEFAULT_CANVAS_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<CanvasPreferences>;
    return {
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : DEFAULT_CANVAS_PREFERENCES.showGrid,
      snapToGrid: typeof parsed.snapToGrid === "boolean" ? parsed.snapToGrid : DEFAULT_CANVAS_PREFERENCES.snapToGrid
    };
  } catch {
    return DEFAULT_CANVAS_PREFERENCES;
  }
}

function isPreviewWindow(): boolean {
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

function isTableOfContentsSettingsWindow(): boolean {
  return new URLSearchParams(window.location.search).get("toc-settings") === "1";
}

function parsePreviewPayload(value: unknown): PreviewPayload | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const parsed = value as { document?: unknown; pageId?: unknown };
    if (!parsed.document) return null;
    return {
      document: validateCourseDocumentBlocks(migrateDocument(parsed.document)),
      pageId: typeof parsed.pageId === "string" ? parsed.pageId : null
    };
  } catch {
    return null;
  }
}

function readPreviewPayload(): PreviewPayload | null {
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    return raw ? parsePreviewPayload(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writePreviewPayload(document: CourseDocument, pageId: string | null): void {
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ document, pageId } satisfies PreviewPayload));
  } catch {
    // Large projects are sent through BroadcastChannel instead of blocking preview opening.
  }
}

function readTableOfContentsSettingsPayload(): TocSettingsPayload | null {
  try {
    const raw = localStorage.getItem(TOC_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { document?: unknown };
    if (!parsed.document) return null;
    return { document: validateCourseDocumentBlocks(migrateDocument(parsed.document)) };
  } catch {
    return null;
  }
}

function writeTableOfContentsSettingsPayload(document: CourseDocument): void {
  try {
    localStorage.setItem(TOC_SETTINGS_STORAGE_KEY, JSON.stringify({ document } satisfies TocSettingsPayload));
  } catch {
    // The settings window can still request the latest document through BroadcastChannel.
  }
}

type TableOfContentsEntry = {
  page: CourseDocument["pages"][number];
  depth: number;
};

function tableOfContentsEntries(document: CourseDocument): TableOfContentsEntry[] {
  const selectedPages = document.pages.filter((page) => document.tableOfContents.pageIds.includes(page.id));
  const selectedIds = new Set(selectedPages.map((page) => page.id));
  const configuredParents = document.tableOfContents.parentByPage ?? {};
  const parents = new Map<string, string | null>();

  // Normalize the hierarchy before rendering it so an old or edited document
  // cannot make the preview recurse forever or display a selected page twice.
  selectedPages.forEach((page) => {
    const configuredParent = configuredParents[page.id] ?? null;
    let parent = configuredParent;
    const visited = new Set([page.id]);
    let valid = !parent || selectedIds.has(parent);
    while (valid && parent) {
      if (visited.has(parent)) {
        valid = false;
        break;
      }
      visited.add(parent);
      parent = configuredParents[parent] ?? null;
      if (parent && !selectedIds.has(parent)) valid = false;
    }
    parents.set(page.id, valid ? configuredParent : null);
  });

  const children = new Map<string | null, CourseDocument["pages"]>();
  selectedPages.forEach((page) => {
    const parentId = parents.get(page.id) ?? null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(page);
    children.set(parentId, siblings);
  });

  const entries: TableOfContentsEntry[] = [];
  const visited = new Set<string>();
  const visit = (page: CourseDocument["pages"][number], depth: number) => {
    if (visited.has(page.id)) return;
    visited.add(page.id);
    entries.push({ page, depth });
    (children.get(page.id) ?? []).forEach((child) => visit(child, depth + 1));
  };

  (children.get(null) ?? []).forEach((page) => visit(page, 0));
  // Defensive fallback for malformed relationships: every selected page still
  // remains reachable in the table of contents.
  selectedPages.forEach((page) => visit(page, 0));
  return entries;
}

function tableOfContentsLabel(document: CourseDocument, page: CourseDocument["pages"][number]): string {
  const customLabel = document.tableOfContents.labels[page.id]?.trim();
  return customLabel || page.title;
}

function previewUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("preview", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function tableOfContentsSettingsUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("preview");
  url.searchParams.set("toc-settings", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function safeProjectFilename(title: string): string {
  return (title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.\./g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "cours");
}

function imageSourceLabel(content: Record<string, unknown>): string {
  const sourcePath = typeof content.sourcePath === "string" ? content.sourcePath : "";
  if (sourcePath) return imageNameFromPath(sourcePath);
  return content.src ? "Image intégrée au projet" : "Aucune image sélectionnée";
}

function downloadProject(course: CourseDocument, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeProjectFilename(course.title)}.pixe`;
  link.click();
  URL.revokeObjectURL(url);
}

function WelcomeScreen({ onCreate, onRecover }: { onCreate: () => void; onRecover: (document: CourseDocument) => void }) {
  const [recovery, setRecovery] = useState<CourseDocument | null>(() => {
    try {
      const raw = localStorage.getItem("pixestudio-recovery");
      return raw ? validateCourseDocumentBlocks(migrateDocument(JSON.parse(raw))) : null;
    } catch {
      return null;
    }
  });

  return <main className="welcome-shell">
    <div className="welcome-card">
      <div className="brand-mark">P</div>
      <p className="eyebrow">PIXESTUDIO</p>
      <h1>Créez des cours qui donnent envie d’apprendre.</h1>
      <p className="welcome-copy">Un atelier pédagogique local, simple et privé. Vos projets restent sur votre ordinateur.</p>
      <button className="primary-button large" onClick={onCreate}>＋ Nouveau cours</button>
      {recovery && <button className="recovery-button" onClick={() => { onRecover(recovery); setRecovery(null); }}>↻ Reprendre le dernier brouillon</button>}
      <div className="welcome-note"><span>⌁</span> Fonctionne hors ligne · format portable .pixe</div>
    </div>
  </main>;
}

export default function App() {
  const {
    document, history, currentPageId, selectedBlockId, mode, lastSavedPath,
    createCourse, selectPage, selectBlock, setMode, updateTitle, updatePageTitle,
    updateTableOfContents,
    addPage, removePage, renamePage, movePage, addBlock, addImageBlock, duplicateBlock, updateBlock, updateBlockTransient, commitBlockInteraction, removeBlock, removeSelectedBlock, undo, redo,
    loadDocument, markSaved
  } = useEditorStore();
  const previewRoute = isPreviewWindow();
  const tocSettingsRoute = isTableOfContentsSettingsWindow();
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(() => previewRoute ? readPreviewPayload() : null);
  const [message, setMessage] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [interactionMode, setInteractionMode] = useState<"move" | "resize" | null>(null);
  const [canvasPreferences, setCanvasPreferences] = useState<CanvasPreferences>(readCanvasPreferences);
  const [imageDropActive, setImageDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<BlockInteraction | null>(null);
  const insertionPointRef = useRef<CanvasPoint | null>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const tocSettingsChannelRef = useRef<BroadcastChannel | null>(null);
  const dragDepthRef = useRef(0);
  const documentRef = useRef<CourseDocument | null>(document);
  const currentPageIdRef = useRef<string | null>(currentPageId);

  const currentPage = document?.pages.find((page) => page.id === currentPageId) ?? document?.pages[0];
  const selectedBlock = currentPage?.blocks.find((block) => block.id === selectedBlockId);
  const contextBlock = contextMenu?.target === "block"
    ? currentPage?.blocks.find((block) => block.id === contextMenu.blockId)
    : undefined;
  const contextPage = contextMenu?.target === "page"
    ? document?.pages.find((page) => page.id === contextMenu.pageId)
    : undefined;
  const title = document?.title ?? "";
  const [courseTitleDraft, setCourseTitleDraft] = useState(title);
  const [pageTitleDraft, setPageTitleDraft] = useState(currentPage?.title ?? "");
  const selectedBlockRef = useRef<BlockInstance | undefined>(selectedBlock);

  documentRef.current = document;
  currentPageIdRef.current = currentPageId;

  useEffect(() => {
    selectedBlockRef.current = selectedBlock;
  }, [selectedBlock]);

  useEffect(() => {
    setCourseTitleDraft(title);
  }, [title]);

  useEffect(() => {
    setPageTitleDraft(currentPage?.title ?? "");
  }, [currentPage?.id, currentPage?.title]);

  useEffect(() => {
    if (!document) return;
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem("pixestudio-recovery", JSON.stringify(document));
      } catch {
        setMessage("Récupération locale indisponible : espace de stockage insuffisant");
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [document]);

  useEffect(() => {
    if (!previewRoute || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    const syncPreview = () => setPreviewPayload(readPreviewPayload());
    const receivePreviewMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.data?.type === "payload") {
        setPreviewPayload(parsePreviewPayload(event.data.payload) ?? readPreviewPayload());
      } else {
        syncPreview();
      }
    };
    channel.addEventListener("message", receivePreviewMessage);
    window.addEventListener("storage", syncPreview);
    channel.postMessage({ type: "request" } satisfies PreviewMessage);
    return () => {
      channel.close();
      channel.removeEventListener("message", receivePreviewMessage);
      window.removeEventListener("storage", syncPreview);
    };
  }, [previewRoute]);

  useEffect(() => {
    if (previewRoute || !document) return;
    const payload = { document, pageId: currentPageId } satisfies PreviewPayload;
    writePreviewPayload(document, currentPageId);
    previewChannelRef.current?.postMessage({ type: "payload", payload } satisfies PreviewMessage);
  }, [currentPageId, document, previewRoute]);

  useEffect(() => {
    if (previewRoute || tocSettingsRoute || !document) return;
    const payload = { document } satisfies TocSettingsPayload;
    writeTableOfContentsSettingsPayload(document);
    tocSettingsChannelRef.current?.postMessage({ type: "payload", payload } satisfies TocSettingsMessage);
  }, [document, previewRoute, tocSettingsRoute]);

  useEffect(() => {
    if (previewRoute || tocSettingsRoute || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    const answerPreviewRequest = (event: MessageEvent<PreviewMessage>) => {
      if (event.data?.type !== "request" || !documentRef.current) return;
      channel.postMessage({
        type: "payload",
        payload: { document: documentRef.current, pageId: currentPageIdRef.current }
      } satisfies PreviewMessage);
    };
    channel.addEventListener("message", answerPreviewRequest);
    previewChannelRef.current = channel;
    return () => {
      channel.removeEventListener("message", answerPreviewRequest);
      channel.close();
      previewChannelRef.current = null;
    };
  }, [previewRoute]);

  useEffect(() => {
    if (previewRoute || tocSettingsRoute || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(TOC_SETTINGS_CHANNEL_NAME);
    const receiveSettingsMessage = (event: MessageEvent<TocSettingsMessage>) => {
      if (event.data?.type === "request" && documentRef.current) {
        channel.postMessage({ type: "payload", payload: { document: documentRef.current } } satisfies TocSettingsMessage);
      } else if (event.data?.type === "update" && documentRef.current && JSON.stringify(event.data.settings) !== JSON.stringify(documentRef.current.tableOfContents)) {
        updateTableOfContents(event.data.settings);
      }
    };
    channel.addEventListener("message", receiveSettingsMessage);
    tocSettingsChannelRef.current = channel;
    return () => {
      channel.removeEventListener("message", receiveSettingsMessage);
      channel.close();
      tocSettingsChannelRef.current = null;
    };
  }, [previewRoute, tocSettingsRoute, updateTableOfContents]);

  useEffect(() => {
    const className = "block-interaction-active";
    window.document.body.classList.toggle(className, interactionMode !== null);
    return () => window.document.body.classList.remove(className);
  }, [interactionMode]);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_PREFERENCES_KEY, JSON.stringify(canvasPreferences));
    } catch {
      // The canvas keeps working when local storage is unavailable.
    }
  }, [canvasPreferences]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const activeBlock = selectedBlockRef.current;
      if (!interaction || !activeBlock || interaction.id !== activeBlock.id) return;
      if (interaction.mode === "resize") {
        const resizedBlock = resizeBlockFromPointer(
          activeBlock,
          interaction.startWidth,
          interaction.startHeight,
          event.clientX - interaction.startClientX,
          event.clientY - interaction.startClientY,
          sceneRef.current
        );
        updateBlockTransient(constrainBlockToScene(canvasPreferences.snapToGrid ? snapBlockSize(resizedBlock) : resizedBlock, sceneRef.current));
        return;
      }
      const movedBlock = {
        ...activeBlock,
        x: interaction.originX + event.clientX - interaction.startClientX,
        y: interaction.originY + event.clientY - interaction.startClientY
      };
      updateBlockTransient(constrainBlockToScene(canvasPreferences.snapToGrid ? snapBlockPosition(movedBlock) : movedBlock, sceneRef.current));
    };
    const end = () => {
      const interaction = interactionRef.current;
      if (interaction) commitBlockInteraction(interaction.id);
      interactionRef.current = null;
      setInteractionMode(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, [canvasPreferences.snapToGrid, commitBlockInteraction, updateBlockTransient]);

  useEffect(() => {
    if (previewRoute || !document) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isEditingText) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedBlockId) {
        event.preventDefault();
        duplicateBlock(selectedBlockId);
      } else if (event.key === "Delete" && selectedBlockId) {
        event.preventDefault();
        removeBlock(selectedBlockId);
      } else if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [document, duplicateBlock, previewRoute, removeBlock, selectedBlockId]);

  const openCanvasContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateInsertionPoint(event.clientX, event.clientY);
    selectBlock(null);
    setContextMenu({ target: "canvas", position: { x: event.clientX, y: event.clientY } });
  };

  const openBlockContextMenu = (event: MouseEvent<HTMLDivElement>, blockId: string) => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(blockId);
    setContextMenu({ target: "block", blockId, position: { x: event.clientX, y: event.clientY } });
  };

  const openPageContextMenu = (event: MouseEvent<HTMLDivElement>, pageId: string) => {
    event.preventDefault();
    event.stopPropagation();
    selectPage(pageId);
    setContextMenu({ target: "page", pageId, position: { x: event.clientX, y: event.clientY } });
  };

  const updateInsertionPoint = (clientX: number, clientY: number): CanvasPoint | null => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const bounds = scene.getBoundingClientRect();
    const point = { x: Math.max(0, clientX - bounds.left), y: Math.max(0, clientY - bounds.top) };
    insertionPointRef.current = point;
    return point;
  };

  const addBlockAtPoint = (type: string, point = insertionPointRef.current) => {
    if (!point) {
      addBlock(type);
      return;
    }
    const position = canvasPreferences.snapToGrid
      ? { x: snapToGrid(point.x), y: snapToGrid(point.y) }
      : point;
    addBlock(type, position);
  };

  const addBlockAtContextPoint = (type: string, position: ContextMenuPosition) => {
    addBlockAtPoint(type, updateInsertionPoint(position.x, position.y) ?? insertionPointRef.current);
  };

  const handleSceneClick = (event: MouseEvent<HTMLDivElement>) => {
    updateInsertionPoint(event.clientX, event.clientY);
    setContextMenu(null);
    selectBlock(null);
  };

  const addEmbeddedImage = (source: string, alt: string, point: CanvasPoint | null, sourcePath?: string) => {
    const position = point && canvasPreferences.snapToGrid
      ? { x: snapToGrid(point.x), y: snapToGrid(point.y) }
      : point ?? undefined;
    addImageBlock(source, alt.slice(0, 500) || "Image importée", position, sourcePath);
    setMessage("Image ajoutée au canvas");
  };

  const importImageFile = async (file: File, point: CanvasPoint | null) => {
    try {
      setMessage("Import de l’image…");
      const source = await imageFileToEmbeddedSource(file);
      addEmbeddedImage(source, file.name.trim() || "Image collée", point);
    } catch (error) {
      setMessage(`Impossible d’ajouter l’image : ${String(error)}`);
    }
  };

  const importImagePath = async (path: string, point: CanvasPoint | null) => {
    const mimeType = imageMimeTypeFromPath(path);
    if (!mimeType) {
      setMessage("Le fichier déposé n’est pas une image prise en charge");
      return;
    }
    try {
      setMessage("Import de l’image…");
      const bytes = new Uint8Array(await invoke<number[]>("read_image_file", { path }));
      const source = await imageBytesToEmbeddedSource(bytes, mimeType, imageNameFromPath(path));
      addEmbeddedImage(source, imageNameFromPath(path), point, path);
    } catch (error) {
      setMessage(`Impossible d’ajouter l’image : ${String(error)}`);
    }
  };

  useEffect(() => {
    if (previewRoute || !document) return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isEditingText) return;
      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) => candidate.type.startsWith("image/"));
      const file = item?.getAsFile() ?? Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void importImageFile(file, insertionPointRef.current);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canvasPreferences.snapToGrid, document, previewRoute]);

  useEffect(() => {
    if (!isTauri() || previewRoute || !document) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const subscribe = async () => {
      try {
        const dispose = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter") {
            setImageDropActive(payload.paths.some((path) => imageMimeTypeFromPath(path) !== null));
          } else if (payload.type === "over") {
            if (imageDropActive) setImageDropActive(true);
          } else if (payload.type === "leave") {
            setImageDropActive(false);
          } else if (payload.type === "drop") {
            setImageDropActive(false);
            const path = payload.paths.find((candidate) => imageMimeTypeFromPath(candidate) !== null);
            if (!path) {
              setMessage("Seuls les fichiers image peuvent être ajoutés au canvas");
              return;
            }
            const scale = window.devicePixelRatio || 1;
            const point = updateInsertionPoint(payload.position.x / scale, payload.position.y / scale);
            void importImagePath(path, point);
          }
        });
        if (cancelled) dispose();
        else unlisten = dispose;
      } catch (error) {
        setMessage(`Glisser-déposer indisponible : ${String(error)}`);
      }
    };
    void subscribe();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [document, previewRoute]);

  const hasDraggedFiles = (event: ReactDragEvent<HTMLDivElement>): boolean => !isTauri() && Array.from(event.dataTransfer.types).includes("Files");

  const handleCanvasDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setImageDropActive(true);
  };

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setImageDropActive(false);
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setImageDropActive(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      setMessage("Seuls les fichiers image peuvent être ajoutés au canvas");
      return;
    }
    void importImageFile(file, updateInsertionPoint(event.clientX, event.clientY));
  };

  const saveProject = async () => {
    if (!document) return;
    try {
      const bytes = createProjectArchive(document, validateCourseDocumentBlocks);
      if (bytes.byteLength > MAX_PROJECT_BYTES) {
        throw new Error("Le projet .pixe dépasse la taille maximale autorisée de 50 Mo.");
      }
      if (isTauri()) {
        const path = await save({ defaultPath: `${safeProjectFilename(document.title)}.pixe`, filters: [{ name: "Projet PixeStudio", extensions: ["pixe"] }] });
        if (path) {
          await invoke("save_project", { path, bytes: Array.from(bytes) });
          markSaved(path);
          setMessage("Projet sauvegardé");
        }
      } else {
        downloadProject(document, bytes);
        markSaved();
        setMessage("Projet exporté en .pixe");
      }
    } catch (error) {
      setMessage(`Erreur de sauvegarde : ${String(error)}`);
    }
  };

  const openProject = async () => {
    try {
      if (isTauri()) {
        const path = await open({ multiple: false, filters: [{ name: "Projet PixeStudio", extensions: ["pixe"] }] });
        if (typeof path === "string") {
          const bytes = new Uint8Array(await invoke<number[]>("load_project", { path }));
          loadDocument(parseProjectArchive(bytes, validateCourseDocumentBlocks).document);
          setMessage("Projet ouvert");
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (error) {
      setMessage(`Erreur d’ouverture : ${String(error)}`);
    }
  };

  const onBrowserFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error("Le fichier .pixe dépasse la taille maximale autorisée de 50 Mo.");
      loadDocument(parseProjectArchive(new Uint8Array(await file.arrayBuffer()), validateCourseDocumentBlocks).document);
      setMessage("Projet ouvert");
    } catch (error) {
      setMessage(`Projet invalide : ${String(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  if (tocSettingsRoute) {
    return <TableOfContentsSettingsWindow />;
  }

  if (previewRoute) {
    const previewDocument = previewPayload?.document;
    return previewDocument ? <Preview document={previewDocument} initialPageId={previewPayload?.pageId ?? null} /> : <main className="preview-shell"><div className="preview-empty-window">Aucun aperçu disponible.</div></main>;
  }

  if (!document) return <WelcomeScreen onCreate={createCourse} onRecover={(recovered) => {
    try {
      loadDocument(recovered);
    } catch {
      setMessage("Le brouillon local est invalide et ne peut pas être restauré");
    }
  }} />;

  const updateSelected = (patch: Partial<BlockInstance>) => {
    if (selectedBlock) updateBlock(constrainBlockToScene({ ...selectedBlock, ...patch }, sceneRef.current));
  };

  const applySelectedImage = (source: string, fallbackAlt: string, sourcePath?: string) => {
    if (!selectedBlock || selectedBlock.type !== "image") return;
    const currentAlt = String(selectedBlock.content.alt ?? "");
    const content: Record<string, unknown> = { ...selectedBlock.content, src: source, alt: currentAlt || fallbackAlt.slice(0, 500) };
    if (sourcePath) content.sourcePath = sourcePath.slice(0, 2000);
    else delete content.sourcePath;
    updateSelected({ content });
    setMessage("Image sélectionnée");
  };

  const onImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage("Import de l’image…");
      applySelectedImage(await imageFileToEmbeddedSource(file), file.name.trim() || "Image sélectionnée");
    } catch (error) {
      setMessage(`Impossible d’ajouter l’image : ${String(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  const chooseImage = async () => {
    if (!selectedBlock || selectedBlock.type !== "image") return;
    if (!isTauri()) {
      imageInputRef.current?.click();
      return;
    }
    try {
      const previousPath = typeof selectedBlock.content.sourcePath === "string" ? selectedBlock.content.sourcePath : undefined;
      const path = await open({ defaultPath: previousPath, multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }] });
      if (typeof path !== "string") return;
      const mimeType = imageMimeTypeFromPath(path);
      if (!mimeType) throw new Error("Le fichier sélectionné n’est pas une image prise en charge.");
      setMessage("Import de l’image…");
      const bytes = new Uint8Array(await invoke<number[]>("read_image_file", { path }));
      const source = await imageBytesToEmbeddedSource(bytes, mimeType, imageNameFromPath(path));
      applySelectedImage(source, imageNameFromPath(path), path);
    } catch (error) {
      setMessage(`Impossible d’ajouter l’image : ${String(error)}`);
    }
  };

  const openPreview = async () => {
    try {
      writePreviewPayload(document, currentPageId);
      if (isTauri()) {
        const existing = await WebviewWindow.getByLabel("preview");
        if (existing) {
          await existing.maximize();
          await existing.show();
          await existing.setFocus();
          return;
        }
        const preview = new WebviewWindow("preview", {
          url: previewUrl(),
          title: `Aperçu — ${document.title}`,
          width: 1200,
          height: 850,
          minWidth: 850,
          minHeight: 600,
          resizable: true,
          maximized: true
        });
        preview.once("tauri://error", (event) => setMessage(`Erreur d’ouverture de l’aperçu : ${String(event.payload)}`));
      } else {
        const preview = window.open(previewUrl(), "pixestudio-preview", "popup,width=1200,height=850,resizable=yes");
        if (!preview) {
          setMessage("La fenêtre d’aperçu a été bloquée par le navigateur");
          return;
        }
        preview.focus();
      }
    } catch (error) {
      setMessage(`Erreur d’ouverture de l’aperçu : ${String(error)}`);
    }
  };

  const openTableOfContentsSettings = async () => {
    try {
      writeTableOfContentsSettingsPayload(document);
      if (isTauri()) {
        const existing = await WebviewWindow.getByLabel("toc-settings");
        if (existing) {
          await existing.maximize();
          await existing.show();
          await existing.setFocus();
          return;
        }
        const settingsWindow = new WebviewWindow("toc-settings", {
          url: tableOfContentsSettingsUrl(),
          title: `Table des matières — ${document.title}`,
          width: 1100,
          height: 760,
          minWidth: 760,
          minHeight: 600,
          resizable: true,
          maximized: true
        });
        settingsWindow.once("tauri://error", (event) => setMessage(`Erreur d’ouverture des réglages : ${String(event.payload)}`));
      } else {
        const settingsWindow = window.open(tableOfContentsSettingsUrl(), "pixestudio-toc-settings", "popup,width=1600,height=1000,resizable=yes");
        if (!settingsWindow) {
          setMessage("La fenêtre de réglages a été bloquée par le navigateur");
          return;
        }
        try {
          settingsWindow.moveTo(0, 0);
          settingsWindow.resizeTo(window.screen.availWidth, window.screen.availHeight);
        } catch {
          // Browsers may refuse resizing a popup; the page remains fully responsive.
        }
        settingsWindow.focus();
      }
    } catch (error) {
      setMessage(`Erreur d’ouverture des réglages : ${String(error)}`);
    }
  };

  const commitCourseTitle = () => {
    const nextTitle = courseTitleDraft.trim();
    if (!nextTitle) {
      setCourseTitleDraft(title);
      return;
    }
    setCourseTitleDraft(nextTitle);
    if (nextTitle !== title) updateTitle(nextTitle);
  };

  const commitPageTitle = () => {
    const currentTitle = currentPage?.title ?? "";
    const nextTitle = pageTitleDraft.trim();
    if (!nextTitle) {
      setPageTitleDraft(currentTitle);
      return;
    }
    setPageTitleDraft(nextTitle);
    if (nextTitle !== currentTitle) updatePageTitle(nextTitle);
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><div className="mini-mark">P</div><span>PixeStudio</span></div>
      <div className="course-title-wrap"><input aria-label="Titre du cours" value={courseTitleDraft} onChange={(event) => setCourseTitleDraft(event.target.value)} onBlur={commitCourseTitle} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setCourseTitleDraft(title); event.currentTarget.blur(); } }} /><span className={`dirty-dot ${history?.isDirty ? "on" : ""}`} title={history?.isDirty ? "Modifications non sauvegardées" : "Sauvegardé"} /></div>
      <div className="topbar-actions">
        <button className="icon-button" title="Annuler" disabled={!history?.canUndo} onClick={undo}>↶</button>
        <button className="icon-button" title="Rétablir" disabled={!history?.canRedo} onClick={redo}>↷</button>
        <span className="separator" />
        <button className="ghost-button" onClick={openProject}>Ouvrir</button>
        <button className="primary-button" onClick={saveProject}>Sauvegarder</button>
        <input ref={fileInputRef} type="file" accept=".pixe" hidden onChange={onBrowserFile} />
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden onChange={onImageFile} />
      </div>
    </header>

    <div className="modebar">
      <div className="breadcrumbs"><span>Mes cours</span><b>›</b><strong>{title}</strong></div>
      <div className="mode-switch"><button className={mode === "editor" ? "active" : ""} onClick={() => setMode("editor")}>✦ Édition</button><button onClick={openPreview}>▷ Aperçu</button></div>
      <span className="status-message">{message || (lastSavedPath ? "Prêt à continuer" : "Enregistrement local activé")}</span>
    </div>

    <div className="workspace">
      <aside className="pages-panel panel">
        <div className="panel-heading"><span>Pages</span><button className="small-icon-button" onClick={addPage} title="Ajouter une page">＋</button></div>
        <button type="button" className={`pages-panel-toc-button ${document.tableOfContents.enabled ? "active" : ""}`} onClick={openTableOfContentsSettings} aria-label="Table des matières" title="Personnaliser la table des matières">
          <span className="pages-panel-toc-icon" aria-hidden="true">☷</span>
          <span><strong>Table des matières</strong><small>{document.tableOfContents.enabled ? "Activée dans l’aperçu" : "Personnaliser le sommaire"}</small></span>
          <span className="pages-panel-toc-arrow" aria-hidden="true">›</span>
        </button>
        <PageList pages={document.pages} currentPageId={currentPage?.id ?? null} onSelect={selectPage} onRename={renamePage} onMove={movePage} onContextMenu={openPageContextMenu} />
      </aside>

      <main className="editor-area">
        <div className="editor-heading"><div><span className="section-kicker">PAGE {String(document.pages.findIndex((page) => page.id === currentPage?.id) + 1).padStart(2, "0")}</span><input className="page-title-input" aria-label="Titre de la page" value={pageTitleDraft} onChange={(event) => setPageTitleDraft(event.target.value)} onBlur={commitPageTitle} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setPageTitleDraft(currentPage?.title ?? ""); event.currentTarget.blur(); } }} /></div><div className="editor-heading-actions"><CanvasToolbar showGrid={canvasPreferences.showGrid} snapToGrid={canvasPreferences.snapToGrid} onToggleGrid={() => setCanvasPreferences((preferences) => ({ ...preferences, showGrid: !preferences.showGrid }))} onToggleSnap={() => setCanvasPreferences((preferences) => ({ ...preferences, snapToGrid: !preferences.snapToGrid }))} /><span className="canvas-hint">Clic droit pour ajouter</span></div></div>
        <div className="canvas-scroll"><div ref={sceneRef} className={`scene ${imageDropActive ? "image-drop-active" : ""}`} onClick={handleSceneClick} onContextMenu={openCanvasContextMenu} onDragEnter={handleCanvasDragEnter} onDragOver={handleCanvasDragOver} onDragLeave={handleCanvasDragLeave} onDrop={handleCanvasDrop} style={{ fontFamily: document.theme.fontFamily }}>
          {canvasPreferences.showGrid && <div className="scene-grid" aria-hidden="true" />}
          {currentPage?.blocks.map((block) => {
            const displayBlock = constrainBlockToScene(block, sceneRef.current);
            return <div key={block.id} className={`scene-block ${block.id === selectedBlockId ? "selected" : ""}`} style={{ left: displayBlock.x, top: displayBlock.y, width: displayBlock.width, minHeight: displayBlock.height }} onClick={(event) => { event.stopPropagation(); setContextMenu(null); selectBlock(block.id); }} onContextMenu={(event) => openBlockContextMenu(event, block.id)} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setContextMenu(null); selectBlock(block.id); setInteractionMode("move"); interactionRef.current = { mode: "move", id: block.id, originX: displayBlock.x, originY: displayBlock.y, startClientX: event.clientX, startClientY: event.clientY }; }}>
            <div className="block-type-badge">{getBlockDefinition(block.type).label}</div>
            {getBlockDefinition(block.type).renderEditor({ block, context: "editor" })}
            {block.id === selectedBlockId && <span
              className="resize-grip"
              role="button"
              aria-label="Redimensionner le bloc"
              title="Redimensionner"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                selectBlock(block.id);
                setInteractionMode("resize");
                interactionRef.current = {
                  mode: "resize",
                  id: block.id,
                  startWidth: displayBlock.width,
                  startHeight: displayBlock.height,
                  startClientX: event.clientX,
                  startClientY: event.clientY
                };
              }}
            />}
          </div>;
          })}
          {!currentPage?.blocks.length && <div className="empty-scene"><div className="empty-scene-icon">✦</div><h3>Votre page est prête</h3><p>Ajoutez un bloc depuis la bibliothèque, collez ou glissez une image.</p></div>}
        </div></div>
      </main>

      <aside className="right-panel panel">
        <BlockLibrary definitions={blockDefinitions} onAdd={addBlockAtPoint} />
        <div className="inspector-section inspector"><div className="panel-heading"><span>Inspecteur</span>{selectedBlock && <button className="delete-button" onClick={removeSelectedBlock}>Supprimer</button>}</div>{selectedBlock ? <Inspector block={selectedBlock} onChange={updateSelected} onChooseImage={chooseImage} /> : <div className="inspector-empty"><span>⌖</span><p>Sélectionnez un bloc<br />pour voir ses propriétés.</p></div>}</div>
      </aside>
    </div>
    {contextMenu?.target === "canvas" && <AddBlockContextMenu position={contextMenu.position} definitions={blockDefinitions} onAdd={(type) => addBlockAtContextPoint(type, contextMenu.position)} onClose={() => setContextMenu(null)} />}
    {contextMenu?.target === "block" && contextBlock && <BlockContextMenu position={contextMenu.position} block={contextBlock} definitions={blockDefinitions} onDuplicate={() => duplicateBlock(contextBlock.id)} onDelete={() => removeBlock(contextBlock.id)} onClose={() => setContextMenu(null)} />}
    {contextMenu?.target === "page" && contextPage && <PageContextMenu position={contextMenu.position} pageTitle={contextPage.title} canDelete={document.pages.length > 1} onDelete={() => removePage(contextPage.id)} onClose={() => setContextMenu(null)} />}
  </div>;
}

function Inspector({ block, onChange, onChooseImage }: { block: BlockInstance; onChange: (patch: Partial<BlockInstance>) => void; onChooseImage: () => void }) {
  const content = block.content;
  const textValue = String(content.text ?? "");
  const altValue = String(content.alt ?? "");
  const [textDraft, setTextDraft] = useState(textValue);
  const [altDraft, setAltDraft] = useState(altValue);

  useEffect(() => {
    setTextDraft(textValue);
    setAltDraft(altValue);
  }, [block.id, textValue, altValue]);

  const commitContent = (key: string, value: unknown) => onChange({ content: { ...content, [key]: value } });

  return <div className="inspector-body"><div className="selected-type"><span className="library-icon">{getBlockDefinition(block.type).icon}</span><div><strong>{getBlockDefinition(block.type).label}</strong><small>Bloc {block.type} · v{block.version}</small></div></div>
    {block.type === "title" || block.type === "text" ? <label className="field"><span>Texte</span><textarea value={textDraft} onChange={(event) => setTextDraft(event.target.value)} onBlur={() => commitContent("text", textDraft)} rows={block.type === "text" ? 6 : 3} /></label> : null}
    {block.type === "image" ? <><div className="field image-source-field"><span>Image</span><div className="image-source-summary"><span className="library-icon">▧</span><div><strong>{imageSourceLabel(content)}</strong><small>{content.src ? "Image intégrée au projet" : "Ajoutez une image au bloc"}</small></div></div><button type="button" className="image-picker-button" onClick={onChooseImage}>▧ {content.src ? "Remplacer l’image…" : "Choisir une image…"}</button></div><label className="field"><span>Texte alternatif</span><input value={altDraft} onChange={(event) => setAltDraft(event.target.value)} onBlur={() => commitContent("alt", altDraft)} /></label></> : null}
    <div className="field-group"><span className="field-group-label">Position</span><div className="two-fields"><label className="field"><span>X</span><input type="number" value={Math.round(block.x)} onChange={(event) => onChange({ x: Number(event.target.value) })} /></label><label className="field"><span>Y</span><input type="number" value={Math.round(block.y)} onChange={(event) => onChange({ y: Number(event.target.value) })} /></label></div></div>
    <div className="field-group"><span className="field-group-label">Dimensions</span><div className="two-fields"><label className="field"><span>Largeur</span><input type="number" min={MIN_BLOCK_WIDTH} value={Math.round(block.width)} onChange={(event) => onChange({ width: Math.max(MIN_BLOCK_WIDTH, Number(event.target.value)) })} /></label><label className="field"><span>Hauteur</span><input type="number" min={MIN_BLOCK_HEIGHT} value={Math.round(block.height)} onChange={(event) => onChange({ height: Math.max(MIN_BLOCK_HEIGHT, Number(event.target.value)) })} /></label></div></div>
  </div>;
}

function Preview({ document, initialPageId }: { document: CourseDocument; initialPageId: string | null }) {
  const tableOfContentsEntriesForNavigation = document.tableOfContents.enabled ? tableOfContentsEntries(document) : [];
  const navigationPages = tableOfContentsEntriesForNavigation.length ? tableOfContentsEntriesForNavigation.map((entry) => entry.page) : document.pages;
  const firstNavigationPageId = navigationPages[0]?.id ?? null;
  const [activePageId, setActivePageId] = useState(() => navigationPages.some((page) => page.id === initialPageId) ? initialPageId : firstNavigationPageId);
  const activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0];
  const activePageIndex = activePage ? navigationPages.findIndex((page) => page.id === activePage.id) : -1;

  useEffect(() => {
    if (!navigationPages.some((page) => page.id === activePageId)) setActivePageId(firstNavigationPageId);
  }, [activePageId, firstNavigationPageId, navigationPages]);

  const selectPage = (pageId: string) => setActivePageId(pageId);
  const selectRelativePage = (offset: number) => {
    const nextPage = navigationPages[activePageIndex + offset];
    if (nextPage) setActivePageId(nextPage.id);
  };

  return <main className="preview-shell">
    <div className="preview-top">
      <div className="preview-top-inner">
        <div className="preview-course">
          <span className="preview-pill">APERÇU APPRENANT</span>
          <span className="preview-course-title">{document.title}</span>
        </div>
        <div className="preview-top-actions">
          <button type="button" className="preview-close-button" onClick={() => { void closeSecondaryWindow(); }}>Fermer</button>
        </div>
      </div>
    </div>
    <div className={`preview-layout ${document.tableOfContents.enabled ? "with-preview-toc" : ""}`}>
      {document.tableOfContents.enabled && <PreviewTableOfContents document={document} activePageId={activePage?.id ?? null} onSelectPage={selectPage} />}
      <article className="preview-page" style={{ fontFamily: document.theme.fontFamily }}>
        <div className="preview-canvas">
          {activePage?.blocks.map((block) => <section key={block.id} className="preview-block" style={{ left: block.x, top: block.y, width: block.width, minHeight: block.height }}>
            {getBlockDefinition(block.type).renderLearner({ block, context: "learner" })}
          </section>)}
          {!activePage?.blocks.length && <div className="preview-empty">Cette page ne contient encore aucun bloc.</div>}
        </div>
        <div className="preview-bottom-navigation" aria-label="Navigation de l’aperçu">
          <button type="button" className="preview-nav-button" onClick={() => selectRelativePage(-1)} disabled={activePageIndex <= 0}>← Précédente</button>
          <div className="preview-bottom-status"><strong>{activePageIndex >= 0 ? `${activePageIndex + 1} / ${navigationPages.length}` : `0 / ${navigationPages.length}`}</strong>{document.tableOfContents.enabled && tableOfContentsEntriesForNavigation.length ? <small>Ordre de la table des matières</small> : <small>Ordre des pages</small>}</div>
          <button type="button" className="preview-nav-button" onClick={() => selectRelativePage(1)} disabled={activePageIndex < 0 || activePageIndex >= navigationPages.length - 1}>Suivante →</button>
        </div>
      </article>
    </div>
  </main>;
}

function PreviewTableOfContents({
  document,
  activePageId,
  onSelectPage
}: {
  document: CourseDocument;
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const entries = tableOfContentsEntries(document);
  return <aside className="preview-toc">
    <div className="preview-toc-heading">
      <span className="preview-toc-kicker">VOTRE PARCOURS</span>
      <h2>{document.tableOfContents.title}</h2>
      <p>{entries.length === 1 ? "1 page" : `${entries.length} pages`} à découvrir</p>
    </div>
    <nav aria-label={document.tableOfContents.title}>
      {entries.length ? <ol className="preview-toc-list">
        {entries.map(({ page, depth }, index) => {
          const isActive = page.id === activePageId;
          return <li key={page.id} className={`${isActive ? "is-active " : ""}preview-toc-entry`} style={{ paddingLeft: `${depth * 16}px` }}>
            <button type="button" className="preview-toc-item" aria-current={isActive ? "page" : undefined} onClick={() => onSelectPage(page.id)}>
              <span className="preview-toc-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="preview-toc-copy"><strong>{tableOfContentsLabel(document, page)}</strong><small>{page.blocks.length === 1 ? "1 élément" : `${page.blocks.length} éléments`}</small></span>
              <span className="preview-toc-arrow" aria-hidden="true">→</span>
            </button>
          </li>;
        })}
      </ol> : <p className="preview-toc-empty">Aucune page sélectionnée.</p>}
    </nav>
  </aside>;
}

function TableOfContentsSettingsWindow() {
  const [document, setDocument] = useState<CourseDocument | null>(() => readTableOfContentsSettingsPayload()?.document ?? null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const localSettingsRef = useRef<CourseDocument["tableOfContents"] | null>(document?.tableOfContents ?? null);
  const pendingSettingsRef = useRef(false);
  const editingLabelPageRef = useRef<string | null>(null);
  const labelDraftsRef = useRef<Record<string, string>>({});
  const [titleDraft, setTitleDraft] = useState(() => document?.tableOfContents.title ?? "Table des matières");
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (document) {
      setTitleDraft(document.tableOfContents.title);
      const nextDrafts = { ...labelDraftsRef.current };
      document.pages.forEach((page) => {
        if (editingLabelPageRef.current !== page.id) nextDrafts[page.id] = document.tableOfContents.labels[page.id] ?? page.title;
      });
      labelDraftsRef.current = nextDrafts;
      setLabelDrafts(nextDrafts);
    }
  }, [document]);

  useEffect(() => {
    const syncFromStorage = () => {
      const payload = readTableOfContentsSettingsPayload();
      if (payload) applyIncomingDocument(payload.document);
    };
    if (typeof BroadcastChannel === "undefined") {
      window.addEventListener("storage", syncFromStorage);
      return () => window.removeEventListener("storage", syncFromStorage);
    }
    const channel = new BroadcastChannel(TOC_SETTINGS_CHANNEL_NAME);
    const receiveMessage = (event: MessageEvent<TocSettingsMessage>) => {
      if (event.data?.type === "payload") applyIncomingDocument(event.data.payload.document);
    };
    channel.addEventListener("message", receiveMessage);
    channelRef.current = channel;
    channel.postMessage({ type: "request" } satisfies TocSettingsMessage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      channel.removeEventListener("message", receiveMessage);
      channel.close();
      channelRef.current = null;
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const applyIncomingDocument = (incomingDocument: CourseDocument) => {
    setDocument((currentDocument) => {
      if (!pendingSettingsRef.current || !localSettingsRef.current) return incomingDocument;
      if (JSON.stringify(incomingDocument.tableOfContents) === JSON.stringify(localSettingsRef.current)) {
        pendingSettingsRef.current = false;
        return incomingDocument;
      }
      return { ...incomingDocument, tableOfContents: localSettingsRef.current };
    });
  };

  const updateSettings = (patch: Partial<CourseDocument["tableOfContents"]>) => {
    if (!document) return;
    const settings = { ...(localSettingsRef.current ?? document.tableOfContents), ...patch };
    localSettingsRef.current = settings;
    pendingSettingsRef.current = true;
    setDocument({ ...document, tableOfContents: settings });
    channelRef.current?.postMessage({ type: "update", settings } satisfies TocSettingsMessage);
  };

  const togglePageSelection = (pageId: string) => {
    if (!document) return;
    const isSelected = document.tableOfContents.pageIds.includes(pageId);
    const pageIds = isSelected
      ? document.tableOfContents.pageIds.filter((id) => id !== pageId)
      : [...document.tableOfContents.pageIds, pageId];
    const parentByPage = { ...document.tableOfContents.parentByPage };
    if (isSelected) {
      delete parentByPage[pageId];
      Object.keys(parentByPage).forEach((childId) => {
        if (parentByPage[childId] === pageId) parentByPage[childId] = null;
      });
    }
    updateSettings({ pageIds, parentByPage });
  };

  const movePageLevel = (pageId: string, direction: "in" | "out") => {
    if (!document) return;
    if (!document.tableOfContents.pageIds.includes(pageId)) return;
    const currentSettings = localSettingsRef.current ?? document.tableOfContents;
    const hierarchyDocument = { ...document, tableOfContents: currentSettings };
    const entries = tableOfContentsEntries(hierarchyDocument);
    const depthByPage = new Map(entries.map((entry) => [entry.page.id, entry.depth] as const));
    const selectedInDocumentOrder = document.pages.filter((page) => currentSettings.pageIds.includes(page.id));
    const pageIndex = selectedInDocumentOrder.findIndex((page) => page.id === pageId);
    const currentDepth = depthByPage.get(pageId) ?? 0;
    const parentByPage = { ...currentSettings.parentByPage };
    if (direction === "out") {
      const currentParent = parentByPage[pageId] ?? null;
      if (!currentParent) return;
      const grandParent = parentByPage[currentParent] ?? null;
      if (grandParent) parentByPage[pageId] = grandParent;
      else delete parentByPage[pageId];
    } else {
      const parentPage = selectedInDocumentOrder.slice(0, pageIndex).reverse().find((candidate) => (depthByPage.get(candidate.id) ?? 0) === currentDepth);
      if (!parentPage) return;
      let candidate: string | null = parentPage.id;
      const visited = new Set<string>();
      while (candidate && !visited.has(candidate)) {
        if (candidate === pageId) return;
        visited.add(candidate);
        candidate = parentByPage[candidate] ?? null;
      }
      parentByPage[pageId] = parentPage.id;
    }
    updateSettings({ parentByPage });
  };

  const commitPageLabel = (pageId: string, draftValue?: string) => {
    if (!document) return;
    const page = document.pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const nextLabel = (draftValue ?? labelDraftsRef.current[pageId] ?? labelDrafts[pageId] ?? page.title).trim();
    const currentSettings = localSettingsRef.current ?? document.tableOfContents;
    const labels = { ...currentSettings.labels };
    if (!nextLabel || nextLabel === page.title) delete labels[pageId];
    else labels[pageId] = nextLabel;
    labelDraftsRef.current = { ...labelDraftsRef.current, [pageId]: nextLabel || page.title };
    setLabelDrafts((drafts) => ({ ...drafts, [pageId]: nextLabel || page.title }));
    if (JSON.stringify(labels) !== JSON.stringify(currentSettings.labels)) updateSettings({ labels });
  };

  const commitTitle = () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(document?.tableOfContents.title ?? "Table des matières");
      return;
    }
    setTitleDraft(nextTitle);
    if (document && nextTitle !== document.tableOfContents.title) updateSettings({ title: nextTitle });
  };

  if (!document) return <main className="toc-settings-window"><div className="toc-settings-loading">Connexion à l’éditeur…</div></main>;
  const entries = tableOfContentsEntries(document);
  const selectedPages = entries.map((entry) => entry.page);
  const depthByPage = new Map(entries.map((entry) => [entry.page.id, entry.depth] as const));

  return <main className="toc-settings-window" style={{ fontFamily: document.theme.fontFamily }}>
    <header className="toc-window-header">
      <div className="toc-window-brand">
        <span className="toc-window-mark" aria-hidden="true">☷</span>
        <div><span className="toc-window-kicker">PERSONNALISATION DU COURS</span><h1>Table des matières</h1><p>{document.title}</p></div>
      </div>
      <div className="toc-window-header-actions"><span className="toc-window-sync">✓ Synchronisé avec l’éditeur</span><button type="button" className="toc-window-close-button" onClick={() => { void closeSecondaryWindow(); }}>Fermer</button></div>
    </header>
    <div className="toc-settings-window-content">
      <section className="toc-settings-card">
        <span className="toc-window-section-label">CONFIGURATION</span>
        <h2>Guidez les apprenants dans leur parcours.</h2>
        <p className="toc-settings-description">Le sommaire apparaît dans l’aperçu sous forme de navigation intégrée. Les pages et leur ordre sont toujours synchronisés avec votre cours.</p>
        <div className="toc-window-setting-row">
          <div><strong>Afficher le sommaire dans l’aperçu</strong><small>Permettre de passer directement d’une page à l’autre</small></div>
          <button type="button" className={`toc-switch ${document.tableOfContents.enabled ? "active" : ""}`} aria-pressed={document.tableOfContents.enabled} onClick={() => updateSettings({ enabled: !document.tableOfContents.enabled })}>{document.tableOfContents.enabled ? "Activé" : "Désactivé"}</button>
        </div>
        <label className="field toc-window-title-field"><span>Titre affiché</span><input aria-label="Titre de la table des matières" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTitleDraft(document.tableOfContents.title); event.currentTarget.blur(); } }} /></label>
        <p className="toc-settings-note">Conseil : utilisez un titre court et explicite, comme « Plan du cours » ou « Votre parcours ».</p>
        <div className="toc-page-selection">
          <div className="toc-page-selection-heading"><div><span className="toc-window-section-label">PAGES À AFFICHER</span><strong>Sélectionnez les étapes du sommaire</strong></div><span>{selectedPages.length} / {document.pages.length}</span></div>
          <div className="toc-page-selection-list">
            {document.pages.map((page, index) => {
              const isSelected = document.tableOfContents.pageIds.includes(page.id);
              const nestingDepth = depthByPage.get(page.id) ?? 0;
              const isNested = nestingDepth > 0;
              const selectedInDocumentOrder = document.pages.filter((candidate) => document.tableOfContents.pageIds.includes(candidate.id));
              const currentParent = document.tableOfContents.parentByPage[page.id] ?? null;
              const indentParent = selectedInDocumentOrder.slice(0, selectedInDocumentOrder.findIndex((candidate) => candidate.id === page.id)).reverse().find((candidate) => (depthByPage.get(candidate.id) ?? 0) === nestingDepth);
              return <div key={page.id} className={`toc-page-selection-row ${isSelected ? "selected" : ""} ${isNested ? "nested" : ""}`} style={{ marginLeft: `${Math.min(nestingDepth, 3) * 18}px` }}>
                <label className="toc-page-check"><input type="checkbox" checked={isSelected} onChange={() => togglePageSelection(page.id)} /><span className="toc-page-checkmark" aria-hidden="true">✓</span><span className="toc-page-index">{String(index + 1).padStart(2, "0")}</span><span className="toc-page-original"><strong>{page.title}</strong><small>Nom de la page</small></span></label>
                <label className="toc-page-label"><span className="sr-only">Nom dans la table des matières pour {page.title}</span><input aria-label={`Nom dans la table des matières pour ${page.title}`} value={labelDrafts[page.id] ?? page.title} disabled={!isSelected} onFocus={() => { editingLabelPageRef.current = page.id; }} onChange={(event) => { labelDraftsRef.current = { ...labelDraftsRef.current, [page.id]: event.target.value }; setLabelDrafts((drafts) => ({ ...drafts, [page.id]: event.target.value })); }} onBlur={(event) => { commitPageLabel(page.id, event.currentTarget.value); editingLabelPageRef.current = null; }} onKeyDown={(event) => { if (event.key === "Enter") { commitPageLabel(page.id, event.currentTarget.value); event.currentTarget.blur(); } if (event.key === "Escape") { const originalLabel = tableOfContentsLabel(document, page); labelDraftsRef.current = { ...labelDraftsRef.current, [page.id]: originalLabel }; setLabelDrafts((drafts) => ({ ...drafts, [page.id]: originalLabel })); event.currentTarget.blur(); } }} /></label>
                <div className="toc-page-level-actions"><button type="button" className="toc-page-level-button outdent" aria-label={`Remonter ${page.title} d’un niveau`} title="Remonter d’un niveau" disabled={!isSelected || !isNested} onClick={() => movePageLevel(page.id, "out")}><span aria-hidden="true">↰</span></button><button type="button" className="toc-page-level-button indent" aria-label={`Indenter ${page.title}${indentParent ? ` sous ${indentParent.title}` : ""}`} title="Descendre d’un niveau" disabled={!isSelected || !indentParent} onClick={() => movePageLevel(page.id, "in")}><span aria-hidden="true">↳</span></button></div>
              </div>;
            })}
          </div>
          <p className="toc-settings-note">Les renommages s’appliquent uniquement au sommaire et ne modifient pas les titres des pages.</p>
        </div>
      </section>
      <section className="toc-settings-preview-card">
        <div className="toc-window-preview-header"><div><span className="toc-window-section-label">APERÇU</span><h2>Navigation apprenant</h2></div><span>{selectedPages.length === 1 ? "1 page" : `${selectedPages.length} pages`}</span></div>
        <div className="toc-window-preview-surface">
          <div className="toc-window-preview-title"><span className="preview-toc-kicker">VOTRE PARCOURS</span><h3>{document.tableOfContents.title}</h3><p>Accédez rapidement à chaque étape.</p></div>
          {entries.length ? <ol className="toc-window-preview-list">
            {entries.map(({ page, depth }, index) => <li key={page.id} style={{ marginLeft: `${depth * 18}px` }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{tableOfContentsLabel(document, page)}</strong><b aria-hidden="true">→</b></li>)}
          </ol> : <p className="toc-window-preview-empty">Sélectionnez au moins une page pour afficher une entrée dans le sommaire.</p>}
        </div>
      </section>
    </div>
  </main>;
}
