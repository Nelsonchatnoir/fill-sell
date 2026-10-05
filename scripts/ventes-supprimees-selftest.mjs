// Autotest — une vente supprimée par la personne ne revient pas au relevé (04/10/2026).
//
//     node scripts/ventes-supprimees-selftest.mjs
//
// Ce qu'il verrouille (la preuve en base a été faite en réel le 04/10 :
// suppression depuis l'app → trace ; relevé rejoué → « supprimees_par_la_personne: 1 ») :
//   1. la trace est posée par un DÉCLENCHEUR sur DELETE, gardé par
//      current_user = 'authenticated' (la personne, web ou mobile) — jamais
//      par une fonction interne (fusion du relevé) ;
//   2. la SEULE porte des relevés de ventes saute une vente supprimée, par
//      commande, ou par annonce quand la vente supprimée n'avait pas de commande ;
//   3. les suppressions de l'app passent par un DELETE direct (rôle de la
//      personne) — donc par le déclencheur ;
//   4. aucune autre porte de relevé de ventes n'existe côté code.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

const mig = lire('supabase/migrations/20261004220000_ventes_supprimees_ne_reviennent_pas.sql');
ok(/CREATE TRIGGER ventes_suppression_trace AFTER DELETE ON public\.ventes\s+FOR EACH ROW WHEN \(current_user = 'authenticated'\)/.test(mig),
  'trace posée par un déclencheur AFTER DELETE, seulement pour la personne (current_user = authenticated)');
ok(/IF coalesce\(OLD\.commande_ref, OLD\.annonce_id\) IS NOT NULL THEN/.test(mig), 'une vente sans commande ni annonce ne laisse pas de trace inutile');
ok(/s\.commande_ref = v_ref\s+OR \(s\.commande_ref IS NULL AND v_listing IS NOT NULL AND s\.annonce_id = v_listing\)/.test(mig),
  'le relevé saute par commande, ou par annonce pour une vente supprimée sans commande');
ok(/c_supprimees := c_supprimees \+ 1;\s+CONTINUE;/.test(mig) && /'supprimees_par_la_personne', c_supprimees/.test(mig), 'compté et rendu dans le bilan du relevé');
ok(!/DELETE FROM ventes_supprimees/i.test(mig) && !/UPDATE ventes SET/i.test(mig.split('CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees')[0]),
  'aucune vente existante supprimée ni restaurée par la migration');

const app = lire('src/App.jsx');
ok((app.match(/supabase\.from\('ventes'\)\.delete\(\)/g) ?? []).length >= 2, "l'app supprime par DELETE direct (rôle de la personne) : le déclencheur s'applique");

const portes = [];
for (const dir of ['supabase/functions', 'chrome-extension', 'src']) {
  const marcher = (d) => {
    for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules/.test(p)) marcher(p); continue; }
      if (!/\.(ts|js|jsx|mjs)$/.test(e.name)) continue;
      const t = fs.readFileSync(join(ROOT, p), 'utf8');
      if (/source:\s*['"]releve['"]/.test(t) && /from\(['"]ventes['"]\)\.(insert|upsert)/.test(t)) portes.push(p);
    }
  };
  marcher(dir);
}
ok(portes.length === 0, `aucune autre porte de relevé de ventes dans le code (${portes.join(', ') || 'aucune'})`);

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
