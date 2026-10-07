<script setup lang="ts">
import UiSkeleton from '@/ui/UiSkeleton.vue'
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <UiSkeleton width="50%" height="26px" radius="8px" />
    <div class="grid">
      <div v-for="n in 4" :key="n" class="card">
        <UiSkeleton width="40%" height="32px" radius="9px" />
        <div class="cells">
          <UiSkeleton v-for="m in 3" :key="m" height="56px" radius="10px" tone="soft" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}
</style>
