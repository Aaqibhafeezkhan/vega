import { create } from 'zustand'
import { load, save } from '@/lib/persist'
import { setYtmLanguage, YTM_LANGUAGES, type YtmLanguage } from '@providers/ytm'

interface LangState {
  lang: YtmLanguage
  setLang: (l: YtmLanguage) => void
}

const stored = load<string>('lang', 'Hindi')
const initial = (YTM_LANGUAGES as readonly string[]).includes(stored) ? (stored as YtmLanguage) : 'Hindi'
setYtmLanguage(initial)

export const useLang = create<LangState>((set) => ({
  lang: initial,
  setLang: (lang) => {
    save('lang', lang)
    setYtmLanguage(lang)
    set({ lang })
  }
}))
export { YTM_LANGUAGES }
