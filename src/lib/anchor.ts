// Places a floating box (menu, popover, tooltip) next to its trigger, inside the window.
// Pure geometry, so it is tested without a layout engine.

export type Side = 'top' | 'bottom'
export type Align = 'start' | 'center' | 'end'
export type Placement = `${Side}-${Align}`

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Placed {
  left: number
  top: number
  /** The side actually used: it flips when the preferred side has no room and the other has. */
  side: Side
  /** Where the box grows from, relative to its own corner, for the scale-in. */
  origin: string
  /** Distance from the box's left edge to the trigger's centre, for an arrow. */
  arrowLeft: number
}

export interface PlaceOptions {
  placement?: Placement
  /** Space between trigger and box. */
  gap?: number
  /** Space kept to the window edge. */
  margin?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function placeBox(
  anchor: Box,
  box: { width: number; height: number },
  viewport: { width: number; height: number },
  { placement = 'bottom-start', gap = 6, margin = 8 }: PlaceOptions = {},
): Placed {
  const [preferred, align] = placement.split('-') as [Side, Align]

  const below = viewport.height - (anchor.top + anchor.height) - gap - margin
  const above = anchor.top - gap - margin
  let side = preferred
  if (preferred === 'bottom' && box.height > below && above > below) side = 'top'
  if (preferred === 'top' && box.height > above && below > above) side = 'bottom'

  const top = side === 'bottom' ? anchor.top + anchor.height + gap : anchor.top - gap - box.height

  let left = anchor.left
  if (align === 'center') left = anchor.left + anchor.width / 2 - box.width / 2
  if (align === 'end') left = anchor.left + anchor.width - box.width
  left = clamp(left, margin, viewport.width - box.width - margin)

  const originX = clamp(anchor.left + anchor.width / 2 - left, 0, box.width)
  return {
    left: Math.round(left),
    top: Math.round(clamp(top, margin, viewport.height - box.height - margin)),
    side,
    origin: `${Math.round(originX)}px ${side === 'bottom' ? '0' : '100%'}`,
    arrowLeft: Math.round(originX),
  }
}
