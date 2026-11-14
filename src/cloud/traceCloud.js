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

/**
 * Ce qui est vu à l'endroit de l'écran `racine` (pure : testée) — rend { visible, devant, contexte }.
 * (14/11/2026, cliente 13e274de) Les deux seules lignes « cache » de la base disaient « html|notranslate (couche :
 * html|notranslate) » : c'était l'élément <html> de FillSell (classe notranslate, index.html), c'est-à-dire AUCUN élément au
 * point testé — le centre de la FENÊTRE, plus grande que l'écran fixe dans un Firefox Android en « version ordinateur »
 * (page dessinée à 980 px puis réduite) ; 3,5 s plus tard elle touchait bien Vinted. Le point testé est désormais le
 * centre de la PARTIE VISIBLE de l'écran (sa boîte ∩ la fenêtre) ; « html » se dit « aucun élément » ; le contexte
 * (traduite, fenêtre, couche, couvre, échelle) part avec la trace. Gardée DERNIÈRE et autonome : les autotests la
 * relisent seule (ce fichier importe le client Supabase de l'app).
 */
export function auPremierPlan(racine, doc) {
  if (!racine || !doc?.defaultView) return { visible: false, devant: 'sans_document', contexte: {} };
  const v = doc.defaultView;
  const fl = Math.round(v.innerWidth || 0), fh = Math.round(v.innerHeight || 0);
  let r = null;
  try { r = racine.getBoundingClientRect?.() ?? null; } catch { r = null; }
  const g = r ? Math.max(0, r.left) : 0, h = r ? Math.max(0, r.top) : 0;
  const d = r ? Math.min(fl, r.right) : fl, b = r ? Math.min(fh, r.bottom) : fh;
  let traduite = null;
  try { const c = doc.documentElement?.className; traduite = c == null ? null : /\btranslated-(ltr|rtl)\b/.test(String(c)); } catch { traduite = null; }
  const echelle = Number(v.visualViewport?.scale);
  const contexte = {
    traduite, fenetre: `${fl}x${fh}`, couche: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
    couvre: r ? (r.left <= 0 && r.top <= 0 && r.right >= fl && r.bottom >= fh) : null,
    ...(Number.isFinite(echelle) && echelle > 0 ? { echelle: Math.round(echelle * 100) / 100 } : {}),
  };
  if (r && (d - g < 1 || b - h < 1)) return { visible: false, devant: 'écran hors de la fenêtre', contexte };
  const el = doc.elementFromPoint?.(Math.round((g + d) / 2), Math.round((h + b) / 2)) ?? null;
  if (el && (el === racine || racine.contains(el))) return { visible: true, devant: null, contexte };
  const decrire = (e) => (e ? [e.tagName?.toLowerCase(), e.getAttribute?.('role'), e.className && String(e.className).slice(0, 40), e.getAttribute?.('aria-label')]
    .filter(Boolean).join('|') : 'rien');
  if (!el || el === doc.documentElement || el.tagName === 'HTML' || el === doc.body) {
    return { visible: false, devant: `aucun élément à l'endroit de l'écran (${el ? decrire(el) : 'hors page'})`.slice(0, 200), contexte };
  }
  let couche = el;
  while (couche && couche.parentElement && couche.parentElement !== doc.body) couche = couche.parentElement;
  return { visible: false, devant: `${decrire(el)} (couche : ${decrire(couche)})`.slice(0, 200), contexte };
}
