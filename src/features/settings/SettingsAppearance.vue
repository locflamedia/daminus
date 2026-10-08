<!--
  Settings › Appearance: the theme (three live previews), motion, and the small pleasures.
  Nothing here changes what is checked.
-->
<script setup lang="ts">
import AppearanceLittleCard from './AppearanceLittleCard.vue'
import AppearanceMotionCard from './AppearanceMotionCard.vue'
import AppearanceThemeCard from './AppearanceThemeCard.vue'
</script>

<template>
  <div class="appearance">
    <div class="stack">
      <AppearanceThemeCard />
      <div class="pair">
        <AppearanceMotionCard />
        <AppearanceLittleCard />
      </div>
    </div>
  </div>
</template>

<style scoped>
.appearance {
  container-type: inline-size;
  min-width: 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

@container (max-width: 640px) {
  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
