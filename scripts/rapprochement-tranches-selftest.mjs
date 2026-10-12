// ═══════════════════════════════════════════════════════════════════════════
// LA PASSE EN TRANCHES REND LES MÊMES DÉCISIONS (12/10/2026, cas ferreirasab)
// ═══════════════════════════════════════════════════════════════════════════
// La fonction edge `rapprochement` mourait à chaque passe du compte de
// ferreirasab (« CPU Time exceeded » : 2 s de CPU par appel). La passe se fait
// désormais en tranches (_shared/rapprochement/tranches.js), reprises d'une
// invocation à l'autre. Ce test rejoue, sur des comptes fabriqués (photos de
// fond blanc qui remplissent les tiroirs, titres qui se ressemblent, annonces
// en double, décisions de la personne, fiches à la main, fiches Vinted
// nouvelles) :
//   · la liste des candidates réassemblée (parts de tiroirs, morceaux, titres)
//     est celle de candidatsDe, à l'identique et dans le même ordre ;
//   · la passe en tranches — chaque invocation repartant de zéro, une SEULE
//     unité par invocation, le cache passant par du JSON comme en base — rend
//     exactement les décisions de la passe d'un seul tenant (normal, réparation,
//     fiches à la main « toutes ») ;
//   · la forme compacte des empreintes donne les mêmes photos et les mêmes
//     « manquantes » que les lignes de photo_empreintes, cas tordus compris ;
//   · aucune unité ne dépasse son budget de beaucoup (mesuré) ;
//   · la fonction edge et la migration portent bien la chaîne.
//   · l'ordre de la lecture ne change rien : deux lectures des mêmes données dans
//     deux ordres (rapprochement_v3_lire n'a pas d'ORDER BY) rangées par ordonner
//     donnent la même signature et les mêmes décisions.
// La preuve sur les comptes RÉELS (Corinne, de63ca45, 7373c96c, ferreirasab…) :
// scripts/preuves/rapprochement-tranches-equivalence.mjs (données de prod, hors dépôt).
//
//   npm run selftest:rapprochement-tranches
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construireNoeuds, candidatsDe, candidatsPhotoPartie, candidatsTitresPartie, candidatsAssembler } from '../supabase/functions/_shared/rapprochement/moteur.js';
import { passe, urlsDe, manquantesDe, ordonner } from '../supabase/functions/_shared/rapprochement/passe.js';
import { photoDepuisEmpreinte, photoDepuisCompacte, compacteComplete } from '../supabase/functions/_shared/rapprochement/photos.js';
import { calculEnTranches, cacheDepuis, Suite } from '../supabase/functions/_shared/rapprochement/tranches.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── Un générateur déterministe ────────────────────────────────────────────────
function alea(graine) { let x = graine >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const MOTS = ['robe', 'pull', 'jean', 'sweat', 'tshirt', 'veste', 'pantalon', 'gilet', 'short', 'body', 'pyjama', 'manteau'];
const MARQUES = ['zara', 'kiabi', 'okaidi', 'jacadi', 'petit bateau', 'tape a l oeil', 'h&m', 'sergent major'];
const COULEURS = ['bleu', 'rose', 'blanc', 'gris', 'noir', 'vert', ''];
const TAILLES = ['2 ans', '3 ans', '4 ans', '6 ans', '8 ans', '10 ans', '12 ans'];
const hex16 = (r) => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
const bin = (h) => BigInt('0x' + h).toString(2).padStart(64, '0');
// « fond blanc » : toutes les photos partagent une base, quelques bits changent
function photoProche(r, base, flips) {
  const b = base.split('');
  for (let q = 0; q < flips; q++) { const i = Math.floor(r() * 64); b[i] = b[i] === '0' ? '1' : '0'; }
  return b.join('');
}
function compte(graine, { fiches = 220, copies = 0.6, doubles = 0.08, main = 0 } = {}) {
  const r = alea(graine);
  const base = [bin(hex16(r)), bin(hex16(r))];
  const E = new Map();
  const nouvellePhoto = (nom, modele = null, flips = 2) => {
    const u = `https://cdn.test/${graine}/${nom}.jpg`;
    const src = modele ?? { dhash: photoProche(r, base[0], 18), phash: photoProche(r, base[1], 18),
      variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k) => [k, [photoProche(r, base[0], 16), photoProche(r, base[1], 16)]])) };
    const v = {};
    for (const [k, [d, p]] of Object.entries(src.variantes)) v[k] = [photoProche(r, d, flips), photoProche(r, p, flips)];
    E.set(u, { url: u, dhash: photoProche(r, src.dhash, flips), phash: photoProche(r, src.phash, flips), variantes: v });
    return u;
  };
  const F = [], A = [];
  let idA = 0;
  for (let i = 0; i < fiches; i++) {
    const titre = `${MOTS[Math.floor(r() * MOTS.length)]} ${MARQUES[Math.floor(r() * MARQUES.length)]} ${COULEURS[Math.floor(r() * COULEURS.length)]} ${TAILLES[Math.floor(r() * TAILLES.length)]}`.replace(/\s+/g, ' ').trim();
    const ph = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, k) => nouvellePhoto(`f${i}_${k}`, null, 0));
    const estMain = i < main;
    F.push({ id: String(1000 + i), titre, prix: 3 + Math.floor(r() * 20), statut: r() < 0.1 ? 'vendu' : 'stock', origine: estMain ? null : 'vinted_sync', marque: null,
      taille: null, photos: ph, a_verifier: false, a_verifier_auto: false, created_at: '2026-10-12T08:00:00Z', quantite: 1, vinted_item_id: estMain ? null : String(9_000_000 + i) });
    for (const pf of ['leboncoin', 'beebs', 'ebay']) {
      if (r() > copies * (pf === 'ebay' ? 0.2 : 1)) continue;
      const n = r() < doubles ? 2 : 1;               // publiée deux fois sur la même plateforme
      for (let c = 0; c < n; c++) {
        const phA = ph.slice(0, 1 + Math.floor(r() * ph.length)).map((u, k) => nouvellePhoto(`a${idA}_${k}`, E.get(u), 2 + Math.floor(r() * 6)));
        const lie = r() < 0.25 ? String(1000 + i) : null;
        A.push({ id: `a-${graine}-${idA++}`, platform: pf, listing_id: String(idA), url: `https://${pf}.test/${idA}`, titre: r() < 0.8 ? titre : titre.split(' ').slice(0, 2).join(' '),
          prix: 3 + Math.floor(r() * 20), photo_url: phA[0], photos: phA, taille: null, marque: null, inventaire_id: lie, ignoree: false,
          ignoree_par_utilisateur: r() < 0.03, proposition_motif: null, source: lie ? (r() < 0.3 ? 'manuel' : 'photo') : null, run_id: 'r1', en_ligne: true,
          hors_liste: false, ebay_bloque: false, geste: true, derniere_par: lie ? (r() < 0.2 ? 'utilisateur' : 'auto') : null, derniere_decision: lie ? 'attache' : null });
      }
    }
  }
  // quelques annonces seules (rien ailleurs) et des homonymes
  for (let i = 0; i < Math.floor(fiches / 10); i++) {
    const ph = [nouvellePhoto(`s${i}`)];
    A.push({ id: `s-${graine}-${i}`, platform: r() < 0.5 ? 'leboncoin' : 'beebs', listing_id: `s${i}`, url: `https://x.test/s${i}`, titre: F[Math.floor(r() * F.length)].titre,
      prix: 7, photo_url: ph[0], photos: ph, taille: null, marque: null, inventaire_id: null, ignoree: false, ignoree_par_utilisateur: false, proposition_motif: null,
      source: null, run_id: 'r1', en_ligne: true, hors_liste: false, ebay_bloque: false, geste: true, derniere_par: null, derniere_decision: null });
  }
  const vintedNouvelles = F.filter((f) => f.origine === 'vinted_sync').slice(-Math.floor(fiches / 5)).map((f) => f.id);
  const donnees = { fiches: F, annonces: A, fusions: [], doublons: [{ id: 'd1', garde: F[0].id, absorbe: F[1].id, statut: 'refusee', decide_par: 'utilisateur', auto: false }],
    vinted_a_juger: vintedNouvelles, fiches_main_actif: true, fiches_main_a_juger: F.slice(0, main).map((f) => f.id), geste_recent: true };
  return { donnees, E };
}

// La forme compacte d'une ligne photo_empreintes (ce que rend rapprochement_v3_empreintes_compactes)
const hexa = (s) => (typeof s === 'string' && /^[01]{64}$/.test(s) ? BigInt('0b' + s).toString(16).padStart(16, '0') : s == null ? null : { brut: s });
function compacte(row) {
  if (!row) return undefined;
  const v = row.variantes;
  const out = [row.url, hexa(row.dhash), hexa(row.phash), v && typeof v === 'object' ? 1 : 0];
  for (const k of ['c70', 'p85', 'g45', 'g60', 'g35']) {
    const x = v && typeof v === 'object' && !Array.isArray(v) ? v[k] : undefined;
    if (Array.isArray(x) && x.length === 2) out.push(hexa(x[0]) ?? { brut: null }, hexa(x[1]) ?? { brut: null }); else out.push(null, null);
  }
  return out;
}

// La passe en tranches, comme la fonction edge : chaque invocation repart de zéro
// (nœuds neufs et paresseux), le cache passe par du JSON (rapprochement_tranches).
function passeEnTranches(donnees, E, opts, { horloge = null, budgetMs = 0 } = {}) {
  const C = new Map([...E].map(([u, row]) => [u, compacte(row)]));
  const photosDe = (us) => us.map((u) => photoDepuisCompacte(C.get(u))).filter(Boolean);
  const lignes = new Map(); let invocations = 0; let res = null; let maxUnites = 0;
  for (;;) {
    invocations++;
    const cache = cacheDepuis([...lignes].map(([cle, contenu]) => ({ cle, contenu })));
    const nouveaux = []; const budget = { fin: horloge ? -1 : performance.now() + budgetMs, unites: 0 };
    const calcul = calculEnTranches({ cache, budget, nouveaux, ...(horloge ? { horloge } : {}) });
    try { res = passe(structuredClone(donnees), null, { ...opts, calcul, photosDe, paresseux: true }); }
    catch (e) { if (!(e instanceof Suite)) throw e; }
    maxUnites = Math.max(maxUnites, budget.unites);
    for (const n of nouveaux) {
      lignes.set(n.cle, JSON.stringify(n.contenu));
      if (n.remplace) for (const k of [...lignes.keys()]) if (k.startsWith(n.remplace) && k !== n.cle) lignes.delete(k);
    }
    if (res) return { res, invocations, maxUnites, lignes: lignes.size };
    if (invocations > 20000) throw new Error('la passe en tranches ne finit pas');
  }
}

console.log('1. La liste des candidates, réassemblée, est celle de candidatsDe (ordre compris)');
{
  let tout = true, essais = 0;
  for (const graine of [11, 12, 13]) {
    const { donnees, E } = compte(graine, { fiches: 120 });
    const photosDe = (us) => us.map((u) => photoDepuisEmpreinte(E.get(u))).filter(Boolean);
    const N = construireNoeuds(donnees, photosDe);
    const r = alea(graine * 7);
    for (const actifs of [null, new Set(N.map((_, i) => i).filter(() => r() < 0.3)), new Set([0, 1, 2])]) {
      const ref = JSON.stringify(candidatsDe(N, actifs));
      for (const P of [1, 3, 7]) {
        // des morceaux de tailles au hasard (l'horloge coupe n'importe où)
        const photo = [];
        for (let rr = 0; rr < P; rr++) for (let d = 0; d !== -1;) { const m = candidatsPhotoPartie(N, actifs, P, rr, d, () => r() < 0.7); photo.push(m.paires); d = m.suivant; }
        const titres = [];
        for (let d = 0; d !== -1;) { const m = candidatsTitresPartie(N, actifs, d, () => r() < 0.7); titres.push(m.paires); d = m.suivant; }
        // les morceaux photo arrivent dans le désordre (une invocation par morceau, n'importe lequel)
        photo.sort(() => r() - 0.5);
        essais++;
        if (JSON.stringify(candidatsAssembler(photo, titres)) !== ref) { tout = false; console.log(`    graine ${graine}, P=${P}, actifs ${actifs ? actifs.size : 'tous'} : DIFFÉRENT`); }
      }
    }
  }
  ok(tout, `${essais} réassemblages (3 comptes, 3 jeux d'actifs, P = 1, 3, 7, morceaux au hasard) identiques à candidatsDe`);
}

console.log('2. La passe en tranches rend exactement les décisions de la passe d\'un seul tenant');
{
  // une unité par invocation (l'horloge, un compteur, est toujours « au-delà du budget ») : le
  // découpage le plus fin ; un morceau de tiroirs s'arrête après MIN_PARCOURS_MS relectures
  let tic = 0;
  const horloge = () => tic++;
  for (const [graine, o, opts] of [
    [21, { fiches: 70 }, { mode: 'normal' }],
    [22, { fiches: 70 }, { mode: 'reparation' }],
    [23, { fiches: 70, main: 20 }, { mode: 'normal', fichesMain: 'toutes' }],
    [24, { fiches: 80, doubles: 0.3 }, { mode: 'normal' }],
  ]) {
    const { donnees, E } = compte(graine, o);
    const direct = passe(structuredClone(donnees), E, opts);
    const t = passeEnTranches(donnees, E, opts, { horloge });
    const plan = JSON.stringify(direct.bilan.plan);
    ok(JSON.stringify(direct.decisions) === JSON.stringify(t.res.decisions) && t.maxUnites === 1,
      `compte ${graine} (${opts.mode}${opts.fichesMain ? ', fiches à la main : ' + opts.fichesMain : ''}) : ${direct.decisions.length} décisions ${plan} — ${t.invocations} invocations d'une unité, identiques`);
  }
  // budgets réels, mesurés : mêmes décisions, et aucune invocation ne dérape
  const { donnees, E } = compte(31, { fiches: 300, doubles: 0.15 });
  const direct = passe(structuredClone(donnees), E, { mode: 'normal' });
  for (const b of [60, 400]) {
    const t = passeEnTranches(donnees, E, { mode: 'normal' }, { budgetMs: b });
    ok(JSON.stringify(direct.decisions) === JSON.stringify(t.res.decisions), `budget ${b} ms : ${t.invocations} invocation(s), ${direct.decisions.length} décisions identiques`);
  }
}

console.log('3. Les empreintes compactes donnent les mêmes photos et les mêmes manquantes');
{
  const b = (c) => c.repeat(64);
  const L = [
    { url: 'u1', dhash: b('0'), phash: b('1'), variantes: { c70: [b('1'), b('0')], g35: [b('0'), b('0')] } },
    { url: 'u2', dhash: b('0'), phash: b('1'), variantes: null },
    { url: 'u3', dhash: b('0'), phash: b('1'), variantes: [] },
    { url: 'u4', dhash: '', phash: b('1'), variantes: {} },
    { url: 'u5', dhash: '01x' + b('1').slice(3), phash: b('1'), variantes: { c70: [123, b('1')], p85: [b('1')], g45: [null, b('0')], g60: ['01z' + b('0').slice(3), b('1')] } },
    { url: 'u6', dhash: null, phash: b('1'), variantes: {} },
    { url: 'u7', dhash: b('1').slice(1), phash: b('1'), variantes: { c70: 'x' } },
  ];
  const E = new Map(L.map((x) => [x.url, x]));
  const C = new Map(L.map((x) => [x.url, JSON.parse(JSON.stringify(compacte(x)))]));
  const urls = [...E.keys(), 'u8-absente'];
  ok(urls.every((u) => JSON.stringify(photoDepuisEmpreinte(E.get(u))) === JSON.stringify(photoDepuisCompacte(C.get(u)))), '8 cas (variantes nulles, en tableau, chaînes tordues, empreinte vide, absente) : même photo');
  const m1 = manquantesDe(urls, E, new Set(['u7'])), m2 = urls.filter((u) => !new Set(['u7']).has(u) && !compacteComplete(C.get(u)));
  ok(JSON.stringify(m1) === JSON.stringify(m2), `mêmes manquantes (${m1.join(', ')})`);
  const { donnees, E: E2 } = compte(41, { fiches: 120 });
  const us = urlsDe(donnees);
  ok(us.every((u) => JSON.stringify(photoDepuisEmpreinte(E2.get(u))) === JSON.stringify(photoDepuisCompacte(compacte(E2.get(u))))), `${us.length} photos fabriquées : mêmes lectures`);
}

console.log("4. L'ordre de la lecture ne décide rien (ordonner)");
{
  // rapprochement_v3_lire agrège sans ORDER BY : deux lectures des mêmes données peuvent
  // rendre deux ordres (12/10 11:29, ferreirasab). Rangées, elles sont la même chose.
  const melanger = (l, r) => { const x = l.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const lecture = (d, graine) => {
    const r = alea(graine);
    return { ...d, fiches: melanger(d.fiches, r), annonces: melanger(d.annonces, r), doublons: melanger(d.doublons ?? [], r), fusions: melanger(d.fusions ?? [], r),
      vinted_a_juger: melanger(d.vinted_a_juger ?? [], r) };
  };
  for (const [graine, o, opts] of [
    [51, { fiches: 90 }, { mode: 'normal' }],
    [52, { fiches: 90, doubles: 0.3 }, { mode: 'reparation' }],
    [53, { fiches: 70, main: 20 }, { mode: 'normal', fichesMain: 'toutes' }],
  ]) {
    const { donnees, E } = compte(graine, o);
    const a = ordonner(lecture(donnees, 1)), b = ordonner(lecture(donnees, 2));
    const memeLecture = JSON.stringify(a) === JSON.stringify(b);
    const da = passe(structuredClone(a), E, opts).decisions, db = passe(structuredClone(b), E, opts).decisions;
    const t = passeEnTranches(b, E, opts, { budgetMs: 60 });
    ok(memeLecture && JSON.stringify(da) === JSON.stringify(db) && JSON.stringify(da) === JSON.stringify(t.res.decisions),
      `compte ${graine} (${opts.mode}) : deux ordres de lecture, une seule lecture rangée, ${da.length} décisions identiques (en tranches aussi)`);
  }
  ok(JSON.stringify(ordonner(ordonner({ fiches: [{ id: '2' }, { id: '10' }], annonces: [] }))) === JSON.stringify(ordonner({ fiches: [{ id: '10' }, { id: '2' }], annonces: [] })), 'ordonner est stable et idempotent');
  const f = lire('supabase/functions/rapprochement/index.ts');
  const iO = f.indexOf('ordonner(lu)'), iS = f.indexOf('await signature(donnees');
  ok(iO > 0 && iS > iO, 'index.ts : la lecture est rangée avant la signature et la passe');
}

console.log('5. La fonction edge et la migration portent la chaîne');
{
  const f = lire('supabase/functions/rapprochement/index.ts');
  ok(/calculEnTranches\(/.test(f) && /instanceof Suite/.test(f) && /paresseux: true/.test(f), 'index.ts : passe en tranches (calculEnTranches, Suite, nœuds paresseux)');
  const budget = Number((f.match(/const BUDGET_CPU_MS = (\d+)/) ?? [])[1]);
  ok(budget > 0 && budget <= 1200, `budget de CPU visé par invocation : ${budget} ms (≤ 1 200, la limite du runtime est 2 000)`);
  ok(/rapprochement_v3_empreintes_compactes/.test(f) && /rapprochement_tranches/.test(f), 'index.ts : empreintes compactes, chantier en base');
  ok(/passages: progres \? 0 : -\(inachevees \+ 1\)/.test(f) && /PASSES_INACHEVEES_MAX = 3/.test(f), 'disjoncteur conservé : une tranche sans progrès compte, 3 de suite arrêtent le compte');
  const m = lire('supabase/migrations/20261012120000_rapprochement_passe_en_tranches.sql');
  ok(/CREATE TABLE IF NOT EXISTS public\.rapprochement_tranches/.test(m) && /ENABLE ROW LEVEL SECURITY/.test(m) && /REVOKE ALL ON public\.rapprochement_tranches FROM PUBLIC, anon, authenticated/.test(m),
    'migration : table interne (RLS, fermée à anon/authenticated)');
  ok(/rapprochement_v3_empreintes_compactes\(p_urls text\[\]\)/.test(m), 'migration : rapprochement_v3_empreintes_compactes');
  const cfg = lire('supabase/config.toml');
  ok(/\[functions\.rapprochement\]\s*\nverify_jwt = false/.test(cfg), 'config.toml : rapprochement en verify_jwt = false (appelée par la base, x-cron-secret)');
  const moteur = lire('supabase/functions/_shared/rapprochement/moteur.js');
  ok(/SEUILS = Object\.freeze\(\{ multi: 9, multi3: 12, quasi: 4, une: 7, proche: 12, plausible: 7 \}\)/.test(moteur)
    && /const TIROIR_MAX = 300;/.test(moteur) && /const COLLISION_MAX = 16;/.test(moteur), 'aucun seuil changé (SEUILS, TIROIR_MAX, COLLISION_MAX)');
}

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
