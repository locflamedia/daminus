// In full screen the window sets `data-fullscreen="true"` on <html>, and the sidebars hide
// their traffic-light slot. Vue's scoped CSS drops whatever follows `:global(...)`, so a rule
// written as `:global(:root[data-fullscreen='true']) .lights` compiles to
// `[data-fullscreen=true] { display: none }` and hides the whole page. These tests compile the
// real styles and check that every full-screen rule still reaches its own element.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from 'vue/compiler-sfc'

const SRC = join(__dirname, '..')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return vueFiles(path)
    return e.name.endsWith('.vue') ? [path] : []
  })
}

/** The compiled CSS of a component's scoped style blocks. */
function scopedCss(file: string): string {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  return descriptor.styles
    .filter((s) => s.scoped)
    .map(
      (s) =>
        compileStyle({ source: s.content, filename: file, id: 'data-v-test', scoped: true }).code,
    )
    .join('\n')
}

/**
 * Whether some `:global(...)` in `css` is followed by more selector before `{` or `,`, the part
 * Vue silently drops. Parentheses are counted, so `:global(:root:not(.a) .b)` is fine.
 */
function dropsAfterGlobal(css: string): boolean {
  for (let at = css.indexOf(':global('); at !== -1; at = css.indexOf(':global(', at + 1)) {
    let depth = 0
    let end = at + ':global'.length
    for (; end < css.length; end++) {
      if (css[end] === '(') depth++
      else if (css[end] === ')' && --depth === 0) break
    }
    const rest = css.slice(end + 1).match(/^[^{,]*/)?.[0] ?? ''
    if (rest.trim() !== '') return true
  }
  return false
}

/** Selectors of every rule that mentions the full-screen flag. */
function fullscreenSelectors(css: string): string[] {
  return [...css.matchAll(/([^{}]*\[data-fullscreen[^{}]*)\{/g)].map((m) => m[1]!.trim())
}

describe('full-screen styles', () => {
  const files = vueFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes('data-fullscreen'))

  it('are found in the layout components', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [f.slice(SRC.length + 1), f]))(
    '%s never styles the page root on its own',
    (_name, file) => {
      const selectors = fullscreenSelectors(scopedCss(file))
      expect(selectors.length).toBeGreaterThan(0)
      for (const selector of selectors) {
        // Each rule must still select a scoped element inside the page, not <html> itself.
        expect(selector).toMatch(/\[data-fullscreen=["']?true["']?\]\s+\S*\[data-v-test\]/)
      }
    },
  )

  it('no scoped style puts a selector after :global(...), which Vue would drop', () => {
    const offenders = vueFiles(SRC).filter((file) => {
      const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
      return descriptor.styles.filter((s) => s.scoped).some((s) => dropsAfterGlobal(s.content))
    })
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})
