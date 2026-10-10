// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SshConfigProblem } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import SshConfigBanner from './SshConfigBanner.vue'

const PROBLEM: SshConfigProblem = {
  error: {
    code: { kind: 'ssh_config_invalid', path: '/Users/someone/.ssh/config', line: 6 },
    retryable: false,
  },
  excerpt: [
    { number: 5, text: 'Host apollo-2' },
    { number: 6, text: '  Port 99999' },
    { number: 7, text: '  User root' },
  ],
}

const calls: string[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
  mockCommands((cmd) => {
    calls.push(cmd)
    return null
  })
})
afterEach(() => {
  clearMocks()
  setI18nLocale('en')
})

function mountBanner(problem: SshConfigProblem = PROBLEM) {
  return mount(SshConfigBanner, { props: { problem }, global: { plugins: [i18n] } })
}

describe('SshConfigBanner', () => {
  it('names the file as ~/.ssh/config, the line, and what to do next', () => {
    const w = mountBanner()
    expect(w.attributes('role')).toBe('alert')
    expect(w.find('.title').text()).toBe('Could not read your SSH config')
    expect(w.find('.text').text()).toBe(
      'ssh stops at line 6 of ~/.ssh/config, so no server can connect. Fix that line, then check again.',
    )
  })

  it('quotes the refused line with one line each side and marks it', () => {
    const w = mountBanner()
    expect(w.findAll('.number').map((n) => n.text())).toEqual(['5', '6', '7'])
    expect(w.findAll('.code.refused').map((c) => c.text())).toEqual(['Port 99999'])
  })

  it('leaves the excerpt out when ssh named no line', () => {
    const w = mountBanner({
      error: { code: { kind: 'ssh_config_invalid', path: '/u/c' }, retryable: false },
      excerpt: [],
    })
    expect(w.find('.excerpt').exists()).toBe(false)
    expect(w.find('.text').text()).toContain('ssh can’t read /u/c')
  })

  it('reveals ~/.ssh in Finder and asks to check again', async () => {
    const w = mountBanner()
    const [reveal, again] = w.findAll('button')
    expect(reveal?.text()).toBe('Reveal in Finder')
    expect(again?.text()).toContain('Check again')
    await reveal?.trigger('click')
    await flushPromises()
    expect(calls).toContain('reveal_ssh_dir')
    await again?.trigger('click')
    expect(w.emitted('recheck')).toHaveLength(1)
  })

  it('speaks Vietnamese', () => {
    setI18nLocale('vi')
    const w = mountBanner()
    expect(w.find('.title').text()).toBe('Không đọc được cấu hình SSH của bạn')
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Mở trong Finder', 'Kiểm tra lại'])
  })
})
