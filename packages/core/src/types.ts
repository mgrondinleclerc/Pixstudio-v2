import { z } from "zod";

export const CURRENT_FORMAT_VERSION = 1;

export type Theme = {
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
};

export type TableOfContentsSettings = {
  enabled: boolean;
  title: string;
  pageIds: string[];
  labels: Record<string, string>;
  parentByPage: Record<string, string | null>;
};

export type Asset = {
  id: string;
  filename: string;
  mimeType: string;
  packagePath: string;
};

export type BlockInstance = {
  id: string;
  type: string;
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
};

export type Page = {
  id: string;
  title: string;
  blocks: BlockInstance[];
};

export type CourseDocument = {
  formatVersion: number;
  id: string;
  title: string;
  pages: Page[];
  assets: Asset[];
  theme: Theme;
  tableOfContents: TableOfContentsSettings;
};

const uuid = z.string().uuid();
const openRecord = z.record(z.string(), z.unknown())
  .refine((record) => Object.keys(record).length <= 100, "Trop de propriétés dans un bloc.")
  .refine((record) => {
    try { return JSON.stringify(record).length <= 250000; } catch { return false; }
  }, "Les propriétés du bloc dépassent la taille autorisée.");

export const BlockInstanceSchema = z.object({
  id: uuid,
  type: z.string().min(1).max(100),
  version: z.number().int().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive().max(5000),
  height: z.number().finite().positive().max(5000),
  content: openRecord,
  style: openRecord
}).strict();

export const PageSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(200),
  blocks: z.array(BlockInstanceSchema).max(500)
}).strict();

export const AssetSchema = z.object({
  id: uuid,
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  packagePath: z.string().regex(/^assets\//)
}).strict();

export const ThemeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().min(1).max(200)
}).strict();

export const TableOfContentsSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().min(1).max(200),
  pageIds: z.array(z.string().uuid()).max(500),
  labels: z.record(z.string().uuid(), z.string().max(200)).refine((labels) => Object.keys(labels).length <= 500, "Trop de libellés dans la table des matières."),
  parentByPage: z.record(z.string().uuid(), z.union([z.string().uuid(), z.null()])).refine((parents) => Object.keys(parents).length <= 500, "Trop de relations dans la table des matières.")
}).strict();

export const CourseDocumentSchema = z.object({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  id: uuid,
  title: z.string().min(1).max(200),
  pages: z.array(PageSchema).min(1).max(500),
  assets: z.array(AssetSchema).max(1000),
  theme: ThemeSchema,
  tableOfContents: TableOfContentsSettingsSchema
}).strict();

export function assertCourseDocument(value: unknown): CourseDocument {
  return CourseDocumentSchema.parse(value);
}
