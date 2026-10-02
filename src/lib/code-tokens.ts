// Just enough colouring for the snippets Daminus shows (a shell command, an nginx block, a
// SQL statement): comments, quoted strings, and the first word of an nginx statement or the
// SQL keywords. It returns text pieces and a kind; the component renders them as text, so a
// hostile snippet cannot add markup whatever it contains.

export type CodeLanguage = 'plain' | 'shell' | 'sql' | 'nginx'
export type TokenKind = 'plain' | 'comment' | 'string' | 'key' | 'prompt'

export interface Token {
  text: string
  kind: TokenKind
}

const SQL_KEYWORDS = new Set(
  (
    'SELECT FROM WHERE DELETE INSERT INTO UPDATE SET VALUES LIMIT OFFSET ORDER BY GROUP HAVING ' +
    'JOIN LEFT RIGHT INNER OUTER ON AND OR NOT NULL IS IN LIKE AS DISTINCT UNION ALTER TABLE ' +
    'DROP CREATE INDEX ANALYZE OPTIMIZE TRUNCATE INTERVAL DAY HOUR MINUTE NOW ASC DESC'
  ).split(' '),
)

const STRING = /'(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?/y

function commentStart(line: string, language: CodeLanguage): number {
  const marker = language === 'sql' ? '--' : '#'
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === "'" || ch === '"') {
      quote = ch
    } else if (line.startsWith(marker, i) && (i === 0 || /\s/.test(line[i - 1] ?? ''))) {
      return i
    }
  }
  return -1
}

function push(out: Token[], text: string, kind: TokenKind) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.kind === kind) last.text += text
  else out.push({ text, kind })
}

/** Splits one line into coloured pieces. `plain` returns the line whole. */
export function tokenizeLine(line: string, language: CodeLanguage): Token[] {
  if (language === 'plain') return line ? [{ text: line, kind: 'plain' }] : []

  const out: Token[] = []
  let body = line
  let comment = ''
  const at = commentStart(line, language)
  if (at >= 0) {
    body = line.slice(0, at)
    comment = line.slice(at)
  }

  let i = 0
  if (language === 'shell') {
    const prompt = /^(\s*)(\$ |# )/.exec(body)
    if (prompt && prompt[2] === '$ ') {
      push(out, prompt[1] ?? '', 'plain')
      push(out, '$', 'prompt')
      i = prompt[0].length - 1
    }
  }
  if (language === 'nginx') {
    const first = /^(\s*)([A-Za-z_][\w-]*)/.exec(body)
    if (first) {
      push(out, first[1] ?? '', 'plain')
      push(out, first[2] ?? '', 'key')
      i = first[0].length
    }
  }

  while (i < body.length) {
    const ch = body[i] ?? ''
    if (ch === "'" || ch === '"') {
      STRING.lastIndex = i
      const m = STRING.exec(body)
      if (m) {
        push(out, m[0], 'string')
        i += m[0].length
        continue
      }
    }
    if (language === 'sql' && /[A-Za-z_]/.test(ch)) {
      const word = /[A-Za-z_][\w]*/y
      word.lastIndex = i
      const m = word.exec(body)
      const text = m?.[0] ?? ch
      push(out, text, SQL_KEYWORDS.has(text.toUpperCase()) ? 'key' : 'plain')
      i += text.length
      continue
    }
    push(out, ch, 'plain')
    i += 1
  }
  push(out, comment, 'comment')
  return out
}
