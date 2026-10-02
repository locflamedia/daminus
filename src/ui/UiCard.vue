<!--
  Card, from the boards "Components", "Data display" and the finding cards of "Project ·
  Security": a white radius-14 surface, padding 16, no border anywhere (tone and a soft
  shadow separate it from the ground). Severity is a wash, not an edge: the first 88 px
  of the card fade from the severity's tint into white, and the title, icon and chip carry
  the meaning. `tray` wraps the card in the glass tray (radius 20 = 14 + 6) that content
  sits in on the window ground. The gap between blocks is `--card-gap` (12 by default) and
  the padding `--card-pad`; set them on the element for the denser or looser boards.
  `lift` is the hover of a card that opens: 2 px up and a deeper shadow in 200 ms, on a
  pointer only (the Motion board); the arrow inside may carry `m-nudge` to move 3 px.
-->
<script setup lang="ts">
export type CardTone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info'

withDefaults(
  defineProps<{
    tone?: CardTone
    tray?: boolean
    lift?: boolean
    as?: 'div' | 'section' | 'article' | 'li'
  }>(),
  { tone: 'neutral', tray: false, lift: false, as: 'div' },
)
</script>

<template>
  <component :is="as" v-if="tray" class="tray">
    <div class="card flat" :class="[`card-${tone}`, { 'm-lift': lift }]"><slot /></div>
  </component>
  <component :is="as" v-else class="card" :class="[`card-${tone}`, { 'm-lift': lift }]"
    ><slot
  /></component>
</template>

<style scoped>
.tray {
  display: flex;
  min-width: 0;
  padding: 6px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-0) 55%, transparent);
}

.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--card-gap, var(--space-3));
  min-width: 0;
  padding: var(--card-pad, var(--space-4));
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.card.flat {
  box-shadow: none;
}

.card-ok {
  background: linear-gradient(180deg, var(--card-wash-ok) 0, var(--surface-0) 88px);
}

.card-warn {
  background: linear-gradient(180deg, var(--card-wash-warn) 0, var(--surface-0) 88px);
}

.card-crit {
  background: linear-gradient(180deg, var(--card-wash-crit) 0, var(--surface-0) 88px);
}

.card-info {
  background: linear-gradient(180deg, var(--card-wash-info) 0, var(--surface-0) 88px);
}
</style>
