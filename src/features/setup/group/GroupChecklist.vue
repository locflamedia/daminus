<!--
  "Before you save", in the left column: three lines computed from the drafts. A line that is
  not met is amber and says what happens if it stays that way; none of them blocks the save.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { checklist } from '@/lib/group-view'
import type { DraftProject } from '@/lib/setup-model'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ drafts: readonly DraftProject[] }>()
const { t } = useI18n()
const lines = computed(() => checklist(props.drafts))
</script>

<template>
  <section class="check" :aria-label="t('setupGroup.check.title')">
    <b>{{ t('setupGroup.check.title') }}</b>
    <p
      v-for="line in lines"
      :key="line.id"
      :class="{ ok: line.ok }"
      :data-testid="`check-${line.id}`"
    >
      <span class="mark" aria-hidden="true">
        <UiIcon v-if="line.ok" name="check" :size="10" :stroke="2.4" />
        <template v-else>!</template>
      </span>
      <span>{{ t(line.words.key, line.words.params, line.words.n ?? 0) }}</span>
    </p>
  </section>
</template>

<style scoped>
.check {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-0) 72%, transparent);
}

b {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

p {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.4;
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}

.ok .mark {
  background: var(--ok-soft);
  color: var(--ok-ink);
}
</style>
