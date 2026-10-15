// ═══════════════════════════════════════════════════════════════════════════
// LA PASSE EN TRANCHES (12/10/2026, cas ferreirasab)
// ═══════════════════════════════════════════════════════════════════════════
// Une fonction edge n'a que 2 s de CPU par appel, quel que soit le plan. Le
// compte de ferreirasab (1 752 fiches Vinted, 660 annonces Leboncoin, 788 Beebs,
// vêtements d'enfant sur fond blanc : 3 082 nœuds, 59 028 lectures de photos)
// demandait 3,5 s de passe : la fonction mourait à CHAQUE passe (« CPU Time
// exceeded », 2,4 à 3,2 s, 12/10 09:01 → 09:30 UTC) et le disjoncteur arrêtait
// le compte. Toute passe plus grosse aurait fait pareil.
//
// LE PRINCIPE. La passe reste la même fonction pure (passe.js) ; seuls ses deux
// calculs lourds — les paires candidates (tiroirs des photos, mots des titres)
// et les paires évaluées (photos ET texte) — passent par ce module :
//   · chacun se découpe en UNITÉS bornées : une part des tiroirs (clé % P),
//     l'assemblage de la liste, un morceau de paires évaluées ;
//   · une invocation fait des unités tant que son budget le permet (au moins
//     une : jamais une invocation sans progrès), garde ce qu'elle a calculé en
//     base (rapprochement_tranches, sous la signature des données lues) et
//     s'arrête (Suite) ;
//   · l'invocation suivante relit les mêmes données, retrouve tout ce qui est
//     déjà calculé et continue ; quand rien ne manque, la passe se termine
//     d'un trait, sur les mêmes valeurs qu'un calcul d'un seul tenant.
// LES MÊMES DÉCISIONS. Les candidates se réassemblent dans l'ordre exact de
// candidatsDe (moteur.js : candidatsAssembler) ; une paire évaluée garde les
// champs que la suite lit (niveau, motif, photo, distance, mots, conflits) ;
// l'ordre des arêtes est celui des candidates. Aucun seuil ne change. Toutes les
// paires, rechargées ou calculées, passent par la même forme : une invocation qui
// finit ne mélange jamais des objets « neufs » et « relus ».
// Un changement des données (une annonce relevée, une décision de la personne)
// change la signature : le chantier repart de zéro, jamais un calcul mêlé.
import { candidatsPhotoPartie, candidatsTitresPartie, candidatsAssembler, entreesDe, paireAretes } from './moteur.js';

/** Le budget de l'invocation est épuisé : ce qui est calculé est gardé, la suite au prochain appel. */
export class Suite extends Error {
  constructor(quoi) { super('suite : ' + quoi); this.name = 'Suite'; this.quoi = quoi; }
}

// Une part de tiroirs : ~150 000 entrées (lectures × 12 clés) — ferreirasab :
// 708 336 entrées, P = 5. Une part se parcourt elle-même par morceaux (l'horloge
// relue tous les 64 tiroirs) : 7373c96c (catalogue, tiroirs pleins) n'y fait plus
// une unité de 1,5 s.
export const ENTREES_PAR_PART = 150_000;
// Les paires évaluées par pas de PAS paires, l'horloge relue à chaque pas.
export const PAS = 64;
// Le parcours minimal d'un morceau de tiroirs ou de titres, une fois sa part reconstruite.
export const MIN_PARCOURS_MS = 60;
// Ce qu'il doit rester du budget pour commencer une part de tiroirs (reconstruction
// + parcours minimal) ; l'assemblage, lui, coûte ~0,4 µs par paire trouvée (7373c96c :
// 515 348 → 0,2 s), compté double.
export const RESERVE_PART_MS = 150;
export const MS_PAR_ENTREE_ASSEMBLEE = 0.0008;

const NIVEAUX = ['rien', 'doute', 'fort'];

/** Une arête (evaluer) → la forme gardée ; et retour. Les champs lus après l'évaluation, eux seuls. */
export function areteCompacte(k, e) {
  return [k, NIVEAUX.indexOf(e.niveau), e.motif ?? '', e.ph.best, e.photo ?? '', e.wj ?? 0, (e.conflits ?? []).join(','),
    e.sim?.jac ?? 0, e.sim?.cont ?? 0, e.sim?.communs ?? 0];
}
export function areteDepuis(N, cand, c) {
  const [i, j] = cand[c[0]];
  return { x: N[i], y: N[j], niveau: NIVEAUX[c[1]], motif: c[2], ph: { best: c[3] }, photo: c[4], wj: c[5],
    conflits: c[6] ? c[6].split(',') : [], sim: { jac: c[7], cont: c[8], communs: c[9] } };
}
export function memeCompacte(k, m) { return [k, m.ph.best, m.t.wj, m.t.sim.jac, m.t.sim.cont, m.t.sim.communs, m.rep ? 1 : 0]; }
export function memeDepuis(N, cand, c) {
  const [i, j] = cand[c[0]];
  return { x: N[i], y: N[j], ph: { best: c[1] }, t: { wj: c[2], conflits: [], sim: { jac: c[3], cont: c[4], communs: c[5] } }, rep: c[6] === 1 };
}

// L'identité d'un graphe dans la passe (ses nœuds, ses actifs) : un garde-fou —
// la même passe sur les mêmes données redemande toujours la même chose.
function sigGraphe(N, actifs) {
  let h = 0;
  for (const n of N) for (let q = 0; q < n.id.length; q++) h = (Math.imul(h, 31) + n.id.charCodeAt(q)) | 0;
  let a = 0;
  if (actifs) for (const i of actifs) a = (a + Math.imul(i + 1, 2654435761)) | 0;
  return `${N.length}:${h}:${actifs ? actifs.size + ':' + a : 'tous'}`;
}

/**
 * Les lignes gardées d'un chantier (rapprochement_tranches : { cle, contenu }) → le cache.
 * cle : 'cand|<etiquette>|p|<P>|<r>|<depuis>' (un morceau d'une part des tiroirs),
 * 'cand|<etiquette>|t|<depuis>' (un morceau des titres), 'cand|<etiquette>|liste',
 * 'paires|<etiquette>#paires|<debut>' (un morceau de paires évaluées).
 */
export function cacheDepuis(lignes) {
  const cache = {};
  const de = (etq) => (cache[etq] ??= { parts: new Map(), titres: new Map(), morceaux: [] });
  for (const { cle, contenu } of lignes) {
    const c = typeof contenu === 'string' ? JSON.parse(contenu) : contenu;
    const [genre, etq] = cle.split('|');
    const x = de(etq);
    if (x.sig && c.sig !== x.sig) throw new Error(`tranches : signatures mêlées pour ${etq}`);
    x.sig = c.sig;
    if (genre === 'cand' && c.liste) {
      const l = []; for (let q = 0; q < c.liste.length; q += 2) l.push([c.liste[q], c.liste[q + 1]]);
      x.liste = l;
    } else if (genre === 'cand' && c.r != null) {
      x.P = c.P;
      if (!x.parts.has(c.r)) x.parts.set(c.r, new Map());
      x.parts.get(c.r).set(c.depuis, { paires: c.paires, suivant: c.suivant });
    } else if (genre === 'cand') x.titres.set(c.depuis, { paires: c.paires, suivant: c.suivant });
    else if (genre === 'paires') x.morceaux.push({ debut: c.debut, fin: c.fin, a: c.a, m: c.m });
  }
  for (const x of Object.values(cache)) x.morceaux.sort((p, q) => p.debut - q.debut);
  return cache;
}

/**
 * Le calcul en tranches. `cache` (cacheDepuis), `budget` = { fin, unites } (fin :
 * l'instant, sur `horloge`, au-delà duquel aucune unité ne commence — sauf la
 * première de l'invocation), `nouveaux` : où poser les lignes à garder
 * ({ cle, contenu, supprimer? }).
 */
export function calculEnTranches({ cache, budget, nouveaux, horloge = () => performance.now() }) {
  const de = (etq) => (cache[etq] ??= { parts: new Map(), titres: new Map(), morceaux: [] });
  const verifier = (x, etq, sig) => {
    if (x.sig && x.sig !== sig) throw new Error(`tranches : le graphe ${etq} ne correspond plus (${x.sig} ≠ ${sig})`);
    x.sig = sig;
  };
  // Une unité peut-elle commencer ? Toujours la première de l'invocation ; les
  // suivantes seulement s'il reste au moins `reserve` ms (une part de tiroirs se
  // reconstruit avant d'être parcourue ; l'assemblage ne se coupe pas).
  const peut = (quoi, reserve = 0) => { if (budget.unites > 0 && horloge() + reserve > budget.fin) throw new Suite(quoi); };
  const unite = () => { budget.unites += 1; };

  return {
    candidats(etq, N, actifs) {
      const x = de(etq); const sig = sigGraphe(N, actifs); verifier(x, etq, sig);
      if (x.liste) return x.liste;
      // Un morceau de tiroirs reconstruit sa part avant de la parcourir (~0,05 s pour
      // ferreirasab) : une fois ce prix payé, il parcourt au moins MIN_PARCOURS_MS de
      // tiroirs — jamais une invocation qui ne ferait que reconstruire.
      let t0 = null;
      const continuer = () => { const h = horloge(); if (t0 === null) t0 = h; return h <= budget.fin || h - t0 < MIN_PARCOURS_MS; };
      if (x.P == null) x.P = Math.max(1, Math.ceil(entreesDe(N) / ENTREES_PAR_PART));
      // les tiroirs, part par part, morceau par morceau
      const photo = [];
      for (let r = 0; r < x.P; r++) {
        if (!x.parts.has(r)) x.parts.set(r, new Map());
        const morceaux = x.parts.get(r);
        for (let d = 0; d !== -1;) {
          let m = morceaux.get(d);
          if (!m) {
            peut(`candidats ${etq} part ${r + 1}/${x.P} tiroir ${d}`, RESERVE_PART_MS);
            t0 = null; m = candidatsPhotoPartie(N, actifs, x.P, r, d, continuer);
            morceaux.set(d, m);
            nouveaux.push({ cle: `cand|${etq}|p|${x.P}|${r}|${d}`, contenu: { sig, P: x.P, r, depuis: d, paires: m.paires, suivant: m.suivant } });
            unite();
          }
          photo.push(m.paires); d = m.suivant;
        }
      }
      // les titres, par plages de nœuds
      const titres = [];
      for (let d = 0; d !== -1;) {
        let m = x.titres.get(d);
        if (!m) {
          peut(`candidats ${etq} titres ${d}`, MIN_PARCOURS_MS);
          t0 = null; m = candidatsTitresPartie(N, actifs, d, continuer);
          x.titres.set(d, m);
          nouveaux.push({ cle: `cand|${etq}|t|${d}`, contenu: { sig, depuis: d, paires: m.paires, suivant: m.suivant } });
          unite();
        }
        titres.push(m.paires); d = m.suivant;
      }
      let entrees = 0; for (const p of photo) entrees += p.length / 4;
      peut(`candidats ${etq} assemblage`, Math.max(MIN_PARCOURS_MS, entrees * MS_PAR_ENTREE_ASSEMBLEE));
      const liste = candidatsAssembler(photo, titres);
      const plat = new Array(liste.length * 2);
      for (let q = 0; q < liste.length; q++) { plat[2 * q] = liste[q][0]; plat[2 * q + 1] = liste[q][1]; }
      nouveaux.push({ cle: `cand|${etq}|liste`, contenu: { sig, liste: plat }, remplace: `cand|${etq}|` });
      unite();
      x.liste = liste;
      return liste;
    },

    paires(etq, N, cand, S) {
      const x = de(`${etq}#paires`); const sig = sigGraphe(N, null) + `:${cand.length}`; verifier(x, etq, sig);
      // ce qui est déjà calculé (sans rien reconstruire : une invocation qui s'arrête
      // en route n'en a pas besoin), puis la suite, puis — seulement au bout — les arêtes
      const faits = [];
      let k = 0;
      for (const m of x.morceaux) {
        if (m.debut !== k) break;      // un trou : on recalcule à partir de là
        faits.push(m); k = m.fin;
      }
      while (k < cand.length) {
        peut(`paires ${etq} ${k}/${cand.length}`);
        const debut = k;
        const a = [], mm = [];
        // au moins un pas ; puis tant que le budget dure
        do {
          const fin = Math.min(cand.length, k + PAS);
          const ix = { aretes: [], memes: [] };
          const r = paireAretes(N, cand, k, fin, S, ix);
          r.aretes.forEach((e, q) => a.push(areteCompacte(ix.aretes[q], e)));
          r.memes.forEach((m, q) => mm.push(memeCompacte(ix.memes[q], m)));
          k = fin;
        } while (k < cand.length && horloge() <= budget.fin);
        const morceau = { debut, fin: k, a, m: mm };
        x.morceaux.push(morceau);
        nouveaux.push({ cle: `paires|${etq}#paires|${debut}`, contenu: { sig, ...morceau } });
        unite();
        faits.push(morceau);
      }
      const aretes = [], memes = [];
      for (const m of faits) {
        for (const c of m.a) aretes.push(areteDepuis(N, cand, c));
        for (const c of m.m) memes.push(memeDepuis(N, cand, c));
      }
      return { aretes, memes };
    },
  };
}
