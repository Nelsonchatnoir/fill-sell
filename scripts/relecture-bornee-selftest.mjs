// Autotest de la RELECTURE BORNÉE et des JOBS DU STOCK RELUS PAR MORCEAUX
// (04/10/2026, incident CPU 99 % — app bloquée sur le chargement pour tous).
//
//     node --import ./scripts/loader-ext.mjs scripts/relecture-bornee-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. l'attente double sur erreur ou lenteur, plafonnée, et revient à
//      l'intervalle après une lecture saine (attenteSuivante) ;
//   2. demarrerRelecture : aucune lecture onglet caché, jamais deux lectures
//      en vol, reprise au retour d'onglet, arrêt propre ;
//   3. les jobs du Stock : la lecture légère fusionnée donne EXACTEMENT ce que
//      donnerait la lecture complète (statuts, tri, regroupement), un job qui
//      sort de la liste disparaît, et le filtre retombe sur la lecture
//      complète quand il ne peut pas tout couvrir ;
//   4. les écrans relisent par relectureBornee : plus de setInterval à
//      cadence fixe dans les relectures corrigées le 04/10.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);

let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

// ── 1. attenteSuivante ─────────────────────────────────────────────────────
console.log('1. attente suivante');
const { attenteSuivante, demarrerRelecture } = await charger('src/utils/relectureBornee.js');
const o = { intervalleMs: 20_000, maxMs: 300_000, lentMs: 4000 };
ok(attenteSuivante(20_000, { ...o, rate: false, dureeMs: 200 }) === 20_000, 'lecture saine → intervalle');
ok(attenteSuivante(20_000, { ...o, rate: true, dureeMs: 200 }) === 40_000, 'erreur → attente doublée');
ok(attenteSuivante(40_000, { ...o, rate: false, dureeMs: 9000 }) === 80_000, 'lenteur (9 s > 4 s) → attente doublée');
ok(attenteSuivante(200_000, { ...o, rate: true }) === 300_000, 'plafond respecté');
ok(attenteSuivante(300_000, { ...o, rate: false, dureeMs: 100 }) === 20_000, 'retour à l’intervalle après une lecture saine');

// ── 2. demarrerRelecture (document et minuterie simulés) ───────────────────
console.log('2. relecture bornée');
const ecouteurs = new Set();
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (t, f) => { if (t === 'visibilitychange') ecouteurs.add(f); },
  removeEventListener: (t, f) => { if (t === 'visibilitychange') ecouteurs.delete(f); },
};
const montrer = (v) => { document.visibilityState = v ? 'visible' : 'hidden'; for (const f of [...ecouteurs]) f(); };
let horloge = 0;
const minuteries = [];
const vraiSetTimeout = globalThis.setTimeout, vraiClearTimeout = globalThis.clearTimeout, vraiNow = Date.now;
globalThis.setTimeout = (f, ms) => { const m = { f, a: horloge + (ms || 0), vivante: true }; minuteries.push(m); return m; };
globalThis.clearTimeout = (m) => { if (m) m.vivante = false; };
Date.now = () => horloge;
const avancer = async (ms) => {
  const fin = horloge + ms;
  for (;;) {
    const prochaine = minuteries.filter((m) => m.vivante && m.a <= fin).sort((x, y) => x.a - y.a)[0];
    if (!prochaine) break;
    horloge = prochaine.a; prochaine.vivante = false;
    prochaine.f(); // jamais attendue : une lecture pendante ne doit pas figer l'horloge
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  horloge = fin;
};
let lectures = 0;
let reponse = () => true;
const r = demarrerRelecture(async () => { lectures++; return reponse(); }, { intervalleMs: 20_000, maxMs: 160_000, lentMs: 4000 });
await avancer(1);
ok(lectures === 1, 'une lecture immédiate au démarrage');
await avancer(20_000);
ok(lectures === 2, 'une lecture par intervalle (20 s)');
montrer(false);
await avancer(120_000);
ok(lectures === 2, 'onglet caché : aucune lecture en 2 min');
montrer(true);
await avancer(1);
ok(lectures === 3, 'retour d’onglet après une longue absence : une lecture tout de suite');
reponse = () => false;
await avancer(20_000);
ok(lectures === 4, 'lecture ratée…');
await avancer(20_000);
ok(lectures === 4, '… la suivante attend plus (40 s, pas 20)');
await avancer(20_000);
ok(lectures === 5, '… et part à 40 s');
reponse = () => true;
await avancer(80_000);
ok(lectures === 6, 'après deux ratés, 80 s d’attente');
await avancer(20_000);
ok(lectures === 7, 'une lecture saine ramène à 20 s');
r.arreter();
await avancer(200_000);
ok(lectures === 7 && ecouteurs.size === 0, 'arrêt : plus aucune lecture, écouteur retiré');
// Jamais deux lectures en vol
let enVol = 0, maxEnVol = 0, liberer = null;
const r2 = demarrerRelecture(async () => { enVol++; maxEnVol = Math.max(maxEnVol, enVol); await new Promise((res) => { liberer = res; }); enVol--; return true; }, { intervalleMs: 1000 });
await avancer(1); r2.relireMaintenant(); await avancer(5000); r2.relireMaintenant(); await avancer(5000);
ok(maxEnVol === 1, 'jamais deux lectures en vol, même sur relireMaintenant');
liberer?.(); r2.arreter();
// (04/10 soir) Onglet CACHÉ au démarrage (ouvert en arrière-plan) : la
// première lecture part quand même, les suivantes attendent le retour.
montrer(false);
let lecturesCache = 0;
const r3 = demarrerRelecture(async () => { lecturesCache++; return true; }, { intervalleMs: 20_000 });
await avancer(1);
ok(lecturesCache === 1, 'onglet caché au démarrage : la PREMIÈRE lecture part quand même');
await avancer(120_000);
ok(lecturesCache === 1, '… et aucune autre tant que l’onglet reste caché');
montrer(true);
await avancer(1);
ok(lecturesCache === 2, 'retour d’onglet : relecture');
r3.arreter();
globalThis.setTimeout = vraiSetTimeout; globalThis.clearTimeout = vraiClearTimeout; Date.now = vraiNow;

// ── 3. Jobs du Stock par morceaux ──────────────────────────────────────────
console.log('3. jobs du Stock relus par morceaux');
const J = await charger('src/stock/jobsIncrementaux.js');
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const job = (n, inv, status, created) => ({ id: uid(n), inventaire_id: inv, status, created_at: created, platform: 'vinted' });
const complet = [
  job(1, 10, 'published', '2026-10-01T10:00:00.000000+00:00'),
  job(2, 10, 'processing', '2026-10-04T10:00:00.000000+00:00'),
  job(3, 11, 'pending', '2026-10-04T11:00:00.000000+00:00'),
  job(4, 12, 'failed', '2026-10-02T09:00:00.000000+00:00'),
  job(5, 12, 'expired', '2026-10-03T09:00:00.000000+00:00'),
];
const base = J.indexerJobs(complet);
ok(base.size === 4, 'lecture complète : un statut hors liste n’entre pas');
ok(J.idsVivants(base).sort().join() === [uid(2), uid(3)].join(), 'jobs en cours repérés');
ok(J.plusRecent(base) === '2026-10-04T11:00:00.000000+00:00', 'borne des nouveaux = le plus récent connu');
const leger = [
  { ...job(2, 10, 'published', '2026-10-04T10:00:00.000000+00:00') },
  { ...job(3, 11, 'superseded', '2026-10-04T11:00:00.000000+00:00') },
  job(6, 11, 'pending', '2026-10-04T12:00:00.000000+00:00'),
];
const fusion = J.regrouperParArticle(J.fusionnerJobs(base, leger));
// La vérité : ce qu'aurait rendu la lecture complète au même instant.
const verite = J.regrouperParArticle(J.indexerJobs([complet[0], leger[0], complet[3], leger[2], leger[1]]));
ok(JSON.stringify(fusion) === JSON.stringify(verite), 'fusion légère = lecture complète (statuts, tri, regroupement)');
ok(fusion[10][0].status === 'published' && fusion[10][1].id === uid(1), 'le plus récent d’abord dans chaque article');
ok(!JSON.stringify(fusion).includes(uid(3)), 'un job sorti de la liste disparaît');
const f = J.filtreLeger({ vivants: J.idsVivants(base), depuis: J.plusRecent(base) });
ok(f.includes('status.in.(pending,processing,needs_user)') && f.includes(`id.in.(${uid(2)},${uid(3)})`) && f.includes('created_at.gte."2026-10-04T11:00:00.000000+00:00"'), 'filtre : en cours, ceux qui l’étaient, nés depuis');
ok(J.filtreLeger({ vivants: [], depuis: null }) === null, 'rien de connu → lecture complète');
ok(J.filtreLeger({ vivants: Array.from({ length: 201 }, (_, i) => uid(i)), depuis: 'x' }) === null, 'trop de jobs en cours → lecture complète');

// ── 4. Les écrans corrigés relisent par relectureBornee ────────────────────
console.log('4. écrans');
const releve = lire('src/annonces/useReleveAnnonces.js');
ok(releve.includes('demarrerRelecture(') && !/setInterval\(/.test(releve), 'Mes annonces en ligne : relecture bornée, plus de setInterval');
ok(/POLL_MS = 60000/.test(releve) && /POLL_ACTIF_MS = 15000/.test(releve), 'Mes annonces en ligne : 60 s au repos, 15 s en cours');
const repub = lire('src/hooks/useRepublicationPlanifiee.js');
ok(repub.includes('demarrerRelecture(') && !/setInterval\(/.test(repub), 'Republication auto : relecture bornée');
ok(/useRepublicationPlanifiee\(\{ userId: user\?\.id, multi: true, pollMs: 300000 \}\)/.test(lire('src/tabs/StockTab.jsx')), 'Stock : republication relue toutes les 5 min');
const opla = lire('src/utils/oplaAcces.js');
ok(opla.includes('demarrerRelecture(') && !/setInterval\(tick, 60 \* 1000\)/.test(opla), 'Accès Opla : 5 min bornées, plus 60 s fixes');
const stock = lire('src/tabs/StockTab.jsx');
ok(stock.includes('fusionnerJobs(parId, lignes)') && !/\}, 20000\);/.test(stock), 'Stock : jobs relus par morceaux, plus de lecture complète toutes les 20 s');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
