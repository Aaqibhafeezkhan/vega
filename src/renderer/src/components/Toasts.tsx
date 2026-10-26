import { useUi } from '@/store/ui'
import { Icon } from './Icon'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'close' : t.kind === 'ok' ? 'check' : 'spark'} size={16} />
          {t.text}
        </div>
      ))}
    </div>
  )
}
