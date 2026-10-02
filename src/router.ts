import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import OverviewView from '@/features/overview/OverviewView.vue'
import PlaceholderView from '@/features/placeholder/PlaceholderView.vue'
import ProjectView from '@/features/project/ProjectView.vue'
import SettingsView from '@/features/settings/SettingsView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'overview', component: OverviewView },
  {
    path: '/history',
    name: 'history',
    component: PlaceholderView,
    meta: { titleKey: 'nav.history' },
  },
  { path: '/project/:id/:tab?', name: 'project', component: ProjectView },
  { path: '/server/:host', name: 'server', component: PlaceholderView },
  {
    path: '/settings/:section?',
    name: 'settings',
    component: SettingsView,
    meta: { settings: true },
  },
  { path: '/:rest(.*)*', redirect: '/' },
]

/** A hash router: the app loads from a file-like origin, with no server to rewrite paths. */
export function createAppRouter(history = createWebHashHistory()) {
  return createRouter({ history, routes })
}
