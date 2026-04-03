import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tojihnuawsoohlolangc.supabase.co'
const supabaseAnonKey = 'sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)