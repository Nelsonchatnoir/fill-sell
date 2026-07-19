import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronLeft, Mic, Plus, X, Sparkles, Pencil, Clock, ImageOff, GripVertical } from "lucide-react";
import ConversionModal from "./ConversionModal";
import CoinStoreModal from "./CoinStoreModal";
import PepiteIcon from "./PepiteIcon";
import PlatformLogo from "./platform-logos/PlatformLogo";
import { useTranslation } from "../i18n/useTranslation";
import { Loader } from "./ui";
import { detectObjectIcon } from "../utils/shared";
import { getVintedCategoryPath, vintedGenreRequired } from "../utils/vintedCategories";
import { getLbcCategoryPath, getLbcBabyEquipment, getLbcBabyClothingProduct } from "../utils/lbcCategories";
import { getEbayCategoryPath, getEbayCategoryId, ebayGenreRequired } from "../utils/ebayCategories";
import { getBeebsCategoryPath, beebsGenreRequired } from "../utils/beebsCategories";
import { getPlatformSupport } from "../utils/platformCompat";
import {
  CHILD_MONTH_SIZES, CHILD_YEAR_SIZES, CHILD_SHOE_EU_MIN, CHILD_SHOE_EU_MAX,
  isChildGenre, childAxesForGenre, toPlatformChildSize, lbcChildSizeCategory,
} from "../utils/childSizes";

// Palette identique à LensTab.jsx et à la navbar (thème clair 2026).
const T = {
  canvas:   "#EDEAE0",
  paper:    "#F6F5F1",
  ink:      "#10201B",
  teal:     "#2F9E90",
  tealDeep: "#1B6E62",
  mute:     "#8A8578",
  mute2:    "#6B7A75",
  border:   "#E7E3D8",
  card:     "#FFFFFF",
  chip:     "#F2F0E9",
};

export const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const PLATFORM_COLORS   = { vinted:"#09B584", leboncoin:"#EA5B0C", beebs:"#FF6B35", ebay:"#0064D2" };
const PLATFORMS_DEFAULT = ["vinted","leboncoin","beebs","ebay"];

// Minimum de photos exigé pour publier — c'est le minimum de VINTED sur les
// marques premium (VINTED_MIN_PHOTOS, chrome-extension/content-scripts/vinted.js).
// Jusqu'ici l'extension COMPLÉTAIT à 3 en dupliquant la dernière photo, faute de
// mieux. On le demande désormais à la source : de vraies photos, pas des copies.
const MIN_PHOTOS = 3;

// Photos UPLOADABLES vs photos RETOUCHÉES — deux plafonds distincts (2026-07-14).
// La limite de 5 côté client n'a jamais été une limite d'upload : c'est le
// garde-fou de COÛT de la retouche GPT Image. generate-listing le dit lui-même
// (MAX_RETOUCHED = 5, index.ts l.439) et gère DÉJÀ le surplus : « les photos
// au-delà sont conservées telles quelles ». Le serveur n'avait donc jamais
// besoin qu'on plafonne l'upload — le client était juste plus strict que lui.
// 10 : au-dessus du minimum de toutes les plateformes ciblées et bien en deçà
// de leurs plafonds (Vinted 20, eBay 24…), sans exploser le payload des jobs.
const MAX_PHOTOS = 10;
const MAX_RETOUCHED = 5;   // doit rester aligné sur generate-listing.MAX_RETOUCHED

// ── Champs partagés taille/couleur/matiere/marque (2026-07-11, Sujet 4) ──────
// UNE valeur source par champ (canonicalisée côté generate-listing), deux
// cartes distinctes :
// - PROPAGATION : qui reçoit la valeur répliquée — suit les schémas/handlers
//   réels (taille inclut leboncoin : leboncoin.js remplit la Pointure,
//   critère OBLIGATOIRE sur Mode>Chaussures, depuis fields.taille).
// - GARDE : qui peut BLOQUER la publication si le champ manque — décision
//   produit : jamais Leboncoin sur couleur (aucun champ structuré), et sur
//   taille SEULEMENT pour Mode>Chaussures (la Pointure y est OBLIGATOIRE —
//   "Veuillez choisir une pointure", shoe_size ; le critère taille des
//   autres catégories, clothing_st, n'est pas requis). Cette exception est
//   résolue dynamiquement dans missingSharedFields, pas dans la carte.
//
// ⚠️ taille est en plus SCOPÉE PAR CATÉGORIE (2026-07-12, bug Xiaomi) : cette
// carte ne dit QUE « quelles plateformes peuvent bloquer », jamais « sur quels
// articles ». Sans scope, publier un téléphone sur Vinted/Beebs/eBay exigeait
// une taille — un smartphone n'en a pas. La garde taille ne s'applique donc
// qu'aux articles Mode>Vêtements et Mode>Chaussures (cf. sizeGuardApplies dans
// missingSharedFields).
// MATIÈRE : même scope que la Taille depuis le 2026-07-12 (3e cas du même bug).
// Le référentiel eBay réel (ebay_item_aspects) ne la déclare obligatoire sur
// AUCUNE des catégories du run — contrairement à COULEUR et MARQUE, qu'eBay
// exige sur les 4 (meuble compris). Ces deux-là restent donc gardées partout,
// et le champ Marque offre un raccourci « Sans marque » (NO_BRAND_VALUE) pour
// les objets qui n'en ont légitimement pas, plutôt que de forcer une invention.
// Valeur canonique pour un objet sans marque (meubles, artisanat, lots…).
// C'est le libellé que les plateformes attendent — Vinted et eBay ont tous deux
// une entrée « Sans marque » dans leur référentiel de marques. On l'envoie donc
// telle quelle : la garde Marque reste satisfaite sans rien inventer.
const NO_BRAND_VALUE = "Sans marque";

const SHARED_FIELD_KEYS = ["taille", "couleur", "matiere", "marque"];
const SHARED_PROPAGATION = {
  taille:  ["vinted", "beebs", "leboncoin", "ebay"],
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["vinted", "beebs", "leboncoin", "ebay"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay"],
};
const SHARED_GUARD = {
  taille:  ["vinted", "beebs", "ebay"],
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["vinted", "beebs", "leboncoin", "ebay"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay"],
};
// Icônes beauté PRODUIT (mêmes 4 que generate-listing) : la Couleur n'y est
// exigée par AUCUN référentiel réel — eBay (table ebay_item_aspects) : Soins
// 21205 et Vernis 11873 → Marque+Type, Parfums 11848/29585/112661/159719 →
// Marque+Type+Volume+Nom, Maquillage 31804 → Teinte (label DIFFÉRENT, que le
// champ Couleur ne satisfait pas de toute façon) ; relevé Vinted réel
// (platform_category_aspects) : Beauté > Parfums → État seul. Les appareils
// (💇 sèche-cheveux, 🪒 rasoirs) gardent la garde standard.
const BEAUTY_PRODUCT_ICONS = ["🌸", "💄", "💅", "🧴"];

// Correspondances label d'aspect eBay → champ partagé de l'app — UNE seule
// source pour l'encart bleu (ebayRequiredStatus) ET la garde data-driven du
// bloc rouge : aucune divergence possible entre les deux.
const EBAY_ASPECT_LABELS = {
  marque:  ["Marque"],
  taille:  ["Taille", "Pointure EU", "Pointure"],
  couleur: ["Couleur", "Couleur de la monture", "Couleur extérieure"],
  matiere: ["Matière", "Matériau", "Matériaux", "Matière de la couche extérieure", "Matière doublure externe", "Matière extérieure"],
};
// field_key du catalogue platform_category_aspects → champ partagé de l'app.
// MÊMES correspondances que genericKnownSource (qui mappe champ→valeur, plus
// bas) — les deux doivent évoluer ensemble : vinted = codes d'attribut
// serveur, LBC = attribut for= des labels du wizard, Beebs = libellés exacts.
function genericFieldToSharedKey(platform, key) {
  if (platform === "vinted") {
    return { brand: "marque", size: "taille", color: "couleur", material: "matiere" }[key] ?? null;
  }
  if (platform === "leboncoin") {
    if (/_brand$/.test(key)) return "marque";
    if (/_size$/.test(key) || key === "clothing_st" || key === "baby_age") return "taille";
    if (/_material$/.test(key)) return "matiere";
    if (/_colou?r$/.test(key)) return "couleur";
    return null;
  }
  if (platform === "beebs") {
    return { "Marque": "marque", "Pointure": "taille", "Taille": "taille", "Couleur": "couleur", "Matière": "matiere" }[key] ?? null;
  }
  return null;
}

// ── Icône objet : UNE résolution, stable, pour TOUTES les plateformes ─────────
// (2026-07-12, run du soir) Les mappings catalogue (Vinted/eBay/Beebs/LBC) sont
// tous indexés par l'icône objet, et l'icône était calculée depuis le titre de
// CHAQUE COPIE plateforme. Deux échecs prouvés ce soir :
//   · eBay : le titre est en ANGLAIS ("… Tulip Design Chair …") et les règles de
//     detectObjectIcon sont en FRANÇAIS → icône 📦 → ebayCategoryId absent → job
//     refusé avant même d'ouvrir un onglet. Le mapping 🪑 (id 54235) existait
//     pourtant : ce n'est pas le catalogue qui manquait, c'est l'icône.
//   · Beebs : titre marketing "New Balance 9060 Noir Suède/Mesh 44" — aucun mot
//     "baskets"/"sneakers" → 📦 → beebsCategoryPath null. Le message d'erreur
//     accusait le GENRE ("genre = Homme"), alors que getBeebsCategoryPath('👟',
//     'Homme') résout parfaitement : le genre était bon, l'icône était fausse.
// Règle : on détecte sur la SOURCE française et stable (l'article), pas sur la
// prose réécrite par l'IA pour chaque plateforme.
function resolveArticleIcon({ initialListing, edited, pf }) {
  // Copies FR seulement — jamais eBay (traduite en anglais).
  const frTitle =
    initialListing?.titre ??
    edited?.leboncoin?.title ??
    edited?.vinted?.title ??
    edited?.beebs?.title ??
    "";
  const frDesc =
    initialListing?.description ??
    edited?.leboncoin?.description ??
    edited?.vinted?.description ??
    "";
  // La marque et la taille sont des signaux : "New Balance" + "EU 44" disent
  // "chaussure" là où le titre marketing ne le dit pas.
  const marque = pf?.marque ?? initialListing?.marque ?? "";
  const taille = pf?.taille ?? initialListing?.taille ?? "";
  const categorie = pf?.categorie || initialListing?.categorie;

  const icon = detectObjectIcon(frTitle, `${frDesc} ${marque}`, categorie);
  if (icon !== "📦") return icon; // 📦 = CAT_DEFAULT_ICONS['Autre'] (shared.js)

  // Dernier recours UNIQUEMENT (l'icône est déjà le défaut « Autre », on ne peut
  // rien dégrader) : une POINTURE trahit une chaussure. Volontairement borné aux
  // libellés de pointure (EU/UK/US/« pointure ») — un simple "44" ne suffit pas,
  // une veste peut être taille 44.
  if (/(?:pointure|\b(?:eu|uk|us)\s?(?:3[5-9]|4[0-9]|50)\b)/i.test(`${taille} ${frTitle}`)) {
    return "👟";
  }
  return icon;
}

// Vêtements & chaussures de SPORT (2026-07-12) — utilisé UNIQUEMENT à l'intérieur
// de la feuille Loisirs>Sport & Plein air, jamais ailleurs (cf. missingSharedFields).
// Pourquoi : le mapping range "combinaison de ski" ou "maillot de foot" avec les
// ballons et les vélos ; ces articles se PORTENT et ont une taille, l'équipement
// non. Ne jamais y mettre de mot qui décrive de l'équipement (casque, raquette,
// ballon…) : il redemanderait une taille pour un objet qui n'en a pas.
const SPORTSWEAR_RE = new RegExp(
  [
    // hauts / bas / combinaisons
    "combinaison", "n[ée]opr[eè]ne", "wetsuit", "rashguard", "maillot", "jersey",
    "cuissard", "brassi[eè]re", "justaucorps", "l[ée]otard", "kimono", "judogi", "dobok",
    "surv[eê]tement", "jogging", "legging", "collant", "cycliste", "softshell", "polaire",
    "veste de (?:ski|sport)", "pantalon de ski", "salopette de ski", "doudoune de ski",
    // chaussures de sport (elles ont une pointure)
    "chaussons? d['’]escalade", "chaussures? de (?:ski|foot|sport|running|rando(?:nn[ée]e)?)",
    "crampons?", "patins?", "rollers?", "chaussons? de danse",
  ].join("|"),
  "i",
);

// Options traduites pour l'affichage, mais `value` reste le libellé FR canonique
// envoyé aux plateformes (Vinted/Leboncoin/Beebs restent des sites francophones).
function getPlatformFieldsConfig(t) {
  const condition = {
    newWithTag:    { value:"Neuf avec étiquette", label:t("conditionNewWithTag") },
    newWithoutTag: { value:"Neuf sans étiquette",  label:t("conditionNewWithoutTag") },
    veryGood:      { value:"Très bon état",        label:t("conditionVeryGood") },
    good:          { value:"Bon état",             label:t("conditionGood") },
    satisfactory:  { value:"Satisfaisant",         label:t("conditionSatisfactory") },
    new_:          { value:"Neuf",                 label:t("conditionNew") },
    correct:       { value:"État correct",         label:t("conditionCorrect") },
    forParts:      { value:"Pour pièces",          label:t("conditionForParts") },
  };
  // Beebs écrit ses états AVEC une virgule et n'a pas de "Satisfaisant" : son
  // plus bas niveau est "État moyen" (relevés concordants du 2026-07-08 sur le
  // rayon Mode et du 2026-07-09 sur Figurines). `value` doit être le libellé
  // EXACT de la plateforme — la cascade fuzzy du handler n'est qu'un filet,
  // pas une excuse pour envoyer un libellé qui n'existe pas.
  const beebsCondition = [
    { value:"Neuf, avec étiquette",  label:t("conditionNewWithTag") },
    { value:"Neuf, sans étiquette",  label:t("conditionNewWithoutTag") },
    { value:"Très bon état",         label:t("conditionVeryGood") },
    { value:"Bon état",              label:t("conditionGood") },
    { value:"État moyen",            label:t("conditionAverage") },
  ];
  const sizeLetterOptions  = ["XS","S","M","L","XL","XXL","Unique"].map(v => ({ value:v, label:v }));
  const sizeNumericOptions = [];
  for (let n = 34; n <= 52; n += 2) sizeNumericOptions.push({ value:String(n), label:String(n) });
  const sizeShoeOptions = [];
  for (let half = 70; half <= 92; half++) {
    const label = `EU ${half / 2}`;
    sizeShoeOptions.push({ value:label, label });
  }
  const sizeGroups = [
    { groupLabel:t("sizeGroupGarmentLetter"),  options:sizeLetterOptions },
    { groupLabel:t("sizeGroupGarmentNumeric"), options:sizeNumericOptions },
    { groupLabel:t("sizeGroupShoe"),           options:sizeShoeOptions },
  ];
  // ── Tailles ENFANT (2026-07-15, chantier « trou tailles bébé/enfant ») ────
  // Valeurs CANONIQUES du référentiel childSizes.js (« 6 mois », « 8 ans »,
  // « EU 31 ») — jamais les libellés plateforme (« 6-9 mois / 68 cm ») : la
  // conversion vers le libellé exact de chaque plateforme se fait à l'insert
  // du job (handlePublish), comme pour le reste du chantier. Ces groupes ne
  // s'affichent que quand le genre de l'article est enfant, et FILTRÉS PAR
  // AXE selon ce genre (`axis` + childAxesForGenre — bug réel du 2026-07-15 :
  // taille en mois proposée sous genre Fille → catégorie eBay 51581
  // « Robes Fille 2-16 ans » sans aucune valeur mois → garde bloquée en
  // boucle). Bébé → mois ; Fille/Garçon/Enfant → ans ; pointures toujours.
  const childMonthOptions = CHILD_MONTH_SIZES.map(e => ({ value:e.value, label:e.value }));
  const childYearOptions  = CHILD_YEAR_SIZES.map(e => ({ value:e.value, label:e.value }));
  const childShoeOptions  = [];
  for (let n = CHILD_SHOE_EU_MIN; n <= CHILD_SHOE_EU_MAX; n++) {
    childShoeOptions.push({ value:`EU ${n}`, label:`EU ${n}` });
  }
  const childSizeGroups = [
    { axis:"months", groupLabel:t("sizeGroupChildMonths"), options:childMonthOptions },
    { axis:"years",  groupLabel:t("sizeGroupChildYears"),  options:childYearOptions },
    { axis:"shoes",  groupLabel:t("sizeGroupChildShoe"),   options:childShoeOptions },
  ];
  const size = [
    ...sizeLetterOptions, ...sizeNumericOptions, ...sizeShoeOptions,
    ...childMonthOptions, ...childYearOptions, ...childShoeOptions,
  ];
  // Tranches d'âge Beebs : libellés EXACTS relevés sur la vraie page
  // (2026-07-09, catégorie Figurines — mêmes valeurs que la liste fermée déjà
  // imposée au prompt generate-listing et à la cascade beebs.js).
  const beebsAge = [
    "0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans",
    "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans",
    "16 ans et +",
  ].map(v => ({ value: v, label: v }));
  const packageFormat = [
    { value:"Lettre",           label:t("packageLetter") },
    { value:"Petit colis",      label:t("packageSmall") },
    { value:"Moyen colis",      label:t("packageMedium") },
    { value:"Grand colis",      label:t("packageLarge") },
    { value:"Très grand colis", label:t("packageXLarge") },
    { value:"Non défini",       label:t("packageUndefined") },
  ];

  // Genre : valeurs FR canoniques ("Femme"/"Homme"/…) — clés du mapping
  // catégorie Vinted (src/utils/vintedCategories.js), remplies par l'IA
  // (generate-listing) et corrigeables ici avant publication.
  // Fille/Garçon ajoutés le 2026-07-16 (bug réel : job vinted parti avec
  // genre "Enfant" → « Catégorie vinted non résolue » — l'arbre Vinted n'a
  // AUCUN rayon enfant unisexe, seules les clés Fille/Garçon de MODE_ENFANT
  // résolvent, et le select ne permettait même pas de les choisir). Cette
  // liste sert aussi à l'Univers Leboncoin, où Fille/Garçon sont également
  // des valeurs réelles du formulaire (relevé 2026-07-15). "Enfant" reste
  // affichable (l'IA peut le produire, eBay a un vrai rayon unisexe) mais
  // le bandeau vintedGenreRequired signale qu'il ne résout rien sur Vinted.
  const gender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Fille",  label:t("genderGirl") },
    { value:"Garçon", label:t("genderBoy") },
    { value:"Enfant", label:t("genderChild") },
    { value:"Mixte",  label:t("genderUnisex") },
  ];

  // Beebs range la Mode en 5 rayons RÉELS — Femme | Homme | Fille | Garçon |
  // Bébé (crawl du sélecteur, docs/beebs-categories-raw.txt : aucune entrée
  // "Enfant" ni "Mixte" dans tout l'arbre). L'ancienne config servait les 4
  // valeurs génériques ci-dessus : un article de mode enfant était donc
  // IMPOSSIBLE à publier sur Beebs — getBeebsCategoryPath ne résolvait rien
  // pour "Enfant", et le message d'erreur demandait de "choisir un genre"
  // alors que l'app n'en proposait aucun de valide (bug du 2026-07-09).
  // "Mixte" reste volontairement absent : Beebs n'a pas de rayon unisexe.
  const beebsGender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Fille",  label:t("genderGirl") },
    { value:"Garçon", label:t("genderBoy") },
    { value:"Bébé",   label:t("genderBaby") },
  ];

  // eBay a SEPT rayons exploitables : les 5 genrés + "Enfant : unisexe" (rayon
  // réel, d'où la clé Enfant) + "Parfums mixtes" (seul usage de Mixte, icône
  // 🌸). Le stepper n'offrait que Femme/Homme/Enfant/Mixte : six icônes
  // laissaient alors un TROU atteignable — 👗 👛 🧣 🧤 🧢 🕶️ en genre "Enfant"
  // ne résolvent aucun rayon unisexe, alors que Fille/Garçon/Bébé en ont un
  // (vérifié le 2026-07-09 sur ebayCategories.js). Les exposer ferme ces trous
  // et affine les feuilles partout ailleurs.
  const ebayGender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Fille",  label:t("genderGirl") },
    { value:"Garçon", label:t("genderBoy") },
    { value:"Bébé",   label:t("genderBaby") },
    { value:"Enfant", label:t("genderChild") },
    { value:"Mixte",  label:t("genderUnisex") },
  ];

  // modele + stockage (2026-07-13, lot High-Tech smartphone) : consommés par
  // vinted.js (#model / #internal_memory_capacity) et ebay.js (aspects
  // « Modèle » / « Capacité de stockage »). Sans ces entrées,
  // mergeFieldsWithLens jetait les valeurs générées (aucune clé hors config
  // ne survit — même piège que l'univers LBC, 3e récidive). La liste stockage
  // est RELEVÉE sur le formulaire Vinted (Téléphones portables, 20 options) ;
  // les libellés eBay observés (128 Go/256 Go/512 Go) utilisent les mêmes
  // unités françaises, la liste sert donc aux deux plateformes.
  const storage = [
    "256 Mo", "512 Mo", "1 Go", "2 Go", "3 Go", "4 Go", "6 Go", "8 Go",
    "10 Go", "12 Go", "16 Go", "32 Go", "64 Go", "128 Go", "256 Go",
    "512 Go", "1 To", "2 To", "3 To", "4 To",
  ].map(v => ({ value: v, label: v }));

  return {
    vinted: [
      { key:"etat",      label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",    label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      { key:"genre",     label:t("fieldGenderLabel"),    type:"select", options: gender },
      { key:"marque",    label:t("fieldBrandLabel"),     type:"text" },
      { key:"modele",    label:t("fieldModelLabel"),     type:"text" },
      { key:"stockage",  label:t("fieldStorageLabel"),   type:"select", options: storage },
      { key:"matiere",   label:t("fieldMaterialLabel"),  type:"text" },
      { key:"couleur",   label:t("fieldColorLabel"),     type:"text" },
      { key:"categorie", label:t("fieldCategoryLabel"),  type:"text" },
    ],
    leboncoin: [
      { key:"etat",         label:t("fieldConditionLabel"),     type:"select", options:[condition.new_, condition.veryGood, condition.good, condition.correct, condition.forParts] },
      // Taille indispensable pour les chaussures : la Pointure est un critère
      // OBLIGATOIRE du rayon Mode>Chaussures LBC ("Veuillez choisir une
      // pointure" bloque l'aperçu — relevé campagne 2026-07-08). Sans cette
      // entrée, mergeFieldsWithLens jette la taille générée par l'IA (même
      // piège que l'univers, documenté plus bas).
      { key:"taille",       label:t("fieldSizeLabel"),          type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      { key:"format_colis", label:t("fieldPackageFormatLabel"), type:"select", options: packageFormat },
      // Univers (rayon Mode LBC) : mêmes libellés que le genre Vinted, mapping
      // 1:1 vérifié (docs/leboncoin-form-survey.md) — LBC a un rayon Mixte.
      // Sans cette entrée, mergeFieldsWithLens jetait l'univers généré par
      // l'IA (aucune clé hors config ne survit) → champ obligatoire vide.
      { key:"univers",      label:t("fieldUniversLabel"),       type:"select", options: gender },
      // marque + matiere (2026-07-09) : consommés par leboncoin.js
      // (label[for$="_brand"] / [for$="_material"]) mais absents d'ici, donc
      // jetés par mergeFieldsWithLens et TOUJOURS vides. Texte libre : la
      // liste des matières LBC est par catégorie et n'a pas été crawlée.
      { key:"marque",       label:t("fieldBrandLabel"),         type:"text" },
      { key:"matiere",      label:t("fieldMaterialLabel"),      type:"text" },
    ],
    // genre indispensable : c'est lui qui résout le rayon Mode Beebs
    // (Femme/Homme/Fille/Garçon/Bébé, cf. beebsCategories.js) — sans ce champ
    // dans la config, mergeFieldsWithLens jette le genre généré par l'IA et
    // getBeebsCategoryPath ne résout jamais rien pour les articles de mode
    // (même piège que celui documenté pour l'univers Leboncoin ci-dessus).
    beebs: [
      { key:"etat",   label:t("fieldConditionLabel"), type:"select", options: beebsCondition },
      { key:"taille", label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      { key:"genre",  label:t("fieldGenderLabel"),    type:"select", options: beebsGender },
      { key:"marque", label:t("fieldBrandLabel"),     type:"text" },
      // matiere + couleur (2026-07-09) : consommés par beebs.js depuis
      // toujours, jamais produits → toujours vides. "Matière" apparaît SANS
      // "(facultatif)" sur « Figurines » (dry-run réel), donc potentiellement
      // bloquant. Texte libre : listes Beebs non crawlées, match fuzzy côté
      // handler.
      { key:"matiere", label:t("fieldMaterialLabel"), type:"text" },
      { key:"couleur", label:t("fieldColorLabel"),    type:"text" },
      // age : liste FERMÉE relevée sur la vraie page (2026-07-09, catégorie
      // Figurines — cf. beebs.js et le prompt generate-listing qui l'impose
      // déjà). Resté type:"text" jusqu'au 2026-07-19 : un requis en saisie
      // libre, interdit par la règle produit — select sur les 10 tranches.
      { key:"age",     label:t("fieldAgeLabel"),      type:"select", options: beebsAge },
      // format_colis (2026-07-19, cas réel Medik8) : requis Beebs PAS toujours
      // pré-rempli (vide sur Hygiène et beauté, relevé live). Mêmes valeurs
      // canoniques que LBC — beebs.js les mappe sur ses paliers de poids.
      { key:"format_colis", label:t("fieldPackageFormatLabel"), type:"select", options: packageFormat },
    ],
    // eBay.fr est francophone : clés et valeurs FR canoniques, alignées sur
    // les autres plateformes ET sur ce que consomme l'extension (etat, taille,
    // genre, marque, matiere, couleur). L'ancienne config anglophone
    // (condition/size/brand/material) datait d'avant le mapping catégories —
    // ses clés n'étaient lues par personne. Genre indispensable : c'est lui
    // qui choisit le rayon eBay (Femme/Homme/Enfant passent tels quels,
    // "Enfant : unisexe" est un rayon réel ; Mixte n'a pas de rayon → blocage
    // doux à la publication comme Vinted).
    ebay: [
      { key:"etat",    label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",  label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      { key:"genre",   label:t("fieldGenderLabel"),    type:"select", options: ebayGender },
      { key:"marque",  label:t("fieldBrandLabel"),     type:"text" },
      { key:"modele",  label:t("fieldModelLabel"),     type:"text" },
      { key:"stockage",label:t("fieldStorageLabel"),   type:"select", options: storage },
      { key:"matiere", label:t("fieldMaterialLabel"),  type:"text" },
      { key:"couleur", label:t("fieldColorLabel"),     type:"text" },
    ],
  };
}

const FR_TO_EBAY_CONDITION = {
  "neuf avec étiquette": "New",
  "neuf sans étiquette": "Like New",
  "neuf":                "New",
  "très bon état":       "Very Good",
  "bon état":            "Good",
  "état correct":        "Good",
  "satisfaisant":        "Acceptable",
  "pour pièces":         "Acceptable",
};

function findMatchingOption(raw, options) {
  if (!raw || raw === "null") return "";
  const n = raw.toLowerCase().trim();
  const exact = options.find(o => o.value.toLowerCase() === n);
  if (exact) return exact.value;
  const mapped = FR_TO_EBAY_CONDITION[n];
  if (mapped && options.some(o => o.value === mapped)) return mapped;
  // Match the LONGEST candidate, not the first one found: with short option values
  // like "S"/"M"/"L" (letter sizes) mixed into the same list as "EU 42" (shoe sizes),
  // a naive substring match on e.g. "EU 42 (US 9)" would wrongly hit "S" (from "US")
  // before ever considering "EU 42" — the longest match is always the more specific one.
  const candidates = options.filter(o => {
    const v = o.value.toLowerCase();
    return n.includes(v) || v.includes(n);
  });
  if (!candidates.length) return "";
  candidates.sort((a, b) => b.value.length - a.value.length);
  return candidates[0].value;
}

// ── Pertinence des champs par catégorie réelle (2026-07-14) ──────────────────
// getPlatformFieldsConfig est STATIQUE par plateforme : Vinted affichait ses 9
// champs à tout le monde, d'où « Espace de stockage » demandé sur un t-shirt.
// On filtre L'AFFICHAGE seulement — jamais mergeFieldsWithLens ni les
// platform_fields envoyés à l'extension (retirer une clé des données casserait
// la publication). Le prédicat est DÉRIVÉ des tables déjà en place
// (getLbcCategoryPath, indexée par l'icône detectObjectIcon, celle-là même que
// missingSharedFields utilise) : aucun nouveau mapping catégorie→champs.
function isFieldRelevant(key, icon) {
  const path = getLbcCategoryPath(icon);
  const root = path?.[0] ?? null;
  const leaf = path?.[1] ?? null;
  // Porté (taille) : mêmes feuilles que la garde taille de missingSharedFields.
  const wearable = root === "Mode" && (leaf === "Vêtements" || leaf === "Chaussures");
  // Mode au sens large (genre / rayon) : vêtements, chaussures, sacs, montres…
  const fashion = root === "Mode";
  const electronics = root === "Électronique";
  const toys = root === "Loisirs" && leaf === "Jeux & Jouets";
  const baby = getLbcBabyEquipment(icon) != null;

  switch (key) {
    case "taille":   return wearable;
    case "genre":
    case "univers":  return fashion;
    case "modele":
    case "stockage": return electronics;
    case "age":      return toys || baby;
    // matiere : bloquante uniquement sur la mode (cf. materialGuardApplies) —
    // ailleurs on ne la demande que si l'IA a trouvé une valeur (cf. appelant).
    case "matiere":  return fashion;
    default:         return true;   // etat, couleur, marque, categorie… : partout
  }
}

// Filtre d'affichage : garde un champ s'il est pertinent OU s'il porte déjà une
// valeur (ne jamais cacher une donnée que l'IA a trouvée et que l'utilisateur
// pourrait vouloir corriger).
function visibleFields(fieldConfigs, icon, values) {
  return fieldConfigs.filter(f =>
    isFieldRelevant(f.key, icon) || String(values?.[f.key] ?? "").trim() !== ""
  );
}

// ── Défaut d'état ─────────────────────────────────────────────────────────────
// Filet structurel (2026-07-14), pas un choix produit : l'état manquait parfois
// de bout en bout (l'IA ne le renvoie pas, l'analyse Lens non plus, la ligne de
// stock saisie à la main n'en a pas) et partait vide → champ obligatoire non
// rempli sur les 4 plateformes.
//
// "Très bon état" est le SEUL libellé écrit à l'identique dans la liste fermée
// des 4 plateformes (Beebs écrit ses états avec une virgule — "Neuf, avec
// étiquette" — mais pas celui-ci). C'est aussi le milieu de gamme : il ne
// survend jamais l'article (contrairement à Neuf) et ne le brade pas.
// Il est TOUJOURS résolu dans les options de la plateforme visée : on n'envoie
// jamais un libellé absent de sa propre liste.
const DEFAULT_CONDITION = "Très bon état";
const isConditionKey = k => k === "etat" || k === "condition";

// Défauts DÉTERMINISTES d'aspects obligatoires eBay (Phase 1, 2026-07-16).
// Certains obligatoires sans source app ont une valeur standard eBay SÛRE,
// qui ne dépend pas du contexte article — on la pose sans passer par l'IA :
//  - « Numéro de pièce fabricant » (MPN) : trou n°1 de l'audit (32 catégories,
//    ~31 % des trous — Sport, Musique, Bébé, Auto-Moto, Jouets, Bricolage,
//    Bijoux, Loisirs). Pour un objet d'OCCASION sans référence fabricant
//    lisible, la valeur canonique eBay est « Ne s'applique pas » (FREE_TEXT,
//    acceptée par toutes ces catégories). Déterministe = plus jamais bloqué
//    par un échec/rate-limit de l'appel Haiku resolve_aspects.
// Écrit dans pf.ebayAspects (même canal générique) ; reste ÉDITABLE dans le
// fallback UI (l'utilisateur peut saisir un vrai MPN s'il l'a).
const EBAY_ASPECT_DEFAULTS = {
  "Numéro de pièce fabricant": "Ne s'applique pas",
};

// Département eBay depuis le genre de la copie (2026-07-19, montre Casio
// 31387 : genre="Homme" présent sur le job, Département requis resté VIDE —
// dernier aspect encore « supposé pré-rempli »). Les LIBELLÉS varient par
// catégorie (relevé complet ebay_item_aspects : Homme/Femme/Fille/Garçon,
// « Bébé et tout-petit (unisexe) », « Enfant unisexe », « Adolescents »,
// « Adulte unisexe », « Unisexe », « Enfant », « Adulte ») : candidats du
// plus spécifique au plus général, seul un candidat PRÉSENT dans la liste de
// la catégorie est retenu — jamais de valeur inventée.
const EBAY_DEPARTMENT_BY_GENRE = {
  "Femme":  ["Femme", "Adulte unisexe", "Unisexe", "Adulte"],
  "Homme":  ["Homme", "Adulte unisexe", "Unisexe", "Adulte"],
  "Fille":  ["Fille", "Enfant unisexe", "Enfant", "Unisexe"],
  "Garçon": ["Garçon", "Enfant unisexe", "Enfant", "Unisexe"],
  "Bébé":   ["Bébé et tout-petit (unisexe)", "Bébé", "Enfant unisexe", "Enfant"],
  "Enfant": ["Enfant unisexe", "Enfant", "Adolescents", "Unisexe"],
  "Mixte":  ["Adulte unisexe", "Unisexe", "Adulte"],
};

// Canal générique de saisie manuelle des requis par plateforme (chantier
// champs obligatoires, 2026-07-16) — pendant du pf.ebayAspects : la clé du
// champ dans platform_fields de la copie, consommée telle quelle par le
// content script correspondant (codes serveur Vinted, attributs for= LBC,
// libellés exacts Beebs).
const GENERIC_ASPECTS_PF_KEY = { vinted: "vintedAspects", leboncoin: "lbcAspects", beebs: "beebsAspects" };
const GENERIC_PLATFORM_LABELS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs" };

function defaultConditionFor(field) {
  if (!field || field.type !== "select") return DEFAULT_CONDITION;
  return findMatchingOption(DEFAULT_CONDITION, field.options ?? []) || DEFAULT_CONDITION;
}

function mergeFieldsWithLens(platformFields, lensResult, fieldConfigs) {
  const result = {};
  for (const field of fieldConfigs) {
    const fromApi = platformFields?.[field.key];
    if (fromApi && fromApi !== "null") {
      result[field.key] = field.type === "select"
        ? (findMatchingOption(fromApi, field.options) || fromApi)
        : fromApi;
      continue;
    }
    let lensVal = null;
    switch (field.key) {
      case "etat":
      case "condition":   lensVal = lensResult?.etat_estime    ?? null; break;
      case "marque":
      case "brand":       lensVal = lensResult?.marque         ?? null; break;
      case "categorie":   lensVal = lensResult?.categorie      ?? null; break;
      case "taille":
      case "size":        lensVal = lensResult?.taille_estimee ?? null; break;
      // modele existe dans lensResult depuis toujours (schéma lens-analysis) :
      // ce repli le fait arriver au formulaire même sur un job généré AVANT le
      // redéploiement de generate-listing (qui ne produisait pas la clé).
      case "modele":      lensVal = lensResult?.modele         ?? null; break;
      default:            lensVal = null;
    }
    result[field.key] = lensVal
      ? (field.type === "select" ? (findMatchingOption(lensVal, field.options) || "") : lensVal)
      : "";
    // Aucune source n'a donné l'état (IA, Lens, ligne de stock) — ou en a donné
    // un que la plateforme ne connaît pas : défaut. L'utilisateur voit la valeur
    // dans le select et peut la changer avant de publier.
    if (isConditionKey(field.key) && !result[field.key])
      result[field.key] = defaultConditionFor(field);
  }
  return result;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:20000,
        background:"rgba(0,0,0,0.92)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}
    >
      <img
        src={url}
        alt=""
        style={{ maxWidth:"95vw", maxHeight:"90vh", objectFit:"contain", borderRadius:8 }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{
          position:"absolute", top:16, right:16,
          background:"rgba(255,255,255,0.18)", border:"none",
          color:"#fff", width:36, height:36, borderRadius:"50%",
          fontSize:20, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}
      >×</button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return (
    <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.14em", color:T.mute }}>
      {children}
    </p>
  );
}

function StepProgress({ step, labels }) {
  return (
    <div style={{ padding:"16px 20px 4px" }}>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {labels.map((_, i) => (
          <div key={i} style={{ height:3, flex:1, borderRadius:999, background: i <= step ? T.teal : T.border }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        {labels.map((l, i) => (
          <span key={l} style={{ fontSize:10.5, fontWeight:500, color: i === step ? T.teal : T.mute }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// ── Réordonnancement des photos ───────────────────────────────────────────────
// L'ORDRE COMPTE, à deux titres : la photo 0 est la couverture de l'annonce sur
// les 4 plateformes (l'extension uploade dans l'ordre du tableau, et
// generate-listing étiquette l'index 0 "original"), et seules les MAX_RETOUCHED
// premières passent en retouche IA. Réordonner = choisir sa couverture et ce qui
// est retouché.
//
// Aucune dépendance (rien dans package.json, et le HTML5 drag&drop ne fonctionne
// pas au tactile, donc inutilisable dans l'app Capacitor). Pointer Events, donc
// souris ET tactile. Le drag part d'une POIGNÉE dédiée (touch-action:none sur la
// poignée seulement) : le scroll de la page et le tap sur la photo restent
// intacts.
function moveItem(arr, from, to) {
  const next = [...arr];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

function usePhotoDrag(onReorder) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const fromRef = useRef(null);
  const overRef = useRef(null);

  function onPointerDown(e, i) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fromRef.current = i; overRef.current = i;
    setDragIdx(i); setOverIdx(i);
  }
  // La capture renvoie les events à la poignée : on retrouve la vignette survolée
  // par hit-test (elementFromPoint reste fiable sous capture).
  function onPointerMove(e) {
    if (fromRef.current === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-photo-idx]");
    const i = el ? Number(el.dataset.photoIdx) : null;
    if (i !== null && !Number.isNaN(i) && i !== overRef.current) {
      overRef.current = i;
      setOverIdx(i);
    }
  }
  function onPointerUp() {
    const from = fromRef.current, to = overRef.current;
    fromRef.current = null; overRef.current = null;
    setDragIdx(null); setOverIdx(null);
    if (from !== null && to !== null && from !== to) onReorder(from, to);
  }

  const handleProps = i => ({
    onPointerDown: e => onPointerDown(e, i),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClick: e => e.stopPropagation(),
    style: {
      position:"absolute", left:6, top:6, width:22, height:22, borderRadius:8,
      background:"rgba(16,32,27,0.55)", border:"none", padding:0, color:"#fff",
      display:"flex", alignItems:"center", justifyContent:"center",
      cursor:"grab", touchAction:"none",
    },
  });

  // Style de la vignette pendant le drag : la source s'efface, la cible s'entoure.
  const tileProps = i => ({
    "data-photo-idx": i,
    style: {
      opacity: dragIdx === i ? 0.35 : 1,
      outline: dragIdx !== null && overIdx === i && dragIdx !== i ? `2px solid ${T.teal}` : "none",
      outlineOffset: -2,
    },
  });

  return { dragging: dragIdx !== null, handleProps, tileProps };
}

function DragHandle({ bind }) {
  return (
    <button aria-label="Réordonner" {...bind}>
      <GripVertical size={13} />
    </button>
  );
}

function CoverBadge({ lang }) {
  return (
    <span style={{
      position:"absolute", right:5, bottom:5, background:T.teal, color:"#fff",
      borderRadius:99, padding:"2px 6px", fontSize:8.5, fontWeight:700, whiteSpace:"nowrap",
    }}>
      {lang === "en" ? "Cover" : "Couverture"}
    </span>
  );
}

function PrimaryButton({ children, disabled, onClick, icon:Icon }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width:"100%", boxSizing:"border-box", borderRadius:999, padding:"16px 0",
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        fontSize:15, fontWeight:600, border:"none", fontFamily:"inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "#DCEEEA" : `linear-gradient(120deg,${T.teal},${T.tealDeep})`,
        color: disabled ? "#8FB5AE" : "#FFFFFF",
        boxShadow: disabled ? "none" : "0 10px 24px rgba(47,158,144,0.28)",
        transition:"background 0.2s, box-shadow 0.2s",
      }}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

// ── Step 0 — Upload ───────────────────────────────────────────────────────────

function StepUpload({ previews, removable, onAdd, onRemove, onReorder, notes, setNotes, micActive, toggleMic, error, lang }) {
  const { t, tpl } = useTranslation(lang);
  const fileRef = useRef();
  const count = previews.length;
  const MAX = MAX_PHOTOS;
  const drag = usePhotoDrag(onReorder);

  return (
    <div>
      <Eyebrow>{t("stepUploadEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 8px", fontSize:24, fontWeight:600, color:T.ink }}>
        {t("stepUploadTitle")}
      </h1>
      <p style={{ margin:"0 0 20px", fontSize:13, color:T.mute2, lineHeight:1.5 }}>
        {t("stepUploadSubtitle")}
      </p>

      {error && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {error}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display:"none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) { onAdd(files); e.target.value = ""; }
        }}
      />

      {count > 1 && (
        <p style={{ margin:"0 0 8px", fontSize:11.5, color:T.mute, lineHeight:1.4 }}>
          {lang === "en"
            ? "Drag the handle to reorder — the first photo is the listing cover."
            : "Glisse la poignée pour réordonner — la 1ʳᵉ photo est la couverture de l'annonce."}
        </p>
      )}

      {/* auto-fill minmax et non repeat(3,1fr) : le stepper est plein écran sans
          maxWidth, 3 colonnes donnaient des tuiles énormes sur desktop. Les
          vignettes restent carrées et compactes (~80 px) quelle que soit la
          largeur ; le drag-to-reorder est inchangé (data-photo-idx + poignée). */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(76px, 1fr))", gap:8, marginBottom:20 }}>
        {previews.map((url, i) => {
          const tile = drag.tileProps(i);
          return (
          <div
            key={i}
            data-photo-idx={i}
            style={{ aspectRatio:"1", borderRadius:12, overflow:"hidden", position:"relative", background:T.card, border:`1px solid ${T.border}`, ...tile.style }}
          >
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} />
            {count > 1 && <DragHandle bind={drag.handleProps(i)} />}
            {i === 0 && count > 1 && <CoverBadge lang={lang} />}
            {removable && (
              <button
                onClick={() => onRemove(i)}
                style={{
                  position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%",
                  background:T.paper, border:`1px solid ${T.border}`, cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", padding:0,
                }}
              >
                <X size={11} color={T.ink} />
              </button>
            )}
          </div>
          );
        })}
        {count < MAX && (
          <button
            onClick={() => fileRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:12, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      {/* Minimum 3 photos : exigence Vinted (marques premium), rappelée ici
          plutôt que subie à la publication. */}
      {count > 0 && count < MIN_PHOTOS && (
        <div style={{ marginTop:-8, marginBottom:16, fontSize:12.5, fontWeight:600, color:T.amber }}>
          {lang === "en"
            ? `Add at least ${MIN_PHOTOS} photos to continue (${count}/${MIN_PHOTOS}).`
            : `Ajoute au moins ${MIN_PHOTOS} photos pour continuer (${count}/${MIN_PHOTOS}).`}
        </div>
      )}

      <div style={{ position:"relative" }}>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={t("stepUploadNotesPlaceholder")}
          style={{
            width:"100%", boxSizing:"border-box", borderRadius:16, padding:"14px 44px 14px 16px",
            fontSize:14, outline:"none", background:T.chip, color:T.ink, fontFamily:"inherit",
            border:`1px solid ${micActive ? "#EF4444" : T.border}`, transition:"border-color 0.15s",
          }}
        />
        <button
          onClick={toggleMic}
          style={{
            position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
            width:32, height:32, borderRadius:"50%", border:"none",
            background: micActive ? "rgba(239,68,68,0.12)" : T.card,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: micActive ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
          }}
        >
          <Mic size={14} color={micActive ? "#EF4444" : T.mute2} />
        </button>
      </div>
    </div>
  );
}

// ── Step 1 — Photos + Retouche ────────────────────────────────────────────────

function StepPhotos({ photos, onAddPhotos, onRemovePhoto, onReorderPhotos, onPhotoClick, photoOption, setPhotoOption, background, setBackground, selected, setSelected, coinPrices, coinBalance, onOpenStore, platformSupport, lang,
  onAnalyze, analyzing, analysisResult, analysisError, analysisCost, analysisHidden }) {
  const { t, tpl } = useTranslation(lang);
  const addRef = useRef();
  const MAX = MAX_PHOTOS;
  const drag = usePhotoDrag(onReorderPhotos);

  // Système de pièces : plus de verrou par tier — chaque option affiche son
  // prix en pièces (coin_config via coinPrices, jamais hardcodé). Libellés et
  // descriptions différencient clairement les 3 niveaux.
  const retouchOptions = [
    {
      id: "ia_advanced",
      label: lang === "fr" ? "Retouche avancée" : "Advanced editing",
      desc: lang === "fr"
        ? "Rendu professionnel adapté à la catégorie, choix d'un fond pro (studio, béton, lin, parquet) et léger défroissage naturel des vêtements. L'objet reste fidèle : logo, couleurs et défauts sont conservés."
        : "Professional, category-aware result, choice of a pro background (studio, concrete, linen, parquet) and light natural de-wrinkling for clothing. The item stays true: logo, colors and flaws are preserved.",
    },
    {
      id: "ia_light",
      label: lang === "fr" ? "Retouche légère" : "Light editing",
      desc: lang === "fr"
        ? "Améliore la lumière, la netteté et les couleurs de vos photos. Le fond et l'objet restent tels quels."
        : "Improves lighting, sharpness and colors. Background and item stay as-is.",
    },
    {
      id: "original",
      label: lang === "fr" ? "Photos d'origine" : "Original photos",
      desc: lang === "fr"
        ? "Vos photos telles quelles, sans aucune retouche."
        : "Your photos as-is, no editing.",
    },
  ];

  // Choix de fond — avancé uniquement. `swatch` = aperçu de la vignette : chaque
  // valeur PRÉVISUALISE la vraie matière du fond (dégradés/textures CSS, aucun
  // asset externe). Les IDs correspondent 1:1 aux clés BACKGROUND_OPTIONS de
  // generate-listing (blanc = cyclorama, gris = microciment, beige = lin tissé,
  // bois = chêne clair veiné).
  const backgroundOptions = [
    { id: "original", label: lang === "fr" ? "Aucun"        : "None",         swatch: null },
    { id: "white",    label: lang === "fr" ? "Blanc studio" : "Studio white", swatch: "radial-gradient(120% 95% at 50% 12%, #FFFFFF 55%, #E9E9E9 100%)" },
    { id: "grey",     label: lang === "fr" ? "Gris béton"   : "Concrete grey", swatch: "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.45), rgba(255,255,255,0) 42%), radial-gradient(circle at 72% 76%, rgba(0,0,0,0.08), rgba(0,0,0,0) 46%), linear-gradient(135deg,#D3D3D0,#C0C0BD)" },
    { id: "beige",    label: lang === "fr" ? "Beige lin"    : "Linen beige",  swatch: "repeating-linear-gradient(0deg, rgba(120,100,70,0.10) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(120,100,70,0.10) 0 1px, transparent 1px 3px), linear-gradient(0deg,#E7DECF,#EEE6D7)" },
    { id: "wood",     label: lang === "fr" ? "Bois clair"   : "Light wood",   swatch: "repeating-linear-gradient(92deg, rgba(120,85,45,0.00) 0 20px, rgba(120,85,45,0.26) 20px 21px), repeating-linear-gradient(92deg, rgba(120,85,45,0.08) 0 2px, transparent 2px 6px), linear-gradient(100deg,#EAD6B4,#DDC39A)" },
  ];

  return (
    <div>
      <Eyebrow>{t("stepPhotosEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 8px", fontSize:24, fontWeight:600, color:T.ink }}>
        {t("stepPhotosTitle")}
      </h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:T.mute2, lineHeight:1.5 }}>
        {t("stepPhotosSubtitle")}
      </p>

      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display:"none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) { onAddPhotos(files); e.target.value = ""; }
        }}
      />

      {/* Au-delà de MAX_RETOUCHED, les photos partent BRUTES (garde-fou de coût
          de generate-listing, qui les conserve telles quelles). On le dit. */}
      {photoOption !== "original" && photos.length > MAX_RETOUCHED && (
        <div style={{ marginBottom:12, padding:"10px 12px", background:T.paper, border:`1px solid ${T.border}`, borderRadius:12, fontSize:12, color:T.mute2, lineHeight:1.45 }}>
          {lang === "en"
            ? `Only the first ${MAX_RETOUCHED} photos are AI-enhanced. The others are published as-is.`
            : `Seules les ${MAX_RETOUCHED} premières photos sont retouchées par l'IA. Les suivantes sont publiées telles quelles.`}
        </div>
      )}

      {photos.length > 1 && (
        <p style={{ margin:"0 0 8px", fontSize:11.5, color:T.mute, lineHeight:1.4 }}>
          {lang === "en"
            ? "Drag the handle to reorder — the first photo is the listing cover."
            : "Glisse la poignée pour réordonner — la 1ʳᵉ photo est la couverture de l'annonce."}
        </p>
      )}

      {/* Même grille compacte que StepUpload (auto-fill ~80 px) — voir le
          commentaire là-bas. */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(76px, 1fr))", gap:8, marginBottom:20 }}>
        {photos.map((url, i) => {
          const tile = drag.tileProps(i);
          return (
          <div
            key={i}
            data-photo-idx={i}
            onClick={() => { if (!drag.dragging) onPhotoClick(url); }}
            style={{ aspectRatio:"1", borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`, position:"relative", cursor:"pointer", ...tile.style }}
          >
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} />
            {photos.length > 1 && <DragHandle bind={drag.handleProps(i)} />}
            {photoOption !== "original" && i >= MAX_RETOUCHED && (
              <span style={{
                position:"absolute", left:5, bottom:5, background:"rgba(16,32,27,0.72)", color:"#fff",
                borderRadius:99, padding:"2px 6px", fontSize:8.5, fontWeight:700, whiteSpace:"nowrap",
              }}>
                {lang === "en" ? "Not enhanced" : "Non retouchée"}
              </span>
            )}
            {i === 0 && photos.length > 1 && <CoverBadge lang={lang} />}
            <button
              onClick={e => { e.stopPropagation(); onRemovePhoto(i); }}
              style={{
                position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%",
                background:T.paper, border:`1px solid ${T.border}`, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", padding:0,
              }}
            >
              <X size={11} color={T.ink} />
            </button>
          </div>
          );
        })}
        {photos.length < MAX && (
          <button
            onClick={() => addRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:12, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:12 }}>
        {retouchOptions.map(o => {
          const active = photoOption === o.id;
          const price = coinPrices?.[o.id] ?? null;
          const affordable = price == null || coinBalance >= price;
          return (
            <button
              key={o.id}
              onClick={() => setPhotoOption(o.id)}
              style={{
                textAlign:"left", borderRadius:16, padding:16,
                background: active ? "#E7F3F0" : T.card,
                border: `1px solid ${active ? T.teal : T.border}`,
                cursor:"pointer", fontFamily:"inherit", position:"relative",
                display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
              }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:T.ink, display:"flex", alignItems:"center", gap:6 }}>
                  {o.label}
                </div>
                <div style={{ fontSize:12, marginTop:2, lineHeight:1.4, color:T.mute2 }}>{o.desc}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                {price != null && (
                  price === 0 ? (
                    <span style={{
                      fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                      color:T.tealDeep, background:"#E7F3F0",
                      border:"1px solid #CBE5DF", padding:"3px 9px", borderRadius:999,
                    }}>
                      {lang === "fr" ? "Gratuit" : "Free"}
                    </span>
                  ) : (
                    <span style={{
                      fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                      color: affordable ? T.tealDeep : "#B0645A",
                      background: affordable ? "#E7F3F0" : "#F7ECEA",
                      border: `1px solid ${affordable ? "#CBE5DF" : "#EAD4CF"}`,
                      padding:"3px 9px", borderRadius:999,
                      display:"inline-flex", alignItems:"center", gap:4,
                    }}>
                      <PepiteIcon size={13} /> {price}
                    </span>
                  )
                )}
                <div style={{
                  width:20, height:20, borderRadius:"50%", flexShrink:0,
                  background: active ? T.teal : "transparent",
                  border: active ? "none" : `1px solid ${T.mute}`,
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Choix de fond — retouche avancée uniquement (valeur ajoutée de l'avancé) */}
      {photoOption === "ia_advanced" && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:T.mute, marginBottom:10 }}>
            {lang === "fr" ? "Fond" : "Background"}
          </div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:2 }}>
            {backgroundOptions.map(b => {
              const active = background === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBackground(b.id)}
                  style={{ flexShrink:0, width:66, background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit" }}
                >
                  <div style={{
                    width:66, height:66, borderRadius:14, boxSizing:"border-box",
                    border:`2px solid ${active ? T.teal : T.border}`,
                    background: b.id === "original" ? T.chip : b.swatch,
                    boxShadow: active ? "0 0 0 3px rgba(47,158,144,0.16)" : "none",
                    overflow:"hidden", position:"relative",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                  }}>
                    {b.id === "original" && (photos[0]
                      ? <img src={photos[0]} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : <ImageOff size={18} color={T.mute} />
                    )}
                    {active && (
                      <span style={{ position:"absolute", top:4, right:4, width:16, height:16, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Check size={10} color="#FFFFFF" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:10.5, fontWeight:600, color: active ? T.tealDeep : T.mute2, marginTop:5, lineHeight:1.2, textAlign:"center" }}>
                    {b.label}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize:11.5, color:T.mute, marginTop:8, lineHeight:1.4 }}>
            {lang === "fr"
              ? "Objet fidèle (logo, couleurs, défauts) — seul le fond change. Sur un vêtement, les faux plis sont légèrement défroissés."
              : "Item kept faithful (logo, colors, flaws) — only the background changes. On a garment, storage creases are lightly smoothed."}
          </p>
        </div>
      )}

      {/* ── Analyse photo optionnelle (2026-07-14) ──────────────────────────
          Même moteur que Lens (edge lens-analysis) : deux entrées, un seul
          moteur. Le débit des Pépites, le quota et le 402 sont gérés côté
          serveur par spend_coins_for_lens — aucun chemin de paiement recodé.
          Jamais proposée si l'article vient DÉJÀ de Lens : il a déjà ses
          attributs et son prix, la payer deux fois n'aurait aucun sens. */}
      {photos.length > 0 && !analysisHidden && (
        <div style={{ marginBottom:16, background:T.paper, border:`1px solid ${T.border}`, borderRadius:16, padding:"14px 15px" }}>
          {analysisResult ? (
            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, lineHeight:1.2 }}>✅</span>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.ink }}>
                  {lang === "en" ? "Photos analyzed" : "Photos analysées"}
                </div>
                <div style={{ fontSize:12, color:T.mute, marginTop:2, lineHeight:1.45 }}>
                  {[
                    analysisResult.marque,
                    analysisResult.taille_estimee,
                    analysisResult.matiere,
                    analysisResult.prix_vente_suggere != null
                      ? (lang === "en" ? `suggested ${analysisResult.prix_vente_suggere} €` : `prix conseillé ${analysisResult.prix_vente_suggere} €`)
                      : null,
                  ].filter(Boolean).join(" · ") || (lang === "en" ? "Fields filled in" : "Champs pré-remplis")}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:3 }}>
                {lang === "en" ? "Let the AI read your photos" : "Laisse l'IA lire tes photos"}
              </div>
              <div style={{ fontSize:12, color:T.mute, lineHeight:1.45, marginBottom:10 }}>
                {lang === "en"
                  ? "It identifies the brand, size, material and suggests a resale price — the fields below are then pre-filled."
                  : "Elle identifie la marque, la taille, la matière et propose un prix de revente — les champs sont ensuite pré-remplis."}
              </div>
              {analysisError && (
                <div style={{ fontSize:12, fontWeight:600, color:"#B0645A", marginBottom:8 }}>{analysisError}</div>
              )}
              <button
                onClick={onAnalyze}
                disabled={analyzing}
                style={{
                  width:"100%", padding:"12px", borderRadius:12, border:`1.5px solid ${T.tealDeep}`,
                  background:"none", color:T.tealDeep, fontSize:13, fontWeight:700, fontFamily:"inherit",
                  cursor: analyzing ? "not-allowed" : "pointer", opacity: analyzing ? 0.6 : 1,
                  display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
                }}
              >
                {analyzing
                  ? (lang === "en" ? "Analyzing…" : "Analyse en cours…")
                  : <>
                      {lang === "en" ? "Analyze my photos" : "Analyser mes photos"}
                      {analysisCost != null && <> · <PepiteIcon size={13} /> {analysisCost}</>}
                    </>}
              </button>
            </>
          )}
        </div>
      )}

      {/* Solde de pièces + accès au store */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, padding:"10px 14px", borderRadius:12, background:T.chip, border:`1px solid ${T.border}` }}>
        <span style={{ fontSize:12.5, fontWeight:600, color:T.mute2, display:"inline-flex", alignItems:"center", gap:5 }}>
          {lang === 'en' ? 'Your Nuggets:' : 'Tes Pépites :'}{' '}
          <strong style={{ color:T.ink, display:"inline-flex", alignItems:"center", gap:4 }}><PepiteIcon size={15} /> {coinBalance}</strong>
        </span>
        <button
          onClick={onOpenStore}
          style={{ background:"none", border:"none", color:T.tealDeep, fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}
        >
          {lang === 'en' ? '+ Get Nuggets' : '+ Recharger'}
        </button>
      </div>

      <Eyebrow>{t("stepPhotosPlatformsLabel")}</Eyebrow>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:2 }}>
        {PLATFORMS_DEFAULT.map(p => {
          const isOn = selected.has(p);
          // Compat catégorie × plateforme (src/utils/platformCompat.js,
          // dérivée des 4 mappings) : une plateforme qui ne peut pas vendre
          // cette catégorie est GRISÉE (désactivée, non cliquable), avec le
          // motif affiché sous la rangée — pas juste décochée.
          const support = platformSupport?.[p] ?? "supported";
          const disabled = support !== "supported";
          return (
            <button
              key={p}
              disabled={disabled}
              title={disabled
                ? t(support === "unavailable" ? "platformUnavailable" : "platformUnmapped").replace("{platform}", PLATFORM_LABELS[p])
                : undefined}
              onClick={() => !disabled && setSelected(prev => {
                const s = new Set(prev);
                s.has(p) ? s.delete(p) : s.add(p);
                return s;
              })}
              style={{
                display:"flex", alignItems:"center", gap:7,
                padding:"7px 16px 7px 8px", borderRadius:999,
                background: disabled ? "#F1F1EE" : isOn ? "#E7F3F0" : T.chip,
                border: `1px solid ${disabled ? T.border : isOn ? T.teal : T.border}`,
                color: disabled ? "#B4B9B6" : isOn ? T.tealDeep : T.mute2,
                fontSize:13.5, fontWeight:600,
                cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
                opacity: disabled ? 0.6 : 1,
                filter: disabled ? "grayscale(1)" : "none",
                transition:"border-color 0.15s, background 0.15s, color 0.15s",
              }}
            >
              <PlatformLogo platform={p} size={22} />
              {PLATFORM_LABELS[p]}
            </button>
          );
        })}
      </div>
      {PLATFORMS_DEFAULT.filter(p => (platformSupport?.[p] ?? "supported") !== "supported").map(p => (
        <p key={p} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {t(platformSupport[p] === "unavailable" ? "platformUnavailable" : "platformUnmapped").replace("{platform}", PLATFORM_LABELS[p])}
        </p>
      ))}
      {selected.size === 0 && (
        <p style={{ margin:"8px 0 0", fontSize:12.5, color:"#EF4444", fontWeight:600 }}>
          {t("stepPhotosSelectPlatformError")}
        </p>
      )}
    </div>
  );
}

// ── Step 2 — Génération (phase A : loading · phase B : review éditable) ───────

function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, edited, setEdited, onPhotoClick, onRetry, noteOverride, lang,
  price, setPrice, customPriced, setCustomPriced, articleIcon = "📦" }) {
  const { t } = useTranslation(lang);
  const platformFieldsConfig = getPlatformFieldsConfig(t);
  const [elapsed, setElapsed] = useState(0);
  const [openCards, setOpenCards] = useState(new Set());

  // Prix central (2026-07-14) : écrit le prix dans TOUTES les plateformes
  // sélectionnées d'un coup. Une plateforme dont le prix a été édité à la main
  // est marquée « personnalisée » (customPriced) et n'est plus écrasée — sinon
  // un prix Vinted volontairement différent sautait à la première frappe ici.
  const applyCentralPrice = (raw) => {
    const v = raw === "" ? null : Number(raw);
    setPrice(raw === "" ? null : v);
    setEdited(prev => {
      const next = { ...prev };
      for (const p of selected) {
        if (customPriced.has(p)) continue;
        if (!next[p]) continue;
        next[p] = { ...next[p], price: v };
      }
      return next;
    });
  };

  // Édition du prix d'UNE plateforme : marque la carte comme personnalisée.
  const applyPlatformPrice = (p, raw) => {
    const v = raw === "" ? null : Number(raw);
    setEdited(prev => ({ ...prev, [p]: { ...prev[p], price: v } }));
    setCustomPriced(prev => new Set(prev).add(p));
  };

  // Retour au prix central pour une carte.
  const resetPlatformPrice = (p) => {
    setCustomPriced(prev => { const s = new Set(prev); s.delete(p); return s; });
    setEdited(prev => ({ ...prev, [p]: { ...prev[p], price: price == null || price === "" ? null : Number(price) } }));
  };

  useEffect(() => {
    if (platformListings) return;
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [platformListings]);

  const toggleCard = p => setOpenCards(prev => {
    const s = new Set(prev);
    s.has(p) ? s.delete(p) : s.add(p);
    return s;
  });

  // Phase A — loading
  if (generating || (!platformListings && !generateError)) {
    const msg = elapsed < 20 ? t("stepGenLoadingMsg1") : t("stepGenLoadingMsg2");
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", textAlign:"center" }}>
        <Loader size={80} thickness={2} icon={Sparkles} iconSize={28} style={{ marginBottom:24 }} />
        <h1 style={{ margin:"0 0 8px", fontSize:19, fontWeight:600, color:T.ink }}>
          {msg}
        </h1>
        <p style={{ margin:0, fontSize:13, lineHeight:1.5, color:T.mute2 }}>
          {t("stepGenLoadingSubtitle")}
        </p>
      </div>
    );
  }

  // Error
  if (generateError && !platformListings) {
    return (
      <div>
        <Eyebrow>{t("stepGenEyebrow")}</Eyebrow>
        <h1 style={{ margin:"6px 0 8px", fontSize:22, fontWeight:600, color:T.ink }}>
          {t("stepGenErrorTitle")}
        </h1>
        <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:14 }}>
          {generateError}
        </div>
        <button
          onClick={onRetry}
          style={{
            width:"100%", padding:"14px 0", borderRadius:999,
            border:`1px solid ${T.teal}`, background:"none",
            color:T.teal, fontWeight:600, fontSize:14,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          {t("stepGenRetryButton")}
        </button>
      </div>
    );
  }

  // Phase B — review with collapsible cards
  const platforms = [...selected].filter(p => platformListings?.platforms?.[p]);

  return (
    <div>
      <Eyebrow>{t("stepGenEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 4px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepGenReviewTitle")}
      </h1>
      <p style={{ margin:"0 0 16px", fontSize:12.5, color:T.mute2, lineHeight:1.5 }}>
        {t("stepGenReviewSubtitle")}
      </p>

      {processedPhotos?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <Eyebrow>{t("stepGenEnhancedPhotosLabel")}</Eyebrow>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {processedPhotos.map((ph, i) => (
              <div
                key={i}
                onClick={() => onPhotoClick(ph.url ?? ph)}
                style={{ flexShrink:0, width:80, height:80, borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`, cursor:"pointer" }}
              >
                <img src={ph.url ?? ph} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prix de vente central — s'applique aux plateformes non personnalisées */}
      <div style={{ marginBottom:16, background:T.paper, border:`1px solid ${T.border}`, borderRadius:16, padding:"14px 15px" }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:T.mute, marginBottom:6 }}>
          {t("fieldSalePriceLabel")}
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={price ?? ""}
          onChange={ev => applyCentralPrice(ev.target.value)}
          placeholder="—"
          style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:17, fontWeight:700, fontFamily:"inherit", outline:"none", background:"#fff", color:T.ink, boxSizing:"border-box" }}
        />
        <div style={{ fontSize:11.5, color:T.mute, marginTop:6, lineHeight:1.4 }}>
          {lang === "en"
            ? "Applied to every selected platform. Change a card's price to set it apart."
            : "Appliqué à toutes les plateformes sélectionnées. Modifie le prix d'une carte pour la dissocier."}
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {platforms.map(p => {
          const e = edited[p] ?? { title:"", description:"", platform_fields:{}, price:null };
          const isOpen = openCards.has(p);
          const isCustomPrice = customPriced.has(p);
          // Champs AFFICHÉS = pertinents pour la catégorie réelle de l'article,
          // ou déjà remplis. Les données envoyées à l'extension, elles, restent
          // complètes (mergeFieldsWithLens n'est pas filtré).
          const fieldConfigs = visibleFields(
            platformFieldsConfig[p] ?? [],
            articleIcon,
            e.platform_fields ?? {}
          );
          const etatField = fieldConfigs.find(f => f.key === "etat" || f.key === "condition");
          const etatVal = etatField ? (e.platform_fields?.[etatField.key] ?? "") : "";
          const summaryParts = [
            e.title ? (e.title.length > 32 ? e.title.slice(0, 32) + "…" : e.title) : "—",
            etatVal || null,
            e.price != null && e.price !== "" ? `${e.price}€` : null,
          ].filter(Boolean);

          return (
            <div key={p} style={{ background:T.card, borderRadius:18, border: `1px solid ${isOpen ? T.teal : T.border}`, overflow:"hidden" }}>
              <button
                onClick={() => toggleCard(p)}
                style={{
                  width:"100%", padding:16,
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, overflow:"hidden" }}>
                  <PlatformLogo platform={p} size={28} />
                  <div style={{ minWidth:0, overflow:"hidden" }}>
                    <div style={{ fontSize:13.5, fontWeight:600, color:T.ink }}>
                      {PLATFORM_LABELS[p].toUpperCase()}
                    </div>
                    <div style={{ fontSize:12, color:T.mute2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {summaryParts.join(" · ")}
                    </div>
                  </div>
                </div>
                <Pencil size={15} color={T.mute} style={{ flexShrink:0, marginLeft:8 }} />
              </button>

              {isOpen && (
                <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${T.border}` }}>
                  <div style={{ marginBottom:10, paddingTop:12 }}>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{t("fieldTitleLabel")}</div>
                    <input
                      type="text"
                      value={e.title}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], title: ev.target.value } }))}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13.5, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{t("fieldDescriptionLabel")}</div>
                    <textarea
                      value={e.description}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], description: ev.target.value } }))}
                      rows={4}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}
                    />
                  </div>

                  {fieldConfigs.length > 0 && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                      {fieldConfigs.map((field, fi) => {
                        const val = e.platform_fields?.[field.key] ?? "";
                        // Tailles enfant (2026-07-15) : les groupes du
                        // référentiel enfant ne s'affichent que si le genre
                        // de CETTE copie est enfant (genre Vinted/eBay/Beebs,
                        // univers Leboncoin), et FILTRÉS PAR AXE selon ce
                        // genre : Bébé → mois, Fille/Garçon/Enfant → ans,
                        // pointures toujours (cf. childAxesForGenre — un axe
                        // incohérent avec le genre finit hors des
                        // allowedValues de la catégorie eBay, garde bloquée).
                        const copyChildAxes = childAxesForGenre(e.platform_fields?.genre)
                          ?? childAxesForGenre(e.platform_fields?.univers);
                        const fieldGroups = field.childGroups && copyChildAxes
                          ? [...field.childGroups.filter(g => g.axis === "shoes" || copyChildAxes[g.axis]), ...field.groups]
                          : field.groups;
                        const isLastOdd = fi === fieldConfigs.length - 1 && fieldConfigs.length % 2 !== 0;
                        const onChange = nv => {
                          // Champ partagé édité à la main sur CETTE plateforme :
                          // le lien avec la source canonique casse pour cette
                          // copie seulement (Sujet 4, override local sacré).
                          noteOverride?.(p, field.key);
                          setEdited(prev => ({
                            ...prev,
                            [p]: { ...prev[p], platform_fields: { ...prev[p].platform_fields, [field.key]: nv } },
                          }));
                        };
                        return (
                          <div key={field.key} style={isLastOdd ? { gridColumn:"1 / -1" } : {}}>
                            <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{field.label}</div>
                            {field.type === "select" ? (
                              <select
                                value={val}
                                onChange={ev => onChange(ev.target.value)}
                                style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, boxSizing:"border-box", color: val ? T.ink : T.mute }}
                              >
                                <option value="">—</option>
                                {fieldGroups
                                  ? fieldGroups.map(g => (
                                      <optgroup key={g.groupLabel} label={g.groupLabel}>
                                        {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </optgroup>
                                    ))
                                  : field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={val}
                                onChange={ev => onChange(ev.target.value)}
                                placeholder="—"
                                style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:11, color:T.mute2, fontWeight:600 }}>{t("fieldSalePriceLabel")}</span>
                      {isCustomPrice && (
                        <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:T.tealDeep, background:"rgba(47,158,144,0.12)", borderRadius:99, padding:"2px 8px", whiteSpace:"nowrap" }}>
                            {lang === "en" ? "Custom price" : "Prix personnalisé"}
                          </span>
                          <button
                            type="button"
                            onClick={() => resetPlatformPrice(p)}
                            style={{ background:"none", border:"none", padding:0, fontSize:10.5, fontWeight:700, color:T.mute, cursor:"pointer", fontFamily:"inherit", textDecoration:"underline" }}
                          >
                            {lang === "en" ? "Reset" : "Rétablir"}
                          </button>
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={e.price ?? ""}
                      onChange={ev => applyPlatformPrice(p, ev.target.value)}
                      placeholder="—"
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${isCustomPrice ? T.teal : T.border}`, fontSize:14, fontWeight:700, fontFamily:"inherit", outline:"none", background:T.chip, color:T.tealDeep, boxSizing:"border-box" }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Toggle piste + rond (teal quand ON) ──────────────────────────────────────

function StockToggle({ checked, onChange, label, hint, disabled = false }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
      background: disabled ? T.paper : T.card, border:`1px solid ${T.border}`, borderRadius:16,
      padding:14, marginBottom:20, opacity: disabled ? 0.75 : 1,
    }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color: disabled ? T.mute2 : T.ink }}>{label}</div>
        {hint && <div style={{ fontSize:12, color:T.mute2, marginTop:2, lineHeight:1.4 }}>{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          flexShrink:0, width:44, height:26, borderRadius:999, border:"none", padding:3,
          background: disabled ? "#CFCABA" : checked ? T.teal : "#D8D2C4",
          cursor: disabled ? "not-allowed" : "pointer", position:"relative", transition:"background 0.2s",
        }}
      >
        <span style={{
          display:"block", width:20, height:20, borderRadius:"50%", background:"#FFFFFF",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition:"transform 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </button>
    </div>
  );
}

// ── Step 3 — Publier (chips + croix) ─────────────────────────────────────────

// id de <datalist> valide et stable dérivé du nom d'aspect (accents/espaces/
// apostrophes retirés) — "Capacité de stockage" → "capacite-de-stockage".
const aspectSlug = s => String(s).toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── Listes fermées eBay (2026-07-18, cas « Unique » vs « Taille unique ») ────
// Même critère que la garde du publish : une liste ≤ 200 valeurs (ou
// SELECTION_ONLY quel que soit le volume) est un choix fermé — eBay refuse
// toute valeur hors liste même en mode FREE_TEXT court. UNE seule constante
// pour la garde ET l'UI : si l'UI propose un select, la garde accepte le choix.
const EBAY_CLOSED_LIST_MAX = 200;
const isEbayClosedList = (allowedValues, mode) => {
  const n = Array.isArray(allowedValues) ? allowedValues.length : 0;
  return n > 0 && (n <= EBAY_CLOSED_LIST_MAX || mode === "SELECTION_ONLY");
};
// Normalisation partagée valeur↔liste (mêmes règles que normalizeFuzzy de
// ebay.js : trim + minuscules + accents retirés).
const normAspectVal = s => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Valeur de la liste la plus proche d'une saisie hors liste ("Unique" →
// « Taille unique », "58 cm" → « 58 »). Rapprochement par TOKENS entiers
// (jamais de sous-chaîne : "S" ne matche pas "XS") : match si tous les tokens
// d'un côté se retrouvent de l'autre ; à couverture égale, la valeur la plus
// courte gagne. null si rien d'assez proche — on laisse l'utilisateur choisir.
function nearestAllowedValue(val, allowedValues) {
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

// Contrôle de saisie d'un aspect obligatoire dans le fallback UI. Quatre rendus :
//  · `strict` (eBay mode=SELECTION_ONLY) → <select> : choix IMPOSÉ quel que soit
//    le volume (la Taxonomy eBay est autoritaire, une valeur hors liste serait
//    refusée à la publication) ;
//  · petite liste (≤ 30) → <select> : comportement existant qui marche déjà
//    (ex. Couleur, 16 valeurs) — non touché pour éviter toute régression ;
//  · grande liste FREE_TEXT (> 30) → <input list=datalist> : autocomplétion
//    guidée montrant les valeurs recommandées (ex. « 256 Go ») tout en
//    autorisant la saisie libre. Remplace l'ancien champ texte AVEUGLE — c'est
//    le fix du bug « Capacité de stockage » (245 valeurs, FREE_TEXT) ;
//  · aucune valeur connue → <input> texte simple.
// NB : côté générique (Vinted/LBC/Beebs) on ne passe JAMAIS strict=true — les
// allowedValues y sont DÉCOUVERTES (potentiellement partielles), forcer un choix
// bloquerait une valeur légitime absente du relevé. Les petites listes gardent
// leur <select> ≤30 existant ; seules les grandes passent en datalist.
// `closedMax` (2026-07-18) : seuil de bascule en <select>. Générique
// Vinted/LBC/Beebs : 30 (valeurs DÉCOUVERTES, listes partielles — inchangé).
// eBay : EBAY_CLOSED_LIST_MAX — toute liste fermée au sens de la garde devient
// un vrai sélecteur, on ne peut plus taper une valeur que la garde refusera
// (cas réel : Taille "Unique" vs « Taille unique », casquette 52365, 18/07).
// Export nommé (2026-07-19, socle needs_user) : réutilisé par le mini-éditeur
// « À compléter » de StockTab — même contrôle, mêmes règles de rendu.
export function AspectValueInput({ value, allowedValues, strict = false, closedMax = 30, onChange, T, idBase }) {
  const vals = Array.isArray(allowedValues) ? allowedValues : [];
  const n = vals.length;
  const base = { width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  if (n > 0 && (strict || n <= closedMax)) {
    return (
      <select value={value ?? ""} onChange={ev => onChange(ev.target.value)}
        style={{ ...base, background:T.chip, color: value ? T.ink : T.mute }}>
        <option value="">—</option>
        {vals.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (n > 30) {
    const listId = `aspect-dl-${idBase}`;
    return (
      <>
        <input type="text" list={listId} value={value ?? ""} onChange={ev => onChange(ev.target.value)}
          placeholder="—" style={{ ...base, background:T.chip, color:T.ink }} />
        <datalist id={listId}>
          {vals.map(v => <option key={v} value={v} />)}
        </datalist>
      </>
    );
  }
  return (
    <input type="text" value={value ?? ""} onChange={ev => onChange(ev.target.value)}
      placeholder="—" style={{ ...base, background:T.chip, color:T.ink }} />
  );
}

function StepPublish({ selected, setSelected, platformListings, publishError, lang, canToggleStock, stockLocked = false, addToStock, setAddToStock, prixAchatSaisi, setPrixAchatSaisi, missingSharedFields = [], missingSharedFieldPlatforms = {}, sharedFields = {}, onSharedFieldChange, sharedChildAxes = null, vintedGenreBlocked = false, ebayRequiredStatus = null, onEbayAspectChange = null, onEbaySharedFieldChange = null, genericRequiredStatus = null, onPlatformAspectChange = null, onPlatformDedicatedChange = null, pausedPlatforms = [] }) {
  const { t, tpl } = useTranslation(lang);
  const chips = [...selected].filter(p => platformListings?.platforms?.[p]);
  // Mode dégradé (Phase B) : plateformes sélectionnées actuellement en pause.
  // On n'empêche PAS la sélection (le job est mis en file et repris auto) — on
  // informe seulement, ton neutre « maintenance », jamais rouge d'erreur.
  const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
  const pausedChips = chips.filter(p => pausedPlatforms.includes(p));
  // Config des champs partagés à compléter inline (Sujet 4) : mêmes selects/
  // inputs que l'éditeur de StepGeneration — la taille réutilise les groupes
  // (lettres/numérique/pointures) de la config Vinted, le reste est texte.
  const fieldsCfg = getPlatformFieldsConfig(t);
  const sharedFieldCfg = {
    taille:  fieldsCfg.vinted.find(f => f.key === "taille"),
    couleur: { key:"couleur", label:t("fieldColorLabel"),    type:"text" },
    matiere: { key:"matiere", label:t("fieldMaterialLabel"), type:"text" },
    marque:  { key:"marque",  label:t("fieldBrandLabel"),    type:"text" },
  };

  return (
    <div>
      <Eyebrow>{t("stepPublishEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 16px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepPublishTitle")}
      </h1>

      {/* Bandeau de maintenance (Phase B) : une plateforme sélectionnée est en
          pause. Ton NEUTRE/info (pas rouge), rassurant, aucune action requise.
          La plateforme reste sélectionnée : le job partira automatiquement dès
          rétablissement. */}
      {pausedChips.map(p => (
        <div key={p} style={{ padding:"11px 14px", background:"#EFF3F8", border:"1px solid #C7D6E5", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.5, color:"#334155", display:"flex", gap:9, alignItems:"flex-start" }}>
          <Clock size={16} color="#64748B" style={{ flexShrink:0, marginTop:1 }} />
          <span>{tpl("stepPublishMaintenanceBanner", { platform: PLATFORM_LABELS[p] ?? p })}</span>
        </div>
      ))}

      {canToggleStock && (
        <StockToggle
          checked={addToStock}
          onChange={setAddToStock}
          label={t("stepPublishAddToStockLabel")}
          hint={addToStock ? t("stepPublishAddToStockHintOn") : t("stepPublishAddToStockHintOff")}
        />
      )}

      {/* Article venant du Stock : le toggle n'a aucun sens (il y est déjà).
          Il était jusqu'ici purement ABSENT — on l'affiche désormais grisé et
          coché, pour que l'utilisateur voie que la question est réglée plutôt
          que de se demander où est passée l'option. */}
      {stockLocked && (
        <StockToggle
          checked
          disabled
          onChange={() => {}}
          label={t("stepPublishAddToStockLabel")}
          hint={lang === "en" ? "Already in your stock" : "Déjà dans ton stock"}
        />
      )}

      {canToggleStock && addToStock && (
        <div style={{ marginTop:-10, marginBottom:20 }}>
          <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
            {t("stepPublishBuyPriceLabel")}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={prixAchatSaisi}
            onChange={ev => setPrixAchatSaisi(ev.target.value)}
            placeholder={t("stepPublishBuyPricePlaceholder")}
            style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:14, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
          />
        </div>
      )}

      {publishError && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {publishError}
        </div>
      )}

      {/* Signal AVANT publication (2026-07-16) : le genre de la copie Vinted
          ne résout aucun rayon (ex. « Enfant » — Vinted n'a que Femme/Homme/
          Fille/Garçon). Sans ce bandeau, le job partait et échouait côté
          extension avec « Catégorie vinted non résolue ». */}
      {vintedGenreBlocked && (
        <div style={{ padding:"12px 14px", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:14, marginBottom:12, fontSize:13, color:"#92400E" }}>
          {t("vintedGenreRequired")}
        </div>
      )}

      {/* B1 (2026-07-16) : la liste COMPLÈTE des obligatoires eBay de la
          catégorie résolue, AVANT le clic Publier — plus de « Longueur de
          la robe » découverte via l'échec du job. Présence seule (la
          validation allowedValues reste à la garde du publish). */}
      {ebayRequiredStatus && ebayRequiredStatus.length > 0 && (
        <div style={{ padding:"12px 14px", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, marginBottom:12, fontSize:13, color:T.ink }}>
          <div style={{ fontWeight:600, marginBottom:6, color:"#1D4ED8" }}>{t("stepPublishEbayRequiredTitle")}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ebayRequiredStatus.map(({ name, state }) => (
              <span key={name} style={{
                padding:"3px 9px", borderRadius:10, fontSize:12,
                background: state === "ok" ? "#ECFDF5" : state === "prefilled" ? "#F5F3FF" : "#FEF2F2",
                border: `1px solid ${state === "ok" ? "#A7F3D0" : state === "prefilled" ? "#DDD6FE" : "#FECACA"}`,
                color: state === "ok" ? "#047857" : state === "prefilled" ? "#6D28D9" : "#B91C1C",
              }}>
                {state === "ok" ? "✓ " : (state === "missing" || state === "invalid") ? "✗ " : ""}{name}
                {state === "prefilled" ? ` — ${t("stepPublishEbayAspectPrefilled")}` : ""}
                {state === "missing" ? ` — ${t("stepPublishEbayAspectMissing")}` : ""}
                {state === "invalid" ? ` — ${t("stepPublishEbayAspectInvalid")}` : ""}
              </span>
            ))}
          </div>
          {/* Fallback UI générique (Phase 3) : saisie inline des obligatoires
              sans source — select pour toute liste FERMÉE au sens de la garde
              (≤ EBAY_CLOSED_LIST_MAX ou SELECTION_ONLY : une valeur hors liste
              serait refusée au publish, autant imposer le choix ici), datalist
              au-delà. Les valeurs venues de resolve_aspects (source "generic")
              restent éditables ici. state "invalid" (2026-07-18) : un champ
              DÉDIÉ (taille/couleur/matière…) rempli avec une valeur hors liste
              fermée s'édite désormais ICI en vrai sélecteur — fini le message
              d'erreur avec exemples inutiles sans moyen de choisir. */}
          {onEbayAspectChange && ebayRequiredStatus.some(a => a.state === "missing" || a.state === "invalid" || a.source === "generic") && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
              {ebayRequiredStatus.filter(a => a.state === "missing" || a.state === "invalid" || a.source === "generic").map(a => (
                <div key={a.name}>
                  <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{a.name}</div>
                  <AspectValueInput
                    value={a.state === "invalid" ? (a.suggested ?? "") : a.value}
                    allowedValues={a.allowedValues}
                    strict={a.mode === "SELECTION_ONLY"}
                    closedMax={EBAY_CLOSED_LIST_MAX}
                    onChange={v => (a.sharedKey && onEbaySharedFieldChange)
                      ? onEbaySharedFieldChange(a.sharedKey, v)
                      : onEbayAspectChange(a.name, v)}
                    T={T}
                    idBase={`ebay-${aspectSlug(a.name)}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Encart générique Vinted/LBC/Beebs (chantier 1.A, 2026-07-16) : les
          requis appris par le catalogue platform_category_aspects, AVANT le
          clic Publier — miroir exact du bloc eBay ci-dessus. Un requis sans
          source se complète ICI (select si liste d'options relevée, texte
          libre sinon) ; tant qu'un ✗ reste, le CTA Publier est désactivé. */}
      {genericRequiredStatus && Object.entries(genericRequiredStatus).map(([gp, list]) => list.length > 0 && (
        <div key={gp} style={{ padding:"12px 14px", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, marginBottom:12, fontSize:13, color:T.ink }}>
          <div style={{ fontWeight:600, marginBottom:6, color:"#1D4ED8" }}>
            {tpl("stepPublishGenericRequiredTitle", { platform: PLATFORM_LABELS[gp] ?? gp })}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {list.map(({ key, label, state }) => (
              <span key={key} style={{
                padding:"3px 9px", borderRadius:10, fontSize:12,
                background: state === "ok" ? "#ECFDF5" : state === "prefilled" ? "#F5F3FF" : "#FEF2F2",
                border: `1px solid ${state === "ok" ? "#A7F3D0" : state === "prefilled" ? "#DDD6FE" : "#FECACA"}`,
                color: state === "ok" ? "#047857" : state === "prefilled" ? "#6D28D9" : "#B91C1C",
              }}>
                {state === "ok" ? "✓ " : (state === "missing" || state === "invalid") ? "✗ " : ""}{label}
                {state === "prefilled" ? ` — ${t("stepPublishGenericAspectPrefilled")}` : ""}
                {state === "missing" ? ` — ${t("stepPublishGenericAspectMissing")}` : ""}
                {state === "invalid" ? ` — ${t("stepPublishGenericAspectInvalid")}` : ""}
              </span>
            ))}
          </div>
          {/* state "invalid" (2026-07-19, cas réel Medik8) : un champ DÉDIÉ
              rempli avec une valeur hors de la liste fermée du catalogue
              (Vinted Beauté : État = « Neuf avec étiquette » SEULEMENT)
              s'édite ici en vrai sélecteur — l'écriture va au champ dédié de
              la copie plateforme (onPlatformDedicatedChange), jamais au canal
              générique, sinon la gate extension relirait l'ancienne valeur. */}
          {onPlatformAspectChange && list.some(a => a.state === "missing" || a.state === "invalid" || a.source === "generic") && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
              {list.filter(a => a.state === "missing" || a.state === "invalid" || a.source === "generic").map(a => {
                // Valeur catalogue UNIQUE (2026-07-19, cas réel Medik8 :
                // Vinted Beauté n'accepte qu'un État « Neuf avec étiquette ») :
                // ni sélecteur à une seule option, ni pose silencieuse —
                // confirmation explicite. « Oui » pose la valeur (champ dédié
                // si connu, sinon canal générique) ; « Non » décoche la
                // plateforme, le job n'est jamais créé. Les listes
                // multi-options (Beebs État beauté : « Neuf, avec étiquette »
                // / « Neuf, sans étiquette », relevé live) gardent le
                // sélecteur : un choix ambigu ne se devine pas.
                const seule = (a.state === "missing" || a.state === "invalid") &&
                  Array.isArray(a.allowedValues) && a.allowedValues.length === 1
                  ? a.allowedValues[0] : null;
                if (seule && setSelected) return (
                  <div key={a.key} style={{ gridColumn:"1 / -1", padding:"10px 12px", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12 }}>
                    <div style={{ fontSize:12.5, color:"#92400E", marginBottom:8 }}>
                      <strong>{a.label}</strong> — {tpl("stepPublishSingleValueMsg", { value: seule, platform: PLATFORM_LABELS[gp] ?? gp })}
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button
                        onClick={() => (a.dedicatedTarget && onPlatformDedicatedChange)
                          ? onPlatformDedicatedChange(gp, a.dedicatedTarget, seule)
                          : onPlatformAspectChange(gp, a.key, seule)}
                        style={{ padding:"7px 14px", borderRadius:10, border:"none", background:"#059669", color:"#fff", fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                        {t("stepPublishSingleValueYes")}
                      </button>
                      <button
                        onClick={() => setSelected(prev => { const s = new Set(prev); s.delete(gp); return s; })}
                        style={{ padding:"7px 14px", borderRadius:10, border:`1px solid ${T.border}`, background:T.chip, color:T.ink, fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                        {t("stepPublishSingleValueNo")}
                      </button>
                    </div>
                  </div>
                );
                return (
                  <div key={a.key}>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{a.label}</div>
                    <AspectValueInput
                      value={a.state === "invalid" ? (a.suggested ?? "") : a.value}
                      allowedValues={a.allowedValues}
                      strict={false}
                      onChange={v => (a.state === "invalid" && a.dedicatedTarget && onPlatformDedicatedChange)
                        ? onPlatformDedicatedChange(gp, a.dedicatedTarget, v)
                        : onPlatformAspectChange(gp, a.key, v)}
                      T={T}
                      idBase={`gen-${gp}-${aspectSlug(a.key)}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {missingSharedFields.length > 0 && (
        // Encart inline (Sujet 4) : les champs partagés manquants se
        // complètent ICI, sans quitter le step — l'écriture passe par
        // onSharedFieldChange qui met à jour la SOURCE canonique (donc
        // toutes les copies plateformes non éditées à la main d'un coup).
        <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, marginBottom:12 }}>
          <div style={{ fontSize:13, color:"#B91C1C", fontWeight:600, marginBottom:10 }}>
            {t("stepPublishSharedMissingTitle")}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {missingSharedFields.map((key, fi) => {
              const field = sharedFieldCfg[key];
              const val = sharedFields[key] ?? "";
              // Tailles enfant (2026-07-15) : le référentiel enfant
              // n'apparaît que si un genre enfant est détecté sur au moins
              // une copie, et filtré par AXE (union des axes des genres des
              // copies — prop sharedChildAxes calculée par le parent) :
              // Bébé → mois, Fille/Garçon/Enfant → ans, pointures toujours.
              const fieldGroups = field.childGroups && sharedChildAxes
                ? [...field.childGroups.filter(g => g.axis === "shoes" || sharedChildAxes[g.axis]), ...field.groups]
                : field.groups;
              const isLastOdd = fi === missingSharedFields.length - 1 && missingSharedFields.length % 2 !== 0;
              // Origine : la/les plateforme(s) sélectionnée(s) qui exigent ce
              // champ (ex. « Vinted, Beebs ») — pour que l'utilisateur sache
              // pourquoi « Taille » est demandé, comme l'encart bleu au-dessus.
              const originLabel = missingSharedFieldPlatforms[key];
              return (
                <div key={key} style={isLastOdd ? { gridColumn:"1 / -1" } : {}}>
                  <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
                    {field.label}
                    {originLabel && <span style={{ color:"#B91C1C", fontWeight:600 }}> · {originLabel}</span>}
                  </div>
                  {field.type === "select" ? (
                    <select
                      value={val}
                      onChange={ev => onSharedFieldChange?.(key, ev.target.value)}
                      style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, boxSizing:"border-box", color: val ? T.ink : T.mute }}
                    >
                      <option value="">—</option>
                      {fieldGroups
                        ? fieldGroups.map(g => (
                            <optgroup key={g.groupLabel} label={g.groupLabel}>
                              {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </optgroup>
                          ))
                        : field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={ev => onSharedFieldChange?.(key, ev.target.value)}
                      placeholder="—"
                      style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                    />
                  )}
                  {/* Marque : raccourci « Sans marque » (2026-07-12). La garde est
                      JUSTE — eBay exige l'aspect Marque même sur les meubles
                      (référentiel ebay_item_aspects : Chaises 54235 → Couleur,
                      Hauteur, Largeur, Longueur, MARQUE, Type). Ce qui manquait,
                      c'est quoi répondre quand l'objet n'a légitimement pas de
                      marque : sans issue, on finit par taper n'importe quoi
                      (le "p" du run réel). « Sans marque » est la valeur
                      canonique attendue par les plateformes. */}
                  {key === "marque" && (
                    <button
                      type="button"
                      onClick={() => onSharedFieldChange?.("marque", NO_BRAND_VALUE)}
                      style={{
                        marginTop:6, padding:"5px 10px", borderRadius:999,
                        border:`1px solid ${T.border}`, background: val === NO_BRAND_VALUE ? T.teal : T.card,
                        color: val === NO_BRAND_VALUE ? "#fff" : T.mute2,
                        fontSize:11.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                      }}
                    >
                      {val === NO_BRAND_VALUE ? "✓ " : ""}{t("fieldBrandNone")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:24 }}>
        {chips.map(p => (
          <div
            key={p}
            style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background:T.chip, border:`1px solid ${T.border}`,
              borderRadius:999, padding:"6px 8px 6px 6px",
            }}
          >
            <PlatformLogo platform={p} size={24} />
            <span style={{ fontSize:13.5, fontWeight:600, color:T.ink }}>{PLATFORM_LABELS[p]}</span>
            <button
              onClick={() => setSelected(prev => { const s = new Set(prev); s.delete(p); return s; })}
              style={{
                background:"none", border:"none", padding:2,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >
              <X size={13} color={T.mute} />
            </button>
          </div>
        ))}
      </div>

      {chips.length === 0 && (
        <p style={{ fontSize:13, color:T.mute, textAlign:"center", marginTop:16 }}>
          {t("stepPublishNoPlatformError")}
        </p>
      )}

      {chips.length > 0 && (
        <>
          <div style={{ borderRadius:18, padding:16, display:"flex", gap:12, marginBottom:16, background:"#E7F3F0", border:"1px solid #BFE0D9" }}>
            <Clock size={18} color={T.tealDeep} style={{ flexShrink:0, marginTop:1 }} />
            <p style={{ margin:0, fontSize:12.5, lineHeight:1.6, color:T.tealDeep }}>
              {t("stepPublishCronText1")}
            </p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"0 4px" }}>
            <ImageOff size={15} color={T.mute} style={{ flexShrink:0, marginTop:1 }} />
            <p style={{ margin:0, fontSize:11.5, lineHeight:1.6, color:T.mute }}>
              {t("stepPublishCronText2")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// ── Persistance du stepper (2026-07-18) ──────────────────────────────────────
// Chrome décharge les onglets en arrière-plan : au retour, la page se recharge
// et tout l'état React du stepper (étape, photos, annonces générées, sélection)
// était perdu — retour Dashboard, progression envolée. sessionStorage survit au
// reload de l'onglet et se vide à sa fermeture : exactement la durée de vie
// voulue pour un brouillon de publication en cours.
// Deux clés : le brouillon interne du stepper (états du composant) et le blob
// « hôte » écrit par LensTab/StockTab pour savoir REMONTER le stepper après un
// remount (reload navigateur ou simple changement d'onglet interne).
const STEPPER_DRAFT_KEY = "fs_stepper_draft";
const STEPPER_HOST_KEY  = "fs_stepper_host";

export function clearStepperPersistence() {
  try {
    sessionStorage.removeItem(STEPPER_DRAFT_KEY);
    sessionStorage.removeItem(STEPPER_HOST_KEY);
  } catch { /* stockage indisponible : rien à nettoyer */ }
}

export function readStepperHost(source) {
  try {
    const raw = sessionStorage.getItem(STEPPER_HOST_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw);
    return h?.source === source ? h : null;
  } catch { return null; }
}

export function writeStepperHost(data) {
  try { sessionStorage.setItem(STEPPER_HOST_KEY, JSON.stringify(data)); }
  catch { /* quota : le stepper marchera, il ne survivra juste pas au reload */ }
}

function readStepperDraft(invKey) {
  try {
    const raw = sessionStorage.getItem(STEPPER_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // Le brouillon ne se réapplique qu'au MÊME contexte d'ouverture (même ligne
    // inventaire, ou flux Lens sans ligne dans les deux cas) : un brouillon
    // d'un autre article ne doit jamais fuiter dans un stepper fraîchement
    // ouvert. Le second test couvre le brouillon ouvert SANS ligne inventaire
    // dont la ligne a été créée en cours de route (switch « Ajouter au stock »)
    // et que l'hôte remonte ensuite avec ce nouvel id.
    if ((d.invKey ?? null) !== (invKey ?? null) && (d.invId ?? null) !== (invKey ?? null)) return null;
    return d;
  } catch { return null; }
}

export default function ListingPreviewScreen({
  inventaireId, userId, initialPhotos = [], initialListing = null, supabase, lang, onClose,
  isPremium = false, isPro = false, onUpgrade = () => {},
  createStockItem = null, alreadyInStock = false,
}) {
  const { t, tpl } = useTranslation(lang);
  const stepLabels = [t("stepLabelUpload"), t("stepLabelPhotos"), t("stepLabelGeneration"), t("stepLabelPublish")];
  const platformFieldsConfig = getPlatformFieldsConfig(t);

  // Brouillon sessionStorage lu UNE fois au mount (ref : stable même si les
  // props bougent ensuite). null = ouverture fraîche, sinon on reprend là où
  // l'utilisateur en était avant le remount/reload.
  const draftRef = useRef(undefined);
  if (draftRef.current === undefined) draftRef.current = readStepperDraft(inventaireId ?? null);
  const draft = draftRef.current;
  const invKeyRef = useRef(inventaireId ?? null);

  const [step, setStep]         = useState(draft?.step ?? 0);
  const [initializing, setInit] = useState(true);

  // Ligne inventaire liée à cette annonce : peut ne pas encore exister si l'article
  // n'a pas encore été ajouté au stock (switch "Ajouter au stock" à l'étape Publier).
  const [invId, setInvId] = useState(inventaireId || draft?.invId || null);
  const canToggleStock = typeof createStockItem === "function" && !invId && !alreadyInStock;
  // Provenance de l'article : invId est posé quand on publie DEPUIS le Stock
  // (StockTab passe inventaireId) ; alreadyInStock l'est par Lens quand l'article
  // a déjà été ajouté. Dans les deux cas il est déjà en stock → toggle verrouillé.
  const stockLocked = !!invId || alreadyInStock;
  const [addToStock, setAddToStock] = useState(draft?.addToStock ?? true);
  const [prixAchatSaisi, setPrixAchatSaisi] = useState(draft?.prixAchatSaisi ?? "");

  // Mode dégradé (Phase B) : plateformes en pause (platform_health) → bandeau
  // de maintenance dans StepPublish. Lecture TOLÉRANTE (rafraîchie à
  // l'affichage puis toutes les 60 s) : un échec de lecture ne bloque jamais
  // rien, il masque juste le bandeau.
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  useEffect(() => {
    let alive = true;
    const lire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await supabase.from("platform_health").select("platform").eq("paused", true);
        if (alive) setPausedPlatforms((data ?? []).map(h => h.platform));
      } catch { /* mode dégradé indisponible : pas de bandeau, jamais bloquant */ }
    };
    lire();
    const timer = setInterval(lire, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [supabase]);

  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Step 0
  const [pickedFiles, setPickedFiles]       = useState([]);
  const [pickedPreviews, setPickedPreviews] = useState([]);
  const [notes, setNotes]                   = useState(draft?.notes ?? "");
  const [micActive, setMicActive]           = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [uploadError, setUploadError]       = useState("");
  const recognitionRef                      = useRef(null);

  // Photos prêtes
  const [photos, setPhotos] = useState(draft?.photos ?? initialPhotos);

  // Prix (depuis Lens ou DB)
  const [price, setPrice] = useState(draft?.price ?? null);
  // Plateformes dont le prix a été édité individuellement : le champ central ne
  // les écrase plus (2026-07-14).
  const [customPriced, setCustomPriced] = useState(() => new Set(draft?.customPriced ?? []));
  // ── Analyse photo optionnelle (chantier 3) ────────────────────────────────
  // photoAnalysis porte la réponse brute de lens-analysis. Elle complète
  // initialListing SANS le remplacer : le contrat (prix_vente_suggere +
  // canonical_fields taille/couleur/matiere/marque) est celui que le stepper
  // consomme déjà depuis Lens — on le REMPLIT, on ne le change pas.
  const [photoAnalysis, setPhotoAnalysis] = useState(draft?.photoAnalysis ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Step 1 — option de retouche
  const [photoOption, setPhotoOption] = useState(() =>
    draft?.photoOption ?? (isPro ? "ia_advanced" : isPremium ? "ia_light" : "original")
  );
  // Choix de fond — ia_advanced uniquement (voir StepPhotos). "original" = fond
  // d'origine conservé. Envoyé à generate-listing via le paramètre `background`.
  const [background, setBackground] = useState(draft?.background ?? "original");

  // Step 2 — résultats generate-listing
  const [generatingPlatforms, setGeneratingPlatforms] = useState(false);
  const [platformError, setPlatformError]             = useState("");
  const [platformListings, setPlatformListings]       = useState(draft?.platformListings ?? null);
  const [processedPhotos, setProcessedPhotos]         = useState(draft?.processedPhotos ?? []);
  const [edited, setEdited]                           = useState(draft?.edited ?? {});
  // Champs partagés (Sujet 4) : source canonique unique + trace des copies
  // éditées à la main (sacrées : plus jamais resynchronisées).
  const [sharedFields, setSharedFields]     = useState(draft?.sharedFields ?? { taille:"", couleur:"", matiere:"", marque:"" });
  const [sharedOverrides, setSharedOverrides] = useState(() => // { [platform]: Set<fieldKey> }
    draft?.sharedOverrides
      ? Object.fromEntries(Object.entries(draft.sharedOverrides).map(([k, v]) => [k, new Set(v)]))
      : {}
  );

  // Step 3 — sélection plateformes (chips) + publication
  const [selected, setSelected]         = useState(() => new Set(draft?.selected ?? PLATFORMS_DEFAULT));
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState("");
  const [done, setDone]                 = useState(false);

  // Sauvegarde continue du brouillon : tout ce qui permet de reprendre le
  // stepper après un remount (reload d'onglet Chrome, changement d'onglet
  // interne). Les états transitoires (publishing, uploading, fichiers locaux
  // du step 0) ne sont volontairement PAS persistés — non sérialisables ou non
  // reprenables côté client. Publication terminée → brouillon purgé.
  useEffect(() => {
    if (initializing) return;
    if (done) { clearStepperPersistence(); return; }
    try {
      sessionStorage.setItem(STEPPER_DRAFT_KEY, JSON.stringify({
        invKey: invKeyRef.current,
        step, invId, addToStock, prixAchatSaisi, notes,
        photos, price, customPriced: [...customPriced], photoAnalysis,
        photoOption, background,
        platformListings, processedPhotos, edited,
        sharedFields,
        sharedOverrides: Object.fromEntries(Object.entries(sharedOverrides).map(([k, v]) => [k, [...v]])),
        selected: [...selected],
      }));
    } catch { /* quota plein : le stepper continue, seul le brouillon saute */ }
  }, [initializing, done, step, invId, addToStock, prixAchatSaisi, notes, photos, price,
      customPriced, photoAnalysis, photoOption, background, platformListings,
      processedPhotos, edited, sharedFields, sharedOverrides, selected]);

  // Compat catégorie × plateforme (source de vérité = les 4 mappings, cf.
  // platformCompat.js) : calculée dès que l'article est connu, elle GRISE les
  // checkboxes des plateformes qui ne peuvent pas vendre cette catégorie
  // (StepPhotos) et les retire de la sélection — un job qui échouerait au
  // pré-check de l'extension ne doit jamais pouvoir partir.
  const platformSupport = useMemo(() => {
    const icon = detectObjectIcon(
      initialListing?.titre,
      initialListing?.description,
      initialListing?.categorie
    );
    return getPlatformSupport(icon);
  }, [initialListing]);
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(p => platformSupport[p] === "supported"));
      return next.size === prev.size ? prev : next;
    });
  }, [platformSupport]);

  // Modale de conversion (solde de Pépites insuffisant pour publier)
  const [quotaModal, setQuotaModal] = useState({
    open: false, trigger: "publish", targetTiers: ["premium","pro"],
  });

  // ── Pièces : solde (coin_wallets) + grille de prix (coin_config) ──────────
  // Lecture seule côté client — tout débit passe par spend_coins_and_publish.
  const [wallet, setWallet]         = useState(null);
  const [coinPrices, setCoinPrices] = useState(null);
  const [storeOpen, setStoreOpen]   = useState(false);
  const coinBalance = (wallet?.included_balance ?? 0) + (wallet?.purchased_balance ?? 0);
  const coinPriceFor = (opt) => coinPrices?.[opt] ?? null;

  async function refreshWallet() {
    const { data: w } = await supabase
      .from("coin_wallets")
      .select("included_balance, purchased_balance")
      .eq("user_id", userId)
      .maybeSingle();
    setWallet(w ?? { included_balance: 0, purchased_balance: 0 });
  }

  useEffect(() => {
    refreshWallet();
    supabase.from("coin_config").select("key, value").then(({ data }) => {
      const p = {};
      for (const row of data ?? []) if (row.key.startsWith("price_")) p[row.key.slice(6)] = row.value;
      setCoinPrices(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Reprise d'un brouillon : step/photos/prix déjà hydratés depuis
    // sessionStorage — surtout ne pas laisser l'init les écraser (le
    // setStep(1) ci-dessous renverrait l'utilisateur en arrière).
    if (draft) { setInit(false); return; }
    // Pas encore de ligne inventaire (article pas encore en stock) : le prix vient
    // uniquement du résultat Lens, pas de lecture DB possible.
    if (invId) {
      supabase
        .from("inventaire")
        .select("prix_vente,prix_achat")
        .eq("id", invId)
        .single()
        .then(({ data }) => {
          // ⚠️ Plus AUCUN repli sur prix_achat (2026-07-14) : un article ajouté
          // au stock sans prix de vente retombait sur son prix d'ACHAT, et
          // partait donc en ligne à marge nulle. Sans analyse et sans prix
          // saisi, le champ reste VIDE — le garde-fou de publication (≥ 1 €,
          // commit c85548b) empêche toute annonce sans prix.
          const finalPrice = initialListing?.prix_vente_suggere ?? data?.prix_vente ?? null;
          if (finalPrice != null) setPrice(finalPrice);
        });
    } else if (initialListing?.prix_vente_suggere != null) {
      setPrice(initialListing.prix_vente_suggere);
    }

    if (initialPhotos.length > 0) {
      setPhotos(initialPhotos);
      setStep(1);
      setInit(false);
      return;
    }

    if (!invId) {
      setInit(false);
      return;
    }

    supabase
      .from("cross_post_jobs")
      .select("photos")
      .eq("inventaire_id", invId)
      .eq("user_id", userId)
      .not("photos", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const existing = data?.[0]?.photos;
        if (Array.isArray(existing) && existing.length > 0) {
          const urls = existing
            .filter(p => p.type === "original" || p.url)
            .map(p => p.url || p.original || p.enhanced || p.bg_removed)
            .filter(Boolean);
          if (urls.length > 0) {
            setPhotos(urls);
            setStep(1);
          }
        }
        setInit(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Déclenche la génération à l'arrivée sur step 2 ────────────────────────
  useEffect(() => {
    if (step === 2 && !platformListings && !generatingPlatforms && !platformError) {
      handleGeneratePlatforms();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Mic ───────────────────────────────────────────────────────────────────
  function toggleMic() {
    if (micActive) {
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = lang === "en" ? "en-US" : "fr-FR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = e => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setNotes(prev => (prev ? `${prev} ${text}` : text));
    };
    r.onend = () => setMicActive(false);
    r.onerror = () => setMicActive(false);
    recognitionRef.current = r;
    r.start();
    setMicActive(true);
  }

  // ── Fichiers step 0 ───────────────────────────────────────────────────────
  function addFiles(files) {
    const toAdd = files.slice(0, MAX_PHOTOS - pickedFiles.length);
    if (!toAdd.length) return;
    setPickedFiles(prev => [...prev, ...toAdd]);
    toAdd.forEach(f => setPickedPreviews(prev => [...prev, URL.createObjectURL(f)]));
  }

  function removeFile(idx) {
    setPickedFiles(prev => prev.filter((_, i) => i !== idx));
    setPickedPreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // Étape 0 : la grille affiche soit les fichiers choisis (pickedPreviews), soit
  // les photos déjà en ligne (article venant du Stock). On réordonne la source
  // réellement affichée — et pickedFiles DOIT suivre pickedPreviews, c'est lui
  // qui part à l'upload (handleUpload conserve l'ordre du tableau).
  function handleReorderPreviews(from, to) {
    if (pickedPreviews.length > 0) {
      setPickedFiles(prev => moveItem(prev, from, to));
      setPickedPreviews(prev => moveItem(prev, from, to));
    } else {
      setPhotos(prev => moveItem(prev, from, to));
    }
  }

  function handleReorderPhotos(from, to) {
    setPhotos(prev => moveItem(prev, from, to));
  }

  function compressImage(file, maxWidth = 1024, quality = 0.85) {
    return new Promise(resolve => {
      const img = new window.Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const sc = Math.min(1, maxWidth / img.width);
        c.width = img.width * sc;
        c.height = img.height * sc;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b), "image/jpeg", quality);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ── Upload step 0 ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!pickedFiles.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const urls = [];
      const ts = Date.now();
      for (let i = 0; i < pickedFiles.length; i++) {
        const blob = await compressImage(pickedFiles[i]);
        const path = `${userId}/raw/${ts}_${i}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("listing-photos")
          .upload(path, blob, { contentType:"image/jpeg", upsert:true });
        if (!upErr)
          urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl);
      }
      if (!urls.length) throw new Error(t("stepUploadError"));
      setPhotos(urls);
      setStep(1);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Analyse photo optionnelle — MÊME edge function que Lens ───────────────
  // On envoie les URLs déjà uploadées (bucket listing-photos) : aucun ré-upload.
  // lens-analysis débite les Pépites elle-même (spend_coins_for_lens) et renvoie
  // 402 { error:"insufficient_coins", price, balance } — on rebranche ce 402 sur
  // la ConversionModal existante (trigger 'lens'), comme le fait déjà l'onglet
  // Lens. Aucun chemin de paiement nouveau.
  async function handleAnalyzePhotos() {
    if (!photos.length || analyzing) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      // Même client supabase que le reste du stepper (prop), donc mêmes en-têtes
      // d'auth. Le 402 arrive dans fnErr.context (FunctionsHttpError) — comme
      // pour le 402 de generate-listing, functions.invoke ne lit pas le body.
      const { data: res, error: fnErr } = await supabase.functions.invoke("lens-analysis", {
        body: {
          urls: photos,
          description: initialListing?.description || initialListing?.titre || null,
          prixAchat: initialListing?.prix_achat ?? null,
          lang,
        },
      });
      if (fnErr) {
        let err = null;
        try { err = await fnErr.context?.json(); } catch { /* body non-JSON */ }
        if (err?.error === "insufficient_coins") {
          setQuotaModal({
            open: true, trigger: "lens", targetTiers: ["premium","pro"],
            coinPrice: err.price ?? coinPrices?.lens_overflow ?? null,
            coinBalance: err.balance ?? coinBalance,
          });
          return;
        }
        throw new Error(err?.error || fnErr.message || t("genericError"));
      }
      if (res?.error) throw new Error(res.error);
      setPhotoAnalysis(res);
      refreshWallet();
      // Prix par défaut : la valeur de marché estimée, jamais le prix d'achat.
      if (res?.prix_vente_suggere != null) setPrice(res.prix_vente_suggere);
    } catch (e) {
      setAnalysisError(e.message || t("genericError"));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Ajouter / supprimer photos step 1 ────────────────────────────────────
  async function handleAddMorePhotos(files) {
    const toAdd = files.slice(0, MAX_PHOTOS - photos.length);
    if (!toAdd.length) return;
    const ts = Date.now();
    const urls = [];
    for (let i = 0; i < toAdd.length; i++) {
      const blob = await compressImage(toAdd[i]);
      const path = `${userId}/raw/${ts}_extra_${i}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("listing-photos")
        .upload(path, blob, { contentType:"image/jpeg", upsert:true });
      if (!upErr)
        urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl);
    }
    if (urls.length) setPhotos(prev => [...prev, ...urls]);
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Génération plateformes ────────────────────────────────────────────────
  async function handleGeneratePlatforms() {
    setGeneratingPlatforms(true);
    setPlatformError("");
    try {
      const platforms = [...selected];
      // Source des champs : l'analyse photo (si elle a eu lieu) complète
      // initialListing. Elle ne l'ÉCRASE que là où l'article n'avait rien —
      // une valeur venant de Lens ou saisie par l'utilisateur reste prioritaire.
      const src = {
        titre:       initialListing?.titre       ?? photoAnalysis?.titre       ?? "",
        marque:      initialListing?.marque      ?? photoAnalysis?.marque      ?? null,
        description: initialListing?.description ?? photoAnalysis?.description ?? null,
        categorie:   initialListing?.categorie   ?? photoAnalysis?.categorie   ?? null,
        taille:      initialListing?.taille_estimee ?? initialListing?.taille ?? photoAnalysis?.taille_estimee ?? null,
        couleur:     initialListing?.couleur     ?? photoAnalysis?.couleur     ?? null,
        matiere:     initialListing?.matiere     ?? photoAnalysis?.matiere     ?? null,
        prixVente:   price ?? initialListing?.prix_vente_suggere ?? photoAnalysis?.prix_vente_suggere ?? null,
      };
      // Tant que l'article n'est pas en stock (invId absent), on envoie ses infos
      // directement plutôt qu'un inventaire_id qui n'existe pas encore.
      const itemData = invId ? null : {
        titre:       src.titre,
        marque:      src.marque,
        description: src.description,
        type:        src.categorie,
        statut:      "stock",
        prix_vente:  src.prixVente,
      };
      const { data, error: fnErr } = await supabase.functions.invoke("generate-listing", {
        body: {
          ...(invId ? { inventaire_id: invId } : { item_data: itemData }),
          // Champs canoniques déjà connus du client (Lens taille_estimee,
          // article) : le serveur les injecte comme contraintes dans les 4
          // prompts et les réplique après génération (Sujet 4) —
          // l'inventaire n'a pas ces colonnes, seul le client les connaît.
          // Même contrat que Lens — l'analyse photo le remplit, ne le change pas.
          canonical_fields: {
            taille:  src.taille,
            couleur: src.couleur,
            matiere: src.matiere,
            marque:  src.marque,
          },
          photos,
          platforms,
          photo_option: photoOption,
          // Fond pris en compte uniquement en ia_advanced (le backend l'ignore
          // sinon, mais on n'envoie même pas une valeur trompeuse hors avancé).
          background: photoOption === "ia_advanced" ? background : "original",
          price,
          ...(notes ? { notes } : {}),
        },
      });
      if (fnErr) {
        // 402 insufficient_coins (course : solde consommé entre le pré-check
        // client du step 1 et cet appel) : functions.invoke ne lit pas le
        // body d'erreur, il faut aller le chercher sur fnErr.context
        // (Response). Même UX que Lens et publication : ConversionModal avec
        // chemin "Utiliser mes Pépites", jamais un message générique.
        let errBody = null;
        try { errBody = await fnErr.context?.json(); } catch { /* body non-JSON → chemin générique */ }
        if (errBody?.error === "insufficient_coins") {
          refreshWallet();
          setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"] });
          return;
        }
        throw new Error(fnErr.message || t("stepGenErrorTitle"));
      }
      if (!data?.platforms) throw new Error(t("stepGenNoListingsError"));

      setProcessedPhotos(data.photos ?? []);
      setPrice(prev => data.price ?? prev);

      const initialEdited = {};
      for (const p of platforms) {
        initialEdited[p] = {
          title:           data.platforms[p]?.title           ?? "",
          description:     data.platforms[p]?.description     ?? "",
          platform_fields: mergeFieldsWithLens(
            data.platforms[p]?.platform_fields ?? {},
            initialListing,
            platformFieldsConfig[p] ?? []
          ),
          price: data.price ?? price ?? null,
        };
      }
      // Genre eBay/Beebs : dérivé de la même source que les autres plateformes
      // quand l'IA ne l'a pas fourni. Les prompts eBay/Beebs d'avant le
      // 2026-07-09 ne renvoyaient pas de genre (eBay renvoyait même des clés
      // anglaises que mergeFieldsWithLens jetait) → genre toujours "" et
      // ebayGenreRequired/beebsGenreRequired bloquaient systématiquement la
      // résolution de catégorie alors que l'univers Leboncoin, lui, était bien
      // rempli pour le même article. Les prompts sont corrigés (generate-listing)
      // ET ce filet transpose le genre depuis Vinted/LBC du même run de
      // génération — mêmes libellés Femme/Homme/Enfant/Mixte. Mapping par
      // plateforme : eBay a un rayon "Enfant : unisexe" et un usage Mixte
      // (parfums) → toute valeur passe telle quelle ; Beebs n'a NI Enfant NI
      // Mixte (rayons Fille/Garçon/Bébé) → seuls les libellés transposables
      // passent, sinon le champ reste vide et l'utilisateur tranche au stepper.
      const genreSource =
        initialEdited.vinted?.platform_fields?.genre ||
        initialEdited.leboncoin?.platform_fields?.univers || "";
      const GENRE_TRANSPOSABLE = {
        ebay:  ["Femme", "Homme", "Fille", "Garçon", "Bébé", "Enfant", "Mixte"],
        beebs: ["Femme", "Homme", "Fille", "Garçon", "Bébé"],
      };
      for (const [p, allowed] of Object.entries(GENRE_TRANSPOSABLE)) {
        if (initialEdited[p] && !initialEdited[p].platform_fields.genre && allowed.includes(genreSource)) {
          initialEdited[p].platform_fields.genre = genreSource;
        }
      }

      // Champs partagés (Sujet 4) : initialisés depuis les copies fraîches, à
      // l'UNANIMITÉ seulement — la valeur ne devient canonique que si TOUTES
      // les copies consommatrices générées portent la MÊME valeur non vide
      // (= la canonicalisation serveur a réellement eu lieu). L'ancien
      // "première copie non vide" laissait une hallucination isolée d'un des
      // 4 appels devenir canonique et neutraliser la garde (cas réel du
      // 2026-07-11 : taille "M" eBay/Beebs, Vinted vide → garde muette alors
      // que le job Vinted partait sans taille). Divergence → champ vide →
      // missingSharedFields se déclenche et l'input inline demande la vraie
      // valeur. Overrides remis à zéro : nouvelle génération = nouvelles
      // copies, plus aucune édition manuelle à protéger.
      const shared = { taille:"", couleur:"", matiere:"", marque:"" };
      for (const key of SHARED_FIELD_KEYS) {
        const values = SHARED_PROPAGATION[key]
          .filter(p => initialEdited[p])
          .map(p => String(initialEdited[p].platform_fields?.[key] ?? "").trim());
        if (values.length && values.every(v => v && v === values[0])) shared[key] = values[0];
      }
      setSharedFields(shared);
      setSharedOverrides({});

      setEdited(initialEdited);
      setPlatformListings(data);
    } catch (e) {
      setPlatformError(e.message);
    } finally {
      setGeneratingPlatforms(false);
    }
  }

  // ── Champs partagés : setter propagateur + garde générique (Sujet 4) ──────
  // Écrit la source canonique ET la propage aux copies plateformes non
  // éditées à la main (override local sacré, cf. sharedOverrides).
  function setSharedField(key, value) {
    setSharedFields(prev => ({ ...prev, [key]: value }));
    setEdited(prev => {
      const next = { ...prev };
      for (const p of SHARED_PROPAGATION[key]) {
        if (!next[p]) continue;
        if (sharedOverrides[p]?.has(key)) continue;
        next[p] = { ...next[p], platform_fields: { ...next[p].platform_fields, [key]: value } };
      }
      return next;
    });
  }
  // Fallback UI générique (Phase 3, 2026-07-16) : saisie manuelle d'un
  // aspect obligatoire eBay sans source — écrit dans pf.ebayAspects de la
  // copie eBay (même canal que resolve_aspects ; garde + ebay.js le lisent).
  function setEbayAspect(name, value) {
    setEdited(prev => prev.ebay ? {
      ...prev,
      ebay: {
        ...prev.ebay,
        platform_fields: {
          ...prev.ebay.platform_fields,
          ebayAspects: { ...(prev.ebay.platform_fields?.ebayAspects ?? {}), [name]: value },
        },
      },
    } : prev);
  }
  // Champ DÉDIÉ de la copie eBay depuis le sélecteur de l'encart (2026-07-18,
  // état "invalid") : la valeur choisie est un libellé eBay exact (« Taille
  // unique ») qui n'a pas de sens sur Vinted/LBC — on n'écrit QUE la copie
  // eBay et on casse le lien partagé pour cette clé (override sacré), la
  // canonique et les autres copies gardent leur valeur d'origine.
  function setEbaySharedField(key, value) {
    // État "missing" (2026-07-18, bug Couleur en double) : la valeur n'existe
    // NULLE PART — le choix fait ici devient la CANONIQUE (une couleur ou une
    // pointure de la liste eBay reste un libellé valable ailleurs) et remplit
    // d'un coup toutes les copies non overridées : le bloc rouge « Il manque
    // des infos » se satisfait en même temps, fini la double-saisie. Le lien
    // partagé reste INTACT dans ce cas. Une canonique DÉJÀ remplie (état
    // "invalid" : valeur hors liste fermée eBay) garde le comportement
    // d'origine — copie eBay seule + override, la divergence est voulue.
    const canonicalEmpty = SHARED_FIELD_KEYS.includes(key) && !String(sharedFields[key] ?? "").trim();
    if (canonicalEmpty) setSharedField(key, value);
    setEdited(prev => {
      if (!prev.ebay) return prev;
      const pf = { ...prev.ebay.platform_fields };
      if (key === "couleur") {
        // La garde et ebay.js lisent colors[0] AVANT couleur : écrire les deux.
        pf.couleur = value;
        if (Array.isArray(pf.colors) && pf.colors.length) pf.colors = [value, ...pf.colors.slice(1)];
      } else {
        pf[key] = value;
      }
      return { ...prev, ebay: { ...prev.ebay, platform_fields: pf } };
    });
    // Pas d'override quand le choix vient de remplir la canonique : le lien
    // partagé doit rester vivant pour cette clé.
    if (!canonicalEmpty) noteSharedOverride("ebay", key); // clés hors SHARED_FIELD_KEYS (modele, stockage) : no-op
  }
  // Édition manuelle d'UNE copie plateforme : le lien casse pour cette copie
  // seulement (les autres restent synchronisées sur la source).
  function noteSharedOverride(platform, key) {
    if (!SHARED_FIELD_KEYS.includes(key)) return;
    setSharedOverrides(prev => {
      const set = new Set(prev[platform] ?? []);
      set.add(key);
      return { ...prev, [platform]: set };
    });
  }
  // Garde générique : un champ partagé vide bloque si AU MOINS une plateforme
  // SÉLECTIONNÉE le consomme (SHARED_GUARD). Dérivé de l'état → corriger un
  // champ dans l'encart inline de StepPublish re-render ce step seulement.
  // Exception taille×Leboncoin (2026-07-11) : LBC ne bloque sur la taille
  // QUE pour Mode>Chaussures (Pointure obligatoire, shoe_size) — même
  // détection icône→getLbcCategoryPath que le bloc LBC de handlePublish.
  // Icône de l'article — MÊME résolution que missingSharedFields et que les
  // mappings catalogue (source FR, jamais la copie eBay anglaise). Sert au
  // filtrage d'affichage des champs par catégorie (chantier 2).
  const articleIcon = useMemo(() => {
    const src = edited.leboncoin ?? edited.vinted ?? edited.ebay ?? edited.beebs ?? null;
    return resolveArticleIcon({
      initialListing,
      edited,
      pf: src?.platform_fields ?? {},
    });
  }, [edited, initialListing]);

  // Référentiels par catégorie, déclarés ICI (avant la garde qui les lit) —
  // leurs effets de chargement restent plus bas, à côté des encarts bleus
  // qu'ils nourrissaient déjà : ebayRequiredPreview = requis eBay COMPLETS de
  // la catégorie résolue (ebay_item_aspects) ; genericAspectsCatalog = requis
  // APPRIS Vinted/LBC/Beebs (platform_category_aspects, relevés cumulés).
  const [ebayRequiredPreview, setEbayRequiredPreview] = useState(null);
  const [genericAspectsCatalog, setGenericAspectsCatalog] = useState({});

  // Détaillé : [{ key, platforms:[ids] }] — expose les plateformes gardées de
  // chaque champ manquant (pour afficher leur origine dans l'encart rouge, comme
  // le fait l'encart bleu). `missingSharedFields` (les clés seules) en dérive et
  // garde la même forme qu'avant pour tous les consommateurs existants.
  const missingSharedFieldsDetailed = useMemo(() => {
    // Même résolution d'icône que les mappings catalogue (resolveArticleIcon) :
    // source française et stable, jamais la copie eBay (anglaise).
    const catSrc = edited.leboncoin ?? edited.vinted ?? edited.ebay ?? edited.beebs ?? null;
    const catIcon = resolveArticleIcon({
      initialListing,
      edited,
      pf: catSrc?.platform_fields ?? {},
    });
    const catPath = getLbcCategoryPath(catIcon);
    const lbcShoes = catPath?.[0] === "Mode" && catPath?.[1] === "Chaussures";
    // Scope catégorie de la taille (bug Xiaomi, 2026-07-12) : seuls les articles
    // portés ont une taille. Un téléphone, un casque ou un lot de cartes n'en
    // ont pas — les leur demander bloquait la publication sur un champ absurde.
    const isFashionWearable =
      catPath?.[0] === "Mode" && (catPath?.[1] === "Vêtements" || catPath?.[1] === "Chaussures");
    // Vêtements de sport (2026-07-12) : une combinaison de ski, un maillot de
    // foot ou des chaussons d'escalade se portent — et Vinted en demande la
    // taille — mais le mapping les range en Loisirs>Sport & Plein air, avec
    // l'ÉQUIPEMENT (ballons, vélos, tentes, haltères) qui n'a pas de taille.
    // On ne peut donc pas élargir la garde à toute la feuille : on distingue,
    // À L'INTÉRIEUR du sport uniquement, ce qui se porte de ce qui ne se porte
    // pas. Restreint à la feuille sport pour ne pas rouvrir le bug d'origine
    // (un "short" cité dans la description d'un téléphone ne doit rien déclencher).
    const isSportLeaf = catPath?.[0] === "Loisirs" && catPath?.[1] === "Sport & Plein air";
    const sportText = `${catSrc?.title ?? initialListing?.titre ?? ""} ${catSrc?.description ?? ""}`;
    const isSportswear = isSportLeaf && SPORTSWEAR_RE.test(sportText);
    const sizeGuardApplies = isFashionWearable || isSportswear;

    // MATIÈRE — 3e cas du même bug que la Taille (2026-07-12). SHARED_GUARD la
    // rendait bloquante sur les 4 plateformes, TOUTES catégories confondues.
    // Vérifié dans le référentiel eBay réel (table ebay_item_aspects) : la
    // Matière n'est obligatoire sur AUCUNE des catégories du run —
    //   Chaises 54235      → Couleur, Hauteur, Largeur, Longueur, Marque, Type
    //   Téléphones 9355    → Capacité, Couleur, Marque, Modèle
    //   Baskets 15709      → Couleur, Département, Marque, Pointure EU, Style, Type
    //   T-shirts 15687     → Couleur, Département, Marque, Taille, Type
    // …alors qu'elle a un vrai sens sur les vêtements (coton/laine/cuir). On la
    // garde donc sur la Mode (même périmètre que la Taille, vêtements de sport
    // inclus) et on cesse de bloquer ailleurs.
    // (Depuis les gardes data-driven ci-dessous, ces scopes ne servent plus
    // que de FALLBACK quand le référentiel de la catégorie n'est pas chargé.)
    const materialGuardApplies = sizeGuardApplies;

    // COULEUR — 4e cas du même bug que Taille/Matière (2026-07-19, sérum
    // Medik8 routé 🧴 par le fix B) : gardée en aveugle sur les 3 plateformes
    // alors qu'aucun référentiel beauté ne l'exige (détail sur
    // BEAUTY_PRODUCT_ICONS). Le signal du bug : eBay listé dans l'encart ROUGE
    // pour Couleur alors que son propre encart BLEU (référentiel réel de la
    // catégorie résolue) ne la demandait pas. Beebs non relevé — DÉFAUT
    // ASSUMÉ : pas de couleur non plus ; si un relevé l'apprend un jour,
    // l'encart générique platform_category_aspects la réclamera.
    const colorGuardApplies = !BEAUTY_PRODUCT_ICONS.includes(catIcon);

    // ── Gardes DATA-DRIVEN (2026-07-19) ─────────────────────────────────────
    // 4 bugs de la même classe en une semaine (taille 12/07, matière 12/07,
    // couleur beauté 18/07, audit 19/07 : ~90 catégories eBay sur-gardées en
    // Couleur, médias sur-gardés en Marque, gants/casquettes sous-gardés en
    // Taille) : une liste FIGÉE ne peut pas suivre les exigences réelles par
    // catégorie. Les référentiels sont DÉJÀ chargés pour les encarts bleus —
    // on branche la garde dessus. Par (champ, plateforme) :
    //   · source dispo   → gardé SSI le référentiel exige le champ
    //     (eBay : ebayRequiredPreview, vérité COMPLÈTE de la catégorie ;
    //      Vinted/LBC/Beebs : genericAspectsCatalog, relevés cumulés) ;
    //   · source absente (catégorie jamais relevée, chargement en cours,
    //     échec réseau, ou catégorie sans aucun requis — indistinguable) →
    //     FALLBACK = la garde statique scopée, à l'identique d'avant.
    // Pendant le chargement async, la statique s'applique et le CTA Publier
    // dérive du MÊME memo (requiredBlocking) : jamais publiable trop tôt sur
    // un champ que les vraies données confirmeraient. Une sous-garde due à un
    // relevé V/B incomplet reste rattrapée par le gate pré-clic de
    // l'extension, dont l'échec sert de relevé correctif (philosophie 1.A).
    const staticGuard = (key) => {
      if (key === "matiere") return materialGuardApplies ? SHARED_GUARD.matiere : [];
      if (key === "couleur") return colorGuardApplies ? SHARED_GUARD.couleur : [];
      if (key !== "taille") return SHARED_GUARD[key];
      if (!sizeGuardApplies) return [];
      return lbcShoes ? [...SHARED_GUARD.taille, "leboncoin"] : SHARED_GUARD.taille;
    };
    const guardPlatforms = (key) => {
      const fallback = staticGuard(key);
      return ["vinted", "leboncoin", "beebs", "ebay"].filter(p => {
        if (p === "ebay") {
          // ebayRequiredPreview n'est chargé que si eBay est sélectionné et
          // sa catégorie résolue — sinon fallback (le filtre selected en aval
          // neutralise de toute façon une plateforme non cochée).
          return ebayRequiredPreview
            ? ebayRequiredPreview.some(a => EBAY_ASPECT_LABELS[key].includes(a.name))
            : fallback.includes("ebay");
        }
        return genericAspectsCatalog[p]
          ? genericAspectsCatalog[p].some(r => genericFieldToSharedKey(p, r.field_key) === key)
          : fallback.includes(p);
      });
    };
    // Manquant si la canonique est vide OU si la copie d'une plateforme
    // gardée sélectionnée est vide : les jobs partent depuis
    // edited[p].platform_fields (handlePublish), pas depuis sharedFields —
    // une canonique remplie ne prouve pas que chaque copie l'est (divergence
    // possible : copie vidée à la main, plateforme re-cochée sans copie…).
    return SHARED_FIELD_KEYS.map(key => {
      const guarded = guardPlatforms(key).filter(p => selected.has(p));
      if (!guarded.length) return null;
      const canonicalEmpty = !String(sharedFields[key] ?? "").trim();
      const copyEmpty = guarded.some(p => !String(edited[p]?.platform_fields?.[key] ?? "").trim());
      if (!canonicalEmpty && !copyEmpty) return null;
      return { key, platforms: guarded };
    }).filter(Boolean);
  }, [sharedFields, selected, edited, initialListing, ebayRequiredPreview, genericAspectsCatalog]);

  const missingSharedFields = useMemo(
    () => missingSharedFieldsDetailed.map(f => f.key),
    [missingSharedFieldsDetailed]
  );

  // Clé → « Vinted, Beebs » : plateformes sélectionnées qui EXIGENT ce champ,
  // affichées à côté du libellé dans l'encart rouge (miroir de l'encart bleu).
  const missingSharedFieldPlatforms = useMemo(() => {
    const m = {};
    for (const f of missingSharedFieldsDetailed) {
      m[f.key] = f.platforms.map(p => PLATFORM_LABELS[p] ?? p).join(", ");
    }
    return m;
  }, [missingSharedFieldsDetailed]);

  // Axes de tailles enfant du champ partagé Taille (encart inline de
  // StepPublish) : UNION des axes autorisés par les genres enfant des
  // copies (childAxesForGenre — Bébé → mois, Fille/Garçon/Enfant → ans).
  // null si aucune copie n'a de genre enfant → groupes adultes seuls.
  // L'union (et non l'intersection) parce que les genres peuvent diverger
  // entre copies (Vinted n'a pas de genre Bébé, sa copie dit Fille quand
  // eBay/Beebs disent Bébé) — le filtrage strict par copie reste fait dans
  // l'éditeur de chaque copie.
  const sharedChildAxes = useMemo(() => {
    let axes = null;
    for (const c of Object.values(edited ?? {})) {
      const a = childAxesForGenre(c?.platform_fields?.genre)
        ?? childAxesForGenre(c?.platform_fields?.univers);
      if (!a) continue;
      axes = { months: (axes?.months ?? false) || a.months, years: (axes?.years ?? false) || a.years };
    }
    return axes;
  }, [edited]);

  // ── Signal AVANT publication : genre Vinted sans rayon (2026-07-16) ───────
  // Bug réel : job vinted parti avec genre "Enfant" → « Catégorie vinted non
  // résolue » APRÈS le clic Publier (échec extension), sans aucun signal en
  // amont. Un genre EXPLICITE qui ne résout aucun chemin (Enfant/Bébé sur un
  // article de mode, ou Femme sur une icône Homme-seulement) est respecté par
  // l'auto-résolution (choix explicite sacré) : il partira à l'échec à coup
  // sûr. On l'affiche donc AVANT, dans StepPublish. Vide/Mixte restent hors
  // du signal : l'auto-résolution du genre s'en charge au moment du publish.
  const vintedGenreBlocked = useMemo(() => {
    if (!selected.has("vinted") || !edited.vinted) return false;
    const pf = edited.vinted.platform_fields ?? {};
    const icon = resolveArticleIcon({ initialListing, edited, pf });
    if (!vintedGenreRequired(icon)) return false;
    const g = pf.genre;
    if (!g || g === "Mixte") return false;
    return !getVintedCategoryPath(icon, g);
  }, [selected, edited, initialListing]);

  // ── Aspects obligatoires eBay AVANT publication (B1, 2026-07-16) ──────────
  // Cas réel déclencheur : « Longueur de la robe » (obligatoire sur Robes,
  // AUCUNE source app) n'apparaissait qu'APRÈS le clic Publier, via l'échec
  // du job. Dès que la catégorie eBay est résolue, on lit ses aspects
  // required=true (même table que la garde) et on les affiche avec leur état.
  // Présence seule ici (la validation contre allowedValues reste à la garde
  // du publish, plus stricte) ; Département/Type/Style sont marqués
  // « pré-remplis par eBay » — vérifié en session réelle, eBay les pose
  // depuis la catégorie/le titre (Département en pills pré-actives).
  // Genre de secours pour l'encart eBay (2026-07-19, job casquette 47917f97) :
  // même liste de repli que l'autoGenre du publish (genre des copies sœurs,
  // univers LBC — jamais Mixte/Enfant). LECTURE SEULE : le genre de la copie
  // eBay n'est jamais réécrit ici, l'autoGenre de l'insert reste le seul à
  // poser une valeur sur le job.
  const ebayGenreFallback = () => [
    edited.vinted?.platform_fields?.genre,
    edited.beebs?.platform_fields?.genre,
    edited.leboncoin?.platform_fields?.univers,
  ].find(g => g && g !== "Mixte" && g !== "Enfant") ?? null;
  const ebayPreviewCategoryId = useMemo(() => {
    if (!selected.has("ebay") || !edited.ebay) return null;
    const pf = edited.ebay.platform_fields ?? {};
    const icon = resolveArticleIcon({ initialListing, edited, pf });
    const direct = getEbayCategoryId(icon, pf.genre);
    if (direct) return direct;
    // TROU PROUVÉ (job casquette 47917f97, cat. 52365) : genre de la copie
    // eBay vide/« Mixte » au stepper → categoryId null ICI alors que
    // l'autoGenre de handlePublish le résout à l'INSERT → l'encart eBay ne se
    // montait JAMAIS (preview null → ebayRequiredStatus null) : aucun chip,
    // aucun défaut posé (ebayAspects est resté null en base — preuve), aucun
    // resolve_aspects, aucun blocage CTA — le job partait avec des requis
    // (Style…) sans la moindre source, gate extension seule juge. Même repli
    // de genre que l'insert : l'encart se monte sur la catégorie que le job
    // aura réellement.
    const secours = ebayGenreFallback();
    return secours ? (getEbayCategoryId(icon, secours) ?? null) : null;
  }, [selected, edited, initialListing]);
  useEffect(() => {
    if (!ebayPreviewCategoryId) { setEbayRequiredPreview(null); return; }
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("ebay_item_aspects")
          .select("aspects")
          .eq("category_id", String(ebayPreviewCategoryId))
          .limit(1)
          .maybeSingle();
        if (!alive) return;
        // Objets complets {name, allowedValues} : les allowedValues nourrissent
        // resolve_aspects (échantillon) ET le fallback UI (select ≤ 30 options).
        // slice(0,1000) : les valeurs utiles peuvent être en fin de liste (ex.
        // « Capacité de stockage » : 16 Go…1 To aux index 238-244) — 200 les
        // coupait. `mode` remonté pour le <select> strict des SELECTION_ONLY.
        // État UI seulement : le payload du job reste tronqué séparément (60).
        const req = (data?.aspects ?? [])
          .filter(a => a?.required === true && a?.name)
          .map(a => ({ name: a.name, mode: a.mode, allowedValues: (a.allowedValues ?? []).slice(0, 1000) }));
        setEbayRequiredPreview(req.length ? req : null);
      } catch { if (alive) setEbayRequiredPreview(null); }
    })();
    return () => { alive = false; };
  }, [ebayPreviewCategoryId]);
  const ebayRequiredStatus = useMemo(() => {
    if (!ebayRequiredPreview || !edited.ebay) return null;
    const pf = edited.ebay.platform_fields ?? {};
    // Mêmes correspondances que la garde du publish + Modèle/Capacité de
    // stockage (remplis par ebay.js depuis les champs High-Tech). `key` =
    // champ de platform_fields où écrit le sélecteur de l'encart (état
    // "invalid"). `send` = valeur telle que l'EXTENSION l'enverra (ebay.js
    // strip « EU » sur la taille) — c'est ELLE qu'on valide contre la liste.
    // Labels des 4 champs partagés : EBAY_ASPECT_LABELS (constante module,
    // partagée avec la garde data-driven du bloc rouge — une seule source).
    const sources = [
      { key: "marque",   labels: EBAY_ASPECT_LABELS.marque, get: () => pf.marque },
      { key: "taille",   labels: EBAY_ASPECT_LABELS.taille, get: () => pf.taille, send: v => String(v).replace(/^EU\s*/i, "") },
      { key: "couleur",  labels: EBAY_ASPECT_LABELS.couleur, get: () => pf.colors?.[0] || pf.couleur },
      { key: "matiere",  labels: EBAY_ASPECT_LABELS.matiere, get: () => pf.matiere },
      { key: "modele",   labels: ["Modèle"], get: () => pf.modele },
      { key: "stockage", labels: ["Capacité de stockage"], get: () => pf.stockage },
    ];
    // PLUS AUCUNE exception « supposé pré-rempli » (2026-07-19 soir).
    // Historique des trois retraits, même classe de bug à chaque fois (un
    // pré-remplissage observé sur UNE catégorie généralisé à tort) :
    // ⚠️ « Style » RETIRÉ le 2026-07-17 : c'est un aspect ITEM-SPECIFIC
    // (Casual/Cocktail/Bohème…) qu'eBay NE pré-remplit PAS — constaté VIDE sur
    // le vrai formulaire Robes (cat. 63861). Le marquer « prefilled » le
    // laissait passer VIDE en silence (trou du filet). Désormais traité comme
    // les autres obligatoires sans source : resolve_aspects tente de l'extraire
    // du contexte, sinon saisie manuelle obligatoire (CTA bloqué tant que vide).
    // ⚠️ « Type » RETIRÉ le 2026-07-19 (cas réel Medik8, cat. 21205) : comme
    // « Style » avant lui (17/07), eBay ne le pré-remplit que sur CERTAINES
    // catégories (consoles, baskets — dérivé de la catégorie) et le laisse
    // VIDE sur d'autres (beauté : options Hydratation/Masque hydratant…
    // constatées vides sur le formulaire LIVE, publication bloquée par la
    // gate extension). Désormais résolu par resolve_aspects, sinon saisie
    // manuelle (select : allowedValues du référentiel). Si eBay le pré-remplit
    // réellement, l'extension conserve la valeur existante (jamais réécrite).
    // ⚠️ « Département » RETIRÉ le 2026-07-19 soir (cas réel montre Casio,
    // cat. 31387) : les pills pré-actives n'existent que sur les rayons
    // vêtements/chaussures — sur Montres, la ligne est un dropdown standard
    // resté VIDE (dump du job abc33090), gate extension bloquante alors que
    // genre="Homme" était sur le job. Désormais dérivé DÉTERMINISTE du genre
    // (EBAY_DEPARTMENT_BY_GENRE, libellé exact de la catégorie), sinon IA,
    // sinon saisie manuelle — et l'extension conserve toujours une valeur
    // réellement pré-remplie par eBay (jamais réécrite).
    const PREFILLED_BY_EBAY = [];
    return ebayRequiredPreview.map(({ name, allowedValues, mode }) => {
      const src = sources.find(s => s.labels.includes(name));
      const srcVal = src ? String(src.get() ?? "").trim() : "";
      if (srcVal) {
        // Champ dédié REMPLI : validé ici contre la liste fermée de la
        // catégorie (même critère que la garde du publish). Hors liste →
        // state "invalid" : le chip passe ✗ et l'encart ouvre un vrai
        // sélecteur (cas réel 18/07 : Taille "Unique" ≠ « Taille unique »,
        // casquette 52365 — champ texte + message d'erreur = impasse).
        // `suggested` = valeur de la liste la plus proche, auto-appliquée
        // par l'effet ci-dessous au step Publier.
        const sendVal = src.send ? String(src.send(srcVal)).trim() : srcVal;
        if (isEbayClosedList(allowedValues, mode) &&
            !allowedValues.some(v => normAspectVal(v) === normAspectVal(sendVal))) {
          return {
            name, state: "invalid", sharedKey: src.key, value: srcVal,
            suggested: nearestAllowedValue(sendVal, allowedValues),
            allowedValues, mode,
          };
        }
        return { name, state: "ok", allowedValues, mode };
      }
      const generic = String(pf.ebayAspects?.[name] ?? "").trim();
      // source:"generic" : valeur venue de resolve_aspects/du fallback UI —
      // reste ÉDITABLE dans l'encart (contrairement aux champs dédiés).
      if (generic) return { name, state: "ok", source: "generic", value: generic, allowedValues, mode };
      if (PREFILLED_BY_EBAY.includes(name)) return { name, state: "prefilled", allowedValues, mode };
      // sharedKey aussi en "missing" (2026-07-18, bug Couleur en double) : sans
      // lui, le sélecteur de l'encart écrivait pf.ebayAspects["Couleur"] alors
      // que le bloc rouge et la garde lisent pf.couleur/canonique — remplir le
      // select eBay ne satisfaisait jamais le bloc rouge (double-saisie, et
      // deux valeurs divergentes possibles au publish).
      return { name, state: "missing", value: "", sharedKey: src?.key, allowedValues, mode };
    });
  }, [ebayRequiredPreview, edited]);

  // Défauts DÉTERMINISTES (Phase 1, 2026-07-16) : dès que les obligatoires de
  // la catégorie sont connus, on pose les valeurs standard eBay SÛRES
  // (EBAY_ASPECT_DEFAULTS, ex. MPN → « Ne s'applique pas ») dans pf.ebayAspects
  // — instantané, sans appel IA, donc jamais bloqué par un échec Haiku. Les
  // chips passent ✓ tout de suite ; la valeur reste écrasable dans le fallback
  // UI. Jamais d'écrasement d'une source existante. Une pose par catégorie.
  const aspectDefaultsFor = useRef(null);
  useEffect(() => {
    if (!ebayRequiredStatus || !ebayPreviewCategoryId) return;
    // Clé composite catégorie|genre (2026-07-19) : le Département dérive du
    // genre — un genre posé ou corrigé APRÈS la première passe doit rejouer
    // la pose (une passe par (catégorie, genre), toujours pas de boucle).
    // Genre EFFECTIF (2026-07-19 soir, job casquette 47917f97) : même repli
    // que ebayPreviewCategoryId — si l'encart s'est monté grâce au genre
    // d'une copie sœur, le Département doit dériver du MÊME genre, sinon il
    // resterait « manquant » (bloquant) alors que l'autoGenre de l'insert
    // posera ce genre sur le job.
    const genrePropre = String(edited.ebay?.platform_fields?.genre ?? "").trim();
    const genreCle = genrePropre && genrePropre !== "Mixte" ? genrePropre : String(ebayGenreFallback() ?? "").trim();
    const passeCle = `${ebayPreviewCategoryId}|${genreCle}`;
    if (aspectDefaultsFor.current === passeCle) return;
    const pfAspects = edited.ebay?.platform_fields?.ebayAspects ?? {};
    const toSet = {};
    for (const a of ebayRequiredStatus) {
      const def = EBAY_ASPECT_DEFAULTS[a.name];
      if (def && a.state === "missing" && !String(pfAspects[a.name] ?? "").trim()) toSet[a.name] = def;
      // Département ← genre de la copie eBay (2026-07-19, montre Casio) :
      // déterministe comme les défauts ci-dessus, mais dérivé d'une DONNÉE du
      // job — seul un candidat PRÉSENT dans la liste de la catégorie est posé
      // (libellés variables : « Adulte unisexe » vs « Unisexe » vs
      // « Adulte »…). Genre absent ou aucun candidat → reste "missing" :
      // resolve_aspects puis saisie manuelle, comme Type/Style.
      if (a.name === "Département" && a.state === "missing" && !String(pfAspects[a.name] ?? "").trim()) {
        // genreCle = genre effectif (copie eBay, sinon repli copies sœurs) —
        // cf. son calcul plus haut, aligné sur ebayPreviewCategoryId.
        const candidats = EBAY_DEPARTMENT_BY_GENRE[genreCle] ?? [];
        const libelle = candidats.find(c =>
          (a.allowedValues ?? []).some(v => normAspectVal(v) === normAspectVal(c)));
        if (libelle) toSet[a.name] = libelle;
      }
    }
    aspectDefaultsFor.current = passeCle;
    if (!Object.keys(toSet).length) return;
    setEdited(prev => prev.ebay ? {
      ...prev,
      ebay: {
        ...prev.ebay,
        platform_fields: {
          ...prev.ebay.platform_fields,
          ebayAspects: { ...(prev.ebay.platform_fields?.ebayAspects ?? {}), ...toSet },
        },
      },
    } : prev);
  }, [ebayRequiredStatus, ebayPreviewCategoryId, edited]);

  // Pré-sélection auto (2026-07-18) : au step Publier, une valeur dédiée hors
  // liste avec un rapprochement sûr est remplacée d'office par le libellé eBay
  // exact (« Unique » → « Taille unique ») — le chip repasse ✓ sans action de
  // l'utilisateur. Gaté sur step===3 pour ne jamais réécrire un champ en cours
  // de frappe au step d'édition ; s'éteint de lui-même dès l'écriture (la
  // valeur entre dans la liste → plus d'état "invalid").
  useEffect(() => {
    if (step !== 3 || !ebayRequiredStatus) return;
    for (const a of ebayRequiredStatus) {
      if (a.state === "invalid" && a.sharedKey && a.suggested) setEbaySharedField(a.sharedKey, a.suggested);
    }
  }, [step, ebayRequiredStatus]);

  // Écrit un champ DÉDIÉ d'une copie Vinted/LBC/Beebs depuis le sélecteur de
  // l'encart générique (state "invalid", 2026-07-19 — cas réel Medik8 : Vinted
  // Beauté n'accepte qu'un État « Neuf avec étiquette », la valeur canonique
  // « Très bon état » ne peut pas matcher). Même philosophie que
  // setEbaySharedField : le libellé choisi est propre à CETTE plateforme — on
  // n'écrit que sa copie et on casse le lien partagé pour cette clé (les
  // autres copies gardent la canonique).
  function setPlatformDedicatedField(gp, pfKey, value) {
    setEdited(prev => {
      if (!prev[gp]) return prev;
      const pf = { ...prev[gp].platform_fields };
      if (pfKey === "couleur") {
        // Les gates et handlers lisent colors[0] AVANT couleur : écrire les deux.
        pf.couleur = value;
        if (Array.isArray(pf.colors) && pf.colors.length) pf.colors = [value, ...pf.colors.slice(1)];
      } else {
        pf[pfKey] = value;
      }
      return { ...prev, [gp]: { ...prev[gp], platform_fields: pf } };
    });
    noteSharedOverride(gp, pfKey); // clés hors SHARED_FIELD_KEYS (etat, format_colis…) : no-op
  }

  // Résolution IA ciblée des obligatoires SANS source (2026-07-16, même
  // philosophie que resolve_genre : micro-appel jamais bloquant, null si non
  // déductible). Une seule tentative par catégorie — les aspects toujours
  // manquants après ce passage relèvent du fallback UI (Phase 3), jamais
  // d'une valeur devinée. Les aspects à défaut déterministe (MPN…) sont
  // EXCLUS : ils sont déjà posés par l'effet ci-dessus, pas de tokens gâchés.
  const aspectsResolvedFor = useRef(null);
  useEffect(() => {
    const missing = (ebayRequiredStatus ?? [])
      .filter(a => a.state === "missing" && !EBAY_ASPECT_DEFAULTS[a.name])
      .map(a => a.name);
    if (!missing.length || !ebayPreviewCategoryId) return;
    if (aspectsResolvedFor.current === ebayPreviewCategoryId) return;
    aspectsResolvedFor.current = ebayPreviewCategoryId;
    (async () => {
      try {
        // allowedValues déjà portées par la preview (même fetch) : pas de
        // relecture de la table.
        const details = (ebayRequiredStatus ?? [])
          .filter(a => missing.includes(a.name))
          .map(a => ({ name: a.name, allowedValues: (a.allowedValues ?? []).slice(0, 60) }));
        if (!details.length) return;
        const src = edited.ebay ?? {};
        const { data: res } = await supabase.functions.invoke("generate-listing", {
          body: {
            resolve_aspects: true,
            aspects: details,
            item_data: {
              titre:       src.title || initialListing?.titre || "",
              marque:      src.platform_fields?.marque || initialListing?.marque || null,
              // Contexte enrichi (Phase 1) : modèle/matière/couleur aident
              // l'IA à extraire les obligatoires extractibles (Nom de parfum
              // souvent = modèle, Volume/Taille d'écran dans le titre…).
              modele:      src.platform_fields?.modele || initialListing?.modele || null,
              matiere:     src.platform_fields?.matiere || initialListing?.matiere || null,
              couleur:     src.platform_fields?.colors?.[0] || src.platform_fields?.couleur || initialListing?.couleur || null,
              description: src.description || initialListing?.description || null,
              type:        initialListing?.categorie || null,
              // attributs_visibles de lens-analysis (Phase 2) — null tant
              // que la fonction n'est pas redéployée (deploy gated).
              attributs:   initialListing?.attributs_visibles ?? null,
            },
          },
        });
        const values = res?.aspects && typeof res.aspects === "object" ? res.aspects : {};
        const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) =>
          missing.includes(k) && typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null"));
        if (!Object.keys(clean).length) return;
        setEdited(prev => prev.ebay ? {
          ...prev,
          ebay: {
            ...prev.ebay,
            platform_fields: {
              ...prev.ebay.platform_fields,
              ebayAspects: { ...(prev.ebay.platform_fields?.ebayAspects ?? {}), ...clean },
            },
          },
        } : prev);
      } catch { /* micro-appel de secours : jamais bloquant */ }
    })();
  }, [ebayRequiredStatus, ebayPreviewCategoryId, edited, initialListing]);

  // ── Requis Vinted/LBC/Beebs AVANT publication (chantier 1.A, 2026-07-16) ──
  // Même philosophie que le bloc eBay ci-dessus, mais la source est le
  // catalogue CUMULATIF platform_category_aspects, appris par la découverte
  // réactive de l'extension (config attributes Vinted, énumérations DOM
  // Beebs/LBC, refus serveur). Catalogue vide pour une catégorie → aucun
  // encart, aucun blocage : le gate pré-clic de l'extension reste le plancher,
  // et sa découverte remplira le catalogue pour la fois suivante.
  const genericCategoryKeys = useMemo(() => {
    const keys = {};
    for (const platform of ["vinted", "leboncoin", "beebs"]) {
      if (!selected.has(platform) || !edited[platform]) continue;
      const pf = edited[platform].platform_fields ?? {};
      const icon = resolveArticleIcon({ initialListing, edited, pf });
      let path = null;
      if (platform === "vinted") path = getVintedCategoryPath(icon, pf.genre);
      if (platform === "leboncoin") path = getLbcCategoryPath(icon);
      if (platform === "beebs") path = getBeebsCategoryPath(icon, pf.genre);
      // MÊME clé que categoryKeyOf de l'extension (background.js) : chemin
      // joint par " > " — c'est elle qui écrit, nous qui lisons.
      if (Array.isArray(path) && path.length) keys[platform] = path.join(" > ");
    }
    return keys;
  }, [selected, edited, initialListing]);

  // ⚠️ DÉPENDANCE PAR SIGNATURE, PAS PAR IDENTITÉ (fix boucle 2026-07-16) :
  // genericCategoryKeys est un OBJET recalculé à chaque rendu (useMemo sur
  // [selected, edited, initialListing] — edited/initialListing changent
  // d'identité au fil des rendus du stepper). Dépendre de l'objet faisait
  // re-tirer l'effet en boucle → setGenericAspectsCatalog → re-rendu →
  // nouvelle identité → … (72+ requêtes/s vers Supabase, constaté en prod le
  // 2026-07-16 sur l'étape Publier). La signature JSON est stable PAR VALEUR :
  // l'effet ne se redéclenche que si les catégories résolues CHANGENT
  // réellement. Le contraste avec les effets eBay (qui ne bouclaient pas) tient
  // à leur dépendance à ebayPreviewCategoryId, une valeur primitive.
  const genericCategoryKeysSig = JSON.stringify(genericCategoryKeys);
  useEffect(() => {
    const entries = Object.entries(JSON.parse(genericCategoryKeysSig));
    // Garde d'égalité de contenu : ne jamais reposer un {} d'identité neuve si
    // déjà vide — sinon genericRequiredStatus (dérivé) churne les consommateurs.
    if (!entries.length) { setGenericAspectsCatalog(prev => (Object.keys(prev).length ? {} : prev)); return; }
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(entries.map(async ([platform, key]) => {
          const { data } = await supabase
            .from("platform_category_aspects")
            .select("field_key, field_label, required, input_type, allowed_values")
            .eq("platform", platform)
            .eq("category_key", key)
            .eq("required", true);
          let rows = data ?? [];

          // ── Repli d'options intra-plateforme (Vinted) — fix « Espace de
          // stockage » en texte libre (2026-07-18) ──────────────────────────
          // Un requis appris par REFUS SERVEUR (source server_400) porte
          // required=true mais AUCUNE option (allowed_values null) : le refus
          // 400 ne renseigne que le nom du champ. AspectValueInput rendait alors
          // un champ TEXTE LIBRE. Or la MÊME clé Vinted (field_key = code
          // d'attribut serveur, GLOBAL chez Vinted) est souvent relevée AVEC ses
          // options dans une autre catégorie — ex. internal_memory_capacity
          // (« Espace de stockage ») : vide en Téléphones portables, complet en
          // Tablettes. On emprunte donc la liste la plus fournie de la même clé.
          // Scopé à VINTED : là field_key est un id d'attribut serveur cohérent
          // d'une catégorie à l'autre. On NE fait PAS ça pour LBC/Beebs, dont le
          // naming de champ dépend de la catégorie (emprunt = fausses options).
          if (platform === "vinted") {
            const hasOpts = (r) => Array.isArray(r.allowed_values) && r.allowed_values.length > 0;
            const missingKeys = rows.filter((r) => !hasOpts(r)).map((r) => r.field_key);
            if (missingKeys.length) {
              const { data: sib } = await supabase
                .from("platform_category_aspects")
                .select("field_key, allowed_values")
                .eq("platform", "vinted")
                .in("field_key", missingKeys)
                .not("allowed_values", "is", null);
              const best = {};
              for (const s of sib ?? []) {
                const vals = Array.isArray(s.allowed_values) ? s.allowed_values : [];
                if (vals.length > (best[s.field_key]?.length ?? 0)) best[s.field_key] = vals;
              }
              rows = rows.map((r) =>
                !hasOpts(r) && best[r.field_key] ? { ...r, allowed_values: best[r.field_key] } : r
              );
            }
          }
          return [platform, rows];
        }));
        if (!alive) return;
        const next = Object.fromEntries(results.filter(([, rows]) => rows.length));
        setGenericAspectsCatalog(prev =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      } catch { if (alive) setGenericAspectsCatalog(prev => (Object.keys(prev).length ? {} : prev)); }
    })();
    return () => { alive = false; };
  }, [genericCategoryKeysSig]);

  // Valeur déjà portée par un champ dédié de l'app pour un requis du
  // catalogue — mêmes correspondances que ce que les content scripts posent
  // réellement (clés Vinted = codes serveur, LBC = attribut for= des labels,
  // Beebs = libellés exacts).
  const genericKnownSource = (platform, key, pf) => {
    if (platform === "vinted") {
      if (key === "brand") return pf.marque;
      if (key === "model") return pf.modele;
      if (key === "internal_memory_capacity") return pf.stockage;
      if (key === "condition") return pf.etat;
      if (key === "color") return pf.colors?.[0] || pf.couleur;
      if (key === "size") return pf.taille;
      if (key === "material") return pf.matiere;
      return null;
    }
    if (platform === "leboncoin") {
      if (/_brand$/.test(key)) return pf.marque;
      if (key === "condition" || /_condition$/.test(key)) return pf.etat;
      if (/_size$/.test(key) || key === "clothing_st" || key === "baby_age") return pf.taille;
      if (/_material$/.test(key)) return pf.matiere;
      // ⚠️ Naming LBC trompeur (relevé DOM 2026-07-17) : clothing_type et
      // shoe_type sont le champ « Univers* » (Femme/Homme/Enfant) — le « Type »
      // réel est clothing_category/shoe_category. Sans ces cas, le pattern
      // générique /_type$/ les routait sur lbcProduit (jamais posé pour la
      // mode) → fausse saisie manuelle de l'Univers à chaque vêtement.
      if (key === "clothing_type" || key === "shoe_type") return pf.univers || pf.genre;
      // house_and_garden_type = « Univers* » de Maison & Jardin (Décoration
      // d'intérieur/extérieur…) — ce n'est NI le genre NI un produit : aucune
      // source app fiable → null explicite (résolution IA puis saisie manuelle),
      // surtout pas lbcProduit qui poserait une valeur FAUSSE silencieuse.
      if (key === "house_and_garden_type") return null;
      if (/_univers$|_universe$/.test(key)) return pf.univers || pf.genre;
      if (/_type$/.test(key) || /_product$/.test(key) || key === "baby_clothing_category" || key === "clothing_category") return pf.lbcProduit;
      return null;
    }
    if (platform === "beebs") {
      if (key === "Marque") return pf.marque;
      if (key === "Pointure" || key === "Taille") return pf.taille;
      if (key === "État") return pf.etat;
      if (key === "Matière") return pf.matiere;
      if (key === "Couleur") return pf.colors?.[0] || pf.couleur;
      if (key === "Âge") return pf.age;
      // Format canonique partagé avec LBC (Lettre/Petit colis/…) — beebs.js le
      // mappe sur les paliers de poids Beebs à la pose (2026-07-19).
      if (key === "Format du colis") return pf.format_colis;
      return null;
    }
    return null;
  };
  // Champs posés automatiquement (défaut extension ou pré-remplissage
  // plateforme) : affichés « rempli automatiquement », jamais bloquants.
  //   sim_lock : défaut « Non » posé par vinted.js (sémantique prouvée 13/07)
  //   package_size_id : « Petit » forcé sur la Mode par vinted.js
  //   quantity : défaut 1 posé par leboncoin.js
  // ⚠️ « Format du colis » Beebs : retiré le 2026-07-19 matin (le
  // pré-remplissage PLATEFORME supposé le 16/07 ne vaut que sur certaines
  // catégories — constaté VIDE en live sur « Hygiène et beauté »), puis
  // RÉTABLI le soir même à un autre titre : c'est désormais BEEBS.JS qui le
  // pose pour TOUTE catégorie (mapping canonique→palier de poids + défaut
  // prudent 1 kg, cf. BEEBS_PACKAGE_BY_FORMAT), exactement la sémantique de
  // cette liste (« défaut extension », comme sim_lock/quantity). Sans cette
  // entrée, les 15 catégories du catalogue qui l'exigent (relevé
  // platform_category_aspects du 19/07 : Mode, Jouets, Puériculture… — PAS
  // seulement la beauté, et toutes SANS allowed_values) affichaient un requis
  // « manquant » en SAISIE TEXTE LIBRE et bloquaient le CTA — interdit par la
  // règle produit « aucun obligatoire en texte libre ». Une valeur posée
  // (format_colis de la copie, ou choix utilisateur) reste prioritaire :
  // genericKnownSource est lu AVANT ce filet.
  const GENERIC_PREFILLED = {
    vinted: ["sim_lock", "package_size_id"],
    leboncoin: ["quantity"],
    beebs: ["Format du colis"],
  };

  // Champ platform_fields DÉDIÉ visé par le sélecteur d'un state "invalid" —
  // parallèle EXACT de genericKnownSource (les deux évoluent ensemble).
  const genericDedicatedTarget = (platform, key) => {
    if (platform === "vinted") {
      return { brand: "marque", model: "modele", internal_memory_capacity: "stockage", condition: "etat", color: "couleur", size: "taille", material: "matiere" }[key] ?? null;
    }
    if (platform === "leboncoin") {
      if (/_brand$/.test(key)) return "marque";
      if (key === "condition" || /_condition$/.test(key)) return "etat";
      if (/_size$/.test(key) || key === "clothing_st" || key === "baby_age") return "taille";
      if (/_material$/.test(key)) return "matiere";
      if (key === "clothing_type" || key === "shoe_type" || /_univers$|_universe$/.test(key)) return "univers";
      if (/_type$/.test(key) || /_product$/.test(key) || key === "baby_clothing_category" || key === "clothing_category") return "lbcProduit";
      return null;
    }
    if (platform === "beebs") {
      return { "Marque": "marque", "Pointure": "taille", "Taille": "taille", "État": "etat", "Matière": "matiere", "Couleur": "couleur", "Âge": "age", "Format du colis": "format_colis" }[key] ?? null;
    }
    return null;
  };

  const genericRequiredStatus = useMemo(() => {
    const out = {};
    for (const [platform, rows] of Object.entries(genericAspectsCatalog)) {
      if (!selected.has(platform) || !edited[platform]) continue;
      const pf = edited[platform].platform_fields ?? {};
      const aspects = pf[GENERIC_ASPECTS_PF_KEY[platform]] ?? {};
      const status = rows.map((r) => {
        const key = r.field_key;
        const label = r.field_label || key;
        const allowedValues = Array.isArray(r.allowed_values) ? r.allowed_values.slice(0, 1000) : [];
        // « title » (appris par un 400 serveur sur Montres homme Vinted) : le
        // job porte TOUJOURS un titre (edited[platform].title, édité au step
        // Génération et posé tel quel à l'insert) — ce n'est jamais un requis
        // à saisir ici. Sans ce cas, aucune source ne le servait
        // (genericKnownSource ne connaît pas title) → « manquant » en texte
        // libre et CTA bloqué à tort, à chaque publication de la catégorie.
        if (key === "title") return { key, label, state: "ok", value: edited[platform]?.title ?? "", allowedValues };
        const src = String(genericKnownSource(platform, key, pf) ?? "").trim();
        if (src) {
          // Valeur DÉDIÉE validée contre la liste fermée du catalogue quand
          // on en a une (2026-07-19, cas réel Medik8 : Vinted Beauté n'accepte
          // qu'un État « Neuf avec étiquette » — « Très bon état » partait
          // quand même et l'extension gate-ait après coup, en boucle). Même
          // sémantique que le bloc eBay : state "invalid" + vrai sélecteur +
          // rapprochement auto. Les lignes SANS allowed_values (découvertes
          // DOM, listes partielles) ne bloquent jamais : présence = ok, comme
          // avant — on ne refuse une valeur que contre une liste qu'on a.
          const target = genericDedicatedTarget(platform, key);
          if (target && allowedValues.length && allowedValues.length <= EBAY_CLOSED_LIST_MAX &&
              !allowedValues.some(v => normAspectVal(v) === normAspectVal(src))) {
            return {
              key, label, state: "invalid", value: src,
              dedicatedTarget: target,
              suggested: nearestAllowedValue(src, allowedValues),
              allowedValues,
            };
          }
          return { key, label, state: "ok", allowedValues };
        }
        const generic = String(aspects[key] ?? "").trim();
        if (generic) return { key, label, state: "ok", source: "generic", value: generic, allowedValues };
        if (GENERIC_PREFILLED[platform]?.includes(key)) return { key, label, state: "prefilled", allowedValues };
        // dedicatedTarget aussi sur les "missing" (2026-07-19) : la
        // confirmation valeur-unique doit écrire le champ DÉDIÉ (etat…) que
        // lit l'extension — le canal générique est ignoré pour les clés déjà
        // servies par un mapping dédié (handledForKeys/handledLabels).
        return { key, label, state: "missing", value: "", allowedValues, dedicatedTarget: genericDedicatedTarget(platform, key) };
      });
      if (status.length) out[platform] = status;
    }
    return Object.keys(out).length ? out : null;
  }, [genericAspectsCatalog, selected, edited]);

  // Pré-sélection auto générique — miroir exact de l'effet eBay (plus haut) :
  // au step Publier, une valeur dédiée hors liste avec un rapprochement sûr
  // est remplacée d'office par le libellé exact de la plateforme ; sans
  // rapprochement (« Très bon état » vs « Neuf avec étiquette » : aucun token
  // commun), l'utilisateur choisit dans le sélecteur de l'encart.
  // ⚠️ PLACÉ APRÈS la déclaration de genericRequiredStatus (const useMemo) :
  // référencé dans les deps, il vit dans la TDZ tant que le useMemo n'a pas
  // été exécuté — placé avant, chaque rendu crashait en « Cannot access
  // before initialization » (écran blanc prod du 2026-07-19, hotfix).
  useEffect(() => {
    if (step !== 3 || !genericRequiredStatus) return;
    for (const [gp, list] of Object.entries(genericRequiredStatus)) {
      for (const a of list) {
        // Liste à valeur UNIQUE exclue du rapprochement silencieux
        // (2026-07-19) : ce cas passe par la confirmation explicite du bloc
        // générique (« Cette catégorie n'accepte que… — Oui, confirmer / Non,
        // décocher cette plateforme ») — poser la valeur sans demander
        // reviendrait à décider à la place de l'utilisateur qu'un sérum
        // entamé est « Neuf avec étiquette ».
        if (a.state === "invalid" && a.dedicatedTarget && a.suggested &&
            (a.allowedValues?.length ?? 0) > 1) {
          setPlatformDedicatedField(gp, a.dedicatedTarget, a.suggested);
        }
      }
    }
  }, [step, genericRequiredStatus]);

  // Résolution IA ciblée des requis génériques SANS source (chantier 1.A) —
  // même micro-appel resolve_aspects que le bloc eBay : extraction depuis le
  // contexte (titre/description/modèle...), jamais deviné, null si non
  // déductible → le champ reste en saisie manuelle. Une tentative par
  // plateforme × catégorie. Cas cible : RAM/stockage d'un PC portable
  // présents dans le titre, plateforme d'une console (« Nintendo Switch »).
  const genericResolvedFor = useRef({});
  useEffect(() => {
    for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
      const catKey = genericCategoryKeys[gp];
      if (!catKey || genericResolvedFor.current[gp] === catKey) continue;
      // Valeur catalogue unique exclue (2026-07-19) : réservée à la
      // confirmation explicite du bloc générique, jamais posée par l'IA.
      const missing = list.filter(a => a.state === "missing" && (a.allowedValues?.length ?? 0) !== 1);
      if (!missing.length) continue;
      genericResolvedFor.current[gp] = catKey;
      (async () => {
        try {
          const details = missing.map(a => ({ name: a.label, allowedValues: (a.allowedValues ?? []).slice(0, 60) }));
          const src = edited[gp] ?? {};
          const { data: res } = await supabase.functions.invoke("generate-listing", {
            body: {
              resolve_aspects: true,
              aspects: details,
              item_data: {
                titre:       src.title || initialListing?.titre || "",
                marque:      src.platform_fields?.marque || initialListing?.marque || null,
                modele:      src.platform_fields?.modele || initialListing?.modele || null,
                matiere:     src.platform_fields?.matiere || initialListing?.matiere || null,
                couleur:     src.platform_fields?.colors?.[0] || src.platform_fields?.couleur || initialListing?.couleur || null,
                description: src.description || initialListing?.description || null,
                type:        initialListing?.categorie || null,
                attributs:   initialListing?.attributs_visibles ?? null,
              },
            },
          });
          const values = res?.aspects && typeof res.aspects === "object" ? res.aspects : {};
          // resolve_aspects répond par LIBELLÉ ; le canal générique écrit par
          // CLÉ plateforme (code serveur / for= / libellé Beebs) — mappage
          // retour label → key.
          const keyOfLabel = Object.fromEntries(missing.map(a => [a.label, a.key]));
          for (const [label, v] of Object.entries(values)) {
            const key = keyOfLabel[label];
            const s = typeof v === "string" ? v.trim() : "";
            if (key && s && s.toLowerCase() !== "null") setPlatformAspect(gp, key, s);
          }
        } catch { /* micro-appel de secours : jamais bloquant */ }
      })();
    }
    // Deps par SIGNATURE (fix boucle 2026-07-16) : jamais l'objet
    // genericCategoryKeys/edited/initialListing (identités instables). La garde
    // genericResolvedFor borne déjà à une tentative par (plateforme, catégorie).
  }, [genericRequiredStatus, genericCategoryKeysSig]);

  // Saisie manuelle d'un requis Vinted/LBC/Beebs — écrit dans le canal
  // générique de la copie plateforme (pf.vintedAspects / lbcAspects /
  // beebsAspects), consommé tel quel par le content script.
  function setPlatformAspect(platform, key, value) {
    const pfKey = GENERIC_ASPECTS_PF_KEY[platform];
    if (!pfKey) return;
    setEdited(prev => prev[platform] ? {
      ...prev,
      [platform]: {
        ...prev[platform],
        platform_fields: {
          ...prev[platform].platform_fields,
          [pfKey]: { ...(prev[platform].platform_fields?.[pfKey] ?? {}), [key]: value },
        },
      },
    } : prev);
  }

  // ── Publication ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    // Garde-fou prix (2026-07-13, job 3d194668) : un job price=NULL a atteint
    // la base via « Republier » et n'a été refusé qu'en bout de chaîne, par
    // Vinted. AUCUN flux ne doit pouvoir publier sans prix valide — seuil à
    // 1 €, le minimum Vinted (le plus strict des quatre plateformes).
    const prixNum = Number(price);
    if (price == null || String(price).trim() === "" || !Number.isFinite(prixNum) || prixNum < 1) {
      setPublishError(t("stepPublishPriceMissing"));
      return;
    }
    setPublishing(true);
    setPublishError("");
    try {
      // ── Filet champs partagés (Sujet 4) : l'encart inline de StepPublish
      // est le chemin nominal, ce re-check attrape un état périmé ou une
      // course — même règle SHARED_GUARD, avant tout effet de bord.
      if (missingSharedFields.length) {
        const labels = {
          taille:  t("fieldSizeLabel"),
          couleur: t("fieldColorLabel"),
          matiere: t("fieldMaterialLabel"),
          marque:  t("fieldBrandLabel"),
        };
        throw new Error(tpl("stepPublishSharedFieldsMissing", {
          fields: missingSharedFields.map(k => labels[k]).join(", "),
        }));
      }

      // ── Garde générique Vinted/LBC/Beebs (chantier 1.A) : un requis du
      // catalogue encore vide bloque AVANT le débit/insert — même règle que
      // la garde eBay plus bas, l'encart de StepPublish est le chemin nominal
      // (CTA désactivé), ce re-check attrape un état périmé ou une course.
      for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
        const missing = list.filter(a => a.state === "missing").map(a => a.label);
        if (missing.length) {
          throw new Error(tpl("stepPublishGenericRequiredMissing", {
            platform: GENERIC_PLATFORM_LABELS[gp] ?? gp,
            fields: missing.join(", "),
          }));
        }
      }

      // Switch "Ajouter au stock" ON et article pas encore en stock : on le crée
      // maintenant, juste avant de générer les jobs de publication, pour que
      // cross_post_jobs.inventaire_id pointe vers la bonne ligne dès l'insert.
      let currentInvId = invId;
      if (addToStock && !currentInvId && createStockItem) {
        currentInvId = await createStockItem(prixAchatSaisi);
        if (!currentInvId) throw new Error(t("genericError"));
        setInvId(currentInvId);
      }

      // Adresse de remise (Settings) : lue une fois par publication, injectée
      // dans platform_fields.adresse. Absente → le job part quand même,
      // l'extension le remettra en pending avec un message explicite (jamais
      // de blocage dur, le brouillon LBC persiste). Beebs exige aussi une
      // adresse (autocomplete Google Places, relevé en session réelle
      // 2026-07-08, cf. content-scripts/beebs.js) mais n'a pas de réglage
      // dédié dans l'app — on réutilise la même adresse d'expédition que
      // Leboncoin plutôt que dupliquer un champ Settings pour une seule
      // valeur physique identique.
      let lbcAddress = null;
      if (selected.has("leboncoin") || selected.has("beebs")) {
        const { data: prof } = await supabase.from("profiles")
          .select("platform_settings").eq("id", userId).maybeSingle();
        lbcAddress = prof?.platform_settings?.leboncoin?.adresse || null;
      }

      // ── Auto-résolution du genre (2026-07-09) — remplace le blocage dur ──
      // generate-listing n'est pas déterministe : sur le même article, 4
      // générations consécutives ont donné genre="Homme" puis une "Mixte"
      // (Patagonia P-6, vérifié en DB). L'ancien bandeau rouge
      // t("vintedGenreRequired") bloquait alors TOUTE la publication
      // multi-plateforme jusqu'à correction manuelle — à l'opposé de la
      // "publication automatique sans rien faire" promise au même écran.
      // Même famille de blocage côté Beebs : son arbre Mode est genré jusqu'aux
      // ACCESSOIRES (Montres vit sous Mode>Femme/Homme>Accessoires — vérifié),
      // donc une montre sans genre partait en failed à 100 % au pré-check de
      // l'extension (cas réel Casio du 2026-07-09), alors qu'eBay range déjà
      // ⌚/💍 hors rayons genrés. On tranche donc AUTOMATIQUEMENT, sans jamais
      // bloquer : genre déjà résolu sur une autre plateforme du même run
      // d'abord (cohérence, zéro appel), sinon relance IA ciblée du seul champ
      // genre (mode resolve_genre de generate-listing, prompt strict — jamais
      // Mixte), sinon défaut "Femme" (plus gros rayon Vinted/Beebs). Un genre
      // explicite (Femme/Homme/Enfant/…) n'est JAMAIS écrasé — seuls
      // vide/"Mixte" le sont, et l'utilisateur peut corriger dans les champs
      // plateforme avant de publier s'il n'est pas d'accord.
      const iconFor = (platform) => {
        const pf = edited[platform]?.platform_fields ?? {};
        return resolveArticleIcon({ initialListing, edited, pf });
      };
      const genreUnresolved = (platform) => {
        if (!selected.has(platform)) return false;
        const g = edited[platform]?.platform_fields?.genre ?? "";
        if (g && g !== "Mixte") return false; // choix explicite respecté
        const icon = iconFor(platform);
        if (platform === "vinted") return vintedGenreRequired(icon);
        // 🌸 + Mixte résout un vrai rayon eBay (Parfums mixtes) : pas touché.
        if (platform === "ebay") return ebayGenreRequired(icon) && !getEbayCategoryId(icon, g);
        if (platform === "beebs") return beebsGenreRequired(icon);
        return false;
      };
      let autoGenre = null;
      if (["vinted", "ebay", "beebs"].some(genreUnresolved)) {
        autoGenre = [
          edited.vinted?.platform_fields?.genre,
          edited.ebay?.platform_fields?.genre,
          edited.beebs?.platform_fields?.genre,
          edited.leboncoin?.platform_fields?.univers,
        ].find(g => g && g !== "Mixte" && g !== "Enfant") ?? null;
        if (!autoGenre) {
          const refP = ["vinted", "ebay", "beebs", "leboncoin"].find(p => edited[p]);
          try {
            const { data: gRes } = await supabase.functions.invoke("generate-listing", {
              body: {
                resolve_genre: true,
                item_data: {
                  titre:       edited[refP]?.title       || initialListing?.titre       || "",
                  marque:      initialListing?.marque      || null,
                  description: edited[refP]?.description || initialListing?.description || null,
                  type:        initialListing?.categorie   || null,
                },
              },
            });
            if (["Femme", "Homme", "Fille", "Garçon", "Bébé"].includes(gRes?.genre)) autoGenre = gRes.genre;
          } catch { /* IA indisponible : défaut ci-dessous */ }
        }
        if (!autoGenre) autoGenre = "Femme";
      }

      const rows = [...selected].map(platform => {
        const pf = { ...(edited[platform]?.platform_fields ?? {}) };
        // Dernier filet avant l'insert du job : un état vidé à la main (ou un
        // `edited` venant d'un chemin qui n'est pas passé par
        // mergeFieldsWithLens) ne part JAMAIS vide vers l'extension.
        for (const field of platformFieldsConfig[platform] ?? []) {
          if (isConditionKey(field.key) && !String(pf[field.key] ?? "").trim())
            pf[field.key] = defaultConditionFor(field);
        }
        if (platform === "leboncoin") {
          const icon = resolveArticleIcon({ initialListing, edited, pf });
          const lbcPath = getLbcCategoryPath(icon);
          if (lbcPath) pf.lbcCategoryPath = lbcPath;
          if (lbcAddress) pf.adresse = lbcAddress;
          // Famille > Équipement bébé : Univers* est FONCTIONNEL
          // (Alimentation/Mobilité/…) et Produit* en dépend — deux critères
          // bloquants indéductibles du genre (relevé campagne 2026-07-08).
          // On écrase l'univers genre (IA/stepper) par la valeur mappée
          // depuis l'icône, et on pose le Produit attendu par l'extension.
          const babyEquip = getLbcBabyEquipment(icon);
          if (babyEquip) {
            pf.univers = babyEquip.univers;
            pf.lbcProduit = babyEquip.produit;
          }
          // ── Vêtements/chaussures ENFANT (2026-07-15) — relevé DOM réel :
          // LBC a DEUX foyers de tailles enfant STRUCTURÉES (l'assertion
          // historique « pas de champ Taille côté LBC » était fausse) :
          //   - Famille > Vêtements bébé : Prématuré → 36 mois, Produit*
          //     OBLIGATOIRE — seule feuille à porter la grille 0-36 mois ;
          //   - Mode > Vêtements : grille enfant 3 → 18 ans SEULEMENT si
          //     Univers = Enfant/Fille/Garçon. Un Univers adulte poserait la
          //     grille ADULTE en silence (seul risque résiduel identifié par
          //     le relevé) → on FORCE l'Univers depuis le genre détecté.
          // Le genre vient de la copie LBC elle-même (univers IA), sinon des
          // copies sœurs du même run, sinon de l'auto-résolution.
          const childGenre = [
            pf.univers,
            edited.vinted?.platform_fields?.genre,
            edited.beebs?.platform_fields?.genre,
            edited.ebay?.platform_fields?.genre,
            autoGenre,
          ].find(g => isChildGenre(g)) ?? null;
          const sizeRoute = lbcChildSizeCategory(pf.taille); // "bebe" | "mode" | null
          const babyClothingProduct = getLbcBabyClothingProduct(icon);
          if (babyClothingProduct && lbcPath?.[0] === "Mode" &&
              (sizeRoute === "bebe" || (!sizeRoute && childGenre === "Bébé"))) {
            // Taille en mois (ou article Bébé sans taille exploitable) sur un
            // article d'habillement : la vraie feuille est Vêtements bébé.
            // Pas d'Univers sur cette feuille (relevé : Genre facultatif,
            // Produit*, Taille) — le filet Mixte ci-dessous ne s'applique pas.
            pf.lbcCategoryPath = ["Famille", "Vêtements bébé"];
            pf.lbcProduit = babyClothingProduct;
          } else if (childGenre && lbcPath?.[0] === "Mode") {
            // Fille/Garçon/Enfant sont des valeurs RÉELLES du dropdown
            // Univers (relevé 2026-07-15) ; « Bébé » n'y existe pas → Enfant
            // (cas chaussures/accessoires bébé restés sur le rayon Mode).
            pf.univers = childGenre === "Bébé" ? "Enfant" : childGenre;
          }
          // Univers obligatoire sur le rayon Mode LBC ("Veuillez choisir un
          // univers de vêtement"). Contrairement à Vinted, LBC a un rayon
          // Mixte → filet sans friction quand l'IA n'a pas tranché.
          if (!pf.univers && lbcPath?.[0] === "Mode" &&
              pf.lbcCategoryPath?.[1] !== "Vêtements bébé") pf.univers = "Mixte";
        }
        if (platform === "vinted") {
          // Chemin catalogue Vinted calculé à l'insert : icône objet (mêmes
          // règles que les tuiles Stock/Ventes) + genre IA/corrigé. null →
          // pas de categoryPath → l'extension marque le job "failed" avec un
          // message explicite (fallback volontaire, cf. vintedCategories.js).
          const icon = resolveArticleIcon({ initialListing, edited, pf });
          // Genre vide/Mixte sur une catégorie qui l'exige → genre auto-résolu
          // (cf. bloc autoGenre) : le job part avec un rayon réel au lieu
          // d'être condamné au fallback.
          if (autoGenre && vintedGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
          const categoryPath = getVintedCategoryPath(icon, pf.genre);
          if (categoryPath) pf.categoryPath = categoryPath;
          // Flag statique lu par l'extension : permet un message d'échec
          // précis ("genre requis") quand un job sans categoryPath vient d'un
          // article de mode plutôt que d'une icône hors mapping.
          if (vintedGenreRequired(icon)) pf.vintedGenreRequired = true;
          // L'extension consomme `colors` (tableau, 2 max côté Vinted).
          // `couleur` (IA ou édité) peut être composé ("Marine et Blanc") :
          // mêmes séparateurs que la cascade extension, la dominante d'abord.
          if (pf.couleur) {
            const colors = String(pf.couleur)
              .split(/\s+et\s+|[,/&+]/i)
              .map(s => s.trim())
              .filter(Boolean)
              .slice(0, 2);
            if (colors.length) pf.colors = colors;
          }
        }
        if (platform === "ebay") {
          // Catégorie eBay posée à l'insert : categoryPath (libellés, pour
          // les messages d'erreur et la vérification post-navigation) ET
          // categoryId numérique (c'est LUI que l'extension met dans l'URL
          // /sl/list — le path ne sert jamais à naviguer). Genre : les
          // valeurs du stepper (Femme/Homme/Enfant) passent TELLES QUELLES
          // — eBay a un vrai rayon "Enfant : unisexe" (contrairement à
          // Vinted/Beebs) ; seul Mixte reste sans rayon (sauf 🌸 parfums).
          const icon = resolveArticleIcon({ initialListing, edited, pf });
          // Même auto-résolution que Vinted — sauf si le genre actuel résout
          // déjà un rayon (🌸+Mixte = Parfums mixtes, rayon réel).
          if (autoGenre && ebayGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")
              && !getEbayCategoryId(icon, pf.genre)) pf.genre = autoGenre;
          const categoryPath = getEbayCategoryPath(icon, pf.genre);
          const categoryId = getEbayCategoryId(icon, pf.genre);
          if (categoryPath) pf.ebayCategoryPath = categoryPath;
          if (categoryId) pf.ebayCategoryId = categoryId;
          if (ebayGenreRequired(icon)) pf.ebayGenreRequired = true;
          // Couleur : l'extension consomme colors[0] (les specifics eBay
          // Couleur sont mono-valeur) — même split que Vinted, dominante
          // d'abord.
          if (pf.couleur && !pf.colors) {
            const colors = String(pf.couleur)
              .split(/\s+et\s+|[,/&+]/i)
              .map(s => s.trim())
              .filter(Boolean)
              .slice(0, 2);
            if (colors.length) pf.colors = colors;
          }
        }
        if (platform === "beebs") {
          // Même contrat que Vinted/eBay : chemin catalogue calculé à
          // l'insert depuis l'icône objet + genre. beebsCategories.js gère
          // déjà lui-même le cas Enfant/Mixte/vide → null (genre Beebs a 5
          // valeurs Femme/Homme/Fille/Garçon/Bébé, pas de résolution
          // automatique depuis Enfant pour l'instant, cf. commentaire de
          // tête du fichier) — pas de blocage dur ici, comme eBay : le flag
          // beebsGenreRequired est posé pour que l'extension retourne un
          // needsUser explicite plutôt qu'un échec silencieux.
          const icon = resolveArticleIcon({ initialListing, edited, pf });
          // Même auto-résolution que Vinted/eBay. Indispensable ici : l'arbre
          // Mode Beebs est genré jusqu'aux accessoires (montres, bijoux,
          // sacs…) — sans genre, AUCUNE montre ne pouvait jamais partir
          // (pré-check extension → failed à 100 %, cas réel Casio 2026-07-09).
          if (autoGenre && beebsGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
          const categoryPath = getBeebsCategoryPath(icon, pf.genre);
          if (categoryPath) pf.beebsCategoryPath = categoryPath;
          if (beebsGenreRequired(icon)) pf.beebsGenreRequired = true;
          if (lbcAddress) pf.adresse = lbcAddress;
          // Format du colis (généralisation 2026-07-19 soir) : requis Beebs
          // sur des catégories de TOUT l'arbre (15 au catalogue : Mode,
          // Jouets, Puériculture, beauté…), mais le prompt Beebs de
          // generate-listing ne produit PAS format_colis — seule la copie LBC
          // le porte. On sème donc la valeur LBC quand la copie Beebs n'en a
          // pas : beebs.js la mappe sur ses paliers de poids
          // (BEEBS_PACKAGE_BY_FORMAT) et ne retombe sur le défaut prudent
          // 1 kg qu'à défaut de toute donnée.
          if (!String(pf.format_colis ?? "").trim()) {
            const lbcFormat = String(edited.leboncoin?.platform_fields?.format_colis ?? "").trim();
            if (lbcFormat) pf.format_colis = lbcFormat;
          }
        }
        // ── Tailles ENFANT (2026-07-15) : conversion canonique → libellé
        // EXACT de la plateforme (référentiel childSizes.js, relevé DOM réel
        // docs/sizes-baby-child-raw.txt). Les copies affichées gardent la
        // canonique (« 6 mois ») ; seul le JOB porte le libellé plateforme
        // (« 3-6 mois / 62 cm » Vinted, « 6 mois (60-66 cm) » Beebs…) pour
        // que les cascades des content scripts matchent en EXACT — la garde
        // anti-nombre-nu des scripts interdit désormais le fuzzy numérique
        // sur les champs taille. Placée APRÈS les blocs plateforme : le genre
        // auto-résolu (autoGenre) doit déjà être posé — les pointures ne
        // convertissent que sur genre enfant (« EU 38 » existe en adulte).
        // null (pas d'équivalent exact, ex. « 18 ans » hors LBC) → canonique
        // conservée : échec de cascade VISIBLE plutôt que taille fausse.
        if (pf.taille) {
          const converted = toPlatformChildSize(pf.taille, platform, {
            isChildGenre: isChildGenre(pf.genre) || isChildGenre(pf.univers),
          });
          if (converted) pf.taille = converted;
        }
        return {
          user_id:         userId,
          inventaire_id:   addToStock ? currentInvId : null,
          platform,
          status:          "pending",
          photo_option:    photoOption,
          title:           edited[platform]?.title           ?? "",
          description:     edited[platform]?.description     ?? "",
          price:           edited[platform]?.price           ?? price,
          photos:          processedPhotos,
          platform_fields: pf,
        };
      });
      // ── Aspects obligatoires eBay (2026-07-11, Phase 2 du référentiel) ──
      // ebay_item_aspects (peuplée depuis l'API Taxonomy, lecture ouverte à
      // authenticated) : le job eBay embarque les NOMS d'aspects
      // required=true de sa catégorie ; l'extension compare ce qu'elle a
      // réellement rempli contre cette liste.
      // ⚠️ DURCI le 2026-07-19 (trou (a) du principe « aucun requis connu
      // vide au submit ») : catégorie absente/en erreur au référentiel →
      // REFETCH Taxonomy à la volée (fetch-ebay-aspects, chemin utilisateur
      // borné à un id) ; toujours indisponible → publication BLOQUÉE (throw
      // → bandeau rouge), plus jamais un job sans liste — l'extension
      // n'aurait rien à comparer et cliquerait à l'aveugle. Le champ est
      // désormais TOUJOURS posé (même []) : sa présence vaut « référentiel
      // vérifié » pour le gate extension.
      const ebayRow = rows.find(r => r.platform === "ebay");
      // Objets complets {name, allowedValues, mode} gardés en LOCAL pour la
      // garde ci-dessous — jamais sur le job : la liste Marque fait ~19 000
      // entrées (relevé 15687), le payload d'insert n'a pas à la porter.
      let ebayRequiredFull = null;
      if (ebayRow?.platform_fields?.ebayCategoryId && !ebayRow.platform_fields.ebayRequiredAspects) {
        const catId = String(ebayRow.platform_fields.ebayCategoryId);
        const lireRef = async () => {
          try {
            const { data } = await supabase
              .from("ebay_item_aspects")
              .select("aspects, required_count, status")
              .eq("category_id", catId)
              .limit(1)
              .maybeSingle();
            return data ?? null;
          } catch { return null; }
        };
        // « Utilisable » = fetch Taxonomy abouti : ok (aspects présents) ou
        // empty (la catégorie n'a AUCUN aspect — information valable, pas un
        // trou). not_found/error/absent = trou réel → refetch.
        const utilisable = r => r && (r.status === "ok" || r.status === "empty");
        let aspRow = await lireRef();
        if (!utilisable(aspRow)) {
          try {
            await supabase.functions.invoke("fetch-ebay-aspects", { body: { refetch_category: catId } });
          } catch { /* le blocage ci-dessous tranche */ }
          aspRow = await lireRef();
        }
        if (!utilisable(aspRow)) {
          throw new Error(tpl("stepPublishEbayReferentialMissing", { id: catId }));
        }
        const required = (aspRow.aspects ?? [])
          .filter(a => a?.required === true && a?.name);
        ebayRow.platform_fields.ebayRequiredAspects = required.map(a => a.name);
        ebayRequiredFull = required;
      }
      // Job régénéré portant déjà les noms (sans allowedValues re-lues) :
      // la garde retombe sur la seule vérification de présence, comme avant
      // ce patch — jamais moins stricte qu'avant.
      if (!ebayRequiredFull && ebayRow?.platform_fields?.ebayRequiredAspects) {
        ebayRequiredFull = ebayRow.platform_fields.ebayRequiredAspects.map(name => ({ name, allowedValues: [] }));
      }
      // ── Garde pré-publication eBay (2026-07-11, décision produit) ──────
      // Un aspect OBLIGATOIRE de la catégorie qui correspond à un de nos 4
      // champs connus et qui est vide → interruption AVANT le débit/insert
      // (le throw aboutit au bandeau rouge publishError de StepPublish) : ni
      // blocage silencieux, ni valeur devinée — l'utilisateur complète le
      // champ dans l'app puis relance. Cas réel déclencheur : taille=""
      // avec "Taille" required sur la catégorie, dry-run "réussi" sans
      // avertissement visible. Les obligatoires SANS mapping (Type, Longueur
      // des manches...) ne bloquent pas : ils restent sur le canal
      // unfilledRequired de l'extension (constat informatif). Uniquement
      // eBay — les règles Vinted/LBC/Beebs sont gérées ailleurs.
      if (ebayRow && ebayRequiredFull) {
        const pfE = ebayRow.platform_fields;
        // Valeurs telles que l'EXTENSION les enverra (mêmes transformations
        // que ebay.js : strip "EU " sur la taille, colors[0] prioritaire).
        // Alias Mode (audit Phase 0) : monture/extérieure/doublure = nos
        // couleur/matière — mêmes listes que ebay.js, la garde doit juger
        // exactement ce que l'extension enverra.
        // `set` : écrit la valeur RAPPROCHÉE dans le job sortant (pfE est le
        // platform_fields de la row d'insert — la mutation part telle quelle
        // en base, et rows est reconstruit à chaque clic Publier : idempotent).
        const knownAspects = [
          { labels: ["Marque"], value: () => pfE.marque, set: v => { pfE.marque = v; } },
          { labels: ["Taille", "Pointure EU", "Pointure"], value: () => String(pfE.taille ?? "").replace(/^EU\s*/i, ""), set: v => { pfE.taille = v; } },
          { labels: ["Couleur", "Couleur de la monture", "Couleur extérieure"], value: () => pfE.colors?.[0] || pfE.couleur,
            // Gates et handlers lisent colors[0] AVANT couleur : écrire les deux.
            set: v => { pfE.couleur = v; if (Array.isArray(pfE.colors) && pfE.colors.length) pfE.colors = [v, ...pfE.colors.slice(1)]; } },
          { labels: ["Matière", "Matériau", "Matériaux", "Matière de la couche extérieure", "Matière doublure externe", "Matière extérieure"], value: () => pfE.matiere, set: v => { pfE.matiere = v; } },
        ];
        // Même normalisation que normalizeFuzzy de ebay.js — la garde doit
        // accepter exactement ce que l'extension rapprochera au remplissage.
        const normFuzzy = s => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        // Manquant = champ vide, OU valeur hors du référentiel quand l'aspect
        // est un vrai choix fermé (patch 2026-07-11 : job dd9ac7a3,
        // couleur="Black" — non-vide mais absente des 17 valeurs FR de la
        // liste Couleur → aurait échoué en silence sur la vraie page eBay).
        //
        // « Vrai choix fermé » = liste allowedValues ≤ 200 entrées, OU
        // mode="SELECTION_ONLY" quel que soit le volume. Le seuil sépare les
        // ensembles fermés réels des listes de référence/typeahead — chiffres
        // relevés sur la catégorie 15687 : Couleur 17, Taille 55 (choix
        // fermés à valider) vs Marque 19 037 (FREE_TEXT, aide à la saisie :
        // eBay accepte une marque hors liste en saisie libre, et l'extension
        // sait la taper — bloquer "MaMarqueDeNiche123" ici refuserait une
        // publication qu'eBay aurait acceptée). FREE_TEXT + liste > 200 ou
        // liste vide → la présence suffit, comme avant ce patch.
        // Même constante que l'UI (2026-07-18) : si l'encart propose un
        // sélecteur pour une liste, la garde accepte forcément le choix fait.
        const CLOSED_LIST_MAX = EBAY_CLOSED_LIST_MAX;
        // Deux cas DISTINCTS depuis le 2026-07-15 (bug réel : taille en mois
        // sur la catégorie 51581 « Robes Fille 2-16 ans » — le message
        // unique « Complète ce(s) champ(s) » laissait croire à un champ
        // VIDE alors que la valeur était REMPLIE mais hors de la liste de
        // la catégorie, et le restait à chaque re-saisie du même axe) :
        //   - champ vide            → message « complète » historique ;
        //   - valeur hors liste     → message dédié citant la valeur
        //     refusée + des exemples acceptés (les valeurs d'ÂGE de la
        //     liste d'abord quand la saisie est une taille d'âge), + astuce
        //     d'alignement genre↔axe pour les tailles mois/ans.
        const missingEmpty = [];
        const invalidMessages = [];
        for (const aspect of ebayRequiredFull) {
          const known = knownAspects.find(k => k.labels.includes(aspect.name));
          // Canal générique (chantier champs obligatoires) : pf.ebayAspects
          // porte les obligatoires sans champ dédié (resolve_aspects +
          // fallback UI) — validés ici comme les champs connus.
          const genericVal = String(pfE.ebayAspects?.[aspect.name] ?? "").trim();
          if (!known && !genericVal) continue; // pas de source → canal unfilledRequired de l'extension
          const val = known ? String(known.value() ?? "").trim() || genericVal : genericVal;
          if (!val) { missingEmpty.push(aspect.name); continue; }
          const allowed = Array.isArray(aspect.allowedValues) ? aspect.allowedValues : [];
          const closedList = allowed.length &&
            (allowed.length <= CLOSED_LIST_MAX || aspect.mode === "SELECTION_ONLY");
          if (!closedList) continue;
          if (allowed.some(v => normFuzzy(v) === normFuzzy(val))) continue;
          // Rapprochement AUTO au moment du publish (2026-07-19, casquette
          // 52365 : Taille « Unique » absente de la liste mais « Taille
          // unique » y EXISTE — la garde jetait quand même, avec en
          // « exemples » les 4 premières valeurs brutes de la liste, tailles
          // bébé en tête). Même nearestAllowedValue que la pré-sélection du
          // step 3, appliqué ICI en dernier filet : déterministe, insensible
          // aux races d'arrivée du référentiel (preview pas encore chargée,
          // clic rapide). La valeur du JOB est corrigée — c'est elle que
          // l'extension posera (libellé eBay exact ⇒ match « exact » du menu).
          const nearest = nearestAllowedValue(val, allowed);
          if (nearest) {
            if (known?.set) known.set(nearest);
            else pfE.ebayAspects = { ...(pfE.ebayAspects ?? {}), [aspect.name]: nearest };
            console.log(`[publish] eBay ${aspect.name} : « ${val} » rapproché en « ${nearest} » (liste fermée de la catégorie)`);
            continue;
          }
          const ageLike = /\b(mois|ans)\b/i.test(val);
          // Sans rapprochement sûr : plus JAMAIS les 4 premières valeurs
          // brutes de la liste en guise d'« exemples » (« Bébé prématuré,
          // Naissance, XS, S » pour une casquette adulte — absurde). Cas âge
          // conservé (les valeurs mois/ans de la liste sont un VRAI guide) ;
          // sinon on renvoie vers le sélecteur de l'encart eBay, qui porte la
          // liste complète (state "invalid", même critère de liste fermée).
          if (ageLike) {
            const preferred = allowed.filter(v => /\b(mois|ans)\b/i.test(v));
            const sample = (preferred.length ? preferred : allowed).slice(0, 4).join(", ");
            invalidMessages.push(
              tpl("stepPublishEbayValueNotAllowed", { name: aspect.name, value: val, sample }) +
              ` ${t("stepPublishEbayAxisHint")}`
            );
          } else {
            invalidMessages.push(
              tpl("stepPublishEbayValueNotAllowedPick", { name: aspect.name, value: val, count: allowed.length })
            );
          }
        }
        const guardMessages = [];
        if (missingEmpty.length) {
          guardMessages.push(tpl("stepPublishEbayRequiredMissing", { fields: missingEmpty.join(", ") }));
        }
        guardMessages.push(...invalidMessages);
        if (guardMessages.length) throw new Error(guardMessages.join(" "));
      }
      // Débit des pièces + insertion des jobs en UNE transaction serveur :
      // prix et user imposés côté serveur (coin_config + auth.uid()), insert
      // raté = zéro pièce débitée. Remplace check_publish_quota + insert +
      // log_publish pour les clients pièces.
      const { data: pubRes, error: pubErr } = await supabase.rpc("spend_coins_and_publish", {
        p_photo_option: photoOption,
        p_jobs: rows,
      });
      if (pubErr) throw new Error(t("genericError"));
      if (pubRes?.allowed === false) {
        setPublishing(false);
        if (pubRes.reason === "insufficient_coins") {
          setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"] });
          return;
        }
        throw new Error(t("genericError"));
      }
      setWallet({ included_balance: pubRes.included_after, purchased_balance: pubRes.purchased_after });
      if (addToStock && currentInvId && processedPhotos?.length) {
        await supabase.from("inventaire").update({ photos: processedPhotos }).eq("id", currentInvId);
      }
      // Le DERNIER prix publié fait foi dans l'inventaire (2026-07-13, job
      // 3d194668) : le prix saisi au stepper n'était JAMAIS persisté — la
      // ligne inventaire gardait le prix de la génération initiale (souvent
      // NULL si le prix a été fixé après), et « Republier » depuis le Stock
      // repartait au prix vide → job price=NULL → refus plateforme.
      // .select() de contrôle : leçon RLS profiles — un UPDATE silencieusement
      // bloqué doit se VOIR, pas passer pour un succès. Policy « update own »
      // (auth.uid() = user_id) + GRANT UPDATE authenticated vérifiés en base
      // le 2026-07-13. Jamais bloquant : la publication, elle, a réussi.
      if (currentInvId && price != null && Number(price) > 0) {
        const { data: prixMaj, error: prixErr } = await supabase
          .from("inventaire")
          .update({ prix_vente: Number(price) })
          .eq("id", currentInvId)
          .select("id, prix_vente");
        if (prixErr || !prixMaj?.length) {
          console.error(
            `[FillSell] prix_vente NON persisté sur inventaire ${currentInvId} — ` +
            (prixErr ? `update en erreur : ${prixErr.message}` : "update silencieusement bloqué (RLS ?)") +
            " — le prochain « Republier » repartirait sans prix."
          );
        }
      }
      setDone(true);
    } catch (e) {
      setPublishError(e.message);
      setPublishing(false);
    }
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  const displayPreviews = pickedPreviews.length > 0 ? pickedPreviews : photos;
  const photoCount      = displayPreviews.length;
  const isLocked        = uploading || publishing || generatingPlatforms;

  const publishChips = [...selected].filter(p => platformListings?.platforms?.[p]);

  function ctaLabel() {
    if (step === 0) {
      if (uploading)              return t("ctaUploading");
      if (photoCount < MIN_PHOTOS) return minPhotosLabel;
      return tpl("ctaContinuePhotos", { n:photoCount });
    }
    if (step === 1) {
      if (photos.length < MIN_PHOTOS) return minPhotosLabel;
      return t("ctaGenerateListings");
    }
    if (step === 2) {
      if (generatingPlatforms || !platformListings) return t("ctaGenerating");
      return t("ctaContinueToPublish");
    }
    if (step === 3) {
      if (publishing) return t("ctaPublishing");
      const n = publishChips.length;
      return tpl("ctaPublishOnPlatforms", { n });
    }
    return "";
  }

  // Minimum 3 photos (2026-07-14) : c'est le minimum imposé par VINTED sur les
  // marques premium (cf. VINTED_MIN_PHOTOS dans chrome-extension/vinted.js, qui
  // DUPLIQUAIT jusqu'ici la dernière photo pour l'atteindre — un pansement).
  // On le demande à la source plutôt que de fabriquer de fausses photos.
  const minPhotosLabel = lang === "en"
    ? `Add at least ${MIN_PHOTOS} photos to continue`
    : `Ajoute au moins ${MIN_PHOTOS} photos pour continuer`;

  // ── Publier DÉSACTIVÉ tant qu'un requis est vide (chantier 2026-07-16) ────
  // Règle produit : plus jamais un clic qui échoue sur un requis — le bouton
  // reste gris tant que l'encart (eBay, générique, champs partagés, genre
  // Vinted bloqué) signale un manque. Les états "prefilled"/"generic"/"ok"
  // ne bloquent pas ; seuls les "missing" comptent.
  const requiredBlocking =
    (ebayRequiredStatus ?? []).some(a => a.state === "missing" || a.state === "invalid") ||
    Object.values(genericRequiredStatus ?? {}).some(list => list.some(a => a.state === "missing" || a.state === "invalid")) ||
    missingSharedFields.length > 0 ||
    vintedGenreBlocked;

  const ctaDisabled =
    (step === 0 && (photoCount < MIN_PHOTOS || uploading)) ||
    (step === 1 && (photos.length < MIN_PHOTOS || selected.size === 0)) ||
    (step === 2 && (generatingPlatforms || !platformListings)) ||
    (step === 3 && (publishChips.length === 0 || publishing || requiredBlocking));

  function handleNext() {
    if (step === 0) { handleUpload(); return; }
    if (step === 1) {
      // Pièces : blocage doux si le solde ne couvre pas l'option choisie —
      // remplace l'ancien blocage dur Free. Le débit réel a lieu à Publier,
      // ici on évite juste de lancer une génération qu'on ne pourra pas payer.
      const price = coinPriceFor(photoOption);
      if (price != null && coinBalance < price) {
        setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"] });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) { if (platformListings) { setStep(3); } return; }
    if (step === 3) { handlePublish(); }
  }

  // Bouton retour unique du header : retourne à l'étape précédente, ou ferme
  // le stepper si on est à la toute première étape (Upload).
  function handleBack() {
    if (isLocked) return;
    if (step === 0) { onClose(); return; }
    setStep(s => s - 1);
  }

  // ── Render : initializing ─────────────────────────────────────────────────
  // createPortal vers document.body : le stepper DOIT sortir du scroller
  // .wrap.page-pad (celui-ci a -webkit-overflow-scrolling:touch, qui sur iOS
  // Safari confine tout position:fixed descendant DANS le scroller au lieu du
  // viewport → topbar/bnav passaient par-dessus et le CTA débordait). Portalé
  // sur body, l'overlay fixed couvre réellement tout l'écran.
  if (initializing) return createPortal((
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      background:T.canvas, display:"flex", alignItems:"center", justifyContent:"center",
      paddingTop:"env(safe-area-inset-top,0px)", paddingBottom:"env(safe-area-inset-bottom,0px)",
    }}>
      <Loader size={36} thickness={3} />
    </div>
  ), document.body);

  // ── Render : done ─────────────────────────────────────────────────────────
  if (done) return createPortal((
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      background:T.canvas, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"60px 32px 32px",
      paddingTop:"calc(env(safe-area-inset-top,0px) + 60px)", paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 32px)",
    }}>
      <style>{`@keyframes lps-popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ fontSize:72, animation:"lps-popIn 0.5s ease forwards" }}>✅</div>
      <div style={{ fontSize:22, fontWeight:600, color:T.ink, textAlign:"center", marginTop:16 }}>
        {t("doneTitle")}
      </div>
      <div style={{ fontSize:14, color:T.mute2, textAlign:"center", lineHeight:1.6, marginTop:8, maxWidth:280 }}>
        {t("doneSubtitle")}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop:28, padding:"14px 40px", borderRadius:999,
          background:`linear-gradient(120deg,${T.teal},${T.tealDeep})`,
          color:"#fff", border:"none", fontSize:15, fontWeight:600,
          cursor:"pointer", fontFamily:"inherit",
          boxShadow:"0 10px 24px rgba(47,158,144,0.28)",
        }}
      >
        {t("doneButton")}
      </button>
    </div>
  ), document.body);

  // ── Render : stepper ──────────────────────────────────────────────────────
  return createPortal((
    <div style={{
      // 100dvh (viewport DYNAMIQUE) et non 100% / 100vh : sur Safari iOS web,
      // un fixed height:100% est dimensionné sur le GRAND viewport (barre
      // d'outils rétractée) → le bas du conteneur passe SOUS la barre Safari.
      // dvh suit la hauteur réellement visible. Le conteneur ne scrolle PAS :
      // seul le contenu scrolle, le footer reste pinné en bas du dvh.
      position:"fixed", inset:0, zIndex:300,
      display:"flex", flexDirection:"column", width:"100%", height:"100dvh",
      background:T.canvas, overflow:"hidden",
      paddingTop:"env(safe-area-inset-top,0px)",
    }}>
      <style>{`* { box-sizing: border-box; }`}</style>

      {/* Header : retour + progression */}
      <div style={{ padding:"12px 20px 0", flexShrink:0 }}>
        <button
          onClick={handleBack}
          disabled={isLocked}
          style={{
            width:36, height:36, borderRadius:"50%",
            background:T.chip, border:"none",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor: isLocked ? "not-allowed" : "pointer",
            opacity: isLocked ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={18} color={T.ink} />
        </button>
      </div>
      <StepProgress step={step} labels={stepLabels} />

      {/* Contenu de l'étape — SEUL élément scrollable (minHeight:0 pour que le
          flex enfant puisse rétrécir et scroller au lieu de pousser le footer
          hors écran). */}
      <div style={{ padding:"16px 20px 8px", flex:1, minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
        {step === 0 && (
          <StepUpload
            previews={displayPreviews}
            removable={pickedPreviews.length > 0}
            onAdd={addFiles}
            onRemove={removeFile}
            onReorder={handleReorderPreviews}
            notes={notes}
            setNotes={setNotes}
            micActive={micActive}
            toggleMic={toggleMic}
            error={uploadError}
            lang={lang}
          />
        )}
        {step === 1 && (
          <StepPhotos
            photos={photos}
            onAddPhotos={handleAddMorePhotos}
            onRemovePhoto={handleRemovePhoto}
            onReorderPhotos={handleReorderPhotos}
            onPhotoClick={setLightboxUrl}
            photoOption={photoOption}
            setPhotoOption={setPhotoOption}
            background={background}
            setBackground={setBackground}
            selected={selected}
            setSelected={setSelected}
            coinPrices={coinPrices}
            coinBalance={coinBalance}
            onOpenStore={() => setStoreOpen(true)}
            platformSupport={platformSupport}
            lang={lang}
            onAnalyze={handleAnalyzePhotos}
            analyzing={analyzing}
            analysisResult={photoAnalysis}
            analysisError={analysisError}
            analysisCost={coinPrices?.lens_overflow ?? null}
            // Article venant de Lens : il a déjà prix et attributs → on ne
            // propose PAS une seconde analyse payante pour le même article.
            analysisHidden={initialListing?.prix_vente_suggere != null || initialListing?.taille_estimee != null}
          />
        )}
        {step === 2 && (
          <StepGeneration
            generating={generatingPlatforms}
            generateError={platformError}
            platformListings={platformListings}
            processedPhotos={processedPhotos}
            selected={selected}
            edited={edited}
            setEdited={setEdited}
            onPhotoClick={setLightboxUrl}
            onRetry={handleGeneratePlatforms}
            noteOverride={noteSharedOverride}
            lang={lang}
            price={price}
            setPrice={setPrice}
            customPriced={customPriced}
            setCustomPriced={setCustomPriced}
            articleIcon={articleIcon}
          />
        )}
        {step === 3 && (
          <StepPublish
            selected={selected}
            setSelected={setSelected}
            platformListings={platformListings}
            publishError={publishError}
            lang={lang}
            canToggleStock={canToggleStock}
            stockLocked={stockLocked}
            addToStock={addToStock}
            setAddToStock={setAddToStock}
            prixAchatSaisi={prixAchatSaisi}
            setPrixAchatSaisi={setPrixAchatSaisi}
            missingSharedFields={missingSharedFields}
            missingSharedFieldPlatforms={missingSharedFieldPlatforms}
            sharedFields={sharedFields}
            onSharedFieldChange={setSharedField}
            sharedChildAxes={sharedChildAxes}
            vintedGenreBlocked={vintedGenreBlocked}
            ebayRequiredStatus={ebayRequiredStatus}
            onEbayAspectChange={setEbayAspect}
            onEbaySharedFieldChange={setEbaySharedField}
            genericRequiredStatus={genericRequiredStatus}
            onPlatformAspectChange={setPlatformAspect}
            onPlatformDedicatedChange={setPlatformDedicatedField}
            pausedPlatforms={pausedPlatforms}
          />
        )}
      </div>

      {/* Footer CTA — pinné en bas du viewport dynamique (flex-shrink:0), pas
          dans le flux scrollé : toujours visible, jamais sous la barre Safari.
          Fond + bordure haute pour le détacher du contenu qui scrolle dessous. */}
      <div style={{ padding:"8px 20px", paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 20px)", flexShrink:0, background:T.canvas, borderTop:`1px solid ${T.border}`, boxShadow:"0 -6px 16px rgba(16,32,27,0.05)" }}>
        <PrimaryButton
          disabled={ctaDisabled}
          onClick={handleNext}
          icon={step === 3 && !ctaDisabled && !publishing ? Check : undefined}
        >
          {ctaLabel()}
        </PrimaryButton>
      </div>

      {quotaModal.open && (
        <ConversionModal
          isOpen={true}
          onClose={() => setQuotaModal(m => ({ ...m, open: false }))}
          onUpgrade={tier => { setQuotaModal(m => ({ ...m, open: false })); onUpgrade(tier); }}
          trigger={quotaModal.trigger}
          targetTiers={quotaModal.targetTiers}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          coinBalance={quotaModal.coinBalance ?? coinBalance}
          coinPrice={quotaModal.coinPrice ?? coinPriceFor(photoOption)}
          onUseCoins={() => { setQuotaModal(m => ({ ...m, open: false })); setStoreOpen(true); }}
        />
      )}

      <CoinStoreModal
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        lang={lang}
        supabase={supabase}
        onPurchased={refreshWallet}
      />

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  ), document.body);
}
