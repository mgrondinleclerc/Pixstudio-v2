import React from "react";
import { imageDefinition } from "./definitions/image";
import { textDefinition } from "./definitions/text";
import { titleDefinition } from "./definitions/title";
import type { BlockDefinition } from "./types";

const definitions: BlockDefinition[] = [titleDefinition, textDefinition, imageDefinition];

export const blockRegistry = new Map(definitions.map((definition) => [definition.type, definition]));
export const blockDefinitions = definitions;

const unknownDefinition: BlockDefinition = {
  type: "unknown",
  version: 1,
  label: "Bloc indisponible",
  icon: "?",
  createDefault: () => { throw new Error("Un bloc inconnu ne peut pas être créé."); },
  validate: () => false,
  migrate: (block) => block,
  renderEditor: ({ block }) => <div className="unknown-block">Bloc « {block.type} » indisponible dans cette version.</div>,
  renderLearner: ({ block }) => <div className="unknown-block">Bloc « {block.type} » indisponible dans cette version.</div>
};

export function getBlockDefinition(type: string): BlockDefinition {
  return blockRegistry.get(type) ?? unknownDefinition;
}
