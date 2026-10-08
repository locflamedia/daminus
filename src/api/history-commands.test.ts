// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { historyFacts, historyList, reportAt, rulesList } from './commands'
import { clearMocks, mockCommands } from './testing'

describe('history command wrappers', () => {
  afterEach(() => clearMocks())

  it('send the arguments Rust names, and nothing else', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    await historyList()
    await reportAt(11)
    await historyFacts(['disk.fs', 'db.size'], 12)
    await rulesList()
    expect(calls).toEqual([
      { cmd: 'history_list', args: {} },
      { cmd: 'report_at', args: { seq: 11 } },
      { cmd: 'history_facts', args: { checks: ['disk.fs', 'db.size'], last: 12 } },
      { cmd: 'rules_list', args: {} },
    ])
  })
})
