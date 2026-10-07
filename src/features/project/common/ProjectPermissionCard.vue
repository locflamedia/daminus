<!--
  The "needs permission" state of a project tab (board "Permission help"): an amber-washed card
  that says what Daminus could not do and that the server is fine, then one or more steps, each
  with a command to copy. Daminus never runs them. Every command goes through `UiCommandCopy`.
-->
<script setup lang="ts">
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiIcon from '@/ui/UiIcon.vue'

export interface PermissionStep {
  title: string
  text?: string
  /** `null` when the command could not be built safely: the step shows its words only. */
  command: string | null
}

defineProps<{
  title: string
  text: string
  steps: readonly PermissionStep[]
  /** A line under the steps (when the change applies). */
  note?: string
}>()
</script>

<template>
  <section class="perm">
    <header class="head">
      <span class="tile" aria-hidden="true"><UiIcon name="lock" :size="20" /></span>
      <div class="words">
        <h3 class="title">{{ title }}</h3>
        <p class="text">{{ text }}</p>
      </div>
    </header>
    <ol class="steps">
      <li v-for="(s, i) in steps" :key="i" class="step">
        <b class="step-title">{{ s.title }}</b>
        <p v-if="s.text" class="step-text">{{ s.text }}</p>
        <UiCommandCopy v-if="s.command" :command="s.command" />
      </li>
    </ol>
    <p v-if="note" class="note">{{ note }}</p>
  </section>
</template>

<style scoped>
.perm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 20px;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--card-wash-warn), var(--surface-0) 110px);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  color: var(--warn-ink);
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.01em;
}

.text,
.step-text,
.note {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.note {
  color: var(--ink-3);
}
</style>
