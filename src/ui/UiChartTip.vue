<!--
  The hover card of the charts, from the boards "Charts" and "Chart focus": a white card with
  the scan in ink-3, the value in ink and, when there is one, the change in a small pill. It
  opens under the pointer and, the same way, on the point the keyboard has focused; the words
  for screen readers are announced by the chart, so the card itself is hidden from them. The
  compact form is the one a column chart uses. The caller places it; the text is rendered as
  text.
-->
<script setup lang="ts">
export interface ChartTip {
  title: string
  value: string
  delta?: string
  /** The sentence read out for this point; defaults to the card's own words. */
  spoken?: string
}

defineProps<{ tip: ChartTip; compact?: boolean }>()
</script>

<template>
  <div class="tip" :class="{ compact }" aria-hidden="true">
    <span class="tip-title">{{ tip.title }}</span>
    <span class="tip-row">
      <b class="tip-value">{{ tip.value }}</b>
      <span v-if="tip.delta" class="tip-delta">{{ tip.delta }}</span>
    </span>
  </div>
</template>

<style scoped>
/*
  Placed as the board draws it in a 148 by 56 card: the scan's baseline 22 px down, the value's
  43 px down, and the change in an 18 px pill whose foot is the value row's foot.
*/
.tip {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: max-content;
  min-width: 148px;
  height: 56px;
  padding: 11px 12px 0;
  border-radius: 12px;
  background: var(--surface-0);
  box-shadow: var(--shadow-pop);
  pointer-events: none;
}

.tip-title {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 14px;
  white-space: nowrap;
}

.tip-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  height: 20px;
}

.tip-value {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  line-height: 20px;
  white-space: nowrap;
}

.tip-delta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 18px;
  padding: 0 var(--space-2);
  border-radius: 9px;
  background: var(--surface-1);
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  line-height: 18px;
  white-space: nowrap;
}

/* The column charts' card is smaller: 8 by 10 px of padding and the natural line height. */
.compact {
  gap: 2px;
  min-width: 0;
  height: auto;
  padding: 8px 10px;
  border-radius: 10px;
  line-height: normal;
}

.compact .tip-title,
.compact .tip-value {
  line-height: normal;
}

.compact .tip-row {
  height: auto;
}

.compact .tip-delta {
  min-width: 0;
}

.compact .tip-value {
  font-size: var(--text-13);
}
</style>
