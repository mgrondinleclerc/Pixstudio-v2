import type { BlockInstance } from "@pixestudio/core";

export type SceneSize = { width: number; height: number };

export const DEFAULT_SCENE_SIZE: SceneSize = { width: 720, height: 640 };
export const MIN_BLOCK_WIDTH = 80;
export const MIN_BLOCK_HEIGHT = 50;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function getSceneSize(scene: HTMLElement | null): SceneSize {
  if (!scene || scene.clientWidth <= 0 || scene.clientHeight <= 0) return DEFAULT_SCENE_SIZE;
  return { width: scene.clientWidth, height: scene.clientHeight };
}

export function constrainBlockToSize(block: BlockInstance, size: SceneSize): BlockInstance {
  const width = Math.min(block.width, size.width);
  const height = Math.min(block.height, size.height);
  return {
    ...block,
    x: clamp(block.x, 0, size.width - width),
    y: clamp(block.y, 0, size.height - height),
    width,
    height
  };
}

export function constrainBlockToScene(block: BlockInstance, scene: HTMLElement | null): BlockInstance {
  return constrainBlockToSize(block, getSceneSize(scene));
}

export function resizeBlockFromPointer(
  block: BlockInstance,
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number,
  scene: HTMLElement | null
): BlockInstance {
  const size = getSceneSize(scene);
  const boundedBlock = constrainBlockToSize(block, size);
  const maxWidth = Math.max(MIN_BLOCK_WIDTH, size.width - boundedBlock.x);
  const maxHeight = Math.max(MIN_BLOCK_HEIGHT, size.height - boundedBlock.y);

  return constrainBlockToSize({
    ...boundedBlock,
    width: clamp(startWidth + deltaX, MIN_BLOCK_WIDTH, maxWidth),
    height: clamp(startHeight + deltaY, MIN_BLOCK_HEIGHT, maxHeight)
  }, size);
}
