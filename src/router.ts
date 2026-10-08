import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import AiFindingsView from '@/features/ai/findings/AiFindingsView.vue'
import OverviewView from '@/features/overview/OverviewView.vue'
import ScanHistoryView from '@/features/history/ScanHistoryView.vue'
import ProjectView from '@/features/project/ProjectView.vue'
import ServerView from '@/features/server/ServerView.vue'
import SettingsView from '@/features/settings/SettingsView.vue'
import DiscoverView from '@/features/setup/DiscoverView.vue'
import GroupView from '@/features/setup/GroupView.vue'
import PickHostsView from '@/features/setup/PickHostsView.vue'
import SetupView from '@/features/setup/SetupView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'overview', component: OverviewView },
  { path: '/history', name: 'history', component: ScanHistoryView },
  { path: '/ai/findings', name: 'ai-findings', component: AiFindingsView },
  { path: '/project/:id/:tab?', name: 'project', component: ProjectView },
  { path: '/server/:host', name: 'server', component: ServerView },
  {
    path: '/settings/:section?',
    name: 'settings',
    component: SettingsView,
    meta: { settings: true },
  },
  {
    path: '/setup',
    component: SetupView,
    meta: { setup: true },
    children: [
      {
        path: '',
        name: 'setup-pick',
        component: PickHostsView,
        meta: { setup: true, screen: 'pick' },
      },
      {
        path: 'discover',
        name: 'setup-discover',
        component: DiscoverView,
        meta: { setup: true, screen: 'discover' },
      },
      {
        path: 'group',
        name: 'setup-group',
        component: GroupView,
        meta: { setup: true, screen: 'group' },
      },
    ],
  },
  // The component gallery exists in development only; the production bundle drops it.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/gallery',
          name: 'gallery',
          component: () => import('@/features/dev/gallery/GalleryView.vue'),
          meta: { bare: true },
        } satisfies RouteRecordRaw,
        {
          path: '/dev/sheet',
          name: 'dev-sheet',
          component: () => import('@/features/project-sheet/DevSheetView.vue'),
        } satisfies RouteRecordRaw,
        {
          path: '/dev/payload',
          name: 'dev-payload',
          component: () => import('@/features/ai/payload/DevPayloadView.vue'),
        } satisfies RouteRecordRaw,
      ]
    : []),
  { path: '/:rest(.*)*', redirect: '/' },
]

/** A hash router: the app loads from a file-like origin, with no server to rewrite paths. */
export function createAppRouter(history = createWebHashHistory()) {
  return createRouter({ history, routes })
}
