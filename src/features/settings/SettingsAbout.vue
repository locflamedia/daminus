<!--
  Settings › About: the icon, name and version with the credits, and the diagnostics a bug
  report needs.
-->
<script setup lang="ts">
import AboutDiagnosticsCard from './AboutDiagnosticsCard.vue'
import AboutIdentityCard from './AboutIdentityCard.vue'
</script>

<template>
  <div class="about">
    <AboutIdentityCard />
    <AboutDiagnosticsCard />
  </div>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 520px;
  min-width: 0;
}
</style>
