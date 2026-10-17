// Génère scripts/essais/20261018000000_essai.sql depuis son gabarit : la partie B
// est le corps EXACT de la migration 20261018000000 (entre « CORPS DE LA MIGRATION »
// et « FIN DU CORPS DE LA MIGRATION »), la partie C6 le corps EXACT de l'inverse.
//   node scripts/essais/20261018000000_generer.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const corps = (txt, debut, fin) => {
  const d = txt.indexOf(debut), f = txt.indexOf(fin);
  if (d < 0 || f < 0 || f < d) throw new Error(`marqueurs introuvables : ${debut} / ${fin}`);
  return txt.slice(d, f + fin.length);
};
const MIG = lire('supabase/migrations/20261018000000_commande_annulee_jamais_une_vente.sql');
const INV = lire('supabase/rollbacks/20261018000000_commande_annulee_jamais_une_vente.sql');
const B = corps(MIG, '-- ═══ CORPS DE LA MIGRATION', '-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════');
const C6 = corps(INV, "-- ═══ CORPS DE L'INVERSE", "-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════");
const gabarit = lire('scripts/essais/20261018000000_essai.template.sql');
if (!gabarit.includes('-- @@CORPS_MIGRATION@@') || !gabarit.includes('-- @@CORPS_INVERSE@@')) throw new Error('gabarit sans ses deux marqueurs');
const essai = gabarit.replace('-- @@CORPS_MIGRATION@@', B).replace('-- @@CORPS_INVERSE@@', C6);
writeFileSync(path.join(RACINE, 'scripts/essais/20261018000000_essai.sql'), essai, 'utf8');
console.log(`essai généré : ${essai.length} caractères (migration ${B.length}, inverse ${C6.length})`);
