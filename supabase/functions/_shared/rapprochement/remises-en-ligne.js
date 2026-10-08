// ═══════════════════════════════════════════════════════════════════════════
// LA REMISE EN LIGNE VINTED (08/10/2026 soir, cas Bebertdeals)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS. Bebertdeals supprime ses annonces Vinted et les republie lui-même,
// sous un NOUVEL identifiant, tous les cinq à dix jours (Levi's 501 « A177 » :
// 10024094123 le 16/09 → 10086763082 le 21/09 → 10151780447 le 27/09 →
// 10281924433 le 07/10 ; une seule en ligne à la fois). La synchro du dressing
// rattache par identifiant d'annonce SEULEMENT : chaque remise en ligne devient
// une fiche neuve (268 le 08/10 à 19:14, dont 206 d'un article déjà connu), et
// la fiche d'origine — celle qui porte ses copies Leboncoin, son prix d'achat,
// son historique — reste « en stock », annonce Vinted morte. Deux annonces
// Leboncoin restaient en ligne pour des articles déjà vendus sur Vinted sous
// leur nouvelle annonce (A178, C202).
// La règle du 25/09 (vinted_remise_en_ligne, balayage des doublons) ne voyait
// que les annonces « closed » ; le balayage est coupé depuis le 28/09 ; le
// moteur v3 ne compare jamais deux fiches Vinted (deux annonces d'une même
// plateforme = deux exemplaires). Plus rien ne rattachait une remise en ligne.
//
// LA RÈGLE. Deux annonces Vinted de la même boutique qui n'ont JAMAIS été en
// ligne ensemble — l'ancienne a quitté le dressing (datée disparue, ou absente
// du dernier relevé complet de sa boutique) sans y être vue vendue, la nouvelle
// est apparue après la dernière vue de l'ancienne — sont le même article quand
// le moteur v3 les dit FORT (même photo ET accord du titre, aucun conflit de
// type, couleur, taille, dimensions) ET qu'aucun concurrent n'existe :
//   · une autre annonce en ligne (ou vendue) qui ressemble = plusieurs
//     exemplaires (Louis et ses adaptateurs) → la question, jamais la fusion ;
//   · deux anciennes qui ont été en ligne ensemble → deux exemplaires → question ;
//   · une ancienne réclamée par deux nouvelles → question.
// Deux annonces EN LIGNE ENSEMBLE restent deux exemplaires : rien ne change.
//
// CE QUI EST GARDÉ. La fiche la plus ANCIENNE de la chaîne (celle des dépôts
// FillSell, des copies, du prix d'achat) ; la nouvelle s'y fond et lui donne
// son identité Vinted vivante (inventaire_fusionner_pour : l'échange de la
// remise en ligne, journalisé, réversible) ; les fiches intermédiaires de la
// chaîne (annonces mortes) s'y fondent ensuite ; les jobs Vinted des annonces
// mortes sont clos « remplacée, pas une vente ». Une vente future de l'annonce
// vivante retire alors les copies de l'article (elles sont sur la même fiche).
//
// UN DOUTE (photo seulement proche, titre ou taille contradictoires, concurrent,
// quantité, fiche touchée) → la question « Est-ce le même article ? » (écran
// Doublons), rien n'est fondu ni caché.
//
// PORTÉE. 'nouvelles' (la passe normale) : les fiches du dressing nées depuis
// la dernière passe (`vinted_nouvelles`), seulement quand la lecture le dit
// (`remise_en_ligne_actif`, coin_config rapprochement_remise_en_ligne = 1) ;
// 'toutes' (rattrapage du stock existant, sur décision de Nico) : toutes les
// fiches en ligne. Une annonce nouvelle VENDUE n'est pas jugée ici (ses copies
// restées sur l'ancienne fiche sont une réparation à part, jamais automatique).
// La base garde ses gardes à l'écriture (rapprochement_v3_remise_possible).
import { candidatsDe, texte, pesee, SEUILS } from './moteur.js';
import { comparerPhotos } from './photos.js';

const MARGE_RELEVE_MS = 5 * 60_000;
const ts = (x) => { const v = x ? Date.parse(x) : NaN; return Number.isFinite(v) ? v : NaN; };
const cle = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/** L'état Vinted d'une fiche : 'en_ligne' | 'partie' | 'vendue' | 'autre'. */
export function etatVinted(f, releves) {
  if (!f || !f.vinted_item_id) return 'autre';
  if (f.statut === 'vendu' || f.vinted_status === 'sold') return 'vendue';
  if (f.statut !== 'stock') return 'autre';
  const dernier = ts(releves?.[String(f.vinted_account_id ?? '')]);
  const vu = ts(f.last_synced_at);
  if (f.disparu_le) return 'partie';
  if (Number.isFinite(dernier) && Number.isFinite(vu) && vu < dernier - MARGE_RELEVE_MS) return 'partie';
  if (f.vinted_status === 'active') return 'en_ligne';
  return 'autre';
}
const premiereVue = (f) => { const v = ts(f.first_seen_at); return Number.isFinite(v) ? v : ts(f.created_at); };
const derniereVue = (f) => { const v = ts(f.last_synced_at); return Number.isFinite(v) ? v : ts(f.created_at); };
/** a puis b, jamais ensemble : b est apparue après la dernière vue de a. */
export const successives = (a, b) => Number.isFinite(derniereVue(a)) && Number.isFinite(premiereVue(b)) && derniereVue(a) < premiereVue(b);
const memeBoutique = (a, b) => String(a.vinted_account_id ?? '') === String(b.vinted_account_id ?? '');
// LA MÊME ANNONCE REMISE EN LIGNE (rejeu du 08/10 sur Bebertdeals, 1 025 fiches) :
// le FORT du moteur v3 (photo à ≤ 9 + accord faible du titre) relie, DANS un même
// dressing, des articles différents — chinos bleu marine posés à plat sur le même
// fond, recadrages centraux à 35-45 % qui se ressemblent. Une remise en ligne,
// elle, porte LES MÊMES photos (re-téléversées) : au moins deux photos quasi
// identiques (≤ 4, une seule si l'une des deux n'a qu'une photo), ET un titre en
// accord fort (identique, ou mots pesés ≥ 0,5, ou inclus à 80 % sur ≥ 3 mots),
// ET aucun conflit (type, couleur, taille, dimensions).
export const QUASI = 4;
export function memeAnnonce(e, x, y) {
  if (!e || e.conflits?.length) return false;
  const n4 = (e.ph?.liste ?? []).filter((d) => d <= QUASI).length;
  const peu = Math.min(x.emps?.length ?? 0, y.emps?.length ?? 0) <= 1;
  if (!(n4 >= 2 || (peu && n4 >= 1))) return false;
  return !!e.exact || (e.wj ?? 0) >= 0.5 || ((e.sim?.cont ?? 0) >= 0.8 && (e.sim?.communs ?? 0) >= 3);
}
// le doute : une photo quasi identique et un titre qui s'accorde un peu, sans conflit
const ressemble = (e) => !e.conflits?.length && (e.ph?.best ?? 99) <= QUASI && (!!e.exact || (e.wj ?? 0) >= 0.3 || (e.sim?.cont ?? 0) >= 0.5);
// une ancienne sans photo lisible (annonce supprimée, images purgées par Vinted) au titre
// IDENTIQUE, sans conflit : jamais une fusion (jamais le titre seul) — la question.
const sansPhoto = (e, x, y) => (!x.emps?.length || !y.emps?.length) && !!e.exact && !e.conflits?.length;
const lie = (e) => e.meme || ressemble(e) || e.sansPhoto;

/**
 * Une paire de fiches Vinted, à la manière de la règle : le TEXTE d'abord (deux
 * popcounts et des ensembles de mots), la photo seulement si le texte le permet —
 * les trois liens de la règle (même annonce, ressemblance, ancienne sans photo)
 * exigent tous l'absence de conflit et un accord minimal du titre. Mesuré le 08/10
 * (Bebertdeals, 200 fiches nouvelles) : 23 314 paires candidates, dont la plupart
 * sont le même modèle dans une autre taille — comparer leurs photos coûtait 0,7 s.
 * Rend null quand rien n'est possible.
 */
export function evaluerRemise(x, y) {
  const t = texte(x, y);
  if (t.conflits.length) return null;
  if (!(t.exact || t.wj >= 0.3 || t.sim.cont >= 0.5)) return null;
  const ph = comparerPhotos(x.emps, y.emps);
  const n4 = ph.liste.filter((d) => d <= QUASI).length;
  const photo = n4 >= 2 ? 'multi' : ph.best <= QUASI ? 'quasi' : ph.best <= 12 ? 'proche' : 'aucune';
  const e = { ...t, ph, photo, motif: 'photo_' + photo };
  e.meme = memeAnnonce(e, x, y); e.sansPhoto = sansPhoto(e, x, y);
  return e;
}

/**
 * La règle sur un compte. `N` = les nœuds de la passe (construireNoeuds).
 * Rend { decisions, bilan } ; decisions = remise_en_ligne | remise_en_ligne_a_verifier.
 * `exclus` : ids de fiches (sans « F ») qu'une autre règle de la même passe a déjà prises.
 */
export function remisesEnLigne(donnees, N, { portee = 'nouvelles', exclus = new Set(), S = SEUILS } = {}) {
  const actif = portee === 'toutes' || donnees.remise_en_ligne_actif === true;
  if (!actif) return { decisions: [], bilan: null };
  const t0 = Date.now();
  const releves = donnees.vinted_releves_complets ?? {};
  const NV = N.filter((n) => n.pf === 'vinted' && n.ref?.vinted_item_id && !exclus.has(String(n.ref.id)));
  const etat = new Map(NV.map((n) => [n.id, etatVinted(n.ref, releves)]));
  const nouvelles = new Set((donnees.vinted_nouvelles ?? []).map(String));
  const juges = NV.filter((n) => etat.get(n.id) === 'en_ligne' && (portee === 'toutes' || nouvelles.has(String(n.ref.id))));
  const bilan = { juges: juges.length, parties: 0, chaines: 0, fusions: 0, maillons: 0, a_verifier: 0, ambigus: 0, sans_ancienne: 0, ms: 0 };
  if (!juges.length) { bilan.ms = Date.now() - t0; return { decisions: [], bilan }; }
  pesee(N); // les mots pèsent comme dans le graphe complet

  const idx = new Map(NV.map((n, i) => [n.id, i]));
  const voisins = new Map(); // id → [{ autre, e }]
  const vues = new Set();
  const lier = (x, y) => {
    const k = cle(x.id, y.id); if (vues.has(k)) return; vues.add(k);
    const e = evaluerRemise(x, y);
    if (!e || !lie(e)) return;
    for (const [a, b] of [[x, y], [y, x]]) { if (!voisins.has(a.id)) voisins.set(a.id, []); voisins.get(a.id).push({ autre: b, e }); }
  };
  // Les paires candidates qui touchent une nouvelle fiche en ligne (index des photos et des
  // titres du moteur). Une fonction edge n'a que 2 s de CPU : on n'évalue d'abord QUE les
  // anciennes de la même boutique parties avant l'apparition de la nouvelle (sa chaîne
  // possible) ; les autres voisines (rivales en ligne, vendues, ou en ligne en même temps)
  // ne sont évaluées que pour une nouvelle qui a une chaîne.
  const jugesIds = new Set(juges.map((n) => n.id));
  const autresDe = new Map();
  for (const [i, j] of candidatsDe(NV, new Set(juges.map((n) => idx.get(n.id))))) {
    for (const [a, b] of [[NV[i], NV[j]], [NV[j], NV[i]]]) {
      if (!jugesIds.has(a.id)) continue;
      const st = etat.get(b.id);
      if (st === 'partie' && memeBoutique(b.ref, a.ref) && successives(b.ref, a.ref)) lier(a, b);
      else if (st === 'en_ligne' || st === 'vendue' || st === 'partie') { if (!autresDe.has(a.id)) autresDe.set(a.id, []); autresDe.get(a.id).push(b); }
    }
  }
  const parties = new Set();
  for (const h of juges) {
    const chaine = (voisins.get(h.id) ?? []).filter(({ autre }) => etat.get(autre.id) === 'partie');
    if (!chaine.length) continue;
    for (const { autre } of chaine) parties.add(autre.id);
    for (const b of autresDe.get(h.id) ?? []) lier(h, b);
  }
  bilan.parties = parties.size;

  const reclamees = new Map(); // ancienne → nouvelles qui la réclament
  const plans = [];
  for (const h of juges) {
    const vs = voisins.get(h.id) ?? [];
    // les anciennes de la même boutique, parties avant que la nouvelle n'apparaisse :
    // la chaîne = les MÊMES annonces ; à défaut, une ressemblance fait la question.
    const avant = vs.filter(({ autre, e }) => etat.get(autre.id) === 'partie' && memeBoutique(autre.ref, h.ref)
      && successives(autre.ref, h.ref) && lie(e));
    if (!avant.length) { bilan.sans_ancienne++; continue; }
    const fortes = avant.filter(({ e }) => e.meme);
    const preds = fortes.length ? fortes : avant;
    // les anciennes sans photo au titre identique, à côté d'une chaîne sûre : une question chacune
    const orphelines = fortes.length ? avant.filter(({ e }) => !e.meme && e.sansPhoto).map(({ autre }) => autre) : [];
    for (const { autre } of fortes) { if (!reclamees.has(autre.id)) reclamees.set(autre.id, new Set()); reclamees.get(autre.id).add(h.id); }
    plans.push({ h, preds, orphelines });
  }

  const decisions = [];
  const pris = new Set();
  const preuves = (e, extra = {}) => ({ motif: e.motif, photo: Number((e.ph?.best ?? 99).toFixed(1)), photo_niveau: e.photo, titre: Number((e.wj ?? 0).toFixed(2)),
    conflits: e.conflits ?? [], regle: 'rapprochement_v3', portee: 'remise_en_ligne', ...extra });
  for (const { h, preds, orphelines } of plans) {
    const membres = preds.map((p) => p.autre);
    const ids = new Set([h.id, ...membres.map((m) => m.id)]);
    const raisons = [];
    const rivaux = new Set();
    // (a) aucun concurrent : une autre annonce en ligne ou vendue qui ressemble, ou une
    //     ancienne qui a été en ligne en même temps que la nouvelle (deux exemplaires)
    for (const m of [h, ...membres]) {
      for (const { autre, e } of voisins.get(m.id) ?? []) {
        if (ids.has(autre.id) || !e.meme) continue; // un rival = la même annonce, vue ailleurs
        const st = etat.get(autre.id);
        if (st === 'en_ligne' || st === 'vendue') { raisons.push('exemplaire_' + st); rivaux.add(autre.id.slice(1)); continue; }
        if (st === 'partie' && m === h && memeBoutique(autre.ref, h.ref) && !successives(autre.ref, h.ref)) { raisons.push('ensemble_en_ligne'); rivaux.add(autre.id.slice(1)); }
      }
    }
    // (b) la chaîne : jamais deux anciennes en ligne ensemble ; une ancienne n'appartient qu'à une nouvelle
    const tri = membres.slice().sort((a, b) => premiereVue(a.ref) - premiereVue(b.ref));
    for (let i = 1; i < tri.length; i++) if (!successives(tri[i - 1].ref, tri[i].ref)) raisons.push('anciennes_ensemble');
    for (const m of membres) if ((reclamees.get(m.id)?.size ?? 0) > 1) raisons.push('ancienne_reclamee');
    if ([h, ...membres].some((n) => Number(n.ref.quantite ?? 1) > 1)) raisons.push('quantite');
    if ([h, ...membres].some((n) => pris.has(n.id))) { bilan.ambigus++; continue; }
    const tousForts = preds.every(({ e }) => e.meme);
    const meilleure = preds.slice().sort((a, b) => a.e.ph.best - b.e.ph.best)[0];
    if (!raisons.length && tousForts) {
      const garde = tri[0];
      decisions.push({ type: 'remise_en_ligne', garde: garde.id.slice(1), absorbe: h.id.slice(1), chaine: tri.slice(1).map((m) => m.id.slice(1)),
        motif: 'photo_identique', preuve: preuves(meilleure.e, { chaine: tri.length, vinted_vivante: h.ref.vinted_item_id, vinted_ancienne: garde.ref.vinted_item_id }) });
      bilan.chaines++; bilan.fusions++; bilan.maillons += tri.length - 1;
      for (const n of [h, ...membres]) pris.add(n.id);
      for (const o of orphelines) {
        if (pris.has(o.id)) continue;
        decisions.push({ type: 'remise_en_ligne_a_verifier', garde: garde.id.slice(1), absorbe: o.id.slice(1), motif: 'remise_en_ligne_ancienne_sans_photo',
          preuves: { motif: 'titre_identique_sans_photo', photo: null, titre: 1, conflits: [], regle: 'rapprochement_v3', portee: 'remise_en_ligne', vinted_vivante: h.ref.vinted_item_id } });
        bilan.a_verifier++; pris.add(o.id);
      }
      continue;
    }
    // le doute : UNE question par nouvelle fiche, avec sa meilleure ancienne
    const motif = raisons.length ? 'remise_en_ligne_' + [...new Set(raisons)].sort().join('_') : 'remise_en_ligne_' + (meilleure.e.motif || 'doute');
    decisions.push({ type: 'remise_en_ligne_a_verifier', garde: meilleure.autre.id.slice(1), absorbe: h.id.slice(1), motif,
      preuves: preuves(meilleure.e, { candidats_total: preds.length, raisons: [...new Set(raisons)], rivaux: [...rivaux].slice(0, 5),
        anciennes: tri.map((m) => m.id.slice(1)).slice(0, 8) }) });
    bilan.a_verifier++;
    pris.add(h.id);
  }
  bilan.ms = Date.now() - t0;
  return { decisions, bilan };
}
