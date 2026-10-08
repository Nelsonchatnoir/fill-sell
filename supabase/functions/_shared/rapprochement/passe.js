// ═══════════════════════════════════════════════════════════════════════════
// UNE PASSE DE RAPPROCHEMENT : des données lues au plan d'écriture (08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Pur : ni base, ni réseau. La fonction edge (Deno) et les scripts (Node)
// appellent la même chose :
//   urlsDe(donnees)            → toutes les photos à empreinter (≤ 6 par annonce/article)
//   passe(donnees, empreintes) → { decisions, bilan, manquantes }
// `empreintes` : Map url → ligne photo_empreintes (dhash, phash, variantes) ;
// une photo sans empreinte est simplement absente de la comparaison (jamais
// une preuve avec une photo manquante : moins de photos = moins de paires).
import { photoDepuisEmpreinte } from './photos.js';
import { construireNoeuds, forcesDe, rapprocher, planifier, resumer, candidatsDe, autoDecidee, vintedAJuger } from './moteur.js';
import { fichesMain } from './fiches-main.js';

export function urlsDe(donnees, { maxPhotos = 6 } = {}) {
  const out = new Set();
  for (const f of donnees.fiches ?? []) {
    if (String(f.origine ?? '').startsWith('releve_') || f.fusionne_dans) continue;
    if (!['stock', 'vendu'].includes(f.statut)) continue;
    for (const u of (f.photos ?? []).slice(0, maxPhotos)) if (typeof u === 'string' && /^https:\/\//.test(u)) out.add(u);
  }
  for (const a of donnees.annonces ?? []) {
    if (a.ignoree_par_utilisateur || a.hors_liste || a.ebay_bloque) continue;
    for (const u of (a.photos ?? []).slice(0, maxPhotos)) if (typeof u === 'string' && /^https:\/\//.test(u)) out.add(u);
  }
  return [...out];
}

/** Les URL sans empreinte complète (ligne absente, ou sans variantes), hors illisibles. */
export function manquantesDe(urls, empreintes, illisibles = new Set()) {
  return urls.filter((u) => {
    if (illisibles.has(u)) return false;
    const e = empreintes.get(u);
    return !e || !e.dhash || !e.phash || !e.variantes || typeof e.variantes !== 'object';
  });
}

// `fichesMain` : portée de la règle « fiche à la main face à une fiche Vinted »
// (fiches-main.js) — 'nouvelles' (défaut, inerte sans `donnees.fiches_main_actif`)
// ou 'toutes' (le rattrapage du stock existant).
export function passe(donnees, empreintes, { mode = 'normal', fichesMain: porteeMain = 'nouvelles' } = {}) {
  const t0 = Date.now();
  const photosDe = (urls) => urls.map((u) => photoDepuisEmpreinte(empreintes.get(u))).filter(Boolean);
  const N = construireNoeuds(donnees, photosDe);
  const forces = forcesDe(donnees);
  // mode normal : seules les annonces encore sans article (ni décidées, ni
  // ignorées) ont une décision à prendre — les paires qui ne les touchent pas
  // ne sont pas construites (voir candidatsDe).
  // (08/10, complément) … et les fiches du dressing Vinted nées depuis la
  // dernière passe ; les annonces déjà rangées qu'elles touchent deviennent
  // actives à leur tour, pour que TOUS leurs concurrents comptent (jamais une
  // fusion sur une paire dont on n'aurait pas vu le rival).
  let actifs = null;
  if (mode === 'normal') {
    const aJuger = vintedAJuger(donnees);
    actifs = new Set(N.map((n, i) => ((n.id.startsWith('A') && !n.ref.inventaire_id) || aJuger.has(n.id) ? i : -1)).filter((i) => i >= 0));
    if (aJuger.size) {
      const vinted = new Set(N.map((n, i) => (aJuger.has(n.id) ? i : -1)).filter((i) => i >= 0));
      for (const [i, j] of candidatsDe(N, vinted)) for (const k of [i, j]) if (N[k].id.startsWith('A') && autoDecidee(N[k].ref)) actifs.add(k);
    }
  }
  const R = rapprocher(N, { forces, actifs });
  const decisions = planifier(donnees, N, R, { mode });
  // les relevés non probants : ignorés, comme avant (jamais une création)
  for (const a of donnees.annonces ?? []) {
    if ((a.hors_liste || a.ebay_bloque) && !a.inventaire_id && !a.ignoree) decisions.push({ type: 'ignorer', annonce: a.id, motif: 'releve_non_probant' });
  }
  // réparation : les questions automatiques que v3 ne confirme pas (aucune arête
  // entre leurs deux articles) deviennent caduques — la personne peut toujours
  // réunir deux fiches à la main.
  if (mode === 'reparation') {
    const parFiche = new Map();
    for (const n of N) { const k = n.id.startsWith('F') ? n.id.slice(1) : String(n.ref.inventaire_id ?? ''); if (k) { if (!parFiche.has(k)) parFiche.set(k, []); parFiche.get(k).push(n.id); } }
    const liees = new Set();
    for (const e of R.aretes) if (e.niveau !== 'rien') liees.add([e.x.id, e.y.id].sort().join('|'));
    for (const d of donnees.doublons ?? []) {
      if (!d.auto || d.statut !== 'proposee') continue;
      const A = parFiche.get(String(d.garde)) ?? [], B = parFiche.get(String(d.absorbe)) ?? [];
      if (!A.length || !B.length) continue;
      let liee = false;
      for (const x of A) for (const y of B) if (liees.has([x, y].sort().join('|')) || R.find(x) === R.find(y)) liee = true;
      if (!liee) decisions.push({ type: 'question_caduque', id: d.id, garde: d.garde, absorbe: d.absorbe });
    }
  }
  const parPf = {};
  for (const n of N) {
    const d = R.dec.get(n.id)?.decision ?? '?';
    parPf[n.pf] ??= {}; parPf[n.pf][d] = (parPf[n.pf][d] || 0) + 1;
  }
  // (08/10 soir) la fiche à la main face à une fiche Vinted : un sous-graphe à
  // part, après le graphe complet (les décisions des annonces ne bougent pas) ;
  // ses décisions passent après les rattachements (la fusion emporte avec elle
  // ce qui vient d'être rattaché à la fiche du dressing) et avant les créations.
  const main = fichesMain(donnees, N, { portee: porteeMain });
  const rang = { fusionner: 0, attacher: 1, fusionner_fiche: 2, groupe: 3, a_verifier: 4, fiche_a_verifier: 5, annonce_en_double: 6, creer: 7, entrer_stock: 8, ignorer: 9, question_caduque: 10 };
  const toutes = main.decisions.length ? decisions.concat(main.decisions).sort((p, q) => (rang[p.type] ?? 99) - (rang[q.type] ?? 99)) : decisions;
  return {
    decisions: toutes,
    bilan: { noeuds: N.length, aretes: R.aretes.length, doubles: R.doubles.length, par_plateforme: parPf, plan: resumer(toutes), vinted_a_juger: (donnees.vinted_a_juger ?? []).length,
      ...(main.bilan ? { fiches_main: main.bilan } : {}), ms: Date.now() - t0 },
    N, R,
  };
}
