import { z } from "zod";
import { createBlockInstance } from "@pixestudio/core";
import { TextRenderer } from "../renderers";
import type { BlockDefinition } from "../types";

const titleSchema = z.object({ text: z.string().max(300) }).strict();

export const titleDefinition: BlockDefinition = {
  type: "title",
  version: 1,
  label: "Titre",
  icon: "T",
  category: "Contenu",
  description: "En-tête de page",
  createDefault: () => createBlockInstance("title", { width: 620, height: 90, content: { text: "Nouveau titre" } }),
  validate: (block) => titleSchema.safeParse(block.content).success,
  migrate: (block) => ({ ...block, version: 1, content: { text: String(block.content.text ?? "Nouveau titre") } }),
  renderEditor: (props) => <TextRenderer {...props} heading />,
  renderLearner: (props) => <TextRenderer {...props} heading />
};
