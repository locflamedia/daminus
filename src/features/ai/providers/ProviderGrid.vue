<!--
  The eight provider tiles of the board: a monogram, a dot that says the state (green connected
  or running, accent key saved, grey not set up), the name, one line of state and, for three
  of them, a small tag. The tile that is open has the accent ring; one provider is active.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAiProvidersStore } from '@/stores/ai-providers'
import { markOf, tileStatus } from './provider-state'

const { t } = useI18n()
const store = useAiProvidersStore()
</script>

<template>
  <div v-if="store.view" class="grid" role="group" :aria-label="t('aiProviders.grid')">
    <button
      v-for="entry in store.entries"
      :key="entry.profile.id"
      type="button"
      class="tile"
      :class="{ open: store.viewed === entry.profile.id }"
      :aria-pressed="store.viewed === entry.profile.id"
      :data-provider="entry.profile.id"
      @click="store.select(entry.profile.id)"
    >
      <span class="top">
        <span class="mark" aria-hidden="true">{{ markOf(entry) }}</span>
        <span
          class="dot"
          :class="tileStatus(entry, store.view)[0]"
          :data-dot="tileStatus(entry, store.view)[0]"
          aria-hidden="true"
        />
      </span>
      <span class="words">
        <b class="name">{{ entry.profile.name }}</b>
        <span class="state" :class="tileStatus(entry, store.view)[0]">{{
          t(`aiProviders.status.${tileStatus(entry, store.view)[1]}`)
        }}</span>
        <span v-if="entry.profile.tag" class="tag" :class="entry.profile.tag">{{
          t(`aiProviders.tag.${entry.profile.tag}`)
        }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: var(--space-2);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
  text-align: left;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tile:hover {
  transform: translateY(-2px);
}

.tile.open {
  box-shadow:
    0 0 0 2px var(--accent),
    0 16px 32px -18px rgba(79, 107, 237, 0.55);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--surface-well);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--surface-3);
}

.dot.ok {
  background: var(--ok-solid);
}

.dot.accent {
  background: var(--accent);
}

.words {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  overflow: hidden;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: normal;
  white-space: nowrap;
}

.state.ok {
  color: var(--ok-ink);
}

.state.accent {
  color: var(--accent-ink);
}

.tag {
  align-self: flex-start;
  margin-top: 4px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}

.tag.recommended {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.tag.free_local {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.tag.beta {
  background: var(--warn-soft);
  color: var(--warn-ink);
}
</style>
