<!--
  The first read of the latest scan (loading): the toolbar line, the summary and three cards as
  grey bars of their final heights, so nothing jumps when the numbers arrive.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiSkeleton from '@/ui/UiSkeleton.vue'

const { t } = useI18n()
</script>

<template>
  <div class="skeleton" role="status" :aria-label="t('overviewScreen.loading')">
    <UiSkeleton width="360px" height="24px" />
    <div class="cards">
      <div v-for="n in 3" :key="n" class="card">
        <div class="head">
          <UiSkeleton width="40px" height="40px" radius="12px" />
          <div class="names">
            <UiSkeleton width="96px" height="14px" />
            <UiSkeleton width="140px" height="12px" />
          </div>
        </div>
        <UiSkeleton height="22px" width="60%" />
        <UiSkeleton height="40px" />
        <UiSkeleton height="56px" />
        <div class="metrics">
          <UiSkeleton v-for="m in 3" :key="m" height="62px" />
        </div>
        <UiSkeleton height="32px" />
      </div>
    </div>
    <div class="servers">
      <UiSkeleton v-for="n in 5" :key="n" height="64px" radius="14px" />
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.names {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.servers {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
</style>
