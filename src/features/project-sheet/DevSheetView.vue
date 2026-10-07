<!--
  Development only: opens the project sheet over Overview in one of its states, chosen by
  `?state=edit|new|errors|warnings|replaces` in the address, for looking at and photographing
  each of them. The production bundle does not contain this route.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import OverviewView from '@/features/overview/OverviewView.vue'
import { type DraftProject, draftFromProject, emptyDraft, newKey } from '@/lib/setup-model'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useSetupStore } from '@/stores/setup'
import { SAVED_PROJECTS } from '@/testing/setup-fixture'

const route = useRoute()
const sheet = useProjectSheetStore()
const setup = useSetupStore()

function seedDiscovery() {
  setup.liveItems = {
    'vps-sg-1': [
      {
        rec: 'pm2',
        app: 'tiemtra-web',
        home: '/root/.pm2',
        default: true,
        instances: 2,
        status: 'online',
        cwd: '/srv/tiemtra-web',
      },
      {
        rec: 'pm2',
        app: 'tiemtra-cron',
        home: '/root/.pm2',
        default: true,
        instances: 1,
        status: 'online',
        cwd: '/srv/tiemtra-web',
      },
      {
        rec: 'pm2',
        app: 'uptime-bot',
        home: '/root/.pm2',
        default: true,
        instances: 1,
        status: 'stopped',
        cwd: null,
      },
      {
        rec: 'vhost',
        file: '/etc/nginx/sites-enabled/tiemtra',
        names: ['tiemtra.vn'],
        root: '/var/www/tiemtra',
        proxy: null,
        ssl: true,
        php: true,
        listen: [443],
      },
    ],
    'vps-sg-2': [
      {
        rec: 'compose',
        project: 'tiemtra-api',
        dir: '/srv/tiemtra-api',
        services: ['app', 'db', 'redis', 'nginx'],
        running: 4,
        total: 4,
        ports: [8080],
      },
      {
        rec: 'compose',
        project: 'shop-api',
        dir: '/srv/shop-api',
        services: ['app'],
        running: 1,
        total: 1,
        ports: [],
      },
      {
        rec: 'compose',
        project: 'tiemtra-queue',
        dir: '/srv/tiemtra-queue',
        services: ['worker'],
        running: 0,
        total: 1,
        ports: [],
      },
    ],
  }
}

function saved(): DraftProject {
  return draftFromProject(SAVED_PROJECTS[0]!)
}

onMounted(() => {
  seedDiscovery()
  const state = String(route.query.state ?? 'edit')
  if (state === 'new') {
    sheet.open({ draft: emptyDraft('#4f6bed'), mode: 'saved' })
  } else if (state === 'errors') {
    sheet.open({
      draft: {
        ...emptyDraft('#4f6bed'),
        id: 'Tiem Tra!',
        idFollowsName: false,
        urls: ['ftp://tiemtra.vn'],
      },
      mode: 'saved',
    })
    window.setTimeout(
      () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', metaKey: true })),
      500,
    )
  } else if (state === 'warnings') {
    const draft = saved()
    draft.urls = [
      'https://tiemtra.vn',
      'https://tiemtra.vn',
      'http://localhost:3000',
      'http://10.0.0.5/health',
      'http://169.254.10.2',
    ]
    draft.parts = [
      ...draft.parts,
      { key: newKey('p'), role: 'be', host: 'vps-sg-2', kind: 'compose', project: 'tiemtra-api' },
      {
        key: newKey('p'),
        role: 'worker',
        host: 'vps-old',
        kind: 'pm2',
        app: 'tiemtra-cron',
        pm2Home: null,
      },
    ]
    sheet.open({ draft, mode: 'saved' })
  } else if (state === 'replaces') {
    const draft = saved()
    draft.isNew = true
    draft.idFollowsName = false
    sheet.open({ draft, mode: 'setup', onSave: () => undefined, onRemove: () => undefined })
  } else {
    sheet.open({ draft: saved(), mode: 'saved' })
  }
})
</script>

<template>
  <OverviewView />
</template>
