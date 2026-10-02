<!--
  Empty value, from the board "Micro UI": a value that is not there is an em dash, never 0,
  followed by a 12 px mark that says why: a padlock when the check needs a permission, a
  dashed circle when the thing is not set up. The reason is on hover (and read out), so the
  dash is never a mystery. Sized like the value it stands in for (15 px medium by default).
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from './UiIcon.vue'
import UiTooltip from './UiTooltip.vue'

export type EmptyReason = 'none' | 'permission' | 'not-set-up'

const props = withDefaults(defineProps<{ reason?: EmptyReason; hint?: string }>(), {
  reason: 'none',
  hint: undefined,
})

const { t } = useI18n()
const words = computed(
  () =>
    props.hint ??
    t(
      props.reason === 'permission'
        ? 'ui.emptyPermission'
        : props.reason === 'not-set-up'
          ? 'ui.emptyNotSetUp'
          : 'ui.emptyNone',
    ),
)
</script>

<template>
  <UiTooltip :text="words">
    <span class="empty" tabindex="0">
      <span aria-hidden="true">—</span>
      <UiIcon v-if="reason === 'permission'" name="lock" :size="12" class="mark" />
      <UiIcon v-else-if="reason === 'not-set-up'" name="circle" :size="12" dashed class="mark" />
      <span class="sr-only">{{ words }}</span>
    </span>
  </UiTooltip>
</template>

<style scoped>
.empty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-xs);
  color: var(--ink-3);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
}

.empty:focus-visible {
  box-shadow: var(--focus-ring);
}

.mark {
  color: var(--ink-4);
}
</style>
