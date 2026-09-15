/** One panel's saved-event requests, scoped by user and endpoint. No global cache. */
export class DetectorEventRequests<T> {
  private key: string | null = null
  private pending?: Promise<T>
  private saved?: { value: T; at: number }

  clear(): void { this.key = null; this.pending = undefined; this.saved = undefined }

  load(key: string, loader: () => Promise<T>, force = false): Promise<T> {
    if (key !== this.key) { this.clear(); this.key = key }
    if (this.pending) return this.pending
    if (!force && this.saved && Date.now() - this.saved.at < 60_000) return Promise.resolve(this.saved.value)
    const request = Promise.resolve().then(loader).then(value => {
      if (this.pending === request) this.saved = { value, at: Date.now() }
      return value
    }).finally(() => { if (this.pending === request) this.pending = undefined })
    this.pending = request
    return request
  }
}
