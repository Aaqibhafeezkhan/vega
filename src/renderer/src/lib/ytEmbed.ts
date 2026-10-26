/**
 * YouTube's official embedded player, driven through the IFrame API. Web only: desktop resolves real streams with yt-dlp.
 * The iframe is kept out of sight (see .yt-embed in theme-d.css); the app owns all the controls.
 */

interface YtPlayer {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  seekTo(sec: number, allowSeekAhead: boolean): void
  setVolume(v: number): void
  getCurrentTime(): number
  getDuration(): number
  stopVideo(): void
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YtPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

export type EmbedState = 'playing' | 'paused' | 'ended' | 'buffering'
export interface EmbedHandlers {
  state(s: EmbedState): void
  /** 101/150: the owner blocks embedding; others: network or unknown */
  error(code: number): void
}

const STATE: Record<number, EmbedState | undefined> = { 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering' }

let apiReady: Promise<void> | null = null
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  apiReady ??= new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => {
      apiReady = null
      reject(new Error('YouTube player blocked'))
    }
    document.head.appendChild(s)
  })
  return apiReady
}

class YtEmbed {
  private player: YtPlayer | null = null
  private host: HTMLElement | null = null
  private handlers: EmbedHandlers | null = null
  private volume = 80
  private pending: { resolve: () => void; reject: (e: Error) => void } | null = null

  setHandlers(h: EmbedHandlers): void {
    this.handlers = h
  }

  private mount(): HTMLElement {
    if (!this.host) {
      this.host = document.createElement('div')
      this.host.className = 'yt-embed'
      this.host.innerHTML = '<div class="yt-embed-target"></div>'
      document.body.appendChild(this.host)
    }
    return this.host
  }

  private async ensure(videoId: string): Promise<YtPlayer> {
    await loadApi()
    const host = this.mount()
    host.dataset.on = '1'
    if (this.player) return this.player
    return new Promise<YtPlayer>((resolve) => {
      const player = new window.YT!.Player(host.querySelector('.yt-embed-target') as HTMLElement, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 },
        events: {
          onReady: () => {
            this.player = player
            player.setVolume(this.volume)
            resolve(player)
          },
          onStateChange: (e: { data: number }) => {
            const s = STATE[e.data]
            if (!s) return
            if (s === 'playing' && this.pending) {
              this.pending.resolve()
              this.pending = null
            }
            this.handlers?.state(s)
          },
          onError: (e: { data: number }) => {
            if (this.pending) {
              this.pending.reject(new Error(`embed error ${e.data}`))
              this.pending = null
            }
            this.handlers?.error(e.data)
          }
        }
      })
    })
  }

  /** Starts a video; resolves once it is actually playing, rejects on an embed error or after 15 s. */
  async load(videoId: string): Promise<void> {
    const first = !this.player
    const started = new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject }
      setTimeout(() => {
        if (this.pending?.reject === reject) {
          this.pending = null
          reject(new Error('embed timeout'))
        }
      }, 15_000)
    })
    const p = await this.ensure(videoId)
    if (!first) p.loadVideoById(videoId)
    await started
  }

  play(): void {
    this.player?.playVideo()
  }
  pause(): void {
    this.player?.pauseVideo()
  }
  seek(sec: number): void {
    this.player?.seekTo(sec, true)
  }
  setVolume(v01: number): void {
    this.volume = Math.round(v01 * 100)
    this.player?.setVolume(this.volume)
  }
  time(): number {
    return this.player?.getCurrentTime() ?? 0
  }
  duration(): number {
    return this.player?.getDuration() ?? 0
  }
  /** Leaves embed mode (another source is playing): stop and hide the card. */
  stop(): void {
    this.pending = null
    this.player?.stopVideo()
    if (this.host) delete this.host.dataset.on
  }
}

export const ytEmbed = new YtEmbed()
