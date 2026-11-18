import { z } from "zod";
import { createBlockInstance } from "@pixestudio/core";
import { ImageRenderer, isSafeImageSource } from "../renderers";
import type { BlockDefinition } from "../types";

const imageSchema = z.object({
  src: z.string().max(200000).refine(isSafeImageSource, "La source doit être une image locale ou intégrée."),
  alt: z.string().max(500),
  sourcePath: z.string().max(2000).optional()
}).strict();

export const imageDefinition: BlockDefinition = {
  type: "image",
  version: 1,
  label: "Image",
  icon: "▧",
  category: "Média",
  description: "Média visuel",
  createDefault: () => createBlockInstance("image", { width: 420, height: 220, content: { src: "", alt: "" } }),
  validate: (block) => imageSchema.safeParse(block.content).success,
  migrate: (block) => ({
    ...block,
    version: 1,
    content: {
      src: String(block.content.src ?? ""),
      alt: String(block.content.alt ?? ""),
      ...(typeof block.content.sourcePath === "string" ? { sourcePath: block.content.sourcePath.slice(0, 2000) } : {})
    }
  }),
  renderEditor: (props) => <ImageRenderer {...props} />,
  renderLearner: (props) => <ImageRenderer {...props} />
};
