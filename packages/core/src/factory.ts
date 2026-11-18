import { createStableId } from "./ids";
import { Asset, BlockInstance, CourseDocument, Page, CURRENT_FORMAT_VERSION } from "./types";

export const defaultTheme = {
  primaryColor: "#4f46e5",
  backgroundColor: "#f7f8fc",
  fontFamily: "Inter, Segoe UI, sans-serif"
};

export function createCourseDocument(title = "Mon nouveau cours"): CourseDocument {
  const firstPage = createPage("Bienvenue");
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    id: createStableId(),
    title,
    pages: [firstPage],
    assets: [],
    theme: { ...defaultTheme },
    tableOfContents: { enabled: false, title: "Table des matières", pageIds: [firstPage.id], labels: {}, parentByPage: {} }
  };
}

export function createPage(title = "Nouvelle page"): Page {
  return { id: createStableId(), title, blocks: [] };
}

export function createBlockInstance(
  type: string,
  defaults: { width?: number; height?: number; content?: Record<string, unknown> } = {}
): BlockInstance {
  return {
    id: createStableId(),
    type,
    version: 1,
    x: 64,
    y: 64,
    width: defaults.width ?? 420,
    height: defaults.height ?? 100,
    content: defaults.content ?? {},
    style: {}
  };
}

export function createAsset(filename: string, mimeType: string, packagePath: string): Asset {
  return { id: createStableId(), filename, mimeType, packagePath };
}
