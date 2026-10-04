// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LES RÈGLES DE LA REFONTE (03/10/2026), SANS ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════
// Planche validée par Nico : C:\Users\nicol\fill-and-sell-design\stock-redesign\
// (NOTES.md + les neuf écrans). Ce fichier ne dessine rien et n'écrit rien en
// base : il dit, pour un article DÉJÀ LU par StockTab, quelle est SON action
// principale, ce que dit sa pastille, dans quels filtres rapides il entre, et
// comment se mémorise le choix Cartes / Liste. Les composants de src/stock/ le
// lisent ; scripts/stock-refonte-selftest.mjs le prouve.
//
// ⛔ AUCUN ÉTAT N'EST INVENTÉ ICI. Les entrées (en ligne, à régler, plateformes
//    à publier, republiable…) sont calculées par StockTab avec les MÊMES
//    fonctions qu'avant la refonte (computeRemovalInfo, vintedPresenceArticle,
//    plateformesRepubliables, natureNeedsUser…). Ce module ne fait que trancher
//    entre elles, dans l'ordre que Nico a fixé.
// ⛔ AUCUNE PLATEFORME EN DUR. Les listes viennent de la configuration réelle
//    (utils/stockFiltres : plateformesDuCompte, plateformesDeReleve). Depop
//    n'apparaît que le jour où son intégration existe ; Opla suit sa règle de
//    sortie (10/10, _shared/opla-sortie.js) sans rien demander à ce fichier.
// ═══════════════════════════════════════════════════════════════════════════

import { LABEL_COURT } from '../utils/republication';

// ── « Ancienne » : le plancher de republication DÉJÀ en place ──────────────
// AGE_MIN de components/RepublicationPlanifiee.jsx (« plancher anti-ban »,
// 09/08, jamais rebaissé). Il n'est pas exporté de là (fichier de composants,
// règle react-refresh) : la valeur est recopiée ICI, et le selftest relit la
// source de RepublicationPlanifiee pour prouver que les deux sont égales —
// une recopie qui diverge casse le test, jamais l'écran en silence.
export const SEUIL_ANCIENNE_JOURS = 7;

const JOUR_MS = 86400000;

/** Jours entiers écoulés depuis `iso` (null si la date est absente ou fausse). */
export function joursDepuis(iso, maintenant = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((maintenant - t) / JOUR_MS));
}

// ── L'ÂGE DES ANNONCES D'UN ARTICLE ────────────────────────────────────────
// Une annonce par plateforme EN LIGNE. Vinted se lit sur l'article
// (listed_at_guess : relevé du dressing, réécrit par une recréation) ; les
// autres sur leur dernier job publié (date de recréation d'une republication,
// sinon date de publication). On rend la PLUS ANCIENNE : c'est elle qui perd
// en visibilité, et c'est elle que « Remonter » vient chercher.
export function ancienneteJours(item, jobsAll, enLigne = [], maintenant = Date.now()) {
  let max = null;
  const prendre = (j) => { if (j != null && (max == null || j > max)) max = j; };
  for (const p of enLigne ?? []) {
    if (p === 'vinted') {
      prendre(joursDepuis(item?.listed_at_guess, maintenant));
      continue;
    }
    let date = null;
    for (const j of jobsAll ?? []) {
      if (j?.platform !== p || j.status !== 'published') continue;
      if (j.action !== 'publish' && j.action !== 'republish') continue;
      const d = j.platform_fields?.recreated_at ?? j.published_at ?? j.created_at ?? null;
      if (d && (!date || Date.parse(d) > Date.parse(date))) date = d;
    }
    prendre(joursDepuis(date, maintenant));
  }
  return max;
}

export const estAncienne = (jours) => jours != null && jours >= SEUIL_ANCIENNE_JOURS;

// ── L'ACTION PRINCIPALE D'UNE CARTE — L'ORDRE DE NICO, ET RIEN D'AUTRE ─────
//   1. quelque chose attend un geste       → « Régler »
//   2. pas partout (ou hors ligne)         → « Publier partout »
//   3. annonce ancienne ET republiable     → « Remonter »
//   4. sinon                               → « Marquer vendu »
// `aPublier` = nombre de plateformes du compte où l'article peut ENCORE partir
// (ni en ligne, ni déjà en route). Un article hors ligne partout y entre de
// lui-même : toutes ses plateformes sont à publier.
// Un article vendu n'a pas d'action principale (null).
export const ACTIONS = Object.freeze({ REGLER: 'regler', PUBLIER: 'publier', REMONTER: 'remonter', VENDU: 'vendu' });

export function actionPrincipale({ vendu = false, aRegler = false, aPublier = 0, ancienne = false, remontable = false } = {}) {
  if (vendu) return null;
  if (aRegler) return ACTIONS.REGLER;
  if (aPublier > 0) return ACTIONS.PUBLIER;
  if (ancienne && remontable) return ACTIONS.REMONTER;
  return ACTIONS.VENDU;
}

export function libelleAction(action, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    regler: fr ? 'Régler' : 'Fix',
    publier: fr ? 'Publier partout' : 'Publish everywhere',
    remonter: fr ? 'Remonter' : 'Bump',
    vendu: fr ? 'Marquer vendu' : 'Mark sold',
  }[action] ?? '';
}

// ── LES LOGOS D'UNE CARTE : TROIS AU PLUS, PUIS « +N » (correction b) ──────
export const MAX_LOGOS_CARTE = 3;
export function pileLogos(liste, max = MAX_LOGOS_CARTE) {
  const l = Array.isArray(liste) ? liste : [];
  if (l.length <= max) return { visibles: l, reste: 0 };
  return { visibles: l.slice(0, max), reste: l.length - max };
}

// ── LES FILTRES RAPIDES — une seule pastille active à la fois ──────────────
export const FILTRES_RAPIDES = ['tous', 'en_ligne', 'pas_partout', 'anciennes', 'vendus'];

export function libelleFiltreRapide(cle, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    tous: fr ? 'Tous' : 'All',
    en_ligne: fr ? 'En ligne' : 'Live',
    pas_partout: fr ? 'Pas partout' : 'Not everywhere',
    anciennes: fr ? 'Anciennes' : 'Old',
    vendus: fr ? 'Vendus' : 'Sold',
  }[cle] ?? cle;
}

/** L'article entre-t-il dans ce filtre rapide ? `info` vient de la carte. */
export function entreDansFiltreRapide(cle, { vendu = false, enLigne = false, aPublier = 0, ancienne = false } = {}) {
  switch (cle) {
    case 'vendus': return vendu;
    case 'en_ligne': return !vendu && enLigne;
    case 'pas_partout': return !vendu && aPublier > 0;
    case 'anciennes': return !vendu && enLigne && ancienne;
    case 'tous':
    default: return !vendu;
  }
}

// ── ANCIENNETÉ DE L'ANNONCE (panneau) — trois tranches, cumulables ─────────
export const TRANCHES_ANCIENNETE = ['moins_7', '7_30', 'plus_30'];

export function libelleTranche(cle, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    moins_7: fr ? `Moins de ${SEUIL_ANCIENNE_JOURS} j` : `Under ${SEUIL_ANCIENNE_JOURS} d`,
    '7_30': fr ? `${SEUIL_ANCIENNE_JOURS} à 30 j` : `${SEUIL_ANCIENNE_JOURS} to 30 d`,
    plus_30: fr ? 'Plus de 30 j' : 'Over 30 d',
  }[cle] ?? cle;
}

/** La tranche d'un âge connu ; null si l'âge est inconnu (jamais « moins de 7 j » par défaut). */
export function trancheAnciennete(jours) {
  if (jours == null || !Number.isFinite(jours)) return null;
  if (jours < SEUIL_ANCIENNE_JOURS) return 'moins_7';
  if (jours <= 30) return '7_30';
  return 'plus_30';
}

// ── PRIX MIN / MAX ──────────────────────────────────────────────────────────
// Saisie française : « 10 », « 10,5 », « 10.50 », « 1 200 ». Vide = pas de borne.
export function lirePrixSaisi(texte) {
  const t = String(texte ?? '').replace(/\s| /g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ⛔ VIDE ≠ ZÉRO : un article sans prix connu ne satisfait AUCUNE borne de prix
//    (il n'est ni « au-dessus de 10 € » ni « en dessous de 50 € »).
export function dansFourchettePrix(prix, min, max) {
  if (min == null && max == null) return true;
  if (prix == null || !Number.isFinite(Number(prix))) return false;
  const p = Number(prix);
  if (min != null && p < min) return false;
  if (max != null && p > max) return false;
  return true;
}

// ── CARTES / LISTE — LE CHOIX EST GARDÉ ────────────────────────────────────
// localStorage : une préférence de présentation qui survit à la fermeture de
// l'onglet (même doctrine que fs_stock_en_stock_ouvert). Stockage indisponible
// (navigation privée, WebView bridée) : on retombe sur Cartes, sans erreur.
export const CLE_AFFICHAGE = 'fs_stock_affichage';
export const AFFICHAGES = ['cartes', 'liste'];

export function lireAffichage(stockage) {
  try {
    const v = stockage?.getItem?.(CLE_AFFICHAGE);
    return AFFICHAGES.includes(v) ? v : 'cartes';
  } catch { return 'cartes'; }
}

export function ecrireAffichage(stockage, valeur) {
  if (!AFFICHAGES.includes(valeur)) return false;
  try { stockage?.setItem?.(CLE_AFFICHAGE, valeur); return true; } catch { return false; }
}

// ── LES TRIS DE LA PLANCHE — cinq choix, les clés de utils/stockFiltres ─────
// « Plus anciens » = l'ordre historique du Stock (clé 'defaut' : jamais en
// ligne d'abord, puis l'annonce la plus ancienne) — la fonction « trier par
// ancienneté » reste, sous le mot de la planche. « Plus récents » (ajouté
// récemment) devient l'ordre par défaut, comme sur la planche.
export const TRIS_PLANCHE = ['ajout_desc', 'defaut', 'vues_desc', 'prix_asc', 'prix_desc'];
export const TRI_PAR_DEFAUT = 'ajout_desc';

export function libelleTriPlanche(cle, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    ajout_desc: fr ? 'Plus récents' : 'Newest',
    defaut: fr ? 'Plus anciens' : 'Oldest',
    vues_desc: fr ? 'Plus vus' : 'Most viewed',
    prix_asc: fr ? 'Prix croissant' : 'Price low to high',
    prix_desc: fr ? 'Prix décroissant' : 'Price high to low',
  }[cle] ?? (fr ? 'Plus récents' : 'Newest');
}

// ── LA PASTILLE D'ÉTAT — COURTE, JAMAIS COUPÉE, SANS ÉMOJI ─────────────────
// Le texte long (le pourquoi, le geste) vit dans le `title` et dans le menu
// « … » ; la pastille ne garde que le mot et, au besoin, la plateforme ou un
// nombre. Une plateforme est nommée par son nom COURT (Leboncoin → LBC) —
// jamais tronquée ; dès qu'il y en a plusieurs, on COMPTE (règle du 08/09).
// `ton` : ok (teal) · regler (ambre) · echec (rouge) · neutre (gris) ·
//         hors (gris clair, photo désaturée).
export function nomCourt(p) {
  return LABEL_COURT[p] ?? (p ? String(p).charAt(0).toUpperCase() + String(p).slice(1) : '');
}

export function pastilleCourte(etat, lang = 'fr') {
  const fr = lang !== 'en';
  const e = etat ?? {};
  const pf = e.plateforme ? nomCourt(e.plateforme) : null;
  const n = Number(e.nombre) || 0;
  const sep = ' · ';
  // Plusieurs plateformes : on COMPTE ; une seule : son nom court ; aucune : rien
  // (jamais « · null »).
  const quoi = n > 1 ? sep + n : pf ? sep + pf : '';
  switch (e.genre) {
    case 'republication':
      return { texte: e.court ?? (fr ? 'Remontée' : 'Bump'), ton: e.ton ?? 'neutre', pulse: !!e.pulse };
    case 'orpheline':
      return { texte: fr ? 'Ouvre Chrome' : 'Open Chrome', ton: 'echec', pulse: false };
    case 'pause':
      return { texte: fr ? 'En pause' : 'Paused', ton: 'neutre', pulse: false };
    case 'maj':
      return { texte: fr ? 'Mise à jour' : 'Update', ton: 'regler', pulse: false };
    case 'attente':
      return { texte: (fr ? 'En attente' : 'Waiting') + (e.jours >= 1 ? `${sep}${e.jours} ${fr ? 'j' : 'd'}` : ''), ton: 'neutre', pulse: false };
    case 'en_cours':
      return { texte: fr ? 'En cours…' : 'Posting…', ton: 'neutre', pulse: true };
    case 'echec':
      return { texte: (fr ? 'Échec' : 'Failed') + quoi, ton: 'echec', pulse: false };
    case 'a_regler':
      return { texte: (fr ? 'À régler' : 'To fix') + quoi, ton: 'regler', pulse: false };
    case 'confirmation':
      return { texte: (fr ? 'Vérification' : 'Checking') + quoi, ton: 'neutre', pulse: false };
    case 'en_file':
      return { texte: (fr ? 'En file' : 'Queued') + (pf ? sep + pf : ''), ton: 'neutre', pulse: false };
    case 'hors_ligne':
      return { texte: (fr ? 'Hors ligne' : 'Offline') + (e.date ? sep + e.date : ''), ton: 'hors', pulse: false };
    case 'masquee':
      return { texte: (fr ? 'Masquée' : 'Hidden') + (e.date ? sep + e.date : ''), ton: 'regler', pulse: false };
    case 'brouillon':
      return { texte: (fr ? 'Brouillon' : 'Draft') + (e.date ? sep + e.date : ''), ton: 'regler', pulse: false };
    case 'en_ligne':
      return { texte: (fr ? 'En ligne' : 'Live') + (estAncienne(e.jours) ? `${sep}${e.jours} ${fr ? 'j' : 'd'}` : ''), ton: 'ok', pulse: false };
    case 'vendu':
      return { texte: (fr ? 'Vendu' : 'Sold') + (e.date ? sep + e.date : ''), ton: 'neutre', pulse: false };
    case 'pas_en_ligne':
    default:
      return { texte: fr ? 'Pas en ligne' : 'Not online', ton: 'hors', pulse: false };
  }
}

// ── DATES COURTES — « 2 oct. », à l'heure de Paris ─────────────────────────
export function dateCourte(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(t));
  } catch { return null; }
}

// ── UN NOMBRE AU FORMAT FRANÇAIS (« 1 234 ») ───────────────────────────────
export function nombreFr(n, lang = 'fr') {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR');
}

// ── « N article(s) », « N annonce(s) » — l'accord, une fois pour toutes ────
export function compteMot(n, singulier, pluriel) {
  return `${nombreFr(n)} ${Number(n) > 1 ? pluriel : singulier}`;
}
