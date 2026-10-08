<!--
  "Stored" and "Never stored": two short lists with the words of the AI payload screen, so the
  promise is repeated, not reinvented, and where the AI keys live.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()

const STORED = ['scanNumbers', 'paths', 'ai', 'notes'] as const
const NEVER = ['secrets', 'keys', 'contents', 'bodies'] as const
</script>

<template>
  <section class="card">
    <div v-for="(group, i) in [STORED, NEVER]" :key="i" class="column">
      <h3 class="title">
        {{ t(i === 0 ? 'settingsData.stored.stored' : 'settingsData.stored.never') }}
      </h3>
      <ul class="list">
        <li v-for="item in group" :key="item" class="item">
          <UiIcon
            :name="i === 0 ? 'check' : 'close'"
            :size="14"
            :stroke="2"
            :class="i === 0 ? 'ok' : 'no'"
          />
          {{ t(`settingsData.stored.${item}`) }}
        </li>
      </ul>
    </div>
    <p class="note">{{ t('settingsData.stored.keychain') }}</p>
  </section>
</template>

<style scoped>
.card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-1) var(--space-4);
  min-width: 0;
  padding: var(--space-4);
  line-height: 1.3;
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.column {
  min-width: 0;
}

.title {
  padding-bottom: var(--space-1);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 28px;
  color: var(--ink-2);
  font-size: var(--text-12);
}

.ok {
  flex: none;
  color: var(--ok-ink);
}

.no {
  flex: none;
  color: var(--crit-ink);
}

.note {
  grid-column: 1 / -1;
  padding-top: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
