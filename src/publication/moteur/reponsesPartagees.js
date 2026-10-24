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
//
// ── (11/10, Nico) AUCUNE MARQUE NULLE PART → « SANS MARQUE », SANS QUESTION ──
// Cas lucyburaux988 (10/10) : cinq parures publiées vers Vinted, cinq questions
// « Marque » alors qu'AUCUNE marque n'existait (Lens : marque nulle, « sans
// marque visible » ; rédaction : marque null) — réponse « Sans marque » 4 fois
// sur 5. La règle du 24/09 (« pas de Sans marque d'office ») est REMPLACÉE :
// fiche sans marque, Lens sans marque, aucune copie qui en porte, et aucune
// lecture partielle d'étiquette dans les notes de Lens → chaque copie reçoit
// « Sans marque » (la valeur exacte du bouton), aux trois arrivées des copies,
// jamais pendant une frappe, jamais sur la fiche (sansMarqueDOffice).
// Ce qui ne change PAS : une marque présente mais absente du catalogue Vinted
// garde sa question (« Sans marque » ou une marque de la liste, jamais une
// autre marque en silence) ; une marque du catalogue passe ; une marque tapée
// par la personne n'est jamais redemandée.
//
// ── (11/10) UNE RÉPONSE « MARQUE HORS CATALOGUE » VAUT POUR L'ARTICLE ───────
// La question posée par l'extension (Vinted ne connaît pas la marque) ne
// valait que pour SA tâche : la publication Vinted suivante du même article la
// reposait. La réponse est rangée sur la fiche, à part de la marque de
// l'article (attributs.marque_vinted = { v, de, source: 'manuel', at } —
// StockTab) ; une copie Vinted qui porte `de` (ou rien) reçoit `v`
// (appliquerMarqueVintedArticle). Même contrat côté serveur (get-pending-jobs).
import { SHARED_PROPAGATION, NO_BRAND_VALUE } from "./champsPartages.js";
import { valeurUneLettre } from "../../../supabase/functions/_shared/vinted-exigences.js";
import { marqueComparable, estSansMarque } from "../../../supabase/functions/_shared/marque-absente.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// (11/10) « SANS MARQUE » D'OFFICE QUAND AUCUNE MARQUE N'EXISTE NULLE PART
// ═══════════════════════════════════════════════════════════════════════════
// Une LECTURE PARTIELLE d'étiquette dans les notes de Lens peut être une
// marque : la question reste. Formes écrites par lens-analysis (prompt FR et
// EN) : « texte lisible sur l'objet : "…" », « texte partiellement lisible sur
// l'étiquette », « texte lu sur l'étiquette : "…" — marque introuvable »,
// « lettres de l'étiquette : B-O-N-O-B-O », « inscription partiellement
// illisible » ; 'text legible on the item', 'partly legible text on the
// label', 'text read on the label', 'label letters'.
// « aucun texte lisible », « pas de texte lisible » ne sont PAS des lectures.
const LECTURES_PARTIELLES = [
  /texte (partiellement )?(lisible|lu)\b/gi,
  /lettres de l['’]etiquette/gi,
  /inscription (partiellement )?(illisible|lisible)/gi,
  /\b(partly |partially )?legible text\b/gi,
  /\btext (partly |partially )?(legible|read)\b/gi,
  /\blabel letters\b/gi,
  /\binscription partly illegible\b/gi,
];
const NEGATION_AVANT = /(aucun|aucune|pas de|sans|nul|no|without)\s*$/i;

/** Les notes de Lens portent-elles une lecture (même partielle) d'étiquette ? */
export function lectureMarquePartielle(notes) {
  const t = String(notes ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return false;
  for (const re of LECTURES_PARTIELLES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (!NEGATION_AVANT.test(t.slice(Math.max(0, m.index - 14), m.index))) return true;
    }
  }
  return false;
}

const texteNonVide = (v) => String(v ?? "").trim();

/** Une copie porte-t-elle une marque, quelle qu'elle soit (une lettre comprise : prudence) ? */
function copiePorteUneMarque(p, pf) {
  if (texteNonVide(pf?.marque)) return true;
  if (p === "vinted" && texteNonVide(pf?.vintedAspects?.brand)) return true;
  if (p === "ebay" && texteNonVide(pf?.ebayAspects?.Marque)) return true;
  if (p === "beebs" && texteNonVide(pf?.beebsAspects?.Marque)) return true;
  if (p === "depop" && texteNonVide(pf?.depopMarque)) return true;
  return false;
}

/** La fiche porte-t-elle une marque (colonne, attribut, réponse Vinted rangée) ? */
function fichePorteUneMarque(fiche) {
  if (!fiche || typeof fiche !== "object") return false;
  if (texteNonVide(fiche.marque)) return true;
  const a = fiche.attributs?.marque;
  if (texteNonVide(a && typeof a === "object" ? a.v : a)) return true;
  const mv = fiche.attributs?.marque_vinted;
  return Boolean(mv && typeof mv === "object" && (texteNonVide(mv.de) || texteNonVide(mv.v)));
}

/**
 * (24/10 soir, décision 3 de Nico — refus de modération Leboncoin, insert Zombicide de louis) « SANS MARQUE » DÉCLARÉ
 * PAR LE VENDEUR N'EST JAMAIS REMPLACÉ PAR UNE MARQUE DE L'IA. La fiche disait « Sans marque » (relevé de SON annonce
 * Beebs) ; la rédaction a lu « Zombicide » dans le titre (le jeu dont l'objet est un accessoire, « jeu non inclus ») et
 * la copie Leboncoin l'a déclaré comme marque — « Autre » + « Marque : Zombicide » dans la description : un accessoire
 * non officiel présenté sous la marque d'un éditeur, ce que la modération refuse. Une copie qui porte une marque ne
 * cédait jamais à la fiche (comblerMarquesVides) ; pour « Sans marque » explicite, la fiche gagne, sur chaque copie,
 * aux mêmes trois arrivées (après la rédaction, jamais pendant une frappe).
 * Rend `{ edited, posees }` — `edited` est l'objet d'entrée quand rien ne change.
 */
export function sansMarqueDeLaFiche(edited, fiche, plateformes = SHARED_PROPAGATION.marque) {
  if (!edited || typeof edited !== "object" || !fiche || typeof fiche !== "object") return { edited, posees: [] };
  const attr = fiche.attributs?.marque;
  const declaree = texteNonVide(fiche.marque) || texteNonVide(attr && typeof attr === "object" ? attr.v : attr);
  if (!declaree || !estSansMarque(declaree)) return { edited, posees: [] };
  const posees = [];
  let next = edited;
  for (const p of plateformes) {
    const copie = edited[p];
    if (!copie) continue;
    const pf = copie.platform_fields ?? {};
    const portees = [pf.marque, p === "vinted" ? pf.vintedAspects?.brand : null, p === "ebay" ? pf.ebayAspects?.Marque : null,
      p === "beebs" ? pf.beebsAspects?.Marque : null, p === "depop" ? pf.depopMarque : null].map(texteNonVide).filter(Boolean);
    if (!portees.some((m) => !estSansMarque(m))) continue;
    const nouveau = { ...pf, marque: NO_BRAND_VALUE };
    if (p === "vinted" && texteNonVide(pf.vintedAspects?.brand) && !estSansMarque(pf.vintedAspects.brand)) nouveau.vintedAspects = { ...pf.vintedAspects, brand: NO_BRAND_VALUE };
    if (p === "ebay" && texteNonVide(pf.ebayAspects?.Marque) && !estSansMarque(pf.ebayAspects.Marque)) nouveau.ebayAspects = { ...pf.ebayAspects, Marque: NO_BRAND_VALUE };
    if (p === "beebs" && texteNonVide(pf.beebsAspects?.Marque) && !estSansMarque(pf.beebsAspects.Marque)) nouveau.beebsAspects = { ...pf.beebsAspects, Marque: NO_BRAND_VALUE };
    if (p === "depop" && texteNonVide(pf.depopMarque) && !estSansMarque(pf.depopMarque)) nouveau.depopMarque = NO_BRAND_VALUE;
    if (next === edited) next = { ...edited };
    next[p] = { ...copie, platform_fields: nouveau };
    posees.push(p);
  }
  return { edited: next, posees };
}

/**
 * « Sans marque » sur chaque copie quand AUCUNE marque n'existe nulle part.
 * @param {object} edited  les copies { [plateforme]: { platform_fields } }
 * @param {object} p
 * @param {object|null} p.fiche      la fiche (initialListing : marque, attributs) — pour un scan
 *                                   Lens, c'est le résultat de Lens lui-même (marque = celle lue)
 * @param {string|null} [p.lensMarque]  la marque lue par Lens, si elle vit ailleurs
 * @param {string|null} [p.notesLens]   les notes de Lens (lecture partielle → la question reste)
 * Rend `{ edited, posees }` — `edited` est l'objet d'entrée quand rien ne change.
 */
export function sansMarqueDOffice(edited, { fiche = null, lensMarque = null, notesLens = null, plateformes = SHARED_PROPAGATION.marque } = {}) {
  if (!edited || typeof edited !== "object") return { edited, posees: [] };
  const presentes = plateformes.filter((p) => edited[p]);
  if (!presentes.length) return { edited, posees: [] };
  if (fichePorteUneMarque(fiche) || texteNonVide(lensMarque)) return { edited, posees: [] };
  if (lectureMarquePartielle(notesLens)) return { edited, posees: [] };
  if (Object.entries(edited).some(([p, c]) => copiePorteUneMarque(p, c?.platform_fields))) return { edited, posees: [] };
  const next = { ...edited };
  for (const p of presentes) {
    next[p] = { ...edited[p], platform_fields: { ...(edited[p].platform_fields ?? {}), marque: NO_BRAND_VALUE } };
  }
  return { edited: next, posees: presentes };
}

/**
 * La réponse déjà donnée pour CET article à la question « marque hors
 * catalogue » de Vinted (fiche : attributs.marque_vinted = { v, de }) : la
 * copie Vinted qui porte `de` — ou aucune marque — reçoit `v`. Jamais une
 * autre marque ; jamais une autre plateforme. Même règle que le serveur.
 * Rend `{ edited, appliquee }` — `edited` est l'objet d'entrée quand rien ne change.
 */
export function appliquerMarqueVintedArticle(edited, attributs) {
  const rep = attributs && typeof attributs === "object" ? attributs.marque_vinted : null;
  const copie = edited?.vinted;
  if (!copie || !rep || typeof rep !== "object") return { edited, appliquee: null };
  const v = texteNonVide(rep.v);
  const de = texteNonVide(rep.de);
  if (!v) return { edited, appliquee: null };
  const pf = copie.platform_fields ?? {};
  const actuelle = texteNonVide(pf.marque) || texteNonVide(pf.vintedAspects?.brand);
  if (actuelle && !(de && marqueComparable(actuelle) === marqueComparable(de))) return { edited, appliquee: null };
  if (actuelle && marqueComparable(actuelle) === marqueComparable(v)) return { edited, appliquee: null };
  const nouveau = { ...pf, marque: v };
  if (texteNonVide(pf.vintedAspects?.brand)) nouveau.vintedAspects = { ...pf.vintedAspects, brand: v };
  return { edited: { ...edited, vinted: { ...copie, platform_fields: nouveau } }, appliquee: { de: actuelle || null, vers: v } };
}

/** La valeur rangée sur la fiche quand la personne répond à la question
 *  « marque hors catalogue » (StockTab) — « Sans marque » compris. */
export function attributMarqueVinted({ choix, demandee, maintenant = new Date() }) {
  const v = texteNonVide(choix);
  if (!v) return null;
  return { v, de: texteNonVide(demandee) || null, source: "manuel", at: maintenant.toISOString() };
}
