import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Vega's own cloud project. The URL and the anon key are public by design (they ship in every web page and app build);
// every table is protected by Row Level Security, so users can only ever reach their own rows. Nothing to configure:
// accounts work out of the box. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to point a build at another project.
const DEFAULT_URL = 'https://ltsudwkqnquegxybpadp.supabase.co'
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0c3Vkd2txbnF1ZWd4eWJwYWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMDAyMDQsImV4cCI6MjEwODU3NjIwNH0.oFmmxlCTae0H6U4OkRIpfApMMJ76qpwXx1OGuMXPq-w'

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON

/** Where confirmation / reset links should land. Desktop has no public address, so it uses the hosted web app. */
export const AUTH_REDIRECT = window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost' ? window.location.origin : 'https://vega-musicv1.vercel.app'

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
