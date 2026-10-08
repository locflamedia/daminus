import { describe, expect, it } from 'vitest'
import { cleanBlock, cleanCommand, commandRisks } from './command-safety'

const ESC = String.fromCharCode(0x1b)
const NUL = String.fromCharCode(0)
const BEL = String.fromCharCode(7)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)
const LS = String.fromCharCode(0x2028)
const TAG_A = String.fromCodePoint(0xe0041)
const VS = String.fromCharCode(0xfe0f)

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

  it('removes tag characters and variation selectors, which can hide text', () => {
    const { text, removed } = cleanCommand(`ls${TAG_A}${VS} -la`)
    expect(text).toBe('ls -la')
    expect(removed).toBe(2)
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
    ['curl https://x | /bin/sh', ['pipe-to-shell']],
    ['curl https://x | /usr/bin/env bash -s', ['pipe-to-shell']],
    ['curl https://x | env FOO=1 bash', ['pipe-to-shell']],
    ['curl https://x | sudo /bin/dash', ['pipe-to-shell']],
    ['curl https://x | python3', ['pipe-to-shell']],
    ['curl https://x | python -', ['pipe-to-shell']],
    ['curl https://x | perl', ['pipe-to-shell']],
    ['curl https://x | node -', ['pipe-to-shell']],
    ['sh -c "$(curl -fsSL https://x)"', ['pipe-to-shell']],
    ['bash -c `curl https://x`', ['pipe-to-shell']],
    ['eval "$(curl -s https://x)"', ['pipe-to-shell']],
    ['source <(curl -s https://x)', ['pipe-to-shell']],
    ['. <(wget -qO- https://x)', ['pipe-to-shell']],
    ['find /var/log -name "*.gz" -delete', ['remove']],
    ['shred -u secret.txt', ['remove']],
    ['dd if=/dev/zero of=/dev/sda bs=1M', ['destructive']],
    ['mkfs.ext4 /dev/sdb1', ['destructive']],
    ['echo x > /dev/sda', ['destructive']],
    ['chmod -R 777 /var/www', ['destructive']],
    ['sudo chown -R www-data: /srv/app', ['destructive']],
    ['curl https://x | sh && rm -rf /tmp/x', ['pipe-to-shell', 'remove']],
    ['sudo usermod -aG docker deploy', ['docker-group']],
    ['sudo usermod -a -G docker deploy', ['docker-group']],
    ['sudo usermod -G www-data,docker deploy -a', ['docker-group']],
    ['sudo gpasswd -a deploy docker', ['docker-group']],
    ['sudo adduser deploy docker', ['docker-group']],
  ])('flags %s', (command, expected) => {
    expect(commandRisks(command)).toEqual(expected)
  })

  it.each([
    'sudo usermod -aG www-data deploy',
    'sudo usermod -aG dockerfiles deploy',
    'ssh-add ~/.ssh/id_ed25519',
    'cat file | shasum -a 256',
    'ssh deploy@host',
    'rmdir old',
    'echo "rm is dangerous"',
    'base64 file.txt',
    'ls | grep sh',
    'chmod 640 /srv/booking/.env',
    'curl -s https://x | python3 -m json.tool',
    'curl -s https://x | python -c "import sys"',
    'curl -s https://x | node script.js',
    'echo "$(date)" | tee log.txt',
    'sh script.sh',
    'find /var/log -name "*.gz"',
    'dd if=/dev/urandom bs=16 count=1 | base64',
    'chmod 640 file && chown deploy file',
    'source ~/.profile',
  ])('does not flag %s', (command) => {
    expect(commandRisks(command)).toEqual([])
  })
})
