// ═══════════════════════════════════════════════════════════════════════════
// LE VENDEUR VINTED ÉTRANGER, VU DEPUIS L'APP (15/10, lot B — Marta)
// ═══════════════════════════════════════════════════════════════════════════
// Marta (Pro, Italie) : 14 synchronisations Vinted, 14 « pas connecté » (403
// sur www.vinted.fr), l'extension dans Edge. Le chemin vinted.it existe dans
// l'extension depuis la 0.6.106 (« Autoriser vinted.<pays> » dans le popup),
// mais il attendait le pays du RÉSEAU — un en-tête qui n'arrive jamais jusqu'au
// serveur : il ne s'est déclenché chez personne. Et l'écran ne nommait aucun
// domaine : « Connecte-toi à Vinted sur ton ordinateur ».
// Désormais, quand Vinted n'est pas connecté et que l'APPAREIL est dans un
// fuseau d'un autre pays Vinted de la zone euro :
//   · l'app le note une fois (platform_settings.vinted.pays_appareil, par
//     platform_settings_fusionner — aucune écriture si rien ne change) ; le
//     serveur s'en sert pour proposer « Autoriser vinted.<pays> » dans le popup
//     (pays fermé côté coin_config vinted_pays_<cc> : jamais) ;
//   · le point « Vinted : pas connecté » nomme le domaine et les DEUX gestes :
//     se connecter sur www.vinted.fr avec ses identifiants (prouvé chez deux
//     comptes étrangers, IT et DE), ou autoriser son domaine dans l'extension.
// Un appareil en France (Europe/Paris) : rien ne change, rien n'est écrit.
import { supabase } from '../lib/supabase';
import { paysDeFuseau, NOM_NAVIGATEUR } from '../../supabase/functions/_shared/navigateur-poste.js';
import { fusionnerReglages } from './reglagesPlateformes';

/** Le pays Vinted (zone euro, hors France) de l'appareil, ou null. */
export function paysVintedDeLAppareil(fuseau) {
  let f = fuseau;
  if (f === undefined) {
    try { f = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { f = null; }
  }
  const p = paysDeFuseau(f);
  return p && p !== 'FR' ? p : null;
}

/** « vinted.it » pour « IT » (les 18 domaines de la zone euro suivent ce motif). */
export function domaineVintedDe(pays) {
  return /^[A-Z]{2}$/.test(String(pays ?? '')) ? `vinted.${String(pays).toLowerCase()}` : null;
}

/**
 * La phrase qui nomme le domaine et les gestes, ou null (appareil en France,
 * pays inconnu). `ouvert` : FillSell sait travailler sur ce domaine (bouton
 * « Autoriser » du popup) ; sinon seul le premier geste est proposé.
 */
export function noteVintedEtranger({ pays, navigateur = null, ouvert = false, lang = 'fr' }) {
  const dom = domaineVintedDe(pays);
  if (!dom || pays === 'FR') return null;
  const nav = NOM_NAVIGATEUR[navigateur] ?? null;
  if (lang === 'en') {
    return `Is your Vinted account on ${dom}? ${nav ? `In ${nav}` : 'On your computer'}, sign in on www.vinted.fr with your usual Vinted login (it's the same account)`
      + (ouvert ? `, or open the FillSell extension (its icon, top right${nav ? ` of ${nav}` : ''}) and tap “Allow ${dom}”` : '')
      + '. Then tap “Sync”.';
  }
  return `Ton compte Vinted est sur ${dom} ? ${nav ? `Dans ${nav}` : 'Sur ton ordinateur'}, connecte-toi sur www.vinted.fr avec tes identifiants Vinted habituels (c'est le même compte)`
    + (ouvert ? `, ou ouvre l'extension FillSell (son icône, en haut à droite${nav ? ` de ${nav}` : ''}) et appuie sur « Autoriser ${dom} »` : '')
    + '. Puis appuie sur « Synchroniser ».';
}

// Une lecture et une écriture au plus par ouverture de l'app (jamais en boucle).
const deja = { note: null, ouvert: new Map() };

/** FillSell travaille-t-il sur le domaine de ce pays ? (coin_config vinted_pays_<cc>) */
export async function paysVintedOuvert(pays) {
  if (!domaineVintedDe(pays)) return false;
  if (deja.ouvert.has(pays)) return deja.ouvert.get(pays);
  let ouvert = false;
  try {
    const { data, error } = await supabase.from('coin_config').select('value').eq('key', `vinted_pays_${String(pays).toLowerCase()}`).maybeSingle();
    ouvert = !error && Number(data?.value) === 1;
  } catch { ouvert = false; }
  deja.ouvert.set(pays, ouvert);
  return ouvert;
}

/** Note le pays de l'appareil pour le serveur (une fois ; rien n'est écrit s'il n'a pas changé). */
export async function retenirPaysAppareil(pays) {
  if (!domaineVintedDe(pays) || pays === 'FR' || deja.note === pays) return;
  deja.note = pays;
  try { await fusionnerReglages(['vinted'], { pays_appareil: pays }); } catch { /* best-effort : seul le bouton du popup en dépend */ }
}
