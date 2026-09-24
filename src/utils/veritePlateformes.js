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
// relié par l'API.
//
// (24/09) Le stepper lit AUSSI cette vérité — il relisait jusque-là la sonde
// de l'extension (profiles.extension_sessions) et décidait seul « Session
// fermée » / « Connectée ». L'AUTORISATION Opla, elle, se lit à part
// (utils/oplaAcces) : c'est une autre question que la session.
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

// Une lecture partagée : les Réglages, le Stock et le stepper ouvert
// par-dessus montent chacun le hook — une seule requête en vol à la fois, et
// une réponse de moins de 10 s resservie telle quelle. `frais` passe outre
// (après un geste : écarter une plateforme, revenir de l'extension).
const CACHE_MS = 10 * 1000;
let cache = { le: 0, valeur: null, enVol: null };

/** { ok, calcule_le, extension_vue_le, plateformes: { [pf]: { etat, action, … } } } ou null. */
export async function lireVeritePlateformes({ frais = false } = {}) {
  if (!frais && cache.valeur && Date.now() - cache.le < CACHE_MS) return cache.valeur;
  if (cache.enVol) return cache.enVol;
  const enVol = (async () => {
    try {
      const { data, error } = await supabase.rpc('plateformes_verite');
      if (error) throw error;
      const v = data?.ok === true ? data : null;
      cache = { le: Date.now(), valeur: v, enVol: null };
      return v;
    } catch (e) {
      cache = { ...cache, enVol: null };
      throw e;
    }
  })();
  cache = { ...cache, enVol };
  return enVol;
}

/** Vide la lecture partagée (changement de compte). */
export function oublierVeritePlateformes() {
  cache = { le: 0, valeur: null, enVol: null };
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
  return (plateformes ?? PLATEFORMES_VERITE).filter((pf) => p[pf]?.etat === ETATS.CONNECTEE).length;
}

/**
 * La vérité serveur réduite au vocabulaire des écrans de publication :
 * { [pf]: true (connectée) | false (à connecter) } — une plateforme dont
 * l'état n'est pas tranché (inconnue, écartée, à autoriser) n'a PAS de clé,
 * et ne peut donc rien afficher : ni « Connectée », ni « Session fermée ».
 * « À autoriser » (Opla) n'est pas une session : c'est utils/oplaAcces qui
 * le porte.
 */
export function sessionsDepuisVerite(verite) {
  const p = verite?.plateformes;
  if (!p) return null;
  const out = {};
  let quelqueChose = false;
  for (const pf of PLATEFORMES_VERITE) {
    const etat = p[pf]?.etat;
    if (etat === ETATS.CONNECTEE) { out[pf] = true; quelqueChose = true; }
    else if (etat === ETATS.A_CONNECTER) { out[pf] = false; quelqueChose = true; }
  }
  return quelqueChose ? out : null;
}

/**
 * La même vérité dans le vocabulaire d'avant (ok / ko / null), pour les écrans
 * qui le parlent encore (module de republication planifiée des Réglages : 'ko'
 * y veut dire « session déconnectée dans Chrome »). « À autoriser » n'est PAS
 * une session fermée : il rend null ici, jamais 'ko'.
 */
export function etatsDepuisVerite(verite, plateformes = PLATEFORMES_VERITE) {
  const p = verite?.plateformes;
  if (!p) return null;
  const out = {};
  for (const pf of plateformes ?? PLATEFORMES_VERITE) {
    const etat = p[pf]?.etat;
    out[pf] = etat === ETATS.CONNECTEE ? 'ok' : etat === ETATS.A_CONNECTER ? 'ko' : null;
  }
  return out;
}

/**
 * L'état AFFICHÉ d'Opla dans les Réglages : l'état de session du serveur,
 * corrigé par le verdict d'AUTORISATION (utils/oplaAcces — le même que le
 * stepper et l'écran de suivi). Un refus connu → « à autoriser » ; un accès
 * prouvé → jamais « à autoriser ». Écartée reste écartée.
 */
export function etatOplaAffiche(etatServeur, verdictAcces) {
  if (etatServeur === ETATS.ECARTEE) return ETATS.ECARTEE;
  if (verdictAcces === 'a_autoriser') return ETATS.A_AUTORISER;
  if (verdictAcces === 'autorise' && etatServeur === ETATS.A_AUTORISER) return ETATS.INCONNUE;
  return etatServeur ?? ETATS.INCONNUE;
}
