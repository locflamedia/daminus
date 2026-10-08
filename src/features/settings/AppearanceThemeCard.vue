<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Theme } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'
import SettingsCard from './SettingsCard.vue'
import ThemePreview from './ThemePreview.vue'

/** The cards in the order of the board: the two themes, then following the system. */
const ORDER: readonly Theme[] = ['light', 'dark', 'system']

const { t } = useI18n()
const settings = useSettingsStore()
const cards = ref<HTMLButtonElement[]>([])

function onKeydown(event: KeyboardEvent, index: number) {
  const last = ORDER.length - 1
  let next: number
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    next = index === 0 ? last : index - 1
  else return
  event.preventDefault()
  const theme = ORDER[next]
  if (!theme) return
  settings.setTheme(theme)
  void nextTick(() => cards.value[next]?.focus())
}
</script>

<template>
  <SettingsCard :title="t('settingsAppearance.theme.title')">
    <div class="cards" role="radiogroup" :aria-label="t('settingsAppearance.theme.group')">
      <button
        v-for="(theme, index) in ORDER"
        :key="theme"
        :ref="(el) => (cards[index] = el as HTMLButtonElement)"
        type="button"
        role="radio"
        class="choice"
        :class="{ on: settings.theme === theme }"
        :aria-checked="settings.theme === theme"
        :tabindex="settings.theme === theme ? 0 : -1"
        @click="settings.setTheme(theme)"
        @keydown="onKeydown($event, index)"
      >
        <span class="shot">
          <ThemePreview v-if="theme !== 'system'" :mode="theme" />
          <span v-else class="both">
            <span class="layer light"><ThemePreview mode="light" /></span>
            <span class="layer dark"><ThemePreview mode="dark" /></span>
            <span class="badge" aria-hidden="true">
              <svg class="sun" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3" />
                <path
                  d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"
                />
              </svg>
              <svg class="moon" width="14" height="14" viewBox="0 0 16 16">
                <path d="M12.5 10.2A5 5 0 0 1 5.8 3.5a5 5 0 1 0 6.7 6.7z" />
              </svg>
            </span>
          </span>
        </span>
        <span class="foot">
          <span class="radio" aria-hidden="true" />
          <span class="words">
            <b>{{ t(`settingsAppearance.theme.${theme}.name`) }}</b>
            <span class="hint">{{ t(`settingsAppearance.theme.${theme}.hint`) }}</span>
          </span>
        </span>
      </button>
    </div>
  </SettingsCard>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.choice {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: 0 0 0 1px var(--side-line);
  text-align: left;
  cursor: default;
  transition: box-shadow var(--dur-color) var(--ease-state);
}

.choice.on {
  box-shadow: 0 0 0 2px var(--accent);
}

.shot {
  display: block;
  height: 187px;
}

.both {
  position: relative;
  display: block;
  height: 100%;
  overflow: hidden;
  border-radius: var(--space-3);
}

.layer {
  position: absolute;
  inset: 0;
}

.layer.dark {
  opacity: 0;
}

.badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  overflow: hidden;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-0) 85%, transparent);
}

.badge svg {
  position: absolute;
}

.sun {
  stroke: var(--warn-ink);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.moon {
  fill: var(--accent);
  opacity: 0;
}

.foot {
  display: flex;
  align-items: center;
  gap: 10px;
}

.radio {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--ink-5);
  transition: box-shadow var(--dur-state) var(--ease-state);
}

.choice.on .radio {
  box-shadow: inset 0 0 0 5px var(--accent);
}

.words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.words b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.hint {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

/* Match system: the preview crosses between day and night, the sun sets and the moon rises. */
@media (prefers-reduced-motion: no-preference) {
  .layer.light {
    animation: day 8s infinite both;
  }

  .layer.dark {
    animation: night 8s infinite both;
  }

  .sun {
    animation: sun 8s cubic-bezier(0.65, 0, 0.35, 1) infinite both;
  }

  .moon {
    animation: moon 8s cubic-bezier(0.65, 0, 0.35, 1) infinite both;
  }
}

@keyframes day {
  0%,
  44% {
    opacity: 1;
  }
  50%,
  94% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes night {
  0%,
  44% {
    opacity: 0;
  }
  50%,
  94% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes sun {
  0%,
  44% {
    opacity: 1;
    transform: none;
  }
  50%,
  94% {
    opacity: 0;
    transform: translateY(14px) rotate(60deg);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes moon {
  0%,
  44% {
    opacity: 0;
    transform: translateY(-14px) rotate(-40deg);
  }
  50%,
  94% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
    transform: translateY(-14px);
  }
}

@container (max-width: 560px) {
  .cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .shot {
    height: 150px;
  }
}
</style>
