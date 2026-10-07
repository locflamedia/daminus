<script setup lang="ts">
import UiSkeleton from '@/ui/UiSkeleton.vue'
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <div class="card">
      <UiSkeleton width="40%" height="15px" /><UiSkeleton
        height="300px"
        radius="12px"
        tone="soft"
      />
    </div>
    <div class="card">
      <UiSkeleton width="40%" height="15px" /><UiSkeleton
        height="110px"
        radius="12px"
        tone="soft"
      />
    </div>
    <div class="card">
      <UiSkeleton width="30%" height="15px" /><UiSkeleton height="24px" /><UiSkeleton
        height="24px"
      /><UiSkeleton height="24px" />
    </div>
    <div class="card">
      <UiSkeleton width="30%" height="15px" /><UiSkeleton height="24px" /><UiSkeleton
        height="24px"
      />
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}
</style>
