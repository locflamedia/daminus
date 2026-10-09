<!--
  One find in a column: the mark of the tool it was read from (a neutral glyph when none), its name, the host in mono with what is
  known about it, and the project it was matched to. A find that arrived while the screen was
  open rises in once with a "New" tag and a soft accent wash that fades away.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Find, proxyTarget } from '@/lib/discover-view'
import { type BrandName, brandOfEngine } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import ProjectChip from './ProjectChip.vue'

const props = defineProps<{
  find: Find
  /** The colour of the project chip, from its draft. */
  color?: string | null
  fresh?: boolean
  pulse?: boolean
}>()

const { t } = useI18n()

const ICONS: Record<Find['kind'], IconName> = {
  vhost: 'globe',
  compose: 'container',
  pm2: 'terminal',
  db: 'database',
}

/**
 * The mark of what the record names: an nginx server block, a compose project, a pm2 app, the
 * engine of a database. Nothing is guessed from a folder or a domain name.
 */
const brand = computed<BrandName | null>(() => {
  const r = props.find.record
  if (r.rec === 'vhost') return 'nginx'
  if (r.rec === 'compose') return 'docker'
  if (r.rec === 'pm2') return 'pm2'
  if (r.rec === 'db') return brandOfEngine(r.engine)
  return null
})

/** What is known about the find after its host, in the words of its kind. */
const detail = computed(() => {
  const f = props.find
  const r = f.record
  const parts: string[] = []
  if (r.rec === 'vhost') {
    if (r.proxy) parts.push(t('setupDiscover.find.proxy', { target: proxyTarget(r.proxy) }))
    else if (r.root) parts.push(r.php ? t('setupDiscover.find.php', { path: r.root }) : r.root)
    else parts.push(r.file)
  } else if (r.rec === 'compose') {
    parts.push(
      r.services.length > 1
        ? r.services.join(', ')
        : t('setupDiscover.find.services', { n: r.services.length }, r.services.length),
    )
    if (r.total > 0 && r.running === 0) parts.push(t('setupDiscover.find.stopped'))
  } else if (r.rec === 'pm2') {
    if (r.cwd) parts.push(r.cwd)
    parts.push(t('setupDiscover.find.instances', { n: r.instances }, r.instances))
    if (r.status !== 'online') parts.push(r.status)
  } else if (r.rec === 'db') {
    if (f.port !== null) parts.push(`:${f.port}`)
    parts.push(
      r.origin === 'container'
        ? t('setupDiscover.find.inContainer', { name: r.name })
        : t('setupDiscover.find.process', { name: r.name }),
    )
    if (f.envFound) parts.push(t('setupDiscover.find.envFound'))
  }
  return parts.join(' · ')
})
</script>

<template>
  <li class="find" :class="{ fresh }" :data-testid="`find-${find.kind}`">
    <span class="mark" aria-hidden="true">
      <UiBrandMark :name="brand" :size="18"
        ><UiIcon :name="ICONS[find.kind]" :size="16"
      /></UiBrandMark>
    </span>
    <div class="text">
      <span class="nm">
        {{ find.title }}
        <span v-if="fresh" class="new">{{ t('setupDiscover.find.new') }}</span>
      </span>
      <span class="dt">
        <span class="mono">{{ find.host }}</span> · {{ detail }}
      </span>
    </div>
    <ProjectChip v-if="find.project === 'unassigned'" neutral>
      {{ t('setupDiscover.find.unassigned') }}
    </ProjectChip>
    <ProjectChip v-else-if="find.project" :color="color" :pulse="pulse">
      {{ find.project.name }}
    </ProjectChip>
  </li>
</template>

<style scoped>
.find {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  height: 48px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  list-style: none;
}

.find:nth-child(even) {
  background: var(--surface-1);
}

.fresh {
  animation:
    m-rise var(--dur-enter) var(--ease-out) both,
    wash 1.4s var(--ease-out) both;
}

@keyframes wash {
  from {
    background-color: var(--accent-soft);
  }
  to {
    background-color: transparent;
  }
}

.mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: 0 0 0 1px var(--side-line);
  color: var(--ink-3);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nm {
  display: flex;
  gap: 6px;
  align-items: center;
  overflow: hidden;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new {
  display: inline-grid;
  place-items: center;
  flex: none;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-xs);
  background: var(--accent);
  color: var(--on-solid);
  font-size: 10px;
  /* The tag says "just arrived"; it lets go after a while, with no timer in script. */
  animation: new-out var(--dur-state) var(--ease-out) 8s forwards;
}

@keyframes new-out {
  to {
    opacity: 0;
    transform: scale(0.8);
  }
}

.dt {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
}

@media (prefers-reduced-motion: reduce) {
  .fresh {
    animation: none;
  }

  .new {
    animation-duration: 0.01ms;
  }
}
</style>
