// selftest:retraits-lot-cycle-borne — verrou du F1 (16/11 après-midi, feu vert de Nico) : quand des RETRAITS sont en
// file, un passage de get-pending-jobs ne sert que les retraits qui tiennent dans ≈ 15 min estimées, au lieu de
// `out.slice(0, 100)` ; sans retrait (ou sous le budget) : strictement la même file qu'avant.
// Diagnostic : docs/enquetes/lot-1611-3-apres-midi/annexe-p5.md (Marc, thecloset72000 : cycle de 100 tâches, 104 min ;
// vérifications Beebs repoussées de 1 h 45).
//
//   npm run selftest:retraits-lot-cycle-borne
//
//   1. le module pur existe (_shared/tranche-cycle.js) — ROUGE avant le correctif ;
//   2. identique à `out.slice(0, 100)` sans retrait, et avec des retraits sous le budget (2 000 files au hasard) ;
//   3. au-dessus du budget : retraits seuls (plus les republications ENGAGÉES de la tête), au moins un, sous le budget,
//      vérifications Beebs dues en tête, puis l'ordre de la file ; une vérification compte ≈ 40 s ;
//   4. simulation du lot de Marc avec les durées mesurées le 16/11 : la règle d'avant retrouve le cycle de ≈ 104 min ;
//      la tranche : délai max envoi → « retirée » ≤ 30 min, durée totale ≤ 1,15 × celle d'avant ;
//   5. câblage dans get-pending-jobs (réservation de la tranche, tête de file, journal) — ROUGE avant le correctif.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `   ← ${d}` : ''}`); };

const { ordreExtension, teteDeFile } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/tete-de-file.js')).href);
let M = null;
try {
  M = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/tranche-cycle.js')).href);
} catch (e) { /* ROUGE ci-dessous */ }

console.log('1. Le module');
ok(!!M && typeof M.trancheDuCycle === 'function' && typeof M.resumeTranche === 'function',
  '1a. _shared/tranche-cycle.js existe (trancheDuCycle, resumeTranche)');
ok(M?.BUDGET_TRANCHE_S === 900 && M?.PLAFOND_CYCLE === 100
  && M?.COUT_RETRAIT_S?.beebs_envoi === 170 && M?.COUT_RETRAIT_S?.beebs_verification === 40 && M?.COUT_RETRAIT_S?.autre === 25,
  '1b. budget 15 min, plafond 100, coûts mesurés le 16/11 (Beebs envoi 170 s, vérification 40 s, autre 25 s)');

const tranche = M?.trancheDuCycle ?? ((out) => out.slice(0, 100));
const ids = (l) => l.map((j) => j.id).join(',');
const T0 = Date.parse('2026-11-16T10:42:29Z');   // 11:42:29 à Paris, début du lot de Marc
const iso = (s) => new Date(T0 + s * 1000).toISOString();

// 2. Identique sans retrait, ou sous le budget
console.log('\n2. Sans retrait, ou sous le budget : la file d\'avant, à l\'identique');
{
  let graine = 11;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const tirer = (n, avecRetraits) => Array.from({ length: n }, (_, k) => {
    const actions = avecRetraits ? ['publish', 'republish', 'republish', 'delete'] : ['publish', 'republish', 'republish'];
    const action = actions[Math.floor(hasard() * actions.length)];
    const platform = ['vinted', 'leboncoin', 'beebs', 'depop'][Math.floor(hasard() * 4)];
    const pf = {};
    if (action === 'republish' && hasard() < 0.3) { pf.republish_step = 'deleted'; pf.deleted_at = iso(k); }
    if (action === 'delete' && platform === 'beebs' && hasard() < 0.5) pf.beebs_suppression_envoyee = { le: iso(k) };
    return { id: `j${n}-${k}`, action, platform, created_at: iso(k), platform_fields: pf };
  });
  let ecartsSans = 0, ecartsSous = 0, sous = 0, memesObjets = 0;
  for (let n = 0; n < 2000; n++) {
    const sans = tirer(Math.floor(hasard() * 250), false);
    const r = tranche(sans);
    if (ids(r) !== ids(sans.slice(0, 100))) ecartsSans++;
    if (r.every((j, i) => j === sans[i])) memesObjets++;
    const avec = tirer(Math.floor(hasard() * 250), true);
    const coutRetraits = avec.filter((j) => j.action === 'delete')
      .reduce((s, j) => s + (j.platform !== 'beebs' ? 25 : j.platform_fields.beebs_suppression_envoyee ? 40 : 170), 0);
    if (coutRetraits <= 900) { sous++; if (ids(tranche(avec)) !== ids(avec.slice(0, 100))) ecartsSous++; }
  }
  ok(ecartsSans === 0 && memesObjets === 2000, '2a. 2 000 files SANS retrait (0 à 250 tâches) : exactement out.slice(0, 100), mêmes objets', `${ecartsSans} écarts`);
  ok(sous > 100 && ecartsSous === 0, `2b. ${sous} files dont les retraits tiennent dans 15 min : exactement out.slice(0, 100)`, `${ecartsSous} écarts`);
  ok(M?.resumeTranche?.(tirer(80, false)) === null, '2c. sans tranche bornée, rien de plus au journal');
  const vide = tranche([]);
  ok(Array.isArray(vide) && vide.length === 0, '2d. file vide : rien servi');
}

// 3. Au-dessus du budget
console.log('\n3. Au-dessus du budget : une tranche de retraits');
{
  const j = (id, action, platform, s, pf = {}) => ({ id, action, platform, created_at: iso(s), platform_fields: pf });
  const file = [
    j('pub-ancienne', 'publish', 'vinted', 0),
    j('rep-captured', 'republish', 'leboncoin', 1, { republish_step: 'captured' }),
    j('rep-deleted', 'republish', 'vinted', 2, { republish_step: 'deleted', deleted_at: iso(2) }),
    ...Array.from({ length: 12 }, (_, k) => j(`b${k}`, 'delete', 'beebs', 10 + k)),
    j('lbc0', 'delete', 'leboncoin', 30),
    j('v-beebs-1', 'delete', 'beebs', 40, { beebs_suppression_envoyee: { le: iso(41), numero: '1' } }),
    j('dep0', 'delete', 'depop', 50),
    j('v-beebs-2', 'delete', 'beebs', 60, { beebs_suppression_envoyee: { le: iso(61), numero: '2' } }),
    j('pub-recente', 'publish', 'beebs', 70),
  ];
  const r = tranche(file);
  const retraits = r.filter((x) => x.action === 'delete');
  const autres = r.filter((x) => x.action !== 'delete');
  const cout = retraits.reduce((s, x) => s + (x.platform !== 'beebs' ? 25 : x.platform_fields.beebs_suppression_envoyee ? 40 : 170), 0);
  ok(retraits.length >= 1 && cout <= 900, `3a. des retraits, au moins un, sous le budget (${retraits.length} retraits, ≈ ${cout} s)`, ids(r));
  ok(ids(autres) === 'rep-deleted', '3b. rien d\'autre que la republication ENGAGÉE (annonce déjà retirée) : publications et republication à l\'étape « captured » attendent', ids(autres));
  ok(ids(retraits.slice(0, 2)) === 'v-beebs-1,v-beebs-2', '3c. les vérifications Beebs dues en tête de la tranche', ids(r));
  ok(teteDeFile(r) === 'v-beebs-1', '3d. la tête de file (ce que l\'extension commence) est la première vérification', String(teteDeFile(r)));
  ok(ids(retraits.slice(2)) === 'b0,b1,b2,b3', '3e. puis les premiers envois dans l\'ordre de la file, tant que le total tient (80 + 4 × 170 = 760 s ; un 5e ferait 930 s)', ids(retraits));
  // Une vérification compte 40 s : 22 vérifications tiennent (880 s), pas 23.
  const verifs = Array.from({ length: 30 }, (_, k) => j(`v${k}`, 'delete', 'beebs', k, { beebs_suppression_envoyee: { le: iso(k) } }));
  ok(tranche(verifs).length === 22, '3f. une suppression Beebs déjà envoyée compte comme une vérification (≈ 40 s : 22 dans 15 min)', String(tranche(verifs).length));
  // Au moins un : un budget plus petit qu'un premier passage Beebs sert quand même la tête.
  ok(ids(M?.trancheDuCycle?.(file, { budgetS: 60 }) ?? []).startsWith('v-beebs-1') && (M?.trancheDuCycle?.(file, { budgetS: 10 }) ?? []).filter((x) => x.action === 'delete').length === 1,
    '3g. au moins un retrait, même si le premier dépasse seul le budget');
  // Une republication engagée au-delà des 100 premières n'est pas servie (comme avant) ; le plafond de 100 tient.
  const longue = [
    ...Array.from({ length: 150 }, (_, k) => j(`rd${k}`, 'republish', 'vinted', k, { republish_step: 'deleted', deleted_at: iso(k) })),
    ...Array.from({ length: 50 }, (_, k) => j(`d${k}`, 'delete', 'beebs', 200 + k)),
  ];
  const rl = tranche(longue);
  ok(rl.length === 100 && rl.filter((x) => x.action === 'delete').length === 1 && !rl.some((x) => x.id.startsWith('rd') && Number(x.id.slice(2)) >= 100),
    '3h. jamais plus de 100 tâches ; une republication engagée hors des 100 premières attend comme avant', `${rl.length} servies`);
  const phrase = M?.resumeTranche?.(file) ?? '';
  ok(/6 retrait\(s\) servi\(s\) sur 16 en file/.test(phrase) && /10 pour la tranche suivante/.test(phrase) && /1 republication\(s\) engagée\(s\)/.test(phrase) && /3 autre\(s\) tâche\(s\) attendent/.test(phrase),
    '3i. le journal dit combien de retraits restent pour la tranche suivante', phrase);
  ok(ids(tranche([...file].reverse())) === ids(M?.trancheDuCycle?.([...file].reverse()) ?? []) && ids(file) === ids([...file]),
    '3j. pure : la file reçue n\'est pas modifiée');
}

// 4. Simulation du lot de Marc (16/11, 11:42)
console.log('\n4. Simulation : le lot de Marc, durées mesurées le 16/11');
// Lot reconstitué, article par article : 138 Beebs, 134 Leboncoin, 68 Depop (Vinted retenus par la garde de boutique,
// eBay par l'API : hors de la file servie). Trois gestes : 11:42:29-11:44:09 (134 tâches servies au premier passage),
// 11:47:30-11:50:37, 12:04:46-12:06:03.
const lotMarc = () => {
  const gestes = [
    { de: 0, a: 100, B: 36, L: 64, D: 34 },
    { de: 301, a: 488, B: 51, L: 40, D: 12 },
    { de: 1337, a: 1414, B: 51, L: 30, D: 22 },
  ];
  const taches = [];
  let seq = 0;
  for (const g of gestes) {
    const n = g.B + g.L + g.D;
    const faits = { B: 0, L: 0, D: 0 };
    for (let k = 0; k < n; k++) {
      // Réparti régulièrement (le plus en retard sur sa part passe).
      const p = ['B', 'L', 'D'].map((x) => [x, g[x] * (k + 1) / n - faits[x]]).filter(([x]) => faits[x] < g[x]).sort((a, b) => b[1] - a[1])[0][0];
      faits[p]++;
      const cree = g.de + Math.floor((g.a - g.de) * k / n);
      taches.push({ id: `t${seq}`, seq: seq++, cree, platform: { B: 'beebs', L: 'leboncoin', D: 'depop' }[p], du: 0, fin: null, envoi: null,
        job: { id: `t${seq - 1}`, action: 'delete', platform: { B: 'beebs', L: 'leboncoin', D: 'depop' }[p], created_at: iso(cree), platform_fields: {} } });
    }
  }
  return taches;
};
// Mesuré (annexe § 2.2) : Beebs premier passage 155 s, reprise 5 min après ; vérification 35 s ; autre retrait 13 s ;
// pause entre deux tâches 14 s ; un passage de get-pending-jobs sur cette file 12 s ; entre deux cycles, le poll de
// 2 min (borne haute : en vrai, un poll en attente part dès la fin du cycle et de la maintenance).
const simuler = (regle, { G = 120, gpj = 12, pause = 14, dB = 155, dV = 35, dA = 13, reprise = 300 } = {}) => {
  const taches = lotMarc();
  const parId = new Map(taches.map((x) => [x.id, x]));
  let t = 100;   // premier passage : 11:44:09
  const cycles = [];
  while (taches.some((x) => x.fin === null) && t < 48 * 3600) {
    const out = taches.filter((x) => x.fin === null && x.cree <= t && x.du <= t).sort((a, b) => a.cree - b.cree || a.seq - b.seq).map((x) => x.job);
    const servis = regle(out);
    t += gpj;
    if (!servis.length) { t += G - gpj; continue; }
    const debut = t;
    ordreExtension(servis).forEach((job, i) => {
      const x = parId.get(job.id);
      if (i > 0) t += pause;
      if (x.platform === 'beebs' && x.envoi === null) {
        x.envoi = t; t += dB;
        x.job = { ...x.job, platform_fields: { beebs_suppression_envoyee: { le: iso(x.envoi), numero: x.id } } };
        x.du = t + reprise;
      } else { t += x.platform === 'beebs' ? dV : dA; x.fin = t; }
    });
    cycles.push({ debut, fin: t, n: servis.length });
    t += G;
  }
  const beebs = taches.filter((x) => x.platform === 'beebs');
  const delais = beebs.map((x) => (x.fin - x.envoi) / 60).sort((a, b) => a - b);
  return {
    cycles, cycle1: (cycles[0].fin - cycles[0].debut) / 60,
    totalMin: Math.max(...taches.map((x) => x.fin)) / 60,
    maxMin: delais.at(-1), medMin: delais[Math.floor(delais.length / 2)],
    premiereBeebsMin: Math.min(...beebs.map((x) => x.fin)) / 60,
    finLbcDepopMin: Math.max(...taches.filter((x) => x.platform !== 'beebs').map((x) => x.fin)) / 60,
    toutFini: taches.every((x) => x.fin !== null),
  };
};
{
  const avant = simuler((out) => out.slice(0, 100));
  const apres = simuler(tranche);
  const f = (x) => x.toFixed(0);
  console.log(`   avant : cycle 1 = ${f(avant.cycle1)} min, ${avant.cycles.length} cycles, délai envoi → retirée médian ${f(avant.medMin)} / max ${f(avant.maxMin)} min, 1re Beebs retirée à +${f(avant.premiereBeebsMin)} min, Leboncoin+Depop finis à +${f(avant.finLbcDepopMin)} min, tout fini à +${f(avant.totalMin)} min`);
  console.log(`   après : ${apres.cycles.length} tranches, délai médian ${f(apres.medMin)} / max ${f(apres.maxMin)} min, 1re Beebs retirée à +${f(apres.premiereBeebsMin)} min, Leboncoin+Depop finis à +${f(apres.finLbcDepopMin)} min, tout fini à +${f(apres.totalMin)} min (× ${(apres.totalMin / avant.totalMin).toFixed(2)})`);
  ok(avant.toutFini && apres.toutFini, '4a. les deux règles finissent le lot (rien de perdu, rien en double)');
  ok(avant.cycle1 >= 90 && avant.cycle1 <= 120 && avant.maxMin > 90,
    `4b. la règle d'avant retrouve la mesure : cycle 1 de ${f(avant.cycle1)} min (mesuré 104), délai max ${f(avant.maxMin)} min > 90`);
  ok(apres.maxMin <= 30, `4c. tranche : délai max envoi → « retirée » ${f(apres.maxMin)} min ≤ 30`);
  ok(apres.medMin <= 20, `4d. tranche : délai médian ${f(apres.medMin)} min ≤ 20 (avant : ${f(avant.medMin)})`);
  ok(apres.totalMin <= 1.15 * avant.totalMin, `4e. durée totale ${f(apres.totalMin)} min ≤ 1,15 × ${f(avant.totalMin)} min`);
  ok(apres.cycles.every((c) => (c.fin - c.debut) / 60 <= 16), '4f. aucune tranche ne dépasse ≈ 15 min réelles (+ 1 min de marge)',
    String(Math.max(...apres.cycles.map((c) => (c.fin - c.debut) / 60)).toFixed(1)));
  // Pour mémoire (aucun contrôle) : le choix du budget.
  if (M) {
    const lignes = [10, 15, 20, 30].map((b) => {
      const s = simuler((out) => M.trancheDuCycle(out, { budgetS: b * 60 }));
      return `${b} min → ${s.cycles.length} passages servis, délai max ${f(s.maxMin)} min, total × ${(s.totalMin / avant.totalMin).toFixed(2)}`;
    });
    console.log(`   budgets essayés : ${lignes.join(' ; ')}`);
  }
}

// 5. Câblage dans get-pending-jobs
console.log('\n5. get-pending-jobs');
{
  const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
  const iResa = GPJ.indexOf('admin.rpc("reserver_jobs_extension"');
  const bloc = GPJ.slice(GPJ.lastIndexOf('if (!includeProcessing && !includeNeedsUser && out.length) {', iResa), GPJ.indexOf('// ── UNE TÂCHE SERVIE SANS JAMAIS DÉMARRER', iResa));
  ok(/import \{ trancheDuCycle, resumeTranche \} from "\.\.\/_shared\/tranche-cycle\.js";/.test(GPJ), '5a. le module est importé');
  ok(/const servis = trancheDuCycle\(out\);/.test(bloc) && !/out\.slice\(0, 100\)/.test(bloc),
    '5b. la réservation porte la tranche (trancheDuCycle), plus out.slice(0, 100)');
  ok(/p_jobs: servis\.map\(j => j\.id\),\s*\n\s*p_tete: teteDeFile\(servis\),/.test(bloc), '5c. la tête de file reste celle de la file servie');
  ok(/const resumeT = resumeTranche\(out\);\s*\n\s*if \(resumeT\) console\.log\(`\[get-pending-jobs\] userId=\$\{user\.id\} : \$\{resumeT\}`\);\s*\n\s*out = out\.filter\(j => idsPris\.has\(String\(j\.id\)\)\);/.test(bloc),
    '5d. le journal dit la tranche (avant que la file ne soit réduite aux tâches réservées)');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
