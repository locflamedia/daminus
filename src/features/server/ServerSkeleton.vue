<!--
  The server page while the first report is read: the four number cards, the two wide cards
  and the two lists at their final sizes, so nothing jumps when the results land.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiSkeleton from '@/ui/UiSkeleton.vue'

defineProps<{ host: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="skeleton" role="status" :aria-label="t('serverScreen.loading', { host })">
    <div class="kpis">
      <div v-for="n in 4" :key="n" class="card kpi">
        <UiSkeleton width="40%" />
        <div class="figure">
          <div class="lines">
            <UiSkeleton width="64px" height="28px" radius="6px" /><UiSkeleton width="70%" />
          </div>
          <UiSkeleton width="96px" height="40px" radius="8px" tone="soft" />
        </div>
      </div>
    </div>
    <div class="pair">
      <div class="card tall">
        <UiSkeleton width="50%" /><UiSkeleton height="190px" radius="12px" tone="soft" />
      </div>
      <div class="card tall">
        <UiSkeleton width="40%" />
        <UiSkeleton v-for="n in 5" :key="n" height="26px" radius="6px" tone="soft" />
      </div>
    </div>
    <div class="pair">
      <div class="card tall">
        <UiSkeleton width="30%" /><UiSkeleton
          v-for="n in 5"
          :key="n"
          height="30px"
          radius="8px"
          tone="soft"
        />
      </div>
      <div class="card tall">
        <UiSkeleton width="30%" /><UiSkeleton
          v-for="n in 3"
          :key="n"
          height="44px"
          radius="10px"
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
  gap: var(--space-4);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.pair {
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
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.kpi {
  gap: 10px;
  padding: 14px var(--space-4);
}

.figure {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.tall {
  min-height: 260px;
}
</style>
