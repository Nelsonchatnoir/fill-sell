// ── Envoi du lien d'installation de l'extension à l'adresse du compte ────────
// Un appel = un e-mail. L'adresse n'est PAS envoyée : la fonction
// send-extension-link la lit sur le JWT, côté serveur, et la renvoie dans sa
// réponse — c'est CELLE-LÀ qu'on affiche à l'utilisateur (« Lien envoyé à … »),
// jamais une valeur locale qui pourrait être périmée.
//
// Rendu normalisé pour que l'appelant n'ait jamais à distinguer un échec
// réseau d'un échec applicatif :
//   { ok: true,  email }
//   { ok: false, reason: 'throttle', email, retryDans }  ← déjà parti, pas un échec
//   { ok: false, reason: 'no_email' | 'unauthorized' | 'send_failed' | 'reseau' }
import { supabase } from '../lib/supabase';

export async function envoyerLienExtension(lang) {
  try {
    const { data, error } = await supabase.functions.invoke('send-extension-link', {
      body: { lang: lang === 'en' ? 'en' : 'fr' },
    });
    if (error) {
      // functions.invoke transforme tout non-2xx en error : le corps JSON est
      // dans error.context (une Response). On tente de le lire pour rendre la
      // vraie raison ; illisible (fonction pas déployée, coupure) → 'reseau'.
      let corps = null;
      try { corps = await error.context?.json?.(); } catch { /* corps illisible */ }
      return {
        ok: false,
        reason: corps?.reason ?? 'reseau',
        email: corps?.email ?? null,
        retryDans: corps?.retry_dans_s ?? null,
      };
    }
    if (data?.ok) return { ok: true, email: data.email ?? null };
    return {
      ok: false,
      reason: data?.reason ?? 'send_failed',
      email: data?.email ?? null,
      retryDans: data?.retry_dans_s ?? null,
    };
  } catch {
    return { ok: false, reason: 'reseau', email: null, retryDans: null };
  }
}
