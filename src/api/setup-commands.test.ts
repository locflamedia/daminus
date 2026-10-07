// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  hostsList,
  projectsRemove,
  projectsSave,
  projectsValidate,
  revealSshDir,
  setupResult,
  setupStart,
  setupStatus,
  setupStop,
  sshEnvironment,
  urlCheck,
} from './commands'
import { clearMocks, mockCommands } from './testing'

describe('setup command wrappers', () => {
  afterEach(() => clearMocks())

  it('send the arguments Rust names, and nothing else', async () => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = []
    mockCommands((cmd, args) => {
      calls.push({ cmd, args })
      return null
    })
    const project = { id: 'shop', name: 'Shop', urls: [], components: [] }
    await hostsList()
    await sshEnvironment()
    await setupStart('test', ['vps-a'], ['/srv/shop'])
    await setupStart('discover', ['vps-a'])
    await setupStop()
    await setupStatus()
    await setupResult()
    await projectsValidate([project])
    await projectsSave([project], ['vps-a'])
    await projectsRemove('shop')
    await urlCheck('https://shop.example')
    await revealSshDir()
    expect(calls).toEqual([
      { cmd: 'hosts_list', args: {} },
      { cmd: 'ssh_environment', args: {} },
      { cmd: 'setup_start', args: { step: 'test', hosts: ['vps-a'], paths: ['/srv/shop'] } },
      { cmd: 'setup_start', args: { step: 'discover', hosts: ['vps-a'], paths: [] } },
      { cmd: 'setup_stop', args: {} },
      { cmd: 'setup_status', args: {} },
      { cmd: 'setup_result', args: {} },
      { cmd: 'projects_validate', args: { projects: [project] } },
      { cmd: 'projects_save', args: { projects: [project], hosts: ['vps-a'] } },
      { cmd: 'projects_remove', args: { id: 'shop' } },
      { cmd: 'url_check', args: { url: 'https://shop.example' } },
      { cmd: 'reveal_ssh_dir', args: {} },
    ])
  })
})
