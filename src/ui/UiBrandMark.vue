<!--
  The mark of a technology (Docker, PM2, PostgreSQL, MySQL, Redis, NGINX...), a bundled SVG
  drawn at `size` px (14 in a tag, 16 in a part row, 20 inside a project tile). With no `name`
  it draws the `fallback` slot (a project-colour dot, a monogram) so a caller never has to
  branch. The mark is decoration next to a word, so it is hidden from assistive technology.
-->
<script setup lang="ts">
import { BRAND_FILES, type BrandName } from './brand-marks'

withDefaults(defineProps<{ name?: BrandName | null; size?: number }>(), {
  name: null,
  size: 14,
})
</script>

<template>
  <img
    v-if="name"
    class="brand"
    :src="BRAND_FILES[name]"
    :width="size"
    :height="size"
    alt=""
    aria-hidden="true"
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
</style>
