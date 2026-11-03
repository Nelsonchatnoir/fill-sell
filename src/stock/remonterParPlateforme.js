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

import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';

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

/** Les plateformes proposées au choix : celles où au moins une annonce est republiable maintenant, avec leur nombre. */
export function plateformesDuChoix(articles) {
  const n = new Map();
  for (const a of articles ?? []) for (const p of new Set(a?.republiables ?? [])) if (p !== 'ebay') n.set(p, (n.get(p) ?? 0) + 1);
  return [...n.entries()].map(([id, nb]) => ({ id, nom: nomPlateformeRemonter(id), n: nb })).sort((a, b) => rang(a.id) - rang(b.id));
}

/**
 * La liste affichée : filtrée sur la plateforme choisie (null = toutes), triée, avec sa phrase.
 * tri : 'anciennes' (dernière mise en ligne la plus ancienne d'abord) | 'recentes'. Une date inconnue va à la fin.
 * @param {Array<{id: any, titre: string, photo?: string|null, logos?: string[], republiables?: string[], lignesDates?: any[], jours?: number|null}>} articles
 * @param {{ plateforme?: string|null, tri?: 'anciennes'|'recentes', lang?: string }} o
 */
export function listeRemonter(articles, { plateforme = null, tri = 'anciennes', lang = 'fr' } = {}) {
  const choix = plateforme && plateformesDuChoix(articles).some((p) => p.id === plateforme) ? plateforme : null;
  const lignes = (articles ?? [])
    .filter((a) => !choix || (a?.republiables ?? []).includes(choix))
    .map((a) => {
      const l = choix ? ligneDe(a, choix) : null;
      const cle = choix ? (l?.jours ?? null) : (a?.jours ?? null);
      return { ...a, cle, ligne2: choix ? (phrasePlateforme(l, lang) ?? phraseToutes(a, lang)) : phraseToutes(a, lang) };
    });
  const sens = tri === 'recentes' ? 1 : -1;
  lignes.sort((a, b) => {
    if (a.cle == null && b.cle == null) return 0;
    if (a.cle == null) return 1;
    if (b.cle == null) return -1;
    return sens * (a.cle - b.cle);
  });
  return { plateforme: choix, lignes };
}
