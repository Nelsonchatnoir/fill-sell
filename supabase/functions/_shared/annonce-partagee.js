// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE, UNE FICHE : LA CASCADE QUI TRANCHE SEULE (15/10 soir, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce portée par deux fiches (« Cette annonce Leboncoin est rattachée à
// 2 articles de ton stock ») ne devient une question que si FillSell ne peut
// pas trancher avec une donnée fiable. Ordre imposé par Nico :
//   1. les IDENTIFIANTS — l'identifiant rendu au dépôt (Leboncoin adsubmit), un
//      dépôt dont le lien n'a pas été retrouvé par le titre, un import (le
//      relevé a lu l'annonce elle-même) ;
//   2. les PHOTOS en taille réelle (capture de l'annonce, empreintes
//      photo_empreintes, mêmes mesures que le moteur de fusion) ;
//   3. l'IA (Haiku, texte d'abord puis miniatures, un verdict tracé, aucune
//      escalade) — jamais sur une fiche vendue (la personne décide) ;
//   4. sinon, la question à la personne.
// ⛔ Jamais le titre seul, jamais « titre + prix » : le texte ne sert qu'à
//    l'IA, et seulement pour EXCLURE une fiche (un détail qui la distingue) ;
//    « c'est elle » exige une preuve photo.
// Pur (Node + Deno) : scripts/annonce-partagee-cascade-selftest.mjs.
// Exécuté par la fonction rapprochement-ia (mode « annonces_partagees »).

import { photoDepuisEmpreinte, comparerPhotos } from './rapprochement/photos.js';

// Mêmes motifs que update-job-status / _shared/annonce-lien.ts.
const MOTIFS_LIEN = {
  vinted: /\/items\/(\d+)/,
  leboncoin: /\/ad\/[^/]+\/(\d{6,})/,
  ebay: /\/itm\/[^?#]*?(\d{9,})/,
  beebs: /\/p\/(\d+)/,
  opla: /\/(?:product|article)\/(art_[^/?#]+)/,
  // (18/10) « _ » admis dans le pseudo du vendeur (thard_733-…, retrait 81188384).
  depop: /\/products\/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)/,
};
export function idDuLien(platform, url) {
  const re = MOTIFS_LIEN[platform];
  const m = re ? String(url ?? '').match(re) : null;
  return m ? m[1] : null;
}
const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === 'object' ? j.platform_fields : {});
const txt = (v) => String(v ?? '').trim();

/** Le job désigne-t-il l'annonce L (par son lien OU son identifiant) ? */
export function designe(job, L) {
  const l = txt(L);
  if (!l) return false;
  return txt(job?.platform_listing_id) === l || idDuLien(job?.platform, job?.listing_url) === l;
}

const IMPORT_RE = /sync-dressing|releve/i;
/**
 * La preuve d'IDENTIFIANT qu'un job donne de l'annonce L, ou null.
 *   · 'depot_leboncoin' : Leboncoin a rendu L au dépôt (adsubmit / sans_adsubmit) ;
 *   · 'preuve_beebs'    : identifiant Beebs prouvé (preuve_identifiant_beebs) ;
 *   · 'import'          : le relevé a lu l'annonce L elle-même ;
 *   · 'depot'           : identifiant ET lien d'accord sur L, lien jamais
 *                         retrouvé par le titre (listing_url_recovery).
 * Un dépôt Leboncoin dont l'identifiant certain est AUTRE ne prouve jamais L.
 */
export function preuveIdentifiant(job, L) {
  const l = txt(L);
  if (!l || !job) return null;
  const pf = pfDe(job);
  if (job.platform === 'leboncoin') {
    const cert = txt(pf?.lbc_depot?.adsubmit?.id) || txt(pf?.lbc_depot?.sans_adsubmit?.id);
    if (/^\d{6,}$/.test(cert)) return cert === l ? 'depot_leboncoin' : null;
  }
  const beebs = txt(pf?.preuve_identifiant_beebs?.id ?? pf?.preuve_identifiant_beebs?.listing_id);
  if (job.platform === 'beebs' && beebs) return beebs === l ? 'preuve_beebs' : null;
  const pid = txt(job.platform_listing_id);
  const lien = idDuLien(job.platform, job.listing_url);
  if (IMPORT_RE.test(txt(job.handler_build))) return (pid === l || (!pid && lien === l)) ? 'import' : null;
  if (pf.listing_url_recovery) return null; // un lien retrouvé par le titre est une piste, jamais une identité
  if (pid === l && (!lien || lien === l)) return 'depot';
  return null;
}

/** La fiche canonique (une fiche fusionnée parle pour celle qui l'a gardée). */
export function canonique(ficheId, fiches) {
  let id = String(ficheId);
  for (let i = 0; i < 5; i++) {
    const f = fiches?.get?.(id);
    if (!f?.fusionne_dans) return id;
    id = String(f.fusionne_dans);
  }
  return id;
}

const VIVANTS = new Set(['pending', 'processing', 'published', 'needs_user']);
/**
 * Les fiches candidates de l'annonce L : celles dont un job VIVANT la désigne.
 * jobs : tous les jobs du compte sur la plateforme ; fiches : Map(id → {fusionne_dans, statut, …}).
 * → Map(ficheCanonique → jobs de cette fiche qui désignent L, tous statuts)
 */
export function candidatsDe(jobs, fiches, L) {
  const vivants = new Set();
  for (const j of jobs ?? []) {
    if (j?.inventaire_id == null || !VIVANTS.has(j.status) || !designe(j, L)) continue;
    vivants.add(canonique(j.inventaire_id, fiches));
  }
  const parFiche = new Map([...vivants].map((f) => [f, []]));
  for (const j of jobs ?? []) {
    if (j?.inventaire_id == null || !designe(j, L)) continue;
    const f = canonique(j.inventaire_id, fiches);
    if (parFiche.has(f)) parFiche.get(f).push(j);
  }
  return parFiche;
}

/** Étape 1 : { fiche, preuve } si UNE seule fiche a une preuve d'identifiant ; sinon { conflit } ou null. */
export function trancherParIdentifiant(parFiche, L) {
  const prouvees = [];
  for (const [fiche, jobs] of parFiche) {
    const preuves = jobs.map((j) => preuveIdentifiant(j, L)).filter(Boolean);
    if (preuves.length) prouvees.push({ fiche, preuve: preuves[0], job: jobs.find((j) => preuveIdentifiant(j, L))?.id ?? null });
  }
  if (prouvees.length === 1) return prouvees[0];
  if (prouvees.length > 1) return { conflit: prouvees.map((p) => p.fiche) };
  return null;
}

// Étape 2 — seuils du moteur de fusion (rapprochement/moteur.js SEUILS) :
// « même photo » = une paire quasi identique (≤ 4) ou deux paires ≤ 9 ;
// « autre » = aucune paire à moins de 12 bits.
export const SEUILS_PHOTO = Object.freeze({ quasi: 4, multi: 9, aucune: 12 });
export function niveauPhoto(cmp) {
  if (!cmp || !Array.isArray(cmp.liste)) return 'inconnu';
  const multi = cmp.liste.filter((d) => d <= SEUILS_PHOTO.multi).length >= 2;
  if (cmp.best <= SEUILS_PHOTO.quasi || multi) return 'meme';
  if (cmp.best > SEUILS_PHOTO.aucune) return 'autre';
  return 'proche';
}
/**
 * Étape 2 : les empreintes de l'annonce contre celles de chaque fiche.
 * empreintesAnnonce : lignes photo_empreintes ; empreintesParFiche : Map(fiche → lignes).
 * → { fiche, niveaux } quand UNE fiche a la même photo et que toutes les autres
 *   n'en ont aucune approchante ; sinon null (et `niveaux` pour la trace).
 */
export function trancherParPhotos(empreintesAnnonce, empreintesParFiche) {
  const A = (empreintesAnnonce ?? []).map(photoDepuisEmpreinte).filter(Boolean);
  const niveaux = {};
  if (!A.length) return { fiche: null, niveaux, raison: 'annonce_sans_empreinte' };
  for (const [fiche, lignes] of empreintesParFiche ?? new Map()) {
    const B = (lignes ?? []).map(photoDepuisEmpreinte).filter(Boolean);
    niveaux[fiche] = B.length ? niveauPhoto(comparerPhotos(A, B)) : 'inconnu';
  }
  const memes = Object.keys(niveaux).filter((f) => niveaux[f] === 'meme');
  const autres = Object.keys(niveaux).filter((f) => niveaux[f] !== 'meme');
  if (memes.length === 1 && autres.every((f) => niveaux[f] === 'autre')) return { fiche: memes[0], niveaux };
  return { fiche: null, niveaux, raison: memes.length > 1 ? 'plusieurs_memes_photos' : 'photos_non_concluantes' };
}

// Étape 3 — l'IA.
export const CONSIGNE_ANNONCE = [
  "Un vendeur de seconde main a UNE annonce en ligne sur une plateforme ; plusieurs fiches de son stock disent toutes la porter.",
  "Ces fiches sont souvent des articles très proches (même modèle, autre couleur, autre taille, lot ou pièce seule) : une seule est vendue par CETTE annonce.",
  "Pour chaque fiche : « meme » = c'est bien la pièce de l'annonce (sur les PHOTOS : même prise de vue, même pièce) ; « different » = un détail la distingue nettement de l'annonce (couleur, ordre des couleurs dans un article bicolore, taille, quantité ou contenu de lot, modèle, type d'objet) ; « incertain » = rien ne permet de le dire.",
  "Sans photo à comparer, ne réponds jamais « meme » : réponds « different » si un détail du texte l'exclut, sinon « incertain ».",
  "Ne devine pas : un titre reformulé ou un prix différent ne distinguent rien à eux seuls.",
  'Réponds UNIQUEMENT par le JSON demandé ; « raison » en une ligne, en français.',
].join('\n');

const court = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const val = (x) => (x && typeof x === 'object' && 'v' in x ? x.v : x);
export const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F'];

export function messageAnnonce({ annonce, fiches, avecImages = false }) {
  const lignes = [
    `L'ANNONCE (${court(annonce?.platform, 20)}) :`,
    `- titre : ${court(annonce?.titre, 160) || '(vide)'}`,
    `- description : ${court(annonce?.description, 400) || '(vide)'}`,
    annonce?.prix != null ? `- prix : ${annonce.prix} €` : null,
    '',
  ].filter((x) => x !== null);
  fiches.forEach((f, i) => {
    lignes.push(`FICHE ${LETTRES[i]} :`, `- titre : ${court(f?.titre, 160) || '(vide)'}`, `- description : ${court(f?.description, 300) || '(vide)'}`);
    for (const k of ['couleur', 'taille', 'marque', 'etat']) { const v = court(val(f?.attributs?.[k]), 60); if (v) lignes.push(`- ${k} : ${v}`); }
    if (Number.isFinite(Number(f?.prix_vente))) lignes.push(`- prix : ${Number(f.prix_vente)} €`);
    lignes.push('');
  });
  lignes.push(avecImages
    ? "Les miniatures suivent (annonce d'abord, puis chaque fiche) : laquelle est la pièce de l'annonce ?"
    : "Pas encore de photos : exclus (« different ») les fiches qu'un détail distingue nettement, « incertain » sinon ; besoin_images = true si les photos peuvent trancher.");
  return lignes.join('\n');
}

export function schemaAnnonce(n) {
  const props = {};
  for (let i = 0; i < n; i++) props[LETTRES[i]] = { type: 'string', enum: ['meme', 'different', 'incertain'] };
  return {
    type: 'object', additionalProperties: false,
    required: ['verdicts', 'raison', 'besoin_images'],
    properties: {
      verdicts: { type: 'object', additionalProperties: false, required: LETTRES.slice(0, n), properties: props },
      raison: { type: 'string' },
      besoin_images: { type: 'boolean' },
    },
  };
}

export function lireReponseAnnonce(texte, n) {
  try {
    const j = JSON.parse(String(texte ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const verdicts = LETTRES.slice(0, n).map((l) => (['meme', 'different', 'incertain'].includes(j?.verdicts?.[l]) ? j.verdicts[l] : 'incertain'));
    return { verdicts, raison: court(j?.raison, 200) || null, besoin_images: j?.besoin_images === true };
  } catch {
    return { verdicts: Array(n).fill('incertain'), raison: 'réponse illisible', besoin_images: false };
  }
}

/**
 * La décision de l'IA (après sa réponse, jamais confiée au modèle) :
 *   · toutes les fiches sauf UNE sont « different » et celle-là ne l'est pas →
 *     elle (exclusion, valable au texte) ;
 *   · sinon, à l'étape images : UNE seule « meme » et toutes les autres
 *     « different » → elle ;
 *   · sinon : la question.
 * → { index|null, motif }
 */
export function decisionIA(verdicts, phase) {
  const restantes = verdicts.map((v, i) => (v !== 'different' ? i : -1)).filter((i) => i >= 0);
  if (restantes.length === 1) {
    const i = restantes[0];
    if (verdicts[i] === 'meme' && phase !== 'images') return { index: i, motif: 'exclusion_texte' };
    return { index: i, motif: verdicts[i] === 'meme' ? 'photo' : 'exclusion' };
  }
  return { index: null, motif: restantes.length === 0 ? 'toutes_differentes' : 'plusieurs_possibles' };
}
