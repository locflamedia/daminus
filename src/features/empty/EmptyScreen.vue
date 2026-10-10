<!--
  What Overview shows when no project exists yet: the first screen, or the help screen for a
  Mac whose ssh is not ready. It reads the ssh config and the agent when it appears, keeps the
  window's keys for this screen (Return imports, ⌘N adds a host by hand, ⇧⌘R checks again) and
  owns the "Add a host by hand" sheet. Import leads into the three setup steps.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AddHostSheet from '@/features/setup/components/AddHostSheet.vue'
import { errorText } from '@/lib/issue-text'
import { useSetupStore } from '@/stores/setup'
import UiBanner from '@/ui/UiBanner.vue'
import EmptyAppView from './EmptyAppView.vue'
import EmptyNoConfigView from './EmptyNoConfigView.vue'
import EmptyToolbar from './components/EmptyToolbar.vue'
import { useEmptyStore } from './empty-store'

const { t } = useI18n()
const router = useRouter()
const setup = useSetupStore()
const empty = useEmptyStore()

/**
 * A failed first read (nothing listed yet), or a config ssh refused: the hosts may be listed,
 * but none can connect until the named line is fixed.
 */
const banner = computed(() => (setup.error && !empty.known ? setup.error : setup.configError))

function importHosts() {
  void router.push('/setup')
}

function addByHand() {
  setup.addHostOpen = true
}

function recheck() {
  void setup.reload()
}

/** Return on a control belongs to the control; everywhere else it means "Import". */
function onControl(e: KeyboardEvent): boolean {
  const target = e.target
  return (
    target instanceof HTMLElement &&
    (target.closest('button, a, input, textarea, select, [role="dialog"]') !== null ||
      target.isContentEditable)
  )
}

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return
  const key = e.key.toLowerCase()
  if (e.metaKey && e.shiftKey && key === 'r') {
    e.preventDefault()
    recheck()
  } else if (e.metaKey && !e.shiftKey && key === 'n') {
    e.preventDefault()
    addByHand()
  } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !onControl(e)) {
    if (empty.screen === 'app' || empty.help?.canImport) {
      e.preventDefault()
      importHosts()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void setup.load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  empty.reset()
})
</script>

<template>
  <div class="empty-screen">
    <EmptyToolbar :keys="empty.screen === 'app' ? empty.input.keys : 0" />
    <UiBanner
      v-if="banner"
      tone="warn"
      icon="warn"
      alert
      :title="t('empty.loadFailed')"
      :text="errorText(banner)"
    />
    <EmptyNoConfigView
      v-if="empty.help"
      :view="empty.help"
      @import="importHosts"
      @add="addByHand"
      @recheck="recheck"
    />
    <EmptyAppView v-else @import="importHosts" @add="addByHand" />
    <AddHostSheet v-model="setup.addHostOpen" />
  </div>
</template>

<style scoped>
.empty-screen {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
</style>
