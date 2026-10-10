<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { dataOf, num, str } from '@/lib/project-facts'
import type { StripCell, UrlRow } from '@/lib/project-overview'
import UiTlsChip from '@/ui/UiTlsChip.vue'
import ProjectCard from '../common/ProjectCard.vue'

const props = defineProps<{
  cells: readonly StripCell[]
  median: number | null
  worst: StripCell | null
  slowCount: number
  urls: readonly UrlRow[]
  exposure: 'none' | 'ok' | 'exposed' | 'unknown'
}>()

const { t, te } = useI18n()
const fmt = useFormat()

const ms = (v: number | null) => (v === null ? '—' : fmt.duration(v))
const cellTitle = (c: StripCell) =>
  c.ms === null
    ? t('projectOverview.response.cellNone', { seq: c.seq })
    : t('projectOverview.response.cell', { seq: c.seq, ms: ms(c.ms) })
const sentence = computed(() => {
  const worst = props.worst
  if (!worst) return t('projectOverview.response.allGood')
  const key = worst.ms === null ? 'slowNoAnswer' : 'slow'
  const params = { n: props.slowCount, seq: worst.seq, ms: ms(worst.ms) }
  return t(`projectOverview.response.${key}`, params, props.slowCount)
})

function answer(row: UrlRow): { text: string; tone: string } {
  const item = row.http
  if (!item?.fact || item.fact.unknown) return { text: '—', tone: 'plain' }
  const data = dataOf(item.fact)
  const tone =
    item.severity.level === 'crit' ? 'crit' : item.severity.level === 'warn' ? 'warn' : 'ok'
  if (str(data.class) === 'error') {
    const err = str(data.error)
    const why = te(`projectOverview.response.error.${err}`)
      ? t(`projectOverview.response.error.${err}`)
      : t('projectOverview.response.error.other')
    return { text: t('projectOverview.response.failed', { why }), tone }
  }
  const status = num(data.status)
  return {
    text: t('projectOverview.response.answered', {
      status: status ?? '—',
      ms: ms(num(item.fact.value)),
    }),
    tone,
  }
}
const host = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
const secure = computed(() => props.urls.filter((u) => u.tls))
</script>

<template>
  <ProjectCard
    icon="globe"
    :title="t('projectOverview.response.title', { n: cells.length })"
    :meta="median === null ? '' : t('projectOverview.response.meta', { ms: ms(median) })"
    :gap="10"
  >
    <template v-if="cells.length > 0">
      <div
        class="strip"
        role="img"
        :aria-label="t('projectOverview.response.label', { n: cells.length })"
      >
        <i
          v-for="c in cells"
          :key="c.seq"
          class="cell"
          :class="`level-${c.level}`"
          :title="cellTitle(c)"
        />
      </div>
      <div class="axis">
        <span>#{{ cells[0]?.seq }}</span>
        <span>{{ t('projectOverview.response.today') }}</span>
      </div>
      <span class="note">{{ sentence }}</span>
    </template>
    <p v-else class="note">{{ t('projectOverview.response.none') }}</p>

    <ul v-if="urls.length > 0" class="rows">
      <li v-for="u in urls" :key="u.url" class="row">
        <span class="mono">{{ u.url }}</span>
        <span class="answer" :class="answer(u).tone">{{ answer(u).text }}</span>
      </li>
      <li v-if="exposure !== 'none'" class="row">
        <span class="mono">{{ t('projectOverview.response.exposure') }}</span>
        <span
          class="answer"
          :class="exposure === 'exposed' ? 'crit' : exposure === 'ok' ? 'ok' : 'plain'"
        >
          {{
            exposure === 'exposed'
              ? t('projectOverview.response.exposed')
              : exposure === 'ok'
                ? t('projectOverview.response.notExposed')
                : t('projectOverview.response.exposureUnknown')
          }}
        </span>
      </li>
      <li v-for="u in secure" :key="`tls-${u.url}`" class="row">
        <span>{{ t('projectOverview.response.certificate', { host: host(u.url) }) }}</span>
        <UiTlsChip :item="u.tls" />
      </li>
    </ul>
    <p v-else class="note">{{ t('projectOverview.response.noUrls') }}</p>
  </ProjectCard>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 3px;
  height: 40px;
}

.cell {
  flex: 1;
  border-radius: 3px;
  background: var(--strip-none);
}

.level-ok,
.level-info {
  background: var(--strip-ok);
}

.level-warn {
  background: var(--strip-warn);
}

.level-crit {
  background: var(--strip-crit);
}

.axis {
  display: flex;
  justify-content: space-between;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.note {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
}

.row:nth-child(odd) {
  background: var(--surface-well);
}

.mono {
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.answer {
  flex: none;
  font-weight: var(--weight-medium);
}

.answer.ok {
  color: var(--ok-ink);
}

.answer.warn {
  color: var(--warn-ink);
}

.answer.crit {
  color: var(--crit-ink);
}

.answer.plain {
  color: var(--ink-3);
}
</style>
