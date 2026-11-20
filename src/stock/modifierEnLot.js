// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER EN LOT LE PRIX OU LA QUANTITÉ DES FICHES (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business) : changer le prix ou la quantité de plusieurs articles
// d'un coup. Sélection multiple ; une valeur fixe ; pour le prix, aussi un
// montant ou un pourcentage en plus ou en moins.
//
// ⛔ CE QUI CHANGE, ET CE QUI NE CHANGE PAS — à dire tel quel à l'écran :
//    · les FICHES (inventaire.prix_vente / inventaire.quantite) changent ;
//      le prix garde sa trace (prix_vente_change_par = 'app', déclencheur
//      inventaire_trace_changements) ;
//    · les annonces DÉJÀ EN LIGNE ne changent pas, sur AUCUNE plateforme :
//      aucun chemin ne leur envoie un prix ou une quantité de fiche (les jobs
//      ne savent que publier, retirer, republier) — et une republication
//      remet l'annonce au prix OÙ ELLE EST (règle du 03/10) ;
//    · le nouveau prix sert aux PROCHAINES publications de ces articles.
// ⛔ QUANTITÉ : 1 au moins. 0 voudrait dire « vendu » — c'est le geste
//    Vendre, qui retire les copies en ligne ; ici on ne retire rien.
// ⛔ PRIX : 1 € au moins (le minimum de Vinted, garde de publication). Un
//    article SANS prix ne reçoit pas de « + 10 % » : il n'a pas de base, il
//    est laissé de côté et compté — jamais un prix inventé.
// (19/11, Louis) Aussi le POIDS, le FORMAT DU COLIS LEBONCOIN et le PRIX
//    D'ACHAT — blocs en fin de fichier, même patron (un plan, puis une
//    écriture par valeur) ; `ecrituresDuPlan` dit ce que la barre écrit.
// (20/11/2026 soir, bloc C de Nico — Louis) Aussi la TAILLE, et PLUSIEURS
//    CHAMPS D'UN COUP (`planCombine`, en fin de fichier) : seuls les champs
//    remplis s'appliquent, une seule validation, une écriture par article au
//    plus (par groupe d'articles au contenu identique).
// Pur, sans React ni réseau (scripts/modifier-en-lot-selftest.mjs,
// scripts/modifier-en-lot-multi-selftest.mjs).
import { lirePoidsSaisi } from "../publication/lot/regles.js";
import { FORMATS_LBC, choixFormatPourLaFiche, formatDeLaFiche } from "../../supabase/functions/_shared/colis-de-la-fiche.js";
import { prixAchatConnu, prixAchatNum } from "../utils/comptabilite.js";
import { transporteursValides, transporteursDeLaFiche, choixTransporteursPourLaFiche, CLE_TRANSPORTEURS_LBC } from "../utils/transporteursLbcFiche.js";
// (20/11/2026 soir, bloc C de Nico — Louis) La taille s'écrit par LA règle de la correction « pour toutes les
// plateformes » du lot (corrections.js) ; « déjà à cette taille » se juge comme une option de liste (memeTexte) ;
// les transporteurs trop lourds se comptent au poids de chaque article (LBC_TRANSPORTEURS, leurs limites).
import { patchFicheCorrection, valeursPlateformesDeLaFiche, PORTEE_TOUTES } from "../publication/lot/corrections.js";
import { memeTexte } from "../utils/texteComparable.js";
import { LBC_TRANSPORTEURS } from "../utils/leboncoinColis.js";

export const OPERATIONS_PRIX = Object.freeze(["fixer", "plus_euros", "moins_euros", "plus_pct", "moins_pct"]);
export const PRIX_MIN = 1;

/** « 12,5 », « 12.50 € », « 10 % » → nombre, ou null. */
export function lireNombre(brut) {
  const t = String(brut ?? "").trim().replace(/[\s€%]/g, "").replace(",", ".");
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const arrondi = (n) => Math.round(n * 100) / 100;
const prixDe = (item) => {
  const v = item?.prix_vente ?? item?.sell;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Le prix après l'opération, ou { raison } si l'article est laissé de côté. */
export function nouveauPrix(actuel, operation, valeur) {
  const v = Number(valeur);
  if (!OPERATIONS_PRIX.includes(operation) || !Number.isFinite(v) || v < 0) return { raison: "valeur" };
  if (operation === "fixer") return v >= PRIX_MIN ? { prix: arrondi(v) } : { raison: "sous_minimum" };
  if (actuel == null) return { raison: "sans_prix" };
  const p = operation === "plus_euros" ? actuel + v
    : operation === "moins_euros" ? actuel - v
    : operation === "plus_pct" ? actuel * (1 + v / 100)
    : actuel * (1 - v / 100);
  const r = arrondi(p);
  return r >= PRIX_MIN ? { prix: r } : { raison: "sous_minimum" };
}

/**
 * Le plan d'un changement de prix : ce qui change, ce qui est laissé de côté.
 * @returns {{ changements: Array<{id, avant, apres}>, ignores: Array<{id, raison}> }}
 */
export function planPrix(items, operation, valeur) {
  const changements = [];
  const ignores = [];
  for (const item of items ?? []) {
    const avant = prixDe(item);
    const r = nouveauPrix(avant, operation, valeur);
    if (r.prix == null) ignores.push({ id: item.id, raison: r.raison });
    else if (r.prix !== avant) changements.push({ id: item.id, avant, apres: r.prix });
  }
  return { changements, ignores };
}

/** Le plan d'un changement de quantité (entier, 1 au moins). */
export function planQuantite(items, valeur) {
  const q = Number(valeur);
  if (!Number.isInteger(q) || q < 1) return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "quantite" })) };
  const changements = [];
  for (const item of items ?? []) {
    const avant = Number(item?.quantite ?? 1) || 1;
    if (avant !== q) changements.push({ id: item.id, avant, apres: q });
  }
  return { changements, ignores: [] };
}

/** Regroupe les changements par nouvelle valeur : une écriture par valeur, pas par article. */
export function parValeur(changements) {
  const m = new Map();
  for (const c of changements ?? []) {
    const k = String(c.apres);
    if (!m.has(k)) m.set(k, { valeur: c.apres, ids: [] });
    m.get(k).ids.push(c.id);
  }
  return [...m.values()];
}

// ── LE POIDS (19/11, Louis) ────────────────────────────────────────────────
// inventaire.poids_g, en grammes, entier, 1 g à 150 kg. Il sert à Leboncoin et
// à Beebs au prochain dépôt (get-pending-jobs) ; un format Leboncoin choisi à
// la main reste le choix (19/11 soir, Nico : jamais recalculé depuis le poids,
// _shared/colis-de-la-fiche.js).
// ⛔ Un article qui a déjà ce poids n'est pas réécrit (`inchanges`).
export const POIDS_MIN_G = 1;
export const POIDS_MAX_G = 150000;
/** « 650 g », « 650 », « 1,2 kg », « 1.2kg » → grammes, ou null : LA lecture du lot de publication, pas une copie. */
export const lirePoids = lirePoidsSaisi;

// Les items du Stock portent le poids en `poids_g` (mapItem, App.jsx), avec `poids_change_le` et `attributs`.
const grammesDe = (v) => {
  if (v == null || v === "") return null;
  const g = Math.round(Number(v));
  return Number.isFinite(g) && g > 0 ? g : null;
};

/** Le plan d'un changement de poids (grammes, entier, 1 g à 150 kg). */
export function planPoids(items, grammes) {
  const g = grammes == null || grammes === "" ? NaN : Number(grammes);
  if (!Number.isInteger(g) || g < POIDS_MIN_G || g > POIDS_MAX_G) {
    return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "poids" })), inchanges: [] };
  }
  const changements = [];
  const inchanges = [];
  for (const item of items ?? []) {
    const avant = grammesDe(item?.poids_g);
    if (avant === g) inchanges.push(item.id);
    else changements.push({ id: item.id, avant, apres: g });
  }
  return { changements, ignores: [], inchanges };
}

// ── LE FORMAT DU COLIS LEBONCOIN (19/11, Louis) ────────────────────────────
// Petit, Moyen, Volumineux, ou « Déduit du poids » (« auto » : revenir au
// calcul du poids). Écrit par choixFormatPourLaFiche, au poids de CHAQUE
// fiche : un choix vaut pour le poids auquel il a été fait (règle de Nico du
// 17/11) — d'où une écriture par couple (valeur, poids), pas par valeur seule.
// ⛔ (19/11, décision de Nico) « On n'enregistre un choix que s'il change
//    vraiment le format » : un article qui part DÉJÀ à ce format — choisi, ou
//    calculé de son poids (formatDeLaFiche) — n'est pas réécrit ; « Déduit du
//    poids » ne réécrit que l'article dont le format choisi diffère de celui
//    de son poids.
export const FORMAT_DEDUIT = "auto";
export const CHOIX_FORMAT_LBC = Object.freeze([...FORMATS_LBC, FORMAT_DEDUIT]);
const choixFormat = (v) => {
  const t = String(v ?? "").trim().toLowerCase();
  if (t === "" || t === FORMAT_DEDUIT) return FORMAT_DEDUIT;
  return FORMATS_LBC.find((f) => f.toLowerCase() === t) ?? null;
};

/** Le plan d'un changement de format : `changements` portent le poids de chaque fiche. */
export function planFormatLbc(items, valeur) {
  const cible = choixFormat(valeur);
  if (!cible) return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "format" })), inchanges: [] };
  const changements = [];
  const inchanges = [];
  for (const item of items ?? []) {
    const poids_g = grammesDe(item?.poids_g);
    const actuel = formatDeLaFiche({ poids_g, poids_change_le: item?.poids_change_le ?? null, attributs: item?.attributs ?? null });
    const vaut = actuel?.valeur ?? null; // le format qui part aujourd'hui (choisi, sinon du poids, sinon aucun)
    // (19/11 soir, bug de Louis — décision de Nico) « Petit » choisi en masse sur une fiche « Automatique : Petit » DOIT
    // devenir le choix de la personne (il ne se recalcule plus jamais depuis le poids) : « inchangé » seulement quand la
    // fiche porte DÉJÀ ce choix ; « Automatique » choisi : inchangé quand la fiche n'a aucun choix (elle suit déjà le poids).
    const choisi = actuel?.origine === "choisi";
    if (cible === FORMAT_DEDUIT ? !choisi : (choisi && vaut === cible)) inchanges.push(item.id);
    else changements.push({ id: item.id, avant: actuel?.valeur ?? null, origine: actuel?.origine ?? null, apres: cible, poids_g });
  }
  return { changements, ignores: [], inchanges };
}

/** Regroupe les changements de format par (valeur, poids) : une écriture par couple. */
export function parValeurEtPoids(changements) {
  const m = new Map();
  for (const c of changements ?? []) {
    const k = `${c.apres}|${c.poids_g ?? ""}`;
    if (!m.has(k)) m.set(k, { valeur: c.apres, poids_g: c.poids_g ?? null, ids: [] });
    m.get(k).ids.push(c.id);
  }
  return [...m.values()];
}

// ── LE PRIX D'ACHAT (19/11, Louis) ─────────────────────────────────────────
// VIDE ≠ ZÉRO (utils/comptabilite.js) : NULL = inconnu, 0 = gratuit.
//   · « Fixer à X », X ≥ 0 (0 accepté) → { prix_achat: X, prix_achat_inconnu: false } ;
//   · un champ vide n'écrit rien — jamais lu comme 0 ;
//   · « Je ne sais pas » → { prix_achat: null, prix_achat_inconnu: true } (l'article sort des calculs de marge).
// ⛔ Aucun ± € ni ± % : une marge se calcule sur un prix vrai, pas sur un prix décalé.
export const GESTES_PRIX_ACHAT = Object.freeze(["fixer", "inconnu"]);

/** Le plan d'un changement de prix d'achat. `apres` vaut le prix, ou null pour « Je ne sais pas ». */
export function planPrixAchat(items, geste, valeur = null) {
  const changements = [];
  const inchanges = [];
  if (geste === "inconnu") {
    for (const item of items ?? []) {
      const brut = item?.prix_achat ?? item?.buy ?? null;
      if (item?.prix_achat_inconnu === true && (brut == null || brut === "")) inchanges.push(item.id);
      else changements.push({ id: item.id, avant: prixAchatNum(item), apres: null });
    }
    return { changements, ignores: [], inchanges };
  }
  const vide = valeur == null || String(valeur).trim() === "";
  const v = vide ? NaN : Number(valeur);
  if (geste !== "fixer" || !Number.isFinite(v) || v < 0) {
    return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: vide ? "vide" : "valeur" })), inchanges: [] };
  }
  const x = arrondi(v);
  for (const item of items ?? []) {
    const avant = prixAchatConnu(item) ? arrondi(prixAchatNum(item)) : null;
    if (avant === x) inchanges.push(item.id);
    else changements.push({ id: item.id, avant, apres: x });
  }
  return { changements, ignores: [], inchanges };
}

// ── LES TRANSPORTEURS LEBONCOIN (20/11/2026, demande de Louis — ordre de Nico, lot « écrans ») ─────────────────────
// « Transporteur Leboncoin ajouté à la modification en masse, à côté du poids et du format. » Le choix de l'ARTICLE
// (attributs.transporteurs_lbc, source « manuel », utils/transporteursLbcFiche.js — le même que la fiche article) :
// il passe devant le choix du compte à la publication, toujours borné au poids de chaque article (un transporteur qui
// ne prend pas ce poids n'est jamais coché pour lui). « Comme le compte » (TRANSPORTEURS_COMME_LE_COMPTE) efface le
// choix de l'article (« auto » : la fusion des attributs ne sait pas effacer une clé).
// ⛔ Une fiche qui porte déjà exactement ce choix n'est pas réécrite ; un nom que Leboncoin n'a pas n'est jamais écrit.
export const TRANSPORTEURS_COMME_LE_COMPTE = "auto";
const memeListe = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
/** Le plan d'un choix de transporteurs Leboncoin (liste de noms, ou TRANSPORTEURS_COMME_LE_COMPTE). */
export function planTransporteursLbc(items, liste) {
  const auto = liste === TRANSPORTEURS_COMME_LE_COMPTE;
  const cible = auto ? TRANSPORTEURS_COMME_LE_COMPTE : transporteursValides(liste);
  if (!cible) return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "transporteurs" })), inchanges: [] };
  const changements = [];
  const inchanges = [];
  for (const item of items ?? []) {
    const actuel = transporteursDeLaFiche(item?.attributs ?? null); // null : aucun choix (le compte vaut)
    if (auto ? actuel == null : memeListe(actuel, cible)) inchanges.push(item.id);
    else changements.push({ id: item.id, avant: actuel, apres: cible });
  }
  return { changements, ignores: [], inchanges };
}

// ── LA TAILLE (20/11/2026 soir, bloc C de Nico — Louis) ────────────────────────────────────────────────────────
// (20/11/2026 soir, bloc C de Nico — Louis) La taille de l'ARTICLE, posée sur chaque fiche :
// inventaire.attributs.taille = { v, source: "manuel", at }, par patchFicheCorrection({ cle: "taille", portee: "toutes" })
// (publication/lot/corrections.js) — une taille « pour toutes les plateformes » efface aussi les tailles gardées à part
// pour une plateforme (attributs.valeurs_plateformes.<pf>.taille) : elles ne repartiraient plus. Jamais `pointure`.
// ⛔ Un article DÉJÀ à cette taille (même libellé, casse et espaces comprises — memeTexte) ne voit pas sa taille
//    réécrite : elle garde sa source (« vinted_liste » sert la republication Vinted, _shared/vinted-taille-republication.ts) ;
//    seule une taille gardée à part pour une plateforme s'efface alors. Rien à effacer non plus : inchangé.
// ⛔ Une taille vide n'écrit rien.
/** « M », « 38 », « 10 ans » → le texte (espaces du bord retirés), ou null si vide. */
export function lireTaille(brut) {
  const t = String(brut ?? "").trim();
  return t || null;
}
/** La taille de la fiche (attributs.taille.v, ou la valeur nue), « » si aucune. */
const tailleDeLaFiche = (attributs) => {
  const a = attributs && typeof attributs === "object" ? attributs.taille : null;
  return String((a && typeof a === "object" && !Array.isArray(a) ? a.v : a) ?? "").trim();
};
/** Les plateformes pour lesquelles la fiche garde une taille à part (valeurs_plateformes). */
const plateformesAvecTaille = (attributs) => Object.entries(valeursPlateformesDeLaFiche(attributs))
  .filter(([, champs]) => champs && typeof champs === "object" && champs.taille !== undefined).map(([p]) => p);

/** Le plan d'un changement de taille : `changements` disent si la taille s'écrit et quelles tailles à part s'effacent. */
export function planTaille(items, valeur) {
  const cible = lireTaille(valeur);
  if (!cible) return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "taille" })), inchanges: [] };
  const changements = [];
  const inchanges = [];
  for (const item of items ?? []) {
    const avant = tailleDeLaFiche(item?.attributs ?? null);
    const memeTaille = memeTexte(avant, cible);
    const aPart = plateformesAvecTaille(item?.attributs ?? null);
    if (memeTaille && !aPart.length) inchanges.push(item.id);
    else changements.push({ id: item.id, avant: avant || null, apres: cible, ecrireTaille: !memeTaille, aPart, attributs: item?.attributs ?? null });
  }
  return { changements, ignores: [], inchanges };
}

// ── CE QUE LA BARRE ÉCRIT (19/11, Louis) ───────────────────────────────────
// La colonne du champ, et elle seule ; pour le format, attributs.format_colis_lbc
// seul (le trigger inventaire_attributs_fusion fusionne clé par clé : rien
// d'autre n'est écrasé). Aucune de ces écritures ne part vers une annonce.
/** Les colonnes à écrire pour une valeur d'un champ, ou null. */
export function champsAEcrire(champ, valeur) {
  if (champ === "prix") return { prix_vente: valeur };
  if (champ === "quantite") return { quantite: valeur };
  if (champ === "poids") return { poids_g: valeur };
  if (champ === "prix_achat") {
    if (valeur === null) return { prix_achat: null, prix_achat_inconnu: true };
    return Number.isFinite(valeur) && valeur >= 0 ? { prix_achat: valeur, prix_achat_inconnu: false } : null;
  }
  return null;
}

/** Les écritures d'un plan : [{ champs, ids }], une par valeur (par couple valeur + poids pour le format). */
export function ecrituresDuPlan(champ, plan, { maintenant = new Date() } = {}) {
  if (!plan?.changements?.length) return [];
  if (champ === "transporteurs_lbc") {
    // (20/11) Une seule valeur pour tout le lot : une écriture, attributs.transporteurs_lbc seul.
    const cible = plan.changements[0].apres;
    const attributs = cible === TRANSPORTEURS_COMME_LE_COMPTE
      ? { [CLE_TRANSPORTEURS_LBC]: { v: TRANSPORTEURS_COMME_LE_COMPTE, source: "manuel", at: maintenant.toISOString() } }
      : choixTransporteursPourLaFiche(cible, maintenant);
    return attributs ? [{ champs: { attributs }, ids: plan.changements.map((c) => c.id) }] : [];
  }
  if (champ === "format_lbc") {
    return parValeurEtPoids(plan.changements).map((g) => ({
      champs: { attributs: choixFormatPourLaFiche(g.valeur, { poids_g: g.poids_g, maintenant }) },
      ids: g.ids,
    }));
  }
  if (champ === "taille") {
    // (20/11/2026 soir, bloc C de Nico — Louis) La taille : l'écriture de patchFicheCorrection (« toutes »), sans la clé
    // `taille` quand la fiche porte déjà ce libellé (sa source reste) ; une écriture par contenu identique (les tailles
    // gardées à part diffèrent d'une fiche à l'autre).
    const m = new Map();
    for (const c of plan.changements) {
      const { attributs } = patchFicheCorrection({ cle: "taille", valeur: c.apres, portee: PORTEE_TOUTES, attributs: c.attributs ?? null, maintenant });
      if (c.ecrireTaille === false) delete attributs.taille;
      if (!Object.keys(attributs).length) continue;
      const k = cleStable(attributs);
      if (!m.has(k)) m.set(k, { champs: { attributs }, ids: [] });
      m.get(k).ids.push(c.id);
    }
    return [...m.values()];
  }
  const ecritures = [];
  for (const g of parValeur(plan.changements)) {
    const champs = champsAEcrire(champ, g.valeur);
    if (champs) ecritures.push({ champs, ids: g.ids });
  }
  return ecritures;
}

/** Une clé stable d'un objet (clés triées, à toute profondeur) : deux contenus identiques ont la même clé. */
function cleStable(v) {
  if (Array.isArray(v)) return `[${v.map(cleStable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${cleStable(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

// ── PLUSIEURS CHAMPS D'UN COUP (20/11/2026 soir, bloc C de Nico — Louis) ───────────────────────────────────────────
// (20/11/2026 soir, bloc C de Nico — Louis) Louis (Business) devait faire le poids, valider, tout resélectionner, faire
// la taille, valider, tout resélectionner… Désormais : il remplit les champs voulus, voit le récapitulatif, valide UNE
// fois, et sa sélection reste.
// ⛔ Seuls les champs REMPLIS s'appliquent, les autres restent intacts : un champ vide n'est jamais lu comme 0 (prix
//    d'achat : vide = rien, 0 = gratuit, « Je ne sais pas » = NULL + inconnu) ; un champ rempli mais illisible n'est
//    jamais ignoré en silence (`invalides` : la validation attend qu'il soit corrigé ou vidé).
// ⛔ Chaque champ garde SES règles (son plan, inchangé : prix ≥ 1 €, ± sur un article sans prix laissé de côté,
//    quantité ≥ 1, poids 1 g–150 kg, « déjà à jour » non réécrit, format au poids de chaque fiche, transporteurs
//    « manuel » et « Comme le compte ») et SES écritures (ecrituresDuPlan, inchangé).
// ⛔ L'ordre poids → format : un poids ET un format dans la même validation, le format se juge et se pose au NOUVEAU
//    poids de chaque fiche (« Déduit du poids » compris) ; les transporteurs trop lourds aussi.
// ⛔ Une écriture par article au plus, regroupée par contenu identique (lots de 400 dans la barre) ; un article sans
//    rien à changer n'est jamais réécrit ; `attributs` ne porte que les clés qui changent (le déclencheur
//    inventaire_attributs_avant_update fusionne clé par clé).
// ⛔ Un seul champ rempli = exactement les écritures d'avant (ecrituresDuPlan de ce champ).
export const CHAMPS_MASSE = Object.freeze(["prix", "quantite", "taille", "poids", "format_lbc", "transporteurs_lbc", "prix_achat"]);

/**
 * Les saisies de la barre → les valeurs à appliquer (les champs remplis seulement) et les champs remplis mais illisibles.
 * @param {{ prix?: { op?: string, saisie?: string }, quantite?: string, taille?: string, poids?: string,
 *           format_lbc?: string|null, transporteurs_lbc?: string[]|"auto"|null, prix_achat?: { geste?: string, saisie?: string } }} s
 * @returns {{ valeurs: object, invalides: Array<{ champ: string, raison: string }> }}
 */
export function lireSaisiesMasse(s = {}) {
  const valeurs = {};
  const invalides = [];
  const vide = (x) => String(x ?? "").trim() === "";
  if (s?.prix && !vide(s.prix.saisie)) {
    const op = s.prix.op ?? "fixer";
    const v = lireNombre(s.prix.saisie);
    if (v == null || !OPERATIONS_PRIX.includes(op)) invalides.push({ champ: "prix", raison: "illisible" });
    else valeurs.prix = { op, valeur: v };
  }
  if (!vide(s?.quantite)) {
    const v = lireNombre(s.quantite);
    if (v == null || !Number.isInteger(v) || v < 1) invalides.push({ champ: "quantite", raison: "quantite" });
    else valeurs.quantite = v;
  }
  if (!vide(s?.taille)) valeurs.taille = lireTaille(s.taille);
  if (!vide(s?.poids)) {
    const g = lirePoids(s.poids);
    if (g == null) invalides.push({ champ: "poids", raison: "poids" });
    else valeurs.poids = g;
  }
  if (s?.format_lbc != null) {
    const f = choixFormat(s.format_lbc);
    if (f) valeurs.format_lbc = f; else invalides.push({ champ: "format_lbc", raison: "format" });
  }
  const tr = s?.transporteurs_lbc;
  if (tr === TRANSPORTEURS_COMME_LE_COMPTE) valeurs.transporteurs_lbc = TRANSPORTEURS_COMME_LE_COMPTE;
  else if (Array.isArray(tr) && tr.length) {
    const v = transporteursValides(tr);
    if (v) valeurs.transporteurs_lbc = v; else invalides.push({ champ: "transporteurs_lbc", raison: "transporteurs" });
  }
  if (s?.prix_achat?.geste === "inconnu") valeurs.prix_achat = { geste: "inconnu" };
  else if (s?.prix_achat && !vide(s.prix_achat.saisie)) {
    const v = lireNombre(s.prix_achat.saisie);
    if (v == null) invalides.push({ champ: "prix_achat", raison: "illisible" });
    else valeurs.prix_achat = { geste: "fixer", valeur: v };
  }
  return { valeurs, invalides };
}

/** Les fiches vues au poids `grammes` (l'ordre poids → format de planCombine). */
export function fichesAuPoids(items, grammes) {
  return (items ?? []).map((i) => ({ ...i, poids_g: grammes }));
}

/** Les transporteurs cochés qui ne prennent pas le poids d'un article : combien d'articles sont concernés. */
export function articlesTropLourds(items, liste) {
  const noms = Array.isArray(liste) ? liste : [];
  const kg = Math.min(...LBC_TRANSPORTEURS.filter((t) => noms.includes(t.nom)).map((t) => t.kgMax));
  return Number.isFinite(kg) ? (items ?? []).filter((i) => Number(i?.poids_g) > kg * 1000).length : 0;
}

/**
 * Le plan de plusieurs champs d'un coup.
 * @param {object} valeurs  celles de lireSaisiesMasse (`valeurs`) : { prix?: {op, valeur}, quantite?, taille?, poids?,
 *                          format_lbc?, transporteurs_lbc?, prix_achat?: {geste, valeur?} }
 * @param {Array} fiches    les articles sélectionnés
 * @returns {{ plans: object, ecritures: Array<{ champs: object, ids: Array }>, recap: object }}
 *   recap : { selection, aEcrire, dejaAJour, laisses, champs: [{ champ, changent, dejaAJour, ignores, raisons }],
 *             sansPoids, tropLourds, formatAuNouveauPoids }
 */
export function planCombine(valeurs = {}, fiches = [], { maintenant = new Date() } = {}) {
  const v = valeurs ?? {};
  const liste = fiches ?? [];
  const plans = {};
  if (v.prix) plans.prix = planPrix(liste, v.prix.op, v.prix.valeur);
  if (v.quantite != null) plans.quantite = planQuantite(liste, v.quantite);
  if (v.taille != null) plans.taille = planTaille(liste, v.taille);
  if (v.poids != null) plans.poids = planPoids(liste, v.poids);
  // L'ordre poids → format : le nouveau poids, quand il est valable, est celui de chaque fiche pour le format.
  const nouveauPoids = plans.poids && !plans.poids.ignores.length;
  const auPoids = nouveauPoids ? fichesAuPoids(liste, v.poids) : liste;
  if (v.format_lbc != null) plans.format_lbc = planFormatLbc(auPoids, v.format_lbc);
  if (v.transporteurs_lbc != null) plans.transporteurs_lbc = planTransporteursLbc(liste, v.transporteurs_lbc);
  if (v.prix_achat) plans.prix_achat = v.prix_achat.geste === "inconnu" ? planPrixAchat(liste, "inconnu") : planPrixAchat(liste, "fixer", v.prix_achat.valeur);

  // Les écritures de chaque champ (ecrituresDuPlan), réunies par article : les colonnes côte à côte, les clés
  // d'attributs côte à côte (aucun champ ne partage une colonne ni une clé avec un autre).
  const parArticle = new Map();
  for (const champ of CHAMPS_MASSE) {
    if (!plans[champ]) continue;
    for (const e of ecrituresDuPlan(champ, plans[champ], { maintenant })) {
      for (const id of e.ids) {
        const p = parArticle.get(id) ?? {};
        for (const [k, val] of Object.entries(e.champs)) {
          if (k === "attributs") p.attributs = { ...(p.attributs ?? {}), ...val };
          else p[k] = val;
        }
        parArticle.set(id, p);
      }
    }
  }
  // Une écriture par contenu identique, dans l'ordre des articles (celui des écritures d'un seul champ).
  const groupes = new Map();
  const vus = new Set();
  for (const f of liste) {
    const p = parArticle.get(f?.id);
    if (!p || vus.has(f.id)) continue;
    vus.add(f.id);
    const k = cleStable(p);
    if (!groupes.has(k)) groupes.set(k, { champs: p, ids: [] });
    groupes.get(k).ids.push(f.id);
  }
  const ecritures = [...groupes.values()];

  const n = liste.length;
  const laisses = new Set();
  const champs = CHAMPS_MASSE.filter((c) => plans[c]).map((c) => {
    const p = plans[c];
    const changent = p.changements.length;
    const ignores = p.ignores?.length ?? 0;
    const raisons = {};
    for (const x of p.ignores ?? []) { raisons[x.raison] = (raisons[x.raison] ?? 0) + 1; laisses.add(x.id); }
    const dejaAJour = Array.isArray(p.inchanges) ? p.inchanges.length : Math.max(0, n - changent - ignores);
    return { champ: c, changent, dejaAJour, ignores, raisons };
  });
  const recap = {
    selection: n,
    aEcrire: vus.size,
    dejaAJour: Math.max(0, n - vus.size - [...laisses].filter((id) => !vus.has(id)).length),
    laisses: laisses.size,
    champs,
    sansPoids: plans.format_lbc ? auPoids.filter((i) => !(Number(i?.poids_g) > 0)).length : 0,
    tropLourds: plans.transporteurs_lbc && Array.isArray(v.transporteurs_lbc) ? articlesTropLourds(auPoids, v.transporteurs_lbc) : 0,
    formatAuNouveauPoids: Boolean(plans.format_lbc && nouveauPoids),
  };
  return { plans, ecritures, recap };
}
