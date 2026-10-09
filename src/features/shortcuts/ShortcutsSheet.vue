<!--
  Keyboard shortcuts (board "Shortcuts"): a 760 px card, radius 20, centred over the dimmed
  window. A 56 px search row (the field, how many shortcuts or matches, an Esc cap), four groups
  in two columns, and a footer that says when single letters work. Typing dims the rows that do
  not match and tints the ones that do. Labels translate; the keys never do. The card scales in
  from .97 in 240 ms; Reduce Motion shows it at once. It fills the nearest positioned
  ancestor; Escape and a press on the scrim say `close`.
-->
<script setup lang="ts">
import { computed, ref, toRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '@/lib/focus-trap'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import { SHORTCUT_COUNT, SHORTCUT_GROUPS, matchingIds, type ShortcutRow } from './shortcuts-model'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const titleId = useId()
const panel = ref<HTMLElement>()
const query = ref('')

const searching = computed(() => query.value.trim() !== '')
const matches = computed(() =>
  matchingIds(query.value, (row: ShortcutRow) => t(`shortcuts.rows.${row.label}`)),
)
const count = computed(() =>
  searching.value
    ? t('shortcuts.matches', { n: matches.value.size }, matches.value.size)
    : t('shortcuts.total', { n: SHORTCUT_COUNT }, SHORTCUT_COUNT),
)

watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

useFocusTrap(panel, toRef(props, 'open'), {
  onEscape: () => emit('close'),
  initialFocus: (root) => root.querySelector<HTMLElement>('input'),
})
</script>

<template>
  <Transition name="shortcuts" appear>
    <div v-if="open" class="layer">
      <div class="scrim" aria-hidden="true" @mousedown="emit('close')" />
      <div ref="panel" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <header class="head">
          <UiIcon name="search" :size="16" class="glyph" />
          <h2 :id="titleId" class="sr-only">{{ t('shortcuts.title') }}</h2>
          <input
            v-model="query"
            class="input"
            type="text"
            :placeholder="t('shortcuts.placeholder')"
            :aria-label="t('shortcuts.placeholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <span class="count" role="status" aria-live="polite">{{ count }}</span>
          <UiKbd tone="on-field">esc</UiKbd>
        </header>
        <div class="groups">
          <section v-for="group in SHORTCUT_GROUPS" :key="group.id" class="group">
            <h3 class="group-title">{{ t(`shortcuts.groups.${group.id}`) }}</h3>
            <div
              v-for="row in group.rows"
              :key="row.id"
              class="row"
              :class="{
                hit: searching && matches.has(row.id),
                dim: searching && !matches.has(row.id),
              }"
              :data-shortcut="row.id"
            >
              <span>{{ t(`shortcuts.rows.${row.label}`) }}</span>
              <span class="caps">
                <kbd v-for="(key, i) in row.keys" :key="i" class="cap">{{ key }}</kbd>
              </span>
            </div>
          </section>
        </div>
        <footer class="foot">
          {{ t('shortcuts.footer') }}
          <span class="grow" />
          {{ t('shortcuts.press') }} <kbd class="cap">?</kbd> {{ t('shortcuts.anywhere') }}
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim-sheet);
}

.sheet {
  --enter: 240ms;

  position: relative;
  display: flex;
  flex-direction: column;
  width: 760px;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--surface-0);
  box-shadow: var(--shadow-overlay);
}

.sheet:focus-visible {
  outline: none;
}

.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: var(--h-status-row);
  padding: 0 var(--space-5);
  background: var(--surface-well);
}

.glyph {
  flex: none;
  color: var(--ink-4);
}

.input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.input::placeholder {
  color: var(--ink-placeholder);
}

.count {
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.groups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6) var(--space-8);
  padding: var(--space-5) var(--space-6) var(--space-6);
  overflow-y: auto;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.group-title {
  margin: 0;
  padding-bottom: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 30px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.row.dim {
  opacity: 0.42;
}

.row.hit {
  margin: 0 -8px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--ink);
}

.caps {
  display: flex;
  gap: 3px;
}

.cap {
  display: inline-grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  box-shadow: inset 0 -1px 0 var(--surface-3);
  color: var(--ink);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

.foot {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  background: var(--surface-well);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.grow {
  flex-grow: 1;
}

.shortcuts-enter-active,
.shortcuts-leave-active {
  transition: opacity var(--dur-sheet) var(--ease-out);
}

.shortcuts-enter-active .sheet {
  transition: transform var(--enter) var(--ease-out);
}

.shortcuts-enter-from,
.shortcuts-leave-to {
  opacity: 0;
}

.shortcuts-enter-from .sheet {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .shortcuts-enter-active,
  .shortcuts-leave-active,
  .shortcuts-enter-active .sheet {
    transition: none;
  }

  .shortcuts-enter-from .sheet {
    transform: none;
  }
}
</style>
