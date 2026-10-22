import { createClient } from '@supabase/supabase-js'
import { creerFetchBorne } from '../utils/chargementBorne.js'

export const supabaseUrl = 'https://tojihnuawsoohlolangc.supabase.co'
export const supabaseAnonKey = 'sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr'

// flowType 'pkce' (2026-07-11, OAuth web Apple/Google) : signInWithOAuth renvoie
// un ?code= que /auth/callback échange (exchangeCodeForSession) — le code_verifier
// vit dans le storage du navigateur qui a INITIÉ la connexion. Effet de bord
// assumé : les liens email (reset password) portent aussi un ?code= et doivent
// donc être ouverts dans le navigateur qui a fait la demande.
//
// (22/10, Sébastien) Toute LECTURE PostgREST a une limite de temps, corps de la
// réponse compris (utils/chargementBorne.js) : une réponse qui n'arrive jamais
// rend une erreur au bout de 30 s au lieu d'un logo qui tourne sans fin.
// Écritures, RPC, auth, storage et fonctions passent tels quels.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
  global: { fetch: creerFetchBorne() },
})