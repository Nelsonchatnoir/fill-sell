// ═══════════════════════════════════════════════════════════════════════════
// UNE RÉPONSE VA LÀ OÙ ELLE EST DEMANDÉE (03/10/2026, cas Ornella)
// ═══════════════════════════════════════════════════════════════════════════
// Pull Bonobo d'ornellaracano, 19:05 → 19:11. La fiche relue en base
// (fiches_annonce 1791047123870) le dit sans détour : copie Vinted
// `marque: "B"`, copie Opla `marque: "B"`, `sharedOverrides: { vinted:
// ["marque", "matiere"], opla: ["marque"] }`, `sharedFields.marque: "Bonobo "`.
//   · La marque lue par Lens (« Donwood », fausse) a été corrigée dans la
//     carte Vinted de l'écran « Ce qui va partir » ; chaque frappe dans une
//     carte pose un VERROU sur la copie (override : « cette plateforme a sa
//     propre valeur, la valeur commune ne l'écrase plus ») ;
//   · la copie est restée sur une lettre (« B ») — une lettre n'est pas une
//     marque, l'écran la compte manquante ;
//   · à « Confirmer », la question « Marque · Vinted » écrivait la valeur
//     COMMUNE, que le verrou empêchait d'atteindre la copie Vinted : « Bonobo »
//     s'affichait dans le champ, la copie restait « B », la question restait,
//     le bouton restait gris. Aucune issue que « Quitter ».
//
// LA RÈGLE, POUR LES QUATRE CHAMPS PARTAGÉS (taille, couleur, matière,
// marque) : une réponse donnée à une question qui nomme des plateformes
// s'écrit sur CES plateformes, verrou ou pas — c'est pour elles qu'elle est
// donnée. Leur verrou saute (elles suivent désormais la réponse), et elles
// restent visées tant que l'écran est ouvert : la frappe suivante les atteint
// même quand la copie n'est plus « manquante » après deux lettres.
// Les autres copies verrouillées (une valeur propre à une plateforme, choisie
// exprès dans SA liste) ne bougent pas : c'est le sens du verrou.
//
// ET LA MARQUE DE LA FICHE N'EST JAMAIS REDEMANDÉE : une copie dont la marque
// est vide (ou d'une seule lettre) la reprend de la fiche, au chargement des
// copies (rédaction, fiche rouverte, brouillon) — jamais pendant une frappe.
import { SHARED_PROPAGATION } from "./champsPartages.js";
import { valeurUneLettre } from "../../../supabase/functions/_shared/vinted-exigences.js";

/** Une marque utilisable : au moins deux caractères (une lettre n'est pas une réponse). */
export function marqueUtilisable(v) {
  const s = String(v ?? "").trim();
  return s && !valeurUneLettre(s) ? s : null;
}

/**
 * La marque que porte la FICHE de l'article : la colonne `marque` (celle que
 * le Stock affiche, que la personne corrige), puis l'attribut `marque` (les
 * réponses rangées au publish). null si aucune n'est utilisable.
 */
export function marqueDeLaFiche(listing) {
  const attr = listing?.attributs?.marque;
  const lue = attr && typeof attr === "object" ? attr.v : attr;
  return marqueUtilisable(listing?.marque) ?? marqueUtilisable(lue);
}

/**
 * Comble les copies dont la marque est vide ou d'une seule lettre avec la
 * marque de la fiche. Ne touche JAMAIS une copie qui porte une marque (même
 * différente de la fiche) ; ne touche rien si la fiche n'a pas de marque.
 * Rend `{ edited, comblees }` — `edited` est l'objet d'entrée quand rien ne
 * change (aucun rendu de plus).
 */
// La marque qu'une copie porte AILLEURS que dans `marque`, là où le handler la
// lit vraiment : vinted.js prend `vintedAspects.brand` avant `marque` (pont
// `_bridge`), ebay.js pose l'aspect « Marque » tel quel. Leboncoin et Beebs
// sautent leur canal générique pour la marque : seul `marque` compte.
function marqueAilleurs(p, pf) {
  if (p === "vinted") return marqueUtilisable(pf?.vintedAspects?.brand);
  if (p === "ebay") return marqueUtilisable(pf?.ebayAspects?.Marque);
  return null;
}

export function comblerMarquesVides(edited, marqueFiche, plateformes = SHARED_PROPAGATION.marque) {
  const marque = marqueUtilisable(marqueFiche);
  if (!marque || !edited || typeof edited !== "object") return { edited, comblees: [] };
  const comblees = [];
  let next = edited;
  for (const p of plateformes) {
    const copie = edited[p];
    if (!copie) continue;
    if (marqueUtilisable(copie.platform_fields?.marque) || marqueAilleurs(p, copie.platform_fields)) continue;
    if (next === edited) next = { ...edited };
    next[p] = { ...copie, platform_fields: { ...(copie.platform_fields ?? {}), marque } };
    comblees.push(p);
  }
  return { edited: next, comblees };
}

/**
 * Les plateformes qu'une réponse à la question partagée `key` doit atteindre :
 * celles que la question nomme maintenant (copie manquante), celles déjà
 * visées par une frappe précédente dans le même écran, et toute copie dont la
 * valeur n'est pas une réponse (vide, ou une lettre hors taille) — verrouillée
 * ou non, elle n'a rien à protéger (la copie Opla d'Ornella, « B » elle aussi,
 * que la question « Marque · Vinted » ne nommait pas).
 */
export function ciblesDeLaReponse(manquants, key, dejaVisees = [], edited = null) {
  const nommees = (manquants ?? []).find(f => f?.key === key)?.platforms ?? [];
  const sansReponse = (SHARED_PROPAGATION[key] ?? []).filter(p => {
    const copie = edited?.[p];
    if (!copie) return false;
    const v = String(copie.platform_fields?.[key] ?? "").trim();
    return key === "taille" ? !v : !marqueUtilisable(v);
  });
  return [...new Set([...(dejaVisees ?? []), ...nommees, ...sansReponse])];
}

/**
 * Écrit la réponse `value` du champ partagé `key` (pur).
 *   · toute copie NON verrouillée de SHARED_PROPAGATION[key] la reçoit (le
 *     comportement d'avant, inchangé) ;
 *   · toute copie VISÉE (`cibles`) la reçoit aussi, verrou ou pas, et son
 *     verrou pour `key` saute.
 * `overrides` : { [plateforme]: Set<clé> }. Rend `{ edited, overrides }` —
 * `overrides` est l'objet d'entrée quand aucun verrou ne saute.
 */
export function ecrireReponsePartagee({ edited, overrides = {}, key, value, cibles = [] }) {
  const visees = new Set(cibles);
  const next = { ...(edited ?? {}) };
  for (const p of SHARED_PROPAGATION[key] ?? []) {
    if (!next[p]) continue;
    if (overrides[p]?.has(key) && !visees.has(p)) continue;
    next[p] = { ...next[p], platform_fields: { ...(next[p].platform_fields ?? {}), [key]: value } };
  }
  let ov = overrides;
  for (const p of visees) {
    if (!ov[p]?.has(key)) continue;
    if (ov === overrides) ov = { ...overrides };
    const s = new Set(ov[p]);
    s.delete(key);
    ov[p] = s;
  }
  return { edited: next, overrides: ov };
}
