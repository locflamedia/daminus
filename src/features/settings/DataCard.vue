<!--
  A white card of Settings › Data whose title carries a 16 px glyph and a remark on the right
  (the folder's path, the cost of a scan, what the export is). Same look as `SettingsCard`.
-->
<script setup lang="ts">
import { useId } from 'vue'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'

defineProps<{ title: string; icon: IconName; aside?: string; mono?: boolean }>()

const titleId = useId()
</script>

<template>
  <section class="card" :aria-labelledby="titleId">
    <div class="head">
      <UiIcon :name="icon" class="glyph" />
      <h3 :id="titleId" class="title">{{ title }}</h3>
      <span v-if="aside" class="aside" :class="{ mono }">{{ aside }}</span>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-5);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
  min-width: 0;
}

.glyph {
  flex: none;
  color: var(--ink-3);
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.aside {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
}
</style>
