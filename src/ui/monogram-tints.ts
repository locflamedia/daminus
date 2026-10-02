/**
 * The eight project colours, in the order a new project is given them. Each is a tint pair in
 * the tokens (`--tint-<name>-1` to `--tint-<name>-2`); the end stop is the project colour.
 */
export const MONOGRAM_TINTS = [
  'blue',
  'lilac',
  'rose',
  'amber',
  'green',
  'teal',
  'coral',
  'slate',
] as const

export type MonogramTint = (typeof MONOGRAM_TINTS)[number]
