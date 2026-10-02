<!--
  The tokens of the boards "Color", "Space, shape and layout" (elevation) and "Charts" (one
  value per role): every swatch is drawn with its token and labelled with the value the
  current theme gives it, read back from the page, so a drift from the canvas shows here.
-->
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()
const k = (key: string) => t(`gallery.foundations.${key}`)
const settings = useSettingsStore()

interface Swatch {
  token: string
  use?: string
}

const neutrals: Swatch[] = [
  { token: 'ink' },
  { token: 'ink-2' },
  { token: 'ink-3' },
  { token: 'ink-4' },
  { token: 'ink-5' },
  { token: 'surface-0' },
  { token: 'surface-1' },
  { token: 'surface-well' },
  { token: 'surface-2' },
  { token: 'surface-3' },
  { token: 'base' },
  { token: 'page' },
  { token: 'page-sheet' },
  { token: 'btn' },
]

const accents: Swatch[] = [
  { token: 'accent' },
  { token: 'accent-ink' },
  { token: 'accent-ink-hover' },
  { token: 'accent-soft' },
  { token: 'accent-mid' },
]

const status: Swatch[][] = (['ok', 'warn', 'crit'] as const).map((s) => [
  { token: `${s}-solid` },
  { token: `${s}-ink` },
  { token: `${s}-soft` },
])

const roles: Swatch[] = [
  { token: 'chart-amber' },
  { token: 'chart-accent-70' },
  { token: 'chart-lilac' },
  { token: 'chart-lilac-soft' },
  { token: 'chart-blush' },
  { token: 'chart-bar-old' },
  { token: 'heat-ok' },
  { token: 'heat-warn' },
  { token: 'heat-crit' },
  { token: 'strip-ok' },
  { token: 'strip-warn' },
  { token: 'strip-crit' },
  { token: 'tile-1' },
  { token: 'tile-2' },
  { token: 'tile-3' },
  { token: 'tile-grow' },
]

const shadows = [
  'shadow-none',
  'shadow-lift',
  'shadow-seg',
  'shadow-knob',
  'shadow-control',
  'shadow-card',
  'shadow-tray',
  'shadow-pop',
  'shadow-overlay',
  'shadow-drawer',
]

const values = ref<Record<string, string>>({})
function read() {
  const style = getComputedStyle(document.documentElement)
  const next: Record<string, string> = {}
  const all = [...neutrals, ...accents, ...status.flat(), ...roles]
  for (const { token } of all) next[token] = style.getPropertyValue(`--${token}`).trim()
  for (const name of shadows) next[name] = style.getPropertyValue(`--${name}`).trim()
  values.value = next
}

onMounted(read)
// The theme is applied to the page a tick after the setting changes.
watch(
  () => settings.theme,
  () => void nextTick(() => requestAnimationFrame(read)),
)
</script>

<template>
  <div class="foundations">
    <GalleryFrame :title="k('neutrals.title')" :text="k('neutrals.lede')">
      <div class="grid six">
        <div v-for="s in neutrals" :key="s.token" class="swatch">
          <span class="chip" :style="{ background: `var(--${s.token})` }" />
          <span class="name">{{ s.token }}</span>
          <span class="value mono">{{ values[s.token] }}</span>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('accent.title')" :text="k('accent.lede')">
      <div class="grid six">
        <div v-for="s in accents" :key="s.token" class="swatch">
          <span class="chip" :style="{ background: `var(--${s.token})` }" />
          <span class="name">{{ s.token }}</span>
          <span class="value mono">{{ values[s.token] }}</span>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('status.title')" :text="k('status.lede')">
      <div class="grid three">
        <div v-for="(triad, i) in status" :key="i" class="triad">
          <span
            class="sample"
            :style="{
              background: `var(--${triad[2]?.token})`,
              color: `var(--${triad[1]?.token})`,
            }"
            >{{ k(`status.sample.${['ok', 'warn', 'crit'][i]}`) }}</span
          >
          <div v-for="s in triad" :key="s.token" class="row">
            <span class="mini" :style="{ background: `var(--${s.token})` }" />
            <span>{{ s.token }}</span>
            <span class="value mono">{{ values[s.token] }}</span>
          </div>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('roles.title')" :text="k('roles.lede')">
      <div class="grid six">
        <div v-for="s in roles" :key="s.token" class="swatch">
          <span class="chip" :style="{ background: `var(--${s.token})` }" />
          <span class="name">{{ s.token }}</span>
          <span class="value mono">{{ values[s.token] }}</span>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('elevation.title')" :text="k('elevation.lede')">
      <div class="shadows">
        <div v-for="name in shadows" :key="name" class="shadow-item">
          <span
            class="box"
            :class="{ glass: name === 'shadow-tray', well: name === 'shadow-none' }"
            :style="{ boxShadow: `var(--${name})` }"
          />
          <span class="name mono">{{ name }}</span>
          <span class="value mono">{{ values[name] }}</span>
        </div>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.foundations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.grid {
  display: grid;
  gap: var(--space-3);
}

.grid.six {
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
}

.grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.swatch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--space-2) var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: inset 0 0 0 1px var(--surface-2);
}

.chip {
  height: 48px;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 1px var(--surface-2);
}

.name {
  padding: 0 var(--space-1);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.value {
  padding: 0 var(--space-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  overflow-wrap: anywhere;
}

.triad {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: inset 0 0 0 1px var(--surface-2);
}

.sample {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-12);
}

.mini {
  width: 28px;
  height: 20px;
  border-radius: var(--radius-xs);
}

.shadows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--base);
}

.shadow-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.box {
  height: 72px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.box.glass {
  background: var(--tray);
}

.box.well {
  background: var(--surface-1);
}

.shadow-item .name {
  padding: 0;
  font-size: var(--text-12);
}

.shadow-item .value {
  padding: 0;
  font-size: 10px;
  line-height: 1.5;
}
</style>
