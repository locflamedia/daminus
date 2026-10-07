// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { vEnter } from '@/lib/motion'
import GroupPreview from './GroupPreview.vue'

const source = readFileSync(
  join(process.cwd(), 'src/features/setup/group/GroupPreview.vue'),
  'utf8',
)

describe('the projects.json preview', () => {
  it('draws one numbered line per line of the file', () => {
    const lines = ['{', '  "id": "a-very-long-value-that-would-wrap-in-a-narrow-column",', '}']
    const wrapper = mount(GroupPreview, {
      props: { lines },
      global: { plugins: [i18n], directives: { enter: vEnter } },
    })
    const rows = wrapper.findAll('.ln')
    expect(rows.map((r) => r.find('.n').text())).toEqual(['1', '2', '3'])
    expect(rows[1]?.find('.t').text()).toBe(lines[1]?.trim())
  })

  it('never wraps a line: it keeps its spaces and scrolls sideways', () => {
    expect(source).toMatch(/\.t \{[^}]*white-space: pre;/)
    expect(/\.t \{([^}]*)\}/.exec(source)?.[1]).not.toContain('overflow-wrap')
    expect(source).toMatch(/\.code \{[^}]*overflow: auto;/)
  })
})
