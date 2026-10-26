import { useEffect } from 'react'
import { BANDS, MAX_GAIN, PRESETS, useEq } from '@/lib/eq'
import { useUi } from '@/store/ui'

const label = (f: number): string => (f >= 1000 ? `${f / 1000}k` : String(f))

/** Ten-band equalizer popover (desktop). Gains are in dB; the signal is lowered by the largest boost to avoid clipping. */
export function EqPanel() {
  const { enabled, gains, preset, setEnabled, setGain, setPreset } = useEq()
  const close = useUi((s) => s.setEqOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <>
      <div className="menu-scrim" onClick={() => close(false)} />
      <div className="eq-panel" role="dialog" aria-label="Equalizer">
        <div className="eq-head">
          <h3>Equalizer</h3>
          <select className="narrow-select" value={PRESETS[preset] ? preset : 'Custom'} onChange={(e) => setPreset(e.target.value)} aria-label="Preset">
            {preset === 'Custom' && <option value="Custom">Custom</option>}
            {Object.keys(PRESETS).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="switch" title={enabled ? 'On' : 'Off'}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label="Equalizer on" />
            <span />
          </label>
        </div>
        <div className={`eq-bands${enabled ? '' : ' off'}`}>
          {BANDS.map((f, i) => (
            <div key={f} className="eq-band">
              <span className="eq-db">{gains[i]! > 0 ? '+' : ''}{gains[i]}</span>
              <input
                type="range"
                className="eq-slider"
                min={-MAX_GAIN}
                max={MAX_GAIN}
                step={1}
                value={gains[i]}
                onChange={(e) => setGain(i, Number(e.target.value))}
                aria-label={`${label(f)} Hz`}
              />
              <span className="eq-hz">{label(f)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
