// Génère la migration 20261022110000_leboncoin_achat_en_cours_vente depuis son gabarit : push_trg_job est repris
// de la définition LUE EN PROD (pg_get_functiondef, jamais le dépôt) avec UNE insertion ancrée ; l'inverse rejoue
// cette définition à l'identique et retire le reste.
//   node scripts/essais/20261022110000_generer.mjs <dossier des définitions lues en prod>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER = process.argv[2];
if (!DOSSIER) throw new Error('dossier des définitions de prod manquant');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const prod = readFileSync(path.join(DOSSIER, 'push_trg_job.sql.txt'), 'utf8').replace(/\r\n/g, '\n').split('\n-- ----')[0].trim();
if (!prod.startsWith('CREATE OR REPLACE FUNCTION public.push_trg_job()')) throw new Error('définition inattendue');
const ANCRE = `    if not v_declaree then
      v_dispa := least(`;
if (prod.split(ANCRE).length !== 2) throw new Error('ancre push_trg_job');
const apres = prod.split(ANCRE).join(`    if not v_declaree then
      -- (22/10, Leboncoin) Une transaction TERMINÉE (« Vendu ») lue par le relevé : la vente date d'avant la
      -- lecture, jamais une vente du moment — aucune note (ni mail ni notification). « Achat en cours » : inchangé.
      if new.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
         and new.platform_fields #>> '{sale_evidence,statut}' = 'sold' then
        return new;
      end if;
      v_dispa := least(`);
const md5 = (s) => createHash('md5').update(s).digest('hex');
const gabarit = lire('scripts/essais/20261022110000_migration.template.sql');
if (gabarit.split('-- @@PUSH_TRG_JOB@@').length !== 2) throw new Error('gabarit');
const mig = gabarit.split('-- @@PUSH_TRG_JOB@@').join(`-- push_trg_job : prod ${md5(prod)} → ${md5(apres)}\n${apres};`);
writeFileSync(path.join(RACINE, 'supabase/migrations/20261022110000_leboncoin_achat_en_cours_vente.sql'), mig, 'utf8');
const inverse = `-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261022110000_leboncoin_achat_en_cours_vente : push_trg_job tel que lu en prod le 22/10 ; déclencheur,
-- fonctions et interrupteur retirés. Les colonnes transaction_plateforme / transaction_lue_le RESTENT (l'extension
-- ≥ 0.6.129 les sonde avant de les écrire ; sans le déclencheur elles sont inertes).
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE L'INVERSE
BEGIN;

${prod};

DROP TRIGGER IF EXISTS annonces_plateforme_transaction_leboncoin ON public.annonces_plateforme;
DROP FUNCTION IF EXISTS public.annonces_plateforme_transaction_leboncoin();
DROP FUNCTION IF EXISTS public.leboncoin_transaction_noter(uuid, text, text);
DROP FUNCTION IF EXISTS public.vente_transaction_annulee_leboncoin(bigint, text);
DROP FUNCTION IF EXISTS public.leboncoin_transaction_lue(text, jsonb);
DELETE FROM public.coin_config WHERE key = 'ventes_leboncoin_transaction';

COMMIT;
-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════
`;
writeFileSync(path.join(RACINE, 'supabase/rollbacks/20261022110000_leboncoin_achat_en_cours_vente.sql'), inverse, 'utf8');
// L'essai : le corps exact de la migration (sans BEGIN / COMMIT).
const corps = mig.slice(mig.indexOf('-- ═══ CORPS DE LA MIGRATION\nBEGIN;\n') + '-- ═══ CORPS DE LA MIGRATION\nBEGIN;\n'.length, mig.indexOf('COMMIT;\n-- ═══ FIN DU CORPS DE LA MIGRATION'));
const essai = lire('scripts/essais/20261022110000_essai.template.sql');
if (essai.split('-- @@CORPS_MIGRATION@@').length !== 2) throw new Error('gabarit essai');
writeFileSync(path.join(RACINE, 'scripts/essais/20261022110000_essai.sql'), essai.split('-- @@CORPS_MIGRATION@@').join(corps), 'utf8');
console.log(`migration ${mig.length} car. ; inverse ${inverse.length} ; essai généré ; push_trg_job ${md5(prod)} → ${md5(apres)}`);
