<!--
  "Do this first", from the board "Project · Security": when anything is critical, one dark strip
  names the single first action and what comes after it. It is rule-based per check, not AI: the
  order and the words are fixed in `lib/security-first.ts`.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import { cleanCommand } from '@/lib/command-safety'
import { capitalize } from '@/lib/security-format'
import type { FirstStep } from '@/lib/security-first'
import { useCopy } from '@/lib/use-copy'
import UiButton from '@/ui/UiButton.vue'

const props = defineProps<{ step: FirstStep }>()

const { t, locale } = useI18n()
const id = computed(() => props.step.check.replace('.', '_'))
const { state, copy } = useCopy()

const lead = computed(() => t(`projectSecurity.first.title.${id.value}`))

const next = computed(() =>
  t(`projectSecurity.first.next.${id.value}`, {
    file: props.step.file ?? t('projectSecurity.first.thisFile'),
  }),
)

const afterLine = computed(() => {
  if (props.step.after.length === 0) return ''
  const names = props.step.after.map((c) => t(`projectSecurity.first.after.${c.replace('.', '_')}`))
  const list = new Intl.ListFormat(String(locale.value), { type: 'conjunction' }).format(names)
  return t('projectSecurity.first.afterLine', { list: capitalize(list) })
})

const copyLabel = computed(() =>
  state.value === 'copied' ? t('ui.copied') : t('projectSecurity.first.copyRule'),
)

function copyRule() {
  if (props.step.command) void copy(cleanCommand(props.step.command).text)
}
</script>

<template>
  <section v-enter class="strip" :aria-label="t('projectSecurity.first.label')">
    <span class="n" aria-hidden="true">1</span>
    <div class="text">
      <b class="lead">{{ lead }}</b>
      <span class="sub">{{ next }} {{ afterLine }}</span>
    </div>
    <span class="grow" />
    <UiButton v-if="step.command" size="small" class="copy" @click="copyRule">{{
      copyLabel
    }}</UiButton>
  </section>
</template>

<style scoped>
.strip {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 12px 12px 14px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--code), color-mix(in srgb, var(--code) 80%, #3a3d52));
  color: #ffffff;
}

.n {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--crit-solid);
  font-size: var(--text-13);
  font-weight: var(--weight-semibold);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lead {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.sub {
  color: var(--code-dim);
  font-size: var(--text-11);
}

.grow {
  flex: 1 1 0;
}

.copy {
  flex: none;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
</style>
