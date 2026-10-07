<!--
  What the core says about one field, under it: an error with a red cross, a warning with an
  amber triangle, each in words. Nothing here is colour alone.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Project, ProjectIssue } from '@/api'
import { issueMessage } from '@/lib/project-issues'
import UiIcon from '@/ui/UiIcon.vue'

defineProps<{
  issues: readonly ProjectIssue[]
  /** The project the issues are about: it names the host or URL in a sentence. */
  project?: Project
}>()

const { t } = useI18n()

function text(issue: ProjectIssue, project?: Project): string {
  const message = issueMessage(issue, project)
  return t(message.key, message.params)
}
</script>

<template>
  <ul v-if="issues.length > 0" class="messages">
    <li
      v-for="(issue, i) in issues"
      :key="i"
      class="message"
      :class="issue.level === 'error' ? 'error' : 'warn'"
    >
      <UiIcon :name="issue.level === 'error' ? 'close' : 'warn'" :size="10" :stroke="2" />
      <span>{{ text(issue, project) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.messages {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--text-11);
  line-height: 1.4;
}

.message .icon {
  flex: none;
  margin-top: 2px;
}

.error {
  color: var(--crit-ink);
}

.warn {
  color: var(--warn-ink);
}
</style>
