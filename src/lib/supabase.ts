import { createClient } from '@supabase/supabase-js'

export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
