<!--
  The pitch of the first screen: the hero mark (the check badge says "safe to start", not
  "done"), one line of what Daminus does, and the one way forward. Import is the single
  primary and takes Return; adding a host by hand is the quiet second. The mark floats once as
  it arrives and the primary button's sheen crosses it once, so nothing loops on a first launch.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

defineEmits<{ import: []; add: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="hero">
    <div v-enter class="mark">
      <span class="halo" aria-hidden="true" />
      <div class="tile">
        <UiIcon name="server" :size="28" :stroke="1.4" />
      </div>
      <span class="badge" aria-hidden="true"><UiIcon name="check" :size="14" :stroke="1.8" /></span>
    </div>

    <div v-enter="{ index: 1 }" class="pitch">
      <span class="welcome"
        ><UiIcon name="spark" :size="12" :stroke="1.6" />{{ t('empty.welcome') }}</span
      >
      <h2>{{ t('empty.title') }}</h2>
      <p>{{ t('empty.lead') }}</p>
    </div>

    <div v-enter="{ index: 2 }" class="actions">
      <span class="sheen">
        <UiButton
          variant="primary"
          size="large"
          lifted
          icon="terminal"
          shortcut="⏎"
          @click="$emit('import')"
        >
          {{ t('empty.import') }}
        </UiButton>
      </span>
      <UiButton size="large" icon="plus" @click="$emit('add')">{{ t('empty.byHand') }}</UiButton>
    </div>

    <p v-enter="{ index: 3 }" class="agent">
      <UiIcon name="lock" :size="14" />{{ t('empty.agentNote') }}
    </p>
  </section>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  min-width: 0;
}

.mark {
  position: relative;
  width: 64px;
  height: 64px;
}

.tile {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: linear-gradient(150deg, var(--wash-1), var(--wash-2) 55%, var(--wash-3));
  box-shadow:
    0 16px 32px -16px color-mix(in srgb, var(--accent) 55%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--on-solid) 60%, transparent);
  color: var(--on-solid);
  animation: float 6s var(--ease-in-out) 1;
}

.halo {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  animation: halo 3s var(--ease-out) 1;
}

.badge {
  position: absolute;
  right: -6px;
  bottom: -6px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-0);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--ink) 15%, transparent);
  color: var(--ok-solid);
}

.pitch {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.welcome {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px 0 8px;
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

h2 {
  max-width: 16ch;
  font-size: var(--text-28);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-28);
  line-height: 1.2;
}

.pitch p {
  max-width: 46ch;
  color: var(--ink-2);
  font-size: var(--text-15);
  line-height: 1.5;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.sheen {
  position: relative;
  display: inline-flex;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.sheen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 35%,
    color-mix(in srgb, var(--btn-ink) 30%, transparent) 50%,
    transparent 65%
  );
  background-size: 250% 100%;
  pointer-events: none;
  animation: sheen 1.6s var(--ease-out) 1.4s 1 both;
}

.agent {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-12);
}

.agent .icon {
  color: var(--ink-4);
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes halo {
  from {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 38%, transparent);
  }
  to {
    box-shadow: 0 0 0 16px color-mix(in srgb, var(--accent) 0%, transparent);
  }
}

@keyframes sheen {
  from {
    background-position: 130% 0;
  }
  to {
    background-position: -60% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .halo,
  .sheen::after {
    animation: none;
  }
}
</style>
