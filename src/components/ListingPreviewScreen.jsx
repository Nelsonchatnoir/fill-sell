import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronLeft, Mic, Plus, X, Sparkles, Pencil, Clock, ImageOff, GripVertical } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera } from "@capacitor/camera";
import ConversionModal from "./ConversionModal";
import ExtensionPitchScreen from "./ExtensionPitchScreen";
// (import PepiteAmount retiré au nettoyage unités du 02/09 soir — les
// montants dormants s'affichent en chiffres nus, plus aucune iconographie.)
import PlatformLogo from "./platform-logos/PlatformLogo";
import AnalyseMarche from "./AnalyseMarche";
import { useTranslation } from "../i18n/useTranslation";
import { Loader } from "./ui";
import { detectObjectIcon, detectObjectIconKeyword, ALL_OBJECT_ICONS, PLATFORM_LOGIN_URLS, fraicheurExtension } from "../utils/shared";
import { getVintedCategoryPath, vintedGenreRequired } from "../utils/vintedCategories";
import { normalizeVintedColors } from "../utils/vintedColors";
import { getLbcCategoryPath, getLbcBabyEquipment, getLbcBabyClothingProduct, getLbcFreePhotoQuota } from "../utils/lbcCategories";
import { normalizeVintedTitle } from "../utils/vintedTitle";
import { getEbayCategoryPath, getEbayCategoryId, ebayGenreRequired } from "../utils/ebayCategories";
import { getBeebsCategoryPath, beebsGenreRequired } from "../utils/beebsCategories";
import { getPlatformSupport } from "../utils/platformCompat";
import { computeRemovalInfo } from "../utils/publicationState";
import { FREE_STOCK_LIMIT_FALLBACK } from "../utils/stockLimit";
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

// ── Une photo est-elle une retouche PAYÉE, à nous ? ──────────────────────────
// Source UNIQUE (StockTab l'importe, le RPC spend_coins_and_publish porte la
// même règle en SQL — migration 20260805030000). Trois formats coexistent :
//  · pipeline actuel : objets {type,url} — ⚠️ la photo 0 retouchée garde
//    type:'original' avec une URL sous /enhanced/ (relevé generate-listing) :
//    l'URL fait foi, le type n'est qu'un indice ;
//  · schéma historique : objets {original, bg_removed, enhanced} ;
//  · strings nues : /enhanced/ = retouche réutilisée puis aplatie par la
//    persistance ; /raw/ ou CDN Vinted = rien de payé.
export function isRetouchedPhotoEntry(p) {
  if (!p) return false;
  if (typeof p === "string") return p.includes("/enhanced/");
  if (typeof p !== "object") return false;
  if (p.enhanced || p.bg_removed) return true;
  if (typeof p.type === "string" && p.type.startsWith("enhanced")) return true;
  return typeof p.url === "string" && p.url.includes("/enhanced/");
}
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

// ── Plateformes qui exigent l'adresse de remise des Réglages (2026-08-10) ────
// Leboncoin la demande à chaque dépôt (jamais pré-remplie depuis le compte),
// et Beebs réutilise LA MÊME valeur — il n'a pas de réglage dédié dans l'app
// (cf. chrome-extension/content-scripts/beebs.js, en-tête : « on réutilise
// platform_settings.leboncoin.adresse, même adresse d'expédition »).
// Sans elle, les deux handlers rendent { ok:false } et le job meurt APRÈS le
// débit, dans le content script — 3 clients touchés (01/08, 10/08 ×2).
const PLATEFORMES_ADRESSE_LBC = ["leboncoin", "beebs"];

// Motif affiché quand une plateforme est grisée, par statut de compat (cf.
// src/utils/platformCompat.js). "prohibited" (2026-08-11) a SON message : dire
// « catégorie non disponible » d'un parfum sur Leboncoin serait faux et
// pousserait l'utilisateur à chercher une autre catégorie — il n'y en a pas,
// c'est le PRODUIT qui est interdit. Une case grise muette, elle, se lit comme
// un bug.
const SUPPORT_MESSAGE_KEY = {
  prohibited: "platformProhibited",
  unavailable: "platformUnavailable",
  unmapped: "platformUnmapped",
};
const supportMessage = (t, support, platformLabel) =>
  t(SUPPORT_MESSAGE_KEY[support] ?? "platformUnmapped").replace("{platform}", platformLabel);

// ── Multi-select photos sur ANDROID uniquement (2026-07-27) ──────────────────
// L'<input type="file" multiple> de la WebView part en ACTION_GET_CONTENT vers
// la galerie du constructeur, dont le multi-select exige un appui long — un tap
// simple retourne UNE photo (bug « un seul fichier retenu », stepper + scan).
// Camera.pickImages force le Photo Picker système (cases à cocher), sans
// permission (l'alias photos est toujours granted sur Android).
// iOS et web NE PASSENT JAMAIS ici : gate Capacitor.getPlatform() === 'android'
// aux points d'appel — l'<input> reste dans le DOM et reste leur seul chemin,
// comportement inchangé y compris en erreur (iOS validé par Nico le 27/07).
const IS_ANDROID = Capacitor.getPlatform() === "android";

// Convertit les GalleryPhoto (webPath) en File STRICTEMENT équivalents à ceux
// de l'input — MIME réel lu sur le blob (pas un jpeg présumé), extension
// assortie, octets intacts (aucune recompression ici : fetch du webPath tel
// quel) — puis les remet au MÊME point d'entrée que l'input (onFiles = le
// callback que l'onChange de l'input appelle déjà). Cas limites alignés sur
// l'input : annulation ou sélection vide ⇒ no-op silencieux ; échec du
// plugin ⇒ repli sur l'input existant, JAMAIS muet (console.error).
async function pickPhotosAndroid(remaining, onFiles, fallbackClick) {
  if (remaining <= 0) return; // même garde que le bouton (masqué à MAX_PHOTOS)
  let res;
  try {
    res = await CapCamera.pickImages({ quality: 90, limit: remaining });
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("cancel")) return; // = refermer l'input sans rien choisir
    console.error("[stepper] pickImages failed, fallback input", e?.message, e);
    fallbackClick();
    return;
  }
  const picked = (res?.photos ?? []).slice(0, remaining);
  if (!picked.length) return;
  const files = [];
  for (let i = 0; i < picked.length; i++) {
    const ph = picked[i];
    try {
      const blob = await fetch(ph.webPath).then(r => r.blob());
      const mime = blob.type || (ph.format ? `image/${ph.format}` : "image/jpeg");
      const ext = ph.format || mime.split("/")[1] || "jpg";
      files.push(new File([blob], `photo_${Date.now()}_${i}.${ext}`, { type: mime }));
    } catch (_) { /* photo illisible : sautée, les autres passent */ }
  }
  if (files.length) onFiles(files);
}

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
  // MATIÈRE — "vinted" RETIRÉ le 2026-07-29 (bug utilisatrice, job a87f8e84).
  // Vinted ne l'exige nulle part : nos propres relevés DOM le disent depuis
  // toujours — platform_category_aspects, platform='vinted', field_key
  // 'material' : 17 lignes, TOUTES required=false, et le libellé relevé est
  // « Matériau (recommandé) ». La garde statique bloquait pourtant la
  // publication ; l'utilisatrice a tapé « ? » pour passer, et le point
  // d'interrogation est parti tel quel chez Vinted.
  // Pourquoi le chemin data-driven ne rattrapait pas : genericAspectsCatalog
  // n'est peuplé QU'AVEC les lignes required=true, et les plateformes sans
  // aucun requis sont retirées de l'objet — « catégorie sans requis » et
  // « catégorie jamais relevée » y sont indistinguables, donc on retombe sur
  // cette carte statique (cf. guardPlatforms).
  // beebs RESTE : ses relevés portent bien un « Matière » required=true
  // (Jeux, jouets et loisirs > Figurines).
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["beebs", "leboncoin", "ebay"],
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

// ── Le canal générique est-il RÉELLEMENT posé sur la plateforme ? ────────────
// (2026-08-11) MIROIR EXACT des listes de saut des content scripts. Un aspect
// écrit dans pf.lbcAspects / pf.beebsAspects sous une clé que le handler SAUTE
// n'est jamais posé : la valeur est perdue en silence. La garde du CTA
// (missingSharedFieldsDetailed) doit donc compter le canal générique ici, et
// seulement ici — sinon elle laisse publier un champ que la plateforme ne
// recevra pas, ou bloque sur une valeur pourtant acquise.
//   · vinted    → TOUJOURS posé : la boucle générique traite les codes libres,
//                 et les codes à mapping dédié passent par le pont `_bridge`
//                 (vinted.js : vintedAspects.size → fields.taille, brand,
//                 material, condition, color → colors…). Rien ne se perd.
//   · leboncoin → handledForKeys (leboncoin.js) : ces clés sont SAUTÉES.
//                 ⚠️ `_colou?r$` n'y est PAS — et c'est heureux, car
//                 leboncoin.js ne lit NULLE PART fields.couleur (vérifié :
//                 aucune occurrence). Sur LBC, la couleur ne peut voyager QUE
//                 par le canal générique ; lui donner un dedicatedTarget
//                 écrirait dans un champ que personne ne lit.
//   · beebs     → handledLabels (beebs.js) : mêmes libellés, même règle.
// ⚠️ Si une de ces listes change côté extension, elle doit changer ICI aussi :
// les deux copies ne se lisent pas l'une l'autre.
const LBC_GENERIQUE_SAUTE =
  /(_condition$|^condition$|_univers$|_universe$|_type$|^baby_clothing_category$|_size$|^clothing_st$|^baby_age$|_brand$|_material$)/;
const BEEBS_GENERIQUE_SAUTE = new Set(
  ["Couleur", "Marque", "Pointure", "Taille", "État", "Matière", "Âge", "Format du colis"]
);
function canalGeneriquePose(platform, key) {
  if (platform === "vinted") return true;
  if (platform === "leboncoin") return !LBC_GENERIQUE_SAUTE.test(key);
  if (platform === "beebs") return !BEEBS_GENERIQUE_SAUTE.has(key);
  return false;
}

// ── Un aspect BLOQUE-t-il la publication ? ───────────────────────────────────
// Règle unique (2026-07-29) partagée par la garde du CTA, la liste des motifs
// du bouton gris et l'encart rouge : "missing" bloque toujours (absence de
// valeur), "invalid" ne bloque que contre une liste qui FAIT FOI
// (a.blocking === true, cf. listeFaitFoi) — un « hors liste » jugé contre un
// relevé partiel n'est qu'un avertissement.
// « missing » non bloquant (2026-09-02, règle « jamais deviner ») : un champ
// FERMÉ (combobox/dropdown/list) dont la liste n'a jamais été relevée porte
// blocking:false — on ne demande RIEN à l'utilisateur (il ne peut pas
// connaître le vocabulaire de la plateforme), le pré-rempli de la plateforme
// ou le mini-éditeur needs_user (options relevées au blocage, qui REMPLISSENT
// le catalogue) font foi. Un missing ordinaire reste bloquant.
const aspectBloquant = (a) => (a.state === "missing" && a.blocking !== false) || (a.state === "invalid" && a.blocking === true);

// ── Poids du colis Leboncoin : table format → grammes, NON POSÉE (28/08) ─────
// ⚠️ PRÉ-REMPLISSAGE RETIRÉ le 2026-08-28 au soir, sur relevé du CODE de
// l'extension — le format réel du champ interdit de poser une valeur déduite :
//   · « Poids du colis » (estimated_parcel_weight) est un COMBOBOX FERMÉ :
//     relevé DOM enregistré au catalogue platform_category_aspects
//     (leboncoin / Mode > Vêtements / input_type "combobox" / required=true),
//     et findCriterionInput (leboncoin.js) ne matche QUE input[role=combobox] ;
//   · l'extension ne TAPE jamais dans un combobox : fillCriterionSafe ouvre le
//     menu et CLIQUE une option matchée (findOptionCascade) — sinon champ
//     sauté, pré-rempli LBC conservé (skipIfPrefilled du canal générique) ;
//   · la LISTE des paliers n'a jamais été relevée (allowed_values NULL,
//     0 option au catalogue) : impossible de garantir qu'une valeur dérivée
//     (« 1000 ») est une option — et un match flou pourrait cliquer un FAUX
//     palier. Les 89 saisies libres qui « publient » (« 500g », « 200qg »…)
//     ne prouvent rien : elles passent par le même clic-d'option et ne
//     doivent leur survie qu'au pré-rempli LBC conservé.
// Règle : liste fermée jamais relevée → AUCUN pré-remplissage, saisie
// manuelle (comportement historique). La table ci-dessous est CONSERVÉE
// (bornes hautes cohérentes avec les paliers LBC et
// BEEBS_PACKAGE_BY_FORMAT de beebs.js) pour le jour où les options du
// combobox seront relevées en réel — elle n'est branchée sur RIEN tant que
// cette liste n'est pas connue.
const LBC_POIDS_PAR_FORMAT = {
  "Lettre": 500,
  "Petit colis": 1000,
  "Moyen colis": 2000,
  "Grand colis": 5000,
  "Très grand colis": 10000,
};

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
// Set des icônes valides (les 164 de shared.js) : garde-fou pour toute icône
// d'origine EXTERNE (category_icon renvoyé par generate-listing). Une valeur
// hors de ce set est ignorée → fallback detectObjectIcon.
const VALID_OBJECT_ICONS = new Set(ALL_OBJECT_ICONS);

function resolveArticleIcon({ initialListing, edited, pf, aiIcon = null }) {
  // ── FAMILLE LENS SOUVERAINE — LIVRES (2026-09-02, cas Delavier) ───────────
  // « La Méthode Delavier de MUSCULATION » : le mot-clé « musculation »
  // accrochait l'icône sport → catégorie LBC « Loisirs > Sport & Plein air »
  // → requis « Univers » (liste jamais relevée) sur un LIVRE, alors que la
  // fiche Lens disait famille=livres_medias et catégorie Livres. Un livre
  // parle TOUJOURS de son sujet (musculation, cuisine, yoga…) : la détection
  // par mots-clés est structurellement piégée sur cette famille. La famille
  // du schéma v81 est un descripteur FERMÉ et fiable : elle prime, POUR LES
  // LIVRES SEULEMENT. (⛔ Ce n'est PAS l'inversion générale mot-clé/IA du
  // chantier classement, qui reste interdite avant mesure.)
  const familleFiche = initialListing?.famille ?? null;
  const categorieFiche = String(pf?.categorie || initialListing?.categorie || "").trim();
  if (familleFiche === "livres_medias" || /^livres?$/i.test(categorieFiche)) return "📚";
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

  // ── Réconciliation icône IA ↔ mot-clé (Volet 2, 2026-07-21) ────────────────
  // Un MOT-OBJET explicite dans la source FR (« hoodie », « sweat », « montre »,
  // « sac »…) est un signal FIABLE et audité — il PRIME sur le category_icon de
  // l'IA, qui n'est qu'une estimation Haiku pouvant confondre des familles
  // proches (bug réel : « Patagonia Hoodie » classé 🧥 manteau par l'IA au lieu
  // de 🧶 sweat, d'où catégorie eBay « Manteaux/vestes » et Vinted « Doudounes »).
  // L'icône IA ne sert donc plus qu'à COMBLER les cas SANS mot-clé (detect
  // renvoie null) — c'est le rôle « filet » pour lequel elle avait été ajoutée.
  const keywordIcon = detectObjectIconKeyword(frTitle, `${frDesc} ${marque}`);
  if (keywordIcon) return keywordIcon;
  // Aucun mot-objet reconnu → on fait confiance à l'IA (si valide), exactement
  // là où detectObjectIcon retomberait sur un simple défaut de catégorie.
  // ⚠️ SAUF 📦 (2026-08-15, « Cendrier vintage Noilly Prat », type Maison) :
  // 📦 est une icône VALIDE, donc une IA qui répond « objet générique »
  // court-circuitait le défaut de TYPE (🏠 pour Maison…), strictement plus
  // informatif — et l'article partait sans catégorie LBC. Un 📦 de l'IA ne
  // porte aucune information : on laisse detectObjectIcon jouer le défaut de
  // type, et 📦 ne revient qu'en tout dernier ressort (type Autre).
  if (aiIcon && aiIcon !== "📦" && VALID_OBJECT_ICONS.has(aiIcon)) return aiIcon;

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
      // ISBN (2026-08-31). MÊME PIÈGE que la taille et l'univers Leboncoin
      // ci-dessous : mergeFieldsWithLens construit un objet NEUF en n'itérant
      // que sur cette config — toute clé absente d'ici est JETÉE. L'ISBN posé
      // par generate-listing dans platform_fields.isbn (lu du Lens) était donc
      // supprimé à l'application de la génération, avant que le contrôle des
      // requis puisse le lire : « ISBN · Vinted » restait rouge sur une valeur
      // que le serveur venait de fournir (tracé le 31/08 : isbn_recu true,
      // isbn_recu_len 13, isbn_pose true — et champ vide à l'écran).
      // Cette entrée rend aussi atteignable le repli Lens du switch de
      // mergeFieldsWithLens, qui ne tourne que pour les clés de cette config.
      { key:"isbn",      label:"ISBN",                   type:"text" },
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

// Garde anti-nombre-nu — PORT de la règle des 4 content scripts (leboncoin.js:
// 1579, vinted.js, ebay.js, beebs.js). Même expression exacte.
const PURE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;
// Frontières de MOT — même corps que containsAsWords des content scripts.
const optionMatchesAsWords = (hay, needle) => {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
};

// ── Rapprochement d'une valeur sur une liste d'options ───────────────────────
// (2026-07-20) AVANT : le repli était un `includes` NU bidirectionnel, avec le
// tri par longueur comme seul garde-fou. Le commentaire d'origine avait bien vu
// le danger (« "EU 42 (US 9)" would wrongly hit "S" from "US" ») mais le tri
// par longueur n'est un palliatif que si un candidat plus long existe.
// Exécuté sur la vraie liste `size` unifiée (93 valeurs, 6 familles mélangées :
// lettres, numériques FR, pointures adultes, mois, années, pointures enfant),
// il produisait quatre résultats FAUX, prouvés :
//     "3"     -> "EU 35.5"   une taille enfant devenait une pointure adulte
//     "98 cm" -> "M"         un « cm » enfant devenait une taille adulte
//     "US 9"  -> "S"         le piège annoncé, que le tri ne rattrapait pas
//     "M/L"   -> "M"         perte silencieuse de la moitié de la taille
// Les 4 content scripts, eux, avaient déjà les deux gardes qu'il manquait ici.
// On applique le MÊME patron, sans rien changer d'autre :
//   1. exact (inchangé, prioritaire) ;
//   2. mapping état FR->eBay (inchangé) ;
//   3. NOUVEAU — nombre nu sur un champ taille : seul l'EXACT fait foi. Sans
//      ça « 3 » se rapprochait de « 3 ans »/« 3 mois »/« EU 35.5 » au jugé ;
//   4. repli par CONTENANCE AU MOT (plus de sous-chaîne nue), et les options
//      d'UNE SEULE LETTRE ("S"/"M"/"L") sortent du repli — elles restent
//      atteignables par l'exact. C'est ce qui tue "US 9"->"S" et "M/L"->"M" :
//      sur eBay « M/L » et « M » sont deux tailles DISTINCTES (cf. la
//      divergence assumée d'ebay.js), les confondre est une donnée fausse ;
//   5. tri par longueur CONSERVÉ pour départager les candidats restants —
//      c'est lui qui fait encore gagner "EU 42" sur "EU 42 (US 9)".
// Ne rien rendre plutôt que rendre faux : les deux appelants gèrent déjà le
// vide (`|| fromApi` garde la valeur brute, `|| ""` laisse le champ à remplir).
function findMatchingOption(raw, options, { sizeField = false } = {}) {
  if (!raw || raw === "null") return "";
  const n = raw.toLowerCase().trim();
  const exact = options.find(o => o.value.toLowerCase() === n);
  if (exact) return exact.value;
  const mapped = FR_TO_EBAY_CONDITION[n];
  if (mapped && options.some(o => o.value === mapped)) return mapped;
  if (sizeField && PURE_NUMBER_RE.test(n)) return "";
  const candidates = options.filter(o => {
    const v = o.value.toLowerCase();
    if (v.length <= 1) return false;
    return optionMatchesAsWords(n, v) || optionMatchesAsWords(v, n);
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
    // isbn : Livres UNIQUEMENT (2026-08-31). Sans ce cas, le `default: true`
    // ci-dessous afficherait un champ ISBN sur TOUS les articles Vinted,
    // t-shirts compris — c'est exactement le défaut « Espace de stockage
    // demandé sur un t-shirt » que ce filtre a été écrit pour corriger.
    // `leaf` vient de getLbcCategoryPath : les icônes 📖 📚 📰 rendent
    // ["Loisirs", "Livres"]. Un ISBN déjà rempli reste visible hors Livres —
    // c'est visibleFields qui le garantit, et il n'est pas touché.
    case "isbn":     return leaf === "Livres";
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

// ── « Modèle » sur un objet SANS MARQUE (2026-08-11, bouilloire générique) ──
// Impasse relevée à l'écran : « Marque : Sans marque » passe au vert (eBay
// fournit « - Sans marque/Générique - » dans ses valeurs), puis « Modèle » est
// exigé et sa liste ne propose que des modèles DE MARQUES (Aarke 126-AA01,
// Aicok AMR516-1, Bestron ARC800…). Aucune valeur de la liste n'est vraie pour
// un objet générique.
//
// CE QUE DIT LE RÉFÉRENTIEL, vérifié avant d'écrire cette règle
// (ebay_item_aspects, 234 catégories status='ok') :
//   · « Modèle » est REQUIS sur 16 catégories ;
//   · les 16 sont en mode FREE_TEXT — ZÉRO en SELECTION_ONLY.
// La liste affichée est donc une liste de SUGGESTIONS : le champ accepte une
// saisie libre, et la porte n'est pas murée — elle n'a simplement pas de
// poignée quand l'objet n'a pas de modèle. On en pose une.
// (Cat. 133705 « Bouilloires », celle du cas réel : Marque FREE_TEXT requise
// avec entrée générique, Modèle FREE_TEXT requis sans entrée générique.)
//
// ⚠️ Le cas « SELECTION_ONLY sans valeur générique » — qui justifierait de
// traiter eBay en `prohibited` comme les cosmétiques sur Leboncoin — n'existe
// sur AUCUNE catégorie du référentiel actuel. Le coder aujourd'hui, c'est
// écrire une branche que rien n'exécute et que rien ne teste. À poser le jour
// où un crawl en fait apparaître une, pas avant.
//
// « Ne s'applique pas » est la formule eBay déjà utilisée pour le MPN (même
// mécanisme, même canal pf.ebayAspects, valeur restant éditable) : sur un
// objet sans marque, elle est VRAIE — il n'y a pas de modèle — là où une
// valeur de la liste serait fausse.
const EBAY_MODELE_SANS_MARQUE = "Ne s'applique pas";
const MARQUE_GENERIQUE_RE = /(sans\s*marque|g[ée]n[ée]rique|unbranded|no\s*brand)/i;

/**
 * Défaut déterministe d'un aspect obligatoire eBay, éventuellement conditionné
 * au contexte de l'article. Une seule fonction, lue par la pose automatique ET
 * par le filtre de resolve_aspects — sinon « Modèle » partirait quand même à
 * l'IA, qui ne peut rien en dire de plus.
 * @param {{name:string, mode?:string}} aspect
 * @param {{marque?:string}} ctx — marque telle qu'elle partira sur eBay
 */
function defautAspectEbay(aspect, ctx = {}) {
  const fixe = EBAY_ASPECT_DEFAULTS[aspect?.name];
  if (fixe) return fixe;
  if (aspect?.name !== "Modèle") return undefined;
  // Liste FERMÉE : on ne peut rien y écrire qui n'y figure pas. On laisse la
  // ligne « manquante » plutôt que d'envoyer une valeur qu'eBay refusera.
  if (aspect.mode === "SELECTION_ONLY") return undefined;
  // ── Règle par FAMILLE (2026-09-02, cas Delavier — même doctrine que
  // l'Univers) : un champ sans SENS pour la famille de l'article reçoit la
  // valeur standard de la plateforme, jamais une question à l'utilisateur.
  // Un LIVRE n'a pas de « Modèle » — même quand une « marque » (l'éditeur)
  // est renseignée, la garde marque-réelle ci-dessous ne doit pas retenir la
  // pose. famille = descripteur FERMÉ de la fiche Lens (v81).
  if (ctx.famille === "livres_medias") return EBAY_MODELE_SANS_MARQUE;
  const marque = String(ctx.marque ?? "").trim();
  // Marque RENSEIGNÉE et réelle : le modèle existe peut-être, il n'appartient
  // pas au serveur de décider qu'il n'y en a pas. Saisie manuelle ou IA.
  if (marque && !MARQUE_GENERIQUE_RE.test(marque)) return undefined;
  return EBAY_MODELE_SANS_MARQUE;
}

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
    // sizeField : arme la garde anti-nombre-nu de findMatchingOption, comme
    // opts.sizeField des content scripts. Mêmes clés que le switch ci-dessous.
    const estTaille = field.key === "taille" || field.key === "size";
    const fromApi = platformFields?.[field.key];
    if (fromApi && fromApi !== "null") {
      result[field.key] = field.type === "select"
        ? (findMatchingOption(fromApi, field.options, { sizeField: estTaille }) || fromApi)
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
      // ISBN lu par le Lens sur la famille livres_medias (2026-08-31) : même
      // repli que modele — il fait arriver la valeur au formulaire y compris
      // sur un job généré AVANT le redéploiement de generate-listing.
      case "isbn":        lensVal = lensResult?.attributs_visibles?.isbn_ean ?? null; break;
      default:            lensVal = null;
    }
    result[field.key] = lensVal
      ? (field.type === "select"
          ? (findMatchingOption(lensVal, field.options, { sizeField: estTaille }) || "")
          : lensVal)
      : "";
    // Aucune source n'a donné l'état (IA, Lens, ligne de stock) — ou en a donné
    // un que la plateforme ne connaît pas : défaut. L'utilisateur voit la valeur
    // dans le select et peut la changer avant de publier.
    if (isConditionKey(field.key) && !result[field.key])
      result[field.key] = defaultConditionFor(field);
  }
  return result;
}

// ── Provenance du modèle (2026-07-28) ─────────────────────────────────────────
// lens-analysis renvoie désormais `modele_source` : "lue" (référence
// physiquement déchiffrée sur une photo), "reconnue" (produit identifié par sa
// forme), "web" (référence ramenée d'une recherche), null (inconnue ou hors
// énumération). SEULE "lue" alimente directement les champs structurés.
// Tout le reste demande une CONFIRMATION de l'utilisateur — il a l'objet en
// main, c'est un tap — parce qu'une référence fausse dans le champ Modèle
// Vinted ou dans un aspect eBay sort l'annonce des bonnes recherches ET la met
// dans les mauvaises. Preuve : la même G-Shock GA-2100 est ressortie
// « GA-2100 », puis sans modèle, puis « GD-100 » sur trois scans payants.
// null est inclus dans « à confirmer » : une source absente n'est pas un
// passe-droit — ça couvre aussi les brouillons d'AVANT le 28/07 (un tap de
// plus, jamais une valeur fausse de plus).
const MODELE_SOURCE_SURE = "lue";
const modeleDoitEtreConfirme = (lensResult) =>
  !!(lensResult?.modele) && lensResult?.modele_source !== MODELE_SOURCE_SURE;

// Une référence fabricant est un CODE, jamais une phrase — MÊME règle que la
// validation serveur de lens-analysis (6 mots / 50 caractères / pas de point
// final). Filet CLIENT pour les analyses produites AVANT le 28/07, dont le blob
// lensResult persisté peut encore porter « Poinçons de contrôle qualité
// visibles au dos… » et l'injecter dans un aspect eBay en saisie libre.
function assainirAttributsVisibles(attributs) {
  if (!attributs || typeof attributs !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(attributs)) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s || s.toLowerCase() === "null") continue;
    if (k === "reference_fabricant" &&
        (s.length > 50 || s.endsWith(".") || s.split(/\s+/).filter(Boolean).length > 6)) continue;
    out[k] = s;
  }
  return Object.keys(out).length ? out : null;
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

      {/* Pas de capture="environment" (2026-07-21) : il FORÇAIT la caméra sur
          iOS/Android et masquait la photothèque (et cassait `multiple`). Sans
          lui, la feuille native propose Photothèque + Prendre une photo. Desktop
          inchangé (capture y est ignoré). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
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
            onClick={() => IS_ANDROID
              ? pickPhotosAndroid(MAX - count, onAdd, () => fileRef.current?.click())
              : fileRef.current?.click()}
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

function StepPhotos({ photos, onAddPhotos, onRemovePhoto, onReorderPhotos, onPhotoClick, photoOption, setPhotoOption, background, setBackground, selected, setSelected, coinPrices, reuseRetouched = false, retoucheNewCount = 0, platformSupport, publishedSet, queuedSet, lang,
  modeleAConfirmer = false, modelePropose = null, modeleSource = null, onConfirmModele = null, identifyFailed = false,
  onAnalyze, analyzing, analysisResult, analysisError, analysisHidden }) {
  const { t, tpl } = useTranslation(lang);
  const addRef = useRef();
  const MAX = MAX_PHOTOS;
  const drag = usePhotoDrag(onReorderPhotos);

  // Bascule quotas (02/09) : le niveau AVANCÉ est SUPPRIMÉ du produit — il ne
  // reste que la légère, renommée « Retouche IA » partout (serveur : un vieux
  // client qui enverrait encore ia_advanced est dégradé en douceur vers la
  // légère par generate-listing). Le choix de fond (avancé uniquement) meurt
  // avec lui. Deux options, plus de prix affiché (les gestes se comptent au
  // forfait, pas en unités).
  const retouchOptions = [
    {
      id: "ia_light",
      label: lang === "fr" ? "Retouche IA" : "AI touch-up",
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

      {/* Pas de capture="environment" (2026-07-21) : cf. StepUpload — laisse
          l'utilisateur choisir dans la photothèque, pas seulement l'appareil. */}
      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
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
            onClick={() => IS_ANDROID
              ? pickPhotosAndroid(MAX - photos.length, onAddPhotos, () => addRef.current?.click())
              : addRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:12, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      {/* ── Photos déjà retouchées par nous (2026-08-05) ─────────────────────
          Un travail déjà payé ne se repaie pas et ne se refait pas : les
          options de retouche disparaissent, les images existantes repartent
          telles quelles, part photos = 0 — dit en toutes lettres pour que le
          gratuit ne ressemble pas à un bug. Ajouter une nouvelle photo rend
          les options normales (vrai travail neuf, cas tarifaire à trancher). */}
      {reuseRetouched && (
        <div style={{ marginBottom:12, padding:"14px 15px", borderRadius:16, background:"#E7F3F0", border:`1px solid ${T.teal}` }}>
          <div style={{ fontSize:14, fontWeight:600, color:T.tealDeep, display:"flex", alignItems:"center", gap:6 }}>
            ✨ {lang === "en" ? "Photos already retouched" : "Photos déjà retouchées"}
          </div>
          <div style={{ fontSize:12, marginTop:3, lineHeight:1.45, color:T.mute2 }}>
            {lang === "en"
              ? "You already paid for these retouched photos — they'll be reused as they are. Nothing to pay again for photos."
              : "Tu as déjà payé la retouche de ces photos — elles repartent telles quelles. Rien à repayer côté photos."}
          </div>
        </div>
      )}
      {/* Option A (2026-08-05, validée Nico) : nouvelles photos sur un article
          déjà retouché — l'option s'applique aux SEULES nouvelles photos, au
          tarif plein ; les anciennes retouches (déjà payées) sont conservées
          telles quelles et ne repassent pas dans l'IA. */}
      {!reuseRetouched && retoucheNewCount > 0 && (
        <div style={{ marginBottom:10, padding:"10px 13px", borderRadius:12, background:"#E7F3F0", border:"1px solid #CBE5DF", fontSize:12, lineHeight:1.45, color:T.tealDeep, fontWeight:600 }}>
          {lang === "en"
            ? `✨ Retouching of your ${retoucheNewCount} new photo${retoucheNewCount > 1 ? "s" : ""} — the already-retouched ones are kept as they are (nothing to pay again for them).`
            : `✨ Retouche des ${retoucheNewCount} nouvelle${retoucheNewCount > 1 ? "s" : ""} photo${retoucheNewCount > 1 ? "s" : ""} — celles déjà retouchées sont conservées telles quelles (rien à repayer pour elles).`}
        </div>
      )}
      <div style={{ display: reuseRetouched ? "none" : "flex", flexDirection:"column", gap:10, marginBottom:12 }}>
        {retouchOptions.map(o => {
          const active = photoOption === o.id;
          // Suppression unités (03/09) : plus de monnaie interne ni de solde.
          // Le chip n'affiche plus qu'un éventuel « Gratuit » ; un prix > 0
          // ne peut plus exister (coin_config à 0 → null au chargement).
          const price = coinPrices?.[o.id] ?? null;
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
                {price === 0 && (
                  <span style={{
                    fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                    color:T.tealDeep, background:"#E7F3F0",
                    border:"1px solid #CBE5DF", padding:"3px 9px", borderRadius:999,
                  }}>
                    {lang === "fr" ? "Gratuit" : "Free"}
                  </span>
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

      {/* ── Identification en échec (2026-07-28) ────────────────────────────
          Le parcours n'est JAMAIS bloqué par un identify raté (erreur API,
          timeout, plafond global atteint, JSON invalide) — mais on ne fait pas
          semblant que ça a marché. Sans cette mention, generate-listing invente
          à partir d'un contexte vide et l'utilisateur croit lire une analyse de
          ses photos, exactement le comportement qu'on supprime. */}
      {identifyFailed && (
        <div style={{ marginBottom:16, display:"flex", alignItems:"flex-start", gap:8, padding:"10px 12px", borderRadius:12, background:T.chip, border:`1px solid ${T.border}` }}>
          <span style={{ fontSize:14, lineHeight:1.3 }}>ℹ️</span>
          <div style={{ fontSize:12, color:T.mute2, lineHeight:1.45 }}>
            {lang === "en"
              ? "Your photos could not be analysed — check the fields before publishing."
              : "Les photos n'ont pas pu être analysées — vérifie les champs avant de publier."}
          </div>
        </div>
      )}

      {/* ── Modèle à confirmer (2026-07-28) ─────────────────────────────────
          L'IA propose une référence qu'elle n'a PAS lue sur l'objet : elle l'a
          reconnue à la forme, ou ramenée d'une recherche web. Tant que
          l'utilisateur n'a pas tranché, cette valeur ne remplit AUCUN champ
          structuré (Modèle Vinted, aspect eBay) — il a l'objet en main, c'est
          un tap. Une référence absente coûte moins cher qu'une référence
          fausse : une mauvaise ref sort l'annonce des bonnes recherches ET la
          met dans les mauvaises. */}
      {modeleAConfirmer && modelePropose && (
        <div style={{ marginBottom:16, background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:16, padding:"14px 15px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:3 }}>
            {lang === "en" ? "Is this the right model?" : "C'est bien ce modèle ?"}
          </div>
          <div style={{ fontSize:12, color:T.mute2, lineHeight:1.45, marginBottom:10 }}>
            {lang === "en"
              ? `The AI suggests "${modelePropose}"${modeleSource === "web" ? " from a web search" : ""} — it could not read it on the item itself. Confirm it and it goes into the listing fields; otherwise it stays out.`
              : `L'IA propose « ${modelePropose} »${modeleSource === "web" ? " depuis une recherche web" : ""} — elle ne l'a pas lu sur l'article. Confirme et il remplit les champs de l'annonce ; sinon il n'y entre pas.`}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={() => onConfirmModele?.(true)}
              style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:T.tealDeep, color:"#FFFFFF", fontSize:13, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
            >
              {lang === "en" ? "Yes, that's it" : "Oui, c'est ça"}
            </button>
            <button
              onClick={() => onConfirmModele?.(false)}
              style={{ flex:1, padding:"11px", borderRadius:12, border:`1px solid ${T.border}`, background:"#FFFFFF", color:T.mute2, fontSize:13, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
            >
              {lang === "en" ? "No / not sure" : "Non / pas sûr"}
            </button>
          </div>
        </div>
      )}

      {/* ── Analyse photo optionnelle (2026-07-14) ──────────────────────────
          Même moteur que Lens (edge lens-analysis) : deux entrées, un seul
          moteur. Le débit des unités, le quota et le 402 sont gérés côté
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
                  : (lang === "en" ? "Analyze my photos" : "Analyser mes photos")}
              </button>
            </>
          )}
        </div>
      )}


      <Eyebrow>{t("stepPhotosPlatformsLabel")}</Eyebrow>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:2 }}>
        {PLATFORMS_DEFAULT.map(p => {
          const isOn = selected.has(p);
          // Compat catégorie × plateforme (src/utils/platformCompat.js,
          // dérivée des 4 mappings) : une plateforme qui ne peut pas vendre
          // cette catégorie est GRISÉE (désactivée, non cliquable), avec le
          // motif affiché sous la rangée — pas juste décochée.
          const support = platformSupport?.[p] ?? "supported";
          // Déjà en ligne : verrouillée au même titre qu'une catégorie non
          // supportée. FillSell ne repasse jamais sur une annonce publiée — la
          // seule action possible sur cette plateforme est le retrait, depuis
          // la carte du Stock.
          const dejaEnLigne = publishedSet?.has(p) ?? false;
          // Job publish encore en file (pending/processing) : même verrou que
          // « déjà en ligne » — la garde serveur already_published refuserait le
          // job de toute façon — mais libellé DISTINCT : l'annonce n'est pas
          // encore en ligne, dire « en ligne » serait mentir sur l'état.
          const enCours = !dejaEnLigne && (queuedSet?.has(p) ?? false);
          const disabled = support !== "supported" || dejaEnLigne || enCours;
          return (
            <button
              key={p}
              disabled={disabled}
              title={dejaEnLigne
                ? (lang === 'en' ? `Already live on ${PLATFORM_LABELS[p]}` : `Déjà en ligne sur ${PLATFORM_LABELS[p]}`)
                : enCours
                ? (lang === 'en' ? `Already being published on ${PLATFORM_LABELS[p]}` : `Publication déjà en cours sur ${PLATFORM_LABELS[p]}`)
                : disabled
                ? supportMessage(t, support, PLATFORM_LABELS[p])
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
              {dejaEnLigne && (
                <span style={{ fontSize:11, fontWeight:600 }}>
                  · {lang === 'en' ? 'live' : 'en ligne'}
                </span>
              )}
              {enCours && (
                <span style={{ fontSize:11, fontWeight:600 }}>
                  · {lang === 'en' ? 'in progress' : 'en cours'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* ── Récap du prix (grille 2 axes, 2026-08-04) ─────────────────────────
          LE point de compréhension : photos une fois (0/9/32 selon l'option) +
          price_per_platform unités par plateforme (coin_config, même prix
          pour tous depuis 2026-08-08). Recalculé à CHAQUE case cochée/décochée et
          à chaque changement d'option — c'est ce total que le CTA Publier
          débitera. Masqué tant que coin_config n'a pas répondu : jamais un
          total faux. */}
      {coinPrices?.per_platform != null && coinPrices?.[photoOption] != null && (
        <div style={{ marginTop:12, padding:"11px 14px", borderRadius:12, background:T.paper, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:T.mute2, lineHeight:1.45 }}>
            {lang === 'en'
              ? <>Photos: {reuseRetouched ? 'already retouched ✓' : (coinPrices[photoOption] === 0 ? 'free' : coinPrices[photoOption])} · Publishing: {coinPrices.per_platform === 0 ? 'free' : <>{selected.size} × {coinPrices.per_platform}</>}</>
              : <>Photos : {reuseRetouched ? 'déjà retouchées ✓' : (coinPrices[photoOption] === 0 ? 'offertes' : coinPrices[photoOption])} · Publication : {coinPrices.per_platform === 0 ? 'offerte' : <>{selected.size} × {coinPrices.per_platform}</>}</>}
          </span>
          <strong style={{ fontSize:13.5, fontWeight:700, color:T.ink, display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
            = {coinPrices[photoOption] + coinPrices.per_platform * selected.size}
          </strong>
        </div>
      )}
      {PLATFORMS_DEFAULT.filter(p => (publishedSet?.has(p) || queuedSet?.has(p))).length > 0 && (
        <p style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {lang === 'en'
            ? "Platforms already live or being published stay untouched — only the remaining ones will be published."
            : "Les plateformes déjà en ligne ou en cours de publication ne sont pas retouchées — seules les manquantes seront publiées."}
        </p>
      )}
      {PLATFORMS_DEFAULT.filter(p => (platformSupport?.[p] ?? "supported") !== "supported").map(p => (
        <p key={p} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {supportMessage(t, platformSupport[p], PLATFORM_LABELS[p])}
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

function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, edited, setEdited, onPhotoClick, onRetry, noteOverride, lang, generatePrice = null,
  price, setPrice, customPriced, setCustomPriced, articleIcon = "📦", photoOption = null,
  onEstimatePrice = null, estimating = false, estimateCost = null, estimateError = "", estimateResult = null,
  prixAchat = null }) {
  const { t, tpl } = useTranslation(lang);
  const platformFieldsConfig = getPlatformFieldsConfig(t);
  const [elapsed, setElapsed] = useState(0);
  const [openCards, setOpenCards] = useState(new Set());
  // (Le repli des sources de l'estimation vit désormais dans AnalyseMarche,
  // partagé avec l'écran Lens — plus d'état local ici.)

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

  // Même classe que le fix « une seule lettre » des encarts de StepPublish
  // (2026-07-30) : visibleFields ne montre un champ NON pertinent pour
  // l'icône que tant qu'il porte une valeur — le VIDER (dernier retour
  // arrière d'une correction) le démontait sous les doigts, focus perdu.
  // Un champ affiché une fois le RESTE pour la vie du composant (ref :
  // mutation idempotente au rendu, pas de re-render déclenché).
  const shownFieldsRef = useRef({});

  // Phase A — loading
  if (generating || (!platformListings && !generateError)) {
    // « Photos originales » : aucune retouche IA ne tourne — ni « Retouche des
    // photos en cours… » ni la promesse des ~1-2 minutes n'ont de sens.
    const noRetouch = photoOption === "original";
    const msg = noRetouch
      ? t("stepGenLoadingMsg2")
      : (elapsed < 20 ? t("stepGenLoadingMsg1") : t("stepGenLoadingMsg2"));
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", textAlign:"center" }}>
        <Loader size={80} thickness={2} icon={Sparkles} iconSize={28} style={{ marginBottom:24 }} />
        <h1 style={{ margin:"0 0 8px", fontSize:19, fontWeight:600, color:T.ink }}>
          {msg}
        </h1>
        <p style={{ margin:0, fontSize:13, lineHeight:1.5, color:T.mute2 }}>
          {noRetouch ? t("stepGenLoadingNoRetouchSubtitle") : t("stepGenLoadingSubtitle")}
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
          {/* La tentative échouée a été remboursée automatiquement côté
              serveur : réessayer est une NOUVELLE génération, au même prix —
              affiché avant le clic, comme sur le CTA du step 1. */}
          {generatePrice != null
            ? <>{t("stepGenRetryButton")} ({generatePrice})</>
            : t("stepGenRetryButton")}
        </button>
      </div>
    );
  }

  // Phase B — review with collapsible cards
  const platforms = [...selected].filter(p => platformListings?.platforms?.[p]);
  // Même seuil que la garde de publication (≥ 1 €) : ce qui est mis en avant
  // ici est exactement ce qui bloquerait plus tard.
  const prixManquant = price == null || String(price).trim() === "" || !(Number(price) >= 1);

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

      {/* ── Prix de vente central ─────────────────────────────────────────────
          Depuis le mode identify (2026-07-28), c'est le SEUL champ qu'une
          identification gratuite ne remplit pas — et la publication reste
          bloquée sous 1 € (garde du 13/07, job 3d194668 parti à price=NULL).
          Cet écran doit donc en faire un moment de vente, pas un message
          d'erreur : champ mis en avant, focus automatique, et juste dessous
          l'accès au scan complet qui, lui, produit un prix. Aucun message
          bloquant ici — la garde ne parle qu'au moment de publier. */}
      <div style={{ marginBottom:16, background:T.paper, border:`1px solid ${prixManquant ? T.teal : T.border}`, borderRadius:16, padding:"14px 15px", boxShadow: prixManquant ? "0 0 0 3px rgba(47,158,144,0.12)" : "none" }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:T.mute, marginBottom:6 }}>
          {t("fieldSalePriceLabel")}
        </div>
        <input
          type="number"
          inputMode="decimal"
          autoFocus={prixManquant}
          value={price ?? ""}
          onChange={ev => applyCentralPrice(ev.target.value)}
          placeholder={prixManquant ? (lang === "en" ? "Your price, in €" : "Ton prix, en €") : "—"}
          style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`1px solid ${prixManquant ? T.teal : T.border}`, fontSize:17, fontWeight:700, fontFamily:"inherit", outline:"none", background:"#fff", color:T.ink, boxSizing:"border-box" }}
        />
        {prixManquant && onEstimatePrice && (
          <>
            <button
              onClick={onEstimatePrice}
              disabled={estimating}
              style={{
                width:"100%", marginTop:10, padding:"11px", borderRadius:12,
                border:`1.5px solid ${T.tealDeep}`, background:"none", color:T.tealDeep,
                fontSize:13, fontWeight:700, fontFamily:"inherit",
                cursor: estimating ? "not-allowed" : "pointer", opacity: estimating ? 0.6 : 1,
                display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
              }}
            >
              {estimating
                ? (lang === "en" ? "Checking the market…" : "Analyse du marché…")
                : <>
                    {lang === "en" ? "Not sure? Estimate" : "Pas sûr du prix ? Estimer"}
                    {estimateCost != null && <> · {estimateCost}</>}
                  </>}
            </button>
            <div style={{ fontSize:11.5, color:T.mute, marginTop:6, lineHeight:1.4 }}>
              {lang === "en"
                ? "Searches actual listings on the same photos and fills the price."
                : "Cherche les annonces réelles sur les mêmes photos et remplit le prix."}
            </div>
          </>
        )}
        {estimateError && (
          <div style={{ fontSize:12, fontWeight:600, color:"#B0645A", marginTop:8 }}>{estimateError}</div>
        )}
        {/* ── L'analyse déjà payée, ICI (2026-07-31) ────────────────────────
            MÊME composant que l'écran Lens, variante « publication » : une
            ligne repliée sous le champ prix, dépliable pour qui veut
            vérifier. Une seule source — la réponse lens-analysis déjà
            facturée — et aucun nouvel appel. Avant, 6 unités de contenu se
            réduisaient ici à une ligne de titre. */}
        {!prixManquant && estimateResult && (
          <AnalyseMarche
            result={estimateResult}
            prixAchat={prixAchat}
            lang={lang}
            variant="publication"
          />
        )}
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
          const fieldConfigsVisible = visibleFields(
            platformFieldsConfig[p] ?? [],
            articleIcon,
            e.platform_fields ?? {}
          );
          // Union sticky (cf. shownFieldsRef) dans l'ordre de la config.
          const shownSet = shownFieldsRef.current[p] ?? (shownFieldsRef.current[p] = new Set());
          for (const f of fieldConfigsVisible) shownSet.add(f.key);
          const fieldConfigs = (platformFieldsConfig[p] ?? []).filter(f => shownSet.has(f.key));
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
                        // genre ET la plateforme de la copie (2026-08-08) :
                        // Bébé → mois ; Fille/Garçon → ans + mois sur
                        // Vinted/LBC/Beebs (grilles réelles, cf.
                        // childAxesForGenre) mais ans SEULEMENT sur eBay
                        // (un axe hors des allowedValues de la catégorie
                        // eBay = garde bloquée, bug 51581 du 15/07) ;
                        // pointures toujours.
                        const copyChildAxes = childAxesForGenre(e.platform_fields?.genre, p)
                          ?? childAxesForGenre(e.platform_fields?.univers, p);
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

// ── Step 3 — Publier (chips + croix) ─────────────────────────────────────────
// (StockToggle supprimé le 2026-07-30 : l'ajout au stock n'est plus affiché du
// tout — toute publication ajoute l'article à l'inventaire, cf. StepPublish.)

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

// ── DOCTRINE « une liste relevée est une SUGGESTION » (2026-07-29) ───────────
// BLOCAGE PROD constaté ce jour : platform_category_aspects, beebs / Marque /
// « Mode > Homme > Accessoires (homme) > Chapeaux et casquettes (homme) » porte
// 60 valeurs — 10 marques populaires puis l'alphabet ARRÊTÉ à « American
// Apparel / Amazonas / Amina / Amisu ». La liste Beebs se charge à la demande
// (scroll/recherche) : l'observatoire n'a relevé que la portion VISIBLE au
// moment de la capture. Toute marque après « Am » (Volcom, Nike, Zara…) tombait
// donc en « valeur hors liste » → chip ✗ → CTA Publier gris. Des CENTAINES de
// marques légitimes, sur 5 catégories, depuis que allowed_values a commencé à
// être rempli (~26/07).
//
// RÈGLE, désormais non négociable et valable pour TOUS les champs de TOUTES les
// plateformes : une liste RELEVÉE (DOM, panneau, refus serveur — tout ce qui
// vient de platform_category_aspects) est une AIDE À LA SAISIE. Elle ne
// constitue JAMAIS une liste blanche. Une valeur absente n'empêche jamais la
// publication : au pire un avertissement, et la saisie libre passe.
// Notre relevé peut être partiel — il ne peut pas prouver qu'une valeur
// n'existe pas.
//
// UNE SEULE exception, et c'est une liste qui n'est PAS relevée : les aspects
// eBay déclarés `mode="SELECTION_ONLY"` par la Taxonomy API. Là, ce n'est pas
// nous qui avons observé une liste, c'est eBay qui DÉCLARE que le champ n'admet
// rien d'autre — et la Taxonomy est exhaustive par contrat. Les aspects eBay
// `FREE_TEXT` (498 requis en base, contre 110 SELECTION_ONLY) redeviennent
// eux aussi non bloquants : eBay dit lui-même que le champ accepte du texte
// libre, le seuil ≤200 qui les traitait en listes fermées était une heuristique
// à nous, contredite par la déclaration d'eBay.
const listeFaitFoi = (platform, mode) => platform === "ebay" && mode === "SELECTION_ONLY";
// Normalisation partagée valeur↔liste (mêmes règles que normalizeFuzzy de
// ebay.js : trim + minuscules + accents retirés).
// Séparateur décimal unifié À LA COMPARAISON (2026-07-20) : Vinted lui-même
// est incohérent d'une catégorie à l'autre — « Hommes > Chaussures > Baskets »
// liste « 38,5 » (VIRGULE), « Femmes > Chaussures > Baskets » liste « 34.5 »
// (POINT). Ce sont deux groupes de tailles distincts chez eux (38 et 7),
// relevés tels quels. Sans unification, une pointure à demi-point ne matche
// jamais la liste de l'autre convention et tombe en « valeur hors liste » sur
// un article correctement renseigné. On normalise donc les DEUX côtés de la
// comparaison, jamais la valeur STOCKÉE : la base garde les libellés exacts
// que Vinted affiche, seul le rapprochement devient tolérant.
// Ciblé chiffre-virgule-chiffre, pas un remplacement global : un libellé qui
// contient une virgule de ponctuation (« Noir, Blanc ») n'est pas touché.
//
// Préfixe « EU » des pointures ignoré À LA COMPARAISON (2026-07-20) : l'app
// génère « EU 38.5 » (sizeShoeOptions, `EU ${half/2}`) là où Vinted liste
// « 38,5 » / « 38.5 » SANS préfixe. Sans ça, TOUTE pointure adulte tombait en
// « Taille — valeur hors liste », y compris les entiers sans décimale
// (« EU 39 », « EU 42 ») — friction apparue le jour où les listes de tailles
// ont été renseignées en base, avant quoi aucune vérification ne tournait.
// Comme pour le séparateur : on ne touche NI la valeur générée, NI le prompt
// generate-listing (« EU N » reste la convention interne, partagée avec les
// tailles enfant et consommée par eBay/LBC/Beebs) — seule la comparaison
// devient tolérante.
// Rogné seulement devant un CHIFFRE (?=\d) et en début de chaîne : « EUR 39 »,
// « Europe » ou un « eu » isolé ne sont pas touchés. La garde ne s'affaiblit
// pas : « EU 99 » reste hors liste, et « EU 34.5 » reste hors liste face à la
// liste homme (qui démarre à 38) — c'est le comportement voulu.
const normAspectVal = s => String(s).trim().toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/(\d),(\d)/g, "$1.$2")
  .replace(/^eu\s+(?=\d)/, "");
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
// `strict` (2026-07-29) : ne vaut plus que pour une liste QUI FAIT FOI (eBay
// SELECTION_ONLY). Partout ailleurs le <select> garde une porte de sortie
// « Autre valeur… » : la liste est un relevé, potentiellement partiel (cas
// Beebs/Marque coupé à « Am »), et un sélecteur fermé sur un relevé partiel
// EMPRISONNE l'utilisateur — c'est exactement ce que la doctrine interdit.
// Pourquoi une option d'échappement plutôt qu'un simple <input list=datalist>
// pour les petites listes : <datalist> n'est PAS supporté par Safari iOS, et
// l'app tourne en Capacitor — on y perdrait toute suggestion sur mobile.
const OTHER_SENTINEL = "__fs_other__";
export function AspectValueInput({ value, allowedValues, strict = false, closedMax = 30, onChange, T, idBase }) {
  const vals = Array.isArray(allowedValues) ? allowedValues : [];
  const n = vals.length;
  const [libre, setLibre] = useState(false);
  const base = { width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  if (n > 0 && (strict || n <= closedMax) && !libre) {
    // Valeur courante hors du relevé : on l'ajoute en tête plutôt que de la
    // faire disparaître du <select> (sinon le champ paraît vide alors que le
    // job porte bien une valeur — « Volcom » effacé sous les yeux).
    const horsListe = value && !vals.some(v => normAspectVal(v) === normAspectVal(value));
    return (
      <select value={value ?? ""}
        onChange={ev => {
          if (ev.target.value === OTHER_SENTINEL) { setLibre(true); return; }
          onChange(ev.target.value);
        }}
        style={{ ...base, background:T.chip, color: value ? T.ink : T.mute }}>
        <option value="">—</option>
        {horsListe && <option value={value}>{value}</option>}
        {vals.map(v => <option key={v} value={v}>{v}</option>)}
        {!strict && <option value={OTHER_SENTINEL}>Autre valeur…</option>}
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

function StepPublish({ selected, setSelected, platformSessions = null, platformListings, publishError, lang, canToggleStock, inventoryFull = false, stockCount = null, stockLimit = FREE_STOCK_LIMIT, prixAchatSaisi, setPrixAchatSaisi, missingSharedFields = [], missingSharedFieldPlatforms = {}, sharedFields = {}, onSharedFieldChange, sharedChildAxes = null, vintedGenreBlocked = false, beebsGenreBlocked = false, ebayRequiredStatus = null, onEbayAspectChange = null, onEbaySharedFieldChange = null, genericRequiredStatus = null, onPlatformAspectChange = null, onPlatformDedicatedChange = null, pausedPlatforms = [], pausedReasons = {}, lbcPhotoCap = null, lbcAdresseManquante = null }) {
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

  // ── FIX « valeurs d'une seule lettre » (2026-07-30) ────────────────────────
  // 8 jobs en base portaient une valeur d'EXACTEMENT un caractère (couleur
  // "V", matière "C"/"V"/"?", marque "B"/"E"/"S") — jamais deux ni trois.
  // Cause : les encarts rouge (champs partagés manquants) et bleu (requis
  // génériques) ne rendaient leurs inputs QUE tant que le champ était
  // manquant/invalide. Or la PREMIÈRE frappe remplit la canonique ET toutes
  // les copies (setSharedField / setPlatformAspect), la liste dérivée se
  // recalcule, et l'input est DÉMONTÉ sous les doigts — focus perdu, la suite
  // du mot part dans le vide. Le démontage étant déterministe à la première
  // frappe, on n'observe JAMAIS 2-3 caractères : c'est la signature du bug.
  // Parade : un champ APPARU dans un encart y RESTE tant que le step est
  // monté (ensembles cumulatifs) — il passe à l'état rempli au lieu de
  // disparaître. Les ensembles se réinitialisent avec le step (état local).
  const [stickyShared, setStickyShared] = useState(() => new Set());
  useEffect(() => {
    if (missingSharedFields.some(k => !stickyShared.has(k))) {
      setStickyShared(prev => new Set([...prev, ...missingSharedFields]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingSharedFields]);
  const sharedFieldsToRender = [...new Set([...stickyShared, ...missingSharedFields])]
    .filter(k => sharedFieldCfg[k]);

  // ⚠️ Depuis le 2026-08-28 (un seul endroit de saisie), le sticky ne capture
  // plus que les aspects BLOQUANTS : ce sont eux — et eux seuls — qui entrent
  // dans l'encart rouge. Un aspect rempli (source "generic" comprise) reste un
  // simple chip ✓/⚠ des encarts bleus, désormais purement informatifs.
  const [stickyGeneric, setStickyGeneric] = useState(() => ({}));
  useEffect(() => {
    if (!genericRequiredStatus) return;
    setStickyGeneric(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [gp, list] of Object.entries(genericRequiredStatus)) {
        const cur = prev[gp] ?? new Set();
        const add = list.filter(a => aspectBloquant(a) && !cur.has(a.key));
        if (add.length) {
          next[gp] = new Set([...cur, ...add.map(a => a.key)]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [genericRequiredStatus]);
  // Un aspect appartient à l'encart ROUGE s'il bloque, ou s'il y est déjà
  // apparu (sticky : l'input ne se démonte jamais sous les doigts, fix
  // « une seule lettre » du 2026-07-30).
  const genericDansRouge = (gp, a) => aspectBloquant(a) || Boolean(stickyGeneric[gp]?.has(a.key));

  // Même motif, même parade pour les aspects eBay : la voie sharedKey
  // (onEbaySharedFieldChange — Marque, Taille, Couleur, Matière) écrit le
  // champ DÉDIÉ, l'aspect passe à "ok" SANS source:"generic", et la ligne
  // sortait du filtre → input démonté à la première frappe.
  const [stickyEbay, setStickyEbay] = useState(() => new Set());
  useEffect(() => {
    if (!ebayRequiredStatus) return;
    const add = ebayRequiredStatus.filter(a => aspectBloquant(a) && !stickyEbay.has(a.name));
    if (add.length) setStickyEbay(prev => new Set([...prev, ...add.map(a => a.name)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebayRequiredStatus]);
  const ebayDansRouge = (a) => aspectBloquant(a) || stickyEbay.has(a.name);

  // ── Encart ROUGE unique (2026-08-28) : TOUT champ bloquant se saisit ici ──
  // Trois sources, un seul endroit de saisie :
  //   · champs partagés manquants (sharedFieldsToRender, cumulatif) ;
  //   · aspects Vinted/LBC/Beebs bloquants (ou sticky) dont le champ partagé
  //     n'est PAS déjà saisi ici — une saisie partagée sert tout le monde,
  //     on ne montre jamais deux inputs pour le même champ logique ;
  //   · aspects eBay bloquants (ou sticky), même règle de déduplication.
  // Les encarts bleus par plateforme restent AFFICHÉS mais purement
  // informatifs (récapitulatif requis + état, aucun input). ⚠️ Leçon RoCotCot
  // (2026-08-11) : chaque input d'ici écrit LES COPIES que lit la garde du
  // CTA (onSharedFieldChange propage, dedicatedTarget prime sur le canal
  // générique) — jamais une valeur qui laisse le bouton gris.
  const sharedRendered = new Set(sharedFieldsToRender);
  const redEbayAspects = onEbayAspectChange
    ? (ebayRequiredStatus ?? []).filter(a =>
        ebayDansRouge(a) && !(a.sharedKey && sharedRendered.has(a.sharedKey)))
    : [];
  const redGenericAspects = onPlatformAspectChange
    ? Object.entries(genericRequiredStatus ?? {}).flatMap(([gp, list]) =>
        list.filter(a => {
          const sk = genericFieldToSharedKey(gp, a.key);
          // Déduplication SEULEMENT si l'input partagé atteint cette
          // plateforme (SHARED_PROPAGATION) : Couleur ne se propage pas à
          // Leboncoin — masquer l'aspect LBC derrière un input qui n'écrit
          // pas sa copie laisserait le CTA gris à vie (classe RoCotCot).
          if (sk && sharedRendered.has(sk) && (SHARED_PROPAGATION[sk] ?? []).includes(gp)) return false;
          return genericDansRouge(gp, a);
        }).map(a => ({ gp, a })))
    : [];
  const redTotal = sharedFieldsToRender.length + redGenericAspects.length + redEbayAspects.length;
  // Restants = ce qui BLOQUE encore (les champs déjà complétés restent
  // affichés par le sticky mais ne comptent plus).
  const redRestants = missingSharedFields.filter(k => sharedFieldCfg[k]).length
    + redGenericAspects.filter(({ a }) => aspectBloquant(a)).length
    + redEbayAspects.filter(aspectBloquant).length;
  // Mise en page : grille 2 colonnes, la DERNIÈRE demi-carte s'étire quand le
  // compte est impair (jamais un trou en bas de l'encart). Les confirmations
  // « valeur unique » sont pleine largeur et sortent du décompte.
  const genSeule = ({ a }) => aspectBloquant(a)
    && Array.isArray(a.allowedValues) && a.allowedValues.length === 1 && Boolean(setSelected);
  const genNonSeule = redGenericAspects.filter(e => !genSeule(e));
  const redDemiIndex = new Map();
  sharedFieldsToRender.forEach((k, i) => redDemiIndex.set(`s:${k}`, i));
  genNonSeule.forEach((e, i) => redDemiIndex.set(`g:${e.gp}:${e.a.key}`, sharedFieldsToRender.length + i));
  redEbayAspects.forEach((a, i) => redDemiIndex.set(`e:${a.name}`, sharedFieldsToRender.length + genNonSeule.length + i));
  const redStretch = (id) =>
    redDemiIndex.get(id) === redDemiIndex.size - 1 && redDemiIndex.size % 2 !== 0
      ? { gridColumn: "1 / -1" } : {};
  // Libellé d'origine uniforme (« · Vinted, Beebs ») pour TOUTES les lignes de
  // l'encart — champs partagés comme aspects propres à une plateforme.
  const redOrigine = (texte) => texte
    ? <span style={{ color:"#B91C1C", fontWeight:600 }}> · {texte}</span>
    : null;

  // ── Inventaire plein (Free) : écran de CONVERSION, pas une erreur ──────────
  // Le CTA du footer devient « Passer au niveau supérieur » (cf. ctaLabel/
  // handleNext dans le composant hôte — libellé neutre : la modale propose
  // Premium ET Pro) ; ici on remplace l'UI de publication entière — les
  // plateformes, champs requis et bandeaux n'ont aucun sens tant qu'aucune
  // place en stock n'existe. Deux blocs seulement : ce qui est atteint (20/20)
  // et la sortie alternative (libérer une place dans le Stock), clairement
  // affichée, jamais cachée — pas de dark pattern. PAS de liste d'avantages
  // ici : la comparaison des plans (grants réels lus en base) appartient à la
  // ConversionModal, cet écran annonce le blocage et les sorties.
  if (inventoryFull) {
    const n = stockCount ?? stockLimit;
    return (
      <div>
        <Eyebrow>{t("stepPublishEyebrow")}</Eyebrow>
        <h1 style={{ margin:"6px 0 16px", fontSize:22, fontWeight:600, color:T.ink }}>
          {lang === "en" ? "Your free stock is complete" : "Ton stock gratuit est complet"}
        </h1>

        {/* 1. Ce qui est atteint — constat neutre, jauge pleine, pas de rouge */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:18, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:T.ink }}>
              {lang === "en" ? "Free plan stock" : "Stock du plan gratuit"}
            </span>
            <span style={{ fontSize:13, fontWeight:700, color:T.teal }}>
              {Math.min(n, stockLimit)}/{stockLimit} {lang === "en" ? "items" : "articles"}
            </span>
          </div>
          <div style={{ height:8, borderRadius:99, background:T.chip, overflow:"hidden", marginBottom:12 }}>
            <div style={{ width:"100%", height:"100%", background:T.teal }} />
          </div>
          <div style={{ fontSize:13.5, color:T.ink, lineHeight:1.6 }}>
            {lang === "en"
              ? `Your listings are ready — all that's missing is a stock slot. Every listing adds the item to your inventory, and the free plan holds ${stockLimit} active items.`
              : `Tes annonces sont prêtes — il ne manque qu'une place en stock. Chaque publication ajoute l'article à ton inventaire, et le plan gratuit s'arrête à ${stockLimit} articles actifs.`}
          </div>
        </div>

        {/* 2. La sortie alternative — rester en gratuit est un choix respecté */}
        <div style={{ fontSize:12.5, color:T.mute2, lineHeight:1.6, marginBottom:12 }}>
          {lang === "en"
            ? "Prefer to stay on the free plan? Free up a slot from the Stock tab (delete an item, or mark one as sold), then come back — your listings will still be here."
            : "Tu préfères rester en gratuit ? Libère une place depuis l'onglet Stock (supprime un article, ou marque-en un vendu), puis reviens — tes annonces t'attendent ici."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>{t("stepPublishEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 16px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepPublishTitle")}
      </h1>

      {/* Sessions plateformes (chantier onboarding 2026-07-27) : relevé des
          sondes de l'extension (profiles.extension_sessions). INFORMATIF
          seulement — on ne bloque jamais la publication. On n'affiche que ce
          qu'on SAIT : true → vert, false → rouge avec lien de connexion,
          null/périmé → rien (jamais de fausse assurance, cas Beebs SPA). */}
      {/* Plafond photos Leboncoin (2026-08-10) : au-delà du quota gratuit de la
          catégorie, Leboncoin facture un pack photos et son dernier écran perd
          son chemin gratuit — la publication échouait alors sans explication.
          On envoie les N premières et on le dit AVANT le clic. Informatif :
          ça ne bloque jamais la publication. */}
      {/* Adresse de remise absente (2026-08-10) : Leboncoin et Beebs la
          réclament à chaque dépôt et échouaient APRÈS le débit, dans le content
          script. On le dit ici, AVANT le clic, et ces plateformes sortent du
          lot publié (handlePublish) — les autres partent normalement.
          Affiché uniquement sur une lecture ABOUTIE : tant qu'on ne sait pas,
          la prop vaut null et rien ne change. */}
      {lbcAdresseManquante && (
        <div style={{ padding:"11px 14px", background:"#FDF6E3", border:"1px solid #EBD9A8", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#8A6100" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en"
              ? `Pickup address missing — ${lbcAdresseManquante.plateformes.map(p => PLATFORM_LABELS[p] ?? p).join(" and ")} won't be published`
              : `Adresse de remise manquante — ${lbcAdresseManquante.plateformes.map(p => PLATFORM_LABELS[p] ?? p).join(" et ")} ne partira pas`}
          </div>
          {lang === "en"
            ? <>These marketplaces ask for a pickup address on every listing, and it isn't filled in yet. Open <strong>Settings ⚙️ → “Leboncoin pickup address”</strong>, enter your street, postal code and city, save, then come back. Nothing is charged for them in the meantime — the other selected marketplaces publish as usual.</>
            : <>Ces plateformes réclament une adresse de remise à chaque annonce, et elle n'est pas encore renseignée. Va dans <strong>Réglages ⚙️ → « Adresse de remise Leboncoin »</strong>, saisis ta rue, ton code postal et ta ville, enregistre, puis reviens. Rien ne t'est débité pour elles en attendant — les autres plateformes cochées partent normalement.</>}
        </div>
      )}

      {lbcPhotoCap && (
        <div style={{ padding:"11px 14px", background:"#FDF6E3", border:"1px solid #EBD9A8", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#8A6100" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en"
              ? `Leboncoin: only ${lbcPhotoCap.quota} free photos in this category`
              : `Leboncoin : ${lbcPhotoCap.quota} photos gratuites seulement dans cette catégorie`}
          </div>
          {lang === "en"
            ? `Your item is filed under “${lbcPhotoCap.categorie}”, where Leboncoin includes ${lbcPhotoCap.quota} photos and charges for the rest. Only the first ${lbcPhotoCap.quota} of your ${lbcPhotoCap.total} photos will be sent — the other platforms get all ${lbcPhotoCap.total}. Reorder them at the photos step if you want different ones.`
            : `Ton article est rangé en « ${lbcPhotoCap.categorie} », où Leboncoin n'inclut que ${lbcPhotoCap.quota} photos et fait payer les suivantes. Seules les ${lbcPhotoCap.quota} premières de tes ${lbcPhotoCap.total} photos partiront — les autres plateformes reçoivent bien les ${lbcPhotoCap.total}. Remets-les dans l'ordre à l'étape photos si tu préfères en envoyer d'autres.`}
        </div>
      )}

      {platformSessions && chips.some(p => platformSessions[p] === false) && (
        <div style={{ padding:"11px 14px", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#8C2F28" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en" ? "Not signed in on some platforms" : "Connexion manquante sur certaines plateformes"}
          </div>
          {chips.filter(p => platformSessions[p] === false).map(p => (
            <div key={p} style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:"#C0392B", flexShrink:0 }} />
              <span style={{ flex:1 }}>
                {lang === "en"
                  ? `${PLATFORM_LABELS[p] ?? p}: not signed in — the listing will wait until you sign in.`
                  : `${PLATFORM_LABELS[p] ?? p} : non connecté — l'annonce attendra que tu te connectes.`}
              </span>
              <a href={PLATFORM_LOGIN_URLS[p]} target="_blank" rel="noopener noreferrer"
                style={{ fontWeight:700, color:"#8C2F28", textDecoration:"underline", textUnderlineOffset:2, whiteSpace:"nowrap" }}>
                {lang === "en" ? "Sign in" : "Se connecter"}
              </a>
            </div>
          ))}
        </div>
      )}
      {platformSessions && chips.some(p => platformSessions[p] === true) && !chips.some(p => platformSessions[p] === false) && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {chips.filter(p => platformSessions[p] === true).map(p => (
            <span key={p} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:999, background:"#E7F3F0", border:"1px solid #BFDCD5", fontSize:12, fontWeight:600, color:"#1B6E62" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:"#2F9E90" }} />
              {(PLATFORM_LABELS[p] ?? p)} {lang === "en" ? "signed in" : "connecté"}
            </span>
          ))}
        </div>
      )}

      {/* Bandeau de maintenance (Phase B) : une plateforme sélectionnée est en
          pause. Ton NEUTRE/info (pas rouge), rassurant, aucune action requise.
          La plateforme reste sélectionnée : le job partira automatiquement dès
          rétablissement. */}
      {pausedChips.map(p => (
        <div key={p} style={{ padding:"11px 14px", background:"#EFF3F8", border:"1px solid #C7D6E5", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.5, color:"#334155", display:"flex", gap:9, alignItems:"flex-start" }}>
          <Clock size={16} color="#64748B" style={{ flexShrink:0, marginTop:1 }} />
          <span>{pausedReasons[p] || tpl("stepPublishMaintenanceBanner", { platform: PLATFORM_LABELS[p] ?? p })}</span>
        </div>
      ))}

      {/* ── Ajout au stock : PLUS UN CHOIX (2026-07-29, UI retirée 2026-07-30)
          Toute publication crée l'article dans l'inventaire, sans question ni
          affichage : le toggle « Ajouter au stock » (montré grisé/coché depuis
          le 29/07) est SUPPRIMÉ de l'écran — `addToStock` vaut true en dur
          dans la logique de publication.
          ⚠️ Le mécanisme anti-doublon reste ENTIER et distinct : un article
          DÉJÀ dans l'inventaire (invId posé par le Stock, ou alreadyInStock
          posé par le Lens) ne doit surtout PAS être recréé au publish —
          canToggleStock = !invId && !alreadyInStock garde ce contrat. */}

      {canToggleStock && (
        <div style={{ marginBottom:20 }}>
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

      {/* Même bandeau pour Beebs (2026-08-13) : genre explicite sans rayon
          Beebs (« Enfant », ou une feuille absente pour ce genre). Sans lui,
          le job partait et échouait côté extension APRÈS débit, avec un
          message qui accusait le genre à tort. */}
      {beebsGenreBlocked && (
        <div style={{ padding:"12px 14px", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:14, marginBottom:12, fontSize:13, color:"#92400E" }}>
          {t("beebsGenreRequired")}
        </div>
      )}

      {/* B1 (2026-07-16) : la liste COMPLÈTE des obligatoires eBay de la
          catégorie résolue, AVANT le clic Publier — plus de « Longueur de
          la robe » découverte via l'échec du job. Présence seule (la
          validation allowedValues reste à la garde du publish).
          ⚠️ INFORMATIF SEULEMENT depuis le 2026-08-28 : plus aucun input ici.
          Tout champ bloquant se saisit dans l'encart ROUGE unique (plus bas) ;
          ce bloc récapitule ce qui est requis par eBay et son état — il montre
          donc TOUTES les lignes, y compris celles que le rouge porte (le chip
          passe ✓ au fil de la saisie faite là-bas). */}
      {ebayRequiredStatus && ebayRequiredStatus.length > 0 && (
        <div style={{ padding:"12px 14px", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, marginBottom:12, fontSize:13, color:T.ink }}>
          <div style={{ fontWeight:600, marginBottom:6, color:"#1D4ED8" }}>{t("stepPublishEbayRequiredTitle")}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ebayRequiredStatus.map(({ name, state, blocking, value }) => {
              // « hors liste » NON bloquant (2026-07-29) : jaune d'avertissement,
              // pas rouge d'erreur — rien n'est cassé, la publication part.
              const avert = state === "invalid" && blocking !== true;
              const bg  = state === "ok" ? "#ECFDF5" : state === "prefilled" ? "#F5F3FF" : avert ? "#FFFBEB" : "#FEF2F2";
              const bd  = state === "ok" ? "#A7F3D0" : state === "prefilled" ? "#DDD6FE" : avert ? "#FDE68A" : "#FECACA";
              const fg  = state === "ok" ? "#047857" : state === "prefilled" ? "#6D28D9" : avert ? "#92400E" : "#B91C1C";
              // Avertissement « hors liste » : on MONTRE la valeur qui part
              // (« Marque : Alphalette — envoyée telle quelle ») — le jargon
              // « absente de la liste qu'on connaît » inquiétait (2026-08-28).
              const avecValeur = avert && String(value ?? "").trim();
              return (
              <span key={name} style={{
                padding:"3px 9px", borderRadius:10, fontSize:12,
                background: bg, border: `1px solid ${bd}`, color: fg,
              }}>
                {state === "ok" ? "✓ " : avert ? "⚠ " : (state === "missing" || state === "invalid") ? "✗ " : ""}{name}
                {avecValeur ? ` : ${String(value).trim()}` : ""}
                {state === "prefilled" ? ` — ${t("stepPublishEbayAspectPrefilled")}` : ""}
                {state === "missing" ? ` — ${t("stepPublishEbayAspectMissing")}` : ""}
                {state === "invalid" ? ` — ${t(avert ? "stepPublishAspectOffListWarn" : "stepPublishEbayAspectInvalid")}` : ""}
              </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Encart générique Vinted/LBC/Beebs (chantier 1.A, 2026-07-16) : les
          requis appris par le catalogue platform_category_aspects, AVANT le
          clic Publier — miroir exact du bloc eBay ci-dessus.
          ⚠️ INFORMATIF SEULEMENT depuis le 2026-08-28 : plus aucun input ici.
          Tout champ bloquant se saisit dans l'encart ROUGE unique (plus bas) ;
          ce bloc récapitule ce que la plateforme exige et son état, TOUTES
          lignes affichées (les chips passent ✓ au fil de la saisie du rouge). */}
      {genericRequiredStatus && Object.entries(genericRequiredStatus).map(([gp, list]) => {
        return list.length > 0 && (
        <div key={gp} style={{ padding:"12px 14px", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, marginBottom:12, fontSize:13, color:T.ink }}>
          <div style={{ fontWeight:600, marginBottom:6, color:"#1D4ED8" }}>
            {tpl("stepPublishGenericRequiredTitle", { platform: PLATFORM_LABELS[gp] ?? gp })}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {list.map(({ key, label, state, blocking, value, prefilledByPlatform }) => {
              // Vinted/LBC/Beebs : blocking est TOUJOURS false ici (aucune de
              // leurs listes ne fait foi) — donc toujours l'avertissement jaune.
              const avert = state === "invalid" && blocking !== true;
              // Champ FERMÉ sans liste relevée (2026-09-02, cas Delavier) : on
              // ne demande rien à l'utilisateur — le chip le DIT (« complété
              // sur la page ») en violet informatif, jamais en rouge.
              const missingDoux = state === "missing" && blocking === false;
              const bg  = state === "ok" ? "#ECFDF5" : (state === "prefilled" || missingDoux) ? "#F5F3FF" : avert ? "#FFFBEB" : "#FEF2F2";
              const bd  = state === "ok" ? "#A7F3D0" : (state === "prefilled" || missingDoux) ? "#DDD6FE" : avert ? "#FDE68A" : "#FECACA";
              const fg  = state === "ok" ? "#047857" : (state === "prefilled" || missingDoux) ? "#6D28D9" : avert ? "#92400E" : "#B91C1C";
              // Même règle que le bloc eBay : la valeur « hors liste » qui
              // part est MONTRÉE (« Marque : Alphalette — envoyée telle
              // quelle ») au lieu du jargon d'implémentation (2026-08-28).
              const avecValeur = avert && String(value ?? "").trim();
              return (
              <span key={key} style={{
                padding:"3px 9px", borderRadius:10, fontSize:12,
                background: bg, border: `1px solid ${bd}`, color: fg,
              }}>
                {state === "ok" ? "✓ " : avert ? "⚠ " : missingDoux ? "◦ " : (state === "missing" || state === "invalid") ? "✗ " : ""}{label}
                {avecValeur ? ` : ${String(value).trim()}` : ""}
                {state === "prefilled"
                  ? ` — ${prefilledByPlatform
                      ? tpl("stepPublishAspectPrefilledByPlatform", { platform: PLATFORM_LABELS[gp] ?? gp })
                      : t("stepPublishGenericAspectPrefilled")}`
                  : ""}
                {missingDoux
                  ? (lang === "en" ? " — filled in on the page" : " — complété sur la page")
                  : state === "missing" ? ` — ${t("stepPublishGenericAspectMissing")}` : ""}
                {state === "invalid" ? ` — ${t(avert ? "stepPublishAspectOffListWarn" : "stepPublishGenericAspectInvalid")}` : ""}
              </span>
              );
            })}
          </div>
        </div>
        );
      })}

      {redTotal > 0 && (
        // ── ENCART ROUGE UNIQUE (refonte 2026-08-28) ─────────────────────────
        // UN SEUL endroit de saisie pour TOUT champ bloquant : champs partagés
        // (canonique propagée à toutes les copies via onSharedFieldChange) ET
        // aspects propres à une plateforme (générique Vinted/LBC/Beebs, eBay).
        // Avant, la taille se saisissait ici et le poids du colis dans le bloc
        // bleu Leboncoin — deux zones pour la même action (cas Ornella).
        // Rendu depuis les listes CUMULATIVES (sticky) et PAS les listes
        // manquantes : un champ en cours de saisie ne doit jamais être
        // démonté à la première frappe (fix « une seule lettre », 30/07).
        // L'encart disparaît quand plus rien ne manque ET que rien n'y a été
        // saisi pendant ce passage (les listes sticky repartent vides au
        // montage du step).
        <div style={{ padding:14, background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:13, color:"#B91C1C", fontWeight:700 }}>
              {t("stepPublishSharedMissingTitle")}
            </span>
            {redRestants > 0 ? (
              <span style={{ flexShrink:0, fontSize:11.5, fontWeight:700, color:"#B91C1C", background:"#FEE2E2", border:"1px solid #FECACA", borderRadius:999, padding:"2px 9px", whiteSpace:"nowrap" }}>
                {lang === "en"
                  ? `${redRestants} to fill in`
                  : `${redRestants} à compléter`}
              </span>
            ) : (
              <span style={{ flexShrink:0, fontSize:11.5, fontWeight:700, color:"#047857", background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:999, padding:"2px 9px", whiteSpace:"nowrap" }}>
                {lang === "en" ? "✓ all set" : "✓ tout est complété"}
              </span>
            )}
          </div>
          <div style={{ fontSize:12, color:"#991B1B", lineHeight:1.45, margin:"4px 0 12px" }}>
            {lang === "en"
              ? "Everything is filled in here — the platform cards above only recap what each one will receive."
              : "Tout se complète ici — les encarts par plateforme au-dessus récapitulent seulement ce que chacune recevra."}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {sharedFieldsToRender.map((key) => {
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
              // Origine : la/les plateforme(s) sélectionnée(s) qui exigent ce
              // champ (ex. « Vinted, Beebs ») — pour que l'utilisateur sache
              // pourquoi « Taille » est demandé.
              const originLabel = missingSharedFieldPlatforms[key];
              return (
                <div key={key} style={redStretch(`s:${key}`)}>
                  <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
                    {field.label}
                    {redOrigine(originLabel)}
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
            {/* Aspects Vinted/LBC/Beebs bloquants — saisie déplacée ici depuis
                les encarts bleus (2026-08-28). Valeur catalogue UNIQUE
                (2026-07-19, cas Medik8) : ni sélecteur à une option, ni pose
                silencieuse — confirmation explicite ; « Non » décoche la
                plateforme, le job n'est jamais créé. */}
            {redGenericAspects.map(({ gp, a }) => {
              const seule = genSeule({ a }) ? a.allowedValues[0] : null;
              if (seule) return (
                <div key={`g:${gp}:${a.key}`} style={{ gridColumn:"1 / -1", padding:"10px 12px", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12 }}>
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
                <div key={`g:${gp}:${a.key}`} style={redStretch(`g:${gp}:${a.key}`)}>
                  <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
                    {a.label}
                    {redOrigine(PLATFORM_LABELS[gp] ?? gp)}
                  </div>
                  <AspectValueInput
                    value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
                    allowedValues={a.allowedValues}
                    strict={false}
                    // ⚠️ dedicatedTarget PRIME TOUJOURS (2026-08-11) : le canal
                    // générique est IGNORÉ par les handlers pour les clés déjà
                    // servies par un mapping dédié (handledForKeys leboncoin.js,
                    // handledLabels beebs.js). Écrire le champ dédié sert les
                    // trois plateformes ET remplit la copie que lit la garde du
                    // CTA — c'est ce décalage qui laissait « ✓ Taille » au vert
                    // avec un bouton Publier mort (cas RoCotCot du 11/08).
                    onChange={v => (a.dedicatedTarget && onPlatformDedicatedChange)
                      ? onPlatformDedicatedChange(gp, a.dedicatedTarget, v)
                      : onPlatformAspectChange(gp, a.key, v)}
                    T={T}
                    idBase={`gen-${gp}-${aspectSlug(a.key)}`}
                  />
                </div>
              );
            })}
            {/* Aspects eBay bloquants — même déménagement. La voie sharedKey
                écrit le champ DÉDIÉ (et la canonique si elle était vide, cf.
                setEbaySharedField) ; select imposé pour toute liste FERMÉE au
                sens de la garde (SELECTION_ONLY / ≤ EBAY_CLOSED_LIST_MAX). */}
            {redEbayAspects.map(a => (
              <div key={`e:${a.name}`} style={redStretch(`e:${a.name}`)}>
                <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
                  {a.label ?? a.name}
                  {redOrigine("eBay")}
                </div>
                {/* Sans rapprochement, on montre la VALEUR RÉELLE du job
                    (2026-07-29) : afficher "" laisserait croire à un champ
                    vide alors que la valeur part bien à la publication. */}
                <AspectValueInput
                  value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
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

// ── Générations déjà PAYÉES (2026-08-10) ─────────────────────────────────────
// Le 10/08 au soir : spend_generate -6 à 21:47:08 PUIS -6 à 21:48:18, pour UNE
// seule publication à 21:48:37. 12 unités pour une annonce.
// Mécanique : rouvrir « Publier » sur le même article appelle
// clearStepperPersistence() (StockTab), qui efface le brouillon — donc les
// annonces déjà générées. Le stepper repart vierge et l'effet d'arrivée au
// step 2 relance handleGeneratePlatforms() TOUT SEUL, sans bouton et sans
// confirmation : la deuxième facture part avant que qui que ce soit ait rien
// demandé.
// Réponse : une génération payée est CONSERVÉE à part, hors du brouillon, et
// re-servie si l'on redemande EXACTEMENT la même chose. La signature est
// l'intégralité de la requête (corps envoyé à generate-listing + contenu de la
// fiche article + utilisateur), sérialisée clés triées :
//   · elle est comparée à l'IDENTIQUE, jamais hachée — un hash pourrait
//     collisionner et servir la génération d'un AUTRE article, exactement le
//     genre de contamination que ce code passe son temps à fermer ;
//   · tout champ ajouté un jour au corps entre AUTOMATIQUEMENT dans la
//     signature (parcours générique, pas une liste à tenir à jour) : un oubli
//     futur produit un cache manqué — donc une génération de trop, jamais une
//     génération périmée servie à la place d'une neuve.
// Conséquence directe : modifier l'article, ses photos, ses plateformes, son
// option de retouche, son prix ou ses notes change la signature et REGÉNÈRE.
// Une génération légitime n'est jamais bloquée.
const GENERATION_CACHE_KEY = "fs_stepper_generations";
const GENERATION_CACHE_MAX = 3;             // 3 articles récents suffisent au va-et-vient
const GENERATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function stableStringify(v) {
  if (v === null || v === undefined || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).sort()
    .map(k => JSON.stringify(k) + ":" + stableStringify(v[k]))
    .join(",") + "}";
}

// L'ordre des plateformes vient d'un Set : cocher/décocher les mêmes cases dans
// un autre ordre ne doit pas facturer une seconde génération. Trié ici, et ICI
// SEULEMENT — le corps réellement envoyé n'est pas touché.
function signatureGeneration({ userId, body, src }) {
  try {
    return stableStringify({
      u: userId ?? null,
      body: { ...body, platforms: [...(body?.platforms ?? [])].sort() },
      src: src ?? null,
    });
  } catch { return null; }
}

function lireGenerationCache(signature) {
  if (!signature) return null;
  try {
    const entrees = JSON.parse(sessionStorage.getItem(GENERATION_CACHE_KEY) || "[]");
    if (!Array.isArray(entrees)) return null;
    const e = entrees.find(x => x?.sig === signature);
    if (!e) return null;
    const age = Date.now() - Date.parse(e.at ?? "");
    if (!Number.isFinite(age) || age > GENERATION_CACHE_TTL_MS) return null;
    return e.data ?? null;
  } catch { return null; }
}

function ecrireGenerationCache(signature, data) {
  if (!signature || !data) return;
  try {
    const anciennes = JSON.parse(sessionStorage.getItem(GENERATION_CACHE_KEY) || "[]");
    const reste = (Array.isArray(anciennes) ? anciennes : []).filter(x => x?.sig !== signature);
    const entrees = [{ sig: signature, data, at: new Date().toISOString() }, ...reste]
      .slice(0, GENERATION_CACHE_MAX);
    sessionStorage.setItem(GENERATION_CACHE_KEY, JSON.stringify(entrees));
  } catch {
    // Quota dépassé ou stockage indisponible : on ne casse RIEN. La génération
    // vient d'aboutir et s'affiche ; seul le rattrapage d'une réouverture est
    // perdu — on retombe sur le comportement d'avant ce cache.
  }
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
    // dont la ligne a été créée en cours de route (ajout au stock du publish)
    // et que l'hôte remonte ensuite avec ce nouvel id.
    if ((d.invKey ?? null) !== (invKey ?? null) && (d.invId ?? null) !== (invKey ?? null)) return null;
    return d;
  } catch { return null; }
}

// ── Plafond inventaire du plan gratuit ───────────────────────────────────────
// La VRAIE limite vit dans coin_config.free_stock_limit (lue par le trigger
// check_inventory_limit, migration 20260805040000). Ici : repli d'affichage
// partagé (src/utils/stockLimit.js) pour le premier rendu — le composant lit
// la config en direct (stockLimitCfg) dès qu'elle répond.
const FREE_STOCK_LIMIT = FREE_STOCK_LIMIT_FALLBACK;

export default function ListingPreviewScreen({
  inventaireId, userId, initialPhotos: initialPhotosProp = [], initialListing: initialListingProp = null, supabase, lang, onClose,
  // isBusiness ne pilote AUCUNE gate ici (les flags sont cumulatifs : un
  // Business porte is_pro, toutes les gates isPro/isPremium le couvrent déjà).
  // Il n'est propagé que pour que la modale de conversion NOMME le bon palier
  // et ne propose pas à un Business un upgrade qu'il a déjà (2026-08-09).
  isPremium = false, isPro = false, isBusiness = false, onUpgrade = () => {},
  createStockItem = null, alreadyInStock = false,
  // Parcours identify (2026-07-28) : l'identification gratuite a échoué et le
  // stepper s'ouvre avec des champs vides. On le DIT, discrètement, plutôt que
  // de laisser croire à une analyse réussie.
  identifyFailed = false,
  // Lens unifié (02/09 soir) : annonces DÉJÀ rédigées par le scan (mode
  // "annonce" de lens-analysis, module partagé avec generate-listing). Même
  // forme que la réponse de génération ({ platforms: {...} }) : elles
  // hydratent platformListings, l'étape 2 les AFFICHE sans régénérer (l'effet
  // d'auto-génération ne se déclenche que sur platformListings nul) — le
  // geste n'a coûté qu'une unité, déjà comptée côté serveur.
  annoncePrete = null,
  // Plateformes où cet article est DÉJÀ en ligne (Stock uniquement ; Lens publie
  // toujours du neuf). FillSell ne republie JAMAIS une annonce existante :
  // relancer une plateforme déjà "published" créait un SECOND job pour la même
  // annonce, donc un doublon en ligne. Elles sont donc décochées ET verrouillées.
  alreadyPublished = [],
  // Plateformes à LIBÉRER malgré un job publish resté 'published' (2026-08-05).
  // Cas unique aujourd'hui : `inventaire.disparu_le` posé — la sync du dressing
  // n'a pas retrouvé l'annonce sur Vinted, elle n'existe donc plus et publier
  // n'est pas un doublon mais le SEUL retour en ligne (la republication est
  // fermée aux articles disparus). Sans cette soustraction, le verrou
  // survivrait à la prop : le stepper relit lui-même les jobs et recalculerait
  // 'vinted' comme publiée. Ne vaut que parce que disparu_le est fiable
  // (marquage sauté sur run repris ou relevé incomplet, cf. syncDressing).
  plateformesLiberees = [],
  // Appelé après l'insert réussi des jobs (invId, [plateformes]) : permet au
  // Stock de patcher jobsByInventaire immédiatement (« En cours… » sans
  // attendre le poll de 20 s) — même principe que le retrait par logo et le
  // mini-éditeur needs_user, qui patchent déjà en optimiste.
  onJobsQueued = null,
  // Garde extension (2026-08-04). Tri-état : true = extension JAMAIS vue
  // (profiles.extension_last_seen_at NULL, profil chargé) → le clic Publier
  // ouvre l'écran d'accroche au lieu de tenter le RPC ; false = vue au moins
  // une fois → parcours normal, même si Chrome est fermé en ce moment ;
  // null/undefined = profil pas encore chargé → on ne bloque PAS côté client
  // (le RPC porte la même garde, reason 'extension_required').
  extensionNeverSeen = null,
  // Fraîcheur extension (2026-08-13, bandeau « ordinateur éteint ») : dernier
  // battement serveur connu de l'hôte. Sert UNIQUEMENT à la ligne informative
  // au-dessus du CTA Publier — jamais à bloquer : le bouton reste actif,
  // libellé inchangé, le job part normalement.
  extensionLastSeenAt = null,
  // Photos déjà retouchées PAR NOUS (2026-08-05) : l'article porte au moins
  // une entrée objet du pipeline (enhanced/bg_removed — frontière de propriété
  // a88bded). Un travail déjà payé ne se repaie pas et ne se refait pas : tant
  // qu'aucune NOUVELLE photo n'est ajoutée, l'option retouche disparaît, les
  // images existantes sont réutilisées telles quelles et la part photos est
  // à 0 — dit clairement, jamais un 0 silencieux.
  alreadyRetouched: alreadyRetouchedProp = false,
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

  // ── Anti-contamination entre articles (2026-08-08) ────────────────────────
  // 3e occurrence de la même CLASSE de bug (listing_url les 13 et 19/07) : de
  // l'état « par article » qui vit aussi longtemps que le COMPOSANT, pas que
  // l'article. Ici : retour en arrière après un échec de publication, photos
  // toutes remplacées → la génération repartait avec la FICHE de l'ancien
  // article (inventaire_id conservé) et son analyse (initialListing /
  // photoAnalysis prioritaires dans src) — la poupée ressortait sur des
  // photos de vêtement, generate_listing tournant à images=0 (le texte ne
  // regarde jamais les photos). Principe : les props de l'article d'origine
  // sont neutralisées À LA SOURCE (articleSourceMorte) — tout le composant
  // les lit sous leur nom historique et voit un article vierge, aucun point
  // de lecture à patcher un par un.
  const [articleSourceMorte, setArticleSourceMorte] = useState(draft?.articleSourceMorte ?? false);
  const initialPhotos    = articleSourceMorte ? [] : initialPhotosProp;
  const initialListing   = articleSourceMorte ? null : initialListingProp;
  const alreadyRetouched = articleSourceMorte ? false : alreadyRetouchedProp;
  // Lens unifié : les annonces pré-rédigées suivent le même sort que le reste
  // de la source article — un changement d'article les invalide.
  const annoncesDuScan   = articleSourceMorte ? null : annoncePrete;
  // Photos qui ont nourri la DERNIÈRE analyse de la session : seconde source
  // d'identité de l'article quand il n'est pas arrivé avec des photos.
  const photosAnalyseesRef = useRef(draft?.photosAnalysees ?? null);

  const [step, setStep]         = useState(draft?.step ?? 0);
  const [initializing, setInit] = useState(true);

  // Sessions plateformes relevées par l'extension (profiles.extension_sessions,
  // sondes du background ~10 min — chantier onboarding 2026-07-27). Purement
  // informatif : on n'empêche jamais de publier (choisir 2 plateformes sur 4
  // est légitime). Relevé absent ou périmé → aucun badge, jamais de fausse
  // assurance.
  // RELECTURE PÉRIODIQUE (2026-07-30, faux « Vinted : non connecté » de
  // 21:13) : la lecture unique à l'entrée de l'étape figeait un relevé qui
  // pouvait avoir 30 min — la sonde suivante a écrit true 50 s après le
  // bandeau, jamais relu. Désormais : relecture toutes les 60 s tant que
  // l'étape est affichée + au retour de visibilité, et fenêtre de fraîcheur
  // ramenée à 12 min (throttle sonde 10 min + marge) — un relevé plus vieux
  // n'a plus valeur d'affichage.
  const [platformSessions, setPlatformSessions] = useState(null);
  useEffect(() => {
    if (step !== 3 || !supabase || !userId) return;
    let stale = false;
    const FRESH_MS = 12 * 60 * 1000;
    const lire = () => {
      supabase.from("profiles").select("extension_sessions").eq("id", userId).maybeSingle()
        .then(({ data }) => {
          if (stale) return;
          const s = data?.extension_sessions;
          const fresh = s?.checked_at && (Date.now() - Date.parse(s.checked_at)) < FRESH_MS;
          setPlatformSessions(fresh ? s : null);
        });
    };
    lire();
    const timer = setInterval(lire, 60 * 1000);
    const onVisibilite = () => { if (document.visibilityState === "visible") lire(); };
    document.addEventListener("visibilitychange", onVisibilite);
    return () => {
      stale = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilite);
    };
  }, [step, supabase, userId]);

  // Ligne inventaire liée à cette annonce : peut ne pas encore exister — elle
  // est créée au moment du publish (l'ajout au stock est systématique).
  const [invId, setInvId] = useState(inventaireId || draft?.invId || null);
  // canToggleStock = l'article n'est PAS ENCORE dans l'inventaire (ni invId du
  // Stock, ni alreadyInStock du Lens) : la publication devra créer sa ligne.
  // C'est le mécanisme anti-doublon « déjà dans ton stock » — il survit à la
  // suppression du toggle (2026-07-30) : un article déjà en stock n'est jamais
  // recréé au publish, seul l'affichage de la question a disparu.
  const canToggleStock = typeof createStockItem === "function" && !invId && !alreadyInStock;
  // Ajout au stock : PLUS UN CHOIX depuis le 2026-07-29 — toute publication
  // crée l'article dans l'inventaire. Constante et non plus un état ; depuis le
  // 2026-07-30 plus rien ne l'affiche (toggle retiré de StepPublish).
  const addToStock = true;
  const [prixAchatSaisi, setPrixAchatSaisi] = useState(draft?.prixAchatSaisi ?? "");

  // ── Inventaire plein : blocage COHÉRENT, en écran de conversion (2026-07-30)
  // Avant : le compte Free à 20 articles voyait le CTA « Publier » vert et
  // actif, cliquait, et récoltait un bandeau rouge (INVENTORY_LIMIT remonté par
  // createStockItem) — une erreur pour un état parfaitement prévisible.
  // Maintenant : le compte est relu à l'ENTRÉE de l'étape Publier (miroir de
  // check_inventory_limit : articles NON vendus, cf. FREE_STOCK_LIMIT), et si
  // le plafond est atteint, StepPublish affiche un écran de conversion et le
  // CTA devient « Voir les offres » (ouvre la ConversionModal, trigger stock).
  // Seul le cas où la publication doit CRÉER la ligne est concerné
  // (canToggleStock) : republier un article DÉJÀ en stock n'insère rien, le
  // trigger serveur ne le bloque pas — on ne le bloque pas non plus.
  // Lecture best-effort : en cas d'échec, stockCount reste null → comportement
  // historique (le serveur tranche au publish, bandeau rouge en dernier
  // recours).
  const [stockCount, setStockCount] = useState(null);
  // Limite Free lue en config (source unique serveur, clé free_stock_limit) ;
  // repli 200 partagé. Déclarée ICI (avant inventoryFull qui la lit) — la
  // section unités, plus bas, alimente sa valeur au même fetch coin_config.
  const [stockLimitCfg, setStockLimitCfg] = useState(FREE_STOCK_LIMIT_FALLBACK);
  useEffect(() => {
    if (step !== 3 || !supabase || !userId || !canToggleStock || isPremium || isPro) return;
    let stale = false;
    supabase.from("inventaire")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("statut", "vendu")
      // Miroir de check_inventory_limit VERSION 03/08 (migration
      // 20260803190000) : le dressing Vinted synchronisé est HORS quota, à
      // l'insert comme au comptage. Sans ce filtre, un compte Free avec 15
      // articles synchronisés + 6 saisis à la main voyait ici 21 ≥ 20 et
      // récoltait l'écran « Passer au niveau supérieur » alors que le serveur
      // l'aurait laissé publier. .or : origine <> 'vinted_sync' seul jette
      // aussi les NULL (SQL trivalué), or les articles saisis à la main ont
      // origine NULL.
      .or("origine.is.null,origine.neq.vinted_sync")
      .then(({ count, error }) => {
        if (!stale && !error && typeof count === "number") setStockCount(count);
      });
    return () => { stale = true; };
  }, [step, supabase, userId, canToggleStock, isPremium, isPro]);
  const inventoryFull =
    !isPremium && !isPro && canToggleStock && stockCount != null && stockCount >= stockLimitCfg;

  // Mode dégradé (Phase B) : plateformes en pause (platform_health) → bandeau
  // de maintenance dans StepPublish. Le texte est platform_health.reason
  // affiché TEL QUEL quand il existe (écrit en base, incident par incident,
  // sans redéploiement) ; sinon repli sur le texte générique i18n. Lecture
  // TOLÉRANTE (rafraîchie à l'affichage puis toutes les 60 s) : un échec de
  // lecture ne bloque jamais rien, il masque juste le bandeau.
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  const [pausedReasons, setPausedReasons] = useState({});
  useEffect(() => {
    let alive = true;
    const lire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await supabase.from("platform_health").select("platform, reason").eq("paused", true);
        if (alive) {
          setPausedPlatforms((data ?? []).map(h => h.platform));
          setPausedReasons(Object.fromEntries((data ?? []).map(h => [h.platform, h.reason])));
        }
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
  //
  // ENSEMENCEMENT (2026-07-30, casquette Volcom — prémisse corrigée par Nico) :
  // un article qui ARRIVE avec un scan complet (initialListing = réponse
  // lens-analysis, prix_vente_suggere présent) a déjà UNE estimation, payée.
  // L'app ne peut PAS relancer un scan sur une analyse déjà faite (Estimer
  // n'existe que sans prix, la carte Analyser est masquée — les « deux scans »
  // du 30/07 étaient deux uploads volontaires des mêmes photos). Le vrai
  // défaut : 6 unités de contenu réduites à une ligne, le stepper laissait
  // photoAnalysis null et n'affichait rien du marché. On rend la donnée
  // disponible à l'affichage — aucun nouvel appel, la réponse déjà payée.
  const [photoAnalysis, setPhotoAnalysis] = useState(
    draft?.photoAnalysis
    ?? (initialListing?.prix_vente_suggere != null ? initialListing : null)
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // ── Modèle à confirmer (2026-07-28) ───────────────────────────────────────
  // Tri-état : null = pas encore tranché (la carte s'affiche, le modèle est
  // RETENU hors des champs structurés), true = confirmé par l'utilisateur
  // (le modèle redevient une valeur de plein droit), false = refusé (modèle
  // définitivement écarté, carte masquée).
  const [modeleConfirme, setModeleConfirme] = useState(draft?.modeleConfirme ?? null);
  const modeleAConfirmer = modeleDoitEtreConfirme(initialListing) && modeleConfirme === null;
  // Copie du résultat Lens telle que la voient les champs structurés et les
  // micro-appels resolve_aspects : le `modele` non confirmé y est retiré, et
  // les attributs lus repassent par le filtre MPN. C'est le SEUL objet qui doit
  // atteindre platform_fields.modele et le contexte des aspects eBay.
  const lensPourChamps = useMemo(() => {
    if (!initialListing) return initialListing;
    const modeleUtilisable = modeleDoitEtreConfirme(initialListing) ? modeleConfirme === true : true;
    return {
      ...initialListing,
      modele: modeleUtilisable ? initialListing.modele : null,
      attributs_visibles: assainirAttributsVisibles(initialListing.attributs_visibles),
    };
  }, [initialListing, modeleConfirme]);

  // Step 1 — option de retouche
  // Bascule quotas (02/09) : le niveau AVANCÉ n'existe plus — un brouillon ou
  // un défaut qui portait ia_advanced est ramené sur la Retouche IA (légère).
  // Free = 0 retouche au forfait → défaut original.
  const [photoOption, setPhotoOption] = useState(() => {
    // annoncesDuScan : le scan unifié a déjà tout rédigé SANS retouche — le
    // défaut est « original » pour que le choix affiché dise la vérité. Si
    // l'utilisateur sélectionne une retouche, handleNext (step 1) abandonne la
    // rédaction pré-générée et repasse par la génération classique (qui
    // applique la retouche et compte sa propre unité, comme avant la fusion).
    const brut = draft?.photoOption ?? (annoncesDuScan ? "original" : (alreadyRetouched ? "original" : (isPremium || isPro ? "ia_light" : "original")));
    return brut === "ia_advanced" ? "ia_light" : brut;
  });
  // Nouvelles photos PRÉSENTES dans la session (step 0 ou step 1) : le gel
  // « déjà retouchées » ne vaut que pour les images existantes — dès qu'un
  // vrai travail neuf entre, les options payantes réapparaissent (option A).
  // DÉRIVÉ de l'état réel des photos, pas un drapeau collant : ajouter une
  // photo par erreur puis la RETIRER re-engage le gel — sinon l'utilisateur
  // pouvait payer 9/32 pour un lot où plus rien n'était à retoucher (les
  // réutilisées, déjà sous /enhanced/, auraient même passé la garde
  // « retouche livrée » du RPC).
  const addedNewPhotos = alreadyRetouched && photos.some(u => !initialPhotos.includes(u));
  const reuseRetouched = alreadyRetouched && !addedNewPhotos;
  useEffect(() => {
    // Un brouillon peut porter ia_light/ia_advanced d'avant le gel : on le
    // ramène à « réutiliser » tant que le gel s'applique.
    if (reuseRetouched && photoOption !== "original") setPhotoOption("original");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuseRetouched, photoOption]);
  // Choix de fond — ia_advanced uniquement (voir StepPhotos). "original" = fond
  // d'origine conservé. Envoyé à generate-listing via le paramètre `background`.
  const [background, setBackground] = useState(draft?.background ?? "original");

  // Step 2 — résultats generate-listing
  const [generatingPlatforms, setGeneratingPlatforms] = useState(false);
  const [platformError, setPlatformError]             = useState("");
  const [platformListings, setPlatformListings]       = useState(draft?.platformListings ?? null);
  const [processedPhotos, setProcessedPhotos]         = useState(draft?.processedPhotos ?? []);
  const [edited, setEdited]                           = useState(draft?.edited ?? {});

  // ── Lens unifié : application des annonces pré-rédigées (02/09 soir) ──────
  // Ouverture FRAÎCHE (pas de brouillon) avec des annonces déjà rédigées par
  // le scan : on les applique via appliquerGeneration — le MÊME chemin qu'une
  // génération fraîche ou re-servie du cache (edited, champs partagés, genre
  // transposé…), jamais un troisième chemin recopié. photos: initialPhotos —
  // aucune retouche n'a eu lieu, les photos du scan sont celles à publier.
  // L'étape 2 les affiche sans régénérer (l'effet d'auto-génération ne se
  // déclenche que sur platformListings nul) ; l'unité du geste est déjà
  // comptée côté serveur (ligne generate_listing source:'lens_unifie').
  const annonceScanAppliqueeRef = useRef(false);
  useEffect(() => {
    if (annonceScanAppliqueeRef.current) return;
    annonceScanAppliqueeRef.current = true;
    if (draft || !annoncesDuScan?.platforms) return;
    const dispo = PLATFORMS_DEFAULT.filter(p => annoncesDuScan.platforms[p]);
    if (!dispo.length) return;
    // lens_unifie : marque l'origine — handleNext (step 1) ne jette que cette
    // hydratation-là si une retouche est finalement choisie.
    appliquerGeneration({ ...annoncesDuScan, lens_unifie: true, photos: [...initialPhotos] }, dispo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bascule d'identité d'article (2026-08-08) ─────────────────────────────
  // Plus AUCUNE photo de l'article d'origine (ou de la dernière analyse) dans
  // la sélection courante = l'utilisateur est reparti sur un AUTRE article
  // dans la même instance du stepper (retour en arrière puis photos toutes
  // remplacées). On repart PROPRE : plus d'identifiant d'inventaire (la fiche
  // de l'ancien article ne doit plus être ni lue ni écrite), plus d'analyse,
  // plus de texte généré, plus de prix hérités. Rejouable : si l'utilisateur
  // change encore d'article après une nouvelle analyse, la bascule refire.
  useEffect(() => {
    const identite = (initialPhotos.length ? initialPhotos : photosAnalyseesRef.current) ?? [];
    if (!identite.length || !photos.length) return;
    if (identite.some(u => photos.includes(u))) return;
    setArticleSourceMorte(true);
    photosAnalyseesRef.current = null;
    setInvId(null);
    setPhotoAnalysis(null);
    setPlatformListings(null);
    setProcessedPhotos([]);
    setEdited({});
    setCustomPriced(new Set());
    setModeleConfirme(null);
    setPrice(null);
    setPrixAchatSaisi("");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);
  // Champs partagés (Sujet 4) : source canonique unique + trace des copies
  // éditées à la main (sacrées : plus jamais resynchronisées).
  const [sharedFields, setSharedFields]     = useState(draft?.sharedFields ?? { taille:"", couleur:"", matiere:"", marque:"" });
  const [sharedOverrides, setSharedOverrides] = useState(() => // { [platform]: Set<fieldKey> }
    draft?.sharedOverrides
      ? Object.fromEntries(Object.entries(draft.sharedOverrides).map(([k, v]) => [k, new Set(v)]))
      : {}
  );

  // Filet autonome (2026-07-25, S7) : la prop alreadyPublished vient du Stock
  // en synchrone, mais (a) le chemin Lens ne la passe pas — il ne charge aucun
  // job, un article déjà en stock re-listé via Lens n'était pas protégé — et
  // (b) le stepper peut s'ouvrir avant la première relecture des jobs côté
  // Stock. Le stepper relit donc LUI-MÊME les jobs de l'article (même calcul
  // computeRemovalInfo), et la publication reste verrouillée tant que cette
  // lecture n'a pas répondu (cf. publishedStateLoaded dans ctaDisabled).
  const [fetchedPublished, setFetchedPublished] = useState(null); // null = lecture pas encore aboutie
  // Plateformes avec un job publish encore en file (pending/processing) pour la
  // même ligne : verrouillées comme les publiées — le RPC les refuserait de
  // toute façon (already_published bloque aussi ces statuts), autant griser le
  // chip plutôt que laisser refaire tout le tunnel pour un refus au bout.
  const [fetchedQueued, setFetchedQueued] = useState([]);
  useEffect(() => {
    if (!invId) { setFetchedPublished([]); setFetchedQueued([]); return; } // article hors stock : rien à relire
    let cancelled = false;
    setFetchedPublished(null);
    setFetchedQueued([]);
    (async () => {
      const { data, error } = await supabase
        .from("cross_post_jobs")
        .select("platform, status, action, created_at")
        .eq("inventaire_id", invId)
        .in("status", ["pending", "processing", "published", "deleted"]);
      if (cancelled) return;
      // Lecture en erreur : on débloque quand même (liste vide) — la garde du
      // RPC spend_coins_and_publish (already_published) reste le filet de
      // vérité, on ne condamne pas la publication sur un aléa réseau.
      const info = error || !data ? null : computeRemovalInfo(data);
      setFetchedPublished(info?.publishedActive ?? []);
      setFetchedQueued(info?.queued ?? []);
    })();
    return () => { cancelled = true; };
  }, [invId, supabase]);
  const publishedStateLoaded = !invId || fetchedPublished !== null;

  // Plateformes déjà en ligne, normalisées : union de la prop (Stock, synchrone)
  // et de la relecture autonome. Recalculées à chaque rendu côté Stock (nouvelle
  // identité de tableau) : on dépend du contenu trié, pas de la référence, sinon
  // les effets ci-dessous tourneraient en boucle.
  // La soustraction s'applique APRÈS l'union : elle doit l'emporter sur la prop
  // ET sur la relecture autonome, sinon le verrou revient par le second chemin.
  const libereesKey = (plateformesLiberees ?? []).slice().sort().join(",");
  const alreadyPublishedKey = [...alreadyPublished, ...(fetchedPublished ?? [])].sort().join(",") + "|" + libereesKey;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const publishedSet = useMemo(() => new Set([...alreadyPublished, ...(fetchedPublished ?? [])].filter(p => !(plateformesLiberees ?? []).includes(p))), [alreadyPublishedKey]);
  // En file (pending/processing) : set SÉPARÉ de publishedSet — même verrou,
  // mais le libellé du chip dit « en cours », pas « en ligne » : tant que
  // l'extension n'a pas traité le job, l'annonce n'existe pas encore.
  const queuedKey = (fetchedQueued ?? []).slice().sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queuedSet = useMemo(() => new Set(fetchedQueued ?? []), [queuedKey]);
  // Union bloquante : tout ce qui interdit un nouveau job publish sur la ligne.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lockedSet = useMemo(() => new Set([...publishedSet, ...queuedSet]), [alreadyPublishedKey, queuedKey]);

  // Step 3 — sélection plateformes (chips) + publication
  // Les plateformes déjà en ligne ou en file ne sont JAMAIS pré-cochées — y
  // compris à la reprise d'un brouillon (une publication a pu aboutir ou
  // partir en file entre-temps).
  const [selected, setSelected]         = useState(() => new Set((draft?.selected ?? PLATFORMS_DEFAULT).filter(p => !lockedSet.has(p))));
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState("");
  const [done, setDone]                 = useState(false);
  // Écran d'accroche extension (2026-08-04). extSeenOverride : le bouton
  // « J'ai installé — vérifier » de l'écran a relu le profil et trouvé un
  // extension_last_seen_at → la garde se lève pour la session sans attendre
  // que l'hôte re-fetche le profil.
  const [showExtGate, setShowExtGate]       = useState(false);
  const [extSeenOverride, setExtSeenOverride] = useState(false);
  const extensionBlocked = extensionNeverSeen === true && !extSeenOverride;
  // ── Fraîcheur au moment de publier (2026-08-13, cas Carla) ────────────────
  // La prop extensionLastSeenAt vient du dernier fetchAll de l'hôte et peut
  // retarder — conclure « ordinateur éteint » sur une valeur périmée serait
  // un faux positif chez quelqu'un dont l'extension tourne. On relit donc la
  // colonne AU MONTAGE (SELECT ciblé, une fois), et la valeur la plus récente
  // des deux fait foi. Informatif seulement : rien n'est jamais bloqué ici.
  const [extSeenRelu, setExtSeenRelu] = useState(null);
  // Session de l'extension refusée (02/09 soir) : stampée par
  // extension-session sur son 401 « jeton relayé mort » — lue ici pour
  // distinguer « session expirée » (l'extension tourne mais ne peut plus
  // travailler, geste réparateur à afficher) d'« ordinateur éteint ».
  const [extSessionRejetee, setExtSessionRejetee] = useState(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("profiles")
          .select("extension_last_seen_at").eq("id", userId).maybeSingle();
        if (alive && data) setExtSeenRelu(data.extension_last_seen_at ?? null);
      } catch { /* best-effort : la prop reste la source */ }
      // SELECT SÉPARÉ, jamais combiné (PostgREST tout-ou-rien) : la colonne
      // vient de la migration 20260902233000 — tant qu'elle n'est pas
      // appliquée, cet échec ne doit pas emporter la lecture de fraîcheur.
      try {
        const { data: rej } = await supabase.from("profiles")
          .select("extension_session_rejetee_at").eq("id", userId).maybeSingle();
        if (alive && rej) setExtSessionRejetee(rej.extension_session_rejetee_at ?? null);
      } catch { /* colonne pas encore posée : état inchangé */ }
    })();
    return () => { alive = false; };
  }, [userId]);
  const extFraicheurPublier = (() => {
    const a = Date.parse(extensionLastSeenAt ?? "");
    const b = Date.parse(extSeenRelu ?? "");
    const best = !Number.isFinite(a) ? (extSeenRelu ?? extensionLastSeenAt)
      : !Number.isFinite(b) ? extensionLastSeenAt
      : a >= b ? extensionLastSeenAt : extSeenRelu;
    return fraicheurExtension(best, extSessionRejetee);
  })();
  // La ligne inventaire a été créée PAR CETTE publication (et non préexistante) :
  // l'écran de fin le dit positivement — l'article est au stock, avec ses
  // photos (retouchées si option IA). Jamais formulé en avertissement.
  const [createdThisRun, setCreatedThisRun] = useState(false);

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
        modeleConfirme,
        photoOption, background,
        platformListings, processedPhotos, edited,
        sharedFields,
        sharedOverrides: Object.fromEntries(Object.entries(sharedOverrides).map(([k, v]) => [k, [...v]])),
        selected: [...selected],
        // Anti-contamination (2026-08-08) : la neutralisation de l'article
        // d'origine et l'identité de la dernière analyse survivent au reload —
        // sinon un remount ressusciterait la fiche morte via les props.
        articleSourceMorte,
        photosAnalysees: photosAnalyseesRef.current,
      }));
    } catch { /* quota plein : le stepper continue, seul le brouillon saute */ }
  }, [initializing, done, step, invId, addToStock, prixAchatSaisi, notes, photos, price,
      customPriced, photoAnalysis, modeleConfirme, photoOption, background, platformListings,
      processedPhotos, edited, sharedFields, sharedOverrides, selected, articleSourceMorte]);

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
    // L'article est passé en plus de l'icône depuis le 2026-08-11 : Leboncoin
    // INTERDIT les cosmétiques consommables (parfums, maquillage, crèmes,
    // soins), et cette interdiction ne se déduit pas de l'icône seule — 81 %
    // des lignes à icône cosmétique de la base n'en sont pas (cartes Pokémon
    // « Mascarade », couleur « crème »). Cf. estCosmetiqueInterditeLbc.
    return getPlatformSupport(icon, {
      titre: initialListing?.titre,
      description: initialListing?.description,
      type: initialListing?.categorie,
    });
  }, [initialListing]);
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(p => platformSupport[p] === "supported"));
      return next.size === prev.size ? prev : next;
    });
  }, [platformSupport]);
  // Même filet pour les plateformes déjà en ligne OU en file : si l'une d'elles
  // bascule en "published" (ou si la relecture révèle un job pending) pendant
  // que le stepper est ouvert, elle sort de la sélection séance tenante. Aucun
  // job ne peut partir vers une annonce existante ou déjà en file.
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(p => !lockedSet.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [lockedSet]);

  // Modale de conversion (solde d'unités insuffisant pour publier)
  const [quotaModal, setQuotaModal] = useState({
    open: false, trigger: "publish", targetTiers: ["premium","pro"],
  });

  // ── Journal du tunnel (2026-08-09) ────────────────────────────────────────
  // Le stepper ouvre SA propre ConversionModal — c'est ici que vit le cas que
  // personne ne voyait : « plus assez d'unités pour publier ». Il ne
  // journalisait rien du tout, alors que c'est l'ouverture la plus fréquente
  // de la modale et la moins volontaire. Même feature que l'app
  // (premium_cta_click, inchangée) ; c'est metadata.declencheur qui dit si
  // l'utilisateur a cliqué ou s'il a buté sur un plafond. Best-effort : jamais
  // bloquer une publication pour une ligne de télémétrie.
  const ouvrirQuotaModal = (origine, etat, declencheur = "automatique") => {
    if (userId) {
      supabase.from("usage_logs")
        .insert({ user_id: userId, feature: "premium_cta_click", metadata: { origine, declencheur } })
        .then(({ error }) => { if (error) console.warn("[tunnel] premium_cta_click non journalisé :", error.message); });
    }
    setQuotaModal({ open: true, ...etat });
  };

  // ── Grille de prix (coin_config) — suppression unités (03/09) ────────────
  // La monnaie interne n'existe plus : le wallet (coin_wallets), le solde et
  // la boutique sont SUPPRIMÉS. coin_config reste la source des quotas et des
  // clés de configuration ; les prix y sont à 0 (→ null ici), donc tous les
  // affichages de coût sont éteints. spend_coins_and_publish reste l'autorité
  // de CRÉATION DES JOBS (quotas serveur) — son nom est historique, il ne
  // débite plus rien (RPC inertes à prix nul, migration 20260902200000).
  const [coinPrices, setCoinPrices] = useState(null);
  const coinPriceFor = (opt) => coinPrices?.[opt] ?? null;
  // Grille à deux axes (2026-08-04) : coinPriceFor rend le prix PHOTOS de
  // l'option (0/9/32, une fois par article) ; la publication coûte EN PLUS
  // price_per_platform unités par plateforme (coin_config — jamais en dur).
  // Le total est la seule somme qui engage l'utilisateur : c'est LUI que
  // lisent le pré-check du step 1, le CTA Publier et la ConversionModal, et il
  // se recalcule à chaque plateforme cochée/décochée.
  // Grille 2026-08-08 : le prix par plateforme est LE MÊME pour tous les
  // paliers — la gratuité Pro du matin est morte le soir même, plus aucun
  // prix conditionné au plan. Le client ne fait qu'AFFICHER coin_config ;
  // spend_coins_and_publish reste la seule autorité de débit.
  const pubUnitPrice = coinPrices?.per_platform ?? null;
  // ── Retouche non livrée ⇒ jamais facturée (2026-08-05 soir) ───────────────
  // Le pipeline retombe photo par photo sur l'original en cas d'échec GPT
  // Image : une option ia_* peut donc livrer ZÉRO retouche. Même détection
  // que le serveur (isRetouchedPhotoEntry ↔ RPC v6) : part photos à 0 dans
  // tous les affichages, et bandeau honnête au-dessus du CTA. Tant que la
  // génération n'a pas eu lieu (processedPhotos vide), le plein tarif
  // s'affiche — on ne promet pas un rabais qu'on ne sait pas encore vrai.
  const retoucheLivree = (processedPhotos ?? []).some(isRetouchedPhotoEntry);
  const retoucheNonLivree = photoOption !== "original"
    && (processedPhotos?.length ?? 0) > 0 && !retoucheLivree;
  const publishTotalFor = (opt, nPlatforms) => {
    const photo = retoucheNonLivree ? 0 : coinPriceFor(opt);
    if (photo == null || pubUnitPrice == null) return null;
    return photo + pubUnitPrice * nPlatforms;
  };

  useEffect(() => {
    supabase.from("coin_config").select("key, value").then(({ data }) => {
      const p = {};
      for (const row of data ?? []) {
        // Bascule quotas (02/09) : un prix à 0 = geste NON facturé → on le
        // pose à null, et TOUS les affichages « (N 🥜) », jauges et
        // pré-checks de solde du stepper s'éteignent d'eux-mêmes (ils
        // testent déjà != null / > 0). Remonter un prix en config les
        // rallume tels quels — c'est la réversibilité.
        if (row.key.startsWith("price_")) p[row.key.slice(6)] = row.value > 0 ? row.value : null;
        if (row.key === "free_stock_limit" && Number.isFinite(row.value)) setStockLimitCfg(row.value);
      }
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
        // `?v=<ts>` : clé de cache CDN neuve par upload — parade au 404 mis en
        // cache (incident Delavier 02/09, détail dans televerserPhotos de
        // LensTab). Le nom de fichier posé aux plateformes n'en dépend pas
        // (urlToFile nomme photo_N.ext sans parser l'URL).
        if (!upErr)
          urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl + `?v=${ts}`);
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
  // lens-analysis débite les unités elle-même (spend_coins_for_lens) et renvoie
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
        // Bascule quotas (02/09) : le refus est le quota de scans du cycle —
        // insufficient_coins est mort (prix à 0), branche retirée.
        if (err?.error === "quota_scan_atteint") {
          // Fenêtre de déploiement seulement (serveur pas encore migré) : la
          // variante 'scans' de la modale n'existe plus, on parle annonces.
          ouvrirQuotaModal("quota_scan", {
            trigger: "quota_geste", targetTiers: ["premium","pro"],
            quotaInfo: { geste: "annonces", plafond: err.plafond, consommes: err.consommes },
          });
          return;
        }
        // Fusion scans+annonces (02/09 soir) : le serveur refuse désormais
        // sous le code UNIQUE du compteur fusionné. Même modale que la
        // génération, geste « annonces ». (quota_scan_atteint ci-dessus =
        // fenêtre de déploiement.)
        if (err?.error === "quota_annonces_atteint") {
          ouvrirQuotaModal("quota_annonces", {
            trigger: "quota_geste", targetTiers: ["premium","pro"],
            quotaInfo: { geste: "annonces", plafond: err.plafond, consommes: err.consommes },
          });
          return;
        }
        throw new Error(err?.error || fnErr.message || t("genericError"));
      }
      if (res?.error) throw new Error(res.error);
      setPhotoAnalysis(res);
      // Identité de l'article = les photos qui ont nourri CETTE analyse. C'est
      // ce relevé que la bascule anti-contamination et la garde de génération
      // comparent à la sélection courante.
      photosAnalyseesRef.current = [...photos];
      // Prix par défaut : la valeur de marché estimée, jamais le prix d'achat.
      if (res?.prix_vente_suggere != null) {
        const estime = res.prix_vente_suggere;
        setPrice(estime);
        // Même propagation que le champ central de StepGeneration (2026-07-28) :
        // l'estimation peut désormais être lancée DEPUIS cet écran, où les
        // cartes plateformes sont déjà rendues. Sans ça, elles affichaient un
        // prix vide alors que le champ central venait de se remplir (la
        // publication, elle, retombait bien sur le prix central).
        // Une carte au prix personnalisé n'est jamais écrasée.
        setEdited(prev => {
          const next = { ...prev };
          for (const p of Object.keys(next)) {
            if (customPriced.has(p)) continue;
            next[p] = { ...next[p], price: estime };
          }
          return next;
        });
      }
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
      // `?v=<ts>` : même parade anti-404-en-cache que handleUpload.
      if (!upErr)
        urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl + `?v=${ts}`);
    }
    if (urls.length) setPhotos(prev => [...prev, ...urls]);
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Génération plateformes ────────────────────────────────────────────────
  async function handleGeneratePlatforms() {
    // Garde d'identité (2026-08-08, même doctrine que requireTitle posé après
    // les contaminations de listing_url des 13 et 19/07) : générer avec le
    // contexte d'un AUTRE article est pire qu'un refus. Normalement
    // inatteignable — la bascule anti-contamination a déjà nettoyé — gardée en
    // ceinture-bretelles : si un contexte d'article (fiche, analyse) est armé
    // alors qu'aucune de ses photos n'est dans la sélection, on refuse.
    const identiteArticle = (initialPhotos.length ? initialPhotos : photosAnalyseesRef.current) ?? [];
    if ((invId || photoAnalysis || initialListing)
        && identiteArticle.length && photos.length
        && !identiteArticle.some(u => photos.includes(u))) {
      setPlatformError(lang === "en"
        ? "These photos don't match the analyzed item. Nothing was generated — go back to the first step and re-run the analysis for this new item."
        : "Ces photos ne correspondent plus à l'article analysé. Rien n'a été généré — reviens à la première étape et relance l'analyse pour ce nouvel article.");
      return;
    }
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
        // État LU par le Lens (2026-07-29). Seule source : etat_estime — la
        // table inventaire ne porte pas l'état (statut vaut stock|vendu, c'est
        // autre chose). Depuis le 29/07 la valeur est garantie dans la liste
        // fermée des 5 états (validation serveur lens-analysis), ce qui rend
        // le rapprochement vers la liste de chaque plateforme fiable.
        etat:        initialListing?.etat_estime ?? photoAnalysis?.etat_estime ?? null,
        // ISBN LU par le Lens (2026-08-31). Il vit dans le sac d'attributs de
        // la famille livres_medias (attributs_visibles.isbn_ean) et n'avait
        // AUCUN chemin vers l'annonce : le Lens l'affichait dans sa fiche, le
        // stepper le réclamait quand même en rouge, et il fallait retaper à la
        // main treize chiffres déjà déchiffrés et déjà payés.
        isbn:        initialListing?.attributs_visibles?.isbn_ean ?? photoAnalysis?.attributs_visibles?.isbn_ean ?? null,
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
      const corps = {
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
            etat:    src.etat,
            isbn:    src.isbn,
          },
          photos,
          platforms,
          photo_option: photoOption,
          // Fond pris en compte uniquement en ia_advanced (le backend l'ignore
          // sinon, mais on n'envoie même pas une valeur trompeuse hors avancé).
          background: photoOption === "ia_advanced" ? background : "original",
          price,
          // Option A (2026-08-05) : photos déjà retouchées CONSERVÉES telles
          // quelles — l'IA ne retraite que les nouvelles, au tarif plein de
          // l'option. Les verrouillées ne consomment pas le budget retouche.
          ...(alreadyRetouched && photoOption !== "original"
            ? { locked_photos: photos.filter(u => initialPhotos.includes(u)) }
            : {}),
          ...(notes ? { notes } : {}),
      };
      // Génération déjà payée pour EXACTEMENT cette demande : on la re-sert au
      // lieu de la refacturer. `src` entre dans la signature en plus du corps :
      // quand invId est présent, le corps ne porte que l'identifiant et c'est
      // le SERVEUR qui relit la fiche (titre, marque, description, type,
      // prix_vente) — modifier l'article puis rouvrir « Publier » doit
      // regénérer, pas ressortir le texte de l'ancienne version.
      const signature = signatureGeneration({ userId, body: corps, src });
      const dejaPayee = lireGenerationCache(signature);
      if (dejaPayee) {
        appliquerGeneration(dejaPayee, platforms);
        return; // aucun appel, aucun débit — le `finally` rend la main
      }
      const { data, error: fnErr } = await supabase.functions.invoke("generate-listing", {
        body: corps,
      });
      if (fnErr) {
        // 402 insufficient_coins (course : solde consommé entre le pré-check
        // client du step 1 et cet appel) : functions.invoke ne lit pas le
        // body d'erreur, il faut aller le chercher sur fnErr.context
        // (Response). Même UX que Lens et publication : ConversionModal avec
        // chemin "Utiliser mes unités", jamais un message générique.
        let errBody = null;
        try { errBody = await fnErr.context?.json(); } catch { /* body non-JSON → chemin générique */ }
        // Bascule quotas (02/09) : les refus sont les quotas du cycle —
        // insufficient_coins est mort (prix à 0). Deux codes, deux modales.
        if (errBody?.error === "quota_annonces_atteint") {
          ouvrirQuotaModal("quota_annonces", {
            trigger: "quota_geste", targetTiers: ["premium","pro"],
            quotaInfo: { geste: "annonces", plafond: errBody.plafond, consommes: errBody.consommes },
          });
          return;
        }
        if (errBody?.error === "quota_retouche_atteint") {
          ouvrirQuotaModal("quota_retouche", {
            trigger: "quota_geste", targetTiers: ["premium","pro"],
            quotaInfo: { geste: "retouches", plafond: errBody.plafond, consommes: errBody.consommes },
          });
          return;
        }
        // Plafond de générations (2026-08-04) : le serveur explique déjà tout
        // (quota, fenêtre 24 h) dans sa langue — le message s'affiche tel quel
        // dans le bandeau d'erreur de l'étape, jamais le générique.
        if (errBody?.error === "generation_limit" && errBody?.message) {
          throw new Error(errBody.message);
        }
        throw new Error(fnErr.message || t("stepGenErrorTitle"));
      }
      if (!data?.platforms) throw new Error(t("stepGenNoListingsError"));

      // Rangée AVANT d'être appliquée : si l'utilisateur referme le stepper
      // dans la seconde qui suit, la génération est déjà payée et déjà sauvée.
      ecrireGenerationCache(signature, data);
      appliquerGeneration(data, platforms);
    } catch (e) {
      setPlatformError(e.message);
    } finally {
      setGeneratingPlatforms(false);
    }
  }

  // Application des résultats d'une génération à l'état du stepper. SÉPARÉE de
  // l'appel réseau (2026-08-10) pour qu'une génération re-servie depuis le
  // cache produise EXACTEMENT le même état qu'une génération fraîche — un
  // second chemin recopié divergerait au premier correctif appliqué d'un seul
  // côté.
  function appliquerGeneration(data, platforms) {
      setProcessedPhotos(data.photos ?? []);
      setPrice(prev => data.price ?? prev);

      const initialEdited = {};
      for (const p of platforms) {
        initialEdited[p] = {
          title:           data.platforms[p]?.title           ?? "",
          description:     data.platforms[p]?.description     ?? "",
          platform_fields: mergeFieldsWithLens(
            data.platforms[p]?.platform_fields ?? {},
            // lensPourChamps, PAS initialListing : un `modele` non confirmé
            // (source "reconnue"/"web"/absente) ne doit pas remplir le champ
            // Modèle de Vinted ni l'aspect eBay du même nom.
            lensPourChamps,
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
  // ── Icône IA active (chantier category_icon, 2026-07-20) ──────────────────
  // category_icon renvoyé par generate-listing (rangé dans platformListings) —
  // adopté comme icône de départ de l'article, mais SEULEMENT :
  //   1. s'il est présent et fait partie des 164 icônes valides ;
  //   2. tant que le titre ET la description de CHAQUE copie générée n'ont pas
  //      été édités depuis la génération. platformListings.platforms[p] conserve
  //      le texte GÉNÉRÉ (jamais muté : les éditions vivent dans `edited`), donc
  //      la comparaison edited[p] ↔ platformListings.platforms[p] dit si l'on
  //      est encore « vierge ». Dès la 1re retouche manuelle → null → toute la
  //      résolution catégorie repasse par detectObjectIcon (comportement
  //      historique intact). Un ancien run sans category_icon → null d'office.
  // Le pristine se dérive de platformListings (déjà persisté dans le brouillon),
  // donc un remount d'onglet conserve le bon comportement sans état ajouté.
  const activeAiIcon = useMemo(() => {
    const ai = platformListings?.category_icon;
    if (!ai || !VALID_OBJECT_ICONS.has(ai)) return null;
    const gen = platformListings?.platforms ?? {};
    for (const p of Object.keys(gen)) {
      const e = edited[p];
      if (!e) continue; // plateforme non éditée à l'écran : n'invalide pas
      if ((e.title ?? "") !== (gen[p]?.title ?? "") ||
          (e.description ?? "") !== (gen[p]?.description ?? "")) return null;
    }
    return ai;
  }, [platformListings, edited]);

  const articleIcon = useMemo(() => {
    const src = edited.leboncoin ?? edited.vinted ?? edited.ebay ?? edited.beebs ?? null;
    return resolveArticleIcon({
      initialListing,
      edited,
      pf: src?.platform_fields ?? {},
      aiIcon: activeAiIcon,
    });
  }, [edited, initialListing, activeAiIcon]);

  // ── Plafond photos Leboncoin : on le DIT avant de publier (2026-08-10) ─────
  // handlePublish plafonne le job à l'insert ; sans cet encart, l'utilisateur
  // verrait 6 photos à l'écran et 3 en ligne, sans jamais savoir pourquoi.
  // Même résolution d'icône que les mappings catalogue, et même quota relevé
  // (getLbcFreePhotoQuota — une seule feuille aujourd'hui, cf. son commentaire).
  // La route « Vêtements bébé » ne peut pas invalider ce calcul : elle ne se
  // déclenche que depuis lbcPath[0] === "Mode", jamais depuis Divers > Autres.
  const lbcPhotoCap = useMemo(() => {
    if (!selected.has("leboncoin")) return null;
    const path = getLbcCategoryPath(articleIcon);
    const quota = getLbcFreePhotoQuota(path);
    const total = Array.isArray(processedPhotos) ? processedPhotos.length : 0;
    if (quota == null || total <= quota) return null;
    return { quota, total, categorie: path.join(" > ") };
  }, [selected, articleIcon, processedPhotos]);

  // ── Adresse de remise manquante : on le dit AVANT le débit (2026-08-10) ────
  // UNE seule lecture, UNE seule clé — la même que celle qui alimente
  // platform_fields.adresse à l'insert (voir handlePublish). Surtout pas une
  // seconde source : un faux positif ici bloquerait des gens qui ont bien
  // renseigné leur adresse.
  //
  // ⚠️ TROIS ÉTATS, PAS DEUX. `chargee:false` = on ne SAIT pas encore, et on
  // n'affirme donc RIEN : ni encart, ni blocage. Seule une lecture ABOUTIE
  // rendant une valeur vide autorise à conclure. Une lecture en erreur
  // (réseau) laisse le comportement d'avant : le job part, le handler
  // tranchera — mieux vaut l'échec d'hier qu'un blocage injuste.
  const [adresseLbc, setAdresseLbc] = useState({ chargee: false, valeur: null });

  // Lecteur UNIQUE. Rend { lue } pour distinguer « lu, c'est vide » de
  // « pas réussi à lire » — cette distinction EST la garde anti-faux-positif.
  async function lireAdresseRemiseLbc() {
    const { data: prof, error } = await supabase.from("profiles")
      .select("platform_settings").eq("id", userId).maybeSingle();
    if (error) return { lue: false, valeur: null };
    return { lue: true, valeur: prof?.platform_settings?.leboncoin?.adresse || null };
  }

  // Chargement à l'arrivée sur l'écran Publier, et seulement si une plateforme
  // concernée est cochée : personne d'autre ne paie cette requête.
  useEffect(() => {
    if (step !== 3) return;
    if (![...selected].some(p => PLATEFORMES_ADRESSE_LBC.includes(p))) return;
    let vivant = true;
    lireAdresseRemiseLbc().then(r => {
      if (!vivant || !r.lue) return;
      setAdresseLbc({ chargee: true, valeur: r.valeur });
    });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selected, userId]);

  // null tant qu'on ne sait pas, ou dès qu'une adresse existe → aucun encart,
  // aucun retrait de plateforme, comportement RIGOUREUSEMENT identique à avant.
  const lbcAdresseManquante = useMemo(() => {
    if (!adresseLbc.chargee || adresseLbc.valeur) return null;
    const plateformes = [...selected].filter(p => PLATEFORMES_ADRESSE_LBC.includes(p));
    return plateformes.length ? { plateformes } : null;
  }, [adresseLbc, selected]);

  // ── LES PLATEFORMES QUI VONT RÉELLEMENT PARTIR — SOURCE UNIQUE (2026-08-11) ─
  // Quatre gardes lisaient quatre listes différentes, et c'est ce qui permet
  // qu'une plateforme retienne les autres :
  //   · publishChips (le compteur du CTA et le total d'unités) filtrait déjà
  //     sur sélectionnée + générée + adresse + non interdite ;
  //   · missingSharedFieldsDetailed ne regardait QUE `selected` — une
  //     plateforme interdite (cosmétique LBC) ou privée d'adresse de remise,
  //     donc exclue de la publication, continuait d'exiger sa taille et sa
  //     couleur et grisait le bouton pour les autres ;
  //   · ebayRequiredStatus ne regardait même pas `selected` — eBay généré
  //     puis DÉCOCHÉ à l'étape Publier continuait d'imposer ses obligatoires ;
  //   · genericRequiredStatus regardait `selected` + généré, mais ni l'adresse
  //     ni l'interdiction.
  // Une seule liste désormais, et tout le monde la lit. Règle : ce qui ne
  // part pas ne bloque pas, et ne se facture pas.
  // ⚠️ Ce n'est PAS un quatrième mécanisme : `prohibited` (platformSupport) et
  // `lbcAdresseManquante` existaient déjà et étaient déjà appliqués au
  // compteur — on cesse simplement de les oublier dans les gardes.
  const plateformesPubliables = useMemo(() => new Set(
    [...selected]
      .filter(p => platformListings?.platforms?.[p])
      .filter(p => !(lbcAdresseManquante?.plateformes ?? []).includes(p))
      .filter(p => platformSupport?.[p] !== "prohibited")
  ), [selected, platformListings, lbcAdresseManquante, platformSupport]);

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
    // ── Gardes DATA-DRIVEN SEULES — le REPLI STATIQUE est MORT (2026-09-02) ──
    // Historique : 4 bugs de la même classe en une semaine de juillet (taille
    // 12/07, matière 12/07, couleur beauté 18/07, audit du 19/07) avaient
    // branché la garde sur les référentiels réels (eBay : ebayRequiredPreview,
    // vérité complète de la catégorie ; Vinted/LBC/Beebs :
    // genericAspectsCatalog, relevés cumulés) — MAIS un repli statique scopé
    // (SHARED_GUARD + périmètres Mode/sport/beauté, puis Livres) subsistait
    // tant que le référentiel n'était pas chargé. Résultat STRUCTUREL (cas
    // Delavier, 02/09 soir) : « Marque · Vinted, eBay » exigée sur un livre
    // selon l'issue d'une COURSE au chargement — le même article demandait la
    // marque une fois sur deux. Décision Nico : en cas de doute, on ne demande
    // RIEN, la plateforme tranche.
    // Pourquoi PERMISSIF plutôt qu'« attendre le catalogue » : « catégorie
    // jamais relevée » et « catégorie sans aucun requis » sont INDISTINGUABLES
    // en base (le catalogue ne stocke que des required=true) — une attente n'a
    // pas de fin propre. Le plancher reste la gate pré-clic de l'extension +
    // le needs_user structuré (options relevées SUR PLACE au blocage, qui
    // remplissent le catalogue pour les passages suivants — philosophie 1.A) :
    // une vraie exigence manquée coûte UNE reprise guidée ; le repli statique
    // coûtait de la friction à CHAQUE publication sur des champs que les
    // plateformes n'exigent pas forcément. (SHARED_GUARD/SPORTSWEAR_RE/
    // BEAUTY_PRODUCT_ICONS restent définis en tête de fichier : mémoire des
    // périmètres historiques, et BEAUTY sert encore ailleurs.)
    const guardPlatforms = (key) => {
      return ["vinted", "leboncoin", "beebs", "ebay"].filter(p => {
        if (p === "ebay") {
          // Preview pas (encore) chargée → on ne demande rien : le filtre
          // selected en aval neutralise de toute façon une plateforme non
          // cochée, et le référentiel arrive en async.
          return ebayRequiredPreview
            ? ebayRequiredPreview.some(a => EBAY_ASPECT_LABELS[key].includes(a.name))
            : false;
        }
        return genericAspectsCatalog[p]
          ? genericAspectsCatalog[p].some(r => genericFieldToSharedKey(p, r.field_key) === key)
          : false;
      });
    };
    // Manquant si la copie d'une plateforme gardée sélectionnée est vide : les
    // jobs partent depuis edited[p].platform_fields (handlePublish), pas depuis
    // sharedFields — une canonique remplie ne prouve pas que chaque copie l'est
    // (divergence possible : copie vidée à la main, plateforme re-cochée sans
    // copie…).
    //
    // ⚠️ LA CANONIQUE N'EST PLUS EXIGÉE EN ELLE-MÊME (2026-08-11). Elle l'était,
    // EN PLUS des copies — et c'est ce terme qui a tué le bouton Publier de
    // RoCotCot le 11/08 : `sharedFields` démarre TOUJOURS vide
    // ({taille:"", couleur:"", matiere:"", marque:""}) et n'est écrit QUE par
    // l'input de l'encart rouge. Or cet encart MASQUE le champ dès que l'encart
    // bleu le porte (règle d'unicité du 30/07). Résultat, pour un champ requis
    // par le catalogue : le seul input à l'écran écrivait la copie, jamais la
    // canonique, la pastille passait au vert et le CTA restait gris À VIE, sans
    // aucun moyen de s'en sortir. Rien n'est désarmé : `sharedFields` ne part
    // sur AUCUNE plateforme, seules les copies voyagent — c'est donc les copies,
    // et elles seules, qu'il faut exiger.
    //
    // Le canal GÉNÉRIQUE compte EXACTEMENT là où le content script le pose
    // vraiment — ni plus (ce serait laisser publier un champ que la plateforme
    // ne recevra jamais), ni moins (ce serait bloquer sur une valeur déjà
    // acquise). La règle n'est pas devinée, elle est RECOPIÉE des handlers :
    // cf. CANAL_GENERIQUE_POSE.
    const valeurPourPlateforme = (p, key) => {
      const pf = edited[p]?.platform_fields ?? {};
      const direct = String(pf[key] ?? "").trim();
      if (direct) return direct;
      // Couleur : les handlers lisent colors[0] AVANT couleur.
      if (key === "couleur") {
        const c = String(pf.colors?.[0] ?? "").trim();
        if (c) return c;
      }
      const aspects = pf[GENERIC_ASPECTS_PF_KEY[p]] ?? {};
      for (const [code, v] of Object.entries(aspects)) {
        if (genericFieldToSharedKey(p, code) !== key) continue;
        if (!canalGeneriquePose(p, code)) continue;
        const s = String(v ?? "").trim();
        if (s) return s;
      }
      // eBay : ses aspects sont posés tels quels par ebay.js (aucun saut), et
      // EBAY_ASPECT_LABELS dit quels noms d'aspect portent ce champ partagé.
      if (p === "ebay") {
        for (const nom of EBAY_ASPECT_LABELS[key] ?? []) {
          const v = String(pf.ebayAspects?.[nom] ?? "").trim();
          if (v) return v;
        }
      }
      return "";
    };
    return SHARED_FIELD_KEYS.map(key => {
      // `plateformesPubliables` et non `selected` (2026-08-11) : une plateforme
      // qui ne partira pas n'a aucun champ à exiger.
      const guarded = guardPlatforms(key).filter(p => plateformesPubliables.has(p));
      if (!guarded.length) return null;
      const manquantes = guarded.filter(p => !valeurPourPlateforme(p, key));
      if (!manquantes.length) return null;
      // On ne nomme QUE les plateformes réellement dépourvues : l'encart rouge
      // annonçait « Taille · Vinted, eBay » alors que la copie eBay était
      // remplie.
      return { key, platforms: manquantes };
    }).filter(Boolean);
  }, [plateformesPubliables, edited, initialListing, ebayRequiredPreview, genericAspectsCatalog, activeAiIcon]);

  const missingSharedFields = useMemo(
    () => missingSharedFieldsDetailed.map(f => f.key),
    [missingSharedFieldsDetailed]
  );

  // (La table clé → « Vinted, Beebs » de l'encart rouge est calculée par
  // redSharedFieldPlatforms, plus bas — depuis le 2026-08-28, l'encart rouge
  // porte TOUS les champs partagés manquants, la table couvre donc la liste
  // complète.)

  // Axes de tailles enfant du champ partagé Taille (encart inline de
  // StepPublish) : UNION des axes autorisés par les genres enfant des
  // copies, chaque copie jugée avec SA plateforme (childAxesForGenre —
  // Bébé → mois ; Fille/Garçon → ans, + mois sur Vinted/LBC/Beebs depuis
  // le 2026-08-08). null si aucune copie n'a de genre enfant → groupes
  // adultes seuls. L'union (et non l'intersection) parce que les genres et
  // les plateformes divergent entre copies — le filtrage strict par copie
  // reste fait dans l'éditeur de chaque copie. ⚠️ Conséquence assumée de
  // l'union : Fille + copies Vinted ET eBay → l'axe mois s'affiche ici, et
  // une taille mois posée en partagé bloquera la copie eBay à sa garde des
  // requis (visible, nominal) — l'éditeur de la copie Vinted permet de
  // poser la taille mois sur Vinted seul.
  const sharedChildAxes = useMemo(() => {
    let axes = null;
    for (const [p, c] of Object.entries(edited ?? {})) {
      const a = childAxesForGenre(c?.platform_fields?.genre, p)
        ?? childAxesForGenre(c?.platform_fields?.univers, p);
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
    const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
    if (!vintedGenreRequired(icon)) return false;
    const g = pf.genre;
    if (!g || g === "Mixte") return false;
    return !getVintedCategoryPath(icon, g);
  }, [selected, edited, initialListing, activeAiIcon]);

  // ── Même garde pour Beebs (2026-08-13, item 4 du chantier LBC+Beebs) ──────
  // Cas réels en base : genre="Enfant" (26/07) — choix explicite respecté par
  // l'auto-résolution, mais Beebs n'a NI rayon Enfant NI Mixte — et
  // genre="Femme" (30/07) sur un article dont la feuille Beebs n'existe pas
  // pour ce genre. Les deux partaient en job et échouaient côté extension avec
  // le message accusatoire « genre ne correspondant à aucun rayon réel »,
  // APRÈS débit. Miroir exact de vintedGenreBlocked : un genre EXPLICITE qui
  // ne résout aucun chemin Beebs bloque AVANT le clic, avec bandeau lisible ;
  // vide/Mixte restent hors du signal (l'auto-résolution du publish s'en
  // charge, et elle ne produit jamais Enfant/Mixte).
  const beebsGenreBlocked = useMemo(() => {
    if (!selected.has("beebs") || !edited.beebs) return false;
    const pf = edited.beebs.platform_fields ?? {};
    const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
    if (!beebsGenreRequired(icon)) return false;
    const g = pf.genre;
    if (!g || g === "Mixte") return false;
    return !getBeebsCategoryPath(icon, g);
  }, [selected, edited, initialListing, activeAiIcon]);

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
    const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
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
  }, [selected, edited, initialListing, activeAiIcon]);
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
    // `plateformesPubliables` (2026-08-11) : cette garde ne regardait même pas
    // si eBay était coché. Généré puis décoché — ou interdit, ou sans adresse —
    // il imposait quand même ses obligatoires et grisait le CTA pour Vinted et
    // Leboncoin, prêts tous les deux.
    if (!ebayRequiredPreview || !edited.ebay || !plateformesPubliables.has("ebay")) return null;
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
            // `blocking` (2026-07-29, doctrine « liste = suggestion ») : seule
            // une liste QUI FAIT FOI grise le CTA. eBay SELECTION_ONLY = eBay
            // déclare le champ fermé → on bloque. FREE_TEXT = eBay déclare le
            // champ libre → on avertit, on propose la liste, on laisse passer.
            blocking: listeFaitFoi("ebay", mode),
            allowedValues, mode,
          };
        }
        // `value: srcVal` (2026-07-30) : avec le rendu sticky de l'encart, une
        // ligne passée à "ok" reste affichée — elle doit montrer sa valeur.
        return { name, state: "ok", value: srcVal, allowedValues, mode };
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
  }, [ebayRequiredPreview, edited, plateformesPubliables]);

  // Défauts DÉTERMINISTES (Phase 1, 2026-07-16) : dès que les obligatoires de
  // la catégorie sont connus, on pose les valeurs standard eBay SÛRES
  // (EBAY_ASPECT_DEFAULTS, ex. MPN → « Ne s'applique pas ») dans pf.ebayAspects
  // — instantané, sans appel IA, donc jamais bloqué par un échec Haiku. Les
  // chips passent ✓ tout de suite ; la valeur reste écrasable dans le fallback
  // UI. Jamais d'écrasement d'une source existante. Une pose par catégorie.
  const aspectDefaultsFor = useRef(null);
  // Aspects déjà posés pour la passe courante (2026-09-02) : la pose se fait à
  // la PREMIÈRE apparition de chaque aspect — jamais deux fois (on ne recouvre
  // pas un champ que l'utilisateur a vidé exprès).
  const aspectDefaultsPoses = useRef(new Set());
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
    const pfAspects = edited.ebay?.platform_fields?.ebayAspects ?? {};
    // Marque telle qu'elle partira sur eBay : le champ dédié d'abord, l'aspect
    // ensuite (l'encart bleu écrit dans pf.ebayAspects). C'est elle qui décide
    // si « Modèle » a un défaut — cf. defautAspectEbay.
    const marqueEbay = String(
      edited.ebay?.platform_fields?.marque ?? pfAspects["Marque"] ?? ""
    ).trim();
    // La marque entre dans la CLÉ DE PASSE (2026-08-11), au même titre que le
    // genre et pour la même raison : « Modèle » n'a de défaut que sur un objet
    // sans marque, et l'utilisateur choisit « Sans marque » APRÈS la première
    // passe — c'est même l'ordre normal, la marque est le premier champ de
    // l'encart. Sans ce terme, le défaut ne serait jamais posé sur le seul cas
    // qui en a besoin. Trois états seulement (absente / générique / réelle) :
    // la valeur exacte ne change rien au défaut, elle ne doit donc pas rejouer
    // la passe à chaque frappe.
    const marqueCle = !marqueEbay ? "sans" : MARQUE_GENERIQUE_RE.test(marqueEbay) ? "generique" : "marque";
    const passeCle = `${ebayPreviewCategoryId}|${genreCle}|${marqueCle}`;
    // ── Pose « au plus une fois PAR ASPECT », plus « une fois par passe »
    // (2026-09-02, cas Delavier : MPN demandé en saisie libre sur un livre
    // alors que son défaut existe depuis le 16/07). L'ancien retour anticipé
    // marquait la passe FAITE même quand ebayRequiredStatus était encore
    // PARTIEL (les aspects arrivent en async) : un aspect apparu après le
    // premier passage ne recevait JAMAIS son défaut. Désormais chaque aspect
    // défautable est posé à sa PREMIÈRE apparition — et une seule fois par
    // passe (un utilisateur qui vide le champ pour saisir un vrai MPN n'est
    // jamais recouvert).
    if (aspectDefaultsFor.current !== passeCle) {
      aspectDefaultsFor.current = passeCle;
      aspectDefaultsPoses.current = new Set();
    }
    const toSet = {};
    for (const a of ebayRequiredStatus) {
      const def = defautAspectEbay(a, { marque: marqueEbay, famille: initialListing?.famille ?? null });
      if (def && a.state === "missing" && !String(pfAspects[a.name] ?? "").trim()
          && !aspectDefaultsPoses.current.has(a.name)) {
        toSet[a.name] = def;
        aspectDefaultsPoses.current.add(a.name);
      }
      // Département ← genre de la copie eBay (2026-07-19, montre Casio) :
      // déterministe comme les défauts ci-dessus, mais dérivé d'une DONNÉE du
      // job — seul un candidat PRÉSENT dans la liste de la catégorie est posé
      // (libellés variables : « Adulte unisexe » vs « Unisexe » vs
      // « Adulte »…). Genre absent ou aucun candidat → reste "missing" :
      // resolve_aspects puis saisie manuelle, comme Type/Style.
      if (a.name === "Département" && a.state === "missing" && !String(pfAspects[a.name] ?? "").trim()
          && !aspectDefaultsPoses.current.has(a.name)) {
        // genreCle = genre effectif (copie eBay, sinon repli copies sœurs) —
        // cf. son calcul plus haut, aligné sur ebayPreviewCategoryId.
        const candidats = EBAY_DEPARTMENT_BY_GENRE[genreCle] ?? [];
        const libelle = candidats.find(c =>
          (a.allowedValues ?? []).some(v => normAspectVal(v) === normAspectVal(c)));
        if (libelle) { toSet[a.name] = libelle; aspectDefaultsPoses.current.add(a.name); }
      }
    }
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
    // MÊME fonction que la pose ci-dessus (2026-08-11) : sans ça « Modèle »
    // partirait quand même à l'IA sur un objet sans marque, pour qu'elle
    // réponde null — un appel payé pour rien, et une ligne qui reste rouge le
    // temps de l'aller-retour.
    const marqueEbay = String(
      edited.ebay?.platform_fields?.marque
      ?? edited.ebay?.platform_fields?.ebayAspects?.["Marque"] ?? ""
    ).trim();
    const missing = (ebayRequiredStatus ?? [])
      .filter(a => a.state === "missing" && !defautAspectEbay(a, { marque: marqueEbay, famille: initialListing?.famille ?? null }))
      .map(a => a.name);
    if (!missing.length || !ebayPreviewCategoryId) return;
    if (aspectsResolvedFor.current === ebayPreviewCategoryId) return;
    aspectsResolvedFor.current = ebayPreviewCategoryId;
    (async () => {
      try {
        // allowedValues déjà portées par la preview (même fetch) : pas de
        // relecture de la table. Transmises à l'IA UNIQUEMENT quand la liste
        // FAIT FOI (SELECTION_ONLY — exhaustive par contrat Taxonomy). Les
        // aspects FREE_TEXT (Marque en tête) ne portent que des valeurs
        // RECOMMANDÉES, non exhaustives : les transmettre invitait l'IA à
        // choisir une marque plausible dans la liste au lieu d'extraire du
        // contexte ou de répondre null (même mécanisme que les marques
        // fantômes Vinted/Beebs du 29-30/07, doctrine « liste = suggestion »).
        const details = (ebayRequiredStatus ?? [])
          .filter(a => missing.includes(a.name))
          .map(a => ({
            name: a.name,
            allowedValues: a.mode === "SELECTION_ONLY" ? (a.allowedValues ?? []).slice(0, 60) : [],
          }));
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
              // lensPourChamps (2026-07-28) : modèle non confirmé retiré et
              // reference_fabricant repassée au filtre MPN — c'est CE contexte
              // qui alimente les aspects eBay en saisie libre.
              modele:      src.platform_fields?.modele || lensPourChamps?.modele || null,
              matiere:     src.platform_fields?.matiere || initialListing?.matiere || null,
              couleur:     src.platform_fields?.colors?.[0] || src.platform_fields?.couleur || initialListing?.couleur || null,
              description: src.description || initialListing?.description || null,
              type:        initialListing?.categorie || null,
              // attributs_visibles de lens-analysis (Phase 2), assainis.
              attributs:   lensPourChamps?.attributs_visibles ?? null,
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
      const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
      let path = null;
      if (platform === "vinted") path = getVintedCategoryPath(icon, pf.genre, edited[platform]?.title ?? "");
      if (platform === "leboncoin") path = getLbcCategoryPath(icon);
      if (platform === "beebs") path = getBeebsCategoryPath(icon, pf.genre);
      // MÊME clé que categoryKeyOf de l'extension (background.js) : chemin
      // joint par " > " — c'est elle qui écrit, nous qui lisons.
      if (Array.isArray(path) && path.length) keys[platform] = path.join(" > ");
    }
    return keys;
  }, [selected, edited, initialListing, activeAiIcon]);

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
            // ── Historique `size` (2026-07-20) ────────────────────────────────
            // L'emprunt a un jour collé des DIAMÈTRES DE BOÎTIER DE MONTRE sur
            // un t-shirt homme : « Hommes > … > T-shirts unis » avait size
            // required=true et allowed_values NULL, l'emprunt prenait la liste
            // la plus longue de field_key='size' toutes catégories confondues
            // (6 valeurs en mm, « Hommes > Accessoires > Montres »), et la
            // taille réelle « M » devenait « hors liste » → CTA Publier bloqué.
            // 11 catégories vêtement/chaussure/jouet étaient dans ce cas.
            // CORRIGÉ À LA SOURCE : les 11 ont été relevées sur Vinted
            // (item_upload/catalogs → multiple_size_group_ids, puis size_groups ;
            // relevé recoupé au DOM du formulaire sur T-shirts unis, identique)
            // et écrites en base. Il ne reste AUCUNE ligne vinted/size sans
            // options : l'emprunt ne peut plus se déclencher pour `size`, la
            // garde par exclusion devenait inerte et a été retirée.
            // ⚠️ Si une NOUVELLE catégorie Vinted apparaît un jour avec size
            // required et sans options (découverte par refus serveur, comme les
            // 11 d'origine), l'emprunt redeviendra actif pour elle et
            // re-produira la même classe de bug. Le signal à guetter est le
            // même : « Taille — valeur hors liste » sur un article correctement
            // renseigné. Remède : relever les options de cette catégorie.
            // ── `condition` : l'emprunt RESTE, mais la justification d'hier
            // était FAUSSE (corrigée le 2026-07-20) ────────────────────────────
            // On avait conclu « sans risque » parce que /api/v2/statuses est un
            // endpoint GLOBAL (6 états pour tout Vinted). L'API est bien
            // globale — mais le FORMULAIRE, lui, restreint par catégorie, et la
            // base le prouvait déjà : « Femmes > Beauté > Soins du visage »
            // n'accepte qu'UNE valeur (« Neuf avec étiquette ») contre 5 sur
            // « Hommes > Accessoires > Montres ». Généraliser d'un endpoint au
            // formulaire était l'erreur.
            // Conséquence réelle : « Femmes > Beauté > Parfums » avait condition
            // required et allowed_values NULL, donc empruntait les 5 valeurs —
            // « Très bon état » passait la garde et Vinted refusait au dépôt.
            // C'est la boucle Medik8 (cf. genericRequiredStatus l.3489) rejouée
            // par un autre chemin, sur une catégorie atteignable par l'icône 🌸.
            // SOURCE DE VÉRITÉ trouvée : item_upload/catalogs porte
            // `restricted_to_status_id` par catalogue. 28 feuilles Vinted sont
            // restreintes, TOUTES à l'id 6 = « Neuf avec étiquette » (beauté,
            // soins, et lingerie/sous-vêtements — règle d'hygiène). 9 d'entre
            // elles sont atteignables par nos mappings : elles ont désormais
            // leur liste propre en base et n'empruntent plus.
            // L'emprunt est CONSERVÉ volontairement : 27 lignes condition
            // restent NULL sur des catégories NON restreintes, où les 5 états
            // sont la bonne réponse. Il n'est donc pas inerte — contrairement à
            // `size`, dont l'exclusion avait pu être retirée.
            // ⚠️ Si Vinted restreint un jour une NOUVELLE catégorie, elle
            // empruntera à nouveau les 5 valeurs. Le contrôle est cheap :
            // re-balayer `restricted_to_status_id` dans item_upload/catalogs.
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
      // isbn (2026-08-31) : champ dédié posé par generate-listing depuis la
      // lecture du Lens. Sans ce cas, le requis « ISBN (Vinted) » restait
      // « manquant » — rouge, CTA bloqué — sur une valeur que l'app connaissait
      // déjà. C'est aussi la clé que vinted.js lit (fields.isbn).
      if (key === "isbn") return pf.isbn;
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
  // « estimated_parcel_weight » AJOUTÉ le 2026-08-28 au soir (plainte n°1
  // d'une utilisatrice) : le « Poids du colis » LBC bloquait le CTA pour une
  // valeur que l'extension ne pose JAMAIS — combobox fermé à liste jamais
  // relevée (cf. bandeau LBC_POIDS_PAR_FORMAT en tête de fichier, f68fac8),
  // fillCriterionSafe ne clique qu'une option matchée et conserve sinon le
  // pré-rempli Leboncoin. Recoupé en base : 60 publications LBC SANS saisie
  // de poids contre 55 avec, et ZÉRO échec/needs_user lié au poids sur toute
  // l'histoire de la table (revérifié ce soir : error ILIKE poids/parcel/
  // weight + field_key → 0 ligne). C'est donc un « pré-rempli plateforme »
  // au sens exact de cette liste. ⚠️ CE CHAMP SEULEMENT — les autres aspects
  // LBC obligatoires bloquent comme avant, on ne généralise pas à « tout
  // combobox non relevé ».
  const GENERIC_PREFILLED = {
    vinted: ["sim_lock", "package_size_id"],
    leboncoin: ["quantity", "estimated_parcel_weight"],
    beebs: ["Format du colis"],
  };
  // Sous-ensemble rempli par la PLATEFORME elle-même (les autres entrées sont
  // des défauts posés par l'extension) : le chip du bloc bleu le dit tel quel
  // (« rempli par Leboncoin ») au lieu du générique « rempli automatiquement ».
  const GENERIC_PREFILLED_BY_PLATFORM = {
    leboncoin: ["estimated_parcel_weight"],
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
      // `plateformesPubliables` couvre déjà « sélectionnée ET générée », plus
      // l'adresse de remise et l'interdiction produit qui manquaient ici.
      if (!plateformesPubliables.has(platform) || !edited[platform]) continue;
      const pf = edited[platform].platform_fields ?? {};
      const aspects = pf[GENERIC_ASPECTS_PF_KEY[platform]] ?? {};
      const status = rows.map((r) => {
        const key = r.field_key;
        const label = r.field_label || key;
        // trim : les allowed_values sont des relevés DOM et certains portent
        // des espaces finaux (« Boutique italienne  » retrouvé tel quel dans
        // un job du 30/07 — la valeur venait de la liste, pas d'une saisie).
        const allowedValues = Array.isArray(r.allowed_values)
          ? r.allowed_values.slice(0, 1000).map(v => String(v).trim()).filter(Boolean)
          : [];
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
          //
          // ⚠️ 2026-07-29 — CE BLOC A CAUSÉ LE BLOCAGE PROD BEEBS/MARQUE.
          // La prémisse « liste du catalogue ≤ 200 ⇒ liste fermée » est FAUSSE :
          // ces valeurs sont RELEVÉES sur le DOM et une liste à chargement
          // paresseux n'en livre que la portion visible (Marque Beebs : 60
          // valeurs, alphabet coupé à « Amisu » — Volcom, Nike, Zara hors
          // liste). `blocking: false` : le signalement RESTE (chip ⚠ + vrai
          // sélecteur + rapprochement auto, tout ce qui aide), mais il
          // n'interdit plus la publication. Cf. `listeFaitFoi` plus haut.
          const target = genericDedicatedTarget(platform, key);
          if (target && allowedValues.length && allowedValues.length <= EBAY_CLOSED_LIST_MAX &&
              !allowedValues.some(v => normAspectVal(v) === normAspectVal(src))) {
            return {
              key, label, state: "invalid", value: src,
              dedicatedTarget: target,
              suggested: nearestAllowedValue(src, allowedValues),
              // Vinted/LBC/Beebs : AUCUNE liste ne fait foi, ce sont toutes des
              // relevés. Jamais bloquant.
              blocking: listeFaitFoi(platform, null),
              allowedValues,
            };
          }
          // `value: src` (2026-07-30) : avec le rendu sticky, une ligne passée
          // à "ok" reste affichée — sans valeur, son input paraissait vide
          // alors que le champ est rempli.
          // ⚠️ dedicatedTarget AUSSI sur "ok" (2026-09-02, bug « un seul
          // caractère » de l'Univers LBC, cas Delavier) : la PREMIÈRE frappe
          // écrivait pf.univers via le canal dédié (branche "missing", qui
          // porte la cible), l'aspect passait à "ok"… SANS cible — la frappe
          // suivante partait dans le canal GÉNÉRIQUE, que cette dérivation ne
          // relit qu'APRÈS la source dédiée : l'input revenait au premier
          // caractère à chaque frappe, déterministe. Même classe que le fix
          // sticky du 30/07 (l'input restait monté, mais écrivait à côté).
          return { key, label, state: "ok", value: src, allowedValues, dedicatedTarget: genericDedicatedTarget(platform, key) };
        }
        const generic = String(aspects[key] ?? "").trim();
        if (generic) return { key, label, state: "ok", source: "generic", value: generic, allowedValues, dedicatedTarget: genericDedicatedTarget(platform, key) };
        if (GENERIC_PREFILLED[platform]?.includes(key)) {
          return {
            key, label, state: "prefilled", allowedValues,
            prefilledByPlatform: GENERIC_PREFILLED_BY_PLATFORM[platform]?.includes(key) ?? false,
          };
        }
        // dedicatedTarget aussi sur les "missing" (2026-07-19) : la
        // confirmation valeur-unique doit écrire le champ DÉDIÉ (etat…) que
        // lit l'extension — le canal générique est ignoré pour les clés déjà
        // servies par un mapping dédié (handledForKeys/handledLabels).
        // ── Champ FERMÉ sans liste relevée → NON BLOQUANT (2026-09-02) ───────
        // Cas Delavier : « Univers » (combobox LBC, allowed_values jamais
        // relevées) exigé en SAISIE LIBRE — personne ne sait quoi y mettre,
        // Nico le premier. Règle posée : on ne demande JAMAIS à l'utilisateur
        // un champ dont on ne peut pas lui proposer les valeurs. On publie
        // sans : le pré-rempli de la plateforme (souvent juste, doctrine
        // 13/08) ou le refus propre → needs_user avec les options RELEVÉES
        // sur place (qui remplissent le catalogue pour les suivants) font
        // foi. Les champs TEXTE réels (isbn…) restent bloquants : l'utilisateur
        // PEUT les connaître.
        const ferme = ["combobox", "dropdown", "list"].includes(String(r.input_type ?? "").toLowerCase());
        return { key, label, state: "missing", value: "", allowedValues,
                 dedicatedTarget: genericDedicatedTarget(platform, key),
                 blocking: !(ferme && allowedValues.length === 0) };
      });
      if (status.length) out[platform] = status;
    }
    return Object.keys(out).length ? out : null;
  }, [genericAspectsCatalog, plateformesPubliables, edited]);

  // ── UN SEUL endroit de saisie (2026-08-28, remplace l'unicité du 30/07) ────
  // L'ancienne règle répartissait la saisie entre le rouge et les bleus selon
  // le nombre de plateformes — résultat vécu (cas Ornella) : la taille se
  // saisissait dans le bloc rouge et le poids du colis dans le bloc bleu
  // Leboncoin, deux zones pour la même action. Désormais l'encart ROUGE porte
  // TOUS les champs bloquants (partagés ici, aspects plateforme calculés dans
  // StepPublish) ; les encarts bleus sont purement informatifs, chips sans
  // input. AFFICHAGE SEULEMENT : la garde du CTA (requiredBlocking) et le
  // re-check du publish lisent toujours les listes complètes.
  // ⚠️ Un champ partagé n'entre ici que si sa saisie ATTEINT au moins une des
  // plateformes dépourvues (SHARED_PROPAGATION) : Couleur ne se propage pas à
  // Leboncoin (leboncoin.js ne lit pas fields.couleur, canal générique seul) —
  // un input partagé qui n'écrirait aucune copie exigée laisserait le CTA
  // gris à vie, la classe de bug RoCotCot (11/08). Dans ce cas, c'est
  // l'aspect PLATEFORME qui porte l'input dans l'encart rouge (StepPublish
  // applique le même test de propagation à sa déduplication).
  const redSharedDetailed = useMemo(() =>
    missingSharedFieldsDetailed.filter(f =>
      f.platforms.some(p => (SHARED_PROPAGATION[f.key] ?? []).includes(p))),
    [missingSharedFieldsDetailed]);
  const redSharedFields = useMemo(() => redSharedDetailed.map(f => f.key), [redSharedDetailed]);
  const redSharedFieldPlatforms = useMemo(() => {
    const m = {};
    for (const f of redSharedDetailed) m[f.key] = f.platforms.map(p => PLATFORM_LABELS[p] ?? p).join(", ");
    return m;
  }, [redSharedDetailed]);

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

  // (Le pré-remplissage du « Poids du colis » LBC depuis format_colis a vécu
  // ici quelques heures le 28/08 puis a été RETIRÉ le soir même : le champ
  // est un combobox FERMÉ dont la liste d'options n'a jamais été relevée —
  // cf. le bandeau de LBC_POIDS_PAR_FORMAT en tête de fichier. Le champ se
  // complète à la main dans l'encart rouge, comme avant.)

  // ── Trace des champs obligatoires bloquants (règle 3, 03/09 soir) ─────────
  // Le blocage « champ requis » vivait AVANT toute création de job : aucun
  // enregistrement serveur, donc aucun moyen de savoir combien de gens
  // butaient là (cas des paniers en osier, découvert par un témoignage).
  // Quatre moments, une feature usage_logs 'champ_requis_bloquant' :
  //   affiche               → le champ bloquant apparaît au step Publier ;
  //   complete              → l'utilisateur l'a rempli (il ne bloque plus) ;
  //   abandonne             → stepper fermé avec le champ toujours bloquant ;
  //   publie_sans_plateforme→ le geste est parti SANS cette plateforme ;
  //   bloque_au_clic        → le clic n'a rien pu publier du tout.
  // Best-effort, jamais bloquant — une télémétrie ne coûte jamais une vente.
  const logChampBloquant = (issue, info) => {
    if (!userId || !info) return;
    supabase.from("usage_logs")
      .insert({ user_id: userId, feature: "champ_requis_bloquant", metadata: { ...info, issue } })
      .then(({ error }) => { if (error) console.warn("[stepper] champ_requis_bloquant non journalisé :", error.message); });
  };
  // Plateformes parties SANS une plateforme bloquée à ce clic — porté jusqu'à
  // l'écran de succès pour le dire nommément.
  const [publieesSansPf, setPublieesSansPf] = useState([]);
  const champBloquantVus = useRef({});      // "gp:key" → {platform, champ, categorie, complete?}
  const champBloquantRestants = useRef(new Set());
  const doneRef = useRef(false);
  useEffect(() => {
    if (step !== 3) return;
    const actifs = new Set();
    for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
      for (const a of list.filter(aspectBloquant)) {
        const k = `${gp}:${a.key}`;
        actifs.add(k);
        if (!champBloquantVus.current[k]) {
          champBloquantVus.current[k] = {
            platform: gp, champs: [a.label ?? a.key],
            categorie: genericCategoryKeys?.[gp] ?? initialListing?.categorie ?? null,
          };
          logChampBloquant("affiche", champBloquantVus.current[k]);
        }
      }
    }
    for (const k of champBloquantRestants.current) {
      const vu = champBloquantVus.current[k];
      if (!actifs.has(k) && vu && !vu.complete) {
        vu.complete = true;
        logChampBloquant("complete", vu);
      }
    }
    champBloquantRestants.current = actifs;
  }, [step, genericRequiredStatus]);
  useEffect(() => { doneRef.current = done; }, [done]);
  useEffect(() => () => {
    if (doneRef.current) return;
    for (const k of champBloquantRestants.current) {
      logChampBloquant("abandonne", champBloquantVus.current[k]);
    }
  }, []);

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
      const missingAll = list.filter(a => a.state === "missing" && (a.allowedValues?.length ?? 0) !== 1);
      if (!missingAll.length) continue;
      genericResolvedFor.current[gp] = catKey;
      const src = edited[gp] ?? {};
      // ── FIX « marques fantômes » (2026-07-30, jobs des 29-30/07 :
      // inventaire Springfield → Beebs "Levi's", Maje → Beebs "H&M",
      // Sans marque → Vinted "Boutique italienne ") ────────────────────────
      // 1. Une valeur DÉJÀ CONNUE de l'article (copie, canonique, IA
      //    d'origine) est posée DIRECTEMENT sur le champ dédié : on ne
      //    demande jamais à l'IA une information qu'on possède. Avant, une
      //    Marque « manquante » sur la copie partait en resolve_aspects avec
      //    la liste RELEVÉE de la catégorie — partielle par construction
      //    (chargement paresseux : 10 marques populaires + alphabet coupé à
      //    « Am ») — et l'IA choisissait une marque plausible DANS la liste
      //    (sa tête : Levi's, H&M ; son début d'alphabet : Agnès b) au lieu
      //    de la marque réelle absente du relevé.
      const KNOWN_BY_TARGET = {
        marque:  src.platform_fields?.marque  || sharedFields.marque  || initialListing?.marque  || null,
        matiere: src.platform_fields?.matiere || sharedFields.matiere || initialListing?.matiere || null,
        couleur: src.platform_fields?.colors?.[0] || src.platform_fields?.couleur || sharedFields.couleur || initialListing?.couleur || null,
        taille:  src.platform_fields?.taille  || sharedFields.taille  || null,
        modele:  src.platform_fields?.modele  || lensPourChamps?.modele || null,
      };
      // ── Univers LBC pré-rempli depuis le GENRE (2026-09-02, cas Delavier) ──
      // « Univers » ne parle à personne, mais pour un vêtement/chaussure le
      // genre de l'article LE DIT déjà (Femme/Homme ; Fille/Garçon/Bébé →
      // Enfant). Posé UNIQUEMENT quand la valeur mappée figure dans la liste
      // relevée de la catégorie — jamais sur une liste vide ou absente (les
      // Univers de Sport/Déco/Arts de la table ne sont PAS des genres, y
      // poser « Femme » serait faux). « Mixte » n'est pas déductible → saisie
      // manuelle. Ce qui reste ambigu est demandé, rien de deviné.
      const UNIVERS_PAR_GENRE = { "Femme": "Femme", "Homme": "Homme", "Fille": "Enfant", "Garçon": "Enfant", "Bébé": "Enfant", "Enfant": "Enfant" };
      const genreArticle = String(
        src.platform_fields?.genre || src.platform_fields?.univers
        || edited.vinted?.platform_fields?.genre || edited.beebs?.platform_fields?.genre || ""
      ).trim();
      const missing = [];
      for (const a of missingAll) {
        if (a.dedicatedTarget === "univers") {
          const cand = UNIVERS_PAR_GENRE[genreArticle] ?? null;
          if (cand && (a.allowedValues ?? []).some(v => normAspectVal(v) === normAspectVal(cand))) {
            setPlatformDedicatedField(gp, "univers", cand);
            continue;
          }
        }
        // ── Marque sur un LIVRE (2026-09-02, même doctrine que l'Univers) ────
        // Un livre n'a pas de marque (l'« éditeur » n'en est pas une pour les
        // listes des plateformes) : quand la liste relevée de la catégorie
        // propose « Sans marque »/« Autre », on la pose d'office au lieu de
        // demander. Liste sans valeur générique → comportement inchangé
        // (l'extension a ses propres replis « Autre »/« Sans marque »).
        if (a.dedicatedTarget === "marque" && initialListing?.famille === "livres_medias") {
          const cand = (a.allowedValues ?? []).find(v => /sans\s*marque|^autres?$/i.test(String(v).trim()));
          if (cand) {
            setPlatformDedicatedField(gp, "marque", String(cand).trim());
            continue;
          }
        }
        const known = a.dedicatedTarget ? String(KNOWN_BY_TARGET[a.dedicatedTarget] ?? "").trim() : "";
        if (known) setPlatformDedicatedField(gp, a.dedicatedTarget, known);
        else missing.push(a);
      }
      // ── Champ FERMÉ sans liste connue : on NE DEMANDE PLUS à l'IA (13/08) ──
      // Cas réel jocaille : « Produit » (combobox LBC, catalogue à 0 option)
      // partait en resolve_aspects avec allowedValues:[] — vocabulaire ouvert
      // sur un champ FERMÉ : l'IA « extrayait du contexte » des valeurs
      // impossibles (« Maison », « Décoration », le TITRE de l'article),
      // l'extension les refusait (« champ sauté — sans correspondance ») et
      // Leboncoin bloquait sur « Ce champ est requis ». La doctrine du 29/07
      // (liste relevée = suggestion, vocabulaire ouvert) ne vaut que pour les
      // champs LIBRES (marque/modele/matiere hors Vinted) : sur un combobox,
      // une valeur hors liste ne peut RIEN produire de bon. Sans liste, on
      // laisse le champ VIDE — le pré-rempli Leboncoin (souvent juste, règle
      // du 13/08 côté extension) ou le mini-éditeur needs_user (options
      // relevées au blocage) font foi.
      const askable = missing.filter(a =>
        (a.dedicatedTarget === "marque" || a.dedicatedTarget === "modele" ||
          (a.dedicatedTarget === "matiere" && gp !== "vinted")) ||
        (a.allowedValues?.length ?? 0) > 0
      );
      if (!askable.length) continue;
      (async () => {
        try {
          // 2. Vocabulaire OUVERT : transmettre une liste relevée (partielle)
          //    invite l'IA à choisir dedans. Doctrine du 29/07 : une liste
          //    relevée est une suggestion, jamais une liste blanche — l'IA
          //    extrait du contexte ou répond null, point.
          //    · marque/modele : ouvert sur les 3 plateformes ;
          //    · matiere : ouvert AUSSI sur LBC (jamais relevé en base,
          //      combobox) et Beebs (relevé d'un panneau à chargement
          //      paresseux — 7 valeurs vues, complétude improuvable). PAS sur
          //      Vinted : sa liste material vient de la config serveur
          //      /attributes (55 valeurs, complète par construction) — elle
          //      aide l'IA sans l'enfermer dans un relevé partiel.
          const openVocab = (target) =>
            target === "marque" || target === "modele" ||
            (target === "matiere" && gp !== "vinted");
          const details = askable.map(a => ({
            name: a.label,
            allowedValues: openVocab(a.dedicatedTarget)
              ? []
              : (a.allowedValues ?? []).slice(0, 60),
          }));
          const { data: res } = await supabase.functions.invoke("generate-listing", {
            body: {
              resolve_aspects: true,
              aspects: details,
              item_data: {
                titre:       src.title || initialListing?.titre || "",
                marque:      src.platform_fields?.marque || initialListing?.marque || null,
                modele:      src.platform_fields?.modele || lensPourChamps?.modele || null,
                matiere:     src.platform_fields?.matiere || initialListing?.matiere || null,
                couleur:     src.platform_fields?.colors?.[0] || src.platform_fields?.couleur || initialListing?.couleur || null,
                description: src.description || initialListing?.description || null,
                type:        initialListing?.categorie || null,
                attributs:   lensPourChamps?.attributs_visibles ?? null,
              },
            },
          });
          const values = res?.aspects && typeof res.aspects === "object" ? res.aspects : {};
          // resolve_aspects répond par LIBELLÉ ; le canal générique écrit par
          // CLÉ plateforme (code serveur / for= / libellé Beebs) — mappage
          // retour label → key.
          const keyOfLabel = Object.fromEntries(askable.map(a => [a.label, a.key]));
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

  // Prix d'achat OBLIGATOIRE (2026-07-29), et ZÉRO EST UNE RÉPONSE VALIDE :
  // beaucoup d'utilisateurs vident leur armoire et n'ont rien payé. On exige
  // un champ REMPLI, pas un montant > 0 — bloquer sur « 0 interdit » serait
  // pire que le problème qu'on règle. Ne s'applique QUE quand on s'apprête à
  // créer la ligne d'inventaire (canToggleStock) : un article déjà en stock
  // porte déjà son prix d'achat, on ne le redemande pas.
  // Déclaré AVANT handlePublish, qui le lit : la closure suffirait, mais le
  // garder au-dessus évite toute zone morte temporelle à la relecture.
  const prixAchatNum = Number(String(prixAchatSaisi ?? "").replace(",", "."));
  const prixAchatManquant =
    canToggleStock &&
    (String(prixAchatSaisi ?? "").trim() === "" || !Number.isFinite(prixAchatNum) || prixAchatNum < 0);

  // ── Publication ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    // Défense en profondeur (inventaire plein) : handleNext route déjà vers la
    // ConversionModal — au cas où, on ne tente jamais un publish qui créerait
    // la 21e ligne (le trigger serveur le refuserait de toute façon).
    if (inventoryFull) return;
    // Défense en profondeur (S7) : le CTA est déjà désactivé tant que la
    // relecture des plateformes en ligne n'a pas répondu — on ne publie pas
    // sans connaître l'état publié de l'article.
    if (!publishedStateLoaded) return;
    // Garde extension (2026-08-04) : extension jamais vue → écran d'accroche,
    // AVANT toute création de ligne et tout appel réseau. handleNext route
    // déjà ; ce re-check attrape un état périmé. Le RPC porte la même garde.
    if (extensionBlocked) { setShowExtGate(true); return; }
    // Garde-fou prix (2026-07-13, job 3d194668) : un job price=NULL a atteint
    // la base via « Republier » et n'a été refusé qu'en bout de chaîne, par
    // Vinted. AUCUN flux ne doit pouvoir publier sans prix valide — seuil à
    // 1 €, le minimum Vinted (le plus strict des quatre plateformes).
    const prixNum = Number(price);
    if (price == null || String(price).trim() === "" || !Number.isFinite(prixNum) || prixNum < 1) {
      setPublishError(t("stepPublishPriceMissing"));
      return;
    }
    // Prix d'achat : même défense en profondeur que le prix de vente. Le CTA est
    // déjà gris (requiredBlocking), ce re-check attrape un état périmé ou une
    // course. Zéro est valide — seul un champ VIDE bloque.
    if (prixAchatManquant) {
      setPublishError(t("stepPublishBuyPriceRequired"));
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

      // ── Garde générique Vinted/LBC/Beebs (chantier 1.A, refondue 03/09 soir
      // — « le champ Produit ne doit plus jamais être un cul-de-sac ») ────────
      // DEUX corrections en une :
      //  1. Le re-check levait sur TOUT `state==="missing"`, y compris les
      //     non-bloquants (champ FERMÉ sans liste relevée, règle permissive du
      //     02/09 — exactement le « Produit » LBC des paniers en osier de ce
      //     soir). Le CTA les laissait passer (aspectBloquant), le clic levait
      //     un bandeau rouge SANS champ de saisie nulle part : cul-de-sac
      //     total, zéro trace serveur. Le re-check lit désormais la MÊME
      //     définition que le CTA et l'encart rouge : aspectBloquant, une
      //     seule vérité. Un missing non bloquant part sans le champ — le
      //     pré-rempli de la plateforme ou le needs_user aux options relevées
      //     font foi (doctrine 13/08 + 02/09).
      //  2. Un champ réellement BLOQUANT n'arrête plus TOUT le geste : la
      //     plateforme concernée est EXCLUE de ce clic (même patron que
      //     plateformesSansAdresse plus bas), les autres partent normalement.
      //     Rien n'est publié incomplet : la plateforme exclue attend sa
      //     complétion dans l'encart rouge, nommément.
      const champsManquantsParPf = {};
      for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
        const bloquants = list.filter(aspectBloquant).map(a => a.label ?? a.key);
        if (bloquants.length) champsManquantsParPf[gp] = bloquants;
      }
      const plateformesChampManquant = Object.keys(champsManquantsParPf);

      // Article pas encore en stock : on crée sa ligne inventaire maintenant
      // (ajout systématique), juste avant de générer les jobs de publication,
      // pour que cross_post_jobs.inventaire_id pointe vers la bonne ligne dès
      // l'insert.
      let currentInvId = invId;
      if (addToStock && !currentInvId && createStockItem) {
        try {
          currentInvId = await createStockItem(prixAchatSaisi);
        } catch (e) {
          // Inventaire plein (compte Free à 20 articles). Depuis que l'ajout au
          // stock est systématique, c'est un mur de publication et plus un
          // simple refus d'ajout — il mérite une proposition, pas « Une erreur
          // est survenue ». La ConversionModal Premium est déjà ouverte par
          // vaActions.addItem ; ce message explique ce qui vient de se passer.
          if (String(e?.message) === "INVENTORY_LIMIT") {
            throw new Error(tpl("stepPublishInventoryFull", { n: stockLimitCfg }));
          }
          throw e;
        }
        if (!currentInvId) throw new Error(t("genericError"));
        setInvId(currentInvId);
        setCreatedThisRun(true);
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
      //
      // ── ET SI ELLE MANQUE, ON NE PUBLIE PAS CES PLATEFORMES (2026-08-10) ──
      // Avant : le job partait, était DÉBITÉ, et n'échouait que dans le content
      // script (« Adresse requise pour Leboncoin… »). precheckJob ne regardait
      // que la catégorie. 3 clients l'ont vécu (01/08, 10/08 ×2).
      // Lecture FRAÎCHE au clic — l'état du step 3 peut dater d'avant un
      // aller-retour dans les Réglages, et quelqu'un qui vient de saisir son
      // adresse ne doit surtout pas être bloqué par un état périmé.
      // Lecture en ERREUR ⇒ on ne conclut rien et on repart sur le comportement
      // d'avant (job envoyé, handler juge) : un faux positif coûterait plus cher
      // à tout le monde que l'échec qu'on corrige ici.
      let lbcAddress = null;
      let plateformesSansAdresse = [];
      const besoinAdresse = [...selected].filter(p => PLATEFORMES_ADRESSE_LBC.includes(p));
      if (besoinAdresse.length) {
        const lu = await lireAdresseRemiseLbc();
        if (lu.lue) {
          setAdresseLbc({ chargee: true, valeur: lu.valeur });
          lbcAddress = lu.valeur;
          if (!lbcAddress) plateformesSansAdresse = besoinAdresse;
        } else if (adresseLbc.chargee) {
          lbcAddress = adresseLbc.valeur;
        }
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
        return resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
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

      // ── Garde-fou d'insert (2026-07-30) : aucune valeur manifestement
      // incomplète ou non voulue ne part en prod sans trace. Deux classes
      // réellement observées en base (8 jobs, 3 comptes, 27→30/07) :
      //   · valeur d'UNE lettre ("V", "C", "B", "?") — input démonté à la
      //     première frappe (fix racine dans StepPublish, ceci est le filet) ;
      //   · marque DIVERGENTE de celle de l'article sans édition explicite
      //     ("Springfield" → "Levi's") — résolution IA sur liste partielle
      //     (fix racine dans l'effet resolve_aspects, ceci est le filet).
      //     ⚠️ TRACE SANS ÉCRASER (décision 30/07 soir) : 10 jobs en base
      //     portaient une VRAIE marque lue sur l'article (étiquette en photo,
      //     description) alors que l'inventaire disait « Sans marque » —
      //     divergente ≠ suspecte. Le critère qui discriminerait est la
      //     PROVENANCE (lue sur l'article vs choisie dans une liste relevée),
      //     qu'on ne marque pas aujourd'hui ; la source empoisonnée (listes
      //     partielles transmises à l'IA) étant tarie à l'amont, écraser ici
      //     détruirait plus d'information correcte qu'il n'en protégerait.
      // Toute valeur écartée/corrigée laisse une trace REQUÊTABLE :
      //   platform_fields->'suspect_values' IS NOT NULL
      // Format : { "<champ>": { rejected, kept, reason } }.
      // Tourne AVANT les branches par plateforme : la normalisation Vinted
      // des couleurs (colors) repart d'un pf.couleur déjà assaini.
      // `expected` (optionnel) : valeur attendue quand on trace une
      // divergence SANS la corriger (brand_mismatch) — rejected === kept
      // signifie « rien retiré, la valeur part telle quelle ».
      const flagSuspect = (pf, field, rejected, kept, reason, expected) => {
        pf.suspect_values = {
          ...(pf.suspect_values ?? {}),
          [field]: { rejected, kept: kept ?? null, reason, ...(expected !== undefined ? { expected } : {}) },
        };
      };
      // Une lettre seule (ou "?") n'est une valeur plausible pour aucun champ
      // texte libre — mais "S"/"M"/"L" sont des TAILLES légitimes et "9" une
      // pointure : les clés taille/pointure/âge et les chiffres sont exclus.
      const SUSPECT_SINGLE_RE = /^[A-Za-zÀ-ÿ?]$/;
      const SIZE_LIKE_KEY_RE = /taille|size|pointure|age|âge/i;
      const brandChannelKey = (platform, k) =>
        (platform === "vinted" && k === "brand") ||
        (platform === "leboncoin" && /_brand$/.test(k)) ||
        ((platform === "beebs" || platform === "ebay") && k === "Marque");
      // eBay a le même canal d'aspects (ebayAspects, rempli par la même
      // résolution IA) : même exposition, même filet. Le "p" tapé en Marque
      // du run réel du 12/07 était exactement cette classe.
      const ASPECTS_PF_KEY = { ...GENERIC_ASPECTS_PF_KEY, ebay: "ebayAspects" };
      const sanitizeJobFields = (platform, pf) => {
        const OPEN_TEXT_KEYS = ["marque", "matiere", "couleur", "modele"];
        // Espaces parasites des relevés/committs ("Boutique italienne ").
        for (const k of OPEN_TEXT_KEYS) if (typeof pf[k] === "string") pf[k] = pf[k].trim();
        // 1. Valeurs d'une lettre sur les champs dédiés — restauration depuis
        // l'article (valeur IA d'origine) quand elle existe, sinon retrait :
        // mieux vaut un requis manquant VISIBLE qu'une marque "B" publiée.
        for (const k of OPEN_TEXT_KEYS) {
          const v = pf[k];
          if (typeof v === "string" && SUSPECT_SINGLE_RE.test(v)) {
            const restore = String(initialListing?.[k] ?? "").trim();
            const kept = restore.length > 1 ? restore : null;
            flagSuspect(pf, k, v, kept, "single_char");
            if (kept) pf[k] = kept; else delete pf[k];
          }
        }
        // 1bis. Même règle sur le canal d'aspects (vintedAspects/lbcAspects/
        // beebsAspects/ebayAspects), clés de type taille exclues.
        const aspectsKey = ASPECTS_PF_KEY[platform];
        const aspects = aspectsKey && pf[aspectsKey] && typeof pf[aspectsKey] === "object" ? { ...pf[aspectsKey] } : null;
        if (aspects) {
          for (const [k, v] of Object.entries(aspects)) {
            if (typeof v !== "string") continue;
            const t = v.trim();
            if (t !== v) aspects[k] = t;
            if (SUSPECT_SINGLE_RE.test(t) && !SIZE_LIKE_KEY_RE.test(k)) {
              flagSuspect(pf, `${aspectsKey}.${k}`, t, null, "single_char");
              delete aspects[k];
            }
          }
        }
        // 2. Marque divergente de celle de l'article sans édition explicite
        // de CETTE copie (sharedOverrides trace les éditions manuelles ; les
        // écritures IA n'en posent pas) : TRACÉE, JAMAIS écrasée — une marque
        // lue sur l'article (étiquette, description) diverge légitimement
        // d'un inventaire « Sans marque » (cf. bloc de tête du garde-fou).
        // `rejected: null` = rien retiré, la valeur part telle quelle ;
        // `expected` = la marque de l'article, pour compter/comparer en SQL.
        const canonicalMarque = String(sharedFields.marque || initialListing?.marque || "").trim();
        const overridden = Boolean(sharedOverrides[platform]?.has("marque"));
        if (canonicalMarque.length > 1 && !overridden) {
          if (typeof pf.marque === "string" && pf.marque &&
              normAspectVal(pf.marque) !== normAspectVal(canonicalMarque)) {
            flagSuspect(pf, "marque", pf.marque, pf.marque, "brand_mismatch", canonicalMarque);
          }
          if (aspects) {
            for (const [k, v] of Object.entries(aspects)) {
              if (typeof v === "string" && v && brandChannelKey(platform, k) &&
                  normAspectVal(v) !== normAspectVal(canonicalMarque)) {
                flagSuspect(pf, `${aspectsKey}.${k}`, v, v, "brand_mismatch", canonicalMarque);
              }
            }
          }
        }
        if (aspects) pf[aspectsKey] = aspects;
      };

      // Les plateformes sans adresse sortent AVANT la construction des jobs :
      // spend_coins_and_publish calcule le débit sur `p_jobs`, donc ce qui ne
      // rentre pas ici n'est ni inséré, ni facturé. Les autres partent
      // normalement — on ne bloque que ce qui ne peut pas aboutir.
      //
      // ⚠️ MÊME POINT DE SORTIE pour les produits INTERDITS par la plateforme
      // (cosmétiques consommables sur Leboncoin, 2026-08-11) : le grisage de la
      // case et le filtre de `selected` s'en chargent déjà, mais tous deux
      // vivent dans un state React qui peut être périmé (article ré-analysé
      // après la coche, retour arrière dans le stepper). Le débit, lui, se joue
      // ICI — c'est donc ici que la garde doit être dure. Recalculé à frais sur
      // platformSupport, jamais sur une décision prise plus tôt.
      const plateformesInterdites = [...selected].filter(p => platformSupport?.[p] === "prohibited");
      // Troisième terme (2026-08-11) : SANS ANNONCE GÉNÉRÉE. Il manquait, alors
      // que `publishChips` — qui compte les plateformes et calcule le total de
      // unités affiché sur le bouton — le filtre depuis toujours. Une
      // plateforme cochée dont la génération n'a pas rendu de copie partait
      // donc quand même : une ligne de job avec des platform_fields VIDES, et
      // un débit de plus que ce que le CTA annonçait. « Jamais un total faux »
      // vaut dans les deux sens.
      const plateformesSansAnnonce = [...selected].filter(p => !platformListings?.platforms?.[p]);
      const plateformesAPublier = [...selected].filter(
        p => !plateformesSansAdresse.includes(p)
          && !plateformesInterdites.includes(p)
          && !plateformesSansAnnonce.includes(p)
          && !plateformesChampManquant.includes(p)
      );
      if (!plateformesAPublier.length) {
        // Rien de publiable ne restait. Le CTA est déjà gris dans ce cas
        // (publishChips), ce re-check attrape un état périmé ou une course.
        // Aucune unité engagée.
        if (plateformesInterdites.length) {
          throw new Error(supportMessage(t, "prohibited", plateformesInterdites.map(p => PLATFORM_LABELS[p]).join(", ")));
        }
        // Seules des plateformes à champ obligatoire manquant : INVITATION à
        // compléter (le champ vit dans l'encart rouge juste au-dessus), plus
        // jamais un « pas possible » sec. Trace règle 3 : ce refus n'existe
        // nulle part côté serveur sans elle.
        if (plateformesChampManquant.length) {
          for (const gp of plateformesChampManquant) logChampBloquant("bloque_au_clic", {
            platform: gp, champs: champsManquantsParPf[gp],
            categorie: genericCategoryKeys?.[gp] ?? initialListing?.categorie ?? null,
          });
          throw new Error(plateformesChampManquant.map(gp =>
            lang === "en"
              ? `${GENERIC_PLATFORM_LABELS[gp] ?? gp} is waiting for: ${champsManquantsParPf[gp].join(", ")}`
              : `${GENERIC_PLATFORM_LABELS[gp] ?? gp} attend : ${champsManquantsParPf[gp].join(", ")}`
          ).join(" · ") + (lang === "en"
            ? " — fill it in the red “Some info is missing to publish” box above, then publish again. Nothing was counted."
            : " — complète dans l'encart rouge « Il manque des infos pour publier » juste au-dessus, puis republie. Rien n'a été décompté."));
        }
        // Aucune annonce générée : dire ÇA, et pas le message d'adresse — un
        // motif faux coûte plus cher qu'un motif générique.
        if (plateformesSansAnnonce.length && !plateformesSansAdresse.length) {
          throw new Error(lang === "en"
            ? "No listing was generated for the selected platforms. Go back to the previous step and generate them again."
            : "Aucune annonce n'a été générée pour les plateformes cochées. Reviens à l'étape précédente et relance la génération.");
        }
        // Seules des plateformes sans adresse étaient cochées.
        throw new Error(lang === "en"
          ? "Add your pickup address in Settings → “Leboncoin pickup address” before publishing on Leboncoin or Beebs."
          : "Renseigne ton adresse dans Réglages → « Adresse de remise Leboncoin » avant de publier sur Leboncoin ou Beebs.");
      }
      const rows = plateformesAPublier.map(platform => {
        const pf = { ...(edited[platform]?.platform_fields ?? {}) };
        // Photos du JOB, par plateforme. Identiques à processedPhotos partout —
        // SAUF plafonnement Leboncoin (quota gratuit par feuille, cf. bloc LBC
        // plus bas). Aucune autre plateforme n'y touche.
        let rowPhotos = processedPhotos;
        // Dernier filet avant l'insert du job : un état vidé à la main (ou un
        // `edited` venant d'un chemin qui n'est pas passé par
        // mergeFieldsWithLens) ne part JAMAIS vide vers l'extension.
        for (const field of platformFieldsConfig[platform] ?? []) {
          if (isConditionKey(field.key) && !String(pf[field.key] ?? "").trim())
            pf[field.key] = defaultConditionFor(field);
        }
        sanitizeJobFields(platform, pf);
        if (platform === "leboncoin") {
          const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
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
          // ── Quota de photos GRATUITES (2026-08-10, cause de l'échec du job
          // ad915ed5) ───────────────────────────────────────────────────────
          // Relevé LIVE : en Divers > Autres, Leboncoin n'offre que 3 photos.
          // Dès la 4e, le dépôt devient une commande payante (« Pack photos
          // supplémentaires », 4 €) et son écran /options RETIRE le bouton
          // « Déposer sans booster mon annonce » — il ne reste que « Valider et
          // payer », que l'extension refuse de cliquer (à raison). Résultat :
          // « écran post-aperçu non reconnu », publication perdue.
          // On envoie donc au JOB les 3 premières photos seulement, et
          // uniquement pour CETTE feuille : getLbcFreePhotoQuota ne connaît que
          // les quotas RELEVÉS (cf. son commentaire — Mode publie jusqu'à 9
          // photos, mesuré en base, il n'est pas question de l'amputer).
          // Placé en FIN de bloc : lbcCategoryPath peut avoir été réécrit
          // au-dessus (route « Vêtements bébé »), c'est la valeur FINALE qui
          // décide. Les autres plateformes gardent processedPhotos intact.
          const quotaPhotosLbc = getLbcFreePhotoQuota(pf.lbcCategoryPath);
          if (quotaPhotosLbc != null && Array.isArray(processedPhotos) &&
              processedPhotos.length > quotaPhotosLbc) {
            pf.lbcPhotosOriginales = processedPhotos.length;
            pf.lbcPhotosCapped = true;
            rowPhotos = processedPhotos.slice(0, quotaPhotosLbc);
            console.log(
              `[publish] Leboncoin ${pf.lbcCategoryPath.join(" > ")} : ` +
              `${processedPhotos.length} photos → ${quotaPhotosLbc} (quota gratuit de la catégorie)`
            );
          }
        }
        if (platform === "vinted") {
          // Chemin catalogue Vinted calculé à l'insert : icône objet (mêmes
          // règles que les tuiles Stock/Ventes) + genre IA/corrigé. null →
          // pas de categoryPath → l'extension marque le job "failed" avec un
          // message explicite (fallback volontaire, cf. vintedCategories.js).
          const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
          // Genre vide/Mixte sur une catégorie qui l'exige → genre auto-résolu
          // (cf. bloc autoGenre) : le job part avec un rayon réel au lieu
          // d'être condamné au fallback.
          if (autoGenre && vintedGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
          // Titre de la copie joint (2026-08-08, B3b) : il affine la feuille
          // enfant (body → Bodies, manteau → Manteaux) — même chemin sinon.
          const categoryPath = getVintedCategoryPath(icon, pf.genre, edited[platform]?.title ?? "");
          if (categoryPath) pf.categoryPath = categoryPath;
          // Flag statique lu par l'extension : permet un message d'échec
          // précis ("genre requis") quand un job sans categoryPath vient d'un
          // article de mode plutôt que d'une icône hors mapping.
          if (vintedGenreRequired(icon)) pf.vintedGenreRequired = true;
          // L'extension consomme `colors` (tableau, 2 max côté Vinted).
          // NORMALISATION vers la palette FERMÉE Vinted (2026-07-30, job
          // 243097d4 : couleur IA "Argent" ∉ palette → champ laissé vide →
          // 400 serveur "Le champ Couleur doit être renseigné"). Le split
          // brut d'avant laissait passer n'importe quel libellé ; désormais
          // colors ne porte QUE des libellés exacts (variantes normalisées :
          // Argent→Argenté, Or→Doré…, composés éclatés : "Bleu gris" →
          // Bleu + Gris, 2 max, dominante d'abord). Rien ne se normalise →
          // colors ABSENT + color_unmapped = valeur brute, requêtable :
          //   platform_fields->>'color_unmapped' IS NOT NULL
          // Vinted UNIQUEMENT : les couleurs LBC/Beebs sont des champs
          // libres ("Argent" y passe très bien), eBay fait son propre split.
          if (pf.couleur) {
            const { colors, unmapped } = normalizeVintedColors(pf.couleur);
            if (colors.length) {
              pf.colors = colors;
            } else {
              delete pf.colors;
              if (unmapped) pf.color_unmapped = unmapped;
            }
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
          const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
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
          const icon = resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
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
          // Vinted refuse un titre trop capitalisé (400 serveur, champ title,
          // 2026-08-15) : normalisation à l'ENVOI — elle rattrape l'IA comme
          // la saisie manuelle. Les autres plateformes partent telles quelles.
          title:           platform === "vinted"
            ? normalizeVintedTitle(edited[platform]?.title ?? "")
            : (edited[platform]?.title ?? ""),
          description:     edited[platform]?.description     ?? "",
          price:           edited[platform]?.price           ?? price,
          photos:          rowPhotos,
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
        // ⚠️ RÉVISÉ le 2026-07-29 (doctrine « liste = suggestion ») : le seuil
        // ≤200 ci-dessus était une HEURISTIQUE à nous pour deviner si un aspect
        // FREE_TEXT était « en fait » fermé. eBay, lui, le DIT : `mode`. Quand
        // eBay déclare FREE_TEXT, refuser une valeur ici revenait à interdire
        // une publication qu'eBay aurait acceptée — 498 aspects requis en base
        // sont dans ce cas, contre 110 SELECTION_ONLY. Seul SELECTION_ONLY
        // reste un refus ; le reste devient un avertissement en console, la
        // publication part.
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
          if (!allowed.length) continue;
          if (allowed.some(v => normFuzzy(v) === normFuzzy(val))) continue;
          const faitFoi = listeFaitFoi("ebay", aspect.mode);
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
          // Aucun rapprochement sûr. Liste NON autoritaire (eBay FREE_TEXT) :
          // avertissement, jamais un refus — la valeur part telle quelle, eBay
          // l'accepte en saisie libre et l'extension sait la taper.
          if (!faitFoi) {
            console.warn(`[publish] eBay ${aspect.name} : « ${val} » absent de la liste (${allowed.length} valeurs, mode=${aspect.mode ?? "?"}) — envoyé tel quel, la liste n'est qu'une suggestion.`);
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
          ouvrirQuotaModal("plafond_pepites_publi", { trigger: "publish", targetTiers: ["premium","pro"] });
          return;
        }
        // Garde serveur extension (2026-08-04) : la garde UI (handleNext /
        // handlePublish) rend ce chemin rare — profil pas encore chargé, ou
        // client qui a contourné. Aucune unité débitée. L'accroche vaut
        // mieux qu'un bandeau ici aussi.
        if (pubRes.reason === "extension_required") {
          setShowExtGate(true);
          return;
        }
        // Garde serveur anti-republication (2026-07-25, S7) : le RPC refuse un
        // job pour une plateforme déjà en ligne ou déjà en file — dernier filet
        // quand le griséage front n'a pas suffi (chemin Lens, course).
        if (pubRes.reason === "already_published") {
          const plats = (Array.isArray(pubRes.platforms) ? pubRes.platforms : [])
            .map(p => PLATFORM_LABELS[p] ?? p).join(", ");
          throw new Error(lang === "en"
            ? `Already live or queued on: ${plats}. Remove that listing first (tap the platform logo on the item card) or unselect the platform.`
            : `Déjà en ligne (ou en file) sur : ${plats}. Retire d'abord cette annonce (tap sur le logo de la plateforme sur la carte de l'article) ou décoche la plateforme.`);
        }
        // Filet générique (2026-08-04) : un refus futur du RPC qui porte un
        // `message` s'affiche tel quel dans le bandeau — plus jamais « Une
        // erreur est survenue » quand le serveur a pris la peine d'expliquer.
        if (typeof pubRes.message === "string" && pubRes.message.trim()) {
          throw new Error(pubRes.message);
        }
        throw new Error(t("genericError"));
      }
      // Les jobs sont en base : le Stock peut afficher « En cours… » tout de
      // suite (patch optimiste, cf. prop onJobsQueued). Une relecture réelle
      // écrasera ces lignes synthétiques au prochain poll.
      // plateformesAPublier et non [...selected] (03/09 soir) : une plateforme
      // exclue de ce clic (champ manquant, adresse, interdite, sans annonce)
      // n'a AUCUN job — l'annoncer « En cours… » au Stock était un mensonge
      // optimiste que le poll suivant venait démentir.
      onJobsQueued?.(currentInvId ?? null, plateformesAPublier);
      // Photos : PLUS d'UPDATE client ici (2026-08-04). spend_coins_and_publish
      // écrit inventaire.photos DANS la transaction du débit (migration
      // 20260804210000) : la retouche payée est rattachée à l'article même si
      // l'app meurt ou perd le réseau juste après le RPC. L'ancien UPDATE
      // post-RPC était le seul porteur de cette écriture — et sautait dans ces
      // deux cas, retouche payée et perdue.
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
      // Règles 2+3 (03/09 soir) : le geste est PARTI, mais sans les
      // plateformes au champ obligatoire manquant — on le dit sur l'écran de
      // succès (nommément) et on le trace (ce cas n'existe nulle part côté
      // serveur : aucun job créé pour ces plateformes).
      if (plateformesChampManquant.length) {
        setPublieesSansPf(plateformesChampManquant.map(gp => ({
          platform: gp, champs: champsManquantsParPf[gp],
        })));
        for (const gp of plateformesChampManquant) logChampBloquant("publie_sans_plateforme", {
          platform: gp, champs: champsManquantsParPf[gp],
          categorie: genericCategoryKeys?.[gp] ?? initialListing?.categorie ?? null,
        });
      } else {
        setPublieesSansPf([]);
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

  // Adresse de remise absente (2026-08-10) : ces plateformes ne partiront pas,
  // elles ne doivent donc ni être comptées dans « Publier sur N » ni gonfler le
  // total d'unités affiché — « jamais un total faux ». lbcAdresseManquante
  // vaut null tant qu'on ne sait pas : le compte reste alors celui d'avant.
  // Même raison pour un produit INTERDIT par la plateforme (2026-08-11) : ce
  // qui ne peut pas partir ne se compte pas et ne se facture pas.
  // Depuis le 11/08 la liste est calculée UNE fois (plateformesPubliables) et
  // lue par toutes les gardes — le compteur du CTA n'en est plus qu'un des
  // consommateurs, il ne peut plus diverger de ce qui bloque.
  // ── Règle 2 (03/09 soir) : une plateforme au champ obligatoire BLOQUANT ne
  // part pas à ce clic (exclue par handlePublish) — elle sort donc AUSSI du
  // compte et du total du CTA (« jamais un total faux »). ⚠️ On ne la retire
  // PAS de plateformesPubliables : genericRequiredStatus en dérive — l'en
  // retirer éteindrait le statut qui la bloque (boucle). eBay garde son
  // comportement global (CTA gris), cf. requiredBlocking.
  const plateformesBloqueesChamps = [...plateformesPubliables].filter(p =>
    (genericRequiredStatus?.[p] ?? []).some(aspectBloquant));
  const publishChips = [...plateformesPubliables].filter(p => !plateformesBloqueesChamps.includes(p));

  function ctaLabel() {
    if (step === 0) {
      if (uploading)              return t("ctaUploading");
      if (photoCount < MIN_PHOTOS) return minPhotosLabel;
      return tpl("ctaContinuePhotos", { n:photoCount });
    }
    if (step === 1) {
      if (photos.length < MIN_PHOTOS) return minPhotosLabel;
      // Génération payante (2026-08-05) : le prix s'affiche AVANT le clic —
      // config pas encore lue → libellé sans prix, jamais un montant faux.
      // Génération payante pour TOUS les paliers (retour arrière du 08/08
      // après-midi — la gratuité Pro du matin n'était bornée par rien).
      const genPrice = coinPrices?.generate ?? null;
      if (genPrice != null) return <>{t("ctaGenerateListings")} ({genPrice})</>;
      return t("ctaGenerateListings");
    }
    if (step === 2) {
      if (generatingPlatforms || !platformListings) return t("ctaGenerating");
      return t("ctaContinueToPublish");
    }
    if (step === 3) {
      // Inventaire plein (Free) : le CTA ne propose plus de publier — il ouvre
      // la modale de plans. Libellé NEUTRE quant au plan (la modale propose
      // Premium ET Pro, le CTA ne préjuge pas du choix).
      if (inventoryFull) return lang === "en" ? "See plans" : "Voir les offres";
      if (publishing) return t("ctaPublishing");
      const n = publishChips.length;
      // Grille 2 axes : le CTA affiche le TOTAL débité au clic, recalculé à
      // chaque plateforme cochée/décochée. Config pas encore lue → libellé
      // sans prix (jamais un total faux).
      const total = publishTotalFor(photoOption, n);
      if (total != null) return <>{tpl("ctaPublishOnPlatforms", { n })} · {total}</>;
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
  // ⚠️ 2026-07-29 : "invalid" ne bloque plus QUE s'il vient d'une liste qui fait
  // foi (a.blocking === true, cf. `listeFaitFoi`). Un « hors liste » jugé contre
  // un RELEVÉ potentiellement partiel n'est qu'un avertissement — c'est la
  // doctrine posée après le blocage prod Beebs/Marque. "missing" (champ VIDE
  // exigé par la plateforme) reste bloquant : c'est une absence de valeur, pas
  // un désaccord avec une liste.
  // (aspectBloquant : helper module, partagé avec l'encart rouge de StepPublish
  // et la liste des motifs ci-dessous — une seule définition de « bloquant ».)
  // ── Règle 2 (03/09 soir) : le canal générique (Vinted/LBC/Beebs) ne grise
  // plus le CTA GLOBALEMENT — une plateforme bloquée est exclue du clic et du
  // compte (plateformesBloqueesChamps ↑), les autres partent. Toutes bloquées
  // ⇒ publishChips tombe à 0 et ctaBlockingActive grise avec les motifs
  // nommés, comme avant. Les bloqueurs de l'ARTICLE (champs partagés, prix
  // d'achat) et eBay (garde au clic non refondue, signalée à Nico) restent
  // globaux.
  const requiredBlocking =
    (ebayRequiredStatus ?? []).some(aspectBloquant) ||
    missingSharedFields.length > 0 ||
    prixAchatManquant ||
    vintedGenreBlocked ||
    beebsGenreBlocked;

  // SOURCE UNIQUE de « le bouton Publier est gris pour une raison que
  // l'utilisateur doit lire » : ctaDisabled ET motifsCtaGris en dérivent tous
  // les deux, aucun risque qu'ils divergent. `publishing` en est exclu — c'est
  // un état transitoire, pas une condition à corriger.
  const ctaBlockingActive =
    step === 3 && !inventoryFull && !publishing &&
    (publishChips.length === 0 || requiredBlocking || !publishedStateLoaded);

  // ── POURQUOI LE BOUTON EST GRIS (2026-08-11) ──────────────────────────────
  // Un CTA désactivé SANS motif lisible est un cul-de-sac : l'utilisateur voit
  // des pastilles vertes et un bouton mort, et il écrit au support (cas
  // RoCotCot du 11/08). Règle posée : toute condition qui grise le bouton à
  // l'étape Publier se NOMME ici, en clair, sous le bouton. La liste est
  // dérivée des MÊMES expressions que `requiredBlocking` — pas une seconde
  // énumération à tenir à jour : si une garde s'ajoute sans entrer ici, le
  // filet générique en fin de fonction le dit quand même.
  const nomPlateforme = p => PLATFORM_LABELS[p] ?? p;
  const motifsCtaGris = (() => {
    if (step !== 3 || inventoryFull || !ctaBlockingActive) return [];
    const m = [];
    // ── UNE ligne par CHAMP logique (2026-08-28, cas Ornella) ────────────────
    // L'encart rouge et les référentiels par plateforme émettaient chacun
    // leur ligne pour le même champ : « Taille — Vinted, Beebs », « Taille —
    // Vinted » et « Taille — Beebs » pour UN seul manque. Déduplication sur
    // la CLÉ DE CHAMP (partagée quand elle existe — un seul input alimente
    // toutes les plateformes — sinon la clé propre à la plateforme, qui reste
    // une ligne à part : deux champs distincts font toujours deux lignes),
    // jamais sur le libellé affiché. Sortie : « Taille (Vinted, Beebs) ».
    const libellePartage = { taille: t("fieldSizeLabel"), couleur: t("fieldColorLabel"),
                             matiere: t("fieldMaterialLabel"), marque: t("fieldBrandLabel") };
    const parChamp = new Map(); // clé logique → { label, platforms: [] }
    const ajoute = (cle, label, plateforme) => {
      const e = parChamp.get(cle) ?? { label, platforms: [] };
      if (plateforme && !e.platforms.includes(plateforme)) e.platforms.push(plateforme);
      parChamp.set(cle, e);
    };
    for (const f of missingSharedFieldsDetailed) {
      for (const p of f.platforms) ajoute(f.key, libellePartage[f.key] ?? f.key, nomPlateforme(p));
    }
    for (const a of (ebayRequiredStatus ?? []).filter(aspectBloquant)) {
      const sk = a.sharedKey && libellePartage[a.sharedKey] ? a.sharedKey : null;
      ajoute(sk ?? `ebay:${a.name}`, sk ? libellePartage[sk] : (a.label ?? a.name), "eBay");
    }
    for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
      for (const a of list.filter(aspectBloquant)) {
        const sk = genericFieldToSharedKey(gp, a.key);
        ajoute(sk ?? `${gp}:${a.key}`, sk ? (libellePartage[sk] ?? a.label ?? a.key) : (a.label ?? a.key), nomPlateforme(gp));
      }
    }
    for (const e of parChamp.values()) {
      m.push(e.platforms.length ? `${e.label} (${e.platforms.join(", ")})` : e.label);
    }
    if (prixAchatManquant) m.push(lang === "en" ? "Purchase price to fill in" : "Prix d'achat à renseigner");
    if (vintedGenreBlocked) m.push(lang === "en" ? "Vinted section to choose" : "Rayon Vinted à choisir");
    if (beebsGenreBlocked) m.push(lang === "en" ? "Beebs section to choose" : "Rayon Beebs à choisir");
    if (publishChips.length === 0) {
      m.push(lang === "en" ? "No platform ready to publish" : "Aucune plateforme prête à publier");
    }
    if (!publishedStateLoaded) {
      m.push(lang === "en" ? "Checking your existing listings…" : "Vérification de tes annonces en cours…");
    }
    // Filet : gris sans motif identifié = anomalie. On le DIT plutôt que de
    // laisser un bouton mort et muet — c'est tout l'objet de ce bloc.
    if (!m.length) {
      m.push(lang === "en"
        ? "A required field is still missing. Try reopening this step."
        : "Un champ obligatoire manque encore. Rouvre cette étape pour le voir.");
    }
    return m;
  })();

  const ctaDisabled =
    (step === 0 && (photoCount < MIN_PHOTOS || uploading)) ||
    (step === 1 && (photos.length < MIN_PHOTOS || selected.size === 0)) ||
    (step === 2 && (generatingPlatforms || !platformListings)) ||
    // !publishedStateLoaded (S7) : pas de clic Publier tant que la relecture
    // des plateformes déjà en ligne n'a pas répondu — sinon une fenêtre de
    // quelques centaines de ms permettait de lancer une republication.
    // inventoryFull court-circuite ces gardes : le CTA ne publie plus, il
    // ouvre le passage Premium — il doit rester cliquable.
    (step === 3 && !inventoryFull && (publishing || ctaBlockingActive));

  function handleNext() {
    if (step === 0) { handleUpload(); return; }
    if (step === 1) {
      // (Suppression unités 03/09 : la garde de solde pré-génération est
      // morte avec le wallet — les quotas se tranchent côté serveur, qui
      // répond generation_limit/402 avec son propre message.)
      // Lens unifié : une retouche choisie exige la génération classique (le
      // scan a rédigé sans retoucher). On abandonne la rédaction pré-générée —
      // l'effet d'auto-génération de l'étape 2 reprend la main, applique la
      // retouche et compte sa propre unité (comme avant la fusion). Le
      // marqueur lens_unifie (posé à l'application, il survit au brouillon
      // sessionStorage) garantit qu'on ne jette QUE l'hydratation du scan —
      // jamais une génération classique déjà obtenue dans cette session.
      if (platformListings?.lens_unifie && photoOption !== "original") {
        setPlatformListings(null);
        setProcessedPhotos([]);
        setEdited({});
      }
      setStep(2);
      return;
    }
    if (step === 2) { if (platformListings) { setStep(3); } return; }
    if (step === 3) {
      // Inventaire plein : le CTA est un passage Premium, jamais un publish.
      if (inventoryFull) {
        ouvrirQuotaModal("stepper_publication", { trigger: "stock", targetTiers: ["premium", "pro"] }, "clic");
        return;
      }
      // Extension jamais vue : le CTA ouvre l'accroche (sync dressing, lien à
      // récupérer sur ordinateur) — aucun RPC tenté, aucune unité engagée.
      if (extensionBlocked) {
        setShowExtGate(true);
        return;
      }
      handlePublish();
    }
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
      {/* Ligne POSITIVE (2026-08-04) : la publication vient de créer la ligne
          inventaire (1-bis) — on le dit comme un acquis (« ajouté à ton
          stock »), jamais comme un avertissement : la contrainte technique est
          la nôtre, pas la sienne, et il a payé. */}
      {createdThisRun && (
        <div style={{ fontSize:13, color:T.tealDeep, fontWeight:600, textAlign:"center", lineHeight:1.5, marginTop:12, maxWidth:300 }}>
          {/* « avec ses photos retouchées » seulement si la retouche a été
              LIVRÉE — sinon la ligne mentirait sur ce qui a été payé. */}
          {photoOption !== "original" && !retoucheNonLivree ? t("doneAddedToStockRetouched") : t("doneAddedToStock")}
        </div>
      )}
      {/* Règle 2 (03/09 soir) : le geste est parti SANS ces plateformes — le
          dire ICI, nommément, sinon l'écran « ✅ » raconte un succès complet
          qui n'a pas eu lieu. Ambre, jamais rouge : rien n'est cassé. */}
      {publieesSansPf.length > 0 && (
        <div style={{ marginTop:14, padding:"10px 14px", borderRadius:12, background:"#FFF6E3", border:"1px solid #EED9A6", fontSize:12.5, lineHeight:1.55, color:"#8A6100", fontWeight:600, maxWidth:320, textAlign:"left" }}>
          {publieesSansPf.map(({ platform, champs }) => (
            <div key={platform}>
              ✋ {lang === "en"
                ? `${GENERIC_PLATFORM_LABELS[platform] ?? platform} did not go out — it is waiting for: ${champs.join(", ")}.`
                : `${GENERIC_PLATFORM_LABELS[platform] ?? platform} n'est pas partie — elle attend : ${champs.join(", ")}.`}
            </div>
          ))}
          <div style={{ fontWeight:500, marginTop:4 }}>
            {lang === "en"
              ? "Reopen “Publish” on the item, fill in the field, and it goes out too."
              : "Rouvre « Publier » sur l'article, complète le champ, et elle part aussi."}
          </div>
        </div>
      )}
      <button
        // onClose(true) = fermeture APRÈS publication réussie — l'hôte Lens
        // purge alors tout le parcours (photos, analyse, prix) au lieu de
        // ré-afficher l'analyse de l'article qui vient de partir. Le retour
        // arrière (handleBack) appelle onClose() sans argument : un abandon
        // conserve l'état pour reprendre. StockTab ignore l'argument.
        onClick={() => onClose(true)}
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
            reuseRetouched={reuseRetouched}
            retoucheNewCount={alreadyRetouched && addedNewPhotos
              ? photos.filter(u => !initialPhotos.includes(u)).length
              : 0}
            platformSupport={platformSupport}
            publishedSet={publishedSet}
            queuedSet={queuedSet}
            lang={lang}
            onAnalyze={handleAnalyzePhotos}
            analyzing={analyzing}
            analysisResult={photoAnalysis}
            analysisError={analysisError}
            // Article venant de Lens : il a déjà prix et attributs → on ne
            // propose PAS une seconde analyse payante pour le même article.
            analysisHidden={initialListing?.prix_vente_suggere != null || initialListing?.taille_estimee != null}
            modeleAConfirmer={modeleAConfirmer}
            modelePropose={initialListing?.modele ?? null}
            modeleSource={initialListing?.modele_source ?? null}
            onConfirmModele={setModeleConfirme}
            identifyFailed={identifyFailed}
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
            generatePrice={coinPrices?.generate ?? null}
            noteOverride={noteSharedOverride}
            lang={lang}
            price={price}
            setPrice={setPrice}
            customPriced={customPriced}
            setCustomPriced={setCustomPriced}
            articleIcon={articleIcon}
            photoOption={photoOption}
            // Le scan complet, proposé LÀ OÙ il a une valeur : le seul endroit
            // de l'app où l'utilisateur a une raison de vouloir dépenser.
            // Même moteur, même débit serveur, même 402 que la carte du step 1.
            onEstimatePrice={handleAnalyzePhotos}
            estimating={analyzing}
            estimateCost={coinPrices?.lens_overflow ?? null}
            estimateError={analysisError}
            estimateResult={photoAnalysis}
            // Prix d'achat pour la marge : la saisie du step Publier d'abord,
            // sinon celui déjà porté par l'article. Absent = mode chine, et
            // AnalyseMarche rend le prix plafond au lieu d'un verdict.
            prixAchat={prixAchatSaisi || initialListing?.prix_achat || null}
          />
        )}
        {step === 3 && (
          <StepPublish
            selected={selected}
            setSelected={setSelected}
            platformSessions={platformSessions}
            platformListings={platformListings}
            publishError={publishError}
            lang={lang}
            canToggleStock={canToggleStock}
            inventoryFull={inventoryFull}
            stockCount={stockCount}
            stockLimit={stockLimitCfg}
            prixAchatSaisi={prixAchatSaisi}
            setPrixAchatSaisi={setPrixAchatSaisi}
            // Depuis le 2026-08-28, le bloc rouge porte TOUS les champs
            // partagés manquants (un seul endroit de saisie) — la garde du
            // CTA, elle, lit toujours les listes complètes.
            missingSharedFields={redSharedFields}
            missingSharedFieldPlatforms={redSharedFieldPlatforms}
            sharedFields={sharedFields}
            onSharedFieldChange={setSharedField}
            sharedChildAxes={sharedChildAxes}
            vintedGenreBlocked={vintedGenreBlocked}
            beebsGenreBlocked={beebsGenreBlocked}
            ebayRequiredStatus={ebayRequiredStatus}
            onEbayAspectChange={setEbayAspect}
            onEbaySharedFieldChange={setEbaySharedField}
            genericRequiredStatus={genericRequiredStatus}
            onPlatformAspectChange={setPlatformAspect}
            onPlatformDedicatedChange={setPlatformDedicatedField}
            pausedPlatforms={pausedPlatforms}
            pausedReasons={pausedReasons}
            lbcPhotoCap={lbcPhotoCap}
            lbcAdresseManquante={lbcAdresseManquante}
          />
        )}
      </div>

      {/* Footer CTA — pinné en bas du viewport dynamique (flex-shrink:0), pas
          dans le flux scrollé : toujours visible, jamais sous la barre Safari.
          Fond + bordure haute pour le détacher du contenu qui scrolle dessous. */}
      <div style={{ padding:"8px 20px", paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 20px)", flexShrink:0, background:T.canvas, borderTop:`1px solid ${T.border}`, boxShadow:"0 -6px 16px rgba(16,32,27,0.05)" }}>
        {/* Retouche non aboutie : dit AVANT le clic Publier que la part photos
            ne sera pas facturée (le serveur applique la même règle, RPC v6).
            Jamais un rabais silencieux que l'utilisateur prendrait pour un
            bug de prix. */}
        {retoucheNonLivree && step >= 2 && (
          <div style={{ marginBottom:8, padding:"9px 12px", borderRadius:10, background:"#FFFBEB", border:"1px solid #FCD34D", fontSize:12, lineHeight:1.45, color:"#92400E", fontWeight:600 }}>
            {lang === "en"
              ? "Photo retouching didn't come through — you won't be charged for it. Your original photos will be posted as they are."
              : "La retouche photos n'a pas abouti — elle ne te sera pas facturée. Tes photos d'origine partent telles quelles."}
          </div>
        )}
        {/* ── Règle 2 (03/09 soir) : plateforme(s) en attente d'un champ,
            pendant que les AUTRES peuvent partir. AMBRE, jamais rouge : rien
            n'est cassé, un geste complète. Nommé (« Leboncoin attend :
            Produit ») + le chemin exact (l'encart rouge au-dessus porte le
            champ de saisie). Invisible quand tout est propre ou quand TOUT
            est bloqué (le CTA gris + motifs prennent alors le relais). */}
        {step === 3 && !ctaBlockingActive && plateformesBloqueesChamps.length > 0 && (
          <div style={{ marginBottom:8, padding:"9px 12px", borderRadius:10, background:"#FFF6E3", border:"1px solid #EED9A6", fontSize:12, lineHeight:1.5, color:"#8A6100", fontWeight:600 }}>
            {plateformesBloqueesChamps.map(p => {
              const champs = (genericRequiredStatus?.[p] ?? []).filter(aspectBloquant).map(a => a.label ?? a.key).join(", ");
              return (
                <div key={p}>
                  ✋ {lang === "en"
                    ? `${nomPlateforme(p)} is waiting for: ${champs}`
                    : `${nomPlateforme(p)} attend : ${champs}`}
                </div>
              );
            })}
            <div style={{ fontWeight:500, marginTop:3 }}>
              {lang === "en"
                ? "Fill it in the red “Some info is missing to publish” box above — the other platforms will publish normally without waiting."
                : "Complète dans l'encart rouge « Il manque des infos pour publier » ci-dessus — les autres plateformes partiront normalement sans attendre."}
            </div>
          </div>
        )}
        {/* Motif du bouton gris (2026-08-11) — JAMAIS de CTA désactivé muet.
            Placé AU-DESSUS du bouton : c'est ce qu'on lit avant de cliquer, et
            le bas de l'écran est déjà mangé par la safe-area. */}
        {motifsCtaGris.length > 0 && (
          <div style={{ marginBottom:8, padding:"9px 12px", borderRadius:10, background:"#FEF2F2", border:"1px solid #FECACA", fontSize:12, lineHeight:1.5, color:"#B91C1C", fontWeight:600 }}>
            {lang === "en" ? "Can't publish yet — still missing:" : "Publication impossible — il manque encore :"}
            <ul style={{ margin:"4px 0 0", paddingLeft:18, fontWeight:600 }}>
              {motifsCtaGris.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
        {/* « Ordinateur éteint » au moment de publier (2026-08-13) : le SEUL
            instant qui compte. Une ligne discrète, informative — le bouton
            reste ACTIF, libellé inchangé, le job part normalement. Jamais les
            mots « erreur/échec/problème » : rien n'est cassé. Ne s'affiche pas
            derrière l'écran d'accroche « jamais installée » (extensionBlocked),
            qui a son propre parcours. */}
        {/* « Session expirée » (02/09 soir) : l'extension TOURNE mais son
            bootstrap est refusé (extension_session_rejetee_at, stampé par le
            401 d'extension-session). Avant, ce cas s'affichait « ordinateur
            éteint » — faux, et sans geste réparateur. Le message dit le
            geste EXACT : page fillsell.app connectée + F5, le pont relaie un
            jeton frais et l'extension se reconnecte seule. */}
        {step === 3 && !extensionBlocked && extFraicheurPublier.etat === "session_expiree" && (
          <div style={{ marginBottom:8, display:"flex", gap:8, alignItems:"flex-start", padding:"8px 12px", borderRadius:10, background:"#FEF2F2", border:"1px solid #FECACA", fontSize:12, lineHeight:1.45, color:"#7F1D1D" }}>
            <span style={{ flexShrink:0 }}>🔑</span>
            <span>
              {lang === "en"
                ? "The extension lost its connection to your account. On your computer, open fillsell.app in Chrome, sign in, then reload the page (F5) — it reconnects by itself."
                : "L'extension a perdu sa connexion à ton compte. Sur ton ordinateur, ouvre fillsell.app dans Chrome, connecte-toi, puis recharge la page (F5) — elle se reconnecte toute seule."}
            </span>
          </div>
        )}
        {step === 3 && !extensionBlocked
          && (extFraicheurPublier.etat === "eteinte" || extFraicheurPublier.etat === "inactive") && (
          <div style={{ marginBottom:8, display:"flex", gap:8, alignItems:"center", padding:"8px 12px", borderRadius:10, background:"#FFFBEB", border:"1px solid #FDE68A", fontSize:12, lineHeight:1.45, color:"#78350F" }}>
            <span style={{ flexShrink:0 }}>💻</span>
            <span>
              {lang === "en"
                ? "Your computer is off — publishing will start next time Chrome opens."
                : "Ton ordinateur est éteint — la publication démarrera à la prochaine ouverture de Chrome."}
            </span>
          </div>
        )}
        <PrimaryButton
          disabled={ctaDisabled}
          onClick={handleNext}
          icon={step === 3 && !ctaDisabled && !publishing && !inventoryFull ? Check : undefined}
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
          itemCount={quotaModal.trigger === "stock" ? stockCount : null}
          stockLimit={stockLimitCfg}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          isBusiness={isBusiness}
          userId={userId}
          // Bascule quotas (02/09) : les CAS « unités insuffisantes » sont
          // morts — plus de coinPrice/coinBalance/onUseCoins. quotaInfo porte
          // le geste refusé (annonces/scans/retouches) pour l'encart dédié.
          quotaInfo={quotaModal.quotaInfo ?? null}
        />
      )}


      {/* Accroche extension (2026-08-04) : ouverte par le CTA Publier quand
          l'extension n'a jamais été vue (ou par le reason extension_required
          du RPC). Pas de « continuer » ici — l'utilisateur EST déjà au bout du
          parcours ; le bouton « vérifier » lève la garde dès que le premier
          poll de l'extension a stampé le profil. */}
      {showExtGate && (
        <ExtensionPitchScreen
          lang={lang}
          onClose={() => setShowExtGate(false)}
          supabase={supabase}
          userId={userId}
          onExtensionSeen={() => { setExtSeenOverride(true); setShowExtGate(false); }}
        />
      )}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  ), document.body);
}
