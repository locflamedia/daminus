import { describe, expect, it } from 'vitest'
import { item } from '@/testing/item-fixture'
import { buildUsage, USAGE_ROWS } from './server-usage'

const GB = 1024 ** 3
const folder = (target: string, gb: number) =>
  item({ check: 'disk.path', target, value: gb * GB, unit: 'bytes' })

describe('buildUsage', () => {
  it('lists the folders, Docker and big logs largest first with the change since the baseline', () => {
    const now = [
      folder('/srv/app', 6),
      folder('/srv/api', 3),
      item({ check: 'docker.df', value: 18 * GB, unit: 'bytes' }),
    ]
    const before = [
      folder('/srv/app', 5.9),
      item({ check: 'docker.df', value: 15.6 * GB, unit: 'bytes' }),
    ]
    const { rows } = buildUsage(now, before)
    expect(rows.map((r) => r.id)).toEqual(['docker', 'folder:/srv/app', 'folder:/srv/api'])
    expect(rows[0]?.delta).toBeCloseTo(2.4 * GB)
    expect(rows[2]?.delta).toBeNull()
    expect(rows[0]?.share).toBe(1)
    expect(rows[1]?.share).toBeCloseTo(6 / 18)
  })

  it('tags a big log on the folder that holds it and gives a log outside every folder its own row', () => {
    const now = [
      folder('/srv/app', 4),
      item({
        check: 'logs.big',
        target: '/srv/app/storage/logs/laravel.log',
        value: 1.9 * GB,
        unit: 'bytes',
      }),
      item({ check: 'logs.big', target: '/var/log/syslog', value: 1 * GB, unit: 'bytes' }),
    ]
    const { rows } = buildUsage(now, [])
    expect(rows.find((r) => r.id === 'folder:/srv/app')?.log).toEqual({
      name: 'laravel.log',
      bytes: 1.9 * GB,
    })
    expect(rows.find((r) => r.kind === 'log')).toMatchObject({ path: '/var/log/syslog', bytes: GB })
  })

  it('does not match a folder by a shared name prefix', () => {
    const now = [
      folder('/srv/app', 4),
      item({ check: 'logs.big', target: '/srv/application/x.log', value: GB, unit: 'bytes' }),
    ]
    expect(buildUsage(now, []).rows.find((r) => r.id === 'folder:/srv/app')?.log).toBeNull()
  })

  it('keeps the top rows and reads the reclaimable build cache from docker', () => {
    const many = Array.from({ length: 8 }, (_, i) => folder(`/f${i}`, i + 1))
    expect(buildUsage(many, []).rows).toHaveLength(USAGE_ROWS)
    const docker = item({
      check: 'docker.df',
      value: GB,
      unit: 'bytes',
      data: { build_cache: { reclaimable: 6.4 * GB } },
    })
    expect(buildUsage([docker], []).reclaimable).toBe(6.4 * GB)
    expect(buildUsage([], []).reclaimable).toBeNull()
  })
})
