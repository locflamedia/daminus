<!--
  Treemap of the board "Project · Disk" (where the space goes): the top folders sized by
  bytes in two rows, tinted from pale lilac and blue to grey "other"; the one that grew gets
  an amber outline and its change. Each tile holds its name (mono, 12/500) and its size
  (18/500) with the change beside it, always inside the tile, truncated before it overflows.
  Tiles keep the order given. They rise in reading order the first time the chart appears.
  Names and amounts come from the caller and are rendered as text; the colours only help, as
  every tile says what it is.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { treemapRows } from '@/lib/chart-layout'
import { shouldPlay } from '@/lib/motion'

export interface TreemapTile {
  id: string
  /** A path or folder name, "storage/logs". */
  label: string
  value: number
  /** The size as written, "2.6 GB". */
  display: string
  /** The change as written, "+40 MB" or "no change". */
  delta?: string
  /** Growth reads amber; "no change" stays grey. */
  deltaTone?: 'warn' | 'neutral'
  /** The one that grew: amber outline. */
  grow?: boolean
  /** Everything else: grey. */
  other?: boolean
}

const props = withDefaults(
  defineProps<{
    tiles: readonly TreemapTile[]
    /** Tiles per row; by default two rows. */
    rows?: readonly number[]
    height?: number
    label: string
    once?: string
  }>(),
  { rows: undefined, height: 300, once: undefined },
)

const play = shouldPlay(props.once)
const INSET = 3

const laid = computed(() => {
  const tiles = treemapRows(props.tiles, props.rows)
  // Pale to deep by size among the ordinary tiles; grower and other have their own tints.
  let rank = 0
  const ramp = ['tile-1', 'tile-2', 'tile-3']
  return tiles.map(({ item, rect }, i) => {
    const tone = item.grow
      ? 'grow'
      : item.other
        ? 'other'
        : (ramp[Math.min(rank++, ramp.length - 1)] ?? 'tile-3')
    return {
      item,
      tone,
      // Reading order: one step per tile, and one more for each row after the first.
      delay: `${(i + rect.row) * 60}ms`,
      style: {
        left: `calc(${rect.x * 100}% + ${INSET}px)`,
        top: `${rect.y * props.height + INSET}px`,
        width: `calc(${rect.w * 100}% - ${INSET * 2}px)`,
        height: `${rect.h * props.height - INSET * 2}px`,
      },
    }
  })
})
</script>

<template>
  <ul class="treemap" :style="{ height: `${height}px` }" role="list" :aria-label="label">
    <li
      v-for="tile in laid"
      :key="tile.item.id"
      class="tile"
      :class="[`tone-${tile.tone}`, { 'm-enter': play }]"
      :style="{ ...tile.style, '--d': tile.delay }"
    >
      <span class="name">{{ tile.item.label }}</span>
      <span class="size">
        <span class="amount">{{ tile.item.display }}</span>
        <span
          v-if="tile.item.delta"
          class="delta"
          :class="{ grew: tile.item.deltaTone === 'warn' }"
          >{{ tile.item.delta }}</span
        >
      </span>
    </li>
  </ul>
</template>

<style scoped>
.treemap {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tile {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: var(--space-3);
  border-radius: 12px;
  background: var(--tile);
  color: var(--ink);
}

.tone-tile-1 {
  --tile: var(--tile-1);
}

.tone-tile-2 {
  --tile: var(--tile-2);
}

.tone-tile-3 {
  --tile: var(--tile-3);
}

.tone-other {
  --tile: var(--surface-2);
}

.tone-grow {
  --tile: var(--tile-grow);

  box-shadow: inset 0 0 0 2px var(--warn-solid);
}

.name {
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  font-size: 18px;
  font-weight: var(--weight-medium);
}

.amount {
  white-space: nowrap;
}

.delta {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.grew {
  color: var(--warn-ink);
}
</style>
