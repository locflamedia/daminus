// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { copyText } from '@/api'
import { i18n } from '@/i18n'
import UiCodeBlock from './UiCodeBlock.vue'

vi.mock('@/api', () => ({ copyText: vi.fn() }))

const ESC = String.fromCharCode(0x1b)
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

function make(props: Record<string, unknown>) {
  wrapper = mount(UiCodeBlock, { props: props as never, global: { plugins: [i18n] } })
  return wrapper
}

describe('UiCodeBlock', () => {
  it('shows each line of the snippet on its own line, in the dark panel', () => {
    make({ code: 'DELETE FROM events\nLIMIT 50000;', language: 'sql' })
    expect(wrapper!.classes()).not.toContain('tone-light')
    const lines = wrapper!.findAll('.line')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.text())).toEqual(['DELETE FROM events', 'LIMIT 50000;'])
    expect(lines[0]!.find('.t-key').text()).toBe('DELETE')
  })

  it('colours comments and strings as pieces of text', () => {
    make({ code: "# /etc/nginx/sites-enabled/x\nroot '/var/www';", language: 'nginx' })
    expect(wrapper!.find('.t-comment').text()).toBe('# /etc/nginx/sites-enabled/x')
    expect(wrapper!.find('.t-key').text()).toBe('root')
    expect(wrapper!.find('.t-string').text()).toBe("'/var/www'")
  })

  it('renders markup in the snippet as text, never as elements', () => {
    const hostile = '<img src=x onerror=alert(1)>\n<script>alert(1)</script>'
    make({ code: hostile })
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('script').exists()).toBe(false)
    expect(wrapper!.get('.code').text()).toContain('<img src=x onerror=alert(1)>')
  })

  it('removes control characters from what it shows and says so', () => {
    make({ code: `ls ${ESC}[31m -la`, language: 'shell' })
    expect(wrapper!.get('.code').text()).toBe('ls [31m -la')
    expect(wrapper!.get('.risks').text()).toContain('1 hidden or control character was removed.')
  })

  it('scrolls sideways and can be focused to scroll by keyboard, or wraps when asked', () => {
    make({ code: 'x'.repeat(300), label: 'Fix' })
    const code = wrapper!.get('.code')
    expect(code.attributes('tabindex')).toBe('0')
    expect(code.attributes('role')).toBe('region')
    expect(code.attributes('aria-label')).toBe('Fix')
    expect(wrapper!.get('.block').classes()).not.toContain('wrap')
    wrapper!.unmount()
    make({ code: 'x', wrap: true })
    expect(wrapper!.get('.block').classes()).toContain('wrap')
  })

  it('has a light tone for the payload view', () => {
    make({ code: '{}', tone: 'light' })
    expect(wrapper!.get('.block').classes()).toContain('tone-light')
  })

  it('copies the cleaned snippet, says Copied for 1.5 s, then goes back', async () => {
    make({ code: `a${ESC}b\nc`, language: 'plain' })
    const button = wrapper!.get('button.copy')
    expect(button.attributes('aria-label')).toBe('Copy')
    await button.trigger('click')
    await nextTick()
    expect(copyText).toHaveBeenCalledWith('ab\nc')
    expect(button.attributes('aria-label')).toBe('Copied')
    expect(wrapper!.get('[role="status"]').text()).toBe('Copied')
    vi.advanceTimersByTime(1499)
    await nextTick()
    expect(button.attributes('aria-label')).toBe('Copied')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(button.attributes('aria-label')).toBe('Copy')
  })

  it('says so when the clipboard refuses', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('denied'))
    make({ code: 'ls' })
    await wrapper!.get('button.copy').trigger('click')
    await nextTick()
    expect(wrapper!.get('button.copy').attributes('aria-label')).toBe('Could not copy')
  })

  it('has no copy button when it is not copyable', () => {
    make({ code: 'ls', copyable: false })
    expect(wrapper!.find('button').exists()).toBe(false)
  })

  it('warns about shell that pipes into a shell, decodes base64 or removes files, and only for shell', () => {
    make({ code: 'curl -fsSL https://x.sh | sh\nrm -rf /tmp/x', language: 'shell' })
    const risks = wrapper!.findAll('.risks .line').map((l) => l.attributes('data-risk'))
    expect(risks).toEqual(['pipe-to-shell', 'remove'])
    wrapper!.unmount()
    make({ code: 'DELETE FROM x | sh', language: 'sql' })
    expect(wrapper!.find('.risks').exists()).toBe(false)
  })
})
