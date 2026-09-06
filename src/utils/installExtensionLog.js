// ── Télémétrie « installer l'extension » (2026-09-05) ────────────────────────
// Constat de la nuit du 04→05/09 : 10 inscrits, 1 extension installée. Les
// gens s'inscrivent depuis leur téléphone et ne voient jamais qu'il leur faut
// un ordinateur. Rien ne mesurait ce mur : ni la vue de la carte, ni le tap
// « m'envoyer le lien », ni l'e-mail réellement parti. Une feature usage_logs,
// quatre actions FERMÉES :
//   carte_vue           — la carte d'installation est à l'écran (UNE fois par
//                         session et par emplacement, jamais par re-rendu) ;
//   clic_mail           — tap sur « M'envoyer le lien pour mon ordinateur » ;
//   mail_envoye         — le serveur confirme l'envoi (r.ok, un throttle n'en
//                         est pas un) ;
//   clic_en_savoir_plus — ouverture de la feuille ExtensionPitchScreen.
// `source` nomme l'emplacement (tableau_vide, stock_vide) pour comparer les
// deux entrées. Best-effort : la télémétrie ne bloque jamais l'écran.
import { supabase } from '../lib/supabase';

export const INSTALL_EXTENSION_FEATURE = 'install_extension';

export function logInstallExtension(userId, action, source, extra = null) {
  if (!userId || !action) return;
  supabase.from('usage_logs').insert({
    user_id: userId,
    feature: INSTALL_EXTENSION_FEATURE,
    metadata: { action, source, ...(extra || {}) },
  }).then(({ error }) => { if (error) console.warn('[install_extension] non journalisé:', error.message); });
}

// Mémoire de session : sessionStorage survit aux F5 du même onglet ; le Set
// module couvre les contextes où le storage jette (WebView bridée, sandbox).
const vuesCetteSession = new Set();
const cleVue = (userId, source) => `fs_install_ext_vue|${userId}|${source}`;

export function logCarteVueUneFois(userId, source) {
  if (!userId) return;
  const cle = cleVue(userId, source);
  if (vuesCetteSession.has(cle)) return;
  try {
    if (sessionStorage.getItem(cle)) { vuesCetteSession.add(cle); return; }
    sessionStorage.setItem(cle, '1');
  } catch { /* storage indisponible : le Set module suffit pour cette page */ }
  vuesCetteSession.add(cle);
  logInstallExtension(userId, 'carte_vue', source);
}
