// The two palettes the theme cards draw: a miniature Overview in each theme, whichever theme
// the window is in now. They are artwork (the board's real status colours for light and for
// dark), so they are fixed here and do not follow the tokens.
export type PreviewMode = 'light' | 'dark'

export const PREVIEW_VARS: Record<PreviewMode, Record<string, string>> = {
  light: {
    '--pv-page': '#f8f8fc',
    '--pv-side': 'linear-gradient(165deg, #dfe4fb, #f6e4ec)',
    '--pv-search': '#ffffff',
    '--pv-line': '#f4f5fa',
    '--pv-card': '#ffffff',
    '--pv-ink': '#1b1d2a',
    '--pv-chip': '#f4f5fa',
    '--pv-crit': '#b42f57',
    '--pv-crit-wash': '#fce7ef',
    '--pv-warn': '#8f5207',
    '--pv-warn-wash': '#fdf0dc',
    '--pv-ok': '#146b40',
    '--pv-ok-wash': '#e3f5eb',
  },
  dark: {
    '--pv-page': '#101118',
    '--pv-side': 'linear-gradient(165deg, #191c2e, #241b27)',
    '--pv-search': '#1a1c26',
    '--pv-line': '#222431',
    '--pv-card': '#1a1c26',
    '--pv-ink': '#ecedf3',
    '--pv-chip': '#222431',
    '--pv-crit': '#ff97b3',
    '--pv-crit-wash': '#3b1d29',
    '--pv-warn': '#f5c27e',
    '--pv-warn-wash': '#382a16',
    '--pv-ok': '#7bdcac',
    '--pv-ok-wash': '#153327',
  },
}

/** The three project cards of the miniature: sample names, never translated. */
export const PREVIEW_PROJECTS = [
  { name: 'kho-hang', tone: 'crit' },
  { name: 'tiemtra', tone: 'warn' },
  { name: 'booking', tone: 'ok' },
] as const
