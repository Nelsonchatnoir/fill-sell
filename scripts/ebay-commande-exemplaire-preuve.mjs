// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — une commande eBay = la vente d'un exemplaire
// (migration 20261009190000, règle de Nico du 09/10 soir)
// ════════════════════════════════════════════════════════════════════════════
// Une transaction qui finit TOUJOURS en erreur (le rapport est le message) : rien
// n'est validé, aucun pg_net ne part. Compte d'essai hoosslocal.
//   node scripts/ebay-commande-exemplaire-preuve.mjs --avec-migration   (avant application)
//   node scripts/ebay-commande-exemplaire-preuve.mjs                    (migration en prod)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = process.argv.includes('--avec-migration')
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261009190000_ebay_commande_un_exemplaire.sql'), 'utf8') : '';
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
  f bigint := 990000000000100;
  r jsonb; n int; s text; q int; d text;
  v_cmd_le timestamptz := now() - interval '3 days';
begin
  insert into inventaire (id, user_id, titre, statut, quantite, prix_achat) values
    (f+1, u, 'Maillot 3 exemplaires', 'stock', 1, 1), (f+2, u, 'Dernier exemplaire', 'stock', 1, 1),
    (f+3, u, 'Lecture avant la commande', 'stock', 1, 1), (f+4, u, 'Rien de lisible', 'stock', 1, 1),
    (f+5, u, 'Annonce introuvable', 'stock', 1, 1), (f+6, u, 'Remise en vente eBay', 'stock', 1, 1),
    (f+7, u, 'Relevé quantité', 'stock', 1, 1), (f+8, u, 'Déjà vendue', 'vendu', 0, 1);
  -- E1 : 3 exemplaires, 1 vendu, 2 disponibles (lu après la commande) + copie Leboncoin
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0101', f+1, 'ebay', '990000501',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 1, 'disponible', 2, 'vu_le', now() - interval '1 hour')));
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0102', f+1, 'leboncoin', '990000601', '{}');
  -- E2 : dernier exemplaire (0 disponible, lu après la commande) + copie Leboncoin
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0201', f+2, 'ebay', '990000502',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 1, 'disponible', 0, 'vu_le', now() - interval '1 hour')));
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0202', f+2, 'leboncoin', '990000602', '{}');
  -- E3 : la seule lecture est ANTÉRIEURE à la commande (cas de la dentelle)
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0301', f+3, 'ebay', '990000503',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 0, 'disponible', 1, 'vu_le', now() - interval '4 days')));
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0302', f+3, 'leboncoin', '990000603', '{}');
  -- E4 : rien de lisible
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0401', f+4, 'ebay', '990000504', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0402', f+4, 'leboncoin', '990000604', '{}');
  -- E5 : annonce introuvable chez eBay (404 lu après la commande)
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0501', f+5, 'ebay', '990000505', '{}');
  -- E6 : annonce terminée mais la fiche a une AUTRE annonce eBay vivante
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0601', f+6, 'ebay', '990000506', '{}');
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0602', f+6, 'ebay', '990000516', '{}');
  -- E8 : fiche déjà vendue
  perform pg_temp.job('00000000-0000-4000-8000-0000000e0801', f+8, 'ebay', '990000508',
    jsonb_build_object('quantite_ebay', jsonb_build_object('exacte', true, 'vendus', 1, 'disponible', 0, 'vu_le', now() - interval '1 hour')));

  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-E1', 'statut', 'PAID', 'listing_id', '990000501', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e1'),
    jsonb_build_object('ref', 'ESSAI-E2', 'statut', 'PAID', 'listing_id', '990000502', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e2'),
    jsonb_build_object('ref', 'ESSAI-E3', 'statut', 'PAID', 'listing_id', '990000503', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e3'),
    jsonb_build_object('ref', 'ESSAI-E4', 'statut', 'PAID', 'listing_id', '990000504', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e4'),
    jsonb_build_object('ref', 'ESSAI-E5', 'statut', 'PAID', 'listing_id', '990000505', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e5'),
    jsonb_build_object('ref', 'ESSAI-E6', 'statut', 'PAID', 'listing_id', '990000506', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e6'),
    jsonb_build_object('ref', 'ESSAI-E8', 'statut', 'PAID', 'listing_id', '990000508', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e8')), u);
  perform pg_temp.verif((r ->> 'creees')::int = 7, 'R. les 7 commandes sont écrites en ventes (' || coalesce(r ->> 'creees', '?') || ')');

  -- E1 multi-quantité
  select statut, quantite into s, q from inventaire where id = f+1;
  select count(*) into n from cross_post_jobs where inventaire_id = f+1 and action = 'delete';
  perform pg_temp.verif(s = 'stock' and q = 2 and n = 0, 'E1. 3 exemplaires, 1 vendu → fiche EN STOCK, quantité 2 (eBay), RIEN retiré');
  select count(*) into n from inventaire_journal where inventaire_id = f+1 and champ = 'quantite' and avant = '1' and apres = '2' and source = 'commande_ebay';
  perform pg_temp.verif(n = 1, 'E1b. quantité 1 → 2 journalisée (commande_ebay)');
  select status into s from cross_post_jobs where id = '00000000-0000-4000-8000-0000000e0102';
  perform pg_temp.verif(s = 'published', 'E1c. la copie Leboncoin reste en ligne');
  -- E2 dernier exemplaire
  select statut, quantite into s, q from inventaire where id = f+2;
  perform pg_temp.verif(s = 'vendu' and q = 0, 'E2. dernier exemplaire → fiche VENDUE (quantité 0)');
  select status into s from cross_post_jobs where id = '00000000-0000-4000-8000-0000000e0201';
  perform pg_temp.verif(s = 'sold', 'E2b. le job eBay passe « vendu »');
  select count(*) into n from cross_post_jobs where inventaire_id = f+2 and action = 'delete' and platform = 'leboncoin' and status = 'pending';
  perform pg_temp.verif(n = 1, 'E2c. retrait de la copie Leboncoin PROUVÉE armé');
  select count(*) into n from push_ventes where job_id = '00000000-0000-4000-8000-0000000e0201' and statut = 'a_envoyer';
  perform pg_temp.verif(n = 0, 'E2d. vente ancienne : aucune note de vente à envoyer');
  select count(*) into n from inventaire_journal where inventaire_id = f+2 and champ = 'statut' and apres = 'vendu' and source = 'commande_ebay';
  perform pg_temp.verif(n = 1, 'E2e. passage en vendu journalisé');
  -- E3 lecture antérieure → à relire, puis lecture fraîche
  select decision into d from ventes_ebay_exemplaires e join ventes v on v.id = e.vente_id where v.commande_ref = 'ESSAI-E3';
  select statut, quantite into s, q from inventaire where id = f+3;
  perform pg_temp.verif(d = 'a_relire' and s = 'stock' and q = 1, 'E3. lecture ANTÉRIEURE à la commande → « à relire », rien touché');
  perform public.ebay_quantite_lue(u, '990000503', jsonb_build_object('http', 200, 'exacte', true, 'disponible', 0, 'vendus', 1, 'epuisee', true, 'lu_le', now()));
  select statut into s from inventaire where id = f+3;
  select count(*) into n from cross_post_jobs where inventaire_id = f+3 and action = 'delete' and platform = 'leboncoin';
  perform pg_temp.verif(s = 'vendu' and n = 1, 'E3b. relue : 0 disponible → fiche vendue, copie prouvée retirée');
  -- E4 rien de lisible
  select decision into d from ventes_ebay_exemplaires e join ventes v on v.id = e.vente_id where v.commande_ref = 'ESSAI-E4';
  select statut into s from inventaire where id = f+4;
  select count(*) into n from cross_post_jobs where inventaire_id = f+4 and action = 'delete';
  perform pg_temp.verif(d = 'a_relire' and s = 'stock' and n = 0, 'E4. quantité impossible à établir → rien d''irréversible (stock, aucun retrait, à relire)');
  select count(*) into n from public.ebay_commandes_a_relire(u, 10) x;
  perform pg_temp.verif(n = 0, 'E4b. relue au passage suivant, pas avant (prochain essai dans 1 h)');
  -- E5 404
  perform public.ebay_quantite_lue(u, '990000505', jsonb_build_object('http', 404, 'lu_le', now()));
  select statut into s from inventaire where id = f+5;
  perform pg_temp.verif(s = 'vendu', 'E5. annonce introuvable chez eBay, seule annonce eBay → fiche vendue');
  -- E6 autre annonce eBay vivante
  perform public.ebay_quantite_lue(u, '990000506', jsonb_build_object('http', 404, 'lu_le', now()));
  select statut into s from inventaire where id = f+6;
  perform pg_temp.verif(s = 'stock', 'E6. terminée mais une AUTRE annonce eBay de la fiche est en ligne → en stock');
  -- E8 déjà vendue
  select decision into d from ventes_ebay_exemplaires e join ventes v on v.id = e.vente_id where v.commande_ref = 'ESSAI-E8';
  perform pg_temp.verif(d = 'sans_objet', 'E8. fiche déjà vendue → rien');
  -- Rejeu : la même commande relevée deux fois ne refait rien
  r := public.enregistrer_ventes_relevees('ebay', jsonb_build_array(
    jsonb_build_object('ref', 'ESSAI-E1', 'statut', 'PAID', 'listing_id', '990000501', 'prix', 20, 'vendu_le', v_cmd_le, 'titre', 'e1')), u);
  select quantite into q from inventaire where id = f+1;
  select count(*) into n from inventaire_journal where inventaire_id = f+1;
  perform pg_temp.verif(q = 2 and n = 1 and (r ->> 'deja_connues')::int = 1, 'E9. commande relue : rien de réécrit (quantité 2, une seule ligne de journal)');

  -- E7 : le relevé de l'API porte la quantité sur la fiche
  insert into annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, inventaire_id, vu_le, quantite, quantite_le)
  values (u, 'ebay', '990000507', 'https://www.ebay.fr/itm/990000507', 'e7', 'en_ligne', f+7, now(), 3, now());
  select quantite into q from inventaire where id = f+7;
  perform pg_temp.verif(q = 3, 'E7. import : la fiche prend la quantité eBay (1 → 3)');
  update inventaire set quantite = 2 where id = f+7;     -- un exemplaire vendu AILLEURS (eBay pas informé)
  update annonces_plateforme set quantite = 2, quantite_le = now() where user_id = u and listing_id = '990000507';  -- eBay en vend un
  select quantite into q from inventaire where id = f+7;
  perform pg_temp.verif(q = 1, 'E7b. relevé suivant : eBay 3 → 2, la fiche perd UN exemplaire (2 → 1), jamais rendu');
  update annonces_plateforme set titre = 'e7 bis' where user_id = u and listing_id = '990000507';
  select count(*) into n from inventaire_journal where inventaire_id = f+7 and champ = 'quantite' and source = 'releve_ebay';
  perform pg_temp.verif(n = 2, 'E7c. deux changements journalisés, aucun pour un relevé sans changement de quantité');
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_EXEMPLAIRE echecs=% sur %\n%', k, t, r;
end $r$;
`;

const sql = `begin;\n${MIG}\n${test}\nrollback;\n`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-exemplaire-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_EXEMPLAIRE echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « une commande eBay = un exemplaire »${MIG ? ' (migration 20261009190000 rejouée dans la transaction, puis annulée)' : ''} :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '')).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
