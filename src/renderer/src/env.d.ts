/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 'off' = no cloud (set by `npm run dev:agent`) */
  readonly VITE_CLOUD?: string
}
