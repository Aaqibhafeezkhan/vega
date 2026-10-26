import { AnimatePresence, motion } from 'framer-motion'
import { useUi, type Panel } from '@/store/ui'
import { IconButton } from './Controls'
import { LyricsMatchPanel } from './LyricsMatchPanel'
import { SettingsPanel } from './SettingsPanel'

const TITLES: Record<Exclude<Panel, 'none'>, string> = { settings: 'Lyrics settings', lyrics: 'Lyrics match' }

export function SidePanel() {
  const panel = useUi((s) => s.panel)
  const setPanel = useUi((s) => s.setPanel)

  return (
    <AnimatePresence>
      {panel !== 'none' && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPanel('none')}
          />
          <motion.aside
            key="panel"
            className="sidepanel"
            role="dialog"
            aria-label={TITLES[panel]}
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          >
            <header className="sidepanel__head">
              <h3>{TITLES[panel]}</h3>
              <IconButton icon="close" label="Close panel" size={16} onClick={() => setPanel('none')} />
            </header>
            <div className="sidepanel__body">
              {panel === 'settings' && <SettingsPanel />}
              {panel === 'lyrics' && <LyricsMatchPanel />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
