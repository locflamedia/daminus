import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const UI = fileURLToPath(new URL('.', import.meta.url))

/** The `<style>` of a primitive, whitespace collapsed. */
function style(name: string): string {
  const source = readFileSync(join(UI, `${name}.vue`), 'utf8')
  const start = source.indexOf('<style')
  return source.slice(start).replace(/\s+/g, ' ')
}

/** Declarations of the first rule whose whole selector is `selector`. */
function rule(name: string, selector: string): string {
  const css = style(name)
  const at = Math.max(css.indexOf(`} ${selector} {`), css.indexOf(`*/ ${selector} {`))
  if (at < 0) throw new Error(`${name}: no rule ${selector}`)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open)).trim()
}

describe('primitive styles follow the boards', () => {
  it('fills a field with an error from the error field token', () => {
    expect(rule('UiField', '.control.invalid')).toContain('background: var(--field-error-bg)')
  })

  it('draws the count of an unselected segment one step lighter than the selected one', () => {
    expect(rule('UiSeg', '.count')).toContain('color: var(--ink-3)')
    expect(rule('UiSeg', '.segment:not(.on) .count')).toContain('color: var(--ink-4)')
  })

  it('keeps the lift of the selected segment under the focus ring', () => {
    expect(rule('UiSeg', ".segment.on:is(:focus-visible, [data-force='focus'])")).toBe(
      'box-shadow: var(--shadow-seg), var(--focus-ring);',
    )
  })

  it('lifts the leading tile of a row with the tile shadow', () => {
    expect(rule('UiRow', '.tile')).toContain('box-shadow: var(--shadow-tile)')
  })

  it('sets the 36 px monogram letter at 14 px', () => {
    expect(rule('UiMonogram', '.size-36')).toContain('font-size: 14px')
  })

  it('rings the language select flush, like a field', () => {
    expect(rule('UiSelect', '.select-language .field:focus-visible')).toBe(
      'box-shadow: var(--focus-ring-flush);',
    )
  })

  it.each([
    ['UiCountBadge', 'var(--text-badge-10-5)'],
    ['UiHostChip', 'var(--text-mono-11-5)'],
    ['UiPathChip', 'var(--text-mono-11-5)'],
    ['UiInlineCode', 'var(--text-mono-11-5)'],
    ['UiHeatmap', 'var(--text-badge-10)'],
    ['UiIssueColumns', 'var(--text-badge-10)'],
  ])('%s takes its small size from a token', (name, token) => {
    const css = style(name)
    expect(css).toContain(token)
    expect(css).not.toMatch(/(font-size: |font: \S+ )1[01](\.5)?px/)
  })
})
