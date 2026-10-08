<!--
  One setting: its name and the line that says what it does on the left, the control on the
  right (a switch, a segmented control or a value). A leading slot holds the 36 px tile of the
  small pleasures. The whole row is at least 52 px.
-->
<script setup lang="ts">
defineProps<{ title: string; hint?: string }>()
defineSlots<{ default?: () => unknown; lead?: () => unknown }>()
</script>

<template>
  <div class="row">
    <div class="text">
      <span v-if="$slots.lead" class="lead"><slot name="lead" /></span>
      <div class="words">
        <b class="name">{{ title }}</b>
        <span v-if="hint" class="hint">{{ hint }}</span>
      </div>
    </div>
    <div class="control"><slot /></div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  min-height: 52px;
  padding: 6px 0;
}

.text {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.lead {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
