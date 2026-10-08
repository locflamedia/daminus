<!--
  Development only: opens "what will be sent" over Overview, for looking at it with `?mock=ai`
  (`#/dev/payload`). The production bundle does not contain this route.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import OverviewView from '@/features/overview/OverviewView.vue'
import { useAiPayloadStore } from '@/stores/ai-payload'

const payload = useAiPayloadStore()
onMounted(() => {
  void payload.review({
    scope: { kind: 'whole' },
    question: 'Is this server hacked? What should I do first?',
    context: 'kho-hang · scan #12 vs #11',
    subject: 'kho-hang',
  })
})
</script>

<template>
  <OverviewView />
</template>
