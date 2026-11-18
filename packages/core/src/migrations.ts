import { CourseDocument, CourseDocumentSchema, CURRENT_FORMAT_VERSION } from "./types";

const defaultTheme = {
  primaryColor: "#4f46e5",
  backgroundColor: "#f7f8fc",
  fontFamily: "Inter, Segoe UI, sans-serif"
};

const defaultTableOfContents = {
  enabled: false,
  title: "Table des matières",
  pageIds: [],
  labels: {},
  parentByPage: {}
};

export function migrateDocument(input: unknown): CourseDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Le document du cours est invalide.");
  }

  const candidate = input as Record<string, unknown>;
  const version = candidate.formatVersion;

  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error("La version du format du projet est absente ou invalide.");
  }
  if (version > CURRENT_FORMAT_VERSION) {
    throw new Error(`Ce projet utilise une version future inconnue (${version}).`);
  }
  if (version < 0) {
    throw new Error(`Version de format non supportée (${version}).`);
  }

  let migrated: Record<string, unknown> = { ...candidate };
  if (version === 0) {
    migrated = {
      ...migrated,
      formatVersion: CURRENT_FORMAT_VERSION,
      assets: migrated.assets ?? [],
      theme: migrated.theme ?? defaultTheme
    };
  }

  const tableOfContents = migrated.tableOfContents;
  const pages = Array.isArray(migrated.pages) ? migrated.pages : [];
  const pageIds = pages.flatMap((page) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) return [];
    const id = (page as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
  if (tableOfContents && typeof tableOfContents === "object" && !Array.isArray(tableOfContents)) {
    const existing = tableOfContents as Record<string, unknown>;
    migrated.tableOfContents = {
      ...defaultTableOfContents,
      ...existing,
      pageIds: Array.isArray(existing.pageIds) ? existing.pageIds : pageIds,
      labels: existing.labels && typeof existing.labels === "object" && !Array.isArray(existing.labels) ? existing.labels : {},
      parentByPage: existing.parentByPage && typeof existing.parentByPage === "object" && !Array.isArray(existing.parentByPage) ? existing.parentByPage : {}
    };
  } else {
    migrated.tableOfContents = { ...defaultTableOfContents, pageIds };
  }

  return CourseDocumentSchema.parse(migrated);
}
