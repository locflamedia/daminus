// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiStreamEvent } from './bindings/AiStreamEvent'
import type { PreviewOptions } from './bindings/PreviewOptions'
import {
  aiAnalyze,
  aiCancel,
  aiModels,
  aiPayloadPreview,
  aiProviders,
  aiSetKey,
  aiSettingsSet,
  aiTest,
  isAppError,
} from './commands'
import { AiMock } from './dev-mock-ai'
import { resetSettingsMock, settingsAnswer } from './dev-mock-settings'
import { onAiEvent } from './events'
import { clearMocks, mockCommands } from './testing'

describe('AI command wrappers', () => {
  afterEach(() => clearMocks())

  it('send the arguments Rust names, in camelCase', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    const ai = { provider: 'ollama', model: null, claude_code_acknowledged: false, base_url: null }
    const options: PreviewOptions = { question: 'q', include: ['diff'], hide_hosts: true }
    await aiProviders()
    await aiSetKey('anthropic', 'k')
    await aiSetKey('anthropic', null)
    await aiSettingsSet(ai)
    await aiModels('ollama')
    await aiTest('ollama')
    await aiPayloadPreview({ kind: 'whole' }, options)
    await aiAnalyze('r1', 'abc')
    await aiCancel('r1')
    expect(calls).toEqual([
      { cmd: 'ai_providers', args: {} },
      { cmd: 'ai_set_key', args: { providerId: 'anthropic', key: 'k' } },
      { cmd: 'ai_set_key', args: { providerId: 'anthropic', key: null } },
      { cmd: 'ai_settings_set', args: { ai } },
      { cmd: 'ai_models', args: { providerId: 'ollama' } },
      { cmd: 'ai_test', args: { providerId: 'ollama' } },
      { cmd: 'ai_payload_preview', args: { scope: { kind: 'whole' }, options } },
      { cmd: 'ai_analyze', args: { requestId: 'r1', previewedHash: 'abc' } },
      { cmd: 'ai_cancel', args: { requestId: 'r1' } },
    ])
  })
})

describe('AI dev mock', () => {
  afterEach(() => {
    clearMocks()
    resetSettingsMock()
    vi.useRealTimers()
  })

  const options: PreviewOptions = {
    question: 'What first?',
    include: ['check_results'],
    hide_hosts: true,
  }

  function install(variant: string) {
    const ai = new AiMock(variant, 1000)
    mockCommands((cmd, args) => ai.handle(cmd, args) ?? settingsAnswer(cmd, args) ?? null)
  }

  it('lists eight providers, some with keys, and Claude Code detected', async () => {
    install('ai')
    const view = await aiProviders()
    expect(view.providers).toHaveLength(8)
    expect(view.providers.filter((p) => p.key_set).map((p) => p.profile.id)).toEqual([
      'anthropic',
      'openrouter',
    ])
    expect(view.claude_code).toMatchObject({ found: true, logged_in: true })
    install('ai-claude-missing')
    expect((await aiProviders()).claude_code.found).toBe(false)
  })

  it('refuses what Rust refuses', async () => {
    install('ai')
    const bad = await aiSettingsSet({
      provider: 'ollama',
      model: null,
      claude_code_acknowledged: false,
      base_url: 'http://example.com',
    }).catch((e: unknown) => e)
    expect(isAppError(bad)).toBe(true)
    install('ai-error-keychain')
    const denied = await aiSetKey('anthropic', 'k').catch((e: unknown) => e)
    expect(denied).toMatchObject({ code: { kind: 'secret_access_denied' } })
  })

  it('streams summary pieces, three findings, then done; a changed hash sends nothing', async () => {
    vi.useFakeTimers()
    install('ai')
    await aiSettingsSet({
      provider: 'ollama',
      model: null,
      claude_code_acknowledged: false,
      base_url: null,
    })
    const events: AiStreamEvent[] = []
    const off = await onAiEvent((e) => events.push(e))
    const preview = await aiPayloadPreview({ kind: 'whole' }, options)
    const refused = await aiAnalyze('r1', 'other').catch((e: unknown) => e)
    expect(refused).toMatchObject({ code: { kind: 'schema_invalid' } })
    await aiAnalyze('r1', preview.hash)
    await vi.advanceTimersByTimeAsync(60_000)
    off()
    const kinds = events.map((e) => e.kind)
    expect(kinds.filter((k) => k === 'finding')).toHaveLength(3)
    expect(kinds.at(-1)).toBe('done')
    expect(kinds[0]).toBe('summary_delta')
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
  })
})
