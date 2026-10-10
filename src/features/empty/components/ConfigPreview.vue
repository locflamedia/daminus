<!--
  The read-only preview of `~/.ssh/config` on the first screen: parsed here, before any
  connection, with no checkboxes and no second button (choosing happens in step 1). The chip
  says "Reading…", then the rows land 260 ms apart and tick themselves, and the chip turns into
  the count once, after the last one. Hosts that were named but cannot be used are explained
  below the rows. Everything shown is text from the config.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { prefersReducedMotion, vDraw, vEnter } from '@/lib/motion'
import UiCard from '@/ui/UiCard.vue'
import UiChipMorph from '@/ui/UiChipMorph.vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { PreviewRow, PreviewSkip } from '../empty-state'

const props = defineProps<{
  /** The config was read; until then the chip says "Reading…". */
  ready: boolean
  rows: readonly PreviewRow[]
  skips: readonly PreviewSkip[]
}>()

const { t } = useI18n()

/** Rows land 260 ms apart, after the card itself has arrived. */
const FIRST_ROW_MS = 400
const ROW_STEP_MS = 260
const TICK_AFTER_MS = 220
const DRAW_AFTER_MS = 300
/** Longest wait before the chip settles, however many hosts there are. */
const SETTLE_CAP_MS = 2400

const settled = ref(false)
let timer: number | undefined

function settle() {
  window.clearTimeout(timer)
  if (!props.ready) {
    settled.value = false
    return
  }
  if (prefersReducedMotion()) {
    settled.value = true
    return
  }
  const wait = Math.min(SETTLE_CAP_MS, FIRST_ROW_MS + props.rows.length * ROW_STEP_MS)
  timer = window.setTimeout(() => (settled.value = true), wait)
}

onMounted(settle)
watch(() => props.ready, settle)
onBeforeUnmount(() => window.clearTimeout(timer))

const rowDelay = (i: number) => FIRST_ROW_MS + Math.min(i, 8) * ROW_STEP_MS

const chip = computed(() =>
  settled.value
    ? {
        tone: 'ok' as const,
        busy: false,
        label: t('empty.preview.hosts', { n: props.rows.length }, props.rows.length),
      }
    : { tone: 'info' as const, busy: true, label: t('empty.preview.reading') },
)

/** One character of an alias: Geist Mono at 13 px advances 0.6 em. */
const ALIAS_CHAR_PX = 7.8

/**
 * The alias column is as wide as the longest alias, up to half the row; HostName gives way
 * first when the panel is short, so an alias is cut only when needed. In px, not `ch`: the
 * header row is set smaller than the rows, and every row must get the same column.
 */
const aliasWidth = computed(() => ({
  '--alias': `${Math.ceil(Math.max(0, ...props.rows.map((r) => r.alias.length)) * ALIAS_CHAR_PX)}px`,
}))

function skipText(s: PreviewSkip): string {
  return t(`empty.preview.skip.${s.kind}`, { name: s.name })
}
</script>

<template>
  <UiCard tray class="preview" :style="aliasWidth">
    <header class="head">
      <span class="tile"><UiIcon name="terminal" /></span>
      <div class="titles">
        <b> {{ t('empty.preview.title') }} <span class="mono path">~/.ssh/config</span> </b>
        <span>{{ t('empty.preview.note') }}</span>
      </div>
      <UiChipMorph
        class="chip"
        large
        :tone="chip.tone"
        :icon="settled ? 'check' : undefined"
        :busy="chip.busy"
        :label="chip.label"
      />
    </header>

    <div class="cols" aria-hidden="true">
      <span /><span />
      <span>{{ t('empty.preview.alias') }}</span>
      <span>{{ t('empty.preview.hostName') }}</span>
      <span>{{ t('empty.preview.user') }}</span>
      <span>{{ t('empty.preview.key') }}</span>
    </div>

    <ul class="rows" :aria-label="t('empty.preview.list')">
      <li v-for="(r, i) in rows" :key="r.alias" v-enter="{ index: rowDelay(i) / 80 }" class="host">
        <span class="cb" aria-hidden="true">
          <span class="fill m-pop" :style="{ '--d': `${rowDelay(i) + TICK_AFTER_MS}ms` }">
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                v-draw="{ delay: `${rowDelay(i) + DRAW_AFTER_MS}ms` }"
                d="m3.5 8.4 3 3L12.5 5"
              />
            </svg>
          </span>
        </span>
        <UiIcon name="server" class="glyph" />
        <span class="mono alias">{{ r.alias }}</span>
        <span class="mono dim">{{ r.hostName }}</span>
        <span class="mono dim">{{ r.user ?? '' }}</span>
        <span class="key">{{ r.key ?? t('empty.preview.agentKey') }}</span>
      </li>
    </ul>

    <p v-for="s in skips" :key="s.name" v-enter class="skip">
      <UiIcon name="warn" />
      <span>{{ skipText(s) }}</span>
    </p>

    <footer class="foot">
      <span class="found">
        <b>{{ rows.length }}</b>
        {{ t('empty.preview.found', { n: rows.length }, rows.length) }}
      </span>
      <span class="never"
        ><span class="mono">~/.ssh/config</span> {{ t('empty.preview.neverEdited') }}</span
      >
    </footer>
  </UiCard>
</template>

<style scoped>
.preview {
  /* The longest alias, in px; set from the rows. */
  --alias: 0px;

  --card-gap: var(--space-3);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--ink-2);
}

.titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.titles b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.path {
  font-weight: var(--weight-medium);
}

.titles > span {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.chip {
  margin-left: auto;
}

.cols,
.host {
  display: grid;
  grid-template-columns:
    20px 16px minmax(min(var(--alias), 50%), 1fr) minmax(0, 128px)
    64px 88px;
  gap: var(--space-3);
  padding: 0 var(--space-3);
}

.cols {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.rows {
  display: flex;
  flex-direction: column;
  max-height: 248px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.host {
  align-items: center;
  height: var(--h-row);
  flex: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-13);
}

.host:nth-child(odd) {
  background: var(--surface-well);
}

.cb {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface-1);
}

.fill {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.glyph {
  color: var(--ink-2);
}

.mono {
  font-size: var(--text-12);
}

.alias {
  overflow: hidden;
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim,
.key {
  overflow: hidden;
  color: var(--ink-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.key {
  font-size: var(--text-11);
}

.skip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-12);
  line-height: 1.45;
}

.skip .icon {
  flex: none;
  color: var(--warn-solid);
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-1);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.found b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.never {
  margin-left: auto;
  font-size: var(--text-11);
}

.never .mono {
  font-size: inherit;
}
</style>
