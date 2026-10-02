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
    expect(note.text()).toContain('Check before you run it')
    expect(note.text().length).toBeGreaterThan('Check before you run it'.length + 20)
  })

  it('says so in Vietnamese too', async () => {
    i18n.global.locale.value = 'vi'
    try {
      make('curl x | sh')
      expect(wrapper!.get('.risks').text()).toContain('Kiểm tra trước khi chạy')
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

  it('goes through the clipboard wrapper, then reads Copied for 1.5 s and says copied', async () => {
    make('ssh-add ~/.ssh/id_ed25519')
    const faces = () => wrapper!.findAll('.face').map((f) => f.attributes('aria-hidden'))
    expect(faces()).toEqual(['false', 'true', 'true'])
    await wrapper!.get('button.copy').trigger('click')
    await nextTick()
    expect(copyText).toHaveBeenCalledWith('ssh-add ~/.ssh/id_ed25519')
    expect(wrapper!.emitted('copied')).toEqual([['ssh-add ~/.ssh/id_ed25519']])
    expect(faces()).toEqual(['true', 'false', 'true'])
    expect(wrapper!.get('[role="status"]').text()).toBe('Copied')
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(faces()).toEqual(['false', 'true', 'true'])
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

  it('renders the command as text', () => {
    make('<img src=x onerror=alert(1)>')
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.get('.text').text()).toBe('<img src=x onerror=alert(1)>')
  })
})
