// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 16/11/2026 (ordre URGENT de Nico) — LE RACHAT D'IP NE COMPTE QUE LES IP RÉELLEMENT ATTRIBUABLES
//     npm run selftest:cloud-ip-rachat-attribuables
// ═══════════════════════════════════════════════════════════════════════════
// Constat : « Complet » affiché depuis ~15:39 alors que la pub tourne. 0 IP attribuable à un nouveau compte (la 3
// réservée, la 39 gardée à Nico, la 40 et la 76 au repos) ; le plan du jour et la garde du nombre comptaient la 3 et la 39
// comme du stock → aCommander 0, et la garde refusait même un achat manuel (« garde_nombre »).
// Ce test prouve, sur le pool du 16/11 : le plan achète, la garde laisse passer ce qu'il achète, et une IP réservée ou au
// repos ne compte jamais pour l'achat ; la migration SQL porte la même règle (20261116220000, banc jetable à part).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); } };
const R = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/cloud-pool.js')).href);
const J = 86_400_000;
const now = Date.parse('2026-11-16T17:05:00Z');
const iso = (ms) => new Date(now + ms).toISOString();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const attribuees = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, etat: i % 2 ? 'attribuee_essai' : 'attribuee_client', user_id: U(i + 1), expire_le: iso(20 * J), attributions: 1, refus: {} }));
const pool = [
  ...attribuees,
  { id: 3, etat: 'disponible', user_id: null, reserve_pour: U(50), reserve_jusqu_au: iso(3 * 3_600_000), expire_le: iso(13 * J), attributions: 2, refus: { beebs: { cause: 'blocage_anti_robot' } }, sante: { verdict: 'saine', saine_le: iso(-3_600_000) } },
  { id: 39, etat: 'disponible', user_id: null, reserve_pour: NICO, reserve_jusqu_au: iso(17 * J), expire_le: iso(17 * J), attributions: 1, refus: { beebs: { cause: 'restreint' } } },
  { id: 40, etat: 'repos', user_id: null, dernier_user_id: U(60), repos_fin: iso(4 * J), expire_le: iso(18 * J), attributions: 2, refus: {} },
  { id: 76, etat: 'repos', user_id: null, dernier_user_id: U(61), repos_fin: iso(4 * J), expire_le: iso(26 * J), attributions: 1, refus: {} },
];

console.log('\nA. Le pool du 16/11 (aucune IP attribuable à un nouveau compte)');
for (const saines of [false, true]) {
  const plan = R.planDuJour({ ips: pool, lambda: 0.5, enAttente: 1, commandesEnCours: 0, marge: 2, comptesSansPlace: 0, sainesSeulement: saines, maintenant: now });
  ok(plan.aCommander === 3, `règle ${saines ? '« saines »' : 'd\'avant'} : le plan achète 3 (marge 2 + attente 1 ; la 3 et la 39 réservées, la 40 et la 76 au repos ne comptent pas)`, JSON.stringify({ a: plan.aCommander }));
  const g = R.gardePour(plan.garde, plan.aCommander);
  ok(g?.ok === true, `la garde du nombre laisse passer ce que le plan achète (avant : refusé « garde_nombre »)`, JSON.stringify(g));
}
console.log('\nB. Après l\'achat des 2 IP (une en route « achetee », une contrôlée « disponible »)');
{
  const apres = [...pool, { id: 80, etat: 'disponible', user_id: null, expire_le: iso(30 * J), attributions: 0, refus: {}, sante: { verdict: 'saine', le: iso(-3_600_000), saine_le: iso(-3_600_000) } }, { id: 81, etat: 'achetee', user_id: null, expire_le: iso(30 * J), attributions: 0, refus: {} }];
  const plan = R.planDuJour({ ips: apres, lambda: 0.5, enAttente: 1, commandesEnCours: 0, marge: 2, comptesSansPlace: 0, maintenant: now });
  ok(plan.aCommander === 1, 'il en manque une pour le stock visé (3) : le plan en achète 1', JSON.stringify({ a: plan.aCommander }));
  const g = R.gardeNombre({ ips: apres, comptesSansPlace: 0, enAttente: 1, enCommande: 0, quantite: 1, marge: 2, maintenant: now });
  ok(g?.vivantes === 11 && g.ok === true, 'garde : 9 attribuées + la 80 attribuable + la 81 en route = 11 vivantes ; 1 de plus passe', JSON.stringify(g));
  const reservee = apres.map((ip) => (ip.id === 80 ? { ...ip, reserve_pour: NICO, reserve_jusqu_au: iso(J) } : ip));
  const g2 = R.gardeNombre({ ips: reservee, comptesSansPlace: 0, enAttente: 1, quantite: 1, marge: 2, maintenant: now });
  ok(g2?.vivantes === 10, 'la même IP réservée à quelqu\'un d\'autre ne compte plus', JSON.stringify(g2));
}
console.log('\nC. La migration porte la même règle');
{
  const mig = fs.readFileSync(join(ROOT, 'supabase/migrations/20261116220000_cloud_ip_garde_attribuables.sql'), 'utf8').replace(/\r\n/g, '\n');
  ok(/i\.etat = 'disponible'\s*AND public\.cloud_ip_attribuable\(i, NULL::uuid, 'essai'\)/.test(mig) && /i\.etat = 'achetee'/.test(mig) && /f5b37e208dd87aa50de028a87789cdb1/.test(mig),
    'cloud_ip_garde_nombre : « disponible » seulement si attribuable à un nouveau compte ; « achetee » en route ; garde md5 de prod');
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
