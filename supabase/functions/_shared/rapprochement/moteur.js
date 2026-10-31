// ═══════════════════════════════════════════════════════════════════════════
// LE MOTEUR DE RAPPROCHEMENT v3 — toutes les plateformes, une passe (08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (07/10) : « un article n'entre JAMAIS dans le stock tant qu'il
// n'a pas été rapproché de tout ce que l'utilisateur a déjà ». Ses réponses du
// 08/10 nuit :
//   1. même photo + même titre DEUX fois sur UNE plateforme → question dédiée
//      « Annonce en double ? », hors du stock ; jamais de fusion automatique
//      entre deux annonces d'une même plateforme (deux exemplaires possibles) ;
//   2. photo identique mais titre ou taille contradictoires → « à vérifier » ;
//   3. titre identique sans photo commune → « à vérifier » (jamais de fusion
//      sur le titre seul) ;
//   5. « Ignorer » est définitif, même si la photo prouve le doublon ;
//   6. les décisions de la PERSONNE (oui, non, ignorer, rattachement manuel)
//      et les identifiants FillSell sont définitifs ; les décisions
//      automatiques (import, rattrapage_0710) sont rejugeables en réparation.
//
// CE QUE C'EST. Un graphe : un nœud par article Vinted (la base) ou article
// créé dans l'app, et un nœud par annonce relevée ailleurs (Leboncoin, Beebs,
// eBay, Opla). Une arête entre deux nœuds de plateformes différentes :
//   FORT  = même photo (deux paires, ou une quasi identique) ET un accord du
//           titre, aucun conflit de texte (type, couleur, taille, dimensions),
//           et AUCUN concurrent plausible des deux côtés ;
//   DOUTE = photo sans accord du titre, conflit, concurrent, photo seulement
//           proche, ou titre très proche sans photo commune ;
//   RIEN  = le reste.
// Les groupes se forment sur les arêtes fortes (une annonce par plateforme et
// par groupe) ; un groupe sans Vinted qui garde un doute vers un autre
// article part « à vérifier » en entier ; le reste est nouveau.
// ⛔ Jamais la photo seule (le titre doit au moins s'accorder), jamais le titre
//    seul (un doute, pas une fusion), jamais deux annonces de la même plateforme.
//
// Mesuré le 07/10 (phase 1, lecture seule) : Corinne 790 cartes → 518 + 112 à
// vérifier, 0 fusion à tort sur 355 vues une à une ; ses 31 « Oui » : 26
// retrouvés seuls, 5 à vérifier, 0 raté ; ses 18 « Non » : 0 fusionné.
// Ce fichier tourne tel quel dans Deno (fonction edge `rapprochement`) et dans
// Node (selftest) : aucune dépendance.
import { comparerPhotos, dPhoto , ham } from './photos.js';
import * as T from './texte.js';
import { idf, wjac } from './idf.js';

export const SEUILS = Object.freeze({ multi: 9, multi3: 12, quasi: 4, une: 7, proche: 12, plausible: 7 });
export const PLATEFORMES_RELEVE = Object.freeze(['leboncoin', 'beebs', 'ebay', 'opla', 'depop']);
let POIDS = () => 1;
/** Pèse les mots des titres sur ces nœuds (idf) sans lancer de passe — un sous-graphe
 *  (remises-en-ligne.js) qui appelle `evaluer` lui-même pèse comme le graphe complet. */
export function pesee(N) { POIDS = idf(N); }

// ── LES NŒUDS ───────────────────────────────────────────────────────────────
// `donnees` = ce que rend rapprochement_v3_lire (fiches, annonces, fusions,
// doublons) ; `photosDe(urls)` rend les photos comparables (photos.js).
// (12/10) `paresseux` : la passe en tranches (tranches.js) reconstruit les nœuds à
// chaque invocation ; leurs lectures (mots, couleurs, photos…) ne sont calculées
// qu'au premier accès — les MÊMES valeurs que mk(), seulement plus tard (une
// invocation qui ne compare rien ne lit ni titre ni photo).
export function construireNoeuds(donnees, photosDe, { maxPhotos = 6, paresseux = false } = {}) {
  const N = [];
  const vus = new Set();
  const fab = paresseux ? mkParesseux : (n, urls) => mk({ ...n, emps: photosDe(urls) });
  for (const f of donnees.fiches ?? []) {
    // Les articles importés d'un relevé sont représentés par leur annonce.
    if (String(f.origine ?? '').startsWith('releve_') || f.fusionne_dans) continue;
    if (!['stock', 'vendu'].includes(f.statut)) continue;
    const pf = f.vinted_item_id || f.origine === 'vinted_sync' ? 'vinted' : 'fiche';
    N.push(fab({ id: 'F' + f.id, pf, titre: f.titre, prix: f.prix, taille: f.taille, marque: f.marque,
      vendu: f.statut === 'vendu', ref: f }, (f.photos ?? []).slice(0, maxPhotos), photosDe));
    vus.add('F' + f.id);
  }
  // (v23) Une personne qui a déjà répondu « Non, deux exemplaires » à « Annonce en
  // double ? » garde la question : la republication n'est jamais déduite chez elle
  // (Louis duplique ses articles sur Beebs — mêmes photos, articles distincts).
  const repPermis = !(donnees.doublons ?? []).some((d) => d.motif === 'annonce_en_double' && d.statut === 'refusee' && d.decide_par === 'utilisateur');
  for (const a of donnees.annonces ?? []) {
    if (!PLATEFORMES_RELEVE.includes(a.platform)) continue;
    if (a.ignoree_par_utilisateur) continue;           // (5) définitif
    if (a.hors_liste || a.ebay_bloque) continue;        // jamais rien sur un relevé non probant
    // (v23) dn : la clé de la description (rapprochement_v3_lire : desc_h, rendue
    // seulement pour 20 caractères et plus) ; lot : « lot / plusieurs / au choix » ;
    // nRef : les photos que l'annonce porte (une photo sans empreinte se voit).
    const urls = (a.photos ?? []).slice(0, maxPhotos);
    N.push(fab({ id: 'A' + a.id, pf: a.platform, titre: a.titre, prix: a.prix, taille: a.taille, marque: a.marque,
      vendu: false, ref: a, dn: a.desc_h ?? '', lot: a.desc_lot === true, nRef: urls.length, rp: repPermis }, urls, photosDe));
  }
  return N;
}
function mk(n) {
  n.ty = T.types(n.titre); n.co = T.couleurs(n.titre); n.tl = T.sansTailleUnique(T.tailles(n.titre, n.taille)); n.je = T.jetons(n.titre);
  n.di = T.dimensions(n.titre); n.ma = T.marqueUtile(n.marque); n.tn = T.norm(n.titre).replace(/[^a-z0-9 ]/g, '').trim();
  n.ge = T.genres(n.titre);
  n.emps = Array.isArray(n.emps) ? n.emps.filter(Boolean) : [];
  return n;
}
function paresse(n, cle, f) {
  Object.defineProperty(n, cle, { configurable: true, enumerable: true,
    get() { const v = f(); Object.defineProperty(n, cle, { value: v, writable: true, enumerable: true, configurable: true }); return v; } });
}
function mkParesseux(n, urls, photosDe) {
  paresse(n, 'ty', () => T.types(n.titre)); paresse(n, 'co', () => T.couleurs(n.titre));
  paresse(n, 'tl', () => T.sansTailleUnique(T.tailles(n.titre, n.taille))); paresse(n, 'je', () => T.jetons(n.titre));
  paresse(n, 'di', () => T.dimensions(n.titre)); paresse(n, 'ma', () => T.marqueUtile(n.marque));
  paresse(n, 'tn', () => T.norm(n.titre).replace(/[^a-z0-9 ]/g, '').trim());
  paresse(n, 'ge', () => T.genres(n.titre));
  paresse(n, 'emps', () => { const e = photosDe(urls); return Array.isArray(e) ? e.filter(Boolean) : []; });
  return n;
}

// ── LES PREUVES ET DÉCISIONS DÉJÀ ACQUISES (jamais rejugées) ────────────────
// « oui » : identifiant d'un dépôt FillSell, rattachement / fusion / import
// faits par la personne ; « non » : refus de la personne. Le rattrapage du
// 07/10 (photo_rattrapage_0710) est automatique : il ne force rien.
export function forcesDe(donnees) {
  const F = new Map((donnees.fiches ?? []).map((f) => [String(f.id), f]));
  const parFiche = new Map();
  for (const a of donnees.annonces ?? []) if (a.inventaire_id) { const k = String(a.inventaire_id); if (!parFiche.has(k)) parFiche.set(k, []); parFiche.get(k).push(a); }
  const rep = (fid) => {
    const f = F.get(String(fid)); if (!f) return null;
    if (!String(f.origine ?? '').startsWith('releve_')) return 'F' + f.id;
    const l = parFiche.get(String(f.id)) ?? []; return l.length ? 'A' + l[0].id : null;
  };
  const gestes = new Set((donnees.fusions ?? []).filter((x) => !x.defaite && /^utilisateur/.test(x.par ?? '') && !/rattrapage_0710|photo_auto|photo_rapprochement|photo_go_nico/.test(x.par ?? '')).map((x) => String(x.garde)));
  const out = [];
  for (const a of donnees.annonces ?? []) {
    if (!a.inventaire_id) continue;
    const parJob = a.source === 'job' || a.derniere_par === 'job';
    const parPersonne = a.source === 'manuel' || a.derniere_par === 'utilisateur' || gestes.has(String(a.inventaire_id));
    if (!parJob && !parPersonne) continue;
    const x = 'A' + a.id, y = rep(a.inventaire_id);
    if (y && y !== x) out.push([x, y, 'oui', parJob ? 'preuve_identifiant' : 'oui_utilisateur']);
  }
  for (const d of donnees.doublons ?? []) {
    // (11/10) Une paire close par la règle d'attribut distinctif vaut un « non ».
    // (15/10) Une paire close par l'IA (« deux pièces », rapprochement-ia) aussi :
    // la question n'est jamais reposée.
    if ((d.decide_par !== 'utilisateur' && d.decide_par !== 'regle' && d.decide_par !== 'ia') || d.statut !== 'refusee') continue;
    const ga = [rep(d.garde), ...(parFiche.get(String(d.garde)) ?? []).map((a) => 'A' + a.id)].filter(Boolean);
    const gb = [rep(d.absorbe), ...(parFiche.get(String(d.absorbe)) ?? []).map((a) => 'A' + a.id)].filter(Boolean);
    for (const x of ga) for (const y of gb) if (x !== y) out.push([x, y, 'non', 'refus_utilisateur']);
  }
  return out;
}

// ── LE TEXTE DE DEUX NŒUDS ──────────────────────────────────────────────────
export function texte(x, y) {
  const ty = T.typesCompatibles2(x.ty, y.ty), co = T.couleursCompatibles2(x.co, y.co), tl = T.taillesCompatibles(x.tl, y.tl);
  const di = T.dimensionsCompatibles(x.di, y.di);
  const ma = (x.ma && y.ma) ? (x.ma === y.ma || x.ma.includes(y.ma) || y.ma.includes(x.ma)) : null;
  const sim = T.similarite(x.je, y.je); const wj = wjac(x.je, y.je, POIDS);
  // (11/10) Attribut distinctif (couleur stricte, nombre qui dit l'objet) :
  // même règle que la garde en base — deux variantes ne sont jamais un doute.
  const dist = T.attributDistinctif(x.titre, y.titre);
  const conflits = [ty === false && 'type', (co === false || dist === 'couleur') && 'couleur', tl === false && 'taille',
    di === false && 'dimensions', dist === 'nombre' && 'nombre'].filter(Boolean);
  const exact = !!x.tn && x.tn === y.tn;
  const accordFort = exact || wj >= 0.5 || (sim.cont >= 0.6 && sim.communs >= 2);
  const memeType = T.typesCompatibles(x.ty, y.ty) === true;
  const accordMoyen = accordFort || (memeType && co !== false);
  const accordFaible = accordFort || memeType || sim.cont >= 0.5 || wj >= 0.3;
  const titreSansPhoto = exact || (wj >= 0.6 && sim.jac >= 0.6);
  return { ty, co, tl, di, ma, sim, wj, conflits, accordFort, accordMoyen, accordFaible, titreSansPhoto, exact };
}

// ── L'ARÊTE ─────────────────────────────────────────────────────────────────
export function evaluer(x, y, S = SEUILS) {
  const ph = comparerPhotos(x.emps, y.emps);
  // Sans photo proche, seul un titre très proche (jac ≥ 0,6, ou inclus avec
  // ≥ 3 mots, ou exact) peut faire un doute : on le vérifie à peu de frais
  // avant tout le texte (une paire candidate sur deux n'a ni l'un ni l'autre).
  if (ph.best > S.proche) {
    const sim0 = T.similarite(x.je, y.je);
    const exact0 = !!x.tn && x.tn === y.tn;
    if (!exact0 && sim0.jac < 0.59 && !(sim0.cont === 1 && sim0.communs >= 3)) {
      return { niveau: 'rien', motif: '', ph, photo: 'aucune', prixR: null, sim: sim0, wj: 0, conflits: [] };
    }
  }
  const t = texte(x, y);
  const prixR = (x.prix > 0 && y.prix > 0) ? Math.max(x.prix, y.prix) / Math.min(x.prix, y.prix) : null;
  const nMulti = ph.liste.filter((d) => d <= S.multi).length, nMulti3 = ph.liste.filter((d) => d <= S.multi3).length;
  const photo = (nMulti >= 2 || nMulti3 >= 3) ? 'multi' : ph.best <= S.quasi ? 'quasi' : ph.best <= S.une ? 'une' : ph.best <= S.proche ? 'proche' : 'aucune';
  let niveau = 'rien', motif = '';
  const c = t.conflits;
  // (11/10, Louis) Un attribut DISTINCTIF différent (couleur, nombre, taille,
  // dimension) écarte la paire d'office : ni rattachement, ni question — même
  // photo comprise (un vendeur photographie pareil toutes ses couleurs).
  // (15/10, v23 — P16) « fille » contre « garçon » (« femme » contre « homme ») :
  // un conflit — jamais fort, jamais un concurrent plausible —, sauf quand
  // plusieurs photos sont identiques (une basket unisexe rangée « fille » ici,
  // « garçon » là). Mesuré sur 9 comptes : 2 forts douteux retirés, aucun
  // « oui » de la personne perdu.
  if (photo !== 'multi' && T.genresOpposes(x.ge, y.ge)) { c.push('genre'); t.conflits = c; }
  const distinctifs = c.filter((k) => k === 'couleur' || k === 'nombre' || k === 'taille' || k === 'dimensions');
  if (distinctifs.length) {
    return { niveau: 'rien', motif: 'attribut_distinctif_' + distinctifs.join('_'), ph, photo, prixR, sim: t.sim, wj: t.wj, conflits: c };
  }
  if (photo === 'multi') {
    if (!c.length && t.accordFaible) { niveau = 'fort'; motif = 'photo_multi'; } else { niveau = 'doute'; motif = 'photo_multi_' + (c.join('_') || 'titre_different'); }
  } else if (photo === 'quasi') {
    if (!c.length && t.accordMoyen) { niveau = 'fort'; motif = 'photo_quasi'; } else { niveau = 'doute'; motif = 'photo_quasi_' + (c.join('_') || 'titre_different'); }
  } else if (photo === 'une') {
    if (!c.length && t.accordFort) { niveau = 'fort'; motif = 'photo_une'; }
    else if (t.accordFaible) { niveau = 'doute'; motif = 'photo_une_' + (c.join('_') || 'titre_faible'); }
  } else if (photo === 'proche' && !c.length && t.accordFaible) {
    niveau = 'doute'; motif = 'photo_proche';
  } else if (!c.length && t.titreSansPhoto && t.ty !== false && t.ma !== false && (prixR == null || prixR <= 2)) {
    niveau = 'doute'; motif = 'titre_sans_photo';
  } else if (!c.length && t.sim.cont === 1 && t.sim.communs >= 3 && t.ty !== false && t.ma !== false && ph.best <= 14 && (prixR == null || prixR <= 2)) {
    niveau = 'doute'; motif = 'titre_inclus_photo_voisine';
  }
  return { niveau, motif, ph, photo, prixR, ...t };
}


// ── (15/10, v23 — P16) LA REPUBLICATION : UNE ANNONCE PUBLIÉE DEUX FOIS ─────
// Deux annonces d'une MÊME plateforme de relevé sont le même objet quand TOUT
// est identique : chaque photo (au moins deux, toutes lues, autant de chaque
// côté, appariées à ≤ 2), le titre, la description (clé, 20 caractères et
// plus), le prix ; ni « lot / plusieurs / au choix », ni quantité > 1.
// Jamais le titre seul, jamais titre + prix (R12) : la photo ET le texte de
// l'annonce, entiers. Chez ferreirasab : 96 paires Leboncoin (même description,
// publiées le 11/09 puis le 30/09), 1 chez Louis, 0 ailleurs (9 comptes).
// La base revérifie le texte, le prix et la description avant d'écrire
// (rapprochement_republication_prouvee) et note le lien (objet_de) : à la
// vente, les DEUX annonces sont retirées.
// Le titre normalisé EXACTEMENT comme la base (rapprochement_texte_norm) : le moteur
// n'envoie jamais une republication que la base refuserait (l'annonce resterait hors stock).
const DE_SQL = 'ÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑŸàâäáãåéèêëíìîïóòôöõúùûüçñÿœŒæÆ';
const EN_SQL = 'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyoOaA';
export const normCommeLaBase = (t) => [...String(t ?? '')].map((c) => { const i = DE_SQL.indexOf(c); return i >= 0 ? EN_SQL[i] : c; }).join('').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function republication(x, y, ph) {
  if (x.pf !== y.pf || !PLATEFORMES_RELEVE.includes(x.pf)) return false;
  if (!x.rp || !y.rp) return false;
  if (x.ref?.ignoree || y.ref?.ignoree) return false;
  if (x.lot || y.lot) return false;
  if ((Number(x.ref?.quantite ?? 1) || 1) > 1 || (Number(y.ref?.quantite ?? 1) || 1) > 1) return false;
  if (!(Number(x.prix) > 0) || Number(x.prix) !== Number(y.prix)) return false;
  if (!x.tn || x.tn !== y.tn) return false;
  const tx = normCommeLaBase(x.titre); if (!tx || tx !== normCommeLaBase(y.titre)) return false;
  if (!x.dn || x.dn !== y.dn) return false;
  const n = x.emps.length;
  if (n < 2 || y.emps.length !== n || (x.nRef ?? n) !== n || (y.nRef ?? n) !== n) return false;
  return (ph?.liste ?? []).filter((d) => d <= 2).length === n;
}

// ── (31/10, lot F — Johan) LA SUCCESSION : UNE ANNONCE REMISE EN LIGNE SUR LA MÊME PLATEFORME ──
// Deux annonces d'une même plateforme de relevé, mêmes photos (au moins deux quasi identiques, une seule si l'une
// n'en a qu'une), titre proche sans conflit (la paire « memes » l'exige déjà), ni lot ni quantité > 1, et JAMAIS vues
// par le même relevé (run_id différents) : l'une a remplacé l'autre. Le prix, une photo ajoutée, la description
// peuvent avoir changé. Ce n'est JAMAIS une fusion automatique (la base n'admet deux annonces d'une plateforme sur une
// fiche que pour la republication prouvée) : l'annonce ouverte devient la question « Est-ce le même article ? » vers
// la fiche de l'autre, HORS du stock (étape 5). Deux annonces vues par le même relevé restent deux exemplaires.
export function succession(x, y, ph) {
  if (x.pf !== y.pf || !PLATEFORMES_RELEVE.includes(x.pf)) return false;
  const rx = String(x.ref?.run_id ?? ''), ry = String(y.ref?.run_id ?? '');
  if (!rx || !ry || rx === ry) return false;
  if (x.lot || y.lot) return false;
  if ((Number(x.ref?.quantite ?? 1) || 1) > 1 || (Number(y.ref?.quantite ?? 1) || 1) > 1) return false;
  const n4 = (ph?.liste ?? []).filter((d) => d <= SEUILS.quasi).length;
  const peu = Math.min(x.emps?.length ?? 0, y.emps?.length ?? 0) <= 1;
  return n4 >= 2 || (peu && n4 >= 1);
}

// ── LES PAIRES CANDIDATES : index des photos (tiroirs) et des mots ──────────
// Mesuré sur Corinne (951 nœuds, 16 236 lectures) : 420 paires de nœuds ont
// une photo commune (≤ 7). Un index sur le dHash seul ne discrimine rien (fonds
// blancs : mêmes octets partout, 410 000 paires) ; deux tiroirs qui ne manquent
// AUCUNE de ces 420 paires :
//   · le pHash en 4 tranches de 16 bits (22 264 paires candidates) ;
//   · dHash et pHash joints octet par octet, 8 tranches (31 215 paires).
// Leur union est candidate ; le reste est « rien » par construction (evaluer ne
// rend fort/doute qu'avec une photo ≤ 12 ou un titre très proche — les titres
// ont leur propre index). Un tiroir trop plein (photo de catalogue) est ignoré.
// (08/10 nuit) Un compte à cinq plateformes (de63ca45 : 785 nœuds, 3 811 photos)
// faisait 114 530 paires candidates — 37 % de toutes les paires — et 3,2 s de
// passe : la fonction edge mourait (546, 2 s de CPU). Désormais une collision
// dans un tiroir ne retient la paire que si LES DEUX LECTURES qui collisionnent
// sont à ≤ COLLISION_MAX l'une de l'autre (distance exacte, deux popcounts) :
// la paire dont la photo est vraiment proche collisionne par cette lecture-là
// et reste candidate ; les voisines de tiroir sans ressemblance tombent ici au
// lieu d'être comparées photo par photo (de63ca45 : 114 530 → quelques
// milliers, passe 3,2 s → ~0,3 s ; plans de Corinne et de63ca45 relus).
const TIROIR_MAX = 300;
const COLLISION_MAX = 16; // au-delà de « proche » (12) : une lecture voisine passe encore à l'évaluation complète
const dLectureIdx = (a, b) => Math.max(ham(a.d, b.d), ham(a.p, b.p) * 0.8);
const octets = (h) => [h[0] >>> 24, (h[0] >>> 16) & 255, (h[0] >>> 8) & 255, h[0] & 255, h[1] >>> 24, (h[1] >>> 16) & 255, (h[1] >>> 8) & 255, h[1] & 255];
function clesDe(l) {
  const d = octets(l.d), p = octets(l.p);
  const out = [(0 << 16) | (l.p[0] >>> 16), (1 << 16) | (l.p[0] & 65535), (2 << 16) | (l.p[1] >>> 16), (3 << 16) | (l.p[1] & 65535)];
  for (let i = 0; i < 8; i++) out.push(((8 + i) << 16) | (d[i] << 8) | p[i]);
  return out;
}
// (08/10 nuit) `actifs` : en mode normal, seules les paires qui touchent une
// annonce encore à décider comptent (planifier ignore les autres groupes) ; on
// ne les construit donc même pas — 7373c96c (1 603 nœuds, 8 204 photos de
// catalogue quasi identiques, 78 991 arêtes) prenait 11 s de passe ; sa synchro
// quotidienne n'a que ses nouvelles annonces à ranger. Le compte des concurrents
// (ambigu_plusieurs) ne voit alors plus une annonce déjà rattachée de la même
// plateforme : c'est la garde de la base (« deux exemplaires », une annonce par
// plateforme et par article) qui tient cette ligne, jamais une fusion à tort.
export function candidatsDe(N, actifs = null) {
  const paires = new Set();
  const cle = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
  const retenue = (i, j) => !actifs || actifs.has(i) || actifs.has(j);
  const tiroirs = new Map();
  for (let i = 0; i < N.length; i++) {
    for (const ph of N[i].emps) for (const l of ph.lectures) {
      for (const k of clesDe(l)) { let t = tiroirs.get(k); if (!t) { t = []; tiroirs.set(k, t); } t.push(i, l); }
    }
  }
  for (const [, t] of tiroirs) {
    const n = t.length / 2;
    if (n < 2 || n > TIROIR_MAX) continue;
    for (let a = 0; a < t.length; a += 2) for (let b = a + 2; b < t.length; b += 2) {
      if (t[a] === t[b] || !retenue(t[a], t[b])) continue;
      const k = cle(t[a], t[b]);
      if (paires.has(k)) continue;
      if (dLectureIdx(t[a + 1], t[b + 1]) <= COLLISION_MAX) paires.add(k);
    }
  }
  // titres : les paires qui partagent assez de mots pour qu'un « titre très proche »
  // (jac ≥ 0,6) ou un « titre inclus » (cont = 1, ≥ 3 mots) soit possible
  // Par nœud : ses mots, les nœuds qui les portent (un mot porté par plus de
  // MOT_MAX titres ne discrimine rien ; deux titres jumeaux partagent aussi
  // leurs mots rares), le compte des mots communs — jamais une carte globale
  // de toutes les paires (coronado : 2 s à cause des mots communs des titres longs).
  const MOT_MAX = 500;
  const parMot = new Map();
  for (let i = 0; i < N.length; i++) for (const m of N[i].je) { let l = parMot.get(m); if (!l) { l = []; parMot.set(m, l); } l.push(i); }
  const communs = new Map();
  for (let i = 0; i < N.length; i++) {
    communs.clear();
    const na = N[i].je.size;
    for (const m of N[i].je) {
      const l = parMot.get(m); if (!l || l.length > MOT_MAX) continue;
      for (const j of l) if (j > i) communs.set(j, 1);
    }
    for (const j of communs.keys()) {
      // le compte EXACT des mots communs (les mots trop fréquents comptent aussi)
      let c = 0; const A = N[i].je, B = N[j].je;
      if (A.size <= B.size) { for (const m of A) if (B.has(m)) c++; } else { for (const m of B) if (A.has(m)) c++; }
      const nb = B.size, petit = Math.min(na, nb);
      if (!retenue(i, j)) continue;
      if (c / (na + nb - c) >= 0.59 || (c >= 3 && c === petit)) paires.add(cle(i, j));
    }
  }
  const out = [];
  for (const k of paires) out.push([Math.floor(k / 100000), k % 100000]);
  return out;
}

// ── LES MÊMES PAIRES, EN TRANCHES (12/10) ───────────────────────────────────
// Le compte de ferreirasab (3 082 nœuds, 59 028 lectures, 708 336 entrées de
// tiroirs : vêtements d'enfant sur fond blanc) faisait 1,2 s de candidatsDe à lui
// seul — deux fois par passe — et la fonction mourait à chaque passe (CPU Time
// exceeded, 2,4 à 3,2 s). La même liste, en morceaux bornés :
//   · PHOTOS. Les tiroirs se répartissent en P parts par leur clé (clé % P) :
//     une part ne garde que les tiroirs de ses clés — TOUTES les entrées d'une
//     clé sont dans la même part, donc n (la taille du tiroir) est exact. Une
//     part se parcourt elle-même par morceaux de tiroirs (dans l'ordre de leur
//     première entrée), l'horloge relue entre deux tiroirs. Chaque paire retenue
//     sort avec sa POSITION dans la boucle d'origine : (première entrée du
//     tiroir, entrée a, entrée b), les entrées numérotées dans l'ordre exact où
//     candidatsDe les pousse. candidatsDe parcourt ses tiroirs dans l'ordre de
//     leur première entrée et ses paires (a < b) dans l'ordre des entrées : la
//     plus petite position d'une paire, tous morceaux confondus, est l'endroit
//     où candidatsDe l'aurait ajoutée.
//   · TITRES. La boucle des titres (i croissant) se découpe par plages de i ;
//     chaque plage rend ses paires dans l'ordre d'origine.
//   · L'ASSEMBLAGE trie les paires photo par position, puis ajoute les paires
//     de titres qui n'y sont pas, dans leur ordre : la liste de candidatsDe, à
//     l'identique et dans le même ordre (prouvé sur les comptes réels :
//     selftest rapprochement-tranches).
/** Les entrées de tiroirs de N (lectures × 12 clés) : sert à choisir P. */
export function entreesDe(N) { let n = 0; for (const x of N) for (const ph of x.emps) n += ph.lectures.length * 12; return n; }
/**
 * Un morceau de la part r (sur P) des paires photo, à partir de son tiroir n° `depuis`
 * (ordre de première entrée), tant que `continuer()` (relu tous les 64 tiroirs ; au
 * moins un tiroir). Rend { paires: [cle, premiere, a, b, …], suivant } (suivant = -1 : la part est finie).
 */
export function candidatsPhotoPartie(N, actifs, P, r, depuis = 0, continuer = () => true) {
  const cle = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
  const retenue = (i, j) => !actifs || actifs.has(i) || actifs.has(j);
  const tiroirs = new Map();
  let seq = 0;
  for (let i = 0; i < N.length; i++) {
    for (const ph of N[i].emps) for (const l of ph.lectures) {
      for (const k of clesDe(l)) {
        if (k % P === r) { let t = tiroirs.get(k); if (!t) { t = []; tiroirs.set(k, t); } t.push(i, l, seq); }
        seq++;
      }
    }
  }
  const vus = new Set();
  const out = [];
  let rang = -1, suivant = -1;
  for (const [, t] of tiroirs) {
    rang++;
    if (rang < depuis) continue;
    if (rang > depuis && (rang & 63) === 0 && !continuer()) { suivant = rang; break; }
    const n = t.length / 3;
    if (n < 2 || n > TIROIR_MAX) continue;
    const premiere = t[2];
    for (let a = 0; a < t.length; a += 3) for (let b = a + 3; b < t.length; b += 3) {
      if (t[a] === t[b] || !retenue(t[a], t[b])) continue;
      const k = cle(t[a], t[b]);
      if (vus.has(k)) continue;
      if (dLectureIdx(t[a + 1], t[b + 1]) <= COLLISION_MAX) { vus.add(k); out.push(k, premiere, t[a + 2], t[b + 2]); }
    }
  }
  return { paires: out, suivant };
}
/**
 * Les paires de titres pour i dans [i0, …), tant que `continuer()` (relu tous les 32 i ;
 * au moins un i) : la seconde moitié de candidatsDe, mot pour mot, sans le dédoublonnage
 * (fait à l'assemblage). Rend { paires: [cle, …], suivant } (suivant = -1 : fini).
 */
export function candidatsTitresPartie(N, actifs, i0 = 0, continuer = () => true) {
  const cle = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
  const retenue = (i, j) => !actifs || actifs.has(i) || actifs.has(j);
  const MOT_MAX = 500;
  const parMot = new Map();
  for (let i = 0; i < N.length; i++) for (const m of N[i].je) { let l = parMot.get(m); if (!l) { l = []; parMot.set(m, l); } l.push(i); }
  const communs = new Map();
  const out = [];
  let i = i0;
  for (; i < N.length; i++) {
    if (i > i0 && (i & 31) === 0 && !continuer()) break;
    communs.clear();
    const na = N[i].je.size;
    for (const m of N[i].je) {
      const l = parMot.get(m); if (!l || l.length > MOT_MAX) continue;
      for (const j of l) if (j > i) communs.set(j, 1);
    }
    for (const j of communs.keys()) {
      let c = 0; const A = N[i].je, B = N[j].je;
      if (A.size <= B.size) { for (const m of A) if (B.has(m)) c++; } else { for (const m of B) if (A.has(m)) c++; }
      const nb = B.size, petit = Math.min(na, nb);
      if (!retenue(i, j)) continue;
      if (c / (na + nb - c) >= 0.59 || (c >= 3 && c === petit)) out.push(cle(i, j));
    }
  }
  return { paires: out, suivant: i >= N.length ? -1 : i };
}
/**
 * L'assemblage : `photo` = les morceaux photo (toutes parts, n'importe quel ordre),
 * `titres` = les morceaux de titres DANS L'ORDRE de i. Rend la liste de candidatsDe(N, actifs).
 */
export function candidatsAssembler(photo, titres) {
  // Chaque morceau sort déjà trié par position (ses tiroirs dans l'ordre de leur
  // première entrée, ses paires dans l'ordre des entrées) : une fusion des morceaux
  // (tas binaire sur leur tête) donne toutes les occurrences dans l'ordre des
  // positions ; la première occurrence d'une paire est sa plus petite position.
  const plus = (p, q, u, v) => p[q + 1] - u[v + 1] || p[q + 2] - u[v + 2] || p[q + 3] - u[v + 3];
  const tas = [];   // [morceau, indice]
  const avant = (x, y) => plus(x[0], x[1], y[0], y[1]) < 0;
  const monter = (i) => { while (i > 0) { const j = (i - 1) >> 1; if (!avant(tas[i], tas[j])) break; [tas[i], tas[j]] = [tas[j], tas[i]]; i = j; } };
  const descendre = (i) => { for (;;) { const g = 2 * i + 1, d = g + 1; let m = i;
    if (g < tas.length && avant(tas[g], tas[m])) m = g; if (d < tas.length && avant(tas[d], tas[m])) m = d;
    if (m === i) return; [tas[i], tas[m]] = [tas[m], tas[i]]; i = m; } };
  for (const p of photo) if (p.length) { tas.push([p, 0]); monter(tas.length - 1); }
  const paires = new Set();
  while (tas.length) {
    const h = tas[0];
    paires.add(h[0][h[1]]);
    h[1] += 4;
    if (h[1] >= h[0].length) { const der = tas.pop(); if (tas.length) { tas[0] = der; descendre(0); } } else descendre(0);
  }
  for (const t of titres) for (const k of t) paires.add(k);
  const out = [];
  for (const k of paires) out.push([Math.floor(k / 100000), k % 100000]);
  return out;
}

// ── LES PAIRES ÉVALUÉES (12/10 : sorties de rapprocher pour être découpées) ──
// Les étapes 1 (arêtes entre plateformes) et 2 (deux annonces d'une même
// plateforme) de rapprocher, sur les candidates [k0, k1) : chaque liste garde
// l'ordre des candidates, comme les deux boucles d'origine (elles sont
// indépendantes : aucune ne lit ce que l'autre écrit).
// `indices` (optionnel) : reçoit, dans le même ordre, l'indice de la candidate
// de chaque arête (indices.aretes) et de chaque paire d'une même plateforme (indices.memes).
export function paireAretes(N, cand, k0, k1, S = SEUILS, indices = null) {
  const aretes = [], memes = [];
  for (let k = k0; k < k1; k++) {
    const [i, j] = cand[k];
    const x = N[i], y = N[j];
    if (x.pf !== y.pf) {
      const e = evaluer(x, y, S);
      e.x = x; e.y = y;
      if (e.niveau !== 'rien' || e.ph.best <= S.plausible) { aretes.push(e); if (indices) indices.aretes.push(k); }
      continue;
    }
    if (!x.emps.length || !y.emps.length) continue;
    // Une annonce publiée deux fois porte la même couverture : la couverture
    // d'abord (36 lectures), le reste seulement si elle est proche — coronado,
    // 643 articles Vinted de catalogue : 60 000 paires × 1 296 lectures sinon.
    // (31/10, lot F — Johan) Une annonce REMISE EN LIGNE peut avoir reçu une photo de plus en couverture (Pull & Bear :
    // d061f0c9… devant les cinq d'avant) : pour deux annonces vues par des relevés DIFFÉRENTS (une succession
    // possible), la couverture de l'une est aussi comparée à la deuxième photo de l'autre — trois lectures au plus.
    if (dPhoto(x.emps[0], y.emps[0]) > S.proche) {
      const successives = String(x.ref?.run_id ?? '') !== String(y.ref?.run_id ?? '');
      if (!successives) continue;
      const decalee = (y.emps[1] && dPhoto(x.emps[0], y.emps[1]) <= S.proche) || (x.emps[1] && dPhoto(x.emps[1], y.emps[0]) <= S.proche);
      if (!decalee) continue;
    }
    const ph = comparerPhotos(x.emps, y.emps); if (ph.best > S.plausible) continue;
    const t = texte(x, y);
    if (!t.conflits.length && (t.sim.cont >= 0.5 || t.wj >= 0.4)) { memes.push({ x, y, ph, t, rep: republication(x, y, ph) }); if (indices) indices.memes.push(k); }
  }
  return { aretes, memes };
}

/** Le calcul d'un seul tenant (la passe d'avant, telle quelle). */
export const CALCUL_DIRECT = Object.freeze({
  candidats: (_etiquette, N, actifs) => candidatsDe(N, actifs),
  paires: (_etiquette, N, cand, S) => paireAretes(N, cand, 0, cand.length, S),
});

// ── LA PASSE ────────────────────────────────────────────────────────────────
// `poidsDe` : les nœuds qui pèsent les mots (idf) — par défaut N ; un sous-graphe
// (fiches-main.js) passe le graphe complet pour peser ses titres comme lui.
// `calcul` (12/10) : d'où viennent les candidates et les paires évaluées —
// CALCUL_DIRECT (tout de suite, d'un seul tenant) ou la passe en tranches
// (tranches.js : reprises d'une invocation à l'autre). `etiquette` nomme ce
// graphe dans la passe ('principal', 'main'…), pour les retrouver.
export function rapprocher(N, { S = SEUILS, forces = [], actifs = null, poidsDe = null, calcul = CALCUL_DIRECT, etiquette = 'principal' } = {}) {
  POIDS = idf(poidsDe ?? N);
  const parPf = new Map(); for (const n of N) { if (!parPf.has(n.pf)) parPf.set(n.pf, []); parPf.get(n.pf).push(n); }
  const aretes = [];
  const t0 = Date.now();
  // 1. les paires CANDIDATES seulement (08/10 soir : une fonction edge n'a que
  //    2 s de CPU par requête — 274 M comparaisons de lectures pour Corinne, c'était
  //    3 s ; dbca7f39, 3 009 articles, tuait la fonction, HTTP 546). Deux index :
  //    · photos : chaque lecture (dHash et pHash) découpée en 13 tranches de 5
  //      bits ; deux empreintes à ≤ 12 bits partagent au moins une tranche
  //      (tiroirs) — toute paire « proche » (≤ 12) est donc candidate ;
  //    · titres : les paires qui partagent assez de mots pour que « titre très
  //      proche » (jac ≥ 0,6) ou « titre inclus » (cont = 1, ≥ 3 mots) soit possible.
  //    Les paires hors candidates sont « rien » par construction (evaluer ne
  //    rend fort/doute qu'avec une photo ≤ 12 ou un titre très proche).
  const cand = calcul.candidats(etiquette, N, actifs);
  // (les arêtes entre plateformes ; et, pour l'étape 2, les annonces d'une même
  // plateforme qui se ressemblent — paireAretes, même ordre que les candidates)
  const { aretes: evaluees, memes } = calcul.paires(etiquette, N, cand, S);
  for (const e of evaluees) aretes.push(e);
  // 2. concurrents PLAUSIBLES : même photo (≤ 7) ET titre proche, sans conflit.
  //    Deux annonces d'une MÊME plateforme ainsi liées = deux exemplaires (ou une
  //    annonce en double) : aucune annonce d'ailleurs ne peut savoir laquelle elle est.
  const plausible = (e) => e.ph.best <= S.plausible && !e.conflits.length && (e.sim.cont >= 0.5 || e.wj >= 0.4);
  const partagee = new Map();
  const pairesMemePlateforme = [];
  // (v23) LA REPUBLICATION : les deux annonces sont UN objet (rfind = son
  // représentant) — elle ne fait ni « deux exemplaires », ni « Annonce en double ? ».
  const repParent = new Map();
  const rfind = (a) => { while (repParent.has(a) && repParent.get(a) !== a) a = repParent.get(a); return a; };
  const republicationsPaires = [];
  // (31/10, lot F — Johan) LA REMISE EN LIGNE SUR UNE MÊME PLATEFORME : deux annonces aux mêmes photos qui n'ont PAS
  // été vues par le même relevé (run_id différents : la plus ancienne a quitté la liste quand l'autre y est apparue)
  // sont une succession, pas deux exemplaires en ligne ensemble. Johan recrée ses annonces Leboncoin hors de FillSell
  // en changeant le prix (Michael Kors 25 → 20 €) ou en ajoutant une photo (Pull & Bear) : la republication v23
  // (tout identique) ne les reconnaissait pas, « trois annonces sur la même photo » (ancienne + deux recréations)
  // passait pour un vendeur de lots (« rien »), et la nouvelle annonce CRÉAIT une fiche dans le stock — contre la règle
  // du 07/10 (un doute n'entre jamais au stock). successionsDe : annonce → [{ autre, e }], servies à l'étape 5.
  const successionsDe = new Map();
  for (const { x, y, ph, t, rep } of memes) {
    if (rep) {
      for (const n of [x, y]) if (!repParent.has(n.id)) repParent.set(n.id, n.id);
      const ra = rfind(x.id), rb = rfind(y.id); if (ra !== rb) repParent.set(rb, ra);
      republicationsPaires.push({ x, y, ph, t });
      continue;
    }
    if (succession(x, y, ph)) {
      const e = { ...t, ph, photo: (ph.liste ?? []).filter((d) => d <= S.quasi).length >= 2 ? 'multi' : 'quasi', motif: 'remise_en_ligne_meme_plateforme' };
      for (const [a, b] of [[x, y], [y, x]]) successionsDe.set(a.id, (successionsDe.get(a.id) || []).concat({ autre: b, e }));
      continue;   // jamais « deux exemplaires » ni « vendeur de lots » : une seule annonce en ligne à la fois
    }
    for (const [a, b] of [[x, y], [y, x]]) partagee.set(a.id, (partagee.get(a.id) || []).concat(b.id));
    pairesMemePlateforme.push({ x, y, ph, t });
  }
  // (v23) UN VRAI SECOND EXEMPLAIRE se voit AILLEURS : si une autre plateforme
  // porte, pour ces annonces, deux objets distincts (deux fiches Vinted
  // jumelles…) ou une quantité > 1, ce n'est pas une republication — la paire
  // redevient « deux exemplaires » (la question).
  if (republicationsPaires.length) {
    const membresRep = new Map();
    for (const id of repParent.keys()) { const r = rfind(id); if (!membresRep.has(r)) membresRep.set(r, new Set()); membresRep.get(r).add(id); }
    const autres = new Map(); const annules = new Set();
    for (const e of aretes) if (plausible(e)) for (const [a, b] of [[e.x, e.y], [e.y, e.x]]) {
      if (!repParent.has(a.id) || b.pf === a.pf) continue;
      const r = rfind(a.id);
      if (!autres.has(r)) autres.set(r, new Map()); const m = autres.get(r);
      if (!m.has(b.pf)) m.set(b.pf, new Set()); m.get(b.pf).add(rfind(b.id));
      if ((Number(b.ref?.quantite ?? 1) || 1) > 1 || (partagee.get(b.id) ?? []).length) annules.add(r);
    }
    for (const [r, m] of autres) for (const s of m.values()) if (s.size > 1) annules.add(r);
    if (annules.size) {
      const garder = [];
      for (const p of republicationsPaires) {
        if (!annules.has(rfind(p.x.id))) { garder.push(p); continue; }
        for (const [a, b] of [[p.x, p.y], [p.y, p.x]]) partagee.set(a.id, (partagee.get(a.id) || []).concat(b.id));
        pairesMemePlateforme.push({ x: p.x, y: p.y, ph: p.ph, t: p.t });
      }
      for (const r of annules) for (const id of membresRep.get(r) ?? []) repParent.delete(id);
      republicationsPaires.length = 0; republicationsPaires.push(...garder);
    }
  }
  // les concurrents se comptent par OBJET : deux republications d'une annonce sont un seul concurrent
  const plaus = new Map();
  for (const e of aretes) if (plausible(e)) for (const [a, b] of [[e.x, e.y], [e.y, e.x]]) { const k = a.id + '|' + b.pf; if (!plaus.has(k)) plaus.set(k, new Set()); plaus.get(k).add(rfind(b.id)); }
  for (const e of aretes) {
    if (e.niveau !== 'fort') continue;
    const p1 = plaus.get(e.x.id + '|' + e.y.pf)?.size || 0, p2 = plaus.get(e.y.id + '|' + e.x.pf)?.size || 0;
    if (p1 > 1 || p2 > 1) { e.niveau = 'doute'; e.motif = 'ambigu_plusieurs'; }
    else if (partagee.has(e.x.id) || partagee.has(e.y.id)) { e.niveau = 'doute'; e.motif = 'meme_photo_deux_annonces_meme_plateforme'; }
  }
  // 3. PREUVES et DÉCISIONS DE LA PERSONNE : définitives, jamais rejugées.
  const parId = new Map(N.map((n) => [n.id, n]));
  const cle = (a, b) => [a, b].sort().join('|');
  const forcees = new Map(forces.filter(([a, b]) => parId.has(a) && parId.has(b) && a !== b).map(([a, b, v, motif]) => [cle(a, b), { v, motif }]));
  const vues = new Set();
  for (const e of aretes) {
    const f = forcees.get(cle(e.x.id, e.y.id)); if (!f) continue; vues.add(cle(e.x.id, e.y.id));
    if (f.v === 'non') { e.niveau = 'rien'; e.motif = 'refus_utilisateur'; }
    if (f.v === 'oui') { e.niveau = 'fort'; e.motif = f.motif; e.force = true; }
  }
  for (const [k, f] of forcees) {
    if (vues.has(k) || f.v !== 'oui') continue;
    const [a, b] = k.split('|'); const x = parId.get(a), y = parId.get(b);
    if (x.pf === y.pf) continue;
    aretes.push({ x, y, niveau: 'fort', motif: f.motif, force: true, ph: { best: -1, second: 99, liste: [] }, photo: 'force', sim: { jac: 0, cont: 0, communs: 0 }, wj: 0, conflits: [], prixR: null });
  }
  // 4. groupes : les preuves d'abord, puis de la plus sûre à la moins sûre ;
  //    jamais deux annonces d'une plateforme dans un groupe.
  const parent = new Map(N.map((n) => [n.id, n.id]));
  const membres = new Map(N.map((n) => [n.id, [n]]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const fortes = aretes.filter((e) => e.niveau === 'fort').sort((a, b) => (b.force ? 1 : 0) - (a.force ? 1 : 0) || a.ph.best - b.ph.best);
  // (v23) les republications d'abord (un objet), puis les preuves et les arêtes fortes
  const liensRep = republicationsPaires.map(({ x, y, ph }) => ({ x, y, niveau: 'fort', motif: 'republication', ph, rep: true }));
  for (const e of liensRep.concat(fortes)) {
    const ra = find(e.x.id), rb = find(e.y.id); if (ra === rb) continue;
    const ma = membres.get(ra);
    // deux annonces d'une plateforme dans un groupe : seulement deux republications du même objet
    const heurte = membres.get(rb).some((n) => ma.some((m) => m.pf === n.pf && !(repParent.has(n.id) && rfind(m.id) === rfind(n.id))));
    if (heurte) { e.niveau = 'doute'; e.motif = 'conflit_de_groupe'; continue; }
    parent.set(rb, ra); membres.set(ra, ma.concat(membres.get(rb))); membres.delete(rb);
  }
  // 5. décision par GROUPE (un article)
  // (31/10, lot F) Pour la succession : la fiche d'origine (un nœud F : ni import de relevé) passe devant un import ;
  // les identifiants de fiche croissent avec le temps (le plus petit = la plus ancienne).
  const origineReleve = (n) => (parId.has('F' + String(n.ref?.inventaire_id ?? '')) ? 0 : 1);
  const ageFiche = (n) => { const v = Number(n.ref?.inventaire_id); return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER; };
  const doutesDe = new Map();
  for (const e of aretes) if (e.niveau === 'doute') for (const [a, b] of [[e.x, e.y], [e.y, e.x]]) {
    if (!doutesDe.has(a.id)) doutesDe.set(a.id, []); doutesDe.get(a.id).push({ e, autre: b });
  }
  const dec = new Map();
  for (const [racine, g] of membres) {
    const ids = g.map((m) => m.id);
    const base = g.find((m) => m.pf === 'vinted') ?? g.find((m) => m.pf === 'fiche') ?? null;
    if (base) {
      for (const m of g) dec.set(m.id, { decision: g.length > 1 ? 'fusion_base' : 'base', groupe: ids, base: base.id });
      continue;
    }
    const pfsG = new Set(g.map((m) => m.pf));
    const utiles = g.flatMap((m) => doutesDe.get(m.id) || []).filter(({ autre }) => {
      const h = membres.get(find(autre.id)); if (find(autre.id) === racine) return false;
      return !h.some((x) => pfsG.has(x.pf));
    }).sort((a, b) => a.e.ph.best - b.e.ph.best);
    // (31/10, lot F) Sans doute utile, une annonce SEULE qui succède sur sa plateforme à une annonce déjà rangée sur
    // une fiche (successionsDe) n'est jamais « nouvelle » : la question vers cette fiche, hors du stock. La fiche
    // d'origine d'abord (pas un import de relevé), puis la plus ancienne ; la meilleure photo départage.
    const succ = !utiles.length && g.length === 1 ? (successionsDe.get(g[0].id) || [])
      .filter(({ autre }) => find(autre.id) !== racine && autre.ref?.inventaire_id)
      .sort((a, b) => origineReleve(a.autre) - origineReleve(b.autre) || ageFiche(a.autre) - ageFiche(b.autre) || a.e.ph.best - b.e.ph.best) : [];
    for (const m of g) dec.set(m.id, utiles.length ? { decision: 'a_verifier', doutes: utiles, groupe: ids }
      : succ.length ? { decision: 'a_verifier', doutes: succ, groupe: ids, succession: true }
        : { decision: g.length > 1 ? 'fusion_autre' : 'nouveau', groupe: ids });
  }
  // 6. « Annonce en double ? » (Nico, 08/10, point 1) : deux annonces d'une
  //    MÊME plateforme, même photo, titre proche — jamais fusionnées, une
  //    question dédiée. Seulement des PAIRES : trois annonces et plus sur la
  //    même photo, c'est un vendeur de lots (option sûre : rien).
  const doubles = pairesMemePlateforme.filter(({ x, y }) => (partagee.get(x.id) || []).length === 1 && (partagee.get(y.id) || []).length === 1
    && !forcees.has(cle(x.id, y.id)));
  return { aretes, dec, membres, find, doubles, ms: Date.now() - t0, partagee, rfind, republicationsPaires };
}

// ── LE PLAN D'ÉCRITURE (ce que rapprochement_v3_appliquer exécute) ──────────
// mode 'normal'    : seules les annonces SANS article (jamais décidées) et les
//                    paires « en double » qui en touchent une ;
// mode 'reparation': en plus, les décisions AUTOMATIQUES d'avant (article
//                    importé par l'ancien moteur, marqueur « à vérifier » posé
//                    par le moteur ou le rattrapage) sont rejugées : fusion
//                    sûre, question, ou retour au stock. Jamais une décision de
//                    la personne (forces), jamais un article qu'elle a modifié
//                    (intact=false → question, pas de fusion).
// (08/10, complément) mode 'normal', aussi : les FICHES DU DRESSING VINTED nées
// depuis la dernière passe (`donnees.vinted_a_juger`, écrites par l'extension)
// sont jugées contre les imports automatiques déjà au stock — un import intact
// sûrement identique rejoint la fiche Vinted (fusion, la base garde ses gardes),
// un doute devient la question, hors du stock. Une annonce déjà rangée n'est
// rouverte que pour une de CES fiches, jamais pour une autre paire.
const idAnnonce = (n) => n.id.slice(1);
const idFiche = (n) => n.id.slice(1);
const estAnnonce = (n) => n.id.startsWith('A');
export const autoDecidee = (a) => !!a.inventaire_id && a.source !== 'manuel' && a.source !== 'job' && a.derniere_par !== 'utilisateur' && a.derniere_par !== 'job';
export const vintedAJuger = (donnees) => new Set((donnees.vinted_a_juger ?? []).map((id) => 'F' + id));
export function planifier(donnees, N, R, { mode = 'normal' } = {}) {
  const parId = new Map(N.map((n) => [n.id, n]));
  const F = new Map((donnees.fiches ?? []).map((f) => [String(f.id), f]));
  const ficheDe = (a) => (a.inventaire_id ? F.get(String(a.inventaire_id)) ?? null : null);
  const importAuto = (a) => { const f = ficheDe(a); return autoDecidee(a) && !!f && String(f.origine ?? '').startsWith('releve_'); };
  // les annonces rangées automatiquement qu'une fiche Vinted nouvelle touche (fort ou doute)
  const aJuger = mode === 'normal' ? vintedAJuger(donnees) : new Set();
  const rouvertes = new Set();
  for (const e of aJuger.size ? R.aretes : []) {
    if (e.niveau !== 'fort' && e.niveau !== 'doute') continue;
    for (const [x, y] of [[e.x, e.y], [e.y, e.x]]) if (aJuger.has(x.id) && estAnnonce(y) && importAuto(y.ref)) rouvertes.add(y.id);
  }
  // une annonce « ouverte » : sans article (normale) ; en réparation, aussi une
  // annonce décidée automatiquement dont l'article est un import intact ou à vérifier
  const ouverte = (n) => {
    if (!estAnnonce(n)) return false;
    const a = n.ref; if (!a.inventaire_id) return true;
    if (rouvertes.has(n.id)) return true;
    if (mode !== 'reparation') return false;
    const f = ficheDe(a); if (!f) return false;
    // (la base vérifie l'« intact » à l'écriture : fusion d'un article intact, question sinon)
    return autoDecidee(a) && String(f.origine ?? '').startsWith('releve_');
  };
  const cible = (n) => (estAnnonce(n) ? { annonce: idAnnonce(n) } : { fiche: idFiche(n) });
  const preuvesDe = (d) => ({
    motif: d.e.motif, photo: Number(d.e.ph.best.toFixed(1)), photo_niveau: d.e.photo, titre: Number((d.e.wj ?? 0).toFixed(2)),
    conflits: d.e.conflits, candidats_total: 1, avant_stock: true, regle: 'rapprochement_v3',
  });
  const out = [];
  const vus = new Set();
  const fichesPlanifiees = new Set();
  // (v23) les annonces qui sont la republication d'une autre du MÊME groupe —
  // la base ne laisse deux annonces d'une plateforme sur une fiche que pour elles,
  // après avoir revérifié texte, prix et description (rapprochement_republication_prouvee).
  const enRep = new Set();
  for (const { x, y } of R.republicationsPaires ?? []) if (R.find(x.id) === R.find(y.id)) { enRep.add(x.id); enRep.add(y.id); }
  const republicationsDu = (annonces) => annonces.filter((a) => enRep.has('A' + a.id)).map((a) => a.id);
  // (a) les groupes
  for (const [, g] of R.membres) {
    const d0 = R.dec.get(g[0].id); if (!d0) continue;
    const annonces = g.filter(estAnnonce).map((n) => n.ref);
    if (d0.decision === 'fusion_base' || d0.decision === 'base') {
      const base = parId.get(d0.base); const fiche = idFiche(base);
      for (const a of annonces) {
        if (String(a.inventaire_id ?? '') === String(fiche)) continue;       // déjà là
        if (!a.inventaire_id) {
          const rep = enRep.has('A' + a.id) && annonces.some((b) => b !== a && b.platform === a.platform);
          out.push({ type: 'attacher', annonce: a.id, fiche, motif: rep ? 'republication' : 'photo_identique', preuve: { regle: 'rapprochement_v3', groupe: g.map((m) => m.id) } });
          continue;
        }
        // (normal) seulement vers la fiche Vinted nouvelle qui a rouvert l'annonce
        const versVintedNouvelle = mode === 'normal' && aJuger.has(d0.base) && rouvertes.has('A' + a.id);
        if ((mode === 'reparation' || versVintedNouvelle) && autoDecidee(a)) {
          const f = ficheDe(a);
          if (f && String(f.origine ?? '').startsWith('releve_')) {
            out.push({ type: 'fusionner', annonce: a.id, absorbe: f.id, garde: fiche,
              ...(versVintedNouvelle ? { portee: 'vinted_nouvelle' } : {}),
              // (v23) l'article importé d'une republication rejoint la base qui porte sa sœur
              ...(enRep.has('A' + a.id) && annonces.some((b) => b !== a && b.platform === a.platform) ? { republication: true } : {}),
              preuve: { regle: 'rapprochement_v3', groupe: g.map((m) => m.id), ...(versVintedNouvelle ? { vinted_nouvelle: fiche } : {}) } });
            fichesPlanifiees.add(String(f.id));
          }
        }
      }
      continue;
    }
    if (d0.decision === 'fusion_autre') {
      // (une annonce rouverte par une fiche Vinted ne refait pas un groupe sans elle)
      const ouvertes = annonces.filter((a) => ouverte(parId.get('A' + a.id)) && !rouvertes.has('A' + a.id));
      if (!ouvertes.length) continue;
      out.push({ type: 'groupe', annonces: annonces.map((a) => a.id), republications: republicationsDu(annonces), preuve: { regle: 'rapprochement_v3' } });
      for (const a of annonces) if (a.inventaire_id) fichesPlanifiees.add(String(a.inventaire_id));
      continue;
    }
    if (d0.decision === 'a_verifier') {
      const ouvertes = annonces.filter((a) => ouverte(parId.get('A' + a.id)));
      if (!ouvertes.length) continue;
      // (normal) un import rouvert ne l'est que pour son doute avec une fiche Vinted nouvelle
      const seulementRouvertes = ouvertes.every((a) => rouvertes.has('A' + a.id));
      const d = seulementRouvertes ? d0.doutes.find((x) => aJuger.has(x.autre.id)) : d0.doutes[0];
      if (!d) continue;
      // l'article du groupe = la première annonce (les autres s'y rattachent)
      out.push({ type: 'a_verifier', annonces: annonces.map((a) => a.id), republications: republicationsDu(annonces), candidat: cible(d.autre), motif: d.e.motif,
        preuves: { ...preuvesDe(d), candidats_total: d0.doutes.length, autre: d.autre.id } });
      for (const a of annonces) if (a.inventaire_id) fichesPlanifiees.add(String(a.inventaire_id));
      continue;
    }
    if (d0.decision === 'nouveau') {
      const a = annonces[0]; if (!a) continue;
      const n = parId.get('A' + a.id);
      if (!a.inventaire_id) { out.push({ type: 'creer', annonce: a.id }); continue; }
      if (mode === 'reparation' && ouverte(n) && ficheDe(a)?.a_verifier_auto) {
        out.push({ type: 'entrer_stock', fiche: a.inventaire_id, annonce: a.id });
        fichesPlanifiees.add(String(a.inventaire_id));
      }
    }
  }
  // (b) « Annonce en double ? »
  for (const { x, y, ph, t } of R.doubles) {
    const ax = estAnnonce(x) ? x.ref : null, ay = estAnnonce(y) ? y.ref : null;
    const touche = [x, y].some((n) => estAnnonce(n) && ouverte(n) && !rouvertes.has(n.id));
    if (mode === 'normal' && !touche) continue;
    const k = [x.id, y.id].sort().join('|'); if (vus.has(k)) continue; vus.add(k);
    out.push({ type: 'annonce_en_double', a: cible(x), b: cible(y), platform: x.pf,
      preuves: { motif: 'annonce_en_double', photo: Number(ph.best.toFixed(1)), titre: Number(t.wj.toFixed(2)), avant_stock: true, regle: 'rapprochement_v3' } });
    void ax; void ay;
  }
  // (c) réparation : les marqueurs « à vérifier » automatiques dont l'annonce
  //     a été décidée ci-dessus sont couverts ; ceux d'un article relié à rien
  //     (fiche sans annonce vivante) rentrent au stock.
  if (mode === 'reparation') {
    // (15/10, point 2 — jocabroc, qui supprime et republie ses annonces Leboncoin)
    // Une fiche « à vérifier » sans annonce vivante ne rentre PAS au stock quand
    // une autre fiche vivante du compte porte exactement son titre : elle y
    // ferait un doublon visible (9 fiches mortes, 5 avec un homonyme exact). Elle
    // reste « à vérifier », la personne tranche. Le titre ne rapproche rien ici :
    // il RETIENT seulement.
    const titresVivants = new Map();
    const estVivante = (g) => !g.fusionne_dans && ['stock', 'vendu'].includes(g.statut);
    for (const g of donnees.fiches ?? []) {
      if (!estVivante(g)) continue;
      const k = normCommeLaBase(g.titre); if (!k) continue;
      titresVivants.set(k, (titresVivants.get(k) ?? 0) + 1);
    }
    for (const f of donnees.fiches ?? []) {
      if (!f.a_verifier_auto || fichesPlanifiees.has(String(f.id))) continue;
      const aNoeud = N.some((n) => estAnnonce(n) && String(n.ref.inventaire_id ?? '') === String(f.id));
      if (aNoeud) continue;
      const k = normCommeLaBase(f.titre);
      const autres = k ? (titresVivants.get(k) ?? 0) - (estVivante(f) ? 1 : 0) : 0;
      if (autres > 0) continue;
      out.push({ type: 'entrer_stock', fiche: f.id, annonce: null });
    }
  }
  // Ordre d'exécution : ce qui prouve d'abord, puis les doutes, puis les créations.
  const rang = { fusionner: 0, attacher: 1, groupe: 2, a_verifier: 3, annonce_en_double: 4, creer: 5, entrer_stock: 6 };
  out.sort((p, q) => rang[p.type] - rang[q.type]);
  return out;
}

export function resumer(decisions) {
  const c = {};
  for (const d of decisions) c[d.type] = (c[d.type] || 0) + 1;
  return c;
}
