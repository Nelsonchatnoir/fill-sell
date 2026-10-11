// selftest:declencheurs-droits — un déclencheur exécuté avec les droits de
// l'APPELANT n'appelle jamais une fonction fermée à `authenticated` (11/10, A5).
//
//   npm run selftest:declencheurs-droits             contrôles du dépôt (hors ligne)
//   npm run selftest:declencheurs-droits -- --prod   + la base de prod (lecture seule)
//
// Pourquoi : deux fois la même classe d'incident. 04/10 19:01 → 05/10 :
// profiles_premiers_releves_trg_fn appelait _ts_ou_null (EXECUTE retiré à
// authenticated le 27/09) → toute session de l'extension refusée (403).
// 09/10 ~12:00 → 11/10 : vinted_preuve_page_veilleur, même appel → tout signal
// de vente Vinted refusé, fiches passées « vendu » sans ligne de vente
// (migration 20261011120000). Le build est vert, rien ne se voit avant les
// journaux de PostgREST.
//
// Contrôles :
//   1. hors ligne : la migration 20261011120000 rend le déclencheur SECURITY
//      DEFINER et garde son corps ; la garde « une vente reconnue = une ligne »
//      est posée, bornée aux écritures du client ;
//   2. --prod : AUCUNE fonction de déclencheur non definer du schéma public
//      n'appelle une fonction du schéma public sans EXECUTE pour authenticated.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261011120000_vente_vinted_reconnue_une_ligne.sql');
const AVANT = lire('supabase/migrations/20261009130000_vinted_preuve_page.sql');

let echecs = 0;
const ok = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs += 1;
};
const corps = (sql, nom) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}()`);
  const a = sql.indexOf('AS $function$', i);
  const b = sql.indexOf('$function$', a + 13);
  return i < 0 || a < 0 || b < 0 ? null : sql.slice(a, b);
};

console.log('1. Le dépôt');
const fn = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION public.vinted_preuve_page_veilleur()'), MIG.indexOf('AS $function$'));
ok(/SECURITY DEFINER/.test(fn) && /SET search_path TO 'public', 'pg_temp'/.test(fn), 'vinted_preuve_page_veilleur : SECURITY DEFINER, search_path figé');
ok(corps(MIG, 'vinted_preuve_page_veilleur') === corps(AVANT, 'vinted_preuve_page_veilleur'), 'corps du déclencheur inchangé à l\'octet (règle du 09/10 intacte)');
ok(/CREATE TRIGGER inventaire_0_vendu_vinted_par_la_vente\s+BEFORE UPDATE OF statut ON public\.inventaire/.test(MIG), 'la garde « une vente reconnue = une ligne » est posée avant les autres déclencheurs de la fiche');
ok(/WHEN \(old\.statut = 'stock' AND new\.statut = 'vendu' AND new\.vinted_status = 'sold'\s+AND current_user = 'authenticated'::name\)/.test(MIG), '… seulement stock → vendu, dressing « sold », écrit par un client');
const garde = corps(MIG, 'inventaire_vendu_vinted_par_la_vente') ?? '';
ok(/if v_job is null then return new; end if;/.test(garde), 'sans job Vinted vivant : rien ne change (import pur)');
ok(/exists \(select 1 from public\.ventes v/.test(garde) && /public\.ventes_operations o/.test(garde), 'vente déjà écrite (ligne ou reçu) : rien ne change');
ok(garde.indexOf("update public.cross_post_jobs") < garde.indexOf('new.statut := old.statut'), 'le signal est posé AVANT de garder la fiche en stock (une erreur ne change rien)');
ok(/exception when others then[\s\S]*return new;/.test(garde), 'toute erreur : l\'écriture d\'origine passe, jamais une synchro cassée');
ok(!/titre/.test(garde.replace(/--.*$/gm, '')), 'jamais le titre : l\'annonce est reconnue à son numéro');

if (process.argv.includes('--prod')) {
  console.log('\n2. La base de prod (lecture seule)');
  const sql = `set transaction read only;
with trig as (
  select distinct p.oid, p.proname, p.prosrc from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where not t.tgisinternal and n.nspname = 'public' and not p.prosecdef
), appels as (
  select tr.proname as f, lower(m[1]) as appelee from trig tr, regexp_matches(tr.prosrc, '(?:public\\.)?([a-z_][a-z0-9_]*)\\s*\\(', 'gi') m
)
select coalesce(string_agg(distinct a.f || ' -> ' || a.appelee, ', '), '') as fautes,
       (select count(*) from trig) as declencheurs_appelant,
       (select prosecdef from pg_proc where proname = 'vinted_preuve_page_veilleur') as veilleur_definer,
       (select count(*) from pg_trigger where tgname = 'inventaire_0_vendu_vinted_par_la_vente') as garde
  from appels a join pg_proc f on f.proname = a.appelee join pg_namespace fn on fn.oid = f.pronamespace and fn.nspname = 'public'
 where not has_function_privilege('authenticated', f.oid, 'EXECUTE');`;
  const fichier = path.join(mkdtempSync(path.join(tmpdir(), 'declencheurs-droits-')), 'q.sql');
  writeFileSync(fichier, sql);
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true });
  const out = `${r.stdout}`;
  let row = null;
  try { row = JSON.parse(out.slice(out.indexOf('{'))).rows?.[0] ?? null; } catch { row = null; }
  ok(row != null, 'la base répond', out.slice(0, 300));
  if (row) {
    ok(row.fautes === '', `aucun des ${row.declencheurs_appelant} déclencheurs aux droits de l'appelant n'appelle une fonction fermée à authenticated`, row.fautes);
    ok(row.veilleur_definer === true, 'vinted_preuve_page_veilleur est SECURITY DEFINER en prod');
    ok(Number(row.garde) === 1, 'la garde inventaire_0_vendu_vinted_par_la_vente est en prod');
  }
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\nTOUT PASSE');
process.exit(echecs ? 1 : 0);
