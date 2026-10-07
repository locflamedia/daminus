<script setup lang="ts">
import UiSkeleton from '@/ui/UiSkeleton.vue'
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <div class="facts">
      <div v-for="n in 3" :key="n" class="card">
        <UiSkeleton width="30%" />
        <UiSkeleton width="60%" height="22px" />
        <UiSkeleton width="45%" />
      </div>
    </div>
    <div class="two">
      <div class="card">
        <UiSkeleton width="30%" height="15px" /><UiSkeleton height="24px" /><UiSkeleton
          height="24px"
        /><UiSkeleton height="24px" />
      </div>
      <div class="card">
        <UiSkeleton width="40%" height="15px" /><UiSkeleton
          height="120px"
          radius="12px"
          tone="soft"
        />
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

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}
</style>
