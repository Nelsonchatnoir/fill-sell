// ═══════════════════════════════════════════════════════════════════════════
// « REMONTER MES ANNONCES » PLATEFORME PAR PLATEFORME (03/11, demande d'un vendeur Pro)
// ═══════════════════════════════════════════════════════════════════════════
// La demande (31/10) : « choisir la plateforme que je veux afficher, voir depuis combien de temps l'annonce est en ligne ou
// quand elle a été republiée sur cette plateforme, trier par date de dernière publication / republication » — par
// exemple « republier uniquement mes annonces Vinted les plus anciennes ».
// La source est CELLE du suivi par plateforme du Stock (31/10) : datesParPlateforme (_shared/mise-en-ligne.js) — la
// même date que la pastille, le menu « … » et la fiche. Rien de neuf n'est lu en base.
// Le choix d'une plateforme ne montre que les annonces REPUBLIABLES maintenant sur elle (plateformesRepubliables) : la
// feuille de republication s'ouvre alors avec cette seule plateforme cochée. eBay n'y est jamais (FillSell ne republie
// pas eBay, décision du 02/11) ; sa date reste lisible dans la vue « Toutes ».
// Pur (aucun DOM, aucune requête) : scripts/remonter-par-plateforme-selftest.mjs.
//
// (13/11, étape 5 du lot « zéro problème », décision de Nico : « seuil et cases lus sur la plateforme choisie ») Avant,
// un article entrait (et partait coché) dès que sa PLUS ANCIENNE annonce, toutes plateformes, avait 7 j — souvent l'annonce
// eBay, qu'on ne republie pas : sous « Vinted », 122 articles d'un compte Pro (de63ca45) dont l'annonce Vinted avait moins
// de 7 j partaient cochés. Désormais :
//   · « ancienne » se lit PAR PLATEFORME republiable (≥ SEUIL_ANCIENNE_JOURS sur elle) ; eBay jamais (pas de republication) ;
//   · plateforme choisie : toutes les annonces republiables sur elle sont listées avec leur date, seules les anciennes SUR
//     ELLE sont cochées (et comptées) ; les plus récentes restent visibles, décochées ;
//   · « Toutes » : les articles dont une annonce republiable est ancienne, triés sur la plus ancienne d'entre elles ;
//   · tri à la milliseconde sur la date de dernière publication / republication, départage stable par identifiant.

import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';
import { SEUIL_ANCIENNE_JOURS } from './regles';

// Les plateformes et leur ordre viennent de la configuration (jamais écrites ici).
export const ORDRE_PLATEFORMES = Object.keys(LIBELLE_PLATEFORME);
export const nomPlateformeRemonter = (p) => LIBELLE_PLATEFORME[p] ?? p;
const rang = (p) => { const i = ORDRE_PLATEFORMES.indexOf(p); return i < 0 ? 99 : i; };

/** La ligne datée d'une plateforme EN LIGNE d'un article (datesParPlateforme), ou null. */
export function ligneDe(article, plateforme) {
  return (article?.lignesDates ?? []).find((l) => l?.platform === plateforme && l?.enLigne) ?? null;
}

/** « il y a 2 j », « aujourd'hui » (null si inconnu). */
function ilYa(jours, fr) {
  if (jours == null) return null;
  if (jours === 0) return fr ? "aujourd'hui" : 'today';
  return fr ? `il y a ${jours} j` : `${jours} d ago`;
}

/** La phrase d'UNE plateforme : « Republiée sur Vinted il y a 2 j », « Publiée sur eBay il y a 42 j »… */
export function phrasePlateforme(ligne, lang = 'fr') {
  const fr = lang !== 'en';
  if (!ligne) return null;
  const nom = nomPlateformeRemonter(ligne.platform);
  const quand = ilYa(ligne.jours, fr);
  if (!quand) return fr ? `En ligne sur ${nom} · date inconnue` : `Live on ${nom} · date unknown`;
  if (ligne.nature === 'republiee') return fr ? `Republiée sur ${nom} ${quand}` : `Reposted on ${nom} ${quand}`;
  if (ligne.nature === 'publiee') return fr ? `Publiée sur ${nom} ${quand}` : `Listed on ${nom} ${quand}`;
  if (ligne.jours === 0) return fr ? `En ligne sur ${nom} depuis aujourd'hui` : `Live on ${nom} since today`;
  return fr ? `En ligne sur ${nom} depuis ${ligne.jours} j` : `Live on ${nom} for ${ligne.jours} d`;
}

/** La vue « Toutes » : « Vinted 2 j · Leboncoin 2 j · eBay 42 j » (chaque plateforme en ligne, dans l'ordre). */
export function phraseToutes(article, lang = 'fr') {
  const fr = lang !== 'en';
  const lignes = (article?.lignesDates ?? []).filter((l) => l?.enLigne).sort((a, b) => rang(a.platform) - rang(b.platform));
  if (!lignes.length) return article?.jours != null ? (fr ? `en ligne depuis ${article.jours} j` : `live for ${article.jours} d`) : null;
  return lignes.map((l) => `${nomPlateformeRemonter(l.platform)} ${l.jours == null ? '?' : l.jours === 0 ? (fr ? "auj." : 'today') : `${l.jours} j`}`).join(' · ');
}

// ── L'ANCIENNETÉ PAR PLATEFORME (13/11) ─────────────────────────────────────
const republiablesDe = (article) => [...new Set((article?.republiables ?? []).filter((p) => p && p !== 'ebay'))];

/** L'horodatage (ms) de la mise en ligne de l'annonce d'une plateforme (dernière publication ou republication), ou null. */
export function msPlateforme(article, plateforme) {
  const x = Date.parse(String(ligneDe(article, plateforme)?.date ?? ''));
  return Number.isFinite(x) ? x : null;
}

/** L'annonce de CETTE plateforme est republiable et ancienne (≥ SEUIL_ANCIENNE_JOURS sur elle). eBay jamais. */
export function estAnciennePour(article, plateforme) {
  if (!plateforme || plateforme === 'ebay' || !republiablesDe(article).includes(plateforme)) return false;
  const j = ligneDe(article, plateforme)?.jours;
  return j != null && j >= SEUIL_ANCIENNE_JOURS;
}

/** Les plateformes où l'article perd en visibilité : republiables ET anciennes sur elles. */
export function plateformesAnciennes(article) {
  return republiablesDe(article).filter((p) => estAnciennePour(article, p));
}

/** L'article entre dans « Remonter » (vue « Toutes ») : une de ses annonces REPUBLIABLES a au moins 7 j. */
export const aRemonter = (article) => plateformesAnciennes(article).length > 0;

/** « Toutes » : la date (ms) de la plus ancienne annonce republiable de l'article (eBay jamais), ou null. */
function msPlusAncienneRepubliable(article) {
  let min = null;
  for (const p of republiablesDe(article)) {
    const x = msPlateforme(article, p);
    if (x != null && (min == null || x < min)) min = x;
  }
  return min;
}

/** Les plateformes proposées au choix : celles où au moins une annonce est ancienne SUR ELLE, avec ce nombre. */
export function plateformesDuChoix(articles) {
  const n = new Map();
  for (const a of articles ?? []) for (const p of plateformesAnciennes(a)) n.set(p, (n.get(p) ?? 0) + 1);
  return [...n.entries()].map(([id, nb]) => ({ id, nom: nomPlateformeRemonter(id), n: nb })).sort((a, b) => rang(a.id) - rang(b.id));
}

/** Plus ancienne d'abord (ou plus récente), date inconnue à la fin, départage stable par identifiant. */
function comparer(sens) {
  return (a, b) => {
    if (a.cle == null && b.cle != null) return 1;
    if (b.cle == null && a.cle != null) return -1;
    if (a.cle != null && b.cle != null && a.cle !== b.cle) return sens * (a.cle - b.cle);
    return String(a.id).localeCompare(String(b.id));
  };
}

/**
 * La liste affichée : filtrée sur la plateforme choisie (null = toutes), triée, avec sa phrase et sa case.
 * tri : 'anciennes' (dernière mise en ligne la plus ancienne d'abord) | 'recentes'. Une date inconnue va à la fin.
 * Rend { plateforme, lignes: [{…article, cle (ms|null), coche, ligne2}], aCocher: ids des cochées, la plus ancienne
 * d'abord (quel que soit le tri affiché : un plafond garde les plus anciennes), nAnciennes }.
 * @param {Array<{id: any, titre: string, photo?: string|null, logos?: string[], republiables?: string[], lignesDates?: any[], jours?: number|null}>} articles
 * @param {{ plateforme?: string|null, tri?: 'anciennes'|'recentes', lang?: string }} o
 */
export function listeRemonter(articles, { plateforme = null, tri = 'anciennes', lang = 'fr' } = {}) {
  const choix = plateforme && plateformesDuChoix(articles).some((p) => p.id === plateforme) ? plateforme : null;
  const lignes = (articles ?? [])
    .filter((a) => (choix ? republiablesDe(a).includes(choix) : aRemonter(a)))
    .map((a) => {
      const l = choix ? ligneDe(a, choix) : null;
      const cle = choix ? msPlateforme(a, choix) : msPlusAncienneRepubliable(a);
      const coche = choix ? estAnciennePour(a, choix) : true;
      return { ...a, cle, coche, ligne2: choix ? (phrasePlateforme(l, lang) ?? phraseToutes(a, lang)) : phraseToutes(a, lang) };
    });
  lignes.sort(comparer(tri === 'recentes' ? -1 : 1));
  const aCocher = lignes.filter((l) => l.coche).sort(comparer(1)).map((l) => l.id);
  return { plateforme: choix, lignes, aCocher, nAnciennes: aCocher.length };
}
