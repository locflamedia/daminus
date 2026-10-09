import { STAGE_H, STAGE_W } from './scene'

export interface StagePlacement {
  scale: number
  /** Offset of the stage's top-left corner inside the container. */
  x: number
  y: number
}

/** Scales the stage to cover a `width` x `height` container, centred; overflow is cropped. */
export function coverPlacement(width: number, height: number): StagePlacement {
  const scale = Math.max(width / STAGE_W, height / STAGE_H)
  return { scale, x: (width - STAGE_W * scale) / 2, y: (height - STAGE_H * scale) / 2 }
}
