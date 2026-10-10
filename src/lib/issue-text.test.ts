import { afterEach, describe, expect, it } from 'vitest'
import type { AppError } from '@/api'
import { setI18nLocale } from '@/i18n'
import { mainIssue } from '@/testing/report-fixture'
import { checkName, errorText, issueText, severityText } from './issue-text'

afterEach(() => setI18nLocale('en'))

function err(code: AppError['code']): AppError {
  return { code, retryable: false }
}

describe('errorText', () => {
  it('words every kind in both languages', () => {
    expect(errorText(err({ kind: 'ssh_auth' }), 'en')).toMatch(/SSH did not accept your key/)
    expect(errorText(err({ kind: 'ssh_auth' }), 'vi')).toMatch(/SSH không nhận khoá/)
  })

  it('names the file in config errors, with the line when there is one', () => {
    expect(errorText(err({ kind: 'config_invalid', path: 'projects.json' }), 'en')).toBe(
      'Couldn’t read projects.json. Fix the file or move it aside.',
    )
    expect(
      errorText(err({ kind: 'config_invalid', path: 'projects.json', line: 7 }), 'en'),
    ).toContain('line 7')
    expect(
      errorText(err({ kind: 'config_from_newer_version', path: 'a.json', version: 3 }), 'vi'),
    ).toContain('phiên bản 3')
  })

  it('says ssh stopped at a line of the ssh config, and what to do next', () => {
    const at = err({ kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 })
    expect(errorText(at, 'en')).toBe(
      'ssh stops at line 6 of /u/.ssh/config, so no server can connect. Fix that line, then check again.',
    )
    expect(errorText(at, 'vi')).toBe(
      'ssh dừng ở dòng 6 của /u/.ssh/config, nên chưa máy chủ nào kết nối được. Sửa dòng đó rồi kiểm tra lại.',
    )
    const file = err({ kind: 'ssh_config_invalid', path: '/u/.ssh/config' })
    expect(errorText(file, 'en')).toBe(
      'ssh can’t read /u/.ssh/config, so no server can connect. Fix the file, then check again.',
    )
    expect(errorText(file, 'vi')).toBe(
      'ssh không đọc được /u/.ssh/config, nên chưa máy chủ nào kết nối được. Sửa file rồi kiểm tra lại.',
    )
  })
})

describe('issueText', () => {
  it('builds the sentence from the check id, target and value', () => {
    const swap = mainIssue('sys.swap', { value: 100, unit: '%' })
    expect(issueText(swap, 'en')).toBe('Swap is 100% full')
    expect(issueText(swap, 'vi')).toBe('Swap đã dùng 100%')

    const disk = mainIssue('disk.fs', { target: '/var' })
    expect(issueText(disk, 'en')).toBe('Disk /var is running full')

    const tls = mainIssue('url.tls', { target: 'https://a.test', value: 2.5, unit: 'days' })
    expect(issueText(tls, 'en')).toBe('The certificate of https://a.test expires in 2.5 d')
  })

  it('pluralises by value', () => {
    expect(issueText(mainIssue('sys.oom', { value: 1, unit: 'count' }), 'en')).toBe(
      '1 process was killed for lack of memory',
    )
    expect(issueText(mainIssue('sys.oom', { value: 3, unit: 'count' }), 'en')).toBe(
      '3 processes were killed for lack of memory',
    )
  })

  it('follows the current language when none is given', () => {
    setI18nLocale('vi')
    expect(issueText(mainIssue('sec.preload'))).toBe('ld.so.preload có nội dung')
  })

  it('falls back to the check name for an id it has no sentence for', () => {
    expect(issueText(mainIssue('sys.load.extra'), 'en')).toBe('sys.load.extra needs a look')
    expect(issueText(mainIssue('disk.fs.mystery'), 'en')).toBe('disk.fs.mystery needs a look')
  })
})

describe('checkName and severityText', () => {
  it('translate known ids and keep unknown ones', () => {
    expect(checkName('disk.fs', 'en')).toBe('Disk space')
    expect(checkName('disk.fs', 'vi')).toBe('Dung lượng đĩa')
    expect(checkName('nope.never', 'en')).toBe('nope.never')
  })

  it('uses the five fixed severity words', () => {
    expect(severityText({ level: 'crit' }, 'vi')).toBe('Nghiêm trọng')
    expect(severityText({ level: 'warn' }, 'vi')).toBe('Cảnh báo')
    expect(severityText({ level: 'info' }, 'vi')).toBe('Thông tin')
    expect(severityText({ level: 'ok' }, 'vi')).toBe('Ổn cả')
    expect(severityText({ level: 'unknown', reason: 'needs_perm' }, 'en')).toBe('Needs permission')
  })
})
