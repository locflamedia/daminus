import { describe, expect, it } from 'vitest'
import { baseName, capitalize, dayTime, servedUrl } from './security-format'

describe('security format helpers', () => {
  it('writes a file time as day, month and clock', () => {
    const seconds = Date.UTC(2026, 8, 24, 2, 14) / 1000
    expect(dayTime(seconds, 'en')).toMatch(/^2[34] Sep \d\d:\d\d$/)
  })

  it('joins a site and a served path with one slash', () => {
    expect(servedUrl('https://shop.test/', '/.env')).toBe('https://shop.test/.env')
    expect(servedUrl('https://shop.test', '/.git/HEAD')).toBe('https://shop.test/.git/HEAD')
  })

  it('takes the last segment of a path and capitalises a sentence start', () => {
    expect(baseName('/a/b/c.php')).toBe('c.php')
    expect(capitalize('fixing nginx')).toBe('Fixing nginx')
  })
})
