// ═══════════════════════════════════════════════════════════════════════════
// LA VÉRITÉ D'UNE PLATEFORME — UN ÉTAT, UNE ACTION (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Le 23/09, Marine Rocher voyait eBay « Connectée » alors qu'elle n'a PAS de
// compte eBay, et Opla « Session fermée » alors que son relevé Opla venait de
// lire 57 annonces. Deux écrans (popup, Réglages) recalculaient chacun un état
// à partir de la sonde de l'extension — et la sonde eBay teste une page
// publique qui répond 200 sans compte.
//
// Depuis, c'est le SERVEUR qui tranche, une fois, pour tous les écrans :
// `plateformes_verite()` (migration 20260923190000). Le fait le plus récent et
// le plus précis gagne — relevé > dépôt réussi > sonde. eBay n'est
// « connectée » que Hub vendeur ouvert, relevé réussi, dépôt récent ou compte
// relié par l'API. Opla 401 = « à autoriser », pas « à connecter ».
//
// ⛔ CE MODULE NE DÉCIDE RIEN : il lit, et il porte le geste « je ne vends pas
//    sur X » (`plateforme_ecarter`, réversible, qui ne supprime rien).
import { supabase } from '../lib/supabase';

export const ETATS = Object.freeze({
  CONNECTEE: 'connectee',
  A_CONNECTER: 'a_connecter',
  A_AUTORISER: 'a_autoriser',
  ECARTEE: 'ecartee',
  INCONNUE: 'inconnue',
});

export const PLATEFORMES_VERITE = ['vinted', 'leboncoin', 'ebay', 'beebs', 'opla'];

/** { ok, calcule_le, extension_vue_le, plateformes: { [pf]: { etat, action, … } } } ou null. */
export async function lireVeritePlateformes() {
  const { data, error } = await supabase.rpc('plateformes_verite');
  if (error) throw error;
  return data?.ok === true ? data : null;
}

/** « Je ne vends pas sur X » (true) / « Finalement, si » (false). Réversible. */
export async function ecarterPlateforme(platform, ecarter = true) {
  const { data, error } = await supabase.rpc('plateforme_ecarter', { p_platform: platform, p_ecarter: ecarter });
  if (error) throw error;
  if (data?.ok !== true) throw new Error(data?.reason || 'plateforme_ecarter');
  return data;
}

/** Nombre de plateformes connectées, d'après la vérité serveur. */
export function compterConnectees(verite, plateformes = PLATEFORMES_VERITE) {
  const p = verite?.plateformes;
  if (!p) return 0;
  return plateformes.filter((pf) => p[pf]?.etat === ETATS.CONNECTEE).length;
}
