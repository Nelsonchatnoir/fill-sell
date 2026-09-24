// ═══════════════════════════════════════════════════════════════════════════
// LES LISTES DES PLATEFORMES — LAQUELLE FAIT FOI, ET COMMENT ON S'Y COMPARE
// (chantier « aucune publication ne part avec un champ refusé », 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas qui a tout déclenché : « Primark Disney 100 Mickey Mouse Jogging »,
// rayon Beebs « Pantalons et jeans (garçon) » choisi à la main. La copie Beebs
// portait Taille « XS / 34 » et Format du colis « Petit colis » ; la carte
// disait « À COMPLÉTER » sur les deux, le statut disait « Prêt », l'écran
// Confirmer disait « Prête », et Beebs a refusé le dépôt sur la taille.
//
// Trois règles jugeaient la même valeur :
//   · le moteur (genericRequiredStatus) : « invalid » = valeur présente mais
//     hors liste — JAMAIS bloquant sur Vinted/LBC/Beebs (blocking:false,
//     doctrine du 29/07 : « une liste relevée est une aide à la saisie ») ;
//   · la carte (champsDuRayon.classerChamps) : hors grille = à compléter,
//     quelle que soit la liste ;
//   · l'extension, au dépôt, contre la liste VIVANTE — la seule qui tranche.
// Ce module porte la règle UNIQUE que le moteur et la carte appliquent tous
// deux : UNE VALEUR HORS D'UNE LISTE QUI FAIT FOI EST UN CHAMP À COMPLÉTER.
//
// ⛔ QUAND UNE LISTE RELEVÉE FAIT FOI — et seulement là :
//   · le contrôle est FERMÉ sur la plateforme (menu, grille, sélecteur : la
//     personne ne peut choisir QUE dedans) ;
//   · le relevé est ENTIER : moins de 200 valeurs (le fond de l'extension
//     tronque allowed_values à 200 — une liste qui en porte 200 est une
//     photo coupée, jamais une liste) ;
//   · ce n'est pas un champ À RECHERCHE : la Marque, sur Vinted comme sur
//     Leboncoin et Beebs, se tape dans une barre qui interroge un référentiel
//     de plus d'un millier d'entrées (1 400 chez Beebs, lu sur son fiber) — ce
//     qu'on en relève est toujours partiel, et le 29/07 l'a prouvé en prod
//     (liste coupée à « Amisu », Nike et Zara « hors liste »). Une marque hors
//     de notre relevé se contrôle au DÉPÔT (Beebs propose « Autre », Vinted
//     crée la marque), jamais avant.
// Une liste qui ne fait pas foi n'est pas ignorée : la valeur part telle
// quelle et la plateforme tranche — c'est le comportement d'avant.
//
// ⛔ CE MODULE NE CHOISIT JAMAIS UNE VALEUR À LA PLACE DE LA PERSONNE. Il
//    TRADUIT (« XS » ↔ « XS / 34 / 6 », « 12 ans » ↔ « 12Y », « Petit colis »
//    → le palier Beebs que beebs.js pose lui-même) et il RAPPROCHE quand une
//    seule valeur de la liste porte les mêmes mots (« Unique » → « Taille
//    unique », règle du 19/07) ; il ne convertit pas un système (44.5 ne
//    devient jamais 44) et n'arrondit rien. Sans correspondance sûre, il rend
//    « à compléter » avec la liste, et c'est la personne qui choisit.
import { texteComparable } from "../../utils/texteComparable.js";
import { tailleDansGrille } from "../../../supabase/functions/_shared/tailles.js";

// Le plafond du relevé (chrome-extension/background.js, persistDiscoveredAspects
// : `allowed_values` coupées à 200). Une liste à 200 entrées est tronquée.
export const PLAFOND_RELEVE = 200;

// Les contrôles FERMÉS de chaque plateforme, tels que les content scripts
// les relèvent (input_type de platform_category_aspects). Tout autre type —
// null (appris d'un 400 serveur), « text », « list_search » — n'est pas un
// contrôle dont on connaît la nature : sa liste ne fait pas foi.
export const TYPES_FERMES = {
  vinted: ["grid", "grid_chips", "list", "multi-list", "dropdown"],
  leboncoin: ["combobox", "dropdown"],
  beebs: ["dropdown"],
  opla: ["select", "selection_only"],
};

// Les champs À RECHERCHE : le référentiel de la plateforme dépasse ce qu'on
// relève. Marque partout ; Vinted « model » (liste virtualisée, ~50 rendus).
export function champARecherche(platform, key) {
  const k = String(key ?? "");
  if (platform === "vinted") return k === "brand" || k === "model";
  if (platform === "leboncoin") return /_brand$/.test(k);
  if (platform === "beebs") return k === "Marque";
  return false;
}

/** La liste relevée de CE champ fait-elle foi ? (règle du bandeau) */
export function listeFaitFoiRelevee({ platform, key, inputType, allowedValues }) {
  const vals = Array.isArray(allowedValues) ? allowedValues : [];
  if (!vals.length || vals.length >= PLAFOND_RELEVE) return false;
  if (champARecherche(platform, key)) return false;
  const type = String(inputType ?? "").toLowerCase();
  return (TYPES_FERMES[platform] ?? []).includes(type);
}

// ── Format du colis Beebs : le format CANONIQUE de l'app → le palier Beebs ──
// ⚠️ MIROIR de BEEBS_PACKAGE_BY_FORMAT dans chrome-extension/content-scripts/
//    beebs.js : c'est beebs.js qui pose le palier, ceci ne sert qu'à JUGER
//    avant le clic la même correspondance qu'il fera. Si la table change
//    là-bas, elle change ici (scripts/publication-moteur-selftest.mjs lit
//    beebs.js et compare les deux, valeur par valeur).
export const BEEBS_PACKAGE_BY_FORMAT = {
  "Lettre":           "Poids jusqu'à 500g max",
  "Petit colis":      "Poids jusqu'à 1 kg max",
  "Moyen colis":      "Poids jusqu'à 2 kg max",
  "Grand colis":      "Poids jusqu'à 5 kg max",
  "Très grand colis": "Poids jusqu'à 10 kg max",
};

/** La valeur telle que l'EXTENSION la présentera à la liste de la plateforme
 *  — aujourd'hui, seul le format de colis Beebs est traduit avant la pose. */
export function valeurPourListe(platform, key, value) {
  const v = String(value ?? "").trim();
  if (platform === "beebs" && key === "Format du colis" && BEEBS_PACKAGE_BY_FORMAT[v]) return BEEBS_PACKAGE_BY_FORMAT[v];
  return v;
}

// Les champs qui portent une TAILLE (ou une pointure) : eux seuls passent par
// le vocabulaire des tailles (_shared/tailles.js — celui du serveur Opla et
// du pré-vol de l'extension), qui sait qu'une étiquette composite
// (« XS / 34 / 6 ») contient « XS » et que « 12 ans » s'écrit « 12Y ».
export function estChampTaille(platform, key) {
  const k = String(key ?? "");
  if (platform === "vinted") return k === "size";
  if (platform === "beebs") return k === "Taille" || k === "Pointure";
  if (platform === "leboncoin") return /_size$/.test(k) || k === "clothing_st" || k === "baby_age";
  if (platform === "opla") return k === "size";
  return false;
}

// ── Forme comparable d'une valeur d'aspect (déménagée de ListingPreviewScreen,
//    sans changer un caractère) ──────────────────────────────────────────────
// Forme comparable PARTAGÉE (utils/texteComparable — même corps que les 4
// content scripts et le serveur) + deux règles propres aux aspects : virgule
// décimale → point (« 38,5 » et « 38.5 » sont la même pointure, Vinted
// écrit les deux selon la catégorie), préfixe « EU » rogné devant un
// chiffre (l'app génère « EU 38.5 » là où Vinted liste « 38,5 »). Depuis le
// 05/09, apostrophes typographiques, guillemets, tirets longs et espaces
// insécables des listes relevées ne font plus passer une valeur pour « hors
// liste ». La virgule d'un libellé n'est pas une différence (07/09 : « Neuf,
// sans étiquette » chez Beebs, « Neuf sans étiquette » chez Vinted — 496
// articles jugés hors liste pour une virgule) ; retirée APRÈS le point
// décimal, qui doit rester prioritaire.
export const normAspectVal = s => texteComparable(s)
  .replace(/(\d),(\d)/g, "$1.$2")
  .replace(/[.,](?!\d)/g, "")
  .replace(/\s+/g, " ").trim()
  .replace(/^eu\s+(?=\d)/, "");

// Valeur de la liste la plus proche d'une saisie hors liste ("Unique" →
// « Taille unique », "58 cm" → « 58 »). Rapprochement par TOKENS entiers
// (jamais de sous-chaîne : "S" ne matche pas "XS") : match si tous les tokens
// d'un côté se retrouvent de l'autre ; à couverture égale, la valeur la plus
// courte gagne. null si rien d'assez proche — on laisse l'utilisateur choisir.
// (Déménagée de ListingPreviewScreen, sans changer un caractère.)
export function nearestAllowedValue(val, allowedValues) {
  const vals = Array.isArray(allowedValues) ? allowedValues : [];
  const v = normAspectVal(val);
  if (!v || !vals.length) return null;
  const exact = vals.find(a => normAspectVal(a) === v);
  if (exact) return exact;
  const vTokens = v.split(/[^a-z0-9/]+/).filter(Boolean);
  if (!vTokens.length) return null;
  const vSet = new Set(vTokens);
  let best = null, bestScore = 0;
  for (const a of vals) {
    const aTokens = normAspectVal(a).split(/[^a-z0-9/]+/).filter(Boolean);
    if (!aTokens.length) continue;
    const shared = aTokens.filter(tk => vSet.has(tk)).length;
    if (!shared) continue;
    if (shared !== aTokens.length && shared !== vSet.size) continue;
    const score = shared - aTokens.length * 0.01;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

// La table femme (nombre → lettre, relevée chez Vinted) ne vaut que pour la
// branche FEMMES d'Opla — même règle que le serveur (normaliserTailleOpla) et
// que le pré-vol de l'extension : la branche se lit sur le chemin.
const brancheFemmesOpla = (chemin) => Array.isArray(chemin)
  && texteComparable(String(chemin[0] ?? "")) === "femmes";

/**
 * LE JUGEMENT : une valeur, une liste, un verdict.
 *   { dans: true,  valeurListe }  — la liste la porte (telle quelle, ou dans le
 *                                    vocabulaire de la plateforme) ;
 *   { dans: false, suggested }    — hors liste ; `suggested` est la seule valeur
 *                                    aux mêmes mots (rapprochement du 19/07),
 *                                    ou null : à compléter par la personne.
 * `valeurListe` est l'écriture EXACTE de la liste — c'est elle qu'un job peut
 * porter sans que l'extension ait à chercher.
 */
export function jugerValeurContreListe({ platform, key, value, allowedValues, cheminCategorie = null }) {
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(v => String(v).trim()).filter(Boolean);
  const v = valeurPourListe(platform, key, value);
  if (!v) return { dans: false, valeurListe: null, suggested: null };
  if (!vals.length) return { dans: true, valeurListe: v, suggested: null };
  const nv = normAspectVal(v);
  const exacte = vals.find(a => normAspectVal(a) === nv);
  if (exacte) return { dans: true, valeurListe: exacte, suggested: null };
  if (estChampTaille(platform, key)) {
    const t = tailleDansGrille(v, vals, { tableFemme: platform === "opla" && brancheFemmesOpla(cheminCategorie) });
    if (t) return { dans: true, valeurListe: t.valeur, suggested: null };
    // L'étiquette de la grille est composite avec un tiret (« 34 - XS » chez
    // Leboncoin) : un de ses composants EST la valeur, exactement — c'est le
    // « match composants-exacts » de leboncoin.js, et une seule candidate.
    const nv2 = normAspectVal(v);
    const parComposant = vals.filter(a => a.split(/s*[-–—|/·•]s*/).some(c => normAspectVal(c) === nv2));
    if (parComposant.length === 1) return { dans: true, valeurListe: parComposant[0], suggested: null };
    // ⛔ PAS DE RAPPROCHEMENT PAR MOTS SUR UNE TAILLE. Le rapprochement par
    //    jetons lit « 44.5 » comme « 44 » + « 5 » et proposerait « 44 » sur une
    //    grille d'entiers — c'est exactement la conversion interdite (règle
    //    du 18/09 : 44.5 n'est pas 44, refuser vaut mieux qu'approximer). Le
    //    vocabulaire des tailles vient de dire non : la personne choisit.
    return { dans: false, valeurListe: null, suggested: null };
  }
  return { dans: false, valeurListe: null, suggested: nearestAllowedValue(v, vals) };
}

/**
 * Le VERDICT « bloquant » d'une valeur présente mais hors liste, selon la
 * règle en vigueur :
 *   · "classique" (l'ancien stepper, à l'identique) : jamais — aucune liste
 *     relevée ne fait foi, seule la Taxonomy eBay SELECTION_ONLY le fait ;
 *   · "nouvelle" : bloquant si la liste fait foi ET qu'aucun rapprochement
 *     sûr n'existe (un rapprochement sûr est posé d'office à l'écran
 *     Confirmer, comme avant — il n'y a rien à demander).
 */
export function horsListeBloque({ regle = "classique", platform, key, inputType, allowedValues, suggested = null }) {
  if (regle !== "nouvelle") return false;
  if (suggested) return false;
  return listeFaitFoiRelevee({ platform, key, inputType, allowedValues });
}

// ── Vinted exige une marque, partout sauf « Livres et médias » ─────────────
// Mesuré le 24/09 sur 60 jours : 183 publications Vinted abouties depuis le
// stepper, TOUTES avec une marque (« Sans marque » compris) — la seule partie
// sans marque était un livre. Et trois refus le jour même chez une cliente,
// cinq chez une autre depuis le 15/09 (« Le champ Marque doit être
// renseigné »), parce que le catalogue ne connaissait pas la catégorie et que
// rien n'était demandé. Règle de Nico : aucune annonce Vinted ne part avec
// une marque vide — « Sans marque » se PROPOSE, il ne se pose pas tout seul.
// Le formulaire Vinted des livres et médias n'a pas de champ Marque
// (vinted.js, brand_field_absent) : là, on ne demande rien.
export function vintedExigeUneMarque(cheminCategorie) {
  const racine = Array.isArray(cheminCategorie) ? texteComparable(String(cheminCategorie[0] ?? "")) : "";
  return racine !== "livres et medias";
}

// ── VINTED N'ACCEPTE QUE DU NEUF DANS CERTAINS RAYONS (24/09) ──────────────
// Dossier solene.mantero : un casque Scorpion en « Bon état », rayon où
// Vinted affiche « Veille à ne mettre en ligne que des articles neufs et non
// ouverts dans cette catégorie » et ne propose que « Neuf avec étiquette »
// (idem Beauté, Parfums, Sous-vêtements : relevé platform_category_aspects).
// Ce n'est PAS une question : répondre « Neuf avec étiquette » pour un objet
// porté serait mentir à l'acheteur. C'est une LIMITE de la plateforme — on la
// dit, Vinted ne part pas, et on ne relance jamais.
// Vrai seulement quand la liste relevée de l'État ne porte QUE des « Neuf… »
// et que la valeur de l'article n'en fait pas partie. Valeur vide : la
// question normale se pose (un objet neuf peut honnêtement y répondre).
export function limiteNeufSeulement({ platform, key, value, allowedValues }) {
  if (platform !== "vinted" || key !== "condition") return false;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(v => String(v).trim()).filter(Boolean);
  if (!vals.length || !vals.every(v => /^neuf\b/.test(texteComparable(v)))) return false;
  const v = String(value ?? "").trim();
  if (!v) return false;
  return !vals.some(a => normAspectVal(a) === normAspectVal(v));
}

/** La phrase, identique partout (carte, case grisée, écran Confirmer). */
export function messageLimiteNeuf({ valeur, acceptees }, lang = "fr") {
  const liste = [...new Set((acceptees ?? []).map(String))].join(" · ");
  return lang === "en"
    ? `Vinted only accepts new items in this category (${liste}). This item is “${valeur}”, so it won't be listed on Vinted — this is Vinted's rule, not a question. Your other platforms are not affected.`
    : `Vinted n'accepte que des articles neufs dans ce rayon (${liste}). Ton article est « ${valeur} » : il ne partira pas sur Vinted. C'est une règle de Vinted, pas une question. Tes autres plateformes ne sont pas concernées.`;
}
