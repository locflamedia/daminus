<!--
  Section header, from the board "Micro UI": a 28 px icon tile (radius 8, grey), the title
  (13/500) over a sub line (11, ink-3), and at the right edge a 28 px overflow button with
  the three dots (`overflow`). It names what a panel measures ("Largest tables", "kho_prod").
  The overflow button reports `more` with itself as the anchor, so the owner can open a
  menu from it.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

withDefaults(defineProps<{ icon: IconName; title: string; sub?: string; overflow?: boolean }>(), {
  sub: undefined,
  overflow: false,
})
const emit = defineEmits<{ more: [anchor: HTMLElement] }>()
defineSlots<{ actions?: () => unknown }>()

const { t } = useI18n()
</script>

<template>
  <div class="head">
    <span class="tile" aria-hidden="true"><UiIcon :name="icon" :size="14" /></span>
    <span class="titles">
      <b class="title">{{ title }}</b>
      <span v-if="sub" class="sub">{{ sub }}</span>
    </span>
    <span class="end">
      <slot name="actions" />
      <button
        v-if="overflow"
        type="button"
        class="more"
        :aria-label="t('ui.moreActions')"
        aria-haspopup="menu"
        @click="emit('more', $event.currentTarget as HTMLElement)"
      >
        <UiIcon name="more" :size="14" :stroke="2.4" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink-3);
}

.titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.title {
  overflow: hidden;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.end {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.more {
  display: grid;
  place-items: center;
  width: var(--h-control-sm);
  height: var(--h-control-sm);
  border-radius: 8px;
  color: var(--ink-3);
  transition: background-color var(--dur-color) var(--ease-state);
}

.more:hover {
  background: var(--surface-1);
  color: var(--ink);
}

.more:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
