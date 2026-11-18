import { assertCourseDocument, type BlockInstance, type CourseDocument } from "@pixestudio/core";
import { blockRegistry } from "./registry";

export function validateBlockInstance(block: BlockInstance): BlockInstance {
  const definition = blockRegistry.get(block.type);
  if (!definition) throw new Error(`Bloc inconnu ou non installé : ${block.type}`);
  if (block.version > definition.version) {
    throw new Error(`La version du bloc ${block.type} est plus récente que celle supportée.`);
  }
  const migrated = block.version === definition.version ? block : definition.migrate(block);
  if (!definition.validate(migrated)) {
    throw new Error(`Le contenu du bloc ${block.type} est invalide ou dépasse les limites autorisées.`);
  }
  return migrated;
}

export function validateCourseDocumentBlocks(input: CourseDocument): CourseDocument {
  const document = assertCourseDocument(input);
  const validated: CourseDocument = {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map(validateBlockInstance)
    }))
  };
  return assertCourseDocument(validated);
}
