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
// Pur, sans React ni réseau (scripts/modifier-en-lot-selftest.mjs).
import { lirePoidsSaisi } from "../publication/lot/regles.js";
import { FORMATS_LBC, choixFormatPourLaFiche, formatDeLaFiche } from "../../supabase/functions/_shared/colis-de-la-fiche.js";
import { prixAchatConnu, prixAchatNum } from "../utils/comptabilite.js";

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
// la main à un autre poids repart au calcul (_shared/colis-de-la-fiche.js).
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
  if (champ === "format_lbc") {
    return parValeurEtPoids(plan.changements).map((g) => ({
      champs: { attributs: choixFormatPourLaFiche(g.valeur, { poids_g: g.poids_g, maintenant }) },
      ids: g.ids,
    }));
  }
  const ecritures = [];
  for (const g of parValeur(plan.changements)) {
    const champs = champsAEcrire(champ, g.valeur);
    if (champs) ecritures.push({ champs, ids: g.ids });
  }
  return ecritures;
}
