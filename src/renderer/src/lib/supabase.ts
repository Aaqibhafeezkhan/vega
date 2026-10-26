import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Browser-side Supabase client. Uses only the public anon key; all data access is gated by Row Level
 * Security. Null when the build has no credentials, in which case Vega runs fully local (no accounts).
 */
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
      })
    : null

export const cloudEnabled = supabase !== null
