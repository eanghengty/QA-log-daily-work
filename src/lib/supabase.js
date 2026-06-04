import { createClient } from '@supabase/supabase-js'

const supabaseUrl = `${import.meta.env.VITE_SUPABASE_URL || ''}`.trim()
const supabaseAnonKey = `${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null

export function getSupabaseConfigError() {
  if (isSupabaseConfigured) return ''
  return 'Supabase auth is enabled in code, but VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set yet.'
}
