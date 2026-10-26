import { describe, expect, it } from 'vitest'
import { detectPlatform, isNewer, pickAssets } from './downloads'

describe('downloads', () => {
  it('detects the visitor platform', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe('windows')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605')).toBe('other')
  })

  it('finds the exe and apk in a release', () => {
    const d = pickAssets({
      tag_name: 'v0.4.6',
      assets: [
        { name: 'latest.yml', browser_download_url: 'a' },
        { name: 'Vega-Setup-0.4.6.exe', browser_download_url: 'https://x/Vega-Setup-0.4.6.exe' },
        { name: 'Vega-Setup-0.4.6.exe.blockmap', browser_download_url: 'b' },
        { name: 'Vega-v0.4.6.apk', browser_download_url: 'https://x/Vega-v0.4.6.apk' }
      ]
    })
    expect(d).toMatchObject({ version: '0.4.6', windows: 'https://x/Vega-Setup-0.4.6.exe', android: 'https://x/Vega-v0.4.6.apk' })
  })

  it('has no apk when the release lacks one', () => {
    expect(pickAssets({ tag_name: 'v0.4.5', assets: [{ name: 'Vega-Setup-0.4.5.exe', browser_download_url: 'u' }] }).android).toBeNull()
  })

  it('compares versions', () => {
    expect(isNewer('0.4.8', '0.4.7')).toBe(true)
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('0.4.7', '0.4.7')).toBe(false)
    expect(isNewer('0.4.6', '0.4.7')).toBe(false)
  })
})
