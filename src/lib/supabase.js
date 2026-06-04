import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = `${import.meta.env.VITE_SUPABASE_URL || ''}`.trim()
export const supabaseAnonKey = `${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
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
  return 'Custom backend auth needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the local env file.'
}
