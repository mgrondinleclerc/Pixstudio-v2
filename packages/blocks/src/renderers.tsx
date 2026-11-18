import React from "react";
import type { BlockRendererProps } from "./types";

export function isSafeImageSource(source: string): boolean {
  if (source === "") return true;
  const isPackagedAsset = source.startsWith("asset://assets/") && !source.includes("\\") && !source.split("/").includes("..");
  const isEmbeddedImage = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(source);
  return isPackagedAsset || isEmbeddedImage;
}

export const TextRenderer: React.FC<BlockRendererProps & { heading?: boolean }> = ({ block, heading }) => {
  const text = typeof block.content.text === "string" ? block.content.text : "";
  return heading ? <h1 className="block-title">{text || "Titre du cours"}</h1> : <p className="block-text">{text || "Ajoutez votre texte…"}</p>;
};

export const ImageRenderer: React.FC<BlockRendererProps> = ({ block }) => {
  const candidate = typeof block.content.src === "string" ? block.content.src : "";
  const src = isSafeImageSource(candidate) ? candidate : "";
  const alt = typeof block.content.alt === "string" ? block.content.alt : "";
  return src ? <img className="block-image" src={src} alt={alt} /> : <div className="image-placeholder"><span>▧</span><small>Collez ou glissez une image ici</small></div>;
};
