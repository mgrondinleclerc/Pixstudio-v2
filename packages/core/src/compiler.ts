import { CourseDocument, BlockInstance } from "./types";
import { migrateDocument } from "./migrations";

export type RuntimeDocumentValidator = (document: CourseDocument) => CourseDocument;

export type RuntimeDocument = {
  formatVersion: number;
  id: string;
  title: string;
  pages: Array<{ id: string; title: string; blocks: BlockInstance[] }>;
  theme: CourseDocument["theme"];
  tableOfContents: CourseDocument["tableOfContents"];
};

export function compileToRuntime(input: unknown, validateDocument: RuntimeDocumentValidator): RuntimeDocument {
  const document = validateDocument(migrateDocument(input));
  return {
    formatVersion: document.formatVersion,
    id: document.id,
    title: document.title,
    pages: document.pages.map((page) => ({ ...page, blocks: page.blocks.map((block) => ({ ...block, content: { ...block.content }, style: { ...block.style } })) })),
    theme: { ...document.theme },
    tableOfContents: { ...document.tableOfContents, pageIds: [...document.tableOfContents.pageIds], labels: { ...document.tableOfContents.labels }, parentByPage: { ...document.tableOfContents.parentByPage } }
  };
}
