// selftest:rattachement-jamais-de-retrait — (03/11 soir, Nico) la migration 20261103230000 : un rattachement ne
// déclenche jamais de retrait ; seule une vente prouvée APRÈS la mise en ligne d'une annonce importée la retire ; « oui »
// sur une fiche vendue = un article à part ; « Vendu » Leboncoin dès la première lecture = jamais une vente du jour.
//   1. la migration est à jour de son générateur et des corps de prod (fixtures) ;
//   2. ses cinq gestes, chacun à sa place ;
//   3. l'inverse rend les corps de prod et les déclencheurs de 13:52 ;
//   4. le banc sur base jetable existe et ne vise jamais la prod.
// Le banc lui-même : PREUVE_PG=embarque node scripts/essais/20261103230000_banc.mjs (28/28 le 03/11 soir).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const MP = 'supabase/migrations/20261103230000_rattachement_jamais_de_retrait.sql';
const IP = 'supabase/rollbacks/20261103230000_rattachement_jamais_de_retrait_INVERSE.sql';
const M0 = lire(MP), I0 = lire(IP);
const FIX = (n2) => lire(`scripts/essais/fixtures/prod-0311-retrait-rattachement/${n2}.sql`).trimEnd();

console.log('1. À jour du générateur');
execFileSync(process.execPath, [join(ROOT, 'scripts/essais/20261103230000_generer.mjs')], { stdio: 'pipe' });
ok(lire(MP) === M0 && lire(IP) === I0, 'régénérée à l\'identique depuis les corps de prod');
ok((M0.match(/^BEGIN;$/gm) ?? []).length === 1 && (M0.match(/^COMMIT;$/gm) ?? []).length === 1 && M0.trim().endsWith('COMMIT;'), 'une seule transaction');

console.log('2. Les cinq gestes');
ok(M0.includes('DROP TRIGGER IF EXISTS cross_post_jobs_inseree_sur_article_vendu ON public.cross_post_jobs;')
  && M0.includes('DROP TRIGGER IF EXISTS cross_post_jobs_repointee_sur_article_vendu ON public.cross_post_jobs;')
  && !/CREATE TRIGGER cross_post_jobs_(inseree|repointee)_sur_article_vendu/.test(M0), '1. les déclencheurs de 13:52 partent, rien ne les recrée');
const corps = (sql, nom) => { const d = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return d < 0 ? '' : sql.slice(d, sql.indexOf('$function$;', d)); };
const publie = corps(M0, 'cross_post_jobs_publie_sur_article_vendu');
ok(publie.indexOf('if public.annonce_importee(new.id) then\n    return new;') > 0
  && publie.indexOf('if public.annonce_importee(new.id) then') < publie.indexOf('public.armer_retrait_job(new.id'), '2. « publiée après la vente » : une annonce importée n\'arme rien, avant tout');
const armer = corps(M0, 'armer_retrait_job_pour');
const iProuve = armer.indexOf('if not public.retrait_job_prouve(j.id) then');
const iDate = armer.indexOf('if public.annonce_importee(j.id) and not public.vente_apres_mise_en_ligne(j.id) then');
const iInsert = armer.indexOf('insert into public.cross_post_jobs');
ok(iProuve > 0 && iDate > iProuve && iInsert > iDate && armer.includes("'retrait_refuse_vente_avant_mise_en_ligne'"),
  '3. armer_retrait_job_pour : la vente après la mise en ligne, avant toute écriture, refus tracé');
const ml = corps(M0, 'annonce_mise_en_ligne');
ok(ml.includes('min(LEAST(a.publiee_le, a.created_at))') && ml.includes('vinted_listing_snapshots') && ml.includes('j.published_at, j.created_at), j.created_at)'),
  'la mise en ligne : la plus ancienne trace (plateforme, relevé, dressing, dépôt)');
ok(corps(M0, 'vente_instant').includes("COALESCE(p_vendu_le, (((p_date + 1)::timestamp) AT TIME ZONE 'Europe/Paris') - interval '1 second', p_cree)"),
  'la vente : vendu_le, sinon la fin de son jour à Paris');
const decider = corps(M0, 'inventaire_doublon_decider');
const iPart = decider.indexOf("'issue', 'article_a_part_annonce_en_ligne'");
const iFusionVendue = decider.indexOf("r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');");
ok(iPart > 0 && iFusionVendue > iPart && decider.includes("'article_a_part', true") && decider.includes('ap.disparu_le IS NULL AND ap.retiree_le IS NULL'),
  '4. « oui » sur une fiche vendue dont l\'autre a une annonce en ligne : un article à part, avant toute fusion');
ok(decider.indexOf("IF d.motif = 'copie_non_prouvee' THEN") < iPart, 'la copie interrogée à la vente du jour garde son chemin (avant)');
const noter = corps(M0, 'leboncoin_transaction_noter');
ok(noter.includes("ELSIF p_tx = 'sold' AND public.annonce_importee(j.id)") && noter.includes("v_issue := 'vendu_avant_suivi';")
  && noter.indexOf("v_issue := 'vendu_avant_suivi';") < noter.indexOf("v_issue := CASE WHEN v_ecrit THEN 'prouvee'"), '5. la règle Leboncoin : « Vendu » dès la première lecture d\'une importée, jamais prouvée');
ok(M0.includes("WHEN (new.platform = 'leboncoin' AND (new.platform_fields ->> 'sale_signal') = 'sold')")
  && M0.includes('BEFORE INSERT OR UPDATE OF platform_fields ON public.cross_post_jobs'), 'le drapeau de la veille écarté AVANT d\'être écrit (aucune ligne de plus)');
for (const f of ['annonce_importee(uuid)', 'annonce_mise_en_ligne(uuid)', 'vente_apres_mise_en_ligne(uuid)', 'leboncoin_vendu_avant_suivi(uuid, text)']) {
  ok(M0.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `jamais appelable de l'app : ${f}`);
}

console.log('3. L\'inverse');
for (const f of ['armer_retrait_job_pour', 'cross_post_jobs_publie_sur_article_vendu', 'inventaire_doublon_decider', 'leboncoin_transaction_noter']) {
  ok(I0.includes(FIX(f)), `le corps de prod de ${f}, à l'identique`);
}
ok(/CREATE TRIGGER cross_post_jobs_inseree_sur_article_vendu/.test(I0) && /CREATE TRIGGER cross_post_jobs_repointee_sur_article_vendu/.test(I0)
  && I0.includes('DROP TRIGGER IF EXISTS cross_post_jobs_lbc_vendu_avant_suivi'), 'les déclencheurs de 13:52 revenus, le nouveau parti');

console.log('4. Le banc');
const B = lire('scripts/essais/20261103230000_banc.mjs');
ok(B.includes("/supabase\\.co/.test(PG_URL)") && B.includes("PG_URL === 'embarque'"), 'base jetable seulement, jamais la prod');
ok(B.includes("0. AVANT la migration (corps de prod) : l\\'incident se rejoue") && B.includes('9. L\\\'inverse rend les corps d\\\'avant'), 'il rejoue l\'incident avant, et l\'inverse après');

console.log(`\n✓ rattachement-jamais-de-retrait : ${n} contrôles verts`);
