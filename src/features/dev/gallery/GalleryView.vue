<!--
  Development only: every primitive in every variant and state, in the theme and language
  chosen at the top. Reached at #/dev/gallery; the route does not exist in a production build.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { LOCALES, type Locale, i18n } from '@/i18n'
import { THEMES, type Theme } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'
import UiSeg from '@/ui/UiSeg.vue'
import GalleryActions from './GalleryActions.vue'
import GalleryCharts from './GalleryCharts.vue'
import GalleryComposed from './GalleryComposed.vue'
import GalleryDisplay from './GalleryDisplay.vue'
import GalleryInputs from './GalleryInputs.vue'
import GalleryMicro from './GalleryMicro.vue'
import GalleryOverlays from './GalleryOverlays.vue'
import { galleryMessages } from './gallery-messages'

for (const locale of LOCALES) {
  i18n.global.mergeLocaleMessage(locale, { gallery: galleryMessages[locale] })
}

const { t } = useI18n()
const settings = useSettingsStore()

const themes = computed(() => THEMES.map((value) => ({ value, label: t(`theme.${value}`) })))
const languages = computed(() => LOCALES.map((value) => ({ value, label: t(`language.${value}`) })))
</script>

<template>
  <main class="gallery">
    <header class="top">
      <div class="titles">
        <h1 class="title">{{ t('gallery.title') }}</h1>
        <p class="lede">{{ t('gallery.lede') }}</p>
      </div>
      <div class="toggles">
        <UiSeg
          :model-value="settings.theme"
          :options="themes"
          :label="t('gallery.theme')"
          semantics="radio"
          @update:model-value="(v: string) => settings.setTheme(v as Theme)"
        />
        <UiSeg
          :model-value="settings.language"
          :options="languages"
          :label="t('gallery.language')"
          semantics="radio"
          @update:model-value="(v: string) => settings.setLanguage(v as Locale)"
        />
      </div>
    </header>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.actions.title') }}</h2>
      <p class="group-lede">{{ t('gallery.actions.lede') }}</p>
      <GalleryActions />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.inputs.title') }}</h2>
      <p class="group-lede">{{ t('gallery.inputs.lede') }}</p>
      <GalleryInputs />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.display.title') }}</h2>
      <p class="group-lede">{{ t('gallery.display.lede') }}</p>
      <GalleryDisplay />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.micro.title') }}</h2>
      <GalleryMicro />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.composed.title') }}</h2>
      <GalleryComposed />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.charts.title') }}</h2>
      <GalleryCharts />
    </section>

    <section class="group">
      <h2 class="group-title">{{ t('gallery.overlays.title') }}</h2>
      <p class="group-lede">{{ t('gallery.overlays.lede') }}</p>
      <GalleryOverlays />
    </section>
  </main>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  height: 100%;
  padding: 48px;
  overflow-y: auto;
  background: var(--page-sheet);
}

.top {
  position: sticky;
  top: calc(-1 * 48px);
  z-index: 30;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin: -48px -48px 0;
  padding: var(--space-4) 48px;
  background: color-mix(in srgb, var(--page-sheet) 88%, transparent);
  backdrop-filter: blur(12px);
}

.title {
  font-size: var(--text-28);
  font-weight: var(--weight-regular);
  letter-spacing: var(--track-28);
  line-height: 1.2;
}

.lede,
.group-lede {
  max-width: 80ch;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toggles {
  display: flex;
  gap: var(--space-3);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.group-title {
  font-size: var(--text-20);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-20);
}
</style>
