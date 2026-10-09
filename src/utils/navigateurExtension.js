// ═══════════════════════════════════════════════════════════════════════════
// LE NAVIGATEUR OÙ TOURNE L'EXTENSION (09/10, Marta)
// ═══════════════════════════════════════════════════════════════════════════
// Marta : l'app dans Chrome, l'extension dans Edge, sa session Vinted absente
// d'Edge. L'écran disait « Connecte-toi à Vinted sur ton ordinateur » — elle
// l'était, dans Chrome. Le serveur note désormais le navigateur de chaque poste
// (get-pending-jobs → profiles.extension_postes[poste].navigateur) ; l'écran le
// nomme quand il n'est pas celui qu'elle a sous les yeux.
// Une seule lecture, au besoin (jamais de relecture en boucle).
import { supabase } from '../lib/supabase';
import { navigateurDeUA, NOM_NAVIGATEUR } from '../../supabase/functions/_shared/navigateur-poste.js';

/** Le navigateur de l'app, sur ordinateur seulement (null dans l'app mobile). */
export function navigateurDeLApp(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const s = String(ua ?? '');
  if (!s || /Android|iPhone|iPad|iPod|\bwv\b|Capacitor/i.test(s)) return null;
  return navigateurDeUA(s);
}

/** Le navigateur du poste vu le plus récemment (48 h), sinon null. */
export function navigateurDesPostes(postes, maintenant = Date.now()) {
  let meilleur = null;
  for (const p of Object.values(postes ?? {})) {
    const le = Date.parse(String(p?.le ?? ''));
    if (!p?.navigateur || !Number.isFinite(le) || maintenant - le > 48 * 3600_000) continue;
    if (!meilleur || le > meilleur.le) meilleur = { le, navigateur: p.navigateur };
  }
  return meilleur?.navigateur ?? null;
}

export async function lireNavigateurExtension(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('extension_postes').eq('id', userId).maybeSingle();
  if (error) return null;
  return navigateurDesPostes(data?.extension_postes ?? null);
}

/**
 * La phrase qui nomme le bon navigateur, ou null quand il n'y a rien à dire
 * (extension dans Chrome et app dans Chrome, ou navigateur inconnu).
 */
export function noteNavigateur({ ext, app, plateforme, lang = 'fr' }) {
  if (!ext || !NOM_NAVIGATEUR[ext]) return null;
  const nomExt = NOM_NAVIGATEUR[ext];
  const fr = lang !== 'en';
  if (app && app !== ext && NOM_NAVIGATEUR[app]) {
    const nomApp = NOM_NAVIGATEUR[app];
    return fr
      ? `L'extension FillSell est installée dans ${nomExt}, et tu utilises FillSell dans ${nomApp} : ta session ${plateforme} doit être ouverte dans ${nomExt}. Connecte-toi à ${plateforme} dans ${nomExt}, ou installe l'extension dans ${nomApp}.`
      : `The FillSell extension is installed in ${nomExt}, and you're using FillSell in ${nomApp}: your ${plateforme} session must be open in ${nomExt}. Sign in to ${plateforme} in ${nomExt}, or install the extension in ${nomApp}.`;
  }
  if (ext !== 'chrome') {
    return fr
      ? `L'extension FillSell est installée dans ${nomExt} : c'est dans ${nomExt} que ta session ${plateforme} doit être ouverte.`
      : `The FillSell extension is installed in ${nomExt}: your ${plateforme} session must be open in ${nomExt}.`;
  }
  return null;
}
