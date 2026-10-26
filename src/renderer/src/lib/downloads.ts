/** Which Vega app to offer on the web: Windows installer or Android APK, picked from the visitor's device. */

export type Platform = 'android' | 'windows' | 'other'

export function detectPlatform(ua = navigator.userAgent): Platform {
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua)) return 'windows'
  return 'other'
}

export interface Downloads {
  version: string
  windows: string | null
  android: string | null
  page: string
}

const REPO = 'DhruvHarani1/vega'
const PAGE = `https://github.com/${REPO}/releases/latest`

export function pickAssets(release: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] }): Downloads {
  const assets = release.assets ?? []
  const url = (re: RegExp): string | null => assets.find((a) => re.test(a.name))?.browser_download_url ?? null
  return { version: (release.tag_name ?? '').replace(/^v/, ''), windows: url(/\.exe$/i), android: url(/\.apk$/i), page: PAGE }
}

let cached: Promise<Downloads> | null = null

/** Newest release's installer links (GitHub's public API; one request per page load). */
export function fetchDownloads(): Promise<Downloads> {
  cached ??= fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(pickAssets)
    .catch(() => ({ version: '', windows: null, android: null, page: PAGE }))
  return cached
}
