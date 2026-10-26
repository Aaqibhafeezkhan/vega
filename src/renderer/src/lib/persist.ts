export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`vega:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Debounced write so rapid updates (play logs) hit storage once. */
export function save(key: string, value: unknown): void {
  clearTimeout(timers.get(key))
  timers.set(
    key,
    setTimeout(() => {
      try {
        localStorage.setItem(`vega:${key}`, JSON.stringify(value))
      } catch (err) {
        console.warn('persist failed', key, err)
      }
    }, 300)
  )
}
