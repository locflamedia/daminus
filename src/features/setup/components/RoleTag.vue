<!--
  The role of a part, as board 04 and 05 draw it: a small tinted tag, `FE`, `BE`, `DB` or
  `WORKER`. The letters carry the meaning; the tint only backs them up.
-->
<script setup lang="ts">
import type { Role } from '@/api'

defineProps<{ role: Role }>()
</script>

<template>
  <span class="role" :class="`role-${role}`">{{ role.toUpperCase() }}</span>
</template>

<style scoped>
.role {
  display: inline-grid;
  place-items: center;
  flex: none;
  min-width: 40px;
  height: 20px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--role) 12%, transparent);
  color: var(--role);
  font: var(--weight-medium) 10px var(--font-mono);
  letter-spacing: 0.04em;
}

.role-fe {
  --role: var(--role-fe);
}

.role-be {
  --role: var(--role-be);
}

.role-db {
  --role: var(--role-db);
}

.role-worker {
  --role: var(--role-worker);
}
</style>
