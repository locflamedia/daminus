<!--
  A small choice inside a row: the role of a part, the server of a part, the engine of a
  database. A compact `UiMenu` opened from a trigger drawn as the board draws it: a tag-like
  button with a chevron. The trigger takes its colours from `tone`.
-->
<script setup lang="ts">
import { ref } from 'vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'

defineProps<{
  items: MenuItem[]
  label: string
  /** What the trigger shows. */
  text: string
  mono?: boolean
  /** The trigger's own colours: a role tint, or the amber of a server that is not known. */
  tone?: 'plain' | 'fe' | 'be' | 'db' | 'worker' | 'warn'
  /** The trigger is a name (a database engine): no fill, bold. */
  title?: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()
const open = ref(false)
</script>

<template>
  <span class="wrap">
    <UiMenu
      v-model:open="open"
      :items="items"
      :label="label"
      compact
      @select="emit('select', $event)"
    >
      <template #trigger="{ attrs, toggle }">
        <button
          v-bind="attrs"
          type="button"
          class="picker"
          :class="[`tone-${tone ?? 'plain'}`, { mono, title }]"
          :aria-label="`${label}: ${text}`"
          @click="toggle"
        >
          <span class="text">{{ text }}</span>
          <UiIcon name="chevron-down" :size="title ? 14 : 12" :stroke="1.8" />
        </button>
      </template>
    </UiMenu>
  </span>
</template>

<style scoped>
.wrap {
  display: block;
  min-width: 0;
}

.wrap :deep(.anchor) {
  display: flex;
  width: 100%;
}

.picker {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  height: var(--h-control-sm);
  padding: 0 8px;
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink);
  font-size: var(--text-12);
  white-space: nowrap;
  transition: background-color var(--dur-color) var(--ease-state);
}

.picker:hover {
  background: var(--surface-2);
}

.picker:focus-visible {
  box-shadow: var(--focus-ring);
}

.picker .icon {
  flex: none;
  color: var(--ink-4);
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.mono {
  font-family: var(--font-mono);
}

.title {
  width: auto;
  background: transparent;
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.title:hover {
  background: var(--surface-1);
}

.tone-fe,
.tone-be,
.tone-db,
.tone-worker {
  padding: 0 6px 0 8px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--role) 12%, transparent);
  color: var(--role);
  font: var(--weight-medium) 10px var(--font-mono);
  letter-spacing: 0.04em;
}

.tone-fe:hover,
.tone-be:hover,
.tone-db:hover,
.tone-worker:hover {
  background: color-mix(in srgb, var(--role) 20%, transparent);
}

.tone-fe .icon,
.tone-be .icon,
.tone-db .icon,
.tone-worker .icon {
  color: inherit;
}

.tone-fe {
  --role: var(--role-fe);
}

.tone-be {
  --role: var(--role-be);
}

.tone-db {
  --role: var(--role-db);
}

.tone-worker {
  --role: var(--role-worker);
}

.tone-warn {
  box-shadow: inset 0 0 0 1.5px var(--warn-solid);
}
</style>
