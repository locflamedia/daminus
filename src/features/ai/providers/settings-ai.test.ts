// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiMock } from '@/api/dev-mock-ai'
import { resetSettingsMock, settingsAnswer } from '@/api/dev-mock-settings'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useAiProvidersStore } from '@/stores/ai-providers'
import SettingsAi from './SettingsAi.vue'
import { checkBaseUrl } from './provider-state'

const calls: { cmd: string; args: Record<string, unknown> }[] = []

async function mountAi(variant = 'ai'): Promise<VueWrapper> {
  const ai = new AiMock(variant)
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    return settingsAnswer(cmd, args) ?? ai.handle(cmd, args) ?? null
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  host.id = 'settings-actions'
  document.body.append(host)
  const wrapper = mount(SettingsAi, { global: { plugins: [pinia, i18n] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const tile = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-provider="${id}"]`)
const sent = (cmd: string) => calls.filter((c) => c.cmd === cmd)

async function open(wrapper: VueWrapper, id: string) {
  await tile(wrapper, id).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  resetSettingsMock()
  calls.length = 0
  setI18nLocale('en')
})

afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Settings › AI providers: the grid', () => {
  it('draws the eight tiles with their state lines and tags', async () => {
    const wrapper = await mountAi()
    expect(wrapper.findAll('[data-provider]')).toHaveLength(8)
    expect(tile(wrapper, 'anthropic').text()).toContain('Key saved')
    expect(tile(wrapper, 'anthropic').text()).toContain('Recommended')
    expect(tile(wrapper, 'openai').text()).toContain('Add key')
    expect(tile(wrapper, 'openrouter').text()).toContain('Key saved')
    expect(tile(wrapper, 'ollama').text()).toContain('Free · local')
    expect(tile(wrapper, 'custom').text()).toContain('Base URL + key')
    expect(tile(wrapper, 'claude-code').text()).toContain('CLI on this Mac')
    expect(tile(wrapper, 'claude-code').text()).toContain('Beta')
    expect(tile(wrapper, 'openai').get('[data-dot]').attributes('data-dot')).toBe('off')
    expect(tile(wrapper, 'anthropic').get('[data-dot]').attributes('data-dot')).toBe('accent')
  })

  it('makes a chosen provider the active one and turns the dot green', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'anthropic')
    expect(sent('ai_settings_set')).toHaveLength(1)
    expect(tile(wrapper, 'anthropic').text()).toContain('Connected')
    expect(tile(wrapper, 'anthropic').get('[data-dot]').attributes('data-dot')).toBe('ok')
    expect(wrapper.text()).toContain('Active')
  })

  it('speaks Vietnamese', async () => {
    setI18nLocale('vi')
    const wrapper = await mountAi()
    expect(tile(wrapper, 'openai').text()).toContain('Thêm khoá')
    expect(tile(wrapper, 'ollama').text()).toContain('Miễn phí · cục bộ')
  })
})

describe('Settings › AI providers: the key', () => {
  it('sends the key once, clears the field and never shows it again', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'openai')
    const input = wrapper.get('input[type="password"]')
    expect(input.attributes('autocomplete')).toBe('off')
    await input.setValue('sk-secret-123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sent('ai_set_key')).toEqual([
      { cmd: 'ai_set_key', args: { providerId: 'openai', key: 'sk-secret-123456' } },
    ])
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('in Keychain')
    expect(document.body.innerHTML).not.toContain('sk-secret-123456')
    expect(JSON.stringify(useAiProvidersStore().$state)).not.toContain('sk-secret-123456')
  })

  it('says why the Keychain refused, and still clears the field', async () => {
    const wrapper = await mountAi('ai-error-keychain')
    await open(wrapper, 'openai')
    const input = wrapper.get('input[type="password"]')
    await input.setValue('sk-secret-123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('no access to the key stored in Keychain')
    expect(document.body.innerHTML).not.toContain('sk-secret-123456')
  })

  it('offers Replace for a stored key', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'anthropic')
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    const replace = wrapper.findAll('button').find((b) => b.text() === 'Replace')
    await replace?.trigger('click')
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  })
})

describe('Settings › AI providers: models', () => {
  it('lists the models the provider gave', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'anthropic')
    expect(wrapper.text()).toContain('5 models listed')
  })

  it('falls back to typing the model when the list fails', async () => {
    const wrapper = await mountAi('ai-models-fail')
    await open(wrapper, 'anthropic')
    expect(wrapper.text()).toContain('Type the model name')
    const field = wrapper.findAll('input').find((i) => i.attributes('type') !== 'password')
    await field?.setValue('claude-custom-1')
    await wrapper.findAll('form').at(-1)?.trigger('submit')
    await flushPromises()
    const last = sent('ai_settings_set').at(-1)
    expect(last?.args.ai).toMatchObject({ provider: 'anthropic', model: 'claude-custom-1' })
  })
})

describe('Settings › AI providers: the test', () => {
  it('ends in Works with the time', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'anthropic')
    const button = wrapper.findAll('button').find((b) => b.text() === 'Test connection')
    await button?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Works')
    expect(wrapper.text()).toContain('640 ms')
  })

  it('names the failure in the error wording', async () => {
    const wrapper = await mountAi('ai-test-fail')
    await open(wrapper, 'anthropic')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Test connection')
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('not reachable right now')
  })
})

describe('Settings › AI providers: a custom endpoint', () => {
  it('refuses plain http to another machine with a message, and sends nothing', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'custom')
    const url = wrapper.get('input[type="url"]')
    await url.setValue('http://example.com/v1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Plain http is allowed only for localhost')
    expect(
      sent('ai_settings_set').some((c) => (c.args.ai as { base_url: string | null }).base_url),
    ).toBe(false)
  })

  it('accepts https and http to this Mac', async () => {
    expect(checkBaseUrl('https://llm.example.com/v1')).toBeNull()
    expect(checkBaseUrl('http://localhost:11434')).toBeNull()
    expect(checkBaseUrl('http://127.0.0.1:8080')).toBeNull()
    expect(checkBaseUrl('http://example.com')).toBe('scheme')
    expect(checkBaseUrl('https://user:pw@example.com')).toBe('credentials')
    expect(checkBaseUrl('not a url')).toBe('invalid')
    const wrapper = await mountAi()
    await open(wrapper, 'custom')
    await wrapper.get('input[type="url"]').setValue('https://llm.example.com/v1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sent('ai_settings_set').at(-1)?.args.ai).toMatchObject({
      base_url: 'https://llm.example.com/v1',
    })
  })
})

describe('Settings › AI providers: Claude Code', () => {
  it('stays off until "I understand", then turns on with the acknowledgement', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'claude-code')
    expect(sent('ai_settings_set')).toHaveLength(0)
    expect(tile(wrapper, 'claude-code').get('[data-dot]').attributes('data-dot')).toBe('off')
    expect(wrapper.text()).toContain('claude · 2.1.4')
    expect(wrapper.text()).toContain('claude.ai · checked by Claude Code itself')
    expect(wrapper.get('.gated').attributes('inert')).toBeDefined()

    await wrapper.get('input[role="switch"][type="checkbox"]:not([disabled])').setValue(true)
    await flushPromises()
    const ai = sent('ai_settings_set').at(-1)?.args.ai
    expect(ai).toMatchObject({ provider: 'claude-code', claude_code_acknowledged: true })
    expect(tile(wrapper, 'claude-code').get('[data-dot]').attributes('data-dot')).toBe('ok')
    expect(wrapper.get('.gated').attributes('inert')).toBeUndefined()
  })

  it('says when the program is not found or not signed in', async () => {
    const missing = await mountAi('ai-claude-missing')
    await open(missing, 'claude-code')
    expect(missing.text()).toContain('Not found')
    missing.unmount()
    document.body.replaceChildren()
    const out = await mountAi('ai-claude-signed-out')
    await open(out, 'claude-code')
    expect(out.text()).toContain('Not signed in')
  })

  it('shows the three ways it can fail, and the test says which', async () => {
    const wrapper = await mountAi('ai-claude-signed-out')
    await open(wrapper, 'claude-code')
    for (const word of ['Claude Code not found', 'Plan limit reached', 'API key or Claude Code']) {
      expect(wrapper.text()).toContain(word)
    }
    await useAiProvidersStore().setAcknowledged(true)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Test connection')
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Claude Code is not signed in')
  })
})

describe('Settings › AI providers: the AI switch', () => {
  it('turns AI off and back on without losing the provider', async () => {
    const wrapper = await mountAi()
    await open(wrapper, 'anthropic')
    const store = useAiProvidersStore()
    await store.setOn(false)
    expect(store.view?.provider).toBeNull()
    await store.setOn(true)
    expect(store.view?.provider).toBe('anthropic')
  })
})
