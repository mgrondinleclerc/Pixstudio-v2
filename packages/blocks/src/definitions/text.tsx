import { z } from "zod";
import { createBlockInstance } from "@pixestudio/core";
import { TextRenderer } from "../renderers";
import type { BlockDefinition } from "../types";

const textSchema = z.object({ text: z.string().max(10000) }).strict();

export const textDefinition: BlockDefinition = {
  type: "text",
  version: 1,
  label: "Texte",
  icon: "¶",
  category: "Contenu",
  description: "Contenu libre",
  createDefault: () => createBlockInstance("text", { width: 620, height: 150, content: { text: "Commencez à rédiger votre contenu pédagogique." } }),
  validate: (block) => textSchema.safeParse(block.content).success,
  migrate: (block) => ({ ...block, version: 1, content: { text: String(block.content.text ?? "") } }),
  renderEditor: (props) => <TextRenderer {...props} />,
  renderLearner: (props) => <TextRenderer {...props} />
};
