import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Check, ChevronDown, ChevronUp, ChevronRight, Hand, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { useIsMobile } from '../hooks/useIsMobile';
import { track } from '../analytics/analytics';
import Field from '../components/Field';
import SwipeRow from '../components/SwipeRow';
import ListingPreviewScreen, { PLATFORM_LABELS, AspectValueInput, clearStepperPersistence, readStepperHost, writeStepperHost, isRetouchedPhotoEntry } from '../components/ListingPreviewScreen';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota } from '../utils/stockLimit';
import ExtensionReminderModal, { shouldShowExtensionReminder } from '../components/ExtensionReminderModal';
import ExtensionPitchScreen from '../components/ExtensionPitchScreen';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import PepiteAmount from '../components/PepiteAmount';
import GalleryPhoto, { premierePhoto } from '../components/GalleryPhoto';
import { computeRemovalInfo, plateformesReserveesParRepublication, vintedMasqueeMalgreJobs } from '../utils/publicationState';
import VoiceResultCard from '../components/voice/VoiceResultCard';
import { Btn } from '../components/voice/VoiceKit';
import { VOICE_KIT_CSS } from '../components/voice/tokens';
import { supabase } from '../lib/supabase';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, parseLocDesc, detectType,
  getRotatingExamples, SKELETON_SOLD,
  CURRENCY_SYMBOLS, VOICE_FREE_LIMIT,
  getCatTileColor, catClass, detectObjectIcon, buildCardCss,
  PLATFORM_LOGIN_URLS, PLATFORM_LISTINGS_URLS, LBC_DEPOSIT_URL, humanizeJobError,
  jobErrorSansFaussePromesse,
  fraicheurExtension, detecterRetardHorloge,
} from '../utils/shared';
import { prixAchatConnu, prixAchatNum, totalInvesti } from '../utils/comptabilite';
import { SecondaryButton, Loader } from '../components/ui';
import {
  EXT_SONDE_MS, SYNC_POLL_MS, SYNC_POLL_MAX_MS, SYNC_DEMARRAGE_MAX_MS,
  ecouterPresenceExtension, demanderSyncDressing,
  lireCapaciteSyncCompte, demanderSyncDressingServeur,
  versionAuMoins, SYNC_VERSION_MIN, SYNC_CADENCE_MANUELLE_MS, SYNC_FILE_TTL_MS,
  SYNC_RECLAMATION_MAX_MS, EXT_SILENCE_MAX_MS,
  lireDernierRunDressing, lireDerniereSyncReussie,
  DETAIL_VERSION_MIN, demanderDetailArticleVinted, ecouterDetailArticleVinted,
  republishVisiblePour, republierArticleVinted, relancerRepublishVinted,
} from '../utils/vintedSync';

// ── Échecs actionnables (chantier onboarding 2026-07-27) ──────────────────────
// Les erreurs « connexion requise » et « brouillon LBC en cours » portent déjà
// la marche à suivre (messages humanisés côté extension) — mais elles étaient
// enfermées dans un window.alert sans lien. On y accroche l'action directe.
const CONN_ERR_RE = /connexion|se connecter|login|sign[- ]?in|identifi/i;
const DRAFT_LBC_RE = /brouillon/i;

// Warnings persistés d'un job (platform_fields.warnings, 2026-08-08) : posés
// par l'extension sur les jobs ABOUTIS avec un repli dégradant (ex.
// brand_fallback_no_brand — marque introuvable, annonce partie en « Sans
// marque »). Entrées {code, message, at} ; les chaînes nues sont tolérées.
// ── Warnings AFFICHABLES (2026-08-10) ────────────────────────────────────────
// La sonde photo des handlers compte les img[src^="blob:"] — or les uploaders
// remplacent la prévisualisation blob par l'URL CDN dès l'upload terminé.
// MESURÉ : sur TOUS les jobs de la base portant ce warning, il dit « 0
// détectée(s) », y compris sur des dépôts dont les photos sont bel et bien en
// ligne ; il n'a jamais été confirmé une seule fois en prod. Il faisait pourtant
// basculer la carte en « Publiée — à vérifier », avec pour seul détail ce
// message-là : l'utilisateur croyait sa publication abîmée alors qu'elle avait
// abouti.
// Il reste ÉCRIT EN BASE (platform_fields.warnings) pour le support — on ne
// touche pas à ce que l'extension persiste, seulement à ce qu'on montre.
const WARN_PHOTO_BRUIT_RE = /^\s*photos\s*:/i;
function warningsAffichables(job) {
  return (job?.platform_fields?.warnings ?? []).filter((w) => {
    const code = typeof w === 'string' ? 'generic' : String(w?.code ?? 'generic');
    const msg = typeof w === 'string' ? w : String(w?.message ?? '');
    return !(code === 'generic' && WARN_PHOTO_BRUIT_RE.test(msg));
  });
}
function jobWarningsTexte(job) {
  return warningsAffichables(job)
    .map((w) => (typeof w === 'string' ? w : String(w?.message ?? '')))
    .filter(Boolean)
    .join('\n');
}

// ── Lien d'annonce pas encore capturé (2026-08-10) ───────────────────────────
// MIROIR de recoverMissingListingUrls (chrome-extension/background.js) : mêmes
// plateformes, même borne de 48 h comptée depuis created_at, même restriction à
// action='publish'. Tant que cette fenêtre est ouverte, le lien est RÉELLEMENT
// en cours de récupération — l'extension renavigue vers « Mes annonces » à
// chaque cycle de poll. Dire « à vérifier » pendant ce temps, c'est inquiéter
// l'utilisateur pour un travail en cours.
// Vinted n'a AUCUNE re-capture (son URL vient de la réponse serveur, immédiate
// ou jamais) : pour lui, pas de fenêtre — un published sans lien est tout de
// suite « à vérifier ». C'est un constat, pas un oubli.
// ⚠️ Si la borne change côté extension, elle doit changer ICI aussi : les deux
// valeurs sont dupliquées, aucune n'est lue depuis l'autre.
const PLATEFORMES_RECUP_LIEN = new Set(['leboncoin', 'beebs', 'ebay']);
const RECUP_LIEN_FENETRE_MS = 48 * 60 * 60 * 1000;
function etatLienJob(job) {
  if (job?.status !== 'published' || job?.action !== 'publish') return null;
  if (job?.listing_url) return null;
  // Sonde de modération Leboncoin (2026-08-11) : la Pépite a déjà été rendue,
  // 2 h après la publication, parce que l'annonce est restée introuvable dans
  // « Mes annonces » sur 3 passages CONCLUANTS. La surveillance, elle,
  // continue jusqu'à 48 h — d'où un job toujours 'published'. Ce test passe
  // AVANT la fenêtre de récupération : dire « on cherche encore le lien »
  // serait vrai mais tairait le remboursement, qui est l'information utile.
  // Aucune condition de date ici : le marqueur n'est posé QUE par le serveur,
  // et il disparaît de l'écran tout seul dès qu'un listing_url arrive (garde
  // ci-dessus) — exactement le cas « l'annonce a finalement été publiée ».
  if (job?.platform_fields?.refund_unconfirmed) return 'rembourse';
  if (!PLATEFORMES_RECUP_LIEN.has(job?.platform)) return 'introuvable';
  const t = Date.parse(job?.created_at ?? '');
  if (!Number.isFinite(t)) return 'introuvable';
  return Date.now() - t < RECUP_LIEN_FENETRE_MS ? 'en_cours' : 'introuvable';
}
function failJobAction(job, lang) {
  const err = job?.error || '';
  // Échec posé par le cron « publication sans lien » (2026-08-10) : son message
  // ORDONNE d'aller vérifier ses annonces avant de republier, sinon doublon. On
  // rend cet ordre cliquable — un bouton vaut mieux qu'une phrase. Reconnu par
  // le marqueur que le cron pose lui-même, jamais par une heuristique.
  if (job?.platform_fields?.listing_url_abandon && PLATFORM_LISTINGS_URLS[job?.platform]) {
    const name = PLATFORM_LABELS[job.platform] || job.platform;
    return {
      url: PLATFORM_LISTINGS_URLS[job.platform],
      label: lang === 'en' ? `See my ${name} listings` : `Voir mes annonces ${name}`,
    };
  }
  if (job?.platform === 'leboncoin' && DRAFT_LBC_RE.test(err)) {
    return { url: LBC_DEPOSIT_URL, label: lang === 'en' ? 'Open the Leboncoin draft' : 'Ouvrir le brouillon Leboncoin' };
  }
  if (CONN_ERR_RE.test(err) && PLATFORM_LOGIN_URLS[job?.platform]) {
    const name = PLATFORM_LABELS[job.platform] || job.platform;
    return { url: PLATFORM_LOGIN_URLS[job.platform], label: lang === 'en' ? `Sign in to ${name}` : `Se connecter à ${name}` };
  }
  return null;
}

// ── Relance MANUELLE d'un job échoué récupérable (2026-08-31) ─────────────────
// L'utilisateur SAIT quand il vient de se reconnecter ou de passer un
// challenge : il ne doit ni attendre la reprise espacée (5/15/30/60 min,
// dd85a95), ni régénérer l'annonce (6 Pépites) pour un job qui contient déjà
// tout. La relance = UPDATE status='pending', error=null — rien d'autre, comme
// les 3 relances faites à la main en base le 31/08 (toutes abouties).
// SÛRETÉ PÉPITE (établie AVANT de coder, migration 20260805000000 l. 26-27) :
// le trigger settle_reservation a déjà soldé la réservation au passage en
// failed (reservation_settled_at posé) — un job relancé qui finit publié « ne
// re-capture rien... soldé une fois pour toutes. Perte bornée » : AUCUN débit
// possible à la relance, par construction.
// Causes RÉCUPÉRABLES seulement, par MOTIF ANCRÉ en tête du message stocké
// (jamais une heuristique large) : challenge anti-robot, reconnexion vente
// eBay, connexion requise, interruption technique (canal coupé, bfcache) —
// les têtes que posent les content scripts ET les finals dd85a95 (qui gardent
// la cause en tête). Les échecs DÉFINITIFS ne matchent pas : refus eBay
// (« Publication eBay NON aboutie / REFUSÉE »), refus serveur 400, catégorie
// manquante… — relancer un refus de contenu en boucle attire l'anti-bot.
// Liste COMPLÉTÉE le 31/08 (cas réel 1e238834, brouillon LBC : le message
// demande un geste PUIS une relance — l'usage exact du bouton) après relecture
// de TOUS les messages d'échec du chemin publish. Ajoutés : brouillon LBC
// (2 variantes, même tête), adresse LBC/Beebs absente + variante « champ déjà
// rempli », vérification du compte vendeur eBay (/fpa), Vinted en langue
// étrangère, throttle RESTRICTION VINTED, config des requis non captée,
// catégorie Vinted non sélectionnée (le message lui-même dit « relance »).
// Écartés sciemment : « Cet article n'a pas encore de catégorie Leboncoin »
// (le geste est une REGÉNÉRATION, relancer tel quel re-échoue), « hors
// FillSell » (photo CDN : reprise AUTOMATIQUE par handler-watch, un bouton
// court-circuiterait le rapatriement serveur), et toutes les exclusions
// existantes (refus eBay, refus serveur 400, listing_url_abandon).
const RELANCE_RECUPERABLE_RE = new RegExp(
  '^(' + [
    'CHALLENGE\\s',
    'REAUTH VENTE',
    'Connexion\\s+\\S+\\s+requise',
    'Publication interrompue',
    'Onglet suspendu par Chrome',
    'Un brouillon Leboncoin non terminé',
    'Adresse requise pour (Leboncoin|Beebs)',
    'Le champ adresse de Leboncoin contient déjà',
    'eBay exige une mise à niveau',
    'Ton Vinted est réglé dans une autre langue',
    'RESTRICTION VINTED',
    'Impossible de vérifier les champs obligatoires Vinted',
    "La catégorie Vinted n['’]a pas pu être sélectionnée",
  ].join('|') + ')', 'i');
const RELANCE_MANUELLE_MAX = 3;
const RELANCE_MANUELLE_COOLDOWN_MS = 10 * 60 * 1000;
function relanceManuelleInfo(job) {
  if (job?.status !== 'failed') return null;
  if ((job?.action ?? 'publish') !== 'publish') return null;
  // Échec « publication sans lien » (cron) : le message ORDONNE de vérifier
  // ses annonces AVANT de republier — relancer ici risque le doublon.
  if (job?.platform_fields?.listing_url_abandon) return null;
  if (!RELANCE_RECUPERABLE_RE.test(String(job?.error ?? ''))) return null;
  const pf = job?.platform_fields ?? {};
  const faites = Number(pf.relances_manuelles) || 0;
  if (faites >= RELANCE_MANUELLE_MAX) return { epuise: true, faites };
  const derniere = Date.parse(pf.derniere_relance_manuelle ?? '');
  const attenteMs = Number.isFinite(derniere) ? derniere + RELANCE_MANUELLE_COOLDOWN_MS - Date.now() : 0;
  return { epuise: false, faites, attenteMin: attenteMs > 0 ? Math.ceil(attenteMs / 60000) : 0 };
}

// ── Design 2026 (Lens / navbar) — liste des articles en stock ──
// Maquette validée : row grid [tuile | infos | prix+actions], palette canvas/paper.
// CSS partagé avec VentesTab via buildCardCss (src/utils/shared.js).
// Les classes pa-* reprennent le langage visuel de la complétion de VentesTab
// (invitation teal, jamais une alerte) — mêmes valeurs, scope stock-v2.
const STOCK_CSS = buildCardCss('stock-v2') + `
.stock-v2 .pa-call{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:11px 14px;border-radius:14px;cursor:pointer;font-family:inherit;background:rgba(47,158,144,.08);border:1px solid rgba(47,158,144,.28);color:#10201B;margin-bottom:12px;}
.stock-v2 .pa-call.on{background:linear-gradient(120deg,#2F9E90,#1B6E62);border-color:transparent;color:#fff;box-shadow:0 10px 22px -12px rgba(47,158,144,.55);}
.stock-v2 .pa-call .n{display:block;font-size:13.5px;font-weight:700;line-height:1.25;}
.stock-v2 .pa-call .sub{display:block;font-size:11px;font-weight:500;color:#6B7A75;margin-top:2px;line-height:1.3;}
.stock-v2 .pa-call.on .sub{color:rgba(255,255,255,.88);}
.stock-v2 .pa-line{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}
.stock-v2 .pa-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;border:1px dashed rgba(47,158,144,.55);background:rgba(47,158,144,.07);color:#1B6E62;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}
.stock-v2 .pa-input{width:82px;padding:5px 8px;border-radius:9px;border:1px solid #2F9E90;background:#fff;font-family:inherit;font-size:12.5px;font-weight:700;color:#10201B;outline:none;}
.stock-v2 .pa-ok{border:none;background:#2F9E90;color:#fff;border-radius:9px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1.2;}
.stock-v2 .pa-hint{font-size:9.5px;color:#8A8578;}
.stock-v2 .pa-err{font-size:10.5px;color:#B0645A;font-weight:600;}
.stock-v2 .pa-check{width:17px;height:17px;accent-color:#2F9E90;flex-shrink:0;cursor:pointer;margin:0;}
.stock-v2 .pa-ghost{border:1px solid #E7E3D8;background:#fff;color:#6B7A75;border-radius:999px;padding:4px 9px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
.stock-v2 .pa-bar{position:sticky;top:0;z-index:6;background:#fff;border:1px solid #2F9E90;border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 10px 24px -14px rgba(16,32,27,.45);margin-bottom:12px;}
.stock-v2 .pa-bar .lbl{font-size:12px;font-weight:700;color:#10201B;}
.stock-v2 .pa-bar .apply{border:none;background:linear-gradient(120deg,#2F9E90,#1B6E62);color:#fff;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}
.stock-v2 .pa-bar button:disabled{opacity:.45;cursor:default;}
/* ── Galerie de cartes (2026-08-27, refonte Stock IA) ─────────────────────────
   2 colonnes sur mobile, 3-4 au-delà. La carte porte la PREMIÈRE photo de
   l'article ; sans photo (1 705 articles sur 36 903 en base) ou image cassée,
   la tuile d'icône de catégorie reprend sa place — jamais une carte vide.
   Hiérarchie validée : 1. statut (pastille), 2. plateformes (logos sur la
   photo), 3. prix + vues/favoris, 4. titre (2 lignes max). */
.stock-v2 .ggrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
@media(min-width:560px){.stock-v2 .ggrid{grid-template-columns:repeat(3,minmax(0,1fr));}}
@media(min-width:880px){.stock-v2 .ggrid{grid-template-columns:repeat(4,minmax(0,1fr));}}
.stock-v2 .gcard{background:#fff;border:1px solid var(--border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;position:relative;min-width:0;box-shadow:0 1px 3px rgba(16,32,27,0.04);}
.stock-v2 .gphoto{position:relative;aspect-ratio:1/1;background:var(--paper);overflow:hidden;flex-shrink:0;}
.stock-v2 .gphoto img{width:100%;height:100%;object-fit:cover;display:block;}
.stock-v2 .gph-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
/* Icône de repli PLEIN CADRE (27/08) : la tuile remplit la même surface
   carrée que la photo qu'elle remplace — même allure de carte avec ou sans
   photo. Le fond coloré de .cat-tile devient le fond du carré entier. */
.stock-v2 .gph-fallback .cat-tile{width:100%;height:100%;font-size:64px;border-radius:0;}
/* Pastille de STATUT — l'info n°1, lisible sans lire : chip blanc (contraste
   garanti sur n'importe quelle photo) + point de couleur. Le point PULSE quand
   un travail est en cours. */
.stock-v2 .gstatus{position:absolute;top:8px;left:8px;max-width:calc(100% - 34px);display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:rgba(255,255,255,0.93);font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 5px rgba(16,32,27,0.22);z-index:2;}
.stock-v2 .gstatus .gdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.stock-v2 .gstatus .gdot.pulsing{animation:fs-pulse 1.4s ease-in-out infinite;}
@media (prefers-reduced-motion:reduce){.stock-v2 .gstatus .gdot.pulsing{animation:none;}}
/* ✕ de suppression — RÉDUIT et discret (2026-08-27, 2e passe) : 16 px visuels
   (pas de grosse cible sous le pouce en plein défilement), teinte estompée,
   collé au coin pour rester loin de la pastille de statut (qui se réserve
   l'espace à gauche via max-width). Le chemin delItem est inchangé : plan de
   suppression + confirmation, jamais une suppression sèche. */
.stock-v2 .gdel{position:absolute;top:6px;right:6px;width:16px;height:16px;border-radius:50%;border:none;background:rgba(16,32,27,0.28);color:rgba(255,255,255,0.9);font-size:8.5px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:2;font-family:inherit;}
.stock-v2 .gdel:hover{background:rgba(16,32,27,0.55);color:#fff;}
/* Plateformes — l'info n°2 : logos posés sur un dégradé bas de photo.
   Chips blancs (2026-08-29, cas Romain) : les logos nus sur photo étaient
   illisibles d'un coup d'œil — chaque logo gagne un fond blanc contrasté,
   même recette que la pastille de statut. AFFICHAGE SEULEMENT : la
   sémantique (grisé = masquée/brouillon/retrait, gelé = republication) vit
   dans l'opacité du span et reste inchangée. */
.stock-v2 .glogos{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:5px;padding:18px 7px 6px;background:linear-gradient(180deg,rgba(16,32,27,0) 0%,rgba(16,32,27,0.42) 100%);z-index:1;}
.stock-v2 .glogos .plogo{background:rgba(255,255,255,0.93);border-radius:8px;padding:3px;box-shadow:0 1px 4px rgba(16,32,27,0.25);}
.stock-v2 .gqty{position:absolute;bottom:7px;right:8px;background:rgba(255,255,255,0.93);color:var(--ink);font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 7px;z-index:2;}
.stock-v2 .gbody{padding:9px 10px 10px;display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;}
/* ── RANGÉES CONDITIONNELLES (3e passe du 27/08) : une rangée absente ne
   réserve AUCUNE place — les zones toujours-rendues de la 2e passe
   s'empilaient en trou massif sur une carte dépouillée (cas « Jean »). La
   hauteur commune d'une rangée vient de la GRILLE (étirement à la plus
   haute) ; le vide résiduel tombe à UN seul endroit, toujours le même :
   juste au-dessus des boutons (margin-top:auto de .gactions). Chaque rangée
   présente garde une hauteur fixe pour des alignements nets entre cartes
   pleines. */
/* Prix — l'info n°3. Une ligne : prix + libellé (« Vinted » / « en vente » /
   « investi » en repli), sans retour à la ligne. */
.stock-v2 .gpricerow{display:flex;align-items:baseline;gap:5px;flex-wrap:nowrap;min-width:0;height:20px;overflow:hidden;}
.stock-v2 .gprice{font-size:14.5px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;}
.stock-v2 .gpricelbl{font-size:9.5px;font-weight:600;color:var(--mute);white-space:nowrap;}
/* Investi sous le prix — rendu seulement quand prix de vente ET prix d'achat
   existent (VIDE ≠ ZÉRO : jamais un 0 fabriqué). */
.stock-v2 .ginvline{height:13px;line-height:13px;font-size:10px;font-weight:600;color:var(--mute);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;}
/* Vues/favoris — rendus seulement quand ils EXISTENT (≈5 % des articles +
   tout le hors-Vinted sans) : rien plutôt qu'un faux zéro. */
.stock-v2 .gstatsrow{height:15px;display:flex;justify-content:flex-end;align-items:center;gap:7px;font-size:10.5px;font-weight:600;color:var(--mute);white-space:nowrap;font-variant-numeric:tabular-nums;overflow:hidden;}
/* Titre — l'info n°4, 2 lignes max puis coupe (pas de réservation : un titre
   d'une ligne ne traîne pas un blanc sous lui). */
.stock-v2 .gtitle{font-size:12px;font-weight:600;color:var(--ink);line-height:1.35;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;overflow-wrap:anywhere;}
/* Marque — rendue seulement quand elle existe. */
.stock-v2 .gbrand{height:14px;line-height:14px;font-size:10.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* Rangée de badges/pastilles — rendue seulement quand elle a du contenu.
   UNE ligne fixe, défilement horizontal discret si plusieurs chips débordent
   (chaque chip garde son ellipsis et son tap : rien n'est perdu). */
.stock-v2 .gbody>.icons{height:21px;flex-wrap:nowrap;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
.stock-v2 .gbody>.icons::-webkit-scrollbar{display:none;}
.stock-v2 .gbody>.icons .micon{flex:0 0 auto;}
/* ── BLOC BAS ANCRÉ (4e passe 27/08, retour d'écran mobile) : la pastille
   « en ligne depuis » doit être au MÊME endroit sur toutes les cartes, quel
   que soit le nombre de lignes du titre — donc tout le bloc bas (saisie
   « + prix d'achat », avertissement de lot, pastilles, boutons) est ancré en
   bas de carte, et le vide résiduel tombe en UN seul endroit : entre le
   texte (titre/marque) et ce bloc. Mécanique : chaque premier membre présent
   du bloc porte margin-top:auto, et tout membre PRÉCÉDÉ d'un autre revient à
   la marge normale — jamais deux auto actifs (ils se partageraient le vide
   et recréeraient un trou au milieu). */
.stock-v2 .gbody>.pa-line{margin-top:auto;}
.stock-v2 .gbody>.meta{margin-top:auto;}
.stock-v2 .gbody>.pa-line~.meta{margin-top:0;}
.stock-v2 .gbody>.pa-line~.icons,.stock-v2 .gbody>.meta~.icons{margin-top:0;}
.stock-v2 .gbody>.pa-line~.gactions,.stock-v2 .gbody>.meta~.gactions,.stock-v2 .gbody>.icons~.gactions{margin-top:0;}
.stock-v2 .gbody>.icons{margin-top:auto;}
.stock-v2 .gactions{margin-top:auto;display:flex;flex-direction:column;gap:4px;padding-top:2px;}
.stock-v2 .gactions .btn-publier{padding:7px 0;font-size:12px;}
.stock-v2 .gactions .btn-vendre{padding:6px 4px;}
/* Écran de progression des republications (v3 2026-08-28 soir) : surfaces
   plates — pas de dégradé ni d'ombre. UNE SEULE barre sur l'écran, celle du
   bloc actif (6px) ; .sur-teinte = piste lisible sur le fond teinté accent. */
.stock-v2 .repub-track{height:6px;border-radius:999px;background:var(--canvas);overflow:hidden;margin-top:8px;}
.stock-v2 .repub-track.sur-teinte{background:rgba(13,148,136,0.14);}
.stock-v2 .repub-fill{height:100%;border-radius:999px;background:#1B6E62;transition:width 0.6s ease;min-width:0;}
`;

// (GalleryPhoto / premierePhoto vivent dans components/GalleryPhoto.jsx depuis
// le 2026-08-27 : partagés avec les vignettes de l'onglet Ventes.)

// ── Redesign zone de saisie IA (haut StockTab) — eyebrow + toggle Écrire/Parler ──
const STOCK_TOP_CSS = `
.stock-top-v2{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
.stock-top-v2 .eyebrow{
  font-size:11px;
  font-weight:600;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:var(--mute);
}
.stock-top-v2 .eyebrow-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:2px 4px 14px;
}
.stock-top-v2 .eyebrow-status{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  font-weight:600;
  color:var(--teal-deep);
  white-space:nowrap;
}
.stock-top-v2 .status-dot{
  width:6px; height:6px;
  border-radius:50%;
  background:var(--amber);
  box-shadow:0 0 0 3px rgba(232,149,109,0.18);
  flex-shrink:0;
}
.stock-top-v2 .mode-toggle{
  display:flex;
  background:var(--canvas);
  border-radius:11px;
  padding:3px;
  margin-bottom:14px;
}
.stock-top-v2 .mode-btn{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:9px;
  border-radius:9px;
  border:none;
  background:transparent;
  font-family:inherit;
  font-size:12.5px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
}
.stock-top-v2 .mode-btn.active{
  background:var(--paper);
  color:var(--ink);
  box-shadow:0 2px 6px -2px rgba(16,32,27,0.15);
}
.stock-top-v2 .voice-state{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:26px 0 18px;
  gap:14px;
}
.stock-top-v2 .voice-orb-wrap{
  position:relative;
  width:72px; height:72px;
  display:flex; align-items:center; justify-content:center;
  margin:0 auto;
}
.stock-top-v2 .pulse-ring{
  position:absolute;
  inset:0;
  border-radius:50%;
  border:1.5px solid var(--teal);
  opacity:0;
  animation:stvPulseRing 2.2s cubic-bezier(0.2,0.6,0.35,1) infinite;
  pointer-events:none;
}
.stock-top-v2 .pulse-ring:nth-child(2){ animation-delay:0.7s; }
.stock-top-v2 .pulse-ring:nth-child(3){ animation-delay:1.4s; }
@keyframes stvPulseRing{
  0%{ transform:scale(0.72); opacity:0.55; }
  100%{ transform:scale(1.55); opacity:0; }
}
.stock-top-v2 .voice-orb{
  position:relative;
  z-index:2;
  width:60px; height:60px;
  border-radius:50%;
  background:linear-gradient(155deg, var(--teal) 0%, var(--teal-deep) 100%);
  display:flex; align-items:center; justify-content:center;
  color:#fff;
  font-size:22px;
  box-shadow:0 8px 20px -6px rgba(27,110,98,0.5), inset 0 1px 1px rgba(255,255,255,0.25);
  border:none;
  cursor:pointer;
  transition:transform 0.15s ease;
}
.stock-top-v2 .voice-orb:active{ transform:scale(0.94); }
.stock-top-v2 .voice-orb.thinking{ opacity:0.85; cursor:not-allowed; }
@media (prefers-reduced-motion: reduce){
  .stock-top-v2 .pulse-ring{ animation:none !important; opacity:0; }
}
.stock-top-v2 .voice-hint{
  font-size:12.5px;
  color:var(--mute);
  font-weight:500;
}
.stock-top-v2 .hint-row{
  display:flex;
  align-items:flex-start;
  gap:7px;
  margin-bottom:16px;
}
.stock-top-v2 .hint-icon{
  color:var(--teal);
  font-size:13px;
  line-height:1.5;
  flex-shrink:0;
}
.stock-top-v2 .hint-text{
  font-size:12.5px;
  color:var(--mute);
  line-height:1.5;
}
.stock-top-v2 .cta{
  width:100%;
  padding:14px;
  border-radius:13px;
  border:none;
  font-family:inherit;
  font-weight:700;
  font-size:14.5px;
  letter-spacing:-0.005em;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  transition:all 0.15s ease;
  background:#D8D4C6;
  color:#A19C8C;
  cursor:not-allowed;
}
.stock-top-v2 .cta.active{
  background:var(--teal-deep);
  color:#fff;
  box-shadow:0 8px 20px -8px rgba(27,110,98,0.55);
  cursor:pointer;
}
.stock-top-v2 .examples-toggle{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  padding:14px 0 2px;
  font-size:12px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
  background:none;
  border:none;
  width:100%;
  font-family:inherit;
}
.stock-top-v2 .examples-toggle svg{ transition:transform 0.15s ease; }
.stock-top-v2 .examples-panel{
  margin-top:10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.stock-top-v2 .example-chip{
  display:flex;
  align-items:center;
  gap:9px;
  padding:10px 12px;
  border-radius:11px;
  background:var(--canvas);
  font-size:12.5px;
  color:var(--ink);
  opacity:0.85;
  border:none;
  font-family:inherit;
  cursor:pointer;
  text-align:left;
  width:100%;
}
`;

// ── Mini-éditeur « À compléter » (socle needs_user, 2026-07-19) ──────────────
// Un job est en 'needs_user' : l'extension a identifié UN champ obligatoire
// précis que seul l'utilisateur peut trancher (platform_fields.needsUserField
// = { platform, field_key, field_label, allowed_values?, target? }).
// Règles produit NON NÉGOCIABLES :
//   · allowed_values connue → SELECT FERMÉ sur ces valeurs exactes (strict),
//     JAMAIS de texte libre — divergence assumée avec le stepper (qui reste
//     non-strict sur les listes découvertes) : ici la règle n°1 du socle prime ;
//   · aucune liste connue → saisie texte assistée, comportement existant ;
//   · TOUT se passe dans l'app : aucun lien ni instruction vers la plateforme.
// À la validation : la valeur est écrite dans platform_fields à la cible dite
// par le HANDLER (target { root, key } — l'app ne devine rien), needsUserField
// est retiré, needsUserAttempts remis à 0 (budget de re-tentatives frais), et
// le job repasse en 'pending' — il repart au prochain poll comme n'importe
// quel job. Update CONDITIONNEL .eq(status,'needs_user') + .select() :
//   · double-clic Valider → 2e update ne matche 0 ligne, aucun double effet ;
//   · job annulé/supprimé entre-temps → 0 ligne, message doux, jamais d'écrasement ;
//   · leçon RLS (profiles 2026-07-06) : sans .select(), un update bloqué par
//     la RLS échoue en silence.
const NU_T = { border:"#E7E3D8", chip:"#F2F0E9", ink:"#10201B", mute:"#8A8578" };
const NU_CHANNEL_BY_PLATFORM = { vinted:"vintedAspects", leboncoin:"lbcAspects", beebs:"beebsAspects", ebay:"ebayAspects" };

function NeedsUserModal({ job, lang, onClose, onDone }) {
  const f = job.platform_fields?.needsUserField ?? null;
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  // eBay : les allowed_values ne transitent jamais par le job (référentiel
  // Taxonomy trop volumineux, cf. ListingPreviewScreen l.3912) — on les relit
  // d'ebay_item_aspects ici, best-effort. SELECTION_ONLY → strict de toute façon.
  const [ebayAllowed, setEbayAllowed] = useState(null);
  useEffect(() => {
    let alive = true;
    const catId = job.platform_fields?.ebayCategoryId;
    if (job.platform !== "ebay" || !f || (Array.isArray(f.allowed_values) && f.allowed_values.length) || !catId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("ebay_item_aspects")
          .select("aspects")
          .eq("category_id", String(catId))
          .maybeSingle();
        const asp = (Array.isArray(data?.aspects) ? data.aspects : [])
          .find(a => String(a?.name ?? "").toLowerCase() === String(f.field_key).toLowerCase());
        const vals = Array.isArray(asp?.allowedValues) ? asp.allowedValues.filter(Boolean).map(String) : [];
        if (alive && vals.length) setEbayAllowed(vals);
      } catch { /* best-effort, la saisie texte reste possible */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // ── Filet symétrique pour Beebs / Vinted / Leboncoin (2026-07-22) ──────────
  // Le filet ci-dessus n'existait QUE pour eBay : les 3 autres plateformes
  // n'avaient aucun recours quand le job arrivait sans allowed_values, alors
  // que le catalogue cumulatif platform_category_aspects porte exactement cette
  // information — apprise lors des publications précédentes dans la même
  // catégorie. On la relit donc ici, best-effort : un job passé AVANT que la
  // catégorie ne soit cataloguée profite du relevé fait depuis.
  // La clé de catégorie est le chemin joint par " > ", même convention que
  // celle écrite par le background (categoryKeyOf).
  const [catalogueAllowed, setCatalogueAllowed] = useState(null);
  useEffect(() => {
    let alive = true;
    const pf = job.platform_fields ?? {};
    // ⚠️ MÊME ORDRE que categoryKeyOf (background.js:4061) : une clé calculée
    // différemment ne retrouverait tout simplement jamais la ligne écrite.
    const chemin = pf.categoryPath ?? pf.beebsCategoryPath ?? pf.lbcCategoryPath ?? null;
    const categoryKey = Array.isArray(chemin) ? chemin.join(" > ") : null;
    if (job.platform === "ebay" || !f || (Array.isArray(f.allowed_values) && f.allowed_values.length) || !categoryKey) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("platform_category_aspects")
          .select("allowed_values")
          .eq("platform", job.platform)
          .eq("category_key", categoryKey.slice(0, 300))
          .eq("field_key", String(f.field_key).slice(0, 120))
          .maybeSingle();
        const vals = Array.isArray(data?.allowed_values)
          ? data.allowed_values.filter(Boolean).map(String)
          : [];
        if (alive && vals.length) setCatalogueAllowed(vals);
      } catch { /* best-effort : on retombe sur le message « valeurs indisponibles » */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // ── Options relevées par le DERNIER passage (2026-08-13, bug « Produit » LBC)
  // Quand la valeur fournie ne matche aucune option d'un combobox, l'extension
  // (fillCriterionSafe, leboncoin.js) journalise dans platform_fields.warnings :
  //   « <clé>: champ sauté — option "…" sans correspondance. Options: [...] »
  // C'est NOTRE format, et pour les combobox Leboncoin c'est souvent la SEULE
  // liste disponible : le needsUserField LBC n'a ni allowed_values ni
  // input_type, et le catalogue platform_category_aspects porte la ligne mais
  // 0 option (relevé du 13/08 : table_art_product/diy_product/
  // leisure_collection_product, tous à vide). Sans cette source, la modale
  // retombait en saisie libre → valeur hors liste → « champ sauté » → LBC
  // rebloque : boucle sans issue (6 jobs de jocaille le 13/08 au soir, valeurs
  // devinées « Maison », « Décoration », voire le titre de l'article).
  // Synchrone (les warnings sont déjà dans le job), aucune requête.
  // ⚠️ Préfixe des warnings ≠ field_key (relevé prod 2026-08-13 au soir) : le
  // handler LBC journalise sous son nom INTERNE de critère — « produit: … »
  // pour le champ dont le needsUserField dit field_key=decoration_type /
  // field_label=Produit. On accepte donc field_key OU field_label (insensible
  // à la casse) comme préfixe, sinon la liste relevée n'est jamais retrouvée.
  const nuPrefixes = useMemo(() => {
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [f?.field_key, f?.field_label].filter(Boolean).map(esc).join("|");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);
  const warningsAllowed = useMemo(() => {
    if (!nuPrefixes) return null;
    try {
      const rx = new RegExp(`^(?:${nuPrefixes})\\s*: champ sauté — option .* sans correspondance\\. Options: (\\[[\\s\\S]*\\])`, "i");
      const ws = job.platform_fields?.warnings ?? [];
      for (let i = ws.length - 1; i >= 0; i--) {
        const msg = typeof ws[i] === "string" ? ws[i] : String(ws[i]?.message ?? "");
        const m = msg.match(rx);
        if (!m) continue;
        const arr = JSON.parse(m[1]);
        if (Array.isArray(arr) && arr.length) return arr.filter(Boolean).map(String);
      }
    } catch { /* format inattendu : les autres sources restent */ }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // ── Pré-rempli LBC relevé par le handler (2026-08-13, coupe décorative
  // jocaille, extension 0.6.2) : quand Leboncoin a lui-même pré-rempli le
  // champ (« produit: pré-rempli LBC "Objet décoratif" remplacé par … »),
  // cette valeur est une option VALIDE, déduite par LBC pour CET article — la
  // meilleure suggestion disponible quand aucune liste n'a été relevée. La
  // proposer fait converger la 0.6.2 sans toucher au DOM : si la valeur du
  // job matche le pré-rempli, le handler le CONSERVE (prefilledMatchesTarget,
  // leboncoin.js) au lieu de le remplacer par une sélection au commit fragile.
  const prefillAllowed = useMemo(() => {
    if (!nuPrefixes) return null;
    try {
      const rx = new RegExp(`^(?:${nuPrefixes})\\s*: pré-rempli LBC "([^"]+)" (?:remplacé|conservé)`, "i");
      const ws = job.platform_fields?.warnings ?? [];
      for (let i = ws.length - 1; i >= 0; i--) {
        const msg = typeof ws[i] === "string" ? ws[i] : String(ws[i]?.message ?? "");
        const m = msg.match(rx);
        if (m) return [m[1]];
      }
    } catch { /* best-effort */ }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  if (!f) return null;

  const listeRelevee = Array.isArray(f.allowed_values) && f.allowed_values.length
    ? f.allowed_values
    : (ebayAllowed ?? warningsAllowed ?? catalogueAllowed);
  // Le pré-rempli LBC passe en TÊTE des suggestions (c'est la déduction de la
  // plateforme pour cet article précis), la liste relevée suit, dédupliquée.
  const allowed = prefillAllowed
    ? [...prefillAllowed, ...(listeRelevee ?? []).filter(v => !prefillAllowed.includes(v))]
    : listeRelevee;
  const platformLabel = PLATFORM_LABELS[job.platform] || job.platform;

  // ── RÈGLE DU 19/07 RENDUE INCONTOURNABLE (2026-07-22) ──────────────────────
  // Un champ FERMÉ côté plateforme ne doit JAMAIS devenir une saisie libre ici.
  // Jusqu'ici la règle reposait sur une hypothèse fausse : « si le champ est
  // obligatoire, on finira par connaître ses valeurs ». Quand le relevé
  // échouait, allowed_values arrivait vide et on retombait sur du texte —
  // exactement ce que le principe interdit. Cas réel : robe Camaïeu, « Taille »
  // en input libre alors que Beebs n'accepte qu'une valeur de SA liste (les
  // listes longues à barre de recherche n'étaient jamais cataloguées).
  // Ce qu'on tape dans ce cas ne peut QUE repartir en échec : on demande donc
  // un effort à l'utilisateur pour un résultat impossible. Mieux vaut le dire.
  // ⚠️ Ne bloque QUE les champs explicitement déclarés fermés par le handler.
  // Un champ sans input_type garde le comportement historique (saisie texte
  // assistée) : les aspects eBay LIBRES (référence fabricant, dimensions…)
  // doivent rester saisissables, et un job d'avant ce correctif ne porte pas
  // la clé — on ne bloque jamais sur une absence d'information.
  const CLOSED_INPUT_TYPES = new Set(["dropdown", "select", "radio", "selection_only"]);
  const champFerme = CLOSED_INPUT_TYPES.has(String(f.input_type ?? "").toLowerCase());
  const valeursIndisponibles = champFerme && !(allowed?.length);

  // `sansValeur` (2026-07-22) : relance SANS rien écrire, pour le cas
  // « valeurs indisponibles ». Le job repart en pending avec un budget de
  // re-tentatives neuf — le prochain passage relève la liste (cf. capture des
  // panneaux à barre de recherche) et proposera enfin les vrais choix.
  const valider = async ({ sansValeur = false } = {}) => {
    if (saving) return;
    const v = String(value ?? "").trim();
    if (!v && !sansValeur) return;
    setSaving(true); setErrMsg(null);
    try {
      const pf = job.platform_fields ?? {};
      const target = (f.target && f.target.key)
        ? f.target
        : { root: NU_CHANNEL_BY_PLATFORM[job.platform] ?? null, key: f.field_key };
      const newPf = { ...pf, needsUserAttempts: 0 };
      delete newPf.needsUserField;
      if (!sansValeur) {
        if (target.root) newPf[target.root] = { ...(pf[target.root] ?? {}), [target.key]: v };
        else newPf[target.key] = v;
      }
      // Trace persistante « tranché par l'utilisateur » (2026-07-19, boucle
      // needs_user État/Beauté) : les handlers ont des gardes légitimes
      // « déjà rempli → conservé » (pré-remplissage eBay, valeur d'origine du
      // job) qui, sans ce marqueur, écartaient silencieusement la réponse.
      // Clé = cible d'écriture ("ebayAspects.Matière", "vintedAspects.condition",
      // "etat"…) ; cumulatif : chaque champ tranché reste marqué pour tous les
      // essais suivants. Les handlers font TOUJOURS primer une valeur marquée.
      // Rien à marquer quand on relance sans valeur : l'utilisateur n'a tranché
      // aucun champ, poser un needsUserResolved vide ferait primer une chaîne
      // vide sur la valeur d'origine du job dans les handlers.
      if (!sansValeur) {
        const resolvedKey = target.root ? `${target.root}.${target.key}` : String(target.key);
        newPf.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [resolvedKey]: v };
      }
      const { data, error } = await supabase
        .from("cross_post_jobs")
        .update({ status: "pending", error: null, platform_fields: newPf })
        .eq("id", job.id)
        .eq("status", "needs_user")
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        // Job déjà repris/annulé/supprimé pendant que le modal était ouvert.
        setSaving(false);
        setErrMsg(lang === "en"
          ? "This job is no longer waiting (already resumed or cancelled)."
          : "Ce job n'est plus en attente (déjà repris ou annulé).");
        onDone?.(null);
        return;
      }
      onDone?.(job.id);
    } catch (e) {
      setSaving(false);
      setErrMsg(String(e?.message ?? e));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#8A6100", marginBottom:6 }}>
          ✋ {lang === "en" ? "Action needed" : "À compléter"} — {platformLabel}
        </div>
        <div style={{ fontSize:15, fontWeight:600, color:NU_T.ink, marginBottom:4 }}>
          {f.field_label}
        </div>
        <div style={{ fontSize:12.5, lineHeight:1.5, color:"#6B7A75", marginBottom:14 }}>
          {valeursIndisponibles
            ? (lang === "en"
              ? `${platformLabel} only accepts values from its own list for this field, and we could not read that list during the last attempt.`
              : `${platformLabel} n'accepte que des valeurs de sa propre liste pour ce champ, et nous n'avons pas réussi à lire cette liste au dernier passage.`)
            : (lang === "en"
              ? `${platformLabel} requires this field for this category. Pick a value — the listing will then resume automatically, nothing to do on ${platformLabel}.`
              : `${platformLabel} exige ce champ pour cette catégorie. Choisis une valeur — la publication repartira automatiquement, rien à faire sur ${platformLabel}.`)}
        </div>
        {valeursIndisponibles ? (
          <div style={{ fontSize:12.5, lineHeight:1.55, color:"#8A6100", background:"#FDF6E3", border:"1px solid #EBD9A8", borderRadius:12, padding:"11px 12px" }}>
            {lang === "en"
              ? "Values unavailable — a new attempt is needed. Typing free text here would be rejected by the platform, so we don't offer it. Relaunch the publication: the next attempt reads the list and will offer you the real choices."
              : "Valeurs indisponibles — une relance est nécessaire. Une saisie libre serait refusée par la plateforme, on ne te la propose donc pas. Relance la publication : le prochain passage lit la liste et te proposera les vrais choix."}
          </div>
        ) : (
          /* strict (2026-07-29, doctrine « une liste relevée est une
             SUGGESTION ») : le SELECT FERMÉ n'est plus imposé dès qu'on a une
             liste. Ces valeurs viennent d'un RELEVÉ (options du panneau, ou
             catalogue platform_category_aspects) qui peut être PARTIEL — cas
             prod du 29/07 : Beebs/Marque coupée à « Amisu », donc « Volcom »
             introuvable dans le select et l'utilisateur enfermé, sans aucun
             moyen de trancher le champ que ce modal existe précisément pour
             trancher. strict=false laisse AspectValueInput ajouter l'issue
             « Autre valeur… ». La liste reste proposée en premier : c'est une
             aide à la saisie, pas une barrière.
             La divergence assumée du 19/07 avec le stepper (« ici le select est
             FERMÉ ») tombe donc : ce qu'elle protégeait — ne pas envoyer une
             valeur que la plateforme refusera — ne vaut que si notre relevé est
             complet, et il ne l'est pas. */
          <AspectValueInput
            value={value}
            allowedValues={allowed ?? []}
            strict={false}
            onChange={setValue}
            T={NU_T}
            idBase={`nu-${job.id}`}
          />
        )}
        {errMsg && (
          <div style={{ marginTop:10, fontSize:12, color:"#8C2F28", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:10, padding:"8px 10px" }}>
            {errMsg}
          </div>
        )}
        <div style={{ display:"flex", gap:10, marginTop:16 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ flex:1, padding:"10px 0", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
          >
            {lang === "en" ? "Later" : "Plus tard"}
          </button>
          <button
            onClick={() => valider({ sansValeur: valeursIndisponibles })}
            disabled={saving || (!valeursIndisponibles && !String(value ?? "").trim())}
            style={{ flex:1.4, padding:"10px 0", borderRadius:12, border:"none", background: saving || (!valeursIndisponibles && !String(value ?? "").trim()) ? "#B9C4C0" : "#1B6E62", color:"#fff", fontSize:13, fontWeight:700, cursor: saving ? "wait" : "pointer", fontFamily:"inherit" }}
          >
            {saving
              ? (lang === "en" ? "Saving…" : "Enregistrement…")
              : valeursIndisponibles
                ? (lang === "en" ? "Retry publication" : "Relancer la publication")
                : (lang === "en" ? "Confirm & resume" : "Valider et relancer")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Retrait ciblé : état de retrait par plateforme ───────────────────────────
// computeRemovalInfo vit dans utils/publicationState.js depuis le 2026-07-25
// (S7) : le stepper en a besoin aussi, et l'importer depuis StockTab aurait
// créé un cycle (StockTab importe déjà ListingPreviewScreen).
const RM_PLATFORMS = ["vinted", "leboncoin", "beebs", "ebay"];

// ── listing_url manquant : transitoire ou définitif ? (2026-07-27) ───────────
// L'extension re-capture les listing_url manquants à chaque cycle de poll via
// « Mes annonces » (recoverMissingListingUrls, background.js) : plateformes
// leboncoin/beebs/ebay, fenêtre de 48 h après le dépôt, titre requis. Rien
// n'est écrit en base quand une tentative échoue — le seul signal fiable côté
// app est donc dérivé : publié il y a < 48 h sur une plateforme couverte
// = la récupération est en cours ou à venir (état TRANSITOIRE, prouvé en logs :
// l'URL arrive puis l'annonce redevient retirable). Au-delà, ou hors
// plateformes couvertes (vinted n'a pas de page de récupération), l'échec est
// définitif → consigne d'action manuelle. Ces deux constantes MIROIR doivent
// suivre LISTING_URL_RECOVERY_PAGES / LISTING_URL_RECOVERY_MAX_AGE_MS du
// background.
const URL_RECOVERY_PLATFORMS = ["leboncoin", "beebs", "ebay"];
const URL_RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;

function isListingUrlRecoverable(platform, pubJob) {
  return (
    URL_RECOVERY_PLATFORMS.includes(platform) &&
    !!pubJob?.title &&
    !!pubJob?.created_at &&
    Date.now() - Date.parse(pubJob.created_at) < URL_RECOVERY_WINDOW_MS
  );
}

// ── Modal de retrait ciblé (2026-07-19, remplace window.confirm) ─────────────
// Ouvert par un tap sur n'importe quel logo de plateforme d'une carte stock.
// Liste LES 4 plateformes avec leur état réel (en ligne / retrait en cours /
// retirée / pas publiée) et une action de retrait PAR LIGNE — on peut retirer
// plusieurs plateformes depuis ce seul modal, chacune restant un job delete
// individuel (la logique métier ne change pas : insert scopé, patch local,
// sortie du scan de vente côté extension).
// Confirmation INLINE par ligne, jamais de window.confirm imbriqué : premier
// tap sur « Retirer » ARME la ligne (« Retirer de X ? » + Confirmer/Annuler),
// second tap exécute. Armer une ligne désarme l'autre — une seule décision à
// la fois. Même squelette visuel que NeedsUserModal : voile ink 45 %, carte
// paper #F6F5F1, coins 16, bordure #E7E3D8, police héritée (Space Grotesk),
// poids ≤ 700 ; rouge #8C2F28/#FBEDEC réservé à l'action destructive.
// ── Panneau « où en est cette publication ? » (2026-07-20) ───────────────────
// Ouvert au tap sur le badge « En cours… ». Même squelette visuel que
// RemovePlatformsModal (voile ink 45 %, carte F6F5F1) — aucun nouveau système.
// Ne montre QUE des faits déjà en base : statut du job, ancienneté, message
// d'erreur existant. Le diagnostic global vient du heartbeat de l'extension.
// HORS SCOPE ASSUMÉ : le détail étape par étape du loader de publication
// (FILLSELL_PROGRESS, background.js:253) ne remonte JAMAIS en base — il n'est
// émis que vers le popup, et seulement sur PUBLISH_NOW. L'afficher ici
// demanderait de persister la progression à chaque étape ; reporté.
function JobStatusModal({ item, jobs, lang, pausedSet, extensionStatus, onClose }) {
  const fr = lang !== "en";
  const diag = diagnostiquerExtension(extensionStatus, lang);
  const TONS = {
    vert:   { bg:"#ECFDF5", bord:"#A7F3D0", texte:"#047857" },
    orange: { bg:"#FFF7ED", bord:"#FED7AA", texte:"#7C2D12" },
    rouge:  { bg:"#FEF2F2", bord:"#FECACA", texte:"#B91C1C" },
  };
  const ton = TONS[diag.ton];
  const LIB_STATUT = {
    pending:    fr ? "En attente"        : "Queued",
    processing: fr ? "Publication…"      : "Publishing…",
    needs_user: fr ? "À compléter"       : "Needs input",
    failed:     fr ? "Échec"             : "Failed",
  };
  // Un seul job par plateforme : le plus récent — même règle que les badges.
  const parPlateforme = {};
  for (const j of jobs) {
    const cur = parPlateforme[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) parPlateforme[j.platform] = j;
  }
  // `failed` inclus (2026-08-27) : la pastille de la carte galerie route ici
  // dès que PLUSIEURS plateformes sont en échec / à compléter — cette modale
  // est alors le seul accès au détail par plateforme (les badges du corps de
  // carte, doublons de la pastille, ont été retirés). L'erreur humanisée est
  // déjà rendue ligne par ligne ci-dessous.
  const lignes = Object.values(parPlateforme)
    .filter(j => ["pending", "processing", "needs_user", "failed"].includes(j.status));

  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:NU_T.mute, marginBottom:6 }}>
          {fr ? "Où en est la publication" : "Publishing status"}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:NU_T.ink, marginBottom:14 }}>{item.title}</div>

        <div style={{ background:ton.bg, border:`1px solid ${ton.bord}`, borderRadius:12, padding:"10px 12px", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:ton.texte, marginBottom:3 }}>{diag.titre}</div>
          <div style={{ fontSize:12.5, lineHeight:1.5, color:ton.texte }}>{diag.detail}</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {lignes.map(j => {
            const enPause = pausedSet?.has(j.platform);
            const depuis = formatDepuis(Date.parse(j.created_at || 0), lang);
            return (
              <div key={j.platform} style={{ background:"#fff", border:`1px solid ${NU_T.border}`, borderRadius:12, padding:"10px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <PlatformLogo platform={j.platform} size={18}/>
                  <span style={{ fontSize:13, fontWeight:600, color:NU_T.ink, flex:1 }}>
                    {PLATFORM_LABELS[j.platform] || j.platform}
                  </span>
                  <span style={{ fontSize:12, fontWeight:600, color:NU_T.mute }}>
                    {LIB_STATUT[j.status] || j.status}
                  </span>
                </div>
                <div style={{ fontSize:11.5, color:NU_T.mute, marginTop:4 }}>
                  {fr ? `Depuis ${depuis}` : `For ${depuis}`}
                  {enPause && (fr ? " · plateforme en pause (reprise auto)" : " · platform paused (auto-resume)")}
                </div>
                {j.error && (
                  <div style={{ fontSize:11.5, lineHeight:1.45, color:"#8C2F28", marginTop:6 }}>{humanizeJobError(j, lang)}</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop:16, width:"100%", padding:"10px 14px", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:NU_T.ink, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
        >
          {fr ? "Fermer" : "Close"}
        </button>
      </div>
    </div>
  );
}

function RemovePlatformsModal({ item, jobsAll, lang, busyPlatform, onClose, onRemove }) {
  const [confirming, setConfirming] = useState(null);
  const [errMsg, setErrMsg] = useState(null);
  const { published, removalState, latestPubByPlatform } = computeRemovalInfo(jobsAll);
  const fr = lang !== "en";
  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:NU_T.mute, marginBottom:6 }}>
          {fr ? "Retirer des plateformes" : "Remove from platforms"}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:NU_T.ink, marginBottom:4 }}>
          {item.title}
        </div>
        <div style={{ fontSize:12.5, lineHeight:1.5, color:"#6B7A75", marginBottom:14 }}>
          {fr
            ? "Chaque retrait supprime l'annonce sur cette plateforme uniquement — les autres ne bougent pas."
            : "Each removal deletes the listing on that platform only — the others are untouched."}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {RM_PLATFORMS.map(p => {
            const label = PLATFORM_LABELS[p] || p;
            const isPublished = published.includes(p);
            const state = removalState[p];
            const noUrl = isPublished && !state && !latestPubByPlatform[p]?.listing_url;
            // Transitoire vs définitif : tant que l'extension retente la
            // re-capture (fenêtre 48 h), pas de consigne manuelle — l'annonce
            // deviendra retirable ici même dès que l'URL est récupérée.
            const urlRecovering = noUrl && isListingUrlRecoverable(p, latestPubByPlatform[p]);
            const online = isPublished && !state && !noUrl;
            // vinted_status prime sur les jobs (2026-08-28) : masquée/brouillon
            // ⇒ le libellé ne dit plus « En ligne ». Le RETRAIT reste offert —
            // supprimer une annonce masquée fonctionne, et c'est un geste
            // légitime sur un article qu'on ne veut plus voir nulle part.
            const masquee = p === "vinted" && online && vintedMasqueeMalgreJobs(item, jobsAll);
            const busy = busyPlatform === p;
            const armed = confirming === p;
            const dimmed = !isPublished || state === "removed";
            return (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:`1px solid ${armed ? "#EFC2BE" : NU_T.border}`, borderRadius:12, padding:"10px 12px", minHeight:52 }}>
                <span style={{ display:"flex", flex:"0 0 auto", lineHeight:0, opacity:dimmed ? 0.3 : state === "removing" ? 0.45 : 1 }}>
                  <PlatformLogo platform={p} size={22}/>
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:dimmed ? NU_T.mute : NU_T.ink }}>{label}</div>
                  <div style={{ fontSize:11.5, lineHeight:1.35, color:NU_T.mute, display:"flex", alignItems:"center", gap:5 }}>
                    {online && !armed && (masquee
                      ? (<><span style={{ width:5, height:5, borderRadius:"50%", background:"#E8B54D", flex:"0 0 auto" }}/><span style={{ color:"#8A6100", fontWeight:600 }}>{item.vinted_status === "draft" ? (fr ? "Brouillon sur Vinted" : "Draft on Vinted") : (fr ? "Masquée sur Vinted" : "Hidden on Vinted")}</span></>)
                      : (<><span style={{ width:5, height:5, borderRadius:"50%", background:"#2F9E90", flex:"0 0 auto" }}/><span style={{ color:"#1B6E62", fontWeight:600 }}>{fr ? "En ligne" : "Live"}</span></>))}
                    {online && armed && <span style={{ color:"#8C2F28", fontWeight:600 }}>{fr ? `Retirer de ${label} ?` : `Remove from ${label}?`}</span>}
                    {state === "removing" && <span style={{ color:"#8A6100", fontWeight:600 }}>⏳ {fr ? "Retrait en cours…" : "Removing…"}</span>}
                    {state === "removed" && <span>{fr ? "Retirée" : "Removed"}</span>}
                    {/* Beebs (2026-08-13) : sans lien, l'annonce n'est PAS en
                        ligne — elle est en vérification côté Beebs. Il n'y a
                        rien à retirer, et rien à récupérer tant que Beebs ne
                        l'a pas mise en ligne. */}
                    {noUrl && urlRecovering && <span style={{ color:"#8A6100", fontWeight:600 }}>⏳ {p === "beebs"
                      ? (fr ? "En vérification Beebs — pas encore en ligne" : "Beebs is reviewing it — not online yet")
                      : (fr ? "Récupération du lien en cours…" : "Recovering listing link…")}</span>}
                    {noUrl && !urlRecovering && <span>{p === "beebs"
                      ? (fr ? "Jamais mise en ligne par Beebs — vérifie ton dressing Beebs" : "Never went live on Beebs — check your Beebs wardrobe")
                      : (fr ? `Lien d'annonce introuvable — retire-la sur ${label}` : `Listing link missing — remove it on ${label}`)}</span>}
                    {!isPublished && <span>{fr ? "Pas publiée ici" : "Not listed here"}</span>}
                  </div>
                </div>
                {online && !armed && (
                  <button
                    onClick={() => { setErrMsg(null); setConfirming(p); }}
                    style={{ flex:"0 0 auto", padding:"7px 14px", borderRadius:10, border:"1px solid #EFC2BE", background:"#fff", color:"#8C2F28", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
                  >
                    {fr ? "Retirer" : "Remove"}
                  </button>
                )}
                {online && armed && (
                  <div style={{ display:"flex", flex:"0 0 auto", gap:6 }}>
                    <button
                      onClick={() => setConfirming(null)}
                      disabled={busy}
                      style={{ padding:"7px 10px", borderRadius:10, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
                    >
                      {fr ? "Annuler" : "Cancel"}
                    </button>
                    <button
                      onClick={async () => {
                        if (busy) return;
                        setErrMsg(null);
                        const err = await onRemove(item, p);
                        if (err) setErrMsg(err);
                        setConfirming(null);
                      }}
                      disabled={busy}
                      style={{ padding:"7px 12px", borderRadius:10, border:"none", background:busy ? "#B9C4C0" : "#8C2F28", color:"#fff", fontSize:12, fontWeight:700, cursor:busy ? "wait" : "pointer", fontFamily:"inherit" }}
                    >
                      {busy ? (fr ? "Retrait…" : "Removing…") : (fr ? "Confirmer" : "Confirm")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errMsg && (
          <div style={{ marginTop:10, fontSize:12, color:"#8C2F28", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:10, padding:"8px 10px" }}>
            {errMsg}
          </div>
        )}
        <button
          onClick={onClose}
          style={{ width:"100%", marginTop:16, padding:"10px 0", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
        >
          {fr ? "Fermer" : "Close"}
        </button>
      </div>
    </div>
  );
}

// ── Diagnostic « pourquoi ce job ne bouge pas » (2026-07-20) ─────────────────
// Incident fondateur : 4 jobs Patagonia restés 30 min en « En cours… » sans le
// moindre signal, extension déconnectée. Vus de la base ils étaient
// INDISCERNABLES d'une file d'attente saine — status pending, handler_build
// NULL, processing_since NULL, error NULL. Seule leur ANCIENNETÉ trahissait le
// blocage. Le heartbeat (profiles.extension_last_seen_at, écrit par
// get-pending-jobs à chaque poll) est ce qui permet enfin de trancher entre
// « ça avance » et « personne n'écoute ».
// Le poll de l'extension est à 2 min : au-delà de 15 min sans signe de vie,
// elle ne tourne plus. Entre les deux, on ne conclut pas.
const EXT_FRAIS_MS = 5 * 60 * 1000;
const EXT_MORT_MS = 15 * 60 * 1000;

function diagnostiquerExtension(extensionStatus, lang) {
  const fr = lang !== "en";
  const seen = Date.parse(extensionStatus?.lastSeenAt ?? "");
  if (!Number.isFinite(seen)) {
    return {
      ton: "rouge",
      titre: fr ? "Extension jamais vue" : "Extension never seen",
      detail: fr
        ? "Reconnecte-toi sur fillsell.app pour réactiver l'extension."
        : "Sign in again on fillsell.app to reactivate the extension.",
    };
  }
  const age = Date.now() - seen;
  if (age > EXT_MORT_MS) {
    return {
      ton: "rouge",
      titre: fr ? "Extension inactive" : "Extension inactive",
      detail: fr
        ? `Aucun signe de vie depuis ${formatDepuis(seen, lang)}. Ouvre Chrome, et reconnecte-toi sur fillsell.app si ça ne repart pas.`
        : `No sign of life for ${formatDepuis(seen, lang)}. Open Chrome, and sign in again on fillsell.app if it doesn't resume.`,
    };
  }
  if (extensionStatus?.outdated) {
    // Wording Web Store (2026-07-25, extension publiée) : plus de « recharge
    // dans chrome://extensions » — les installs Store se mettent à jour
    // seules, et pour les anciens installs zip le bon geste est de passer
    // à la version Store (la page /extension porte le guide de migration).
    return {
      ton: "orange",
      titre: fr ? "Extension à mettre à jour" : "Extension needs updating",
      detail: fr
        ? "Une version plus récente existe. Installe la dernière version depuis le Chrome Web Store (page Extension dans les réglages)."
        : "A newer version exists. Install the latest version from the Chrome Web Store (Extension page in settings).",
    };
  }
  if (age <= EXT_FRAIS_MS) {
    return {
      ton: "vert",
      titre: fr ? "En file d'attente" : "Queued",
      detail: fr
        ? "L'extension tourne — la publication part au prochain passage (toutes les 2 min)."
        : "The extension is running — publishing starts on the next pass (every 2 min).",
    };
  }
  return {
    ton: "orange",
    titre: fr ? "Extension silencieuse" : "Extension quiet",
    detail: fr
      ? `Dernier signe de vie il y a ${formatDepuis(seen, lang)}. Laisse-lui un instant, ou ouvre Chrome.`
      : `Last seen ${formatDepuis(seen, lang)} ago. Give it a moment, or open Chrome.`,
  };
}

// « il y a 3 min », « il y a 2 h » — sans dépendance externe.
function formatDepuis(ts, lang) {
  const fr = lang !== "en";
  const ms = Math.max(0, Date.now() - ts);
  // Seuil sur les MILLISECONDES, pas sur les minutes arrondies : Math.round(30 s)
  // vaut 1 et affichait « 1 min » pour une demi-minute.
  if (ms < 60000) return fr ? "moins d'une minute" : "less than a minute";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return fr ? `${h} h` : `${h}h`;
  const j = Math.floor(h / 24);
  return fr ? `${j} j` : `${j}d`;
}

// ── Import du dressing Vinted (2026-08-03) ───────────────────────────────────
// Cible première : celui qui vient d'installer, dont le stock est vide, et qui
// a déjà 180 annonces en ligne. Sert aussi, une fois le stock rempli, à
// actualiser le dressing (le parent choisit l'emplacement et passe `source`
// pour le tracking). Trois choses non négociables ici :
//  1. le bouton est GRISÉ tant que l'extension n'est pas PROUVÉE présente.
//     Sans elle, la commande part dans le vide — c'est exactement le piège des
//     jobs 'pending' du 20/07 : un ordre que personne ne vient chercher est
//     indiscernable d'un travail en cours. Corollaire : même une fois lancée,
//     une sync qui ne démarre pas dans les 30 s est ANNONCÉE, jamais laissée
//     tourner en spinner éternel ;
//  2. la progression se lit en BASE (vinted_sync_runs), jamais déduite du clic.
//     La sync vit dans le service worker de l'extension : elle survit à un F5,
//     à un changement d'onglet, et peut avoir été lancée ailleurs ;
//  3. on annonce ce qu'on lit ET ce qu'on ne touche pas. Un import soupçonné de
//     republier sur Vinted, c'est la confiance perdue en un écran.

// ── Reprise automatique après un 403 anti-robot (2026-08-12) ─────────────────
// Quand la sonde de session prend un 403, l'extension clôt le run 'failed'
// avec un marqueur parseable et arme une alarme de reprise (5/10/20 min) —
// même run, ré-ouvert par l'alarme. Le marqueur est un CONTRAT avec
// marqueurRetry403 (chrome-extension/background.js) : préfixe, compteur
// « tentative N/M » et échéance ISO — à faire évoluer ENSEMBLE.
const RETRY403_RE = /^\[retry403\] tentative (\d+)\/(\d+) prevue (\S+) — /;
// Marge au-delà de l'échéance avant de conclure que la reprise n'aura pas
// lieu (Chrome fermé, alarme perdue). Les alarmes MV3 s'étirent — relevé réel
// jusqu'à ~14 min 35 sur le poll de 2 min (cf. EXT_SILENCE_MAX_MS) — mais une
// reprise armée tire en général à l'heure : 5 min absorbent l'ordinaire sans
// laisser l'écran promettre une tentative fantôme pendant des heures.
const RETRY403_GRACE_MS = 5 * 60 * 1000;
// (Le contrat [pin_mismatch] et son bouton de bascule ont été RETIRÉS le
// 27/08 avec l'abandon de l'épinglage : FillSell ne gère pas de comptes
// Vinted, il reflète celui connecté dans Chrome — le « switch », c'est
// Chrome. Le marquage des disparitions est protégé par l'identité du RUN,
// côté extension : sync mono-compte.)

function VintedDressingSync({ lang, user, isNative, extensionStatus, source = 'stock_empty', onDone, repubEnVol = 0 }) {
  const fr = lang !== 'en';
  // (Le couple isMobile/surTelephone a disparu le 2026-08-09 : il ne servait
  // qu'à décliner le message de blocage par support. Il n'y en a plus qu'un,
  // valable sur les deux — cf. MESSAGE_BLOCAGE.)
  const [extVue, setExtVue] = useState(false);
  // Version annoncée par l'extension (null tant qu'elle ne s'est pas annoncée).
  const [extVersion, setExtVersion] = useState(null);
  const [sondeFinie, setSondeFinie] = useState(false);
  const [run, setRun] = useState(null);
  const [dejaSync, setDejaSync] = useState(false);
  // Dernier run 'done' — celui qui porte l'HEURE RÉELLE de la dernière synchro,
  // cron comprise. Distinct de `run` (dernier run TOUT COURT : un 'failed' ou
  // un 'expired' n'a rien synchronisé et ne doit pas dater la ligne).
  const [derniereReussie, setDerniereReussie] = useState(null);
  const [suivi, setSuivi] = useState(false);
  const [attente, setAttente] = useState(false);   // clic émis, run pas encore visible en base
  // Extension OCCUPÉE par une republication (2026-08-07 soir) : la demande de
  // sync attend le verrou de l'extension, elle n'a pas échoué. Déclaré ICI,
  // AVANT l'effet de suivi qui l'écrit (règle TDZ du fichier).
  const [attenteOccupee, setAttenteOccupee] = useState(false);
  const [message, setMessage] = useState(null);    // ce que la base ne dit pas (commande non prise, poll abandonné)
  // La carte vit en tête de liste (2026-08-05) : le contrat complet est replié
  // derrière « En savoir plus » pour ne pas pousser la liste hors écran.
  const [infosDepliees, setInfosDepliees] = useState(false);
  // Capacité du COMPTE, ≠ du navigateur courant (2026-08-05). C'est elle qui
  // autorise le clic depuis un téléphone, où la sonde locale est
  // structurellement négative. null = pas encore lu ; {inconnu:true} = colonne
  // extension_version absente (migration pas encore appliquée) → on retombe
  // sur le comportement d'avant, gaté sur la seule sonde locale.
  const [capacite, setCapacite] = useState(null);
  // Instant de LECTURE de la capacité (2026-08-11). `vueIlYaMs` est un silence
  // mesuré au moment du select : sans cette borne, on ne saurait pas de combien
  // il a vieilli depuis, et le silence estimé ne peut que grandir — d'où les
  // relectures ciblées (au clic, et à la bascule « pas encore réclamé »).
  const [capaciteLueA, setCapaciteLueA] = useState(0);
  const [envoi, setEnvoi] = useState(false);   // mise en file en cours
  const clicAtRef = useRef(0);

  // Relecture de la capacité du compte : renvoie la valeur FRAÎCHE (l'état
  // React n'est pas encore à jour dans le même tour) ou null si illisible.
  const relireCapacite = async () => {
    if (!user?.id) return null;
    try {
      const c = await lireCapaciteSyncCompte(user.id);
      setCapacite(c);
      setCapaciteLueA(Date.now());
      return c;
    } catch {
      return null;
    }
  };

  // Signal immédiat de présence. Le heartbeat serveur ne se rafraîchit qu'au
  // poll de l'extension (2 min) : bien trop lent pour un bouton qu'on regarde.
  useEffect(() => {
    if (isNative) { setSondeFinie(true); return; }
    const stop = ecouterPresenceExtension((version) => { setExtVue(true); setExtVersion(version); setSondeFinie(true); });
    const t = setTimeout(() => setSondeFinie(true), EXT_SONDE_MS);
    return () => { stop(); clearTimeout(t); };
  }, [isNative]);

  // Capacité du compte — lue même sur l'application native : depuis le
  // 05/08 la commande passe par la base, donc le téléphone peut lancer une
  // sync que l'ordinateur exécutera.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    lireCapaciteSyncCompte(user.id)
      .then((c) => { if (!annule) { setCapacite(c); setCapaciteLueA(Date.now()); } })
      .catch(() => { if (!annule) { setCapacite({ inconnu: true }); setCapaciteLueA(Date.now()); } });
    return () => { annule = true; };
  }, [user?.id]);

  // Reprise d'affichage au montage : une sync peut tourner depuis un autre
  // onglet ou depuis avant le rechargement de la page.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    (async () => {
      try {
        const [dernier, reussie] = await Promise.all([
          lireDernierRunDressing(user.id),
          lireDerniereSyncReussie(user.id),
        ]);
        if (annule) return;
        setRun(dernier);
        // Même requête qu'avant (dernier run 'done'), une colonne de plus :
        // `dejaSync` en sort toujours, et l'heure réelle avec.
        setDerniereReussie(reussie);
        setDejaSync(reussie != null);
        if (dernier?.status === 'running') setSuivi(true);
      } catch (e) {
        if (!annule) console.warn('[sync-dressing] lecture du dernier run :', e?.message ?? e);
      }
    })();
    return () => { annule = true; };
  }, [user?.id]);

  // Poll de progression. ⚠️ Le clearInterval du démontage n'est pas cosmétique :
  // sans lui, quitter l'onglet Stock laisse un timer interroger Supabase toutes
  // les 2 s pour toujours.
  useEffect(() => {
    if (!user?.id || !suivi) return;
    let annule = false;
    const debut = Date.now();
    const tick = async () => {
      let r = null;
      try { r = await lireDernierRunDressing(user.id); }
      catch { return; } // un 5xx passager ne doit pas tuer le suivi
      if (annule) return;
      // PIÈGE : dans les secondes qui suivent le clic, la ligne du nouveau run
      // n'existe pas encore et la requête ramène le run PRÉCÉDENT (le 'done'
      // d'hier). Le prendre pour le nôtre afficherait « terminé » avant même
      // que ça commence. On n'accepte un run TERMINÉ que s'il a démarré après
      // le clic ; un run 'running' est toujours le bon — l'extension REPREND
      // un run interrompu, dont le started_at est ancien par construction.
      const attenduDepuis = clicAtRef.current;
      // finished_at compte aussi : un run REPRIS puis clos (failed/interrupted)
      // garde son started_at d'origine, antérieur au clic — sur started_at
      // seul, sa clôture serait ignorée et on afficherait « pas démarré » à
      // tort, en cachant le vrai motif d'échec.
      const pertinent = r && (r.status === 'running' || !attenduDepuis
        || Date.parse(r.started_at) >= attenduDepuis - 5000
        || Date.parse(r.finished_at ?? 0) >= attenduDepuis - 5000);
      if (pertinent) {
        setRun(r);
        setAttente(false);
        if (r.status !== 'running') {
          setSuivi(false);
          // La synchro qui vient de finir DEVIENT la dernière réussie : sans
          // ça, l'heure affichée resterait celle d'avant jusqu'au prochain
          // montage de la carte.
          if (r.status === 'done') { setDejaSync(true); setDerniereReussie(r); onDone?.(); }
          return;
        }
      } else if (attenduDepuis && Date.now() - attenduDepuis > SYNC_DEMARRAGE_MAX_MS) {
        setAttente(false);
        setSuivi(false);
        // ── EXTENSION OCCUPÉE ≠ EXTENSION MUETTE (2026-08-07 soir) ────────
        // Cas réel antavintage : 22 republications en vol, le verrou global
        // de l'extension est pris en continu — la sync ATTEND son tour, elle
        // n'est pas en panne. L'ancien message « extension muette » a
        // provoqué 6 re-clics en 27 minutes chez un utilisateur qui croyait
        // à une panne. Quand une republication est non terminale sur le
        // compte, on dit la vérité : occupée, ça partira après —
        // et la télémétrie sync_click dit 'attente' et non 'echec'.
        if (repubEnVol > 0) {
          if (user?.id) {
            supabase.from('usage_logs').insert({
              user_id: user.id, feature: 'sync_click',
              metadata: { resultat: 'attente', raison: 'extension_occupee_republication', voie: 'directe', source, repub_en_vol: repubEnVol },
            }).then(({ error }) => { if (error) console.warn('[sync_click] non journalisé:', error.message); });
          }
          setMessage(null);
          setAttenteOccupee(true);
          return;
        }
        // Deuxième ligne du même clic (cf. logSyncClick) : « lancée » a été
        // écrit au clic, mais RIEN n'a démarré en 30 s — c'est l'échec le
        // plus silencieux du parcours, celui que le blast doit pouvoir voir.
        if (user?.id) {
          supabase.from('usage_logs').insert({
            user_id: user.id, feature: 'sync_click',
            metadata: { resultat: 'echec', raison: 'extension_muette_30s', voie: 'directe', source },
          }).then(({ error }) => { if (error) console.warn('[sync_click] non journalisé:', error.message); });
        }
        setMessage({ ton: 'orange', texte: fr
          ? "L'extension n'a pas démarré la synchronisation. Vérifie qu'elle est bien installée, activée et à jour dans Chrome, puis réessaie."
          : "The extension didn't start the sync. Check that it's installed, enabled and up to date in Chrome, then try again." });
        return;
      }
      if (Date.now() - debut > SYNC_POLL_MAX_MS) {
        setSuivi(false);
        setMessage({ ton: 'orange', texte: fr
          ? "Suivi arrêté au bout de 10 minutes. La synchronisation continue peut-être en arrière-plan : recharge la page pour en avoir le cœur net."
          : "Tracking stopped after 10 minutes. The sync may still be running in the background: reload the page to check." });
      }
    };
    tick();
    const id = setInterval(tick, SYNC_POLL_MS);
    return () => { annule = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, suivi]);

  // ⚠️ LE HEARTBEAT N'AUTORISE PLUS LE CLIC (correctif 03/08) — et depuis le
  // 05/08 il ne pilote PLUS AUCUN message non plus : il prouve qu'UNE
  // extension tourne quelque part (y compris sur une autre machine), jamais
  // qu'il y en a une dans CE navigateur. Seule preuve valable ici : le signal
  // postMessage `__fillsellExt`, qui n'existe que depuis la 0.5.0 et porte la
  // version du manifest.
  const extCapable = extVue && versionAuMoins(extVersion, SYNC_VERSION_MIN);
  // ── Capacité du COMPTE (2026-08-05) ───────────────────────────────────────
  // Le heartbeat seul reste insuffisant (une 0.4.x l'entretient sans savoir
  // synchroniser) : la capacité exige extension_last_seen_at ET une version
  // >= 0.5.0, calculée côté serveur sur la version MAX vue du compte. C'est ce
  // qui rend le bouton cliquable depuis un téléphone.
  const capaciteConnue = capacite != null && capacite.inconnu === false;
  const compteCapable = capaciteConnue && capacite.capable === true;
  const peutLancer = extCapable || compteCapable;
  // ── Ordinateur SILENCIEUX ≠ ordinateur SANS EXTENSION (2026-08-11) ────────
  // Silence estimé = silence mesuré à la lecture + temps écoulé depuis. Il ne
  // peut que grandir entre deux lectures : c'est volontairement le sens
  // PRUDENT pour l'affichage d'attente (on n'annonce pas une réclamation
  // imminente quand on n'en sait plus rien), et c'est pour ça que le clic, lui,
  // relit la capacité au lieu de se fier à cette estimation.
  // Jamais vrai dans CE navigateur si l'extension vient de répondre au ping :
  // extCapable prouve une extension vivante ici même, aucune supposition à faire.
  const silenceEstimeMs = capaciteConnue && capacite.vueIlYaMs != null
    ? capacite.vueIlYaMs + Math.max(0, Date.now() - capaciteLueA)
    : null;
  const horsLigne = !extCapable && compteCapable
    && silenceEstimeMs != null && silenceEstimeMs >= EXT_SILENCE_MAX_MS;
  // Attente RÉELLE : une demande 'queued' de plus de 6 h ne sera jamais
  // exécutée (get-pending-jobs ne la sert plus). Elle n'est marquée 'expired'
  // qu'au prochain poll d'une extension — donc jamais si Chrome n'est pas
  // rouvert. Sans cette borne, l'écran resterait bloqué sur « demande en
  // attente » et le bouton grisé indéfiniment. started_at porte l'heure de la
  // mise en file (queued_at n'est volontairement pas lu : il n'existe pas
  // tant que la migration n'est pas appliquée).
  const enAttenteDistante = run?.status === 'queued'
    && Date.now() - Date.parse(run.started_at ?? 0) < SYNC_FILE_TTL_MS;
  // Passé le délai normal de réclamation, l'écran change de discours : ce
  // n'est plus « ça arrive », c'est « ton ordinateur n'a pas répondu ».
  const [reclamationTardive, setReclamationTardive] = useState(false);

  // ── Résolution de l'attente « occupée » ───────────────────────────────────
  // Poll LENT (30 s — le verrou peut rester pris de longues minutes, inutile
  // de marteler la base) : dès que la sync en file dans l'extension démarre
  // enfin (run 'running', ou démarré après le clic), le suivi normal reprend.
  // Et si les republications se terminent sans qu'une sync parte (service
  // worker mort, file perdue), repubEnVol tombe à 0 : on rend la main au
  // bouton au lieu de bloquer pour toujours.
  useEffect(() => {
    if (!attenteOccupee || !user?.id) return;
    if (repubEnVol === 0) { setAttenteOccupee(false); return; }
    const id = setInterval(async () => {
      let r = null;
      try { r = await lireDernierRunDressing(user.id); }
      catch { return; }
      const t = clicAtRef.current;
      if (r && (r.status === 'running'
        || (t && Number.isFinite(Date.parse(r.started_at)) && Date.parse(r.started_at) >= t - 5000))) {
        setAttenteOccupee(false);
        setRun(r);
        if (r.status === 'running') setSuivi(true);
      }
    }, 30000);
    return () => clearInterval(id);
  }, [attenteOccupee, user?.id, repubEnVol]);

  // ── Attente d'une réclamation (2026-08-04) ────────────────────────────────
  // Le cas FRÉQUENT est Chrome ouvert : la demande part en 2 min au plus. On
  // l'observe donc réellement, au lieu d'afficher d'emblée le discours du
  // pire cas (« à la prochaine ouverture de Chrome »), qui était faux et
  // inquiétant la plupart du temps.
  // Poll BORNÉ : toutes les 2 s, 3 minutes maximum, puis arrêt DÉFINITIF —
  // c'est cette borne qui rend le rythme de 2 s acceptable. Dès que le run
  // passe 'running', on rend la main au suivi de progression existant.
  useEffect(() => {
    if (!enAttenteDistante || !user?.id) return;
    const debut = Date.parse(run?.started_at ?? '') || Date.now();
    if (Date.now() - debut > SYNC_RECLAMATION_MAX_MS) { setReclamationTardive(true); return; }
    setReclamationTardive(false);
    let annule = false;
    const id = setInterval(async () => {
      if (Date.now() - debut > SYNC_RECLAMATION_MAX_MS) {
        setReclamationTardive(true);
        clearInterval(id);
        return;
      }
      let r = null;
      try { r = await lireDernierRunDressing(user.id); }
      catch { return; } // un 5xx passager ne doit pas tuer l'attente
      if (annule || !r) return;
      setRun(r);
      // Réclamé et démarré : le suivi de progression prend le relais.
      if (r.status === 'running') { setSuivi(true); clearInterval(id); }
    }, SYNC_POLL_MS);
    return () => { annule = true; clearInterval(id); };
  // `run?.id` et non `run` : la ligne est remplacée à chaque tick, dépendre de
  // l'objet relancerait l'effet en boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enAttenteDistante, user?.id, run?.id]);

  // Une demande non réclamée au bout de 3 min : c'est LE moment où le discours
  // change, donc le seul où il vaut une requête de plus. Relire ici évite de
  // trancher « ton ordinateur ne répond pas » sur un heartbeat lu au montage,
  // qui aurait pu vieillir de plusieurs minutes entre-temps. UNE relecture, pas
  // un poll : la bascule ne se produit qu'une fois par attente.
  useEffect(() => {
    if (!reclamationTardive || !user?.id) return;
    relireCapacite();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reclamationTardive, user?.id]);

  const enCours = attente || (suivi && run?.status === 'running');

  // ── Cadence des syncs manuelles ───────────────────────────────────────────
  // Miroir d'affichage de la borne background (qui, elle, relit la base et ne
  // se contourne pas en rechargeant la page). Seul un run DONE arme la
  // fenêtre : un échec se retente tout de suite.
  const finDernierDone = run?.status === 'done' && run?.finished_at ? Date.parse(run.finished_at) : NaN;
  const cadenceFinA = Number.isFinite(finDernierDone) ? finDernierDone + SYNC_CADENCE_MANUELLE_MS : 0;
  const [, forcerRendu] = useState(0);
  // Re-rendu périodique pendant la fenêtre : sans lui, « dans ~12 min »
  // resterait figé et le bouton ne se réactiverait qu'au prochain montage.
  useEffect(() => {
    if (!cadenceFinA || Date.now() >= cadenceFinA) return;
    const id = setInterval(() => forcerRendu((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [cadenceFinA]);

  // ── Reprise auto 403 : suivi pendant l'attente (2026-08-12) ───────────────
  // Tant qu'une reprise est armée (marqueur [retry403] à échéance future), on
  // re-rend toutes les 30 s (le « dans ~X min » vieillit) et on RELIT le run :
  // dès que l'alarme de l'extension le ré-ouvre ('running'), le suivi de
  // progression reprend, et un 'done' met la carte et la liste à jour comme
  // une sync normale. Borné par construction : l'échéance + marge passe en
  // ~25 min au pire, et l'effet se démonte dès que le run change d'état.
  const retryProchaineA = (() => {
    if (run?.status !== 'failed') return 0;
    const m = String(run.erreur ?? '').match(RETRY403_RE);
    const t = m ? Date.parse(m[3]) : NaN;
    return Number.isFinite(t) && Date.now() < t + RETRY403_GRACE_MS ? t : 0;
  })();
  useEffect(() => {
    if (!retryProchaineA || !user?.id) return;
    const id = setInterval(async () => {
      forcerRendu((t) => t + 1);
      let r = null;
      try { r = await lireDernierRunDressing(user.id); }
      catch { return; } // un 5xx passager ne doit pas tuer l'attente
      if (!r) return;
      setRun(r);
      if (r.status === 'running') setSuivi(true);
      else if (r.status === 'done') { setDejaSync(true); setDerniereReussie(r); onDone?.(); }
    }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryProchaineA, user?.id]);
  const enCadence = !enCours && cadenceFinA > Date.now();
  const cadenceTexte = (() => {
    if (!enCadence) return null;
    const depuisMin = Math.max(0, Math.round((Date.now() - finDernierDone) / 60000));
    const dansMin = Math.max(1, Math.ceil((cadenceFinA - Date.now()) / 60000));
    // Ton neutre : c'est une cadence, pas une faute.
    if (depuisMin < 1) {
      return fr
        ? `Dressing synchronisé à l'instant — tu pourras actualiser dans ~${dansMin} min.`
        : `Closet synced just now — you can refresh in ~${dansMin} min.`;
    }
    return fr
      ? `Dressing synchronisé il y a ${depuisMin} min — tu pourras actualiser dans ~${dansMin} min.`
      : `Closet synced ${depuisMin} min ago — you can refresh in ~${dansMin} min.`;
  })();

  // ── Synchro impossible : UN SEUL message (refonte 2026-08-09) ─────────────
  // Avant, cinq états de détection (version_ici / maj / tel_sans_ext /
  // desktop_sans_ext / null) produisaient quatre textes différents sous le
  // bouton, dont « FillSell est bien installé sur ton ordinateur, mais dans une
  // version trop ancienne pour lire ton dressing » — qui s'affichait jusque sur
  // un iPhone, où l'utilisateur ne peut RIEN en faire. Ces états décrivaient
  // notre plomberie, pas la situation de l'utilisateur : « pas d'extension »,
  // « extension muette (0.4.x) » et « extension trop ancienne » appellent tous
  // le MÊME geste — installer FillSell sur un ordinateur. On le dit une fois,
  // pour tout le monde, et JAMAIS un mot sur un numéro de version : personne
  // n'a jamais su quoi faire d'un numéro de version.
  // La détection, elle, reste : c'est elle qui décide si le bouton est
  // cliquable (peutLancer) et si l'on a le droit de conclure quoi que ce soit
  // (tant que la sonde tourne ET que la capacité du compte n'est pas lue, on
  // ne dit RIEN — sinon le message clignote au montage).
  // Un blocage PRÉSENT prime aussi sur le résultat d'un run PASSÉ : les deux
  // ensemble se contredisent (« synchronisé ✓ » + « installe l'extension »).
  // Le bilan et la cadence ne s'affichent que débloqué.
  const blocage = !peutLancer && (sondeFinie || capaciteConnue);
  const MESSAGE_BLOCAGE = fr
    ? "Installe l'extension FillSell sur ton ordinateur pour synchroniser ton dressing."
    : 'Install the FillSell extension on your computer to sync your closet.';
  // Distinct de MESSAGE_BLOCAGE, et ça compte : l'extension EST installée, le
  // geste n'est pas de l'installer mais d'ouvrir Chrome. Dit AVANT l'action —
  // une demande mise en file que personne ne réclamera est le pire des retours.
  const MESSAGE_HORS_LIGNE = fr
    ? "Ton ordinateur ne répond pas. Ouvre Chrome avec l'extension FillSell pour lancer la synchro."
    : "Your computer isn't responding. Open Chrome with the FillSell extension to start the sync.";

  // ── « C'est automatique » (2026-08-11) ────────────────────────────────────
  // Rien ne le disait : le bouton laissait croire que la synchro est un geste
  // manuel à répéter indéfiniment. La cadence RÉELLE est celle de l'alarme de
  // l'extension — chrome-extension/background.js, SYNC_DRESSING_ALARM avec
  // periodInMinutes: 24 * 60, une fois par jour. Le « 20 h » qu'on lit dans les
  // motifs de refus (« cadence cron … fenêtre de 20 h ») n'est PAS la cadence :
  // c'est le plancher anti-dérive (SYNC_CRON_COOLDOWN_MS, miroir du trigger
  // garde_cadence_sync_runs), là pour qu'une alarme retombée quelques minutes
  // trop tôt ne fasse pas sauter une journée entière.
  // TROIS conditions, sinon la phrase est fausse :
  //   · dejaSync — le cron n'INAUGURE jamais une sync, il en exige une
  //     antérieure en 'done' (SYNC_CRON_SANS_PREMIERE_SYNC). Avant la première
  //     synchro manuelle, il n'y a pas d'automatique à annoncer ;
  //   · pas de blocage — promettre de l'automatique sans extension serait le
  //     même mensonge que « tu pourras actualiser dans ~12 min » ;
  //   · rien en cours / en attente — la carte n'a qu'un état à la fois.
  // « quand Chrome est ouvert » n'est pas un détail : sans lui on réinstalle
  // exactement le malentendu que la garde hors-ligne ci-dessus vient corriger.
  //
  // ── HEURE RÉELLE de la dernière synchro (Nico, 2026-08-11) ────────────────
  // Affichée À CHAQUE FOIS qu'une synchro a abouti, automatique ou non : c'est
  // un fait vrai, il ne dépend d'aucun état de la carte. Source =
  // derniereReussie (dernier run 'done'), jamais `run` — un 'failed' ou un
  // 'expired' n'a rien synchronisé et daterait la ligne à tort.
  // ⚠️ HEURE LOCALE DE L'UTILISATEUR, JAMAIS UTC. finished_at est un
  // timestamptz stocké en UTC ; Date.parse + toLocaleTimeString le rendent
  // dans le fuseau de l'APPAREIL — c'est-à-dire l'heure qu'il a sous les yeux,
  // à Paris comme ailleurs. Ne jamais formater à la main depuis l'ISO (on
  // afficherait du GMT), ni forcer un timeZone en dur.
  const heureLocale = (ms) => new Date(ms).toLocaleTimeString(fr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const jourLocal = (ms) => new Date(ms).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit' });
  const derniereSyncTexte = (() => {
    const fini = derniereReussie?.finished_at ? Date.parse(derniereReussie.finished_at) : NaN;
    if (!Number.isFinite(fini)) return null;
    const jours = Math.round(
      (new Date().setHours(0, 0, 0, 0) - new Date(fini).setHours(0, 0, 0, 0)) / 86400000
    );
    const quand = jours <= 0
      ? (fr ? `à ${heureLocale(fini)}` : `at ${heureLocale(fini)}`)
      : jours === 1
        ? (fr ? `hier à ${heureLocale(fini)}` : `yesterday at ${heureLocale(fini)}`)
        : (fr ? `le ${jourLocal(fini)} à ${heureLocale(fini)}` : `on ${jourLocal(fini)} at ${heureLocale(fini)}`);
    // SYNC MONO-COMPTE (27/08) : le pseudo Vinted du dernier run réussi, quand
    // la trace d'identité l'a porté. Runs anciens (trace absente) → NULL → on
    // n'affiche RIEN de plus (jamais de libellé vide, jamais « inconnu »).
    const login = typeof derniereReussie?.vinted_login === 'string' && derniereReussie.vinted_login.trim()
      ? derniereReussie.vinted_login.trim() : null;
    if (login) {
      return fr
        ? `Dressing synchronisé : @${login} · dernière synchro ${quand}`
        : `Wardrobe synced: @${login} · last sync ${quand}`;
    }
    return fr ? `Dernière synchro ${quand}` : `Last sync ${quand}`;
  })();
  // Le rappel « c'est automatique », lui, garde ses conditions : il PROMET
  // quelque chose, contrairement à l'heure ci-dessus qui ne fait que constater.
  const autoTexte = (() => {
    if (!dejaSync || blocage || enCours || enAttenteDistante || attenteOccupee) return null;
    return fr
      ? 'automatique toutes les 24 h quand Chrome est ouvert'
      : 'automatic every 24 h while Chrome is open';
  })();
  const ligneSync = derniereSyncTexte && autoTexte
    ? `${derniereSyncTexte} · ${autoTexte}`
    : derniereSyncTexte
      || (autoTexte && (fr ? 'Synchro automatique toutes les 24 h quand Chrome est ouvert.' : 'Automatic sync every 24 h while Chrome is open.'))
      || null;

  const progression = (() => {
    if (attente) return fr ? 'Démarrage…' : 'Starting…';
    const vus = run?.items_vus ?? 0;
    if (run?.total_entries) return fr ? `${vus} articles sur ${run.total_entries}` : `${vus} of ${run.total_entries} items`;
    return fr ? `${vus} article${vus > 1 ? 's' : ''} lu${vus > 1 ? 's' : ''}` : `${vus} item${vus === 1 ? '' : 's'} read`;
  })();

  // ── Instrumentation du CLIC (2026-08-07, jour du blast à 595 comptes) ────
  // UNE ligne usage_logs par clic, RÉSULTAT compris — refus inclus. Sans
  // elle, « personne ne clique » et « ça échoue au clic » sont
  // indiscernables : un clic refusé avant l'insert vinted_sync_runs ne
  // laissait AUCUNE trace (track() GTM ne loggait que les lancements
  // réussis, et rien en base). Best-effort assumé : la télémétrie ne doit
  // jamais bloquer ni ralentir la sync elle-même.
  // resultats : lancée (voie directe) | mise_en_file (voie file) |
  // refusée (+ raison : cadence_ui, double_clic, cadence, deja_en_attente,
  // sync_en_cours, extension_trop_ancienne, extension_jamais_vue,
  // rpc_absente) | erreur (+ message court). Le cas « lancée mais
  // l'extension n'a rien démarré en 30 s » est journalisé À PART par le
  // poll de suivi (echec / extension_muette_30s) : il se découvre après
  // coup — l'analyse rapproche les deux lignes par user_id + horodatage.
  const logSyncClick = (resultat, raison = null, voie = null) => {
    if (!user?.id) return;
    supabase.from('usage_logs').insert({
      user_id: user.id,
      feature: 'sync_click',
      metadata: { resultat, ...(raison ? { raison } : {}), ...(voie ? { voie } : {}), source },
    }).then(({ error }) => { if (error) console.warn('[sync_click] non journalisé:', error.message); });
  };

  const lancer = async () => {
    // Ceinture si l'état a un tour de retard — journalisée AUSSI : un clic
    // avalé ici est exactement le genre d'échec invisible qu'on mesure.
    if (enCadence || envoi) {
      logSyncClick('refusée', envoi ? 'double_clic' : 'cadence_ui');
      return;
    }
    setMessage(null);
    clicAtRef.current = Date.now();

    // ── Routage (arbitrage Nico, 05/08) : chemin DIRECT si une extension
    // capable répond dans CE navigateur — instantané, aucun détour par la
    // base. Sinon mise en file. JAMAIS les deux : deux runs pour un clic.
    if (extCapable) {
      setAttente(true);
      setSuivi(true);
      try { demanderSyncDressing(); }
      catch (e) {
        setAttente(false); setSuivi(false);
        setMessage({ ton: 'rouge', texte: String(e?.message ?? e) });
        logSyncClick('erreur', String(e?.message ?? e).slice(0, 120), 'directe');
        return;
      }
      logSyncClick('lancée', null, 'directe');
      track('vinted_sync_dressing', { source, reprise: dejaSync, voie: 'directe' });
      return;
    }

    setEnvoi(true);

    // ── Ordinateur silencieux : on NE MET RIEN EN FILE (2026-08-11) ─────────
    // Cas laure-4785 : demande posée 'queued' alors que la dernière trace
    // d'extension datait de 7 min — claimed_at NULL, extension_build NULL, et
    // aucun retour. L'état se dit AVANT l'action, jamais après une attente
    // muette. Relecture FRAÎCHE plutôt que l'estimation d'affichage : refuser
    // un clic sur une valeur vieille de plusieurs minutes serait le faux
    // positif qu'on veut éviter avant tout.
    // Ne concerne QUE la voie file : le chemin direct (extension capable dans
    // ce navigateur, declencheur 'bouton') est sorti plus haut et ne change pas.
    const capaciteFraiche = await relireCapacite();
    if (capaciteFraiche?.inconnu === false
        && capaciteFraiche.capable === true
        && capaciteFraiche.enLigne === false) {
      setEnvoi(false);
      logSyncClick('refusée', 'extension_hors_ligne', 'file');
      setMessage({ ton: 'orange', texte: MESSAGE_HORS_LIGNE });
      return;
    }

    let r;
    try { r = await demanderSyncDressingServeur(); }
    catch (e) { r = { ok: false, reason: 'erreur', message: String(e?.message ?? e) }; }
    setEnvoi(false);
    if (r?.ok) logSyncClick('mise_en_file', null, 'file');
    else if (r?.reason === 'erreur') logSyncClick('erreur', String(r?.message ?? '').slice(0, 120), 'file');
    else logSyncClick('refusée', r?.reason ?? 'inconnue', 'file');

    if (r?.ok) {
      // PAS de message ici : le bloc d'attente ci-dessous EST le retour du
      // clic, et il dit le délai réel. Deux textes côte à côte disant la même
      // chose autrement, c'était la contradiction qu'on vient de corriger.
      setReclamationTardive(false);
      // Relit la ligne pour afficher l'attente même après un rechargement.
      try { setRun(await lireDernierRunDressing(user?.id)); }
      catch { /* l'affichage se rattrape au prochain montage */ }
      track('vinted_sync_dressing', { source, reprise: dejaSync, voie: 'file' });
      return;
    }

    const texte = (() => {
      if (r?.reason === 'cadence') {
        const m = r.prochaine_dans_min ?? 15;
        return fr
          ? `Ton dressing vient d'être synchronisé — tu pourras actualiser dans ~${m} min.`
          : `Your closet was just synced — you can refresh in ~${m} min.`;
      }
      if (r?.reason === 'deja_en_attente') {
        return fr
          ? "Une demande est déjà en attente : elle partira à la prochaine ouverture de Chrome sur ton ordinateur."
          : 'A request is already pending: it will start the next time you open Chrome on your computer.';
      }
      // Distinct de « déjà en attente » : là, ça tourne pour de bon.
      if (r?.reason === 'sync_en_cours') {
        return fr
          ? "Une synchronisation est déjà en cours sur ton ordinateur. Laisse-la finir, le résultat s'affichera ici."
          : 'A sync is already running on your computer. Let it finish — the result will show up here.';
      }
      // Les deux refus « pas d'extension capable » (jamais vue / trop
      // ancienne) rendent LE MÊME message que le blocage affiché sous le
      // bouton : du point de vue de l'utilisateur c'est la même situation et
      // le même geste. Aucun numéro de version à l'écran (2026-08-09).
      if (r?.reason === 'extension_trop_ancienne' || r?.reason === 'extension_jamais_vue') {
        return MESSAGE_BLOCAGE;
      }
      return fr
        ? "La demande n'a pas pu être envoyée. Réessaie dans un instant."
        : "The request couldn't be sent. Try again in a moment.";
    })();
    setMessage({ ton: r?.reason === 'deja_en_attente' ? 'vert' : 'orange', texte });
  };

  // Bilan du dernier run terminé — affiché seulement s'il n'y a pas de sync en
  // cours (sinon deux états concurrents à l'écran).
  const bilan = (() => {
    if (enCours || !run || run.status === 'running' || run.status === 'queued') return null;
    if (run.status === 'done') {
      // ── « done 0 » ≠ succès muet (2026-08-07, cas Sam, jour du blast) ────
      // Un run propre à 0 article lu a DEUX lectures que l'utilisateur ne
      // peut pas départager : dressing réellement vide (cas de Sam — il a
      // créé ses annonces APRÈS son premier clic) ou dressing lu sur le
      // MAUVAIS compte (autre compte Vinted connecté dans ce navigateur,
      // autre profil Chrome). L'ancien bilan vert « 0 article importé, 0 mis
      // à jour » se lisait comme « ça n'a pas marché » — la plupart ne
      // recliqueront pas. On dit donc les deux cas, avec le geste à faire.
      if ((run.items_vus ?? 0) === 0) {
        return { ton: 'orange', texte: fr
          ? "Synchronisation terminée : aucune annonce en ligne sur le compte Vinted connecté dans ce navigateur. Dressing vide ? Tout est normal — tes prochaines annonces remonteront ici au prochain clic. Sinon, ouvre vinted.fr dans ce navigateur, vérifie que tu es sur TON compte, puis relance."
          : "Sync finished: no live listings on the Vinted account signed in to this browser. Empty closet? All good — your next listings will show up here on your next sync. Otherwise, open vinted.fr in this browser, make sure you're on YOUR account, then run it again." };
      }
      // ── SYNC MONO-COMPTE (27/08) : le compte Vinted connecté diffère de
      // celui du dernier relevé. La sync a tourné normalement (import + mises
      // à jour), seul le marquage « plus en ligne » a été sauté — on le dit
      // simplement, sans alarme : c'est le comportement voulu pour qui gère
      // plusieurs boutiques. Reconnu sur la [note] posée par l'extension.
      if (/changement de compte Vinted/i.test(String(run.erreur ?? ''))) {
        return { ton: 'vert', texte: fr
          ? `Dressing synchronisé — ${run.items_crees ?? 0} article${(run.items_crees ?? 0) > 1 ? 's' : ''} importé${(run.items_crees ?? 0) > 1 ? 's' : ''}, ${run.items_maj ?? 0} mis à jour. Compte Vinted différent de la dernière synchro : rien n'a été marqué « plus en ligne » ce coup-ci.`
          : `Closet synced — ${run.items_crees ?? 0} item${(run.items_crees ?? 0) === 1 ? '' : 's'} imported, ${run.items_maj ?? 0} updated. Different Vinted account than last sync: nothing was marked "no longer online" this time.` };
      }
      return { ton: 'vert', texte: fr
        ? `Dressing synchronisé — ${run.items_crees ?? 0} article${(run.items_crees ?? 0) > 1 ? 's' : ''} importé${(run.items_crees ?? 0) > 1 ? 's' : ''}, ${run.items_maj ?? 0} mis à jour.`
        : `Closet synced — ${run.items_crees ?? 0} item${(run.items_crees ?? 0) === 1 ? '' : 's'} imported, ${run.items_maj ?? 0} updated.` };
    }
    if (run.status === 'interrupted') {
      // Vinted a bloqué (DataDome) ou la session Vinted a expiré. Ni alarme ni
      // faute de l'utilisateur : la reprise repartira de la page courante.
      return { ton: 'orange', texte: fr
        ? `Synchronisation mise en pause par Vinted après ${run.items_vus ?? 0} article${(run.items_vus ?? 0) > 1 ? 's' : ''}. Vérifie que tu es bien connecté à Vinted dans ce navigateur, puis réessaie un peu plus tard — la reprise repart là où elle s'est arrêtée.`
        : `Vinted paused the sync after ${run.items_vus ?? 0} item${(run.items_vus ?? 0) === 1 ? '' : 's'}. Check that you're signed in to Vinted in this browser, then try again a bit later — it resumes where it stopped.` };
    }
    if (run.status === 'failed') {
      // ⚠️ Surtout pas humanizeJobError ici : son repli parle de « publication »
      // et renvoie relancer depuis la fiche article — un contresens pour une
      // sync. Les messages posés par l'extension sont déjà lisibles ; on ne
      // masque que les pavés techniques (URL, JSON, traces).
      const brut = String(run.erreur ?? '').trim();
      // ── 403 = encart actionnable (2026-08-13, relevé en base) ──────────────
      // Les 9 comptes ayant pris un 403 ce jour sont TOUS inscrits d'hier ou
      // d'aujourd'hui ; 6/9 n'ont jamais réussi une seule sync, les 3 autres
      // ont réussi juste APRÈS leur 403. Problème de PREMIÈRE CONNEXION, pas
      // un bot-shield aléatoire. L'ancien message affirmait « ta connexion
      // Vinted n'est pas en cause » — précisément ce que la sonde ne sait pas,
      // puisque le 403 tombe AVANT la vérification de session. On affiche donc
      // le geste qui règle 9 cas sur 10 (se connecter à Vinted), sans rien
      // affirmer, et ce POUR TOUT texte d'échec contenant « 403 » — reprise
      // armée comprise. Le texte d'origine reste inchangé en base : affichage
      // seul. (Les branches [retry403] ci-dessous deviennent inertes pour les
      // textes 403 — conservées pour le contrat RETRY403_RE et l'effet de
      // suivi pendant l'attente, qui continue de relire le run.)
      if (brut.includes('403')) {
        return { ton: 'orange', texte: fr
          ? "Vinted n'a pas répondu à FillSell. Dans 9 cas sur 10, c'est que tu n'es pas connecté à Vinted dans ce navigateur.\n1. Ouvre vinted.fr dans un onglet du MÊME Chrome\n2. Connecte-toi\n3. Reviens ici et relance la synchronisation\nSi tu es déjà connecté, réessaie dans quelques minutes."
          : "Vinted didn't answer FillSell. 9 times out of 10, it means you're not signed in to Vinted in this browser.\n1. Open vinted.fr in a tab of the SAME Chrome\n2. Sign in\n3. Come back here and run the sync again\nIf you're already signed in, try again in a few minutes." };
      }
      // ── Reprise automatique armée après un 403 (2026-08-12) ────────────────
      // Tant que l'échéance (+ marge) n'est pas passée, ce n'est PAS un échec :
      // on dit la reprise et le délai — c'est le silence qui faisait marteler
      // le bouton (3 comptes le 12/08 au soir, re-clics à moins de 3 min), et
      // le martèlement est probablement ce qui arme le bouclier. Échéance
      // dépassée sans reprise (Chrome fermé, alarme perdue) → échec anti-robot
      // définitif, sans montrer le marqueur brut.
      const retry = brut.match(RETRY403_RE);
      if (retry) {
        const prochaine = Date.parse(retry[3]);
        if (Number.isFinite(prochaine) && Date.now() < prochaine + RETRY403_GRACE_MS) {
          const min = Math.max(1, Math.ceil((prochaine - Date.now()) / 60000));
          return { ton: 'orange', texte: fr
            ? `Vinted a momentanément bloqué la lecture (protection anti-robot). Nouvelle tentative automatique dans ~${min} min (tentative ${retry[1]}/${retry[2]}) — laisse Chrome ouvert sur ton ordinateur, rien d'autre à faire.`
            : `Vinted temporarily blocked reading (anti-bot protection). Retrying automatically in ~${min} min (attempt ${retry[1]}/${retry[2]}) — keep Chrome open on your computer, nothing else to do.` };
        }
        return { ton: 'rouge', texte: fr
          ? "Synchronisation échouée : Vinted a refusé l'accès (protection anti-robot) et la reprise automatique n'a pas pu s'exécuter — Chrome était sans doute fermé. Réessaie en le laissant ouvert ; ta connexion Vinted n'est pas en cause."
          : "Sync failed: Vinted refused access (anti-bot protection) and the automatic retry couldn't run — Chrome was probably closed. Try again and keep it open; your Vinted login is not the issue." };
      }
      // Session Vinted absente/expirée : le seul échec que l'utilisateur peut
      // résoudre seul — message dédié, actionnable, sans code HTTP à l'écran.
      // Reconnu sur le texte posé par la sonde (vinted.js), qui inclut
      // « session Vinted … (HTTP 401) ».
      if (/session vinted|HTTP 401/i.test(brut)) {
        return { ton: 'orange', texte: fr
          ? "Tu n'es pas connecté à Vinted dans ce navigateur. Connecte-toi sur vinted.fr, puis relance la synchronisation."
          : "You're not signed in to Vinted in this browser. Sign in on vinted.fr, then start the sync again." };
      }
      const lisible = brut && brut.length <= 200 && !/[{}<>]|https?:\/\//.test(brut)
        ? brut
        : (fr ? "un imprévu technique — le détail est enregistré" : 'a technical issue — the detail has been recorded');
      return { ton: 'rouge', texte: fr
        ? `Synchronisation échouée : ${lisible}. Tu peux réessayer.`
        : `Sync failed: ${lisible}. You can try again.` };
    }
    // Demande distante close sans exécution (2026-08-05) : 'cancelled' = la
    // cadence de 15 min l'a refusée au moment où l'ordinateur l'a reçue,
    // 'expired' = personne ne l'a réclamée dans les 6 h. Le motif écrit en base
    // est déjà rédigé pour être lu — on le montre tel quel s'il est propre.
    if (run.status === 'cancelled' || run.status === 'expired') {
      const brut = String(run.erreur ?? '').trim();
      const propre = brut && brut.length <= 200 && !/[{}<>]|https?:\/\//.test(brut);
      return { ton: 'orange', texte: propre
        ? (fr ? `Demande de synchronisation non exécutée : ${brut}.` : `Sync request not run: ${brut}.`)
        : (fr ? "Ta demande de synchronisation n'a pas été exécutée. Tu peux la relancer."
              : "Your sync request wasn't run. You can start it again.") };
    }
    return null;
  })();

  // Blocage présent ⇒ le bilan du run passé se tait (contradiction sinon) ;
  // `message` reste : c'est le retour d'un clic de CETTE session.
  const avis = message || (blocage ? null : bilan);
  const AVIS_COULEURS = {
    vert:   { bg: '#F0FDFB', bord: 'rgba(13,148,136,0.2)',  texte: '#1B6E62' },
    orange: { bg: '#FFF7ED', bord: '#FED7AA',               texte: '#9A3412' },
    rouge:  { bg: '#FEF2F2', bord: '#FECACA',               texte: '#B91C1C' },
  };

  return (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E7E3D8",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <PlatformLogo platform="vinted" size={20}/>
        <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>
          {fr?"Tu vends déjà sur Vinted ?":"Already selling on Vinted?"}
        </div>
      </div>

      <SecondaryButton disabled={!peutLancer||enCours||enCadence||envoi||enAttenteDistante||attenteOccupee} onClick={lancer}>
        {enCours
          ? (fr?"Synchronisation en cours…":"Syncing…")
          : envoi
            ? (fr?"Envoi de la demande…":"Sending request…")
            : attenteOccupee
              ? (fr?"Sync en attente":"Sync waiting")
              : enAttenteDistante
                ? (fr?"Demande en attente":"Request pending")
                : dejaSync
                  ? (fr?"Actualiser mon dressing":"Refresh my closet")
                  : (fr?"Synchroniser mon dressing Vinted":"Sync my Vinted closet")}
      </SecondaryButton>

      {/* Une ligne grise, pas un encart. Deux choses, dans cet ordre : l'HEURE
          RÉELLE de la dernière synchro (un fait, affiché à chaque fois qu'il
          existe) et le rappel que c'est automatique (une promesse, donc
          conditionnée). */}
      {ligneSync&&(
        <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578"}}>{ligneSync}</div>
      )}

      {/* Extension OCCUPÉE (2026-08-07 soir, cas antavintage : 22
          republications en vol, 6 re-clics sur un « extension muette »
          mensonger). La sync n'a pas échoué : elle attend le verrou de
          l'extension. Estimation HONNÊTE : la même formule 5-7 min par
          republication que la feuille de lot — jamais un chiffre inventé.
          Le bouton est désactivé tant que ça dure : recliquer n'apporte
          rien (la demande est déjà en file dans l'extension). */}
      {attenteOccupee&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#F6F5F1",border:"1px solid #E7E3D8",borderRadius:10,padding:"10px 12px"}}>
          <Loader size={18} thickness={2}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#5C6560"}}>
              {fr?"L'extension est occupée — ta synchronisation attend son tour":"The extension is busy — your sync is waiting its turn"}
            </div>
            <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578",marginTop:2}}>
              {fr
                ?`${repubEnVol} republication${repubEnVol>1?'s':''} en cours — la synchronisation partira automatiquement juste après${repubEnVol>0?` (compte ${repubEnVol*5>=60?`environ ${Math.ceil(repubEnVol*5/60)} h`:`~${repubEnVol*5}-${repubEnVol*7} min`})`:''}. Pas besoin de recliquer.`
                :`${repubEnVol} repost${repubEnVol>1?'s':''} in progress — the sync will start automatically right after${repubEnVol>0?` (allow ${repubEnVol*5>=60?`about ${Math.ceil(repubEnVol*5/60)} h`:`~${repubEnVol*5}-${repubEnVol*7} min`})`:''}. No need to click again.`}
            </div>
          </div>
        </div>
      )}

      {/* Attente d'une réclamation. DEUX discours, dans cet ordre :
          · le cas FRÉQUENT (Chrome ouvert) — un loader et le délai RÉEL,
            2 min au plus. C'est ce qui se passe la plupart du temps ;
          · le cas du PC éteint, seulement APRÈS 3 min sans réponse. Le
            présenter d'emblée, comme avant, c'était inquiéter pour rien.
          Le poll qui fait basculer l'un vers l'autre est borné à 3 min. */}
      {/* TROISIÈME cas depuis le 2026-08-11 : le silence AVÉRÉ. Une demande
          'queued' est par construction non réclamée (claimed_at ne se pose
          qu'en passant 'running') ; tant que le heartbeat est frais, « ça
          arrive » reste vrai. Passé EXT_SILENCE_MAX_MS sans un seul poll, ce
          n'est plus une attente, c'est un ordinateur éteint — et l'écran le
          dit au lieu d'afficher une progression qui n'avancera pas. */}
      {enAttenteDistante&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#F6F5F1",border:"1px solid #E7E3D8",borderRadius:10,padding:"10px 12px"}}>
          {(reclamationTardive||horsLigne)
            ? <div style={{fontSize:18,lineHeight:1}}>🕓</div>
            : <Loader size={18} thickness={2}/>}
          <div style={{minWidth:0}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#5C6560"}}>
              {horsLigne
                ? (fr?"Ton ordinateur ne répond pas":"Your computer isn't responding")
                : reclamationTardive
                  ? (fr?"Ton ordinateur n'a pas encore répondu":"Your computer hasn't answered yet")
                  : (fr?"Demande envoyée":"Request sent")}
            </div>
            <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578",marginTop:2}}>
              {horsLigne
                ? (fr
                    ? "Ouvre Chrome avec l'extension FillSell sur ton ordinateur : ta demande partira dans la foulée."
                    : 'Open Chrome with the FillSell extension on your computer: your request will go out right after.')
                : reclamationTardive
                  ? (fr
                      ? `Ta synchronisation partira à la prochaine ouverture de Chrome sur ton ordinateur. Tu peux fermer ${isNative ? "l'application" : 'cette page'}.`
                      : `Your sync will start the next time you open Chrome on your computer. You can close ${isNative ? 'this app' : 'this page'}.`)
                  : (fr
                      ? "Elle part au prochain passage de ton extension — 2 minutes au plus."
                      : 'It starts at your extension’s next check — 2 minutes at most.')}
            </div>
          </div>
        </div>
      )}

      {/* Jamais un bouton mort sans explication : la cadence dit quand.
          Masquée sous blocage : « tu pourras actualiser dans ~12 min » serait
          une promesse fausse dans un navigateur sans extension. */}
      {cadenceTexte&&!blocage&&(
        <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578"}}>{cadenceTexte}</div>
      )}

      {enCours&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#F0FDFB",border:"1px solid rgba(13,148,136,0.18)",borderRadius:10,padding:"10px 12px"}}>
          <Loader size={18} thickness={2}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1B6E62"}}>{progression}</div>
            <div style={{fontSize:11,color:"#6B7A75",marginTop:2}}>
              {fr?"Tu peux fermer cet onglet : la synchronisation continue.":"You can close this tab: the sync keeps running."}
            </div>
          </div>
        </div>
      )}

      {avis&&(()=>{
        const c=AVIS_COULEURS[avis.ton]||AVIS_COULEURS.orange;
        // whiteSpace pre-line : l'encart 403 est le seul texte à retours à la
        // ligne (étapes numérotées) — sans effet sur les autres avis.
        return (
          <div style={{background:c.bg,border:`1px solid ${c.bord}`,borderRadius:10,padding:"10px 12px",fontSize:12,lineHeight:1.5,color:c.texte,whiteSpace:'pre-line'}}>
            {avis.texte}
          </div>
        );
      })()}

      {/* Synchro impossible : LA phrase, la même partout — ordinateur,
          téléphone web, application native. Un seul geste à comprendre, et
          rien qui exige de savoir ce qu'est un numéro de version. */}
      {blocage&&(
        <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578"}}>{MESSAGE_BLOCAGE}</div>
      )}

      {/* Le contrat, en toutes lettres — ENTIÈREMENT replié (2026-08-27,
          compaction de la carte remontée en tête d'écran) : par défaut ne
          reste que le lien « En savoir plus » ; la phrase de contexte (« On
          lit tes annonces en ligne… ») et les deux lignes de détail ne
          s'affichent qu'au dépliage. Rien n'est supprimé — la ligne
          « historique partiel » reste indispensable (un vendeur à 400 ventes
          qui n'en voit revenir qu'une poignée conclut à une sync ratée). */}
      <div style={{fontSize:11.5,lineHeight:1.55,color:"#8A8578"}}>
        {infosDepliees&&(
          <div style={{marginBottom:4}}>
            {fr
              ? "On lit tes annonces en ligne (titre, prix, photos, vues, favoris). Rien n'est publié, modifié ni supprimé sur Vinted."
              : "We read your online listings (title, price, photos, views, favourites). Nothing is published, edited or deleted on Vinted."}
            <br/>
            {fr
              ? "Vinted n'expose pas tout l'historique de ventes : on récupère les annonces en ligne et les ventes récentes, pas l'intégralité de ton passé."
              : "Vinted doesn't expose the full sales history: we get your online listings and recent sales, not everything you've ever sold."}
            <br/>
            {fr
              ? "Les articles importés arrivent avec un prix d'achat à compléter — sans lui, aucune marge ne peut être calculée."
              : "Imported items arrive with a purchase price to fill in — without it, no margin can be computed."}
          </div>
        )}
        <button
          onClick={()=>setInfosDepliees(v=>!v)}
          style={{background:"none",border:"none",padding:"2px 0",margin:0,fontSize:11.5,fontWeight:700,color:"#1B6E62",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit"}}
        >
          {infosDepliees ? (fr?"Réduire":"Show less") : (fr?"En savoir plus":"Learn more")}
        </button>
      </div>
    </div>
  );
}

// ── Feuille de prix de republication (É5, 2026-08-05 — validée par Nico) ─────
// Le prix est LA première chose visible au moment de republier. Presets en
// pourcentage ARRONDIS À L'EURO INFÉRIEUR (−10 % de 25 € → 22 €), PLANCHER
// 2 € (les articles plafonnés sont NOMMÉS dans l'aperçu) ; champ libre en
// solo (min 1 €, la garde de publication). En lot : réglage global seulement
// — l'édition par article à 30 annonces serait inutilisable.
// ── É6 : republication automatique (PRO uniquement — 2026-08-05) ─────────────
// Réglage : profiles.platform_settings.vinted.republish_auto {actif,
// age_jours, plafond_jour} — plafond (1..50) ET seuil d'ancienneté (7..365)
// RÉGLABLES par l'utilisateur. Les DEUX bornes d'age_jours doivent rester
// identiques à celles de maybeAutoRepublish (chrome-extension/background.js) :
// si elles divergent, cette carte annonce « N éligibles » sur un seuil que
// l'extension n'applique pas — un compteur qui ment.
// ⚠️ PLANCHER À 7 JOURS, et ce n'est pas un chiffre rond arbitraire : une
// annonce republiée 1 ou 2 jours après sa mise en ligne est un motif que
// Vinted sait repérer — c'est le compte de l'utilisateur qui prend le risque,
// pas nous. Descendu à 1 le 2026-08-09, remonté à 7 le jour même. Ne pas le
// rebaisser sans arbitrage explicite.
// Écriture en lecture-fusion-écriture (platform_settings porte aussi
// l'adresse Leboncoin). À l'activation : on dit CE QUI VA SE PASSER (combien
// d'annonces éligibles aujourd'hui, à quel rythme) ET CE QUE ÇA COÛTE —
// depuis la grille du 2026-08-08 la republication est payante pour tous
// (1 Pépite/annonce, auto comprise) : le coût et le volume mensuel maximum
// s'affichent à côté du réglage, personne ne doit découvrir ce débit dans
// son solde. Si l'auto échoue faute de Pépites, le RPC pose
// republish_auto.derniere_erreur='pepites_insuffisantes' (effacée au succès
// suivant) — ce bloc l'affiche en clair. L'automatisation reste un avantage
// Pro (avantage de FONCTIONNALITÉ, pas de prix). Si le compte cesse d'être
// Pro, le background coupe proprement (arret_motif='plan_non_pro') — ce bloc
// AFFICHE ce motif.
function RepublishAutoBlock({ lang, user, isPro, openUpgradeModal }) {
  const fr = lang !== 'en';
  const [cfg, setCfg] = useState(null);          // republish_auto de platform_settings
  const [eligibles, setEligibles] = useState(null);
  const [moisCount, setMoisCount] = useState(null);
  const [busy, setBusy] = useState(false);
  // Bornes UNIQUES, réutilisées par le clamp et par les deux champs de saisie.
  const bornerAge = (v) => Math.min(365, Math.max(7, Number(v) || 30));
  const bornerPlafond = (v) => Math.min(50, Math.max(1, Number(v) || 10));
  const ageJours = bornerAge(cfg?.age_jours);
  const plafond = bornerPlafond(cfg?.plafond_jour);

  // Chargement du réglage + compteur du mois. Le décompte des éligibles, lui,
  // vit dans l'effet suivant : il dépend d'ageJours, qui change au gré de
  // l'utilisateur.
  useEffect(() => {
    if (!user?.id) return;
    let stale = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('platform_settings').eq('id', user.id).maybeSingle();
      if (stale) return;
      setCfg(data?.platform_settings?.vinted?.republish_auto ?? {});
      const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
      const { count: nMois } = await supabase.from('cross_post_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('action', 'republish').eq('status', 'published')
        .eq('platform_fields->>republish_source', 'auto')
        .gte('published_at', debutMois.toISOString());
      if (!stale && typeof nMois === 'number') setMoisCount(nMois);
    })();
    return () => { stale = true; };
  }, [user?.id]);

  // Recompte À LA VOLÉE dès qu'ageJours bouge : changer le seuil sans voir le
  // nombre d'annonces concernées bouger, c'est régler à l'aveugle. Gardé sur
  // `cfgCharge` pour ne pas compter d'abord avec le défaut 30 puis recompter
  // une seconde plus tard avec la vraie valeur — un chiffre qui saute.
  const cfgCharge = cfg !== null;
  useEffect(() => {
    if (!user?.id || !cfgCharge) return;
    let stale = false;
    (async () => {
      const seuil = new Date(Date.now() - ageJours * 86_400_000).toISOString();
      // Aligné sur la SÉLECTION RÉELLE de l'extension (maybeAutoRepublish,
      // background.js) — doctrine du bandeau d'É6 : s'ils divergent, ce
      // compteur ment. Depuis le 2026-08-28 : sans-photo exclus (photos->0
      // nul = NULL ou [], même filtre que l'extension et que le refus serveur
      // article_sans_photo) et hidden/draft exclus (décision Nico : jamais
      // présentés comme en ligne — NULL passe, c'est un article né FillSell
      // jamais relu par la sync).
      const { count } = await supabase.from('inventaire')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('statut', 'stock')
        .not('vinted_item_id', 'is', null).is('disparu_le', null)
        .not('photos->0', 'is', null)
        .or('vinted_status.is.null,vinted_status.not.in.(hidden,draft)')
        .lt('listed_at_guess', seuil);
      if (!stale && typeof count === 'number') setEligibles(count);
    })();
    return () => { stale = true; };
  }, [user?.id, cfgCharge, ageJours]);

  async function ecrire(patch) {
    if (busy) return;
    setBusy(true);
    try {
      // Lecture-fusion-écriture + .select() de contrôle (leçon RLS profiles).
      const { data: cur } = await supabase.from('profiles').select('platform_settings').eq('id', user.id).maybeSingle();
      const ps = cur?.platform_settings ?? {};
      const next = { ...ps, vinted: { ...(ps.vinted ?? {}), republish_auto: { ...(ps.vinted?.republish_auto ?? {}), ...patch } } };
      const { data, error } = await supabase.from('profiles').update({ platform_settings: next }).eq('id', user.id).select('platform_settings');
      if (!error && data?.length) setCfg(data[0].platform_settings?.vinted?.republish_auto ?? {});
    } finally {
      setBusy(false);
    }
  }

  if (!isPro) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E7E3D8', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B' }}>
          ✨ {fr ? 'Republication automatique' : 'Automatic reposting'}
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#10201B', color: '#F2B48C', borderRadius: 99, padding: '2px 8px', verticalAlign: 'middle' }}>PRO</span>
        </div>
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.5 }}>
          {fr
            ? 'Tes annonces qui stagnent depuis plus de 30 jours sont republiées toutes seules, au rythme humain — un avantage du plan Pro.'
            : 'Listings sitting for 30+ days get reposted on their own, at a human pace — a Pro plan perk.'}
        </div>
        <button onClick={() => openUpgradeModal?.(null,'stock_republication_auto')}
          style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 999, border: 'none', background: 'linear-gradient(120deg,#E8956D,#F2B48C)', color: '#10201B', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {/* Le bloc porte déjà le badge PRO et dit « un avantage du plan
              Pro » : le bouton, lui, ouvre le choix des paliers — il ne
              nomme donc plus Pro (2026-08-09). */}
          {fr ? 'Voir les offres' : 'See plans'}
        </button>
      </div>
    );
  }

  const actif = cfg?.actif === true;
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E7E3D8', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B' }}>
          🔁 {fr ? 'Republication automatique' : 'Automatic reposting'}
        </div>
        <button disabled={busy}
          onClick={() => ecrire(actif ? { actif: false, arrete_le: new Date().toISOString(), arret_motif: 'utilisateur' } : { actif: true, age_jours: ageJours, plafond_jour: plafond, arret_motif: null })}
          style={{ padding: '7px 14px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            background: actif ? '#FBEDEC' : 'linear-gradient(120deg,#2F9E90,#1B6E62)', color: actif ? '#8C2F28' : '#fff', opacity: busy ? 0.6 : 1 }}>
          {actif ? (fr ? 'Couper' : 'Turn off') : (fr ? 'Activer' : 'Turn on')}
        </button>
      </div>
      {cfg?.arret_motif === 'plan_non_pro' && !actif && (
        <div style={{ fontSize: 12, color: '#8C2F28', background: '#FBEDEC', border: '1px solid #EFC2BE', borderRadius: 10, padding: '8px 10px', lineHeight: 1.5 }}>
          {fr
            ? "L'automatisation s'est coupée : ton compte n'est plus Pro. Elle se réactive en un clic dès que tu repasses Pro."
            : 'Automation switched itself off: your account is no longer Pro. Re-enable it in one click once you are Pro again.'}
        </div>
      )}
      {cfg?.derniere_erreur === 'pepites_insuffisantes' && (
        <div style={{ fontSize: 12, color: '#8C2F28', background: '#FBEDEC', border: '1px solid #EFC2BE', borderRadius: 10, padding: '8px 10px', lineHeight: 1.5 }}>
          {fr
            ? 'La republication automatique est en pause : plus assez de Pépites (1 Pépite par annonce). Elle reprendra toute seule dès que ton solde le permettra — recharge ou attends tes Pépites mensuelles.'
            : 'Automatic reposting is paused: not enough Nuggets (1 Nugget per listing). It will resume on its own as soon as your balance allows — top up or wait for your monthly Nuggets.'}
        </div>
      )}
      {actif ? (
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.55 }}>
          {fr
            ? <>ON — {moisCount ?? '…'} republiée{(moisCount ?? 0) > 1 ? 's' : ''} ce mois. {eligibles != null ? `${eligibles} annonce${eligibles > 1 ? 's' : ''} éligible${eligibles > 1 ? 's' : ''} aujourd'hui (en ligne depuis plus de ${ageJours} j)` : '…'} — elles partiront au rythme d'au plus {plafond}/jour, une par passage de l'extension, Chrome ouvert.</>
            : <>ON — {moisCount ?? '…'} reposted this month. {eligibles != null ? `${eligibles} listing${eligibles > 1 ? 's' : ''} eligible today (live for over ${ageJours} d)` : '…'} — they will go at up to {plafond}/day, one per extension pass, with Chrome open.</>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.55 }}>
          {fr
            ? `À l'activation : ${eligibles != null ? `${eligibles} annonce${eligibles > 1 ? 's' : ''} éligible${eligibles > 1 ? 's' : ''} aujourd'hui` : '…'} (en ligne depuis plus de ${ageJours} j), republiées au rythme d'au plus ${plafond}/jour — une par passage de l'extension, Chrome ouvert. Tu peux couper à tout moment.`
            : `On activation: ${eligibles != null ? `${eligibles} eligible listing${eligibles > 1 ? 's' : ''} today` : '…'} (live for over ${ageJours} d), reposted at up to ${plafond}/day — one per extension pass, with Chrome open. Turn it off anytime.`}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.55, background: '#F6F5F1', border: '1px solid #E7E3D8', borderRadius: 10, padding: '8px 10px' }}>
        {fr
          ? <>💎 Chaque republication automatique coûte <strong>1 Pépite</strong>, comme une republication manuelle. Au plafond actuel de {plafond}/jour, cela représente au maximum <strong>~{plafond * 30} Pépites par mois</strong> — en pratique moins : seules les annonces éligibles partent.</>
          : <>💎 Each automatic repost costs <strong>1 Nugget</strong>, same as a manual repost. At your current cap of {plafond}/day, that is at most <strong>~{plafond * 30} Nuggets per month</strong> — in practice fewer: only eligible listings go.</>}
      </div>
      {/* ⚠️ `key` sur les deux champs : ce sont des inputs NON CONTRÔLÉS
          (defaultValue), et React n'écrit defaultValue dans le DOM qu'au
          MONTAGE. Sans clé, le champ se peint à la valeur par défaut pendant
          que le profil charge (cfg=null → 30 / 10) et n'affiche JAMAIS la
          valeur réellement enregistrée : un compte réglé à 25/jour lisait
          « 10 ». La clé force le remontage quand la valeur effective change —
          au chargement du profil, puis après chaque écriture. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5C6560', fontWeight: 600 }}>
          {fr ? 'Plafond par jour :' : 'Daily cap:'}
          <input key={`plafond-${plafond}`} type="number" min={1} max={50} defaultValue={plafond} disabled={busy}
            onBlur={e => { const v = bornerPlafond(e.target.value); e.target.value = String(v); if (v !== plafond) ecrire({ plafond_jour: v }); }}
            style={{ width: 64, padding: '7px 9px', borderRadius: 9, border: '1px solid #E7E3D8', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }} />
        </label>
        {/* Saisie LIBRE en jours (7..365), pas une liste de choix : 23 doit
            être atteignable. Le recompte des éligibles suit la valeur (effet
            ci-dessus), donc le texte de la carte dit ce que ce seuil change. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5C6560', fontWeight: 600 }}>
          {fr ? 'En ligne depuis plus de :' : 'Live for more than:'}
          <input key={`age-${ageJours}`} type="number" min={7} max={365} defaultValue={ageJours} disabled={busy}
            onBlur={e => { const v = bornerAge(e.target.value); e.target.value = String(v); if (v !== ageJours) ecrire({ age_jours: v }); }}
            style={{ width: 64, padding: '7px 9px', borderRadius: 9, border: '1px solid #E7E3D8', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }} />
          {fr ? 'jours' : 'days'}
        </label>
      </div>
      {/* Le plancher se JUSTIFIE, il ne s'impose pas : sans cette phrase, un
          utilisateur qui tape 2 et voit 7 s'inscrire croit à un bug. */}
      <div style={{ fontSize: 11.5, color: '#8A8578', lineHeight: 1.5, marginTop: -4 }}>
        {fr
          ? 'Minimum 7 jours : republier une annonce mise en ligne il y a un ou deux jours est un motif que Vinted sait repérer — c’est ton compte qui prendrait le risque.'
          : 'Minimum 7 days: reposting a listing published only a day or two ago is a pattern Vinted can spot — your account would carry the risk.'}
      </div>
    </div>
  );
}

const REPUB_PLANCHER_EUR = 2;
// ── Avancement d'une republication (2026-08-05) ───────────────────────────────
// UNE SEULE source de vocabulaire pour la pastille de carte ET la feuille : la
// carte porte le mot court, la feuille la phrase entière. Ils ne peuvent pas se
// contredire.
// Machine à étapes RÉELLE (migration 20260805100000, background.js) :
//   a_capturer → captured → deleted → recreated
// Règle d'écriture : chaque étape dit CE QUI EST EN SÉCURITÉ. L'utilisateur qui
// ouvre cette feuille cherche à savoir s'il risque de perdre son annonce — la
// réponse doit être dans la phrase, pas déduite.
const REPUB_ORDRE = ['a_capturer', 'captured', 'deleted', 'recreated'];

// ── Ancres et durées par étape (écran de progression v2, 2026-08-28 soir) ─────
// UNE BARRE PAR JOB : l'étape ne pose que des ANCRES, c'est le TEMPS ÉCOULÉ
// qui fait avancer la barre vers l'ancre suivante via f(x) = 1 - exp(-x) —
// elle avance à chaque seconde, rampe de plus en plus lentement si l'étape
// traîne, et n'atteint jamais l'ancre suivante par interpolation (donc jamais
// de recul au changement d'étape). Le pourcentage global unique de 2.4.73
// restait figé 175 s par republication : exact et inutilisable (69 % des lots
// font ≤ 5 articles, 30 % un seul — mesure du 28/08 sur 124 lots).
// Les 4 étapes ci-dessous sont les SEULES qui existent ; step absent (jobs
// 0.6.4/0.6.6) ou inconnu = a_capturer, le job reste affiché.
const REPUB_ANCRES = { a_capturer: 0, captured: 9, deleted: 55, recreated: 100 };
// Durées ATTENDUES de chaque étape, en secondes (mesures prod du 28/08 : 137
// captures + 30 republications). Ancres et durées se retouchent ICI, ensemble.
const REPUB_DUREES = { a_capturer: 17, captured: 20, deleted: 155 };
// Statuts terminaux : barre FIGÉE à 100 %, le tick ne les regarde plus.
// needs_user n'y est PAS : il sort des lignes ET du compteur (ligne « action
// requise » dédiée). ⚠️ Piège de nommage : il existe un STATUS 'deleted'
// (jobs action publish) DISTINCT de l'ÉTAPE republish_step 'deleted' — ne
// jamais tester l'un pour l'autre.
const REPUB_STATUS_RESOLUS = ['published', 'sold', 'failed', 'cancelled', 'dry_run_completed'];
// Étape normalisée d'un job republish : absente/inconnue = a_capturer.
const repubStepDe = (j) => {
  const s = j.platform_fields?.republish_step;
  return REPUB_ANCRES[s] !== undefined ? s : 'a_capturer';
};
// Fini = statut terminal OU étape recreated : barre figée à 100 %. processing
// n'y est pas : il compte EXACTEMENT comme pending (chaque republication le
// traverse — il avait été oublié en 2.4.73).
const repubJobFini = (j) => REPUB_STATUS_RESOLUS.includes(j.status) || repubStepDe(j) === 'recreated';

// Phrase du bloc actif : ce que la machine FAIT, pas l'état interne.
// a_capturer et captured partagent la phrase de relevé (avant l'étape deleted,
// le travail visible est la lecture/sauvegarde de l'annonce). L'étape
// 'deleted' est le seul moment où l'annonce n'est plus en ligne : « On
// recrée » est exact sans inquiéter — ne pas mentir, ne pas alarmer.
const repubPhraseActive = (step, fr) => step === 'deleted'
  ? (fr ? 'On recrée ton annonce sur Vinted' : 'We are recreating your listing on Vinted')
  : (fr ? 'On relève ton annonce sur Vinted' : 'We are reading your listing on Vinted');

// Bloc « EN COURS » — LA seule barre de l'écran, UN job à la fois : le
// traitement réel est séquentiel (une republication toutes les ~3 min en
// prod), la barre par job de 2.4.74 faisait avancer 6 barres jumelles
// ensemble — illisible, et faux. Composant SÉPARÉ : le tick d'1 s ne re-rend
// que lui, jamais l'onglet ; il s'arrête au démontage (plus d'actif).
function RepubBlocActif({ lang, job, titre }) {
  const fr = lang !== 'en';
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Mémoire locale de session : rien en base n'horodate l'entrée dans une
  // étape (et poser un horodatage sortirait du périmètre affichage), donc on
  // mémorise la première OBSERVATION de chaque étape et on interpole depuis.
  // Map par job.id : survit au passage au job suivant tant que le bloc reste
  // monté. App rouverte = origines réinitialisées, la barre repart de l'ancre
  // de l'étape courante, jamais plus bas. maxPct = cliquet anti-recul
  // (l'interpolation seule ne recule jamais ; le cliquet couvre une étape qui
  // régresserait en base). Mutations idempotentes : sûres en StrictMode.
  const suiviRef = useRef(new Map());
  const step = repubStepDe(job);
  const m = suiviRef.current;
  let s = m.get(job.id);
  if (!s || s.step !== step) {
    s = { step, depuis: Date.now(), maxPct: s ? s.maxPct : 0 };
    m.set(job.id, s);
  }
  const ancre = REPUB_ANCRES[step];
  const suivante = REPUB_ANCRES[REPUB_ORDRE[REPUB_ORDRE.indexOf(step) + 1]];
  const tSec = (Date.now() - s.depuis) / 1000;
  s.maxPct = Math.max(s.maxPct, ancre + (suivante - ancre) * (1 - Math.exp(-tSec / REPUB_DUREES[step])));
  return (
    <div style={{ background: '#F0FDFB', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 10, padding: '11px 12px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <RefreshCw size={13} color="#1B6E62" strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: '#1B6E62' }}>{fr ? 'EN COURS' : 'IN PROGRESS'}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#10201B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titre}</div>
      <div className="repub-track sur-teinte"><div className="repub-fill" style={{ width: `${s.maxPct.toFixed(2)}%` }} /></div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1B6E62', marginTop: 8 }}>{repubPhraseActive(step, fr)}</div>
    </div>
  );
}

// Terminées : repliées sous UNE ligne dépliable — sur un lot de 280 (cas
// nadegemarcelin78, 28/08), la liste complète noierait la file.
function RepubTerminees({ lang, jobs, titreDe }) {
  const fr = lang !== 'en';
  const [ouvert, setOuvert] = useState(false);
  const n = jobs.length;
  return (
    <div style={{ borderTop: '1px solid #EFECE3', marginTop: 12, paddingTop: 10 }}>
      <button onClick={() => setOuvert((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <Check size={14} color="#1B6E62" strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#5C6560' }}>
          {fr ? `${n} republiée${n > 1 ? 's' : ''}, de nouveau en ligne` : `${n} reposted, live again`}
        </span>
        {ouvert ? <ChevronUp size={15} color="#8A8578" style={{ flexShrink: 0 }} /> : <ChevronDown size={15} color="#8A8578" style={{ flexShrink: 0 }} />}
      </button>
      {ouvert && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {jobs.map((j) => (
            <div key={j.id} style={{ paddingLeft: 22, fontSize: 12.5, color: '#8A8578', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titreDe(j)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function etapeRepublication(job, fr) {
  if (!job) return null;
  const pf = job.platform_fields ?? {};
  const step = pf.republish_step ?? 'a_capturer';
  const st = job.status;
  const encours = st === 'pending' || st === 'processing';
  const T = {
    file:      fr ? 'En file'      : 'Queued',
    lecture:   fr ? 'Lecture…'     : 'Reading…',
    prete:     fr ? 'Prête'        : 'Ready',
    recreation:fr ? 'Recréation…'  : 'Recreating…',
    enligne:   fr ? 'En ligne'     : 'Live',
    relancer:  fr ? 'À relancer'   : 'Needs action',
    arretee:   fr ? 'Arrêtée'      : 'Stopped',
  };
  const bleu  = { fond: '#EFF3F8', bord: '#C7D6E5', encre: '#334155' };
  const vert  = { fond: '#F0FDFB', bord: 'rgba(13,148,136,0.25)', encre: '#1B6E62' };
  const ambre = { fond: '#FFF6E3', bord: '#EED9A6', encre: '#8A6100' };
  // Rouge : RÉSERVÉ aux arrêts APRÈS suppression (2026-08-07) — l'annonce est
  // HORS LIGNE, c'est le seul cas du produit qui exige un geste immédiat. Un
  // arrêt AVANT suppression garde l'ambre/bleu : l'annonce est intacte.
  const rouge = { fond: '#FEF2F2', bord: '#FECACA', encre: '#B91C1C' };

  // ── Gel Livres (2026-08-28 soir) : détection par platform_fields.gel_livres_le
  // SEUL — jamais le statut (les jobs gelés sont 'cancelled', le seul statut
  // que l'extension ne reprend jamais, vérifié en base), jamais la catégorie.
  // Badge NEUTRE (bleu), avant toutes les branches : jamais rouge, jamais le
  // rendu « Arrêtée » des autres cancelled, aucun détail technique, aucun
  // délai promis. Le champ `error` (posé au gel) reste le message détaillé de
  // la feuille d'avancement — on ne le répète pas ici. Les 4 jobs gelés à
  // l'étape 'deleted' (annonce réellement retirée) n'ont PAS droit au
  // « intacte » : leur détail dit seulement que tout est sauvegardé.
  if (pf.gel_livres_le) {
    const intacte = step !== 'deleted';
    return {
      cle: 'gel_livres', court: fr ? 'En pause' : 'On hold', ...bleu, fini: true,
      titre: fr ? "En pause — on s'en occupe" : "On hold — we're taking care of it",
      detail: intacte
        ? (fr ? "Ton annonce est intacte sur Vinted, rien n'a été retiré. Cette republication est en pause chez nous : tu n'as rien à faire, on la relancera nous-mêmes."
              : 'Your listing is untouched on Vinted, nothing was removed. This repost is paused on our side: nothing to do — we will relaunch it ourselves.')
        : (fr ? "Cette republication est en pause chez nous. Toutes les données de ton annonce (photos comprises) sont sauvegardées : tu n'as rien à faire, on la reprend nous-mêmes."
              : 'This repost is paused on our side. All your listing data (photos included) is saved: nothing to do — we will resume it ourselves.'),
    };
  }

  // Terminal d'abord : un job fini ne doit jamais être lu comme « en cours ».
  if (st === 'published' || step === 'recreated') return {
    cle: 'recreated', court: T.enligne, ...vert, fini: true,
    titre: fr ? 'Annonce en ligne' : 'Listing is live',
    detail: fr ? "C'est fait : ton annonce a été recréée et elle est de nouveau en ligne, en tête du fil Vinted."
               : 'Done: your listing was recreated and is live again, at the top of the Vinted feed.',
  };
  // Un dry run n'est pas un échec : il va AU BOUT sans rien toucher. L'appeler
  // « interrompue » ferait passer un test réussi pour une panne — et c'est
  // précisément l'état visible pendant la recette de REPUBLISH_DRY_RUN.
  if (st === 'dry_run_completed') return {
    cle: 'arret', court: fr ? 'Test à blanc' : 'Dry run', ...bleu, fini: true,
    titre: fr ? 'Test à blanc terminé' : 'Dry run complete',
    detail: fr ? "Tout le parcours a été vérifié sans rien toucher : ton annonce n'a été ni retirée ni recréée, et la Pépite t'a été rendue."
               : 'The whole flow was checked without touching anything: your listing was neither removed nor recreated, and your Nugget was refunded.',
  };
  if (st === 'failed' || st === 'cancelled') {
    const apres = step === 'deleted';
    return {
      cle: 'arret',
      // Deux gravités distinctes (2026-08-07) : après suppression, l'article
      // est HORS LIGNE — le mot le dit, la couleur aussi.
      court: apres ? (fr ? 'Hors ligne — arrêtée' : 'Offline — stopped') : T.arretee,
      ...(apres ? rouge : bleu), fini: true, apresSuppression: apres,
      titre: apres ? (fr ? 'Interrompue après la suppression' : 'Stopped after deletion')
                   : (fr ? 'Interrompue — annonce intacte' : 'Stopped — listing untouched'),
      detail: apres
        ? (fr ? "Rien n'est perdu : ton annonce a été lue et sauvegardée avant d'être retirée. La reprise repart directement à la recréation."
              : 'Nothing is lost: your listing was read and saved before removal. Retrying resumes straight at recreation.')
        : (fr ? "Ton annonce est intacte — elle n'a jamais été retirée de Vinted."
              : 'Your listing is untouched — it was never removed from Vinted.'),
    };
  }
  if (st === 'needs_user') {
    const apres = step === 'deleted';
    return {
      cle: 'needs_user',
      court: apres ? (fr ? 'Hors ligne — republier' : 'Offline — republish') : T.relancer,
      ...(apres ? rouge : ambre), fini: true, apresSuppression: apres,
      titre: apres ? (fr ? 'Annonce retirée, pas encore recréée' : 'Listing removed, not recreated yet')
                   : (fr ? 'En attente de toi' : 'Waiting for you'),
      detail: apres
        ? (fr ? "Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement. Rien n'est perdu : toutes ses données (photos comprises) sont sauvegardées. Clique « Republier maintenant » — si un champ manque, il te sera demandé."
              : 'Your listing was removed from Vinted and could not be recreated automatically. Nothing is lost: all its data (photos included) is saved. Tap "Republish now" — if a field is missing, you will be asked for it.')
        : (fr ? "Ton annonce est intacte, rien n'a été retiré. Tu peux relancer."
              : 'Your listing is untouched, nothing was removed. You can relaunch.'),
    };
  }
  if (!encours) return null;

  if (step === 'deleted') return {
    cle: 'deleted', court: T.recreation, ...bleu,
    titre: fr ? 'Ancienne annonce retirée, recréation en cours' : 'Old listing removed, recreating',
    detail: fr ? "Rien n'est perdu : le contenu de ton annonce a été lu et sauvegardé AVANT le retrait. Elle est en train d'être recréée à l'identique."
               : 'Nothing is lost: your listing was read and saved BEFORE removal. It is being recreated identically.',
  };
  if (step === 'captured') return {
    cle: 'captured', court: T.prete, ...bleu,
    titre: fr ? 'Annonce lue et sauvegardée' : 'Listing read and saved',
    detail: fr ? "Tout le contenu est en sécurité chez nous (photos comprises). La suppression puis la recréation suivent."
               : 'All the content is safely stored with us (photos included). Deletion then recreation follow.',
  };
  // a_capturer : le seul état où RIEN n'a encore été touché côté Vinted.
  if (st === 'processing') return {
    cle: 'lecture', court: T.lecture, ...bleu,
    titre: fr ? 'Lecture de ton annonce' : 'Reading your listing',
    detail: fr ? "On relit l'annonce en ligne pour pouvoir la recréer à l'identique. Rien n'est encore touché."
               : 'We are reading the live listing so it can be recreated identically. Nothing has been touched yet.',
  };
  return {
    cle: 'file', court: T.file, ...bleu, enFile: true,
    titre: fr ? 'En attente de ton Chrome' : 'Waiting for your Chrome',
    detail: fr ? "La republication part dès que ton ordinateur reprend la main — environ 2 minutes si Chrome est déjà ouvert. Rien n'est touché d'ici là."
               : 'The repost starts as soon as your computer picks it up — about 2 minutes if Chrome is already open. Nothing is touched until then.',
  };
}

// Jours entiers écoulés depuis un ISO, ou null si la date est illisible.
// TOUJOURS en jours, jamais à l'heure près : listed_at_guess est une
// estimation (timestamp de photo), le nom le dit — l'affichage ne doit pas
// prétendre plus précis que la donnée.
function joursDepuis(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

// Date courte en heure de Paris (« 4 août »), ou null. Même garde que
// heureParis : Intl rend « Invalid Date » au lieu de lever, on filtre avant.
function dateCourteParis(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

// Heure de Paris, ou null. ⚠️ Une date invalide donne « Invalid Date » avec
// Intl, jamais une exception : on filtre AVANT de formater.
function heureParis(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

// Champs d'une capture incomplète que l'app sait faire SAISIR (2026-08-21) —
// miroir exact de la whitelist de fusion côté extension
// (capturerEtPersisterDepuisExtension, republish_user_fields) : taille, marque,
// état, ISBN. Le colis n'y est PAS (sélection PAR ID à la recréation, libellé
// ambigu hors Mode — relevé du 16/08) ; catégorie/couleurs/description non
// plus (échecs de lecture, une relance suffit). Les libellés d'état sont ceux
// du menu Vinted : la recréation sélectionne PAR LIBELLÉ sur le menu ouvert —
// un libellé hors catégorie (ex. Beauté sans « Bon état ») redonnera un
// needs_user propre au pré-vol, jamais une suppression.
const REPUB_SAISISSABLES = {
  taille: { fr: 'Taille', en: 'Size', ph: 'M, 38, Taille unique…' },
  marque: { fr: 'Marque', en: 'Brand', ph: 'Nike… ou « Sans marque »' },
  etat: { fr: 'État', en: 'Condition', options: ['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'Satisfaisant'] },
  isbn: { fr: 'ISBN', en: 'ISBN', ph: '9782…' },
};
// « État »/« Taille » (pré-vol, libellés humains) et « etat »/« taille »
// (capture, clés nues) doivent tomber sur la même entrée.
const repubCleSaisie = (c) => String(c ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Feuille « où ça en est » — même patron que RepublishSheet (portail, feuille
// basse, canvas). Ouverte au tap sur la pastille de la carte.
function RepublishProgressSheet({ lang, job, onClose, onSaisieRelance }) {
  const fr = lang !== 'en';
  // ⚠️ Hooks AVANT le retour anticipé (règle des hooks) : la feuille peut
  // rendre null quand l'étape est illisible, la saisie n'existe alors pas.
  const [saisie, setSaisie] = useState({});
  const [saisieBusy, setSaisieBusy] = useState(false);
  const [saisieMsg, setSaisieMsg] = useState(null);
  const et = etapeRepublication(job, fr);
  if (!et) return null;
  const pf = job.platform_fields ?? {};
  // Saisie proposée UNIQUEMENT sur un needs_user de capture incomplète / pré-vol
  // (champs_a_completer posé par l'extension ou par update-job-status), et
  // seulement pour les champs que la relance sait réinjecter.
  const aCompleter = job.status === 'needs_user' && Array.isArray(pf.champs_a_completer)
    ? [...new Set(pf.champs_a_completer.map(repubCleSaisie).filter((c) => c in REPUB_SAISISSABLES))]
    : [];
  const courant = et.cle === 'arret' || et.cle === 'needs_user'
    ? (pf.republish_step ?? 'a_capturer')
    : (et.cle === 'file' || et.cle === 'lecture' ? 'a_capturer' : et.cle);
  const iCourant = REPUB_ORDRE.indexOf(courant);
  // Dernière avancée : reconstituée à partir des horodatages QUI EXISTENT —
  // cross_post_jobs n'a pas d'`updated_at` (vérifié au schéma). Ordre du plus
  // récent au plus ancien, chacun posé par la transition correspondante dans
  // processRepublishJob ; created_at ferme la marche (job jamais repris).
  const heureTransition = heureParis(
    pf.recreated_at ?? pf.deleted_at ?? pf.republish_dry_run?.at ?? pf.processing_since ?? job.created_at,
  );
  const attenteVolontaire = et.cle === 'deleted' ? heureParis(pf.next_action_after) : null;
  const lignes = [
    { cle: 'a_capturer', txt: fr ? "Lecture de l'annonce en ligne" : 'Reading the live listing' },
    { cle: 'captured',   txt: fr ? 'Contenu sauvegardé chez nous'  : 'Content saved with us' },
    { cle: 'deleted',    txt: fr ? 'Ancienne annonce retirée'      : 'Old listing removed' },
    { cle: 'recreated',  txt: fr ? 'Nouvelle annonce en ligne'     : 'New listing live' },
  ];
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#EDEAE0', borderRadius: '26px 26px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)', fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          {!et.fini && <Loader size={16} thickness={2} />}
          <div style={{ fontSize: 17, fontWeight: 700, color: '#10201B' }}>{et.titre}</div>
        </div>
        <div style={{ fontSize: 12.5, color: '#5C6560', lineHeight: 1.5, marginBottom: 14 }}>{et.detail}</div>

        <div style={{ background: '#F6F5F1', border: '1px solid #E7E3D8', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
          {lignes.map((l, i) => {
            const idx = REPUB_ORDRE.indexOf(l.cle);
            const fait = iCourant > idx || (et.cle === 'recreated' && idx <= iCourant);
            const actif = idx === iCourant && !et.fini;
            return (
              <div key={l.cle} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderTop: i > 0 ? '1px solid #E7E3D8' : 'none' }}>
                <span style={{ width: 17, textAlign: 'center', fontSize: 12 }}>{fait ? '✅' : actif ? '⏳' : '·'}</span>
                <span style={{ fontSize: 12.5, fontWeight: actif ? 700 : 500, color: fait || actif ? '#10201B' : '#8A8578' }}>{l.txt}</span>
              </div>
            );
          })}
        </div>

        {attenteVolontaire && (
          <div style={{ background: '#F0FDFB', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#1B6E62', lineHeight: 1.5, marginBottom: 12 }}>
            {fr ? `Recréation prévue vers ${attenteVolontaire}. FillSell attend volontairement 2 à 5 minutes entre le retrait et la recréation, comme le ferait une vraie personne — ce n'est pas un blocage.`
                : `Recreation planned around ${attenteVolontaire}. FillSell deliberately waits 2 to 5 minutes between removal and recreation, like a real person would — this is not a stall.`}
          </div>
        )}
        {heureTransition && (
          <div style={{ fontSize: 11.5, color: '#8A8578', marginBottom: 12 }}>
            {fr ? `Dernière avancée à ${heureTransition} (heure de Paris).` : `Last update at ${heureTransition} (Paris time).`}
          </div>
        )}
        {job.error && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#9A3412', lineHeight: 1.5, marginBottom: 12 }}>
            {/* Brut tant que le job est vivant (la promesse de reprise y est
                vraie) ; sur un job terminal, la fausse promesse est remplacée
                par la consigne de relance manuelle (consigne 16/08). */}
            {jobErrorSansFaussePromesse(job, fr ? 'fr' : 'en')}
          </div>
        )}
        {/* Saisie du champ manquant (capture incomplète, 2026-08-21) : la
            valeur part dans platform_fields.republish_user_fields puis la
            relance repart — l'extension la fusionne dans la capture suivante.
            Un needs_user SANS champ saisissable (colis hors table, lecture
            transitoire) garde le simple bouton Relancer de la carte. */}
        {aCompleter.length > 0 && onSaisieRelance && (
          <div style={{ background: '#F6F5F1', border: '1px solid #E7E3D8', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B', marginBottom: 8 }}>
              {fr ? 'Renseigne ce qui manque, on repart' : 'Fill in what is missing and we relaunch'}
            </div>
            {aCompleter.map((cle) => {
              const def = REPUB_SAISISSABLES[cle];
              return (
                <div key={cle} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#5C6560', marginBottom: 4 }}>{fr ? def.fr : def.en}</div>
                  {def.options ? (
                    <select value={saisie[cle] ?? ''} onChange={(e) => setSaisie((s) => ({ ...s, [cle]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 10px', borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 13.5, fontFamily: 'inherit', background: '#fff' }}>
                      <option value="" disabled>{fr ? 'Choisir…' : 'Choose…'}</option>
                      {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={saisie[cle] ?? ''} onChange={(e) => setSaisie((s) => ({ ...s, [cle]: e.target.value }))}
                      placeholder={def.ph}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 13.5, fontFamily: 'inherit', background: '#fff' }} />
                  )}
                </div>
              );
            })}
            {saisieMsg && (
              <div style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.45, marginBottom: 8 }}>{saisieMsg}</div>
            )}
            <button
              disabled={saisieBusy || aCompleter.some((c) => !String(saisie[c] ?? '').trim())}
              onClick={async () => {
                if (saisieBusy) return;
                setSaisieBusy(true); setSaisieMsg(null);
                const fournis = {};
                for (const c of aCompleter) fournis[c] = String(saisie[c] ?? '').trim();
                const res = await onSaisieRelance(job, fournis);
                setSaisieBusy(false);
                if (res?.success) onClose();
                else setSaisieMsg(res?.error ?? (fr ? 'Relance impossible — réessaie dans un instant.' : 'Relaunch failed — try again shortly.'));
              }}
              style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
                background: (saisieBusy || aCompleter.some((c) => !String(saisie[c] ?? '').trim())) ? '#9CB8B2' : 'linear-gradient(120deg,#2F9E90,#1B6E62)',
                color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: (saisieBusy || aCompleter.some((c) => !String(saisie[c] ?? '').trim())) ? 'default' : 'pointer' }}>
              {saisieBusy ? (fr ? 'Relance…' : 'Relaunching…') : (fr ? 'Valider et relancer' : 'Save and relaunch')}
            </button>
          </div>
        )}
        {et.cle === 'recreated' && job.listing_url && (
          <a href={job.listing_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 12, background: '#2F9E90', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', marginBottom: 10 }}>
            {fr ? 'Voir la nouvelle annonce' : 'View the new listing'}
          </a>
        )}
        <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: '1px solid #E7E3D8', background: '#F6F5F1', color: '#5C6560', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {fr ? 'Fermer' : 'Close'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Grille 2026-08-08 : la republication coûte price_republish pour TOUT LE
// MONDE — l'ancienne prop `gratuit` (Premium/Pro) est morte avec la gratuité.
function RepublishSheet({ lang, items, prixUnitaire, onClose, onConfirm }) {
  const fr = lang !== 'en';
  const solo = items.length === 1;
  const [pct, setPct] = useState(0);
  const [prixLibre, setPrixLibre] = useState(solo && items[0].prixActuel != null ? String(items[0].prixActuel) : '');
  const arrondi = (p) => p == null ? null : Math.max(REPUB_PLANCHER_EUR, Math.floor(p * (1 - pct / 100)));
  const prixFinalSolo = (() => {
    if (!solo) return null;
    const libre = Number(String(prixLibre).replace(',', '.'));
    if (Number.isFinite(libre) && libre >= 1) return libre;
    return arrondi(items[0].prixActuel);
  })();
  const lotApercu = solo ? [] : items.map(({ item, prixActuel }) => ({
    titre: item.title, avant: prixActuel, apres: pct === 0 ? prixActuel : arrondi(prixActuel),
    plafonne: pct > 0 && prixActuel != null && Math.floor(prixActuel * (1 - pct / 100)) < REPUB_PLANCHER_EUR,
  }));
  const plafonnes = lotApercu.filter(a => a.plafonne);
  const cout = <PepiteAmount value={items.length * (prixUnitaire ?? 1)} />;
  const confirmer = () => {
    onConfirm(items.map(({ item, prixActuel }) => {
      let prix = null; // null = garder le prix de l'annonce
      if (solo) { if (prixFinalSolo != null && prixFinalSolo !== prixActuel) prix = prixFinalSolo; }
      else if (pct > 0 && prixActuel != null) prix = arrondi(prixActuel);
      return { item, prix };
    }));
  };
  const chip = (p, label) => (
    <button key={p} onClick={() => { setPct(p); if (solo && items[0].prixActuel != null) setPrixLibre(String(p === 0 ? items[0].prixActuel : Math.max(REPUB_PLANCHER_EUR, Math.floor(items[0].prixActuel * (1 - p / 100))))); }}
      style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${pct === p ? '#2F9E90' : '#E7E3D8'}`, background: pct === p ? '#E7F3F0' : '#F6F5F1', color: pct === p ? '#1B6E62' : '#5C6560' }}>
      {label}
    </button>
  );
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#EDEAE0', borderRadius: '26px 26px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)', fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#10201B', marginBottom: 4 }}>
          {solo
            ? (fr ? 'Republier cet article' : 'Repost this item')
            : (fr ? `Republier ${items.length} annonces` : `Repost ${items.length} listings`)}
        </div>
        <div style={{ fontSize: 12.5, color: '#5C6560', lineHeight: 1.5, marginBottom: 12 }}>
          {fr ? "Baisser un peu le prix aide l'annonce à repartir — à toi de voir." : 'A small price drop helps the listing take off again — up to you.'}
        </div>
        {solo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#5C6560', fontWeight: 600 }}>
              {items[0].prixActuel != null
                ? (fr ? `En ligne à ${items[0].prixActuel} €` : `Live at €${items[0].prixActuel}`)
                : (fr ? 'Prix actuel inconnu' : 'Current price unknown')}
            </span>
            <input inputMode="decimal" value={prixLibre} onChange={e => setPrixLibre(e.target.value)}
              aria-label={fr ? 'Nouveau prix' : 'New price'}
              style={{ width: 90, padding: '9px 10px', borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#10201B' }}>€</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {chip(0, fr ? 'Garder' : 'Keep')}{chip(5, '−5 %')}{chip(10, '−10 %')}{chip(15, '−15 %')}
        </div>
        {!solo && pct > 0 && (
          <div style={{ background: '#F6F5F1', border: '1px solid #E7E3D8', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#5C6560', lineHeight: 1.55, marginBottom: 12 }}>
            {lotApercu.slice(0, 3).map((a, i) => (
              <div key={i}>{(a.titre ?? '—')} : {a.avant != null ? `${a.avant} € → ${a.apres} €` : (fr ? 'prix inconnu — gardé' : 'unknown price — kept')}{a.plafonne ? (fr ? ' (plancher)' : ' (floor)') : ''}</div>
            ))}
            {lotApercu.length > 3 && <div>… {lotApercu.length - 3} {fr ? 'autres' : 'more'}</div>}
            {plafonnes.length > 0 && (
              <div style={{ marginTop: 6, color: '#9A3412', fontWeight: 600 }}>
                {fr ? `${plafonnes.length} article${plafonnes.length > 1 ? 's' : ''} au plancher de ${REPUB_PLANCHER_EUR} € : ` : `${plafonnes.length} item${plafonnes.length > 1 ? 's' : ''} at the €${REPUB_PLANCHER_EUR} floor: `}
                {plafonnes.slice(0, 3).map(a => a.titre ?? '—').join(' · ')}{plafonnes.length > 3 ? '…' : ''}
              </div>
            )}
          </div>
        )}
        <button onClick={confirmer}
          style={{ width: '100%', padding: 14, border: 'none', borderRadius: 999, background: 'linear-gradient(120deg,#2F9E90,#1B6E62)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {solo
            ? (fr ? <>Republier{prixFinalSolo != null ? ` à ${prixFinalSolo} €` : ''} · {cout}</> : <>Repost{prixFinalSolo != null ? ` at €${prixFinalSolo}` : ''} · {cout}</>)
            : (fr ? <>Republier les {items.length}{pct > 0 ? ` à −${pct} %` : ''} · {cout}</> : <>Repost {items.length}{pct > 0 ? ` at −${pct}%` : ''} · {cout}</>)}
        </button>
        {/* (Le CTA « Gratuite et illimitée avec Premium » du 07/08 est mort le
            08/08 avec la gratuité plan : la republication coûte le même prix
            pour tous, il n'y a plus rien à convertir ici.) */}
        <button onClick={onClose} style={{ width: '100%', marginTop: 8, padding: 10, border: 'none', background: 'none', color: '#5C6560', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {fr ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </div>,
    document.body
  );
}

const StockTab = memo(function StockTab({
  // Config
  lang, currency, isPremium, isNative, isPro, isBusiness, items, user, voiceUsedToday,
  // (iapProduct retiré le 2026-08-09 : son seul lecteur était le sous-titre
  // d'IAPUpgradeBlock, qui annonçait le prix Premium sous un bouton menant à
  // trois tarifs.)
  iapLoading, extensionStatus = null, extensionNeverSeen = null,
  // Computed lists
  stock, sold, stockFiltre, soldFiltre, stockVisible, soldVisible, stockVal, stockQty, soldQty,
  // Voice/AI state
  voiceStep, setVoiceStep, voiceParsed, setVoiceParsed,
  voiceZoneResults, setVoiceZoneResults, voiceZoneOpen, setVoiceZoneOpen,
  vaActions, vaStep,
  voiceText, setVoiceText, voiceLoading, voicePlaceholderIdx, voiceError,
  // Manual form state
  showManualForm, setShowManualForm, manualMode, setManualMode,
  iTitle, setITitle, iQuantite, setIQuantite, iMarque, setIMarque,
  iType, setIType, iBuy, setIBuy, iPurchaseCosts, setIPurchaseCosts,
  iAlreadySold, setIAlreadySold, iSell, setISell,
  iSellingFees, setISellingFees, iRememberSellingFees, setIRememberSellingFees,
  iDesc, setIDesc, iEmplacement, setIEmplacement, iPlateforme, setIPlateforme, iSaved, firstItemAdded,
  // Lot state
  lotManualTotal, setLotManualTotal, lotManualItems, setLotManualItems,
  lotDistributed, setLotDistributed, lotDistributing,
  // Filter state
  filterType, setFilterType, filterMarque, setFilterMarque,
  filterMarqueSold, setFilterMarqueSold,
  search, setSearch, soldShowAll, setSoldShowAll,
  showAllStock, setShowAllStock,
  pillsExpandedSold, setPillsExpandedSold, pillsExpandedStock, setPillsExpandedStock,
  importMsg,
  // Handlers
  addItemsFromVoice, resetVoiceFlow, callVoiceParse, addItem,
  handleLotDistribute, addLotToInventory, delItem, markSold, setEditItem,
  handleImportFile, handleExport, handleIAPPurchase, handleIAPRestore,
  triggerCheckout,
  // Refs
  // (scrollRef retiré du destructuring le 2026-08-09 : son seul lecteur était
  // le bouton « Importer mon dressing Vinted » de l'état vide, supprimé.)
  importRef, listRef, fabTriggerRef,
  // Injected components (defined in App.jsx)
  PremiumBanner, IAPUpgradeBlock,
  openUpgradeModal, onStepperOpenChange,
  // Lot 2 : « Ajouter un article » de l'état vide → création par photo (Lens).
  onAddByPhoto = null,
  // Optionnelle : point d'entrée explicite après un import de dressing réussi.
  // Non fournie, on retombe sur vaActions.fetchAll (déjà passé par App.jsx) —
  // les appelants existants n'ont donc rien à changer.
  onSyncDone = null,
}) {
  const { t, tpl } = useTranslation(lang);
  const isMobile = useIsMobile(); // P4 : réactif (grille desktop ↔ liste mobile)
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [zoneEdits, setZoneEdits] = useState({});
  const [publishItem, setPublishItem] = useState(null);
  // Ouverture du stepper : purge tout brouillon précédent puis pose le blob
  // hôte (sessionStorage) qui permettra de le REMONTER après un remount
  // (reload d'onglet Chrome ou navigation interne).
  const ouvrirStepper = (item) => {
    clearStepperPersistence();
    writeStepperHost({ source: 'stock', itemId: item.id });
    setPublishItem(item);
    onStepperOpenChange?.(true);
  };
  // Reprise après remount : on retrouve la ligne inventaire dans items (chargés
  // en async par App) et on rouvre le stepper — son état interne revient du
  // brouillon sessionStorage propre au stepper.
  const stepperRestaureRef = useRef(false);
  useEffect(() => {
    if (stepperRestaureRef.current || publishItem) return;
    const h = readStepperHost('stock');
    if (!h) return;
    const item = (items || []).find(i => i.id === h.itemId);
    if (!item) return;
    stepperRestaureRef.current = true;
    setPublishItem(item);
    onStepperOpenChange?.(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  // ── Détail Vinted au clic « Publier » (2026-08-03 soir) ────────────────────
  // Un article importé du dressing a ses PHOTOS en base (la sync les écrit)
  // mais PAS sa description : la liste wardrobe ne la porte pas, elle ne vit
  // que dans /api/v2/item_upload/items/{id} — endpoint du formulaire d'édition,
  // autorisé À L'UNITÉ sur ACTION HUMAINE uniquement (décision 2 du chantier).
  // Le clic « Publier » est ce déclencheur : on demande LE détail de CET
  // article à l'extension, puis on ouvre le stepper description en place.
  // GRATUIT (aucune Pépite) : c'est la publication qui est payante, pas la
  // lecture. Extension absente/ancienne ou réponse en retard → le stepper
  // s'ouvre quand même (photos + titre déjà là) avec une note douce, jamais un
  // écran vide sans explication.
  const [extDetailOk, setExtDetailOk] = useState(false);
  useEffect(() => {
    const stop = ecouterPresenceExtension((version) => {
      setExtDetailOk(versionAuMoins(version, DETAIL_VERSION_MIN));
    });
    return stop;
  }, []);
  const [detailFetchId, setDetailFetchId] = useState(null); // item.id en cours de récupération
  const [detailNote, setDetailNote] = useState(null);       // message doux (repli), auto-effacé
  const detailNoteTimer = useRef(null);
  useEffect(() => () => { if (detailNoteTimer.current) clearTimeout(detailNoteTimer.current); }, []);
  const montrerNoteDetail = (message) => {
    setDetailNote(message);
    if (detailNoteTimer.current) clearTimeout(detailNoteTimer.current);
    detailNoteTimer.current = setTimeout(() => setDetailNote(null), 7000);
  };
  const DETAIL_TIMEOUT_MS = 12000;
  const publierAvecDetail = async (item) => {
    // ⚠️ « OU catalog_id manquant » (2026-08-05) : la description servait seule
    // de drapeau « rien à compléter ». Or elle est PERSISTÉE au premier passage
    // — un article déjà pourvu d'une description n'aurait donc plus jamais
    // déclenché de lecture de détail, et n'aurait JAMAIS livré son catalog_id.
    // C'est cette lecture-ci, et la capture de republication, qui remplissent
    // la colonne : aucune requête n'est ajoutée ailleurs (le rattrapage de
    // masse et le goutte-à-goutte ont été abandonnés — pas de rafale sur
    // l'endpoint le plus surveillé).
    const doitCompleter = item.origine === 'vinted_sync' && item.vinted_item_id
      && (!item.description || !item.vinted_catalog_id);
    // Rien à compléter, ou pas d'extension capable (mobile, extension < 0.5.1) :
    // ouverture directe — on n'attend JAMAIS un canal qui n'existe pas.
    if (!doitCompleter || !extDetailOk) {
      if (doitCompleter) {
        montrerNoteDetail(lang === 'fr'
          ? "La description Vinted sera récupérée quand l'extension sera à jour — tu peux la compléter à la main en attendant."
          : "The Vinted description will be fetched once the extension is updated — you can fill it in manually meanwhile.");
      }
      ouvrirStepper(item);
      return;
    }
    if (detailFetchId) return; // une récupération à la fois — jamais de lot
    setDetailFetchId(item.id);
    const detail = await new Promise((resolve) => {
      const timer = setTimeout(() => { stop(); resolve(null); }, DETAIL_TIMEOUT_MS);
      const stop = ecouterDetailArticleVinted((d) => {
        if (String(d.vintedItemId) !== String(item.vinted_item_id)) return;
        clearTimeout(timer); stop(); resolve(d);
      });
      demanderDetailArticleVinted(item.vinted_item_id);
    });
    setDetailFetchId(null);
    // Catégorie Vinted d'origine : elle voyage dans le payload natif qu'on
    // vient de lire, gratuitement. C'est ELLE qui rendra l'article publiable
    // sur les 3 autres plateformes (point d'entrée du mapping de catégories) —
    // l'affichage du type n'en est qu'un sous-produit.
    const catalogId = Number(detail?.natif?.catalog_id);
    const catalogAEcrire = Number.isFinite(catalogId) && catalogId > 0 && !item.vinted_catalog_id
      ? catalogId : null;
    if (detail?.success && detail.description) {
      // Persistée pour ne plus jamais re-demander cet article ; la sync ne
      // réécrit pas `description` (champ à l'utilisateur), elle survivra.
      await supabase.from('inventaire')
        .update({ description: detail.description, ...(catalogAEcrire ? { vinted_catalog_id: catalogAEcrire } : {}) })
        .eq('id', item.id).eq('user_id', user.id).then(() => {}, () => {});
      ouvrirStepper({ ...item, description: detail.description, vinted_catalog_id: catalogAEcrire ?? item.vinted_catalog_id });
    } else if (catalogAEcrire) {
      // Description absente mais catégorie lue : on écrit quand même ce qu'on a
      // — la lecture a eu lieu, ne pas en tirer parti serait la gaspiller.
      await supabase.from('inventaire').update({ vinted_catalog_id: catalogAEcrire })
        .eq('id', item.id).eq('user_id', user.id).then(() => {}, () => {});
      montrerNoteDetail(lang === 'fr'
        ? "La description Vinted n'a pas pu être récupérée cette fois — les photos sont là, tu peux compléter le texte à la main."
        : "The Vinted description couldn't be fetched this time — photos are in place, you can fill in the text manually.");
      ouvrirStepper({ ...item, vinted_catalog_id: catalogAEcrire });
    } else {
      montrerNoteDetail(lang === 'fr'
        ? "La description Vinted n'a pas pu être récupérée cette fois — les photos sont là, tu peux compléter le texte à la main."
        : "The Vinted description couldn't be fetched this time — photos are in place, you can fill in the text manually.");
      ouvrirStepper(item);
    }
  };

  // ── Prix d'annonce Vinted par article (2026-08-03 soir) ────────────────────
  // Le prix DEMANDÉ sur l'annonce vit dans vinted_listing_snapshots (relevé
  // quotidien de la sync), JAMAIS dans inventaire.prix_vente — l'upsert de
  // sync le réécrirait à chaque run et le confondrait avec le prix déclaré par
  // l'utilisateur. UNE requête pour toutes les lignes (jamais une par ligne) :
  // relevés triés du plus récent au plus ancien, premier vu = prix courant.
  // Même patron éprouvé que `propositions` (VentesTab). Le limit(1000) couvre
  // ~30 jours de relevés quotidiens pour 30 articles — largement le dernier
  // relevé de chacun.
  const [prixAnnonces, setPrixAnnonces] = useState({}); // vinted_item_id -> price | null
  useEffect(() => {
    if (!user?.id) return;
    const ids = [...new Set(items.map(i => i.vinted_item_id).filter(Boolean))]
      .filter(id => !(id in prixAnnonces));
    if (!ids.length) return;
    let annule = false;
    supabase.from('vinted_listing_snapshots')
      .select('vinted_item_id,price')
      .eq('user_id', user.id).in('vinted_item_id', ids)
      .order('captured_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (annule) return;
        // Ids sans relevé notés null — sinon l'effet re-requêterait à chaque rendu.
        setPrixAnnonces(prev => {
          const n = { ...prev };
          for (const id of ids) if (!(id in n)) n[id] = null;
          if (!error) for (const r of (data || [])) if (n[r.vinted_item_id] == null) n[r.vinted_item_id] = r.price;
          return n;
        });
      });
    return () => { annule = true; };
  }, [items, user?.id, prixAnnonces]);
  // Prix RÉELLEMENT demandé sur l'annonce Vinted d'un article, ou null. Numérique
  // garanti (PostgREST peut rendre un `numeric` en chaîne) et strictement > 0 —
  // un 0 n'est pas un prix d'annonce, c'est une absence. Lecteur : le
  // pré-remplissage du stepper de publication, qui doit proposer un prix de
  // VENTE constaté et jamais autre chose.
  const prixAnnonceVinted = (item) => {
    const v = item?.vinted_item_id != null ? Number(prixAnnonces[item.vinted_item_id]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  // Article en attente derrière le rappel extension : le clic « Publier » passe
  // d'abord par le modal, l'ouverture du stepper n'a lieu qu'au « Continuer ».
  const [extReminderItem, setExtReminderItem] = useState(null);
  // Accroche extension (2026-08-04) : extension JAMAIS vue → au clic Publier,
  // écran d'accroche (sync dressing + récupération du lien) AVANT le stepper,
  // à la place du simple rappel. « Préparer mon annonce » reste possible — la
  // garde de publication (stepper + RPC) prendra le relais au dernier clic.
  const [extPitchItem, setExtPitchItem] = useState(null);
  // Quota Free : même assiette que le trigger serveur (non vendus, hors
  // dressing synchronisé) et même limite (miroir 200 de
  // coin_config.free_stock_limit). L'ancien items.length comptait TOUT —
  // vendus et sync compris.
  const quotaFree = compteArticlesQuota(items);
  // Limite Free lue de coin_config (JAMAIS en dur — elle a déjà changé de 20
  // à 200) ; le fallback ne sert qu'au premier rendu / réseau muet. Même
  // pattern client que price_republish plus bas. L'assiette de quotaFree est
  // mot pour mot celle du trigger serveur check_inventory_limit (statut !=
  // vendu, origine != vinted_sync — cf. utils/stockLimit.js).
  const [freeStockLimit, setFreeStockLimit] = useState(FREE_STOCK_LIMIT_FALLBACK);
  useEffect(() => {
    if (isPremium) return; // Premium/Pro/comped : illimité, rien à lire
    let stale = false;
    supabase.from('coin_config').select('value').eq('key', 'free_stock_limit').maybeSingle()
      .then(({ data }) => { if (!stale && Number.isFinite(data?.value)) setFreeStockLimit(data.value); });
    return () => { stale = true; };
  }, [isPremium]);

  // ── É5 Republication Vinted (2026-08-05 ; démasquée pour tous le 06/08) ───
  // Prix lu en config (jamais en dur) ; libellé sans prix tant que la config
  // n'a pas répondu — jamais un montant faux.
  // Capacité EXTENSION DU COMPTE (2026-08-05) — plus « y a-t-il une extension
  // dans ce navigateur ». La republication ne capture plus au clic : elle pose
  // un job que le Chrome de l'utilisateur ramassera. Elle est donc ouverte au
  // téléphone, web mobile ET application native, dès lors que le COMPTE a une
  // extension capable. `{inconnu:true}` = migration pas encore appliquée → on
  // retombe sur le comportement d'avant (desktop seulement).
  // (surTelephoneStock retiré le 2026-08-05 : il ne servait plus qu'à choisir
  // entre deux formulations d'attente — « laisse Chrome ouvert » sur desktop,
  // « à la prochaine ouverture de Chrome » sur téléphone. Les deux disaient le
  // pire cas ; l'attente réelle est le poll, et c'est la feuille d'avancement
  // qui la dit désormais, la même pour tous les supports.)
  const [capaciteExt, setCapaciteExt] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    lireCapaciteSyncCompte(user.id)
      .then((c) => { if (!annule) setCapaciteExt(c); })
      .catch(() => { if (!annule) setCapaciteExt({ inconnu: true }); });
    return () => { annule = true; };
  }, [user?.id]);
  const republishActif = republishVisiblePour(user?.email)
    && (capaciteExt?.inconnu === false ? capaciteExt.capable === true : !isNative);
  const [republishPrice, setRepublishPrice] = useState(null);
  const [repubBusy, setRepubBusy] = useState(null);          // inventaire_id en cours
  const [repubMsgs, setRepubMsgs] = useState({});            // inventaire_id → {ton, texte}
  useEffect(() => {
    if (!republishActif) return;
    let stale = false;
    supabase.from('coin_config').select('value').eq('key', 'price_republish').maybeSingle()
      .then(({ data }) => { if (!stale && Number.isFinite(data?.value)) setRepublishPrice(data.value); });
    return () => { stale = true; };
  }, [republishActif]);
  // ── Maintenance republication (2026-08-13) ────────────────────────────────
  // coin_config.republish_maintenance = 1 ⇒ un trigger BEFORE INSERT en base
  // rejette tout job 'republish' (message préfixé REPUBLISH_MAINTENANCE).
  // L'app doit le dire AVANT le clic : bandeau en tête d'onglet + boutons
  // Republier grisés. Clé ABSENTE, à 0, ou lecture en échec = comportement
  // normal, strictement rien de grisé — seul un 1 lu en base arme le mode.
  const [repubMaintenance, setRepubMaintenance] = useState(false);
  useEffect(() => {
    let stale = false;
    supabase.from('coin_config').select('value').eq('key', 'republish_maintenance').maybeSingle()
      .then(({ data }) => { if (!stale) setRepubMaintenance(Number(data?.value) === 1); });
    return () => { stale = true; };
  }, []);
  // FILET : si un insert part quand même (clé passée à 1 entre le chargement
  // de l'écran et le clic), le rejet du trigger revient dans error/message —
  // on le reconnaît au préfixe et on montre le bandeau, jamais l'erreur brute.
  const rejetMaintenance = (x) => /REPUBLISH_MAINTENANCE/.test(`${x?.error ?? ''} ${x?.message ?? ''}`);
  // ⚠️ repubVivants / repubEtat / repubActionnables sont déclarés PLUS BAS,
  // APRÈS le state jobsByInventaire qu'ils lisent AU RENDU — les poser ici
  // levait une TDZ (« Cannot access 'jobsByInventaire' before
  // initialization ») au montage, écran blanc en prod pour les seuls comptes
  // bêta (le ternaire republishActif court-circuitait les autres). Incident
  // Safari iOS du 05/08. Les HANDLERS, eux, peuvent vivre ici : ils ne
  // s'exécutent qu'au clic, bien après l'initialisation.

  async function lancerRepublication(item, prixRepublication = null) {
    if (repubBusy || repubMaintenance) return;
    if (extensionNeverSeen === true) { setExtPitchItem(item); return; }
    setRepubBusy(item.id);
    setRepubMsgs(m => ({ ...m, [item.id]: null }));
    try {
      const res = await republierArticleVinted(supabase, {
        inventaireId: item.id, vintedItemId: item.vinted_item_id, prixRepublication,
      });
      if (!res.success) {
        if (rejetMaintenance(res)) { setRepubMaintenance(true); return; }
        const raisons = {
          // capture_* ont disparu du RPC : la capture ne se fait plus au clic.
          // Un échec de capture se produit désormais à l'exécution et clôt le
          // job en 'failed' avec un message écrit par l'extension.
          extension_trop_ancienne: lang === 'fr'
            ? "L'extension de ton ordinateur doit passer en 0.5.0 ou plus récente pour republier."
            : 'The extension on your computer needs version 0.5.0 or newer to repost.',
          republish_en_cours: lang === 'fr' ? 'Une republication est déjà en cours sur cet article.' : 'A repost is already running for this item.',
          cadence_24h: lang === 'fr' ? 'Déjà republié il y a moins de 24 h — une republication par article et par jour.' : 'Already reposted less than 24 h ago — one repost per item per day.',
          insufficient_coins: lang === 'fr' ? `Il manque des Pépites (${res.price ?? 1} nécessaire).` : `Not enough Nuggets (${res.price ?? 1} needed).`,
        };
        setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'orange', texte: res.message ?? raisons[res.reason] ?? res.error ?? (lang === 'fr' ? 'Republication impossible.' : 'Repost failed.') } }));
        return;
      }
      // Patch optimiste : la carte montre l'état « en file » sans attendre le
      // poll de 20 s (même principe que la publication).
      const now = new Date().toISOString();
      setJobsByInventaire(prev => ({
        ...prev,
        [item.id]: [...(prev[item.id] ?? []), {
          id: `optimistic-repub-${item.id}-${now}`, inventaire_id: item.id, platform: 'vinted',
          action: 'republish', status: 'pending', error: null, created_at: now, listing_url: null, title: item.title,
          platform_fields: { republish_step: 'a_capturer', vinted_item_id: String(item.vinted_item_id) },
        }],
      }));
      // AUCUN message de mise en file ici (2026-08-05). Il disait « elle
      // partira à la prochaine ouverture de Chrome » — le discours du PIRE cas,
      // faux dès que Chrome tourne, où l'attente réelle est le passage du poll
      // (~2 min). Même défaut que le message d'attente de la sync, corrigé le
      // 04/08 de la même façon. L'état est désormais porté par la pastille de
      // la carte (posée juste au-dessus par le patch optimiste) et détaillé
      // dans la feuille d'avancement, qui parle du poll ET montre un loader.
    } finally {
      setRepubBusy(null);
    }
  }

  // ── Feuille de prix (2026-08-05, validée) ─────────────────────────────────
  // LE geste Vinted : baisser un peu pour remonter. Ouverte au clic Republier
  // (solo) et au lancement de lot — le prix est la première chose visible.
  // Presets ARRONDIS À L'EURO INFÉRIEUR (−10 % de 25 € = 22 €, pas 22,50) et
  // PLANCHER à 2 € (un pourcentage global sur des prix hétérogènes produirait
  // des absurdités — l'aperçu nomme les articles plafonnés). Champ libre en
  // solo : minimum 1 € (la garde de publication existante).
  const [repubSheet, setRepubSheet] = useState(null); // {items:[{item, prixActuel}]}
  const [repubProgress, setRepubProgress] = useState(null); // job republish affiché en détail
  // (repubGratuit est mort le 2026-08-08 : la republication coûte
  // price_republish pour tous les paliers, plus aucun prix conditionné.)
  function ouvrirFeuilleRepublication(itemsCibles) {
    setRepubSheet({
      items: itemsCibles.map(it => ({
        item: it,
        prixActuel: prixAnnonces[it.vinted_item_id] ?? (Number(it.sell) || null),
      })),
    });
  }

  // ── É5.2 : sélection multiple (2026-08-05) — même patron que la saisie des
  // prix d'achat (toggle + Set + checkboxes + barre sticky). Seuls les
  // articles ACTIONNABLES sont cochables : les bornes (republish vivant,
  // cadence 24 h) rendent la case absente, jamais un échec après le clic.
  const [modeRepublish, setModeRepublish] = useState(false);
  const [repubSel, setRepubSel] = useState(new Set());
  const [repubLot, setRepubLot] = useState(null); // {fait, total, refus:[]} pendant/après un lot
  // (repubEtat / repubActionnables : déclarés plus bas, après jobsByInventaire
  // — cf. le commentaire TDZ au-dessus de lancerRepublication.)

  async function lancerRepublicationLot(cibles /* [{item, prix}] */) {
    if (repubMaintenance) return;
    if (!cibles.length || repubLot?.fait != null && repubLot.fait < repubLot.total) return;
    setRepubLot({ fait: 0, total: cibles.length, refus: [] });
    const refus = [];
    // ── Identité du LOT en base (2026-08-28) ─────────────────────────────────
    // Constat prouvé (lot d'Ornella, 33 jobs de 16h52) : bulk_batch_id était
    // NULL sur 100 % des jobs — le lot n'avait aucune identité, la progression
    // ne pouvait être qu'un compteur local perdu au premier refresh, sur un
    // lot qui dure des heures. UN uuid par lot, écrit sur CHAQUE job créé
    // (UPDATE post-RPC : spend_coins_and_republish ne prend pas le paramètre,
    // et la colonne existe déjà — uuid, vérifiée en prod le 28/08). L'écran de
    // progression (repubBandeau) lit ce lot en base et survit donc au refresh ;
    // un échec d'estampillage n'est jamais bloquant, le job retombe simplement
    // dans le repli « rafale de création » d'avant.
    // crypto.randomUUID : partout où l'app tourne (Chrome/Safari/WebView
    // récents) ; à défaut on n'estampille pas — la colonne est un uuid strict,
    // pas question d'y forcer une chaîne bricolée.
    const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
    // SÉQUENTIEL : chaque capture passe par l'onglet de travail de l'extension
    // (verrou de flux) — un Promise.all se battrait pour lui. L'onglet
    // FillSell doit rester ouvert pendant la mise en file ; la file, elle,
    // vit en base et survit à tout.
    for (let i = 0; i < cibles.length; i++) {
      const { item, prix } = cibles[i];
      try {
        const res = await republierArticleVinted(supabase, {
          inventaireId: item.id, vintedItemId: item.vinted_item_id, prixRepublication: prix,
        });
        if (res.success) {
          if (batchId && res.job_id) {
            // .select() obligatoire après un update client (règle RLS du
            // 30/07) : sans lui, une policy silencieuse ressemble à un succès.
            const { data: stamped, error: stampErr } = await supabase
              .from('cross_post_jobs')
              .update({ bulk_batch_id: batchId })
              .eq('id', res.job_id)
              .select('id');
            if (stampErr || !stamped?.length) {
              console.warn(`[repub lot] bulk_batch_id non posé sur ${res.job_id} — ` +
                (stampErr?.message ?? 'update silencieusement bloqué (RLS ?)') +
                ' — la progression retombera sur le repli « rafale de création ».');
            }
          }
          const now = new Date().toISOString();
          setJobsByInventaire(prev => ({
            ...prev,
            [item.id]: [...(prev[item.id] ?? []), {
              id: `optimistic-repub-${item.id}-${now}`, inventaire_id: item.id, platform: 'vinted',
              action: 'republish', status: 'pending', error: null, created_at: now, listing_url: null, title: item.title,
              bulk_batch_id: batchId,
              platform_fields: { republish_step: 'a_capturer', vinted_item_id: String(item.vinted_item_id) },
            }],
          }));
        } else {
          // FILET maintenance : le trigger refusera pareil tous les suivants —
          // on s'arrête là, le bandeau (armé ici) dit pourquoi, pas de liste
          // de refus techniques.
          if (rejetMaintenance(res)) { setRepubMaintenance(true); setRepubLot({ fait: i + 1, total: cibles.length, refus: [...refus] }); break; }
          refus.push({ titre: item.title, raison: res.reason ?? res.error ?? 'refus' });
        }
      } catch (e) {
        if (rejetMaintenance({ error: e?.message ?? e })) { setRepubMaintenance(true); setRepubLot({ fait: i + 1, total: cibles.length, refus: [...refus] }); break; }
        refus.push({ titre: item.title, raison: String(e?.message ?? e) });
      }
      setRepubLot({ fait: i + 1, total: cibles.length, refus: [...refus] });
    }
    setRepubSel(new Set());
  }

  async function relancerRepublication(item, job) {
    if (repubBusy) return;
    setRepubBusy(item.id);
    setRepubMsgs(m => ({ ...m, [item.id]: null }));
    try {
      const res = await relancerRepublishVinted(supabase, { job });
      if (!res.success) {
        if (rejetMaintenance(res)) { setRepubMaintenance(true); return; }
        setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'orange', texte: res.error ?? (lang === 'fr' ? 'Relance impossible.' : 'Relaunch failed.') } }));
        return;
      }
      setJobsByInventaire(prev => ({
        ...prev,
        [item.id]: (prev[item.id] ?? []).map(j => j.id === job.id ? { ...j, status: 'pending', error: null } : j),
      }));
      // Idem à la relance : pas de message « à la prochaine ouverture de
      // Chrome ». Le job repasse 'pending' juste au-dessus, donc la pastille
      // reprend la main et la feuille dit l'attente RÉELLE (le poll).
    } finally {
      setRepubBusy(null);
    }
  }

  // ── Capture incomplète : valeur saisie + relance en un geste (2026-08-21) ──
  // La feuille de progression propose la saisie des champs que la capture n'a
  // pas su lire (champs_a_completer). La valeur part dans
  // platform_fields.republish_user_fields — relancer_republish CONSERVE
  // platform_fields, et l'extension fusionne ces valeurs dans la capture
  // suivante (elles priment sur les libellés capturés). Update CONDITIONNEL
  // .eq(status,'needs_user') + .select() : même triple garde que le
  // mini-éditeur needs_user (double-clic, job reparti entre-temps, RLS
  // silencieuse).
  async function validerSaisieRelance(job, fournis) {
    const pfNext = {
      ...(job.platform_fields ?? {}),
      republish_user_fields: { ...(job.platform_fields?.republish_user_fields ?? {}), ...fournis },
    };
    const { data, error } = await supabase
      .from('cross_post_jobs')
      .update({ platform_fields: pfNext })
      .eq('id', job.id)
      .eq('status', 'needs_user')
      .select('id');
    if (error) return { success: false, error: error.message };
    if (!data?.length) return { success: false, error: lang === 'fr' ? 'Ce job a déjà été repris — referme et regarde où il en est.' : 'This job was already picked up — close and check its progress.' };
    const res = await relancerRepublishVinted(supabase, { job });
    if (!res.success) {
      if (rejetMaintenance(res)) { setRepubMaintenance(true); return { success: false, error: lang === 'fr' ? 'Republication en maintenance.' : 'Repost under maintenance.' }; }
      return res;
    }
    setJobsByInventaire(prev => ({
      ...prev,
      [job.inventaire_id]: (prev[job.inventaire_id] ?? []).map(j =>
        j.id === job.id ? { ...j, status: 'pending', error: null, platform_fields: pfNext } : j),
    }));
    return { success: true };
  }
  const [jobsByInventaire, setJobsByInventaire] = useState({});
  // ── É5 : dérivations de RENDU qui lisent jobsByInventaire ────────────────
  // IMPÉRATIVEMENT APRÈS la déclaration du state ci-dessus : posées avant,
  // elles levaient une TDZ au montage (« Cannot access 'jobsByInventaire'
  // before initialization ») → écran blanc en prod pour les comptes bêta,
  // incident Safari iOS du 05/08. Les non-bêta étaient épargnés par le
  // court-circuit du ternaire republishActif — c'est ce qui a fait croire à
  // un bug spécifique iOS.
  const repubVivants = republishActif
    ? Object.values(jobsByInventaire).flat().filter(j => j.action === 'republish' && (j.status === 'pending' || j.status === 'processing')).length
    : 0;
  const repubEtat = (item) => {
    // Masquée/brouillon inéligibles (2026-08-28, décision Nico) : une annonce
    // masquée ou brouillon n'est pas « en ligne » — la republier la
    // republierait VISIBLE, à l'inverse du geste de l'utilisateur (et la
    // capture d'un brouillon est incomplète par construction). Le chemin de
    // retour existe : démasquer sur Vinted puis resynchroniser le dressing.
    // Même garde de fraîcheur que la pastille (vintedMasqueeMalgreJobs) : un
    // job 'published' plus récent que le relevé rend l'article republiable.
    if (!(item.vinted_item_id && !item.disparu_le && item.statut !== 'vendu'
      && !vintedMasqueeMalgreJobs(item, jobsByInventaire[item.id] || []))) return 'ineligible';
    const rjobs = (jobsByInventaire[item.id] || []).filter(j => j.action === 'republish');
    let last = null;
    for (const j of rjobs) { if (!last || Date.parse(j.created_at || 0) > Date.parse(last.created_at || 0)) last = j; }
    // Gel Livres (2026-08-28 soir) : détection par le marqueur gel_livres_le
    // SEUL. Un article dont la dernière republication est gelée n'est ni
    // sélectionnable en lot ni relançable — une nouvelle republication
    // percerait le gel (job neuf, hors marqueur). La pastille « En pause »
    // (etapeRepublication) dit l'état ; ici on ferme juste la porte.
    if (last?.platform_fields?.gel_livres_le) return 'gelee';
    if (last && (last.status === 'pending' || last.status === 'processing' || last.status === 'needs_user')) return 'vivant';
    if (last && last.status === 'published' && last.platform_fields?.recreated_at
      && Date.now() - Date.parse(last.platform_fields.recreated_at) < 24 * 3600 * 1000) return 'cadence';
    return 'ok';
  };
  const repubActionnables = republishActif ? stockFiltre.filter(i => repubEtat(i) === 'ok') : [];

  // ── Bandeau de lot + signalement hors-ligne (2026-08-07, validé Nico) ─────
  // ⚠️ TOUT ce bloc lit jobsByInventaire : il vit APRÈS sa déclaration (règle
  // TDZ, incident Safari iOS du 05/08) et AVANT le rendu qui le consomme.
  // Dernier job republish PAR article — une seule vérité, réutilisée par le
  // bandeau, la remontée en tête et le filtre.
  const repubDernier = useMemo(() => {
    const m = {};
    for (const [invId, list] of Object.entries(jobsByInventaire)) {
      let last = null;
      for (const j of list) {
        if (j.action !== 'republish') continue;
        if (!last || Date.parse(j.created_at || 0) > Date.parse(last.created_at || 0)) last = j;
      }
      if (last) m[invId] = last;
    }
    return m;
  }, [jobsByInventaire]);
  // ── Plafond quotidien d'exécution : état SERVEUR (2026-08-29 soir) ───────
  // La retenue vit dans get-pending-jobs (v18+) et elle est ACTIVE — la
  // première version de ce bloc recalculait localement (coin_config + jobs
  // chargés) : deux vérités possibles, et l'app pouvait se taire pendant que
  // le serveur retenait la file (arrêt silencieux, le reproche fait au
  // blocage /listing-restriction). Désormais UNE source : l'app demande
  // l'état au serveur (mode plafond_only — SANS télémétrie : cet appel ne
  // stampe jamais extension_last_seen_at, il ne doit pas faire passer une
  // extension éteinte pour vivante). null (panne, pas d'état) → PAS de
  // bandeau : jamais un bandeau sur une erreur ni préventif.
  const [repubPlafondEtat, setRepubPlafondEtat] = useState(null); // {limite,faits,retenue,jour}|null
  useEffect(() => {
    if (!republishActif) return;
    let annule = false;
    const lire = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-pending-jobs', { body: { plafond_only: true } });
        if (!annule) setRepubPlafondEtat(error ? null : (data?.plafond_republish ?? null));
      } catch { if (!annule) setRepubPlafondEtat(null); }
    };
    lire();
    // Rafraîchi toutes les 2 min onglet visible : la retenue se lève à
    // minuit Paris, pas besoin de plus fin.
    const t = setInterval(() => { if (document.visibilityState === 'visible') lire(); }, 120000);
    return () => { annule = true; clearInterval(t); };
  }, [republishActif]);
  // Articles HORS LIGNE : republication arrêtée (needs_user/failed/cancelled)
  // À L'ÉTAPE 'deleted' — l'annonce a été retirée de Vinted et jamais recréée.
  // Le pire cas du produit (Combishort d'ornellaracano, 07/08 : plus d'une
  // heure hors ligne sans le savoir) : remontés EN TÊTE de liste tant que non
  // résolus, pastille rouge dédiée (cf. etapeRepublication).
  // Jobs GELÉS (gel_livres_le, 2026-08-28) exclus : leur pastille est le
  // badge neutre « En pause » et aucun geste utilisateur n'est attendu — les
  // remonter en tête crierait une urgence que le badge dément.
  const horsLigneIds = useMemo(() => {
    const s = new Set();
    if (!republishActif) return s;
    for (const [invId, last] of Object.entries(repubDernier)) {
      const st = last.status;
      if (last.platform_fields?.gel_livres_le) continue;
      if ((st === 'needs_user' || st === 'failed' || st === 'cancelled')
        && last.platform_fields?.republish_step === 'deleted') s.add(Number(invId));
    }
    return s;
  }, [repubDernier, republishActif]);
  // ── Écran de progression du lot (2026-08-28, remplace le bandeau du 07/08) ──
  // AFFICHAGE PUR : rien ici n'écrit un job, un platform_fields ou un step.
  // Périmètre du LOT : bulk_batch_id quand il est renseigné — depuis le
  // 2026-08-28, lancerRepublicationLot l'écrit sur CHAQUE job du lot (uuid
  // généré au clic), donc la progression se reconstruit depuis la BASE et
  // survit au refresh (total = jobs du lot, faits = statuts terminaux, aucun
  // compteur mémoire comme source de vérité). Repli sur la RAFALE DE CRÉATION
  // pour tous les jobs d'avant ce correctif (bulk_batch_id NULL — un lot
  // partait en un seul burst, 5 jobs en 242 ms le 09/08) et pour un
  // estampillage qui aurait échoué : les jobs en file + les terminaux créés
  // dans la même rafale.
  // « Vivant » = pending/processing/statut inconnu (prudence : jamais ignoré
  // ni planté) OU needs_user — un job qui attend l'utilisateur n'est pas
  // terminé, il maintient l'écran (ligne « action requise »).
  // Rien de vivant ⇒ null : l'écran disparaît, il ne raconte pas la journée.
  const repubBandeau = useMemo(() => {
    if (!republishActif) return null;
    const resolu = (st) => REPUB_STATUS_RESOLUS.includes(st);
    const enFile = (st) => !resolu(st) && st !== 'needs_user';
    const derniers = Object.values(repubDernier);
    const vivants = derniers.filter((j) => enFile(j.status) || j.status === 'needs_user');
    if (!vivants.length) return null;
    // Lot par bulk_batch_id : celui du vivant le plus récent, quand il existe.
    const recent = vivants.reduce((a, b) =>
      Date.parse(b.created_at ?? 0) > Date.parse(a.created_at ?? 0) ? b : a);
    const batchId = recent.bulk_batch_id ?? null;
    let lot;
    if (batchId) {
      lot = derniers.filter((j) => j.bulk_batch_id === batchId);
    } else {
      // Début de la rafale = le plus ancien job EN FILE, moins une marge de
      // 2 min (absorbe un insert de lot étalé sans aller chercher le lot
      // précédent). Ancrée sur la file SEULEMENT : un needs_user ancien
      // ancrerait des jours de terminaux sans rapport avec le lot du moment.
      // Les needs_user, eux, entrent au lot quel que soit leur âge (« tous
      // les jobs republish non terminés de l'utilisateur »).
      const debuts = vivants.filter((j) => enFile(j.status))
        .map((j) => Date.parse(j.created_at ?? '')).filter(Number.isFinite);
      const seuilLot = debuts.length ? Math.min(...debuts) - 2 * 60 * 1000 : Number.POSITIVE_INFINITY;
      lot = derniers.filter((j) => enFile(j.status) || j.status === 'needs_user'
        || (Number.isFinite(Date.parse(j.created_at ?? '')) && Date.parse(j.created_at) >= seuilLot));
    }
    // jobs/total EXCLUENT les needs_user (ligne « action requise » dédiée) :
    // le lot peut être fini avec cette ligne encore présente, c'est voulu.
    // La progression du bloc actif, elle, vit dans RepubBlocActif (tick 1 s)
    // — ici on ne fait que délimiter le lot et compter.
    let aRelancer = 0, arretees = 0, dryRuns = 0;
    const jobs = [];
    // Orpheline (3d-a) : une recréation en cours dont l'ordinateur ne répond
    // plus — mêmes seuils que la pastille (deleted > 20 min + heartbeat muet
    // > 10 min). Le memo se recalcule au rafraîchissement de
    // jobsByInventaire (20 s) : les seuils sont franchis avec au plus 20 s
    // de retard, largement assez.
    let orpheline = false;
    const hb = Date.parse(extensionStatus?.lastSeenAt ?? '');
    const hbMuet = !Number.isFinite(hb) || Date.now() - hb > 10 * 60 * 1000;
    for (const j of lot) {
      const st = j.status;
      // ⚠️ st peut valoir 'deleted' (statut du flux publish/delete, 133
      // lignes en prod) : RIEN à voir avec l'étape republish_step 'deleted'.
      // Ici un tel statut, inconnu du flux republish, compte simplement
      // « en cours » (ni résolu ni needs_user) — jamais confondu.
      if (st === 'needs_user') { aRelancer++; continue; }
      jobs.push(j);
      const step = repubStepDe(j);
      if (st === 'failed' || st === 'cancelled') arretees++;
      if (st === 'dry_run_completed') dryRuns++;
      if (enFile(st) && step === 'deleted' && hbMuet) {
        const d = Date.parse(j.platform_fields?.deleted_at ?? '');
        if (Number.isFinite(d) && Date.now() - d > 20 * 60 * 1000) orpheline = true;
      }
    }
    // Ordre stable : celui de la création du lot.
    jobs.sort((a, b) => Date.parse(a.created_at ?? 0) - Date.parse(b.created_at ?? 0));
    // Découpage séquentiel (v3 du 28/08 soir) : les republications sortent
    // UNE PAR UNE en prod (relevé 19:29 / 19:32 / 19:35 / 19:39) — l'écran
    // montre UN actif, une file, des terminées repliées. Actif = le
    // processing s'il existe (c'est lui que l'extension traite), sinon le
    // premier non-fini dans l'ordre de création du lot. Un statut inconnu
    // reste dans la file (prudence : jamais ignoré).
    const nonFinis = jobs.filter((j) => !repubJobFini(j));
    const actif = nonFinis.find((j) => j.status === 'processing') ?? nonFinis[0] ?? null;
    const file = nonFinis.filter((j) => j !== actif);
    const terminees = jobs.filter((j) => j.status === 'published' || j.status === 'sold' || repubStepDe(j) === 'recreated');
    return { jobs, total: jobs.length, aRelancer, arretees, dryRuns, orpheline, actif, file, terminees };
  }, [repubDernier, republishActif, extensionStatus?.lastSeenAt]);
  // Titres des lignes du lot : le job ne porte pas toujours son title, la
  // fiche d'inventaire fait foi.
  const repubTitres = useMemo(() => new Map((stock ?? []).map((i) => [i.id, i.title])), [stock]);
  const repubTitre = (j) => repubTitres.get(j.inventaire_id) ?? j.title ?? (lang === 'fr' ? 'Annonce' : 'Listing');
  // Filtre posé par les chips du bandeau : 'relancer' | 'arretees' | null.
  const [repubFiltre, setRepubFiltre] = useState(null);
  useEffect(() => {
    // Le filtre se retire tout seul quand sa catégorie se vide (relances
    // faites) : jamais une liste vide inexpliquée.
    if (!repubFiltre) return;
    if (repubFiltre === 'relancer' && (repubBandeau?.aRelancer ?? 0) === 0) setRepubFiltre(null);
    if (repubFiltre === 'arretees' && (repubBandeau?.arretees ?? 0) === 0) setRepubFiltre(null);
  }, [repubFiltre, repubBandeau]);
  // Liste réellement AFFICHÉE : filtre du bandeau s'il est actif, sinon la
  // liste visible avec les hors-ligne remontés en tête (même au-delà du
  // slice de 10 : un article hors ligne ne peut pas être caché par « Voir
  // plus »).
  const listeStock = useMemo(() => {
    if (repubFiltre) {
      return stockFiltre.filter(i => {
        const last = repubDernier[i.id];
        if (!last) return false;
        return repubFiltre === 'relancer'
          ? last.status === 'needs_user'
          : (last.status === 'failed' || last.status === 'cancelled');
      });
    }
    if (!horsLigneIds.size) return stockVisible;
    const tete = stockFiltre.filter(i => horsLigneIds.has(i.id));
    return [...tete, ...stockVisible.filter(i => !horsLigneIds.has(i.id))];
  }, [repubFiltre, stockFiltre, stockVisible, horsLigneIds, repubDernier]);

  // Job 'needs_user' ouvert dans le mini-éditeur « À compléter » (socle
  // needs_user, 2026-07-19). null = fermé. La fermeture sans valider ne touche
  // à RIEN : le job reste needs_user, le badge reste affiché.
  const [needsUserJob, setNeedsUserJob] = useState(null);

  // ── Fraîcheur extension : relecture ciblée anti-faux-positif (2026-08-13) ──
  // extensionStatus.lastSeenAt vient de fetchAll (chargement / refocus) et
  // peut RETARDER : conclure « ordinateur éteint » sur une valeur locale
  // périmée serait un faux positif chez quelqu'un dont l'extension tourne —
  // exactement ce que le bandeau ne doit jamais faire. Tant que la valeur
  // connue est hors fraîcheur, on relit la colonne toutes les 60 s (SELECT
  // ciblé, même patron que le rafraîchissement de la bannière de version dans
  // App.jsx) ; une extension vivante éteint donc le bandeau en ≤ 1 min.
  // La valeur la plus RÉCENTE des deux (prop, relecture) fait foi.
  const [extSeenRelu, setExtSeenRelu] = useState(null);
  const extLastSeenBest = (() => {
    const a = Date.parse(extensionStatus?.lastSeenAt ?? "");
    const b = Date.parse(extSeenRelu ?? "");
    if (!Number.isFinite(a)) return extSeenRelu ?? extensionStatus?.lastSeenAt ?? null;
    if (!Number.isFinite(b)) return extensionStatus?.lastSeenAt;
    return a >= b ? extensionStatus.lastSeenAt : extSeenRelu;
  })();
  const extFraicheur = fraicheurExtension(extLastSeenBest);
  useEffect(() => {
    if (!user?.id) return;
    if (extFraicheur.etat === "vivante" || extFraicheur.etat === "inconnue") return;
    let arret = false;
    const relire = async () => {
      const { data, error } = await supabase.from("profiles")
        .select("extension_last_seen_at").eq("id", user.id).maybeSingle();
      if (arret || error || !data) return;
      setExtSeenRelu(data.extension_last_seen_at ?? null);
    };
    relire();
    const timer = setInterval(relire, 60_000);
    return () => { arret = true; clearInterval(timer); };
  }, [user?.id, extFraicheur.etat]);
  // Job échoué dont on montre l'erreur complète + action directe (remplace le
  // window.alert du 19/07 — chantier onboarding 2026-07-27).
  const [failJobModal, setFailJobModal] = useState(null);
  // Relance manuelle d'un job échoué récupérable (2026-08-31) — voir
  // relanceManuelleInfo en tête de fichier pour le périmètre et la sûreté.
  const [relanceBusy, setRelanceBusy] = useState(false);
  const [relanceMsg, setRelanceMsg] = useState(null);
  useEffect(() => { setRelanceMsg(null); }, [failJobModal?.id]);
  async function relancerJobEchoue(job) {
    if (relanceBusy) return;
    setRelanceBusy(true); setRelanceMsg(null);
    try {
      const pf = { ...(job.platform_fields ?? {}) };
      // Une relance manuelle ANNULE la reprise automatique en attente (elle ne
      // s'y ajoute pas) et ouvre un nouveau cycle de reprises espacées :
      // l'extension repart de zéro sur le budget dd85a95 (5 essais, 5/15/30/60).
      delete pf.next_action_after;
      pf.needsUserAttempts = 0;
      pf.relances_manuelles = (Number(pf.relances_manuelles) || 0) + 1;
      pf.derniere_relance_manuelle = new Date().toISOString();
      // CAS sur le statut : on ne relance QUE depuis failed — si le job a bougé
      // entre-temps (régénéré, reparti), 0 ligne et on le dit. .select()
      // obligatoire après un update client (règle RLS du 30/07) : sans lui,
      // une policy silencieuse ressemble à un succès.
      const { data, error } = await supabase
        .from('cross_post_jobs')
        .update({ status: 'pending', error: null, platform_fields: pf })
        .eq('id', job.id)
        .eq('status', 'failed')
        .select('id');
      if (error) {
        setRelanceMsg(lang === 'en' ? `Relaunch failed: ${error.message}` : `Relance impossible : ${error.message}`);
        return;
      }
      if (!data?.length) {
        setRelanceMsg(lang === 'en'
          ? 'This job already changed state — close and check its status.'
          : 'Ce job a déjà changé d’état entre-temps — ferme et regarde son statut.');
        return;
      }
      setJobsByInventaire(prev => {
        const next = {};
        for (const [inv, list] of Object.entries(prev)) {
          next[inv] = list.map(j => j.id === job.id ? { ...j, status: 'pending', error: null, platform_fields: pf } : j);
        }
        return next;
      });
      setFailJobModal(null);
    } finally {
      setRelanceBusy(false);
    }
  }
  const [voiceInputMode, setVoiceInputMode] = useState('write');
  const [examplesOpen, setExamplesOpen] = useState(false);

  // ⚠️ RAFRAÎCHISSEMENT (2026-07-13) — sans lui, le Stock MENTAIT.
  // La publication est faite par l'EXTENSION, dans son coin, plusieurs minutes
  // après le clic : elle passe les jobs en "published" en base, mais cette liste
  // n'était lue QU'UNE FOIS, au montage (deps [user?.id]). Rien ne la relisait
  // jamais — l'article restait affiché comme non publié jusqu'au prochain
  // rechargement complet de l'app (bug remonté par Nico : « Publier » toujours
  // actif alors que les 4 plateformes étaient en ligne).
  // On relit donc : au retour sur l'onglet (le cas réel — on part surveiller la
  // publication ailleurs, on revient), et à intervalle régulier tant que l'app
  // est visible. Pas de realtime : le projet n'en utilise nulle part, et une
  // relecture de quelques lignes toutes les 20 s est sans effet mesurable.
  //
  // "processing" est dans le filtre, et ce n'est pas un détail : c'est le statut
  // porté PENDANT la publication. Sans lui, l'article ne montrait NI « En
  // cours… » ni ses plateformes tant que l'extension travaillait — il avait
  // simplement l'air de n'avoir jamais été publié.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;

    const relire = async () => {
      // "failed" est dans le filtre (2026-07-19, contrat « jamais d'état
      // flou ») : sans lui, un job échoué disparaissait SILENCIEUSEMENT de la
      // carte — ni « En cours… », ni pastille, ni erreur : la plateforme avait
      // simplement l'air de n'avoir jamais été incluse, indistinguable d'un
      // article jamais publié. `error` et `created_at` servent au badge Échec
      // (message associé + « seul le job le plus récent de la plateforme
      // compte » : un échec régénéré puis reparti en pending ne doit plus
      // s'afficher en échec).
      // "needs_user" est dans le filtre (2026-07-19, socle needs_user) : un
      // champ précis attend une décision de l'utilisateur — badge dédié
      // « ✋ À compléter », distinct de l'Échec. `platform_fields` est lu pour
      // needsUserField (libellé du champ, valeurs possibles, cible d'écriture)
      // que consomme le mini-éditeur.
      // Les jobs action='delete' sont AUSSI relus (retrait ciblé par logo,
      // 2026-07-19) : ils portent l'état visuel du logo — retrait en cours,
      // ou plateforme retirée — car le job publish d'origine, lui, RESTE
      // 'published' en base après une suppression réussie (seul le flux vente
      // annule les publish côté serveur). D'où 'deleted' dans le filtre.
      // listing_url + title servent à armer un delete depuis le logo — jamais
      // de delete sans le listing_url du job publish LUI-MÊME (leçon
      // listing_url croisée : tout repli supprime l'annonce d'un autre article).
      const { data } = await supabase
        .from("cross_post_jobs")
        // ⛔ NE JAMAIS ajouter une colonne ici sans l'avoir vérifiée dans le
        // schéma réel. cross_post_jobs n'a PAS d'`updated_at` — l'y avoir mis
        // (2de66f1) a fait échouer la requête ENTIÈRE côté PostgREST : `data`
        // revenait null, le garde-fou `if (!data) return` laissait
        // jobsByInventaire vide, et TOUTES les cartes de TOUS les comptes
        // perdaient d'un coup leurs logos de plateforme, leur pastille
        // « En ligne » et leurs badges de job — remplacés par le repli
        // textuel « 🏪 <plateforme> ». Un select PostgREST est tout ou rien :
        // une colonne inconnue ne dégrade pas, elle annule.
        // bulk_batch_id : VÉRIFIÉE dans le schéma prod le 28/08 (uuid,
        // information_schema) — sert au périmètre du lot de republications.
        // published_at : VÉRIFIÉE dans le schéma prod le 29/08 (timestamptz,
        // information_schema). Le compteur du plafond quotidien est passé
        // côté SERVEUR le soir même (get-pending-jobs plafond_only) — la
        // colonne reste lue, prête pour tout affichage horodaté des jobs.
        .select("id, inventaire_id, platform, status, error, created_at, published_at, platform_fields, action, listing_url, title, bulk_batch_id")
        .eq("user_id", user.id)
        // 'cancelled' et 'dry_run_completed' AJOUTÉS le 2026-08-05 : sans eux,
        // un republish qui se terminait DISPARAISSAIT de l'écran et la carte
        // retombait sur le job précédent — un dry run réussi à 10:01 s'affichait
        // comme l'échec de 08:01, message rouge compris. Un job terminé ne doit
        // jamais être masqué au profit d'un plus ancien.
        .in("status", ["pending", "processing", "published", "failed", "needs_user", "deleted", "cancelled", "dry_run_completed"])
        // Le plus récent d'abord : tout ce qui lit « le dernier job » lit la
        // même chose, sans dépendre de l'ordre de retour de PostgREST.
        .order("created_at", { ascending: false });
      if (annule || !data) return;
      const map = {};
      for (const job of data) {
        if (!map[job.inventaire_id]) map[job.inventaire_id] = [];
        map[job.inventaire_id].push(job);
      }
      setJobsByInventaire(map);
    };

    relire();
    const onVisible = () => { if (document.visibilityState === "visible") relire(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") relire();
    }, 20000);

    return () => {
      annule = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [user?.id]);

  // Mode dégradé (Phase B) : plateformes en pause → badge « En pause » sur les
  // jobs en attente concernés + bandeau en tête d'onglet (2026-08-27) dont le
  // texte est platform_health.reason affiché TEL QUEL : il s'écrit en base,
  // incident par incident, sans redéploiement. Lecture TOLÉRANTE, jamais
  // bloquante — et jamais bloquante pour l'utilisateur non plus : le bandeau
  // informe, il ne grise rien, les autres plateformes continuent.
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  const [pausedReasons, setPausedReasons] = useState({});
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const lire = async () => {
      try {
        const { data } = await supabase.from("platform_health").select("platform, reason").eq("paused", true);
        if (alive) {
          setPausedPlatforms((data ?? []).map(h => h.platform));
          setPausedReasons(Object.fromEntries((data ?? []).map(h => [h.platform, h.reason])));
        }
      } catch { /* jamais bloquant */ }
    };
    lire();
    const timer = setInterval(() => { if (document.visibilityState === "visible") lire(); }, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.id]);
  const pausedSet = new Set(pausedPlatforms);

  // (Le compteur « N republications réussies ces 7 derniers jours » livré en
  // 2.4.66 a été RETIRÉ le 2026-08-27, décision Nico : remplacé par la barre
  // de progression du bandeau de lot — cf. repubBandeau plus bas.)

  // (Le compteur d'en-tête « N en cours de dépôt » a été RETIRÉ le
  // 2026-08-28 soir, décision Nico : il se contredisait avec le « N sur M »
  // de l'écran de republications — UN SEUL compteur par écran.)

  // ── Retrait ciblé par plateforme (2026-07-19) ──────────────────────────────
  // Tap sur un logo de plateforme → RemovePlatformsModal (les 4 plateformes,
  // état réel + action par ligne, confirmation inline) → armRemoveJob : UN job
  // action='delete' pour la plateforme confirmée (même mécanisme que
  // armRemovals côté vente, mais scopé à une seule annonce). Les autres
  // plateformes ne sont pas touchées : aucun job créé, aucune donnée modifiée.
  // Insert direct (RLS "Users manage own cross_post_jobs"), aucune Pépite
  // débitée — ce n'est pas une publication. L'extension exécute au prochain
  // cycle ; la ligne passe en « retrait en cours… » (optimiste, via le job
  // inséré rendu dans jobsByInventaire) puis « retirée » quand le job atteint
  // 'deleted'. Retourne un message d'erreur (affiché DANS le modal) ou null.
  const [removeModalItem, setRemoveModalItem] = useState(null);
  // Tap sur « En cours… » → panneau de diagnostic (2026-07-20).
  const [jobStatusItem, setJobStatusItem] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(null);
  async function armRemoveJob(item, platform) {
    if (removeBusy) return null;
    // Le delete cible le job publish 'published' LE PLUS RÉCENT de la
    // plateforme — son listing_url et rien d'autre (leçon listing_url croisée).
    let pub = null;
    for (const j of jobsByInventaire[item.id] || []) {
      if (j.action === "delete" || j.platform !== platform || j.status !== "published") continue;
      if (!pub || Date.parse(j.created_at || 0) > Date.parse(pub.created_at || 0)) pub = j;
    }
    // Le modal désarme la ligne quand l'URL manque — ceci n'est que le filet.
    if (!pub?.listing_url) {
      const label = PLATFORM_LABELS[platform] || platform;
      return lang === 'fr'
        ? `Impossible de retirer de ${label} : le lien de l'annonce est introuvable.`
        : `Can't remove from ${label}: the listing link is missing.`;
    }
    setRemoveBusy(platform);
    try {
      const { data, error } = await supabase.from('cross_post_jobs').insert({
        user_id: user.id, inventaire_id: item.id, platform,
        action: 'delete', status: 'pending', photo_option: 'original',
        title: pub.title || item.title, listing_url: pub.listing_url,
        // Même drapeau que armRemovals (App.jsx) : sans URL captée, l'extension
        // cible l'annonce par son TITRE dans « Mes annonces ». ⚠️ Inatteignable
        // AUJOURD'HUI depuis ce chemin — la garde `if (!pub?.listing_url)`
        // ci-dessus refuse encore le retrait par logo quand l'URL manque, alors
        // que le bandeau de l'app, lui, sait désormais le faire. Incohérence
        // ASSUMÉE et signalée plutôt que corrigée en douce : lever cette garde
        // change un comportement visible, ça se décide, ça ne se glisse pas
        // dans un commit de propagation de drapeau.
        platform_fields: pub.listing_url ? {} : { removal_url_missing: true },
      }).select("id, inventaire_id, platform, status, error, created_at, platform_fields, action, listing_url, title").single();
      if (error) {
        console.error('[armRemoveJob] insert:', error.message);
        return lang === 'fr' ? `Le retrait n'a pas pu être lancé (${error.message}).` : `Removal could not be started (${error.message}).`;
      }
      // Patch local immédiat : la ligne du modal et le logo de la carte passent
      // en « retrait… » sans attendre le prochain poll (20 s).
      setJobsByInventaire(prev => ({ ...prev, [item.id]: [...(prev[item.id] || []), data] }));
      track('remove_single_platform', { platform });
      return null;
    } finally {
      setRemoveBusy(null);
    }
  }

  function replaceZoneResult(idx, patch) {
    setVoiceZoneResults(prev => prev.map((r, i) => i === idx ? {...r, ...patch} : r));
  }

  // Après un import de dressing : la liste vient des props (App.jsx), rien ne la
  // relit tout seul — sans ce rafraîchissement l'écran resterait VIDE alors que
  // les articles sont en base. App ne passe pas de prop de refetch dédiée, mais
  // vaActions.fetchAll (assistant vocal) relit inventaire + ventes.
  const rafraichirApresSync = () => {
    if (onSyncDone) { onSyncDone(); return; }
    vaActions?.fetchAll?.();
  };

  // ── Prix d'achat manquants sur le STOCK (03/08 soir) ───────────────────────
  // Miroir de la complétion de VentesTab, côté inventaire : les articles
  // importés du dressing arrivent SANS prix d'achat (Vinted ne le connaît
  // pas) et n'entrent dans aucun total tant qu'il manque. Invitation, jamais
  // blocage : la ligne reste pleinement utilisable (Publier, Vendre, éditer).
  // NULL = question ouverte · valeur (0 compris) = connu · flag = « je ne
  // sais plus » (question éteinte, article hors calculs).
  const [modePrixAchat,setModePrixAchat]=useState(false);
  const [paSel,setPaSel]=useState(()=>new Set());
  const [paOpenId,setPaOpenId]=useState(null);
  const [paDraft,setPaDraft]=useState("");
  const [paErr,setPaErr]=useState(null);
  const [paBusy,setPaBusy]=useState(false);
  const [paPatchs,setPaPatchs]=useState({}); // id -> {buy} | {inconnu:true} (optimiste, en attendant le refetch)
  const [paLot,setPaLot]=useState("");

  // "" -> null (VIDE ≠ ZÉRO), virgule gérée, illisible -> NaN. Même contrat
  // que parsePrix de VentesTab.
  const parsePrixStock=(v)=>{
    const t=String(v??"").trim().replace(/[\s€]/g,"").replace(",",".");
    if(!t) return null;
    const n=parseFloat(t);
    return Number.isFinite(n)&&n>=0?n:NaN;
  };
  const paIncomplet=(i)=>!paPatchs[i.id]&&i.statut==='stock'&&!prixAchatConnu(i)&&i.prix_achat_inconnu!==true;
  const nbSansPrix=stock.filter(paIncomplet).length;
  const paSelection=modePrixAchat?stockFiltre.filter(i=>paIncomplet(i)&&paSel.has(i.id)):[];

  async function ecrirePrixAchatStock(ids,pa){
    const avant={};ids.forEach(id=>{avant[id]=paPatchs[id];});
    setPaPatchs(p=>{const n={...p};ids.forEach(id=>{n[id]={buy:pa};});return n;});
    setPaErr(null);
    let req=supabase.from('inventaire').update({prix_achat:pa,prix_achat_inconnu:false}).in('id',ids);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    if(error){
      setPaPatchs(p=>{const n={...p};ids.forEach(id=>{if(avant[id]===undefined)delete n[id];else n[id]=avant[id];});return n;});
      setPaErr({id:ids.length===1?ids[0]:null,message:error.message});
      return false;
    }
    rafraichirApresSync();
    return true;
  }

  async function marquerInconnuStock(ids){
    if(!ids.length) return false;
    setPaErr(null);
    let req=supabase.from('inventaire').update({prix_achat_inconnu:true}).in('id',ids);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    if(error){setPaErr({id:ids.length===1?ids[0]:null,message:error.message});return false;}
    setPaPatchs(p=>{const n={...p};ids.forEach(id=>{n[id]={inconnu:true};});return n;});
    rafraichirApresSync();
    return true;
  }

  function validerPaStock(item){
    const pa=parsePrixStock(paDraft);
    if(Number.isNaN(pa)){setPaErr({id:item.id,message:lang==='fr'?'Prix illisible':'Invalid price'});return;}
    setPaOpenId(null);setPaDraft("");
    if(pa!==null) ecrirePrixAchatStock([item.id],pa);
  }

  async function appliquerPaLot(){
    const pa=parsePrixStock(paLot);
    if(pa===null||Number.isNaN(pa)){setPaErr({id:null,message:lang==='fr'?'Entre un prix unitaire':'Enter a unit price'});return;}
    setPaBusy(true);
    const ok=await ecrirePrixAchatStock(paSelection.map(i=>i.id),pa);
    setPaBusy(false);
    if(ok){setPaSel(new Set());setPaLot("");}
  }

  return (
    <>
      <style>{STOCK_TOP_CSS}</style>
      <style>{VOICE_KIT_CSS}</style>
      <div className="stock-top-v2">
        <div className="eyebrow-row">
          <div className="eyebrow">{lang==='en'?'AI Stock':'Stock IA'}</div>
        </div>
      </div>
      {/* Bannière déconnexion extension (2026-07-21) — avant, l'app était aveugle
          à l'état de l'extension : le diagnostic n'existait qu'au tap sur un job
          « En cours… » (invisible s'il n'y avait rien à tapoter). Ici : permanent,
          en tête, dès que l'extension est INACTIVE (>15 min sans heartbeat) ou à
          recharger. Mobile seulement — sur desktop l'utilisateur voit l'extension
          directement (« desktop c'est ok »). « Jamais vue » n'affiche rien : ce
          serait du bruit pour qui n'a pas encore installé l'extension. */}
      {/* ── Gradation fraîcheur (2026-08-13, cas Carla) ─────────────────────
          Trois états au lieu du rouge unique à 15 min :
          · vivante (< 1 h, cf. fraicheurExtension) → RIEN ;
          · éteinte (1 h → 7 j) → AMBRE, une ligne, informatif : rien n'est
            cassé, le job partira — jamais les mots « erreur/échec/problème »,
            sinon l'utilisateur annule et relance, et recrée un job fantôme ;
          · inactive (> 7 j) → le rouge ⚠️ d'avant, désormais justifié.
          Stock VIDE → rien : le bandeau alerterait avant qu'il y ait quoi que
          ce soit à publier. La bannière « à mettre à jour » garde son
          comportement d'origine, après les états de fraîcheur. */}
      {isMobile && (() => {
        const stockVide = (stock?.length ?? 0) === 0;
        if (!stockVide && extFraicheur.etat === "inactive") {
          return (
            <div style={{
              display:"flex", gap:10, alignItems:"flex-start",
              background:"#FEF2F2", border:"1px solid #FECACA", borderLeft:"4px solid #DC2626",
              borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
            }}>
              <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>⚠️</span>
              <div style={{fontSize:13, lineHeight:1.5, color:"#3f3a2e"}}>
                <div style={{fontWeight:700, marginBottom:2, color:"#B91C1C"}}>
                  {lang==="en" ? `Extension inactive for ${extFraicheur.jours} d` : `Extension inactive depuis ${extFraicheur.jours} j`}
                </div>
                {lang==="en"
                  ? "Open Chrome, and sign in again on fillsell.app if it doesn't resume."
                  : "Ouvre Chrome, et reconnecte-toi sur fillsell.app si ça ne repart pas."}
              </div>
            </div>
          );
        }
        if (!stockVide && extFraicheur.etat === "eteinte") {
          return (
            <div style={{
              display:"flex", gap:8, alignItems:"center",
              background:"#FFFBEB", border:"1px solid #FDE68A", borderLeft:"4px solid #F59E0B",
              borderRadius:12, padding:"8px 12px", marginBottom:14, width:"100%", boxSizing:"border-box",
            }}>
              <span style={{fontSize:14, lineHeight:1, flexShrink:0}}>💻</span>
              <div style={{fontSize:12.5, lineHeight:1.4, color:"#78350F"}}>
                {lang==="en"
                  ? "Your computer is off — your listings will go out next time Chrome opens."
                  : "Ton ordinateur est éteint — tes publications partiront à la prochaine ouverture de Chrome."}
              </div>
            </div>
          );
        }
        if (!extensionStatus?.outdated) return null;
        // Contenu « à mettre à jour » posé EN DUR (pas via diagnostiquerExtension,
        // dont la branche « morte > 15 min » primerait et ressusciterait le
        // rouge sur un stock vide). Même wording que la branche outdated.
        return (
          <div style={{
            display:"flex", gap:10, alignItems:"flex-start",
            background:"#FFF7ED", border:"1px solid #FED7AA", borderLeft:"4px solid #EA580C",
            borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
          }}>
            <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>⚠️</span>
            <div style={{fontSize:13, lineHeight:1.5, color:"#3f3a2e"}}>
              <div style={{fontWeight:700, marginBottom:2, color:"#9A3412"}}>
                {lang==="en" ? "Extension needs updating" : "Extension à mettre à jour"}
              </div>
              {lang==="en"
                ? "A newer version exists. Install the latest version from the Chrome Web Store (Extension page in settings)."
                : "Une version plus récente existe. Installe la dernière version depuis le Chrome Web Store (page Extension dans les réglages)."}
            </div>
          </div>
        );
      })()}
      {/* ── Bandeau maintenance republication (2026-08-13) ──────────────────
          coin_config.republish_maintenance = 1 : les boutons Republier (carte
          et lot) sont grisés plus bas, ce bandeau dit pourquoi. Il s'arme
          aussi via le FILET si un insert est rejeté REPUBLISH_MAINTENANCE
          malgré tout (clé passée à 1 après le chargement de l'écran). */}
      {repubMaintenance&&(
        <div style={{
          display:"flex", gap:10, alignItems:"flex-start",
          background:"#FFF7ED", border:"1px solid #FED7AA", borderLeft:"4px solid #EA580C",
          borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
        }}>
          <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>🛠️</span>
          <div style={{fontSize:13, lineHeight:1.5, color:"#3f3a2e"}}>
            <div style={{fontWeight:700, marginBottom:2, color:"#9A3412"}}>
              {lang==='fr'?"Republication en maintenance":"Reposting under maintenance"}
            </div>
            {lang==='fr'
              ?"On corrige un problème qui pouvait empêcher la remise en ligne de certaines annonces. Vos annonces sont protégées et aucune Pépite n'est débitée. On vous prévient dès que c'est rétabli."
              :"We're fixing an issue that could prevent some listings from going back online. Your listings are safe and no Nuggets are charged. We'll let you know as soon as it's back."}
          </div>
        </div>
      )}
      {/* ── Bandeau plateforme en pause (2026-08-27) ─────────────────────────
          platform_health.paused = true : un bandeau PAR plateforme en pause,
          en tête d'onglet, dont le texte est platform_health.reason affiché
          TEL QUEL (il s'écrit en base, incident par incident, sans
          redéploiement). Purement informatif : rien n'est grisé, rien n'est
          bloqué — les jobs se mettent en file et repartent à la reprise. */}
      {pausedPlatforms.map(p=>(
        <div key={p} style={{
          display:"flex", gap:10, alignItems:"flex-start",
          background:"#EFF3F8", border:"1px solid #C7D6E5", borderLeft:"4px solid #64748B",
          borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
        }}>
          <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>⏸️</span>
          <div style={{fontSize:13, lineHeight:1.5, color:"#334155"}}>
            <div style={{fontWeight:700, marginBottom:2, color:"#1E293B"}}>
              {lang==='fr'?`${PLATFORM_LABELS[p]||p} en pause`:`${PLATFORM_LABELS[p]||p} paused`}
            </div>
            {pausedReasons[p]||(lang==='fr'
              ?`Les publications ${PLATFORM_LABELS[p]||p} sont momentanément en pause. Reprise automatique dès rétablissement — rien à faire de votre côté.`
              :`${PLATFORM_LABELS[p]||p} posting is temporarily paused. It will resume automatically — nothing you need to do.`)}
          </div>
        </div>
      ))}
      {/* (La ligne verte « N republications réussies ces 7 derniers jours »
          vivait ici — retirée le 2026-08-27 au profit de la barre de
          progression du bandeau de lot, dans la liste plus bas.) */}
      {/* ── Bandeau horloge machine en retard (2026-08-15, cas Carla) ────────
          Détection detecterRetardHorloge (shared.js) sur les jobs déjà
          chargés (jobsByInventaire, poll 20 s) : processing_since (horloge
          machine) vs created_at (serveur), seule la ligne datée la plus
          récente fait foi — le bandeau s'éteint tout seul au job suivant une
          fois l'horloge corrigée. Même famille visuelle que « ordinateur
          éteint ». INFORMATIF SEULEMENT : rien n'est grisé, rien n'est
          bloqué, aucune garde ne lit ce signal. */}
      {(()=>{
        const retard=detecterRetardHorloge(Object.values(jobsByInventaire).flat());
        if(!retard.enRetard) return null;
        return (
          <div style={{
            display:"flex", gap:10, alignItems:"flex-start",
            background:"#FFFBEB", border:"1px solid #FDE68A", borderLeft:"4px solid #D97706",
            borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
          }}>
            <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>🕰️</span>
            <div style={{fontSize:13, lineHeight:1.5, color:"#78350F"}}>
              <div style={{fontWeight:700, marginBottom:2}}>
                {lang==='fr'
                  ?`L'horloge de ton ordinateur retarde d'environ ${retard.jours} jour${retard.jours>1?"s":""}`
                  :`Your computer's clock is about ${retard.jours} day${retard.jours>1?"s":""} behind`}
              </div>
              {lang==='fr'
                ?"Les sites de vente refusent des connexions quand l'heure est fausse — c'est souvent ce qui fait échouer les publications. Active la date et l'heure automatiques dans les réglages de date et d'heure de ton ordinateur (celui où tourne l'extension), puis relance tes publications."
                :"Selling sites refuse connections when the clock is wrong — this is often what makes publications fail. Turn on automatic date & time in your computer's date & time settings (the one running the extension), then relaunch your publications."}
            </div>
          </div>
        );
      })()}
      {/* ── Hiérarchie d'écran (2026-08-27, décision Nico) ───────────────────
          1. incident (platform_health, conditionnel) → 2. barre de
          progression des republications (conditionnelle) → 3. Actualiser mon
          dressing → 4. Ajouter un article → 5. galerie. Les blocs 2 et 3
          vivent ICI, au-dessus de la grille desktop : quand les bandeaux
          conditionnels n'existent pas, la carte dressing est le premier
          élément du contenu, sans espace vide au-dessus. Le CSS .stock-v2
          est monté par le <style> de la liste plus bas — les classes portent,
          l'ordre DOM d'un <style> est sans effet. */}
      <div className="stock-v2" style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        {/* ── Écran de progression des republications (v3 du 28/08 soir) :
            UN actif, une file, un repli — le traitement réel est SÉQUENTIEL
            (une republication toutes les ~3 min) ; les barres par job de
            2.4.74 avançaient toutes ensemble, illisible et faux (capture
            19:35 : 6 barres jumelles pour 1 seul job traité). LA seule barre
            de l'écran vit dans RepubBlocActif (tick 1 s isolé). Visible tant
            que le lot garde du vivant (pending/processing/needs_user) —
            repubBandeau null sinon. Les lignes « action requise » /
            « arrêtées » filtrent la liste ; re-tap = retire le filtre. */}
        {repubBandeau&&(
          <div style={{background:"#fff",border:`1px solid ${repubBandeau.aRelancer>0?"#EED9A6":"#E7E3D8"}`,borderRadius:12,padding:"12px 14px"}}>
            {/* En-tête : UN SEUL compteur (« N sur M ») — le « N en cours de
                dépôt » de l'eyebrow a été supprimé, ils se contredisaient. */}
            <div style={{display:"flex",alignItems:"baseline",gap:8}}>
              <span style={{fontSize:13.5,fontWeight:700,color:"#10201B"}}>
                {lang==='fr'?`Republication${repubBandeau.total>1?'s':''}`:`Repost${repubBandeau.total>1?'s':''}`}
              </span>
              {repubBandeau.total>0&&(
                <span style={{marginLeft:"auto",fontSize:12.5,fontWeight:600,color:"#5C6560",fontVariantNumeric:"tabular-nums"}}>
                  {lang==='fr'
                    ?`${repubBandeau.terminees.length} sur ${repubBandeau.total}`
                    :`${repubBandeau.terminees.length} of ${repubBandeau.total}`}
                </span>
              )}
            </div>
            {repubBandeau.actif&&(
              <RepubBlocActif lang={lang} job={repubBandeau.actif} titre={repubTitre(repubBandeau.actif)}/>
            )}
            {/* Bandeau « ta file reprend demain » (2026-08-29 soir) : l'état
                vient du SERVEUR (repubPlafondEtat, get-pending-jobs
                plafond_only) — jamais recalculé ici. Ton NEUTRE ET POSITIF :
                ni une erreur, ni une panne, ni une sanction — une protection
                volontaire du compte, et le vocabulaire le dit (« reprend
                demain », jamais « bloqué »/« limite »/« refusé »). Même
                grammaire que les encarts du bloc (fond teinté doux, bord,
                radius) ; teal de la palette Stock IA, pas de rouge. Affiché
                SEULEMENT si la retenue serveur est active ET qu'il reste des
                jobs en attente — jamais vide, jamais préventif. Pas de
                compte à rebours, pas de pourcentage, pas de date de fin de
                lot (décision Nico). */}
            {(()=>{
              const p=repubPlafondEtat;
              const restantes=repubBandeau.file.length+(repubBandeau.actif&&!repubJobFini(repubBandeau.actif)?1:0);
              if(!p?.retenue||restantes<=0)return null;
              return(
                <div style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:12,background:"#F0F7F5",border:"1px solid #CBE3DD",borderRadius:12,padding:"11px 13px"}}>
                  <ShieldCheck size={16} style={{flexShrink:0,marginTop:2,color:"#1B6E62"}}/>
                  <div style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.5,color:"#1B6E62"}}>
                    <div style={{fontWeight:700}}>
                      {lang==='fr'
                        ?`${p.faits} republications faites aujourd'hui — ta file reprend demain.`
                        :`${p.faits} reposts done today — your queue resumes tomorrow.`}
                    </div>
                    <div style={{fontWeight:500,opacity:0.85,marginTop:2}}>
                      {lang==='fr'
                        ?`${restantes} annonce${restantes>1?'s':''} en attente, rien à faire de ton côté. FillSell espace tes republications pour protéger ton compte Vinted.`
                        :`${restantes} listing${restantes>1?'s':''} waiting, nothing to do on your side. FillSell paces your reposts to protect your Vinted account.`}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* File « ENSUITE » : numérotée à partir de 2, AUCUNE barre —
                c'est elle qui dit que le traitement est séquentiel : chacun
                voit sa position, personne ne se croit bloqué. Plafonnée à
                5 lignes puis « + N en attente » (une file de 280 — cas
                nadegemarcelin78 — ne s'affiche jamais en entier). */}
            {repubBandeau.file.length>0&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.07em",color:"#8A8578",marginBottom:2}}>{lang==='fr'?'ENSUITE':'UP NEXT'}</div>
                {repubBandeau.file.slice(0,5).map((j,i)=>(
                  <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}>
                    <span style={{width:16,flexShrink:0,fontSize:12,fontWeight:600,color:"#8A8578",fontVariantNumeric:"tabular-nums"}}>{i+2}</span>
                    <span style={{flex:1,minWidth:0,fontSize:12.5,color:"#5C6560",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{repubTitre(j)}</span>
                  </div>
                ))}
                {repubBandeau.file.length>5&&(
                  <div style={{fontSize:12,color:"#8A8578",padding:"6px 0 0 26px"}}>
                    {lang==='fr'?`+ ${repubBandeau.file.length-5} en attente`:`+ ${repubBandeau.file.length-5} waiting`}
                  </div>
                )}
              </div>
            )}
            {repubBandeau.terminees.length>0&&(
              <RepubTerminees lang={lang} jobs={repubBandeau.terminees} titreDe={repubTitre}/>
            )}
            {/* Un dry run n'est ni une republiée ni une arrêtée : sans cette
                ligne il disparaîtrait de l'écran (recette REPUBLISH_DRY_RUN). */}
            {repubBandeau.dryRuns>0&&(
              <div style={{fontSize:11.5,color:"#8A8578",marginTop:8}}>
                {lang==='fr'
                  ?`${repubBandeau.dryRuns} test${repubBandeau.dryRuns>1?'s':''} à blanc terminé${repubBandeau.dryRuns>1?'s':''}`
                  :`${repubBandeau.dryRuns} dry run${repubBandeau.dryRuns>1?'s':''} finished`}
              </div>
            )}
            {/* Arrêtées : ligne CONSERVÉE — elles ne comptent ni dans « N sur
                M » côté N ni dans la file ; sans cette ligne un échec serait
                invisible ici. Tap → filtre la liste. */}
            {repubBandeau.arretees>0&&(
              <button onClick={()=>setRepubFiltre(f=>f==='arretees'?null:'arretees')}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",marginTop:12,border:`1px solid ${repubFiltre==='arretees'?"#5C6560":"#E7E3D8"}`,background:repubFiltre==='arretees'?"#5C6560":"#F7F5EF",color:repubFiltre==='arretees'?"#fff":"#5C6560",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",lineHeight:1.45}}>
                <span style={{flex:1,minWidth:0}}>
                  {repubBandeau.arretees} {lang==='fr'
                    ?`republication${repubBandeau.arretees>1?'s':''} arrêtée${repubBandeau.arretees>1?'s':''}`
                    :`stopped repost${repubBandeau.arretees>1?'s':''}`}
                </span>
                <ChevronRight size={15} style={{flexShrink:0}}/>
              </button>
            )}
            {/* Ligne « action requise » — les needs_user n'ont ni ligne ni
                barre ni compteur : le lot peut afficher « M sur M » avec
                cette ligne encore là, et c'est voulu (l'automatique est fini,
                le reste dépend de l'utilisateur). Tap → filtre la liste sur
                ces jobs. */}
            {repubBandeau.aRelancer>0&&(
              <button onClick={()=>setRepubFiltre(f=>f==='relancer'?null:'relancer')}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",marginTop:12,border:`1px solid ${repubFiltre==='relancer'?"#8A6100":"#EED9A6"}`,background:repubFiltre==='relancer'?"#8A6100":"#FFF6E3",color:repubFiltre==='relancer'?"#fff":"#8A6100",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",lineHeight:1.45}}>
                <Hand size={14} style={{flexShrink:0}}/>
                <span style={{flex:1,minWidth:0}}>
                  {lang==='fr'
                    ?`${repubBandeau.aRelancer} annonce${repubBandeau.aRelancer>1?'s attendent':' attend'} une action`
                    :`${repubBandeau.aRelancer} listing${repubBandeau.aRelancer>1?'s await':' awaits'} your action`}
                </span>
                <ChevronRight size={15} style={{flexShrink:0}}/>
              </button>
            )}
            {repubFiltre&&(
              <div style={{fontSize:11.5,color:"#8A8578",marginTop:6}}>
                {lang==='fr'?'Liste filtrée — re-touche le bouton pour tout réafficher.':'List filtered — tap the button again to show everything.'}
              </div>
            )}
            {/* Pied de page, séparé par un filet. Orpheline PRIME : « ton
                ordinateur travaille » serait un mensonge quand il ne répond
                plus. Aucune durée ni estimation, nulle part. */}
            <div style={{borderTop:"1px solid #EFECE3",marginTop:12,paddingTop:9}}>
              {repubBandeau.orpheline?(
                <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"8px 10px",fontSize:11.5,color:"#B91C1C",lineHeight:1.5,fontWeight:600}}>
                  <AlertTriangle size={14} style={{flexShrink:0,marginTop:2}}/>
                  <span>
                    {lang==='fr'
                      ?"Ton ordinateur ne répond plus — ouvre Chrome pour terminer la recréation. Ton annonce et tes photos sont en sécurité."
                      :"Your computer isn't responding — open Chrome to finish the recreation. Your listing and photos are safe."}
                  </span>
                </div>
              ):(
                <div style={{fontSize:11.5,color:"#8A8578",lineHeight:1.5}}>
                  {lang==='fr'
                    ?"Ton ordinateur travaille en continu, annonce après annonce — tu peux quitter cet écran, tout continue tout seul."
                    :"Your computer keeps working, listing after listing — you can leave this screen, everything carries on by itself."}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── Actualiser mon dressing — TOUT EN HAUT du contenu (27/08).
            Monté UNE seule fois, hors de tout ternaire vide/rempli : le
            composant porte l'état du run (sonde extension, poll de
            progression) — une instance par branche serait démontée/remontée
            au premier article importé, état perdu en plein suivi. */}
        <VintedDressingSync
          lang={lang} user={user} isNative={isNative}
          extensionStatus={extensionStatus}
          source={stock.length===0?'stock_empty':'stock_liste'}
          onDone={rafraichirApresSync}
          repubEnVol={repubVivants}
        />
      </div>
      <div style={!isMobile?{display:"grid",gridTemplateColumns:"300px 1fr",gap:20,alignItems:"start",width:"100%"}:{display:"flex",flexDirection:"column",gap:16,width:"100%",boxSizing:"border-box"}}>
        <div className="stock-top-v2" style={{background:"#fff",borderRadius:12,padding:20,display:"flex",flexDirection:"column",gap:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          {/* ── Zone de saisie IA — REPLIÉE PAR DÉFAUT (2026-08-09) ──────────
              Le drapeau voiceZoneOpen existait depuis toujours, mais valait
              `true` et AUCUN bouton ne le basculait (setVoiceZoneOpen était
              déstructuré sans être appelé : eslint le signalait). Résultat :
              onglets Écrire/Parler + zone de texte + Analyser + exemples +
              ajout manuel occupaient tout le premier écran, et repoussaient
              sous la ligne de flottaison la carte de synchro Vinted ET la
              liste des articles. Une ligne rouvre le tout.
              ⚠️ Le repli ne doit JAMAIS masquer du contenu vivant : une
              analyse en cours, un résultat, une erreur ou le formulaire manuel
              ouvert forcent l'affichage, quoi que dise le drapeau — sinon un
              « Analyser » lancé rendrait un écran vide. Tant qu'il y a du
              contenu vivant, la barre de repli disparaît : l'écran propose
              alors « Recommencer » / « Réessayer », qui ramènent à l'état
              replié. */}
          {(()=>{
            const contenuVivant=(voiceStep==="done"&&voiceZoneResults.length>0)||voiceStep==="error"||voiceStep==="parsing"||voiceLoading;
            if(contenuVivant) return null;
            return (
              <button type="button" onClick={()=>setVoiceZoneOpen(v=>!v)}
                style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:voiceZoneOpen?"2px 0 6px":"2px 0",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <span style={{flexShrink:0,width:30,height:30,borderRadius:9,background:"rgba(47,158,144,0.10)",display:"flex",alignItems:"center",justifyContent:"center",color:"#1B6E62"}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </span>
                <span style={{flex:1,minWidth:0,fontSize:13,fontWeight:700,color:C.text}}>
                  {lang==='fr'?"Ajouter un article — écris ou parle":"Add an item — write or speak"}
                </span>
                <span style={{flexShrink:0,display:"inline-flex",color:"#8A8578",transition:"transform 0.15s",transform:voiceZoneOpen?"rotate(180deg)":"none"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </span>
              </button>
            );
          })()}
          {(voiceZoneOpen||showManualForm||(voiceStep==="done"&&voiceZoneResults.length>0)||voiceStep==="error"||voiceStep==="parsing"||voiceLoading)&&(<>
          {voiceStep==="done"&&voiceZoneResults.length>0?(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* ⚠️ Ces cartes étaient dupliquées ici (~570 lignes) avec des styles
                  divergents de celles du drawer. Elles montent désormais LE composant
                  partagé VoiceResultCard — même rendu, même logique, une seule source
                  de vérité (unification du 2026-07-14). */}
              {voiceZoneResults.map((r,idx)=>(
                <VoiceResultCard
                  key={idx}
                  result={r}
                  idx={idx}
                  allResults={voiceZoneResults}
                  ctx={{
                    lang, currency, items,
                    actions:vaActions,
                    replaceResult:replaceZoneResult,
                    edits:zoneEdits,
                    setEdits:setZoneEdits,
                  }}
                />
              ))}
              <Btn kind="ghost" onClick={resetVoiceFlow} style={{width:"100%"}}>
                {lang==='fr'?"Recommencer":"Start over"}
              </Btn>
            </div>
          ):voiceStep==="error"?(
            <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center",padding:"8px 0"}}>
              <div style={{fontSize:13,color:"#B0645A",fontWeight:600,textAlign:"center"}}>{voiceError}</div>
              <button onClick={resetVoiceFlow} style={{padding:"10px 20px",background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {lang==='fr'?"Réessayer":"Try again"}
              </button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column"}}>
              <div className="mode-toggle">
                <button type="button" className={"mode-btn"+(voiceInputMode==="write"?" active":"")} onClick={()=>setVoiceInputMode("write")}>
                  ✎ {lang==='fr'?"Écrire":"Write"}
                </button>
                <button type="button" className={"mode-btn"+(voiceInputMode==="speak"?" active":"")} onClick={()=>setVoiceInputMode("speak")}>
                  🎙 {lang==='fr'?"Parler":"Speak"}
                </button>
              </div>

              {voiceInputMode==="write"?(<>
                {voiceStep==="parsing"&&<div style={{fontSize:12,fontWeight:700,color:"#6B7A75",textAlign:"center",lineHeight:1.4,marginBottom:8}}>{lang==='fr'?"🧠 Analyse en cours...":"🧠 Analyzing..."}</div>}
                <textarea value={voiceText} onChange={e=>setVoiceText(e.target.value)} disabled={voiceLoading}
                  placeholder={getRotatingExamples(currency,lang)[voicePlaceholderIdx]?.text}
                  rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${voiceText?C.teal:"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5,color:C.text}}/>
              </>):(
                <div className="voice-state">
                  <div className="voice-orb-wrap">
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <button type="button"
                      className={"voice-orb"+(vaStep==="thinking"?" thinking":"")}
                      onClick={()=>fabTriggerRef?.current?.()}
                      disabled={vaStep==="thinking"}
                    >
                      {vaStep==="thinking"?"⏳":"🎙"}
                    </button>
                  </div>
                  <div className="voice-hint">
                    {vaStep==="recording"?(lang==='fr'?"Je t'écoute…":"Listening…")
                      :vaStep==="thinking"?(lang==='fr'?"Je réfléchis…":"Thinking…")
                      :(lang==='fr'?"Appuie et parle":"Tap and speak")}
                  </div>
                </div>
              )}

              <div className="hint-row">
                <span className="hint-icon">✦</span>
                <span className="hint-text">{lang==='fr'?"Plus tu détailles, plus l'IA est précise.":"The more you detail, the more accurate the AI is."}</span>
              </div>

              {voiceInputMode==="write"&&!isPremium&&(()=>{const r=VOICE_FREE_LIMIT-voiceUsedToday;return r<=2&&r>0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:r===1?'#FEE2E2':'#FEF3C7',color:r===1?'#DC2626':'#D97706',marginBottom:12}}>{r===1?(lang==='fr'?'⚠️ Dernière analyse vocale du jour !':'⚠️ Last voice analysis today!'):(lang==='fr'?`🎙️ Il vous reste ${r} analyses vocales`:`🎙️ ${r} voice analyses left`)}</div>):r===0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:'#FEE2E2',color:'#DC2626',marginBottom:12}}>{lang==='fr'?'🔒 Limite atteinte · Passer Premium':'🔒 Limit reached · Go Premium'}</div>):null;})()}

              {voiceInputMode==="write"&&(
                <button className={"cta"+((!voiceText.trim()||voiceLoading)?"":" active")} onClick={()=>callVoiceParse(voiceText)} disabled={!voiceText.trim()||voiceLoading}>
                  ✦ {lang==='fr'?"Analyser":"Analyze"}
                </button>
              )}

              <div className="examples-toggle" onClick={()=>setExamplesOpen(v=>!v)}>
                {lang==='fr'?"Voir des exemples":"See examples"}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{transform:examplesOpen?"rotate(180deg)":"rotate(0deg)"}}>
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              {examplesOpen&&(()=>{
                const FIXED_EX=lang==='fr'?[
                  {text:"Veste Zara M, 8€",icon:"➕"},
                  {text:"Vendu mes Air Max 90, 45€",icon:"💰"},
                  {text:"Mes articles les plus rentables ?",icon:"📊"},
                ]:[
                  {text:"Zara jacket M, £8",icon:"➕"},
                  {text:"Sold my Air Max 90, £45",icon:"💰"},
                  {text:"My most profitable items?",icon:"📊"},
                ];
                return(
                  <div className="examples-panel">
                    {FIXED_EX.map((ex,i)=>(
                      <button key={i} type="button" className="example-chip" onClick={()=>{setVoiceText(ex.text);setVoiceInputMode("write");setExamplesOpen(false);}}>
                        <span>{ex.icon}</span>
                        <span>{ex.text}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          </>)}
          {/* ── Toggle formulaire manuel ── */}
          <button onClick={()=>setShowManualForm(v=>!v)}
            style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
          >
            {showManualForm?(lang==='fr'?"− Fermer le formulaire ▴":"− Close form ▴"):(lang==='fr'?"+ Ajouter manuellement ▾":"+ Add manually ▾")}
          </button>
          {showManualForm&&(<>
          {/* ── Mode toggle ── */}
          <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3}}>
            <button onClick={()=>{setManualMode("single");setLotDistributed(null);}} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="single"?"#1B6E62":"transparent",color:manualMode==="single"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              {lang==='fr'?"Article seul":"Single item"}
            </button>
            <button onClick={()=>setManualMode("lot")} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="lot"?"#1B6E62":"transparent",color:manualMode==="lot"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              Lot
            </button>
          </div>
          {manualMode==="single"&&(<>
          {items.length===0?(
            <div style={{textAlign:"center",padding:"6px 0 10px",animation:"fadeIn 0.4s ease"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#0E7C5F,#34D399)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 12px",boxShadow:"0 4px 16px rgba(29,158,117,0.3)"}}>📦</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{lang==='en'?'Add your first item':'Ajoute ton premier article'}</div>
              <div style={{fontSize:12,color:C.sub,lineHeight:1.6,maxWidth:220,margin:"0 auto"}}>{lang==='en'?'Name + buy price is enough to start tracking your profit.':'Nom + prix d\'achat suffit pour commencer à suivre tes marges.'}</div>
            </div>
          ):(
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{t('ajouterTitre')}</div>
          )}
          <div>
            <Field label={t('fieldNom')} value={iTitle} set={setITitle} placeholder="Ex: Air Max 90, Jean slim, Lot vêtements..." icon="🏷️"/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{t('fieldNomHint')}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Quantité":"Quantity"} value={String(iQuantite)} set={v=>setIQuantite(Math.max(1,parseInt(v)||1))} placeholder="1" type="number" icon="🔢"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={iMarque} set={setIMarque} placeholder={lang==='en'?"Ex: Nike, Zara, H&M, Unbranded...":"Ex: Nike, Zara, H&M, Sans marque..."} icon="✏️"/>
          </div>
          <div>
            <select value={iType} onChange={e=>setIType(e.target.value)}
              style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:iType?"#10201B":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
              <option value="">{(iTitle||iMarque)?(lang==='fr'?`🤖 Détecté : ${detectType(iTitle,iMarque)}`:`🤖 Detected: ${typeLabel(detectType(iTitle,iMarque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
              <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
              <option value="High-Tech">📱 High-Tech</option>
              <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
              <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
              <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
              <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
              <option value="Sport">⚽ Sport</option>
              <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
              <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
              <option value="Musique">🎵 {typeLabel('Musique',lang)}</option>
              <option value="Collection">🏆 Collection</option>
              <option value="Multimédia">📺 {typeLabel('Multimédia',lang)}</option>
              <option value="Jardin">🌿 {typeLabel('Jardin',lang)}</option>
              <option value="Bricolage">🔧 {typeLabel('Bricolage',lang)}</option>
              <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
            </select>
          </div>
          <div>
            <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Prix auquel tu as acheté l'article":"Price you paid for the item"}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Frais d'achat (optionnel)":"Purchase fees (optional)"} value={iPurchaseCosts} set={setIPurchaseCosts} placeholder={lang==='fr'?"Livraison fournisseur, réparation...":"Supplier shipping, repair..."} type="number" icon="🛍️" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Frais liés à l'achat : livraison, réparation...":"Purchase-side costs: shipping, repair..."}</div>}
          </div>
          <div>
            <label onClick={()=>setIAlreadySold(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px 14px",background:iAlreadySold?"#E7F3F0":"#F9FAFB",borderRadius:12,border:`1.5px solid ${iAlreadySold?"#1B6E62":"rgba(0,0,0,0.1)"}`,transition:"all 0.2s",userSelect:"none"}}>
              <div style={{width:36,height:20,borderRadius:10,background:iAlreadySold?"#1B6E62":"#D1D5DB",transition:"background 0.2s",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:iAlreadySold?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:iAlreadySold?"#1B6E62":"#6B7A75"}}>{lang==='fr'?'Déjà vendu ?':'Already sold?'}</span>
            </label>
          </div>
          {iAlreadySold&&(
            <>
              <div>
                <Field label={lang==='fr'?"Prix de vente":"Sell price"} value={iSell} set={setISell} placeholder="0,00" type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              </div>
              <div>
                <Field label={lang==='fr'?"Frais de vente (optionnel)":"Selling fees (optional)"} value={iSellingFees} set={setISellingFees} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
                <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={iRememberSellingFees} onChange={e=>setIRememberSellingFees(e.target.checked)} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer"}}/>
                  <span style={{fontSize:12,color:"#6B7A75",userSelect:"none"}}>{lang==='fr'?'Mémoriser ces frais de vente':'Remember selling fees'}</span>
                </label>
              </div>
            </>
          )}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>📝 {lang==='fr'?"Description (optionnel)":"Description (optional)"}</div>
            <textarea
              value={iDesc}
              onChange={e=>setIDesc(e.target.value.slice(0,200))}
              placeholder={lang==='fr'?"Ex: Lot de 3 pièces, taille M, état neuf...":"Ex: Bundle of 3, size M, brand new..."}
              maxLength={200}
              rows={2}
              style={{width:"100%",padding:"10px 14px",borderRadius:14,border:`1.5px solid ${iDesc?C.teal:"rgba(0,0,0,0.12)"}`,fontSize:13,color:C.text,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5}}
              onFocus={e=>e.currentTarget.style.borderColor=C.teal}
              onBlur={e=>e.currentTarget.style.borderColor=iDesc?C.teal:"rgba(0,0,0,0.12)"}
            />
            <div style={{fontSize:10,color:C.label,textAlign:"right",marginTop:2}}>{iDesc.length}/200</div>
          </div>
          <div>
            <Field label={lang==='fr'?"Emplacement (optionnel)":"Storage location (optional)"} value={iEmplacement} set={setIEmplacement} placeholder={lang==='fr'?"Ex: Tiroir 45A, Portant 3, Étagère B...":"Ex: Drawer 45A, Rack 3, Shelf B..."} icon="📦"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Plateforme de vente (optionnel)":"Resale platform (optional)"} value={iPlateforme} set={setIPlateforme} placeholder={lang==='fr'?"Ex: Vinted, eBay, Depop, Leboncoin...":"Ex: Vinted, eBay, Depop, Leboncoin..."} icon="🏪"/>
          </div>
          {items.length>0&&(
            <div style={{background:C.rowBg,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.sub,border:"1px solid rgba(0,0,0,0.06)",lineHeight:1.6}}>
              💡 {t('prixHint')}
            </div>
          )}
          {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK-2&&quotaFree<FREE_STOCK_LIMIT_FALLBACK&&(
            <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
              ⚠️ {lang==='fr'?`${FREE_STOCK_LIMIT_FALLBACK-quotaFree} article${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} restant${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} sur ton plan gratuit`:`${FREE_STOCK_LIMIT_FALLBACK-quotaFree} item${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} remaining on your free plan`}
            </div>
          )}
          {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&!isNative
            ? <PremiumBanner userEmail={user?.email} origine="banniere_stock"/>
            : !isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&isNative
            ? null
            : <button className="btn-pill-primary" onClick={addItem} disabled={!iTitle||!iBuy||(iAlreadySold&&!iSell)} style={{opacity:(!iTitle||!iBuy||(iAlreadySold&&!iSell))?0.5:1}}>
                {iSaved?(lang==='fr'?"✓ Ajouté !":"✓ Added!"):items.length===0?(lang==='fr'?"Ajoute ton premier article → vois ton bénéfice 🚀":"Add your first item → see your profit 🚀"):t('ajouterArticle')}
              </button>
          }
          {isNative&&!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&(
            <IAPUpgradeBlock lang={lang} iapLoading={iapLoading} onPurchase={()=>openUpgradeModal(null,'banniere_stock')} onRestore={handleIAPRestore}/>
          )}
          {items.length===0&&!iSaved&&!(iTitle&&iBuy)&&(
            <div style={{textAlign:"center",fontSize:12,color:C.label,marginTop:-4}}>
              {lang==='fr'?'Tu es à 1 étape de voir tes premiers profits 💰':'You are 1 step away from seeing your first profits 💰'}
            </div>
          )}
          {items.length===0&&!iSaved&&iTitle&&iBuy&&(
            <div style={{textAlign:"center",fontSize:12,color:C.teal,fontWeight:600,marginTop:-4}}>
              {lang==='fr'?'✓ Prêt ! Clique pour ajouter et voir ton bénéfice instantanément':'✓ Ready! Click to add and see your profit instantly'}
            </div>
          )}
          {firstItemAdded&&(
            <div style={{background:C.greenLight,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.green,border:"1px solid #C6F6D5",fontWeight:600,textAlign:"center"}}>
              {lang==='fr'?'✅ Article ajouté ! Tu peux maintenant enregistrer une vente.':'✅ Item added! You can now record a sale.'}
            </div>
          )}
          </>)}
          {manualMode==="lot"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>🛍️ {lang==='fr'?"Prix total du lot (€)":"Total lot price (€)"}</div>
                <div className="inp" style={{background:"#fff",borderRadius:14,padding:"0 16px",height:58,border:lotManualTotal?`1px solid ${C.teal}55`:"1px solid rgba(0,0,0,0.08)",display:"flex",alignItems:"center",gap:12,boxShadow:lotManualTotal?`0 0 0 3px ${C.teal}11`:"0 2px 8px rgba(0,0,0,0.04)"}}>
                  <span style={{fontSize:20,flexShrink:0,opacity:0.7}}>💰</span>
                  <input type="number" value={lotManualTotal} onChange={e=>setLotManualTotal(e.target.value)} placeholder="0,00" inputMode="decimal" style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:16,fontWeight:600,flex:1,fontFamily:"inherit"}}/>
                  <span style={{color:C.label,fontSize:13,fontWeight:600}}>€</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {lotManualItems.map((lotItem,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input value={lotItem.nom} onChange={e=>{const v=e.target.value;setLotManualItems(prev=>prev.map((it,idx)=>idx===i?{...it,nom:v}:it));setLotDistributed(null);}}
                        placeholder={lang==='fr'?`Article ${i+1}`:`Item ${i+1}`}
                        style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1px solid rgba(0,0,0,0.1)",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",color:C.text,transition:"border-color 0.15s"}}
                        onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                        onBlur={e=>e.currentTarget.style.borderColor="rgba(0,0,0,0.1)"}
                      />
                      {lotManualItems.length>2&&(
                        <button onClick={()=>{setLotManualItems(prev=>prev.filter((_,idx)=>idx!==i));setLotDistributed(null);}} style={{background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0,lineHeight:1}}>×</button>
                      )}
                    </div>
                    {lotDistributed?.items?.[i]&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:4,animation:"fadeIn 0.3s ease"}}>
                        <input type="number" value={lotDistributed.items[i].prix_estime_lot} onChange={e=>{const v=parseFloat(e.target.value)||0;setLotDistributed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:64,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:16,fontFamily:"inherit",outline:"none",fontWeight:700,color:C.green}}/>
                        <span style={{fontSize:12,color:C.label}}>€</span>
                        {lotDistributed.items[i].categorie&&(()=>{const ts=getTypeStyle(lotDistributed.items[i].categorie);return <span style={{background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>{ts.emoji} {typeLabel(lotDistributed.items[i].categorie,lang)}</span>;})()}
                        {lotDistributed.items[i].marque&&<span style={{fontSize:11,color:"#6B7A75",fontWeight:600}}>{lotDistributed.items[i].marque}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={()=>{setLotManualItems(prev=>[...prev,{nom:""}]);setLotDistributed(null);}} style={{padding:"8px",background:"transparent",border:"1px dashed rgba(0,0,0,0.2)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >+ {lang==='fr'?"Ajouter un article":"Add item"}</button>
              <button onClick={handleLotDistribute} disabled={lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())}
                style={{width:"100%",padding:"14px",background:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#DCEEEA":"linear-gradient(120deg,#2F9E90,#1B6E62)",color:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#8FB5AE":"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"not-allowed":"pointer",boxShadow:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"none":"0 10px 24px -8px rgba(47,158,144,0.28)",transition:"all 0.2s",fontFamily:"inherit"}}>
                {lotDistributing?(lang==='fr'?"⏳ Répartition en cours...":"⏳ Distributing..."):(lang==='fr'?"✨ Répartir automatiquement":"✨ Auto distribute")}
              </button>
              {lotDistributed&&(
                <>
                  <div style={{fontSize:12,color:"#6B7A75",textAlign:"center",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée — modifiable":"Estimated split — editable"}</div>
                  <button onClick={addLotToInventory} style={{width:"100%",padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)",fontFamily:"inherit"}}>{lang==='fr'?"✓ Ajouter le lot à l'inventaire":"✓ Add lot to inventory"}</button>
                </>
              )}
            </div>
          )}
          </>)}
          {/* ── Import / Export Excel — replié DANS « Ajouter un article »
              (2026-08-27) : le bloc autonome en bas d'écran est SUPPRIMÉ,
              remplacé par cette rangée discrète sous « Ajouter manuellement ».
              Mêmes gestes, mêmes gardes qu'avant (note du 2026-08-09 :
              handleImportFile / handleExport sont 100 % client, aucun verrou
              serveur, ouvert à tous) — déplacé et réduit, logique intacte. */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",paddingTop:2,borderTop:"1px solid rgba(0,0,0,0.05)"}}>
            <span style={{flex:1,minWidth:0,fontSize:11.5,fontWeight:600,color:"#8A8578",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={t('importDesc')}>
              {t('importExcel')}
            </span>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImportFile}/>
            {/* Les deux boutons forment UN groupe : ils passent à la ligne
                ensemble (leçon du harnais 390 px). */}
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:"#E7F3F0",color:"#1B6E62",border:"1px solid #2F9E9033",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",transition:"background 0.15s",whiteSpace:"nowrap",fontFamily:"inherit"}}
                onMouseEnter={e=>e.currentTarget.style.background="#DCEEEA"}
                onMouseLeave={e=>e.currentTarget.style.background="#E7F3F0"}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v11"/><path d="m7.5 10 4.5 4 4.5-4"/><path d="M4 19h16"/></svg>
                {t('importer')}
              </button>
              <button onClick={handleExport} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:"#F2F0E9",color:"#6B7A75",border:"1px solid #E7E3D8",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",transition:"background 0.15s",whiteSpace:"nowrap",fontFamily:"inherit"}}
                onMouseEnter={e=>e.currentTarget.style.background="#EAE7DD"}
                onMouseLeave={e=>e.currentTarget.style.background="#F2F0E9"}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3"/><path d="m7.5 7 4.5-4 4.5 4"/><path d="M4 19h16"/></svg>
                {t('exporter')}
              </button>
            </div>
            {importMsg&&<div style={{width:"100%",fontSize:11.5,color:C.green,fontWeight:600,marginTop:1}}>{importMsg}</div>}
          </div>
        </div>

        <div ref={listRef} className="stock-v2" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:16}}>
          <style>{STOCK_CSS}</style>

          {/* ── Réordonnancement du 2026-08-27 (hiérarchie Nico) ─────────────
              Le bandeau de lot de republications et la carte « Actualiser mon
              dressing » vivaient ICI, en tête de liste — remontés TOUT EN
              HAUT de l'écran, au-dessus de la grille (avant même la carte
              « Ajouter un article »). L'Import/Export Excel, lui, est replié
              DANS la carte « Ajouter un article ». Rien d'autre n'a bougé. */}

          {/* ── Barre de recherche + Filtres type ──
              Masquée tant qu'il n'y a RIEN à chercher (2026-08-09) : sur un
              compte vide elle occupait une ligne pleine largeur au-dessus d'un
              « 0 art. », et un tap y ouvrait le clavier pour fouiller le vide.
              `stock` est la liste BRUTE (la filtrée, c'est stockFiltre) : la
              barre ne peut donc pas se cacher elle-même en ne trouvant rien.
              La clause `|| search` est la ceinture du cas limite — dernier
              article vendu pendant qu'une recherche est saisie : sans elle, la
              barre disparaîtrait avec un filtre actif et plus aucun moyen de
              l'effacer. */}
          {(stock.length>0||search)&&(
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px"}}>
            <span style={{fontSize:14,flexShrink:0}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={lang==='fr'?"Rechercher...":"Search..."}
              style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#10201B"}}/>
            {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
          </div>
          )}
          {(()=>{
            // Basé uniquement sur stock (pas sold) : les pills de catégorie filtrent la
            // section EN STOCK ci-dessous (VENDUS est masqué dans Stock IA) — une catégorie
            // sans article en stock ne doit plus s'afficher, même si elle a des ventes passées.
            const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||stock.some(i=>i.type===tp));
            return presentTypes.length>1&&(
              <div className="cat-filters">
                {presentTypes.map(tp=>{
                  const isActive=filterType===tp;
                  return(
                    <button key={tp} className={`fpill${isActive?" active":""}`} onClick={()=>setFilterType(tp)}>
                      <span className="fdot" style={{background:tp==="Tous"?"linear-gradient(155deg,#2F9E90,#1B6E62)":getCatTileColor(tp)}}/>
                      {tp==="Tous"?(lang==='en'?'All':'Tous'):typeLabel(tp,lang)}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── VENDUS — masqués dans Stock IA (visible dans Ventes) ── */}
          {false&&<div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('vendus')}</div>
                {isMobile&&(()=>{const _b=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return _b.length>0&&(<button onClick={()=>setPillsExpandedSold(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedSold?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button>);})()}
              </div>
              <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{tpl('venteLabel',{n:soldQty??sold.length})}</div>
            </div>
            {(()=>{
              const _slAll=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesFiltreesParType=["Toutes",..._slAll.filter(b=>b.toLowerCase()!=="sans marque"),..._slAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesFiltreesParType.length<=1) return null;
              const _mob=isMobile;
              const _open=!_mob||pillsExpandedSold;
              return(
                <div style={{marginBottom:12}}>
                  {!_open&&(
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setFilterMarqueSold("Toutes")} style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarqueSold==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarqueSold==="Toutes"?"#fff":"#6B7A75"}}>
                        {filterMarqueSold==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(filterMarqueSold,lang)}
                      </button>
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"300px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.25s ease, opacity 0.2s ease"}}>
                    {marquesFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarqueSold(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarqueSold===m?"#1B6E62":"#F2F0E9",
                          color:filterMarqueSold===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {sold.length===0?(
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",top:-6,right:0,background:"#F2F0E9",color:"#8A8578",fontSize:9,fontWeight:700,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E7E3D8"}}>
                  {lang==='en'?'Preview':'Exemple'}
                </span>
                <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.55,pointerEvents:"none",userSelect:"none"}}>
                  {SKELETON_SOLD.map((sk,i)=>{
                    const ts=getTypeStyle(sk.type);
                    return(
                      <div key={i} className="skeleton-item-row" style={{background:"#fff",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${getCatBorder(sk.type)}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#10201B"}}>{sk.title}</div>
                            <span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #BFE0D9"}}>{sk.marque}</span>
                            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(sk.type,lang)}</span>
                          </div>
                          <div style={{fontSize:11,color:"#A3A9A6",marginTop:2}}>{t('skeletonAchat')} {fmt(sk.buy)} → {t('skeletonVente')} {fmt(sk.sell)}</div>
                        </div>
                        <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                          <div style={{fontWeight:700,fontSize:18,color:getMargeColor(sk.marginPct)}}>+{fmt(sk.margin)}</div>
                          <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{Math.round(sk.marginPct)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {soldVisible.map(item=>{
                  const ts=getTypeStyle(item.type);
                  const qty=item.quantite||1;
                  // Sans prix d'achat, la marge de cette vente n'existe pas : ni
                  // montant, ni pourcentage (et surtout pas 0).
                  const margeConnue=prixAchatConnu(item)&&item.margin!=null&&Number.isFinite(Number(item.margin));
                  // getMargeColor(null) rendait la couleur d'une marge nulle : le
                  // tiret s'affichait en « mauvaise marge ». Gris = pas d'avis.
                  const mc=margeConnue?getMargeColor(item.marginPct):"#A3A9A6";
                  return(
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,_table:'inventaire',frais:(item.statut==='vendu'?item.sellingFees:item.purchaseCosts)??0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#10201B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {qty>1&&<span style={{background:"#1B6E62",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0}}>×{qty}</span>}
                          {item.marque&&<span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                          {item.plateforme&&<span style={{background:"#EDE9FE",color:"#7C3AED",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #C4B5FD"}}>🏪 {item.plateforme}</span>}
                          {/* Prix DEMANDÉ sur l'annonce Vinted (dernier relevé) —
                              distinct du prix de vente déclaré, qui reste la
                              seule vérité d'encaissement. */}
                          {item.vinted_item_id&&prixAnnonces[item.vinted_item_id]!=null&&(
                            <span title={lang==='fr'?"Prix affiché sur l'annonce Vinted — pas le prix réellement reçu":"Asking price on the Vinted listing — not the amount actually received"}
                              style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>
                              🏷️ {lang==='fr'?'Annonce':'Listing'} · {fmt(prixAnnonces[item.vinted_item_id])}
                            </span>
                          )}
                        </div>
                        {/* PIÈGE : `fmt(item.buy+(item.purchaseCosts||0))` affichait
                            « 0 € » pour un prix d'achat null (fmt lit null comme 0) —
                            l'utilisateur croyait avoir saisi 0 € au lieu de rien.
                            Inconnu → tiret. Un vrai 0 € (article gratuit) s'affiche
                            toujours 0 €. Le prix de VENTE, lui, reste affiché. */}
                        {/* Vente : même règle d'honnêteté que l'achat — un vendu
                            importé du dressing n'a PAS de prix de vente tant que
                            l'utilisateur ne l'a pas enregistré (Vinted ne le
                            communique pas). `fmt(null*qty)` affichait un faux
                            « Vente 0,00 € » ; inconnu → tiret. */}
                        <div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Achat':'Bought'} {prixAchatConnu(item)?fmt(prixAchatNum(item)+(item.purchaseCosts||0)):'—'} → {lang==='fr'?'Vente':'Sold'} {item.sell!=null?fmt((item.sell||0)*qty):'—'}</div>
                      </div>
                      <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                        {/* PIÈGE : `(item.margin||0)*qty` et `fmtp(item.marginPct)`
                            transformaient une marge inconnue en « 0 € / 0,0 % »,
                            c'est-à-dire en revente à prix coûtant — un chiffre faux
                            plutôt qu'un chiffre absent. */}
                        <div style={{fontWeight:700,fontSize:18,color:mc}}>{margeConnue?fmt(item.margin*qty):'—'}</div>
                        <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{margeConnue&&item.marginPct!=null?fmtp(item.marginPct):'—'}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
                {soldFiltre.length>10&&!soldShowAll&&(
                  <button onClick={()=>setSoldShowAll(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${soldFiltre.length-10} articles)`:`Show more (${soldFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}
          </div>}

          {/* ── EN STOCK ── */}
          <div style={{background:"#F6F5F1",borderRadius:16,padding:16,border:"1px solid #E7E3D8"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('enStockLabel')}</div>
                {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                {(()=>{const _b=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];if(!_b.length)return null;return(<>{!pillsExpandedStock&&(<button onClick={()=>setFilterMarque("Toutes")} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarque==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarque==="Toutes"?"#fff":"#6B7A75"}}>{lang==='en'?'All':'Toutes'}</button>)}<button onClick={()=>setPillsExpandedStock(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedStock?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button></>);})()}
              </div>
              {(()=>{
                // Reflète le filtre actif (catégorie/marque/recherche) au lieu du total global :
                // même formule que stockQty/stockVal (App.jsx) mais appliquée à stockFiltre.
                const _fQty=stockFiltre.reduce((a,i)=>a+(i.quantite||1),0);
                // PIÈGE : `a+i.buy*(i.quantite||1)` sans même un `||0` — un seul
                // article au prix d'achat undefined produisait un NaN qui
                // contaminait TOUT le total (« NaN € »), et un null valait 0 €.
                // totalInvesti() écarte les articles au prix inconnu ; le compteur
                // d'articles (_fQty), lui, continue de tous les compter.
                const _fVal=totalInvesti(stockFiltre);
                return <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{_fQty} {lang==='fr'?'art.':'items'} · {fmt(_fVal)}</div>;
              })()}
            </div>
            {/* ── Quota du plan (07/08, validé Nico) — ligne DÉDIÉE sous le
                header : le chip au-dessus reflète le FILTRE actif, le quota
                est GLOBAL — les mélanger mettrait deux nombres différents
                côte à côte sans explication. L'assiette affichée = celle que
                le trigger applique réellement (vendus et vinted_sync exclus)
                — la parenthèse est indispensable : sans elle, un compte à 30
                importés lisant « 4 / 200 » croirait le compteur cassé.
                Free à 0 article : RIEN (un nouvel inscrit ne doit pas
                rencontrer un quota en premier). Ambre dès 80 %. Quota
                ATTEINT : la ligne devient un geste (modale de conversion,
                même patron que la RepublishSheet). Premium/Pro : « Stock
                illimité », discret, même place. */}
            {(()=>{
              if(isPremium){
                return <div style={{fontSize:11.5,color:"#8A8578",margin:"6px 2px 0"}}>{lang==='fr'?'Stock illimité':'Unlimited stock'}</div>;
              }
              if(quotaFree===0)return null;
              const plein=quotaFree>=freeStockLimit;
              const proche=!plein&&quotaFree>=freeStockLimit*0.8;
              if(plein){
                return(
                  <button onClick={()=>{track('premium_click',{source:'quota_stock'});openUpgradeModal(null,'stock_quota_atteint');}}
                    style={{display:"block",width:"100%",textAlign:"left",margin:"6px 0 0",padding:"8px 10px",borderRadius:10,border:"1px dashed rgba(47,158,144,0.55)",background:"rgba(47,158,144,0.07)",color:"#1B6E62",fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'
                      ?`Quota gratuit atteint : ${quotaFree} / ${freeStockLimit} articles — 💡 Stock illimité : voir les offres`
                      :`Free quota reached: ${quotaFree} / ${freeStockLimit} items — 💡 Unlimited stock: see plans`}
                  </button>
                );
              }
              return(
                <div style={{fontSize:11.5,lineHeight:1.5,color:proche?"#8A6100":"#8A8578",margin:"6px 2px 0"}}>
                  {lang==='fr'
                    ?`Quota gratuit : ${quotaFree} / ${freeStockLimit} articles — les vendus et le dressing Vinted importé ne comptent pas`
                    :`Free quota: ${quotaFree} / ${freeStockLimit} items — sold items and your imported Vinted closet don't count`}
                </div>
              );
            })()}
            {(()=>{
              const _sbAll=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesStockFiltreesParType=["Toutes",..._sbAll.filter(b=>b.toLowerCase()!=="sans marque"),..._sbAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesStockFiltreesParType.length<=1) return null;
              const _open=pillsExpandedStock;
              return(
                <div style={{marginBottom:12}}>

                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"2000px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.3s ease, opacity 0.2s ease"}}>
                    {marquesStockFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarque(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarque===m?"#1B6E62":"#F2F0E9",
                          color:filterMarque===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* ── Prix d'achat manquants : compteur-invitation cliquable ──
                Même contrat que VentesTab : on n'oblige jamais, pas de rouge.
                Reste affiché à 0 quand le mode est ouvert (sinon plus de sortie). */}
            {(nbSansPrix>0||modePrixAchat)&&(
              <button className={`pa-call${modePrixAchat?" on":""}`}
                onClick={()=>{setModePrixAchat(v=>!v);setPaSel(new Set());setPaOpenId(null);setPaErr(null);}}>
                <span style={{fontSize:17,flexShrink:0}}>{modePrixAchat?"↩":"💡"}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span className="n">
                    {modePrixAchat
                      ?(lang==='fr'?"Revenir à tout le stock":"Back to all stock")
                      :(lang==='fr'?`${nbSansPrix} article${nbSansPrix>1?"s":""} sans prix d'achat`
                          :`${nbSansPrix} item${nbSansPrix>1?"s":""} without purchase price`)}
                  </span>
                  <span className="sub">
                    {modePrixAchat
                      ?(nbSansPrix===0
                          ?(lang==='fr'?"Tout est complété 🎉":"All done 🎉")
                          :(lang==='fr'?"Vinted ne connaît pas ce que TU as payé — toi si. Un 0 (don, lot offert) est un prix valide."
                              :"Vinted doesn't know what YOU paid — you do. 0 (gift, free lot) is a valid price."))
                      :(lang==='fr'?"Complète-les pour qu'ils comptent dans ton total investi et tes marges"
                          :"Add them so they count in your invested total and margins")}
                  </span>
                </span>
              </button>
            )}

            {/* Barre de lot — le vide-grenier : « ces 10 articles, 2 € pièce ». */}
            {modePrixAchat&&paSelection.length>0&&(
              <div className="pa-bar">
                <span className="lbl">{lang==='fr'?`${paSelection.length} sélectionné${paSelection.length>1?"s":""}`:`${paSelection.length} selected`}</span>
                <input className="pa-input" inputMode="decimal" value={paLot}
                  onChange={e=>setPaLot(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();appliquerPaLot();}if(e.key==='Escape'){e.preventDefault();setPaSel(new Set());setPaLot("");}}}
                  placeholder={lang==='fr'?"2,50":"2.50"} aria-label={lang==='fr'?"Prix d'achat unitaire":"Unit purchase price"}/>
                <button className="apply" disabled={paBusy} onClick={appliquerPaLot}>
                  {paBusy?"…":(lang==='fr'?`Appliquer aux ${paSelection.length}`:`Apply to ${paSelection.length}`)}
                </button>
                <button className="pa-ghost" disabled={paBusy} onClick={()=>marquerInconnuStock(paSelection.map(i=>i.id)).then(ok=>{if(ok)setPaSel(new Set());})}>
                  {lang==='fr'?"Je ne sais plus":"I don't remember"}
                </button>
                <button className="pa-ghost" onClick={()=>{setPaSel(new Set());setPaLot("");}}>✕</button>
                <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
                  <span className="pa-hint">{lang==='fr'?"Prix d'achat UNITAIRE, appliqué à chaque article sélectionné.":"UNIT purchase price, applied to each selected item."}</span>
                  {paErr?.id===null&&<span className="pa-err">{paErr.message}</span>}
                </div>
              </div>
            )}

            {/* ── É5.2 : republication en lot (bêta) — même patron que la
                saisie des prix d'achat. Le toggle n'apparaît que s'il y a
                quelque chose à republier ; en mode, seuls les articles
                ACTIONNABLES portent une case (bornes = pas de case, jamais un
                échec post-clic). */}
            {republishActif&&!modePrixAchat&&(repubActionnables.length>0||modeRepublish)&&(
              <button className={`pa-call${modeRepublish?" on":""}`}
                /* Maintenance : on ne peut plus ENTRER en mode lot (grisé),
                   mais on peut toujours en SORTIR — sinon un utilisateur déjà
                   en mode au moment où la clé passe à 1 y resterait coincé. */
                disabled={repubMaintenance&&!modeRepublish}
                style={repubMaintenance&&!modeRepublish?{opacity:0.45,cursor:"default"}:undefined}
                onClick={()=>{if(repubMaintenance&&!modeRepublish)return;setModeRepublish(v=>!v);setRepubSel(new Set());setRepubLot(null);}}>
                <span style={{fontSize:17,flexShrink:0}}>{modeRepublish?"↩":"🔁"}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span className="n">
                    {modeRepublish
                      ?(lang==='fr'?"Quitter la republication en lot":"Exit bulk repost")
                      :(lang==='fr'?`Republier en lot (${repubActionnables.length} article${repubActionnables.length>1?"s":""} possible${repubActionnables.length>1?"s":""})`
                          :`Bulk repost (${repubActionnables.length} item${repubActionnables.length>1?"s":""} available)`)}
                  </span>
                  <span className="sub">
                    {modeRepublish
                      ?(lang==='fr'?"Coche les annonces à faire remonter, puis lance — 1 Pépite par annonce."
                          :"Tick the listings to bump, then launch — 1 Nugget each.")
                      :(lang==='fr'?"Supprime puis recrée chaque annonce à l'identique pour la faire remonter dans le fil Vinted."
                          :"Deletes then recreates each listing identically to bump it in the Vinted feed.")}
                  </span>
                </span>
              </button>
            )}
            {modeRepublish&&(repubSel.size>0||repubLot)&&(
              <div className="pa-bar">
                {repubLot&&repubLot.fait<repubLot.total?(
                  <span className="lbl">
                    {lang==='fr'?`Mise en file ${repubLot.fait}/${repubLot.total}… (garde cet onglet ouvert)`:`Queuing ${repubLot.fait}/${repubLot.total}… (keep this tab open)`}
                  </span>
                ):(
                  <>
                    <span className="lbl">
                      {lang==='fr'
                        ?<>{repubSel.size} sélectionné{repubSel.size>1?"s":""} · <PepiteAmount value={repubSel.size}/> · ~{repubSel.size*5>=60?`${Math.ceil(repubSel.size*5/60)} h`:`${repubSel.size*5} min`}</>
                        :<>{repubSel.size} selected · <PepiteAmount value={repubSel.size}/> · ~{repubSel.size*5>=60?`${Math.ceil(repubSel.size*5/60)} h`:`${repubSel.size*5} min`}</>}
                    </span>
                    <button className="apply" disabled={repubMaintenance||repubSel.size===0}
                      style={repubMaintenance?{opacity:0.45,cursor:"default"}:undefined}
                      onClick={()=>{if(repubMaintenance)return;ouvrirFeuilleRepublication(repubActionnables.filter(i=>repubSel.has(i.id)));}}>
                      {lang==='fr'?`Republier les ${repubSel.size}`:`Repost ${repubSel.size}`}
                    </button>
                    <button className="pa-ghost" onClick={()=>{setRepubSel(new Set(repubActionnables.map(i=>i.id)));}}>
                      {lang==='fr'?'Tout':'All'}
                    </button>
                    <button className="pa-ghost" onClick={()=>{setRepubSel(new Set());setRepubLot(null);}}>✕</button>
                  </>
                )}
                {repubLot&&repubLot.fait>=repubLot.total&&(
                  <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
                    <span className="pa-hint">
                      {lang==='fr'
                        ?`${repubLot.total-repubLot.refus.length}/${repubLot.total} en file — ça tourne tout seul, Chrome ouvert. Reprise automatique si tu le fermes.`
                        :`${repubLot.total-repubLot.refus.length}/${repubLot.total} queued — runs on its own with Chrome open, resumes if you close it.`}
                    </span>
                    {repubLot.refus.length>0&&(
                      <span className="pa-err">
                        {lang==='fr'?`${repubLot.refus.length} refus : `:`${repubLot.refus.length} refused: `}
                        {repubLot.refus.slice(0,3).map(r=>`${r.titre??''} (${r.raison})`).join(' · ')}{repubLot.refus.length>3?'…':''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {stock.length===0?(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* 1. Bannière — UN SEUL geste (2026-08-09). Le bouton
                    « Importer mon dressing Vinted » qui vivait ici a été
                    supprimé : il ne faisait que remonter la page jusqu'à la
                    carte de sync, affichée à quelques centimètres au-dessus,
                    et donnait à la MÊME action un troisième libellé (importer
                    / synchroniser / actualiser). Un compte vide voit
                    désormais un seul bouton par geste : synchroniser, dans la
                    carte Vinted ; ajouter, ici. */}
                <div style={{background:"#F0FDFB",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(13,148,136,0.15)"}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:"#10201B",lineHeight:1.5,fontFamily:"inherit"}}>
                    {lang==='fr'
                      ?"Ton stock est vide. Ajoute ton premier article en le photographiant."
                      :"Your stock is empty. Add your first item by photographing it."}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:12}}>
                    <button
                      onClick={()=>onAddByPhoto?.()}
                      style={{width:"100%",padding:"13px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:13.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)"}}
                    >
                      {lang==='fr'?"Ajouter un article":"Add an item"}
                    </button>
                  </div>
                </div>

                {/* ── 2. CE QUE FILLSELL FAIT (2026-08-09) ───────────────────
                    Remplace les cinq FAUX articles (« Veste Zara », « Lot
                    Pokémon »…) qui occupaient tout l'écran d'un compte vide.
                    Ils dataient d'un produit qui ne savait que compter des
                    marges : ils montraient « Publier / Vendre » et ne disaient
                    RIEN de la synchro du dressing, du cross-posting ni de la
                    republication — c'est-à-dire de tout ce pour quoi on
                    s'inscrit aujourd'hui. Un stock vide décoré de faux stock
                    n'apprend rien ; le parcours réel, si.
                    Aucun bouton ici, volontairement : les deux seuls gestes de
                    l'écran vivent au-dessus (synchroniser dans la carte
                    Vinted, ajouter dans la bannière). Ce bloc explique, il
                    n'agit pas.
                    ⚠️ Chaque ligne décrit une capacité RÉELLE et ouverte à
                    tous. L'étape 3 parle de la republication à la demande (1
                    Pépite), pas de l'automatique, qui est un avantage Pro : ne
                    pas y glisser une promesse d'automatisation. L'étape 4 dit
                    « te prévient / tu retires » — le retrait est TOUJOURS sur
                    confirmation, jamais automatique. */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap",flexShrink:0}}>
                    {lang==='fr'?"CE QUE FILLSELL FAIT":"WHAT FILLSELL DOES"}
                  </span>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {
                      fr:["Synchronise ton dressing Vinted","Titres, prix, photos, vues et favoris remontent tout seuls dans ton stock."],
                      en:["Sync your Vinted closet","Titles, prices, photos, views and favourites come across on their own."],
                      logos:["vinted"],
                    },
                    {
                      fr:["Publie sur 4 plateformes","Une annonce préparée une fois, envoyée sur Vinted, Leboncoin, eBay et Beebs."],
                      en:["Publish on 4 marketplaces","One listing prepared once, sent to Vinted, Leboncoin, eBay and Beebs."],
                      logos:["vinted","leboncoin","ebay","beebs"],
                    },
                    {
                      fr:["Republie ce qui stagne","Une annonce qui dort est recréée pour remonter en tête, au rythme d'une vraie personne."],
                      en:["Repost what stalls","A listing that sits gets recreated to climb back to the top, at a human pace."],
                      logos:[],
                    },
                    {
                      fr:["Vendu quelque part ?","FillSell le détecte et te prévient — tu retires l'article des autres plateformes en un tap."],
                      en:["Sold somewhere?","FillSell spots it and tells you — you remove the item from the others in one tap."],
                      logos:[],
                    },
                  ].map((et,i)=>{
                    const [titre,texte]=lang==='fr'?et.fr:et.en;
                    return(
                      <div key={i} style={{display:"flex",gap:11,alignItems:"flex-start",background:"#fff",border:"1px solid #E7E3D8",borderRadius:12,padding:"12px 14px"}}>
                        <div style={{flexShrink:0,width:24,height:24,borderRadius:99,background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>
                          {i+1}
                        </div>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#10201B",lineHeight:1.35}}>{titre}</div>
                          <div style={{fontSize:11.5,lineHeight:1.5,color:"#6B7A75",marginTop:3}}>{texte}</div>
                          {et.logos.length>0&&(
                            <div style={{display:"flex",gap:6,marginTop:8}}>
                              {et.logos.map(p=>(
                                <span key={p} style={{display:"inline-flex",borderRadius:6,overflow:"hidden"}}>
                                  <PlatformLogo platform={p} size={20}/>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Mode « à compléter » : liste COMPLÈTE des incomplets (filtres
                    actifs respectés via stockFiltre, pas de plafond de 10). */}
                {/* É5 : estimation de durée quand la file de republication
                    grossit — jamais une promesse que le poll ne tient pas :
                    ~2 gestes espacés de 2 min + attentes 2-5 min ⇒ ~5-7 min
                    par annonce, arrondi large. */}
                {repubVivants>=3&&(
                  <div style={{background:"#EFF3F8",border:"1px solid #C7D6E5",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#334155",fontWeight:600,lineHeight:1.5,marginBottom:8}}>
                    ⏳ {lang==='fr'
                      ?`${repubVivants} republications en file — compte environ ${repubVivants*5>=60?`${Math.ceil(repubVivants*5/60)} h`:`${repubVivants*5}-${repubVivants*7} min`}, au rythme humain. Ça reprend tout seul si tu fermes Chrome.`
                      :`${repubVivants} reposts queued — expect about ${repubVivants*5>=60?`${Math.ceil(repubVivants*5/60)} h`:`${repubVivants*5}-${repubVivants*7} min`}, at a human pace. It resumes on its own if you close Chrome.`}
                  </div>
                )}
                {/* ── Mode republication en lot (fix 2026-08-08) : la liste ne
                    montre QUE les articles republiables, comme le fait déjà le
                    mode prix d'achat juste à côté (stockFiltre.filter). Avant,
                    la liste restait dans son ordre habituel et les articles
                    cochables — souvent les plus anciens, donc tout en bas —
                    n'apparaissaient qu'après un long scroll : écran de
                    sélection « vide » en apparence. Les non-éligibles
                    reviennent dès la sortie du mode. */}
                {modeRepublish&&repubActionnables.length===0&&(
                  <div style={{background:"#F6F5F1",border:"1px solid #E7E3D8",borderRadius:12,padding:"14px 16px",fontSize:12.5,color:"#5C6560",fontWeight:600,lineHeight:1.55,marginBottom:8}}>
                    🔁 {lang==='fr'
                      ?"Aucune annonce republiable pour le moment. Une annonce est republiable quand elle est encore en ligne sur Vinted, sans republication déjà en file, et pas déjà recréée depuis moins de 24 h. Reviens un peu plus tard — ou quitte le mode ci-dessus."
                      :"No listings can be reposted right now. A listing is repostable when it's still live on Vinted, has no repost already queued, and wasn't recreated in the last 24 hours. Check back later — or exit the mode above."}
                  </div>
                )}
                {/* ── GALERIE (2026-08-27) : grille de cartes photo, 2 colonnes
                    sur mobile. Pagination inchangée (slice de 10 + « Voir
                    plus ») et photos en loading="lazy" : les gros comptes
                    (3 000+ articles) ne chargent jamais tout d'un coup. */}
                <div className="ggrid">
                {(modePrixAchat?stockFiltre.filter(paIncomplet):modeRepublish?repubActionnables:listeStock).map(item=>{
                  const {loc:_itemLoc,rest:_itemDesc}=parseLocDesc(item.description);
                  // PIÈGE : `item.buy*qty+(purchaseCosts||0)` rendait NaN sur un
                  // prix d'achat absent et 0 € sur un null — la carte annonçait
                  // « 0 € investi » sur un article dont on ignore le coût.
                  // null ici = « on ne sait pas » ; l'affichage met un tiret.
                  const invested=prixAchatConnu(item)?prixAchatNum(item)*(item.quantite||1)+(item.purchaseCosts||0):null;
                  // Prix DEMANDÉ sur l'annonce Vinted (dernier relevé) — jamais
                  // confondu avec prix_vente, qui reste ce que l'utilisateur
                  // déclare avoir reçu.
                  // Prix de l'annonce EN LIGNE — donc RIEN dès que `disparu_le`
                  // est posé (2026-08-05) : la sync ne retrouve plus l'annonce
                  // sur Vinted, et le dernier prix relevé affirmerait un prix
                  // en ligne sur une annonce qui n'existe plus. Constaté sur
                  // « Hoodie Nike – Kaki » : disparu_le au 04/08, et l'id
                  // Vinted 8428496729 rend bien 404 à la vérification. Depuis
                  // que la pastille est à l'encre, c'est l'information la plus
                  // lue de la rangée — donc le mensonge le plus visible.
                  // Filtré ICI et non au rendu : `prixAnnonce` veut dire « prix
                  // de l'annonce en ligne », et tout ce qui le lit (y compris
                  // la condition d'affichage de la rangée) hérite du bon sens.
                  // ⚠️ Ne concerne QUE la carte Stock : dans la liste des
                  // articles VENDUS, l'annonce a disparu parce qu'elle s'est
                  // vendue, et son dernier prix demandé y est un contexte
                  // légitime de la vente — cette pastille-là n'est pas touchée.
                  const prixAnnonce=item.vinted_item_id&&!item.disparu_le?prixAnnonces[item.vinted_item_id]:null;
                  const jobsAll=jobsByInventaire[item.id]||[];
                  // Défini ICI (avant repubEligible qui le lit — TDZ) ; la
                  // règle et ses raisons vivent sur le bloc logosEnLigne/
                  // enLigne plus bas, et la source unique dans le helper.
                  const vintedMasquee=vintedMasqueeMalgreJobs(item,jobsAll);
                  // Les jobs de retrait ciblé (action='delete') vivent à part :
                  // mélangés aux publish, un delete pending affichait « En
                  // cours… » (dépôt) et un delete failed un badge « Échec » de
                  // publication — deux mensonges.
                  // É5 (2026-08-05) : les jobs republish sortent AUSSI du flux
                  // générique — mêlés aux publish, un republish pending
                  // affichait « En cours… » (dépôt) et son needs_user ouvrait
                  // le mini-éditeur générique, qui re-pend SANS recapturer :
                  // exactement la boucle de péremption qu'on vient de fermer.
                  // Ils ont leur bloc dédié (badge + bouton) plus bas.
                  // ⚠️ 'cancelled' / 'dry_run_completed' sont EXCLUS ici, alors
                  // qu'ils viennent d'entrer dans le select (pour que la
                  // republication la plus récente soit toujours visible). Sans
                  // cette exclusion, un publish 'cancelled' — celui que pose
                  // justement cancelPublishAfterDelete — deviendrait « le job le
                  // plus récent de la plateforme » dans latestByPlatform et
                  // ÉTEINDRAIT un badge Échec ou « À compléter » légitime. Ces
                  // badges doivent continuer de voir exactement ce qu'ils
                  // voyaient avant : publish et delete non terminaux.
                  const jobs=jobsAll.filter(j=>j.action!=="delete"&&j.action!=="republish"
                    &&j.status!=="cancelled"&&j.status!=="dry_run_completed");
                  const repubLatest=(()=>{
                    let r=null;
                    for(const j of jobsAll){
                      if(j.action!=="republish")continue;
                      if(!r||Date.parse(j.created_at||0)>Date.parse(r.created_at||0))r=j;
                    }
                    return r;
                  })();
                  // Masquée/brouillon exclus (2026-08-28) : même règle que
                  // repubEtat ci-dessus — les deux expressions doivent rester
                  // jumelles (même helper, même garde de fraîcheur).
                  const repubEligible=republishActif&&item.vinted_item_id&&!item.disparu_le&&item.statut!=="vendu"
                    &&!vintedMasquee;
                  // Vocabulaire d'étape partagé pastille ↔ feuille (une seule
                  // source : etapeRepublication). null = rien à afficher.
                  // ⚠️ Volontairement décorrélé de repubEligible (2026-08-05) :
                  // l'ÉTAT d'une republication doit rester lisible même quand
                  // l'article n'est plus republiable — un article devenu
                  // 'disparu' juste après sa republication perdait sinon
                  // l'affichage du job qui venait de tourner.
                  const repubEtape=republishActif?etapeRepublication(repubLatest,lang!=='en'):null;
                  // La pastille dit déjà l'état : le message transitoire ne le
                  // répète pas. Il ne reste affiché que quand il apporte autre
                  // chose (refus, échec de relance).
                  const repubNote=repubEligible&&repubMsgs[item.id]&&!repubEtape?repubMsgs[item.id]:null;
                  // ── UN SEUL badge dans ce slot (2026-08-05, décision Nico) ──
                  // La pastille de republication et la pastille de statut
                  // plateforme s'affichaient ENSEMBLE et, à l'arrivée, disaient
                  // le même mot : etapeRepublication rend « En ligne » sur
                  // l'étape 'recreated', collé au « ● En ligne » de
                  // publishedActive. Deux fois la même information, dont une
                  // avec un chevron qui promet un détail sans intérêt.
                  // Règle : tant que la republication n'est pas conclue, c'est
                  // ELLE qui occupe le slot — l'avancement prime sur un statut
                  // qui, pendant la fenêtre suppression→recréation, est de
                  // toute façon faux (publishedActive tombe à [], cf.
                  // plateformesReserveesParRepublication). Dès qu'elle aboutit,
                  // elle s'efface et « ● En ligne » reprend sa place, seul.
                  // Ancrage sur cle==='recreated', PAS sur status : c'est la clé
                  // qui désigne exactement la pastille en doublon, et elle
                  // couvre les DEUX chemins qui la produisent (status
                  // 'published' et step 'recreated'). Tous les autres états —
                  // file, lecture, prête, recréation, à relancer, arrêtée, test
                  // à blanc — gardent le slot : aucun ne dit « En ligne ».
                  // ⚠️ Ne concerne QUE ces deux pastilles. Les logos de
                  // plateforme et le tag « Annonce Vinted · X € » sont rendus
                  // ailleurs dans la rangée et ne bougent pas.
                  const repubOccupeSlot=repubEligible&&!!repubEtape&&repubEtape.cle!=='recreated';
                  // ── Recréation ORPHELINE (07/08, 3d-a validé Nico) ────────
                  // Étape 'deleted' en cours (pending/processing) depuis plus
                  // de 20 min ET heartbeat extension muet depuis plus de
                  // 10 min : l'annonce est hors ligne et RIEN ne la recrée
                  // (extension endormie, session perdue — cas 97757a78,
                  // ~1 h hors ligne sans un signal). La pastille cesse de
                  // « tourner » et dit le vrai geste — jamais « en panne » :
                  // rien n'est cassé, l'ordinateur dort. needs_user/failed à
                  // 'deleted' ont déjà leur rouge (aujourd'hui) — ici on
                  // couvre le cas où l'app croyait que ça avançait.
                  const repubOrpheline=repubEtape?.cle==='deleted'&&(()=>{
                    const d=Date.parse(repubLatest?.platform_fields?.deleted_at??'');
                    const hb=Date.parse(extensionStatus?.lastSeenAt??'');
                    return Number.isFinite(d)&&Date.now()-d>20*60*1000
                      &&(!Number.isFinite(hb)||Date.now()-hb>10*60*1000);
                  })();
                  // "processing" = publication en cours côté extension : même
                  // affichage « En cours… » que pending (pour le vendeur, c'est
                  // le même moment ; la nuance est purement interne).
                  const hasPending=jobs.some(j=>j.status==="pending"||j.status==="processing");
                  // Job en attente sur une plateforme EN PAUSE (maintenance) :
                  // badge dédié « reprise auto » plutôt que le simple « En cours ».
                  const hasPausedPending=jobs.some(j=>(j.status==="pending"||j.status==="processing")&&pausedSet.has(j.platform));
                  // Échec = le job LE PLUS RÉCENT de la plateforme est "failed"
                  // (2026-07-19). Pas « il existe un job failed » : après une
                  // régénération, le nouveau job pending/published de la même
                  // plateforme doit ÉTEINDRE le badge — seul l'état courant
                  // compte. À l'inverse, un échec de REPUBLICATION coexiste
                  // avec la pastille published de l'ancienne annonce toujours
                  // en ligne : les deux sont vrais, les deux s'affichent.
                  const latestByPlatform={};
                  for(const j of jobs){
                    const cur=latestByPlatform[j.platform];
                    if(!cur||Date.parse(j.created_at||0)>Date.parse(cur.created_at||0)) latestByPlatform[j.platform]=j;
                  }
                  const failedJobs=Object.values(latestByPlatform).filter(j=>j.status==="failed");
                  // « À compléter » (socle needs_user, 2026-07-19) : même règle
                  // que l'Échec — seul le job LE PLUS RÉCENT de la plateforme
                  // compte. Dès que le job repart en pending (valeur fournie)
                  // ou se conclut (published/failed), le badge s'éteint.
                  const needsUserJobs=Object.values(latestByPlatform).filter(j=>j.status==="needs_user");
                  // « Publiée — à vérifier » (2026-08-08) : le job a ABOUTI
                  // mais avec un repli dégradant signalé par l'extension
                  // (platform_fields.warnings, ex. brand_fallback_no_brand :
                  // marque introuvable → annonce partie en « Sans marque »).
                  // Même règle que l'Échec : seul le job LE PLUS RÉCENT de la
                  // plateforme compte — une republication propre éteint le
                  // badge (le background efface warnings sur un run sans
                  // réserve).
                  // warningsAffichables (2026-08-10) : le bruit photo ne fait
                  // plus basculer une publication réussie en « à vérifier ».
                  // ⛔ UN SUCCÈS CONFIRMÉ N'ALERTE PLUS (2026-08-10, 3e passe).
                  // `published` + `listing_url` renseignée = l'annonce EXISTE,
                  // on a son adresse, elle est en ligne. C'est un succès, quels
                  // que soient les warnings du run. Vécu sur le job leboncoin
                  // c2c4a35a : annonce 3248104608 validée et en ligne, mail de
                  // confirmation Leboncoin reçu, et la carte affichait quand
                  // même un badge ambre pour « marque: champ sauté — option
                  // "Tommy Jeans" sans correspondance. Options: [] ». Une liste
                  // d'options VIDE : il n'y avait rien à corriger, ni dans
                  // l'app ni sur Leboncoin. Une alerte sans geste possible
                  // n'est pas une alerte, c'est du bruit — et le bruit finit
                  // par faire ignorer les vraies.
                  // Ce qui NE change pas : un `published` SANS lien porteur de
                  // warnings garde son badge ambre (on ne sait pas où est
                  // l'annonce), les `dry_run_completed` aussi (aucune annonce
                  // réelle), et les warnings restent écrits en base + rendus
                  // par la modale (mode réserve, plus bas) — on rétrograde
                  // l'alerte, on ne perd pas l'information.
                  const succesConfirme=j=>j.status==="published"&&!!j.listing_url;
                  const warnedJobs=Object.values(latestByPlatform).filter(j=>
                    (j.status==="published"||j.status==="dry_run_completed")
                    &&!succesConfirme(j)
                    &&warningsAffichables(j).length>0);
                  // ── Lien pas encore capturé (2026-08-10) ──────────────────
                  // Deux états DISTINCTS, et c'est tout l'objet du correctif :
                  // tant que la re-capture tourne, on informe (ton neutre) ;
                  // une fois la fenêtre close sans lien, on alerte. Un job déjà
                  // porteur d'un vrai warning garde son badge « à vérifier » et
                  // ne prend pas de second badge — une seule chose dite à la
                  // fois sur une carte.
                  // ⛔ PLUS DE BADGE « à vérifier » POUR UN LIEN MANQUANT
                  // (2026-08-10) : le cron publish-sans-lien-echec-daily bascule
                  // désormais ces jobs en `failed` au bout de la fenêtre, avec
                  // remboursement. Le badge « Échec » existant dit donc la
                  // vérité tout seul — en ajouter un second ici, c'était deux
                  // affichages concurrents pour le même état.
                  const sansWarn=j=>!warnedJobs.includes(j);
                  const lienEnCoursJobs=Object.values(latestByPlatform)
                    .filter(j=>etatLienJob(j)==="en_cours"&&sansWarn(j));
                  // Sonde de modération Leboncoin (2026-08-11) : Pépite déjà
                  // rendue, annonce toujours cherchée. Badge DISTINCT du gris
                  // « récupération en cours » — ici il y a quelque chose à
                  // faire (aller vérifier avant de republier), donc il est
                  // cliquable et de la couleur d'un avertissement.
                  const lienRembourseJobs=Object.values(latestByPlatform)
                    .filter(j=>etatLienJob(j)==="rembourse"&&sansWarn(j));
                  // État de retrait par plateforme : calcul partagé avec le
                  // modal de retrait (computeRemovalInfo, en tête de fichier) —
                  // un seul calcul, jamais deux vérités carte/modal.
                  const {removalState,publishedActive}=computeRemovalInfo(jobsAll);
                  // ── Article DISPARU de Vinted (2026-08-05) ────────────────
                  // `disparu_le` = la sync du dressing n'a pas retrouvé
                  // l'annonce sur Vinted (vérifié en réel : l'id Vinted rend
                  // 404). L'annonce n'existe plus, donc la carte ne montre NI
                  // logo Vinted NI « En ligne » — seulement la pastille ambre
                  // qui le dit. Une seule chose affichée, et elle est vraie.
                  // Surgical : seul Vinted sort. Un article aussi publié sur
                  // eBay ou LBC garde ces logos-là, qui restent exacts.
                  const disparuDeVinted=!!item.disparu_le;
                  // Vinted sort de la liste des plateformes en ligne — pour
                  // l'AFFICHAGE **et** pour le bouton (2026-08-05). La carte et
                  // le compteur ne peuvent pas se contredire : afficher « Plus
                  // en ligne » pendant que le bouton dit « En ligne (4/4) »,
                  // c'est reproduire à l'échelle du bouton le mensonge qu'on
                  // vient de retirer de la rangée.
                  // CONSÉQUENCE VOULUE : « Publier » redevient disponible pour
                  // Vinted. C'est le comportement juste — pour un article
                  // disparu, publier est le SEUL chemin de retour en ligne, la
                  // republication lui étant fermée (repubEligible exige
                  // !disparu_le). Ne tient que parce que disparu_le est
                  // désormais fiable : marquage sauté sur un run repris ou un
                  // relevé incomplet (gardes de syncDressing, background.js).
                  // ── GEL DE CARTE pendant un cycle (2026-08-07, validé Nico) ─
                  // La réservation de republication sort Vinted de
                  // publishedActive pendant la fenêtre suppression→recréation :
                  // avant, le logo DISPARAISSAIT, le compteur du bouton
                  // changeait, la carte respirait — le « changement d'aspect
                  // muet » remonté par ornellaracano. Désormais la carte ne
                  // perd RIEN : le logo Vinted reste, GRISÉ (opacité + titre
                  // dédié, clic → feuille d'avancement au lieu du modal de
                  // retrait), le compteur reste stable, seule la pastille du
                  // slot anime. Affichage pur : publishedActive lui-même ne
                  // change pas, les gardes métier restent intactes.
                  const vintedGeleParRepub=repubOccupeSlot&&!!item.vinted_item_id&&!publishedActive.includes("vinted");
                  const logosEnLigne=disparuDeVinted
                    ?publishedActive.filter(p=>p!=="vinted")
                    :(vintedGeleParRepub?[...publishedActive,"vinted"]:publishedActive);
                  // ── vinted_status PRIME sur les jobs (2026-08-28, complément
                  // Nico) : masquée/brouillon malgré un job 'published' (44 cas
                  // au relevé) ⇒ la pastille verte ne compte plus Vinted, le
                  // LOGO reste mais GRISÉ (l'annonce EXISTE — masquée n'est pas
                  // disparue — et le tap → modal de retrait doit rester
                  // possible). Garde-fou de fraîcheur dans le helper : un job
                  // 'published' postérieur au relevé l'emporte. nbEnLigne et le
                  // bouton « En ligne (N/4) » restent sur logosEnLigne : la
                  // plateforme est occupée par une annonce EXISTANTE — la
                  // rouvrir à « Publier » créerait un doublon.
                  const enLigne=logosEnLigne.some(p=>!(p==="vinted"&&vintedMasquee));
                  // Compteur de plateformes réellement en ligne : pilote le 3e état
                  // du bouton (4/4 = plus rien à publier).
                  const nbEnLigne=logosEnLigne.length;
                  const toutEnLigne=nbEnLigne>=RM_PLATFORMS.length;
                  // _table:'inventaire' — cible d'écriture explicite de la modale
                  // d'édition (les ids ventes/inventaire se chevauchent).
                  const openEdit=()=>setEditItem({...item,_table:'inventaire',frais:(item.statut==='vendu'?item.sellingFees:item.purchaseCosts)??0,sell:item.sell??""});
                  const photoUrl=premierePhoto(item.photos);
                  const vues=item.vinted_view_count;
                  const favs=item.vinted_favourite_count;
                  return(
                    // ── Carte GALERIE (2026-08-27, refonte validée Nico) ─────
                    // Hiérarchie : 1. statut (pastille sur la photo), 2. logos
                    // de plateformes (sur la photo), 3. prix + vues/favoris,
                    // 4. titre (2 lignes max). Tap sur la carte = éditer — Y
                    // COMPRIS pendant un job : la carte reste consultable, la
                    // pastille (cliquable) porte l'avancement. Le
                    // swipe-supprimer de l'ancienne liste devient le « ✕ » du
                    // coin photo — même chemin delItem (plan + confirmation),
                    // jamais une suppression sèche.
                    <div key={item.id} className="gcard" role="button" tabIndex={0} onClick={openEdit}
                      onKeyDown={e=>{if(e.key==='Enter'){openEdit();}}}>
                      <div className="gphoto">
                        <GalleryPhoto url={photoUrl} alt={item.title}
                          fallback={<div className={`cat-tile ${catClass(item.type)}`}>{detectObjectIcon(item.title,item.description,item.type)}</div>}/>
                        {/* 1. STATUT — UNE pastille, la plus urgente d'abord :
                            republication en cours > en pause > dépôt en cours >
                            échec > à compléter > plus en ligne > en ligne. Les
                            détails par plateforme restent dans les badges du
                            corps de carte ; ici, le coup d'œil. */}
                        {(()=>{
                          const fr=lang==='fr';
                          let dot=null,pulse=false,txt=null,onTap=null,fg="#10201B",titre=null;
                          if(repubOccupeSlot){
                            pulse=!repubEtape.fini&&!repubOrpheline;
                            dot=repubOrpheline?"#B91C1C":(repubEtape.encre||"#E8956D");
                            fg=repubOrpheline?"#B91C1C":(repubEtape.encre||"#10201B");
                            txt=repubOrpheline?(fr?'Ouvre Chrome':'Open Chrome'):repubEtape.court;
                            titre=repubOrpheline
                              ?(fr?"Ton ordinateur ne répond plus — ouvre Chrome pour terminer la recréation. Ton annonce et tes photos sont en sécurité.":"Your computer isn't responding — open Chrome to finish the recreation. Your listing and photos are safe.")
                              :(fr?'Voir où en est la republication':'See repost progress');
                            onTap=()=>setRepubProgress(repubLatest);
                          }else if(hasPausedPending){
                            dot="#64748B";txt=fr?'En pause':'Paused';titre=t("stockJobPausedBadge");
                          }else if(hasPending){
                            // Mêmes règles que l'ancien badge « En cours… »
                            // (2026-08-13) : extension hors fraîcheur → on
                            // nomme le vrai état, jamais un travail inventé.
                            const horsFraicheur=extFraicheur.etat==="eteinte"||extFraicheur.etat==="inactive";
                            const plusVieux=Math.min(...jobs
                              .filter(j=>j.status==="pending"||j.status==="processing")
                              .map(j=>Date.parse(j.created_at))
                              .filter(Number.isFinite));
                            const joursAttente=Number.isFinite(plusVieux)?Math.floor((Date.now()-plusVieux)/86400000):0;
                            const attenteLongue=horsFraicheur&&joursAttente>=1;
                            pulse=!horsFraicheur;dot="#E8956D";
                            txt=!horsFraicheur
                              ?(fr?'En cours…':'Posting…')
                              :attenteLongue?(fr?`En attente ${joursAttente} j`:`Waiting ${joursAttente} d`)
                              :(fr?'En attente':'Waiting');
                            titre=!horsFraicheur
                              ?(fr?'Voir le statut':'See status')
                              :attenteLongue
                                ?(fr?`En attente depuis ${joursAttente} jour${joursAttente>1?"s":""}. Ouvre Chrome sur l'ordinateur où tu as installé l'extension.`:`Waiting for ${joursAttente} day${joursAttente>1?"s":""}. Open Chrome on the computer where you installed the extension.`)
                                :(fr?"En attente de ton ordinateur — démarrage à la prochaine ouverture de Chrome.":"Waiting for your computer — it starts next time Chrome opens.");
                            onTap=()=>setJobStatusItem(item);
                          }else if(failedJobs.length>0){
                            // La plateforme MONTE dans la pastille (2026-08-27) :
                            // l'ancien badge « ⚠️ Échec <plateforme> » du corps
                            // de carte disait la même chose deux fois — retiré.
                            // Plusieurs plateformes concernées (échecs + à
                            // compléter) → compte lisible, et le tap ouvre la
                            // modale de statut (détail + erreur humanisée PAR
                            // plateforme, failed inclus depuis ce jour) : aucun
                            // accès perdu. Une seule → même modale d'échec
                            // qu'avant, à l'identique.
                            dot="#B91C1C";fg="#B91C1C";
                            const j=failedJobs[0];
                            const actionables=failedJobs.length+needsUserJobs.length;
                            txt=actionables>1
                              ?(fr?`Échec · ${actionables} plateformes`:`Failed · ${actionables} platforms`)
                              :(fr?`Échec ${PLATFORM_LABELS[j.platform]||j.platform}`:`Failed ${PLATFORM_LABELS[j.platform]||j.platform}`);
                            titre=actionables>1
                              ?(fr?'Voir le détail par plateforme':'See details per platform')
                              :(j.error?humanizeJobError(j,lang):undefined);
                            onTap=actionables>1
                              ?()=>setJobStatusItem(item)
                              :(j.error?()=>setFailJobModal(j):null);
                          }else if(needsUserJobs.length>0){
                            // Même traitement que l'échec : plateforme nommée,
                            // badge du bas (doublon) retiré, multi → modale de
                            // statut.
                            dot="#E8956D";fg="#8A6100";
                            const j=needsUserJobs[0];
                            txt=needsUserJobs.length>1
                              ?(fr?`✋ À compléter · ${needsUserJobs.length}`:`✋ Needed · ${needsUserJobs.length}`)
                              :(fr?`✋ À compléter ${PLATFORM_LABELS[j.platform]||j.platform}`:`✋ ${PLATFORM_LABELS[j.platform]||j.platform}`);
                            titre=j.error?humanizeJobError(j,lang):undefined;
                            onTap=needsUserJobs.length>1
                              ?()=>setJobStatusItem(item)
                              :()=>{if(j.platform_fields?.needsUserField)setNeedsUserJob(j);else if(j.error)setFailJobModal(j);};
                          }else if(disparuDeVinted){
                            dot="#8A8578";fg="#8A6100";
                            txt=(fr?'Plus en ligne':'Gone')+(dateCourteParis(item.disparu_le)?` · ${dateCourteParis(item.disparu_le)}`:'');
                            titre=fr?"L'annonce Vinted n'a pas été retrouvée lors de la dernière synchronisation de ton dressing.":'This Vinted listing was not found during the last wardrobe sync.';
                          }else if(vintedMasquee&&!enLigne){
                            // vinted_status prime sur les jobs (28/08) : jamais
                            // « En ligne » sur une masquée/brouillon. La date =
                            // celle du RELEVÉ (last_synced_at), pas un état
                            // affirmé aujourd'hui.
                            dot="#E8B54D";fg="#8A6100";
                            const vuLe=dateCourteParis(item.last_synced_at);
                            txt=(item.vinted_status==='draft'
                              ?(fr?'Brouillon':'Draft')
                              :(fr?'Masquée':'Hidden'))+(vuLe?` · ${vuLe}`:'');
                            titre=fr
                              ?"Statut relevé sur Vinted lors de la dernière synchronisation du dressing — resynchronise si ce n'est plus le cas."
                              :"Status read from Vinted at the last wardrobe sync — sync again if this has changed.";
                          }else if(enLigne){
                            dot="#2F9E90";fg="#1B6E62";txt=fr?'En ligne':'Live';
                          }
                          if(!txt)return null;
                          return(
                            <div className="gstatus" style={{color:fg,cursor:onTap?"pointer":"default"}} title={titre}
                              role={onTap?"button":undefined} tabIndex={onTap?0:undefined}
                              onClick={e=>{e.stopPropagation();if(onTap)onTap();}}
                              onKeyDown={onTap?e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation();onTap();}}:undefined}>
                              <span className={`gdot${pulse?' pulsing':''}`} style={{background:dot}}/>
                              {txt}
                            </div>
                          );
                        })()}
                        <button className="gdel"
                          title={lang==='fr'?'Supprimer cet article':'Delete this item'}
                          aria-label={lang==='fr'?'Supprimer cet article':'Delete this item'}
                          onClick={e=>{e.stopPropagation();delItem(item.id);}}>✕</button>
                        {/* 2. PLATEFORMES en ligne — mêmes gestes que la liste :
                            tap logo → modal de retrait ; logo gelé pendant une
                            republication → feuille d'avancement. */}
                        {logosEnLigne.length>0&&(
                          <div className="glogos">
                            {logosEnLigne.map(p=>{
                              const removing=removalState[p]==="removing";
                              const gele=vintedGeleParRepub&&p==="vinted";
                              if(gele)return(
                                <span key={p} className="plogo"
                                  title={lang==="en"?"Repost in progress — the listing comes back in a few minutes":"Republication en cours — l'annonce revient dans quelques minutes"}
                                  style={{cursor:"pointer",opacity:.45}}
                                  onClick={e=>{e.stopPropagation();setRepubProgress(repubLatest);}}>
                                  <PlatformLogo platform={p} size={20}/>
                                </span>
                              );
                              // Masquée/brouillon : logo CONSERVÉ mais grisé —
                              // l'annonce existe (masquée ≠ disparue) et le tap
                              // vers le modal de retrait reste le bon geste.
                              const masque=vintedMasquee&&p==="vinted";
                              return(
                                <span key={p} className="plogo"
                                  title={removing?(lang==="en"?`Removing from ${PLATFORM_LABELS[p]||p}…`:`Retrait de ${PLATFORM_LABELS[p]||p} en cours…`)
                                    :masque?(lang==="en"
                                      ?`${item.vinted_status==='draft'?'Draft':'Hidden'} on Vinted — the listing exists but buyers can't see it. Tap to manage.`
                                      :`${item.vinted_status==='draft'?'Brouillon':'Masquée'} sur Vinted — l'annonce existe mais les acheteurs ne la voient pas. Toucher pour gérer.`)
                                    :(lang==="en"?`${PLATFORM_LABELS[p]||p} — tap to manage`:`${PLATFORM_LABELS[p]||p} — toucher pour gérer`)}
                                  style={{cursor:"pointer",...(removing?{opacity:.35}:masque?{opacity:.45}:{})}}
                                  onClick={e=>{e.stopPropagation();setRemoveModalItem(item);}}>
                                  <PlatformLogo platform={p} size={20}/>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {(item.quantite||1)>1&&<div className="gqty">×{item.quantite}</div>}
                      </div>
                      <div className="gbody">
                        {/* 3. PRIX DE VENTE en évidence (ajout 2026-08-27) —
                            le chiffre que le revendeur cherche en premier :
                            prix de l'annonce Vinted EN LIGNE si relevé, sinon
                            inventaire.prix_vente (item.sell, strictement > 0 :
                            un 0 n'est pas un prix demandé, c'est une absence).
                            L'investi passe SOUS le prix, plus discret, avec
                            son libellé — jamais deux nombres nus côte à côte.
                            VIDE ≠ ZÉRO partout : prix de vente absent →
                            investi seul comme avant ; prix d'achat inconnu →
                            prix de vente seul, pas de tiret. Vues/favoris
                            Vinted inchangés (affichés quand ils EXISTENT,
                            jamais un faux zéro). */}
                        {/* RANGÉES CONDITIONNELLES (3e passe du 27/08) : une
                            rangée absente ne réserve AUCUNE place — les zones
                            fixes de la 2e passe s'empilaient en trou massif
                            sur une carte dépouillée (cas « Jean » : ni prix
                            de vente, ni vues, ni pastille → 4 rangées de vide
                            entre la marque et les boutons). La hauteur
                            commune vient de la GRILLE (étirement à la plus
                            haute) et le vide résiduel tombe à UN seul
                            endroit : juste au-dessus des boutons
                            (margin-top:auto de .gactions). VIDE ≠ ZÉRO
                            inchangé : jamais un 0 à la place d'un prix
                            absent. */}
                        {(()=>{
                          const sellNum=Number(item.sell);
                          const prixVente=prixAnnonce!=null?prixAnnonce:(Number.isFinite(sellNum)&&sellNum>0?sellNum:null);
                          return(
                            <>
                              {(prixVente!=null||invested!==null)&&(
                              <div className="gpricerow">
                                {prixVente!=null?(
                                  <>
                                    <span className="gprice" title={prixAnnonce!=null
                                      ?(lang==='fr'?"Prix affiché sur l'annonce Vinted — pas un prix de vente réalisé":"Asking price on the Vinted listing — not a realized sale price")
                                      :(lang==='fr'?"Prix de vente renseigné sur la fiche de l'article — pas un prix de vente réalisé":"Asking price set on the item — not a realized sale price")}>{fmt(prixVente)}</span>
                                    <span className="gpricelbl">{prixAnnonce!=null?'Vinted':(lang==='fr'?'en vente':'asking')}</span>
                                  </>
                                ):(
                                  <>
                                    <span className="gprice">{fmt(invested)}</span>
                                    <span className="gpricelbl">{lang==='fr'?'investi':'invested'}</span>
                                  </>
                                )}
                              </div>
                              )}
                              {prixVente!=null&&invested!==null&&(
                                <div className="ginvline"
                                  title={lang==='fr'?"Prix d'achat de l'article (frais inclus)":"Purchase cost of the item (fees included)"}>
                                  {lang==='fr'?'investi':'invested'} {fmt(invested)}
                                </div>
                              )}
                              {(vues!=null||favs!=null)&&(
                                <div className="gstatsrow"
                                  title={lang==='fr'?'Vues et favoris sur Vinted':'Views and favourites on Vinted'}>
                                  {vues!=null&&<span>👁️ {vues}</span>}
                                  {favs!=null&&<span>❤️ {favs}</span>}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {/* 4. TITRE — 2 lignes max (CSS), puis la marque
                            (toujours visible, décision Nico 2026-08-05). */}
                        <div className="gtitle">{item.title}</div>
                        {(()=>{
                          const mq=marqueLabel(item.marque,lang);
                          return mq?<div className="gbrand">{mq}</div>:null;
                        })()}
                          {/* ── Prix d'achat manquant : saisie DANS la ligne ──
                              stopPropagation obligatoire : la carte entière
                              ouvre l'édition au clic. Le « je ne sais plus »
                              éteint l'invitation sans jamais écrire 0. */}
                          {/* ⚠️ BUG FERMÉ (07/08 soir, iPhone 2.4.2) : cette
                              ligne ne s'ouvrait QUE sur paIncomplet — la case
                              de republication, née dedans (3b2c576), était
                              donc INVISIBLE sur tout article AYANT un prix
                              d'achat, alors que le compteur du bandeau
                              (repubActionnables) comptait sur repubEtat seul.
                              7 « articles possibles », zéro case. Le bug
                              n'avait jamais paru : les comptes testeurs
                              n'avaient que des articles importés (sans prix
                              d'achat). La ligne s'ouvre désormais AUSSI pour
                              la republication en lot ; les morceaux propres
                              au prix d'achat restent gatés sur paIncomplet. */}
                          {(paIncomplet(item)||(modeRepublish&&repubEtat(item)==="ok"))&&(
                            <div className="pa-line" onClick={e=>e.stopPropagation()}>
                              {modePrixAchat&&paIncomplet(item)&&(
                                <input type="checkbox" className="pa-check" checked={paSel.has(item.id)}
                                  onChange={()=>setPaSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                                  aria-label={lang==='fr'?"Sélectionner cet article":"Select this item"}/>
                              )}
                              {/* É5.2 : case de republication — seulement sur
                                  les articles ACTIONNABLES (bornes = pas de
                                  case). Libellé cliquable quand la case est
                                  SEULE sur la ligne (article au prix déjà
                                  renseigné) : une case nue de 17 px, sans un
                                  mot, ne se comprend ni ne se vise à 390 px. */}
                              {modeRepublish&&repubEtat(item)==="ok"&&(
                                <label style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={e=>e.stopPropagation()}>
                                  <input type="checkbox" className="pa-check" checked={repubSel.has(item.id)}
                                    onChange={()=>setRepubSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                                    aria-label={lang==='fr'?"Republier cet article":"Repost this item"}/>
                                  {!paIncomplet(item)&&(
                                    <span style={{fontSize:11.5,fontWeight:700,color:"#1B6E62"}}>
                                      {lang==='fr'?"Republier":"Repost"}
                                    </span>
                                  )}
                                </label>
                              )}
                              {paIncomplet(item)&&(paOpenId===item.id?(
                                <>
                                  <input className="pa-input" autoFocus inputMode="decimal" value={paDraft}
                                    placeholder={lang==='fr'?"12,50":"12.50"}
                                    onChange={e=>setPaDraft(e.target.value)}
                                    onKeyDown={e=>{
                                      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setPaOpenId(null);setPaDraft("");setPaErr(null);}
                                      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();validerPaStock(item);}
                                    }}
                                    aria-label={lang==='fr'?"Prix d'achat":"Purchase price"}/>
                                  <button className="pa-ok" onMouseDown={e=>e.preventDefault()} onClick={()=>validerPaStock(item)}>✓</button>
                                  <button className="pa-ghost" onClick={()=>{setPaOpenId(null);setPaDraft("");marquerInconnuStock([item.id]);}}>
                                    {lang==='fr'?"je ne sais plus":"I don't remember"}
                                  </button>
                                </>
                              ):(
                                <button className="pa-chip" onClick={()=>{setPaOpenId(item.id);setPaDraft("");setPaErr(null);}}>
                                  + {lang==='fr'?"prix d'achat":"purchase price"}
                                </button>
                              ))}
                              {paErr?.id===item.id&&<span className="pa-err">{paErr.message}</span>}
                            </div>
                          )}
                          {/* ── LOTS : dire ce que « Publier » fait vraiment (2026-07-22) ──
                              Un clic « Publier » sur un article à quantite > 1 ne met en
                              ligne QU'UNE unité : la RPC spend_coins_and_publish ne lit
                              jamais `quantite` et cross_post_jobs n'a aucune colonne de
                              quantité — une annonce = une pièce. Rien ne le disait, donc
                              publier un lot de 10 donnait l'impression d'avoir tout mis en
                              vente alors que 9 unités restaient en stock, sans compteur ni
                              rappel. Cette ligne rend le comportement réel visible.
                              ⚠️ AFFICHAGE SEUL — c'est le point ⑥ du plan « lots », livré
                              isolément. La gestion complète (décrément atomique à la vente,
                              ligne d'historique par unité vendue, republication manuelle de
                              l'unité suivante) touche sale-orchestration.ts et arrive APRÈS
                              la soumission : trop sensible pour la fenêtre actuelle.
                              Aucun lot n'ayant jamais été publié (41 lots, 0 job), personne
                              ne perd une fonction dont il se sert. */}
                          {(item.quantite||1)>1&&(
                            <div className="meta" style={{color:"#8A6100"}}>
                              {lang==='fr'
                                ? `Publier met 1 unité en ligne · ${(item.quantite||1)-1} restent en stock`
                                : `Publishing lists 1 unit · ${(item.quantite||1)-1} stay in stock`}
                            </div>
                          )}
                          {/* Badges SECONDAIRES seulement (2026-08-27, galerie) :
                              le statut principal (En ligne / En cours / Échec /
                              Plus en ligne / republication) vit en PASTILLE sur
                              la photo, les logos de plateformes sur la photo
                              aussi, et le prix d'annonce dans la rangée de
                              prix. Restent ici les états qui portent un détail
                              ou un geste PAR PLATEFORME.
                              ⚠️ Les badges « Échec <pf> » et « À compléter
                              <pf> » ont été RETIRÉS (2026-08-27 soir) : ils
                              répétaient la pastille de la photo, qui nomme
                              désormais la plateforme et route vers les mêmes
                              modales (multi-plateformes → JobStatusModal,
                              failed inclus). Ne pas les réintroduire ici.
                              Rangée rendue SEULEMENT quand elle a du contenu
                              (3e passe 27/08 : plus aucun bloc fantôme) ; une
                              ligne fixe, défilement horizontal si ça déborde. */}
                          {(warnedJobs.length>0||lienEnCoursJobs.length>0||lienRembourseJobs.length>0||item.emplacement||(item.vinted_item_id&&!disparuDeVinted))&&(
                            <div className="icons">
                              {/* Publiée avec réserve / lien en cours / Pépites
                                  rendues : PAS des doublons — la pastille dit
                                  « En ligne » (ou rien), le détail n'existe
                                  qu'ici. Conservés. */}
                              {/* Publiée AVEC RÉSERVE : même patron que l'Échec
                                  (badge + title + tap → modale) mais AMBRE —
                                  l'annonce est en ligne, quelque chose est à
                                  vérifier, ce n'est pas un échec. La modale
                                  (failJobModal) bascule d'elle-même en mode
                                  réserve sur un job published à warnings. */}
                              {warnedJobs.map(j=>{
                                // Beebs sans lien (2026-08-13, vérifié en réel) :
                                // « Publiée » serait un mensonge — pas de lien =
                                // pas en ligne, l'annonce est en VÉRIFICATION
                                // côté Beebs (l'onglet « En cours de
                                // vérification » de Beebs n'expose aucun lien,
                                // la re-capture ne peut rien voir tant que la
                                // modération n'a pas relâché l'annonce). Le
                                // badge reste ambre et cliquable : les réserves
                                // du dépôt restent à lire.
                                const beebsEnVerif=j.platform==="beebs"&&!j.listing_url;
                                const label=beebsEnVerif
                                  ?(lang==="en"?"Submitted — Beebs is reviewing it":"Déposée — vérification Beebs en cours")
                                  :(lang==="en"?`Published — check it ${PLATFORM_LABELS[j.platform]||j.platform}`:`Publiée — à vérifier ${PLATFORM_LABELS[j.platform]||j.platform}`);
                                const titre=beebsEnVerif
                                  ?((lang==="en"
                                      ?"The listing was submitted to Beebs, which reviews it before putting it online. The link will appear once it goes live; if it never does, the job will fail and the Nugget will be refunded.\n\n"
                                      :"L'annonce a bien été déposée sur Beebs, qui la vérifie avant sa mise en ligne. Le lien apparaîtra dès qu'elle sera en ligne ; si elle ne l'est jamais, le job passera en échec et la Pépite sera rendue.\n\n")
                                    +(jobWarningsTexte(j)||""))
                                  :(jobWarningsTexte(j)||undefined);
                                return (
                                  <div
                                    key={"warn-"+j.platform}
                                    className="micon"
                                    title={titre}
                                    onClick={e=>{e.stopPropagation();setFailJobModal(j);}}
                                    style={{background:"#FFF6E3",border:"1px solid #EED9A6",color:"#8A6100",cursor:"pointer"}}
                                  >
                                    ⚠️ {label}
                                  </div>
                                );
                              })}
                              {/* Lien en cours de récupération : INFORMATIF,
                                  jamais un avertissement. LBC/eBay : l'annonce
                                  est en ligne, il ne manque que son lien, et
                                  l'extension le cherche encore. Beebs : le
                                  dépôt est confirmé mais l'annonce est en
                                  VÉRIFICATION (pas en ligne) — texte dédié
                                  dans le map. Pas de clic : il n'y a rien à
                                  faire, et ouvrir une modale pour dire
                                  « patiente » serait une fausse action. */}
                              {lienEnCoursJobs.map(j=>{
                                // Beebs (2026-08-13, vérifié en réel) : pas de
                                // lien = pas en ligne. Le dépôt est confirmé
                                // mais l'annonce est en VÉRIFICATION côté
                                // Beebs — dire « en ligne » ici était faux.
                                // Les autres plateformes gardent leur texte :
                                // chez elles l'annonce est bien en ligne, seul
                                // le lien manque encore.
                                const beebs=j.platform==="beebs";
                                return (
                                  <div
                                    key={"lien-"+j.platform}
                                    className="micon"
                                    title={beebs
                                      ?(lang==="en"
                                        ?"The listing was submitted to Beebs, which reviews it before putting it online. The link will appear once it goes live; if it never does, the job will fail and the Nugget will be refunded."
                                        :"L'annonce a bien été déposée sur Beebs, qui la vérifie avant sa mise en ligne. Le lien apparaîtra dès qu'elle sera en ligne ; si elle ne l'est jamais, le job passera en échec et la Pépite sera rendue.")
                                      :(lang==="en"
                                        ?"The listing is online. We're still fetching its link from the marketplace."
                                        :"L'annonce est en ligne. On récupère encore son lien sur la plateforme.")}
                                    style={{background:"#F1F5F4",border:"1px solid #DCE4E2",color:"#5A6B66"}}
                                  >
                                    {beebs
                                      ?(lang==="en"?"Submitted — Beebs is reviewing it":"Déposée — vérification Beebs en cours")
                                      :(lang==="en"?`Published — fetching the link ${PLATFORM_LABELS[j.platform]||j.platform}`:`Publiée — récupération du lien en cours ${PLATFORM_LABELS[j.platform]||j.platform}`)}
                                  </div>
                                );
                              })}
                              {/* Sonde de modération Leboncoin : Pépites déjà
                                  rendues. Le texte ne dit JAMAIS « refusée » —
                                  la sonde conclut sur une ABSENCE, pas sur un
                                  refus observé. Il nomme la cause la plus
                                  probable, et impose la vérification avant
                                  republication : sans elle, un utilisateur qui
                                  republie sur une annonce finalement acceptée
                                  crée un doublon. */}
                              {lienRembourseJobs.map(j=>{
                                const nom=PLATFORM_LABELS[j.platform]||j.platform;
                                const url=PLATFORM_LISTINGS_URLS[j.platform];
                                return (
                                  <div
                                    key={"rembourse-"+j.platform}
                                    className="micon"
                                    onClick={url?()=>window.open(url,'_blank','noopener'):undefined}
                                    title={lang==="en"
                                      ?`We can't find your listing on ${nom}. The platform bans the sale of cosmetics and fragrances, which is the most likely cause. Your Nuggets have been refunded. Check your ${nom} listings before reposting, to avoid a duplicate.`
                                      :`On ne retrouve pas ton annonce sur ${nom}. La plateforme interdit la vente de cosmétiques et parfums, c'est la cause la plus probable. Tes Pépites t'ont été rendues. Vérifie tes annonces ${nom} avant de republier, pour éviter un doublon.`}
                                    style={{background:"#FFF6E3",border:"1px solid #EED9A6",color:"#8A6100",cursor:url?"pointer":"default"}}
                                  >
                                    ⚠️ {lang==="en"?`Listing not found — Nuggets refunded`:`Annonce introuvable — Pépites rendues`} {nom}
                                  </div>
                                );
                              })}
                              {/* ⛔ NE PAS réintroduire un repli « 🏪 <plateforme> »
                                  quand !enLigne (retiré le 2026-08-05, décision
                                  de Nico). Il affichait le champ LIBRE
                                  item.plateforme (d'où « vinted » en minuscules)
                                  et affirmait une présence sur la plateforme
                                  alors que, justement, aucune annonce n'y est en
                                  ligne. Pas d'annonce en ligne = pas de logo, et
                                  rien à la place. */}
                              {/* (Le prix de l'annonce Vinted a quitté cette
                                  rangée le 2026-08-27 : il vit dans la rangée
                                  de prix de la carte, en tête de corps.) */}
                              {item.emplacement&&<div className="micon ic-loc">📦 {item.emplacement}</div>}
                              {/* ── Ancienneté (2026-08-07, resserrée le soir même) ──
                                  UNE seule puce : « en ligne depuis X j » —
                                  l'information qui motive la republication.
                                  La puce « republié il y a X j » a été
                                  SUPPRIMÉE : redondante par construction, la
                                  recréation écrit listed_at_guess (vérifié en
                                  base par Nico : Robe TRF = l'heure exacte de
                                  sa recréation) — après republication, « en
                                  ligne depuis 0 j » dit déjà la même chose,
                                  et le cooldown du bouton couvre les 24 h.
                                  Masquée quand elle n'apporte rien ou MENT :
                                  date NULL (plus de « depuis — », le
                                  comblement patchLeger vide ce cas), et
                                  arrêt APRÈS suppression (pastille rouge :
                                  l'annonce est RETIRÉE, « en ligne depuis »
                                  serait un mensonge). */}
                              {item.vinted_item_id&&!disparuDeVinted&&!repubEtape?.apresSuppression&&(()=>{
                                // ── Masquée / Brouillon (2026-08-28, décision Nico) ──
                                // vinted_status 'hidden'/'draft' → l'article n'est
                                // JAMAIS présenté comme en ligne : cette pastille
                                // remplace « en ligne depuis X j ». Elle porte la
                                // DATE DU RELEVÉ (last_synced_at, dernier run de
                                // sync qui a vu l'article) : le statut peut avoir
                                // changé depuis, on n'affirme pas un état actuel.
                                // Affichage seul — la donnée n'est jamais touchée,
                                // les masquées avec photos ne sont JAMAIS supprimées.
                                if(vintedMasquee){
                                  // Même règle de fraîcheur que la pastille et
                                  // les logos (vintedMasqueeMalgreJobs) : un
                                  // job 'published' plus récent que le relevé
                                  // rend la puce « en ligne depuis » ci-dessous.
                                  // Pas de doublon : quand la pastille de
                                  // STATUT dit déjà « Masquée · date » (aucune
                                  // autre plateforme en ligne), la puce se tait.
                                  if(!enLigne)return null;
                                  const vuLe=dateCourteParis(item.last_synced_at);
                                  const masquee=item.vinted_status==='hidden';
                                  const lbl=masquee
                                    ?(lang==='fr'?'Masquée':'Hidden')
                                    :(lang==='fr'?'Brouillon':'Draft');
                                  return(
                                    <div className="micon" style={{background:"#FFF6E3",border:"1px solid #EED9A6",color:"#8A6100"}}
                                      title={lang==='fr'
                                        ?"Statut relevé sur Vinted lors de la dernière synchronisation du dressing — resynchronise si ce n'est plus le cas."
                                        :"Status read from Vinted at the last wardrobe sync — sync again if this has changed."}>
                                      {masquee?'🙈':'📝'} {lbl}{vuLe?` — ${lang==='fr'?'vu le':'seen'} ${vuLe}`:''}
                                    </div>
                                  );
                                }
                                const j=joursDepuis(item.listed_at_guess);
                                if(j==null)return null;
                                return(
                                  <div className="micon" style={{background:"#F6F5F1",border:"1px solid #E7E3D8",color:"#8A8578"}}>
                                    🕒 {j===0
                                      ?(lang==='fr'?"en ligne depuis aujourd'hui":'live since today')
                                      :(lang==='fr'?`en ligne depuis ${j} j`:`live for ${j} d`)}
                                  </div>
                                );
                              })()}
                              {/* (La pastille de republication a quitté cette
                                  rangée le 2026-08-27 : c'est la pastille de
                                  STATUT sur la photo qui porte le cycle —
                                  toujours cliquable → feuille d'avancement.) */}
                            </div>
                          )}
                        {/* Actions — mêmes gestes, mêmes gardes que la liste
                            d'avant la galerie. margin-top:auto : les boutons
                            s'alignent en bas de carte quelle que soit la
                            hauteur du contenu au-dessus. */}
                        <div className="gactions">
                            {/* 3 états, une seule source de vérité : publishedActive
                                (le même calcul que la pastille « En ligne » et les
                                logos ci-dessus — une plateforme retirée/échouée/
                                annulée en sort toute seule, le bouton redevient
                                actif sans code dédié).
                                  0/4   → « Publier »
                                  1-3/4 → « Publier » AUSSI, même libellé : le stepper
                                          n'ouvrira que les plateformes MANQUANTES.
                                          « Republier » était un mensonge — FillSell ne
                                          retouche jamais une annonce déjà en ligne
                                          (relancer une plateforme published créait un
                                          SECOND job, donc une annonce en double).
                                  4/4   → inerte, « En ligne (4/4) » : plus rien à faire.

                                ⚠️ PAS DE GATE DE TIER ICI (2026-07-21). Ce bouton
                                était rendu sous `isPro`, or isPro = profiles.is_pro
                                SEUL (App.jsx) — donc ni un Free ni un Premium
                                standard ne voyaient « Publier » : le cross-post,
                                qui est LA fonction du produit, était invisible pour
                                tout le monde sauf le tier Pro. Ce n'était pas le
                                packaging voulu : tout le monde cross-poste, et la
                                différenciation se fait aux PÉPITES, côté serveur —
                                generate-listing facture déjà les non-premium en
                                pièces (402 + prix/solde) au lieu de refuser. */}
                            <button
                                className={toutEnLigne?"btn-publier is-complete":"btn-publier"}
                                disabled={toutEnLigne||detailFetchId===item.id}
                                onClick={e=>{
                                  e.stopPropagation();
                                  // Garde au niveau du HANDLER, pas seulement visuelle :
                                  // le stepper ne doit pas pouvoir s'ouvrir sans une
                                  // seule plateforme à publier.
                                  if(toutEnLigne||detailFetchId)return;
                                  if(extensionNeverSeen===true){setExtPitchItem(item);}
                                  else if(shouldShowExtensionReminder()){setExtReminderItem(item);}
                                  else{publierAvecDetail(item);}
                                }}
                              >
                                {detailFetchId===item.id
                                  ?(lang==='fr'?'Récupération…':'Fetching…')
                                  :toutEnLigne
                                  ?(lang==='fr'?`En ligne (${nbEnLigne}/${RM_PLATFORMS.length})`:`Live (${nbEnLigne}/${RM_PLATFORMS.length})`)
                                  :(lang==='fr'?'Publier':'Publish')}
                              </button>
                            <button className="btn-vendre" onClick={e=>{e.stopPropagation();markSold(item);}}>
                              {lang==='fr'?'Vendre':'Sell'}
                            </button>
                            {/* É5 : Republier — remonte l'annonce Vinted dans le
                                fil (suppression puis recréation à l'identique).
                                Le bouton dit POURQUOI il est inerte, il
                                n'échoue jamais après le clic sur une borne
                                connue (cadence 24 h, republish vivant). */}
                            {repubEligible&&(()=>{
                              const st=repubLatest?.status;
                              // Gel Livres (2026-08-28 soir) : AUCUN bouton tant
                              // que le job porte gel_livres_le — la pastille
                              // « En pause » dit tout, et un Relancer/Republier
                              // créerait un job NEUF hors gel (c'est le trou
                              // que le passage en 'cancelled' vient de fermer).
                              // Détection par le marqueur seul, jamais le statut.
                              if(repubLatest?.platform_fields?.gel_livres_le)return null;
                              const vivant=st==="pending"||st==="processing"||st==="needs_user";
                              if(st==="needs_user"){
                                // Après suppression (étape 'deleted'), le geste n'est pas une
                                // « relance » abstraite : c'est REMETTRE L'ANNONCE EN LIGNE
                                // depuis le snapshot sauvegardé — le bouton le dit (2026-08-12).
                                const apresSuppr=repubLatest?.platform_fields?.republish_step==='deleted';
                                // Capture incomplète avec champ saisissable (2026-08-21) : une
                                // relance à vide re-échouerait en boucle — le bouton ouvre la
                                // feuille de saisie (la même que la pastille), qui valide ET
                                // relance en un geste.
                                const aSaisir=(repubLatest?.platform_fields?.champs_a_completer??[])
                                  .some(c=>repubCleSaisie(c) in REPUB_SAISISSABLES);
                                if(aSaisir&&!apresSuppr){
                                  return(
                                  <button className="btn-vendre" disabled={repubBusy===item.id}
                                    onClick={e=>{e.stopPropagation();setRepubProgress(repubLatest);}}
                                    style={{opacity:repubBusy===item.id?0.6:1}}>
                                    {lang==='fr'?'✋ Compléter':'✋ Fill in'}
                                  </button>);
                                }
                                return(
                                <button className="btn-vendre" disabled={repubBusy===item.id}
                                  onClick={e=>{e.stopPropagation();relancerRepublication(item,repubLatest);}}
                                  style={{opacity:repubBusy===item.id?0.6:1}}>
                                  {repubBusy===item.id?(lang==='fr'?'Relance…':'Relaunching…')
                                    :apresSuppr?(lang==='fr'?'🔁 Republier maintenant':'🔁 Republish now')
                                    :(lang==='fr'?'🔁 Relancer':'🔁 Relaunch')}
                                </button>);
                              }
                              // Republication vivante : AUCUN bouton ici. L'état
                              // est porté par la seule pastille de gauche
                              // (cliquable → feuille d'avancement) ; ce bouton
                              // fantôme « 🔁 En cours » ne faisait que répéter
                              // ce qu'elle disait déjà, sur la colonne qui doit
                              // rester celle des ACTIONS.
                              if(vivant)return null;
                              if(st==="published"&&repubLatest?.platform_fields?.recreated_at
                                &&Date.now()-Date.parse(repubLatest.platform_fields.recreated_at)<24*3600*1000){
                                const restant=Math.max(1,Math.ceil((24*3600*1000-(Date.now()-Date.parse(repubLatest.platform_fields.recreated_at)))/3600000));
                                return(
                                  <button className="btn-vendre btn-cooldown" disabled style={{opacity:0.55,cursor:"default"}}
                                    title={lang==='fr'?`Une republication par article et par 24 h — de nouveau possible dans ~${restant} h.`:`One repost per item per 24 h — available again in ~${restant} h.`}>
                                    {lang==='fr'?`🔁 Dans ~${restant} h`:`🔁 In ~${restant} h`}
                                  </button>);
                              }
                              return(
                                <button className="btn-vendre" disabled={repubMaintenance||repubBusy===item.id}
                                  onClick={e=>{
                                    e.stopPropagation();
                                    if(repubMaintenance)return;
                                    if(extensionNeverSeen===true){setExtPitchItem(item);return;}
                                    ouvrirFeuilleRepublication([item]);
                                  }}
                                  style={{opacity:repubMaintenance?0.45:repubBusy===item.id?0.6:1,cursor:repubMaintenance?"default":undefined}}
                                  title={repubMaintenance
                                    ?(lang==='fr'?"Republication en maintenance — de retour très vite.":"Reposting under maintenance — back very soon.")
                                    :(lang==='fr'?"Supprime puis recrée l'annonce à l'identique pour la faire remonter dans le fil Vinted.":"Deletes then recreates the listing identically to bump it in the Vinted feed.")}>
                                  {repubBusy===item.id
                                    ?(lang==='fr'?'Capture…':'Capturing…')
                                    :(republishPrice!=null
                                      /* Sans l'émoji 🔁 : « Republier (1 ‹icône›) » fait 80px et
                                         tient sur la ligne des 82px utiles de .btn-stack (92px
                                         − bordures − padding) ; avec lui, 98px → repli en deux
                                         lignes, le débordement que ce libellé vient corriger.
                                         Le groupe (prix) est insécable : si le prix passe à deux
                                         chiffres, la coupure tombe entre le verbe et le prix. */
                                      ?(lang==='fr'
                                        ?<>Republier <span style={{whiteSpace:"nowrap"}}>(<PepiteAmount value={republishPrice}/>)</span></>
                                        :<>Repost <span style={{whiteSpace:"nowrap"}}>(<PepiteAmount value={republishPrice}/>)</span></>)
                                      :(lang==='fr'?'🔁 Republier':'🔁 Repost'))}
                                </button>);
                            })()}
                        </div>
                        {/* Message transitoire — pleine largeur de carte,
                            sous les actions. */}
                        {repubNote&&(
                          <div className={`cardnote ${repubNote.ton==='vert'?'is-info':'is-warn'}`}
                            onClick={e=>{e.stopPropagation();setRepubMsgs(m=>({...m,[item.id]:null}));}}
                            style={{cursor:"pointer"}}>
                            <span>{repubNote.texte}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );})}
                </div>
                {/* En mode republication, la liste montre déjà TOUS les
                    republiables (pas de slice) : un « Voir plus » compté sur
                    stockFiltre serait un bouton sans effet. */}
                {!modeRepublish&&stockFiltre.length>10&&!showAllStock&&(
                  <button onClick={()=>setShowAllStock(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${stockFiltre.length-10} articles)`:`Show more (${stockFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}

            {/* É6 : automatisation de la republication — avantage Pro,
                réglable, arrêt propre affiché. Même gate que le bouton
                Republier (republishActif = capacité réelle de l'extension).
                La carte de sync du dressing, elle, vit désormais EN TÊTE de
                la liste (2026-08-05). */}
            {republishActif&&(
              <div style={{marginTop:12}}>
                <RepublishAutoBlock lang={lang} user={user} isPro={isPro} openUpgradeModal={openUpgradeModal}/>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* initialListing depuis la ligne inventaire : sans lui, platformSupport
          calculait detectObjectIcon(undefined) → 📦 → 4 plateformes "unmapped",
          chips grisées et CTA "Générer" mort (bug du 2026-07-11). Mêmes clés que
          le lensResult du flux Lens ; les champs Lens absents (prix_vente_suggere,
          taille_estimee, etat_estime…) restent undefined → les fallbacks invId du
          stepper (prix DB…) s'appliquent comme avant. initialPhotos : photos déjà
          connues de l'article (format inventaire.photos [{type,url}], mêmes
          fallbacks que la relecture cross_post_jobs du stepper) — vide → étape
          upload comme avant. */}
      {extReminderItem&&(
        <ExtensionReminderModal
          lang={lang}
          onClose={()=>setExtReminderItem(null)}
          onContinue={()=>{const it=extReminderItem;setExtReminderItem(null);publierAvecDetail(it);}}
        />
      )}
      {/* Accroche extension (2026-08-04) : remplace le rappel quand l'extension
          n'a JAMAIS été vue — le rappel supposait qu'elle pouvait être là,
          cette hypothèse est fausse ici. « Préparer mon annonce » ouvre le
          stepper normalement ; le mur réel est au clic Publier (garde stepper
          + RPC). Le bouton « vérifier » relance directement le parcours dès
          que le profil est stampé. */}
      {extPitchItem&&(
        <ExtensionPitchScreen
          lang={lang}
          onClose={()=>setExtPitchItem(null)}
          onContinue={()=>{const it=extPitchItem;setExtPitchItem(null);publierAvecDetail(it);}}
          supabase={supabase}
          userId={user?.id}
          onExtensionSeen={()=>{const it=extPitchItem;setExtPitchItem(null);publierAvecDetail(it);}}
        />
      )}
      {/* É5 : feuille de prix de republication — solo et lot passent par elle. */}
      {repubSheet&&(
        <RepublishSheet
          lang={lang}
          items={repubSheet.items}
          prixUnitaire={republishPrice}
          onClose={()=>setRepubSheet(null)}
          onConfirm={(cibles)=>{
            setRepubSheet(null);
            if(cibles.length===1)lancerRepublication(cibles[0].item,cibles[0].prix);
            else lancerRepublicationLot(cibles);
          }}
        />
      )}
      {/* Où en est ma republication — ouverte au tap sur la pastille de carte.
          Le job est relu dans jobsByInventaire à chaque poll : on ré-appelle
          etapeRepublication sur la version FRAÎCHE, sinon la feuille resterait
          figée sur l'étape du moment où elle a été ouverte. */}
      {repubProgress&&(()=>{
        const frais=(jobsByInventaire[repubProgress.inventaire_id]??[])
          .find(j=>j.id===repubProgress.id)??repubProgress;
        return(
          <RepublishProgressSheet lang={lang} job={frais} onClose={()=>setRepubProgress(null)} onSaisieRelance={validerSaisieRelance}/>
        );
      })()}
      {/* Mini-éditeur « À compléter » (socle needs_user, 2026-07-19).
          Fermeture sans valider → aucun écrit, le job reste needs_user et le
          badge reste. Après validation : patch LOCAL immédiat (le badge
          s'éteint sans attendre le poll de 20 s), la relecture périodique
          confirme ensuite l'état réel. */}
      {/* Échec détaillé + action directe (chantier onboarding 2026-07-27).
          Portail document.body OBLIGATOIRE : StockTab vit dans le conteneur
          scroll (.wrap.page-pad) et le WKWebView iOS peint les position:fixed
          d'un scroller touch SOUS la tab bar / le FAB (même piège que la
          feuille photo Lens, fix 41c2b2d). Le message d'erreur est déjà
          humanisé côté extension ; on y ajoute le lien de connexion ou du
          brouillon LBC quand il s'applique. */}
      {/* Note douce du détail Vinted (repli) — portail à z-index supérieur au
          stepper : elle doit rester lisible PAR-DESSUS l'écran qui vient de
          s'ouvrir. Ton invitation, jamais alerte : rien n'a échoué de grave,
          il manque juste un texte que l'utilisateur peut poser à la main. */}
      {detailNote&&createPortal(
        <div style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",zIndex:12000,maxWidth:"min(92vw,420px)",background:"#fff",border:"1px solid rgba(47,158,144,0.35)",borderRadius:14,padding:"11px 16px",boxShadow:"0 12px 32px -10px rgba(16,32,27,0.35)",fontSize:12.5,lineHeight:1.5,color:"#10201B",fontFamily:"inherit"}}>
          💬 {detailNote}
        </div>,
        document.body
      )}
      {failJobModal&&createPortal(
        <div onClick={()=>setFailJobModal(null)} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(16,32,27,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:"24px",width:"min(92vw,440px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",fontFamily:"inherit"}}>
            {/* Mode RÉSERVE (2026-08-08) : la même modale sert le badge
                « Publiée — à vérifier » — job ABOUTI porteur de warnings
                persistés. L'en-tête ne doit alors jamais dire « non
                publiée » et le corps affiche les warnings, pas
                humanizeJobError (dont le repli parle d'échec). */}
            {(()=>{
              const estReserve=(failJobModal.status==="published"||failJobModal.status==="dry_run_completed")
                &&warningsAffichables(failJobModal).length>0;
              return (
                <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <PlatformLogo platform={failJobModal.platform} size={24}/>
              <div style={{fontSize:16,fontWeight:700,color:"#10201B"}}>
                {(PLATFORM_LABELS[failJobModal.platform]||failJobModal.platform)} — {estReserve
                  ?(lang==="en"?"published, check it":"publiée — à vérifier")
                  :(lang==="en"?"not published":"non publiée")}
              </div>
            </div>
            {/* humanizeJobError (2026-07-30) : la colonne error garde le
                diagnostic complet (SQL/support), la modale n'affiche que la
                phrase courte — le message technique brut (fichier, URL d'API,
                dump JSON) s'affichait ici tel quel. failJobAction, lui,
                continue de tester l'erreur BRUTE (motifs connexion/brouillon
                posés côté extension). */}
            <div style={{fontSize:14,color:"#3A443F",lineHeight:1.6,marginBottom:16,whiteSpace:"pre-wrap"}}>
              {estReserve?jobWarningsTexte(failJobModal):humanizeJobError(failJobModal,lang)}
            </div>
                </>
              );
            })()}
            {(()=>{const a=failJobAction(failJobModal,lang);return a?(
              <a href={a.url} target="_blank" rel="noopener noreferrer"
                style={{display:"block",textAlign:"center",padding:"12px",borderRadius:999,background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",fontSize:14,fontWeight:700,textDecoration:"none",marginBottom:8}}>
                {a.label} ↗
              </a>
            ):null;})()}
            {/* Relance manuelle (2026-08-31) : le job repart TEL QUEL en
                pending — pas de régénération, pas de débit (réservation déjà
                soldée au failed, capture sautée par construction). Offerte
                UNIQUEMENT sur les causes récupérables — relanceManuelleInfo. */}
            {(()=>{
              const r=relanceManuelleInfo(failJobModal);
              if(!r)return null;
              if(r.epuise)return(
                <div style={{fontSize:12,color:"#8A8578",textAlign:"center",marginBottom:8,lineHeight:1.5}}>
                  {lang==="en"
                    ?`${RELANCE_MANUELLE_MAX} manual relaunches already used for this job — if it still fails, the cause is elsewhere.`
                    :`${RELANCE_MANUELLE_MAX} relances manuelles déjà utilisées pour ce job — s'il échoue encore, la cause est ailleurs.`}
                </div>
              );
              const enAttente=r.attenteMin>0;
              return(
                <>
                  <button disabled={relanceBusy||enAttente}
                    onClick={()=>relancerJobEchoue(failJobModal)}
                    style={{width:"100%",padding:"12px",borderRadius:999,border:"1px solid #2F9E90",background:enAttente?"#F4F2EC":"#fff",color:enAttente?"#8A8578":"#1B6E62",fontSize:14,fontWeight:700,cursor:relanceBusy||enAttente?"default":"pointer",fontFamily:"inherit",marginBottom:6,opacity:relanceBusy?.6:1}}>
                    {relanceBusy
                      ?(lang==="en"?"Relaunching…":"Relance…")
                      :enAttente
                        ?(lang==="en"?`Relaunched recently — wait ~${r.attenteMin} min`:`Relancé il y a peu — patiente ~${r.attenteMin} min`)
                        :(lang==="en"?"🔁 Relaunch now":"🔁 Relancer maintenant")}
                  </button>
                  <div style={{fontSize:11,color:"#8A8578",textAlign:"center",marginBottom:8,lineHeight:1.5}}>
                    {lang==="en"
                      ?"Once the cause above is fixed. The job restarts as-is — nothing regenerated, no Nugget charged."
                      :"Une fois la cause ci-dessus réglée. Le job repart tel quel — rien de régénéré, aucune Pépite débitée."}
                  </div>
                  {relanceMsg&&(
                    <div style={{fontSize:12,color:"#B0645A",fontWeight:600,textAlign:"center",marginBottom:8}}>{relanceMsg}</div>
                  )}
                </>
              );
            })()}
            <button onClick={()=>setFailJobModal(null)}
              style={{width:"100%",padding:"11px",borderRadius:999,background:"#fff",border:"1px solid #E7E3D8",fontSize:13.5,fontWeight:600,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit"}}>
              {lang==="en"?"Close":"Fermer"}
            </button>
          </div>
        </div>,
        document.body
      )}
      {needsUserJob&&(
        <NeedsUserModal
          job={needsUserJob}
          lang={lang}
          onClose={()=>setNeedsUserJob(null)}
          onDone={(jobId)=>{
            setNeedsUserJob(null);
            if(jobId){
              setJobsByInventaire(prev=>{
                const next={};
                for(const [inv,list] of Object.entries(prev)){
                  next[inv]=list.map(j=>j.id===jobId?{...j,status:"pending",error:null}:j);
                }
                return next;
              });
            }
          }}
        />
      )}
      {/* Modal de retrait ciblé (2026-07-19). jobsAll relu à CHAQUE rendu
          depuis jobsByInventaire : le patch local post-insert et le poll de
          20 s font vivre les lignes (En ligne → Retrait en cours… → Retirée)
          pendant que le modal est ouvert. Fermeture = aucune action. */}
      {removeModalItem&&(
        <RemovePlatformsModal
          item={removeModalItem}
          jobsAll={jobsByInventaire[removeModalItem.id]||[]}
          lang={lang}
          busyPlatform={removeBusy}
          onClose={()=>setRemoveModalItem(null)}
          onRemove={armRemoveJob}
        />
      )}
      {jobStatusItem&&(
        <JobStatusModal
          item={jobStatusItem}
          jobs={(jobsByInventaire[jobStatusItem.id]||[]).filter(j=>j.action!=="delete")}
          lang={lang}
          pausedSet={pausedSet}
          extensionStatus={extensionStatus}
          onClose={()=>setJobStatusItem(null)}
        />
      )}
      {/* alreadyPublished : plateformes DÉJÀ en ligne pour cet article. Le stepper
          les exclut de la sélection et les verrouille — on ne repasse jamais sur
          une annonce publiée. Recalculé à chaque rendu (et non figé à l'ouverture)
          pour rester d'accord avec la carte si un job bascule pendant que le
          stepper est ouvert ; même calcul que le bouton (computeRemovalInfo).
          ⚠️ On y AJOUTE les plateformes réservées par une republication en vol
          (plateformesReserveesParRepublication) : entre la suppression et la
          recréation, l'ancien job publish est 'cancelled' et Vinted repasserait
          pour libre — le stepper la proposerait et on créerait une 2e annonce
          que la recréation viendrait doubler. Rien à voir avec l'affichage :
          la carte continue de dire, à raison, que l'annonce n'est pas en ligne
          pendant ces quelques minutes.
          À l'inverse, `plateformesLiberees` RETIRE Vinted du verrou quand
          l'article est disparu : l'annonce n'existe plus, publier n'est donc
          pas un doublon mais son seul retour en ligne. Cohérent avec la carte,
          qui n'affiche ni logo ni « En ligne » et ne le compte plus dans
          nbEnLigne. */}
      {publishItem&&(
        <ListingPreviewScreen
          inventaireId={publishItem.id}
          userId={user.id}
          alreadyPublished={[...new Set([
            ...computeRemovalInfo(jobsByInventaire[publishItem.id]||[]).publishedActive,
            ...plateformesReserveesParRepublication(jobsByInventaire[publishItem.id]||[]),
          ])]}
          plateformesLiberees={publishItem.disparu_le?['vinted']:[]}
          initialPhotos={(Array.isArray(publishItem.photos)?publishItem.photos:[])
            // Deux formats coexistent en base : objets {type,url} (flux photos
            // retouchées) et STRINGS nues (URLs CDN Vinted écrites par la sync
            // du dressing). `p?.url` sur une string rend undefined — le filter
            // vidait donc les photos des articles importés et le stepper
            // réclamait un upload à des annonces qui ont déjà leurs photos.
            .map(p=>typeof p==='string'?p:(p?.url||p?.original||p?.enhanced||p?.bg_removed))
            .filter(Boolean)}
          initialListing={{
            // ⚠️ publishItem vient de mapItem (App.jsx), qui RENOMME les
            // colonnes : `titre` → `title` et `prix_vente` → `sell`. Lire les
            // noms de COLONNE ici rendait undefined, en silence.
            //   · titre perdu → detectObjectIcon n'avait plus que la
            //     description et le type. Les articles manuels étaient
            //     rattrapés par leur type ; les importés du dressing, dont le
            //     type est NULL (donc "Autre" après mapItem, donc l'icône 📦
            //     « non catégorisable »), tombaient à 0 plateforme sur 4 :
            //     « catégorie non disponible » sur les quatre, alors que leur
            //     titre suffisait à les classer (mesuré : 27 titres sur 28) ;
            //   · prix_vente perdu → le prix suggéré retombait TOUJOURS sur le
            //     prix d'ACHAT, ce que le commentaire d'origine ne voulait pas.
            // Les deux noms sont acceptés : un futur appelant qui passerait
            // une ligne brute de la base marchera aussi.
            titre:       publishItem.title  ?? publishItem.titre  ?? null,
            description: publishItem.description ?? null,
            categorie:   publishItem.type        ?? null,
            marque:      publishItem.marque      ?? null,
            // Prix connu de la ligne inventaire (2026-07-13, job 3d194668) :
            // pré-remplissage SYNCHRONE de la carte — le fallback DB du
            // stepper existe mais arrive en async, et surtout il ne couvre
            // pas ce que la ligne sait déjà. prix_vente est désormais tenu à
            // jour à chaque publication (fix bd9a516).
            // ⚠️ LE REPLI `?? prix_achat` A ÉTÉ RETIRÉ LE 2026-08-10. Il avait
            // déjà été condamné le 2026-07-14 sur le chemin DB (cf. l'effet
            // d'init de ListingPreviewScreen : « Plus AUCUN repli sur
            // prix_achat »), mais il survivait ICI — et ce chemin-ci PRIME sur
            // l'autre. Conséquence vécue le 10/08 (job leboncoin 5229736d) :
            // un article importé du dressing, prix_vente NULL et prix_achat 12,
            // est parti sur Leboncoin à 12 € — son prix d'ACHAT — alors que son
            // annonce Vinted est en ligne à 7 €. Et comme la publication
            // PERSISTE ensuite le prix dans inventaire.prix_vente (fin de
            // handlePublish), le prix d'achat devient la vérité de la fiche et
            // se re-propose à chaque publication suivante : l'erreur se fige.
            // Sources, de la plus vraie à la moins :
            //   1. le prix DEMANDÉ sur l'annonce Vinted (dernier relevé de
            //      vinted_listing_snapshots) — du réel constaté, et déjà l'ordre
            //      retenu par ouvrirFeuilleRepublication ;
            //   2. le prix de vente déclaré sur la fiche ;
            //   3. RIEN. Champ vide plutôt que faux : la garde de publication
            //      (≥ 1 €) interdit de toute façon toute annonce sans prix, donc
            //      personne ne part en ligne par accident — alors qu'un prix
            //      pré-rempli faux, lui, part sans que personne ne le voie.
            prix_vente_suggere:
              prixAnnonceVinted(publishItem)
              ?? publishItem.sell ?? publishItem.prix_vente ?? null,
          }}
          onClose={()=>{clearStepperPersistence();setPublishItem(null);onStepperOpenChange?.(false);}}
          onJobsQueued={(invId,platforms)=>{
            // Patch optimiste (2026-07-25, S6) : la relance d'une plateforme en
            // échec (et toute publication) affichait « Échec » jusqu'à 20 s
            // après le clic, faute de patch local sur CE chemin — le retrait
            // par logo et le mini-éditeur needs_user patchent déjà ainsi. Les
            // lignes synthétiques 'pending' rendent le badge « En cours… »
            // immédiat (latestByPlatform prend le job le plus récent, donc le
            // badge Échec s'éteint aussi) ; la relecture 20 s les remplace par
            // les vraies lignes.
            if(!invId||!platforms?.length)return;
            const now=new Date().toISOString();
            setJobsByInventaire(prev=>{
              const cur=[...(prev[invId]||[])];
              for(const p of platforms){
                cur.push({id:`optimistic-${invId}-${p}-${now}`,inventaire_id:invId,platform:p,
                  status:"pending",error:null,created_at:now,platform_fields:null,
                  action:"publish",listing_url:null,title:null});
              }
              return {...prev,[invId]:cur};
            });
          }}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          isBusiness={isBusiness}
          onUpgrade={(tier)=>openUpgradeModal(tier,'stepper_publication')}
          extensionNeverSeen={extensionNeverSeen}
          extensionLastSeenAt={extLastSeenBest}
          // Photos déjà retouchées PAR NOUS (2026-08-05) : détection par la
          // source UNIQUE isRetouchedPhotoEntry — la première version de ce
          // calcul (enhanced/bg_removed seuls) ne matchait que le schéma
          // HISTORIQUE, or le pipeline actuel écrit des {type,url} dont la
          // photo 0 retouchée garde type:'original' : l'URL /enhanced/ fait
          // foi. Calculé ICI, sur les photos BRUTES de la ligne — le stepper
          // ne reçoit que des URLs aplaties.
          alreadyRetouched={Array.isArray(publishItem.photos) &&
            publishItem.photos.some(isRetouchedPhotoEntry)}
        />
      )}
    </>
  );
});

export default StockTab;
