// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — une commande eBay remboursée ou annulée ne
// compte jamais comme vente (migration 20261009210000, règle de Nico du 09/10 soir)
// ════════════════════════════════════════════════════════════════════════════
// Transaction qui finit toujours en erreur (rapport = message) : rien n'est validé,
// aucun pg_net ne part. Compte d'essai hoosslocal.
//   node scripts/commande-ebay-annulee-preuve.mjs [--avec-migration]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = process.argv.includes('--avec-migration')
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261009210000_commande_ebay_annulee.sql'), 'utf8') : '';
const U = '5322fa18-c194-458b-a222-7ee4093c4968';

const test = String.raw`
set local lock_timeout = '3s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;
create function pg_temp.job(p_id uuid, p_inv bigint, p_pf text, p_lid text, p_pfields jsonb) returns void language sql as $f$
  insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, platform_listing_id, listing_url, published_at, platform_fields)
  values (p_id, '${U}', p_inv, p_pf, 'publish', 'published', 'essai', 10, p_lid,
          case p_pf when 'ebay' then 'https://www.ebay.fr/itm/' || p_lid else 'https://www.leboncoin.fr/ad/x/' || p_lid end,
          now() - interval '20 days', p_pfields) $f$;
do $t$
declare
  u uuid := '${U}';
  f bigint := 990000000000300;
  r jsonb; n int; s text; q int; vid bigint; v_cmd_le timestamptz := now() - interval '3 days';
begin
  insert into inventaire (id, user_id, titre, statut, quantite, prix_achat) values
    (f+1, u, 'Remboursée d''emblée', 'stock', 1, 1), (f+2, u, 'Remboursée après coup', 'stock', 1, 1),
    (f+3, u, 'Vente saisie', 'vendu', 0, 1), (f+4, u, 'Annulation demandée', 'stock', 1, 1),
    (f+5, u, 'En stock, remboursée après coup', 'stock', 1, 1);
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0101', f+1, 'ebay', '990000701', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0201', f+2, 'ebay', '990000702',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 1, 'disponible', 0, 'vu_le', now() - interval '1 hour')));
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0202', f+2, 'leboncoin', '990000802', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0301', f+3, 'ebay', '990000703', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0401', f+4, 'ebay', '990000704', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000c0501', f+5, 'ebay', '990000705',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 1, 'disponible', 2, 'vu_le', now() - interval '1 hour')));
  -- la vente SAISIE par la personne (eBay, sans commande), sur une fiche vendue
  insert into ventes (user_id, inventaire_id, titre, prix_vente, prix_achat, plateforme, plateforme_code, statut, quantite, date)
  values (u, f+3, 'saisie', 30, 1, 'eBay', 'ebay', 'vendu', 1, current_date);

  -- 1. commande déjà remboursée à l'enregistrement → rien
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-C1', 'statut', 'FULLY_REFUNDED', 'listing_id', '990000701', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c1'),
    jsonb_build_object('ref', 'ESSAI-C4', 'statut', 'annulation_en_cours', 'listing_id', '990000704', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c4')), u);
  select count(*) into n from ventes where user_id = u and commande_ref in ('ESSAI-C1', 'ESSAI-C4');
  select statut into s from inventaire where id = f+1;
  perform pg_temp.verif(n = 0 and s = 'stock', 'C1. commande déjà REMBOURSÉE → rien écrit, fiche en stock');
  perform pg_temp.verif((r ->> 'en_cours')::int = 1, 'C1b. annulation seulement DEMANDÉE → ni vente, ni annulation (en cours)');

  -- 2. payée puis remboursée après coup (le dernier exemplaire : la commande avait vendu la fiche)
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-C2', 'statut', 'PAID', 'listing_id', '990000702', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c2'),
    jsonb_build_object('ref', 'ESSAI-C3', 'statut', 'PAID', 'listing_id', '990000703', 'prix', 30, 'vendu_le', v_cmd_le, 'titre', 'c3'),
    jsonb_build_object('ref', 'ESSAI-C5', 'statut', 'PAID', 'listing_id', '990000705', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c5')), u);
  select statut into s from inventaire where id = f+2;
  perform pg_temp.verif(s = 'vendu', 'C2a. (avant) la commande payée a vendu le dernier exemplaire');
  select count(*) into n from ventes where user_id = u and inventaire_id = f+3;
  perform pg_temp.verif(n = 1, 'C3a. (avant) la commande s''est fondue dans la vente saisie (une seule vente)');
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-C2', 'statut', 'FULLY_REFUNDED', 'listing_id', '990000702', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c2'),
    jsonb_build_object('ref', 'ESSAI-C3', 'statut', 'cancelled', 'listing_id', '990000703', 'prix', 30, 'vendu_le', v_cmd_le, 'titre', 'c3'),
    jsonb_build_object('ref', 'ESSAI-C5', 'statut', 'FULLY_REFUNDED', 'listing_id', '990000705', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c5')), u);
  select count(*) into n from ventes where user_id = u and commande_ref = 'ESSAI-C2';
  select statut, quantite into s, q from inventaire where id = f+2;
  perform pg_temp.verif(n = 0 and s = 'stock' and q = 1, 'C2. remboursée APRÈS COUP → vente retirée, fiche de retour EN STOCK (1)');
  select count(*) into n from cross_post_jobs where inventaire_id = f+2 and action = 'delete' and status in ('pending', 'needs_user');
  perform pg_temp.verif(n = 0, 'C2b. le retrait de la copie, encore en attente, est annulé');
  select count(*) into n from cross_post_jobs where inventaire_id = f+2 and action in ('publish', 'republish') and status in ('pending', 'processing');
  select count(*) + n into n from remises_en_vente where inventaire_id = f+2 and statut = 'a_faire';
  perform pg_temp.verif(n = 0, 'C2c. RIEN remis en ligne (aucune publication, aucune remise en vente en attente)');
  select status into s from cross_post_jobs where id = '00000000-0000-4000-8000-0000000c0201';
  perform pg_temp.verif(s = 'cancelled', 'C2d. le job eBay n''est plus « vendu »');
  select count(*) into n from ventes_supprimees where user_id = u and commande_ref = 'ESSAI-C2' and source = 'releve_ebay' and motif = 'commande_fully_refunded';
  perform pg_temp.verif(n = 1, 'C2e. retrait tracé (source releve_ebay, motif commande_fully_refunded)');
  select count(*) into n from inventaire_journal where inventaire_id = f+2 and source = 'releve_ebay' and motif = 'commande_annulee';
  perform pg_temp.verif(n = 2, 'C2f. retour en stock journalisé (statut, quantité)');
  select count(*) into n from ventes where user_id = u and inventaire_id = f+3;
  select count(*) + n into n from usage_logs where user_id = u and feature = 'vente_saisie_commande_annulee';
  perform pg_temp.verif(n = 2, 'C3. vente SAISIE par la personne, commande annulée → JAMAIS retirée, signalée une fois');
  select count(*) into n from ventes where user_id = u and commande_ref = 'ESSAI-C5';
  select statut, quantite into s, q from inventaire where id = f+5;
  perform pg_temp.verif(n = 0 and s = 'stock' and q = 2, 'C5. fiche restée en stock (eBay 2 dispo) : vente retirée, fiche intacte');
  -- rejeu : rien ne revient, rien n'est reposé
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-C2', 'statut', 'FULLY_REFUNDED', 'listing_id', '990000702', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'c2'),
    jsonb_build_object('ref', 'ESSAI-C3', 'statut', 'cancelled', 'listing_id', '990000703', 'prix', 30, 'vendu_le', v_cmd_le, 'titre', 'c3')), u);
  select count(*) into n from usage_logs where user_id = u and feature in ('vente_saisie_commande_annulee', 'vente_retiree');
  perform pg_temp.verif(n = 3, 'C6. relevé suivant : rien de plus (1 signalement, 2 retraits de vente)');
  select count(*) into n from push_ventes where user_id = u and statut = 'a_envoyer';
  perform pg_temp.verif(n = 0, 'C7. aucune note de vente à envoyer (0 mail, 0 notification)');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_ANNULEE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIG}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-annulee-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_ANNULEE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « commande eBay remboursée ou annulée »${MIG ? ' (migration 20261009210000 rejouée dans la transaction, puis annulée)' : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
