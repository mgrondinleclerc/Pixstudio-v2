import type { ReactNode } from "react";
import type { BlockInstance } from "@pixestudio/core";

export type BlockRenderContext = "editor" | "preview" | "learner" | "print";
export type BlockRendererProps = { block: BlockInstance; context: BlockRenderContext };
export type BlockCategory = "Contenu" | "Média" | "Interaction" | "Mise en page" | "Autres";

export type BlockDefinition = {
  type: string;
  version: number;
  label: string;
  icon: string;
  category?: BlockCategory;
  description?: string;
  createDefault: () => BlockInstance;
  validate: (block: BlockInstance) => boolean;
  migrate: (block: BlockInstance) => BlockInstance;
  renderEditor: (props: BlockRendererProps) => ReactNode;
  renderLearner: (props: BlockRendererProps) => ReactNode;
};
