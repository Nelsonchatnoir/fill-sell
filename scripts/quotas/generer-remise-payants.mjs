// GÉNÈRE la migration « la date de remise à zéro, aussi pour les payants » (demande de Nico du 04/11/2026 : les murs
// des payants disent « Attendre le JJ/MM » comme la maquette) et son inverse, À PARTIR des définitions de PROD lues le
// 04/11 (scripts/quotas/fixtures/prod-0411-remise-payants.sql — identiques à la migration 20261104000000).
//
//   node scripts/quotas/generer-remise-payants.mjs
//     → supabase/migrations/20261104140000_remise_le_payants.sql
//     → supabase/rollbacks/20261104140000_remise_le_payants_INVERSE.sql
//
// Derrière le même interrupteur (coin_config.grille_trois_jauges) : à 0, les deux fonctions rendent exactement ce
// qu'elles rendaient. La date est coin_wallets.next_grant_at, la seule que le serveur honore (src/reglages/quotas.js).
import { readFileSync, writeFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FIXTURE = lire('./fixtures/prod-0411-remise-payants.sql');

function definition(nom) {
  const debut = FIXTURE.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (debut < 0) throw new Error(`fixture : ${nom} absente`);
  const fin = FIXTURE.indexOf('\n$function$;', debut);
  if (fin < 0) throw new Error(`fixture : fin de ${nom} introuvable`);
  return FIXTURE.slice(debut, fin + '\n$function$;'.length);
}
function remplacer(texte, avant, apres, nom) {
  const n = texte.split(avant).length - 1;
  if (n !== 1) throw new Error(`${nom} : « ${avant.slice(0, 70).replace(/\n/g, '⏎')} » trouvé ${n} fois (1 attendu)`);
  return texte.replace(avant, () => apres);
}

const MOTIF = '(04/11/2026, demande de Nico : la remise à zéro, aussi pour les payants ; seulement avec la grille)';
const REMISE = '(SELECT w.next_grant_at FROM coin_wallets w WHERE w.user_id = v_user)';
const sorties = [];

{
  const n = 'quotas_etat';
  let d = definition(n);
  d = remplacer(d, `    'grille', 'trois_jauges',\n`,
    `    'grille', 'trois_jauges',\n    -- ${MOTIF}\n    'remise_le', ${REMISE},\n`, n);
  sorties.push([n, d]);
}
{
  const n = 'spend_coins_and_republish';
  let d = definition(n);
  d = remplacer(d, `        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',\n                                  'plafond', v_plafond, 'faites', v_faits);`,
    `        -- ${MOTIF}\n        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',\n                                  'plafond', v_plafond, 'faites', v_faits)\n          || CASE WHEN jauges_actives() THEN jsonb_build_object('remise_le', ${REMISE}) ELSE '{}'::jsonb END;`, n);
  sorties.push([n, d]);
}

const migration = `-- ═══════════════════════════════════════════════════════════════════════════
-- 20261104140000 — LA DATE DE REMISE À ZÉRO, AUSSI POUR LES PAYANTS (demande de Nico du 04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Généré par scripts/quotas/generer-remise-payants.mjs depuis les définitions de PROD du 04/11
-- (scripts/quotas/fixtures/prod-0411-remise-payants.sql). Preuve : PREUVE_PG=embarque node scripts/quotas/preuve-trois-jauges.mjs (partie D)
-- Inverse : supabase/rollbacks/20261104140000_remise_le_payants_INVERSE.sql
--
-- Avec la grille (coin_config.grille_trois_jauges = 1) : quotas_etat rend « remise_le » (coin_wallets.next_grant_at)
-- pour TOUS les paliers, et le refus plafond_republication_mensuel (Premium à 1 500) la porte aussi. Les murs disent
-- alors « Attendre le JJ/MM ». Interrupteur à 0 : rien ne change.

${sorties.map(([n, d]) => `-- ── ${n} (définition de prod du 04/11, retouchée) ──\n${d}\n`).join('\n')}`;

const inverse = `-- INVERSE de 20261104140000_remise_le_payants : les 2 fonctions reprennent leur définition de prod du 04/11.
-- Généré par scripts/quotas/generer-remise-payants.mjs.

${sorties.map(([n]) => definition(n)).join('\n\n')}
`;

writeFileSync(new URL('../../supabase/migrations/20261104140000_remise_le_payants.sql', import.meta.url), migration);
writeFileSync(new URL('../../supabase/rollbacks/20261104140000_remise_le_payants_INVERSE.sql', import.meta.url), inverse);
console.log(`migration : ${migration.length} caractères, ${sorties.length} fonctions retouchées ; inverse : ${inverse.length}`);
