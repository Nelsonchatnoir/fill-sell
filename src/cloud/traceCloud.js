// ═══════════════════════════════════════════════════════════════════════════
// LA TRACE DES GESTES CLOUD DANS usage_logs (01/11/2026, demande de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le 01/11 à 19:38, « Connecter mes plateformes » ne faisait RIEN sur l'iPhone de Nico, sans une seule ligne nulle
// part : l'écran s'ouvrait DERRIÈRE la page Réglages (portail sur document.body, z-index 400 ; sous iOS, WKWebView
// peint les couches fixes de `.app-root` dans sa couche à lui, z-index ou pas). Désormais chaque geste laisse sa
// trace : le clic, l'ouverture (et si l'écran est vraiment AU PREMIER PLAN), les erreurs, la fin d'une connexion.
// Un clic sans « ouvert », ou un « cache », dit qu'un bouton est muet.
import { supabase } from '../lib/supabase';

/** Une ligne usage_logs, au mieux (jamais une exception, jamais bloquant). */
export function tracerCloud(userId, feature, metadata = {}) {
  if (!userId) return Promise.resolve();
  return Promise.resolve()
    .then(() => supabase.from('usage_logs').insert({ user_id: userId, feature, metadata }))
    .then((r) => { if (r?.error) console.warn(`[cloud] ${feature} non journalisé :`, r.error.message); })
    .catch((e) => { console.warn(`[cloud] ${feature} non journalisé :`, e?.message ?? e); });
}

/** Ce qui est vu au centre de l'écran (pure : testée) — rend { visible, devant } pour la couche `racine`. */
export function auPremierPlan(racine, doc) {
  if (!racine || !doc?.defaultView) return { visible: false, devant: 'sans_document' };
  const v = doc.defaultView;
  const el = doc.elementFromPoint?.(Math.round(v.innerWidth / 2), Math.round(v.innerHeight / 2)) ?? null;
  if (el && (el === racine || racine.contains(el))) return { visible: true, devant: null };
  const decrire = (e) => (e ? [e.tagName?.toLowerCase(), e.getAttribute?.('role'), e.className && String(e.className).slice(0, 40), e.getAttribute?.('aria-label')]
    .filter(Boolean).join('|') : 'rien');
  let couche = el;
  while (couche && couche.parentElement && couche.parentElement !== doc.body) couche = couche.parentElement;
  return { visible: false, devant: `${decrire(el)} (couche : ${decrire(couche)})`.slice(0, 200) };
}
