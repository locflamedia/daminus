import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('gallery styles', () => {
  it('names no scoped rule after a class a primitive uses on its root', () => {
    // A scoped `.dot` rule here also matches the root of UiStatusDot and paints it over.
    const source = readFileSync(fileURLToPath(new URL('GalleryMicro.vue', import.meta.url)), 'utf8')
    const css = source.slice(source.indexOf('<style'))
    expect(css).not.toMatch(/(^|\s|\})\.dot\s*\{/)
  })
})
