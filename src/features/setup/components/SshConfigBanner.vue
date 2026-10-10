<!--
  "Could not read your SSH config", from board 01b panel 10: ssh refused a line of the ssh
  config, so no host can connect. The same banner and words sit on Pick hosts, the empty app,
  Settings › Hosts and the Add host sheet. It quotes the refused line with one line of context
  each side (nothing else of the file) and offers Reveal in Finder and Check again.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { revealSshDir, type SshConfigProblem } from '@/api'
import { errorText } from '@/lib/issue-text'
import { revealSshFailure } from '@/lib/reveal-ssh'
import { useToastStore } from '@/stores/toasts'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const props = withDefaults(defineProps<{ problem: SshConfigProblem; busy?: boolean }>(), {
  busy: false,
})
const emit = defineEmits<{ recheck: [] }>()

const { t } = useI18n()
const toasts = useToastStore()

/** The line ssh named, highlighted in the excerpt. */
const refused = computed(() => {
  const code = props.problem.error.code
  return code.kind === 'ssh_config_invalid' ? (code.line ?? null) : null
})

async function reveal() {
  try {
    await revealSshDir()
  } catch (e) {
    toasts.push({ tone: 'crit', title: t(`empty.hostBlock.reveal.${revealSshFailure(e)}`) })
  }
}
</script>

<template>
  <section class="config-problem" role="alert">
    <span class="title">
      <UiIcon name="warn" :size="14" class="glyph" />
      {{ t('setupPick.error.title') }}
    </span>
    <span class="text">{{ errorText(problem.error) }}</span>
    <div v-if="problem.excerpt.length" class="excerpt">
      <template v-for="line in problem.excerpt" :key="line.number">
        <span class="number" :class="{ refused: line.number === refused }">{{ line.number }}</span>
        <span class="code" :class="{ refused: line.number === refused }">{{ line.text }}</span>
      </template>
    </div>
    <div class="actions">
      <UiButton variant="secondary" @click="reveal">{{ t('setupPick.error.reveal') }}</UiButton>
      <UiButton variant="secondary" icon="refresh" :busy="busy" @click="emit('recheck')">
        {{ t('setupPick.error.checkAgain') }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.config-problem {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--crit-soft);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  font-weight: 500;
  color: var(--crit-ink);
}

.glyph {
  color: var(--crit-solid);
}

.text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ink-2);
}

.excerpt {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface-0);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
}

.number {
  color: var(--ink-4);
}

.code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}

.refused {
  color: var(--crit-ink);
}

.code.refused {
  justify-self: start;
  max-width: 100%;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--crit-soft);
}

.actions {
  display: flex;
  gap: var(--space-2);
}
</style>
