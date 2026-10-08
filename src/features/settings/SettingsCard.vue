<!--
  A white card of a Settings section: a 13 px title (with an optional quiet remark after it)
  and the rows or fields under it. `tight` is the card that holds rows, which bring their own
  padding. The ring-less look is the boards': white, radius 16, padding 20, a hairline shadow.
-->
<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ title: string; remark?: string; tight?: boolean }>(), {
  remark: undefined,
  tight: false,
})

const titleId = useId()
</script>

<template>
  <section class="card" :class="{ tight }" :aria-labelledby="titleId">
    <h3 :id="titleId" class="title">
      {{ title }}<span v-if="remark" class="remark"> · {{ remark }}</span>
    </h3>
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-5);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.card.tight {
  gap: var(--space-1);
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.card.tight .title {
  padding-bottom: 6px;
}

.remark {
  color: var(--ink-3);
  font-weight: var(--weight-regular);
}
</style>
