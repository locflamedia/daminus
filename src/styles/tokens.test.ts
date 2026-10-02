import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8')

/** Declarations (`--name: value`) inside the block that starts at `selector`'s `{`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  let depth = 0
  let i = css.indexOf('{', start)
  const open = i
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) break
  }
  const body = css.slice(open + 1, i)
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1] ?? '', (m[2] ?? '').replace(/\s+/g, ' ').trim())
  }
  return out
}

const light = block(':root')
const darkAttr = block(":root[data-theme='dark']")
const darkMedia = block(":root:not([data-theme='light'])")

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files(path, ext, out)
    else if (ext.test(name)) out.push(path)
  }
  return out
}

describe('light tokens match the canvas', () => {
  const expected: Record<string, string> = {
    '--ink': '#1b1d2a',
    '--ink-2': '#3f4356',
    '--ink-3': '#5f6478',
    '--ink-4': '#80859a',
    '--ink-5': '#a3a7b9',
    '--surface-0': '#ffffff',
    '--surface-1': '#f4f5fa',
    '--surface-2': '#eceef6',
    '--surface-3': '#e6e8f1',
    '--base': '#eceef8',
    '--surface-well': '#f7f8fc',
    '--page': '#f8f8fc',
    '--page-sheet': '#f2f3f8',
    '--btn': '#1c1d24',
    '--btn-hover': '#33343e',
    '--secondary-hover': '#f9fafc',
    '--danger-hover': '#f8d8e3',
    '--danger-press': '#f4cbd9',
    '--accent': '#4f6bed',
    '--accent-ink': '#3a55d6',
    '--accent-soft': '#e9edfe',
    '--accent-mid': '#b9c5fa',
    '--ok-solid': '#1c8f55',
    '--ok-ink': '#146b40',
    '--ok-soft': '#e3f5eb',
    '--warn-solid': '#b96c0b',
    '--warn-ink': '#8f5207',
    '--warn-soft': '#fdf0dc',
    '--crit-solid': '#d2436a',
    '--crit-ink': '#b42f57',
    '--crit-soft': '#fce7ef',
    '--wash-1': '#a9b9f5',
    '--wash-2': '#d2c2f4',
    '--wash-3': '#f4c9dc',
  }
  it.each(Object.entries(expected))('%s is %s', (name, value) => {
    expect(light.get(name)).toBe(value)
  })

  it('keeps the spacing, radius, size and height scales', () => {
    const px = (names: string[]) => names.map((n) => light.get(n))
    expect(
      px([
        '--space-1',
        '--space-2',
        '--space-3',
        '--space-4',
        '--space-5',
        '--space-6',
        '--space-8',
        '--space-10',
      ]),
    ).toEqual(['4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px'])
    expect(px(['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg'])).toEqual([
      '6px',
      '10px',
      '14px',
      '20px',
    ])
    expect(
      px(['--text-11', '--text-12', '--text-13', '--text-15', '--text-20', '--text-28']),
    ).toEqual(['11px', '12px', '13px', '15px', '20px', '28px'])
    expect(
      px([
        '--h-kbd',
        '--h-chip',
        '--h-control-sm',
        '--h-control',
        '--h-row',
        '--h-composer',
        '--h-status-row',
      ]),
    ).toEqual(['18px', '22px', '28px', '32px', '40px', '44px', '56px'])
  })

  it('keeps the control motion durations of the Motion board', () => {
    expect(light.get('--dur-press')).toBe('140ms')
    expect(light.get('--dur-track')).toBe('150ms')
    expect(light.get('--dur-check')).toBe('180ms')
    expect(light.get('--dur-knob')).toBe('220ms')
  })

  it('keeps the surface durations of the Motion in the app table', () => {
    expect(light.get('--dur-popover')).toBe('150ms')
    expect(light.get('--dur-sheet')).toBe('200ms')
    expect(light.get('--dur-drawer')).toBe('300ms')
    expect(light.get('--dur-toast')).toBe('220ms')
    expect(light.get('--dur-toast-out')).toBe('200ms')
    expect(light.get('--dur-menu-close')).toBe('120ms')
    expect(light.get('--dur-theme')).toBe('200ms')
  })

  it('draws the segmented track in surface-1 in both themes', () => {
    expect(light.get('--seg-track')).toBe('var(--surface-1)')
    expect(darkAttr.get('--seg-track')).toBe('var(--surface-1)')
  })

  it('keeps the severity washes, scrims and code colours of the boards', () => {
    expect(light.get('--card-wash-crit')).toBe('#fff1f5')
    expect(light.get('--card-wash-warn')).toBe('#fff7ec')
    expect(light.get('--card-wash-info')).toBe('#f3f5ff')
    expect(darkAttr.get('--card-wash-crit')).toBe('#2a1820')
    expect(darkAttr.get('--card-wash-warn')).toBe('#2a2116')
    expect(darkAttr.get('--card-wash-info')).toBe('#1c2033')
    expect(light.get('--scrim-sheet')).toBe('rgba(27, 29, 42, 0.16)')
    expect(light.get('--scrim-dialog')).toBe('rgba(27, 29, 42, 0.24)')
    expect(light.get('--code-hl')).toBe('#f4a6bf')
    expect(light.get('--delay-tooltip')).toBe('400ms')
    expect(light.get('--delay-sheen')).toBe('400ms')
  })

  it('keeps the easing curves of the Motion boards', () => {
    expect(light.get('--ease-out')).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
    // One curve for moving things: the drawer is the same token.
    expect(light.get('--ease-in-out')).toBe('cubic-bezier(0.77, 0, 0.175, 1)')
    expect(light.get('--ease-drawer')).toBe('var(--ease-in-out)')
    expect(light.get('--ease-settle')).toBe('cubic-bezier(0.34, 1.4, 0.64, 1)')
  })
})

describe('topology role tokens match the Overview boards', () => {
  it('colours FE, BE, DB and worker, and re-lights them for dark', () => {
    expect([
      light.get('--role-fe'),
      light.get('--role-be'),
      light.get('--role-db'),
      light.get('--role-worker'),
    ]).toEqual(['#3a55d6', '#6a4fc4', '#146b40', '#b0487a'])
    for (const dark of [darkAttr, darkMedia]) {
      expect([
        dark.get('--role-fe'),
        dark.get('--role-be'),
        dark.get('--role-db'),
        dark.get('--role-worker'),
      ]).toEqual(['#a3b2ff', '#bba7ff', '#7bdcac', '#f2a0c6'])
    }
  })

  it('fills a node white in light and surface-2 without a shadow in dark', () => {
    expect(light.get('--node-bg')).toBe('var(--surface-0)')
    expect(darkAttr.get('--node-bg')).toBe('var(--surface-2)')
    expect(darkAttr.get('--shadow-node')).toBe('none')
    expect(darkMedia.get('--shadow-node')).toBe('none')
  })
})

describe('chart tokens match the canvas', () => {
  const expected: Record<string, string> = {
    '--chart-accent-70': '#8fa2ff',
    '--chart-lilac': '#b9a6f2',
    '--chart-lilac-soft': '#c9b6f7',
    '--chart-blush': '#f2a7c3',
    '--chart-grey': '#d6d9e4',
    '--chart-grey-soft': '#e2e4ee',
    '--chart-amber': '#b96c0b',
    '--chart-amber-soft': '#f2cf96',
    '--chart-rose-soft': '#f3b8c9',
    '--chart-bar-old': '#c9d2fa',
    '--chart-bar-top': '#6f87f2',
    '--chart-issue-warn': '#e9a23b',
    '--chart-issue-info': '#a9b9f5',
    '--tile-1': '#d2c2f4',
    '--tile-2': '#c5cdf7',
    '--tile-3': '#dce3ff',
    '--tile-grow': '#f6d2a0',
    '--heat-ok': '#bfe3cf',
    '--heat-warn': '#f2cf96',
    '--heat-crit': '#efa8bf',
    '--heat-none': '#eceef6',
    '--strip-ok': '#bfe3cf',
    '--strip-warn': '#f2cf96',
    '--strip-crit': '#efa8bf',
    '--strip-none': '#e6e8f1',
    '--hatch-1': '#e6e8f1',
    '--hatch-2': '#f7f8fc',
  }
  it.each(Object.entries(expected))('%s is %s', (name, value) => {
    expect(light.get(name)).toBe(value)
  })

  it('re-lights every chart colour for dark, so a tint never stays pale on a dark card', () => {
    for (const name of Object.keys(expected)) {
      if (name === '--chart-issue-info' || name.startsWith('--hatch')) continue
      expect(darkAttr.get(name), name).toBeDefined()
      expect(darkAttr.get(name), name).not.toBe(light.get(name))
    }
  })

  it('uses one tint set for the scan strips and the heatmap', () => {
    for (const state of ['ok', 'warn', 'crit']) {
      expect(light.get(`--heat-${state}`)).toBe(light.get(`--strip-${state}`))
      expect(darkAttr.get(`--heat-${state}`)).toBe(darkAttr.get(`--strip-${state}`))
    }
  })

  it('keeps the dark chart palette of the Components · Dark board', () => {
    const dark: Record<string, string> = {
      '--chart-lilac': '#a893f0',
      '--chart-lilac-soft': '#3a3160',
      '--chart-blush': '#5a2a3e',
      '--chart-bar-old': '#34407a',
      '--heat-ok': '#1e4a35',
      '--heat-warn': '#5a4319',
      '--heat-crit': '#5c2a3b',
      '--chart-issue-warn': '#f0a64a',
      '--tile-1': '#252b4c',
      '--tile-2': '#2e2a4a',
      '--tile-grow': '#3b2a1a',
    }
    for (const [name, value] of Object.entries(dark)) expect(darkAttr.get(name), name).toBe(value)
  })

  it('keeps the chart durations of the Motion board: bars 500 ms, tween and fade 300 ms', () => {
    expect(light.get('--dur-bar')).toBe('500ms')
    expect(light.get('--dur-tween')).toBe('300ms')
    expect(light.get('--dur-fade')).toBe('300ms')
    expect(light.get('--dur-gauge')).toBe('700ms')
    expect(light.get('--dur-draw')).toBe('600ms')
  })
})

describe('dark tokens match the canvas', () => {
  const expected: Record<string, string> = {
    '--page': '#101118',
    '--surface-0': '#1a1c26',
    '--surface-1': '#222431',
    '--surface-2': '#2a2d3b',
    '--code': '#0b0c11',
    '--ink': '#ecedf3',
    '--ink-2': '#c5c8d6',
    '--ink-3': '#9ea3b8',
    '--ink-4': '#80859a',
    '--accent': '#7b91ff',
    '--accent-ink': '#a3b2ff',
    '--ok-ink': '#7bdcac',
    '--warn-ink': '#f5c27e',
    '--crit-ink': '#ff97b3',
    '--ok-solid': '#3cc585',
    '--warn-solid': '#f0a64a',
    '--crit-solid': '#ff6e96',
    '--ok-soft': '#153327',
    '--warn-soft': '#382a16',
    '--crit-soft': '#3b1d29',
    '--accent-soft': '#252b4c',
    '--btn': '#ecedf3',
    '--btn-ink': '#101118',
  }
  it.each(Object.entries(expected))('%s is %s', (name, value) => {
    expect(darkAttr.get(name)).toBe(value)
  })
})

describe('dark token gaps are filled with the values of the Components · Dark board', () => {
  const expected: Record<string, string> = {
    '--surface-well': '#20222d',
    '--accent-mid': '#7b91ff',
    '--accent-ink-hover': '#c2ccff',
    '--side-hover': 'rgba(255, 255, 255, 0.05)',
    '--kbd-on-glass': 'rgba(255, 255, 255, 0.08)',
    '--shadow-tray': '0 1px 2px rgba(0, 0, 0, 0.4)',
    '--shadow-overlay': '0 1px 2px rgba(0, 0, 0, 0.5), 0 40px 90px -40px rgba(0, 0, 0, 0.8)',
    '--shadow-pop': '0 1px 2px rgba(0, 0, 0, 0.45), 0 20px 40px -16px rgba(0, 0, 0, 0.7)',
    '--scrim-sheet': 'rgba(0, 0, 0, 0.4)',
    '--scrim-dialog': 'rgba(0, 0, 0, 0.55)',
    '--btn': '#ecedf3',
    // The glass tray is the card tone at the light twin's opacity.
    '--tray': 'rgba(26, 28, 38, 0.55)',
  }
  it.each(Object.entries(expected))('%s is %s', (name, value) => {
    expect(darkAttr.get(name)).toBe(value)
  })

  it('leaves the ambient washes and blob as they are in light', () => {
    for (const name of ['--wash-1', '--wash-2', '--wash-3', '--blob']) {
      expect(darkAttr.get(name), name).toBe(light.get(name))
    }
  })

  it('derives the dark button hovers from the tokens, not from picked colours', () => {
    expect(darkAttr.get('--btn-hover')).toBe('color-mix(in srgb, var(--btn) 90%, var(--btn-ink))')
    expect(darkAttr.get('--danger-hover')).toBe(
      'color-mix(in srgb, var(--crit-soft), var(--crit-ink) 7%)',
    )
    expect(darkAttr.get('--danger-press')).toBe(
      'color-mix(in srgb, var(--crit-soft), var(--crit-ink) 14%)',
    )
  })
})

describe('theme blocks', () => {
  it('apply the same dark values for [data-theme=dark] and for the system setting', () => {
    expect([...darkMedia.entries()]).toEqual([...darkAttr.entries()])
  })

  it('re-light every token the dark set declares, and only tokens that exist in light', () => {
    for (const name of darkAttr.keys()) {
      if (name === 'color-scheme') continue
      expect(light.has(name), name).toBe(true)
    }
  })

  it('wraps the system dark block so an explicit light theme wins', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(":root:not([data-theme='light'])")
  })
})

describe('token usage', () => {
  // Set from script on the element itself (see lib/motion.ts), so not declared in CSS; the
  // two knobs of UiCard that a caller sets on the element for a denser or looser board; and the
  // swatch colour and column count a chart passes down from its data.
  const RUNTIME = new Set([
    '--d',
    '--hold',
    '--card-gap',
    '--card-pad',
    '--swatch',
    '--cols',
    '--mark',
  ])

  it('only references tokens that are defined', () => {
    const defined = new Set([...light.keys(), ...darkAttr.keys()])
    const used = new Map<string, string>()
    for (const file of files(SRC, /\.(css|vue)$/)) {
      if (file.endsWith('tokens.css')) continue
      const text = readFileSync(file, 'utf8')
      // Locally defined custom properties (`--d`, `--side-col`) are fine.
      const local = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] ?? ''))
      for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
        const name = m[1] ?? ''
        if (!defined.has(name) && !local.has(name) && !RUNTIME.has(name)) used.set(name, file)
      }
    }
    expect([...used]).toEqual([])
  })
})

describe('primitives', () => {
  // Colour comes from tokens. The flag artwork (src/ui/flags.ts) is brand art, kept in script.
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

  it('hard-code no colour in their styles', () => {
    const offenders: string[] = []
    for (const dir of ['ui', 'features/dev/gallery']) {
      for (const file of files(join(SRC, dir), /\.vue$/)) {
        const text = readFileSync(file, 'utf8')
        const style = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '')
        if (style.some((css) => COLOUR.test(css))) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
