// The technology marks the cards, tags, topology and setup screens draw (bundled files, see THIRD_PARTY_NOTICES.md).
// A mark is only drawn where the data names the technology (a compose project, a pm2 app, a
// database engine, a container image); everything else keeps its fallback.
import anthropic from '@/assets/logos/anthropic.svg'
import anthropicDark from '@/assets/logos/anthropic-dark.svg'
import claude from '@/assets/logos/claude.svg'
import debian from '@/assets/logos/debian.svg'
import deepseek from '@/assets/logos/deepseek.svg'
import docker from '@/assets/logos/docker.svg'
import gemini from '@/assets/logos/gemini.svg'
import laravel from '@/assets/logos/laravel.svg'
import mariadb from '@/assets/logos/mariadb.svg'
import mongodb from '@/assets/logos/mongodb.svg'
import mysql from '@/assets/logos/mysql.svg'
import nginx from '@/assets/logos/nginx.svg'
import nodejs from '@/assets/logos/nodejs.svg'
import ollama from '@/assets/logos/ollama.svg'
import ollamaDark from '@/assets/logos/ollama-dark.svg'
import openai from '@/assets/logos/openai.svg'
import openaiDark from '@/assets/logos/openai-dark.svg'
import openrouter from '@/assets/logos/openrouter.svg'
import openrouterDark from '@/assets/logos/openrouter-dark.svg'
import pm2 from '@/assets/logos/pm2.svg'
import postgresql from '@/assets/logos/postgresql.svg'
import redis from '@/assets/logos/redis.svg'
import termius from '@/assets/logos/termius.svg'
import ubuntu from '@/assets/logos/ubuntu.svg'

export const BRAND_FILES = {
  anthropic,
  claude,
  debian,
  deepseek,
  docker,
  gemini,
  laravel,
  mariadb,
  mongodb,
  mysql,
  nginx,
  nodejs,
  ollama,
  openai,
  openrouter,
  pm2,
  postgresql,
  redis,
  termius,
  ubuntu,
} as const

export type BrandName = keyof typeof BRAND_FILES

/**
 * The owner's own light-on-dark file of a single-colour mark (black on light themes, white on
 * dark ones). Only these four ship one; the others are lifted, never recoloured.
 */
export const BRAND_DARK_FILES: Partial<Record<BrandName, string>> = {
  anthropic: anthropicDark,
  ollama: ollamaDark,
  openai: openaiDark,
  openrouter: openrouterDark,
}

/** Human names, for the accessible label. */
export const BRAND_TITLES: Record<BrandName, string> = {
  anthropic: 'Anthropic',
  claude: 'Claude',
  debian: 'Debian',
  deepseek: 'DeepSeek',
  docker: 'Docker',
  gemini: 'Gemini',
  laravel: 'Laravel',
  mariadb: 'MariaDB',
  mongodb: 'MongoDB',
  mysql: 'MySQL',
  nginx: 'NGINX',
  nodejs: 'Node.js',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  pm2: 'PM2',
  postgresql: 'PostgreSQL',
  redis: 'Redis',
  termius: 'Termius',
  ubuntu: 'Ubuntu',
}

/** The mark of an AI provider profile (`custom`, a compatible endpoint, has none). */
export function brandOfProvider(id: string | null | undefined): BrandName | null {
  if (id === 'claude-code') return 'claude'
  const known: readonly string[] = [
    'anthropic',
    'openai',
    'gemini',
    'openrouter',
    'deepseek',
    'ollama',
  ]
  return known.includes(id ?? '') ? (id as BrandName) : null
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

/**
 * The mark of a Linux distribution as a login test reports it (`Ubuntu 22.04.5 LTS`,
 * `Debian GNU/Linux 12 (bookworm)`): only the two distributions with a bundled mark.
 */
export function brandOfDistro(distro: string | null | undefined): BrandName | null {
  const d = (distro ?? '').trim().toLowerCase()
  if (d.startsWith('ubuntu')) return 'ubuntu'
  if (d.startsWith('debian')) return 'debian'
  return null
}
