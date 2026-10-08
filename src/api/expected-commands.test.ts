// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { ExpectedDraft, HostAlias } from '@/api'
import { hostKeyCheck, rulesAdd, rulesRemove } from './commands'
import { clearMocks, mockCommands } from './testing'

const draft: ExpectedDraft = {
  host: 'vps-sg-2',
  check: 'sec.upload_php',
  target: '/srv/booking/uploads/index.php',
  reason: 'intended',
  covers: 'as_it_is',
  review_days: 30,
  note: 'silence file',
} as ExpectedDraft

describe('expected rule and host key wrappers', () => {
  afterEach(() => clearMocks())

  it('send the arguments Rust names, and nothing else', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    await rulesAdd(draft)
    await rulesRemove('r1-0')
    await hostKeyCheck('db-main' as HostAlias)
    expect(calls).toEqual([
      { cmd: 'rules_add', args: { draft } },
      { cmd: 'rules_remove', args: { id: 'r1-0' } },
      { cmd: 'host_key_check', args: { host: 'db-main' } },
    ])
  })

  it('hand back what Rust answered', async () => {
    mockCommands((cmd) => (cmd === 'rules_remove' ? true : { state: 'unknown', known: [] }))
    expect(await rulesRemove('x')).toBe(true)
    expect(await hostKeyCheck('db-main' as HostAlias)).toEqual({ state: 'unknown', known: [] })
  })
})
