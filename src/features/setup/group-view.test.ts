// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { vEnter } from '@/lib/motion'
import { useSetupStore } from '@/stores/setup'
import { useSetupDraftsStore } from '@/stores/setup-drafts'
import GroupView from './GroupView.vue'

function seed() {
  const setup = useSetupStore()
  setup.result = {
    hosts: [],
    proposal: {
      projects: [
        {
          id: 'shop',
          name: 'shop',
          urls: ['https://shop.example'],
          components: [
            { role: 'be', host: 'h1', kind: 'path', path: '/var/www/shop' },
            { role: 'db', host: 'h1', kind: 'db', engine: 'mysql', env_file: '/var/www/shop/.env' },
          ],
          env_files: [{ host: 'h1', path: '/var/www/shop/.env', readable: true }],
        },
        {
          id: 'blog',
          name: 'blog',
          urls: ['https://blog.example'],
          components: [{ role: 'be', host: 'h1', kind: 'path', path: '/var/www/blog' }],
          env_files: [],
        },
      ],
      unassigned: [
        {
          host: 'h1',
          item: {
            rec: 'pm2',
            app: 'jobs',
            home: '/h',
            default: true,
            instances: 1,
            status: 'online',
          },
        },
      ],
    },
  }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = mount(GroupView, {
    attachTo: document.body,
    global: { plugins: [i18n, router], directives: { enter: vEnter }, stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockCommands((cmd) => {
    if (cmd === 'projects_validate') return []
    throw new Error(`unexpected command ${cmd}`)
  })
  seed()
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Group projects screen', () => {
  it('puts the project that needs a database name first and keeps its editor while typing', async () => {
    const wrapper = await mountView()
    const cards = wrapper.findAll('article')
    expect(cards[0]?.attributes('data-testid')).toBe('card-shop')
    expect(wrapper.find('[data-testid="needs-name"]').exists()).toBe(true)

    await wrapper.get('[data-testid="db-name"] input').setValue('shop_prod')
    expect(
      wrapper
        .find('[data-testid="db-editor-' + useSetupDraftsStore().drafts[0]?.parts[1]?.key + '"]')
        .exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="needs-name"]').exists()).toBe(false)
    expect(wrapper.findAll('article')[0]?.attributes('data-testid')).toBe('card-shop')
  })

  it('folds a finished project to one summary line and opens it on click', async () => {
    const wrapper = await mountView()
    const blog = wrapper.get('[data-testid="card-blog"]')
    expect(blog.find('[data-testid="folded"]').text()).toContain('all 1 part ok')
    await blog.get('[data-testid="toggle"]').trigger('click')
    expect(blog.find('[data-testid="folded"]').exists()).toBe(false)
  })

  it('lists leftovers and adds one to a project', async () => {
    const wrapper = await mountView()
    const store = useSetupDraftsStore()
    expect(wrapper.text()).toContain('jobs')
    store.addToProject(store.loose[0]!, store.drafts[1]!.key)
    await flushPromises()
    expect(wrapper.find('[data-testid="loose-empty"]').exists()).toBe(true)
  })

  it('shows the empty state when nothing was found', async () => {
    useSetupStore().result = { hosts: [], proposal: { projects: [], unassigned: [] } }
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="group-empty"]').exists()).toBe(true)
  })
})
