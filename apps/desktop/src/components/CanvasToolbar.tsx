import { memo } from "react";

type CanvasToolbarProps = {
  showGrid: boolean;
  snapToGrid: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
};

export const CanvasToolbar = memo(function CanvasToolbar({ showGrid, snapToGrid, onToggleGrid, onToggleSnap }: CanvasToolbarProps) {
  return <div className="canvas-tools" aria-label="Options du canvas">
    <button
      type="button"
      className={`canvas-tool ${showGrid ? "active" : ""}`}
      aria-pressed={showGrid}
      aria-label={showGrid ? "Masquer la grille" : "Afficher la grille"}
      title={showGrid ? "Masquer la grille" : "Afficher la grille"}
      onClick={onToggleGrid}
    >▦ <span>Grille</span></button>
    <button
      type="button"
      className={`canvas-tool ${snapToGrid ? "active" : ""}`}
      aria-pressed={snapToGrid}
      aria-label={snapToGrid ? "Désactiver le magnétisme" : "Activer le magnétisme"}
      title={snapToGrid ? "Désactiver le magnétisme" : "Activer le magnétisme"}
      onClick={onToggleSnap}
    >⌁ <span>Magnétisme</span></button>
  </div>;
});
