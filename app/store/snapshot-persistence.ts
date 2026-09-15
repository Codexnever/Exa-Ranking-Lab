import type { StateStorage } from 'zustand/middleware'

/** Only this regenerable cache's page-size preference survives a reload. */
export function snapshotPreferences(value: unknown) {
  const pagination = value && typeof value === 'object' && 'pagination' in value
    ? value.pagination : undefined
  const size = pagination && typeof pagination === 'object' && 'itemsPerPage' in pagination
    ? pagination.itemsPerPage : undefined
  return { pagination: { itemsPerPage: typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= 100 ? size : 20 } }
}

/** Fail open even when storage is disabled or the origin's shared quota is full. */
export function createSnapshotStorage(getStorage: () => Storage | undefined): StateStorage {
  let lastAttempt: string | undefined
  let warned = false
  return {
    getItem(key) {
      try {
        const raw = getStorage()?.getItem(key)
        if (!raw) return null
        lastAttempt = undefined
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return null
        // Never hydrate old arrays, ownership, freshness or loading flags.
        return JSON.stringify({ state: snapshotPreferences(parsed.state), version: 0 })
      } catch { return null }
    },
    setItem(key, value) {
      if (value === lastAttempt) return
      lastAttempt = value
      try {
        if (value.length > 1024) throw new Error('Snapshot preference size exceeded')
        getStorage()?.setItem(key, value)
      } catch {
        if (!warned) console.warn('[SnapshotsStore] Browser preferences unavailable; snapshot data remains in memory.')
        warned = true
      }
    },
    removeItem(key) {
      lastAttempt = undefined
      try { getStorage()?.removeItem(key) } catch { /* optional cache only */ }
    },
  }
}
