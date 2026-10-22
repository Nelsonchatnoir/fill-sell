// Génère scripts/essais/20261022100000_essai.sql depuis son gabarit : le corps EXACT de la migration
// 20261022100000 (sans BEGIN / COMMIT), et les définitions d'AVANT (l'inverse = la prod du 22/10) sous le nom
// _avant_<fonction> pour le rejeu symétrique, plus leur texte d'origine dans _defs_avant (filet).
//   node scripts/essais/20261022100000_essai_generer.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261022100000_opla_plus_rien.sql');
const INV = lire('supabase/rollbacks/20261022100000_opla_plus_rien.sql');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b); if (i < 0 || j < 0 || j < i) throw new Error('marqueurs'); return t.slice(i + a.length, j); };
let corps = entre(MIG, '-- ═══ CORPS DE LA MIGRATION\nBEGIN;\n', 'COMMIT;\n-- ═══ FIN DU CORPS DE LA MIGRATION');
const blocs = {};
const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$function\$;/g;
let x; while ((x = re.exec(INV))) blocs[x[1]] = x[0];
const avant = ['armer_retrait_job_pour', 'rapprochement_v3_lire'].map((n) => {
  if (!blocs[n]) throw new Error('inverse sans ' + n);
  return blocs[n].replace(`CREATE OR REPLACE FUNCTION public.${n}(`, `CREATE OR REPLACE FUNCTION public._avant_${n}(`);
}).join('\n\n');
const dollar = (s) => { let tag = 'def'; while (s.includes('$' + tag + '$')) tag += 'x'; return `$${tag}$${s}$${tag}$`; };
const defs = `create temp table _defs_avant (nom text, definition text);\ninsert into _defs_avant values ('inventaire_arme_retraits_avant_suppression', ${dollar(blocs.inventaire_arme_retraits_avant_suppression)});`;
const gabarit = lire('scripts/essais/20261022100000_essai.template.sql');
for (const m of ['-- @@AVANT@@', '-- @@CORPS_MIGRATION@@']) if (gabarit.split(m).length !== 2) throw new Error('gabarit : ' + m);
const essai = gabarit.split('-- @@AVANT@@').join(avant + '\n\n' + defs).split('-- @@CORPS_MIGRATION@@').join(corps);
writeFileSync(path.join(RACINE, 'scripts/essais/20261022100000_essai.sql'), essai, 'utf8');
console.log(`essai généré : ${essai.length} caractères`);
