// selftest:lbc-rattrapage-lecture-fraiche — (24/10, décision 7 de Nico) Leboncoin : la lecture fraîche d'une vente non
// enregistrée joue la règle « Achat en cours / Vendu », et aucun mail pour une vente de plus de 24 h.
//   1. le déclencheur : même état relu → la règle, seulement lecture fraîche + annonce en ligne + job exact publié,
//      fiche au stock, sans preuve (jamais une trace inutile) ;
//   2. la règle : le rattrapage (même état avant et maintenant) porte sa première lecture ; gardes inchangées ;
//   3. la note de vente : aucune pour un rattrapage de plus de 24 h ou d'âge inconnu ; « Vendu » : toujours aucune ;
//   4. l'inverse rend les trois corps ; l'essai est une transaction annulée.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const M = lire('supabase/migrations/20261024150000_leboncoin_rattrapage_lecture_fraiche.sql');
const I = lire('supabase/rollbacks/20261024150000_leboncoin_rattrapage_lecture_fraiche_INVERSE.sql');
const E = lire('scripts/essais/20261024150000_essai.sql');
const corps = (sql, nom) => { const d = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return d < 0 ? '' : sql.slice(d, sql.indexOf('$function$;', d)); };

console.log('1. Le déclencheur');
const trg = corps(M, 'annonces_plateforme_transaction_leboncoin');
const meme = trg.slice(trg.indexOf('IF v_new IS NOT DISTINCT FROM v_old THEN'), trg.indexOf('RETURN NULL;\n      END IF;'));
ok(/IF v_new IN \('pending', 'sold'\) THEN/.test(meme), 'même état : « Achat en cours » ou « Vendu » seulement');
ok(meme.includes("v_lue_new > now() - interval '1 hour'") && meme.includes("v_lue_new > coalesce(v_lue_old, '-infinity'::timestamptz)"),
  'une lecture de moins d\'une heure, plus récente que la précédente');
ok(meme.includes("NEW.statut_plateforme = 'en_ligne'") && meme.includes('NEW.disparu_le IS NULL') && meme.includes("NEW.vu_le > now() - interval '24 hours'"),
  'l\'annonce vue en ligne dans les 24 h');
ok(meme.includes("btrim(coalesce(c.platform_listing_id, '')) = btrim(NEW.listing_id)") && meme.includes("c.status = 'published'")
  && meme.includes("i.statut = 'stock'") && meme.includes("<> 'sold'"), 'le job exact publié, la fiche au stock, sans preuve de vente');
ok(meme.includes('PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);'), 'la règle elle-même, avec le même état avant et maintenant');
ok(trg.includes('EXCEPTION WHEN OTHERS THEN') && trg.includes('RAISE WARNING'), 'jamais un relevé perdu (la panne est dite)');

console.log('2. La règle');
const noter = corps(M, 'leboncoin_transaction_noter');
ok(noter.includes('IF p_tx_avant IS NOT DISTINCT FROM p_tx THEN'), 'le rattrapage : même état avant et maintenant');
ok(noter.includes("'premiere_lecture', (SELECT min(u.created_at) FROM usage_logs u") && noter.includes("u.metadata ->> 'annonce' = a.id::text")
  && noter.includes("u.metadata ->> 'transaction' = p_tx"), 'sa première lecture : la plus ancienne trace de cette annonce et de cet état');
ok(noter.includes("CASE WHEN v_rattrapage IS NOT NULL THEN jsonb_build_object('rattrapage', v_rattrapage)"), 'porté dans la preuve de vente');
for (const garde of ["'doute_deux_jobs'", "'sans_fiche'", "'fiche_deja_vendue'", "'plusieurs_exemplaires'", "'deja_prouvee'", "c.key = 'ventes_leboncoin_transaction'"]) {
  ok(noter.includes(garde), `garde inchangée : ${garde}`);
}

console.log('3. La note de vente');
const push = corps(M, 'push_trg_job');
const iVendu = push.indexOf("#>> '{sale_evidence,statut}' = 'sold' then");
const iRatt = push.indexOf("#> '{sale_evidence,rattrapage}' is not null");
ok(iVendu > 0 && iRatt > iVendu, '« Vendu » : toujours aucune note ; puis le rattrapage');
ok(push.includes("coalesce(public._ts_ou_null(new.platform_fields #>> '{sale_evidence,rattrapage,premiere_lecture}'), '-infinity'::timestamptz)")
  && push.includes("< now() - interval '24 hours' then\n        return new;"), 'aucune note pour plus de 24 h, ou un âge inconnu');

console.log('4. L\'inverse et l\'essai');
ok((I.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 3 && !I.includes('lecture_fraiche_2410') && !I.includes('v_lue_new'), 'l\'inverse rend les trois corps d\'avant');
ok(E.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E), 'l\'essai est une transaction annulée');
ok((M.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 3 && M.trim().endsWith('COMMIT;'), 'la migration : trois corps, une transaction');

console.log(`\n✓ lbc-rattrapage-lecture-fraiche : ${n} contrôles verts`);
