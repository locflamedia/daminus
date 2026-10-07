// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { copyText } from '@/api'
import { i18n } from '@/i18n'
import UiCommandCopy from './UiCommandCopy.vue'

vi.mock('@/api', () => ({ copyText: vi.fn() }))

const ESC = String.fromCharCode(0x1b)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)

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

function make(command: string, props: Record<string, unknown> = {}) {
  wrapper = mount(UiCommandCopy, { props: { command, ...props }, global: { plugins: [i18n] } })
  return wrapper
}

const risks = () => wrapper!.findAll('.risks .line').map((l) => l.attributes('data-risk'))

describe('UiCommandCopy', () => {
  it('shows the whole command after a $, on one scrolling line with no ellipsis', () => {
    const long = `sudo ${'a'.repeat(400)} --flag`
    make(long)
    expect(wrapper!.get('.prompt').text()).toBe('$')
    expect(wrapper!.get('.text').text()).toBe(long)
    const source = wrapper!.get('.text')
    expect(source.classes()).toContain('code-scroll')
    expect(source.attributes('tabindex')).toBe('0')
    expect(source.attributes('role')).toBe('region')
    expect(source.attributes('aria-label')).toBe('Command')
    expect(wrapper!.html()).not.toContain('text-overflow')
  })

  it('can drop the prompt', () => {
    make('ls', { prompt: false })
    expect(wrapper!.find('.prompt').exists()).toBe(false)
  })

  it('filters control and hidden characters, and shows the same text it copies', async () => {
    const raw = `ls${ESC}[2J ${RLO}gnp.txt${ZWSP}`
    make(raw)
    expect(wrapper!.get('.text').text()).toBe('ls[2J gnp.txt')
    await wrapper!.get('button.copy').trigger('click')
    expect(copyText).toHaveBeenCalledWith('ls[2J gnp.txt')
    expect(wrapper!.get('.text').text()).toBe(vi.mocked(copyText).mock.calls[0]![0])
    expect(risks()).toEqual(['removed'])
    expect(wrapper!.get('.risks').text()).toContain('3 hidden or control characters were removed.')
  })

  it('joins line breaks into spaces, so a second command cannot be copied unseen', async () => {
    make('echo ok\nrm -rf ~\r\n')
    expect(wrapper!.get('.text').text()).toBe('echo ok rm -rf ~')
    await wrapper!.get('button.copy').trigger('click')
    expect(vi.mocked(copyText).mock.calls[0]![0]).not.toMatch(/[\r\n]/)
  })

  it.each([
    ['curl -fsSL https://get.example.dev/install | sh', 'pipe-to-shell'],
    ['echo aGVsbG8= | base64 -d', 'base64-decode'],
    ['rm -rf /var/www/old', 'remove'],
  ])('warns, in view and in words, about %s', (command, risk) => {
    make(command)
    expect(risks()).toEqual([risk])
    const note = wrapper!.get('.risks')
    expect(note.attributes('role')).toBe('note')
    expect(note.text()).toContain('Read before you run this')
    expect(note.text().length).toBeGreaterThan('Read before you run this'.length + 20)
  })

  it('says so in Vietnamese too', async () => {
    i18n.global.locale.value = 'vi'
    try {
      make('curl x | sh')
      expect(wrapper!.get('.risks').text()).toContain('Đọc kỹ trước khi chạy lệnh này')
      expect(wrapper!.get('button.copy').text()).toContain('Sao chép')
    } finally {
      i18n.global.locale.value = 'en'
    }
  })

  it('has no warning for an ordinary command', () => {
    make('sudo usermod -aG docker deploy')
    expect(wrapper!.find('.risks').exists()).toBe(false)
  })

  it('still copies a flagged command: the person decides with the facts in front of them', async () => {
    make('rm -rf /tmp/x')
    await wrapper!.get('button.copy').trigger('click')
    expect(copyText).toHaveBeenCalledWith('rm -rf /tmp/x')
  })

  it('goes through the clipboard wrapper, then reads Copied for 1.6 s and says copied', async () => {
    make('ssh-add ~/.ssh/id_ed25519')
    const faces = () => wrapper!.findAll('.face').map((f) => f.attributes('data-on'))
    expect(faces()).toEqual(['true', 'false', 'false'])
    await wrapper!.get('button.copy').trigger('click')
    await nextTick()
    expect(copyText).toHaveBeenCalledWith('ssh-add ~/.ssh/id_ed25519')
    expect(wrapper!.emitted('copied')).toEqual([['ssh-add ~/.ssh/id_ed25519']])
    expect(faces()).toEqual(['false', 'true', 'false'])
    expect(wrapper!.get('[role="status"]').text()).toBe('Copied')
    vi.advanceTimersByTime(1600)
    await nextTick()
    expect(faces()).toEqual(['true', 'false', 'false'])
  })

  it('has one accessible name in every state, and the status region is the only announcer', async () => {
    make('ls')
    const button = () => wrapper!.get('button.copy')
    expect(button().attributes('aria-label')).toBe('Copy')
    await button().trigger('click')
    await nextTick()
    expect(button().attributes('aria-label')).toBe('Copy')
    expect(wrapper!.findAll('.face').every((f) => f.attributes('aria-hidden') === 'true')).toBe(
      true,
    )
    expect(wrapper!.findAll('[role="status"]')).toHaveLength(1)
  })

  it('keeps its width: all three faces share one cell', () => {
    make('ls')
    const texts = wrapper!.findAll('.face').map((f) => f.text())
    expect(texts).toEqual(['Copy', 'Copied', 'Failed'])
  })

  it('reports a refused write instead of failing silently', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('denied'))
    make('ls')
    await wrapper!.get('button.copy').trigger('click')
    await nextTick()
    expect(wrapper!.emitted('copied')).toBeUndefined()
    expect(wrapper!.get('button.copy').classes()).toContain('failed')
    expect(wrapper!.get('[role="status"]').text()).toBe('Could not copy')
  })

  it('keeps Failed until the pointer comes back, with the way to copy by hand beside it', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('denied'))
    make('ls')
    const button = wrapper!.get('button.copy')
    const faces = () => wrapper!.findAll('.face').map((f) => f.attributes('data-on'))
    await button.trigger('click')
    await nextTick()
    await nextTick()
    expect(faces()).toEqual(['false', 'false', 'true'])
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(
      'Couldn’t copy. Select the text and press ⌘C.',
    )
    // Time alone does not clear it, and staying on the button does not either.
    vi.advanceTimersByTime(10_000)
    await button.trigger('pointerenter')
    await nextTick()
    expect(faces()).toEqual(['false', 'false', 'true'])
    await button.trigger('pointerleave')
    await button.trigger('pointerenter')
    await nextTick()
    expect(faces()).toEqual(['true', 'false', 'false'])
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    // The text was never hidden, so it can be selected by hand.
    expect(wrapper!.get('.text').text()).toBe('ls')
  })

  it('tries again from Failed and reads Copied', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('denied'))
    make('ls')
    const button = wrapper!.get('button.copy')
    await button.trigger('click')
    await nextTick()
    await button.trigger('click')
    await nextTick()
    expect(button.classes()).toContain('done')
    expect(button.classes()).not.toContain('failed')
  })

  it('renders the command as text', () => {
    make('<img src=x onerror=alert(1)>')
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.get('.text').text()).toBe('<img src=x onerror=alert(1)>')
  })
})
