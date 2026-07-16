import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://tojihnuawsoohlolangc.supabase.co'
export const supabaseAnonKey = 'sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr'

// flowType 'pkce' (2026-07-11, OAuth web Apple/Google) : signInWithOAuth renvoie
// un ?code= que /auth/callback échange (exchangeCodeForSession) — le code_verifier
// vit dans le storage du navigateur qui a INITIÉ la connexion. Effet de bord
// assumé : les liens email (reset password) portent aussi un ?code= et doivent
// donc être ouverts dans le navigateur qui a fait la demande.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
})