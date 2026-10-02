<!-- One atom of the board "Micro UI": a name, a grey stage holding the sample and its spec. -->
<script setup lang="ts">
defineProps<{ name: string; spec: string }>()
</script>

<template>
  <div class="atom">
    <span class="name">{{ name }}</span>
    <div class="stage"><slot /></div>
    <span class="spec mono">{{ spec }}</span>
  </div>
</template>

<style scoped>
.atom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.name {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.stage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.spec {
  color: var(--ink-2);
  font-size: 10.5px;
  line-height: 1.55;
}
</style>
