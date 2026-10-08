<script setup lang="ts">
import UiSkeleton from '@/ui/UiSkeleton.vue'
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <div class="tiles">
      <div v-for="n in 4" :key="n" class="card">
        <UiSkeleton width="50%" />
        <UiSkeleton width="40%" height="26px" />
      </div>
    </div>
    <div class="two">
      <div class="card">
        <UiSkeleton width="30%" height="15px" /><UiSkeleton
          height="196px"
          radius="12px"
          tone="soft"
        />
      </div>
      <div class="card">
        <UiSkeleton width="30%" height="15px" /><UiSkeleton
          height="48px"
          radius="12px"
          tone="soft"
        /><UiSkeleton height="48px" radius="12px" tone="soft" />
      </div>
    </div>
    <div class="two">
      <div class="card">
        <UiSkeleton width="20%" height="15px" /><UiSkeleton height="24px" /><UiSkeleton
          height="24px"
        /><UiSkeleton height="24px" />
      </div>
      <div class="card">
        <UiSkeleton width="40%" height="15px" /><UiSkeleton
          height="40px"
          radius="6px"
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

.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}
</style>
