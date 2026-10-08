<!--
  The app's face, from the board "Delight" (About Daminus): the icon, the name with its version
  and the credit for the painting and the open-source pieces the app stands on. Static.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import icon from '@/assets/app-icon.png'

const { t } = useI18n()
const version = __APP_VERSION__
</script>

<template>
  <section class="card" :aria-label="t('settingsAbout.name')">
    <img class="icon" :src="icon" alt="" width="64" height="64" />
    <b class="name">
      {{ t('settingsAbout.name') }}
      <span class="version" :title="t('settingsAbout.version', { version })">{{ version }}</span>
    </b>
    <p class="credits">
      {{ t('settingsAbout.credits.made') }}<br />
      {{ t('settingsAbout.credits.painting') }}<br />
      {{ t('settingsAbout.credits.open') }}
    </p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 18px;
  border-radius: 18px;
  background: var(--surface-0);
  box-shadow: var(--shadow-seg);
}

.icon {
  animation: float 6s ease-in-out infinite;
}

.name {
  font-size: 17px;
  font-weight: var(--weight-medium);
}

.version {
  color: var(--ink-3);
  font: 400 var(--text-11) var(--font-mono);
}

.credits {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.5;
  text-align: center;
}

@keyframes float {
  50% {
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon {
    animation: none;
  }
}
</style>
