// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT INCONNU EST UNE QUESTION (13/11, lot « zéro problème », étape 5 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « État jamais embelli, état inconnu = question. » Jusqu'ici, un article dont personne n'avait dit l'état (ni la fiche,
// ni la lecture des photos, ni la copie d'une plateforme) partait en « Très bon état » : l'écran le posait en silence
// (ListingPreviewScreen.defaultConditionFor, dans mergeFieldsWithLens et dans le dernier filet de
// resolutionPublication), comme la rédaction (DEFAUT_ETAT). Mesuré le 13/11 (lecture seule) : 960 rédactions en 30
// jours sur un état inconnu (61 comptes), 848 suivies d'une publication du même article.
// Désormais :
//   · un état CONNU (fiche, lecture des photos, copie, choix de la personne) reste exactement comme avant ;
//   · un état INCONNU ne se remplit jamais : il devient UNE question (« État », les niveaux du juge unique —
//     neuf avec / sans étiquette, très bon, bon, satisfaisant), posée une fois pour toutes les plateformes qui partent ;
//     la réponse est écrite sur chaque copie dans les mots de SA plateforme (etatPourPlateforme), puis jugée contre la
//     grille du rayon par le juge unique (_shared/etat-correspondance.js) comme toute valeur ;
//   · rien ne part tant qu'elle n'a pas de réponse (le bouton est gris, et le clic refuse en dernier filet).
// Pur (Node + navigateur) : scripts/etat-inconnu-question-selftest.mjs.
import { etatsDuJob } from "../../../supabase/functions/_shared/etat-correspondance.js";
import { ETATS_GENERAUX, etatPourPlateforme } from "../../../supabase/functions/_shared/etat-plateformes.js";

/** La copie d'une plateforme porte-t-elle un état (champ dédié, ou critère du formulaire déjà posé) ? */
export function etatConnuDeLaCopie(copie) {
  return etatsDuJob(copie?.platform_fields ?? null).length > 0;
}

/**
 * Les plateformes qui partent et dont la copie n'a AUCUN état : la question « État » est posée pour elles.
 * @param {{plateformes: Iterable<string>, edited: Record<string, any>}} args
 * @returns {string[]}
 */
export function plateformesSansEtat({ plateformes, edited }) {
  return [...(plateformes ?? [])].filter((p) => edited?.[p] && !etatConnuDeLaCopie(edited[p]));
}

/** Les réponses possibles : les niveaux communs, dans l'ordre (le libellé de référence, celui de l'« État général »). */
export const ETATS_AU_CHOIX = ETATS_GENERAUX;

/**
 * Ce que la réponse écrit sur chaque copie : le libellé de SA plateforme pour ce niveau, jamais un niveau au-dessus
 * (etatPourPlateforme : la correspondance d'une plateforme qui n'a pas le niveau exact n'est jamais meilleure).
 * @param {string} libelle  la réponse (libellé de référence, ETATS_AU_CHOIX)
 * @param {string[]} plateformes
 * @returns {Array<{plateforme: string, valeur: string}>}
 */
export function ecrituresDeLEtatChoisi(libelle, plateformes) {
  const out = [];
  for (const p of plateformes ?? []) {
    const e = etatPourPlateforme(libelle, p === "depop" || p === "opla" ? "vinted" : p);
    if (e?.valeur && !e.meilleur) out.push({ plateforme: p, valeur: e.valeur });
  }
  return out;
}

/**
 * Le dernier filet, au clic : un job sans état ne part jamais. Rend le message à montrer (ou null).
 * @param {{plateformes: string[], pfParPlateforme: Record<string, object>, lang?: string, nom?: (p: string) => string}} args
 */
export function refusEtatInconnu({ plateformes, pfParPlateforme, lang = "fr", nom = (p) => p }) {
  const sans = (plateformes ?? []).filter((p) => pfParPlateforme?.[p] && etatsDuJob(pfParPlateforme[p]).length === 0);
  if (!sans.length) return null;
  const qui = sans.map(nom).join(", ");
  return lang === "en"
    ? `Condition to choose (${qui}): nobody has said it yet. Pick it in the « Condition » question — nothing was published or charged.`
    : `État à choisir (${qui}) : personne ne l'a encore dit. Choisis-le dans la question « État » — rien n'est parti, rien n'est débité.`;
}
