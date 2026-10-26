import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { load, save } from '@/lib/persist'
import { AUTH_REDIRECT, cloudEnabled, supabase } from '@/lib/supabase'
import { syncOnce } from '@/lib/sync'
import { useLibrary } from './library'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error'

interface AuthState {
  enabled: boolean
  ready: boolean
  user: User | null
  sync: SyncState
  syncError: string | null
  lastSync: number | null
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsConfirm: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  syncNow: () => Promise<void>
}

const SYNC_DEBOUNCE_MS = 4000
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null

export const useAuth = create<AuthState>((set, get) => {
  const runSync = (): Promise<void> => {
    const user = get().user
    if (!supabase || !user) return Promise.resolve()
    if (running) return running
    set({ sync: 'syncing', syncError: null })
    running = syncOnce(supabase, user.id)
      .then(() => set({ sync: 'synced', lastSync: Date.now() }))
      .catch((err: unknown) => set({ sync: 'error', syncError: err instanceof Error ? err.message : String(err) }))
      .finally(() => {
        running = null
      })
    return running
  }

  const schedule = (): void => {
    if (!get().user) return
    clearTimeout(timer)
    timer = setTimeout(() => void runSync(), SYNC_DEBOUNCE_MS)
  }

  const onUser = async (user: User | null): Promise<void> => {
    set({ user, ready: true })
    if (!user) return
    // A different account signing in on this device must not inherit the previous account's data.
    const owner = load<string | null>('sync.owner', null)
    if (owner && owner !== user.id) useLibrary.getState().wipeSynced()
    save('sync.owner', user.id)
    await runSync()
  }

  if (supabase) {
    void supabase.auth.getSession().then(({ data }) => onUser(data.session?.user ?? null))
    supabase.auth.onAuthStateChange((event, session: Session | null) => {
      // do not await supabase calls inside this callback (deadlock risk): defer to the next tick
      setTimeout(() => {
        if (event === 'SIGNED_IN' && get().user?.id !== session?.user.id) void onUser(session?.user ?? null)
        else if (event === 'SIGNED_OUT') set({ user: null, sync: 'idle', lastSync: null })
        else if (event === 'USER_UPDATED') set({ user: session?.user ?? null })
      }, 0)
    })
    useLibrary.subscribe(schedule)
    window.addEventListener('online', schedule)
    window.addEventListener('focus', () => {
      if (get().user && Date.now() - (get().lastSync ?? 0) > 60_000) schedule()
    })
  }

  return {
    enabled: cloudEnabled,
    ready: !supabase,
    user: null,
    sync: 'idle',
    syncError: null,
    lastSync: null,

    signUp: async (email, password, displayName) => {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { data: displayName ? { display_name: displayName } : undefined, emailRedirectTo: AUTH_REDIRECT }
      })
      if (error) throw error
      return { needsConfirm: !data.session }
    },

    signIn: async (email, password) => {
      const { error } = await supabase!.auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    signOut: async () => {
      clearTimeout(timer)
      await supabase!.auth.signOut()
    },

    resetPassword: async (email) => {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT })
      if (error) throw error
    },

    syncNow: runSync
  }
})
