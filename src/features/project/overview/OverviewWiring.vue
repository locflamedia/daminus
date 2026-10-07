<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { vEnter } from '@/lib/motion'
import type { WireBand, WireNode } from '@/lib/project-overview'
import { useLayoutRange } from '@/lib/viewport'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import ProjectCard from '../common/ProjectCard.vue'
import { nodeLine, shortName } from './part-text'

const props = defineProps<{
  id: string
  bands: readonly WireBand[]
  seq: number | null
  parts: number
}>()

const { t } = useI18n()
const fmt = useFormat()
const range = useLayoutRange()

/** Geometry of the diagram, as the board draws it: bands side by side, nodes centred in them. */
const BAND_W = 216
const BAND_GAP = 8
const NODE_W = 196
const NODE_H = 56
const HEIGHT = 196

const ICON: Record<WireNode['kind'], IconName> = {
  path: 'folder',
  pm2: 'terminal',
  compose: 'container',
  db: 'database',
}

interface Placed {
  node: WireNode
  x: number
  y: number
}

const placed = computed<Placed[][]>(() =>
  props.bands.map((band, i) =>
    band.nodes.map((node, k) => ({
      node,
      x: i * (BAND_W + BAND_GAP) + (BAND_W - NODE_W) / 2,
      y: (HEIGHT * (k + 1)) / (band.nodes.length + 1) - NODE_H / 2,
    })),
  ),
)
const links = computed(() => {
  const out: string[] = []
  for (let i = 0; i < placed.value.length - 1; i++) {
    for (const a of placed.value[i] ?? []) {
      for (const b of placed.value[i + 1] ?? []) {
        const x1 = a.x + NODE_W
        const y1 = a.y + NODE_H / 2
        const x2 = b.x
        const y2 = b.y + NODE_H / 2
        const mid = (x2 - x1) / 2
        out.push(`M${x1} ${y1} C${x1 + mid} ${y1} ${x2 - mid} ${y2} ${x2} ${y2}`)
      }
    }
  }
  return out
})

const servers = computed(() => new Set(props.bands.flatMap((b) => b.hosts)).size)
const meta = computed(() =>
  t('projectOverview.wiring.meta', {
    servers: t('projectOverview.wiring.servers', { n: servers.value }, servers.value),
    parts: t('projectOverview.wiring.parts', { n: props.parts }, props.parts),
    seq: props.seq ?? '—',
  }),
)
const bandLabel = (b: WireBand) =>
  b.data ? t('projectOverview.wiring.data', { host: b.hosts.join(' + ') }) : b.hosts.join(' + ')
const line = (n: WireNode) => nodeLine(n, t, (v) => fmt.measure(v, 'bytes').text)
const stateWord = (n: WireNode) => t(`projectOverview.wiring.state.${n.tone}`)
const list = computed(() => range.value === 'narrow')
const width = computed(() => props.bands.length * BAND_W + (props.bands.length - 1) * BAND_GAP)
</script>

<template>
  <ProjectCard
    icon="grid"
    :title="t('projectOverview.wiring.title', { name: id })"
    :meta="meta"
    :gap="10"
  >
    <p v-if="bands.length === 0" class="none">{{ t('projectOverview.wiring.none') }}</p>
    <div
      v-else
      class="diagram"
      :class="{ list }"
      role="group"
      :aria-label="t('projectOverview.wiring.label', { name: id })"
      :style="list ? undefined : { height: `${HEIGHT}px`, minWidth: `${width}px` }"
    >
      <template v-if="!list">
        <div
          v-for="(b, i) in bands"
          :key="b.tier"
          class="band"
          :class="`tier-${i % 2}`"
          :style="{ left: `${i * (BAND_W + BAND_GAP)}px`, width: `${BAND_W}px` }"
        >
          <span class="host">{{ bandLabel(b) }}</span>
        </div>
        <svg class="links" :width="width" :height="HEIGHT" aria-hidden="true" focusable="false">
          <path v-for="(d, i) in links" :key="i" :d="d" class="link" stroke-dasharray="3 5" />
        </svg>
      </template>
      <template v-for="(col, i) in placed" :key="i">
        <div
          v-for="p in col"
          :key="p.node.id"
          v-enter="{ index: i }"
          class="node"
          :style="
            list
              ? undefined
              : { left: `${p.x}px`, top: `${p.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }
          "
        >
          <span class="mark" aria-hidden="true"
            ><UiIcon :name="ICON[p.node.kind]" :size="18"
          /></span>
          <div class="words">
            <span class="top">
              <b class="role" :class="`role-${p.node.role}`">{{
                t(`projectOverview.wiring.role.${p.node.role}`)
              }}</b>
              <b class="name">{{ shortName(p.node) }}</b>
            </span>
            <span class="line">{{ line(p.node) }}</span>
          </div>
          <i
            class="dot"
            :class="[`tone-${p.node.tone}`, { 'm-halo': p.node.tone === 'warn' }]"
            aria-hidden="true"
          />
          <span class="sr-only">{{ stateWord(p.node) }}</span>
        </div>
      </template>
    </div>
  </ProjectCard>
</template>

<style scoped>
.diagram {
  position: relative;
  overflow-x: auto;
}

.diagram.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow: visible;
}

.band {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--role-fe) 7%, transparent);
}

.band.tier-1 {
  background: color-mix(in srgb, var(--role-be) 7%, transparent);
}

.host {
  position: absolute;
  bottom: 8px;
  left: 12px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.links {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.link {
  fill: none;
  stroke: var(--accent-mid);
  stroke-width: 1.5;
}

.node {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--node-bg);
  box-shadow: var(--shadow-node);
}

.diagram:not(.list) .node {
  position: absolute;
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--surface-well);
  color: var(--ink-3);
}

.words {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role {
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--weight-semibold);
}

.role-fe {
  background: color-mix(in srgb, var(--role-fe) 12%, transparent);
  color: var(--role-fe);
}

.role-be {
  background: color-mix(in srgb, var(--role-be) 12%, transparent);
  color: var(--role-be);
}

.role-db {
  background: color-mix(in srgb, var(--role-db) 12%, transparent);
  color: var(--role-db);
}

.role-worker {
  background: color-mix(in srgb, var(--role-worker) 12%, transparent);
  color: var(--role-worker);
}

.name {
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: var(--radius-full);
}

.tone-ok {
  background: var(--ok-solid);
}

.tone-warn {
  background: var(--warn-solid);
}

.tone-crit {
  background: var(--crit-solid);
}

.tone-unknown {
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.none {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
