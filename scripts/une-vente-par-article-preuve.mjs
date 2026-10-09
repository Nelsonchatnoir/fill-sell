// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — « une vente, une fois » (migration 20261009180000)
// ════════════════════════════════════════════════════════════════════════════
// Une transaction qui finit TOUJOURS en erreur (le rapport est le message) : rien
// n'est validé, aucun pg_net ne part (aucun mail). Compte d'essai hoosslocal.
//   node scripts/une-vente-par-article-preuve.mjs --avec-migration   (avant application)
//   node scripts/une-vente-par-article-preuve.mjs                    (migration en prod)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = process.argv.includes('--avec-migration')
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261009180000_une_vente_par_article.sql'), 'utf8') : '';
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
set local lock_timeout = '3s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;
do $t$
declare
  u uuid := '${U}';
  r jsonb;
  f bigint := 990000000000000;   -- fiches d'essai : 990000000000001..
  n int; v_pf text; v_prix numeric; v_cmd text;
begin
  insert into inventaire (id, user_id, titre, statut, quantite, prix_achat) values
    (f+1, u, 'Essai A1', 'stock', 1, 1), (f+4, u, 'Essai D1', 'stock', 1, 1), (f+5, u, 'Essai D2', 'stock', 1, 1),
    (f+6, u, 'Essai D3', 'stock', 1, 1), (f+7, u, 'Essai B1', 'stock', 1, 1), (f+8, u, 'Essai B2', 'stock', 2, 1),
    (f+9, u, 'Essai B3', 'stock', 1, 1), (f+10, u, 'Essai B4', 'stock', 1, 1);
  insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, platform_listing_id, listing_url, published_at, platform_fields) values
    ('00000000-0000-4000-8000-00000000a101', u, f+1, 'leboncoin', 'publish', 'published', 'A1', 10, '990000401', 'https://www.leboncoin.fr/ad/x/990000401', now()-interval '3 days', '{}'),
    ('00000000-0000-4000-8000-00000000a100', u, null, 'leboncoin', 'publish', 'published', 'A0 vieux', 10, '990000401', 'https://www.leboncoin.fr/ad/x/990000401', now()-interval '30 days', jsonb_build_object('unavailable_since', now()-interval '1 hour')),
    ('00000000-0000-4000-8000-00000000a102', u, null, 'leboncoin', 'publish', 'published', 'A2', 10, '990000402', 'https://www.leboncoin.fr/ad/x/990000402', now()-interval '30 days', jsonb_build_object('unavailable_since', now()-interval '1 hour')),
    ('00000000-0000-4000-8000-00000000a103', u, null, 'leboncoin', 'publish', 'published', 'A3', 10, '990000403', 'https://www.leboncoin.fr/ad/x/990000403', now()-interval '30 days', jsonb_build_object('unavailable_since', now()-interval '1 hour', 'sale_signal', 'sold')),
    ('00000000-0000-4000-8000-00000000d104', u, f+4, 'ebay', 'publish', 'published', 'D1', 10, '990000404', 'https://www.ebay.fr/itm/990000404', now()-interval '3 days',
       jsonb_build_object('unavailable_since', now()-interval '1 hour', 'fin_ebay', jsonb_build_object('fin', now()-interval '2 hours', 'vendus', 0, 'format', 'AUCTION'))),
    ('00000000-0000-4000-8000-00000000d105', u, f+5, 'ebay', 'publish', 'published', 'D2', 10, '990000405', 'https://www.ebay.fr/itm/990000405', now()-interval '3 days',
       jsonb_build_object('unavailable_since', now()-interval '1 hour', 'sale_signal', 'sold', 'fin_ebay', jsonb_build_object('fin', now()-interval '2 hours', 'vendus', 0, 'format', 'AUCTION'))),
    ('00000000-0000-4000-8000-00000000d106', u, f+6, 'ebay', 'publish', 'published', 'D3', 10, '990000406', 'https://www.ebay.fr/itm/990000406', now()-interval '3 days',
       jsonb_build_object('unavailable_since', now()-interval '1 hour', 'fin_ebay', jsonb_build_object('fin', now()-interval '2 hours', 'vendus', 0, 'format', 'FIXED_PRICE'))),
    ('00000000-0000-4000-8000-00000000b107', u, f+7, 'ebay', 'publish', 'published', 'B1', 10, '990000407', 'https://www.ebay.fr/itm/990000407', now()-interval '3 days', '{}'),
    ('00000000-0000-4000-8000-00000000b108', u, f+8, 'ebay', 'publish', 'published', 'B2', 10, '990000408', 'https://www.ebay.fr/itm/990000408', now()-interval '3 days', '{}'),
    ('00000000-0000-4000-8000-00000000b109', u, f+9, 'ebay', 'publish', 'published', 'B3', 10, '990000409', 'https://www.ebay.fr/itm/990000409', now()-interval '3 days', '{}'),
    ('00000000-0000-4000-8000-00000000b110', u, f+10, 'ebay', 'publish', 'published', 'B4', 10, '990000410', 'https://www.ebay.fr/itm/990000410', now()-interval '3 days', '{}');

  -- 1. job sans fiche
  r := public.enregistrer_vente_declaree(u, '00000000-0000-4000-8000-00000000a100', 10);
  perform pg_temp.verif(r->>'code' = 'job_sans_fiche' and not (r->>'ok')::boolean, 'A1. vieux job sans fiche, numéro d''une fiche → refusé (job_sans_fiche)');
  r := public.enregistrer_vente_declaree(u, '00000000-0000-4000-8000-00000000a102', 10);
  perform pg_temp.verif(r->>'code' = 'job_sans_fiche' and not (r->>'ok')::boolean, 'A2. job sans fiche, sans preuve → refusé (job_sans_fiche)');
  r := public.enregistrer_vente_atomique(p_user := u, p_cle := null, p_job := '00000000-0000-4000-8000-00000000a103', p_prix := 10);
  perform pg_temp.verif((r->>'ok')::boolean, 'A3. job sans fiche AVEC preuve « sold » → vente écrite comme avant');
  -- 3. enchères
  r := public.enregistrer_vente_declaree(u, '00000000-0000-4000-8000-00000000d104', 10);
  perform pg_temp.verif(r->>'code' = 'enchere' and not (r->>'ok')::boolean, 'D1. enchère eBay sans preuve → refusée (enchere)');
  select count(*) into n from cross_post_jobs where user_id = u and inventaire_id = f+4 and action = 'delete';
  perform pg_temp.verif(n = 0, 'D1b. aucun retrait armé par l''enchère');
  r := public.enregistrer_vente_atomique(p_user := u, p_cle := null, p_job := '00000000-0000-4000-8000-00000000d105', p_prix := 10);
  perform pg_temp.verif((r->>'ok')::boolean, 'D2. enchère GAGNÉE (preuve « sold ») → vente écrite');
  r := public.enregistrer_vente_declaree(u, '00000000-0000-4000-8000-00000000d106', 10);
  perform pg_temp.verif((r->>'ok')::boolean, 'D3. prix fixe terminé sans preuve → la question reste possible (vente « Ailleurs » écrite, inchangé)');

  -- 2. même cession, autre plateforme
  update inventaire set statut = 'vendu', quantite = 0 where id in (f+7, f+9, f+10);
  insert into ventes (user_id, inventaire_id, titre, prix_vente, prix_achat, plateforme, plateforme_code, statut, quantite, date)
  values (u, f+7, 'B1 saisie', 15, 1, 'Ailleurs', 'ailleurs', 'vendu', 1, current_date),
         (u, f+8, 'B2 saisie', 15, 1, 'Ailleurs', 'ailleurs', 'vendu', 1, current_date),
         (u, f+9, 'B3 saisie a', 15, 1, 'Ailleurs', 'ailleurs', 'vendu', 1, current_date),
         (u, f+9, 'B3 saisie b', 15, 1, 'Ailleurs', 'ailleurs', 'vendu', 1, current_date),
         (u, f+10, 'B4 saisie', 15, 1, 'eBay', 'ebay', 'vendu', 1, current_date);
  update inventaire set quantite = 1 where id = f+8;
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
         jsonb_build_object('ref', 'ESSAI-B1', 'statut', 'PAID', 'listing_id', '990000407', 'prix', 20, 'vendu_le', now()-interval '2 days', 'titre', 'B1 commande'),
         jsonb_build_object('ref', 'ESSAI-B2', 'statut', 'PAID', 'listing_id', '990000408', 'prix', 20, 'vendu_le', now()-interval '2 days', 'titre', 'B2 commande'),
         jsonb_build_object('ref', 'ESSAI-B3', 'statut', 'PAID', 'listing_id', '990000409', 'prix', 20, 'vendu_le', now()-interval '2 days', 'titre', 'B3 commande'),
         jsonb_build_object('ref', 'ESSAI-B4', 'statut', 'PAID', 'listing_id', '990000410', 'prix', 20, 'vendu_le', now()-interval '2 days', 'titre', 'B4 commande')), u);
  select count(*), max(v.plateforme_code), max(v.prix_vente), max(v.commande_ref) into n, v_pf, v_prix, v_cmd from ventes v where v.user_id = u and v.inventaire_id = f+7;
  perform pg_temp.verif(n = 1 and v_pf = 'ebay' and v_prix = 15 and v_cmd = 'ESSAI-B1',
    'B1. fiche épuisée, une vente saisie « Ailleurs » + commande eBay de son annonce → UNE vente, plateforme eBay, prix saisi gardé');
  select count(*) into n from ventes v where v.user_id = u and v.inventaire_id = f+8;
  perform pg_temp.verif(n = 2, 'B2. fiche à plusieurs exemplaires (reste 1) → la commande est une AUTRE vente');
  select count(*) into n from ventes v where v.user_id = u and v.inventaire_id = f+9;
  perform pg_temp.verif(n = 3, 'B3. fiche avec deux ventes → jamais de fusion (la commande s''ajoute)');
  select count(*), max(v.commande_ref) into n, v_cmd from ventes v where v.user_id = u and v.inventaire_id = f+10;
  perform pg_temp.verif(n = 1 and v_cmd = 'ESSAI-B4', 'B4. vente saisie eBay + commande eBay → fusion comme avant (inchangé)');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_UNE_VENTE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIG}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-une-vente-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_UNE_VENTE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « une vente, une fois »${MIG ? ' (migration 20261009180000 rejouée dans la transaction, puis annulée)' : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
