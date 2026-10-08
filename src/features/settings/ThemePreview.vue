<!--
  A miniature of Overview in one theme, for the theme cards: a sidebar with the three window
  buttons, a search field and two rows, and three project cards with their status colour.
  It reads its colours from `theme-preview.ts`, not from the tokens, so the Dark card is dark
  while the window is light.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PREVIEW_PROJECTS, PREVIEW_VARS, type PreviewMode } from './theme-preview'

const props = defineProps<{ mode: PreviewMode }>()

const { t } = useI18n()
const vars = computed(() => PREVIEW_VARS[props.mode])
</script>

<template>
  <div class="pv" :style="vars" aria-hidden="true">
    <div class="side">
      <span class="lights"><i class="close" /><i class="min" /><i class="zoom" /></span>
      <i class="search" />
      <i class="row" style="width: 70%" />
      <i class="row" style="width: 60%" />
    </div>
    <div class="body">
      <b class="title">{{ t('settingsAppearance.theme.overview') }}</b>
      <div class="cards">
        <div v-for="p in PREVIEW_PROJECTS" :key="p.name" class="card">
          <div class="name">
            <b>{{ p.name }}</b>
            <span class="dot" :class="p.tone" />
          </div>
          <div class="wash" :class="p.tone" />
          <div class="chips"><i /><i /><i /></div>
        </div>
      </div>
      <div class="bottom"><i /><i /></div>
    </div>
  </div>
</template>

<style scoped>
.pv {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  border-radius: var(--space-3);
  background: var(--pv-page);
}

.side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px var(--space-2);
  background: var(--pv-side);
}

.lights {
  display: flex;
  gap: var(--space-1);
}

.lights i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.close {
  background: var(--traffic-close);
}

.min {
  background: var(--traffic-min);
}

.zoom {
  background: var(--traffic-zoom);
}

.search {
  height: 14px;
  border-radius: 5px;
  background: var(--pv-search);
}

.row {
  height: 8px;
  border-radius: var(--space-1);
  background: var(--pv-line);
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: 10px;
}

.title {
  color: var(--pv-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  background: var(--pv-card);
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name b {
  overflow: hidden;
  color: var(--pv-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
}

.dot.crit {
  background: var(--pv-crit);
}

.dot.warn {
  background: var(--pv-warn);
}

.dot.ok {
  background: var(--pv-ok);
}

.wash {
  height: 22px;
  border-radius: 6px;
}

.wash.crit {
  background: var(--pv-crit-wash);
}

.wash.warn {
  background: var(--pv-warn-wash);
}

.wash.ok {
  background: var(--pv-ok-wash);
}

.chips {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}

.chips i {
  height: 22px;
  border-radius: 5px;
  background: var(--pv-chip);
}

.bottom {
  display: grid;
  flex: 1;
  grid-template-columns: 2fr 1fr;
  gap: 6px;
}

.bottom i {
  border-radius: var(--space-2);
  background: var(--pv-card);
}
</style>
