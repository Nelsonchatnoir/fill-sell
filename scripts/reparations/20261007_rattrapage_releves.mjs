// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPAGE DU PARC — RATTACHEMENT AVANT STOCK (07/10/2026) — LE LANCEUR
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/reparations/20261007_rattrapage_releves.mjs --empreintes [--user <uuid>]
//       calcule les empreintes manquantes (couvertures du stock + annonces) des
//       comptes concernés — un CACHE (photo_empreintes), aucune donnée touchée ;
//   node scripts/reparations/20261007_rattrapage_releves.mjs --simuler [--user <uuid>] [--avec-migration]
//       rejoue la règle, compte par compte, dans une transaction ANNULÉE ;
//       --avec-migration : joue aussi 20261007140000 (avant son application) ;
//       pour un seul compte, enchaîne le moteur sur ses annonces en attente ;
//   node scripts/reparations/20261007_rattrapage_releves.mjs --appliquer --user <uuid> | --tous
//       applique (sauvegardes _backup_0710_rattachement_*, journal), compte par
//       compte, une transaction par compte.
// Les comptes : ceux qui ont des articles importés par l'ancien moteur
// (origine releve_*, rapprochements « import » par « auto »), en stock.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const USER = val('--user');
const SCRIPT = fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261007_rattrapage_releves.sql'), 'utf8');
const MIGRATION = fs.readFileSync(path.join(RACINE, 'supabase', 'migrations', '20261007140000_rattachement_avant_stock.sql'), 'utf8')
  .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
  // En simulation : ni le déclencheur sur vinted_sync_runs (son verrou
  // bloquerait l'écriture des relevés de TOUS les comptes le temps de la
  // transaction), ni le cron — inutiles au calcul.
  .replace(/\r\n/g, '\n')
  .replace(/^DROP TRIGGER IF EXISTS trg_rapprochement_fin_run[\s\S]*?EXECUTE FUNCTION public\.rapprochement_fin_run\(\);\n/m, '')
  .replace(/^DO \$do\$\nBEGIN\n  PERFORM cron\.unschedule[\s\S]*?\$do\$;\n/m, '');

function q(sql) {
  const f = path.join(os.tmpdir(), `rattrapage-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.indexOf('{'))).rows;
  } catch (e) {
    const t = String(e.stdout || e.message); const i = t.indexOf('ERROR:');
    throw new Error(i >= 0 ? t.slice(i, i + 900) : t.slice(0, 1500));
  } finally { fs.rmSync(f, { force: true }); }
}
const COMPTES_SQL = `SELECT DISTINCT i.user_id FROM inventaire i
  WHERE i.origine LIKE 'releve\\_%' AND i.fusionne_dans IS NULL AND i.statut = 'stock'
    AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.inventaire_id = i.id AND r.decision = 'import' AND r.par = 'auto')`;
const comptes = () => (USER ? [USER] : q(COMPTES_SQL + ';').map((r) => r.user_id));

if (args.includes('--empreintes')) {
  const filtre = USER ? `= '${USER}'::uuid` : `IN (${COMPTES_SQL})`;
  const urls = q(`SELECT array_agg(DISTINCT y.u) urls FROM (
      SELECT fiche_couverture(i.photos) u FROM inventaire i WHERE i.user_id ${filtre} AND i.statut = 'stock' AND i.fusionne_dans IS NULL
      UNION ALL SELECT a.photo_url FROM annonces_plateforme a WHERE a.user_id ${filtre} AND a.disparu_le IS NULL AND a.platform IN ('leboncoin','beebs','ebay','opla')
    ) y WHERE y.u ~ '^https://' AND NOT EXISTS (SELECT 1 FROM photo_empreintes e WHERE e.url = y.u)
      AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs e WHERE e.url = y.u);`)[0]?.urls ?? [];
  console.log(`${urls.length} photo(s) à empreinter`);
  const PAR_APPEL = 6, PAR_VAGUE = 40; const t0 = Date.now(); const ids = [];
  for (let v = 0; v < urls.length; v += PAR_APPEL * PAR_VAGUE) {
    const lots = []; for (let i = v; i < Math.min(urls.length, v + PAR_APPEL * PAR_VAGUE); i += PAR_APPEL) lots.push(urls.slice(i, i + PAR_APPEL));
    ids.push(...q(lots.map((l) => `select net.http_post(url:='https://tojihnuawsoohlolangc.supabase.co/functions/v1/empreintes-urls', body:=jsonb_build_object('urls', '${JSON.stringify(l).replace(/'/g, "''")}'::jsonb), headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',public.cron_secret()), timeout_milliseconds:=60000) id`).join(' union all ') + ';').map((r) => r.id));
    await new Promise((r) => setTimeout(r, 8000));
    // CPU : on ne charge pas la base qui peine (règle du 04/10).
    const cpu = q('select pct from veille_cpu where pct is not null order by le desc limit 1;')[0]?.pct;
    if (cpu != null && cpu > 60) { console.log(`CPU ${cpu} % : pause 60 s`); await new Promise((r) => setTimeout(r, 60000)); }
    process.stdout.write(`\r${Math.min(urls.length, v + PAR_APPEL * PAR_VAGUE)}/${urls.length} demandées`);
  }
  await new Promise((r) => setTimeout(r, 15000));
  if (ids.length) console.log('\n', JSON.stringify(q(`select status_code, count(*) n, sum((content::jsonb->>'calculees')::int) calc, sum((content::jsonb->>'echouees')::int) ech from net._http_response where id between ${Math.min(...ids)} and ${Math.max(...ids)} group by 1;`)), `${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(0);
}

if (args.includes('--simuler')) {
  const liste = comptes();
  const res = [];
  // Un compte par transaction annulée : les verrous (lignes du compte)
  // tiennent le moins longtemps possible ; on n'attend jamais derrière un autre.
  for (let i = 0; i < liste.length; i += 1) {
    const lot = liste.slice(i, i + 1);
    const moteur = USER ? `
      DO $$ DECLARE r jsonb; k int; BEGIN
        PERFORM rapprochement_demander('${USER}'::uuid, 'simulation');
        UPDATE rapprochement_comptes SET passages_photos = 99 WHERE user_id = '${USER}'::uuid;
        FOR k IN 1..60 LOOP r := rapprochement_avancer('${USER}'::uuid, 20000); EXIT WHEN r->>'etat' IN ('termine','attente_releves','occupe','cpu'); END LOOP;
        INSERT INTO _sim SELECT '${USER}', jsonb_build_object('moteur_apres_rattrapage', r - 'urls',
          'stock_final', (SELECT count(*) FROM inventaire WHERE user_id='${USER}'::uuid AND fusionne_dans IS NULL AND statut='stock'),
          'titres_en_double_final', (SELECT count(*) FROM (SELECT titre_norm(titre) FROM inventaire WHERE user_id='${USER}'::uuid AND fusionne_dans IS NULL AND statut='stock' GROUP BY 1 HAVING count(*)>1) d),
          'propositions_hors_stock', (SELECT count(*) FROM annonces_plateforme WHERE user_id='${USER}'::uuid AND inventaire_id IS NULL AND proposition IS NOT NULL AND ignoree_le IS NULL AND disparu_le IS NULL),
          'questions_ouvertes', (SELECT count(*) FROM inventaire_doublons WHERE user_id='${USER}'::uuid AND statut='proposee'),
          'bilan_moteur', (SELECT bilan FROM rapprochement_comptes WHERE user_id='${USER}'::uuid));
      END $$;` : '';
    const sql = `BEGIN;\nSET LOCAL lock_timeout = '5s';\n${args.includes('--avec-migration') ? MIGRATION : ''}\n${SCRIPT}\nCREATE TEMP TABLE _sim (u text, v jsonb);\n`
      + lot.map((u) => `INSERT INTO _sim SELECT '${u}', pg_temp.rattrapage_compte('${u}'::uuid, true);`).join('\n')
      + moteur + '\nSELECT u, v FROM _sim;\nROLLBACK;\n';
    let r;
    try { r = q(sql); } catch (e) { r = [{ u: lot[0], v: { erreur: String(e.message).slice(0, 300) } }]; }
    res.push(...r);
    process.stdout.write(`\r${Math.min(liste.length, i + 1)}/${liste.length} comptes simulés`);
    const cpu = q('select pct from veille_cpu where pct is not null order by le desc limit 1;')[0]?.pct;
    if (cpu != null && cpu > 60) { console.log(`\nCPU ${cpu} % : pause 60 s`); await new Promise((r2) => setTimeout(r2, 60000)); }
  }
  console.log();
  fs.mkdirSync(path.join(RACINE, 'build', 'rattachement'), { recursive: true });
  fs.writeFileSync(path.join(RACINE, 'build', 'rattachement', `simulation-rattrapage${USER ? '-' + USER.slice(0, 8) : ''}.json`), JSON.stringify(res, null, 1));
  const t = { comptes: 0, importes: 0, fusions: 0, groupees: 0, hors_stock: 0, questions: 0, gardes: 0, echecs: 0, stock_avant: 0, stock_apres: 0, doubles_avant: 0, doubles_apres: 0 };
  for (const { v } of res.filter((x) => x.v?.importes_ancien_moteur != null)) {
    if (!v.importes_ancien_moteur) continue;
    t.comptes++; t.importes += v.importes_ancien_moteur; t.fusions += v.fusions_sures; t.groupees += v.dont_groupees_entre_plateformes;
    t.hors_stock += v.hors_stock_propositions; t.questions += v.questions_articles_touches; t.gardes += v.gardes_uniques; t.echecs += v.echecs;
    t.stock_avant += v.stock_avant; t.stock_apres += v.stock_apres; t.doubles_avant += v.titres_en_double_avant; t.doubles_apres += v.titres_en_double_apres ?? 0;
  }
  console.log(JSON.stringify(t, null, 1));
  for (const x of res) if (x.v?.moteur_apres_rattrapage || USER) console.log(x.u, JSON.stringify(x.v));
  process.exit(0);
}

if (args.includes('--appliquer')) {
  if (!USER && !args.includes('--tous')) { console.error('--user <uuid> ou --tous'); process.exit(1); }
  const liste = comptes();
  const res = [];
  for (const u of liste) {
    const r = q(`BEGIN;\n${SCRIPT}\nCREATE TEMP TABLE _app (u text, v jsonb);\nINSERT INTO _app SELECT '${u}', pg_temp.rattrapage_compte('${u}'::uuid, true);\nSELECT u, v FROM _app;\nCOMMIT;\n`);
    res.push(...r);
    console.log(u, JSON.stringify(r[0]?.v));
    const cpu = q('select pct from veille_cpu where pct is not null order by le desc limit 1;')[0]?.pct;
    if (cpu != null && cpu > 60) { console.log(`CPU ${cpu} % : pause 60 s`); await new Promise((r2) => setTimeout(r2, 60000)); }
  }
  fs.writeFileSync(path.join(RACINE, 'build', 'rattachement', `application-rattrapage-${Date.now()}.json`), JSON.stringify(res, null, 1));
  process.exit(0);
}
console.error('--empreintes | --simuler | --appliquer');
process.exit(1);
