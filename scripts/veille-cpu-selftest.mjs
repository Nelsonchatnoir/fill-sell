// Autotest de la VEILLE CPU (04/10/2026, incident CPU 99 %).
//
//     node scripts/veille-cpu-selftest.mjs
//
// Ce qu'il prouve, sans réseau : lecture des compteurs Prometheus, calcul du
// pourcentage entre deux relevés, et la décision — alerte après 10 min au-delà
// de 70 % (pas avant, pas sur un pic isolé), une par heure au plus, « rétabli »
// une seule fois quand ça redescend sous 50 %.
import { lireCompteursCpu, pctEntre, decider } from '../supabase/functions/_shared/veille-cpu.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

const metr = (idle0, user0, idle1, user1) => [
  `node_cpu_seconds_total{cpu="0",mode="idle",service_type="db"} ${idle0}`,
  `node_cpu_seconds_total{cpu="0",mode="iowait",service_type="db"} 1`,
  `node_cpu_seconds_total{cpu="0",mode="user",service_type="db"} ${user0}`,
  `node_cpu_seconds_total{cpu="1",mode="idle",service_type="db"} ${idle1}`,
  `node_cpu_seconds_total{cpu="1",mode="user",service_type="db"} ${user1}`,
  'node_load1{service_type="db"} 0.2',
].join('\n');
const a = lireCompteursCpu(metr(100, 20, 100, 20));
ok(a && a.total === 241 && a.inactif === 201, 'compteurs : somme des cœurs, idle + iowait = inactif');
ok(lireCompteursCpu('rien') === null, 'pas de compteur → null');
const b = lireCompteursCpu(metr(110, 110, 110, 110)); // +10 idle, +90 user par cœur
ok(pctEntre(a, b) === 90, '90 % occupé entre deux relevés');
ok(pctEntre(b, a) === null, 'compteurs qui reculent (redémarrage) → null');
ok(pctEntre(a, a) === null, 'même relevé → null');

const T = Date.parse('2026-10-04T18:00:00Z');
const ech = (pcts) => pcts.map((p, i) => ({ le: new Date(T - i * 2 * 60_000).toISOString(), pct: p }));
ok(decider({ echantillons: ech([95, 92, 88, 90, 85]), maintenant: T }).action === 'alerte', '5 relevés > 70 % sur 10 min → alerte');
ok(decider({ echantillons: ech([95, 92, 60, 90, 85]), maintenant: T }).action === null, 'un relevé sous 70 % → pas d’alerte');
ok(decider({ echantillons: ech([95, 92, 88]), maintenant: T }).action === null, 'moins de 10 min d’historique → pas d’alerte');
ok(decider({ echantillons: ech([95, 92, 88, 90, 85]), derniereAlerte: new Date(T - 30 * 60_000).toISOString(), maintenant: T }).action === null, 'alerte il y a 30 min → pas de rappel');
ok(decider({ echantillons: ech([95, 92, 88, 90, 85]), derniereAlerte: new Date(T - 61 * 60_000).toISOString(), maintenant: T }).action === 'alerte', 'alerte il y a 61 min → rappel');
ok(decider({ echantillons: ech([20, 25, 30, 22, 18]), derniereAlerte: new Date(T - 20 * 60_000).toISOString(), maintenant: T }).action === 'retabli', 'retour sous 50 % après une alerte → rétabli');
ok(decider({ echantillons: ech([20, 25, 30, 22, 18]), derniereAlerte: new Date(T - 40 * 60_000).toISOString(), dernierRetabli: new Date(T - 10 * 60_000).toISOString(), maintenant: T }).action === null, 'rétabli déjà dit → silence');
ok(decider({ echantillons: ech([20, 25, 30, 22, 18]), maintenant: T }).action === null, 'calme sans alerte préalable → silence');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
