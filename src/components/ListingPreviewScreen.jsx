import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronLeft, Mic, Plus, X, Sparkles, Pencil, Clock, ImageOff, GripVertical, MapPin, Lock, LogOut } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera } from "@capacitor/camera";
import ConversionModal from "./ConversionModal";
import ExtensionPitchScreen from "./ExtensionPitchScreen";
// (import PepiteAmount retiré au nettoyage unités du 02/09 soir — les
// montants dormants s'affichent en chiffres nus, plus aucune iconographie.)
import PlatformLogo from "./platform-logos/PlatformLogo";
import OplaAutorisationModal from "./OplaAutorisationModal";
import AnalyseMarche from "./AnalyseMarche";
// Photos : lecture tolérante (chaîne ou objet), écriture TOUJOURS en objets
// `{ type, url }` — la forme de generate-listing, la seule que les handlers
// de l'extension savent lire. Règle et incident dans utils/photos.js.
import { urlPhoto, urlsPhotos, entreesPhotos, estPhotoRetouchee, MIN_PHOTOS, MAX_PHOTOS } from "../utils/photos";
// La galerie (ajouter / retirer / réordonner) et ses primitives sont partagées
// avec le formulaire d'ajout manuel depuis le 19/09 — extraites d'ici, rendu
// inchangé.
import GaleriePhotos, { DragHandle, CoverBadge } from "./GaleriePhotos";
import { usePhotoDrag, moveItem, IS_ANDROID, pickPhotosAndroid } from "../utils/photosGalerie";
import { texteComparable } from "../utils/texteComparable";
import { sortirDuBrouillon } from "../utils/brouillon";
import { sessionsDepuisVerite } from "../utils/veritePlateformes";
import { useVeritePlateformes } from "../reglages/useVeritePlateformes";
import { useOplaAcces, carteAccesOpla } from "../utils/oplaAcces";
import { useTranslation } from "../i18n/useTranslation";
import { Loader } from "./ui";
import BoutonMeConnecter from "./BoutonMeConnecter";
import { MOTIFS } from "../utils/connexionPlateformes";
import { detectObjectIcon, detectObjectIconKeyword, detectObjectKeywordDetail, ALL_OBJECT_ICONS, PLATFORM_LOGIN_URLS, fraicheurExtension, estSupportNonLivre, uuidV4 } from "../utils/shared";
import { getVintedCategoryPath, vintedGenreRequired } from "../utils/vintedCategories";
import { getLbcCategoryPath, getLbcBabyEquipment, getLbcFreePhotoQuota } from "../utils/lbcCategories";
import { lbcProduitsDependants, lbcListePlate, lbcFeuilleDependante, lbcPaireDepuisTextes } from "../utils/lbcMaisonJardin";
import { gardeFouCategorie } from "../utils/categorieGardeFou";
// Détecteur de langue, partagé mot pour mot avec lens-analysis (même fichier,
// chargé par Vite ici et par Deno là-bas) : la garde qui refuse de nourrir la
// passe 2 avec une description anglaise DOIT juger exactement comme le serveur.
import { estAnglaisAvere } from "../../supabase/functions/_shared/langue.js";
import { valeurDecritLObjet, feuilleDepuisOrigine, genreDepuisOrigine } from "../utils/categorieParMot";
import { VINTED_CHAMP_PLATEFORME, VINTED_CHAMP_CLASSEMENT, familleJeuVideo } from "../utils/jeuxVideo";
import { mentionsAutrePlateforme, messageMentions } from "../utils/descriptionMentions";
import { normalizeVintedTitle } from "../utils/vintedTitle";
import { getEbayCategoryId } from "../utils/ebayCategories";
import { getBeebsCategoryPath, beebsGenreRequired } from "../utils/beebsCategories";
import { getPlatformSupport } from "../utils/platformCompat";
// Règles du catalogue Beebs (2026-09-11) : le MÊME fichier que le filet serveur
// (get-pending-jobs) — verdict sur source certaine, motif écrit sous la case.
import { verdictBeebsInterdit, messageBeebsInterdit } from "../../supabase/functions/_shared/beebs-interdits.js";
import { computeRemovalInfo } from "../utils/publicationState";
import { chercherJumeauxEnLigne } from "../utils/jumeauxEnLigne";
// Les attentes par plateforme et le geste qui débloque (2026-09-23).
import { attentesParPlateforme, phraseEtat, messageRefusPublication } from "../utils/etatsPublication";
import { FREE_STOCK_LIMIT_FALLBACK, quotaStockAtteint } from "../utils/stockLimit";
// versImageDecodable/chargerImage sont passés dans utils/photosUpload avec la
// compression : seul le message d'échec reste utilisé ici.
import { messageDecodage } from "../utils/imageDecode";
import { televerserPhotos } from "../utils/photosUpload";
import EbayCompteSection from "./EbayCompteSection";
import { ebayCompteUtilisable, motifEbayInutilisable, repartirParVoie } from "../utils/ebayCompte";
import { resumeEbay } from "../utils/ebayParcours";
import {
  CHILD_MONTH_SIZES, CHILD_YEAR_SIZES, CHILD_SHOE_EU_MIN, CHILD_SHOE_EU_MAX,
  childAxesForGenre,
} from "../utils/childSizes";
import { PLATEFORMES_STOCK_OUVERTES, PLATEFORMES_STOCK_A_VENIR } from "../utils/stockFiltres";
// La résolution de catégorie et de champs plateforme — SORTIE de handlePublish
// le 20/09 pour tourner à la fin de la génération. Même code, même ordre,
// mêmes messages : un déménagement, pas une réécriture (en-tête du module).
import { resoudrePublication, signatureResolution, resolutionARetenter, cheminFourreToutLbc } from "../utils/resolutionPublication";
// Le rayon : le lire pour l'afficher, et REPOSER le choix de la personne
// par-dessus tout recalcul (garde-fou nº1 du lot B).
import { champsAvecRayonsChoisis, rayonDuChamp, libelleRayonCourt, objetDuRayonChoisi, plateformesAvecRayonChoisi } from "../utils/rayonPublication";
import CarteRayon from "./CarteRayon";
import CarteLivraisonLeboncoin from "./CarteLivraisonLeboncoin";
import { LBC_FORMATS } from "../utils/leboncoinColis";
import CarteLivraisonEbay from "./CarteLivraisonEbay";
import { CANAL_ASPECTS } from "../utils/champsDuRayon";
// ── Valeur générale + exception par plateforme (2026-09-21) ────────────────
// La LOGIQUE est dans utils/valeursGenerales.js, l'AFFICHAGE dans
// components/BlocValeursGenerales.jsx — cet écran ne fait que les relier.
import BlocValeursGenerales from "./BlocValeursGenerales";
import { ETATS_GENERAUX, etatPourPlateforme } from "../../supabase/functions/_shared/etat-plateformes.js";
import {
  CHAMPS_GENERAUX, dissociationsVides, serialiserDissociations, lireDissociations,
  appliquerGenerale, dissocier, rattacher, suitLaGenerale, valeurCommune,
  valeurPourPlateforme, ecartsDeConformite,
} from "../utils/valeursGenerales";
// ── LE MOTEUR ET LA NOUVELLE PEAU (refonte du 24/09/2026) ──────────────────
// Les RÈGLES (qui part, qui est exclu, ce qui bloque, la forme d'un job, la
// garde eBay) vivent dans src/publication/moteur/ — fonctions pures, lues par
// cet écran ET par la publication en masse. Ce fichier les APPELLE : chaque
// appel remplace mot pour mot le code qui vivait ici (prouvé par
// scripts/publication-moteur-selftest.mjs). Les tables de champs partagés ont
// déménagé de la même façon (champsPartages.js).
import StepperNouveau from "../publication/StepperNouveau";
import {
  aspectBloquant, plateformesPubliables as calculerPlateformesPubliables,
  champsBloquantsParPlateforme, plateformesBloqueesChamps as calculerPlateformesBloqueesChamps,
  descriptionVintedVide, calculerExclusions, motifAucunePlateforme, cleCategorieRequis,
  construireJobs, plateformesSansChemin, gardeAspectsEbay, questionsParPlateforme as calculerQuestionsParPlateforme,
} from "../publication/moteur/regles";
import {
  NO_BRAND_VALUE, SHARED_FIELD_KEYS, SHARED_PROPAGATION, EBAY_ASPECT_LABELS,
  genericFieldToSharedKey, canalGeneriquePose, GENERIC_ASPECTS_PF_KEY,
  GENERIC_PLATFORM_LABELS, PLATEFORMES_ADRESSE_LBC,
} from "../publication/moteur/champsPartages";
// (chantier du 24/09) normAspectVal et nearestAllowedValue ont déménagé dans le
// moteur, à l'identique : la carte (champsDuRayon) et la publication en masse
// jugent une valeur contre une liste avec le même code que cet écran.
import {
  normAspectVal, nearestAllowedValue, jugerValeurContreListe, horsListeBloque, vintedExigeUneMarque,
  vintedExigeUneCouleur, valeurUneLettre, rayonNeufSeulement, messageRayonNeuf,
  deduireOptionDuTexte, estFourreTout, listeCandidatsDabord, textesDeLAnnonce,
} from "../publication/moteur/listes";
import { VINTED_COLORS } from "../utils/vintedColors";
import { optionDepuisTextes } from "../../supabase/functions/_shared/option-du-texte.js";

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

export const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay", opla:"Opla" };

// ── Une photo est-elle une retouche PAYÉE, à nous ? ──────────────────────────
// Source UNIQUE (StockTab l'importe, le RPC spend_coins_and_publish porte la
// même règle en SQL — migration 20260805030000). Trois formats coexistent :
//  · pipeline actuel : objets {type,url} — ⚠️ la photo 0 retouchée garde
//    type:'original' avec une URL sous /enhanced/ (relevé generate-listing) :
//    l'URL fait foi, le type n'est qu'un indice ;
//  · schéma historique : objets {original, bg_removed, enhanced} ;
//  · strings nues : /enhanced/ = retouche réutilisée puis aplatie par la
//    persistance ; /raw/ ou CDN Vinted = rien de payé.
// Délègue au normaliseur unique (utils/photos.js) — le nom est conservé pour
// StockTab, qui l'importe d'ici.
export function isRetouchedPhotoEntry(p) {
  return estPhotoRetouchee(p);
}
// opla #FE9D17 : relevé sur l'icône d'app officielle (512×512, cf.
// platform-logos/OplaIcon) — la teinte qui occupe 20,7 % des pixels, le reste
// étant blanc. ⚠️ Trois oranges voisins dans cette table désormais (leboncoin
// #EA5B0C, beebs #FF6B35, opla #FE9D17) : signalé à Nico, rien décidé.
const PLATFORM_COLORS   = { vinted:"#09B584", leboncoin:"#EA5B0C", beebs:"#FF6B35", ebay:"#0064D2", opla:"#FE9D17" };
// ⛔ PLATFORMS_DEFAULT reste à QUATRE, et ce n'est pas un oubli. Cette liste
// n'est pas « les plateformes qu'on affiche » : elle initialise `selected`
// (l. ~3975), elle filtre les annonces disponibles du scan, et tout ce qui y
// entre part dans les jobs de publication. Y mettre Opla la cocherait par
// défaut et enverrait un job opla — exactement ce que ce lot interdit.
// L'affichage passe par PLATFORMS_A_VENIR, ci-dessous, et par lui seul.
const PLATFORMS_DEFAULT = PLATEFORMES_STOCK_OUVERTES; // même table que le stock (utils/stockFiltres)
// ── Plateformes VISIBLES mais PAS FORCÉMENT OUVERTES (lot 7, puis 17/09) ────
// Affichées aux comptes qui les voient (profiles.plateformes_visibles, ou
// l'interrupteur serveur coin_config.opla_ouvert — cf. App.jsx). La case
// n'est ACTIVE que si App.jsx la déclare dans `plateformesOuvertes`
// (interrupteur à 1 ET extension du compte ≥ coin_config.opla_extension_min,
// fail-closed) ; sinon elle reste `disabled`, avec son motif. Opla reste HORS
// de PLATFORMS_DEFAULT : sélectionnable, jamais présélectionnée — cette
// liste-là alimente les jobs.
const PLATFORMS_A_VENIR = PLATEFORMES_STOCK_A_VENIR; // idem
// Borne de build (coin_config, entier major×10000 + minor×100 + patch) → « 0.6.42 ».
function libelleVersionExtension(code) {
  const n = Number(code);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${Math.floor(n / 10000)}.${Math.floor((n % 10000) / 100)}.${n % 100}`;
}
// ── OPLA : états, table 1 pour 1 (docs/OPLA_MAPPING.md § 5) ─────────────────
// Libellé FR de la copie (le vocabulaire Vinted, le nôtre) → code que l'API
// Opla attend dans `condition`. « Neuf » nu (valeur ambiguë d'anciens jobs) →
// `new` (Neuf sans étiquette) : on n'affirme jamais une étiquette qu'on n'a
// pas vue. Un libellé hors table reste tel quel : le pré-vol du connecteur
// (opla-prevol.js) refuse alors AVANT tout envoi et nomme la cause.
const OPLA_ETAT_PAR_LIBELLE = {
  "neuf avec etiquette": "new-with-tags",
  "neuf sans etiquette": "new",
  "neuf": "new",
  "tres bon etat": "like-new",
  "bon etat": "good",
  "satisfaisant": "fair",
  "etat satisfaisant": "fair",
  "correct": "fair",
  "etat correct": "fair",
};
// La copie Opla dérive de la copie Vinted (même marché, même ton, mêmes
// libellés d'état) : generate-listing ne rédige que quatre annonces, et une
// plateforme cochée SANS copie est écartée en silence (plateformesSansAnnonce).
// Les champs propres à Opla se calculent à l'insert du job (bloc « opla » de
// handlePublish), jamais ici.
// ⛔ ELLE NAÎT SUR LES VALEURS GÉNÉRALES, PAS SUR L'EXCEPTION DE VINTED
//    (2026-09-21). La copie Vinted peut porter un prix personnalisé ou un
//    texte dissocié : les recopier ferait naître Opla avec l'exception d'une
//    AUTRE plateforme, que personne n'a demandée pour elle. `generales` et
//    `prixGeneral` priment donc, et la copie Vinted ne sert que de repli —
//    pour le texte quand aucune valeur générale n'a encore été semée.
function deriverCopieOpla(vinted, { prixGeneral = null, generales = null } = {}) {
  const pf = vinted?.platform_fields ?? {};
  const garder = ["etat", "taille", "genre", "marque", "modele", "matiere", "couleur", "categorie"];
  const copie = {};
  for (const k of garder) if (pf[k] != null && String(pf[k]).trim() !== "") copie[k] = pf[k];
  const general = (champ, repli) => {
    const v = String(generales?.[champ] ?? "").trim();
    return v ? valeurPourPlateforme(champ, v, "opla").valeur : repli;
  };
  const etatGeneral = general("etat", null);
  if (etatGeneral) copie.etat = etatGeneral;
  const prix = prixGeneral === "" || prixGeneral == null ? null : Number(prixGeneral);
  return {
    title: general("titre", String(vinted?.title ?? "")),
    description: general("description", String(vinted?.description ?? "")),
    platform_fields: copie,
    price: prix ?? vinted?.price ?? null,
  };
}

// MIN_PHOTOS (3) et MAX_PHOTOS (20) vivent dans utils/photos.js depuis le
// 19/09 : le formulaire d'ajout manuel en a besoin aussi, et une borne écrite
// à deux endroits finit toujours par diverger. Elles sont importées en haut.
const MAX_RETOUCHED = 5;   // doit rester aligné sur generate-listing.MAX_RETOUCHED

// ── Plateformes qui exigent l'adresse de remise des Réglages (2026-08-10) ────
// Leboncoin la demande à chaque dépôt (jamais pré-remplie depuis le compte),
// et Beebs réutilise LA MÊME valeur — il n'a pas de réglage dédié dans l'app
// (cf. chrome-extension/content-scripts/beebs.js, en-tête : « on réutilise
// platform_settings.leboncoin.adresse, même adresse d'expédition »).
// Sans elle, les deux handlers rendent { ok:false } et le job meurt APRÈS le
// débit, dans le content script — 3 clients touchés (01/08, 10/08 ×2).
// PLATEFORMES_ADRESSE_LBC : src/publication/moteur/champsPartages.js.

// Motif affiché quand une plateforme est grisée, par statut de compat (cf.
// src/utils/platformCompat.js). "prohibited" (2026-08-11) a SON message : dire
// « catégorie non disponible » d'un parfum sur Leboncoin serait faux et
// pousserait l'utilisateur à chercher une autre catégorie — il n'y en a pas,
// c'est le PRODUIT qui est interdit. Une case grise muette, elle, se lit comme
// un bug.
// "no_default" (2026-09-19) partage le texte d'"unmapped", et c'est exact :
// dans les deux cas c'est NOTRE mapping qui manque, pas la catégorie de la
// plateforme. L'entrée est écrite en toutes lettres plutôt que laissée au
// repli de supportMessage — un motif affiché ne doit jamais dépendre d'un ??.
const SUPPORT_MESSAGE_KEY = {
  prohibited: "platformProhibited",
  unavailable: "platformUnavailable",
  no_default: "platformUnmapped",
  unmapped: "platformUnmapped",
};
const supportMessage = (t, support, platformLabel) =>
  t(SUPPORT_MESSAGE_KEY[support] ?? "platformUnmapped").replace("{platform}", platformLabel);

// ── LA PORTE (2026-09-19) — QUI A LE DROIT D'ÊTRE COCHÉ ────────────────────
// Jusqu'ici la case était grisée dès que le statut de compat n'était pas
// "supported", c'est-à-dire dès que L'ICÔNE ne trouvait pas de feuille. Or
// l'icône n'est plus le seul chemin vers une catégorie depuis le 07/09 : au
// clic Publier, le MOT de l'objet est résolu contre les feuilles relevées
// (categorieParMot, « exact ou rien »), puis les candidates ratissées sont
// soumises à resolve-categorie, qui tranche DANS la liste. Ces deux chemins
// n'ont pas besoin de l'icône — et ils sont posés AVANT elle aux quatre
// points de pose (`parMot?.chemin ?? getXCategoryPath(icon)`).
// Griser sur l'icône seule, c'était donc fermer la porte AVANT d'avoir essayé
// les deux autres chemins. Mesuré sur le dossier Louis THONET : l'article
// n'avait reçu AUCUN appel IA — zéro ligne dans usage_logs — parce que Vinted
// et Beebs étaient sorties de la sélection trois écrans plus tôt.
//
// ⛔ CE QUI RESTE FERMÉ, ET C'EST TOUT :
//   "unavailable" — la branche N'EXISTE PAS sur la plateforme (absence
//                   confirmée par crawl). Aucun chemin ne peut y mener : ni
//                   le mot, ni l'IA, ni l'origine. 🎵 sur Vinted, 🎵 🏆 🌿
//                   sur Beebs, Auto-Moto partout… On n'ouvre pas une case
//                   vers une branche qui n'existe pas.
//   "prohibited"  — la plateforme REFUSE ce produit. Ce n'est pas un trou de
//                   catalogue, c'est un refus de vente.
// Tout le reste ("no_default", "unmapped") laisse la case cliquable : la
// branche existe, c'est NOTRE mapping par icône qui manque, et les deux
// autres chemins ont le droit d'essayer.
// ⛔ L'ICÔNE ELLE-MÊME N'EST PAS TOUCHÉE. Elle continue de porter le genre
//    obligatoire, les gardes taille/couleur/marque/matière, les interdits
//    Beebs et le quota de photos Leboncoin. On change QUI décide de la case,
//    pas ce que l'icône est.
// ⛔ CONTREPARTIE OBLIGATOIRE, plus bas dans handlePublish : une case ouverte
//    qui n'aboutit à AUCUN chemin ne doit pas partir quand même. Sans chemin,
//    les content scripts rendent { ok:false } avec un message de développeur
//    (« platform_fields.categoryPath absent… compléter src/utils/… ») APRÈS
//    le débit. La plateforme est donc écartée AVANT le débit, comme l'est
//    déjà une plateforme sans annonce générée.
const CATEGORIE_FERMEE = new Set(["unavailable", "prohibited"]);
const categorieFermee = (support) => CATEGORIE_FERMEE.has(support ?? "supported");
// Plateforme EN PAUSE (platform_health.paused, 2026-09-09) : le texte lu par
// l'utilisateur est message_fr / message_en, écrit en base (sans
// redéploiement) ; à défaut, repli générique i18n. Jamais `reason` (interne).
const messagePause = (tpl, pausedReasons, p, platformLabel) =>
  pausedReasons?.[p] || tpl("platformPaused", { platform: platformLabel });

// ── COMPTE eBAY PAS ENCORE UTILISABLE ──────────────────────────────────────
// (22/09/2026, dossier Romain) Avant, la phrase disait « termine-le » sans
// jamais dire QUOI. Romain est resté plusieurs jours dessus : « pas évident de
// savoir ce qu'il y avait à faire ». Elle NOMME maintenant l'étape qui reste,
// et c'est le même module que le parcours guidé des Réglages qui la donne
// (utils/ebayParcours) — l'écran d'arrivée porte exactement le même mot.
//
// ⛔ AUCUN APPEL : `etat` vient de l'action 'statut' déjà lue une fois par
//    l'app (un SELECT, zéro appel eBay). Le quota du parc n'est pas touché.
// Repli : si l'état n'a pas été lu, on garde la phrase générique d'avant —
// on ne nomme jamais une étape qu'on n'a pas relevée.
const messageCompteEbay = (motif, lang, etat = null) => {
  if (etat) {
    const r = resumeEbay(etat, lang === "en" ? "en" : "fr");
    if (r.phrase && !r.pret) return r.phrase;
  }
  if (lang === "en") {
    if (motif === "non_connecte") return "eBay: your eBay account isn't linked yet — link it to publish there.";
    if (motif === "a_reconnecter") return "eBay: your eBay account needs to be reconnected before publishing.";
    return "eBay: your seller account isn't fully set up yet — finish it to publish there.";
  }
  if (motif === "non_connecte") return "eBay : ton compte eBay n'est pas encore relié — relie-le pour publier dessus.";
  if (motif === "a_reconnecter") return "eBay : ton compte eBay est à reconnecter avant de pouvoir publier.";
  return "eBay : ton compte vendeur n'est pas fini de paramétrer — termine-le pour publier dessus.";
};

// Le multi-select Android (Camera.pickImages, 2026-07-27) est passé dans
// GaleriePhotos avec la grille : IS_ANDROID et pickPhotosAndroid sont
// importés en haut de ce fichier, comportement inchangé.

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
// NO_BRAND_VALUE : importé de src/publication/moteur/champsPartages.js (refonte 24/09).

// SHARED_FIELD_KEYS, SHARED_PROPAGATION, SHARED_GUARD (mémoire des périmètres
// historiques) : src/publication/moteur/champsPartages.js — mêmes valeurs.
// Icônes beauté PRODUIT (mêmes 4 que generate-listing) : la Couleur n'y est
// exigée par AUCUN référentiel réel — eBay (table ebay_item_aspects) : Soins
// 21205 et Vernis 11873 → Marque+Type, Parfums 11848/29585/112661/159719 →
// Marque+Type+Volume+Nom, Maquillage 31804 → Teinte (label DIFFÉRENT, que le
// champ Couleur ne satisfait pas de toute façon) ; relevé Vinted réel
// (platform_category_aspects) : Beauté > Parfums → État seul. Les appareils
// (💇 sèche-cheveux, 🪒 rasoirs) gardent la garde standard.
// BEAUTY_PRODUCT_ICONS : src/publication/moteur/champsPartages.js.

// Correspondances label d'aspect eBay → champ partagé de l'app — UNE seule
// source pour l'encart bleu (ebayRequiredStatus) ET la garde data-driven du
// bloc rouge : aucune divergence possible entre les deux.
// EBAY_ASPECT_LABELS : src/publication/moteur/champsPartages.js — mêmes listes.
// field_key du catalogue platform_category_aspects → champ partagé de l'app.
// MÊMES correspondances que genericKnownSource (qui mappe champ→valeur, plus
// bas) — les deux doivent évoluer ensemble : vinted = codes d'attribut
// serveur, LBC = attribut for= des labels du wizard, Beebs = libellés exacts.
// genericFieldToSharedKey : src/publication/moteur/champsPartages.js — même corps.

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
// LBC_GENERIQUE_SAUTE, BEEBS_GENERIQUE_SAUTE, canalGeneriquePose :
// src/publication/moteur/champsPartages.js — mêmes listes, même corps.

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
// aspectBloquant : src/publication/moteur/regles.js — même expression.

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

// L'icône SEULE (tous les appelants historiques) — la source de l'icône, elle,
// se lit par resolveArticleIconDetail. Deux fonctions, un seul corps : elles ne
// peuvent pas diverger (leçon du 07/09, lecture/écriture désaccordées).
function resolveArticleIcon(args) {
  return resolveArticleIconDetail(args).icon;
}

// D'OÙ VIENT L'ICÔNE (2026-09-07) — le job doit pouvoir le dire après coup.
// Sans cette trace, on ne pouvait pas répondre à « quelle icône Haiku a-t-il
// rendue ? » sur le job c324b5ee : la catégorie était fausse et sa cause
// invérifiable. Valeurs : famille_livres | mot_cle | ia | detection |
// pointure | defaut.
function resolveArticleIconDetail({ initialListing, edited, pf, aiIcon = null, aiObjet = null }) {
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
  // ── CEINTURE (2026-09-06, lot de 24 DVD d'Ornella) ────────────────────────
  // La souveraineté ci-dessus s'appliquait à la famille ENTIÈRE, sans jamais
  // regarder le titre — or `livres_medias` veut dire « livres ET médias » : un
  // lot de DVD y tombe aussi, et repartait en 📚, donc en rayon Livres sur les
  // 4 plateformes, donc dans le mur ISBN. La règle reste souveraine pour les
  // LIVRES, mais elle rend la main dès que la source FR nomme un SUPPORT
  // non-livre (DVD, Blu-ray, vinyle, console…) — detectObjectIcon sait déjà
  // rendre 📀 / 💿 / 🎮 sur ces mots, il suffisait de le laisser parler.
  // ⛔ Le prédicat ne connaît QUE des supports, jamais des sujets, et se
  // désarme si le texte dit « livre » : le cas Delavier reste couvert.
  if ((familleFiche === "livres_medias" || /^livres?$/i.test(categorieFiche))
      && !estSupportNonLivre(frTitle, frDesc)) return { icon: "📚", source: "famille_livres", iconeSansIa: "📚" };
  // ── LA MACHINE EST UN SIGNAL CERTAIN, LE THÈME NE L'EST PAS (2026-09-20) ──
  // MÊME PIÈGE QUE LES LIVRES, sur l'autre famille qui parle de son sujet :
  // un jeu vidéo porte le nom de ce qu'il RACONTE. Deux cas réels du parc,
  // rejoués tels quels :
  //   · « Jeu Nintendo DS World Snooker Championship » → 🎱 (billard) ;
  //   · « Télécommande ps2 sony playstation 2 »        → 🚁 (télécommandé).
  // Dans les deux, le titre nomme une MACHINE — « nintendo ds », « ps2 » — et
  // c'est elle qui dit ce que l'objet EST. « snooker » dit de quoi il parle.
  // familleJeuVideo porte déjà tout le discernement de cette famille (jeu /
  // console / accessoire, et ses exclusions relevées une par une : cadres,
  // t-shirts, cartes Pokémon, peluches, housses…). Il ne lui manquait qu'une
  // chose : être appelé. Sa garde « seulement si l'icône vaut 🎮 » l'empêchait
  // justement de parler dans les cas où l'icône s'était trompée.
  // ⛔ ON EXIGE LA MACHINE. `familleJeuVideo` sait conclure sans elle (un jeu
  //    nommé « jeux vidéo » suffit) ; ici on ne se contente pas de ça — sans
  //    machine nommée, on laisse la détection habituelle décider, comme avant.
  // ⛔ Après les livres : un guide de jeu vidéo reste un livre.
  //
  // 🚨 ET ON NE PREND LA MAIN QUE DANS DEUX CAS, parce que la MESURE a montré
  //    que la règle large fabriquait ses propres dégâts. Rejouée sur les
  //    39 692 titres distincts publiés en 60 jours : 428 nomment une machine,
  //    80 auraient changé d'icône — dont TROIS à tort, tous des vêtements
  //    dont le titre cite une marque de console :
  //      « Chemise y2k game boy taille s streetwear »        👔 → 🎮
  //      « Pantalon vert primark Xbox 9-10 ans »             👖 → 🎮
  //      « Banane sac Sega Zara »                            👜 → 🎮
  //    Une chemise reste une chemise. Les deux cas où l'on parle :
  //      (a) AUCUN objet reconnu (📦) — on n'écrase rien, on comble ;
  //      (b) la TÊTE du titre nomme le jeu ou l'accessoire (« Jeu … »,
  //          « Télécommande … ») — le vendeur a dit lui-même ce que c'est.
  //    ⛔ Sauf les housses et étuis : la décision du 20/09 les laisse à leur
  //       icône (« Pochette pour Switch » reste 👜), on ne la défait pas ici.
  {
    const jv = familleJeuVideo(frTitle, frDesc);
    const parTete = typeof jv?.regle === "string" && jv.regle.startsWith("tete_") && jv.sousType !== "etui";
    if (jv?.machine && (parTete || detectObjectIcon(frTitle, frDesc) === "📦")) {
      return { icon: "🎮", source: "machine_jeu_video", iconeSansIa: "🎮" };
    }
  }
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
  // ── LE MOT DE L'IA, CALCULÉ ICI POUR SERVIR DEUX FOIS (2026-09-19) ────────
  // Il garde EXACTEMENT sa place d'autorité (plus bas, après le mot-clé) ;
  // on le calcule seulement plus tôt, parce que la passe 2 en a besoin pour
  // savoir si elle a le droit de parler. Aucun changement d'ordre.
  const objetIa = String(aiObjet ?? "").trim();
  const iconeDuMotIa = objetIa ? detectObjectIconKeyword(objetIa, "") : null;

  // ── LA PASSE 2 PROPOSE, ELLE NE DÉCIDE PLUS SEULE (2026-09-19) ────────────
  // Rappel de la mécanique : detectObjectKeywordDetail fait DEUX passes — le
  // TITRE seul (passe 1, la source du vendeur), puis titre + description +
  // marque (passe 2, le filet). Jusqu'ici les deux rendaient « mot_cle », donc
  // le job ne savait pas laquelle avait parlé et le garde-fou ne pouvait pas
  // les distinguer.
  //
  // MESURÉ sur les 754 fiches créées par l'app en 30 jours : 635 ont leur
  // mot-objet AU TITRE (la passe 2 ne parle jamais), 119 n'en ont pas, et sur
  // ces 119 la passe 2 pose l'icône 31 fois. Sur ces 31 : 15 fois mieux ou
  // sauvées, 10 fois cassées, 4 sans effet, 2 imprécises. La retirer coûterait
  // 6 bons rangements pour en réparer 8 — échange à perte : ON LA GARDE
  // (décision Nico, 19/09). On borne seulement les deux cas où elle se trompe
  // de manière DÉMONTRABLE.
  //
  // Les 10 échecs ont tous la même forme : le mot ne désigne pas l'objet mais
  // son EMBALLAGE (« conservée en pochette de protection »), ses ACCESSOIRES
  // (« comprend : … chargeur USB »), son CONTENU possible (« utilisable pour
  // bijoux »), sa FINITION (« peinture brillante », « deux vis de fixation »),
  // son SUJET (« gravure, céramique », la préface de « Jean Alesi ») ou une
  // mention légale (« copyright Nintendo »).
  //
  // ── VOIE 4 : une description qui n'est PAS en français ne nourrit rien ────
  // Cas fondateur, roehrricky24 le 19/09 : « blue and yellow PULL-tab bands »
  // dans une description ANGLAISE a donné 🧶 « pull », donc Leboncoin
  // « Mode > Vêtements », donc « Univers » et « Type d'article neuf » demandés
  // pour un lot de cigares. « pull » n'est un vêtement qu'en français : la
  // collision n'existe QUE parce qu'un texte anglais est relu par des règles
  // françaises. Sur une description française, le cas ne se pose pas.
  // Le verdict est rendu par _shared/langue.js, qui ne tranche que sur une
  // certitude (≥ 3 mots-outils anglais ET 0 français) — un doute laisse tout
  // en l'état.
  //
  // ── VOIE 2 : le mot de l'IA arbitre, quand il peut ────────────────────────
  // Lens nomme l'objet (« Robot cuiseur multifonction », « Carte Pokémon
  // Lanssorien », « chevalet de table bois »). Si ce nom, passé à NOS règles,
  // rend une icône DIFFÉRENTE de celle de la passe 2, les deux se contredisent
  // et c'est la description qui a tort : elle décrit le contexte, pas l'objet.
  // Corrige 5 des 10 échecs mesurés, sans perdre un seul sauvetage.
  //
  // ⛔ ET LA RÈGLE QUI PROTÈGE LES SAUVETAGES, qui est le cœur de la voie : si
  // nos règles ne connaissent PAS le mot de l'IA (« chapka », « fleece »,
  // « Cigars »), la contradiction n'est pas PROUVABLE → ON NE BLOQUE PAS, la
  // passe 2 garde la main. C'est ce qui conserve la chapka (#15), les Air
  // Jordan (#18), le fleece (#23), les derbies (#24), la veste Gore-Tex (#25)
  // et le manga (#17). Durcir ça en « l'IA a nommé, nous ne connaissons pas,
  // donc on se tait » était la voie 3 : elle répare un cas de plus et fait
  // retomber la chapka en « Divers > Autres ». ÉCARTÉE par Nico le 19/09.
  const motCle = detectObjectKeywordDetail(frTitle, `${frDesc} ${marque}`);
  const passe2Ecartee = motCle?.passe === 2 && (
    estAnglaisAvere(frDesc) ||
    (iconeDuMotIa != null && iconeDuMotIa !== motCle.icon)
  );
  if (motCle && !passe2Ecartee) {
    // passe 1 = le titre, la source du vendeur : source « mot_cle », comme
    // avant, MOT POUR MOT — le garde-fou n'écarte jamais un mot du titre et ne
    // doit pas commencer aujourd'hui.
    const source = motCle.passe === 1 ? "mot_cle" : "mot_cle_description";
    return { icon: motCle.icon, source, iconeSansIa: motCle.icon };
  }

  // ── LE MOT DE L'IA, PASSÉ À NOS RÈGLES AUDITÉES (2026-09-07 soir) ─────────
  // Depuis ce soir, generate-listing rend AUSSI le nom de l'objet en clair
  // (« chapka », « taie d'oreiller », « lave-vaisselle ») en plus de l'emoji.
  // Un NOM traverse la couche auditée ; un emoji ne le peut pas — il n'a que
  // 164 valeurs pour ~3 900 feuilles eBay, et « chapka » n'en a aucune.
  // On soumet donc le mot aux MÊMES règles que le titre. Quand elles le
  // reconnaissent, la source n'est plus « l'IA a deviné un emoji » mais « l'IA
  // a nommé un objet que NOS règles savent traduire » : c'est une source
  // CERTAINE, elle désarme le drapeau categorie_incertaine et le garde-fou la
  // respecte comme un mot-objet du titre.
  // ⛔ Après le titre, jamais avant : le titre est la source du vendeur.
  // ⛔ Si nos règles ne connaissent pas le mot, il ne se passe RIEN ici — on
  //    ne devine pas, on retombe sur l'emoji comme avant.
  if (iconeDuMotIa) return { icon: iconeDuMotIa, source: "mot_objet_ia", iconeSansIa: iconeDuMotIa };

  // Aucun mot-objet reconnu → on fait confiance à l'IA (si valide), exactement
  // là où detectObjectIcon retomberait sur un simple défaut de catégorie.
  // ⚠️ SAUF 📦 (2026-08-15, « Cendrier vintage Noilly Prat », type Maison) :
  // 📦 est une icône VALIDE, donc une IA qui répond « objet générique »
  // court-circuitait le défaut de TYPE (🏠 pour Maison…), strictement plus
  // informatif — et l'article partait sans catégorie LBC. Un 📦 de l'IA ne
  // porte aucune information : on laisse detectObjectIcon jouer le défaut de
  // type, et 📦 ne revient qu'en tout dernier ressort (type Autre).
  // Ce que la détection rendrait SANS l'IA — le défaut de TYPE de la fiche.
  // Calculé AVANT de rendre l'icône de l'IA : c'est la seule valeur de repli
  // que le garde-fou accepte quand il refuse une icône devinée (autorité 3),
  // et elle vient de nos règles, jamais d'une seconde supposition.
  // ⚠️ SI LA PASSE 2 VIENT D'ÊTRE ÉCARTÉE, ELLE NE REVIENT PAS PAR LA BANDE.
  // detectObjectIcon refait les DEUX passes : lui repasser la description
  // rendrait exactement l'icône qu'on vient de refuser, et le garde-fou
  // l'accepterait comme « repli sans l'IA » (autorité 3). Dans ce cas précis,
  // ce que la fiche dit d'elle-même SANS la passe 2, c'est le défaut de type.
  const sansIa = passe2Ecartee
    ? detectObjectIcon(frTitle, "", categorie)
    : detectObjectIcon(frTitle, `${frDesc} ${marque}`, categorie);
  if (aiIcon && aiIcon !== "📦" && VALID_OBJECT_ICONS.has(aiIcon))
    return { icon: aiIcon, source: "ia", iconeSansIa: sansIa };

  const icon = sansIa;
  if (icon !== "📦") return { icon, source: "detection", iconeSansIa: sansIa }; // 📦 = CAT_DEFAULT_ICONS['Autre'] (shared.js)

  // Dernier recours UNIQUEMENT (l'icône est déjà le défaut « Autre », on ne peut
  // rien dégrader) : une POINTURE trahit une chaussure. Volontairement borné aux
  // libellés de pointure (EU/UK/US/« pointure ») — un simple "44" ne suffit pas,
  // une veste peut être taille 44.
  if (/(?:pointure|\b(?:eu|uk|us)\s?(?:3[5-9]|4[0-9]|50)\b)/i.test(`${taille} ${frTitle}`)) {
    return { icon: "👟", source: "pointure", iconeSansIa: sansIa };
  }
  return { icon, source: "defaut", iconeSansIa: sansIa };
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
    satisfactoryLbc: { value:"État satisfaisant",    label:t("conditionSatisfactory") },
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
  // ── LEBONCOIN N'EN A QUE TROIS (2026-09-21, relevé du 20/09) ───────────────
  // 🚨 Notre liste en offre SIX. « Lettre », « Grand colis » et « Très grand
  //    colis » N'EXISTENT PAS sur le formulaire Leboncoin : son « Choisissez un
  //    format » propose Petit / Moyen / Volumineux, et rien d'autre (relevé
  //    live du 20/09, cf. src/utils/leboncoinColis.js). Proposer les six, c'est
  //    proposer trois réponses qui ne mènent nulle part.
  // ⛔ ON NE TOUCHE PAS À LA CLÉ `format_colis` NI AUX SIX AUTRES VALEURS :
  //    le champ est PARTAGÉ avec Beebs, qui les mappe sur ses propres paliers
  //    de poids (beebs.js), et il sert de clé de mémoire au poids du formulaire
  //    Leboncoin PRO côté serveur. On change ce qui est PROPOSÉ sur la carte
  //    Leboncoin, pas ce que le champ transporte ailleurs.
  // ⚠️ Conséquence assumée : la mémoire de poids LBC PRO est indexée par cette
  //    valeur (get-pending-jobs, `trancheColis`). Un vendeur PRO qui choisit
  //    désormais « Petit » là où il choisissait « Petit colis » se verra
  //    reposer la question du poids UNE fois, pour cette tranche. Jamais une
  //    valeur fausse : la mémoire ne se trompe pas, elle ne sait pas encore.
  const packageFormatLbc = LBC_FORMATS.map(f => ({ value: f.valeur, label: f.valeur }));

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
    // Opla (2026-09-17 soir) : les libellés d'état sont ceux de Vinted (table
    // 1 pour 1 vers les codes Opla, OPLA_ETAT_PAR_LIBELLE) ; taille/genre/
    // marque/matière/couleur comme Vinted — le pré-vol du connecteur valide
    // la taille contre la grille de la feuille et jette couleur/matière hors
    // liste avec avertissement, jamais en silence.
    opla: [
      { key:"etat",      label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",    label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      { key:"genre",     label:t("fieldGenderLabel"),    type:"select", options: gender },
      { key:"marque",    label:t("fieldBrandLabel"),     type:"text" },
      { key:"matiere",   label:t("fieldMaterialLabel"),  type:"text" },
      { key:"couleur",   label:t("fieldColorLabel"),     type:"text" },
      { key:"categorie", label:t("fieldCategoryLabel"),  type:"text" },
    ],
    leboncoin: [
      { key:"etat",         label:t("fieldConditionLabel"),     type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactoryLbc, condition.forParts, condition.new_] },
      // Taille indispensable pour les chaussures : la Pointure est un critère
      // OBLIGATOIRE du rayon Mode>Chaussures LBC ("Veuillez choisir une
      // pointure" bloque l'aperçu — relevé campagne 2026-07-08). Sans cette
      // entrée, mergeFieldsWithLens jette la taille générée par l'IA (même
      // piège que l'univers, documenté plus bas).
      { key:"taille",       label:t("fieldSizeLabel"),          type:"select", options: size, groups: sizeGroups, childGroups: childSizeGroups },
      // Les TROIS formats réels de Leboncoin (relevé 20/09) — jamais les six
      // canoniques, dont trois n'existent pas chez eux (cf. packageFormatLbc).
      { key:"format_colis", label:t("fieldPackageFormatLabel"), type:"select", options: packageFormatLbc },
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
  // Exact sur la forme COMPARABLE (05/09) : « Très bon état » ↔ « Tres bon etat »,
  // apostrophes et espaces insécables gommées — la valeur rendue reste o.value.
  const nc = texteComparable(raw);
  const exact = options.find(o => texteComparable(o.value) === nc);
  if (exact) return exact.value;
  const mapped = FR_TO_EBAY_CONDITION[n];
  if (mapped && options.some(o => o.value === mapped)) return mapped;
  if (sizeField && PURE_NUMBER_RE.test(n)) return "";
  const candidates = options.filter(o => {
    const v = texteComparable(o.value);
    if (v.length <= 1) return false;
    return optionMatchesAsWords(nc, v) || optionMatchesAsWords(v, nc);
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
function isFieldRelevant(key, icon, texteArticle = "") {
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
    // ── BRETELLES (2026-09-06) : un DVD n'a pas d'ISBN, même rangé en Livres ─
    // La ceinture (resolveArticleIcon) empêche un support vidéo/audio de
    // devenir 📚. Celle-ci vaut MÊME SI une catégorie Livres a été posée par
    // erreur — icône fausse, catégorie éditée à la main, mapping futur : on ne
    // réclame JAMAIS un ISBN à un article dont le texte dit DVD, Blu-ray,
    // vinyle, CD ou jeu vidéo. Deux barrières indépendantes, parce qu'aucune
    // des deux ne doit être seule à tenir : c'est un utilisateur à qui on
    // demande un numéro qui n'existe pas.
    case "isbn":     return leaf === "Livres" && !estSupportNonLivre(texteArticle);
    default:         return true;   // etat, couleur, marque, categorie… : partout
  }
}

// Filtre d'affichage : garde un champ s'il est pertinent OU s'il porte déjà une
// valeur (ne jamais cacher une donnée que l'IA a trouvée et que l'utilisateur
// pourrait vouloir corriger).
function visibleFields(fieldConfigs, icon, values, texteArticle = "") {
  return fieldConfigs.filter(f =>
    isFieldRelevant(f.key, icon, texteArticle) || String(values?.[f.key] ?? "").trim() !== ""
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
// GENERIC_ASPECTS_PF_KEY, GENERIC_PLATFORM_LABELS : src/publication/moteur/champsPartages.js.

function defaultConditionFor(field) {
  if (!field || field.type !== "select") return DEFAULT_CONDITION;
  return findMatchingOption(DEFAULT_CONDITION, field.options ?? []) || DEFAULT_CONDITION;
}

// ── LES ATTRIBUTS DE LA FICHE, ET LA SOURCE NE DÉCIDE JAMAIS ───────────────
// `inventaire.attributs` porte { v, at, source } — écrit par le relevé de
// CHAQUE plateforme (releve_ebay, releve_leboncoin, releve_beebs, releve_opla)
// comme par la synchro Vinted (vinted_liste, vinted_detail) et par la capture.
// ⛔ ON LIT LA VALEUR, QUELLE QUE SOIT SON ORIGINE. Une taille est une taille :
//    le système sait déjà reprendre une fiche Vinted et l'adapter ailleurs, il
//    doit faire PAREIL depuis eBay, Leboncoin, Beebs ou Opla. `source` sert à
//    tracer et à arbitrer un conflit — jamais à décider si on lit.
// (La chaîne nue est acceptée aussi : les lignes anciennes n'ont pas d'objet.)
const CLES_FICHE = {
  etat: "etat", condition: "etat",
  taille: "taille", size: "taille",
  couleur: "couleur", color: "couleur",
  matiere: "matiere", material: "matiere",
  genre: "genre",
  marque: "marque", brand: "marque",
};
function valeurAttributFiche(attributs, fieldKey) {
  const cle = CLES_FICHE[fieldKey];
  if (!cle || !attributs || typeof attributs !== "object" || Array.isArray(attributs)) return null;
  const e = attributs[cle];
  const v = e && typeof e === "object" && !Array.isArray(e) ? e.v : e;
  const t = String(v ?? "").trim();
  return t || null;
}

// ── L'ADAPTATION PAR PLATEFORME, POUR LA TAILLE ────────────────────────────
// findMatchingOption EST l'adaptateur par plateforme, et il est déjà branché
// sur chaque champ `select` : c'est lui qui transforme une valeur en l'option
// que CETTE plateforme propose. Il lui manque une seule chose, le format
// COMPOSÉ de Vinted : « L / 40 / 12 » contre une grille qui attend « L »
// (Opla), « 40 » (Leboncoin) ou « 12 ». On découpe donc sur « / » et on lui
// redemande segment par segment, dans l'ordre du libellé.
// ⚠️ MÊME ÉTAGE que `resoudreTailleEbay` (extension, « taille-segment ») et que
//    `normaliserTailleOpla` (serveur, posé ce matin). Aucun des deux n'est
//    importable ici — l'un est un content script, l'autre un module Deno qui
//    traîne un catalogue d'1 Mo — mais la RÈGLE est la même et
//    l'appariement reste fait par findMatchingOption : on ajoute le découpage
//    devant, pas une seconde grammaire de correspondance.
// ⛔ AUCUNE APPROXIMATION : sans correspondance, "" — le champ reste vide sur
//    CETTE plateforme, et seulement sur celle-là. Jamais la taille la plus
//    proche (« 59 cm » → « 1-3 mois » est l'erreur déjà payée côté Vinted).
function optionTaillePlateforme(valeur, options) {
  const direct = findMatchingOption(valeur, options, { sizeField: true });
  if (direct) return direct;
  const segments = String(valeur ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return "";
  for (const seg of segments) {
    const m = findMatchingOption(seg, options, { sizeField: true });
    if (m) return m;
  }
  return "";
}

function mergeFieldsWithLens(platformFields, lensResult, fieldConfigs, attributsFiche = null) {
  const result = {};
  for (const field of fieldConfigs) {
    // sizeField : arme la garde anti-nombre-nu de findMatchingOption, comme
    // opts.sizeField des content scripts. Mêmes clés que le switch ci-dessous.
    const estTaille = field.key === "taille" || field.key === "size";
    const adapter = (brut) => (estTaille
      ? optionTaillePlateforme(brut, field.options)
      : findMatchingOption(brut, field.options, { sizeField: false }));
    const fromApi = platformFields?.[field.key];
    if (fromApi && fromApi !== "null") {
      result[field.key] = field.type === "select"
        ? (adapter(fromApi) || fromApi)
        : fromApi;
      continue;
    }
    // ── L'ORDRE, ET IL EST DÉFINITIF (2026-09-18) ─────────────────────────
    //   saisie/IA (ci-dessus) > ATTRIBUT DE LA FICHE > estimation Lens > défaut
    // Une ESTIMATION n'écrase jamais une valeur relevée. Avant aujourd'hui la
    // fiche n'était pas lue du tout : `taille` interrogeait l'estimation Lens
    // (`taille_estimee`), et genre/matière/couleur n'avaient AUCUN cas — d'où
    // quatre tirets à l'écran pendant que la base portait les valeurs.
    const ficheVal = valeurAttributFiche(attributsFiche, field.key);
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
      // ⛔ genre / matiere / couleur n'ont VOLONTAIREMENT pas de cas Lens : le
      //    Lens ne les estime pas. Ils viennent de la fiche, et d'elle seule —
      //    c'est justement ce qui manquait, et ce que `ficheVal` apporte.
      default:            lensVal = null;
    }
    // La fiche D'ABORD, l'estimation ensuite. `??` et non `||` : une valeur
    // vide de la fiche n'existe pas (valeurAttributFiche rend null), mais on
    // ne veut surtout pas qu'un « 0 » ou un « S » soit pris pour un manque.
    const brut = ficheVal ?? lensVal;
    result[field.key] = brut
      ? (field.type === "select" ? (adapter(brut) || "") : brut)
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

// ── DÉFAUT Nº12 : LA BARRE D'ÉTAPES EST CLIQUABLE — EN ARRIÈRE SEULEMENT ──
// Elle affichait où on en était et ne servait à rien d'autre : on cliquait
// « Génération » depuis « Publier » et il ne se passait rien.
// ⛔ EN ARRIÈRE SEULEMENT, et c'est un choix, pas une limite technique :
//    revenir sur une étape déjà franchie ne peut rien casser, alors que
//    SAUTER en avant contournerait les gardes qui vivent dans les boutons
//    (génération payante, plateformes sans adresse, prix manquant). Une étape
//    pas encore atteinte reste donc grise et inerte.
function StepProgress({ step, labels, onAller }) {
  return (
    <div style={{ padding:"16px 20px 4px" }}>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {labels.map((_, i) => (
          <div key={i} style={{ height:3, flex:1, borderRadius:999, background: i <= step ? T.teal : T.border }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        {labels.map((l, i) => {
          const atteignable = i < step && typeof onAller === "function";
          return (
            <button
              key={l}
              type="button"
              onClick={atteignable ? () => onAller(i) : undefined}
              disabled={!atteignable}
              style={{
                background:"none", border:"none", padding:"4px 2px", margin:"-4px -2px",
                fontFamily:"inherit", fontSize:10.5,
                fontWeight: i === step ? 700 : 500,
                color: i === step ? T.teal : atteignable ? T.mute2 : T.mute,
                cursor: atteignable ? "pointer" : "default",
                textDecoration: atteignable ? "underline" : "none",
                textUnderlineOffset: 3,
              }}
            >{l}</button>
          );
        })}
      </div>
    </div>
  );
}

// Le réordonnancement des photos (moveItem, usePhotoDrag, DragHandle,
// CoverBadge) vit dans components/GaleriePhotos depuis le 19/09, partagé avec
// le formulaire d'ajout manuel. Logique et rendu inchangés.

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
  const count = previews.length;

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

      {/* La galerie — input caché, grille, poignée de réordonnancement,
          badge « Couverture », croix de retrait, tuile « + » et rappel du
          minimum — est partagée avec le formulaire d'ajout manuel depuis le
          19/09. Rendu identique : c'est le même composant, extrait d'ici. */}
      <GaleriePhotos
        previews={previews}
        onAdd={onAdd}
        onRemove={onRemove}
        onReorder={onReorder}
        removable={removable}
        lang={lang}
      />

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

export function StepPhotos({ photos, onAddPhotos, onRemovePhoto, onReorderPhotos, onPhotoClick, photoOption, setPhotoOption, background, setBackground, selected, setSelected, coinPrices, reuseRetouched = false, retoucheNewCount = 0, platformSupport, motifSupport = null, publishedSet, queuedSet, lang, ebayVoieApi = false, userId = null,
  // Plateformes visibles mais pas encore ouvertes pour CE compte (lot 7 Opla).
  // Defaut [] : un compte sans drapeau voit exactement les quatre d avant.
  plateformesAVenir = [],
  // Celles de plateformesAVenir qui sont OUVERTES pour ce compte (interrupteur
  // serveur + borne de build, App.jsx) : la case devient cliquable. Motif de
  // la case grisée sinon ('fermee' | 'extension') et borne affichée.
  plateformesOuvertes = [], oplaMotifGrise = 'fermee', oplaExtensionMin = null,
  // Autorisation Opla du COMPTE, lue au serveur (utils/oplaAcces, 24/09) :
  // 'autorise' · 'a_autoriser' · 'inconnu' · null (pas encore lue). La modale
  // au clic ne se pose que sur un refus CONNU ('a_autoriser').
  oplaVerdict = null,
  modeleAConfirmer = false, modelePropose = null, modeleSource = null, onConfirmModele = null, identifyFailed = false,
  onAnalyze, analyzing, analysisResult, analysisError, analysisHidden,
  // Compte eBay pas encore utilisable (07/09/2026, demande Joséphine). Vaut
  // true UNIQUEMENT pour un compte en voie API (profiles.ebay_voie_api) dont
  // le compte eBay n'est pas relié / pas fini de paramétrer. eBay est alors
  // GRISÉ — jamais masqué : la personne doit savoir que la plateforme existe
  // et ce qu'il lui reste à faire. Aucune autre plateforme n'est touchée, et
  // un compte en voie extension ne voit rien changer (ebayBloque false).
  ebayBloque = false, ebayMotif = null, ebayEtatCompte = null, onParametrerEbay = null,
  // Plateforme EN PAUSE (platform_health, 2026-09-09) : grisée comme une
  // catégorie non supportée, motif sous la rangée = message_fr/message_en
  // écrit en base. Lecture tolérante en amont : drapeau illisible ou absent
  // → listes vides → rien de grisé (fail-safe, jamais une pause par accident).
  pausedPlatforms = [], pausedReasons = {} }) {
  const { t, tpl } = useTranslation(lang);
  const addRef = useRef();
  // ── OPLA : la modale d’autorisation, ouverte AU CLIC (18/09/2026) ────────
  // Elle ne bloque jamais : « Continuer » coche quand même. Voir
  // components/OplaAutorisationModal pour ce qui se passe ensuite.
  const [oplaModale, setOplaModale] = useState(false);
  const basculerPlateforme = (p) => setSelected(prev => {
    const s = new Set(prev);
    s.has(p) ? s.delete(p) : s.add(p);
    return s;
  });
  // Motif d'une plateforme visible mais grisée (Opla, 17/09 soir) : ouverte
  // côté serveur mais extension du compte trop ancienne → « mise à jour » ;
  // sinon « pas encore ouverte ». Le fait, pas une date.
  const motifAVenir = (p) => oplaMotifGrise === 'extension'
    ? (lang === 'en'
        ? `${PLATFORM_LABELS[p]} opens with the next FillSell extension update${oplaExtensionMin ? ` (${libelleVersionExtension(oplaExtensionMin)})` : ''} — it arrives on its own through Chrome.`
        : `${PLATFORM_LABELS[p]} s'active avec la prochaine mise à jour de l'extension FillSell${oplaExtensionMin ? ` (${libelleVersionExtension(oplaExtensionMin)})` : ''} — elle arrive toute seule par Chrome.`)
    : (lang === 'en'
        ? `${PLATFORM_LABELS[p]} is being prepared — visible here, not open for publishing yet.`
        : `${PLATFORM_LABELS[p]} est en préparation — visible ici, pas encore ouverte à la publication.`);
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
        {[...PLATFORMS_DEFAULT, ...plateformesAVenir].map(p => {
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
          // Compte eBay pas paramétré : SEUL eBay est concerné, et seulement
          // pour un compte en voie API. Grisé comme une catégorie non
          // supportée — même traitement visuel, motif dit sous la rangée.
          const compteAbsent = p === "ebay" && ebayBloque;
          // Plateforme en pause (platform_health) : verrouillée, motif = le
          // texte écrit en base. La sélection est aussi purgée en amont (effet
          // sur pausedPlatforms) et le RPC refuse platform_paused en dernier
          // filet — trois verrous, aucun ne repose sur les deux autres.
          const enPause = pausedPlatforms.includes(p);
          // ── Plateforme VISIBLE mais PAS ENCORE OUVERTE (2026-09-15, Opla) ──
          // 6ᵉ motif de verrou, et le plus strict : celui-là n'est levé par
          // aucun état de l'article ni du compte. Elle se voit, elle ne se
          // coche pas. C'est ce qui garantit qu'aucun job ne peut naître pour
          // une plateforme sans handler — la case `disabled` ne passe jamais
          // par setSelected, donc la plateforme n'entre jamais dans `rows`,
          // donc jamais dans spend_coins_and_publish.
          // (17/09 soir) Levé par l'interrupteur serveur ET la borne de build,
          // calculés par App.jsx (plateformesOuvertes) — jamais par l'article.
          const pasEncoreOuverte = plateformesAVenir.includes(p) && !plateformesOuvertes.includes(p);
          // La porte (cf. CATEGORIE_FERMEE) : seule une branche ABSENTE ou un
          // produit INTERDIT ferme la case. Un trou de mapping par icône ne
          // ferme plus rien — le mot et l'arbitrage ont le droit d'essayer.
          const fermeeCategorie = categorieFermee(support);
          const disabled = pasEncoreOuverte || fermeeCategorie || dejaEnLigne || enCours || compteAbsent || enPause;
          return (
            <button
              key={p}
              disabled={disabled}
              title={pasEncoreOuverte
                ? motifAVenir(p)
                : dejaEnLigne
                ? (lang === 'en' ? `Already live on ${PLATFORM_LABELS[p]}` : `Déjà en ligne sur ${PLATFORM_LABELS[p]}`)
                : enCours
                ? (lang === 'en' ? `Already being published on ${PLATFORM_LABELS[p]}` : `Publication déjà en cours sur ${PLATFORM_LABELS[p]}`)
                : compteAbsent
                ? messageCompteEbay(ebayMotif, lang, ebayEtatCompte)
                : fermeeCategorie
                ? (motifSupport ? motifSupport(p, support) : supportMessage(t, support, PLATFORM_LABELS[p]))
                : enPause
                ? messagePause(tpl, pausedReasons, p, PLATFORM_LABELS[p])
                : undefined}
              onClick={() => {
                if (disabled) return;
                // ⛔ OPLA : LA QUESTION SE POSE ICI, AU CLIC (18/09/2026).
                // Cocher Opla sans autorisation ouvre la modale SUR PLACE,
                // avec le geste exact. Elle ne bloque pas : « Continuer »
                // coche quand même — l’annonce attendra l’autorisation et
                // partira toute seule. Décocher ne demande rien, et
                // « on ne sait pas » (verdict 'inconnu') ne demande rien non
                // plus : le verdict est celui du SERVEUR (utils/oplaAcces).
                if (p === "opla" && !selected.has(p) && oplaVerdict === "a_autoriser") { setOplaModale(true); return; }
                basculerPlateforme(p);
              }}
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
              {pasEncoreOuverte && (
                <span style={{ fontSize:11, fontWeight:600 }}>
                  · {oplaMotifGrise === 'extension'
                      ? (lang === 'en' ? 'update' : 'mise à jour')
                      : (lang === 'en' ? 'soon' : 'bientôt')}
                </span>
              )}
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
              {enPause && !dejaEnLigne && !enCours && (
                <span style={{ fontSize:11, fontWeight:600 }}>
                  · {lang === 'en' ? 'paused' : 'en pause'}
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
      {/* Plateforme visible mais pas encore ouverte : UNE phrase sous la
          rangée, même forme que les cinq autres motifs. Elle dit le fait, pas
          une date — on n'en promet aucune. */}
      {plateformesAVenir.filter(p => !plateformesOuvertes.includes(p)).map(p => (
        <p key={`avenir-${p}`} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {motifAVenir(p)}
        </p>
      ))}
      {PLATFORMS_DEFAULT.filter(p => (publishedSet?.has(p) || queuedSet?.has(p))).length > 0 && (
        <p style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {lang === 'en'
            ? "Platforms already live or being published stay untouched — only the remaining ones will be published."
            : "Les plateformes déjà en ligne ou en cours de publication ne sont pas retouchées — seules les manquantes seront publiées."}
        </p>
      )}
      {/* Le motif ne s'écrit que sous une case RÉELLEMENT fermée : une case
          ouverte n'a rien à justifier, et afficher « pas encore prise en
          charge » sous une plateforme cochable serait un diagnostic à
          l'écran — jamais. */}
      {PLATFORMS_DEFAULT.filter(p => categorieFermee(platformSupport?.[p])).map(p => (
        <p key={p} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {motifSupport ? motifSupport(p, platformSupport[p]) : supportMessage(t, platformSupport[p], PLATFORM_LABELS[p])}
        </p>
      ))}
      {/* Plateforme en pause (platform_health) : UNE phrase sous la rangée,
          celle écrite en base (message_fr/message_en) — ton neutre, pas une
          erreur. Pas répétée si la case est déjà grisée pour un motif déjà
          affiché (catégorie non supportée, déjà en ligne, en cours). */}
      {PLATFORMS_DEFAULT.filter(p => pausedPlatforms.includes(p) && !categorieFermee(platformSupport?.[p]) && !publishedSet?.has(p) && !queuedSet?.has(p)).map(p => (
        <p key={`pause-${p}`} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {messagePause(tpl, pausedReasons, p, PLATFORM_LABELS[p])}
        </p>
      ))}
      {/* Compte eBay pas paramétré : la phrase du geste + l'accès direct à
          Réglages › Compte eBay (la MÊME section, ouverte par-dessus le
          stepper — le brouillon n'est pas perdu, on ne ferme rien). Ton
          neutre : ce n'est pas une erreur, c'est une étape qui reste. */}
      {ebayBloque && !categorieFermee(platformSupport?.ebay) && (
        <div style={{ margin:"8px 0 0", display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
          <p style={{ margin:0, flex:"1 1 200px", minWidth:0, fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
            {messageCompteEbay(ebayMotif, lang, ebayEtatCompte)}
          </p>
          {onParametrerEbay && (
            <button
              type="button"
              onClick={onParametrerEbay}
              style={{ padding:"7px 13px", borderRadius:999, border:`1.5px solid ${T.tealDeep}`, background:"none",
                color:T.tealDeep, fontSize:12.5, fontWeight:700, fontFamily:"inherit", cursor:"pointer", whiteSpace:"nowrap" }}
            >
              {/* Le bouton porte le mot du parcours : « Reprendre où j'en suis »
                  quand il reste une étape, « Relier eBay » quand rien n'est
                  encore relié. Il ouvre la MÊME section, à la bonne étape. */}
              {(ebayEtatCompte ? resumeEbay(ebayEtatCompte, lang === "en" ? "en" : "fr").bouton : null)
                ?? (lang === "en" ? "Set up eBay" : "Paramétrer eBay")}
            </button>
          )}
        </div>
      )}
      {/* Compte en voie EXTENSION (2026-09-08, ouverture du parcours à tous) :
          eBay part par le formulaire ebay.fr, rien n'est grisé — on PROPOSE la
          liaison OAuth, même section Réglages › Compte eBay ouverte par-dessus
          le stepper. Le drapeau ebay_voie_api n'est posé QUE par le serveur,
          après une connexion prouvée (ebay-oauth-callback) — jamais ici. */}
      {!ebayBloque && !ebayVoieApi && selected.has("ebay") && !categorieFermee(platformSupport?.ebay) && onParametrerEbay && (
        <div style={{ margin:"8px 0 0", display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
          <p style={{ margin:0, flex:"1 1 200px", minWidth:0, fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
            {/* La proposition dit ce qu'on GAGNE, pas ce qui manque : rien
                n'est bloqué, la voie extension publie exactement comme avant
                si la personne passe son chemin. Le drapeau ebay_voie_api
                n'est posé QUE par le serveur, après connexion prouvée. */}
            {lang === "en"
              ? "eBay goes through the extension, so your computer has to be on. Link your eBay account and your listings go out from our servers, even with your computer off."
              : "eBay part par l'extension : ton ordinateur doit être allumé. Relie ton compte eBay et tes annonces partent de nos serveurs, même ordinateur éteint."}
          </p>
          <button
            type="button"
            onClick={onParametrerEbay}
            style={{ padding:"7px 13px", borderRadius:999, border:`1.5px solid ${T.tealDeep}`, background:"none",
              color:T.tealDeep, fontSize:12.5, fontWeight:700, fontFamily:"inherit", cursor:"pointer", whiteSpace:"nowrap" }}
          >
            {lang === "en" ? "Link eBay" : "Relier eBay"}
          </button>
        </div>
      )}
      {/* La modale Opla — au clic, sur place, jamais un renvoi ailleurs. */}
      {oplaModale && (
        <OplaAutorisationModal
          lang={lang}
          contexte="publication"
          userId={userId}
          onContinuer={() => { setOplaModale(false); basculerPlateforme("opla"); }}
          onClose={() => setOplaModale(false)}
        />
      )}
      {selected.size === 0 && (
        <p style={{ margin:"8px 0 0", fontSize:12.5, color:"#EF4444", fontWeight:600 }}>
          {t("stepPhotosSelectPlatformError")}
        </p>
      )}
    </div>
  );
}

// ── Step 2 — Génération (phase A : loading · phase B : review éditable) ───────

// Exporté (refonte 24/09) : le nouvel écran « Ce qui va partir » rend CE
// composant — même corps de cartes, même bloc général, mêmes gestes.
export function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, edited, setEdited, onPhotoClick, onRetry, noteOverride, lang, generatePrice = null,
  price, setPrice, customPriced, setCustomPriced, articleIcon = "📦", photoOption = null,
  onEstimatePrice = null, estimating = false, estimateCost = null, estimateError = "", estimateResult = null,
  prixAchat = null, carteAOuvrir = null, onCarteOuverte = null, ficheReprise = false,
  // ebayVoieApiReelle (2026-09-20) : la carte de livraison eBay ne se montre
  // que quand la voie API est reellement active — par le formulaire, une
  // politique de livraison ne s'applique pas.
  ebayVoieApiReelle = false,
  // ── LE RAYON (lot B, 20/09) ────────────────────────────────────────────
  // `rayonsParPf` : ce que le pré-calcul du lot A a trouvé, PAR plateforme,
  // déjà croisé avec le choix de la personne. La carte ne calcule rien : elle
  // affiche ce qu'on lui donne, et remonte les choix.
  rayonsParPf = {}, suggestionsParPf = {}, supabase = null, onChoisirRayon = null,
  // (25/09) La question « quel rayon ? » quand le rayon envisagé a été refusé
  // et qu'aucun rayon sûr ne l'a remplacé (pf.rayon_a_choisir), par plateforme.
  questionsRayonParPf = {},
  // ── LA VALEUR GÉNÉRALE (2026-09-21) ────────────────────────────────────
  // Cet écran n'en calcule RIEN : il affiche `generales`, il remonte les
  // gestes. Toute la mécanique (qui suit, qui est dissociée, ce que chaque
  // plateforme reçoit) vit dans utils/valeursGenerales.js, appelée par
  // l'hôte. Les valeurs par défaut rendent le composant utilisable sans
  // ces props — l'ancien comportement, à l'identique.
  generales = null, onValeurGenerale = null,
  // Le texte a bougé sur la plateforme alors qu'elle l'avait retouché ici.
  divergence = null, divergenceTranchee = null, onTrancherDivergence = null,
  // Les versions du texte par plateforme (2026-09-23) et le texte de la fiche.
  versionsTexte = [], ficheTexte = null,
  dissociees = null, onModifierCarte = null, onRetablirCarte = null,
  // ── LA PEAU (refonte 24/09) ─────────────────────────────────────────────
  // "nouvelle" : l'en-tête et la bande de photos sont rendus par la coque du
  // nouveau stepper (ils ne le sont donc pas ici), et chaque carte porte la
  // puce d'état de sa plateforme (`etatsParPlateforme[p] = { ton, libelle }`).
  // "classique" (défaut) : rendu inchangé.
  variante = "classique", etatsParPlateforme = null }) {
  const { t, tpl } = useTranslation(lang);
  const platformFieldsConfig = getPlatformFieldsConfig(t);
  const [elapsed, setElapsed] = useState(0);
  const [openCards, setOpenCards] = useState(new Set());
  // Ouverture DEMANDÉE par le step Publier (garde « description Vinted
  // vide », 2026-09-12) : la carte de cette copie s'ouvre, une fois.
  useEffect(() => {
    if (!carteAOuvrir) return;
    setOpenCards(prev => { const n = new Set(prev); n.add(carteAOuvrir); return n; });
    onCarteOuverte?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carteAOuvrir]);
  // (Le repli des sources de l'estimation vit désormais dans AnalyseMarche,
  // partagé avec l'écran Lens — plus d'état local ici.)

  // Prix central (2026-07-14) : écrit le prix dans TOUTES les copies d'un
  // coup. Une plateforme dont le prix a été édité à la main est marquée
  // « personnalisée » (customPriced) et n'est plus écrasée — sinon un prix
  // Vinted volontairement différent sautait à la première frappe ici.
  //
  // ⛔ TOUTES LES COPIES, ET PLUS SEULEMENT LES COCHÉES (2026-09-21, cas
  //    d'Ornella). Une case cochée dit ce qui SERA PUBLIÉ ; elle ne dit rien
  //    de ce qu'une copie contient. Boucler sur `selected` laissait donc
  //    derrière elle toute copie cochée APRÈS la frappe — et la copie Opla
  //    est exactement dans ce cas : elle ne vient pas de generate-listing,
  //    elle est dérivée de celle de Vinted, et la reprise d'une fiche la
  //    décoche (elle n'est pas dans `platforms` de la génération, l. ~5148).
  //    Mesuré en base sur 30 jours : 13 lots partis avec un prix Opla
  //    différent du prix général — 22 € au lieu de 10, 42 au lieu de 20 —
  //    toujours l'estimation de Lens, jamais le prix de la personne.
  //    `handleAnalyzePhotos` boucle déjà sur toutes les copies depuis le
  //    28/07 : c'est CETTE boucle-ci qui était l'exception.
  const applyCentralPrice = (raw) => {
    const v = raw === "" ? null : Number(raw);
    setPrice(raw === "" ? null : v);
    setEdited(prev => {
      const next = { ...prev };
      for (const p of Object.keys(next)) {
        if (customPriced.has(p)) continue;
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
      {variante !== "nouvelle" && (<>
      <Eyebrow>{t("stepGenEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 4px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepGenReviewTitle")}
      </h1>
      </>)}
      {/* ⛔ DÉFAUT Nº4 : « CLIQUE SUR UNE CARTE » NE S'AFFICHE PLUS QUAND IL
          N'Y A PAS DE CARTE. La consigne s'affichait toujours, y compris sur
          un écran vide — on demandait un geste impossible. Sans carte, on dit
          ce qui se passe vraiment, et le bouton du bas est le seul geste. */}
      {variante !== "nouvelle" && (
      <p style={{ margin:"0 0 16px", fontSize:12.5, color:T.mute2, lineHeight:1.5 }}>
        {platforms.length > 0
          ? t("stepGenReviewSubtitle")
          : (lang === "en"
            ? "No listing was generated for the selected platforms. Go back to the photos step to pick them, then generate."
            : "Aucune annonce n'a été générée pour les plateformes cochées. Reviens à l'étape des photos pour les choisir, puis relance la génération.")}
      </p>
      )}

      {/* Fiche reprise (2026-09-15) : l'article rouvert porte des annonces déjà
          payées. On le DIT — sans quoi l'écran est indistinguable d'une
          génération neuve, et la question « est-ce qu'on vient de me
          redécompter une annonce ? » n'a aucune réponse à l'écran. */}
      {ficheReprise && (
        <div style={{ marginBottom:16, padding:"9px 12px", borderRadius:12, background:T.chip, border:`1px solid ${T.border}`, fontSize:12, color:T.mute2, lineHeight:1.45 }}>
          {lang === "en"
            ? "Saved listing reopened — nothing was regenerated, no listing counted."
            : "Fiche enregistrée, rouverte telle quelle — rien n'a été regénéré, aucune annonce décomptée."}
        </div>
      )}

      {variante !== "nouvelle" && processedPhotos?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          {/* ⛔ DÉFAUT Nº11 : la bande défile déjà (overflowX), mais RIEN ne
              le disait — la 5ᵉ photo coupée au bord passait pour un bug
              d'affichage. Le compte le dit : on sait qu'il y en a plus que
              ce qu'on voit, et qu'il faut faire glisser. */}
          <Eyebrow>{t("stepGenEnhancedPhotosLabel")} · {processedPhotos.length}</Eyebrow>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {processedPhotos.map((ph, i) => (
              <div
                key={i}
                onClick={() => onPhotoClick(urlPhoto(ph))}
                style={{ flexShrink:0, width:80, height:80, borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`, cursor:"pointer" }}
              >
                <img src={urlPhoto(ph)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── « LE TEXTE A CHANGÉ SUR LA PLATEFORME » (2026-09-21) ───────────
          Ambre, jamais rouge : rien n'est cassé et rien n'est bloqué. Elle a
          retouché ce texte dans FillSell, il a AUSSI bougé sur la plateforme —
          on a gardé SA version et on pose la question, elle tranche en un tap.
          Sans réponse, sa retouche part : c'est le comportement d'avant.
          ⛔ Le bandeau NE COMPTE PAS comme un geste : qui l'ignore publie
             exactement au même nombre de taps qu'hier. */}
      {divergence && !divergenceTranchee && (
        <div style={{ marginBottom:16, padding:"11px 13px", borderRadius:14, background:"#FEF6E7", border:"1px solid #F3DFB5" }}>
          <div style={{ fontSize:12.5, color:"#7A4B00", lineHeight:1.45, fontWeight:600 }}>
            {tpl("divergenceTitre", { plateforme: PLATFORM_LABELS[divergence.plateforme] ?? divergence.plateforme })}
          </div>
          <div style={{ fontSize:11.5, color:"#7A4B00", lineHeight:1.45, marginTop:3 }}>
            {t("divergenceTexte")}
          </div>
          {divergence.texte && (
            <div style={{ fontSize:11.5, color:"#7A4B00", lineHeight:1.4, marginTop:6, whiteSpace:"pre-wrap",
                          display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden",
                          background:"rgba(255,255,255,0.55)", borderRadius:8, padding:"6px 8px" }}>
              {divergence.texte}
            </div>
          )}
          <div style={{ display:"flex", gap:8, marginTop:9, flexWrap:"wrap" }}>
            <button
              type="button"
              onClick={() => onTrancherDivergence?.("plateforme")}
              style={{ padding:"7px 12px", borderRadius:999, border:"1px solid #7A4B00", background:"#7A4B00",
                       color:"#fff", fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
            >
              {tpl("divergencePrendre", { plateforme: PLATFORM_LABELS[divergence.plateforme] ?? divergence.plateforme })}
            </button>
            <button
              type="button"
              onClick={() => onTrancherDivergence?.("moi")}
              style={{ padding:"7px 12px", borderRadius:999, border:"1px solid #C7A867", background:"none",
                       color:"#7A4B00", fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
            >
              {t("divergenceGarder")}
            </button>
          </div>
        </div>
      )}
      {/* ── LE BLOC GÉNÉRAL — PRIX, TITRE, DESCRIPTION, ÉTAT (2026-09-21) ────
          La carte « Prix de vente » vivait seule ici depuis le 14/07. Elle
          accueille maintenant les trois autres valeurs générales (demande de
          XEWER, qui refaisait la même correction sur chaque carte) — UN seul
          bloc, pas quatre : même style, mêmes tokens, rien de neuf à dessiner.
          Le prix garde tout ce qu'il avait : champ mis en avant et focus
          automatique quand il manque (mode identify, 28/07 — publication
          bloquée sous 1 €, garde du 13/07, job 3d194668 parti à price=NULL),
          bouton d'estimation, analyse de marché déjà payée. */}
      <BlocValeursGenerales
        T={T} t={t} lang={lang}
        price={price} onPrixChange={applyCentralPrice} prixManquant={prixManquant}
        estimateError={estimateError}
        nbSuiveuses={platforms.length}
        titre={generales?.titre ?? ""} onTitreChange={v => onValeurGenerale?.("titre", v)}
        description={generales?.description ?? ""} onDescriptionChange={v => onValeurGenerale?.("description", v)}
        etat={generales?.etat ?? ""} onEtatChange={v => onValeurGenerale?.("etat", v)}
        versions={versionsTexte} ficheTexte={ficheTexte}
        enfantsPrix={
          <>
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
            {/* ── L'analyse déjà payée, ICI (2026-07-31) ────────────────────
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
          </>
        }
      />

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
            e.platform_fields ?? {},
            // Copies FR seulement — jamais eBay (traduite en anglais) : même
            // chaîne de repli que resolveArticleIcon. L'article d'origine n'est
            // pas descendu jusqu'ici, et ces copies portent le même mot :
            // « DVD » reste « DVD » sur Leboncoin, Vinted et Beebs.
            `${edited?.leboncoin?.title ?? edited?.vinted?.title ?? edited?.beebs?.title ?? ""} ` +
            `${edited?.leboncoin?.description ?? edited?.vinted?.description ?? ""}`
          );
          // Union sticky (cf. shownFieldsRef) dans l'ordre de la config.
          const shownSet = shownFieldsRef.current[p] ?? (shownFieldsRef.current[p] = new Set());
          for (const f of fieldConfigsVisible) shownSet.add(f.key);
          const fieldConfigs = (platformFieldsConfig[p] ?? []).filter(f => shownSet.has(f.key));
          const etatField = fieldConfigs.find(f => f.key === "etat" || f.key === "condition");
          const etatVal = etatField ? (e.platform_fields?.[etatField.key] ?? "") : "";
          const rayonCarte = rayonsParPf[p] ?? null;
          const summaryParts = [
            e.title ? (e.title.length > 32 ? e.title.slice(0, 32) + "…" : e.title) : "—",
            etatVal || null,
            e.price != null && e.price !== "" ? `${e.price}€` : null,
          ].filter(Boolean);
          // ── LE MARQUEUR (2026-09-21) ────────────────────────────────────
          // Une carte « suit la valeur générale » ou « a été modifiée à
          // part ». Sur l'en-tête replié, une seule pastille discrète, et
          // seulement quand il y a quelque chose à dire — le prix compte,
          // lui aussi : il est la première valeur générale de cet écran.
          const champsAPart = dissociees
            ? CHAMPS_GENERAUX.filter(c => !suitLaGenerale(dissociees, c, p))
            : [];
          const aPart = champsAPart.length > 0 || isCustomPrice;
          // L'état servi à cette plateforme est-il PLUS FLATTEUR que le réel ?
          // (Le seul cas connu est Vestiaire, qui n'a pas de palier bas — mais
          // la question se posera à chaque plateforme ajoutée, alors elle est
          // posée ici, pas dans une liste.)
          const etatPlusFlatteur = generales?.etat
            ? (valeurPourPlateforme("etat", generales.etat, p).meilleur === true)
            : false;
          // Ce que la conformité a dû faire au texte de cette carte, ou ce que
          // la plateforme retirera au dépôt. Vide = le texte part intact.
          const ecarts = ecartsDeConformite(edited, p, {
            titreGeneral: suitLaGenerale(dissociees ?? {}, "titre", p) ? generales?.titre : "",
            descriptionGenerale: suitLaGenerale(dissociees ?? {}, "description", p) ? generales?.description : "",
          }) ?? [];
          const CLE_ECART = {
            titreCoupe: "cardAdjustedTitle",
            descriptionCoupee: "cardAdjustedDescription",
            symboles: "cardAdjustedSymbols",
            lbcMentions: "cardAdjustedLbcMentions",
            lbcHashtags: "cardAdjustedLbcHashtags",
          };
          // Étiquette « modifié à part · Rétablir », posée au-dessus d'un champ.
          const marqueurChamp = (champ) => (
            dissociees && !suitLaGenerale(dissociees, champ, p) ? (
              <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.tealDeep, background:"rgba(47,158,144,0.12)", borderRadius:99, padding:"2px 8px", whiteSpace:"nowrap" }}>
                  {t("cardCustomField")}
                </span>
                <button
                  type="button"
                  onClick={() => onRetablirCarte?.(p, champ)}
                  style={{ background:"none", border:"none", padding:0, fontSize:10.5, fontWeight:700, color:T.mute, cursor:"pointer", fontFamily:"inherit", textDecoration:"underline" }}
                >
                  {t("cardResetToGeneral")}
                </button>
              </span>
            ) : null
          );

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
                    {/* ⛔ DÉFAUT Nº9/10 : le titre débordait et la ligne se
                        coupait. `anywhere` + deux lignes maximum : on lit le
                        début du titre sans que la carte s'étire. */}
                    <div style={{ fontSize:12, color:T.mute2, lineHeight:1.35, overflowWrap:"anywhere",
                                  display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                      {summaryParts.join(" · ")}
                    </div>
                    {/* ── DÉFAUT Nº1 : LA CARTE DIT ENFIN OÙ VA L'ARTICLE ──
                        Repliée, elle donne déjà l'information la plus utile :
                        le rayon. C'est tout l'objet du lot, et ça ne coûte pas
                        un geste — c'est écrit, pas à ouvrir. */}
                    {rayonCarte?.chemin?.length ? (
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3 }}>
                        <MapPin size={11} color={rayonCarte.choisi ? T.tealDeep : T.mute} style={{ flexShrink:0 }} />
                        <span style={{ fontSize:11.5, fontWeight:700,
                                       color: rayonCarte.choisi ? T.tealDeep : rayonCarte.incertain ? "#92400E" : T.mute2,
                                       overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {libelleRayonCourt(rayonCarte.chemin)}
                        </span>
                      </div>
                    ) : null}
                    {/* ── LE MARQUEUR, SUR LA CARTE REPLIÉE (2026-09-21) ──
                        Une ligne de plus SEULEMENT quand il y a quelque chose
                        à dire. Une carte qui suit tout ne porte rien : dire
                        « suit la valeur générale » sur cinq cartes sur cinq
                        n'informe personne et allonge l'écran pour rien. */}
                    {aPart && (
                      <div style={{ marginTop:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:T.tealDeep, background:"rgba(47,158,144,0.12)", borderRadius:99, padding:"2px 8px", whiteSpace:"nowrap" }}>
                          {t("cardCustom")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* La puce d'état de la plateforme (nouveau stepper seulement) :
                    « Prêt », « 1 question », « Adresse »… — la question est
                    dite UNE fois, sur sa ligne. */}
                {etatsParPlateforme?.[p] ? (
                  <span className={`fsn-chip fsn-chip--${etatsParPlateforme[p].ton}`} style={{ marginLeft:8 }}>
                    {etatsParPlateforme[p].libelle}
                  </span>
                ) : null}
                <Pencil size={15} color={T.mute} style={{ flexShrink:0, marginLeft:8 }} />
              </button>

              {isOpen && (
                <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${T.border}` }}>
                  {/* ── CE QUE LA CONFORMITÉ A DÛ FAIRE (2026-09-21) ──────
                      « Si la mise en conformité a dû modifier le texte pour
                      une plateforme (émoji retiré, titre raccourci), la carte
                      le signale discrètement, pour que le vendeur le voie. »
                      Ambre, pas rouge : rien n'est cassé, rien n'est bloqué —
                      c'est une information, et elle ne réclame aucun geste. */}
                  {(ecarts.length > 0 || etatPlusFlatteur) && (
                    <div style={{ marginTop:12, padding:"8px 10px", borderRadius:10, background:"#FEF6E7", border:"1px solid #F3DFB5" }}>
                      {etatPlusFlatteur && (
                        <div style={{ fontSize:11.5, color:"#7A4B00", lineHeight:1.4 }}>{t("cardConditionBetter")}</div>
                      )}
                      {ecarts.map(cle => (
                        <div key={cle} style={{ fontSize:11.5, color:"#7A4B00", lineHeight:1.4 }}>
                          {t(CLE_ECART[cle] ?? "cardAdjustedTitle")}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginBottom:10, paddingTop:12 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:11, color:T.mute2, fontWeight:600 }}>{t("fieldTitleLabel")}</span>
                      {marqueurChamp("titre")}
                    </div>
                    <input
                      type="text"
                      value={e.title}
                      onChange={ev => (onModifierCarte
                        ? onModifierCarte(p, "titre", ev.target.value)
                        : setEdited(prev => ({ ...prev, [p]: { ...prev[p], title: ev.target.value } })))}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13.5, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:11, color:T.mute2, fontWeight:600 }}>{t("fieldDescriptionLabel")}</span>
                      {marqueurChamp("description")}
                    </div>
                    {/* ── LE TEXTE À PLUSIEURS LIGNES SE VOIT (2026-09-21) ────
                        Un `textarea` garde les retours à la ligne — ce n'est
                        pas lui qui mentait. Mais à 4 lignes fixes, une
                        description de sept lignes s'ouvrait sur un champ qu'il
                        fallait faire défiler pour constater qu'elle était
                        entière. La hauteur suit le texte (bornée à 10 lignes
                        pour ne pas manger l'écran), et le compte de lignes est
                        écrit à côté du libellé. Aucun geste en plus. */}
                    <textarea
                      value={e.description}
                      onChange={ev => (onModifierCarte
                        ? onModifierCarte(p, "description", ev.target.value)
                        : setEdited(prev => ({ ...prev, [p]: { ...prev[p], description: ev.target.value } })))}
                      rows={Math.min(Math.max(4, String(e.description ?? "").split(/\r\n|\r|\n/).length), 10)}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, resize:"vertical", boxSizing:"border-box", lineHeight:1.5, whiteSpace:"pre-wrap" }}
                    />
                    {String(e.description ?? "").split(/\r\n|\r|\n/).length > 1 && (
                      <div style={{ fontSize:11.5, color:T.mute2, marginTop:4, lineHeight:1.4 }}>
                        {t("generalDescriptionLines").replace("{n}", String(String(e.description ?? "").split(/\r\n|\r|\n/).length))}
                      </div>
                    )}
                  </div>

                  {/* ── L'ÉTAT DE CETTE PLATEFORME (2026-09-21) ────────────
                      Il n'était éditable QUE si le rayon le réclamait (bloc
                      CarteRayon, 20/09) : une carte dont le rayon ne pose pas
                      la question n'avait aucun moyen de corriger un état.
                      Affiché seulement quand la carte est DISSOCIÉE ou quand
                      il n'y a pas d'état général — sinon le bloc général suffit
                      et deux champs pour la même valeur se contrediraient. */}
                  {(!generales?.etat || (dissociees && !suitLaGenerale(dissociees, "etat", p))) && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:11, color:T.mute2, fontWeight:600 }}>{t("fieldConditionLabel")}</span>
                        {marqueurChamp("etat")}
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {(ETATS_GENERAUX.map(x => etatPourPlateforme(x.libelle, p)?.valeur).filter(Boolean)).map(libelle => {
                          const actif = String(e.platform_fields?.etat ?? "").trim() === libelle;
                          return (
                            <button
                              key={libelle}
                              type="button"
                              onClick={() => onModifierCarte?.(p, "etat", actif ? "" : libelle)}
                              style={{ padding:"6px 10px", borderRadius:999, fontFamily:"inherit", fontSize:12, cursor:"pointer",
                                       fontWeight: actif ? 700 : 600,
                                       border:`1px solid ${actif ? T.tealDeep : T.border}`,
                                       background: actif ? "#E8F5F3" : T.chip,
                                       color: actif ? T.tealDeep : T.mute2 }}
                            >
                              {libelle}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── LE RAYON, ET LES CHAMPS QUI EN DÉCOULENT (lot B) ──
                      Le rayon vient du pré-calcul (lot A), le choix de la
                      personne le recouvre, et les champs sont lus dans le
                      catalogue relevé sur les vrais formulaires — plus
                      l'icône, plus la liste en dur. La grille historique
                      reste EN DESSOUS : elle n'affiche plus que ce que la
                      personne a déjà ouvert (shownFieldsRef), donc rien
                      pour une carte fraîche. */}
                  <CarteRayon
                    platform={p}
                    lang={lang}
                    rayon={rayonsParPf[p] ?? null}
                    suggestions={suggestionsParPf[p] ?? []}
                    question={questionsRayonParPf[p] ?? null}
                    champs={e.platform_fields ?? {}}
                    configLocale={platformFieldsConfig[p] ?? []}
                    supabase={supabase}
                    onChoisirRayon={(choix) => onChoisirRayon?.(p, choix)}
                    regle={variante === "nouvelle" ? "nouvelle" : "classique"}
                    onChampChange={(cleNotre, valeur, cleCatalogue) => {
                      // ⛔ L'ÉTAT CORRIGÉ ICI DISSOCIE AUSSI LA CARTE (21/09).
                      //    Ce bloc est l'autre porte d'entrée de `etat` : sans
                      //    ce renvoi, la valeur générale aurait écrasé au
                      //    changement suivant une correction faite à la main —
                      //    exactement ce que la garde du lot interdit.
                      if (cleNotre === "etat" && onModifierCarte) {
                        onModifierCarte(p, "etat", valeur);
                        noteOverride?.(p, cleNotre);
                        return;
                      }
                      setEdited(prev => {
                        const pf = { ...(prev[p]?.platform_fields ?? {}) };
                        // Une clé qu'on connaît va dans son champ dédié ; les
                        // autres dans le canal d'aspects de la plateforme —
                        // exactement là où l'extension va les chercher.
                        if (cleNotre) {
                          pf[cleNotre] = valeur;
                          // Le lien avec la source partagée CASSE pour cette copie :
                          // sans ça, la propagation réécraserait la correction que
                          // la personne vient de faire (le geste que la grille
                          // historique faisait déjà, et qui devait la suivre ici).
                          noteOverride?.(p, cleNotre);
                        }
                        else {
                          const canal = CANAL_ASPECTS[p];
                          pf[canal] = { ...(pf[canal] && typeof pf[canal] === "object" ? pf[canal] : {}), [cleCatalogue]: valeur };
                        }
                        return { ...prev, [p]: { ...prev[p], platform_fields: pf } };
                      });
                    }}
                  />

                  {/* ── LIVRAISON LEBONCOIN (2026-09-20, demande de Louis) ──
                      Le format que Leboncoin retiendra (déduit, jamais
                      redemandé) et le choix des transporteurs — le seul des
                      deux que le vendeur soit seul à savoir. Replié : qui ne
                      l'ouvre pas ne tape rien. */}
                  {p === "leboncoin" && (
                    <CarteLivraisonLeboncoin
                      lang={lang}
                      champs={e.platform_fields ?? {}}
                      onChange={(cle, valeur) => setEdited(prev => {
                        const pf = { ...(prev[p]?.platform_fields ?? {}) };
                        if (valeur == null || valeur === "") delete pf[cle]; else pf[cle] = valeur;
                        return { ...prev, [p]: { ...prev[p], platform_fields: pf } };
                      })}
                    />
                  )}
                  {/* ── eBAY : la politique de livraison, par article ──────
                      Même demande de Louis, autre plateforme, autre modèle :
                      chez eBay c'est une « business policy », et elle porte
                      aussi l'envoi à l'étranger. Sans choix, l'annonce part
                      avec celle du compte — rien ne change pour personne.
                      ⛔ Seulement quand la voie API est réellement active :
                         par le formulaire, la politique ne s'applique pas. */}
                  {p === "ebay" && ebayVoieApiReelle && (
                    <CarteLivraisonEbay
                      lang={lang}
                      champs={e.platform_fields ?? {}}
                      onChange={(cle, valeur) => setEdited(prev => {
                        const pf = { ...(prev[p]?.platform_fields ?? {}) };
                        if (valeur == null || valeur === "") delete pf[cle]; else pf[cle] = valeur;
                        return { ...prev, [p]: { ...prev[p], platform_fields: pf } };
                      })}
                    />
                  )}

                  {/* ⛔ LA GRILLE HISTORIQUE N'EST PLUS AFFICHÉE (lot B, 20/09).
                      Elle listait 6 à 10 champs ÉCRITS EN DUR, filtrés par
                      l'ICÔNE de l'article et jamais par son rayon — d'où le
                      « default: true » qui laissait tout passer et ne montrait
                      jamais rien de propre au rayon. Sur la robe Camaïeu, ses
                      NEUF champs Leboncoin portaient déjà la bonne valeur :
                      neuf champs, zéro question, tout l'écran mangé.
                      Les champs viennent maintenant du RAYON — CarteRayon
                      ci-dessus, qui les lit dans le catalogue relevé sur les
                      vrais formulaires et les reclasse à chaque changement de
                      rayon.
                      ⛔ La configuration, elle, RESTE : elle complète les
                         rayons que le catalogue n'a pas encore relevés, et
                         elle est le plan de mergeFieldsWithLens — la retirer
                         JETTERAIT des valeurs à la génération (le piège
                         documenté quatre fois dans ce fichier). */}

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
// Forme comparable PARTAGÉE (utils/texteComparable — même corps que les 4
// content scripts et le serveur) + deux règles propres aux aspects : virgule
// décimale → point, préfixe « EU » rogné devant un chiffre. Depuis le 05/09,
// apostrophes typographiques, guillemets, tirets longs et espaces insécables
// des listes relevées ne font plus passer une valeur pour « hors liste ».
// normAspectVal et nearestAllowedValue : src/publication/moteur/listes.js
// (déménagées le 24/09 SANS changer un caractère — les commentaires qui
// expliquent la virgule des libellés et le préfixe EU y sont repris).

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
export function AspectValueInput({ value, allowedValues, strict = false, closedMax = 30, onChange, T, idBase, tailleTexte = 13 }) {
  const vals = Array.isArray(allowedValues) ? allowedValues : [];
  const n = vals.length;
  const [libre, setLibre] = useState(false);
  // `tailleTexte` (refonte 24/09) : 13 px partout comme avant ; le nouveau
  // stepper passe 16 — sous 16 px, Safari iOS zoome sur le champ.
  const base = { width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:tailleTexte, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
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

function StepPublish({ selected, setSelected, userId = null, platformSessions = null, platformListings, publishError, lang, demanderPrixAchat = false, inventoryFull = false, stockCount = null, stockLimit = FREE_STOCK_LIMIT, prixAchatSaisi, setPrixAchatSaisi, missingSharedFields = [], missingSharedFieldPlatforms = {}, sharedFields = {}, onSharedFieldChange, sharedChildAxes = null, vintedGenreBlocked = false, beebsGenreBlocked = false, ebayRequiredStatus = null, onEbayAspectChange = null, onEbaySharedFieldChange = null, genericRequiredStatus = null, onPlatformAspectChange = null, onPlatformDedicatedChange = null, pausedPlatforms = [], pausedReasons = {}, plateformesVerrouillees = [], motifsVerrouillage = {}, lbcPhotoCap = null, lbcAdresseManquante = null, ebayVoieApiReelle = false, descriptionMentions = null, descriptionVideVinted = false, onOuvrirCopie = null, jumeauxEnLigne = [], oplaVerdict = null, attentes = {}, onCompleter = null }) {
  const { t, tpl } = useTranslation(lang);
  const chips = [...selected].filter(p => platformListings?.platforms?.[p]);
  // Voie API eBay (07/09/2026, prouvée sur le job d9463010) : le relevé de
  // session de l'extension (profiles.extension_sessions) n'a plus de sens
  // pour eBay quand ce compte publie par nos serveurs — on ne dit jamais
  // « eBay : non connecté » à quelqu'un qui publie très bien par l'API. Les
  // comptes en voie extension (tous sauf Nico aujourd'hui) ne voient rien
  // changer : ebayVoieApiReelle vaut false, chipsSession === chips.
  //
  // 07/09 — `ebayVoieApiReelle`, jamais le drapeau seul : un compte basculé
  // dont la checklist vendeur est rouge repart en voie extension (le trigger
  // ne bascule pas), et tous les textes ci-dessous doivent alors dire
  // « extension », comme avant.
  const voies = repartirParVoie(chips, ebayVoieApiReelle);
  const chipsSession = voies.extension;
  const ebayParApi = voies.serveur.includes("ebay");
  // Mode dégradé (Phase B) : plateformes en pause (platform_health). Depuis le
  // 09/09 la sélection est PURGÉE des plateformes en pause (case grisée dans
  // StepPhotos, RPC platform_paused en dernier filet) : le bandeau se lit donc
  // sur toute plateforme en pause, sélectionnée ou non — ton neutre
  // « maintenance », jamais rouge d'erreur, texte = message_fr/message_en.
  // ⛔ PLUS DE COPIE LOCALE (2026-09-20, passe 2). Celle-ci oubliait `opla` :
  //    sur l'écran Publier, la pastille Opla s'affichait avec son logo, sa
  //    croix… et AUCUN nom. Vu en faisant le parcours. La table exportée en
  //    tête de fichier les a toutes les cinq — une seule liste, un seul nom.
  const pausedChips = pausedPlatforms.filter(p => PLATFORM_LABELS[p]);
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
  // ── CORRECTIF 07/09/2026 (capture Nico 19:00 : Type et Style « Pull » déjà
  // remplis DANS l'encart rouge, pastille verte « ✓ tout est complété » dans
  // un cadre rouge). La capture sticky se faisait AU RENDU, dès qu'un champ
  // manquait — donc AUSSI pour un champ que l'IA (resolve_aspects, écrit par
  // setEdited / setPlatformAspect directs, 2-5 s après le montage du step)
  // allait remplir sans que personne ne tape. Le champ restait collé dans le
  // rouge, rempli. Désormais un champ n'est collé QUE quand l'utilisateur y
  // ÉCRIT (toucher*, appelé dans le même événement que la valeur : React
  // rend les deux ensemble, l'input n'est jamais démonté sous les doigts —
  // le fix « une seule lettre » du 30/07 tient toujours). Un champ rempli par
  // l'IA, par un repli ou par la sync sort simplement du rouge : il reste ✓
  // dans les encarts bleus. Même règle pour les trois listes (partagés,
  // Vinted/LBC/Beebs, eBay) : le défaut était identique sur les quatre
  // plateformes.
  const [stickyShared, setStickyShared] = useState(() => new Set());
  const toucherShared = (key) => setStickyShared(prev => prev.has(key) ? prev : new Set([...prev, key]));
  const sharedFieldsToRender = [...new Set([...stickyShared, ...missingSharedFields])]
    .filter(k => sharedFieldCfg[k]);

  // ⚠️ Depuis le 2026-08-28 (un seul endroit de saisie), le sticky ne capture
  // plus que les aspects BLOQUANTS : ce sont eux — et eux seuls — qui entrent
  // dans l'encart rouge. Un aspect rempli (source "generic" comprise) reste un
  // simple chip ✓/⚠ des encarts bleus, désormais purement informatifs.
  const [stickyGeneric, setStickyGeneric] = useState(() => ({}));
  const toucherGeneric = (gp, key) => setStickyGeneric(prev => {
    const cur = prev[gp] ?? new Set();
    return cur.has(key) ? prev : { ...prev, [gp]: new Set([...cur, key]) };
  });
  // Un aspect appartient à l'encart ROUGE s'il bloque, ou s'il y est déjà
  // apparu (sticky : l'input ne se démonte jamais sous les doigts, fix
  // « une seule lettre » du 2026-07-30).
  const genericDansRouge = (gp, a) => aspectBloquant(a) || Boolean(stickyGeneric[gp]?.has(a.key));

  // Même motif, même parade pour les aspects eBay : la voie sharedKey
  // (onEbaySharedFieldChange — Marque, Taille, Couleur, Matière) écrit le
  // champ DÉDIÉ, l'aspect passe à "ok" SANS source:"generic", et la ligne
  // sortait du filtre → input démonté à la première frappe.
  const [stickyEbay, setStickyEbay] = useState(() => new Set());
  const toucherEbay = (name) => setStickyEbay(prev => prev.has(name) ? prev : new Set([...prev, name]));
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
      {/* Jumeau déjà en ligne (2026-09-21) : un AUTRE article du stock a déjà
          une annonce très ressemblante sur une plateforme cochée. On nomme
          l'annonce et on donne son lien — la personne tranche. ⛔ JAMAIS
          BLOQUANT : aucune plateforme décochée, aucun motif de CTA gris, et
          publier n'est pas plus difficile qu'avant. Deux exemplaires du même
          objet, c'est banal ; c'est elle qui sait. Le critère de
          rapprochement et ses limites vivent dans utils/jumeauxEnLigne.js. */}
      {/* ── OPLA : L'AUTORISATION SE DEMANDE AVANT DE PUBLIER (2026-09-23) ──
          Opla est cochée et le SERVEUR n'a pas de preuve d'accès (verdict de
          utils/oplaAcces, le même que les Réglages et l'écran de suivi — 24/09).
          On le dit ICI, avec LE bouton, avant le clic : sur un refus connu
          (« Opla attend ton autorisation ») comme sans preuve du tout (le
          bouton reste — garde-fou de Nico). La publication reste possible —
          l'annonce Opla attend l'autorisation et repart seule à l'octroi. */}
      {selected.has("opla") && carteAccesOpla(oplaVerdict, lang) && (
        <div style={{ padding:"11px 14px", background:"#F0FDFB", border:"1px solid rgba(47,158,144,0.28)", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:T.ink }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>
            {carteAccesOpla(oplaVerdict, lang).titre}
          </div>
          <div style={{ marginBottom:8, color:T.mute }}>
            {carteAccesOpla(oplaVerdict, lang).texte}
          </div>
          <BoutonMeConnecter userId={userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={lang} variante="bouton" />
        </div>
      )}
      {jumeauxEnLigne.length > 0 && (
        <div style={{ padding:"11px 14px", background:"#FDF6E3", border:"1px solid #EBD9A8", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#8A6100" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en"
              ? `A similar item is already online on ${jumeauxEnLigne.map(j => PLATFORM_LABELS[j.platform] ?? j.platform).join(", ")}`
              : `Un article qui ressemble est déjà en ligne sur ${jumeauxEnLigne.map(j => PLATFORM_LABELS[j.platform] ?? j.platform).join(", ")}`}
          </div>
          {lang === "en"
            ? "If it is the same object, publishing here puts a second copy on sale — marketplaces treat that as a duplicate. If you really own two of them, ignore this: nothing is blocked."
            : "Si c'est bien le même objet, publier ici en mettra un deuxième en vente — les plateformes comptent ça comme un doublon. Si tu en as réellement deux exemplaires, ignore ce message : rien n'est bloqué."}
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:6 }}>
            {jumeauxEnLigne.map(j => (
              <div key={`${j.platform}:${j.url ?? j.titre}`} style={{ fontSize:12.5 }}>
                <strong>{PLATFORM_LABELS[j.platform] ?? j.platform}</strong>{" · "}
                {j.titre}{j.prix != null ? ` — ${j.prix} €` : ""}
                {j.url && (
                  <>{" "}<a href={j.url} target="_blank" rel="noopener noreferrer"
                    style={{ color:"#8A6100", fontWeight:700, whiteSpace:"nowrap" }}>
                    {lang === "en" ? "see it ↗" : "voir l'annonce ↗"}
                  </a></>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {descriptionMentions && (
        <div style={{ padding:"11px 14px", background:"#EEF4FB", border:"1px solid #C6D9EE", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#1F4A73" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en" ? "Your description mentions another platform" : "Ta description parle d'une autre plateforme"}
          </div>
          {/* ⛔ INFORMATIF, JAMAIS BLOQUANT (règle posée le 07/09) : aucun
              needs_user, aucune garde sur le bouton Publier, et sans réponse la
              description part TELLE QUELLE. On ne réécrit rien — c'est la
              vendeuse qui décide si « voir mon dressing » a sa place sur
              Leboncoin. Affiché une seule fois par article. */}
          {descriptionMentions.message}
          <div style={{ marginTop:6, opacity:0.85 }}>
            {lang === "en"
              ? "Nothing is blocked: it will be published as is unless you edit it at the previous step."
              : "Rien n'est bloqué : elle sera publiée telle quelle si tu n'y touches pas — tu peux la modifier à l'étape précédente."}
          </div>
        </div>
      )}

      {platformSessions && chipsSession.some(p => platformSessions[p] === false) && (
        <div style={{ padding:"11px 14px", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:14, marginBottom:12, fontSize:13, lineHeight:1.6, color:"#8C2F28" }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {lang === "en" ? "Not signed in on some platforms" : "Connexion manquante sur certaines plateformes"}
          </div>
          {/* ── LE BOUTON, PAS UN LIEN SOULIGNÉ (2026-09-22) ──────────────────
              C'était un `<a>` vers PLATFORM_LOGIN_URLS : juste, mais discret, et
              surtout FAUX SUR TÉLÉPHONE — il ouvrait la plateforme sur le
              mobile, alors que c'est l'ORDINATEUR qui doit se connecter.
              BoutonMeConnecter tranche : lien direct sur le web, ouverture sur
              le PC via l'extension sur mobile. Même bouton, même logo, partout.
              ⛔ LA GARDE NE BOUGE PAS : `=== false` seulement. `sessionsDepuisVerite`
                 (24/09 : la vérité SERVEUR, celle des Réglages) ne pose la clé que
                 sur un état tranché — « jamais vérifié » est ABSENT, donc
                 n'affiche rien. Et rien n'est bloqué : le texte le dit, le
                 bouton Publier reste actif. Prévenir, jamais interdire. */}
          {chipsSession.filter(p => platformSessions[p] === false).map(p => (
            <div key={p} style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, flexWrap:"wrap" }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:"#C0392B", flexShrink:0 }} />
              <span style={{ flex:1, minWidth:150 }}>
                {lang === "en"
                  ? `${PLATFORM_LABELS[p] ?? p}: not signed in — the listing will wait until you sign in.`
                  : `${PLATFORM_LABELS[p] ?? p} : non connecté — l'annonce attendra que tu te connectes.`}
              </span>
              <BoutonMeConnecter
                userId={userId} platform={p} motif={MOTIFS.CONNEXION}
                lang={lang} variante="bouton"
              />
            </div>
          ))}
        </div>
      )}
      {platformSessions && chipsSession.some(p => platformSessions[p] === true) && !chipsSession.some(p => platformSessions[p] === false) && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {chipsSession.filter(p => platformSessions[p] === true).map(p => (
            <span key={p} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:999, background:"#E7F3F0", border:"1px solid #BFDCD5", fontSize:12, fontWeight:600, color:"#1B6E62" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:"#2F9E90" }} />
              {(PLATFORM_LABELS[p] ?? p)} {lang === "en" ? "signed in" : "connecté"}
            </span>
          ))}
        </div>
      )}

      {/* eBay par la voie API (07/09/2026) : la vérité de ce parcours, dite
          AVANT le clic — la publication part de nos serveurs, ni Chrome, ni
          extension, ni ordinateur allumé. Ton neutre, informatif. Invisible
          en voie extension (ebayVoieApi false). */}
      {ebayParApi && (
        <div style={{ padding:"10px 14px", background:"#EFF3F8", border:"1px solid #C7D6E5", borderRadius:14, marginBottom:12, fontSize:12.5, lineHeight:1.5, color:"#334155" }}>
          {lang === "en"
            ? "eBay: published from our servers with your linked eBay account — no Chrome, no extension, your computer doesn't need to be on."
            : "eBay : publié depuis nos serveurs avec ton compte eBay relié — sans Chrome, sans extension, ton ordinateur n'a pas besoin d'être allumé."}
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
          canToggleStock = !invId && !alreadyInStock garde ce contrat.
          ⚠️ 2026-09-15 : l'AFFICHAGE de la question « combien l'as-tu payé ? »
          ne suit plus canToggleStock (faux dès l'ouverture, depuis que la ligne
          naît au débit) mais demanderPrixAchat — un article né de CE parcours
          dont le prix d'achat n'est pas encore connu. */}

      {demanderPrixAchat && (
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

      {descriptionVideVinted && (
        // ── DESCRIPTION VINTED VIDE (2026-09-12, dossier Anaïs) ──────────────
        // Pas un champ de l'encart rouge (ce n'est ni un champ partagé ni un
        // aspect) mais un TEXTE de la copie : on nomme le champ, l'endroit,
        // et on y mène. Jamais de description inventée ici.
        <div style={{ padding:14, background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, marginBottom:12, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:13, color:"#B91C1C", fontWeight:700 }}>
              {lang === "en" ? "Vinted requires a description" : "Vinted exige une description"}
            </div>
            <div style={{ fontSize:12, color:"#7F1D1D", lineHeight:1.45, marginTop:3 }}>
              {lang === "en"
                ? "Your Vinted copy has none: Vinted would refuse the listing. Write it in your own words in the Vinted card."
                : "Ta copie Vinted n'en a pas : Vinted refuserait l'annonce. Écris-la avec tes mots dans la carte Vinted."}
            </div>
          </div>
          <button
            onClick={() => onOuvrirCopie?.("vinted")}
            style={{ flex:"0 0 auto", padding:"9px 14px", borderRadius:10, border:"none", background:"#B91C1C", color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
          >
            {lang === "en" ? "Open the Vinted card" : "Ouvrir la carte Vinted"}
          </button>
        </div>
      )}
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
        // Plus rien ne bloque (redRestants = 0, il ne reste que ce que
        // l'utilisateur a saisi) → l'encart passe en VERT, titre compris :
        // jamais un cadre rouge « il manque des infos » avec une pastille
        // verte dedans (capture Nico 07/09).
        <div style={{ padding:14, background: redRestants > 0 ? "#FEF2F2" : "#ECFDF5", border:`1px solid ${redRestants > 0 ? "#FECACA" : "#A7F3D0"}`, borderRadius:14, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:13, color: redRestants > 0 ? "#B91C1C" : "#047857", fontWeight:700 }}>
              {redRestants > 0
                ? t("stepPublishSharedMissingTitle")
                : (lang === "en" ? "Everything is filled in — you can publish" : "Tout est complété — tu peux publier")}
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
          <div style={{ fontSize:12, color: redRestants > 0 ? "#991B1B" : "#065F46", lineHeight:1.45, margin:"4px 0 12px" }}>
            {redRestants > 0
              ? (lang === "en"
                  ? "Everything is filled in here — the platform cards above only recap what each one will receive."
                  : "Tout se complète ici — les encarts par plateforme au-dessus récapitulent seulement ce que chacune recevra.")
              : (lang === "en"
                  ? "What you typed stays below — you can still adjust it."
                  : "Ce que tu as saisi reste ci-dessous — tu peux encore l'ajuster.")}
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
                      onChange={ev => { toucherShared(key); onSharedFieldChange?.(key, ev.target.value); }}
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
                      onChange={ev => { toucherShared(key); onSharedFieldChange?.(key, ev.target.value); }}
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
                      onClick={() => { toucherShared("marque"); onSharedFieldChange?.("marque", NO_BRAND_VALUE); }}
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
                      onClick={() => {
                        toucherGeneric(gp, a.key);
                        if (a.dedicatedTarget && onPlatformDedicatedChange) onPlatformDedicatedChange(gp, a.dedicatedTarget, seule);
                        else onPlatformAspectChange(gp, a.key, seule);
                      }}
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
                    onChange={v => {
                      toucherGeneric(gp, a.key);
                      if (a.dedicatedTarget && onPlatformDedicatedChange) onPlatformDedicatedChange(gp, a.dedicatedTarget, v);
                      else onPlatformAspectChange(gp, a.key, v);
                    }}
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
                  onChange={v => {
                    toucherEbay(a.name);
                    if (a.sharedKey && onEbaySharedFieldChange) onEbaySharedFieldChange(a.sharedKey, v);
                    else onEbayAspectChange(a.name, v);
                  }}
                  T={T}
                  idBase={`ebay-${aspectSlug(a.name)}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ DÉFAUT Nº5 : ON PEUT ENFIN RECOCHER UNE PLATEFORME ICI ══════════
          Avant, cette rangée ne montrait QUE les plateformes cochées, avec une
          croix pour les retirer. Pour en remettre une, il fallait remonter
          DEUX étapes — jusqu'à l'écran des photos, dont le seul bouton est
          « Générer les annonces », c'est-à-dire une génération PAYANTE. Un
          décochage était donc irréversible en pratique.
          Maintenant la rangée montre TOUTES les plateformes qui ont une
          annonce écrite : cochée = pleine avec sa croix, décochée = creuse,
          on la retouche d'un geste. Aucun tap en plus pour qui ne change
          rien — c'est la même rangée, au même endroit.
          ⛔ CE QUI EST VERROUILLÉ Y FIGURE MAINTENANT, ET DIT POURQUOI
             (2026-09-20, passe 2). Avant, une plateforme déjà en ligne ou
             occupée par une publication en cours DISPARAISSAIT de la rangée,
             sans un mot. On la cherche, on ne la trouve pas, on recule dans le
             parcours pour rien. Elle est désormais là, éteinte, avec sa
             raison en une ligne sous la rangée. On ne la rend PAS cochable :
             le lot ne peut vraiment pas la reprendre. */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
        {[...new Set([...chips, ...Object.keys(platformListings?.platforms ?? {})])]
          .filter(p => !pausedPlatforms.includes(p))
          .map(p => {
            const verrouillee = plateformesVerrouillees.includes(p);
            const cochee = !verrouillee && chips.includes(p);
            return (
              <button
                key={p}
                type="button"
                disabled={verrouillee}
                title={verrouillee ? (motifsVerrouillage?.[p] ?? undefined) : undefined}
                onClick={verrouillee ? undefined : () => setSelected(prev => {
                  const s = new Set(prev);
                  if (s.has(p)) s.delete(p); else s.add(p);
                  return s;
                })}
                aria-pressed={verrouillee ? undefined : cochee}
                style={{
                  display:"inline-flex", alignItems:"center", gap:8,
                  background: cochee ? T.chip : "transparent",
                  border:`1px solid ${T.border}`,
                  borderRadius:999, padding:"6px 10px 6px 6px",
                  cursor: verrouillee ? "default" : "pointer", fontFamily:"inherit",
                  opacity: verrouillee ? 0.4 : (cochee ? 1 : 0.5),
                }}
              >
                <PlatformLogo platform={p} size={24} />
                <span style={{ fontSize:13.5, fontWeight:600, color:T.ink }}>{PLATFORM_LABELS[p] ?? p}</span>
                {verrouillee
                  ? <Lock size={12} color={T.mute} />
                  : cochee
                    ? <X size={13} color={T.mute} />
                    : <Plus size={13} color={T.mute} />}
              </button>
            );
          })}
      </div>
      {/* LA RAISON, À CÔTÉ DE CE QU'ELLE EXPLIQUE. Une ligne par plateforme
          éteinte — pas un bandeau, pas une modale : la phrase se lit là où
          l'on vient de chercher la case à cocher. */}
      {[...new Set([...chips, ...Object.keys(platformListings?.platforms ?? {})])]
        .filter(p => plateformesVerrouillees.includes(p) && !pausedPlatforms.includes(p) && motifsVerrouillage?.[p])
        .map(p => {
          // ── LE GESTE QUI DÉBLOQUE, À CÔTÉ DE L'ATTENTE (2026-09-23) ──────
          // Une attente n'est ni « retire » ni « décoche » : un champ se
          // complète (mini-éditeur du job, le même que la carte), une
          // autorisation ou une connexion s'accorde (le même bouton que la
          // carte et les Réglages). Le geste fait, le dépôt repart seul.
          const a = attentes?.[p];
          const motifBouton = a?.kind === "attente_autorisation" ? MOTIFS.AUTORISER_OPLA
            : a?.kind === "attente_connexion" ? (a.motif === "reauth_ebay" ? MOTIFS.REAUTH_EBAY : MOTIFS.CONNEXION)
            : null;
          return (
            <div key={`mv:${p}`} style={{ padding:"0 4px 6px" }}>
              <div style={{ fontSize:11.5, lineHeight:1.5, color:T.mute }}>
                {PLATFORM_LABELS[p] ?? p} — {motifsVerrouillage[p]}
              </div>
              {a?.bloque && motifBouton && userId && (
                <div style={{ marginTop:6 }}>
                  <BoutonMeConnecter userId={userId} platform={p} motif={motifBouton} lang={lang} variante="bouton" />
                </div>
              )}
              {a?.bloque && a.kind === "attente_champ" && onCompleter && (
                <button
                  type="button"
                  onClick={() => onCompleter(a.job)}
                  style={{ marginTop:6, minHeight:40, padding:"0 14px", borderRadius:20, border:`1px solid ${T.border}`, background:T.card ?? "#fff", color:T.ink, fontFamily:"inherit", fontSize:13.5, fontWeight:600, cursor:"pointer" }}
                >
                  {lang === "en" ? `Complete “${a.champ}”` : `Compléter « ${a.champ} »`}
                </button>
              )}
            </div>
          );
        })}
      {/* Un dépôt REFUSÉ n'est pas un verrou : la plateforme reste cochable,
          et on le dit en une ligne — la personne sait pourquoi elle republie. */}
      {[...new Set([...chips, ...Object.keys(platformListings?.platforms ?? {})])]
        .filter(p => attentes?.[p]?.kind === "refusee" && !plateformesVerrouillees.includes(p) && !pausedPlatforms.includes(p))
        .map(p => (
          <div key={`rf:${p}`} style={{ fontSize:11.5, lineHeight:1.5, color:T.mute, padding:"0 4px 4px" }}>
            {PLATFORM_LABELS[p] ?? p} — {phraseEtat(p, attentes[p], lang)}
          </div>
        ))}
      <div style={{ height:14 }} />

      {/* ⛔ TROIS MESSAGES DISAIENT LA MÊME CHOSE (lot B2). « Aucune
          plateforme sélectionnée. » ici, « Aucune plateforme prête à publier »
          dans les motifs du bouton, et le libellé du bouton lui-même. Il en
          reste UN : celui du bouton, « Choisis au moins une plateforme »,
          parce que c est le seul qui dise le GESTE et qu il est à l endroit
          où l on regarde. La rangée juste au-dessus montre déjà, en creux,
          les plateformes qu on peut recocher. */}

      {/* ── Comment ça part : réglé sur la VOIE RÉELLE (07/09/2026) ──────────
          Trois cas, et un seul texte à l'écran :
          · TOUT en voie serveur → nos serveurs publient, ordinateur éteint
            compris. La ligne « si ton PC est éteint, tes annonces restent en
            attente » DISPARAÎT : elle disait l'exact contraire de la vérité
            (et de l'argument de vente) ;
          · lot MIXTE → le texte extension reste, mais il NOMME les
            plateformes qu'il concerne, et dit qu'eBay, lui, part de nos
            serveurs. Plus de message global sur un lot qui n'est pas global ;
          · TOUT en voie extension (presque tout le parc) → les deux textes
            d'origine, mot pour mot, inchangés. */}
      {chips.length > 0 && (
        <>
          <div style={{ borderRadius:18, padding:16, display:"flex", gap:12, marginBottom:16, background:"#E7F3F0", border:"1px solid #BFE0D9" }}>
            <Clock size={18} color={T.tealDeep} style={{ flexShrink:0, marginTop:1 }} />
            <p style={{ margin:0, fontSize:12.5, lineHeight:1.6, color:T.tealDeep }}>
              {voies.toutServeur
                ? t("stepPublishServeurText")
                : voies.mixte
                ? tpl("stepPublishMixteText", {
                    extension: voies.extension.map(p => PLATFORM_LABELS[p] ?? p).join(", "),
                    serveur: voies.serveur.map(p => PLATFORM_LABELS[p] ?? p).join(", "),
                  })
                : t("stepPublishCronText1")}
            </p>
          </div>
          {/* Ordinateur éteint : vrai seulement pour les plateformes en voie
              extension. Muet quand tout part de nos serveurs. */}
          {!voies.toutServeur && (
            <div style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"0 4px" }}>
              <ImageOff size={15} color={T.mute} style={{ flexShrink:0, marginTop:1 }} />
              <p style={{ margin:0, fontSize:11.5, lineHeight:1.6, color:T.mute }}>
                {voies.mixte
                  ? tpl("stepPublishCronText2Partiel", { extension: voies.extension.map(p => PLATFORM_LABELS[p] ?? p).join(", ") })
                  : t("stepPublishCronText2")}
              </p>
            </div>
          )}
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
    // `fiche_serveur` est un marqueur de CAPACITÉ du client, pas une entrée de
    // génération : il ne change pas un caractère du texte produit. Le laisser
    // entrer dans la signature ferait rater le cache de tous ceux qui avaient
    // une génération payée en session au moment du déploiement — donc une
    // génération de trop, facturée, pour un drapeau. Retiré ICI et ICI
    // SEULEMENT : le corps réellement envoyé le porte (2026-09-15).
    const { fiche_serveur: _capacite, ...corpsSigne } = body ?? {};
    return stableStringify({
      u: userId ?? null,
      body: { ...corpsSigne, platforms: [...(body?.platforms ?? [])].sort() },
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

// ── LA FICHE EN BASE (2026-09-15, décision Nico) ─────────────────────────────
// sessionStorage reste ce qu'il a toujours été : un cache de confort qui fait
// survivre le stepper au déchargement d'onglet de Chrome. Il n'est plus la
// SEULE copie de quoi que ce soit — il mourait à la fermeture de l'onglet, et
// avec lui le texte qu'on venait de facturer (654 générations perdues sur
// 1 697, mesure du 15/09). La copie de référence vit désormais dans
// fiches_annonce, écrite au débit par le serveur puis tenue à jour ici.
//
// UNE SEULE FORME. La charge écrite en base est EXACTEMENT celle du brouillon
// sessionStorage — même sérialiseur (chargeFiche ci-dessous), donc aucune
// divergence possible au premier correctif appliqué d'un seul côté.
// `invKey`, `invId`, `articleSourceMorte` et `photosAnalysees` restent
// LOCAUX : ce sont des états de session (quel article ce composant-ci suit),
// pas de la fiche.
function chargeFiche(etat) {
  const {
    step, prixAchatSaisi, notes, photos, price, customPriced, photoAnalysis,
    modeleConfirme, photoOption, background, platformListings, processedPhotos,
    edited, sharedFields, sharedOverrides, selected, dissociees, generales,
  } = etat;
  return {
    v: 1,
    step, prixAchatSaisi, notes, photos, price,
    customPriced: [...customPriced],
    photoAnalysis, modeleConfirme, photoOption, background,
    platformListings, processedPhotos, edited, sharedFields,
    sharedOverrides: Object.fromEntries(Object.entries(sharedOverrides).map(([k, v]) => [k, [...v]])),
    dissociees: serialiserDissociations(dissociees),
    generales,
    selected: [...selected],
  };
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
  // profiles.plateformes_visibles, lu par App.jsx. AFFICHAGE SEULEMENT.
  plateformesVisibles = [],
  // Opla OUVERTE pour ce compte (interrupteur serveur + borne de build,
  // App.jsx) : la case devient cliquable et la copie Opla se dérive.
  plateformesOuvertes = [], oplaMotifGrise = 'fermee', oplaExtensionMin = null,
  inventaireId, userId, initialPhotos: initialPhotosProp = [], initialListing: initialListingProp = null, supabase, lang, onClose,
  // « Compléter » un dépôt en attente d'un champ depuis l'écran Publier
  // (2026-09-23) : l'hôte ferme le stepper et ouvre le mini-éditeur du job.
  onCompleter = null,
  // eBay par API (lot 2b, 06/09) : true = ce compte publie eBay par le worker
  // serveur (profiles.ebay_voie_api, posé par Nico). Un article SANS PHOTO ne
  // part alors jamais en job : arrêté ici, cause nommée.
  // Compte eBay vu par l'hôte (App.jsx), en UN objet :
  //   { voieApi, etat, lu, voieApiReelle, rafraichir }
  // · voieApi        = profiles.ebay_voie_api, le drapeau posé par Nico ;
  // · voieApiReelle  = la VOIE, miroir du trigger cross_post_jobs_voie_ebay
  //                   (drapeau ET compte relié/politiques/checklist verte).
  // Tout ce qui parle d'extension à l'écran lit voieApiReelle, jamais le
  // drapeau : un compte basculé mais pas fini repart en voie extension.
  ebayCompte = null,
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
  // ── LA PEAU (refonte du 24/09/2026) ─────────────────────────────────────
  // "classique" (défaut) : les quatre écrans historiques, à l'identique.
  // "nouvelle" : les écrans de src/publication/ (U1 → U4), branchés sur CE
  // moteur — même état, mêmes effets, mêmes gestes, mêmes RPC. L'hôte
  // choisit par l'interrupteur (src/publication/interrupteur.js).
  variante = "classique",
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
  // Carte de copie à ouvrir en revenant au step Génération (garde
  // « description Vinted vide », 2026-09-12) : consommée par StepGeneration.
  const [carteAOuvrir, setCarteAOuvrir] = useState(null);
  const ouvrirCopie = (p) => { setCarteAOuvrir(p); setStep(2); };
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
  // ── CONNEXION ET AUTORISATION : LE SERVEUR TRANCHE (2026-09-24) ───────────
  // AVANT : ce bloc relisait `profiles.extension_sessions` — la sonde du
  // DERNIER poste qui écrit — et décidait SEUL : « Session fermée » sur un
  // `false` de sonde, « À autoriser dans l'extension » dès qu'Opla n'y
  // figurait pas. Cas Louis (24/09, 0.6.63, deux profils Chrome) : Opla
  // « À autoriser » + « Autoriser Opla » à l'étape 1, pendant que les Réglages
  // disaient « Connectée » et que sa publication Opla partait. Le 23/09,
  // Marine lisait eBay « Connectée » sans compte eBay, sur la même sonde.
  // DEPUIS : les deux réponses sont celles des Réglages et de l'écran de suivi,
  // lues au serveur —
  //   · la CONNEXION de chaque plateforme : plateformes_verite (le fait le plus
  //     récent et le plus précis gagne : relevé > dépôt > sonde), réduite à
  //     true / false / absent par sessionsDepuisVerite ;
  //   · l'AUTORISATION Opla : useOplaAcces (règle unique,
  //     supabase/functions/_shared/acces-opla.js).
  // Lues à TOUTES les étapes : un brouillon repris ouvre directement sur « Où
  // publier ? ». Relues toutes les 60 s et au retour d'onglet. Elles disent
  // l'état et le geste, elles ne bloquent jamais une publication.
  const veriteStepper = useVeritePlateformes({ userId, actif: Boolean(userId) });
  const platformSessions = useMemo(() => sessionsDepuisVerite(veriteStepper.verite), [veriteStepper.verite]);
  const { verdict: oplaVerdict, detail: oplaAccesDetail } = useOplaAcces({ userId, actif: Boolean(userId) });

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
  // Ce que la LIGNE dit du prix d'achat — { valeur, inconnu } — lu à l'init.
  // null = pas encore lu (ou pas de ligne).
  const [prixAchatBase, setPrixAchatBase] = useState(null);
  // ── LE PRIX D'ACHAT RESTE DEMANDÉ SUR LE PARCOURS LENS (2026-09-15) ───────
  // Il l'est depuis le 29/07, et la règle était portée par canToggleStock —
  // « cette publication va créer la ligne inventaire ». Depuis que la ligne
  // naît au DÉBIT, ce test est faux dès l'ouverture du stepper : la question ne
  // serait plus jamais posée, et des articles neufs entreraient au stock sans
  // qu'on sache ce qu'ils ont coûté (VIDE ≠ ZÉRO, règle du 03/08 : pas de marge
  // calculée sur du vent). On la rattache donc à ce qu'elle a toujours voulu
  // dire : un article NÉ de ce parcours, dont personne n'a encore dit le prix.
  // ⚠️ JAMAIS sur le parcours Stock (createStockItem absent) : un article
  // importé du dressing a légitimement un prix d'achat inconnu — lui réclamer
  // un montant serait un mur tout neuf sur un chemin qui marche.
  // ⚠️ Zéro reste une réponse valide (« c'était gratuit ») : seul un champ VIDE
  // bloque, exactement comme avant.
  const parcoursCreation = typeof createStockItem === "function";
  const prixAchatARenseigner = parcoursCreation
    && (prixAchatBase == null || (prixAchatBase.valeur == null && !prixAchatBase.inconnu));

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
  // 2026-09-04 : passe par quotaStockAtteint — stock illimité pour tous, cet
  // écran ne remplace donc plus jamais la publication par « Passer au niveau
  // supérieur ». Le comptage et la lecture de config restent en place tels
  // quels : seul le VERDICT change, et il se rétablit d'une ligne
  // (STOCK_ILLIMITE, utils/stockLimit.js).
  const inventoryFull =
    !isPremium && !isPro && canToggleStock && stockCount != null
    && quotaStockAtteint(stockCount, stockLimitCfg);

  // Mode dégradé (Phase B) : plateformes en pause (platform_health) → case
  // grisée dans StepPhotos + bandeau dans StepPublish. Le texte est
  // platform_health.message_fr / message_en (2026-09-09 ; `reason` est
  // redevenu INTERNE et n'est plus lu), écrit en base, incident par incident,
  // sans redéploiement ; sinon repli sur le texte générique i18n. Lecture
  // TOLÉRANTE (rafraîchie à l'affichage puis toutes les 60 s) : un échec de
  // lecture ne bloque jamais rien — drapeau illisible ou absent = aucune
  // plateforme grisée, comportement normal (fail-safe non négociable).
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  const [pausedReasons, setPausedReasons] = useState({});
  useEffect(() => {
    let alive = true;
    const lire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        // PostgREST est tout-ou-rien : une colonne absente ferait échouer la
        // lecture → catch → rien de grisé, rien d'affiché (fail-safe voulu).
        const { data } = await supabase.from("platform_health").select("platform, message_fr, message_en").eq("paused", true);
        if (alive) {
          setPausedPlatforms((data ?? []).map(h => h.platform));
          setPausedReasons(Object.fromEntries((data ?? []).map(h => [h.platform, (lang === "en" ? (h.message_en || h.message_fr) : h.message_fr) || null])));
        }
      } catch { /* mode dégradé indisponible : pas de bandeau, jamais bloquant */ }
    };
    lire();
    const timer = setInterval(lire, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [supabase, lang]);

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
  // ── DISSOCIATIONS (2026-09-21) ────────────────────────────────────────────
  // Même rôle que customPriced, un cran plus large : par CHAMP (titre,
  // description, état) et par plateforme. Une carte dissociée n'est plus
  // jamais écrasée par la valeur générale — c'est la garde du lot, et elle
  // survit au brouillon (sinon un rechargement ramènerait la valeur générale
  // sur une carte que la personne avait mise à part).
  const [dissociees, setDissociees] = useState(() => lireDissociations(draft?.dissociees));
  // ── LES TROIS VALEURS GÉNÉRALES (2026-09-21) ──────────────────────────────
  // État EXPLICITE, pas déduit des copies. Le déduire semblait plus propre —
  // une seule source de vérité — mais la mise en conformité peut rendre deux
  // copies littéralement différentes (Vinted réduit les suites de symboles,
  // eBay coupe à 80) : le champ général se serait vidé sous les doigts au
  // premier texte qui diverge après conformité. Il est donc gardé à part, et
  // ENSEMENCÉ une fois depuis les copies (effet ci-dessous).
  const [generales, setGenerales] = useState(() => draft?.generales ?? { titre: "", description: "", etat: "" });
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
  // ── inventaire.attributs (2026-09-06, chemins d'aspects) ──────────────────
  // Un seul endroit par article, une clé par champ = { v, source, at }, posé
  // par la sync du dressing (taille, état, marque de la liste), le clic
  // Publier (couleur, catégorie du détail Vinted), le Lens (ci-dessous) ou
  // une saisie. Lu ICI pour nourrir canonical_fields quand initialListing ne
  // porte pas le champ — un article importé de Vinted arrive alors avec sa
  // taille, son état et sa couleur au lieu de les faire deviner au texte.
  const [attributsBase, setAttributsBase] = useState(null);
  // ── Ligne inventaire pour les règles du catalogue Beebs (2026-09-11) ──────
  // Lue à part, hors du chemin des brouillons : état et marque RELEVÉS sur
  // Vinted (attributs, avec leur source) et vinted_catalog_id. C'est la SEULE
  // matière du verdict Beebs (_shared/beebs-interdits.js) — ni le titre, ni la
  // marque du formulaire (pré-remplie par l'IA). Pas encore en stock (parcours
  // Lens) ou requête refusée = aucun blocage, c'est voulu : doute = on laisse
  // passer, et le serveur tend le même filet.
  const [articleBase, setArticleBase] = useState(null);
  useEffect(() => {
    if (!inventaireId) { setArticleBase(null); return undefined; }
    let vivant = true;
    supabase
      .from("inventaire")
      .select("vinted_catalog_id,attributs")
      .eq("id", inventaireId)
      .maybeSingle()
      .then(({ data }) => { if (vivant && data) setArticleBase(data); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [inventaireId, supabase]);
  // ── LA CATÉGORIE D'ORIGINE (2026-09-19) ───────────────────────────────────
  // Depuis le 17/09, le relevé écrit dans annonces_plateforme.capture la
  // catégorie de chaque annonce DÉJÀ EN LIGNE — celle que la personne a
  // choisie elle-même sur l'autre plateforme. Personne ne la lisait : 850
  // annonces, 478 articles, en deux jours, et la publication continuait de
  // deviner la famille et le genre à partir du titre.
  // On la lit ICI, à côté de la ligne inventaire, et on la résout contre NOS
  // arbres relevés (feuilleDepuisOrigine) pour obtenir un CHEMIN réel.
  // ⛔ Elle ne CHOISIT aucune catégorie de destination — la traduction
  //    libellé → libellé ne marche pas (mesuré : 40 % vers Vinted, 1 à 13 %
  //    ailleurs). Elle renseigne deux FILTRES que la cascade du mot utilise
  //    déjà : la famille et le genre.
  // ⛔ Échec de lecture, aucune annonce, catégorie introuvable dans nos
  //    arbres → null, et tout se passe exactement comme avant.
  const [origineCat, setOrigineCat] = useState(null);
  // ── LES VERSIONS DU TEXTE, PAR PLATEFORME (2026-09-23, chantier 3) ────────
  // Les textes de chaque annonce en ligne existent déjà (annonces_plateforme :
  // `titre` de la liste, `capture.description`) ; aucun écran ne permettait
  // de choisir. La fiche importée de Louis portait une capture Beebs plus
  // vieille que ce qui est en ligne. On lit ici, une fois, les versions de
  // cet article — plateforme, texte, date — et le bloc général les propose
  // pour le titre et pour la description, séparément.
  const [versionsTexte, setVersionsTexte] = useState([]);
  useEffect(() => {
    if (!inventaireId) { setVersionsTexte([]); return undefined; }
    let vivant = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("annonces_plateforme")
          .select("platform, titre, capture, capture_le, vu_le, statut_plateforme, url")
          .eq("inventaire_id", inventaireId)
          .is("disparu_le", null)
          .order("vu_le", { ascending: false })
          .limit(8);
        if (!vivant || !Array.isArray(data)) return;
        setVersionsTexte(data.map(l => ({
          platform: l.platform,
          titre: String(l.titre ?? "").trim() || null,
          description: String(l.capture?.description ?? "").trim() || null,
          date: l.capture_le ?? l.vu_le ?? null,
          enLigne: l.statut_plateforme === "en_ligne",
          url: l.url ?? null,
        })).filter(v => v.titre || v.description));
      } catch { /* les versions sont un BONUS : leur absence ne bloque rien */ }
    })();
    return () => { vivant = false; };
  }, [inventaireId, supabase]);
  useEffect(() => {
    if (!inventaireId) { setOrigineCat(null); return undefined; }
    let vivant = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("annonces_plateforme")
          .select("platform, capture, vu_le")
          .eq("inventaire_id", inventaireId)
          .is("disparu_le", null)
          .order("vu_le", { ascending: false })
          .limit(8);
        if (!vivant || !Array.isArray(data) || !data.length) return;
        for (const ligne of data) {
          const brut = ligne?.capture?.categorie;
          if (!brut || !ligne?.platform) continue;
          const feuille = await feuilleDepuisOrigine(ligne.platform, brut);
          if (!vivant) return;
          if (feuille) {
            setOrigineCat({
              platform: ligne.platform,
              chemin: feuille.chemin,
              id: feuille.id ?? null,
              genre: genreDepuisOrigine(brut),
              brut: String(brut),
            });
            return;
          }
        }
      } catch { /* l'origine est un BONUS : son absence ne bloque rien */ }
    })();
    return () => { vivant = false; };
  }, [inventaireId, supabase]);
  const attributV = (cle) => {
    const champ = attributsBase && typeof attributsBase === "object" ? attributsBase[cle] : null;
    const v = champ && typeof champ === "object" ? champ.v : null;
    return v == null || v === "" ? null : v;
  };

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
    // ⚠️ entreesPhotos, JAMAIS [...initialPhotos] (incident du 05/09) : ce
    // chemin poussait des CHAÎNES dans cross_post_jobs.photos quand
    // generate-listing rend des objets { type, url } — et les handlers de
    // l'extension lisent `p.url`. Même forme que la génération, à l'octet près.
    appliquerGeneration({ ...annoncesDuScan, lens_unifie: true, photos: entreesPhotos(initialPhotos) }, dispo);
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
    // Nouvel article : les dissociations et les valeurs générales de
    // l'ancien n'ont plus d'objet — les garder ferait suivre le texte d'un
    // article sur un autre (même classe de défaut que la contamination de
    // listing_url).
    setDissociees(dissociationsVides());
    setGenerales({ titre: "", description: "", etat: "" });
    setModeleConfirme(null);
    setPrice(null);
    setPrixAchatSaisi("");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);
  // Champs partagés (Sujet 4) : source canonique unique + trace des copies
  // éditées à la main (sacrées : plus jamais resynchronisées).
  const [sharedFields, setSharedFields]     = useState(draft?.sharedFields ?? { taille:"", couleur:"", matiere:"", marque:"" });
  // (refonte 24/09, nouvelle peau) Les champs partagés où la PERSONNE a
  // répondu dans le bloc de questions : eux seuls s'écrivent sur la fiche au
  // publish (source « manuel »), jamais une valeur pré-remplie par l'IA.
  // L'ancienne peau n'appelle jamais noterReponseFiche : l'ensemble y reste vide.
  const [reponsesFiche, setReponsesFiche] = useState(() => new Set());
  const noterReponseFiche = (key) => setReponsesFiche(prev => prev.has(key) ? prev : new Set([...prev, key]));
  // (chantier du 24/09) Les réponses données à UNE plateforme dans le bloc de
  // questions (Taille Beebs choisie dans sa grille, taille Opla) : la valeur,
  // par champ partagé. Écrites sur la fiche au publish seulement si la fiche
  // ne porte encore rien — cf. le bloc « réponses saisies » de handlePublish.
  const [reponsesFicheValeurs, setReponsesFicheValeurs] = useState(() => ({}));
  const noterReponseFicheValeur = (key, valeur) => setReponsesFicheValeurs(prev => (prev[key] === valeur ? prev : { ...prev, [key]: valeur }));
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
  // ── LES ATTENTES ET LES REFUS, PAR PLATEFORME (2026-09-23, cas Louis) ────
  // Un dépôt `needs_user` (champ, autorisation, connexion) BLOQUE le RPC
  // depuis le 23/09 — et le stepper ne le lisait pas : refus en bloc après le
  // clic, message « retire… ou décoche ». On les lit ici, même relecture, et
  // la rangée dit l'ÉTAT et le GESTE (utils/etatsPublication.js).
  const [fetchedAttentes, setFetchedAttentes] = useState({});
  useEffect(() => {
    if (!invId) { setFetchedPublished([]); setFetchedQueued([]); setFetchedAttentes({}); return; } // article hors stock : rien à relire
    let cancelled = false;
    setFetchedPublished(null);
    setFetchedQueued([]);
    setFetchedAttentes({});
    (async () => {
      const { data, error } = await supabase
        .from("cross_post_jobs")
        .select("id, platform, status, action, created_at, error, platform_fields")
        .eq("inventaire_id", invId)
        .in("status", ["pending", "processing", "published", "deleted", "needs_user", "failed"]);
      if (cancelled) return;
      // Lecture en erreur : on débloque quand même (liste vide) — la garde du
      // RPC spend_coins_and_publish (already_published) reste le filet de
      // vérité, on ne condamne pas la publication sur un aléa réseau.
      // computeRemovalInfo reçoit EXACTEMENT les statuts qu'il connaissait.
      const connus = (data ?? []).filter(j => ["pending", "processing", "published", "deleted"].includes(j.status));
      const info = error || !data ? null : computeRemovalInfo(connus);
      setFetchedPublished(info?.publishedActive ?? []);
      setFetchedQueued(info?.queued ?? []);
      setFetchedAttentes(error || !data ? {} : attentesParPlateforme(data));
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
  // En ATTENTE (needs_user : champ, autorisation, connexion) : verrou aussi —
  // c'est ce que le RPC refuse. La rangée nomme l'attente et son geste.
  const attentesKey = Object.keys(fetchedAttentes).filter(p => fetchedAttentes[p]?.bloque).sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attenteSet = useMemo(() => new Set(Object.keys(fetchedAttentes).filter(p => fetchedAttentes[p]?.bloque)), [attentesKey]);
  // Union bloquante : tout ce qui interdit un nouveau job publish sur la ligne.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lockedSet = useMemo(() => new Set([...publishedSet, ...queuedSet, ...attenteSet]), [alreadyPublishedKey, queuedKey, attentesKey]);
  // ── POURQUOI CETTE PLATEFORME EST ÉTEINTE (2026-09-20, passe 2) ──────────
  // Deux raisons, deux phrases, et rien d'autre — on ne dit que ce qu'on SAIT.
  //   · `publishedSet` : l'annonce est déjà en ligne, ce lot ne peut pas la
  //     republier (le RPC `spend_coins_and_publish` la refuserait de toute
  //     façon, avec `already_published`) ;
  //   · `queuedSet` : un dépôt est déjà en file ou en cours sur cette
  //     plateforme (pending/processing), en remettre un ferait le doublon.
  // ⛔ Aucune des deux ne dit à la personne quoi faire : elle constate, et
  //    c'est tout. Et aucune n'invente : les deux ensembles viennent de la
  //    même relecture des jobs que la garde de publication.
  const motifsVerrouillage = useMemo(() => {
    const m = {};
    for (const p of publishedSet) m[p] = lang === "en" ? "already online for this item" : "déjà en ligne pour cet article";
    for (const p of queuedSet) if (!m[p]) m[p] = lang === "en" ? "a publication is already under way" : "une publication est déjà en cours";
    for (const p of attenteSet) if (!m[p]) m[p] = phraseEtat(p, fetchedAttentes[p], lang);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyPublishedKey, queuedKey, attentesKey, lang]);

  // ── Compte eBay pas paramétré → eBay grisé (07/09/2026, demande Joséphine) ─
  // « Utilisable » = exactement ce que le trigger cross_post_jobs_voie_ebay
  // exige pour basculer un job en voie 'api' : compte relié et non révoqué,
  // les 3 politiques choisies, et la checklist vendeur verte
  // (seller_state.bloque_par_etat_ebay = false). Le prédicat vit dans
  // utils/ebayCompte, en un seul exemplaire.
  //
  // ⛔ GARDE : rien de tout ceci ne concerne la VOIE EXTENSION. Un compte sans
  // profiles.ebay_voie_api publie eBay par le formulaire (l'extension remplit
  // ebay.fr avec la session eBay du navigateur) : ni les conditions de vente,
  // ni la checklist Account API n'y jouent le moindre rôle. Pour lui, l'effet
  // ci-dessous rend la main immédiatement — aucun appel réseau, aucun état,
  // ebayBloque reste false, l'écran est celui d'hier au pixel près.
  //
  // La lecture est faite UNE fois par l'hôte (App.jsx) et descendue ici :
  // `ebayCompte` porte le drapeau, l'état brut du compte, le fait qu'on ait
  // lu, la VOIE RÉELLE, et de quoi relire. Aucun écran ne recalcule la voie
  // dans son coin.
  const [ebayPanneauOuvert, setEbayPanneauOuvert] = useState(false);
  const ebayEtatCompte = ebayCompte?.etat ?? null;
  const ebayEtatLu = Boolean(ebayCompte?.lu);
  // Tri-état : true = grisé, false = cochable, jamais grisé tant qu'on ne sait pas.
  const ebayBloque = Boolean(ebayCompte?.voieApi) && ebayEtatLu && ebayCompteUtilisable(ebayEtatCompte) === false;
  const ebayMotif = ebayBloque ? motifEbayInutilisable(ebayEtatCompte) : null;
  // ── LA VOIE RÉELLE d'eBay pour CE compte (07/09/2026) ─────────────────────
  // Tout ce qui parle d'extension à l'écran se règle là-dessus, JAMAIS sur le
  // drapeau seul : un compte basculé dont la checklist est rouge repart en
  // voie extension (le trigger ne bascule pas), et lui promettre « publié
  // depuis nos serveurs » serait un mensonge — c'était le cas avant.
  const ebayVoieApiReelle = Boolean(ebayCompte?.voieApiReelle);

  // Step 3 — sélection plateformes (chips) + publication
  // Les plateformes déjà en ligne ou en file ne sont JAMAIS pré-cochées — y
  // compris à la reprise d'un brouillon (une publication a pu aboutir ou
  // partir en file entre-temps).
  // ── OPLA AU MÊME RANG QUE LES QUATRE AUTRES (2026-09-18, décision Nico) ────
  // PLATFORMS_DEFAULT restait à quatre : garde-fou posé quand Opla n'avait
  // jamais tourné que sur le compte de Nico. Le cycle est prouvé, elle entre
  // dans la présélection.
  // ⛔ MAIS PAR `plateformesOuvertes`, JAMAIS par la constante. Cette liste
  //    vient d'App.jsx : coin_config.opla_ouvert = 1 ET extension DU COMPTE
  //    ≥ coin_config.opla_extension_min, fail-closed. Un compte sous la borne
  //    ne voit RIEN changer — c'est cette borne qui empêche un job de naître
  //    (et d'être débité) avant que l'extension ait son mot à dire.
  // ⛔ La constante PLATFORMS_DEFAULT n'est PAS touchée : elle sert aussi de
  //    filtre aux annonces d'un scan et aux phrases sous la rangée, deux
  //    endroits où Opla n'a rien à faire aujourd'hui.
  const [selected, setSelected]         = useState(() => new Set(
    (draft?.selected ?? [...PLATFORMS_DEFAULT, ...PLATFORMS_A_VENIR.filter(p => plateformesOuvertes.includes(p))])
      .filter(p => !lockedSet.has(p)),
  ));
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

  // La fiche en base a été lue (ou son absence constatée). Tant que c'est faux,
  // on n'ÉCRIT jamais : le premier rendu écraserait sinon la fiche du serveur
  // par l'état vide du composant, juste avant de la recevoir.
  const ficheChargeeRef = useRef(false);
  // CE QUI EMPÊCHE CETTE FICHE DE PARTIR, rangé dans la fiche pour que la carte
  // de brouillon puisse le DIRE sans rien recalculer (2026-09-15). Le stepper
  // est la seule autorité : lui seul a les référentiels par plateforme. Tenu
  // dans une ref parce que les trois valeurs sont déclarées bien plus bas dans
  // le composant — les mettre dans les dépendances de l'effet de sauvegarde,
  // déclaré ici, lèverait une TDZ (même piège que jobsByInventaire côté Stock).
  // Mutation idempotente au rendu, aucun re-render déclenché.
  const blocageFicheRef = useRef({});
  // La fiche relue en base a servi à hydrater ce stepper : l'article a déjà été
  // payé, aucune génération ne doit repartir. Lu par l'écran de l'étape 2 pour
  // le dire à l'utilisateur.
  const [ficheReprise, setFicheReprise] = useState(false);

  // Sauvegarde continue du brouillon : tout ce qui permet de reprendre le
  // stepper après un remount (reload d'onglet Chrome, changement d'onglet
  // interne). Les états transitoires (publishing, uploading, fichiers locaux
  // du step 0) ne sont volontairement PAS persistés — non sérialisables ou non
  // reprenables côté client. Publication terminée → brouillon purgé.
  useEffect(() => {
    if (initializing) return undefined;
    const charge = {
      ...chargeFiche({
        step, prixAchatSaisi, notes, photos, price, customPriced, photoAnalysis,
        modeleConfirme, photoOption, background, platformListings, processedPhotos,
        edited, sharedFields, sharedOverrides, selected, dissociees, generales,
      }),
      ...blocageFicheRef.current,
    };
    const enregistrerEnBase = () => supabase.from("fiches_annonce").upsert({
      inventaire_id: invId,
      user_id: userId,
      fiche: charge,
      source: "stepper",
    }, { onConflict: "inventaire_id" })
      .then(({ error }) => { if (error) console.warn("[stepper] fiche non sauvegardée :", error.message); })
      .catch(() => {});
    if (done) {
      clearStepperPersistence();
      // La publication est PARTIE : on fige la fiche telle qu'elle a servi —
      // catégories résolues, tailles converties, aspects rapprochés compris.
      // C'est cette version-là qu'une republication doit reprendre, sans
      // refaire le chemin. Sans débrayage : il n'y aura pas d'autre occasion.
      if (invId && platformListings && ficheChargeeRef.current) enregistrerEnBase();
      return undefined;
    }
    try {
      sessionStorage.setItem(STEPPER_DRAFT_KEY, JSON.stringify({
        ...charge,
        invKey: invKeyRef.current,
        invId, addToStock,
        // Anti-contamination (2026-08-08) : la neutralisation de l'article
        // d'origine et l'identité de la dernière analyse survivent au reload —
        // sinon un remount ressusciterait la fiche morte via les props.
        articleSourceMorte,
        photosAnalysees: photosAnalyseesRef.current,
      }));
    } catch { /* quota plein : le stepper continue, seul le brouillon saute */ }
    // ── LA MÊME CHARGE PART EN BASE (2026-09-15) ───────────────────────────
    // Débrayée : le brouillon change à chaque frappe, la fiche n'a pas besoin
    // d'être écrite à chaque frappe. 1,5 s après la dernière modification.
    // Conditions, dans l'ordre :
    //   · une ligne inventaire — sans elle il n'y a rien à rattacher ;
    //   · une génération appliquée — la fiche n'a d'objet que si elle porte
    //     du texte payé ; avant ça, le brouillon sessionStorage suffit ;
    //   · la fiche déjà chargée — sinon le premier rendu écraserait en base la
    //     fiche qu'on est justement en train d'aller chercher.
    // Échec = silencieux et sans conséquence : la fiche en base reste celle
    // que le serveur a écrite au débit, jamais rien de perdu.
    if (!invId || !platformListings || !ficheChargeeRef.current) return undefined;
    const minuteur = setTimeout(enregistrerEnBase, 1500);
    return () => clearTimeout(minuteur);
  }, [initializing, done, step, invId, addToStock, prixAchatSaisi, notes, photos, price,
      customPriced, photoAnalysis, modeleConfirme, photoOption, background, platformListings,
      processedPhotos, edited, sharedFields, sharedOverrides, selected, articleSourceMorte,
      dissociees, generales,
      supabase, userId]);

  // Compat catégorie × plateforme (source de vérité = les 4 mappings, cf.
  // platformCompat.js) : calculée dès que l'article est connu, elle GRISE les
  // checkboxes des plateformes qui ne peuvent pas vendre cette catégorie
  // (StepPhotos) et les retire de la sélection — un job qui échouerait au
  // pré-check de l'extension ne doit jamais pouvoir partir.
  // Article tel que le lisent les règles de compat (2026-09-11) : titre / type
  // pour Leboncoin (cosmétiques, cf. estCosmetiqueInterditeLbc) ; pour Beebs,
  // la ligne inventaire (attributs relevés sur Vinted, catalogue Vinted) — le
  // vinted_catalog_id que le Stock passe déjà sert de premier relevé, synchrone,
  // la ligne lue en base le confirme ensuite. Jamais le titre pour Beebs.
  const articlePourCompat = useMemo(() => ({
    titre: initialListing?.titre,
    description: initialListing?.description,
    type: initialListing?.categorie,
    attributs: articleBase?.attributs ?? null,
    vinted_catalog_id: articleBase?.vinted_catalog_id ?? initialListing?.vinted_catalog_id ?? null,
  }), [initialListing, articleBase]);
  // Verdict Beebs (même fichier de règles que le serveur) : nourrit le motif
  // écrit sous la case quand platformSupport.beebs vaut "prohibited".
  const beebsInterdit = useMemo(() => verdictBeebsInterdit(articlePourCompat), [articlePourCompat]);
  // Motif d'une case grisée, par plateforme : Beebs a SON texte (marque ou
  // catégorie nommée, « règle de Beebs », jamais culpabilisant), les autres
  // gardent le motif générique par statut.
  const motifSupport = (p, support) =>
    p === "beebs" && support === "prohibited" && beebsInterdit
      ? messageBeebsInterdit(beebsInterdit, lang)
      : supportMessage(t, support, PLATFORM_LABELS[p]);
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
    return getPlatformSupport(icon, articlePourCompat);
  }, [initialListing, articlePourCompat]);
  useEffect(() => {
    setSelected(prev => {
      // La porte (CATEGORIE_FERMEE) : on ne décoche que ce qui est RÉELLEMENT
      // fermé — branche absente sur la plateforme, ou produit interdit. Un
      // simple trou de mapping par icône décochait la plateforme séance
      // tenante, avant que le mot ou l'arbitrage aient pu être essayés.
      const next = new Set([...prev].filter(p => !categorieFermee(platformSupport[p])));
      return next.size === prev.size ? prev : next;
    });
  }, [platformSupport]);
  // Plateforme en PAUSE (platform_health, 2026-09-09) : elle sort de la
  // sélection séance tenante, comme une catégorie non supportée — la case est
  // grisée dans StepPhotos et le RPC refuserait de toute façon (platform_paused).
  // Clé texte : l'état est relu toutes les 60 s avec un tableau neuf.
  const pausedKey = pausedPlatforms.slice().sort().join(",");
  useEffect(() => {
    if (!pausedKey) return;
    const enPause = new Set(pausedKey.split(","));
    setSelected(prev => {
      const next = new Set([...prev].filter(p => !enPause.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [pausedKey]);
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
  // Même filet pour eBay quand le compte n'est pas utilisable : la case est
  // grisée, elle ne doit pas rester COCHÉE derrière (elle l'est par défaut,
  // PLATFORMS_DEFAULT contient "ebay", et un brouillon repris la remet). Le
  // décochage se fait dès que la lecture a tranché — jamais avant.
  useEffect(() => {
    if (!ebayBloque) return;
    setSelected(prev => (prev.has("ebay") ? new Set([...prev].filter(p => p !== "ebay")) : prev));
  }, [ebayBloque]);

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

  // ── LA FICHE DÉJÀ PAYÉE SE RÉAPPLIQUE, ELLE NE SE REGÉNÈRE PAS ────────────
  // (2026-09-15) Le chemin « j'ouvre mon article trois jours plus tard » : tout
  // revient — photos, 4 annonces, champs partagés, taille saisie, catégories —
  // et RIEN ne repart vers l'IA. `platformListings` non nul suffit à désarmer
  // l'auto-génération de l'étape 2 (elle ne se déclenche que sur un état vide) :
  // c'est la même garde qui protège déjà le Lens unifié depuis le 02/09.
  //
  // Deux formes de fiche, un seul chemin d'application :
  //   · fiche du SERVEUR (écrite au débit, sans `edited`) → appliquerGeneration,
  //     exactement comme une génération fraîche ;
  //   · fiche du STEPPER (l'utilisateur avait déjà corrigé) → on restaure ses
  //     états tels quels, ses corrections priment sur la génération brute.
  function appliquerFiche(f) {
    if (!f || typeof f !== "object") return false;
    const gen = f.platformListings;
    const parPlateforme = gen?.platforms;
    if (!parPlateforme || typeof parPlateforme !== "object") return false;
    const dispo = PLATFORMS_DEFAULT.filter(p => parPlateforme[p]);
    if (!dispo.length) return false;

    // ⚠️ LES PHOTOS DE L'HÔTE PRIMENT SUR CELLES DE LA FICHE. L'hôte (Stock ou
    // Lens) passe les photos À JOUR de l'article — notamment les copies
    // compressées définitives que LensTab vient de monter et de rattacher,
    // alors que la fiche écrite au débit porte encore les URLs du scan.
    // Restaurer la fiche telle quelle ferait reculer les photos d'un cran.
    const urlsFiche = Array.isArray(f.photos) ? f.photos.filter(u => typeof u === "string" && u) : [];
    const urls = initialPhotos.length ? initialPhotos : urlsFiche;
    if (urls.length) setPhotos(urls);
    const memeJeu = urlsFiche.length === urls.length && urlsFiche.every((u, i) => u === urls[i]);
    if (f.photoAnalysis) setPhotoAnalysis(f.photoAnalysis);
    if (f.modeleConfirme != null) setModeleConfirme(f.modeleConfirme);
    if (typeof f.notes === "string") setNotes(f.notes);
    if (f.prixAchatSaisi != null && String(f.prixAchatSaisi) !== "") setPrixAchatSaisi(String(f.prixAchatSaisi));
    if (Array.isArray(f.customPriced)) setCustomPriced(new Set(f.customPriced));
    if (f.dissociees) setDissociees(lireDissociations(f.dissociees));
    if (f.generales && typeof f.generales === "object") setGenerales(f.generales);
    // Le gel de la retouche photo (photoOption) n'est PAS restauré : une fiche
    // écrite avant le gel rouvrirait une option qui n'existe plus. L'effet de
    // gel la ramènerait à "original" de toute façon — autant ne pas la poser.

    // processedPhotos ne vaut QUE pour le jeu de photos qu'il décrit : si les
    // URLs ont changé depuis, on le recalcule plutôt que de publier des photos
    // qui ne sont plus celles de l'article.
    const photosGeneration = memeJeu && Array.isArray(f.processedPhotos) && f.processedPhotos.length
      ? f.processedPhotos
      : entreesPhotos(urls);

    if (f.edited && typeof f.edited === "object" && Object.keys(f.edited).length) {
      // Reprise d'un travail déjà corrigé : ses valeurs font foi.
      setProcessedPhotos(photosGeneration);
      setPlatformListings(gen);
      setEdited(f.edited);
      if (f.sharedFields && typeof f.sharedFields === "object") setSharedFields(f.sharedFields);
      if (f.sharedOverrides && typeof f.sharedOverrides === "object") {
        setSharedOverrides(Object.fromEntries(
          Object.entries(f.sharedOverrides).map(([k, v]) => [k, new Set(Array.isArray(v) ? v : [])])
        ));
      }
      if (f.price != null) setPrice(f.price);
    } else {
      // Fiche fraîche du serveur : le chemin normal d'application, jamais une
      // recopie parallèle.
      appliquerGeneration({ ...gen, photos: photosGeneration, price: f.price ?? gen.price ?? null }, dispo);
      if (f.price != null) setPrice(f.price);
    }

    // ⛔ UNE COPIE VAUT UNE ANNONCE GÉNÉRÉE (2026-09-21). Le filtre ne lisait
    //    que `parPlateforme` — les quatre plateformes que generate-listing
    //    rédige. Opla n'y est JAMAIS : sa copie est dérivée de celle de Vinted
    //    un rendu plus tard. Une fiche rouverte la décochait donc en silence,
    //    alors que la personne l'avait cochée ; elle la recochait, et sa copie
    //    — créée avant sa dernière frappe de prix — repartait au prix de Lens.
    //    C'est le déclencheur des 13 écarts relevés chez Ornella.
    //    On ne coche RIEN de neuf : `f.selected` reste la seule source, et une
    //    plateforme n'y figure que parce qu'elle l'a cochée elle-même.
    const aUneCopie = (p) => Boolean(parPlateforme[p] || f.edited?.[p]);
    const sel = (Array.isArray(f.selected) ? f.selected : dispo).filter(p => aUneCopie(p) && !lockedSet.has(p));
    const selectionFinale = sel.length ? sel : dispo.filter(p => !lockedSet.has(p));
    setSelected(new Set(selectionFinale));
    // On rouvre là où il en était, jamais avant l'étape des annonces : le
    // renvoyer au viseur lui ferait croire que son travail est perdu.
    const etape = Number(f.step);
    // (refonte 24/09, nouvelle peau seulement) Plus rien à cocher parmi les
    // copies de la fiche (tout est déjà en ligne, ou fermé) : on ouvre sur
    // « Où publier ? », où les plateformes se choisissent — pas sur un écran
    // de rédaction vide. L'ancienne peau garde son arrivée, à l'identique.
    if (variante === "nouvelle" && !selectionFinale.length) setStep(1);
    else setStep(Number.isFinite(etape) ? Math.min(Math.max(etape, 2), 3) : 2);
    setFicheReprise(true);
    return true;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Reprise d'un brouillon : step/photos/prix déjà hydratés depuis
    // sessionStorage — surtout ne pas laisser l'init les écraser (le
    // setStep(1) ci-dessous renverrait l'utilisateur en arrière).
    if (draft) { ficheChargeeRef.current = true; setInit(false); return undefined; }
    // La fiche en base PASSE AVANT TOUT (2026-09-15) : si cet article en porte
    // une, elle a été payée et elle se réapplique telle quelle. Lecture unique
    // au mount, avant même le prix — c'est elle qui décide de l'étape d'arrivée.
    let vivant = true;
    if (invId) {
      supabase
        .from("fiches_annonce")
        .select("fiche")
        .eq("inventaire_id", invId)
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!vivant) return;
          if (error) console.warn("[stepper] fiche non relue :", error.message);
          ficheChargeeRef.current = true;
          if (!error && data?.fiche && appliquerFiche(data.fiche)) {
            // Le prix d'achat et les attributs de la ligne restent utiles
            // (bandeau prix d'achat, garde-fous de catégorie) : on les lit
            // quand même, sans toucher à ce que la fiche vient de poser.
            supabase.from("inventaire").select("prix_achat,prix_achat_inconnu,attributs")
              .eq("id", invId).maybeSingle()
              .then(({ data: art }) => {
                if (!vivant || !art) return;
                if (art.attributs && typeof art.attributs === "object") setAttributsBase(art.attributs);
                setPrixAchatBase({ valeur: art.prix_achat ?? null, inconnu: art.prix_achat_inconnu === true });
              });
            setInit(false);
            return;
          }
          initSansFiche();
        });
      return () => { vivant = false; };
    }
    ficheChargeeRef.current = true;
    initSansFiche();
    return () => { vivant = false; };

    // Le parcours historique, inchangé — extrait pour que la fiche puisse le
    // court-circuiter sans dupliquer une ligne de son contenu.
    function initSansFiche() {
    if (!vivant) return;
    // Pas encore de ligne inventaire (article pas encore en stock) : le prix vient
    // uniquement du résultat Lens, pas de lecture DB possible.
    if (invId) {
      supabase
        .from("inventaire")
        .select("prix_vente,prix_achat,prix_achat_inconnu,attributs")
        .eq("id", invId)
        .single()
        .then(({ data }) => {
          if (data?.attributs && typeof data.attributs === "object") setAttributsBase(data.attributs);
          setPrixAchatBase({ valeur: data?.prix_achat ?? null, inconnu: data?.prix_achat_inconnu === true });
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
          // Les deux formes (un job ancien peut porter des chaînes) : le
          // filtre `p.type === "original" || p.url` vidait les chaînes.
          const urls = urlsPhotos(existing);
          if (urls.length > 0) {
            setPhotos(urls);
            setStep(1);
          }
        }
        setInit(false);
      });
    }
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
  // ── L'ORDRE DE PUBLICATION VIT DANS processedPhotos (2026-09-07) ──────────
  // Bug réel : trois photos prises au Lens, remises dans l'ordre au stepper,
  // publiées dans l'ordre d'ORIGINE — donc une étiquette en couverture.
  // Cause : le stepper réordonne `photos` (les URLs brutes), mais la
  // publication lit `processedPhotos` (ce que generate-listing a rendu). Les
  // deux listes sont alignées index par index à la génération, et RIEN ne les
  // resynchronisait ensuite : réordonner après la génération ne touchait que
  // la liste affichée. La première photo est la couverture de l'annonce sur
  // les quatre plateformes — c'est ce que voient les acheteurs.
  //
  // On applique donc la MÊME permutation aux deux listes, et seulement quand
  // elles sont alignées (même longueur). Le `type` est RETIRÉ des entrées
  // déplacées : il est purement positionnel (typePhotoParDefaut : « original »
  // pour la 1re, « photo_<i> » ensuite) et entreesPhotos le recalcule à
  // l'insert — le garder ferait porter « photo_2 » à la couverture.
  function sansType(entree) {
    if (!entree || typeof entree !== "object") return entree;
    const { type: _type, ...reste } = entree;
    return reste;
  }
  function permuterPhotos(from, to) {
    setPhotos(prev => moveItem(prev, from, to));
    setProcessedPhotos(prev => (Array.isArray(prev) && prev.length === photos.length
      ? moveItem(prev, from, to).map(sansType)
      : prev));
  }

  function handleReorderPreviews(from, to) {
    if (pickedPreviews.length > 0) {
      setPickedFiles(prev => moveItem(prev, from, to));
      setPickedPreviews(prev => moveItem(prev, from, to));
    } else {
      permuterPhotos(from, to);
    }
  }

  function handleReorderPhotos(from, to) {
    permuterPhotos(from, to);
  }

  // La compression et le téléversement vivent dans utils/photosUpload depuis le
  // 19/09 (une brique, trois appelants). Les gardes du 04/09 — onerror, délai
  // maximum, conversion HEIC, rejet explicite de toBlob — y sont conservées à
  // l'identique : sans elles, un HEIC d'iPhone ouvert dans Chrome laissait
  // « Upload en cours… » à l'écran, définitivement.

  // ── Upload step 0 ─────────────────────────────────────────────────────────
  // `stepSuivant` (refonte 24/09) : l'ancien parcours arrive à l'étape 1
  // (Photos), le nouveau — qui n'a plus d'étape Photos — passe 2 (Rédaction).
  async function handleUpload(stepSuivant = 1) {
    if (!pickedFiles.length) return;
    setUploading(true);
    setUploadError("");
    try {
      // Une photo illisible ne fait plus tomber tout le lot ni figer l'écran :
      // elle est SAUTÉE et nommée à la fin — c'est `surErreur: "ignorer"`.
      // Avant le 04/09, un HEIC bloquait ici pour toujours.
      const { urls, illisibles } = await televerserPhotos(supabase, {
        userId,
        sources: pickedFiles,
        surErreur: "ignorer",
      });
      // AUCUNE photo lisible : on le dit avec le message dédié plutôt que
      // l'erreur d'upload générique — rien n'a échoué côté réseau.
      if (!urls.length) throw new Error(illisibles.length ? messageDecodage(lang) : t("stepUploadError"));
      if (illisibles.length) {
        setUploadError(lang === "en"
          ? `${illisibles.length} photo(s) could not be read and were skipped: ${illisibles.join(", ")}. The others were uploaded.`
          : `${illisibles.length} photo(s) n'ont pas pu être lues et ont été ignorées : ${illisibles.join(", ")}. Les autres sont bien montées.`);
      }
      setPhotos(urls);
      setStep(stepSuivant);
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
      // scan_id (2026-09-13) : cette analyse-ci est payante elle aussi, elle se
      // réserve donc dans lens_scans comme celle de l'onglet Lens. Deux effets
      // immédiats — un double envoi ne peut plus débiter deux fois, et le
      // résultat servi est enregistré (audit qualité : on ne savait pas ce que
      // l'utilisateur avait vu). Elle profite aussi de l'ancrage au runtime :
      // l'analyse va au bout même si l'app passe en arrière-plan.
      // ⚠️ Ce qu'elle n'a PAS, contrairement à l'onglet Lens : l'écran de
      // reprise. Le brouillon du stepper vit en sessionStorage, qui meurt avec
      // la webview — un scan retrouvé ici n'est pas encore re-affiché.
      const { data: res, error: fnErr } = await supabase.functions.invoke("lens-analysis", {
        body: {
          scan_id: uuidV4(),
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
    // `marqueur: "extra_"` garde le schéma de nom d'origine
    // (<ts>_extra_<i>.jpg), qui distingue les photos ajoutées après coup.
    const { urls } = await televerserPhotos(supabase, {
      userId,
      sources: toAdd,
      marqueur: "extra_",
      surErreur: "lever",
    });
    if (urls.length) {
      setPhotos(prev => [...prev, ...urls]);
      // ── LA PHOTO AJOUTÉE APRÈS GÉNÉRATION PART AUSSI (2026-09-08) ────────
      // Le job est construit depuis processedPhotos ; n'ajouter qu'à `photos`
      // laissait la nouvelle photo HORS de l'annonce ET désalignait les deux
      // listes (garde de longueur de permuterPhotos/handleRemovePhoto) — tout
      // réordonnancement ultérieur redevenait muet, la vignette choisie n'était
      // plus celle publiée. Même règle d'alignement que la suppression : on
      // n'ajoute côté processedPhotos que si les listes étaient alignées ; le
      // `type` positionnel est recalculé à l'insert (entreesPhotos).
      setProcessedPhotos(prev => (Array.isArray(prev) && prev.length === photos.length
        ? [...prev, ...urls.map(url => ({ url }))]
        : prev));
    }
  }

  function handleRemovePhoto(idx) {
    // Les deux listes restent alignées index par index (cf. permuterPhotos) :
    // retirer d'un seul côté les désaligne, et la garde de longueur désarmerait
    // ensuite le réordonnancement en silence.
    setProcessedPhotos(prev => (Array.isArray(prev) && prev.length === photos.length
      ? prev.filter((_, i) => i !== idx)
      : prev));
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
        // Repli sur inventaire.attributs (2026-09-06) : ce que la sync, le clic
        // Publier ou un Lens précédent ont déjà posé sur l'article.
        taille:      initialListing?.taille_estimee ?? initialListing?.taille ?? photoAnalysis?.taille_estimee ?? attributV("taille") ?? null,
        couleur:     initialListing?.couleur     ?? photoAnalysis?.couleur     ?? attributV("couleur") ?? null,
        matiere:     initialListing?.matiere     ?? photoAnalysis?.matiere     ?? attributV("matiere") ?? null,
        // État LU par le Lens (2026-07-29). Seule source : etat_estime — la
        // table inventaire ne porte pas l'état (statut vaut stock|vendu, c'est
        // autre chose). Depuis le 29/07 la valeur est garantie dans la liste
        // fermée des 5 états (validation serveur lens-analysis), ce qui rend
        // le rapprochement vers la liste de chaque plateforme fiable.
        etat:        initialListing?.etat_estime ?? photoAnalysis?.etat_estime ?? attributV("etat") ?? null,
        // ISBN LU par le Lens (2026-08-31). Il vit dans le sac d'attributs de
        // la famille livres_medias (attributs_visibles.isbn_ean) et n'avait
        // AUCUN chemin vers l'annonce : le Lens l'affichait dans sa fiche, le
        // stepper le réclamait quand même en rouge, et il fallait retaper à la
        // main treize chiffres déjà déchiffrés et déjà payés.
        isbn:        initialListing?.attributs_visibles?.isbn_ean ?? photoAnalysis?.attributs_visibles?.isbn_ean ?? attributV("isbn") ?? null,
        prixVente:   price ?? initialListing?.prix_vente_suggere ?? photoAnalysis?.prix_vente_suggere ?? null,
      };
      // ── Ce que le Lens ou l'analyse photo ont LU est gardé sur l'article
      // (2026-09-06, arbitrage Nico : « un article créé par Lens doit garder
      // taille, couleur, matière, état et attributs_visibles en base »). Source
      // 'lens' : la plus faible de l'échelle, la base ne laisse jamais une
      // lecture IA écraser une valeur Vinted ou une saisie (trigger de fusion).
      // Best-effort, jamais bloquant pour la génération.
      if (invId && userId) {
        const lu = initialListing?.taille_estimee != null || initialListing?.etat_estime != null || photoAnalysis
          ? {
              taille:  initialListing?.taille_estimee ?? photoAnalysis?.taille_estimee ?? null,
              couleur: initialListing?.couleur       ?? photoAnalysis?.couleur       ?? null,
              matiere: initialListing?.matiere       ?? photoAnalysis?.matiere       ?? null,
              etat:    initialListing?.etat_estime   ?? photoAnalysis?.etat_estime   ?? null,
              genre:   initialListing?.genre         ?? photoAnalysis?.genre         ?? null,
              isbn:    initialListing?.attributs_visibles?.isbn_ean ?? photoAnalysis?.attributs_visibles?.isbn_ean ?? null,
              attributs_visibles: initialListing?.attributs_visibles ?? photoAnalysis?.attributs_visibles ?? null,
            }
          : null;
        const at = new Date().toISOString();
        const attributs = {};
        for (const [k, v] of Object.entries(lu ?? {})) {
          const vide = v == null || (typeof v === "string" && !v.trim()) || (typeof v === "object" && !Object.keys(v).length);
          if (!vide) attributs[k] = { v, source: "lens", at };
        }
        if (Object.keys(attributs).length) {
          supabase.from("inventaire").update({ attributs }).eq("id", invId).eq("user_id", userId).select("id")
            .then(({ error }) => { if (error) console.warn("[stepper] attributs Lens non gardés :", error.message); })
            .catch(() => {});
        }
      }
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
          // « Je sais lire la fiche que tu vas écrire, et je ne recréerai pas
          // de ligne au publish » (2026-09-15). Sans ce drapeau le serveur ne
          // crée rien : l'app native garde l'ancien client jusqu'à l'OTA.
          fiche_serveur: true,
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
            platformFieldsConfig[p] ?? [],
            // Les attributs de la FICHE — toutes plateformes d'origine
            // confondues. C'est le chaînon qui manquait : sans lui, taille,
            // genre, matière et couleur restaient en base et l'écran affichait
            // quatre tirets (mesuré sur 1789676224963 et 1789676272841).
            initialListing?.attributs ?? null
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
      // ── LES VALEURS GÉNÉRALES REPARTENT DE ZÉRO (2026-09-21) ────────────
      // Même raison que les overrides juste au-dessus : nouvelle génération =
      // nouvelles copies, donc plus aucune exception à protéger. Les trois
      // valeurs générales sont re-semées juste après par l'effet de semis,
      // qui donne la priorité au texte de la FICHE quand c'est celui du
      // vendeur — et pas à ce que l'IA vient de proposer.
      setDissociees(dissociationsVides());
      setGenerales({ titre: "", description: "", etat: "" });

      setEdited(initialEdited);
      setPlatformListings(data);
  }

  // ══ LA RÉSOLUTION PART DÈS LA GÉNÉRATION (2026-09-20) ═════════════════════
  // Jusqu'ici, catégorie et champs plateforme se calculaient au CLIC Publier.
  // L'écran de publication ne pouvait donc rien en montrer : au moment où il
  // s'affiche, la catégorie n'existe pas encore. Elle se calcule maintenant
  // juste après la génération, et le clic n'a plus qu'à la reprendre.
  //
  // ⛔ CE N'EST QU'UNE AVANCE, JAMAIS UNE AUTORITÉ. handlePublish revérifie
  //    l'empreinte et recalcule au moindre écart : c'est lui qui décide de ce
  //    qui part. Si cet effet ne tourne pas du tout, rien ne change pour
  //    personne — on retombe exactement sur le comportement d'avant.
  // ⛔ UNE FOIS PAR GÉNÉRATION, pas à chaque frappe. La résolution appelle
  //    resolve-categorie, qui est payant : la relancer à chaque édition du
  //    titre coûterait un appel par caractère. Un titre réécrit après coup
  //    invalide simplement l'empreinte, et le clic recalcule — comme avant.
  // ⛔ ELLE N'AFFICHE RIEN ET NE BLOQUE RIEN : un échec est silencieux et la
  //    publication reprend le chemin d'origine.
  const resolutionPrevolRef = useRef(null);
  // ── LE MÊME RÉSULTAT, MAIS AFFICHABLE (lot B) ─────────────────────────────
  // Le ref est l'autorité pour PUBLIER (il ne doit pas provoquer de rendu) ;
  // l'écran, lui, a besoin d'un état pour montrer le rayon dès qu'il est
  // trouvé. Même objet, deux usages — jamais deux calculs.
  const [resolutionAffichee, setResolutionAffichee] = useState(null);
  // Défaut nº8 : l'avis « retouche non aboutie » se referme une fois lu.
  const [retoucheAvisLu, setRetoucheAvisLu] = useState(false);
  useEffect(() => {
    if (!platformListings?.platforms) return undefined;
    const plateformes = [...selected].filter(p => edited[p] && platformListings.platforms[p]);
    if (!plateformes.length) return undefined;
    const contexte = {
      plateformes, selected, edited, initialListing, sharedFields, sharedOverrides,
      activeAiIcon, activeAiObjet, origineCat, lang, supabase,
      // (25/09) Par l'API, le rayon eBay refusé est tranché par le serveur.
      ebayVoieApi: ebayVoieApiReelle,
      outils: {
        platformFieldsConfig, isConditionKey, defaultConditionFor, GENERIC_ASPECTS_PF_KEY,
        normAspectVal, resolveArticleIcon, resolveArticleIconDetail, OPLA_ETAT_PAR_LIBELLE,
      },
    };
    const empreinte = signatureResolution(contexte);
    if (resolutionPrevolRef.current?.empreinte === empreinte) return undefined;
    let vivant = true;
    (async () => {
      try {
        const resolution = await resoudrePublication(contexte);
        if (!vivant) return;
        if (resolution.refus) {
          // Catégorie non trouvée. On ne dit RIEN ici : la question se pose au
          // clic, avec son message, exactement comme avant le déplacement.
          console.warn(`[prévol] résolution non concluante (${resolution.refus.code}) — le clic reposera la question`);
          return;
        }
        // ⛔ LE RÉSULTAT NE SE FOND PAS DANS `edited`, ET C'EST MESURÉ.
        //    L'intention était de le ranger directement dans
        //    edited[p].platform_fields. Le rejeu sur 50 articles réels (148
        //    copies) l'a refusé : en fusionnant, l'état que le clic relit
        //    n'est plus celui d'où la résolution est partie, et le jour où le
        //    filet recalcule (titre réécrit, champ corrigé), il repasse sur
        //    ses propres valeurs. Deux copies sur 148 en sortaient
        //    différentes de l'ancien chemin — une trace `brand_mismatch` de
        //    plus sur le `console_brand` que le module jeux vidéo venait de
        //    poser. Rien de publié ne changeait, mais « identique à 100 % »
        //    veut dire identique. Sans fusion : 0 écart sur 148, sur les deux
        //    chemins, IA jointe comme IA injoignable.
        //    Le résultat vit donc ICI, à côté de `edited` et pas dedans. Il
        //    est complet (tous les champs, par plateforme) : l'écran unique
        //    le lira à cette adresse.
        resolutionPrevolRef.current = { empreinte, resolution };
        setResolutionAffichee(resolution);
        console.log(`[prévol] catégorie et champs résolus dès la génération : ${plateformes.join(", ")}`);
      } catch (e) {
        console.warn("[prévol] résolution indisponible — le clic recalculera :", e?.message ?? e);
      }
    })();
    return () => { vivant = false; };
    // ⛔ `edited` ET `selected` VOLONTAIREMENT HORS DES DÉPENDANCES : le
    //    déclencheur est la GÉNÉRATION, pas la frappe. Les y mettre relancerait
    //    la résolution — donc un appel resolve-categorie payant — à chaque
    //    caractère tapé dans un titre et à chaque case cochée. Ils sont relus
    //    à frais quand l'effet part ; s'ils ont bougé depuis, l'empreinte ne
    //    concorde plus au clic et c'est le filet qui recalcule, comme avant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformListings]);

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
  // ── LE MOT DE L'IA (2026-09-07 soir) ──────────────────────────────────────
  // generate-listing rend, dans le MÊME micro-appel que l'emoji, le nom commun
  // français de l'objet. Contrairement à l'icône, il n'est PAS invalidé quand
  // une copie est retouchée : l'emoji décrivait le contexte des copies
  // générées, le mot décrit l'ARTICLE (titre, marque, type, description de la
  // fiche). Réécrire la copie eBay ne change pas ce qu'est l'objet.
  // ⛔ ET, EN DERNIER RECOURS, LE RAYON QUE LA PERSONNE A CHOISI (20/09,
  //    passe 2). Quand l'IA n'a pas nommé l'objet, la feuille du rayon choisi
  //    le nomme : « Combinaisons » → « combinaison ». Ce mot part ensuite dans
  //    la cascade, qui le traduit dans l'arbre de CHAQUE plateforme — c'est ce
  //    qui fait qu'un choix posé sur Vinted sert aussi Opla, Beebs et les
  //    autres, au lieu de les laisser repartir de leur propre titre.
  //    Cas fondateur : Ornella choisit « Bébé filles › Combinaisons » sur
  //    Vinted et l'écran refuse TOUT le lot en lui demandant de « nommer
  //    l'objet dans le titre ("combinaison"…) ». Elle venait de le faire.
  //    ⚠️ REPLI SEULEMENT : un mot de l'IA gagne toujours.
  const activeAiObjet = useMemo(() => {
    const o = String(platformListings?.objet ?? "").trim();
    return o || objetDuRayonChoisi(edited) || null;
  }, [platformListings, edited]);

  // ══ LE RAYON, PRÊT À AFFICHER (lot B, 20/09) ══════════════════════════════
  // Ce que le pré-calcul a trouvé, RECOUVERT par le choix de la personne. Une
  // seule source pour l'écran, la même règle que pour la publication (le
  // garde-fou nº1 : un choix humain n'est jamais recalculé).
  const rayonsParPf = useMemo(() => {
    const pfp = resolutionAffichee?.pfParPlateforme ?? {};
    const sortie = {};
    for (const p of Object.keys(edited ?? {})) {
      const r = rayonDuChamp(pfp[p], p, edited[p]?.rayon_choisi);
      if (r) sortie[p] = r;
    }
    return sortie;
  }, [resolutionAffichee, edited]);
  // Les candidates que le calcul avait déjà ratissées pour CET objet : c'est
  // la liste où « Jeux » se trouve quand l'app a posé « Consoles ». Corriger
  // le cas de XEWER ne demande donc aucune frappe, juste un choix.
  const suggestionsParPf = useMemo(() => {
    const brut = resolutionAffichee?.candidatsRatisses ?? {};
    const sortie = {};
    for (const [p, liste] of Object.entries(brut)) {
      if (Array.isArray(liste) && liste.length) sortie[p] = liste;
    }
    return sortie;
  }, [resolutionAffichee]);
  // ── LA QUESTION « QUEL RAYON ? » (25/09) ──────────────────────────────────
  // Le rayon envisagé a été refusé par la vérification et aucun rayon sûr ne
  // l'a remplacé (utils/rayonApresRefus.js) : la plateforme ne partira pas tant
  // que la personne n'a pas choisi. Une question par plateforme COCHÉE, qui
  // tombe dès que la personne choisit (son choix passe toujours).
  const rayonsAChoisir = useMemo(() => {
    const pfp = resolutionAffichee?.pfParPlateforme ?? {};
    const sortie = {};
    for (const p of Object.keys(pfp)) {
      if (!selected.has(p)) continue;
      const q = pfp[p]?.rayon_a_choisir;
      if (q && !edited?.[p]?.rayon_choisi?.chemin?.length) sortie[p] = q;
    }
    return sortie;
  }, [resolutionAffichee, edited, selected]);
  // Le choix (ou son retrait) vit sur la COPIE, à côté des champs : il survit
  // au brouillon et à la fiche en base, et la résolution ne le voit jamais.
  const choisirRayon = (platform, choix) => setEdited(prev => (
    prev[platform] ? { ...prev, [platform]: { ...prev[platform], rayon_choisi: choix } } : prev
  ));


  // ══ LA VALEUR GÉNÉRALE, DE BOUT EN BOUT (2026-09-21) ══════════════════════
  // Trois gestes, et rien d'autre : SEMER, APPLIQUER, RÉTABLIR.
  //
  // ⛔ LA GARDE DU LOT : « Une valeur modifiée sur une carte n'est JAMAIS
  //    écrasée par un changement ultérieur de la valeur générale. » Elle est
  //    tenue par appliquerGenerale (utils/valeursGenerales.js), qui saute les
  //    dissociées — et prouvée par scripts/valeurs-generales-selftest.mjs.

  // ── LE TEXTE DE LA FICHE, QUAND C'EST CELUI DU VENDEUR ────────────────────
  // MÊME RÈGLE que le serveur (generate-listing, bloc « LE TEXTE DU VENDEUR
  // FAIT FOI ») : un article venu d'un relevé ou du dressing porte le texte de
  // son annonce, et une saisie à la main est marquée. Tout le reste — Lens,
  // vocal — est NOTRE brouillon, et l'IA garde la main dessus.
  // ⚠️ Les deux listes doivent rester identiques. Si l'une bouge, l'autre
  //    aussi : le serveur décide ce qui PART, cet écran ce qui s'AFFICHE, et
  //    un écart entre les deux se lit comme un bug d'affichage.
  const texteDuVendeurFiche = () => {
    const origine = String(initialListing?.origine ?? "").trim().toLowerCase();
    const marqueur = (cle) => String(attributV(cle) ?? "").trim().toLowerCase();
    const propre = (cle) => {
      const src = marqueur(cle);
      return src === "vinted" || src === "manuel" || src.startsWith("releve");
    };
    const venuDeSaPage = origine.startsWith("releve") || origine === "vinted_sync";
    const assezLong = (v) => {
      const t = String(v ?? "").trim();
      return t && t.split(/\s+/).filter(Boolean).length >= 2 ? t : "";
    };
    return {
      titre: (propre("titre_source") || venuDeSaPage) ? assezLong(initialListing?.titre) : "",
      description: (propre("description_source") || venuDeSaPage) ? assezLong(initialListing?.description) : "",
    };
  };

  // SEMER — une fois, quand les copies existent et que rien n'a encore été
  // écrit. Couvre TOUS les chemins d'entrée sans en toucher un seul : une
  // génération fraîche, une fiche rouverte, un brouillon d'avant ce lot.
  // Le texte de la FICHE prime sur les copies quand c'est celui du vendeur :
  // c'est la règle du 21/09 (« un texte qui EXISTE fait foi »), et c'est ce
  // qui fait que Louis retrouve SON titre dans le champ général, pas celui
  // que l'IA lui proposait.
  useEffect(() => {
    if (!platformListings) return;
    // ⛔ TOUTES LES COPIES, pas les seules cochées (2026-09-21) : le semis
    //    doit atteindre la copie Opla, qui n'est pas toujours cochée quand il
    //    tourne. Elle dérive de celle de Vinted, donc elle ne peut pas faire
    //    diverger l'unanimité que `valeurCommune` cherche — elle la confirme.
    const pf = Object.keys(edited);
    if (!pf.length) return;
    if (generales.titre || generales.description || generales.etat) return;
    const duVendeur = texteDuVendeurFiche();
    const suivant = {
      titre: duVendeur.titre || valeurCommune(edited, "titre", pf, dissociees),
      description: duVendeur.description || valeurCommune(edited, "description", pf, dissociees),
      etat: valeurCommune(edited, "etat", pf, dissociees),
    };
    if (!suivant.titre && !suivant.description && !suivant.etat) return;
    setGenerales(suivant);

    // ── ET LES CARTES REÇOIVENT CE TEXTE (règle du 21/09, point 1) ──────────
    // « À la publication d'un article qui a déjà un titre / une description,
    //  les cartes plateformes sont pré-remplies avec CE texte, mis en
    //  conformité. Aucune régénération. »
    // Le serveur ne génère plus ce texte depuis ce lot — mais une fiche
    // ENREGISTRÉE AVANT porte encore la version réécrite par l'IA, et la
    // rouvrir doit rendre son texte à la personne, pas le texte d'hier.
    // ⛔ ON NE TOUCHE QU'AUX COPIES INTACTES : une carte dont le texte
    //    DIFFÈRE de ce que la génération avait produit a été retouchée à la
    //    main, et on n'écrase jamais une retouche (même critère que
    //    `activeAiIcon` juste en dessous, qui compare déjà ces deux valeurs).
    const genere = platformListings?.platforms ?? {};
    const aRemettre = pf.filter(p => genere[p]
      && String(edited[p]?.title ?? "") === String(genere[p]?.title ?? "")
      && String(edited[p]?.description ?? "") === String(genere[p]?.description ?? ""));
    if (!aRemettre.length) return;
    for (const champ of ["titre", "description"]) {
      const valeur = duVendeur[champ];
      if (!valeur) continue;
      setEdited(prev => appliquerGenerale(prev, {
        champ, valeur, plateformes: aRemettre, dissociees,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformListings, edited, selected]);

  // ── PAR DÉFAUT, LE TEXTE LE PLUS RÉCENT RÉELLEMENT EN LIGNE (2026-09-23) ──
  // Louis : sa fiche importée portait une capture Beebs du 19/09, Beebs
  // affichait un texte plus neuf. Quand la fiche n'a PAS été retouchée à la
  // main (titre_source / description_source ≠ manuel) et que le champ général
  // porte encore le texte de la fiche, on lui donne la version en ligne la
  // plus récente — elle reste choisissable dans « Reprendre le texte de : ».
  // Une fiche retouchée par la personne ne bouge pas : c'est SON texte, et la
  // rangée lui montre les autres versions, sans rien écraser.
  const versionsAppliquees = useRef(null);
  useEffect(() => {
    if (!versionsTexte.length || !generales?.titre && !generales?.description) return;
    if (versionsAppliquees.current === inventaireId) return;
    const enLigne = [...versionsTexte].filter(v => v.enLigne).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    if (!enLigne.length) return;
    versionsAppliquees.current = inventaireId;
    const marqueur = (cle) => String(attributV(cle) ?? "").trim().toLowerCase();
    for (const [champ, cle] of [["titre", "titre_source"], ["description", "description_source"]]) {
      if (marqueur(cle) === "manuel") continue;
      const fiche = String(initialListing?.[champ] ?? "").trim();
      const courant = String(generales?.[champ] ?? "").trim();
      if (fiche && courant && courant !== fiche) continue; // déjà retouché dans ce stepper
      const recente = enLigne.find(v => String(v[champ] ?? "").trim());
      const texte = recente ? String(recente[champ]).trim() : "";
      if (texte && texte !== courant) poserValeurGenerale(champ, texte);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsTexte, generales?.titre, generales?.description, inventaireId]);

  // APPLIQUER — écrit la valeur générale sur toutes les cartes qui la suivent.
  // ⛔ TOUTES LES COPIES, COCHÉES OU NON — même raison que le prix central
  //    (cf. `applyCentralPrice`) : cocher dit ce qui sera publié, pas ce
  //    qu'une copie contient. Une copie laissée de côté ici repartirait avec
  //    le texte d'hier le jour où la case est cochée, et personne ne le
  //    verrait. Les dissociées restent sautées par `appliquerGenerale`.
  const poserValeurGenerale = (champ, valeur) => {
    setGenerales(prev => ({ ...prev, [champ]: valeur }));
    setEdited(prev => appliquerGenerale(prev, {
      champ, valeur, plateformes: Object.keys(prev), dissociees,
    }));
  };

  // DISSOCIER — toute saisie DANS une carte est un geste explicite : la carte
  // sort du général, exactement comme le prix depuis le 14/07.
  const modifierCarte = (plateforme, champ, valeur) => {
    setEdited(prev => {
      const base = prev[plateforme];
      if (!base) return prev;
      if (champ === "titre") return { ...prev, [plateforme]: { ...base, title: valeur } };
      if (champ === "description") return { ...prev, [plateforme]: { ...base, description: valeur } };
      return { ...prev, [plateforme]: { ...base, platform_fields: { ...(base.platform_fields ?? {}), etat: valeur } } };
    });
    setDissociees(prev => dissocier(prev, champ, plateforme));
  };

  // ══ « LE TEXTE A CHANGÉ SUR LA PLATEFORME » (2026-09-21, cas Louis) ═══════
  // Le relevé a relu l'annonce et a trouvé un texte DIFFÉRENT de celui qu'on
  // avait — mais la personne avait retouché le sien dans FillSell. Les deux
  // versions sont légitimes ; ce n'est pas à nous de trancher. Le relevé a
  // gardé SA retouche et rangé de quoi poser la question
  // (attributs.contenu_divergent) ; ici on la pose, en ambre, et elle tranche
  // en UN tap. Sans réponse, rien ne bouge — sa retouche reste.
  const divergence = useMemo(() => {
    const v = attributV("contenu_divergent");
    if (!v || typeof v !== "object" || !Array.isArray(v.champs) || !v.champs.length) return null;
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributsBase]);
  const [divergenceTranchee, setDivergenceTranchee] = useState(null);

  // Écrire dans les attributs SANS toucher au reste : la fusion en base
  // arbitre par le rang, on ne fait que proposer. Source « manuel » pour
  // effacer le drapeau — c'est un geste de la personne, et lui seul prime.
  // ⚠️ `description_source` RESTE à « manuel » même quand elle prend le texte
  //    de la plateforme : on ne peut pas redescendre un rang (la fusion
  //    refuse), et surtout ce texte devient SON choix. Conséquence assumée :
  //    un prochain changement en ligne lui sera SIGNALÉ, pas appliqué. C'est
  //    le sens de la règle — qui a tranché une fois garde la main.
  const trancherDivergence = async (choix) => {
    if (!divergence) return;
    const at = new Date().toISOString();
    const patch = { attributs: { contenu_divergent: { v: false, source: "manuel", at } } };
    if (choix === "plateforme") {
      if (divergence.champs.includes("description") && divergence.texte) patch.description = divergence.texte;
      if (divergence.champs.includes("titre") && divergence.titre) patch.titre = divergence.titre;
      if (divergence.champs.includes("prix") && divergence.prix != null) patch.prix_vente = Number(divergence.prix);
      // L'écran suit tout de suite : la valeur générale se pose, et les cartes
      // qui la suivent avec. Pas de rechargement, pas de geste en plus.
      if (patch.description) poserValeurGenerale("description", patch.description);
      if (patch.titre) poserValeurGenerale("titre", patch.titre);
      if (patch.prix_vente != null) setPrice(patch.prix_vente);
    }
    setDivergenceTranchee(choix);
    if (!invId || !userId) return;
    supabase.from("inventaire").update(patch).eq("id", invId).eq("user_id", userId)
      .then(({ error }) => { if (error) console.warn("[stepper] divergence non tranchée en base :", error.message); })
      .catch(() => {});
  };

  // RÉTABLIR — un tap, et la carte reprend la valeur générale.
  const retablirCarte = (plateforme, champ) => {
    const suivant = rattacher(dissociees, champ, plateforme);
    setDissociees(suivant);
    setEdited(prev => appliquerGenerale(prev, {
      champ, valeur: generales[champ], plateformes: [plateforme], dissociees: suivant,
    }));
  };

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
  // ── « Ta description parle d'une autre plateforme » (2026-09-07) ──────────
  // Ne se déclenche QUE sur la description VERROUILLÉE (celle de l'annonce
  // Vinted, marquée description_source='vinted') : c'est la seule qui part
  // telle quelle sur les autres plateformes. Une description que nous avons
  // produite est réécrite par plateforme, elle n'a pas ce problème.
  // Liste FERMÉE (descriptionMentions.js), mesurée à 11,15 % du parc capturé.
  // Informatif seulement : aucune garde, aucun needs_user, publication telle
  // quelle sans réponse.
  const descriptionMentions = useMemo(() => {
    if (attributV("description_source") !== "vinted") return null;
    const texte = String(initialListing?.description ?? "").trim();
    const m = mentionsAutrePlateforme(texte);
    return m ? { ...m, message: messageMentions(m, lang) } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributsBase, initialListing?.description, lang]);

  // ── LE PLAFOND PHOTOS SUIT LE RAYON RÉSOLU (2026-09-24, capture de Louis) ──
  // « Ton article est rangé en « Divers > Autres ». Seules les 3 premières de
  // tes 5 photos partent sur Leboncoin », au-dessus d'un Type « Cuisine et
  // cuisson » et d'un Produit « Yaourtière » : le bandeau lisait le chemin de
  // l'ICÔNE (📦 → le fourre-tout), calculé avant la résolution. Il lit
  // désormais le rayon RÉELLEMENT retenu pour ce dépôt (pré-calcul de la
  // génération, ou choix de la personne) — celui que le job emportera. Pas
  // encore résolu, ou resté sur le rayon par défaut : pas de bandeau — jamais
  // une limite fausse.
  const lbcPhotoCap = useMemo(() => {
    if (!selected.has("leboncoin")) return null;
    const rayon = rayonsParPf?.leboncoin ?? null;
    const path = Array.isArray(rayon?.chemin) && rayon.chemin.length ? rayon.chemin : null;
    if (!path) return null;
    const pfResolu = resolutionAffichee?.pfParPlateforme?.leboncoin ?? null;
    if (!rayon.choisi && (pfResolu?.categorie_source === "defaut" || cheminFourreToutLbc(path))) return null;
    const quota = getLbcFreePhotoQuota(path);
    const total = Array.isArray(processedPhotos) ? processedPhotos.length : 0;
    if (quota == null || total <= quota) return null;
    return { quota, total, categorie: path.join(" > ") };
  }, [selected, rayonsParPf, resolutionAffichee, processedPhotos]);

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
  // (refonte 24/09) La règle vit dans src/publication/moteur/regles.js — même
  // filtre, dans le même ordre ; cet écran l'appelle.
  const plateformesPubliables = useMemo(
    () => calculerPlateformesPubliables({ selected, platformListings, lbcAdresseManquante, platformSupport }),
    [selected, platformListings, lbcAdresseManquante, platformSupport]);

  // ── UN JUMEAU DÉJÀ EN LIGNE SUR LA PLATEFORME VISÉE (2026-09-21) ─────────
  // Le verrou `publishedSet` ne voit que les jobs de CET article. Quand le
  // même objet vit sur DEUX lignes de stock (relevé qui n'a pas reconnu une
  // annonce, import, saisie en double), publier depuis la seconde crée un
  // doublon en ligne sans que rien ne le dise — cas Romain du 21/09, après un
  // avertissement Vinted. On le dit AVANT le clic, et on ne bloque rien :
  // deux exemplaires du même jouet, c'est banal, et c'est la personne qui
  // sait. Règle et limites du rapprochement : utils/jumeauxEnLigne.js.
  const [jumeaux, setJumeaux] = useState([]);
  const titrePourJumeaux = edited?.vinted?.title || edited?.leboncoin?.title
    || edited?.beebs?.title || edited?.ebay?.title || initialListing?.titre || "";
  const marquePourJumeaux = sharedFields?.marque || initialListing?.marque || "";
  const cleJumeaux = `${step}|${[...plateformesPubliables].sort().join(",")}|${titrePourJumeaux}|${marquePourJumeaux}|${price ?? ""}`;
  useEffect(() => {
    if (step !== 3 || !plateformesPubliables.size || !titrePourJumeaux.trim()) { setJumeaux([]); return; }
    let vivant = true;
    chercherJumeauxEnLigne(supabase, {
      userId, inventaireId: invId, titre: titrePourJumeaux, marque: marquePourJumeaux, prix: price,
      plateformes: [...plateformesPubliables],
      // Les photos de l'article : la PREUVE par l'image (2026-09-23).
      photos: Array.isArray(photos) ? photos : [],
    }).then(r => { if (vivant) setJumeaux(r); });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleJumeaux, invId, userId]);

  // ── COPIE OPLA DÉRIVÉE DE LA COPIE VINTED (2026-09-17 soir) ─────────────
  // Pour les seuls comptes qui VOIENT Opla — inerte pour tous les autres.
  // Aucune écriture si la copie existe déjà (brouillon repris, édition à la
  // main) : l'effet ne fait que COMBLER une absence, une fois.
  // ── DE N'IMPORTE QUELLE COPIE EXISTANTE, PAS SEULEMENT VINTED (2026-09-23 soir)
  // 🚨 Mail du 23/09 à 19:09, capture à l'appui : article déjà en ligne sur
  //    Leboncoin et Beebs, jamais généré pour Vinted. La personne coche Opla ;
  //    l'écran « Confirme la publication » ne montre que « Leboncoin — déjà en
  //    ligne pour cet article ». Cause : cet effet ne dérivait la copie Opla
  //    QUE de la copie Vinted. Sans copie Vinted, aucune copie Opla — Opla
  //    n'entrait donc pas dans plateformesPubliables (« sélectionnée ET
  //    générée ») et l'écran ne listait que ce qui existait. Rien ne le disait.
  // Source, dans l'ordre : Vinted (même marché, même vocabulaire d'état),
  // Leboncoin, eBay, Beebs — la première qui existe. Les valeurs GÉNÉRALES
  // (titre, description, état, prix) priment de toute façon (cf. deriverCopieOpla).
  const sourceCopieOpla = edited?.vinted ?? edited?.leboncoin ?? edited?.ebay ?? edited?.beebs ?? null;
  const plateformeSourceOpla = edited?.vinted ? "vinted" : edited?.leboncoin ? "leboncoin" : edited?.ebay ? "ebay" : edited?.beebs ? "beebs" : null;
  useEffect(() => {
    if (!plateformesVisibles.includes("opla")) return;
    const src = sourceCopieOpla;
    if (!src || !plateformeSourceOpla || edited?.opla) return;
    const copie = deriverCopieOpla(src, { prixGeneral: price, generales });
    setEdited(prev => (!prev?.[plateformeSourceOpla] || prev?.opla) ? prev : { ...prev, opla: copie });
    setPlatformListings(prev => (prev?.platforms?.[plateformeSourceOpla] && !prev.platforms.opla)
      ? { ...prev, platforms: { ...prev.platforms, opla: { title: copie.title, description: copie.description, platform_fields: { ...copie.platform_fields } } } }
      : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCopieOpla, plateformeSourceOpla, edited?.opla, plateformesVisibles]);
  // ── Exemption extension « eBay seul + voie API » (2026-09-06, GO Nico) ──
  // L'écran d'accroche extension (extensionBlocked) protège une file qui
  // n'aurait PERSONNE pour l'exécuter. Quand le lot ne contient QUE eBay et
  // que ce compte publie eBay par le worker serveur (ebayVoieApi), il a un
  // exécuteur : on ne bloque pas. Toute autre plateforme dans le lot → garde
  // inchangée. Le RPC spend_coins_and_publish porte la même exemption, avec le
  // même prédicat (trigger cross_post_jobs_voie_ebay) — celle-ci n'est que le
  // reflet côté écran. Déclarée APRÈS plateformesPubliables, jamais avant
  // (TDZ, écran blanc 2.6.15).
  // Répartition du lot RÉELLEMENT publiable par voie — le seul calcul, lu par
  // l'exemption ci-dessous ET par tous les textes de l'écran 3 (07/09/2026).
  const voiesDuLot = repartirParVoie([...plateformesPubliables], ebayVoieApiReelle);
  const exemptionEbayApi = voiesDuLot.toutServeur;

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
    // (25/09) Une valeur d'UNE lettre en marque, couleur ou matière n'est pas
    // une réponse : l'insert la retire (sanitizeJobFields, suspect_values) et le
    // job part SANS elle — neuf refus Vinted « Marque » chez Jocabroc sur un
    // « S » tapé dans la carte du rayon. Elle compte donc comme manquante ici ;
    // une taille d'une lettre (« S », « M ») reste une taille.
    const valeurPourPlateforme = (p, key) => {
      const v = valeurBrutePourPlateforme(p, key);
      return key !== "taille" && valeurUneLettre(v) ? "" : v;
    };
    const valeurBrutePourPlateforme = (p, key) => {
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
    // ── LA CATÉGORIE QUI PARTIRA, PAS CELLE DE L'ICÔNE (24/09, jocabroc8) ──
    // Panier décoratif (job 80d0704f) : icône 📦 sans rayon eBay → preview
    // null → encart jamais monté ; la résolution par mot (IA parmi candidats)
    // avait posé 125072 « Paniers » sur la copie, dont Hauteur, Largeur,
    // Longueur et Type sont obligatoires. Aucune question avant le débit, le
    // mur tombait chez l'extension. La catégorie déjà résolue sur la copie est
    // celle du job : c'est elle qui décide des questions.
    const resolue = String(pf.ebayCategoryId ?? "").trim();
    if (resolue) return resolue;
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
    // (2026-09-24) L'option que l'annonce nomme déjà — même règle que Vinted,
    // Leboncoin et Beebs (moteur/listes.deduireOptionDuTexte) : pour un aspect
    // eBay à liste FERMÉE encore vide, le titre, puis l'objet IA, puis la
    // description. Posée par l'effet des défauts juste en dessous ; plusieurs
    // options nommées → la question reste, avec elles en tête.
    const textesEbay = textesDeLAnnonce({
      titre: edited.ebay?.title || initialListing?.titre || "",
      description: edited.ebay?.description || "",
      platformFields: { categorie_objet_ia: activeAiObjet ?? pf.categorie_objet_ia ?? null, categorie_verification: pf.categorie_verification ?? null },
    });
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
      const manquant = { name, state: "missing", value: "", sharedKey: src?.key, allowedValues, mode };
      if (!src?.key && isEbayClosedList(allowedValues, mode)) {
        const ded = deduireOptionDuTexte({ platform: "ebay", key: name, label: name, allowedValues, textes: textesEbay });
        if (ded?.valeur) return { ...manquant, deduit: { valeur: ded.valeur, source: ded.source } };
        if (ded?.candidats?.length > 1) return { ...manquant, allowedValues: listeCandidatsDabord(allowedValues, ded.candidats), candidats: ded.candidats };
      }
      return manquant;
    });
  }, [ebayRequiredPreview, edited, plateformesPubliables, activeAiObjet]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // L'option que l'annonce nomme (2026-09-24) — APRÈS les défauts sûrs et
      // le Département, qui gardent la priorité. Une pose, jamais deux.
      if (a.deduit?.valeur && a.state === "missing" && !(a.name in toSet)
          && !String(pfAspects[a.name] ?? "").trim() && !aspectDefaultsPoses.current.has(a.name)) {
        toSet[a.name] = a.deduit.valeur;
        aspectDefaultsPoses.current.add(a.name);
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
        // 06/09 (lot 2, aspects automatiques) : le serveur applique désormais
        // UNE règle partagée avec le worker API (_shared/ebay-aspects-ia.ts) :
        //   · SELECTION_ONLY → liste imposée et contrôlée exactement ;
        //   · FREE_TEXT à liste COURTE (≤ 60) → liste en suggestion, réponse
        //     recalée sur l'entrée de la liste (Couleur, Style, Type, Taille) ;
        //   · Marque → JAMAIS de liste (doctrine marques fantômes), recalée
        //     après coup ; listes longues → texte libre.
        // On envoie donc le mode, et la liste selon ces règles.
        const details = (ebayRequiredStatus ?? [])
          .filter(a => missing.includes(a.name))
          .map(a => {
            const liste = a.allowedValues ?? [];
            const envoyer = a.mode === "SELECTION_ONLY"
              ? liste.slice(0, 120)
              : (a.name !== "Marque" && liste.length && liste.length <= 60 ? liste : []);
            return { name: a.name, mode: a.mode ?? (liste.length ? "SELECTION_ONLY" : "FREE_TEXT"), allowedValues: envoyer };
          });
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
      const det = resolveArticleIconDetail({ initialListing, edited, pf, aiIcon: activeAiIcon, aiObjet: activeAiObjet });
      // MÊME garde-fou qu'à l'insert (2026-09-07) : les requis affichés à
      // l'écran doivent être ceux de la catégorie RÉELLEMENT publiée. Sans ça,
      // l'encart rouge réclamerait un « Produit » d'électroménager sur un
      // vêtement que le job enverra, lui, en Mode > Vêtements.
      // Depuis le 07/09 au soir il corrige l'ICÔNE : les TROIS plateformes en
      // profitent, plus seulement Leboncoin.
      const icon = gardeFouCategorie({
        icone: det.icon,
        sourceIcone: det.source,
        catalogId: initialListing?.vinted_catalog_id ?? null,
        genre: pf.univers || pf.genre || edited.vinted?.platform_fields?.genre || "",
        taille: pf.taille || initialListing?.taille || "",
        typeFiche: pf.categorie || initialListing?.categorie || "",
        familleFiche: initialListing?.famille || "",
        iconeSansIa: det.iconeSansIa ?? null,
      }).icone ?? det.icon;
      let path = null;
      if (platform === "vinted") path = getVintedCategoryPath(icon, pf.genre, edited[platform]?.title ?? "");
      if (platform === "leboncoin") path = getLbcCategoryPath(icon);
      if (platform === "beebs") path = getBeebsCategoryPath(icon, pf.genre);
      // MÊME clé que categoryKeyOf de l'extension (background.js) : chemin
      // joint par " > " — c'est elle qui écrit, nous qui lisons.
      // ── LE RAYON RÉSOLU, PAS L'ICÔNE (refonte 24/09, n°7 de Louis) ────────
      // Nouveau stepper : la clé des requis est le chemin RÉELLEMENT publié
      // (pré-calcul de la génération, ou choix de la personne) — un livre de
      // coloriage ne se voit plus réclamer l'ISBN de « Fiction ». L'ancien
      // stepper passe null et garde la clé de l'icône, à l'identique.
      const cle = cleCategorieRequis({
        cheminResolu: variante === "nouvelle" ? (rayonsParPf?.[platform]?.chemin ?? null) : null,
        cheminIcone: path,
      });
      if (cle) keys[platform] = cle;
    }
    // ── OPLA AUSSI (chantier du 24/09, nouveau stepper seulement) ────────
    // Sa catégorie est un CODE (MEN_SNEAKERS), pas un chemin : c'est la clé
    // de son catalogue (platform_category_aspects, source manual). Jusqu'ici
    // le stepper ne contrôlait JAMAIS un requis Opla — la pointure 44,5 d'une
    // basket n'était refusée qu'au dépôt (« Opla n'accepte pas les
    // demi-pointures »). L'ancien stepper ne change pas.
    if (variante === "nouvelle" && selected.has("opla") && edited.opla) {
      const code = String(rayonsParPf?.opla?.id ?? edited.opla.platform_fields?.oplaCategoryCode ?? "").trim();
      if (code) keys.opla = code;
    }
    return keys;
    // rayonsParPf : ne change que quand la résolution ou `edited` bougent —
    // `edited` est déjà une dépendance ; l'ancien chemin ignore sa valeur.
  }, [selected, edited, initialListing, activeAiIcon, activeAiObjet, rayonsParPf, variante]);

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
          // ── OPLA : LE RÉFÉRENTIEL EN TITRES (chantier du 24/09) ────────────
          // Ses listes sont des objets { code, title } (relevé de son API) ;
          // l'écran parle en titres (« 12 ans »), le serveur retraduit en code
          // (« 12Y ») au service du job (normaliserTailleOpla, même vocabulaire).
          if (platform === "opla") {
            rows = rows.map(r => ({
              ...r,
              allowed_values: Array.isArray(r.allowed_values)
                ? r.allowed_values.map(v => (v && typeof v === "object") ? String(v.title ?? v.code ?? "").trim() : String(v).trim()).filter(Boolean)
                : r.allowed_values,
            }));
          }
          // ── VINTED EXIGE UNE MARQUE (24/09, nouveau stepper) — cf. listes.js ──
          // Le catalogue n'apprend « brand » qu'au premier 400 d'une catégorie
          // (Encadrements : appris le jour même, à 12:04, sur le refus d'une
          // cliente). Avant ce 400, rien n'était demandé et le job partait
          // sans marque. Une ligne synthétique porte l'exigence — sauf
          // « Livres et médias », dont le formulaire n'a pas de champ Marque.
          if (platform === "vinted" && variante === "nouvelle" && !rows.some(r => r.field_key === "brand") && vintedExigeUneMarque(String(key).split(" > "))) {
            rows = [...rows, { field_key: "brand", field_label: "Marque", required: true, input_type: null, allowed_values: [], synthetique: "vinted_marque_exigee" }];
          }
          // ── VINTED EXIGE UNE COULEUR (25/09, nouveau stepper) — cf. listes.js ──
          // Même trou, un jour plus tard (Jocabroc : peinture, plateau barbotine).
          // La ligne porte la PALETTE Vinted (globale, 29 libellés, vintedColors.js)
          // pour que la question se réponde dans la liste, jamais en texte libre
          // qui ne se normaliserait pas. input_type null, exprès : c'est l'ABSENCE
          // de couleur qui bloque (le 400 réel), pas une couleur présente hors
          // palette — celle-là, vinted.js la fait choisir parmi les options
          // affichées, comme avant.
          // Une ligne `color` déjà connue du catalogue avec required=true passe
          // devant (le filtre .eq("required", true) plus haut) : la synthétique ne
          // comble que l'absence.
          if (platform === "vinted" && variante === "nouvelle" && !rows.some(r => r.field_key === "color") && vintedExigeUneCouleur(String(key).split(" > "))) {
            rows = [...rows, { field_key: "color", field_label: "Couleur", required: true, input_type: null, allowed_values: [...VINTED_COLORS], synthetique: "vinted_couleur_exigee" }];
          }

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
      // house_and_garden_type = « Univers* » de Maison & Jardin > Décoration
      // (Éclairage/Décoration murale/Objet décoratif…) — ni un genre ni un
      // produit. Du 17/07 au 07/09 cette clé renvoyait `null` EXPLICITE
      // (« aucune source app fiable ») — mais genericDedicatedTarget, écrit
      // plus tard en « parallèle exact », n'a jamais reçu ce cas et route la
      // clé par /_type$/ vers lbcProduit. Résultat vécu (josephinecerni,
      // 06/09 23:39, télémétrie champ_requis_bloquant « affiche » puis
      // « abandonne ») : le sélecteur de l'encart rouge ÉCRIVAIT pf.lbcProduit,
      // cette lecture ne le relisait jamais → « — » réaffiché, « 1 à
      // compléter » figé, Leboncoin exclu du clic sur un champ pourtant
      // rempli. La lecture suit désormais l'écriture : lbcProduit, que
      // leboncoin.js pose sur label[for$="_type"] — pour Décoration, c'est
      // précisément ce combobox Univers. Rien ne change dans le job.
      if (/_univers$|_universe$/.test(key)) return pf.univers || pf.genre;
      // ── UN SLOT PAR CLÉ (2026-09-07, feu vert Nico) ────────────────────────
      // Six feuilles Maison & Jardin (Décoration, Arts de la table, Bricolage,
      // Électroménager, Jardin & Plantes, Linge de maison) exigent DEUX
      // combobox — Univers/Type (`*_type`) ET Produit (`*_product`,
      // `decoration_type`) — que l'ancien routage envoyait sur le MÊME slot
      // lbcProduit : la 2e saisie écrasait la 1re à l'écran, l'IA faisait
      // pareil, et l'extension ne posait que le premier label _type. Cas
      // josephinecerni c324b5ee (07/09) : lbcProduit = « Autre » écrit sur
      // Type (écrasant « Cuisine et cuisson » pré-rempli), Produit jamais
      // rempli → « Ce champ est requis ». Désormais ces clés vivent CHACUNE
      // dans lbcAspects.<clé for=> (canal générique : lu juste après cette
      // source, écrit par setPlatformAspect) ; handlePublish recopie la
      // valeur du PREMIER combobox dans lbcProduit pour les extensions
      // ≤ 0.6.20, qui ne lisent que lui. baby_clothing_category et
      // clothing_category gardent leur slot dédié (routes bébé/Mode inchangées).
      if (key === "baby_clothing_category" || key === "clothing_category") return pf.lbcProduit;
      if (/_type$/.test(key) || /_product$/.test(key)) return null;
      return null;
    }
    if (platform === "opla") {
      // Opla (chantier du 24/09) : sa seule exigence contrôlable ici est la
      // taille (« size », grille par feuille). Sa catégorie est le rayon, jamais
      // un champ (CEST_LE_RAYON, champsDuRayon) ; ses couleurs et matières ne
      // sont pas requises.
      if (key === "size") {
        if (String(pf.taille ?? "").trim()) return pf.taille;
        // La copie Opla naît le plus souvent SANS taille : c'est le serveur qui
        // la prend sur la FICHE au départ du job (opla-completion), et
        // seulement si sa source est une capture, une synchro Vinted, un
        // relevé ou une saisie de la personne (« manuel », depuis le 24/09).
        // On juge ici la même valeur, avec la même règle — sinon la
        // question « Taille » se poserait à chaque dépôt Opla alors que la
        // fiche la connaît, et une pointure 44,5 de la fiche ne serait jamais
        // vue avant le dépôt.
        // La fiche : attributsBase quand l'init l'a lue, sinon la ligne passée
        // par le Stock (initialListing) — un brouillon repris saute l'init et
        // ne relit pas les attributs.
        const base = (attributsBase && typeof attributsBase === "object") ? attributsBase
          : (initialListing?.attributs && typeof initialListing.attributs === "object" ? initialListing.attributs : null);
        const a = base ? base.taille : null;
        const v = a && typeof a === "object" ? String(a.v ?? "").trim() : "";
        const source = a && typeof a === "object" ? String(a.source ?? "") : "";
        return v && /^(capture|vinted|releve|manuel)/.test(source) ? v : null;
      }
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
      // Un slot PAR CLÉ (2026-09-07) — miroir exact de genericKnownSource :
      // `*_type` / `*_product` n'ont plus de cible dédiée, le sélecteur écrit
      // lbcAspects.<clé> (setPlatformAspect). Seules les deux clés bébé/Mode
      // gardent lbcProduit.
      if (key === "baby_clothing_category" || key === "clothing_category") return "lbcProduit";
      return null;
    }
    if (platform === "beebs") {
      return { "Marque": "marque", "Pointure": "taille", "Taille": "taille", "État": "etat", "Matière": "matiere", "Couleur": "couleur", "Âge": "age", "Format du colis": "format_colis" }[key] ?? null;
    }
    if (platform === "opla") return { size: "taille" }[key] ?? null;
    return null;
  };

  const genericRequiredStatus = useMemo(() => {
    const out = {};
    // Le chemin de catégorie de la copie, pour le vocabulaire des tailles
    // (la table femme d'Opla ne vaut que sur sa branche « Femmes »).
    const cheminDe = (p) => p === "opla"
      ? (edited.opla?.platform_fields?.oplaCategoryPath ?? null)
      : (typeof genericCategoryKeys?.[p] === "string" ? genericCategoryKeys[p].split(" > ") : null);
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
        // ── Listes DÉPENDANTES Maison & Jardin (2026-09-07, relevé live) ─────
        // Sur les 6 feuilles où « Produit » dépend de l'Univers/Type, la liste
        // proposée est CELLE de la valeur courante du premier combobox — pas
        // la liste unique (souvent fausse : « Autres » seul sur Électroménager,
        // apprise sous Type = Autre) que le catalogue ne peut porter qu'à plat.
        // Premier combobox vide, ou valeur hors relevé : catalogue, comme avant.
        // Listes dependantes (Maison & Jardin) puis listes PLATES (2026-09-20) :
        // un champ obligatoire sans liste relevee est un champ bloque, juste avec
        // une autre tete. Les deux viennent du meme module, releves en live.
        const dependants = platform === "leboncoin"
          ? (lbcProduitsDependants(genericCategoryKeys?.[platform], key,
              (k) => String(genericKnownSource(platform, k, pf) ?? aspects[k] ?? "").trim())
             ?? lbcListePlate(genericCategoryKeys?.[platform], key))
          : null;
        const allowedValues = dependants ?? (Array.isArray(r.allowed_values)
          ? r.allowed_values.slice(0, 1000).map(v => String(v).trim()).filter(Boolean)
          : []);
        // « title » (appris par un 400 serveur sur Montres homme Vinted) : le
        // job porte TOUJOURS un titre (edited[platform].title, édité au step
        // Génération et posé tel quel à l'insert) — ce n'est jamais un requis
        // à saisir ici. Sans ce cas, aucune source ne le servait
        // (genericKnownSource ne connaît pas title) → « manquant » en texte
        // libre et CTA bloqué à tort, à chaque publication de la catégorie.
        if (key === "title") return { key, label, state: "ok", value: edited[platform]?.title ?? "", allowedValues };
        // ── `photos` et `description` : les DEUX JUMELLES DE `title` (2026-09-19) ─
        // Mêmes clés apprises d'un 400 serveur, même absence de source dans
        // genericKnownSource (qui ne connaît pour Vinted que brand · model ·
        // stockage · condition · color · size · material · isbn), donc même
        // faux « manquant » et même CTA bloqué à tort. `title` avait été
        // neutralisé ; ses deux jumelles ne l'avaient pas été.
        // Mesuré sur 7 jours : 6 questions posées pour rien — les photos
        // demandées à quelqu'un dont le job en portait 3, la description à
        // quelqu'un dont le job en portait 443 caractères. Ça a coûté les
        // 2 SEULS `publie_sans_plateforme` de la semaine (deux publications
        // parties SANS Vinted) et 2 des 7 abandons.
        // Ni l'une ni l'autre n'est un champ de formulaire : le job porte
        // TOUJOURS ses photos (processedPhotos, posées au step Photos — la
        // Génération ne tourne pas sans elles) et sa description (edited
        // [platform].description, écrite au step Génération).
        // ⚠️ La ligne catalogue OSCILLE : vinted/photos et vinted/description
        // sont à required=false aujourd'hui, elles étaient à true les 13→16/09
        // quand elles ont bloqué (le chargement ne prend que required=true,
        // cf. .eq("required", true) plus haut). La neutralisation est donc
        // posée ICI, côté écran, et tient quelle que soit la valeur du
        // catalogue au prochain relevé.
        // ⛔ Ceci ne retire AUCUNE protection : une description Vinted vide
        // reste bloquée par `descriptionVideVinted` (garde dédiée, qui dit où
        // l'écrire et ouvre la carte Vinted), et une publication eBay sans
        // photo reste refusée à l'insert du job. On retire une question, pas
        // un filet.
        if (key === "photos") {
          return { key, label, state: "ok", value: String(processedPhotos?.length ?? 0), allowedValues };
        }
        if (key === "description") {
          return { key, label, state: "ok", value: edited[platform]?.description ?? "", allowedValues };
        }
        const src = String(genericKnownSource(platform, key, pf) ?? "").trim();
        if (src) {
          // ── RAYON VINTED « NEUF SEULEMENT » FACE À UN ARTICLE D'OCCASION (25/09) ──
          // Beauté, soins, sous-vêtements (règle d'hygiène de Vinted), casques de
          // sécurité : la liste « État » du rayon ne porte QUE du neuf. Proposer
          // « Neuf avec étiquette » à un article « Bon état », c'est lui faire
          // écrire un mensonge (Nico, 25/09 : « ne jamais forcer neuf sur un
          // article d'occasion »). Ce n'est donc pas une question d'État : c'est
          // le RAYON qui est en cause. La ligne n'offre aucune valeur, bloque
          // Vinted pour ce clic (les autres plateformes partent) et dit quoi
          // faire : changer de rayon, ou laisser Vinted de côté.
          if (variante === "nouvelle" && rayonNeufSeulement({ platform, key, value: src, allowedValues })) {
            return {
              key, label: lang === "en" ? "Category" : "Rayon", state: "invalid", value: src, allowedValues: [],
              neufSeulement: true, blocking: true,
              message: messageRayonNeuf({ valeur: src }, lang === "en" ? "en" : "fr"),
            };
          }
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
          if (variante === "nouvelle") {
            // ── LA RÈGLE UNIQUE DU 24/09 (moteur/listes.js) — nouveau stepper ──
            // Cas Primark : Taille « XS / 34 » sur la grille enfant de Beebs,
            // « Petit colis » sur ses paliers de poids. Le jugement TRADUIT
            // d'abord (le palier que beebs.js posera, « XS » dans « XS / 34 /
            // 6 », « 12 ans » dans « 12Y », 38,5 = 38.5), puis dit si la liste
            // FAIT FOI (fermée, entière, pas un champ à recherche) : alors une
            // valeur hors liste BLOQUE — sauf rapprochement sûr, posé d'office
            // à l'écran Confirmer comme avant. Une liste qui ne fait pas foi
            // (Marque, relevé tronqué à 200) : présence = ok, la plateforme
            // tranche au dépôt — le comportement d'hier. La carte
            // (champsDuRayon) applique exactement ce jugement.
            const verdict = jugerValeurContreListe({ platform, key, value: src, allowedValues, cheminCategorie: cheminDe(platform) });
            if (!verdict.dans && target && allowedValues.length && allowedValues.length <= EBAY_CLOSED_LIST_MAX) {
              return {
                key, label, state: "invalid", value: src, dedicatedTarget: target,
                suggested: verdict.suggested, inputType: r.input_type,
                blocking: horsListeBloque({ regle: "nouvelle", platform, key, inputType: r.input_type, allowedValues, suggested: verdict.suggested }),
                allowedValues,
              };
            }
            return { key, label, state: "ok", value: src, allowedValues, inputType: r.input_type, dedicatedTarget: target };
          }
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
        if (generic) {
          if (variante === "nouvelle" && allowedValues.length && allowedValues.length <= EBAY_CLOSED_LIST_MAX) {
            // Même règle sur le canal générique (une valeur tapée en « Autre
            // valeur… », ou héritée d'un ancien job) : jugée contre la liste.
            const verdict = jugerValeurContreListe({ platform, key, value: generic, allowedValues, cheminCategorie: cheminDe(platform) });
            if (!verdict.dans) {
              return {
                key, label, state: "invalid", source: "generic", value: generic, dedicatedTarget: genericDedicatedTarget(platform, key),
                suggested: verdict.suggested, inputType: r.input_type,
                blocking: horsListeBloque({ regle: "nouvelle", platform, key, inputType: r.input_type, allowedValues, suggested: verdict.suggested }),
                allowedValues,
              };
            }
          }
          return { key, label, state: "ok", source: "generic", value: generic, allowedValues, dedicatedTarget: genericDedicatedTarget(platform, key) };
        }
        if (GENERIC_PREFILLED[platform]?.includes(key)) {
          return {
            key, label, state: "prefilled", allowedValues, inputType: r.input_type,
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
        return { key, label, state: "missing", value: "", allowedValues, inputType: r.input_type,
                 dedicatedTarget: genericDedicatedTarget(platform, key),
                 blocking: !(ferme && allowedValues.length === 0) };
      });
      // ── L'OPTION QUE L'ANNONCE NOMME DÉJÀ (2026-09-24, job fc5e4bff) ──────
      // Leboncoin « Arts de la table », Univers « Accessoire de table » : le
      // Produit valait « Plat apéritif », hors de la liste de cet univers, et la
      // question est partie chez le vendeur alors que le titre disait
      // « … plateau de service ». Désormais, AVANT toute question, un champ à
      // liste fermée hors liste, vide ou resté sur « Autre » cherche l'option
      // que nomment le titre, puis l'objet identifié par l'IA, puis la
      // description (moteur/listes.deduireOptionDuTexte — la même règle que le
      // serveur). Une option trouvée sans ambiguïté est POSÉE (effet plus bas)
      // et ne bloque rien ; plusieurs → la question reste, avec elles en tête
      // de liste. Sur les feuilles Maison & Jardin, le Produit trouvé ailleurs
      // que sous l'Univers courant emporte son Univers (la liste en dépend).
      // ⛔ Jamais une taille, une marque, l'état ou le colis (champDeductible) ;
      //    jamais un champ partagé de la fiche (taille, couleur, matière,
      //    marque — ils ont leur propre chemin) ; jamais par-dessus un
      //    rapprochement sûr déjà trouvé.
      const textes = textesDeLAnnonce({
        titre: edited[platform]?.title || initialListing?.titre || "",
        description: edited[platform]?.description || "",
        platformFields: {
          categorie_objet_ia: activeAiObjet ?? pf.categorie_objet_ia ?? null,
          categorie_verification: pf.categorie_verification ?? null,
        },
      });
      const chercher = ({ options }) => optionDepuisTextes({ options, textes });
      const feuilleMJ = platform === "leboncoin" ? lbcFeuilleDependante(genericCategoryKeys?.[platform]) : null;
      const enrichi = status.map((a) => {
        const aTrancher = a.state === "missing" || (a.state === "invalid" && !a.suggested)
          || (a.state === "ok" && estFourreTout(a.value));
        if (!aTrancher || !a.allowedValues?.length) return a;
        if (a.dedicatedTarget && SHARED_FIELD_KEYS.includes(a.dedicatedTarget)) return a;
        if (a.key === "title" || a.key === "photos" || a.key === "description") return a;
        let ded = deduireOptionDuTexte({ platform, key: a.key, label: a.label, allowedValues: a.allowedValues, textes });
        if (!ded) return a;
        let paire = null;
        // Maison & Jardin : le Produit introuvable sous l'Univers courant, ou
        // l'Univers lui-même à trancher → la paire nommée par l'annonce.
        if (feuilleMJ && (a.key === feuilleMJ.typeKey || (a.key === feuilleMJ.produitKey && !ded.valeur && !(ded.candidats?.length > 1)))) {
          const p = lbcPaireDepuisTextes(genericCategoryKeys?.[platform], chercher);
          if (p?.produit) {
            if (a.key === feuilleMJ.typeKey) {
              ded = { valeur: p.univers, source: p.source, candidats: [p.univers] };
              paire = { [p.produitKey]: p.produit };
            } else {
              ded = { valeur: p.produit, source: p.source, candidats: [p.produit] };
              paire = { [p.typeKey]: p.univers };
            }
          } else if (a.key === feuilleMJ.typeKey) {
            ded = { valeur: null, source: null, candidats: [] };
          }
        }
        if (ded.valeur && normAspectVal(ded.valeur) !== normAspectVal(a.value ?? "")) {
          return { ...a, suggested: ded.valeur, blocking: false,
                   deduit: { valeur: ded.valeur, source: ded.source, ...(paire ? { paire } : {}) } };
        }
        if (ded.candidats?.length > 1) {
          return { ...a, allowedValues: listeCandidatsDabord(a.allowedValues, ded.candidats), candidats: ded.candidats };
        }
        return a;
      });
      if (enrichi.length) out[platform] = enrichi;
    }
    return Object.keys(out).length ? out : null;
    // processedPhotos.length : la neutralisation de `photos` ci-dessus affiche
    // le compte réel — sans cette dépendance il resterait figé à celui du
    // premier rendu après une photo ajoutée ou retirée au step Photos.
    // attributsBase (24/09) : la taille Opla se juge sur la fiche quand la
    // copie n'en porte pas — la fiche arrive après le premier calcul.
  }, [genericAspectsCatalog, plateformesPubliables, edited, genericCategoryKeysSig, processedPhotos?.length, attributsBase, initialListing?.attributs, activeAiObjet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── L'OPTION LUE DANS L'ANNONCE EST POSÉE (2026-09-24) ─────────────────────
  // Pose ce que genericRequiredStatus a déduit du titre / de l'objet IA / de
  // la description (`deduit`), dans le canal que l'extension LIT — même routage
  // que la résolution IA de secours : champ dédié non partagé (univers,
  // lbcProduit) sinon canal générique (lbcAspects / vintedAspects /
  // beebsAspects). La trace `option_du_texte` part avec le job : « pourquoi
  // Plateau ? » a toujours une réponse.
  // ⛔ UNE écriture par (plateforme, champ, valeur) et par ouverture : si la
  //    personne choisit autre chose ensuite, on ne la recouvre jamais.
  const optionsDuTexteEcrites = useRef(new Set());
  useEffect(() => {
    if (!genericRequiredStatus) return;
    for (const [gp, list] of Object.entries(genericRequiredStatus)) {
      for (const a of list) {
        const d = a.deduit;
        if (!d?.valeur) continue;
        const cle = `${gp}|${a.key}|${d.valeur}`;
        if (optionsDuTexteEcrites.current.has(cle)) continue;
        optionsDuTexteEcrites.current.add(cle);
        for (const [k, v] of Object.entries(d.paire ?? {})) setPlatformAspect(gp, k, v);
        const versDedie = a.dedicatedTarget && !canalGeneriquePose(gp, a.key) && !SHARED_FIELD_KEYS.includes(a.dedicatedTarget);
        if (versDedie) setPlatformDedicatedField(gp, a.dedicatedTarget, d.valeur);
        else setPlatformAspect(gp, a.key, d.valeur);
        noterOptionDuTexte(gp, a.key, {
          valeur: d.valeur, source: d.source, avant: a.value ? String(a.value) : null,
          ...(d.paire ? { paire: d.paire } : {}), le: new Date().toISOString(),
        });
      }
    }
  }, [genericRequiredStatus]); // eslint-disable-line react-hooks/exhaustive-deps


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
  // ── TRACE DU MUR D'EXTENSION (2026-09-15) ─────────────────────────────────
  // Jusqu'ici, une publication refusée faute d'extension ne laissait RIEN en
  // base : ni log, ni colonne. Un mur et un abandon volontaire y étaient
  // indistinguables — c'est ce qui a permis à la régression du 04/08 de durer
  // six semaines sans que personne la voie. Même angle mort que les retraits du
  // 13/09 (cf. src/utils/journalRetraits.js) : `track()` ne fait qu'un
  // dataLayer.push côté navigateur, zéro écriture chez nous.
  // Best-effort, jamais bloquant : une télémétrie ne coûte jamais une vente.
  const logExtensionAbsente = (issue, info = {}) => {
    if (!userId) return;
    supabase.from("usage_logs")
      .insert({ user_id: userId, feature: "extension_absente", metadata: { ...info, issue } })
      .then(({ error }) => { if (error) console.warn("[stepper] extension_absente non journalisé :", error.message); });
  };
  const logChampBloquant = (issue, info) => {
    if (!userId || !info) return;
    supabase.from("usage_logs")
      .insert({ user_id: userId, feature: "champ_requis_bloquant", metadata: { ...info, issue } })
      .then(({ error }) => { if (error) console.warn("[stepper] champ_requis_bloquant non journalisé :", error.message); });
  };
  // Plateformes parties SANS une plateforme bloquée à ce clic — porté jusqu'à
  // l'écran de succès pour le dire nommément.
  const [publieesSansPf, setPublieesSansPf] = useState([]);
  // ── Ce que le NOUVEAU stepper garde pour son écran de suivi (24/09) ──────
  // Les exclues nommées du clic, la fournée à suivre dans la file, et le
  // « je ne sais plus » du prix d'achat. Inertes dans l'ancien stepper.
  const [exclusionsDuClic, setExclusionsDuClic] = useState([]);
  const [fournee, setFournee] = useState(null);
  const [prixAchatInconnu, setPrixAchatInconnu] = useState(false);
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
          const aspectOfLabel = Object.fromEntries(askable.map(a => [a.label, a]));
          for (const [label, v] of Object.entries(values)) {
            const a = aspectOfLabel[label];
            const s = typeof v === "string" ? v.trim() : "";
            if (!a || !s || s.toLowerCase() === "null") continue;
            // ── On écrit la CHAÎNE DE LA PLATEFORME (2026-09-05) : l'IA recopie
            // mal la typographie (« Jouets d'éveil » pour « Jouets d’éveil »,
            // job 2e4f88f1) — si sa réponse se rapproche d'une valeur relevée,
            // c'est cette valeur-là, caractère pour caractère, qui part.
            const exacte = (a.allowedValues ?? []).find(av => texteComparable(av) === texteComparable(s)) ?? s;
            // ── Route vers le champ que le handler LIT (2026-09-05) : une clé
            // que le canal générique SAUTE (LBC _type$ → lbcProduit, univers ;
            // Beebs Âge/Format du colis/État) écrite dans lbcAspects/beebsAspects
            // n'est jamais posée — c'est la cause réelle du job 2e4f88f1
            // (toy_type rempli, lbcProduit vide, Produit « requis » chez LBC).
            // Les champs partagés (marque/matiere/couleur/taille) gardent leur
            // chemin : setPlatformDedicatedField y poserait une trace d'édition
            // manuelle que les écritures IA ne doivent pas laisser.
            const versDedie = a.dedicatedTarget && !canalGeneriquePose(gp, a.key) && !SHARED_FIELD_KEYS.includes(a.dedicatedTarget);
            if (versDedie) setPlatformDedicatedField(gp, a.dedicatedTarget, exacte);
            else setPlatformAspect(gp, a.key, exacte);
          }
        } catch { /* micro-appel de secours : jamais bloquant */ }
      })();
    }
    // Deps par SIGNATURE (fix boucle 2026-07-16) : jamais l'objet
    // genericCategoryKeys/edited/initialListing (identités instables). La garde
    // genericResolvedFor borne déjà à une tentative par (plateforme, catégorie).
  }, [genericRequiredStatus, genericCategoryKeysSig]);

  // Trace d'une option lue dans l'annonce (2026-09-24) : elle part avec le job
  // (platform_fields.option_du_texte.<clé>) — d'où vient la valeur, et ce
  // qu'elle remplace. Purement documentaire : aucun handler ne la lit.
  function noterOptionDuTexte(platform, key, trace) {
    setEdited(prev => prev[platform] ? {
      ...prev,
      [platform]: {
        ...prev[platform],
        platform_fields: {
          ...prev[platform].platform_fields,
          option_du_texte: { ...(prev[platform].platform_fields?.option_du_texte ?? {}), [key]: trace },
        },
      },
    } : prev);
  }

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
  // pire que le problème qu'on règle. Ne s'applique QUE sur un article né de ce
  // parcours dont le prix d'achat n'est pas encore connu (prixAchatARenseigner,
  // 2026-09-15) : un article déjà chiffré, ou venu du Stock, ne le redemande pas.
  // Déclaré AVANT handlePublish, qui le lit : la closure suffirait, mais le
  // garder au-dessus évite toute zone morte temporelle à la relecture.
  const prixAchatNum = Number(String(prixAchatSaisi ?? "").replace(",", "."));
  // `prixAchatInconnu` (refonte 24/09) : « je ne sais plus » satisfait la
  // question sans écrire 0 — l'ancien stepper ne peut pas le lever (false).
  const prixAchatManquant =
    prixAchatARenseigner && !prixAchatInconnu &&
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
    // ── LE MUR EST TOMBÉ (2026-09-15, décision Nico) ──────────────────────────
    // Ici se trouvait : `if (extensionBlocked …) { setShowExtGate(true); return; }`
    // Ce `return` était placé AVANT createStockItem : il jetait tout le travail
    // de la personne — photos prises, quota d'annonce déjà consommé, prix
    // d'achat saisi, stepper parcouru en entier. Rien n'était créé, rien n'était
    // tracé, et elle recommençait de zéro le lendemain.
    // Mesuré sur 30 jours : 194 comptes sans extension, 300 générations,
    // ZÉRO job. Sur toute la vie de la garde : 286 comptes, 419 générations.
    //
    // La garde du 04/08 (commit df7a5d6) protégeait un DÉBIT — « on ne débite
    // jamais pour quelque chose qui n'est pas livré », 23 jobs de 13 comptes
    // dont 12 sur mobile, Pépites prises pour rien. Ce motif n'existe plus :
    // price_generate vaut 0 et il n'y a aucun price_publish. Ce qui est
    // consommé aujourd'hui, c'est le QUOTA D'ANNONCES — et il l'est à la
    // GÉNÉRATION, donc bien avant ce point. La garde ne protégeait plus rien ;
    // elle détruisait ce que le quota venait de facturer.
    //
    // COMPORTEMENT RÉTABLI (celui d'avant le 04/08) : l'article est créé, le job
    // part en 'pending' et ATTEND — exactement comme le job de quelqu'un dont
    // l'ordinateur est éteint. Le reste du système sait déjà le faire :
    // email-tunnel a un cas 1 dédié à `extension_last_seen_at IS NULL`, écrit le
    // 01/08 et devenu inatteignable le 04/08 (19 relances sur 12 comptes, puis
    // plus une seule). get-pending-jobs ne filtre les jobs ni sur l'âge ni sur
    // l'extension : le job repart au premier poll qui suit l'installation.
    //
    // L'accroche RESTE, comme INFORMATION : on dit que la publication attendra
    // l'extension, on ne jette plus rien. Et on le journalise, pour ne plus
    // jamais confondre un mur avec un abandon.
    if (extensionBlocked && !exemptionEbayApi) {
      logExtensionAbsente("publication_en_attente", {
        plateformes: [...selected],
        depuis: "clic_publier",
      });
    }
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
      const champsManquantsParPf = champsBloquantsParPlateforme(genericRequiredStatus);
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
      // Troisième terme (2026-08-11) : SANS ANNONCE GÉNÉRÉE. Il manquait, alors
      // que `publishChips` — qui compte les plateformes et calcule le total de
      // unités affiché sur le bouton — le filtre depuis toujours. Une
      // plateforme cochée dont la génération n'a pas rendu de copie partait
      // donc quand même : une ligne de job avec des platform_fields VIDES, et
      // un débit de plus que ce que le CTA annonçait. « Jamais un total faux »
      // vaut dans les deux sens.
      // (refonte 24/09) Les quatre filtres, dans le même ordre, vivent dans
      // regles.js (calculerExclusions) — et la liste des exclues est NOMMÉE :
      // le nouveau stepper la dit sur l'écran de suivi, plus jamais en silence.
      const exclusions = calculerExclusions({
        selected, platformSupport, platformListings,
        plateformesSansAdresse, champsManquantsParPf,
      });
      const { interdites: plateformesInterdites, aPublier: plateformesAPublier } = exclusions;
      // Ce qu'on dira à la fin (nouveau stepper) : les exclues autres que « champ
      // manquant » (celles-là passent par publieesSansPf, comme avant).
      const exclusRun = exclusions.exclues.filter(e => e.motif !== "champ_manquant");
      if (!plateformesAPublier.length) {
        // Rien de publiable ne restait. Le CTA est déjà gris dans ce cas
        // (publishChips), ce re-check attrape un état périmé ou une course.
        // Aucune unité engagée.
        const motifAucune = motifAucunePlateforme(exclusions);
        if (motifAucune === "interdites") {
          throw new Error(plateformesInterdites.map(p => motifSupport(p, "prohibited")).join(" "));
        }
        // Seules des plateformes à champ obligatoire manquant : INVITATION à
        // compléter (le champ vit dans l'encart rouge juste au-dessus), plus
        // jamais un « pas possible » sec. Trace règle 3 : ce refus n'existe
        // nulle part côté serveur sans elle.
        if (motifAucune === "champ_manquant") {
          for (const gp of plateformesChampManquant) logChampBloquant("bloque_au_clic", {
            platform: gp, champs: champsManquantsParPf[gp],
            categorie: genericCategoryKeys?.[gp] ?? initialListing?.categorie ?? null,
          });
          throw new Error(plateformesChampManquant.map(gp =>
            lang === "en"
              ? `${GENERIC_PLATFORM_LABELS[gp] ?? gp} is waiting for: ${champsManquantsParPf[gp].join(", ")}`
              : `${GENERIC_PLATFORM_LABELS[gp] ?? gp} attend : ${champsManquantsParPf[gp].join(", ")}`
          ).join(" · ") + (variante === "nouvelle"
            ? (lang === "en"
              ? " — answer in the questions block above, then publish again. Nothing was counted."
              : " — réponds dans le bloc de questions ci-dessus, puis republie. Rien n'a été décompté.")
            : (lang === "en"
              ? " — fill it in the red “Some info is missing to publish” box above, then publish again. Nothing was counted."
              : " — complète dans l'encart rouge « Il manque des infos pour publier » juste au-dessus, puis republie. Rien n'a été décompté.")));
        }
        // Aucune annonce générée : dire ÇA, et pas le message d'adresse — un
        // motif faux coûte plus cher qu'un motif générique.
        if (motifAucune === "sans_annonce") {
          throw new Error(lang === "en"
            ? "No listing was generated for the selected platforms. Go back to the previous step and generate them again."
            : "Aucune annonce n'a été générée pour les plateformes cochées. Reviens à l'étape précédente et relance la génération.");
        }
        // Seules des plateformes sans adresse étaient cochées.
        throw new Error(lang === "en"
          ? "Add your pickup address in Settings → “Leboncoin pickup address” before publishing on Leboncoin or Beebs."
          : "Renseigne ton adresse dans Réglages → « Adresse de remise Leboncoin » avant de publier sur Leboncoin ou Beebs.");
      }
      // ══ LA RÉSOLUTION — PRÉ-CALCULÉE À LA GÉNÉRATION, RECALCULÉE ICI AU MOINDRE DOUTE ══
      // Elle vivait ICI, en entier : genre auto-résolu, garde-fou d'insert,
      // catégorie par le mot, arbitrage IA, champs de chaque plateforme,
      // vérification du chemin, plausibilité de famille. Elle a DÉMÉNAGÉ dans
      // utils/resolutionPublication.js pour pouvoir tourner à la fin de la
      // génération : l'écran de publication ne peut pas montrer une catégorie
      // qui n'est calculée qu'une seconde plus tard, au clic. Le déménagement
      // n'a rien réécrit — cf. l'en-tête du module, et
      // scripts/verifier-deplacement-resolution.mjs qui le reprouve.
      //
      // ⛔ LE CHEMIN D'ORIGINE RESTE VIVANT, ET C'EST LUI QUI TRANCHE. Le
      //    pré-calcul peut manquer (article préparé avant l'OTA, brouillon
      //    repris, génération d'avant ce lot) ou être devenu faux (titre
      //    réécrit, champ corrigé au stepper, plateformes recochées).
      //    L'empreinte le dit, et on recalcule ici exactement comme avant.
      //    Une publication ne doit jamais échouer, ni partir avec moins de
      //    champs, parce qu'un pré-calcul a manqué : le doute coûte un calcul.
      const outilsResolution = {
        platformFieldsConfig, isConditionKey, defaultConditionFor, GENERIC_ASPECTS_PF_KEY,
        normAspectVal, resolveArticleIcon, resolveArticleIconDetail, OPLA_ETAT_PAR_LIBELLE,
      };
      const contexteResolution = {
        plateformes: plateformesAPublier,
        selected, edited, initialListing, sharedFields, sharedOverrides,
        activeAiIcon, activeAiObjet, origineCat, lang, supabase,
        ebayVoieApi: ebayVoieApiReelle,
        outils: outilsResolution,
      };
      const empreintePublication = signatureResolution(contexteResolution);
      const prevol = resolutionPrevolRef.current;
      const prevolUtilisable = Boolean(
        prevol
        && prevol.empreinte === empreintePublication
        && plateformesAPublier.every(p => prevol.resolution?.pfParPlateforme?.[p])
        // (24/09) Une panne passagère au pré-calcul (rayon par défaut retenu)
        // se RETENTE au clic : jamais reprise telle quelle.
        && !resolutionARetenter(prevol.resolution)
      );
      const resolution = prevolUtilisable
        ? prevol.resolution
        : await resoudrePublication(contexteResolution);
      console.log(
        `[publish] résolution ${prevolUtilisable ? "reprise du pré-calcul de la génération" : "recalculée au clic (filet)"}` +
        ` — ${plateformesAPublier.join(", ")}`
      );
      // Le refus « on n'a pas reconnu l'objet » était un throw à cet endroit
      // précis : il l'est resté, au mot près. Seule la résolution a cessé de
      // lever, pour qu'une génération ne casse pas sur une catégorie absente.
      //
      // ⛔ SAUF SI LA PERSONNE A DIT ELLE-MÊME OÙ ÇA VA (lot B). Le refus dit
      //    « on n'a pas reconnu l'objet, nomme-le dans le titre » — il n'a
      //    plus aucun sens quand elle vient de choisir le rayon à la main sur
      //    chaque plateforme du lot. C'était le mur : l'app savait dès la
      //    génération qu'elle ne saurait pas ranger l'article, se taisait, et
      //    ne le disait qu'au clic. Maintenant la carte le dit tout de suite
      //    (« Aucun rayon trouvé — choisis-le ici »), et le choix ouvre la
      //    porte au lieu de la laisser fermée.
      // ⛔ `some`, ET PLUS `every` (2026-09-20, passe 2). Le cas d'Ornella :
      //    elle choisit son rayon sur Vinted, coche Vinted + Opla, et le lot
      //    ENTIER est refusé — parce qu'Opla, elle, n'avait pas de choix. Un
      //    article n'est jamais bloqué partout parce qu'UNE plateforme n'a
      //    pas su se ranger. Dès qu'un rayon est choisi quelque part, la
      //    feuille de ce rayon nomme l'objet (objetDuRayonChoisi) et la
      //    cascade le traduit dans l'arbre de chaque plateforme : le refus
      //    global n'a plus lieu d'être, et il ne se déclenche d'ailleurs plus
      //    (activeAiObjet n'est plus vide). Cette ligne reste la ceinture.
      const unRayonChoisi = plateformesAvecRayonChoisi(edited).length > 0;
      if (resolution.refus && !unRayonChoisi) throw new Error(resolution.refus.message);
      const { pfParPlateforme = {}, motCategorie } = resolution;
      // ── LE CLASSEMENT PAR ÂGE SE RELIT ICI, PAS DANS LE PRÉ-CALCUL ────────
      // Ces deux valeurs servent, après publication, à ranger la réponse de
      // l'utilisateur sur l'ARTICLE. Les prendre au pré-calcul ferait ranger
      // ce que l'écran savait AVANT que la question soit posée : quelqu'un qui
      // répond « PEGI 12 » au stepper verrait sa réponse perdue. On les relit
      // donc à frais, sur les mêmes deux sources et dans le même ordre.
      // ── LE CLASSEMENT PAR ÂGE : ON LE REPREND AVANT DE LE REDEMANDER ──────
      // Trois sources, dans cet ordre, la première qui répond gagne :
      //   1. la RÉPONSE de l'utilisateur, déjà dans la copie Vinted — c'est le
      //      stepper ou le mini-éditeur ; elle prime sur tout ;
      //   2. l'ARTICLE lui-même (inventaire.attributs.classement_age) : il l'a
      //      déjà tranché une fois, on ne le redemande jamais ;
      //   3. le TEXTE de l'annonce, s'il l'écrit noir sur blanc (« PEGI 12 »).
      // ⛔ Rien d'autre. Pas de déduction depuis le titre du jeu, pas de valeur
      //    par défaut : un classement faux fait retirer une annonce.
      const classementUtilisateur = String(
        edited?.vinted?.platform_fields?.vintedAspects?.[VINTED_CHAMP_CLASSEMENT] ?? ""
      ).trim();
      const classementFiche = String(initialListing?.attributs?.classement_age?.v ?? "").trim();
      // Le pré-calcul rend les MÊMES objets à chaque clic : sans copie, une
      // seconde publication repartirait des champs déjà enrichis par la
      // première, et le plafond photo Leboncoin s'appliquerait deux fois.
      // 🚨 LE RAYON CHOISI PAR LA PERSONNE SE REPOSE ICI, APRÈS LE CALCUL.
      //    C'est le garde-fou nº1 du lot B, et c'est le SEUL endroit du
      //    chemin de publication qui en a besoin. La résolution (lot A) ne
      //    connaît pas les choix humains et n'a pas été touchée : elle peut
      //    repartir autant de fois qu'elle veut — pré-calcul repris ou filet
      //    déclenché par un titre retouché —, elle parle avant, donc elle
      //    perd. Prouvé par scripts/rayon-choisi-selftest.mjs.
      const champsResolus = champsAvecRayonsChoisis(pfParPlateforme, edited, plateformesAPublier);
      // `let` et non `const` (2026-09-19) : la porte étant ouverte plus haut,
      // une plateforme peut arriver ici sans qu'AUCUN chemin de catégorie
      // n'ait abouti. Elle est alors écartée du lot AVANT le débit, plus bas.
      // (refonte 24/09) La construction des lignes vit dans regles.js
      // (construireJobs) : photos du JOB par plateforme (plafond Leboncoin par
      // feuille, forme { type, url } garantie), adresse de remise relue au
      // clic, titre Vinted normalisé — mot pour mot le code qui vivait ici.
      const construction = construireJobs({
        plateformes: plateformesAPublier, champsResolus, processedPhotos, lbcAddress,
        userId, inventaireId: addToStock ? currentInvId : null, photoOption, edited, price, ebayVoieApiReelle,
        outils: { entreesPhotos, getLbcFreePhotoQuota, normalizeVintedTitle },
      });
      if (construction.erreur === "ebay_sans_photo") {
        throw new Error(lang === "en"
          ? "eBay: this item has no photo. eBay requires at least one image — add a photo before publishing."
          : "eBay : cet article n'a aucune photo. eBay exige au moins une image — ajoute une photo avant de publier.");
      }
      for (const ligne of construction.journal) console.log(ligne);
      let rows = construction.rows;
      // ══ LA CONTREPARTIE DE LA PORTE — AUCUN JOB SANS CATÉGORIE (2026-09-19) ══
      // La case n'est plus grisée sur un simple trou de mapping par icône : le
      // mot et l'arbitrage ont le droit d'essayer. Mais s'ils échouent AUSSI,
      // le job partirait sans chemin — et c'est le pire des états, mesuré dans
      // les content scripts : vinted.js rend « platform_fields.categoryPath
      // absent — article non mappé vers le catalogue Vinted […] compléter
      // src/utils/vintedCategories.js », leboncoin.js et ebay.js ont leur
      // équivalent. Un message de développeur, montré à la personne, APRÈS le
      // débit. Une case grisée honnête valait mieux que ça.
      // On écarte donc la plateforme ICI, avant le débit — exactement comme
      // une plateforme sans annonce générée ou sans adresse de remise.
      // ⛔ Beebs avec `categorie_a_choisir` n'est PAS écartée : c'est le
      //    chemin prévu, son content script POSE la question sur le
      //    formulaire (beebs.js, « Beebs n'a pas de rayon reconnu pour … »).
      // ⛔ Opla n'est pas concernée : sa catégorie est posée côté serveur par
      //    get-pending-jobs, et son pré-vol demande quand il ne sait pas.
      // (refonte 24/09) La table des chemins par plateforme et le filtre vivent
      // dans regles.js (plateformesSansChemin) — même règle, mêmes exceptions.
      const sansCategorie = plateformesSansChemin(rows);
      if (sansCategorie.length) {
        console.warn(`[publish] écartées avant débit, aucun chemin de catégorie trouvé : ${sansCategorie.join(", ")}`);
        rows = rows.filter(r => !sansCategorie.includes(r.platform));
        const pfExclue = (p) => construction.rows.find(r => r.platform === p)?.platform_fields ?? {};
        exclusRun.push(...sansCategorie.map(p => ({
          platform: p,
          // (25/09) Rayon refusé, aucun rayon sûr à sa place : c'est une
          // QUESTION au vendeur (sa carte montre les candidats), pas un
          // « on ne sait pas ranger ».
          // (24/09) Rayon par défaut retenu sur une panne : il ATTEND (jamais le
          // fourre-tout) — l'écran dit de republier pour réessayer.
          motif: pfExclue(p).rayon_a_choisir ? "rayon_a_choisir"
            : pfExclue(p).rayon_a_reessayer ? "rayon_a_reessayer" : "sans_rayon",
        })));
        if (!rows.length) {
          // (25/09) Un rayon est À CHOISIR : on le dit, on dit où — et la carte
          // de la plateforme le montre, candidats en tête, même quand la
          // question n'est apparue qu'à ce clic (pré-calcul absent ou périmé).
          const aChoisir = sansCategorie.filter(p => pfExclue(p).rayon_a_choisir);
          if (aChoisir.length) {
            if (!prevolUtilisable) {
              resolutionPrevolRef.current = { empreinte: empreintePublication, resolution };
              setResolutionAffichee(resolution);
            }
            const noms = aChoisir.map(p => PLATFORM_LABELS[p] ?? p).join(", ");
            throw new Error(lang === "en"
              ? `Pick the ${noms} category on its card: the category we had in mind was ruled out, and we found none we're sure of. Nothing was charged.`
              : `Choisis le rayon ${noms} sur sa carte : celui qu'on envisageait a été écarté, et on n'en a trouvé aucun de sûr. Rien n'a été débité.`);
          }
          // (24/09) Une panne passagère n'est pas « on ne sait pas ranger » :
          // on dit d'attendre et de republier — rien n'a été débité.
          if (sansCategorie.every(p => construction.rows.find(r => r.platform === p)?.platform_fields?.rayon_a_reessayer)) {
            throw new Error(lang === "en"
              ? `The ${sansCategorie.map(p => PLATFORM_LABELS[p] ?? p).join(", ")} category could not be found just now (service briefly unavailable). Nothing was charged — publish again in a moment.`
              : `Le rayon ${sansCategorie.map(p => PLATFORM_LABELS[p] ?? p).join(", ")} n'a pas pu être trouvé à l'instant (service momentanément indisponible). Rien n'a été débité — republie dans un instant.`);
          }
          // Plus rien à publier : on le dit, et on dit le GESTE — nommer
          // l'objet dans le titre, comme la règle (a) plus haut. Jamais un
          // nom de champ interne, jamais « non vendable » : la plateforme
          // vend cet article, c'est nous qui ne savons pas le ranger.
          throw new Error(lang === "en"
            ? `We couldn't find a category on ${sansCategorie.map(p => PLATFORM_LABELS[p] ?? p).join(", ")} for this item. Name the object in the title (e.g. "storage box", "jacket") or regenerate the listing, then publish again. Nothing was charged.`
            : `On n'a pas trouvé de catégorie sur ${sansCategorie.map(p => PLATFORM_LABELS[p] ?? p).join(", ")} pour cet article. Nomme l'objet dans le titre (« boîte de rangement », « veste »…) ou régénère l'annonce, puis republie. Rien n'a été débité.`);
        }
        // Il reste des plateformes publiables : elles partent, et celle-là
        // est laissée de côté SANS être débitée — même comportement que
        // `plateformesSansAnnonce`, qui est écartée en silence depuis
        // toujours quand il reste au moins une plateforme. (Le dire à
        // l'écran demanderait un récapitulatif de fin de publication, qui
        // n'existe pas ici : à traiter à part, pas en passant.)
      }
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
      // ── PREUVE PAR LES VALEURS OFFERTES (2026-09-12, GO Nico) ─────────────
      // Le pendant du garde-fou d'escamotage, côté eBay : quand AUCUN aspect
      // obligatoire de la catégorie ne peut décrire l'objet — pas même par son
      // nom de tête, ni via le libellé de la feuille — c'est un signe que la
      // CATÉGORIE est fausse, pas qu'il manque une information. Cas fondateur :
      // le sac doré de sandrine_mimi en 163570, dont l'aspect « Type » ne
      // proposait que Sangle/poignée, Charme, Porte-clés…
      // ⛔ ÇA NE BLOQUE RIEN, ET ÇA NE CORRIGE RIEN. On dépose une trace sur le
      //    job, avec les valeurs qui la prouvent — c'est elle qui permettra à un
      //    needs_user de dire « ta catégorie est douteuse » au lieu de « remplis
      //    ce champ ». Un throw ici bloquerait des articles légitimes, ce qui
      //    est exactement l'erreur qu'on corrige.
      // ⚠️ Le verdict lu est le plus LÂCHE (cf. valeurDecritLObjet) : une seule
      //    description, même approximative, suffit à se taire. Mesuré sur les 21
      //    couples (mot, catégorie) des publications eBay réussies du parc :
      //    0 faux positif.
      if (ebayRow && motCategorie && Array.isArray(ebayRequiredFull) && ebayRequiredFull.length) {
        try {
          const cheminE = ebayRow.platform_fields.ebayCategoryPath;
          const feuilleE = Array.isArray(cheminE) && cheminE.length ? cheminE[cheminE.length - 1] : null;
          const verdicts = ebayRequiredFull
            .map(a => ({ aspect: a.name, r: valeurDecritLObjet(motCategorie, a.allowedValues, feuilleE) }))
            .filter(v => v.r);
          if (verdicts.length && !verdicts.some(v => v.r.niveau !== "aucun")) {
            ebayRow.platform_fields.categorie_preuve_aspects = {
              mot: motCategorie,
              feuille: feuilleE,
              categorie_id: ebayRow.platform_fields.ebayCategoryId ?? null,
              aspects_sans_valeur_descriptive: verdicts.map(v => v.aspect),
              // La liste qui PROUVE, tronquée : elle doit tenir dans un message.
              valeurs_offertes: Object.fromEntries(
                ebayRequiredFull
                  .filter(a => Array.isArray(a.allowedValues) && a.allowedValues.length)
                  .slice(0, 3)
                  .map(a => [a.name, a.allowedValues.slice(0, 12)])
              ),
              motif: `aucun aspect obligatoire de « ${feuilleE ?? ebayRow.platform_fields.ebayCategoryId} » ` +
                `ne peut décrire « ${motCategorie} » — catégorie à vérifier avant de demander quoi que ce soit`,
            };
            console.warn(`[publish] ebay — ${ebayRow.platform_fields.categorie_preuve_aspects.motif}`);
          }
        } catch (e) {
          console.warn("[publish] ebay — preuve par les valeurs offertes indisponible :", e?.message ?? e);
        }
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
        // (refonte 24/09) La garde vit dans regles.js (gardeAspectsEbay) —
        // mêmes champs connus, même normalisation que ebay.js, même
        // rapprochement automatique (la valeur du JOB est corrigée), même
        // doctrine « liste = suggestion » (seul SELECTION_ONLY refuse). Ici on
        // ne fait plus que dire ce qu'elle a trouvé, avec les mêmes messages.
        const verdict = gardeAspectsEbay({ pfE, ebayRequiredFull, outils: { nearestAllowedValue, listeFaitFoi } });
        for (const r of verdict.rapproches) {
          console.log(`[publish] eBay ${r.name} : « ${r.val} » rapproché en « ${r.nearest} » (liste fermée de la catégorie)`);
        }
        for (const h of verdict.horsListe) {
          console.warn(`[publish] eBay ${h.name} : « ${h.val} » absent de la liste (${h.count} valeurs, mode=${h.mode}) — envoyé tel quel, la liste n'est qu'une suggestion.`);
        }
        const invalidMessages = verdict.invalides.map(v => v.ageLike
          ? tpl("stepPublishEbayValueNotAllowed", { name: v.name, value: v.val, sample: v.sample }) + ` ${t("stepPublishEbayAxisHint")}`
          : tpl("stepPublishEbayValueNotAllowedPick", { name: v.name, value: v.val, count: v.count }));
        const guardMessages = [];
        if (verdict.missingEmpty.length) {
          guardMessages.push(tpl("stepPublishEbayRequiredMissing", { fields: verdict.missingEmpty.join(", ") }));
        }
        guardMessages.push(...invalidMessages);
        if (guardMessages.length) throw new Error(guardMessages.join(" "));
      }
      // ── LA CATÉGORIE RÉSOLUE REVIENT DANS LA FICHE (2026-09-15) ──────────
      // Tout ce qui vient d'être calculé pour partir — chemin de catégorie par
      // plateforme, genre auto-résolu, couleurs éclatées, taille convertie au
      // libellé de la plateforme, aspects eBay rapprochés — était jusqu'ici
      // JETÉ avec la variable locale `rows` : la prochaine publication du même
      // article refaisait tout le chemin, appel IA de vérification compris.
      // On le recopie dans `edited`, donc dans le brouillon, donc dans la fiche
      // en base. Aucune valeur écrasée : on fusionne par-dessus ce qui existe.
      setEdited(prev => {
        const suivant = { ...prev };
        for (const row of rows) {
          if (!suivant[row.platform]) continue;
          suivant[row.platform] = {
            ...suivant[row.platform],
            platform_fields: { ...(suivant[row.platform].platform_fields ?? {}), ...(row.platform_fields ?? {}) },
          };
        }
        return suivant;
      });
      // Débit des pièces + insertion des jobs en UNE transaction serveur :
      // prix et user imposés côté serveur (coin_config + auth.uid()), insert
      // raté = zéro pièce débitée. Remplace check_publish_quota + insert +
      // log_publish pour les clients pièces.
      // ── UN APPEL, ET UNE SECONDE CHANCE POUR LES AUTRES (refonte 24/09) ──
      // Nouveau stepper seulement : quand le RPC refuse `already_published`
      // pour UNE plateforme, les autres repartent aussitôt (un seul re-essai)
      // au lieu de faire échouer tout l'appel — la refusée est dite sur
      // l'écran de suivi, avec son état. L'ancien stepper garde le refus en
      // bloc, à l'identique (un seul passage de boucle, même appel).
      let rowsEnvoyees = rows;
      let refuseesServeur = [];
      let pubRes = null;
      let pubErr = null;
      for (let tentative = 0; ; tentative++) {
        const reponse = await supabase.rpc("spend_coins_and_publish", {
          p_photo_option: photoOption,
          p_jobs: rowsEnvoyees,
        });
        pubRes = reponse.data;
        pubErr = reponse.error;
        if (pubErr) break;
        if (variante === "nouvelle" && tentative === 0 && pubRes?.allowed === false && pubRes.reason === "already_published") {
          const refusees = (Array.isArray(pubRes.platforms) ? pubRes.platforms : []).filter(p => PLATFORM_LABELS[p]);
          const restantes = rowsEnvoyees.filter(r => !refusees.includes(r.platform));
          if (refusees.length && restantes.length) {
            setSelected(prev => new Set([...prev].filter(p => !refusees.includes(p))));
            refuseesServeur = refusees;
            rowsEnvoyees = restantes;
            continue;
          }
        }
        break;
      }
      // Le vrai motif en clair (refonte) ; l'ancien stepper garde le générique.
      if (pubErr) throw new Error(variante === "nouvelle"
        ? (lang === "en"
            ? `The server refused the publication (${pubErr.message}). Nothing was counted — try again in a moment.`
            : `Le serveur a refusé la publication (${pubErr.message}). Rien n'a été décompté — réessaie dans un instant.`)
        : t("genericError"));
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
        // Plateforme EN PAUSE (platform_health, 2026-09-09) : le RPC refuse le
        // lot AVANT tout débit et rend les textes utilisateur (message_fr/en).
        // On arme le grisage tout de suite (sans attendre la relecture à 60 s),
        // on sort la plateforme de la sélection, et on dit la phrase écrite en
        // base — l'utilisateur relance sur les autres plateformes d'un tap.
        if (pubRes.reason === "platform_paused") {
          const plats = (Array.isArray(pubRes.platforms) ? pubRes.platforms : []).filter(p => PLATFORM_LABELS[p]);
          const textes = Object.fromEntries(plats.map(p => {
            const m = pubRes.messages?.[p];
            return [p, (lang === "en" ? (m?.en || m?.fr) : m?.fr) || null];
          }));
          setPausedPlatforms(prev => [...new Set([...prev, ...plats])]);
          setPausedReasons(prev => ({ ...prev, ...textes }));
          setSelected(prev => { const s = new Set(prev); plats.forEach(p => s.delete(p)); return s; });
          throw new Error(plats.map(p => messagePause(tpl, textes, p, PLATFORM_LABELS[p])).join(" "));
        }
        // Garde serveur anti-republication (2026-07-25, S7) : le RPC refuse un
        // job pour une plateforme déjà en ligne ou déjà en file — dernier filet
        // quand le griséage front n'a pas suffi (chemin Lens, course).
        if (pubRes.reason === "already_published") {
          // ── L'ÉTAT, PAS « RETIRE OU DÉCOCHE » (2026-09-23, cas Louis) ─────
          // Le RPC refuse en bloc dès qu'UNE plateforme a un dépôt publié, en
          // file ou en attente. On dit, pour chacune, ce qui l'occupe et le
          // geste qui débloque (utils/etatsPublication.js) — et on la SORT du
          // lot : le tap suivant publie les autres, sans rien décocher à la main.
          const refusees = (Array.isArray(pubRes.platforms) ? pubRes.platforms : []).filter(p => PLATFORM_LABELS[p]);
          setSelected(prev => new Set([...prev].filter(p => !refusees.includes(p))));
          throw new Error(messageRefusPublication(refusees, {
            publiees: publishedSet, enFile: queuedSet, attentes: fetchedAttentes, lang,
          }));
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
      // ── L'ARTICLE QUITTE LES BROUILLONS (2026-09-15) ────────────────────
      // Publier EST le geste. Même fonction que le bouton « Ajouter au stock »
      // de la carte de brouillon — un seul chemin de code, deux points
      // d'entrée. Best-effort : la publication est partie, elle reste partie,
      // et le filet « aucun job » sortirait l'article de la liste de toute
      // façon si cette écriture-ci ratait.
      if (currentInvId) sortirDuBrouillon(supabase, { userId, inventaireId: currentInvId });
      onJobsQueued?.(currentInvId ?? null, variante === "nouvelle" ? rowsEnvoyees.map(r => r.platform) : plateformesAPublier);
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
      // ── LE PRIX D'ACHAT SAISI ATTERRIT SUR LA LIGNE (2026-09-15) ─────────
      // Avant ce lot, il n'existait qu'un chemin : createStockItem(prixAchat),
      // qui CRÉAIT la ligne avec. Depuis que la ligne naît au débit, ce chemin
      // ne passe plus — et sans ce bloc, le montant saisi au stepper serait
      // simplement jeté. VIDE ≠ ZÉRO : un champ vide n'écrit rien (on ne
      // remplace pas « je ne sais pas » par 0), un 0 tapé s'écrit et lève le
      // drapeau « je ne sais plus ».
      if (currentInvId && prixAchatARenseigner
          && String(prixAchatSaisi ?? "").trim() !== "" && Number.isFinite(prixAchatNum) && prixAchatNum >= 0) {
        const { error: paErr } = await supabase
          .from("inventaire")
          .update({ prix_achat: prixAchatNum, prix_achat_inconnu: false })
          .eq("id", currentInvId)
          .eq("user_id", userId)
          .select("id");
        if (paErr) console.error(`[FillSell] prix_achat NON persisté sur inventaire ${currentInvId} —`, paErr.message);
        else setPrixAchatBase({ valeur: prixAchatNum, inconnu: false });
      }
      // « Je ne sais plus » (refonte 24/09, nouveau stepper seulement) : le
      // DRAPEAU, jamais un 0 écrit à la place d'un « je ne sais pas » (règle
      // du 03/08). L'ancien stepper ne peut pas lever prixAchatInconnu.
      if (currentInvId && prixAchatARenseigner && prixAchatInconnu) {
        const { error: piErr } = await supabase
          .from("inventaire")
          .update({ prix_achat_inconnu: true })
          .eq("id", currentInvId)
          .eq("user_id", userId)
          .select("id");
        if (piErr) console.warn("[publish] prix_achat_inconnu non posé sur l'article :", piErr.message);
        else setPrixAchatBase({ valeur: null, inconnu: true });
      }
      // ── LES RÉPONSES SAISIES VONT AUSSI SUR LA FICHE (refonte 24/09) ──────
      // Nouvelle peau seulement : le bloc de questions promet « chaque réponse
      // s'écrit aussi sur la fiche ». Seuls les champs partagés où la personne
      // a répondu partent, en source « manuel » — le rang le plus haut du
      // trigger inventaire_attributs_fusion (migration 20260907000000), qui
      // fusionne : rien d'autre n'est écrasé. Best-effort : la publication est
      // partie, un échec ici ne doit pas le contredire.
      if (variante === "nouvelle" && currentInvId && (reponsesFiche.size || Object.keys(reponsesFicheValeurs).length)) {
        const attributs = {};
        const maintenant = new Date().toISOString();
        for (const k of reponsesFiche) {
          if (!SHARED_FIELD_KEYS.includes(k)) continue;
          const val = String(sharedFields?.[k] ?? "").trim();
          if (val) attributs[k] = { v: val, source: "manuel", at: maintenant };
        }
        // ── LES RÉPONSES DONNÉES À UNE PLATEFORME (chantier du 24/09) ──────
        // Taille Beebs choisie dans SA grille, taille Opla sans demi-pointure :
        // la réponse est la bonne pour cette plateforme, pas forcément le fait
        // de l'article (une fiche « XS » ne devient pas « 12 ans » parce qu'un
        // rayon enfant a été choisi ; une pointure 44,5 ne devient pas 44
        // parce qu'Opla n'a pas de demi-pointures). Elle ne va sur la fiche
        // que si la fiche NE PORTE RIEN : là, c'est la première réponse, et on
        // ne la redemandera pas. Le texte du vendeur n'est jamais écrasé.
        for (const [k, val] of Object.entries(reponsesFicheValeurs)) {
          if (attributs[k] || !SHARED_FIELD_KEYS.includes(k)) continue;
          const brut = initialListing?.attributs?.[k];
          const dejaLa = brut && typeof brut === "object" ? String(brut.v ?? "").trim() : String(brut ?? "").trim();
          const v = String(val ?? "").trim();
          if (!dejaLa && v) attributs[k] = { v, source: "manuel", at: maintenant };
        }
        if (Object.keys(attributs).length) {
          const { error: atErr } = await supabase
            .from("inventaire")
            .update({ attributs })
            .eq("id", currentInvId)
            .eq("user_id", userId)
            .select("id");
          if (atErr) console.warn("[publish] réponses non rangées sur la fiche :", atErr.message);
        }
      }
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
      // ── LA RÉPONSE DONNÉE À LA MAIN SE RANGE SUR L'ARTICLE (2026-09-20) ────
      // Le classement par âge est le SEUL champ du domaine que ni le titre ni
      // la catégorie ne donnent : quand la personne le tranche au stepper, sa
      // réponse doit survivre au job. Rangée sur l'ARTICLE avec la source
      // `manuel` — le rang le plus haut du trigger de fusion (migration
      // 20260907000000) : plus rien ne l'écrase, et le parcours suivant la
      // relit au lieu de reposer la question.
      // ⛔ Seule la réponse de l'UTILISATEUR est gardée. Une valeur lue dans le
      //    texte de l'annonce n'est pas rangée ici : elle est déjà dans le
      //    texte, elle se relit toute seule, et l'y recopier reviendrait à
      //    faire passer une lecture pour une décision.
      if (currentInvId && classementUtilisateur && classementUtilisateur !== classementFiche) {
        const { error: clErr } = await supabase
          .from("inventaire")
          .update({ attributs: { classement_age: { v: classementUtilisateur, source: "manuel", at: new Date().toISOString() } } })
          .eq("id", currentInvId)
          .eq("user_id", userId)
          .select("id");
        if (clErr) console.warn("[publish] classement par âge non gardé sur l'article :", clErr.message);
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
      // (refonte 24/09) Ce que l'écran de suivi dira : les exclues NOMMÉES
      // (adresse, interdite, sans annonce, sans rayon, refusée par le serveur)
      // et la fournée à suivre dans la file.
      if (variante === "nouvelle") {
        setExclusionsDuClic([
          ...exclusRun,
          ...refuseesServeur.map(p => ({
            platform: p, motif: "refusee_serveur",
            texte: messageRefusPublication([p], { publiees: publishedSet, enFile: queuedSet, attentes: fetchedAttentes, lang }),
          })),
        ]);
        setFournee({ inventaireId: currentInvId ?? null, plateformes: rowsEnvoyees.map(r => r.platform), depuis: new Date().toISOString() });
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
  const plateformesBloqueesChamps = calculerPlateformesBloqueesChamps(plateformesPubliables, genericRequiredStatus);
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
      // ⛔ DÉFAUT Nº3 : PLUS JAMAIS « PUBLIER SUR 0 PLATEFORME ». Un bouton
      //    d'action qui annonce zéro action est un écran mort : il se
      //    présentait comme cliquable, ne faisait rien, et ne disait pas quoi
      //    faire. On dit le GESTE à la place — la rangée de plateformes est
      //    juste au-dessus depuis ce lot (défaut nº5).
      if (n === 0) return lang === "en" ? "Pick at least one platform" : "Choisis au moins une plateforme";
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
  // ── GARDE « DESCRIPTION VINTED VIDE » (2026-09-12, dossier Anaïs) ────────
  // Vinted refuse toute création d'annonce sans description (HTTP 400 « Le
  // champ Description doit être renseigné ») ; on le sait AVANT le clic.
  // BORNÉE au stepper, sur la COPIE Vinted qui part dans le job
  // (edited.vinted.description) — JAMAIS sur la colonne inventaire : un
  // article importé du dressing n'a pas de description en base et c'est
  // normal (la republication la capture live). Ici il n'y a pas de capture,
  // c'est une NOUVELLE annonce : la copie vide partirait au refus certain.
  // Rien n'est inventé, rien n'est généré : Publier grisé, la ligne dit où
  // l'écrire et la carte Vinted s'ouvre au tap (onOuvrirCopie).
  // (refonte 24/09) Même règle, dans regles.js. Le nouveau stepper la juge sur
  // les plateformes PUBLIABLES (une copie Vinted qui ne partira pas n'a rien à
  // exiger — c'était la « mauvaise liste » de l'audit) ; l'ancien garde
  // `selected`, à l'identique.
  const descriptionVideVinted = descriptionVintedVide(variante === "nouvelle" ? plateformesPubliables : selected, edited);

  const requiredBlocking =
    (ebayRequiredStatus ?? []).some(aspectBloquant) ||
    missingSharedFields.length > 0 ||
    prixAchatManquant ||
    vintedGenreBlocked ||
    beebsGenreBlocked ||
    descriptionVideVinted ||
    // (25/09) Un rayon À CHOISIR (refusé, aucun rayon sûr à sa place) : la
    // plateforme attend la réponse, comme pour un champ obligatoire — on la
    // choisit, ou on décoche la plateforme.
    Object.keys(rayonsAChoisir).length > 0;

  // ── CE QUI MANQUE, RANGÉ DANS LA FICHE (2026-09-15) ──────────────────────
  // Sans ça, un brouillon rouvert trois jours plus tard ne redécouvre son champ
  // requis qu'au moment de publier. La carte le dit AVANT — mais elle ne
  // réinvente aucune règle : elle relit ce que le stepper, seul détenteur des
  // référentiels par plateforme, a établi ici.
  // ⚠️ Écrit à CHAQUE rendu, y compris quand les référentiels ne sont pas
  //    encore chargés : dans ce cas la liste est vide, et la carte ne dit rien.
  //    C'est la doctrine permissive du 02/09 — en cas de doute, on ne demande
  //    rien. Une liste vide n'est jamais « tout va bien », c'est « on ne sait
  //    pas encore », et la carte ne prétend pas le contraire.
  blocageFicheRef.current = {
    champsPartagesManquants: missingSharedFieldsDetailed.map(f => ({
      key: f.key,
      platforms: (f.platforms ?? []).map(p => PLATFORM_LABELS[p] ?? p),
    })),
    descriptionVideVinted,
    prixAchatManquant,
  };

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
    for (const p of Object.keys(rayonsAChoisir)) {
      m.push(lang === "en"
        ? `${nomPlateforme(p)} category to pick — none we're sure of (on its card, list ready)`
        : `Rayon ${nomPlateforme(p)} à choisir — aucun rayon sûr trouvé (sur sa carte, liste prête)`);
    }
    if (descriptionVideVinted) m.push(lang === "en" ? "Vinted description to write" : "Description Vinted à écrire");
    // ── RIEN DE COCHÉ : ON LE DIT, ET ON DIT QUOI COCHER (2026-09-22) ───────
    // 🚨 LE DÉFAUT, mail de Romain du 22/09 à 13h48 (« Donc je ne sais pas ce
    //    que je dois compléter »), capture à l'appui. Son article Funko Star
    //    Wars était déjà en ligne sur Beebs et Vinted ; il restait Opla, qu'il
    //    n'avait pas cochée. `publishChips.length === 0` grisait donc le
    //    bouton — à juste titre — mais AUCUN motif ne se posait ici : la liste
    //    tombait vide et le filet générique en bas répondait « Un champ
    //    obligatoire manque encore. Rouvre cette étape pour le voir. »
    //    C'était FAUX : il ne manquait aucun champ. Il a rouvert les étapes
    //    une à une à la recherche d'un champ qui n'existait pas.
    // Le commentaire d'avant disait : « le BOUTON le dit déjà, un seul message
    // par idée ». L'intention était bonne, la conséquence ne l'était pas — en
    // ne posant RIEN, on tombait dans le filet, qui lui MENT. Et le bouton dit
    // « Choisis au moins une plateforme » sans dire LESQUELLES sont
    // disponibles ni pourquoi les autres sont éteintes.
    // Ici on nomme les deux : ce qui est cochable, et ce qui ne l'est pas.
    if (publishChips.length === 0) {
      const offertes = Object.keys(platformListings?.platforms ?? {});
      const verrouillees = offertes.filter(p => lockedSet.has(p));
      const libres = offertes.filter(p => !lockedSet.has(p)
        && platformSupport?.[p] !== "prohibited"
        && !(lbcAdresseManquante?.plateformes ?? []).includes(p));
      const liste = (arr) => arr.map(nomPlateforme).join(", ");
      if (libres.length) {
        m.push(lang === "en"
          ? `Tick where you want to publish: ${liste(libres)}.`
          : `Coche la plateforme où publier : ${liste(libres)}.`);
        if (verrouillees.length) {
          m.push(lang === "en"
            ? `${liste(verrouillees)} — already online for this item, nothing to do there.`
            : `${liste(verrouillees)} — déjà en ligne pour cet article, rien à y faire.`);
        }
      } else if (verrouillees.length) {
        m.push(lang === "en"
          ? `This item is already online on ${liste(verrouillees)}. There is nothing left to publish here.`
          : `Cet article est déjà en ligne sur ${liste(verrouillees)}. Il n'y a plus rien à publier ici.`);
      } else if (offertes.length) {
        // Offertes mais ni libres ni verrouillées : c'est une exclusion NOMMÉE
        // ailleurs (produit interdit, adresse de remise absente). On renvoie
        // vers la rangée, qui porte déjà le motif sous chaque logo.
        m.push(lang === "en"
          ? "No platform can take this item right now — the reason is under each logo above."
          : "Aucune plateforme ne peut prendre cet article pour l'instant — le motif est sous chaque logo, juste au-dessus.");
      }
    }
    if (!publishedStateLoaded) {
      m.push(lang === "en" ? "Checking your existing listings…" : "Vérification de tes annonces en cours…");
    }
    // ── LE FILET NE MENT PLUS (2026-09-22) ──────────────────────────────────
    // Il disait « Un champ obligatoire manque encore » — une AFFIRMATION, sur
    // un état où justement on ne sait pas. Romain a cherché ce champ pendant
    // un quart d'heure ; il n'en manquait aucun. Un filet ne connaît pas la
    // cause, par construction : il dit donc ce qu'il sait (le bouton est gris,
    // c'est chez nous) et jamais ce qu'il ignore.
    if (!m.length) {
      m.push(lang === "en"
        ? "We can't name what is blocking — that's on us, not on your listing. Write to us and we'll unblock it."
        : "On n'arrive pas à nommer ce qui bloque, et ça vient de chez nous — pas de ton annonce. Écris-nous, on débloque.");
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
        // Rédaction abandonnée : les valeurs générales seront re-semées
        // depuis les copies fraîches (effet de semis).
        setDissociees(dissociationsVides());
        setGenerales({ titre: "", description: "", etat: "" });
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
      if (extensionBlocked && !exemptionEbayApi) {
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

  // ── LA SORTIE (2026-09-20, passe 2) ───────────────────────────────────────
  // 🚨 LE DÉFAUT, constaté en refaisant le parcours : une fois dans le
  //    stepper, on n'en sort pas. Le SEUL contrôle du haut est le « ‹ », qui
  //    ne ferme qu'à la première étape — arrivé à Publier, il faut reculer
  //    quatre fois. Et l'écran est en `position:fixed` par-dessus toute
  //    l'app : ni onglets, ni retour navigateur utile.
  //
  // UN GESTE, À TOUTES LES ÉTAPES. `onClose()` existait déjà et ne détruit
  // rien : l'article reste au stock, la fiche générée reste en base (elle est
  // enregistrée à la génération, pas à la publication — c'est ce que dit
  // « Fiche enregistrée, rouverte telle quelle » quand on revient).
  //
  // ⛔ ELLE NE PUBLIE RIEN ET NE SUPPRIME RIEN. Elle quitte, point.
  // ⛔ UNE SEULE QUESTION, ET SEULEMENT SI DU TRAVAIL SERAIT PERDU : avant la
  //    génération, les photos choisies ne sont encore nulle part. Après, il
  //    n'y a rien à perdre — le bouton quitte du premier coup, sans un mot.
  //    L'armement se désarme tout seul si on change d'étape.
  const [quitterArme, setQuitterArme] = useState(false);
  const quitterPerdraitDuTravail = step <= 1 && pickedPreviews.length > 0 && !platformListings;
  useEffect(() => { setQuitterArme(false); }, [step]);
  function quitterLeStepper() {
    if (isLocked) return;
    if (quitterPerdraitDuTravail && !quitterArme) { setQuitterArme(true); return; }
    onClose();
  }

  // ── Les modales, partagées par les deux peaux (refonte 24/09) ────────────
  // Conversion (quota), accroche extension, Réglages › Compte eBay par-dessus
  // le stepper, visionneuse : le même JSX, rendu par l'ancienne coque comme
  // par la nouvelle (StepperNouveau reçoit `modales` dans le moteur).
  const modales = (
    <>
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

      {/* Réglages › Compte eBay, ouvert PAR-DESSUS le stepper (07/09/2026).
          La même section que les Paramètres, à l'identique — pas une copie.
          Ouverte ici plutôt qu'en fermant le stepper : le brouillon en cours
          (photos, annonces générées, prix) ne doit rien perdre pour un compte
          à finir de paramétrer. À la fermeture, on relit l'état du compte :
          si tout est vert, eBay redevient cochable sans quitter l'écran. */}
      {ebayPanneauOuvert && (
        <div
          onClick={() => { setEbayPanneauOuvert(false); ebayCompte?.rafraichir?.(); }}
          style={{ position:"fixed", inset:0, zIndex:20001, background:"rgba(16,32,27,0.45)", backdropFilter:"blur(2px)",
            display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 12px", overflowY:"auto" }}
        >
          <div
            onClick={ev => ev.stopPropagation()}
            style={{ width:"100%", maxWidth:560, background:T.paper, borderRadius:18, padding:"14px 16px 18px", boxShadow:"0 24px 60px rgba(16,32,27,0.28)" }}
          >
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:6 }}>
              <div style={{ fontSize:14, fontWeight:800, color:T.ink }}>
                {lang === "en" ? "Settings › eBay account" : "Réglages › Compte eBay"}
              </div>
              <button
                type="button"
                onClick={() => { setEbayPanneauOuvert(false); ebayCompte?.rafraichir?.(); }}
                style={{ width:32, height:32, borderRadius:999, border:"none", background:T.chip, color:T.mute2,
                  display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}
                aria-label={lang === "en" ? "Close" : "Fermer"}
              >
                <X size={18} />
              </button>
            </div>
            <EbayCompteSection lang={lang} user={userId ? { id: userId } : null} />
          </div>
        </div>
      )}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );

  // ── Render : initializing ─────────────────────────────────────────────────
  // createPortal vers document.body : le stepper DOIT sortir du scroller
  // .wrap.page-pad (celui-ci a -webkit-overflow-scrolling:touch, qui sur iOS
  // Safari confine tout position:fixed descendant DANS le scroller au lieu du
  // viewport → topbar/bnav passaient par-dessus et le CTA débordait). Portalé
  // sur body, l'overlay fixed couvre réellement tout l'écran.
  // ══ LE MOTEUR TENDU AU NOUVEAU STEPPER (refonte du 24/09/2026) ═══════════
  // Tout ce que les écrans de src/publication/ lisent ou déclenchent, en UN
  // objet. Rien n'est recalculé de leur côté : ils affichent et remontent.
  // Les gestes de navigation propres à la nouvelle peau (trois écrans au lieu
  // de quatre étapes) vivent ici ; ceux de l'ancienne (handleNext, handleBack)
  // ne bougent pas.
  // Une plateforme cochée SANS copie rédigée (fiche rouverte avec une
  // plateforme en plus) : la rédaction repart — comme l'ancien parcours par
  // « Générer les annonces », et au même prix (une annonce sur le quota).
  const copieManquante = Boolean(platformListings)
    && [...selected].some(p => !platformListings.platforms?.[p]);
  function handleNextNouveau() {
    if (step <= 1) {
      // Photos choisies mais pas encore montées : on les monte et on arrive
      // directement à la rédaction (l'étape « Photos » n'existe plus ici).
      if (pickedFiles.length) { handleUpload(2); return; }
      // Même garde qu'à l'étape 1 de l'ancien parcours (Lens unifié + retouche
      // choisie : la rédaction pré-générée est abandonnée, l'étape 2 regénère).
      if ((platformListings?.lens_unifie && photoOption !== "original") || copieManquante) {
        setPlatformListings(null);
        setProcessedPhotos([]);
        setEdited({});
        setDissociees(dissociationsVides());
        setGenerales({ titre: "", description: "", etat: "" });
        setFicheReprise(false);
      }
      setStep(2);
      return;
    }
    if (step === 2) { if (platformListings) setStep(3); return; }
    if (step === 3) handleNext();
  }
  function handleBackNouveau() {
    if (isLocked) return;
    if (step <= 1) { quitterLeStepper(); return; }
    setStep(step === 2 ? (photos.length ? 1 : 0) : 2);
  }
  const plateformesAVenirVisibles = PLATFORMS_A_VENIR.filter(p => plateformesVisibles.includes(p));
  const titreArticle = String(generales?.titre || initialListing?.titre || edited?.vinted?.title || edited?.leboncoin?.title
    || edited?.beebs?.title || edited?.ebay?.title || photoAnalysis?.titre || "").trim();
  const etatArticle = String(generales?.etat || edited?.vinted?.platform_fields?.etat || attributV("etat") || "").trim();
  // Les questions, comptées UNE fois par champ logique (même déduplication que
  // motifsCtaGris) — pour « Continuer · N questions ».
  const clesQuestions = new Set([
    ...missingSharedFieldsDetailed.map(f => f.key),
    // Un aspect ne fusionne avec le champ partagé que si ce champ MANQUE
    // (c'est alors la même question, posée une fois). Une valeur présente
    // mais hors de la grille d'UNE plateforme (Taille « XS / 34 » sur le
    // rayon enfant de Beebs) est SA question — même règle que
    // etatsParPlateforme et que le bloc de questions (questionsAPoser).
    ...Object.entries(genericRequiredStatus ?? {}).flatMap(([gp, list]) =>
      list.filter(aspectBloquant).map(a => {
        const sk = genericFieldToSharedKey(gp, a.key);
        return sk && missingSharedFields.includes(sk) ? sk : `${gp}:${a.key}`;
      })),
    ...(ebayRequiredStatus ?? []).filter(aspectBloquant).map(a =>
      (a.sharedKey && missingSharedFields.includes(a.sharedKey)) ? a.sharedKey : `ebay:${a.name}`),
  ]);
  const nbQuestions = clesQuestions.size
    + (vintedGenreBlocked ? 1 : 0) + (beebsGenreBlocked ? 1 : 0)
    + (descriptionVideVinted ? 1 : 0) + (prixAchatManquant ? 1 : 0)
    // (25/09) Un rayon à choisir est une question, posée sur « Confirmer ».
    + Object.keys(rayonsAChoisir).length;
  // Par plateforme, pour la puce des cartes de « Ce qui va partir ».
  const etatsParPlateforme = (() => {
    const compte = {};
    const ajoute = (p, n = 1) => { compte[p] = (compte[p] ?? 0) + n; };
    for (const f of missingSharedFieldsDetailed) for (const p of f.platforms) ajoute(p);
    for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
      // Un aspect dont le champ partagé manque déjà est la même question.
      const n = list.filter(a => aspectBloquant(a)
        && !(genericFieldToSharedKey(gp, a.key) && missingSharedFields.includes(genericFieldToSharedKey(gp, a.key)))).length;
      if (n) ajoute(gp, n);
    }
    const nE = (ebayRequiredStatus ?? []).filter(a => aspectBloquant(a) && !(a.sharedKey && missingSharedFields.includes(a.sharedKey))).length;
    if (nE) ajoute("ebay", nE);
    if (vintedGenreBlocked || descriptionVideVinted) ajoute("vinted");
    if (beebsGenreBlocked) ajoute("beebs");
    for (const p of Object.keys(rayonsAChoisir)) ajoute(p);
    const out = {};
    for (const p of Object.keys(platformListings?.platforms ?? {})) {
      if (!selected.has(p)) continue;
      if (platformSupport?.[p] === "prohibited") out[p] = { ton: "geste", libelle: lang === "en" ? "Refused here" : "Refusé ici" };
      else if ((lbcAdresseManquante?.plateformes ?? []).includes(p)) out[p] = { ton: "geste", libelle: lang === "en" ? "Address" : "Adresse" };
      else if (compte[p]) out[p] = { ton: "geste", libelle: `${compte[p]} question${compte[p] > 1 ? "s" : ""}` };
      else out[p] = { ton: "ok", libelle: lang === "en" ? "Ready" : "Prêt" };
    }
    return out;
  })();
  // Ce que le clic ferait MAINTENANT : les exclusions, dites avant le geste.
  const exclusionsPrevues = calculerExclusions({
    selected, platformSupport, platformListings,
    plateformesSansAdresse: lbcAdresseManquante?.plateformes ?? [],
    champsManquantsParPf: champsBloquantsParPlateforme(genericRequiredStatus),
  });
  // Ce qui n'est bloqué que par UNE plateforme se contourne en la décochant.
  const plateformesRetirables = [...new Set([
    ...((ebayRequiredStatus ?? []).some(aspectBloquant) ? ["ebay"] : []),
    ...((vintedGenreBlocked || descriptionVideVinted) ? ["vinted"] : []),
    ...(beebsGenreBlocked ? ["beebs"] : []),
    // (25/09) « Continuer sans X » quand son rayon reste à choisir.
    ...Object.keys(rayonsAChoisir),
  ])].filter(p => selected.has(p));
  // Par plateforme cochée, les questions qui la retiennent — pour sa ligne de
  // « Confirmer » (« Attend une réponse : Taille, Département »), au lieu de
  // « Connectée — prête » alors que le bouton est gris à cause d'elle. Mêmes
  // sources et même libellé par champ que motifsCtaGris.
  const questionsParPlateforme = calculerQuestionsParPlateforme({
    selected, missingSharedFieldsDetailed, genericRequiredStatus, ebayRequiredStatus,
    vintedGenreBlocked, beebsGenreBlocked, descriptionVideVinted,
    libellePartage: { taille: t("fieldSizeLabel"), couleur: t("fieldColorLabel"), matiere: t("fieldMaterialLabel"), marque: t("fieldBrandLabel") },
    libelleGenre: t("fieldGenderLabel"), libelleDescription: t("fieldDescriptionLabel"),
    genericFieldToSharedKey,
    rayonsAChoisir: Object.keys(rayonsAChoisir), libelleRayon: lang === "en" ? "Category" : "Rayon",
  });
  const extensionVueLe = (() => {
    const a = Date.parse(extensionLastSeenAt ?? "");
    const b = Date.parse(extSeenRelu ?? "");
    if (!Number.isFinite(a)) return extSeenRelu ?? extensionLastSeenAt;
    if (!Number.isFinite(b)) return extensionLastSeenAt;
    return a >= b ? extensionLastSeenAt : extSeenRelu;
  })();
  // Les props de l'écran de rédaction, les MÊMES que dans l'ancienne coque.
  const propsStepGeneration = {
    generating: generatingPlatforms, generateError: platformError, platformListings, processedPhotos,
    selected, edited, setEdited, onPhotoClick: setLightboxUrl, onRetry: handleGeneratePlatforms,
    generatePrice: coinPrices?.generate ?? null, noteOverride: noteSharedOverride, ficheReprise,
    ebayVoieApiReelle, rayonsParPf, suggestionsParPf, questionsRayonParPf: rayonsAChoisir, supabase, onChoisirRayon: choisirRayon,
    lang, price, setPrice, customPriced, setCustomPriced, articleIcon, photoOption,
    onEstimatePrice: handleAnalyzePhotos, estimating: analyzing, estimateCost: coinPrices?.lens_overflow ?? null,
    estimateError: analysisError, estimateResult: photoAnalysis,
    prixAchat: prixAchatSaisi || initialListing?.prix_achat || null,
    carteAOuvrir, onCarteOuverte: () => setCarteAOuvrir(null),
    generales, onValeurGenerale: poserValeurGenerale,
    versionsTexte, ficheTexte: { titre: initialListing?.titre ?? "", description: initialListing?.description ?? "" },
    divergence, divergenceTranchee, onTrancherDivergence: trancherDivergence,
    dissociees, onModifierCarte: modifierCarte, onRetablirCarte: retablirCarte,
  };
  const moteur = {
    // Contexte
    lang, t, tpl, userId, supabase, onClose, onCompleter, modales,
    step, done, isLocked, initializing,
    suivant: handleNextNouveau, retour: handleBackNouveau, quitter: quitterLeStepper, quitterArme, quitterPerdraitDuTravail,
    MIN_PHOTOS, MAX_PHOTOS, MAX_RETOUCHED,
    // L'article et ses photos
    initialListing, invId, titreArticle, etatArticle, price, generales, edited, selected, setSelected,
    photos, displayPreviews, pickedPreviews, photoCount, addFiles, removeFile, handleReorderPreviews,
    handleAddMorePhotos, handleRemovePhoto, handleReorderPhotos, uploading, uploadError, setLightboxUrl,
    notes, setNotes, micActive, toggleMic,
    micDisponible: typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    photoOption, setPhotoOption, reuseRetouched,
    retoucheNewCount: alreadyRetouched && addedNewPhotos ? photos.filter(u => !initialPhotos.includes(u)).length : 0,
    retoucheNonLivree, retoucheAvisLu, setRetoucheAvisLu, coinPrices,
    modeleAConfirmer, modelePropose: initialListing?.modele ?? null, modeleSource: initialListing?.modele_source ?? null, setModeleConfirme,
    identifyFailed,
    analysisHidden: initialListing?.prix_vente_suggere != null || initialListing?.taille_estimee != null,
    photoAnalysis, analyzing, analysisError, handleAnalyzePhotos,
    texteDuVendeur: Boolean(texteDuVendeurFiche()),
    // Les plateformes et leurs états
    plateformesAffichees: [...PLATFORMS_DEFAULT, ...plateformesAVenirVisibles],
    plateformesAVenir: plateformesAVenirVisibles, plateformesOuvertes, oplaMotifGrise, oplaExtensionMin, oplaVerdict, oplaAccesDetail,
    motifAVenir: (p) => oplaMotifGrise === "extension"
      ? (lang === "en"
          ? `${PLATFORM_LABELS[p]} opens with the next FillSell extension update${oplaExtensionMin ? ` (${libelleVersionExtension(oplaExtensionMin)})` : ""}.`
          : `${PLATFORM_LABELS[p]} s'active avec la prochaine mise à jour de l'extension FillSell${oplaExtensionMin ? ` (${libelleVersionExtension(oplaExtensionMin)})` : ""}.`)
      : (lang === "en"
          ? `${PLATFORM_LABELS[p]} is being prepared — visible here, not open for publishing yet.`
          : `${PLATFORM_LABELS[p]} est en préparation — visible ici, pas encore ouverte à la publication.`),
    basculer: (p) => setSelected(prev => { const s = new Set(prev); if (s.has(p)) s.delete(p); else s.add(p); return s; }),
    platformSupport, categorieFermee, motifSupport,
    publishedSet, queuedSet, lockedSet, attentes: fetchedAttentes, motifsVerrouillage,
    phraseEtat: (p, a) => phraseEtat(p, a, lang),
    pausedPlatforms, pausedReasons, motifPause: (p) => messagePause(tpl, pausedReasons, p, PLATFORM_LABELS[p]),
    ebayBloque, motifEbay: messageCompteEbay(ebayMotif, lang, ebayEtatCompte),
    boutonEbay: (ebayEtatCompte ? resumeEbay(ebayEtatCompte, lang === "en" ? "en" : "fr").bouton : null) ?? (lang === "en" ? "Set up eBay" : "Paramétrer eBay"),
    ebayVoieApi: Boolean(ebayCompte?.voieApi), ebayVoieApiReelle, ouvrirPanneauEbay: () => setEbayPanneauOuvert(true),
    platformSessions, voiesDuLot, extFraicheurPublier, extensionVueLe, extensionBlocked,
    plateformesPubliables, plateformesBloqueesChamps, publishChips, publishTotalFor,
    // La rédaction
    propsStepGeneration, etatsParPlateforme, nbQuestions, copieManquante,
    generatingPlatforms, platformError, platformListings, processedPhotos, handleGeneratePlatforms, ficheReprise,
    modifierCarte, platformFieldsConfig,
    // Les questions et le geste
    redSharedFields, redSharedFieldPlatforms, sharedFields, setSharedField, sharedChildAxes, missingSharedFieldsDetailed, noterReponseFiche, noterReponseFicheValeur,
    vintedGenreBlocked, beebsGenreBlocked, ebayRequiredStatus, setEbayAspect, setEbaySharedField,
    genericRequiredStatus, setPlatformAspect, setPlatformDedicatedField, EBAY_CLOSED_LIST_MAX,
    demanderPrixAchat: prixAchatARenseigner, prixAchatSaisi, setPrixAchatSaisi, prixAchatInconnu, setPrixAchatInconnu, prixAchatManquant,
    inventoryFull, stockCount, stockLimitCfg,
    lbcPhotoCap, lbcAdresseManquante, jumeaux, descriptionMentions, descriptionVideVinted,
    exclusionsPrevues, plateformesRetirables, questionsParPlateforme,
    // (25/09) Le rayon à choisir, posé sur « Confirmer » avec ses candidats.
    rayonsAChoisir, suggestionsParPf, choisirRayon,
    publishError, publishing, motifsCtaGris, ctaDisabled, ctaBlockingActive, requiredBlocking, publishedStateLoaded,
    ctaLabel: step === 3 ? ctaLabel() : null,
    // Le suivi
    fournee, exclusionsDuClic, publieesSansPf, createdThisRun, parcoursCreation,
  };

  if (initializing) return createPortal((
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      background:T.canvas, display:"flex", alignItems:"center", justifyContent:"center",
      paddingTop:"env(safe-area-inset-top,0px)", paddingBottom:"env(safe-area-inset-bottom,0px)",
    }}>
      <Loader size={36} thickness={3} />
    </div>
  ), document.body);

  // ── Render : la nouvelle peau (refonte 24/09) ───────────────────────────
  // Après l'écran d'initialisation (le même), tout le reste — U1 → U4, le
  // suivi après `done` — est rendu par la coque de src/publication/. L'ancien
  // chemin, en dessous, n'est pas touché.
  if (variante === "nouvelle") return <StepperNouveau m={moteur} />;

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
        {/* Écran ✅ : même règle que l'encart de confirmation — on ne renvoie
            pas quelqu'un vers Chrome pour des annonces qui partent de nos
            serveurs (07/09/2026). */}
        {voiesDuLot.toutServeur
          ? t("doneSubtitleServeur")
          : voiesDuLot.mixte
          ? tpl("doneSubtitleMixte", {
              serveur: voiesDuLot.serveur.map(p => PLATFORM_LABELS[p] ?? p).join(", "),
              extension: voiesDuLot.extension.map(p => PLATFORM_LABELS[p] ?? p).join(", "),
            })
          : t("doneSubtitle")}
      </div>
      {/* Ligne POSITIVE (2026-08-04) : la publication vient de créer la ligne
          inventaire (1-bis) — on le dit comme un acquis (« ajouté à ton
          stock »), jamais comme un avertissement : la contrainte technique est
          la nôtre, pas la sienne, et il a payé. */}
      {/* 2026-09-15 : `createdThisRun` ne se lève plus sur le parcours Lens —
          la ligne inventaire y naît au DÉBIT, pas au publish. L'article est
          quand même au stock, avec ses photos : la ligne reste vraie et doit
          rester affichée, sinon on retire une information exacte. */}
      {(createdThisRun || (parcoursCreation && invId)) && (
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

      {/* Header : retour + SORTIE + progression */}
      <div style={{ padding:"12px 20px 0", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <button
          onClick={handleBack}
          disabled={isLocked}
          aria-label={lang === "en" ? "Previous step" : "Étape précédente"}
          style={{
            width:36, height:36, borderRadius:"50%",
            background:T.chip, border:"none",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor: isLocked ? "not-allowed" : "pointer",
            opacity: isLocked ? 0.5 : 1,
            flexShrink:0,
          }}
        >
          <ChevronLeft size={18} color={T.ink} />
        </button>
        {/* LA PORTE DE SORTIE. Présente à TOUTES les étapes, un seul geste.
            Elle ne publie rien, ne supprime rien : l'article reste au stock et
            la fiche générée reste enregistrée. */}
        <button
          type="button"
          onClick={quitterLeStepper}
          disabled={isLocked}
          style={{
            display:"inline-flex", alignItems:"center", gap:7,
            height:36, padding:"0 14px", borderRadius:999,
            background: quitterArme ? "#FDF6E3" : T.chip,
            border: `1px solid ${quitterArme ? "#EBD9A8" : "transparent"}`,
            color: quitterArme ? "#8A6100" : T.mute2,
            fontSize:13, fontWeight:600, fontFamily:"inherit",
            cursor: isLocked ? "not-allowed" : "pointer",
            opacity: isLocked ? 0.5 : 1,
            maxWidth:"70%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}
        >
          <LogOut size={15} />
          {quitterArme
            ? (lang === "en" ? "Leave without keeping these photos?" : "Quitter sans garder ces photos ?")
            : (lang === "en" ? "Leave" : "Quitter")}
        </button>
      </div>
      <StepProgress step={step} labels={stepLabels} onAller={(i) => setStep(i)} />

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
        {/* plateformesAVenir : le filtre est fait ICI, pas dans StepPhotos —
            un compte sans drapeau reçoit un tableau vide et rend exactement
            l'écran d'avant, même liste, même ordre, même rangée. */}
        {step === 1 && (
          <StepPhotos
            userId={userId}
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
            motifSupport={motifSupport}
            plateformesAVenir={PLATFORMS_A_VENIR.filter(p => plateformesVisibles.includes(p))}
            plateformesOuvertes={plateformesOuvertes}
            oplaMotifGrise={oplaMotifGrise}
            oplaExtensionMin={oplaExtensionMin}
            oplaVerdict={oplaVerdict}
            publishedSet={publishedSet}
            queuedSet={queuedSet}
            ebayBloque={ebayBloque}
            ebayMotif={ebayMotif}
            ebayEtatCompte={ebayEtatCompte}
            ebayVoieApi={Boolean(ebayCompte?.voieApi)}
            onParametrerEbay={() => setEbayPanneauOuvert(true)}
            pausedPlatforms={pausedPlatforms}
            pausedReasons={pausedReasons}
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
            ficheReprise={ficheReprise}
            ebayVoieApiReelle={ebayVoieApiReelle}
            rayonsParPf={rayonsParPf}
            suggestionsParPf={suggestionsParPf}
            questionsRayonParPf={rayonsAChoisir}
            supabase={supabase}
            onChoisirRayon={choisirRayon}
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
            carteAOuvrir={carteAOuvrir}
            onCarteOuverte={() => setCarteAOuvrir(null)}
            // ── LA VALEUR GÉNÉRALE (2026-09-21) ────────────────────────────
            generales={generales}
            onValeurGenerale={poserValeurGenerale}
            // ── LES VERSIONS DU TEXTE (2026-09-23) : choisir, jamais deviner ──
            versionsTexte={versionsTexte}
            ficheTexte={{ titre: initialListing?.titre ?? "", description: initialListing?.description ?? "" }}
            divergence={divergence}
            divergenceTranchee={divergenceTranchee}
            onTrancherDivergence={trancherDivergence}
            dissociees={dissociees}
            onModifierCarte={modifierCarte}
            onRetablirCarte={retablirCarte}
          />
        )}
        {step === 3 && (
          <StepPublish
            selected={selected}
            setSelected={setSelected}
            userId={userId}
            platformSessions={platformSessions}
            platformListings={platformListings}
            publishError={publishError}
            lang={lang}
            demanderPrixAchat={prixAchatARenseigner}
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
            plateformesVerrouillees={[...lockedSet]}
            motifsVerrouillage={motifsVerrouillage}
            attentes={fetchedAttentes}
            onCompleter={onCompleter}
            lbcPhotoCap={lbcPhotoCap}
            lbcAdresseManquante={lbcAdresseManquante}
            jumeauxEnLigne={jumeaux}
            descriptionMentions={descriptionMentions}
            ebayVoieApiReelle={ebayVoieApiReelle}
            descriptionVideVinted={descriptionVideVinted}
            onOuvrirCopie={ouvrirCopie}
            oplaVerdict={oplaVerdict}
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
        {/* ⛔ DÉFAUT Nº8 : CE BANDEAU SE FERME MAINTENANT (20/09). Le message
            est VRAI et utile — il dit, avant le clic, que la part photos ne
            sera pas facturée — mais il restait collé au-dessus du bouton sur
            les deux dernières étapes, à demeure, mangeant une ligne d'écran à
            chaque aller-retour. On le dit une fois ; lu, il se referme.
            ⛔ On ne le SUPPRIME pas : un rabais silencieux, que la personne
               prendrait pour un bug de prix, serait pire que le bandeau. */}
        {retoucheNonLivree && step >= 2 && !retoucheAvisLu && (
          <div style={{ marginBottom:8, padding:"9px 12px", borderRadius:10, background:"#FFFBEB", border:"1px solid #FCD34D", fontSize:12, lineHeight:1.45, color:"#92400E", fontWeight:600, display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ flex:1, minWidth:0 }}>
              {lang === "en"
                ? "Photo retouching didn't come through — you won't be charged for it. Your original photos will be posted as they are."
                : "La retouche photos n'a pas abouti — elle ne te sera pas facturée. Tes photos d'origine partent telles quelles."}
            </span>
            <button
              type="button"
              onClick={() => setRetoucheAvisLu(true)}
              aria-label={lang === "en" ? "Got it" : "J'ai compris"}
              style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:0, flexShrink:0, color:"#92400E" }}
            >
              <X size={14} />
            </button>
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
          /* ⛔ AMBRE, PLUS ROUGE (2026-09-22). « Publication impossible » en
             rouge est le registre de la panne ; ici rien n'est cassé, il
             reste un geste — cocher une plateforme, choisir une valeur. Même
             règle que le Stock depuis ce matin : le rouge disait « c'est
             cassé » là où il fallait lire « il te reste un geste ». */
          <div style={{ marginBottom:8, padding:"9px 12px", borderRadius:10, background:"#FFF6E3", border:"1px solid #EED9A6", fontSize:12, lineHeight:1.5, color:"#8A6100", fontWeight:600 }}>
            {lang === "en" ? "One last thing before publishing:" : "Avant de publier, il reste :"}
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
        {step === 3 && !extensionBlocked && !voiesDuLot.toutServeur && extFraicheurPublier.etat === "session_expiree" && (
          <div style={{ marginBottom:8, display:"flex", gap:8, alignItems:"flex-start", padding:"8px 12px", borderRadius:10, background:"#FEF2F2", border:"1px solid #FECACA", fontSize:12, lineHeight:1.45, color:"#7F1D1D" }}>
            <span style={{ flexShrink:0 }}>🔑</span>
            <span>
              {lang === "en"
                ? "The extension lost its connection to your account. On your computer, open fillsell.app in Chrome, sign in, then reload the page (F5) — it reconnects by itself."
                : "L'extension a perdu sa connexion à ton compte. Sur ton ordinateur, ouvre fillsell.app dans Chrome, connecte-toi, puis recharge la page (F5) — elle se reconnecte toute seule."}
            </span>
          </div>
        )}
        {/* Ordinateur éteint / extension inactive : n'a de sens que si au
            moins une plateforme du lot part par l'extension (07/09/2026). Un
            lot entièrement en voie serveur ne dépend d'aucun ordinateur —
            l'afficher là serait faux, et démentirait l'encart du dessus. */}
        {step === 3 && !extensionBlocked && !voiesDuLot.toutServeur
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

      {modales}
    </div>
  ), document.body);
}
