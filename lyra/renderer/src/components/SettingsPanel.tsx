import { useState } from 'react'
import type { Settings } from '@shared/types'
import { useBackgroundVersion } from '@/hooks/useBackground'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <div className="srow__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="srow__ctl">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <i />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ v: T; label: string }>; onChange(v: T): void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Slider({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange(v: number): void; label: string; format(v: number): string }) {
  return (
    <div className="sl">
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format(value)}</output>
    </div>
  )
}

function BackgroundSection() {
  const s = useSettings((x) => x.settings)
  const set = useSettings((x) => x.set)
  const track = usePlayer((x) => x.snapshot?.track ?? null)
  const bump = useBackgroundVersion((x) => x.bump)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const videoOn = s.backgroundStyle !== 'still'
  const motionBlocked = s.reducedMotion === 'on' || (s.reducedMotion === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const run = async (fn: () => Promise<{ ok: boolean; error?: string } | void>): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      if (r && !r.ok && r.error) setMsg(r.error)
      bump()
    } catch {
      setMsg('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4>Background</h4>
      <Row label="Video background" hint="The song's music video plays softly behind the lyrics when one is found; otherwise animated cover art.">
        <Toggle label="Video background" checked={videoOn} onChange={(v) => set({ backgroundStyle: v ? 'auto' : 'still' })} />
      </Row>
      {videoOn && motionBlocked && (
        <Row label="Reduce motion is on" hint="Videos can't play while it is on">
          <button type="button" className="pill" onClick={() => set({ reducedMotion: 'off' })}>
            Turn it off
          </button>
        </Row>
      )}
      {videoOn && (
        <>
          <Row label="Dim" hint="Keeps lyrics readable over video">
            <Slider label="Background dim" value={s.backgroundDim} min={0.2} max={0.9} step={0.02} onChange={(v) => set({ backgroundDim: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </Row>
          <Row label="Auto dim" hint="Darkens bright scenes, eases off on dark ones">
            <Toggle label="Auto dim" checked={s.autoDim} onChange={(v) => set({ autoDim: v })} />
          </Row>
          <Row label="Your file for all songs" hint={s.customBackground ? s.customBackground.name : 'A video or image of your own'}>
            <button type="button" className="pill" disabled={busy} onClick={() => void run(() => window.lyra.background.pick('global'))}>
              {s.customBackground ? 'Change' : 'Choose'}
            </button>
            {s.customBackground && (
              <button type="button" className="pill" disabled={busy} onClick={() => void run(() => window.lyra.background.clear('global'))}>
                Remove
              </button>
            )}
          </Row>
          <Row label="This song" hint={track ? `${track.title}: a file just for this track` : 'Play a song first'}>
            <button type="button" className="pill" disabled={busy || !track} onClick={() => track && void run(() => window.lyra.background.pick('song', track.id))}>
              Choose
            </button>
            <button type="button" className="pill" disabled={busy || !track} onClick={() => track && void run(() => window.lyra.background.clear('song', track.id))}>
              Remove
            </button>
          </Row>
        </>
      )}
      {msg && (
        <small role="alert" style={{ color: 'var(--danger, #ff8a8a)' }}>
          {msg}
        </small>
      )}
    </section>
  )
}

export function SettingsPanel() {
  const s = useSettings((x) => x.settings)
  const set = useSettings((x) => x.set)
  const up =
    <K extends keyof Settings>(k: K) =>
    (v: Settings[K]): void =>
      void set({ [k]: v } as Partial<Settings>)

  return (
    <div className="settings" data-nodrag>
      <section>
        <h4>Lyrics</h4>
        <Row label="Word by word" hint="Highlights each word as it is sung (timing is estimated)">
          <Toggle label="Word by word" checked={s.wordByWord} onChange={up('wordByWord')} />
        </Row>
        <Row label="Romanized lyrics" hint="Roman-letter reading under Hindi and Punjabi lyrics">
          <Toggle label="Romanized lyrics" checked={s.romanizeLyrics} onChange={up('romanizeLyrics')} />
        </Row>
        <Row label="Typeface">
          <Segmented
            label="Typeface"
            value={s.lyricFont}
            onChange={up('lyricFont')}
            options={[
              { v: 'sans', label: 'Sans' },
              { v: 'serif', label: 'Serif' },
              { v: 'rounded', label: 'Round' },
              { v: 'mono', label: 'Mono' }
            ]}
          />
        </Row>
        <Row label="Size">
          <Slider label="Lyric size" value={s.lyricFontSize} min={24} max={72} step={2} onChange={up('lyricFontSize')} format={(v) => `${v}px`} />
        </Row>
        <Row label="Line spacing">
          <Slider label="Line spacing" value={s.lineSpacing} min={1} max={2} step={0.05} onChange={up('lineSpacing')} format={(v) => v.toFixed(2)} />
        </Row>
        <Row label="Animation">
          <Segmented
            label="Lyric animation"
            value={s.lyricAnimation}
            onChange={up('lyricAnimation')}
            options={[
              { v: 'glide', label: 'Glide' },
              { v: 'focus', label: 'Focus' },
              { v: 'fade', label: 'Fade' }
            ]}
          />
        </Row>
        <Row label="Default sync offset" hint="Fine-tune per song under the lyrics">
          <Slider label="Sync offset" value={s.lyricOffsetMs} min={-3000} max={3000} step={50} onChange={up('lyricOffsetMs')} format={(v) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(2)}s`} />
        </Row>
      </section>

      <section>
        <h4>Look</h4>
        <Row label="Colours">
          <Segmented
            label="Colours"
            value={s.theme === 'light' ? 'adaptive' : s.theme}
            onChange={up('theme')}
            options={[
              { v: 'adaptive', label: 'From artwork' },
              { v: 'dark', label: 'Plain dark' }
            ]}
          />
        </Row>
        <Row label="Reduce motion">
          <Segmented
            label="Reduce motion"
            value={s.reducedMotion}
            onChange={up('reducedMotion')}
            options={[
              { v: 'system', label: 'System' },
              { v: 'on', label: 'On' },
              { v: 'off', label: 'Off' }
            ]}
          />
        </Row>
      </section>

      <BackgroundSection />
    </div>
  )
}
