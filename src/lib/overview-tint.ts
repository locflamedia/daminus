// A project's colour is one of eight tints; setup stores the end stop of the tint as `#rrggbb`.
// A colour that is none of them (a hand-edited file) takes the nearest tint, so a card never
// loses its mark.
import { MONOGRAM_TINTS, type MonogramTint } from '@/ui/monogram-tints'

const END_STOPS: Record<MonogramTint, string> = {
  blue: '#4f6bed',
  lilac: '#8b6fe0',
  rose: '#d86a9a',
  amber: '#b96c0b',
  green: '#1c8f55',
  teal: '#138a8a',
  coral: '#d9603b',
  slate: '#5f6478',
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The tint nearest to `color`; blue when there is no colour. */
export function tintOf(color: string | null | undefined): MonogramTint {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return 'blue'
  const [r, g, b] = rgb(color)
  let best: MonogramTint = 'blue'
  let bestDistance = Infinity
  for (const tint of MONOGRAM_TINTS) {
    const [tr, tg, tb] = rgb(END_STOPS[tint])
    const distance = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2
    if (distance < bestDistance) {
      best = tint
      bestDistance = distance
    }
  }
  return best
}
