// ═══════════════════════════════════════════════════════════════════════════
// UN TÉLÉPHONE EN « VERSION ORDINATEUR » (14/11/2026, cliente 13e274de) — pur, sans dépendance
// ═══════════════════════════════════════════════════════════════════════════
// À 00:57:51, son Firefox Android est passé en « version ordinateur » (menu ⋮ › « Site pour ordinateur ») : l'en-tête
// User-Agent est devenu « X11; Linux x86_64; rv:159.0 » (journaux de la passerelle Supabase, session f870b212) ; la page
// est alors dessinée à 980 px de large puis réduite à l'écran, la balise viewport ignorée. La page de connexion du Cloud
// (une image de 280 à 540 px) y devient minuscule, et le contrôle « l'écran est-il devant ? » visait à côté (les deux
// seules lignes « cloud_me_connecter_cache » de la base). Chrome, Edge, Samsung Internet font de même (« X11; Linux
// x86_64 » sans « Mobile »).
// Reconnu : un écran TACTILE à pointeur grossier, petit (moins de 600 px de côté court), qui annonce un ordinateur Linux.
// Jamais : un iPad (Safari s'y annonce « Macintosh » par défaut, ce n'est pas un choix de la personne), un vrai
// ordinateur (pas tactile, ou pointeur fin, ou grand écran), l'app (WebView : « Android … wv »).
// Verrou : selftest:cloud-connexion-affichage.

const UA_ORDINATEUR_LINUX = /\bX11; Linux x86_64\b/;
const UA_MOBILE = /\b(Mobile|Android|iPhone|iPad)\b/;

const lireNavigateur = () => {
  try {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return {};
    const grossier = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false;
    const ecran = window.screen ?? {};
    return {
      ua: String(navigator.userAgent ?? ''), toucher: Number(navigator.maxTouchPoints ?? 0), grossier,
      ecranMin: Math.min(Number(ecran.width) || 0, Number(ecran.height) || 0) || null,
    };
  } catch { return {}; }
};

/**
 * (pure si on lui donne ses mesures) La page tourne-t-elle sur un téléphone en « version ordinateur » ?
 *   { ua, toucher (maxTouchPoints), grossier (pointer: coarse), ecranMin (côté court de l'écran, px CSS) }
 */
export function modeOrdinateur(mesures = lireNavigateur()) {
  const { ua = '', toucher = 0, grossier = false, ecranMin = null } = mesures ?? {};
  if (!UA_ORDINATEUR_LINUX.test(ua) || UA_MOBILE.test(ua)) return false;
  return toucher > 0 && grossier === true && Number(ecranMin) > 0 && Number(ecranMin) < 600;
}
