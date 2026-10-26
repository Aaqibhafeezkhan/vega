import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { findActiveLine } from '@shared/lrc'
import { romanizeLyrics } from '@shared/lyrics/romanize'
import { estimateWords } from '@shared/wordTiming'
import type { LyricLine, LyricsResult, Track } from '@shared/types'
import { OFFSET_STEP_MS, useLyrics } from '@/store/lyrics'
import { getPosition, usePlayer } from '@/store/player'
import { Icon } from './Icon'

const RESUME_AFTER_MS = 6000
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export type LyricsVariant = 'panel' | 'full' | 'karaoke'

/** Index of the active line, re-rendering only when it changes (checked ~12x/s). */
function useActiveLine(lines: readonly LyricLine[], offsetMs: number): number {
  const [idx, setIdx] = useState(() => findActiveLine(lines, getPosition() + offsetMs))
  const ref = useRef(lines)
  ref.current = lines
  useEffect(() => {
    const tick = (): void => {
      if (document.visibilityState === 'hidden') return
      const next = findActiveLine(ref.current, getPosition() + offsetMs)
      setIdx((cur) => (cur === next ? cur : next))
    }
    tick()
    const t = setInterval(tick, 80)
    return () => clearInterval(t)
  }, [offsetMs, lines])
  return idx
}

export function LyricsView({ track, variant }: { track: Track | null; variant: LyricsVariant }) {
  const state = useLyrics((s) => s.state)
  const ensure = useLyrics((s) => s.ensure)
  const retry = useLyrics((s) => s.retry)

  useEffect(() => ensure(track), [track, ensure])

  let body: React.ReactNode = null
  if (!track) body = <Message title="Nothing playing" body="Play a song to see its lyrics." />
  else if (state.phase === 'loading' || state.phase === 'idle') body = <Skeleton />
  else {
    const r = state.result
    if (r.status === 'synced') body = <Synced key={r.trackKey} result={r} track={track} variant={variant} />
    else if (r.status === 'plain') body = <Plain key={r.trackKey} result={r} />
    else if (r.status === 'instrumental') body = <Message title="Instrumental" body="This track has no vocals. Enjoy the music." />
    else if (r.status === 'error')
      body = (
        <Message
          title={r.error?.kind === 'rate-limit' ? 'Lyrics service is busy' : 'Could not load lyrics'}
          body={r.error?.message ?? 'Something went wrong.'}
          action={r.error?.retryable === false ? undefined : { label: 'Try again', run: () => retry(track) }}
        />
      )
    else body = <Message title="No lyrics for this track" body="No match was found. The song may be too new or listed under another title." action={{ label: 'Search again', run: () => retry(track) }} />
  }

  return (
    <div className={`lyrics lyrics--${variant}`}>
      <div className="lyrics__stage">{body}</div>
      {track && state.phase === 'ready' && (state.result.status === 'synced' || state.result.status === 'plain') && <Footer result={state.result} track={track} />}
    </div>
  )
}

function Synced({ result, track, variant }: { result: LyricsResult; track: Track; variant: LyricsVariant }) {
  const wordByWord = useLyrics((s) => s.wordByWord)
  const romanize = useLyrics((s) => s.romanize)
  const offset = useLyrics((s) => s.offsets[result.trackKey] ?? 0)
  const lines = useMemo(() => (wordByWord && !result.wordSynced ? estimateWords(result.lines, track.durationMs) : result.lines), [wordByWord, result, track.durationMs])
  const active = useActiveLine(lines, offset)
  const seek = usePlayer((s) => s.seek)
  const scroller = useRef<HTMLDivElement>(null)
  const refs = useRef<Array<HTMLDivElement | null>>([])
  const follow = useRef(true)
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [browsing, setBrowsing] = useState(false)

  const scrollToActive = useCallback(
    (instant = false) => {
      const box = scroller.current
      const el = refs.current[Math.max(0, active)]
      if (!box || !el) return
      const anchor = variant === 'karaoke' ? 0.42 : 0.34
      box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight * anchor + el.offsetHeight / 2), behavior: instant ? 'auto' : 'smooth' })
    },
    [active, variant]
  )

  useLayoutEffect(() => {
    if (follow.current) scrollToActive(active < 0)
  }, [active, scrollToActive])

  useEffect(() => () => clearTimeout(resumeTimer.current), [])

  const resume = useCallback(() => {
    clearTimeout(resumeTimer.current)
    follow.current = true
    setBrowsing(false)
    scrollToActive()
  }, [scrollToActive])

  const userScrolled = (): void => {
    follow.current = false
    setBrowsing(true)
    clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(resume, RESUME_AFTER_MS)
  }

  return (
    <>
      <div ref={scroller} className="lyrics__scroller" onWheel={userScrolled} onTouchMove={userScrolled} tabIndex={-1}>
        <div className="lyrics__inner">
          {lines.map((line, i) => (
            <Row
              key={i}
              line={line}
              dist={i - active}
              nextTime={lines[i + 1]?.timeMs}
              offset={offset}
              romanize={romanize}
              onSeek={() => seek(Math.max(0, line.timeMs - offset))}
              ref={(el) => {
                refs.current[i] = el
              }}
            />
          ))}
        </div>
      </div>
      {browsing && (
        <button type="button" className="pill lyrics__return" onClick={resume}>
          <Icon name="next" size={12} /> Current line
        </button>
      )}
    </>
  )
}

interface RowProps {
  line: LyricLine
  dist: number
  nextTime: number | undefined
  offset: number
  romanize: boolean
  onSeek(): void
  ref: React.Ref<HTMLDivElement>
}

const Row = memo(function Row({ line, dist, nextTime, offset, romanize, onSeek, ref }: RowProps) {
  const isActive = dist === 0
  const gap = line.text === ''
  const roman = romanize && line.text ? romanizeLyrics(line.text) : ''
  return (
    <div ref={ref} className={`lyric ${isActive ? 'is-active' : dist < 0 ? 'is-past' : 'is-next'}${gap ? ' is-gap' : ''}`} data-dist={Math.min(Math.abs(dist), 6)} aria-current={isActive ? 'true' : undefined}>
      {gap ? (
        <span className="lyric__dots" aria-label="instrumental break">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <button type="button" className="lyric__text" tabIndex={-1} onClick={onSeek}>
          {isActive && line.words && line.words.length > 1 ? <WordLine line={line} nextTime={nextTime} offset={offset} /> : line.text}
          {roman && roman !== line.text && <span className="lyric__roman">{roman}</span>}
        </button>
      )}
    </div>
  )
})

/** Word-by-word highlight: writes a CSS variable per word each frame, no React re-renders. */
function WordLine({ line, nextTime, offset }: { line: LyricLine; nextTime: number | undefined; offset: number }) {
  const words = line.words!
  const spans = useRef<Array<HTMLSpanElement | null>>([])
  const end = line.endMs ?? nextTime ?? words[words.length - 1]!.timeMs + 1500

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const pos = getPosition() + offset
      for (let i = 0; i < words.length; i++) {
        const el = spans.current[i]
        if (!el) continue
        const start = words[i]!.timeMs
        const stop = Math.min(words[i + 1]?.timeMs ?? end, end)
        el.style.setProperty('--p', clamp((pos - start) / Math.max(1, stop - start), 0, 1).toFixed(3))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [words, end, offset])

  return (
    <>
      {words.map((w, i) => (
        <span
          key={i}
          className="word"
          ref={(el) => {
            spans.current[i] = el
          }}
        >
          {w.text}
        </span>
      ))}
    </>
  )
}

function Plain({ result }: { result: LyricsResult }) {
  const romanize = useLyrics((s) => s.romanize)
  const paragraphs = (result.plain ?? '').split(/\n{2,}/)
  return (
    <div className="lyrics__scroller lyrics__scroller--plain" tabIndex={-1}>
      <div className="lyrics__inner lyrics__inner--plain">
        <p className="lyrics__notice">These lyrics are not time-synced, so they will not follow the song.</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="plain__stanza">
            {p.split('\n').map((l, j) => (
              <span key={j} style={{ display: 'block' }}>
                {l}
                {romanize && romanizeLyrics(l) !== l && <span className="lyric__roman">{romanizeLyrics(l)}</span>}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="lyrics__skeleton" aria-busy="true" aria-label="Loading lyrics">
      {[62, 80, 54, 72, 44, 68].map((w, i) => (
        <i key={i} style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  )
}

function Message({ title, body, action }: { title: string; body: string; action?: { label: string; run(): void } }) {
  return (
    <div className="lyrics__message">
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button type="button" className="pill" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function Footer({ result, track }: { result: LyricsResult; track: Track }) {
  const offset = useLyrics((s) => s.offsets[result.trackKey] ?? 0)
  const nudge = useLyrics((s) => s.nudge)
  const wordByWord = useLyrics((s) => s.wordByWord)
  const synced = result.status === 'synced'
  const m = result.matched
  return (
    <div className="lyrics__footer">
      <span className="lyrics__source" title={m ? `Matched "${m.title}" by ${m.artist}` : undefined}>
        LRCLIB · {synced ? (result.wordSynced ? 'word-synced' : wordByWord ? 'words estimated' : 'line-synced') : 'plain text'}
      </span>
      {synced && (
        <span className="offset" title="Shift this song's lyrics earlier or later (remembered per song)">
          <button type="button" aria-label="Show lyrics later" onClick={() => nudge(track, -OFFSET_STEP_MS)}>
            −
          </button>
          <output>{offset === 0 ? 'sync' : `${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(2)}s`}</output>
          <button type="button" aria-label="Show lyrics earlier" onClick={() => nudge(track, OFFSET_STEP_MS)}>
            +
          </button>
        </span>
      )}
    </div>
  )
}
