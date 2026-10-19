// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE ÉCRITE DANS LE TITRE OU LA DESCRIPTION (19/10, demande de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : DeadRoz (Business), 19/10 de 12:17 à 12:56 — une
// cinquantaine de questions « Taille » Beebs remplies à la main sur des jeans
// Levi's (rayon « Autres pantalons (homme) », grille « 32 » … « 64 » + lettres).
// La fiche portait « W30 » (synchro Vinted) et le titre disait tout :
// « … W30 L32 FR40 … », « W36 L34 (46) ». Le serveur savait déjà W30 = FR 40
// (taille-de-service.js, R1, table publiée par Vinted) ; l'écran Publier de
// l'app, lui, ne lisait que tailles.js et posait la question. Même famille :
// Ornella, « Pull Kiabi 24M » — la copie Beebs portait « 24M », la grille
// écrit « 24 mois (86-94 cm) », aucune règle ne faisait le lien.
//
// LA RÈGLE (déterministe, zéro appel IA), dans cet ordre :
//   1. la taille FR écrite : « FR50 », « FR 46 », « W36 L34 (46) » ;
//   2. à défaut, le tour de taille W converti en FR par LA table que Vinted
//      publie (« W30 | FR 40 », FR_PAR_TOUR_DE_TAILLE) — un W absent de la
//      table (W37, W41…) n'est jamais deviné ;
//   3. l'âge en mois : « 24M », « 18 mois » (enfant).
//   Le L (longueur de jambe) ne choisit jamais rien.
// LES GARDE-FOUS :
//   · la valeur de la fiche n'est JAMAIS remplacée par le texte : l'appelant
//     ne vient ici que quand elle ne passe pas la grille, et le texte doit
//     dire la MÊME taille qu'elle (fiche « W29 », titre « FR46 » : doute) ;
//     une valeur de fiche qu'on ne sait pas lire (« EU 38 », « Taille
//     unique ») n'est jamais recouverte ;
//   · le doute ne se tranche pas : deux tailles différentes dans le texte,
//     une fourchette (« FR 40/42 », « 12-18 mois »), un W hors table, du FR
//     et des mois à la fois → null, la question reste posée ;
//   · la valeur rendue est une option EXACTE de la grille de la plateforme et
//     du rayon (placer), et une seule : deux options possibles = doute.
// ⛔ Jamais « taille 38 » nu, « T38 », « EU 38 », « UK », « US » : le pays d'un
//    nombre nu n'est pas sûr (pour Vinted femme, FR 40 = EU 38).
// ⛔ Jamais les années (« 2 ans » : garantie, âge d'usage…), jamais « 1M »
//    (un mètre), jamais un mois « porté 3 mois ».
// ⛔ La fiche n'est jamais réécrite : seule la valeur servie à la plateforme.
//
// ES module pur (Deno + Node + Vite), imports relatifs sans dépendance.
import { tailleDansGrille } from "./tailles.js";
import { FR_PAR_TOUR_DE_TAILLE } from "./taille-de-service.js";

// Les âges en mois d'une étiquette enfant (childSizes : Naissance, 1 … 36 mois).
const MOIS_ETIQUETTE = new Set([1, 3, 6, 9, 12, 18, 24, 36]);
// « 24M » compact : sans « 1M » (un mètre de long, une écharpe).
const MOIS_COMPACTS = new Set([3, 6, 9, 12, 18, 24, 36]);
const FR_MIN = 30, FR_MAX = 66;   // tailles adultes françaises (Beebs : 32 … 64)
const W_MIN = 23, W_MAX = 54;     // même bornes que lireTourDeTaille (tailles.js)

const nfc = (t) => String(t ?? "").normalize("NFC");

// Un nombre suivi d'une unité n'est pas une taille (« FR 48h », « FR 40 € »).
const UNITE_APRES = "(?!\\d|[.,]\\d|\\s?(?:h\\b|heures?\\b|cm\\b|mm\\b|kg\\b|g\\b|€|eur\\b|euros?\\b|ml\\b|%|ans?\\b|mois\\b|j\\b|jours?\\b))";
const RE_FR = new RegExp(`(?<![\\p{L}\\p{N}])fr\\s?(\\d{2})${UNITE_APRES}(\\s?[/–-]\\s?(?:fr\\s?)?\\d{2}(?!\\d))?`, "giu");
const RE_W = /(?<![\p{L}\p{N}])w\s?(\d{2})(?!\d)(\s?[/–-]\s?(?!l)w?\s?\d{2}(?!\d))?/giu;
// « W36 L34 (46) », « W36 (46) » : le nombre entre parenthèses collé à un W.
const RE_W_PARENTHESES = /(?<![\p{L}\p{N}])w\s?\d{2}(?:\s?[/x-]?\s?l\s?\d{2})?\s?\(\s?(?:fr\s?)?(\d{2})\s?\)/giu;
const RE_MOIS_COMPACT = /(?<![\p{L}\p{N}.,])(\d{1,2})m(?![\p{L}\p{N}])/giu;
const RE_MOIS_TRANCHE = /(?<![\p{L}\p{N}.,])(\d{1,2})\s?(?:-|–|\/|à|a)\s?(\d{1,2})\s?(?:mois\b|m(?![\p{L}\p{N}]))/giu;
const RE_MOIS = /(?<![\p{L}\p{N}.,])(\d{1,2})\s?mois\b/giu;
// « porté 3 mois », « acheté il y a 6 mois », « garantie 24 mois » : une durée.
const DUREE_AVANT = /(?:port[ée]e?s?|utilis[ée]e?s?|achet[ée]e?s?|servi|mis|mise|depuis|pendant|durant|il y a|garanti[e]?|garantie de|seulement|dès|à partir de|a partir de|après|apres|moins de|plus de|environ|que)\s+(?:\p{L}+\s+)?$/iu;

/**
 * Ce que les textes du vendeur disent de la taille.
 * @param {unknown[]|unknown} textes — titre, description (fiche, copie)
 * @returns {{ fr:number[], w:number[], wHorsTable:number[], mois:number[], doute:string|null }}
 */
export function lireTaillesDuTexte(textes) {
  const fr = new Set(), w = new Set(), wHors = new Set(), mois = new Set();
  let doute = null;
  for (const brut of (Array.isArray(textes) ? textes : [textes])) {
    const t = nfc(brut);
    if (!t.trim()) continue;
    for (const m of t.matchAll(RE_FR)) {
      const n = Number(m[1]);
      if (n < FR_MIN || n > FR_MAX) continue;
      if (m[2]) doute ??= `fourchette « ${m[0].trim()} »`;
      fr.add(n);
    }
    for (const m of t.matchAll(RE_W_PARENTHESES)) {
      const n = Number(m[1]);
      if (n >= FR_MIN && n <= FR_MAX) fr.add(n);
    }
    for (const m of t.matchAll(RE_W)) {
      const n = Number(m[1]);
      if (n < W_MIN || n > W_MAX) continue;
      if (m[2]) doute ??= `deux tours de taille « ${m[0].trim()} »`;
      if (FR_PAR_TOUR_DE_TAILLE[n] != null) w.add(n); else wHors.add(n);
    }
    // Les fourchettes de mois d'abord (« 12-18 mois », « 6-9M ») : un doute.
    const tranches = [];
    for (const m of t.matchAll(RE_MOIS_TRANCHE)) {
      tranches.push([m.index, m.index + m[0].length]);
      doute ??= `fourchette « ${m[0].trim()} »`;
    }
    const dansTranche = (i) => tranches.some(([a, b]) => i >= a && i < b);
    const noterMois = (m, permis) => {
      if (dansTranche(m.index)) return;
      if (DUREE_AVANT.test(t.slice(Math.max(0, m.index - 30), m.index))) return;
      const n = Number(m[1]);
      if (permis.has(n)) mois.add(n);
      else doute ??= `âge « ${m[0].trim()} » hors des étiquettes`;
    };
    for (const m of t.matchAll(RE_MOIS)) noterMois(m, MOIS_ETIQUETTE);
    for (const m of t.matchAll(RE_MOIS_COMPACT)) {
      // « 9M » d'une botte américaine ou « 2M » d'une longueur : seulement les
      // âges d'étiquette ; un autre nombre n'est pas un doute, c'est autre chose.
      const n = Number(m[1]);
      if (MOIS_COMPACTS.has(n)) noterMois(m, MOIS_COMPACTS);
    }
  }
  return { fr: [...fr], w: [...w], wHorsTable: [...wHors], mois: [...mois], doute };
}

// Le signal d'UNE valeur (la taille de la fiche, ou de la copie) :
//   { fr, w } | { mois } | { doute } | { illisible: true } | null (vide).
function lireValeur(valeur) {
  const v = nfc(valeur).trim();
  if (!v) return null;
  const s = v.toLowerCase().replace(/\s+/g, " ");
  let m = /^w\s?(\d{2})(?:\s?(?:\/|x)?\s?l\s?\d{2})?$/.exec(s) || /^(\d{2})\s?w(?:\s?(?:\/|x)?\s?\d{2}\s?l)?$/.exec(s);
  if (m) {
    const w = Number(m[1]);
    const fr = FR_PAR_TOUR_DE_TAILLE[w];
    return fr != null ? { fr, w: [w] } : { doute: `W${w} absent de la table publiée par Vinted` };
  }
  m = /^fr\s?(\d{2})$/.exec(s);
  if (m) return { fr: Number(m[1]), w: [] };
  m = /^(\d{1,2})\s?(?:m|mois)$/.exec(s);
  if (m && MOIS_ETIQUETTE.has(Number(m[1])) && !(s.endsWith("m") && Number(m[1]) === 1)) return { mois: Number(m[1]) };
  return { illisible: true };
}

// Le signal du TEXTE, cohérent ou en doute.
function signalDuTexte(textes) {
  const l = lireTaillesDuTexte(textes);
  if (l.doute) return { doute: l.doute };
  const adulte = l.fr.length || l.w.length || l.wHorsTable.length;
  if (adulte && l.mois.length) return { doute: "une taille adulte et un âge en mois" };
  if (l.mois.length > 1) return { doute: `plusieurs âges (${l.mois.map((n) => `${n} mois`).join(", ")})` };
  if (l.mois.length === 1) return { mois: l.mois[0] };
  if (l.fr.length > 1) return { doute: `plusieurs tailles FR (${l.fr.join(", ")})` };
  const frDesW = [...new Set(l.w.map((x) => FR_PAR_TOUR_DE_TAILLE[x]))];
  if (l.fr.length === 1) {
    const fr = l.fr[0];
    const contraires = l.w.filter((x) => FR_PAR_TOUR_DE_TAILLE[x] !== fr);
    if (contraires.length) return { doute: `W${contraires[0]} = FR ${FR_PAR_TOUR_DE_TAILLE[contraires[0]]}, le texte dit FR ${fr}` };
    return { fr, w: l.w, source: "fr" };
  }
  // Pas de FR écrit : le W seul, s'il est sans ambiguïté.
  if (l.wHorsTable.length) return { doute: `W${l.wHorsTable[0]} absent de la table publiée par Vinted` };
  if (frDesW.length > 1) return { doute: `plusieurs tours de taille (${l.w.map((x) => `W${x}`).join(", ")})` };
  if (frDesW.length === 1) return { fr: frDesW[0], w: l.w, source: "w" };
  return null;
}

// Placement par défaut (serveur) : tailles.js, puis l'âge d'une grille qui
// l'écrit suivi de sa stature entre parenthèses (Beebs « 24 mois (86-94 cm) »)
// — la partie hors parenthèses, une seule option.
function placerServeur(valeur, grille) {
  const r = tailleDansGrille(valeur, grille);
  if (r) return r.valeur;
  const age = /^(\d{1,2}) mois$/.exec(valeur);
  if (!age) return null;
  const hors = (Array.isArray(grille) ? grille : []).map((o) => String(o ?? "").trim()).filter((o) => {
    const p = /^(.*?)\s*\([^()]*\)\s*$/.exec(o);
    return p && tailleDansGrille(valeur, [p[1].trim()]);
  });
  return hors.length === 1 ? hors[0] : null;
}

// Une pointure n'est jamais déduite ici : « FR 40 » d'un jean posé sur une
// grille de pointures serait faux, et un W n'est jamais une pointure.
const CHAUSSURES = /pointure|shoe|chaussure|basket|sneaker|bottes?\b|bottine|boots?\b|sandale|escarpin|mocassin|derby|derbies|tongs?\b|chausson|ballerine|espadrille|mules?\b/iu;
/** Le champ ou le rayon est-il celui d'une chaussure ? */
export function estChampChaussures(champ, chemin) {
  const c = Array.isArray(chemin) ? chemin.join(" > ") : String(chemin ?? "");
  return CHAUSSURES.test(String(champ ?? "")) || CHAUSSURES.test(c);
}

/**
 * LA fonction : la taille que la fiche et les textes du vendeur disent, écrite
 * comme la grille l'écrit — ou null (rien d'écrit, ou doute : la question reste).
 * @param {{ valeur?: unknown, textes?: unknown[], grille: unknown[], placer?: (v:string)=>string|null, champ?: unknown, chemin?: unknown }} p
 *   `valeur` : la taille portée par la copie (déjà jugée hors grille par
 *   l'appelant, ou vide) ; `placer` : la traduction de l'appelant (l'app passe
 *   son jugement, childSizes compris) ; par défaut tailles.js + parenthèses ;
 *   `champ`, `chemin` : la clé ou le libellé du champ, le rayon (une pointure,
 *   un rayon de chaussures : jamais).
 * @returns {{ valeur:string, motif:string, regle:"fr"|"w"|"mois" } | { doute:string } | null}
 */
export function tailleDuTexte({ valeur = "", textes = [], grille, placer = null, champ = null, chemin = null }) {
  if (estChampChaussures(champ, chemin)) return null;
  const opts = (Array.isArray(grille) ? grille : []).map((o) => String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
  if (!opts.length) return null;
  const poser = placer ?? ((v) => placerServeur(v, opts));
  const fiche = lireValeur(valeur);
  if (fiche?.illisible) return null;            // la fiche dit autre chose : jamais recouverte
  if (fiche?.doute) return { doute: fiche.doute };
  const texte = signalDuTexte(textes);
  if (texte?.doute) return { doute: texte.doute };
  const sig = fiche ?? texte;
  if (!sig) return null;
  if (fiche && texte) {
    const meme = ("mois" in fiche) ? texte.mois === fiche.mois : (texte.fr != null && texte.fr === fiche.fr);
    if (!meme) return { doute: `la fiche dit « ${nfc(valeur).trim()} », le texte une autre taille` };
  }
  let candidats, regle, motif;
  if ("mois" in sig) {
    candidats = [`${sig.mois} mois`];
    regle = "mois";
    motif = `${sig.mois} mois`;
  } else {
    const ws = [...new Set([...(fiche?.w ?? []), ...(texte?.w ?? [])])];
    candidats = [`FR ${sig.fr}`, String(sig.fr), ...ws.map((x) => `W${x}`)];
    regle = texte?.source === "fr" ? "fr" : "w";
    motif = regle === "fr" ? `FR ${sig.fr} écrit` : `W${ws[0]} = FR ${sig.fr} (table publiée par Vinted)`;
  }
  const places = [...new Set(candidats.map((c) => poser(c)).filter(Boolean))];
  if (places.length > 1) return { doute: `plusieurs options possibles (${places.join(", ")})` };
  if (!places.length) return null;
  const d_ou = fiche && texte ? "fiche et texte d'accord" : fiche ? "taille de la copie" : "lu dans le texte";
  return { valeur: places[0], motif: `${motif} — ${d_ou}`, regle };
}
