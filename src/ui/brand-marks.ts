// The technology marks the cards, tags and topology draw (bundled files, see THIRD_PARTY_NOTICES.md).
// A mark is only drawn where the data names the technology (a compose project, a pm2 app, a
// database engine, a container image); everything else keeps its fallback.
import docker from '@/assets/logos/docker.svg'
import mariadb from '@/assets/logos/mariadb.svg'
import mongodb from '@/assets/logos/mongodb.svg'
import mysql from '@/assets/logos/mysql.svg'
import nginx from '@/assets/logos/nginx.svg'
import nodejs from '@/assets/logos/nodejs.svg'
import pm2 from '@/assets/logos/pm2.svg'
import postgresql from '@/assets/logos/postgresql.svg'
import redis from '@/assets/logos/redis.svg'

export const BRAND_FILES = {
  docker,
  mariadb,
  mongodb,
  mysql,
  nginx,
  nodejs,
  pm2,
  postgresql,
  redis,
} as const

export type BrandName = keyof typeof BRAND_FILES

/** Human names, for the accessible label. */
export const BRAND_TITLES: Record<BrandName, string> = {
  docker: 'Docker',
  mariadb: 'MariaDB',
  mongodb: 'MongoDB',
  mysql: 'MySQL',
  nginx: 'NGINX',
  nodejs: 'Node.js',
  pm2: 'PM2',
  postgresql: 'PostgreSQL',
  redis: 'Redis',
}

/** The mark of a database engine as `projects.json` names it (`mysql`, `postgres`). */
export function brandOfEngine(engine: string | null | undefined): BrandName | null {
  const e = (engine ?? '').toLowerCase()
  if (e === 'postgres' || e === 'postgresql') return 'postgresql'
  if (e === 'mysql' || e === 'mariadb' || e === 'mongodb') return e
  return null
}

/** The mark of a component kind (`compose` is Docker, `pm2` is PM2). */
export function brandOfKind(kind: string): BrandName | null {
  return kind === 'compose' ? 'docker' : kind === 'pm2' ? 'pm2' : null
}

/**
 * The mark of a container image reference (`postgres:16.4`, `docker.io/library/redis:7`):
 * only images whose repository name is one of the known technologies.
 */
export function brandOfImage(image: string | null | undefined): BrandName | null {
  const repo = (image ?? '').split('@')[0]?.split(':')[0]?.split('/').pop()?.toLowerCase() ?? ''
  if (repo === 'postgres' || repo === 'postgresql') return 'postgresql'
  if (repo === 'mysql' || repo === 'mariadb' || repo === 'mongo') {
    return repo === 'mongo' ? 'mongodb' : repo
  }
  if (repo === 'redis' || repo === 'nginx') return repo
  if (repo === 'node') return 'nodejs'
  return null
}
