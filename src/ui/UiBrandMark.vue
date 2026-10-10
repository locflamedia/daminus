<!--
  The mark of a technology or vendor (Docker, PM2, PostgreSQL, Anthropic, Ollama...), a bundled
  SVG drawn at `size` px (14 in a tag, 16 in a part row, 20 inside a project tile). With no `name`
  it draws the `fallback` slot (a project-colour dot, a monogram, the code glyph) so a caller never
  has to branch. Next to a word the mark is decoration and hidden from assistive technology; with
  `labelled` it stands alone and is named after its owner (role img, aria-label).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { BRAND_DARK_FILES, BRAND_FILES, BRAND_TITLES, type BrandName } from './brand-marks'

/** Marks too dark to read on a dark surface: lifted with a brightness filter, never recoloured. */
const DARK_ON_DARK: readonly BrandName[] = ['mysql']

const props = withDefaults(
  defineProps<{ name?: BrandName | null; size?: number; labelled?: boolean }>(),
  { name: null, size: 14, labelled: false },
)
const lifted = computed(() => props.name !== null && DARK_ON_DARK.includes(props.name))
const darkFile = computed(() => (props.name ? BRAND_DARK_FILES[props.name] : undefined))
/** The owner's name when the mark stands alone; nothing when it sits beside the word. */
const title = computed(() => (props.labelled && props.name ? BRAND_TITLES[props.name] : ''))
</script>

<!-- One root element in every branch, so a class or style from the caller always lands. -->
<template>
  <span
    v-if="name && darkFile"
    class="brand pair"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :role="title ? 'img' : undefined"
    :aria-label="title || undefined"
    :aria-hidden="title ? undefined : 'true'"
  >
    <img
      class="face brand-light"
      :src="BRAND_FILES[name]"
      :width="size"
      :height="size"
      alt=""
      draggable="false"
    />
    <img
      class="face brand-dark"
      :src="darkFile"
      :width="size"
      :height="size"
      alt=""
      draggable="false"
    />
  </span>
  <img
    v-else-if="name"
    class="brand"
    :class="{ 'brand-lift': lifted }"
    :src="BRAND_FILES[name]"
    :width="size"
    :height="size"
    :alt="title"
    :aria-hidden="title ? undefined : 'true'"
    draggable="false"
  />
  <slot v-else />
</template>

<style scoped>
.brand {
  display: block;
  flex: none;
  object-fit: contain;
}

.face {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-dark {
  display: none;
}

@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme='light']) .brand-lift) {
    filter: brightness(2.4) saturate(0.6);
  }

  :global(:root:not([data-theme='light']) .brand-light) {
    display: none;
  }

  :global(:root:not([data-theme='light']) .brand-dark) {
    display: block;
  }
}

:global(:root[data-theme='dark'] .brand-lift) {
  filter: brightness(2.4) saturate(0.6);
}

:global(:root[data-theme='dark'] .brand-light) {
  display: none;
}

:global(:root[data-theme='dark'] .brand-dark) {
  display: block;
}
</style>
