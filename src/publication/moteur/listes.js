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
import { normalizeVintedColors } from "../../utils/vintedColors.js";
import { VINTED_MODELES } from "../../data/vintedModeles.js";
import { tailleDansGrille } from "../../../supabase/functions/_shared/tailles.js";
import { tailleParPoidsKg } from "../../../supabase/functions/_shared/taille-de-service.js";
import { tailleDuTexte } from "../../../supabase/functions/_shared/taille-du-texte.js";
import { toPlatformChildSize, tailleEnfantSelonLeTexte } from "../../utils/childSizes.js";
import {
  optionDepuisTextes, champDeductibleDuTexte, estFourreTout, listeCandidatsDabord, textesDeLAnnonce,
} from "../../../supabase/functions/_shared/option-du-texte.js";
import { alimentationBeebs, estChampAlimentationBeebs } from "../../../supabase/functions/_shared/alimentation-beebs.js";

export { estFourreTout, listeCandidatsDabord, textesDeLAnnonce };

/**
 * L'OPTION QUE L'ANNONCE NOMME DÉJÀ (2026-09-24, job fc5e4bff de Jocabroc).
 * Pour un champ à liste FERMÉE dont la valeur est hors liste, absente ou le
 * fourre-tout « Autre » : l'option de la liste que nomment le titre, puis
 * l'objet identifié par l'IA, puis la description (règle unique,
 * supabase/functions/_shared/option-du-texte.js — la même que le serveur).
 * Rend { valeur, source, candidats } — ou null quand le champ ne se déduit
 * jamais d'un texte (taille, marque, état, colis) ou que la liste n'est pas
 * une vraie liste (vide, ou relevé coupé à 200).
 */
export function deduireOptionDuTexte({ platform, key, label = "", allowedValues, textes, cheminCategorie = null }) {
  if (estChampTaille(platform, key) || champARecherche(platform, key)) return null;
  // (24/10 soir, décision 4 de Nico) « Alimentation » Beebs : la règle dédiée (le moteur générique ne lit pas « sans »,
  // mot vide, et prenait « Ma première batterie » pour une batterie) — _shared/alimentation-beebs.js.
  if (estChampAlimentationBeebs(platform, key)) return alimentationBeebs({ options: allowedValues, textes, cheminCategorie });
  if (!champDeductibleDuTexte(key, label)) return null;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(v => String(v).trim()).filter(Boolean);
  if (!vals.length || (platform !== "ebay" && vals.length >= PLAFOND_RELEVE)) return null;
  return optionDepuisTextes({ options: vals, textes, cle: key, label });
}

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
  // depop (09/10) : les questions du connecteur portent la liste EXACTE de
  // Depop (grille de la feuille, états, genres) en « selection_only ».
  depop: ["selection_only"],
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

// ⛔ LA MARQUE DE L'ANNONCE FAIT FOI (17/10, Nico : « Chic Me reste Chic Me »).
// Une marque n'est JAMAIS rapprochée d'une autre par ses mots : le
// rapprochement par jetons posait d'office « Paper » pour « Daily paper »,
// « BULLS » pour « Chicago Bulls », « Calvin Klein » pour « Calvin Klein
// Jeans » (copies eBay mesurées sur 60 jours). Une marque présente est
// gardée telle quelle — l'écriture exacte de la liste si elle y est —, et
// c'est la plateforme qui tranche au dépôt (création de marque Vinted, liste
// fermée ailleurs). Les champs Marque des relevés, et l'aspect eBay.
export function estChampMarque(platform, key) {
  const k = String(key ?? "");
  if (platform === "ebay") return k === "Marque";
  return champARecherche(platform, k) && k !== "model";
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
 *  — le format de colis Beebs est traduit avant la pose ; la couleur Vinted
 *  aussi (11/10) : l'app la ramène à la palette au clic Publier
 *  (resolutionPublication → normalizeVintedColors), « Black » part « Noir ».
 *  Juger « Black » hors palette, c'était juger une valeur qui ne partira pas. */
export function valeurPourListe(platform, key, value) {
  const v = String(value ?? "").trim();
  if (platform === "beebs" && key === "Format du colis" && BEEBS_PACKAGE_BY_FORMAT[v]) return BEEBS_PACKAGE_BY_FORMAT[v];
  if (platform === "vinted" && key === "color" && v) return normalizeVintedColors(v).colors[0] ?? v;
  return v;
}

// ── (26/10 nuit, point 1 — le téléphone Samsung de Nico) LES MODÈLES VINTED SONT CEUX D'UNE MARQUE ────────────────────
// Chez Vinted, la liste « Modèle » dépend de la marque choisie avant elle ; notre relevé ne porte pas la marque et n'en
// a qu'une (Apple : 50 « iPhone … » en Téléphones portables, 9 « AirPods » en Casques). Servie à un Samsung, elle ne
// proposait que des iPhone. Règle : une liste de modèles Apple ne se propose qu'à un article Apple ; ailleurs le modèle
// se tape (champ à recherche : l'extension le cherche dans la liste de SA marque chez Vinted). Pur.
const RE_MODELES_APPLE = /^(iphone|ipad|ipod|airpods|apple watch|macbook|imac|mac mini)\b/i;
// (26/10, C7 — Nico) La liste COMPLÈTE de la marque : relevée sur Vinted (src/data/vintedModeles.js, toutes les pages
// de /api/v2/item_upload/models par rayon et par marque — 1 504 modèles Samsung en Téléphones portables). Un Samsung
// ne voit que des Samsung, avec recherche (champ long). Une marque absente du relevé : le champ se tape, comme avant.
const cleMarque = (s) => texteComparable(String(s ?? "")).replace(/[^a-z0-9]+/g, "");
export function modelesVintedDuRelevé(chemin, marque) {
  const cle = Array.isArray(chemin) ? chemin.join(" > ") : String(chemin ?? "");
  const rayon = VINTED_MODELES?.rayons?.[cle];
  const m = cleMarque(marque);
  if (!rayon || !m) return null;
  for (const [nom, v] of Object.entries(rayon.marques ?? {})) {
    if (cleMarque(nom) === m) return Array.isArray(v?.modeles) && v.modeles.length ? v.modeles : null;
  }
  return null;
}
export function modelesVintedPourLaMarque(platform, key, valeurs, marque, chemin = null) {
  if (platform !== "vinted" || key !== "model") return valeurs;
  const releve = chemin ? modelesVintedDuRelevé(chemin, marque) : null;
  if (releve) return releve;
  if (!Array.isArray(valeurs) || !valeurs.length) return valeurs;
  if (!valeurs.every((v) => RE_MODELES_APPLE.test(String(v).trim()))) return valeurs;
  return /^\s*apple\s*$/i.test(String(marque ?? "")) ? valeurs : [];
}

// (26/10, C6 — Nico) « Marque connue + modèle lisible sur le titre → rempli sans question. » Le modèle de la liste de
// SA marque que le texte nomme : le PLUS LONG qui y figure en mots entiers (« Galaxy S10+ » avant « Galaxy S10 »),
// et seulement s'il n'y en a qu'un de cette longueur — au moindre doute, null (la question reste). Jamais un modèle
// d'une autre marque, jamais une ressemblance approchée.
export function modeleLuDansLeTexte(texte, modeles) {
  const t = ` ${texteComparable(String(texte ?? "")).replace(/[^a-z0-9+]+/g, " ")} `;
  if (!Array.isArray(modeles) || !modeles.length || t.trim().length < 2) return null;
  let meilleurs = [], longueur = 0;
  for (const nom of modeles) {
    const n = texteComparable(String(nom)).replace(/[^a-z0-9+]+/g, " ").trim();
    // Seul un nom CHIFFRÉ nomme un modèle (« Galaxy S10 ») : « Galaxy », « Galaxy Note » sont des gammes — jamais posées.
    if (n.length < 3 || !/\d/.test(n)) continue;
    if (!t.includes(` ${n} `)) continue;
    // Un modèle chiffré (« Galaxy S10 ») nomme plus qu'un nom de gamme (« Samsung Galaxy ») : il passe devant.
    const poids = (/\d/.test(n) ? 1000 : 0) + n.length;
    if (poids > longueur) { meilleurs = [nom]; longueur = poids; }
    else if (poids === longueur) meilleurs.push(nom);
  }
  return meilleurs.length === 1 ? meilleurs[0] : null;
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

// ── (25/10, point 5 de Nico) UNE POINTURE « EU N » EST LA POINTURE « N » ─────────────────────────────────────────────
// Cas : Marta MELE, « Scarpe da nike Runallday » (fiche « 37.5 »), Leboncoin › Mode › Chaussures, 24/10 : la copie
// portait « EU 37.5 » — l'écriture des pointures de l'app (sélecteur sizeShoeOptions, convention « EU N » de
// generate-listing) — et la grille « Pointure » de Leboncoin écrit « 37,5 ». Depuis le point G (39b8ee5, 28/09 :
// normAspectVal ne rogne plus « EU », « EU 42 garde son pays »), « EU 37.5 » était jugé HORS LISTE → question
// « Pointure » sur une valeur que le dépôt sait poser : leboncoin.js et beebs.js retirent « EU » avant de poser la
// pointure, vinted.js (0.6.101) et le serveur (optionNuPourEu) font de même sur les grilles de chaussures.
// 11 affichages, 10 abandons, Leboncoin décoché au départ ; le même soir (90ace0e4) un « EU 31 » a reçu « 16 » à
// la question et est parti ainsi sur Leboncoin et Beebs.
// RÈGLE : sur un champ de POINTURE (Leboncoin shoe_size, Beebs Pointure, Vinted size d'un rayon Chaussures),
// « EU N » / « EUR N » est l'option « N » nue de la grille — une seule, et seulement quand la grille n'écrit pas
// elle-même « EU N » (l'exact fait foi). La pointure européenne n'a qu'une échelle : c'est une ORTHOGRAPHE, jamais une
// conversion. ⛔ Jamais UK / US / IT / DE ; jamais une demi-pointure arrondie (« EU 38.5 » ne devient jamais « 38 ») ;
// jamais une taille de VÊTEMENT (« EU 38 » d'une robe garde son pays — point G, inchangé).
export function estChampPointure(platform, key, cheminCategorie = null) {
  const k = String(key ?? "");
  if (platform === "leboncoin") return k === "shoe_size";
  if (platform === "beebs") return k === "Pointure";
  if (platform === "vinted") {
    return k === "size" && Array.isArray(cheminCategorie)
      && cheminCategorie.some((c) => /\bchaussures\b/.test(texteComparable(c)));
  }
  return false;
}
const POINTURE_EU_RE = /^eur?\s*(\d{1,2}(?:\.5)?)$/;
const pointureNue = (forme) => {
  const m = /^(\d{1,2}(?:\.5)?)$/.exec(forme);
  return m ? String(Number(m[1])) : null;
};
/** L'option « N » nue d'une grille de pointures pour « EU N », sinon null (forme EXACTE de la grille). */
export function pointureNuePourEu(valeur, allowedValues) {
  const m = POINTURE_EU_RE.exec(normAspectVal(valeur));
  if (!m) return null;
  const n = String(Number(m[1]));
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (vals.some((a) => { const x = POINTURE_EU_RE.exec(normAspectVal(a)); return Boolean(x) && String(Number(x[1])) === n; })) return null;
  const nues = vals.filter((a) => pointureNue(normAspectVal(a)) === n);
  return nues.length === 1 ? nues[0] : null;
}

// ── (24/10 soir, décision 5 de Nico — pyjama d'alizeed48) LES HOMONYMES « TAILLE » DE BEEBS ──────────────────────
// Certains rayons Beebs affichent DEUX champs « Taille » : le catalogue les relève « Taille [attributes.women_bras] »
// (Pyjamas femme : une liste de soutiens-gorge 75A…115L ET les lettres XXS…9XL) ou « Taille [attributes.size_men_shirt] »
// (Chemises homme : XS…8XL et les cols en cm). L'app ne reliait à la taille de la fiche que la clé NUE : sur ces
// homonymes, « S / 36 / 8 » restait sans traduction et la question « Taille » tombait — sur une liste de bonnets.
// RÈGLE : la taille connue de la fiche se TRADUIT dans la liste de l'homonyme par le même jugement que la clé nue
// (jugerValeurContreListe sur « Taille ») ; jamais une conversion (« 40 » ne devient pas un col de 40 cm, « 38 » pas
// un 85B) : rien de sûr → null, la question reste. Une clé POSITIONNELLE (« Taille [#2] », ancien relevé tronqué du même
// champ) n'est ni une question ni une cible : l'extension et le serveur ne l'écrivent jamais (beebs.js, beebs-valeurs).
export const clePositionnelleBeebs = (k) => /\[#\d+\]\s*$/.test(String(k ?? ""));
export function tailleHomonymeBeebs({ key, taille, allowedValues, cheminCategorie = null, textes = null }) {
  const k = String(key ?? "");
  if (!/\[[^\]]+\]\s*$/.test(k) || clePositionnelleBeebs(k)) return null;
  const nu = k.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  if (!estChampTaille("beebs", nu)) return null;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v).trim()).filter(Boolean);
  if (!vals.length || !String(taille ?? "").trim()) return null;
  const v = jugerValeurContreListe({ platform: "beebs", key: nu, value: taille, allowedValues: vals, cheminCategorie, textes });
  return v.dans && vals.includes(v.valeurListe) ? v.valeurListe : null;
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
  .replace(/\s+/g, " ").trim();

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
export function jugerValeurContreListe({ platform, key, value, allowedValues, cheminCategorie = null, textes = null }) {
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(v => String(v).trim()).filter(Boolean);
  const v = valeurPourListe(platform, key, value);
  if (!v) return { dans: false, valeurListe: null, suggested: null };
  if (!vals.length) return { dans: true, valeurListe: v, suggested: null };
  const nv = normAspectVal(v);
  const exacte = vals.find(a => normAspectVal(a) === nv);
  if (exacte) return { dans: true, valeurListe: exacte, suggested: null };
  if (estChampTaille(platform, key)) {
    // (18/10, lot 3) Une taille ENFANT écrite dans le vocabulaire d'une autre
    // plateforme (« 9-12 mois / 74 cm » lu sur Vinted, « 9 mois / 74 cm » sur
    // Leboncoin, « 9 mois (67-74 cm) » sur Beebs, « 9 mois » canonique) est
    // traduite par le référentiel childSizes — table relevée, jamais un
    // rapprochement par cm — et doit se trouver TELLE QUELLE dans la grille :
    // sinon on continue comme avant. 152 questions « Taille · Beebs » en 7 j,
    // 123 fiches qui portaient déjà la taille (audit du 17/10).
    // (18/10, zéro friction) Une tranche Vinted (« 3-6 mois ») dont le texte
    // du vendeur nomme une seule borne : cette borne (childSizes).
    const enfant = toPlatformChildSize((textes && tailleEnfantSelonLeTexte(v, textes)) || v, platform);
    if (enfant) {
      const ne = normAspectVal(enfant);
      const dansGrille = vals.find(a => normAspectVal(a) === ne);
      if (dansGrille) return { dans: true, valeurListe: dansGrille, suggested: null };
    }
    const t = tailleDansGrille(v, vals, { tableFemme: platform === "opla" && brancheFemmesOpla(cheminCategorie) });
    if (t) return { dans: true, valeurListe: t.valeur, suggested: null };
    // (26/10, Diana — règle de Nico) Une tranche de POIDS (couches « Taille 5 (12-18 kg) ») face à une grille en kg :
    // l'option qui contient toute la tranche, au plus près de son poids de départ (_shared/taille-de-service.js, R6 —
    // la même règle que la réponse automatique du serveur).
    const kg = tailleParPoidsKg(v, vals);
    if (kg) return { dans: true, valeurListe: kg.valeur, suggested: null };
    // (25/10, point 5) Une pointure « EU N » est l'option « N » d'une grille de pointures nue (estChampPointure).
    if (estChampPointure(platform, key, cheminCategorie)) {
      const nue = pointureNuePourEu(v, vals);
      if (nue) return { dans: true, valeurListe: nue, suggested: null };
    }
    // L'étiquette de la grille est composite avec un tiret (« 34 - XS » chez
    // Leboncoin) : un de ses composants EST la valeur, exactement — c'est le
    // « match composants-exacts » de leboncoin.js, et une seule candidate.
    const nv2 = normAspectVal(v);
    const parComposant = vals.filter(a => a.split(/\s*[-–—|/·•]\s*/).some(c => normAspectVal(c) === nv2));
    if (parComposant.length === 1) return { dans: true, valeurListe: parComposant[0], suggested: null };
    // (19/10, DeadRoz) Rien de ce qui précède n'a trouvé : la taille que la
    // copie et le texte du vendeur disent ENSEMBLE (« W30 » + « … FR40 … » →
    // « 40 » chez Beebs homme ; « 24M » → « 24 mois (86-94 cm) »), une seule
    // option de la grille, jamais en cas de doute (tailleDeduiteDuTexte).
    // Seulement quand l'appelant donne les textes : sans eux, rien ne change.
    const deduite = textes ? tailleDeduiteDuTexte({ platform, key, value: v, allowedValues: vals, cheminCategorie, textes }) : null;
    if (deduite) return { dans: true, valeurListe: deduite.valeur, suggested: null, deduite };
    // ⛔ PAS DE RAPPROCHEMENT PAR MOTS SUR UNE TAILLE. Le rapprochement par
    //    jetons lit « 44.5 » comme « 44 » + « 5 » et proposerait « 44 » sur une
    //    grille d'entiers — c'est exactement la conversion interdite (règle
    //    du 18/09 : 44.5 n'est pas 44, refuser vaut mieux qu'approximer). Le
    //    vocabulaire des tailles vient de dire non : la personne choisit.
    return { dans: false, valeurListe: null, suggested: null };
  }
  // Une marque hors du relevé reste la sienne : présence = ok (estChampMarque).
  if (estChampMarque(platform, key)) return { dans: true, valeurListe: v, suggested: null };
  return { dans: false, valeurListe: null, suggested: nearestAllowedValue(v, vals) };
}

/**
 * LA TAILLE QUE LE JOB PORTE — l'écriture EXACTE de la grille (02/10, point 11,
 * jeans de Patrick Giry). Le jugement ci-dessus TRADUIT (« 46 » est
 * « W36 | FR 46 » chez Vinted homme, « W34 | FR 44 » est « 44 - XXL » chez
 * Leboncoin) ; tant que le job partait avec « 46 », l'extension cherchait
 * « 46 » sur le formulaire, ne le trouvait pas (garde anti-nombre-nu, et
 * c'est juste) et reposait la question — une taille connue, redemandée.
 * Rend la valeur de la grille à poser à la place, ou null (rien à changer :
 * déjà exacte, hors liste, pas de grille relevée, ou Opla — son serveur la
 * traduit au service du job). La fiche, elle, garde la saisie de la personne.
 */
export function tailleDuJob({ platform, taille, lignes, cheminCategorie = null, textes = null }) {
  const brut = String(taille ?? "").trim();
  if (platform === "opla") return null;
  if (!brut && !textes) return null;
  const ligne = (Array.isArray(lignes) ? lignes : [])
    .find(a => estChampTaille(platform, a?.key) && Array.isArray(a.allowedValues) && a.allowedValues.length);
  if (!ligne) return null;
  // (19/10) Une copie SANS taille dont le texte du vendeur la dit : celle-là,
  // écrite comme la grille (la même déduction que l'écran, ligne « missing »).
  if (!brut) return tailleDeduiteDuTexte({ platform, key: ligne.key, value: "", allowedValues: ligne.allowedValues, cheminCategorie, textes })?.valeur ?? null;
  const v = jugerValeurContreListe({ platform, key: ligne.key, value: brut, allowedValues: ligne.allowedValues, cheminCategorie, textes });
  return v.dans && v.valeurListe && v.valeurListe !== brut ? v.valeurListe : null;
}

/**
 * LA TAILLE ÉCRITE DANS LE TITRE OU LA DESCRIPTION (19/10, DeadRoz — règle de
 * Nico) : _shared/taille-du-texte.js lit ce que la copie et les textes du
 * vendeur disent (FR écrit, puis W → FR par la table publiée par Vinted, puis
 * l'âge en mois « 24M ») ; l'option est placée par LE jugement de cet écran
 * (childSizes, vocabulaire des tailles), sans texte — donc sans récursion.
 * Rend { valeur, motif, regle } ou null : rien d'écrit, doute (deux tailles,
 * fourchette, W hors table, copie et texte en désaccord), une valeur de la
 * copie qu'on ne sait pas lire, une pointure, ou aucune option de la grille.
 * ⛔ Jamais appelée sur une valeur que la grille porte déjà : l'appelant ne
 *    vient ici qu'après tous les autres jugements.
 */
export function tailleDeduiteDuTexte({ platform, key, value = "", allowedValues, cheminCategorie = null, textes = [] }) {
  if (!estChampTaille(platform, key) || platform === "opla") return null;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(x => String(x).trim()).filter(Boolean);
  if (!vals.length) return null;
  const placer = (c) => {
    const j = jugerValeurContreListe({ platform, key, value: c, allowedValues: vals, cheminCategorie });
    return j.dans ? j.valeurListe : null;
  };
  const r = tailleDuTexte({ valeur: value, textes: Array.isArray(textes) ? textes : [textes], grille: vals, placer, champ: key, chemin: cheminCategorie });
  return r?.valeur ? r : null;
}

/**
 * eBay : la valeur de SA liste pour une TAILLE (02/10, point 11). Le
 * vocabulaire des tailles d'abord (« W34 | FR 44 » → « 44 », « XXL » →
 * « 2XL ») ; le rapprochement par mots seulement pour une taille sans chiffre
 * (« Unique ») — jamais sur un nombre : il lisait « 44.5 » comme « 44 », et
 * « 34 » d'un « W34 » comme le 34 français.
 */
export function tailleDansListeEbay(valeur, liste, { textes = null, champ = "Taille", chemin = null } = {}) {
  const v = String(valeur ?? "").trim();
  const vals = Array.isArray(liste) ? liste : [];
  if (!vals.length || (!v && !textes)) return null;
  const t = v ? tailleDansGrille(v, vals) : null;
  if (t) return t.valeur;
  const kg = v ? tailleParPoidsKg(v, vals) : null; // (26/10, Diana) une tranche de poids dans une liste en kg
  if (kg) return kg.valeur;
  // (19/10) Avec les textes du vendeur : la taille qu'ils disent avec la copie
  // (taille-du-texte.js), placée par le vocabulaire des tailles — avant le
  // rapprochement par mots, qui ne joue jamais sur un nombre.
  if (textes) {
    const d = tailleDuTexte({ valeur: v, textes, grille: vals, placer: (c) => tailleDansGrille(c, vals)?.valeur ?? null, champ, chemin });
    if (d?.valeur) return d.valeur;
  }
  if (!v) return null;
  return /\d/.test(v) ? null : nearestAllowedValue(v, vals);
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

// ── Ce que Vinted exige quel que soit le catalogue : la MARQUE (partout sauf
// « Livres et médias », 24/09) et la COULEUR (partout sauf les rayons mesurés
// sans champ Couleur, 25/09 — Jocabroc, Peintures et Bibelots refusés en 400).
// La règle vit dans supabase/functions/_shared/vinted-exigences.js : le
// serveur (get-pending-jobs) applique la MÊME au service du job, pour les
// écrans et les extensions d'avant. Aucune logique ici, un relais.
// Règle de Nico : aucune annonce Vinted ne part avec une marque ou une couleur
// vide. ⚠️ REMPLACÉE LE 11/10 (Nico) pour ce qui se pose SANS question :
//   · couleur exigée et vide → posée automatiquement (connue, sinon IA sur la
//     photo, sinon « Multicolore ») — moteur/couleurAuto.js, jamais une question ;
//   · AUCUNE marque nulle part (fiche, Lens, copies, aucune lecture partielle
//     sur l'étiquette) → « Sans marque » d'office — moteur/reponsesPartagees.js
//     (sansMarqueDOffice). Une marque présente hors catalogue garde sa question.
export { vintedExigeUneMarque, vintedExigeUneCouleur, vintedExigeUnIsbn, ISBN_ABSENT, valeurUneLettre, vintedExigeUneTaille, vintedObjetSansTaille, VINTED_TAILLES_JOUETS } from "../../../supabase/functions/_shared/vinted-exigences.js";

// ── RAYON VINTED « NEUF SEULEMENT » : C'EST LE RAYON QU'ON CHANGE (24/09) ───
// Relevé réel du formulaire le 24/09 : « Casques de sécurité » (Maison >
// Bricolage > Équipement de protection) n'offre qu'UN état cliquable, « Neuf
// avec étiquette » ; « Casques de vélo », « Casques d'escalade », « Bottes de
// moto » offrent les cinq. Un casque d'occasion se vend sur Vinted : c'est le
// RAYON qui était mauvais. ⛔ Ce n'est donc PAS une limite de plateforme (le
// correctif du matin écartait Vinted — retiré) : Vinted reste cochée, la
// question « État » reste posée comme ailleurs, et la carte du rayon dit en
// plus que ce rayon-là n'accepte que du neuf — pour que la personne change de
// rayon plutôt que de répondre « neuf » pour un objet porté.
// Vrai seulement quand la liste relevée de l'État ne porte QUE des « Neuf… »
// et que la valeur de l'article n'en fait pas partie.
// (24/10, point 1, sujet du 22/10) BEEBS AUSSI : 7 rayons Beebs relevés n'offrent que « Neuf, avec étiquette » /
// « Neuf, sans étiquette » (Maquillage, Parfums, Crème corps, Brassards et bouées, Biscuits et gâteaux, Biberons,
// Poussettes citadines). Louis, 22/10 : un article d'occasion rangé en « Biscuits et gâteaux ». Même règle, même geste :
// la carte dit de changer de rayon, jamais « choisis Neuf ».
const ESTNEUF_RE = /^neuf\b/;
const CHAMP_ETAT = { vinted: "condition", beebs: "État" };
export function rayonNeufSeulement({ platform, key, value, allowedValues }) {
  if (!CHAMP_ETAT[platform] || key !== CHAMP_ETAT[platform]) return false;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map(v => String(v).trim()).filter(Boolean);
  // (25/09) Un « \b » était écrit comme un CARACTÈRE retour arrière (U+0008)
  // dans cette regex : elle ne reconnaissait JAMAIS « Neuf avec étiquette », et
  // la détection était morte depuis le 24/09 (eslint no-control-regex le disait).
  if (!vals.length || !vals.every(v => ESTNEUF_RE.test(texteComparable(v)))) return false;
  const v = String(value ?? "").trim();
  if (!v) return false;
  // Un article DÉJÀ neuf (« Neuf sans étiquette ») n'est pas un article
  // d'occasion : il garde la question, sa réponse n'est pas un mensonge.
  if (ESTNEUF_RE.test(texteComparable(v))) return false;
  return !vals.some(a => normAspectVal(a) === normAspectVal(v));
}

/** La phrase de la carte du rayon : changer de rayon, jamais « choisis Neuf ». */
export function messageRayonNeuf({ valeur, platform = "vinted" }, lang = "fr") {
  const nom = platform === "beebs" ? "Beebs" : "Vinted";
  return lang === "en"
    ? `This ${nom} category only accepts new items (this item: “${valeur}”).`
    : `Ce rayon ${nom} n'accepte que des articles neufs (ton article : « ${valeur} »).`;
}

// ── (24/10, point 1, sujet du 22/10) RAYON ADULTE, TAILLE ENFANT (ET L'INVERSE) ──────────────────────────────────
// Louis, 22/10 : « Short Okaïdi 10 ans » rangé en rayon Beebs FEMME — la grille proposée était celle d'une femme
// (« XS / 34 »), et une réponse au hasard est partie. Une taille d'âge (« 10 ans », « 24 mois », « 12Y ») dans un
// rayon adulte, ou un tour de taille (« W33 », « 33/34 ») dans un rayon enfant : la question n'est pas la taille,
// c'est le RAYON — la carte le dit, comme pour « neuf seulement », et ne propose jamais la grille de l'autre public.
// Jamais deviné : seulement un rayon dont le chemin nomme son public, et une taille qui nomme le sien.
const PUBLIC_ENFANT_RE = /(?<![\p{L}\p{N}])(?:enfants?|filles?|gar[cç]ons?|b[ée]b[ée]s?|kids?|juniors?|girls?|boys?|pu[ée]riculture)(?![\p{L}\p{N}])/iu;
const PUBLIC_ADULTE_RE = /(?<![\p{L}\p{N}])(?:femmes?|hommes?|women|men|adultes?)(?![\p{L}\p{N}])/iu;
/** Le public d'un rayon, lu sur son chemin : 'enfant' | 'adulte' | null. */
export function publicDuRayon(chemin) {
  const c = Array.isArray(chemin) ? chemin.join(" > ") : String(chemin ?? "");
  if (PUBLIC_ENFANT_RE.test(c)) return "enfant";
  if (PUBLIC_ADULTE_RE.test(c)) return "adulte";
  return null;
}
/** Le public qu'une taille nomme : 'enfant' (un âge), 'adulte' (un tour de taille), sinon null. */
export function publicDeLaTaille(valeur) {
  const v = String(valeur ?? "").trim().toLowerCase();
  if (!v) return null;
  const morceaux = v.split(/\s*[|/·•()]\s*|\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
  if (morceaux.some((x) => /^\d{1,2}\s?(?:mois|ans?|years?)$/.test(x) || /^\d{1,2}[my]$/.test(x))) return "enfant";
  if (/^w\s?\d{2}(?:\s?(?:\/|x)?\s?l\s?\d{2})?$/.test(v) || /^\d{2}\s?w(?:\s?(?:\/|x)?\s?\d{2}\s?l)?$/.test(v)
      || morceaux.some((x) => /^w\s?\d{2}$/.test(x))) return "adulte";
  return null;
}
/** Le rayon et la taille nomment-ils deux publics différents ? → { rayon, article } ou null. */
export function rayonPublicIncoherent({ platform, chemin, valeur }) {
  if (platform !== "beebs" && platform !== "vinted") return null;
  const rayon = publicDuRayon(chemin);
  const article = publicDeLaTaille(valeur);
  return rayon && article && rayon !== article ? { rayon, article } : null;
}
/** La phrase de la carte : changer de rayon (ou corriger la taille), jamais une taille de l'autre public. */
export function messageRayonPublic({ valeur, platform = "beebs", rayon }, lang = "fr") {
  const nom = platform === "beebs" ? "Beebs" : "Vinted";
  if (lang === "en") {
    return rayon === "adulte"
      ? `This ${nom} category is for adults, and the item's size is “${valeur}” (a child's size). Pick a children's category with “Change”; if the item is for adults, correct its size.`
      : `This ${nom} category is for children, and the item's size is “${valeur}” (an adult size). Pick an adult category with “Change”; if the item is for a child, correct its size.`;
  }
  return rayon === "adulte"
    ? `Ce rayon ${nom} est un rayon adulte, et la taille de ton article est « ${valeur} » (une taille enfant). Choisis un rayon enfant avec « Changer » ; si l'article est pour adulte, corrige sa taille.`
    : `Ce rayon ${nom} est un rayon enfant, et la taille de ton article est « ${valeur} » (une taille adulte). Choisis un rayon adulte avec « Changer » ; si l'article est pour enfant, corrige sa taille.`;
}
