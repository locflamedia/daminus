// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearMocks, mockCommands } from '@/api/testing'
import { startForm } from '@/lib/expected-form'
import { useExpectedStore } from './expected'
import { useToastStore } from './toasts'

const KEY = { host: 'vps-sg-2', check: 'sec.upload_php', target: '/srv/uploads/index.php' }
const RULE = { id: 'r1-0', ...KEY, reason: 'intended', until: '2026-10-26', note: 'silence file' }

type Call = { cmd: string; args: Record<string, unknown> }

function backend(answer: (cmd: string) => unknown) {
  const calls: Call[] = []
  mockCommands((cmd, args) => {
    calls.push({ cmd, args })
    return answer(cmd)
  })
  return calls
}

const reads = (cmd: string) =>
  cmd === 'history_list' ? { scans: [], keep: 20, bytes: 0 } : cmd === 'rules_list' ? [] : null

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => clearMocks())

describe('expected store', () => {
  it('sends only what was chosen, reads the screens again and offers Undo', async () => {
    const calls = backend((cmd) => (cmd === 'rules_add' ? RULE : reads(cmd)))
    const store = useExpectedStore()
    const rule = await store.mark(KEY as never, { ...startForm(), note: ' silence file ' }, 'crit')
    expect(rule?.id).toBe('r1-0')
    expect(calls.find((c) => c.cmd === 'rules_add')).toEqual({
      cmd: 'rules_add',
      args: {
        draft: {
          ...KEY,
          reason: 'intended',
          covers: 'as_it_is',
          review_days: 30,
          note: 'silence file',
        },
      },
    })
    expect(calls.map((c) => c.cmd)).toEqual(
      expect.arrayContaining(['history_list', 'rules_list', 'report_latest']),
    )
    const toasts = useToastStore().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.title).toBe('Marked expected until 26 Oct')
    expect(toasts[0]?.action?.label).toBe('Undo')
  })

  it('removes the rule and reads again when Undo is pressed', async () => {
    const calls = backend((cmd) =>
      cmd === 'rules_add' ? RULE : cmd === 'rules_remove' ? true : reads(cmd),
    )
    const store = useExpectedStore()
    await store.mark(KEY as never, startForm(), 'warn')
    useToastStore().toasts[0]?.action?.run()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.find((c) => c.cmd === 'rules_remove')?.args).toEqual({ id: 'r1-0' })
  })

  it('undoes with ⌘Z while the toast is up', async () => {
    const calls = backend((cmd) =>
      cmd === 'rules_add' ? RULE : cmd === 'rules_remove' ? true : reads(cmd),
    )
    const store = useExpectedStore()
    await store.mark(KEY as never, startForm(), 'warn')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.filter((c) => c.cmd === 'rules_remove')).toHaveLength(1)
  })

  it('keeps the error and shows no toast when Rust refuses', async () => {
    backend((cmd) => {
      if (cmd === 'rules_add') {
        return Promise.reject({
          code: { kind: 'schema_invalid' },
          params: { detail: 'rule_needs_date' },
          retryable: false,
        })
      }
      return reads(cmd)
    })
    const store = useExpectedStore()
    expect(await store.mark(KEY as never, startForm(), 'crit')).toBeNull()
    expect(store.error?.params?.detail).toBe('rule_needs_date')
    expect(store.saving).toBe(false)
    expect(useToastStore().toasts).toEqual([])
  })
})
