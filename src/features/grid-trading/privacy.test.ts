import { expect, it, vi } from 'vitest'
import { syncGridRecords, loadSyncConfig } from './cloudSync'
import { GRID_RECORDS_KEY, GRID_SYNC_CONFIG_KEY, removeRecords } from './repository'
it('keeps unrelated site data intact and makes no cloud request in local mode', async () => {
  localStorage.clear()
  localStorage.setItem('unrelated-project-records', '[{"id":"friend"}]')
  const request = vi.fn()
  expect(loadSyncConfig()).toBeNull()
  expect(localStorage.getItem(GRID_SYNC_CONFIG_KEY)).toBeNull()
  await syncGridRecords([], loadSyncConfig(), request, () => true)
  removeRecords([])
  expect(request).not.toHaveBeenCalled()
  expect(localStorage.getItem('unrelated-project-records')).toBe('[{"id":"friend"}]')
  expect(localStorage.getItem(GRID_RECORDS_KEY)).toContain('schemaVersion')
})
