// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE DE LA FICHE CONTREDIT-ELLE LA TAILLE ÉCRITE DANS LE TITRE ? (19/11, décision de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : compte 8ac5bbda, 18/11 — des jeans dont la taille Vinted recopiée sur la fiche ne dit pas ce
// que le titre écrit : « … Taille FR50 (20 P) … » / fiche « 4XL / 48 / 20 » ; « … Taille 20L FR48 … » / « XXXL / 46 /
// 18 » ; « Levi's Taille W28 FR 38 … » / « S / 36 / 8 » ; « Pikeur Taille FR 42 … » / « L / 40 / 12 » ; « Lee Cooper
// W31 L34 » / « W28 | FR 38 ». L'écran de publication en lot doit le DIRE (jamais corriger : la personne tranche).
//
// LE CONTRAT :
//   tailleContreditTitre({ titre, taille, rayon = null })
//     → null | { taille_fiche, taille_titre, systeme }
//   · titre  : le titre de la fiche ou de la copie (texte) ;
//   · taille : la taille de la fiche ou de la copie, telle qu'elle est écrite (« 4XL / 48 / 20 », « W28 | FR 38 »,
//              « S / 36 », « 38 - M », « M », « 38 », « EU 38 », « 42,5 »…) ;
//   · rayon  : facultatif — le chemin de catégorie (texte « A > B > C » ou tableau) ou un identifiant (« MEN_JEANS » ;
//              un identifiant sans lettre ne dit rien et compte comme « pas de rayon »). Il distingue la chaussure (les
//              nombres sont des pointures), le bas (jean, pantalon : un nombre nu peut être un W), l'enfant.
//   · systeme ∈ 'W' | 'FR' | 'EU' | 'IT' | 'UK' | 'US' | 'pointure' | 'lettres' :
//       W        tour de taille en pouces (« W31 », et dans un bas « 33W », « 33/34 ») — la longueur L ne compte jamais ;
//       FR       taille française de vêtement, paire de 30 à 66 : « FR 50 », « taille 38 », « T. 38 », le nombre seul
//                d'une fiche (« 38 »), le nombre d'une étiquette Vinted « S / 36 / 8 », Beebs « S / 36 », LBC « 36 - S » ;
//       EU, IT, UK, US   écrits avec leur préfixe ou leur suffixe (« EU 38 », « 38 EU », « UK 10 », « IT 42 » en
//                capitales), et le dernier nombre d'une étiquette Vinted femme (« S / 36 / 8 » : UK 8) ;
//       pointure dans un rayon de chaussures (ou un titre de chaussures sans rayon) : « taille 42 », « pointure 42 »,
//                « EU 42 », « FR 42 », « 42,5 », « 42 1/2 » ;
//       lettres  « taille M », « size L », et les lettres longues isolées en capitales (« XL », « XXL », « 3XL »,
//                « XS ») ; XXL ≡ 2XL, XXXL ≡ 3XL, 4XL ≡ XXXXL (deux écritures, une taille).
//   · taille_titre, taille_fiche : la valeur lue dans CE système, écrite « FR 50 », « W31 », « EU 38 », « UK 10 »,
//     « 42,5 » (pointure), « XL » / « 4XL » (lettres).
//
// LA RÈGLE : on ne compare que DANS LE MÊME SYSTÈME (FR avec FR, W avec W…), jamais une conversion (W28 n'est jamais
// comparé à FR 38). Contradiction = au moins un système commun au titre et à la fiche, et AUCUN d'accord ; le premier
// système en désaccord est rendu, dans l'ordre W, FR, EU, IT, UK, US, pointure, lettres.
// LES GARDE-FOUS (le doute ne se tranche pas : null) :
//   · un système d'accord suffit à ne rien dire (« W42 L30 FR 42 » / « W42 | FR 52 » : le titre se contredit
//     lui-même, la fiche porte son W — jamais « la fiche est fausse ») ;
//   · le titre qui dit deux tailles (deux valeurs d'un système, une fourchette « FR 40/42 », « taille 42 44 »,
//     « W30-32 », « S/M », « M ou L », « 38 2/3 ») → null, quel que soit le système ;
//   · la fiche qu'on ne lit pas sûrement (« S/M », « 33/34 », une étiquette « M / 40 » qui ne suit pas la table des
//     plateformes, deux nombres nus) → null ;
//   · jamais un nombre sans préfixe ni mot « taille » (année, référence « #48 », modèle « 501 », « Air Max 90 »,
//     « 3 pièces », « lot de 2 ») ; jamais un nombre suivi d'une unité (« 40 cm », « 8 ans », « 24 mois », « 40 x 60
//     cm », « 48h ») ; jamais le « tour de taille 80 » ; jamais « T M » ni une lettre seule S / M / L hors du mot
//     « taille » ; jamais « it » en minuscules (l'anglais) ; jamais « Made in UK » ;
//   · un BAS (jean, pantalon… par le rayon OU le titre) : le nombre NU (« taille 32 », fiche « 32 ») peut être un W ou
//     un FR — il n'est jamais lu ; l'étiquette composite, elle, se lit (sa lettre dit que le nombre est FR) ;
//   · une POINTURE n'est lue que dans un rayon de chaussures, ou un titre de chaussures sans rayon ; un titre de
//     chaussures dans un autre rayon, un rayon ou un titre d'ENFANT : aucun nombre nu (les âges, « 8 ans », ne sont
//     jamais comparés) ; hors chaussure, un nombre impair ou à demi (« 39 », « 38,5 ») n'est pas un FR ;
//   · un HOMME (rayon ou titre) : aucun nombre nu (costume EU 46-56 ou tour de poitrine UK 36-46, col de chemise) ;
//   · le titre qui doute lui-même (« correspond », « convient », « environ », « taille petit », « ado », « adulte »,
//     « estimation »), un LOT, une lettre-adjectif (« Poches XXL », « col XL »), un FR et une lettre que la table
//     n'associe pas (« T.44 (XL) ») → null.
// ⚠️ LA FAMILLE « +2 » (rejeu du 19/11, publications des 30 jours) : 200 des 306 fiches contredites écrivent dans le
//    titre le FR de l'étiquette PLUS 2 (« taille 40 » / « M / 38 / 10 ») — dont les quatre cas FR de 8ac5bbda. Si le
//    nombre de l'étiquette Vinted est un EU (tailles.js : « M / 38 / 10 » = EU 38 = FR 40), ce ne sont pas des erreurs :
//    lire alors ce nombre en « EU » dans lireFiche (une ligne) — décision de Nico, jamais ici.
// La table lue chez les plateformes, LETTRE_FEMME_PAR_FR (taille-de-service.js : Vinted, Leboncoin, Beebs), sert
// SEULEMENT à reconnaître le nombre FR d'une étiquette composite (« S / 36 / 8 » : 36 est le S) — jamais à convertir.
//
// ES module pur (Deno + Node + Vite), imports relatifs de modules purs, aucune API d'environnement.
import { LETTRE_FEMME_PAR_FR } from "./taille-de-service.js";
import { estChampChaussures, contexteEnfant, contexteBas } from "./taille-du-texte.js";

/** Les systèmes comparés, dans l'ordre où le premier désaccord est rendu. */
export const SYSTEMES_CONTREDITS = Object.freeze(["W", "FR", "EU", "IT", "UK", "US", "pointure", "lettres"]);

// Le texte tel qu'il s'affiche : les entités HTML recopiées des plateformes (« 36&#x2F;38 ») redeviennent leur signe.
const ENTITES = { "&#x2f;": "/", "&#47;": "/", "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };
const nfc = (t) => String(t ?? "").normalize("NFC").replace(/&(?:#x2f|#47|amp|quot|#39|#x27|nbsp);/gi, (e) => ENTITES[e.toLowerCase()]);
const nombre = (s) => Number(String(s).replace(",", "."));

// ── Les lettres : XXL ≡ 2XL, XXXL ≡ 3XL, 4XL ≡ XXXXL ─────────────────────────────────────────────────────────────────
const MOTS_LETTRE = { small: "S", medium: "M", large: "L", "x-large": "XL", xlarge: "XL", "xx-large": "XXL", xxlarge: "XXL", "x-small": "XS", xsmall: "XS" };
function canonLettre(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (MOTS_LETTRE[s]) return MOTS_LETTRE[s];
  let m = /^([2-9])x([sl])$/.exec(s);
  if (m) return "X".repeat(Number(m[1])) + m[2].toUpperCase();
  m = /^x{0,8}[sl]$/.exec(s);
  if (m) return s.toUpperCase();
  return s === "m" ? "M" : null;
}
// L'écriture rendue : « XXXL » jusqu'à trois X, « 4XL » au-delà (l'écriture de Vinted).
const ecrireLettre = (c) => {
  const m = /^(X+)([SL])$/.exec(c);
  return m && m[1].length >= 4 ? `${m[1].length}X${m[2]}` : c;
};

// ── Les contextes ─────────────────────────────────────────────────────────────────────────────────────────────────
const BAS_TITRE = /(?<![\p{L}\p{N}])(?:jeans?|pantalons?|chinos?|denims?|shorts?|bermudas?|cargos?|joggings?|joggers?|leggings?|jeggings?|trousers|pants|salopettes?|corsaires?|pantacourts?)(?![\p{L}\p{N}])/iu;
const CHAUSSURE_TITRE = /(?<![\p{L}\p{N}])(?:chaussures?|baskets?|sneakers?|bottes|bottines?|boots|escarpins?|sandales?|mocassins?|derbys?|derbies|tongs|chaussons?|ballerines?|espadrilles?|mules|nu-pieds|richelieus?|pointure|crocs|claquettes?|santiags?|rangers|trainers|shoes)(?![\p{L}\p{N}])/iu;
const ENFANT_TITRE = /(?<![\p{L}\p{N}])(?:enfants?|filles?|fillettes?|gar[cç]ons?|b[ée]b[ée]s?|kids?|juniors?|ados?|adolescente?s?|girls?|boys?|youth|naissance|nourrissons?)(?![\p{L}\p{N}])/iu;
// (rejeu du 19/11) L'HOMME : un nombre nu y est un costume (EU 46-56 ou tour de poitrine UK 36-46 : « Costume taille
// 40 homme » / fiche « 50 »), un col de chemise (37-46) — jamais sûrement un FR.
const HOMME_TITRE = /(?<![\p{L}\p{N}])(?:hommes?|men|mens|man|masculin)(?![\p{L}\p{N}])/iu;
const HOMME_RAYON = /(?<![\p{L}\p{N}])(?:hommes?|homme|men|mens|man|masculin)(?![\p{L}\p{N}])|(?:^|[^\p{L}])MEN_/iu;
function contextes(titre, rayon) {
  const r = Array.isArray(rayon) ? rayon.map((x) => nfc(x)).join(" > ") : nfc(rayon);
  const parlant = /\p{L}/u.test(r);              // un identifiant sans lettre ne dit rien
  const t = nfc(titre);
  const basTitre = BAS_TITRE.test(t), chaussureTitre = CHAUSSURE_TITRE.test(t), enfantTitre = ENFANT_TITRE.test(t);
  const chaussure = parlant ? estChampChaussures(null, r) : (chaussureTitre && !basTitre);
  const bas = !chaussure && (basTitre || (parlant && contexteBas(r, "")));
  const enfant = enfantTitre || (parlant && contexteEnfant(r));
  const homme = HOMME_TITRE.test(t) || (parlant && HOMME_RAYON.test(r));
  // Un nombre nu ne se lit que dans un vêtement de femme adulte sûr, ou une chaussure sûre.
  const nuDouteux = bas || enfant || homme || (!chaussure && chaussureTitre);
  return { chaussure, bas, enfant, homme, nuDouteux };
}

// (rejeu du 19/11) LE TITRE QUI DOUTE LUI-MÊME : « Taille L mais correspond plus à un M/S », « taille 38 taille petit »,
// « taille XL correspondant au 44 », « Taille XL enfant ou S adulte », « XL Ado S-M Homme », « taille 38 environ »,
// « Taille M (estimation d'après mesures) », « Taille S (Taille grand, convient M/L) » — et le LOT (plusieurs articles,
// plusieurs tailles : « Lot Ferrari 3 pièces veste L + veste XL »).
const TITRE_QUI_DOUTE = /(?<![\p{L}\p{N}])(?:lots?|correspond\p{L}*|convien\p{L}*|conven\p{L}*|[ée]quiva\p{L}*|environ|approx\p{L}*|estimation|estim[ée]e?|fits\s+(?:like|small|large|big|true)|ado|ados|adulte|taill(?:e|é|ée)s?\s+(?:petit|grand|large|serr)\p{L}*|s['’]adapte|peut\s+aller)(?![\p{L}\p{N}])/iu;

// ── LE TITRE ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Un nombre suivi d'une unité, d'un « x » de dimensions, d'une décimale ou d'un autre chiffre n'est pas une taille.
const PAS_UNE_TAILLE_APRES = /^(?:\s?(?:cm|mm|m²|kg|g|gr|ml|cl|l|h|heures?|ans?|mois|months?|years?|yrs?|jours?|j|pi[eè]ces?|pcs|pc|go|gb|mo|w|watts?|v|volts?|mah|km|places?|personnes?|pers)(?![\p{L}\p{N}])|\s?[€%"”$£°]|\s?[x×*]\s?\d|[.,]\d|\d)/iu;
const FRACTION_APRES = /^\s?(?:[12]\/3|⅓|⅔)(?![\p{N}])/u;
const DEMI_APRES = /^\s?(?:1\/2|½)(?![\p{N}])/u;
// Une seconde valeur du MÊME système collée à la première : « 40/42 », « 40-42 », « 40 à 42 », « 40 ou 42 », « 42 44 »,
// « 38 (40) » — jamais « US 9 / UK 8 » (deux systèmes, une seule taille).
const PREFIXE_DU = { fr: "fr", eu: "eur?", eur: "eur?", uk: "uk", us: "us", it: "it", pointure: "pointure", nu: "t|taille|tailles|size|tg|talla|taglia|fr" };
const SECONDES = new Map();
function secondeValeur(suite, cle) {
  if (!SECONDES.has(cle)) {
    const pre = PREFIXE_DU[cle] ?? PREFIXE_DU.nu;
    SECONDES.set(cle, new RegExp(
      `^\\s?(?:[/–—&-]|\\s(?:à|a|ou|et|or|to)\\s)?\\s?(?:(?:${pre})\\s?[:.]?\\s?)?\\d{1,2}(?![\\p{N}])|^\\s?\\(\\s?(?:(?:${pre})\\s?)?\\d{2}\\s?\\)`, "iu"));
  }
  return SECONDES.get(cle).test(suite);
}
const TOUR_DE_AVANT = /tours?\s+de\s+(?:taille\s+)?$/iu;
const MADE_IN_AVANT = /(?:made\s+in|fabriqu[ée]e?s?\s+(?:au|aux|en))\s+$/iu;
const MOTS_TAILLE = new Set(["taille", "tailles", "size", "talla", "taglia", "tg", "t"]);

// [1] préfixe ; [2] nombre — « FR 50 », « FR50 », « T. 38 », « taille : 38 », « pointure 42 », « UK 10 ».
const RE_PREFIXE = /(?<![\p{L}\p{N}#'’])(fr|eur|eu|uk|us|pointure|taille|tailles|size|talla|taglia|tg|t)\s?[:.]?\s?(\d{1,2}(?:[.,]5)?)(?![\p{N}])/giu;
// « IT 42 » en capitales seulement (l'anglais « it »).
const RE_IT = /(?<![\p{L}\p{N}#'’])IT\s?[:.]?\s?(\d{2})(?![\p{N}])/gu;
// Le suffixe : « 38 EU », « 38FR », « 10 UK », « 42 IT » (IT en capitales).
const RE_SUFFIXE = /(?<![\p{L}\p{N}#.,/])(\d{1,2}(?:[.,]5)?)\s?(fr|eur|eu|uk|us|it)(?![\p{L}\p{N}])/giu;
// Le tour de taille : « W31 », « W 31 », « W31/L34 » ; « W30/32 », « W30-W32 » = deux tours.
const RE_W = /(?<![\p{L}\p{N}#])w\s?(\d{2})(?![\p{N}])/giu;
const W_SECOND = /^\s?[/–—-]\s?(?!l)w?\s?\d{2}(?![\p{N}])/iu;
// « W36 L34 (46) », « W36 (46) » : le FR entre parenthèses collé au W.
const RE_W_PARENTHESES = /(?<![\p{L}\p{N}#])w\s?\d{2}(?:\s?[/x-]?\s?l\s?\d{2})?\s?\(\s?(?:fr\s?)?(\d{2})\s?\)/giu;
// Dans un bas seulement : « 33W », « 33/34 », « 33x34 » (la longueur ne compte pas).
const RE_W_APRES = /(?<![\p{L}\p{N}.,#])(\d{2})\s?w(?![\p{L}\p{N}])/giu;
const RE_PAIRE_WL = /(?<![\p{L}\p{N}.,/#])(\d{2})\s?[/x×]\s?(\d{2})(?![\p{L}\p{N}.,/]|\s?(?:cm|mm|€|eur|euros?|kg|g)(?![\p{L}]))/giu;
const RE_FOURCHETTE_FR = /(?<![\p{L}\p{N}.,/#])(\d{2})\s?[/–-]\s?(\d{2})(?![\p{N}])/gu;
// Les lettres : après « taille / size » (toutes), ou isolées en capitales (les longues seulement).
const LETTRES = "xxxxs|xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|[2-9]xl|[2-4]xs|small|medium|large|x-large|xx-large|x-small";
const RE_LETTRE_MOT = new RegExp(`(?<![\\p{L}\\p{N}])(?:taille|size|talla|taglia|tg)\\s?[:.]?\\s?(${LETTRES})(?![\\p{L}\\p{N}'’-])`, "giu");
const RE_LETTRE_SEULE = /(?<![\p{L}\p{N}#'’-])(XXXXS|XXXS|XXS|XS|XL|XXL|XXXL|XXXXL|[2-9]XL|[2-4]XS)(?![\p{L}\p{N}'’])/gu;
// Une seconde lettre collée (« M/L », « S-M », « M ou L », « L XL », « S 36 M »), une barre suivie d'un mot (« L/CL »,
// « L US / XL »), une fourchette chiffrée (« L (42/44) », « XL / 42-44 », « S 36/38 », « L (14/16) ») : deux tailles.
const LETTRE_SECONDE = new RegExp(`^\\s?(?:[/–—&-]|\\s(?:ou|or|et|à|a)\\s|\\s)?\\s?(?:\\(?\\d{2}\\)?\\s?)?(?:${LETTRES})(?![\\p{L}\\p{N}])|^\\s*/\\s*\\p{L}|^\\s?[(/–-]?\\s?\\d{1,2}\\s?(?:[/–-]|à|a)\\s?\\d{1,2}(?![\\p{N}])`, "iu");
const LETTRE_AVANT = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${LETTRES})\\s?(?:[/–—&-]|\\s(?:ou|or|et|à|a)\\s|\\s)?\\s?$|/\\s?$`, "iu");
// « Poches XXL », « col XXL », « logo XL » : la lettre isolée est un adjectif, pas une taille.
const ADJECTIF_AVANT = /(?:poches?|col|cols|capuche|logos?|format|oversized?|effet|manches?|mailles?|sac|[ée]charpe|motifs?|carreaux|imprim[ée]s?|version|mod[eè]le|boutons?|n[oœ]euds?|fleurs?|pois|lunettes|volume|cabas|coussin|plaid|serviette|pochette|trousse)\s+$/iu;

const W_MIN = 23, W_MAX = 54, L_MIN = 26, L_MAX = 38;
const frVetement = (n) => Number.isInteger(n) && n % 2 === 0 && n >= 30 && n <= 66;
const pointureOk = (n) => n >= 15 && n <= 50 && Number.isInteger(n * 2);

function lireTitre(titre, ctx) {
  const vals = new Map();   // système → Set de valeurs
  let doute = null;
  const noter = (sys, v) => { if (!vals.has(sys)) vals.set(sys, new Set()); vals.get(sys).add(v); };
  const t = nfc(titre);
  const apres = (m) => t.slice(m.index + m[0].length, m.index + m[0].length + 16);
  const avant = (m, n = 30) => t.slice(Math.max(0, m.index - n), m.index);

  // Le système d'un nombre écrit avec un préfixe ou un suffixe, ou null (ce n'est pas une taille sûre).
  const systemeDe = (cle, n) => {
    if (MOTS_TAILLE.has(cle)) {
      if (ctx.chaussure) return pointureOk(n) ? "pointure" : null;
      if (ctx.nuDouteux) return null;              // bas : W ou FR ? enfant, chaussure d'un autre rayon : on ne sait pas
      return frVetement(n) ? "FR" : null;
    }
    if (cle === "pointure") return ctx.chaussure && pointureOk(n) ? "pointure" : null;
    if (cle === "fr" || cle === "eu" || cle === "eur") {
      if (ctx.chaussure) return pointureOk(n) ? "pointure" : null;
      if (cle === "fr") return frVetement(n) ? "FR" : null;
      return n >= 15 && n <= 66 ? "EU" : null;
    }
    if (cle === "uk" || cle === "us") return n >= 0 && n <= 54 ? cle.toUpperCase() : null;
    if (cle === "it") return Number.isInteger(n) && n >= 34 && n <= 66 ? "IT" : null;
    return null;
  };
  const lireNombre = (m, cleBrute, brut) => {
    const cle = cleBrute.toLowerCase();
    const suite = apres(m);
    if (MADE_IN_AVANT.test(avant(m))) return;
    if (MOTS_TAILLE.has(cle)) {
      if (TOUR_DE_AVANT.test(avant(m, 20))) return;
      // « taille 38 EU » : le suffixe dit le système (lu par RE_SUFFIXE).
      if (/^\s?(?:fr|eur?|uk|us|IT)(?![\p{L}\p{N}])/iu.test(suite)) return;
    }
    let n = nombre(brut);
    if (FRACTION_APRES.test(suite)) {
      if (systemeDe(cle, n)) doute ??= `fraction « ${(m[0] + suite).trim().slice(0, 12)} »`;
      return;
    }
    if (DEMI_APRES.test(suite)) n += 0.5;
    else if (PAS_UNE_TAILLE_APRES.test(suite)) return;
    const sys = systemeDe(cle, n);
    if (!sys) return;
    if (secondeValeur(suite, MOTS_TAILLE.has(cle) ? "nu" : cle)) { doute ??= `deux tailles « ${(m[0] + suite).trim().slice(0, 20)} »`; return; }
    noter(sys, n);
  };
  for (const m of t.matchAll(RE_PREFIXE)) lireNombre(m, m[1], m[2]);
  for (const m of t.matchAll(RE_IT)) lireNombre(m, "it", m[1]);
  for (const m of t.matchAll(RE_SUFFIXE)) {
    if (m[2].toLowerCase() === "it" && m[2] !== "IT") continue;   // « it » : l'anglais
    lireNombre(m, m[2], m[1]);
  }

  // Le tour de taille (jamais dans une chaussure).
  if (!ctx.chaussure) {
    for (const m of t.matchAll(RE_W)) {
      const n = Number(m[1]);
      if (n < W_MIN || n > W_MAX) continue;
      if (W_SECOND.test(apres(m))) { doute ??= `deux tours de taille « ${(m[0] + apres(m)).trim().slice(0, 14)} »`; continue; }
      noter("W", n);
    }
    for (const m of t.matchAll(RE_W_PARENTHESES)) {
      const n = Number(m[1]);
      if (frVetement(n)) noter("FR", n);
    }
  }
  if (ctx.bas) {
    for (const m of t.matchAll(RE_W_APRES)) {
      const n = Number(m[1]);
      if (n >= W_MIN && n <= W_MAX) noter("W", n);
    }
    for (const m of t.matchAll(RE_PAIRE_WL)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a < W_MIN || a > W_MAX || b < L_MIN || b > L_MAX) continue;
      // « 32/34 » : W32 L34 ou la fourchette française 32-34 — doute.
      if (a % 2 === 0 && b === a + 2) { doute ??= `« ${m[0].trim()} » : W${a} L${b} ou fourchette ${a}-${b}`; continue; }
      noter("W", a);
    }
  }

  // (rejeu du 19/11) Une fourchette française écrite n'importe où (« ( 42 / 44 ) », « taille I 52/54 », « S 36/38 ») :
  // le titre dit deux tailles.
  for (const m of t.matchAll(RE_FOURCHETTE_FR)) {
    const a = Number(m[1]), b = Number(m[2]);
    if (frVetement(a) && b === a + 2 && !PAS_UNE_TAILLE_APRES.test(apres(m))) doute ??= `fourchette « ${m[0].trim()} »`;
  }

  // Les lettres.
  const noterLettre = (m, seule) => {
    const suite = apres(m);
    if (seule && ADJECTIF_AVANT.test(avant(m, 16))) return;
    if (LETTRE_SECONDE.test(suite) || LETTRE_AVANT.test(avant(m, 12))) { doute ??= `deux tailles en lettres « ${(avant(m, 4) + m[0] + suite).trim().slice(0, 16)} »`; return; }
    const c = canonLettre(m[1]);
    if (c) noter("lettres", c);
  };
  for (const m of t.matchAll(RE_LETTRE_MOT)) noterLettre(m, false);
  for (const m of t.matchAll(RE_LETTRE_SEULE)) noterLettre(m, true);

  for (const [sys, s] of vals) if (s.size > 1) doute ??= `plusieurs valeurs ${sys} (${[...s].join(", ")})`;
  // (rejeu du 19/11) Le titre qui écrit un FR et une lettre que la table des plateformes n'associe pas (« T.44 (XL) »,
  // « Taille 40 (M) ») suit la table d'une marque : on ne sait pas laquelle de ses deux écritures vaut — doute.
  const fr = vals.get("FR"), lettre = vals.get("lettres");
  if (!doute && fr?.size === 1 && lettre?.size === 1 && LETTRE_FEMME.get([...fr][0]) !== [...lettre][0]) {
    doute = `le titre écrit FR ${[...fr][0]} et ${ecrireLettre([...lettre][0])}`;
  }
  return { vals, doute };
}

// ── LA FICHE ──────────────────────────────────────────────────────────────────────────────────────────────────────
// On coupe sur / | · et sur le tiret ENTOURÉ d'espaces (« 38 - M ») — jamais sur le tiret collé (« 12-18 mois »).
const morceaux = (v) => v.split(/\s+[-–—]\s+|\s*[/|·•]\s*/).map((x) => x.trim()).filter(Boolean);
const LETTRE_FEMME = new Map(Object.entries(LETTRE_FEMME_PAR_FR).map(([fr, l]) => [Number(fr), canonLettre(l)]));

function lireFiche(taille, ctx) {
  const vals = new Map();
  let doute = null;
  const noter = (sys, v) => { if (!vals.has(sys)) vals.set(sys, new Set()); vals.get(sys).add(v); };
  const v = nfc(taille).trim();
  const parts = morceaux(v);
  const nus = [];
  for (const p of parts) {
    const l = canonLettre(p);
    if (l) { noter("lettres", l); continue; }
    let m = /^w\s?(\d{2})(?:\s?(?:l|x)\s?\d{2})?$/i.exec(p);
    if (m) { const n = Number(m[1]); if (n >= W_MIN && n <= W_MAX && !ctx.chaussure) noter("W", n); continue; }
    m = /^(fr|eur|eu|uk|us|it)\s?[:.]?\s?(\d{1,2}(?:[.,]5)?)$/i.exec(p);
    if (m) {
      const k = m[1].toLowerCase(), n = nombre(m[2]);
      if (ctx.chaussure && (k === "fr" || k === "eu" || k === "eur")) { if (pointureOk(n)) noter("pointure", n); }
      else if (k === "fr") { if (frVetement(n)) noter("FR", n); }
      else noter(k === "eur" ? "EU" : k.toUpperCase(), n);
      continue;
    }
    m = /^(\d{1,2}(?:[.,]5)?)$/.exec(p);
    if (m) nus.push(nombre(m[1]));
  }
  if (nus.length) {
    if (parts.length === 1) {
      // Un nombre seul : la pointure d'une chaussure, le FR d'un vêtement adulte (paire, 30 à 66) — jamais dans un bas
      // (W ou FR ?), un vêtement d'enfant, ni sous un titre de chaussures rangé ailleurs.
      const n = nus[0];
      if (ctx.chaussure) { if (pointureOk(n)) noter("pointure", n); }
      else if (!ctx.nuDouteux && frVetement(n)) noter("FR", n);
    } else {
      // L'étiquette composite des plateformes : « S / 36 / 8 » (Vinted : lettre / FR / UK), « S / 36 » (Beebs),
      // « 36 - S » (Leboncoin). Le nombre FR doit être celui de SA lettre (LETTRE_FEMME_PAR_FR), le dernier nombre
      // (UK) le FR moins 28 ; sinon l'étiquette n'est pas lue (doute).
      const lettres = vals.get("lettres");
      const l = lettres?.size === 1 ? [...lettres][0] : null;
      const [fr, uk, ...reste] = nus;
      if (!l || reste.length || !frVetement(fr) || LETTRE_FEMME.get(fr) !== l || (uk != null && uk !== fr - 28)) {
        doute = `étiquette « ${v} » hors de la table des plateformes`;
      } else {
        noter("FR", fr);
        if (uk != null) noter("UK", uk);
      }
    }
  }
  for (const [sys, s] of vals) if (s.size > 1) doute ??= `plusieurs valeurs ${sys} sur la fiche (${[...s].join(", ")})`;
  return { vals, doute };
}

const ecrire = (sys, v) => (sys === "lettres" ? ecrireLettre(v)
  : sys === "W" ? `W${v}`
  : sys === "pointure" ? String(v).replace(".", ",")
  : `${sys} ${String(v).replace(".", ",")}`);

/**
 * La taille de la fiche (ou de la copie) contredit-elle une taille écrite explicitement dans le titre ?
 * @param {{ titre?: unknown, taille?: unknown, rayon?: unknown }} p
 * @returns {null | { taille_fiche: string, taille_titre: string, systeme: 'W'|'FR'|'EU'|'IT'|'UK'|'US'|'pointure'|'lettres' }}
 *   null : pas de contradiction SÛRE (accord, rien de comparable, doute).
 */
export function tailleContreditTitre({ titre, taille, rayon = null } = {}) {
  if (!nfc(titre).trim() || !nfc(taille).trim()) return null;
  if (TITRE_QUI_DOUTE.test(nfc(titre))) return null;
  const ctx = contextes(titre, rayon);
  const fiche = lireFiche(taille, ctx);
  if (fiche.doute || !fiche.vals.size) return null;
  const texte = lireTitre(titre, ctx);
  if (texte.doute || !texte.vals.size) return null;
  let premier = null;
  for (const sys of SYSTEMES_CONTREDITS) {
    const a = texte.vals.get(sys), b = fiche.vals.get(sys);
    if (!a || !b) continue;
    const vt = [...a][0], vf = [...b][0];
    if (vt === vf) return null;                    // un système d'accord : rien de sûr
    premier ??= { taille_fiche: ecrire(sys, vf), taille_titre: ecrire(sys, vt), systeme: sys };
  }
  return premier;
}
