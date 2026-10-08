<!--
  State B of the board "Mark as expected": a result that was expected and whose evidence has
  changed since. It says so, and quotes the note the person left so they remember why they
  trusted it. Drawn under a finding's head line.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import { useHistoryStore } from '@/stores/history'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ items: readonly Item[] }>()

const { t } = useI18n()
const history = useHistoryStore()

const rule = computed(() => {
  const id = props.items.find((i) => i.rule_broken)?.rule_broken
  return id ? (history.rules.find((r) => r.id === id) ?? null) : null
})
const broken = computed(() => props.items.some((i) => i.rule_broken))
</script>

<template>
  <div v-if="broken" class="broken" role="note">
    <UiIcon name="warn" :size="14" class="glyph" />
    <div class="words">
      <b>{{ t('expected.broken.title') }}</b>
      <span>{{ t('expected.broken.text') }}</span>
      <span v-if="rule?.note" class="note">{{
        t('expected.broken.note', { note: rule.note })
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.broken {
  display: flex;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-12);
  line-height: 1.45;
}

.glyph {
  flex: none;
  margin-top: 2px;
}

.words {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.words b {
  font-weight: var(--weight-medium);
}

.note {
  color: var(--ink-2);
}
</style>
