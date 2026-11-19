// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION LEBONCOIN : LES TRANSPORTEURS CHOISIS SUR LA FICHE PASSENT D'ABORD (19/11/2026, demande de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La fiche porte le choix de l'ARTICLE (attributs.transporteurs_lbc = { v: [noms exacts de LBC_TRANSPORTEURS], source:
// « manuel », at } — src/utils/transporteursLbcFiche.js, Opus-1 f24628b) ; la publication le prend devant celui du lot.
// La republication, elle, ne connaissait que le choix retenu du COMPTE (platform_settings.leboncoin.transporteurs),
// puis ce que l'annonce affiche (get-pending-jobs, bloc « livraison de l'annonce »). Règle (la même qu'à la publication) :
// le choix de la fiche passe devant celui du compte, borné au poids qui part (celui de la fiche d'abord — il passe
// devant celui de la copie au service, _shared/colis-de-la-fiche.js —, puis la copie, puis l'annonce) ; un choix que le
// poids écarte en entier laisse la main à la règle d'avant (compte, puis annonce) ; une réponse de la personne sur la
// tâche (needsUserResolved) reste devant tout (vérifié par l'appelant).
// Pur (Deno + Node) : scripts/transporteurs-lbc-republication-selftest.mjs.
import { transporteursDeLaFiche, transporteursDeLArticle } from "../../../src/utils/transporteursLbcFiche.js";

/**
 * @param {{ attributs?: object | null, poidsFiche?: unknown, poidsCopie?: unknown, poidsAnnonce?: unknown }} a
 * @returns {{ noms: string[], poids_g: number | null, choix: string[] } | null}  null : la fiche ne choisit rien qui parte
 */
export function transporteursDeLaFicheALaRepublication({ attributs = null, poidsFiche = null, poidsCopie = null, poidsAnnonce = null } = {}) {
  const choix = transporteursDeLaFiche(attributs);
  if (!choix) return null;
  const g = [poidsFiche, poidsCopie, poidsAnnonce].map((v) => Number(v)).find((v) => Number.isFinite(v) && v > 0) ?? null;
  const { noms } = transporteursDeLArticle({ choixFiche: choix, poids_g: g });
  return noms ? { noms, poids_g: g, choix } : null;
}
