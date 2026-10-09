<!--
  One host of the pick table: a 56 px row with the tick, a two-line host cell, the user, the
  route, the system, the login test and the key. The row follows the store live: while it is
  read a soft scanline crosses it, and when the login lands it flashes green once. A failed or
  opened row lifts into a white card; what opens under it (the failure card, the permission
  rows) comes in the default slot. Clicking a reached row opens its permission rows.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HostRowModel } from '@/lib/host-rows'
import { isFailed, isRunning } from '@/lib/host-test'
import { brandOfDistro } from '@/ui/brand-marks'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiCheckbox from '@/ui/UiCheckbox.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiTooltip from '@/ui/UiTooltip.vue'
import LoginCell from './LoginCell.vue'

const props = defineProps<{ row: HostRowModel; odd: boolean; open: boolean }>()
const emit = defineEmits<{ tick: [on: boolean]; toggle: []; focus: [] }>()

const { t } = useI18n()

const scanning = computed(() => isRunning(props.row.chip))
const failed = computed(() => isFailed(props.row.chip))
const openable = computed(() => props.row.chip === 'reached')
const lifted = computed(() => failed.value || props.open)

// The row flashes when the login lands, once per event: only a change into "reached" counts,
// never a row that was already reached when the screen opened.
const flashing = ref(false)
watch(
  () => props.row.chip,
  (now, before) => {
    if (now === 'reached' && before !== 'reached') flashing.value = true
  },
)

function onClick(event: MouseEvent) {
  emit('focus')
  if (!openable.value) return
  if ((event.target as HTMLElement).closest('[data-no-toggle]')) return
  emit('toggle')
}
</script>

<template>
  <div class="item" :class="{ lifted, crit: failed }">
    <div
      class="cols row"
      :class="{ odd, flashing }"
      role="row"
      @click="onClick"
      @focusin="emit('focus')"
      @mouseenter="emit('focus')"
      @animationend="flashing = false"
    >
      <span v-if="scanning" class="scan" aria-hidden="true"><span /></span>
      <span class="flash" aria-hidden="true" />
      <span role="cell" data-no-toggle class="tick">
        <UiCheckbox
          :model-value="row.ticked"
          @update:model-value="(on: boolean) => emit('tick', on)"
        >
          <span class="sr">{{ t('setupPick.columns.tick', { host: row.alias }) }}</span>
        </UiCheckbox>
      </span>
      <span role="cell" class="host">
        <b class="mono alias">{{ row.alias }}</b>
        <span class="mono addr">{{ row.address }}</span>
      </span>
      <span role="cell" class="mono user"
        >{{ row.user ?? '·'
        }}<span v-if="row.port !== null" class="port">:{{ row.port }}</span></span
      >
      <span role="cell">
        <span v-if="row.route.kind === 'jump'" class="tag jump">
          <UiIcon name="jump" :size="12" />{{ t('setupPick.route.via', { jump: row.route.via }) }}
        </span>
        <span v-else class="tag direct">
          <UiIcon name="arrow-right" :size="12" />{{ t('setupPick.route.direct') }}
        </span>
      </span>
      <span role="cell" class="system">
        <template v-if="row.system.state === 'known'">
          <UiBrandMark :name="brandOfDistro(row.system.name)" :size="16">
            <UiIcon name="server" :size="14" class="os" />
          </UiBrandMark>
          <span class="name">{{ row.system.name }}</span>
          <UiTooltip v-if="row.system.eol" :text="t('setupPick.system.eolTip')">
            <span class="tag eol">{{ t('setupPick.system.eol') }}</span>
          </UiTooltip>
        </template>
        <span v-else-if="row.system.state === 'unknown'" class="muted">{{
          t('setupPick.system.unknown')
        }}</span>
        <template v-else>
          <span class="disc" aria-hidden="true" />
          <span class="muted">{{ t('setupPick.system.waiting') }}</span>
        </template>
      </span>
      <span role="cell">
        <component
          :is="openable ? 'button' : 'span'"
          class="login"
          :type="openable ? 'button' : undefined"
          :aria-expanded="openable ? open : undefined"
        >
          <LoginCell :chip="row.chip" :ms="row.ms" :ticked="row.ticked" />
        </component>
      </span>
      <span role="cell" class="mono key">{{ row.key ?? '·' }}</span>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.item {
  position: relative;
  border-radius: 14px;
  transition: box-shadow var(--dur-state) var(--ease-out);
}

.item.lifted {
  margin-block: var(--space-1);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
}

.item.crit {
  box-shadow: var(--shadow-card-crit);
}

.cols {
  display: grid;
  grid-template-columns: 16px minmax(0, 1.3fr) 112px 150px 170px 200px 104px;
  gap: var(--space-4);
  align-items: center;
  padding: 0 var(--space-4);
}

.row {
  position: relative;
  height: 56px;
  border-radius: 14px;
  overflow: hidden;
  isolation: isolate;
  cursor: default;
}

.row.odd {
  background: var(--surface-well);
}

.lifted .row {
  overflow: visible;
  background: transparent;
}

.scan {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.scan span {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--accent) 10%, transparent),
    transparent
  );
  animation: scan 1.6s var(--ease-in-out) infinite;
}

@keyframes scan {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(260%);
  }
}

.flash {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: var(--ok-soft);
  opacity: 0;
  pointer-events: none;
}

.flashing .flash {
  animation: flash 1.2s var(--ease-out) both;
}

@keyframes flash {
  0% {
    opacity: 0;
  }

  25% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scan span {
    animation: none;
    transform: none;
    width: 100%;
    opacity: 0.5;
  }

  .flashing .flash {
    animation-duration: 0.01ms;
  }
}

.tick :deep(.check) {
  gap: 0;
  height: 16px;
  padding: 0;
  background: transparent !important;
}

.tick :deep(.label) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.host {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.alias {
  overflow: hidden;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addr {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.user {
  color: var(--ink-2);
  font-size: var(--text-12);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.port {
  margin-left: var(--space-2);
  color: var(--ink-3);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.direct {
  background: var(--surface-1);
  color: var(--ink-3);
}

.jump {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.eol {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.system {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
}

.os {
  color: var(--ink-4);
}

.name {
  white-space: nowrap;
}

.muted {
  color: var(--ink-3);
}

.disc {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface-2);
}

.login {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  padding: 0;
  border-radius: var(--radius-xs);
  color: inherit;
  text-align: left;
}

button.login:focus-visible {
  box-shadow: var(--focus-ring);
}

.key {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr {
  position: absolute;
}
</style>
