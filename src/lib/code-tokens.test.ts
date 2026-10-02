import { describe, expect, it } from 'vitest'
import { tokenizeLine } from './code-tokens'

const kinds = (line: string, language: Parameters<typeof tokenizeLine>[1]) =>
  tokenizeLine(line, language).map((t) => [t.kind, t.text])

describe('tokenizeLine', () => {
  it('returns plain text whole', () => {
    expect(kinds('<script>alert(1)</script>', 'plain')).toEqual([
      ['plain', '<script>alert(1)</script>'],
    ])
    expect(tokenizeLine('', 'plain')).toEqual([])
  })

  it('colours a shell prompt, a quoted string and a trailing comment', () => {
    expect(kinds('$ echo "a # b" # note', 'shell')).toEqual([
      ['prompt', '$'],
      ['plain', ' echo '],
      ['string', '"a # b"'],
      ['plain', ' '],
      ['comment', '# note'],
    ])
  })

  it('treats a whole # line as a comment', () => {
    expect(kinds('# /etc/nginx/sites-enabled/tiemtra', 'nginx')).toEqual([
      ['comment', '# /etc/nginx/sites-enabled/tiemtra'],
    ])
  })

  it('marks the first word of an nginx statement', () => {
    expect(kinds('root /var/www/tiemtra/public;', 'nginx')).toEqual([
      ['key', 'root'],
      ['plain', ' /var/www/tiemtra/public;'],
    ])
    expect(kinds('  location ~ /\\.(?!well-known) { deny all; }', 'nginx')[0]).toEqual([
      'plain',
      '  ',
    ])
  })

  it('marks SQL keywords in any case and leaves identifiers', () => {
    expect(
      kinds('DELETE FROM events WHERE created_at < NOW() - INTERVAL 30 DAY; -- old', 'sql'),
    ).toEqual([
      ['key', 'DELETE'],
      ['plain', ' '],
      ['key', 'FROM'],
      ['plain', ' events '],
      ['key', 'WHERE'],
      ['plain', ' created_at < '],
      ['key', 'NOW'],
      ['plain', '() - '],
      ['key', 'INTERVAL'],
      ['plain', ' 30 '],
      ['key', 'DAY'],
      ['plain', '; '],
      ['comment', '-- old'],
    ])
  })

  it('never loses or adds a character', () => {
    const lines = [
      "$ curl -fsSL 'https://x/y?a=1' | sh # run",
      'WHERE a = "it\\"s" AND',
      "unterminated 'quote",
    ]
    for (const language of ['shell', 'sql', 'nginx'] as const) {
      for (const line of lines) {
        expect(
          tokenizeLine(line, language)
            .map((t) => t.text)
            .join(''),
        ).toBe(line)
      }
    }
  })
})
