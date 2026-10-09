// PREUVE EN PROD, SANS RIEN GARDER — migration 20261009170000 (09/10, Jocabroc).
// Les lignes RÉELLES d'un compte (mode « lignes » d'ebay-ventes-sync, lecture seule,
// fichier JSON passé en argument) sont écrites par l'ANCIENNE puis par la NOUVELLE
// enregistrer_ventes_relevees, chacune dans une sous-transaction annulée, dans UNE
// transaction qui finit toujours en erreur (rien n'est gardé, aucun mail : pg_net ne
// part qu'au COMMIT). On compare le résultat et l'empreinte des ventes écrites, et
// on mesure la durée.
//   node scripts/ventes-relevees-identifiant-seul-preuve.mjs <lignes.json> <user_uuid> [--n=20] [--nouvelle-seule] [--avec-migration]
//   --n=20           : les 20 premières lignes seulement (l'ancienne met ~0,6 s par ligne sans
//                      identifiant : 176 lignes dépassent les 100 s de l'API de requête) ;
//   --nouvelle-seule : la nouvelle seule (durée sur toutes les lignes) ;
//   --avec-migration : la migration est déjà en prod — l'ancienne est remise par l'inverse
//                      DANS la transaction, puis la migration rejouée.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [fLignes, user] = process.argv.slice(2);
if (!fLignes || !/^[0-9a-f-]{36}$/.test(user ?? '')) { console.log('usage : <lignes.json> <user_uuid> [--avec-migration]'); process.exit(1); }
const n = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 0);
const toutes = JSON.parse(readFileSync(fLignes, 'utf8'));
const lignes = JSON.stringify(n > 0 ? toutes.slice(0, n) : toutes);
const nouvelleSeule = process.argv.includes('--nouvelle-seule');
const avecMig = process.argv.includes('--avec-migration');
const MIG = readFileSync(path.join(RACINE, 'supabase/migrations/20261009170000_ventes_relevees_identifiant_seul.sql'), 'utf8');
const INV = readFileSync(path.join(RACINE, 'scripts/reparations/20261009_inverse_ventes_relevees_identifiant_seul.sql'), 'utf8');
const tag = '$lignes_' + Date.now() + '$';

const passe = (nom) => String.raw`
do $p$
declare t0 timestamptz; v_res jsonb; v_h text; v_n int; v_ms numeric; v_err text;
begin
  begin
    t0 := clock_timestamp();
    v_res := public.enregistrer_ventes_relevees('ebay', ${tag}${lignes}${tag}::jsonb, '${user}'::uuid);
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    select count(*), md5(coalesce(string_agg(concat_ws('|', v.commande_ref, v.inventaire_id, v.annonce_id, v.prix_vente,
             v.prix_achat, v.benefice, v.statut, v.plateforme, v.vendu_le, v.titre), E'\n' order by v.commande_ref, v.id), ''))
      into v_n, v_h from public.ventes v where v.user_id = '${user}'::uuid;
    raise exception 'annuler';
  exception when others then
    if sqlerrm <> 'annuler' then v_err := sqlerrm; end if;
  end;
  insert into preuve values ('${nom}', jsonb_build_object('ms', v_ms, 'ventes_du_compte', v_n, 'empreinte', v_h, 'res', v_res, 'erreur', v_err));
end $p$;`;

const sql = `begin;
set local statement_timeout = '170s';
create temp table preuve(k text, v jsonb) on commit drop;
${avecMig ? INV : ''}
${nouvelleSeule ? '' : passe('ancienne')}
${MIG}
${passe('nouvelle')}
do $r$ declare r text; begin
  select string_agg(k || ' ' || v::text, ' ## ' order by k) into r from preuve;
  raise exception 'PREUVE_VRI %', r;
end $r$;
rollback;
`;
const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-vri-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 64e6 });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_VRI (.*?)(?:\n|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 3000)); process.exit(1); }
const parts = Object.fromEntries(m[1].split(/\\+n/)[0].replace(/\\+"/g, '"').split(' ## ').map((s) => { const i = s.indexOf(' '); return [s.slice(0, i), JSON.parse(s.slice(i + 1))]; }));
const a = parts.ancienne, nv = parts.nouvelle;
console.log(`${JSON.parse(lignes).length} ligne(s)`);
if (a) console.log(`ancienne : ${a.ms} ms, ${a.erreur ? 'ERREUR ' + a.erreur : JSON.stringify(a.res)}`);
console.log(`nouvelle : ${nv.ms} ms, ${nv.erreur ? 'ERREUR ' + nv.erreur : JSON.stringify(nv.res)}`);
if (!a) { const ok = !nv.erreur && nv.ms < 8000; console.log(ok ? `✓ nouvelle sous les 8 s de PostgREST — rien gardé` : '✗ erreur ou plus de 8 s — rien gardé'); process.exit(ok ? 0 : 1); }
const memes = !a.erreur && !nv.erreur && a.empreinte === nv.empreinte && JSON.stringify(a.res) === JSON.stringify(nv.res);
console.log(memes ? `✓ mêmes ventes écrites (empreinte ${nv.empreinte.slice(0, 12)}, ${nv.ventes_du_compte} ventes au compte) et même bilan — rien gardé`
                  : '✗ résultats différents (ou erreur) — rien gardé');
process.exit(memes ? 0 : 1);
