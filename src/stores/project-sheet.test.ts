import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyDraft } from '@/lib/setup-model'
import { useProjectSheetStore } from './project-sheet'

beforeEach(() => setActivePinia(createPinia()))

describe('project sheet store', () => {
  it('opens with a request and closes, keeping the request while it fades', () => {
    const sheet = useProjectSheetStore()
    expect(sheet.isOpen).toBe(false)
    const request = { draft: emptyDraft(null), mode: 'saved' as const }
    sheet.open(request)
    expect(sheet.isOpen).toBe(true)
    expect(sheet.request).toBe(request)
    sheet.close()
    expect(sheet.isOpen).toBe(false)
    expect(sheet.request).toBe(request)
  })

  it('opens again with another request', () => {
    const sheet = useProjectSheetStore()
    sheet.open({ draft: emptyDraft(null), mode: 'saved' })
    const second = { draft: emptyDraft('#4f6bed'), mode: 'setup' as const, onSave: () => undefined }
    sheet.open(second)
    expect(sheet.request).toBe(second)
  })
})
