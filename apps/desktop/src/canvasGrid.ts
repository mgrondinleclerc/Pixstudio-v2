import type { BlockInstance } from "@pixestudio/core";
import { MIN_BLOCK_HEIGHT, MIN_BLOCK_WIDTH } from "./sceneGeometry";

export const GRID_SIZE = 24;

export function snapToGrid(value: number, gridSize = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapBlockPosition(block: BlockInstance): BlockInstance {
  return { ...block, x: snapToGrid(block.x), y: snapToGrid(block.y) };
}

export function snapBlockSize(block: BlockInstance): BlockInstance {
  return { ...block, width: Math.max(MIN_BLOCK_WIDTH, snapToGrid(block.width)), height: Math.max(MIN_BLOCK_HEIGHT, snapToGrid(block.height)) };
}
