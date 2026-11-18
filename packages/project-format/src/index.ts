import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CourseDocument, migrateDocument } from "@pixestudio/core";

export const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_JSON_BYTES = 10 * 1024 * 1024;
export const MAX_MANIFEST_JSON_BYTES = 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 512;
export const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

export type ProjectManifest = {
  formatVersion: number;
  application: "PixeStudio";
  documentId: string;
  title: string;
  files: string[];
};

export type ProjectPackage = {
  manifest: ProjectManifest;
  document: CourseDocument;
  assets: Record<string, Uint8Array>;
};

export type ProjectDocumentValidator = (document: CourseDocument) => CourseDocument;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function validateArchiveStructure(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_PROJECT_BYTES) {
    throw new Error("Le projet .pixe dépasse la taille maximale autorisée de 50 Mo.");
  }
  if (bytes.byteLength < 22) throw new Error("Le fichier .pixe est trop court.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEndOfCentralDirectory = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let endOfCentralDirectory = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumEndOfCentralDirectory; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error("Le fichier .pixe ne contient pas de répertoire ZIP valide.");

  const entries = readUint16(view, endOfCentralDirectory + 10);
  const centralDirectorySize = readUint32(view, endOfCentralDirectory + 12);
  const centralDirectoryOffset = readUint32(view, endOfCentralDirectory + 16);
  if (entries > MAX_ARCHIVE_ENTRIES || centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
    throw new Error("Le projet .pixe contient trop d'éléments ou une structure ZIP invalide.");
  }

  const decoder = new TextDecoder();
  const names = new Set<string>();
  let cursor = centralDirectoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.byteLength || readUint32(view, cursor) !== 0x02014b50) {
      throw new Error("Le répertoire ZIP du projet est invalide.");
    }
    const flags = readUint16(view, cursor + 8);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const filenameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const nameStart = cursor + 46;
    const nextCursor = nameStart + filenameLength + extraLength + commentLength;
    if (nextCursor > bytes.byteLength || compressedSize > bytes.byteLength || uncompressedSize === 0xffffffff) {
      throw new Error("Le projet .pixe contient une entrée ZIP non supportée.");
    }
    if ((flags & 0x0001) !== 0) throw new Error("Les projets .pixe chiffrés ne sont pas supportés.");
    if (uncompressedSize > MAX_ENTRY_BYTES || totalUncompressed + uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("Le contenu décompressé du projet .pixe dépasse la limite de sécurité.");
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + filenameLength));
    if (!name || names.has(name) || name.startsWith("/") || name.startsWith("\\") || name.split(/[\\/]/).includes("..")) {
      throw new Error("Le projet .pixe contient un chemin de fichier interdit ou dupliqué.");
    }
    names.add(name);
    totalUncompressed += uncompressedSize;
    cursor = nextCursor;
  }
}

export function createProjectArchive(document: CourseDocument, validateDocument: ProjectDocumentValidator): Uint8Array {
  const validatedDocument = validateDocument(migrateDocument(document));
  const manifest: ProjectManifest = {
    formatVersion: validatedDocument.formatVersion,
    application: "PixeStudio",
    documentId: validatedDocument.id,
    title: validatedDocument.title,
    files: ["manifest.json", "course.json"]
  };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "course.json": strToU8(JSON.stringify(validatedDocument, null, 2)),
    "assets/.keep": strToU8(""),
    "previews/.keep": strToU8("")
  });
}

export function parseProjectArchive(bytes: Uint8Array, validateDocument: ProjectDocumentValidator): ProjectPackage {
  validateArchiveStructure(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Le fichier .pixe est corrompu ou n'est pas une archive valide.");
  }

  if (!files["manifest.json"] || !files["course.json"]) {
    throw new Error("Le projet .pixe ne contient pas les fichiers requis.");
  }
  if (files["manifest.json"].byteLength > MAX_MANIFEST_JSON_BYTES || files["course.json"].byteLength > MAX_DOCUMENT_JSON_BYTES) {
    throw new Error("Les métadonnées du projet .pixe dépassent les limites de sécurité.");
  }

  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(strFromU8(files["manifest.json"])) as ProjectManifest;
  } catch {
    throw new Error("Le manifeste du projet est illisible.");
  }
  if (manifest.application !== "PixeStudio" || typeof manifest.formatVersion !== "number") {
    throw new Error("Ce fichier n'est pas un projet PixeStudio compatible.");
  }

  let rawDocument: unknown;
  try {
    rawDocument = JSON.parse(strFromU8(files["course.json"]));
  } catch {
    throw new Error("Le document du cours est illisible.");
  }
  const document = validateDocument(migrateDocument(rawDocument));
  if (manifest.documentId !== document.id) {
    throw new Error("Le manifeste et le document du projet ne correspondent pas.");
  }

  const assets: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith("assets/") && !path.endsWith("/.keep")) assets[path] = data;
  }
  return { manifest, document, assets };
}

export type AtomicFileAdapter = {
  write(path: string, bytes: Uint8Array): Promise<void>;
  replace(from: string, to: string): Promise<void>;
};

export async function saveAtomically(path: string, bytes: Uint8Array, adapter: AtomicFileAdapter): Promise<void> {
  const temporaryPath = `${path}.tmp-${Date.now()}`;
  await adapter.write(temporaryPath, bytes);
  try {
    await adapter.replace(temporaryPath, path);
  } catch (error) {
    throw new Error(`Impossible de finaliser la sauvegarde atomique : ${String(error)}`);
  }
}
