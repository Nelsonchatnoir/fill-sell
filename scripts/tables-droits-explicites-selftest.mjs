// selftest:tables-droits-explicites — (24/10, point 10) Le régime Supabase du 30/10 : une table de `public` ne
// reçoit plus aucun droit d'office. La règle du dépôt :
//   · toute migration datée du 24/10 ou après qui crée une table de `public` (hors sauvegarde) écrit ses droits :
//     GRANT … TO service_role, et soit GRANT … TO authenticated, soit le marqueur « droits : serveur seulement » ;
//     elle active la RLS de la table ;
//   · une table de sauvegarde née d'une migration ou d'un script de réparation (≥ 24/10) a la RLS et aucun droit
//     anon/authenticated (le déclencheur d'événement fillsell_table_nait_protegee le fait aussi en base) ;
//   · la migration 20261024110000 pose le régime (droits par défaut, déclencheur d'événement, sauvegardes fermées,
//     19 fonctions de lecture resserrées) : ses marqueurs sont vérifiés.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

// La même définition qu'en base (public.est_table_de_sauvegarde).
const estSauvegarde = (nom) => /^_/.test(nom) || /^(sauvegarde|backup)/.test(nom) || /(backup|_sauvegarde)/.test(nom)
  || /_20[0-9]{6}(_[0-9]{4})?$/.test(nom) || /^campagne_reactivation_[0-9]{4}$/.test(nom);

console.log('1. La définition d\'une sauvegarde');
ok(estSauvegarde('_backup_2410_boutiques_orphelines') && estSauvegarde('sauvegarde_ornella_1009_soir_v2') && estSauvegarde('jobs_purge_20260828')
  && estSauvegarde('inv_coco_ritthik_backup_20260910') && estSauvegarde('platform_category_aspects_sauvegarde_20260916b'), 'les formes connues de sauvegarde');
ok(!estSauvegarde('cross_post_jobs') && !estSauvegarde('inventaire') && !estSauvegarde('jobs_reservations_extension')
  && !estSauvegarde('lens_temp_purge_trace') && !estSauvegarde('lectures_origine_demandees') && !estSauvegarde('vinted_republish_captures'),
  'aucune table réelle n\'est une sauvegarde');
const migReg = lire('supabase/migrations/20261024110000_securite_droits_explicites_3010.sql');
ok(migReg.includes("coalesce(p_nom, '') ~ '^_'") && migReg.includes("'(backup|_sauvegarde)'") && migReg.includes("'_20[0-9]{6}(_[0-9]{4})?$'"),
  'la définition du selftest est celle de la base (est_table_de_sauvegarde)');

console.log('2. Le régime posé en base (migration 20261024110000)');
ok(/REVOKE ALL ON TABLES FROM anon, authenticated, service_role;/.test(migReg) && /REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;/.test(migReg),
  'droits par défaut : rien d\'implicite sur les tables et séquences');
ok(/REVOKE EXECUTE ON FUNCTIONS FROM anon;/.test(migReg), 'droits par défaut : aucune nouvelle fonction exécutable par anon');
ok(/CREATE EVENT TRIGGER fillsell_table_nait_protegee\s+ON ddl_command_end\s+WHEN TAG IN \('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO'\)/.test(migReg)
  && /ENABLE ROW LEVEL SECURITY', cmd\.object_identity/.test(migReg) && /RAISE LOG 'fillsell_table_nait_protegee/.test(migReg),
  'toute nouvelle table naît avec la RLS, sans jamais bloquer une création');
for (const f of ['annonce_publiee_par_compte', 'article_vendu', 'comptes_sont_lies', 'quota_annonces_consommees', 'retrait_job_prouve', 'vinted_boutique_du_poste']) {
  ok(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(migReg), `${f} : plus jamais anon ni authenticated`);
}
ok(/REVOKE EXECUTE ON FUNCTION public\.quotas_etat\(\) FROM PUBLIC, anon;/.test(migReg) && /GRANT EXECUTE ON FUNCTION public\.quotas_etat\(\) TO authenticated/.test(migReg),
  'quotas_etat : l\'app connectée garde son appel');
ok(/REVOKE EXECUTE ON FUNCTION public\.boutique_vinted_autre_compte\(uuid, text\) FROM PUBLIC, anon;/.test(migReg),
  'boutique_vinted_autre_compte : get-pending-jobs (session) garde son appel');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
ok(/userClient\.rpc\("boutique_vinted_autre_compte"/.test(gpj), 'get-pending-jobs l\'appelle bien sous la session (sinon : retirer authenticated)');
for (const f of ['annonce_publiee_par_compte', 'article_vendu', 'retrait_job_prouve', 'debut_cycle_quotas', 'sync_multi_ouverte_pour', 'quota_annonces_consommees']) {
  const appelsSession = [...gpj.matchAll(new RegExp(`userClient\\.rpc\\("${f}"`, 'g'))].length;
  ok(appelsSession === 0, `${f} n'est jamais appelée sous la session dans get-pending-jobs`);
}

console.log('3. Les migrations à partir du 24/10 écrivent les droits de leurs tables');
const migrations = fs.readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) >= '20261024000000');
let tables = 0;
for (const f of migrations) {
  const s = lire(`supabase/migrations/${f}`);
  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
    const t = m[1].toLowerCase();
    if (t === 'as') continue;
    tables++;
    const rls = new RegExp(`alter\\s+table\\s+(?:public\\.)?${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(s);
    if (estSauvegarde(t)) {
      // (« FROM PUBLIC, anon, authenticated » ferme autant : anon ET authenticated restent exigés.)
    const ferme = new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?(?:public\\.)?${t}\\s+from\\s+(?:public,\\s*)?anon,\\s*authenticated`, 'i').test(s);
      ok(rls && ferme, `${f.slice(0, 14)} ${t} : sauvegarde née protégée (RLS, aucun droit client)`);
    } else {
      const svc = new RegExp(`grant\\s+[a-z ,]+\\s+on\\s+(?:table\\s+)?(?:public\\.)?${t}\\b[^;]*\\bservice_role`, 'i').test(s);
      const client = new RegExp(`grant\\s+[a-z ,]+\\s+on\\s+(?:table\\s+)?(?:public\\.)?${t}\\b[^;]*\\bauthenticated`, 'i').test(s)
        || new RegExp(`droits\\s*:\\s*serveur seulement[^\\n]*\\b${t}\\b`, 'i').test(s);
      ok(rls && svc && client, `${f.slice(0, 14)} ${t} : RLS + service_role + droits client écrits (ou « serveur seulement »)`);
    }
  }
}
ok(tables >= 2, `${tables} création(s) de table relue(s) depuis le 24/10`);

console.log('4. Les tables d\'octobre ont leurs droits écrits (20261024120000)');
const rec = lire('supabase/migrations/20261024120000_droits_explicites_tables_recentes.sql');
for (const t of ['boutiques_plateforme', 'comptes_lies', 'fiches_liees_comptes', 'veille_cpu', 'ventes_prouvees_passages', 'cloud_postes', 'quotas_par_compte']) {
  ok(new RegExp(`GRANT ALL ON TABLE public\\.${t} TO service_role;`).test(rec), `${t} : service_role écrit`);
}
ok(/GRANT ALL ON TABLE public\.lectures_origine_demandees TO authenticated, service_role;/.test(rec), 'lectures_origine_demandees : l\'app garde sa lecture');

console.log('5. Les scripts de réparation à partir du 24/10 : sauvegardes nées protégées');
const dirRep = join(ROOT, 'scripts/reparations');
const scripts = fs.existsSync(dirRep) ? fs.readdirSync(dirRep).filter((f) => /^2026102[4-9].*\.sql$|^202611.*\.sql$|^2027.*\.sql$/.test(f)) : [];
let sauvegardes = 0;
for (const f of scripts) {
  const s = lire(`scripts/reparations/${f}`);
  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
    const t = m[1].toLowerCase();
    if (!estSauvegarde(t)) continue;
    sauvegardes++;
    const rls = new RegExp(`alter\\s+table\\s+(?:public\\.)?${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(s);
    // (« FROM PUBLIC, anon, authenticated » ferme autant : anon ET authenticated restent exigés.)
    const ferme = new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?(?:public\\.)?${t}\\s+from\\s+(?:public,\\s*)?anon,\\s*authenticated`, 'i').test(s);
    ok(rls && ferme, `${f} ${t} : sauvegarde née protégée`);
  }
}
ok(true, `${sauvegardes} sauvegarde(s) de script relue(s) (le déclencheur d'événement les protège aussi en base)`);

const regles = lire('docs/regles/base-supabase-et-fonctions.md');
ok(/fillsell_table_nait_protegee/.test(regles) && /30\/10/.test(regles), 'la règle est écrite dans docs/regles/base-supabase-et-fonctions.md');

console.log(`\n✓ tables-droits-explicites : ${n} contrôles verts`);
