import { describe, expect, it } from 'vitest'
import { cleanBlock, cleanCommand, commandRisks } from './command-safety'

const ESC = String.fromCharCode(0x1b)
const NUL = String.fromCharCode(0)
const BEL = String.fromCharCode(7)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)
const LS = String.fromCharCode(0x2028)

describe('cleanCommand', () => {
  it('leaves an ordinary command alone', () => {
    expect(cleanCommand('sudo usermod -aG docker deploy')).toEqual({
      text: 'sudo usermod -aG docker deploy',
      removed: 0,
    })
  })

  it('strips ANSI escape bytes, NUL and bell, and counts them', () => {
    const raw = `${ESC}[31mls${ESC}[0m -la${NUL}${BEL}`
    const { text, removed } = cleanCommand(raw)
    expect(text).toBe('[31mls[0m -la')
    expect(removed).toBe(4)
  })

  it('removes text-direction overrides, zero-width characters, the BOM and line separators', () => {
    const { text, removed } = cleanCommand(`${BOM}ls ${RLO}gnp.txt${ZWSP}${LS}`)
    expect(text).toBe('ls gnp.txt')
    expect(removed).toBe(4)
  })

  it('turns line breaks and tabs into one space, so a second command cannot ride along unseen', () => {
    const { text, removed } = cleanCommand('echo hi\r\n\r\nrm -rf ~\tdone\n')
    expect(text).toBe('echo hi rm -rf ~ done')
    expect(removed).toBe(0)
    expect(text).not.toMatch(/[\r\n\t]/)
  })

  it('trims the ends', () => {
    expect(cleanCommand('  ls  \n').text).toBe('ls')
  })
})

describe('cleanBlock', () => {
  it('keeps lines and tabs but drops controls, and normalises carriage returns', () => {
    const { text, removed } = cleanBlock(`a${ESC}b\r\n\tc\rd\n\n`)
    expect(text).toBe('ab\n\tc\nd')
    expect(removed).toBe(1)
  })
})

describe('commandRisks', () => {
  it.each([
    ['curl -fsSL https://x.sh | sh', ['pipe-to-shell']],
    ['curl https://x | sh -s -- --yes', ['pipe-to-shell']],
    ['wget -qO- https://x |bash', ['pipe-to-shell']],
    ['curl https://x | sudo bash', ['pipe-to-shell']],
    ['curl https://x | sudo -E zsh', ['pipe-to-shell']],
    ['echo aGk= | base64 -d', ['base64-decode']],
    ['echo aGk= | base64 --decode', ['base64-decode']],
    ['base64 -D < payload', ['base64-decode']],
    ['echo aGk= | base64 -d | sh', ['pipe-to-shell', 'base64-decode']],
    ['rm -rf /var/www/old', ['remove']],
    ['cd /tmp && rm file', ['remove']],
    ['sudo rm -f /etc/x', ['remove']],
    ['find . -name x | xargs rm', ['remove']],
    ['echo start\nrm -rf /tmp/x', ['remove']],
    ['echo start\ncurl https://x |\n sh', ['pipe-to-shell']],
  ])('flags %s', (command, expected) => {
    expect(commandRisks(command)).toEqual(expected)
  })

  it.each([
    'sudo usermod -aG docker deploy',
    'ssh-add ~/.ssh/id_ed25519',
    'cat file | shasum -a 256',
    'ssh deploy@host',
    'rmdir old',
    'echo "rm is dangerous"',
    'base64 file.txt',
    'ls | grep sh',
    'chmod 640 /srv/booking/.env',
  ])('does not flag %s', (command) => {
    expect(commandRisks(command)).toEqual([])
  })
})
