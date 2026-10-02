// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { copyText } from './clipboard'

afterEach(() => clearMocks())

describe('copyText', () => {
  it('writes through the clipboard plugin command', async () => {
    const calls: { cmd: string; args: unknown }[] = []
    mockIPC((cmd, args) => {
      calls.push({ cmd, args })
    })
    await copyText('sudo usermod -aG docker deploy')
    expect(calls).toEqual([
      {
        cmd: 'plugin:clipboard-manager|write_text',
        args: { label: undefined, text: 'sudo usermod -aG docker deploy' },
      },
    ])
  })

  it('rejects when the system refuses', async () => {
    mockIPC(() => {
      throw new Error('denied')
    })
    await expect(copyText('x')).rejects.toBeDefined()
  })
})
