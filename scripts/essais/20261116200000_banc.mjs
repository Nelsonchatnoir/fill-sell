// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BANC de la migration 20261116200000_comptes_plateforme_remplacer (16/11/2026, point 4 puis point 7 de Nico — ayadi007)
// — POSTGRES JETABLE (embedded-postgres, dans .tmp-terminal/, effacé à la fin), jamais la prod.
//   node scripts/essais/20261116200000_banc.mjs
// Le SCHÉMA DE PROD relu en lecture seule le 16/11 vers 14 h (scripts/essais/fixtures/prod-1611-compte-plateforme/ :
// les 706 fonctions de public, les 131 tables hors sauvegardes avec colonnes, défauts, contraintes, index et
// DÉCLENCHEURS, types, séquences, vues ; md5.json : les quatre corps réécrits) est chargé tel quel : toute écriture de la
// migration traverse les VRAIS déclencheurs de prod (cross_post_jobs : 43, annonces : 11).
// Bouchons (ce qu'un Postgres nu n'a pas) : auth.users / auth.uid() / auth.role() (comme Supabase), net.http_post (noté
// dans net._appels), cron_secret().
// Décor synthétique qui reproduit ayadi007 : ancien compte A (14 annonces vivantes : 11 tâches publiées dont une fiche
// vendue, une question « Vendue ? » ouverte et une première lecture hors ligne, une vente en attente, une republication
// pas lancée payée 1 quota, une republication ENGAGÉE, un retrait en attente, un retrait lié à une fusion « déjà vendu »,
// une annonce sans fiche), nouveau compte N (5 annonces, dont une sans fiche), deux annonces au compte inconnu, des
// comptes témoins (un seul compte, aucun compte…). Rejoue aussi les fichiers SQL tels quels : la migration, son inverse,
// scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql et son inverse (identifiants d'ayadi remplacés par ceux du
// décor).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..", "..");
const require = createRequire(path.join(RACINE, "package.json"));
const lireR = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const FIX = "scripts/essais/fixtures/prod-1611-compte-plateforme";
const MIGRATION = lireR("supabase/migrations/20261116200000_comptes_plateforme_remplacer.sql");
const INVERSE = lireR("supabase/rollbacks/20261116200000_comptes_plateforme_remplacer_INVERSE.sql");
const REPARATION = lireR("scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql");
const REPARATION_INVERSE = lireR("scripts/reparations/20261116_ayadi_remplacer_compte_lbc_INVERSE.sql");
// (16/11) Les 706 définitions de prod citent des clients dans leurs commentaires : gardées HORS du dépôt (selftest:donnees-clients),
// dans C:/Users/nicol/Documents/FillSell-bancs/prod-1611-compte-plateforme/snap_fonctions.json (ou à relire en lecture seule).
const FICHIER_FONCTIONS = [path.join(RACINE, FIX, "snap_fonctions.json"), "C:/Users/nicol/Documents/FillSell-bancs/prod-1611-compte-plateforme/snap_fonctions.json"].find((p) => fs.existsSync(p));
if (!FICHIER_FONCTIONS) { console.log("snap_fonctions.json absent (hors dépôt) : banc impossible"); process.exit(2); }
const FONCTIONS = JSON.parse(fs.readFileSync(FICHIER_FONCTIONS, "utf8"));
const TABLES = JSON.parse(lireR(`${FIX}/snap_tables.json`));
const DIVERS = JSON.parse(lireR(`${FIX}/snap_divers.json`));
const MD5_PROD = Object.fromEntries(Object.entries(JSON.parse(lireR(`${FIX}/md5.json`)).fonctions).map(([k, m]) => [k, { md5: m }]));
const SIG = {
  annonce: "annonce_non_prouvee_vivante(uuid,boolean)",
  constater: "constater_absences_releve(uuid)",
  veille: "veille_recentes_ouvrir(text,text[],text,text)",
  alerte: "cross_post_jobs_alerte_tenue()",
};

let verts = 0, rouges = 0;
const ok = (m, c, d) => {
  if (c) { verts++; console.log(`  ✓ ${m}`); }
  else { rouges++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); }
};
const titre = (t) => console.log(`\n${t}`);

// ── Le Postgres jetable ────────────────────────────────────────────────────────────────────────────────────────────
const EmbeddedPostgres = (await import("embedded-postgres")).default;
const { Client } = require("pg");
const port = 55400 + Math.floor(Math.random() * 90);
// Les fichiers de travail restent dans le projet (.tmp-terminal/, consigne de Nico du 14/11), effacés à la fin.
const dossier = path.join(RACINE, ".tmp-terminal", `banc-comptes-plateforme-${process.pid}`);
fs.mkdirSync(dossier, { recursive: true });
const pgsrv = new EmbeddedPostgres({ databaseDir: path.join(dossier, "base"), user: "postgres", password: "banc", port,
  persistent: false, onLog: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
await pgsrv.initialise();
await pgsrv.start();
const db = new Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
await db.connect();
const avis = [];
db.on("notice", (n) => avis.push(n.message));
const q = async (sql, p) => (await db.query(sql, p)).rows;
const v = async (sql, p) => Object.values((await q(sql, p))[0] ?? {})[0];
const essayer = async (sql) => { try { await db.query(sql); return null; } catch (e) { return e.message; } };
const md5Brut = (sig) => v(`SELECT md5(pg_get_functiondef('public.${sig}'::regprocedure))`);
const md5SansCR = (sig) => v(`SELECT md5(replace(pg_get_functiondef('public.${sig}'::regprocedure), chr(13), ''))`);
const existe = (sig) => v(`SELECT to_regprocedure('public.${sig}') IS NOT NULL`);
const acl = (sig) => v(`SELECT proacl::text FROM pg_proc WHERE oid = to_regprocedure('public.${sig}')`);

// Une session de l'app : rôle authenticated + jeton (comme PostgREST). lectureSeule : BEGIN READ ONLY.
let transactionOuverte = false;   // dans un essai annulé (G, H) : un point de sauvegarde, jamais un COMMIT
async function enSession(user, sql, params, { lectureSeule = false } = {}) {
  if (transactionOuverte) {
    await db.query("SAVEPOINT s_session");
    try {
      await db.query("SELECT set_config('request.jwt.claims', $1, true)", [user ? JSON.stringify({ sub: user, role: "authenticated" }) : ""]);
      await db.query("SET LOCAL ROLE authenticated");
      const r = await db.query(sql, params);
      await db.query("RESET ROLE"); await db.query("SELECT set_config('request.jwt.claims', '', true)");
      await db.query("RELEASE SAVEPOINT s_session");
      return r.rows;
    } catch (e) { await db.query("ROLLBACK TO SAVEPOINT s_session"); await db.query("RESET ROLE"); throw e; }
  }
  await db.query(lectureSeule ? "BEGIN READ ONLY" : "BEGIN");
  try {
    if (user) await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await db.query("SET LOCAL ROLE authenticated");
    const r = await db.query(sql, params);
    await db.query("COMMIT");
    return r.rows;
  } catch (e) { await db.query("ROLLBACK"); throw e; }
}
const rpc = async (user, sql, params, o) => Object.values((await enSession(user, sql, params, o))[0] ?? {})[0];

// L'empreinte de TOUTES les tables de public (nombre de lignes + md5 du contenu) — « rien d'autre n'a bougé ».
async function empreintes() {
  const tables = (await q("SELECT tablename FROM pg_tables WHERE schemaname IN ('public', 'net') ORDER BY 1")).map((r) => r.tablename);
  const e = {};
  for (const t of tables) {
    const sch = t === "_appels" ? "net" : "public";
    const r = (await q(`SELECT count(*)::int n, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) h FROM ${sch}."${t}" x`))[0];
    e[t] = `${r.n}:${r.h}`;
  }
  return e;
}
const differences = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((t) => a[t] !== b[t]).sort();

let code = 1;
try {
  // ══ 0. LE SCHÉMA DE PROD ══════════════════════════════════════════════════════════════════════════════════════════
  titre("0. Le schéma de prod (relu le 16/11, lecture seule) chargé dans le Postgres jetable");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA net; CREATE SCHEMA vault;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), raw_user_meta_data jsonb DEFAULT '{}',
      raw_app_meta_data jsonb DEFAULT '{}', deleted_at timestamptz, is_anonymous boolean DEFAULT false, last_sign_in_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    CREATE TABLE net._appels (id bigserial PRIMARY KEY, url text, body jsonb, le timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
      headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $f$
      INSERT INTO net._appels (url, body) VALUES (url, body) RETURNING id $f$;
    GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
    SET check_function_bodies = off;
  `);
  await essayer(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions`);
  await db.query("ALTER DATABASE postgres SET search_path TO public, extensions");
  await db.query("SET search_path TO public, extensions");
  // Types et séquences
  for (const d of DIVERS.filter((x) => x.k === "type" || x.k === "seq")) await essayer(d.d);
  // Fonctions (plusieurs passes : une fonction qui rend le type d'une table attend la table)
  let restantes = FONCTIONS.slice();
  const passeFonctions = async () => { const r = []; for (const f of restantes) if (await essayer(f.def)) r.push(f); restantes = r; };
  await passeFonctions();
  // Tables (colonnes, défauts, identité, colonnes générées) ; un type inconnu (extension absente) devient text
  let tablesKo = [];
  for (const t of TABLES) {
    const colonnes = (sansDefaut) => t.cols.map((c) => {
      let s = `"${c.n}" ${c.t}`;
      if (c.g === "s") s += ` GENERATED ALWAYS AS (${c.d}) STORED`;
      else if (c.id === "a") s += " GENERATED ALWAYS AS IDENTITY";
      else if (c.id === "d") s += " GENERATED BY DEFAULT AS IDENTITY";
      else if (c.d != null && !sansDefaut) s += ` DEFAULT ${c.d}`;
      if (c.nn) s += " NOT NULL";
      return s;
    }).join(", ");
    let e = await essayer(`CREATE TABLE public."${t.tbl}" (${colonnes(false)})`);
    if (e) { e = await essayer(`CREATE TABLE public."${t.tbl}" (${colonnes(true)})`); if (!e) tablesKo.push(`${t.tbl} (sans défauts)`); }
    if (e) tablesKo.push(`${t.tbl} : ${e}`);
  }
  await passeFonctions(); await passeFonctions();
  let consKo = 0, idxKo = 0, trgKo = [], vuesKo = [];
  for (const t of TABLES) {
    for (const c of t.cons ?? []) if (await essayer(`ALTER TABLE public."${t.tbl}" ADD CONSTRAINT "${c.n}" ${c.d}`)) consKo++;
    for (const i of t.idx ?? []) if (await essayer(i)) idxKo++;
  }
  let vues = DIVERS.filter((x) => x.k === "vue");
  for (let passe = 0; passe < 5 && vues.length; passe++) { const r = []; for (const x of vues) if (await essayer(x.d)) r.push(x); vues = r; }
  vuesKo = vues.map((x) => x.n);
  await passeFonctions();
  for (const t of TABLES) {
    if (t.rls) await essayer(`ALTER TABLE public."${t.tbl}" ENABLE ROW LEVEL SECURITY`);
    for (const g of t.trg ?? []) {
      const e = await essayer(g.d);
      if (e) { trgKo.push(`${t.tbl}.${g.n} : ${e}`); continue; }
      if (g.e === "D") await db.query(`ALTER TABLE public."${t.tbl}" DISABLE TRIGGER "${g.n}"`);
      if (g.e === "R") await db.query(`ALTER TABLE public."${t.tbl}" ENABLE REPLICA TRIGGER "${g.n}"`);
      if (g.e === "A") await db.query(`ALTER TABLE public."${t.tbl}" ENABLE ALWAYS TRIGGER "${g.n}"`);
    }
  }
  // Les droits EXÉCUTER de prod, fonction par fonction
  for (const f of FONCTIONS) {
    if (!f.acl) continue;
    const ent = f.acl.replace(/^\{|\}$/g, "").split(",").map((x) => x.split("=")[0]).filter((g) => g !== "postgres");
    await essayer(`REVOKE ALL ON FUNCTION public.${f.sig} FROM PUBLIC`);
    for (const g of ent) await essayer(`GRANT EXECUTE ON FUNCTION public.${f.sig} TO ${g === "" ? "PUBLIC" : g}`);
  }
  // Bouchon : le secret de cron (vault absent)
  await db.query(`CREATE OR REPLACE FUNCTION public.cron_secret() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'banc'::text $f$`);
  const nbF = await v("SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'");
  let identiques = 0;
  for (const f of FONCTIONS) if ((await v(`SELECT md5(pg_get_functiondef(to_regprocedure('public.${f.sig}')))`).catch(() => null)) === f.md5) identiques++;
  console.log(`  fonctions : ${nbF} chargées sur ${FONCTIONS.length}, ${identiques} identiques à la prod à l'octet (md5) ; non chargées : ${restantes.map((f) => f.sig).join(", ") || "aucune"}`);
  console.log(`  tables : ${TABLES.length - tablesKo.filter((x) => x.includes(" : ")).length} sur ${TABLES.length} ; ${tablesKo.length ? "écarts : " + tablesKo.join(" ; ") : "aucun écart"}`);
  console.log(`  contraintes non posées : ${consKo} ; index non posés : ${idxKo} ; vues non posées : ${vuesKo.join(", ") || "aucune"}`);
  console.log(`  déclencheurs non posés : ${trgKo.length ? trgKo.join(" ; ") : "aucun"}`);
  for (const [k, sig] of Object.entries(SIG)) ok(`prod : ${sig} reproduit à l'octet (md5 ${MD5_PROD[sig].md5})`, (await md5Brut(sig)) === MD5_PROD[sig].md5, await md5Brut(sig));
  const nbTrgJobs = await v("SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid = 'public.cross_post_jobs'::regclass AND NOT t.tgisinternal");
  const nbTrgAnn = await v("SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid = 'public.annonces_plateforme'::regclass AND NOT t.tgisinternal");
  ok(`déclencheurs de prod posés : cross_post_jobs ${nbTrgJobs}, annonces_plateforme ${nbTrgAnn}`, nbTrgJobs >= 39 && nbTrgAnn >= 11);
  const aclProd = {}; for (const sig of Object.values(SIG)) aclProd[sig] = await acl(sig);

  // ── Calibrage : les md5 « après » écrits dans la migration sont-ils ceux que Postgres produit ? ────────────────────
  const corpsMigration = MIGRATION.replace(/^BEGIN;\n/m, "").replace(/^COMMIT;\n?/m, "")
    .replace(/DO \$verif_apres\$[\s\S]*?\$verif_apres\$;\n/, "");
  await db.query("BEGIN");
  await db.query(corpsMigration);
  const apres = {};
  for (const [k, sig] of Object.entries(SIG)) apres[k] = await md5SansCR(sig);
  await db.query("ROLLBACK");
  // Les md5 écrits dans la garde « après » de la migration (DO $verif_apres$ … ('public.<sig>', '<md5>') …).
  const blocApres = MIGRATION.match(/DO \$verif_apres\$[\s\S]*?\$verif_apres\$;/)?.[0] ?? "";
  const ecrits = {};
  for (const [k, sig] of Object.entries(SIG)) {
    ecrits[k] = blocApres.match(new RegExp(`'public\\.${sig.replace(/[()[\]]/g, "\\$&")}', '([0-9a-f]{32})'`))?.[1] ?? null;
  }
  if (JSON.stringify(ecrits) !== JSON.stringify(apres)) {
    console.log(`  CALIBRAGE : md5 « après » mesurés ${JSON.stringify(apres)} ≠ écrits dans la migration ${JSON.stringify(ecrits)}`);
    code = 3;
    throw new Error("calibrage");
  }
  ok(`calibrage : md5 « après » (sans CR) écrits dans la migration = ceux du Postgres ${JSON.stringify(apres)}`, true);

  // ══ LE DÉCOR ══════════════════════════════════════════════════════════════════════════════════════════════════════
  const U = "00000000-0000-4000-8000-0000000000a1";   // ayadi007
  const U2 = "00000000-0000-4000-8000-0000000000a2";  // un seul compte Leboncoin vu
  const U3 = "00000000-0000-4000-8000-0000000000a3";  // relevés au compte inconnu seulement
  const U4 = "00000000-0000-4000-8000-0000000000a4";  // un autre client (droits)
  const U5 = "00000000-0000-4000-8000-0000000000a5";  // nouveau client : premier relevé après la migration
  const U7 = "00000000-0000-4000-8000-0000000000a7";  // charge : 2 000 annonces, deux comptes
  const A = "bf460991-06f6-4460-a36f-b6039396ffff";   // l'ancien compte (forme de prod)
  const N = "23b59b14-5cde-4fff-8bcb-7c6464608aaa";   // le nouveau
  const B = "b0000000-0000-4000-8000-00000000000b", D = "d0000000-0000-4000-8000-00000000000d", E = "e0000000-0000-4000-8000-00000000000e";
  const X = "c0000000-0000-4000-8000-0000000000c1", Y = "c0000000-0000-4000-8000-0000000000c2";
  const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const R = { A1: id(1, 1), A2: id(1, 2), ABS: id(1, 3), N1: id(1, 4), N2: id(1, 5), B1: id(1, 6), B2: id(1, 7), Z1: id(1, 8), D1: id(1, 9), X1: id(1, 10) };
  const lbcUrl = (n) => `https://www.leboncoin.fr/ad/vetements/${n}`;
  const releve = (rid, u, compte, debut, n, status = "done") => `('${rid}', '${u}', 'annonces', '${status}', 'leboncoin', ${compte ? `'${compte}'` : "NULL"},
      '${debut}'::timestamptz, '${debut}'::timestamptz + interval '2 minutes', '${debut}'::timestamptz + interval '2 minutes', ${n}, ${n}, 'veilleur',
      '[défilement] [adresse] 1 page(s), ${n} en ligne lues sur ${n} annoncées')`;
  // L'ancien compte : (clé, numéro, fiche, statut fiche, tâche publiée : signal, autre)
  const ANC = [
    ["a01", "3303358981", 1001, "stock"], ["a02", "3303457565", 1002, "stock"], ["a03", "3303460001", 1003, "stock"],
    ["a04", "3303460002", 1004, "stock"], ["a05", "3303460003", 1005, "stock"], ["a06", "3303460004", 1006, "stock"],
    ["a07", "3308403369", 1007, "vendu"],             // Lampe horticole : vendue sur Vinted, encore en ligne sur l'ancien compte
    ["a08", "3303460008", 1008, "stock", "unavailable"], // « Vendue ? » ouvert (absence)
    ["a09", "3308734754", 1009, "stock", "sold"],     // Lustre : signal de vente en attente → JAMAIS touchée
    ["a10", "3303460010", null, null],                // sans fiche
    ["a11", "3303460011", 1011, "stock"],             // + republication pas lancée (a_capturer), 1 quota payé
    ["a12", "3303460012", 1012, "stock"],             // + republication ENGAGÉE (retrait fait) → jamais touchée
    ["a13", "3308401684", 1013, "vendu"],             // Dashcam : vendue, + retrait EN ATTENTE
    ["a14", "3303460014", 1014, "stock"],             // + retrait échoué lié à une fusion « déjà vendu »
  ];
  const NEU = [["n01", "3310626901", 2001], ["n02", "3310626902", 2002], ["n03", "3310626903", 2003], ["n04", "3310626904", 2004], ["n05", "3310626905", null]];
  const ann = {}; let k = 0;
  for (const [c] of ANC) ann[c] = id(2, ++k);
  for (const [c] of NEU) ann[c] = id(3, ++k);
  ann.a15 = id(2, 99); ann.z01 = id(4, 1); ann.z02 = id(4, 2); ann.b01 = id(5, 1); ann.b02 = id(5, 2);
  const job = {}; let kj = 0; const J = (c) => (job[c] ??= id(6, ++kj));
  const fiches = [...ANC.filter((x) => x[2]).map((x) => [x[2], x[3], x[1]]), ...NEU.filter((x) => x[2]).map((x) => [x[2], "stock", x[1]]), [3001, "stock", "z01"]];
  const sqlFiches = fiches.map(([f, st, t]) => `(${f}, '${U}', 'Article ${t}', 20, '${st}', 'releve_leboncoin', false, '{}'::jsonb, false, 1)`).join(",\n    ");
  const sqlAnnonces = [
    ...ANC.map(([c, n, f]) => `('${ann[c]}', '${U}', 'leboncoin', '${n}', '${lbcUrl(n)}', 'Annonce ${n}', 20, 'en_ligne', ${f ?? "NULL"}, '${R.A2}', '2026-11-15T18:32:54Z', NULL, '${A}', '2026-11-13T10:00:00Z', NULL)`),
    `('${ann.a15}', '${U}', 'leboncoin', '3303460015', '${lbcUrl(3303460015)}', 'Annonce morte', 20, 'en_ligne', NULL, '${R.A1}', '2026-11-14T10:00:00Z', '2026-11-15T10:00:00Z', '${A}', '2026-11-13T10:00:00Z', NULL)`,
    ...NEU.map(([c, n, f]) => `('${ann[c]}', '${U}', 'leboncoin', '${n}', '${lbcUrl(n)}', 'Annonce ${n}', 20, 'en_ligne', ${f ?? "NULL"}, '${R.N2}', '2026-11-16T13:00:50Z', NULL, '${N}', '2026-11-16T09:00:00Z', NULL)`),
    `('${ann.z01}', '${U}', 'leboncoin', '3290000001', '${lbcUrl(3290000001)}', 'Annonce compte inconnu', 20, 'en_ligne', 3001, '${R.Z1}', '2026-11-08T17:00:00Z', NULL, NULL, '2026-11-01T10:00:00Z', NULL)`,
    `('${ann.z02}', '${U}', 'leboncoin', '3290000002', '${lbcUrl(3290000002)}', 'Annonce compte inconnu sans fiche', 20, 'en_ligne', NULL, '${R.Z1}', '2026-11-08T17:00:00Z', NULL, NULL, '2026-11-01T10:00:00Z', NULL)`,
    `('${ann.b01}', '${U2}', 'leboncoin', '3400000001', '${lbcUrl(3400000001)}', 'B sans fiche', 20, 'en_ligne', NULL, '${R.B2}', '2026-11-16T12:00:00Z', NULL, '${B}', '2026-11-16T09:00:00Z', NULL)`,
  ].join(",\n    ");
  // Les tâches
  const tache = (c, f, n, { action = "publish", status = "published", pf = {}, publie = "2026-11-13T12:47:00Z" } = {}) =>
    `('${J(c)}', '${U}', ${f ?? "NULL"}, 'leboncoin', '${action}', '${status}', 'standard', 'extension', '${n}', '${lbcUrl(n)}', ${publie ? `'${publie}'` : "NULL"}, '${JSON.stringify(pf)}'::jsonb, '2026-11-13T12:40:00Z')`;
  const lignesTaches = [];
  for (const [c, n, f, , signal] of ANC) {
    if (!f) continue;
    // a08 : « Vendue ? » OUVERT (deux lectures hors ligne) ; a05 : première lecture hors ligne (la question viendrait au
    // cycle suivant) ; a09 : signal de VENTE (jamais touché).
    const pf = signal === "unavailable" ? { sale_signal: "unavailable", unavailable_since: "2026-11-16T12:46:00Z" }
      : signal === "sold" ? { sale_signal: "sold" } : c === "a05" ? { unavailable_pending_since: "2026-11-16T11:44:00Z" } : {};
    lignesTaches.push(tache("t" + c.slice(1), f, n, { pf }));
  }
  for (const [c, n, f] of NEU) if (f) lignesTaches.push(tache("u" + c.slice(1), f, n));
  lignesTaches.push(tache("tz1", 3001, "3290000001"));
  lignesTaches.push(tache("r11", 1011, "3303460011", { action: "republish", status: "pending", publie: null,
    pf: { republish_step: "a_capturer", old_platform_listing_id: "3303460011", pepites_debitees: 1, republish_source_job_id: J("t11") } }));
  lignesTaches.push(tache("r12", 1012, "3303460012", { action: "republish", status: "pending", publie: null,
    pf: { republish_step: "deleted", old_platform_listing_id: "3303460012", deleted_at: "2026-11-16T09:00:00Z", republish_source_job_id: J("t12") } }));
  lignesTaches.push(tache("d13", 1013, "3308401684", { action: "delete", status: "pending", publie: null, pf: {} }));
  lignesTaches.push(tache("d14", 1014, "3303460014", { action: "delete", status: "failed", publie: null, pf: {} }));
  lignesTaches.push(tache("v07", 1007, "3308403369", { action: "publish", status: "sold", pf: { sale_signal: "sold" } }).replace("'leboncoin'", "'vinted'"));
  // La charge (U7) : 2 000 annonces au compte X (1 500 sans fiche) + 1 au compte Y, aucune fiche
  const DECOR = `
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${U}', 'u@banc'), ('${U2}', 'u2@banc'), ('${U3}', 'u3@banc'), ('${U4}', 'u4@banc'), ('${U5}', 'u5@banc'), ('${U7}', 'u7@banc');
    INSERT INTO profiles (id, is_business) VALUES ('${U}', true), ('${U2}', true), ('${U3}', false), ('${U4}', true), ('${U5}', true), ('${U7}', true);
    INSERT INTO coin_wallets (user_id, included_balance, purchased_balance, reserved_balance) VALUES ('${U}', 10, 0, 0);
    INSERT INTO coin_config (key, value) VALUES ('veille_recentes_ouverte', 1) ON CONFLICT (key) DO UPDATE SET value = 1;
    INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, compte_plateforme, started_at, finished_at, updated_at, items_vus, total_entries, declencheur, erreur) VALUES
    ${releve(R.A1, U, A, "2026-11-15T13:47:00Z", 14)}, ${releve(R.A2, U, A, "2026-11-15T18:30:50Z", 14)},
    ${releve(R.N1, U, N, "2026-11-16T12:56:49Z", 5)}, ${releve(R.N2, U, N, "2026-11-16T12:58:49Z", 5)},
    ${releve(R.Z1, U, null, "2026-11-08T17:00:00Z", 10)},
    ${releve(R.B1, U2, B, "2026-11-16T10:00:00Z", 1)}, ${releve(R.B2, U2, B, "2026-11-16T11:58:00Z", 1)},
    ${releve(id(1, 11), U3, null, "2026-11-16T10:00:00Z", 3)}, ${releve(R.D1, U4, D, "2026-11-16T10:00:00Z", 2)},
    ${releve(R.X1, U7, X, "2026-11-16T10:00:00Z", 2000)};
    INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, compte_plateforme, started_at, finished_at, updated_at, items_vus, total_entries, declencheur, erreur)
    VALUES ('${R.ABS}', '${U}', 'annonces', 'absente', 'leboncoin', NULL, '2026-11-16T09:28:26Z', '2026-11-16T09:29:00Z', '2026-11-16T09:29:00Z', 0, NULL, 'veilleur', 'page de connexion');
    INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, origine, prix_achat_inconnu, attributs, photos_a_rapatrier, quantite) VALUES
    ${sqlFiches};
    INSERT INTO annonces_plateforme (id, user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, run_id, vu_le, disparu_le, compte_plateforme, created_at, retiree_le) VALUES
    ${sqlAnnonces};
    INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, action, status, photo_option, voie, platform_listing_id, listing_url, published_at, platform_fields, created_at) VALUES
    ${lignesTaches.join(",\n    ")};
    INSERT INTO ventes (titre, prix_vente, user_id, inventaire_id, plateforme, vendu_le, statut) VALUES
      ('Article 3308403369', 20, '${U}', 1007, 'Vinted', '2026-11-08T21:23:00Z', 'vendu'),
      ('Article 3308401684', 20, '${U}', 1013, 'Leboncoin', '2026-11-08T10:42:00Z', 'vendu');
    INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, fusion_id)
    VALUES ('${U}', 1014, 1006, 'certain', 'fusionnee', 'deja_vendu', '{"retraits_oui": ["${J("d14")}"]}'::jsonb, 'releve', gen_random_uuid());
    INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, run_id, vu_le, compte_plateforme, created_at)
    SELECT '${U7}', 'leboncoin', (4000000000 + g)::text, 'https://www.leboncoin.fr/ad/x/' || (4000000000 + g), 'Charge ' || g, 10, 'en_ligne', NULL, '${R.X1}',
           '2026-11-16T10:01:00Z', CASE WHEN g = 2001 THEN '${Y}' ELSE '${X}' END, '2026-11-10T10:00:00Z'
      FROM generate_series(1, 2001) g WHERE g <= 1500 OR g = 2001;
    SET session_replication_role = origin;
  `;
  await db.query(DECOR);
  const AVANT = await empreintes();
  const nbVentes = () => v(`SELECT count(*)::int FROM ventes WHERE user_id = '${U}'`);
  const nbRetraits = () => v(`SELECT count(*)::int FROM cross_post_jobs WHERE user_id = '${U}' AND action = 'delete'`);
  const vendus = () => v(`SELECT string_agg(id::text || status, ',' ORDER BY id) FROM cross_post_jobs WHERE status = 'sold'`);
  // Les signaux de VENTE (« sold ») : jamais posés ni retirés. Les doutes (« unavailable ») sont comptés à part.
  const signaux = () => v(`SELECT string_agg(id::text || status, ',' ORDER BY id) FROM cross_post_jobs WHERE platform_fields ->> 'sale_signal' = 'sold'`);
  const questionsOuvertes = (u) => v(`SELECT count(*)::int FROM cross_post_jobs WHERE user_id = $1 AND status = 'published' AND platform_fields ->> 'sale_signal' = 'unavailable'`, [u]);
  // L'écriture de la veille de l'extension (background.js : 2e lecture hors ligne → PATCH sale_signal 'unavailable').
  const patchVeille = (jobId) => db.query(`UPDATE cross_post_jobs SET last_checked_at = now(),
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - 'unavailable_pending_since')
        || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') WHERE id = $1`, [jobId]);
  const ventesAvant = await nbVentes(), retraitsAvant = await nbRetraits(), vendusAvant = await vendus(), signauxAvant = await signaux();
  const nbRappro = () => v("SELECT count(*)::int FROM rapprochements");
  const rapproAvant = await nbRappro();

  // ══ A. LA PROD (corps relus) : le mélange reproduit ═══════════════════════════════════════════════════════════════
  titre("A. La prod (corps du 16/11) : les deux comptes s'importent, rien ne retient un compte");
  ok("A. annonce sans fiche du NOUVEAU compte (n05) : prouvée vivante → importable par le moteur", (await v(`SELECT annonce_non_prouvee_vivante('${ann.n05}', true)`)) === null);
  ok("A. annonce sans fiche de l'ANCIEN compte (a10) : prouvée vivante aussi → les deux comptes se mélangent", (await v(`SELECT annonce_non_prouvee_vivante('${ann.a10}', true)`)) === null);
  const conflitAvant = await v(`SELECT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.user_id = '${U}' AND c.inventaire_id = 1001 AND c.platform = 'leboncoin' AND c.status = 'published')`);
  ok("A. la fiche 1001 a sa place Leboncoin occupée par l'ancien compte (tâche publiée : « déjà en ligne »)", conflitAvant === true);
  const veilleProdA = await rpc(U, "SELECT veille_recentes_ouvrir('leboncoin', ARRAY['3999999999'], $1, 'banc')", [A]);
  ok("A. veille avec l'ancien compte : refusée par la règle du 08/11 (dernier relevé = nouveau compte)", veilleProdA?.motif === "compte_change", veilleProdA);
  ok("A. ayadi a une question « Vendue ? » ouverte sur l'ancien compte (a08)", (await questionsOuvertes(U)) === 1);
  await db.query("BEGIN");
  await patchVeille(J("t05"));
  const t05Prod = (await q("SELECT status, platform_fields ->> 'sale_signal' s FROM cross_post_jobs WHERE id = $1", [J("t05")]))[0];
  await db.query("ROLLBACK");
  ok("A. la prod : la 2e lecture hors ligne d'une annonce de l'ancien compte (a05, page 410) OUVRE « Vendue ? » (le défaut du 16/11 après-midi)",
    t05Prod.status === "published" && t05Prod.s === "unavailable", t05Prod);

  // ══ B. LA MIGRATION ═══════════════════════════════════════════════════════════════════════════════════════════════
  titre("B. La migration (fichier tel quel) — garde md5, tables, droits, amorce");
  let e = await essayer(MIGRATION);
  ok("B. appliquée sur les corps de prod", e === null, e);
  let tousApres = true;
  for (const [k, sig] of Object.entries(SIG)) if ((await md5SansCR(sig)) !== apres[k]) tousApres = false;
  ok("B. md5 « après » des quatre corps = ceux écrits dans la migration", tousApres);
  for (const sig of Object.values(SIG)) ok(`B. ${sig} : droits de prod inchangés (${aclProd[sig]})`, (await acl(sig)) === aclProd[sig], await acl(sig));
  const aclNeuf = async (sig) => (await acl(sig)) ?? "";
  for (const sig of ["remplacer_compte_plateforme(text,text,boolean)", "compte_plateforme_a_confirmer()"]) {
    const a = await aclNeuf(sig);
    ok(`B. ${sig} : authenticated et service_role l'appellent, ni anon ni PUBLIC`, /authenticated=X/.test(a) && /service_role=X/.test(a) && !/anon=X/.test(a) && !/(^|[{,])=X/.test(a), a);
  }
  for (const sig of ["remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)", "compte_plateforme_a_confirmer_pour(uuid)", "compte_plateforme_juger(uuid,text,text)", "compte_plateforme_dernier_releve(uuid,text)"]) {
    const a = await aclNeuf(sig);
    ok(`B. ${sig} : fermée aux clients (service_role seulement)`, /service_role=X/.test(a) && !/authenticated=X/.test(a) && !/anon=X/.test(a) && !/(^|[{,])=X/.test(a), a);
  }
  const droitsTable = await q(`SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = $1 AND grantee IN ('anon', 'authenticated', 'service_role') GROUP BY 1 ORDER BY 1`, ["comptes_plateforme_suivi"]);
  ok("B. comptes_plateforme_suivi : authenticated lit seulement, anon rien, RLS active", JSON.stringify(droitsTable.find((r) => r.grantee === "authenticated")) === JSON.stringify({ grantee: "authenticated", p: "SELECT" })
    && !droitsTable.some((r) => r.grantee === "anon") && (await v("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comptes_plateforme_suivi'::regclass")), droitsTable);
  const droitsTrace = await q(`SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'comptes_plateforme_remplacements' AND grantee IN ('anon', 'authenticated')`);
  ok("B. comptes_plateforme_remplacements : serveur seulement", droitsTrace.length === 0, droitsTrace);
  ok("B. annonces_plateforme.compte_quitte_le : colonne ajoutée, NULL partout", (await v("SELECT count(*)::int FROM annonces_plateforme WHERE compte_quitte_le IS NOT NULL")) === 0);
  const reg = async (u) => q(`SELECT compte, etat, decide_par, remplace_par, quitte_le IS NOT NULL AS quitte FROM comptes_plateforme_suivi WHERE user_id = $1 ORDER BY compte`, [u]);
  ok("B. amorce : un seul compte vu (U2) → suivi 'amorce_1611'", JSON.stringify(await reg(U2)) === JSON.stringify([{ compte: B, etat: "suivi", decide_par: "amorce_1611", remplace_par: null, quitte: false }]), await reg(U2));
  ok("B. amorce : deux comptes vus (ayadi) → aucun compte suivi (la question)", (await reg(U)).length === 0, await reg(U));
  ok("B. amorce : relevés au compte inconnu (U3) → rien", (await reg(U3)).length === 0);
  // annonces_plateforme a une colonne de plus : le texte de ses lignes change (un NULL de plus), aucune valeur.
  const diffMig = differences(AVANT, await empreintes());
  ok(`B. amorce : rien d'autre d'écrit (écarts : ${diffMig.join(", ")})`, diffMig.every((t) => ["comptes_plateforme_suivi", "comptes_plateforme_remplacements", "annonces_plateforme"].includes(t)), diffMig);
  ok("B. amorce : un seul compte relevé mais une annonce vivante d'un autre compte (U7) → rien (la question)", (await reg(U7)).length === 0, await reg(U7));
  const registre1 = await q("SELECT *, xmin::text x FROM comptes_plateforme_suivi ORDER BY user_id, compte");
  e = await essayer(MIGRATION);
  ok("B. migration rejouée : idempotente (aucune erreur, registre identique, aucune ligne réécrite)",
    e === null && JSON.stringify(await q("SELECT *, xmin::text x FROM comptes_plateforme_suivi ORDER BY user_id, compte")) === JSON.stringify(registre1), e);
  const APRES_MIG = await empreintes();

  // ══ C. PENDANT LA QUESTION ════════════════════════════════════════════════════════════════════════════════════════
  titre("C. Avant le geste : la question est posée, aucun des deux comptes ne s'importe");
  ok("C. n05 (nouveau compte, sans fiche) : 'compte_a_confirmer' → ni importée ni rattachée", (await v(`SELECT annonce_non_prouvee_vivante('${ann.n05}', true)`)) === "compte_a_confirmer");
  ok("C. a10 (ancien compte, sans fiche) : 'compte_a_confirmer'", (await v(`SELECT annonce_non_prouvee_vivante('${ann.a10}', false)`)) === "compte_a_confirmer");
  ok("C. z02 (compte inconnu, sans fiche) : la règle d'avant (prouvée vivante)", (await v(`SELECT annonce_non_prouvee_vivante('${ann.z02}', true)`)) === null);
  ok("C. b01 (U2, son compte suivi) : prouvée vivante (rien ne change pour 123 comptes)", (await v(`SELECT annonce_non_prouvee_vivante('${ann.b01}', true)`)) === null);
  const imp = await v(`SELECT rapprocher_importer('${U}', '${ann.n05}', 'utilisateur')`);
  ok("C. rapprocher_importer (geste de la personne) refuse en clair : annonce_non_prouvee_vivante / compte_a_confirmer", imp?.ok === false && imp?.reason === "annonce_non_prouvee_vivante" && imp?.motif === "compte_a_confirmer", imp);
  const question = await rpc(U, "SELECT compte_plateforme_a_confirmer()");
  const qU = question?.[0];
  ok("C. compte_plateforme_a_confirmer() (ayadi) : Leboncoin, « quel compte suivre ? », compte lu = le nouveau, 5 annonces lues",
    question?.length === 1 && qU.cas === "quel_compte" && qU.compte_lu === N && qU.annonces_lues === 5 && qU.compte_suivi === null, question);
  ok("C. … sa simulation : 13 annonces de l'ancien compte à clore (l'annonce sous republication engagée laissée), 2 objets vendus encore en ligne nommés",
    qU?.simulation?.annonces === 13 && qU?.simulation?.objets_vendus_encore_en_ligne?.length === 2
    && qU.simulation.objets_vendus_encore_en_ligne.map((o) => o.numero).join() === "3308401684,3308403369", qU?.simulation);
  ok("C. compte_plateforme_a_confirmer() : U2 (compte suivi = relevé) → rien ; sans session → rien",
    JSON.stringify(await rpc(U2, "SELECT compte_plateforme_a_confirmer()")) === "[]" && JSON.stringify(await rpc(null, "SELECT compte_plateforme_a_confirmer()")) === "[]");
  ok("C. la question et le refus n'ont rien écrit", differences(APRES_MIG, await empreintes()).length === 0, differences(APRES_MIG, await empreintes()));

  // ══ D. LES REFUS (rien écrit) ═════════════════════════════════════════════════════════════════════════════════════
  titre("D. Les refus en clair — rien n'est écrit");
  const refus = async (lib, u, args, motif, prep, defaire) => {
    if (prep) { await db.query("SET session_replication_role = replica"); await db.query(prep); await db.query("SET session_replication_role = origin"); }
    const avant = await empreintes();
    let r; try { r = await rpc(u, "SELECT remplacer_compte_plateforme($1, $2, $3)", args); } catch (x) { r = { erreur: x.message, code: x.code }; }
    const diff = differences(avant, await empreintes());
    if (defaire) { await db.query("SET session_replication_role = replica"); await db.query(defaire); await db.query("SET session_replication_role = origin"); }
    ok(`D. ${lib} → « ${r?.motif ?? r?.erreur} » ${r?.message ? `(« ${r.message} »)` : ""}`, r?.ok === false && r?.motif === motif && diff.length === 0, { r, diff });
  };
  await refus("l'ANCIEN compte (pas celui du dernier relevé)", U, ["leboncoin", A, false], "pas_le_dernier_releve");
  await refus("un compte saisi invalide", U, ["leboncoin", "x'; --", false], "compte_invalide");
  await refus("une autre plateforme", U, ["vinted", N, false], "plateforme");
  await refus("sans session", null, ["leboncoin", N, false], "session");
  await refus("une tâche Leboncoin « processing »", U, ["leboncoin", N, false], "tache_en_cours",
    `INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, action, status, photo_option, voie) VALUES ('${id(7, 1)}', '${U}', 2001, 'leboncoin', 'publish', 'processing', 'standard', 'extension')`,
    `DELETE FROM cross_post_jobs WHERE id = '${id(7, 1)}'`);
  await refus("un relevé Leboncoin en cours", U, ["leboncoin", N, false], "releve_en_cours",
    `INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, started_at, updated_at) VALUES ('${id(7, 2)}', '${U}', 'annonces', 'running', 'leboncoin', now(), now())`,
    `DELETE FROM vinted_sync_runs WHERE id = '${id(7, 2)}'`);
  await refus("le dernier relevé n'a pas tout lu (4 sur 5)", U, ["leboncoin", N, false], "releve_incomplet",
    `INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, compte_plateforme, started_at, finished_at, updated_at, items_vus, total_entries) VALUES ('${id(7, 3)}', '${U}', 'annonces', 'done', 'leboncoin', '${N}', '2026-11-16T13:10:00Z', '2026-11-16T13:11:00Z', now(), 4, 5)`,
    `DELETE FROM vinted_sync_runs WHERE id = '${id(7, 3)}'`);
  await refus("un AUTRE client (U4) avec le compte d'ayadi : jugé sur SON relevé, rien chez ayadi", U4, ["leboncoin", N, false], "pas_le_dernier_releve");
  let interdit; try { await rpc(U4, `SELECT remplacer_compte_plateforme_pour('${U}', 'leboncoin', '${N}', false, 'utilisateur')`); } catch (x) { interdit = x.message; }
  ok("D. la fonction interne (avec un user_id) est fermée à une session : « permission denied »", /permission denied/.test(interdit ?? ""), interdit);
  let lectureAutre; try { lectureAutre = await enSession(U4, `SELECT count(*)::int n FROM comptes_plateforme_suivi WHERE user_id = '${U2}'`); } catch (x) { lectureAutre = x.message; }
  ok("D. RLS : un client ne lit pas le registre d'un autre (0 ligne)", lectureAutre?.[0]?.n === 0, lectureAutre);
  let ecriture; try { await enSession(U, `INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_par) VALUES ('${U}', 'leboncoin', '${A}', 'suivi', 'utilisateur')`); } catch (x) { ecriture = x.message; }
  ok("D. un client n'écrit jamais le registre directement", /permission denied/.test(ecriture ?? ""), ecriture);

  // ══ E. LA SIMULATION ══════════════════════════════════════════════════════════════════════════════════════════════
  titre("E. La simulation (transaction en LECTURE SEULE : une écriture y serait refusée par Postgres)");
  const avantSim = await empreintes();
  const sim = await rpc(U, "SELECT remplacer_compte_plateforme('leboncoin', $1)", [N], { lectureSeule: true });
  ok("E. simulation : ok, rien écrit (toutes les tables identiques)", sim?.ok === true && sim?.simulation === true && differences(avantSim, await empreintes()).length === 0, sim);
  ok(`E. bilan : ${sim.annonces} annonces de l'ancien compte, ${sim.annonces_sur_fiche} sur une fiche, ${sim.fiches_au_stock} fiches au stock (${sim.fiches_liberees} libérées pour Leboncoin : celle au signal de vente reste occupée), ${sim.taches_publiees} tâches publiées, ${sim.republications} republication pas lancée, ${sim.retraits.length} retrait en attente`,
    sim.annonces === 13 && sim.annonces_sur_fiche === 12 && sim.fiches_au_stock === 10 && sim.fiches_liberees === 9 && sim.taches_publiees === 11 && sim.republications === 1 && sim.retraits.length === 1, sim);
  ok("E. laissés et nommés : la tâche au signal de vente (Lustre), la republication engagée, le retrait lié à une fusion, l'annonce au compte inconnu",
    sim.taches_vente_en_attente_laissees.length === 1 && sim.taches_vente_en_attente_laissees[0].numero === "3308734754"
    && sim.republications_engagees_laissees.length === 1 && sim.republications_engagees_laissees[0].etape === "deleted"
    && sim.retraits_laisses.length === 1 && sim.retraits_laisses[0].motif === "fusion_deja_vendu" && sim.annonces_compte_inconnu_non_touchees === 2
    && sim.annonces_republication_engagee_laissees.length === 1 && sim.annonces_republication_engagee_laissees[0].numero === "3303460012", sim);
  ok(`E. questions « Vendue ? » à clore avec leurs tâches : ${sim.questions_vendue} ouverte (a08), ${sim.premieres_lectures_hors_ligne} première lecture hors ligne (a05)`,
    sim.questions_vendue === 1 && sim.premieres_lectures_hors_ligne === 1, sim);
  console.log(`    bilan simulé (extrait) : ${JSON.stringify({ anciens: sim.anciens, nouveau: sim.nouveau, objets_vendus_encore_en_ligne: sim.objets_vendus_encore_en_ligne.map((o) => o.numero + " « " + o.titre + " »"), retraits: sim.retraits.map((r) => r.numero) })}`);

  // ══ F. L'APPLICATION ══════════════════════════════════════════════════════════════════════════════════════════════
  titre("F. Le geste (session d'ayadi, p_simuler = false) — à travers les 43 déclencheurs de prod de cross_post_jobs");
  const ligneAnn = async () => Object.fromEntries((await q(`SELECT id, disparu_le, compte_quitte_le, retiree_le, inventaire_id, statut_plateforme, compte_plateforme FROM annonces_plateforme WHERE user_id = '${U}'`)).map((r) => [r.id, r]));
  const annAvant = await ligneAnn();
  const walletAvant = await q(`SELECT included_balance, purchased_balance FROM coin_wallets WHERE user_id = '${U}'`);
  const avantApp = await empreintes();
  avis.length = 0;
  const app = await rpc(U, "SELECT remplacer_compte_plateforme('leboncoin', $1, false)", [N]);
  ok(`F. ok : ${app.annonces_closes} annonces closes, ${app.taches_closes} tâches publiées closes, ${app.republications_closes} republication close, ${app.retraits_clos} retrait clos`,
    app?.ok === true && app.annonces_closes === 13 && app.taches_closes === 11 && app.republications_closes === 1 && app.retraits_clos === 1, app);
  const diffApp = differences(avantApp, await empreintes());
  const PERMIS = ["annonces_plateforme", "cross_post_jobs", "comptes_plateforme_suivi", "comptes_plateforme_remplacements", "usage_logs",
    "compte_signal", "coin_wallets", "coin_ledger", "rapprochement_comptes", "_appels"];
  ok(`F. tables écrites : ${diffApp.join(", ")} — rien d'autre`, diffApp.every((t) => PERMIS.includes(t)), diffApp);
  ok("F. 0 fiche modifiée (inventaire identique), 0 doublon/fusion touchée, 0 rapprochement écrit",
    !diffApp.includes("inventaire") && !diffApp.includes("inventaire_doublons") && !diffApp.includes("inventaire_fusions") && (await nbRappro()) === rapproAvant);
  ok("F. 0 vente créée, 0 retrait créé, 0 tâche « sold » changée, 0 signal de vente posé ou retiré",
    (await nbVentes()) === ventesAvant && (await nbRetraits()) === retraitsAvant && (await vendus()) === vendusAvant
    && (await signaux()) === signauxAvant && !diffApp.includes("ventes"));
  const annApres = await ligneAnn();
  const closes = ANC.map(([c]) => c).filter((c) => c !== "a12");
  ok("F. annonces de l'ancien compte : disparu_le = compte_quitte_le ; retiree_le, fiche, statut et compte INCHANGÉS",
    closes.every((c) => { const a = annApres[ann[c]], b = annAvant[ann[c]]; return a.disparu_le && +a.disparu_le === +a.compte_quitte_le
      && String(a.retiree_le) === String(b.retiree_le) && a.inventaire_id === b.inventaire_id && a.statut_plateforme === b.statut_plateforme && a.compte_plateforme === b.compte_plateforme; }));
  ok("F. intactes : a12 (republication engagée), a15 (déjà close), les 5 du nouveau compte, les 2 au compte inconnu",
    ["a12", "a15", "n01", "n02", "n03", "n04", "n05", "z01", "z02"].every((c) => JSON.stringify(annApres[ann[c]]) === JSON.stringify(annAvant[ann[c]])));
  const jt = async (c) => (await q(`SELECT status, error, platform_fields pf FROM cross_post_jobs WHERE id = $1`, [J(c)]))[0];
  const t01 = await jt("t01");
  ok(`F. tâche publiée → « cancelled » : « ${t01.error} »`, t01.status === "cancelled" && /Ancien compte Leboncoin quitté/.test(t01.error) && /ce n'est pas une vente/.test(t01.error)
    && t01.pf.compte_quitte?.statut_avant === "published" && t01.pf.compte_quitte?.nouveau === N, t01);
  const t08 = await jt("t08"), t05 = await jt("t05");
  ok("F. la question « Vendue ? » ouverte (a08) est CLOSE avec sa tâche (« ancien compte quitté, ce n'est pas une vente ») : signal ôté, gardé dans compte_quitte.signal_avant",
    t08.status === "cancelled" && /quitté/.test(t08.error) && /pas une vente/.test(t08.error) && !("sale_signal" in t08.pf) && !("unavailable_since" in t08.pf)
    && t08.pf.compte_quitte?.signal_avant?.sale_signal === "unavailable", t08);
  ok("F. la première lecture hors ligne (a05) est close aussi (aucune question au cycle suivant : la tâche n'est plus relue)",
    t05.status === "cancelled" && !("unavailable_pending_since" in t05.pf) && t05.pf.compte_quitte?.signal_avant?.unavailable_pending_since != null, t05);
  ok(`F. plus aucune question « Vendue ? » ouverte chez ayadi (avant : 1) ; bilan : ${app.questions_vendue} question close, ${app.premieres_lectures_hors_ligne} première lecture close`,
    (await questionsOuvertes(U)) === 0 && app.questions_vendue === 1 && app.premieres_lectures_hors_ligne === 1);
  ok("F. closes aussi : la fiche vendue (a07), le « Vendue ? » ouvert (a08), a11, a13, a14",
    (await q(`SELECT count(*)::int n FROM cross_post_jobs WHERE id = ANY ($1::uuid[]) AND status = 'cancelled'`, [["t07", "t08", "t11", "t13", "t14"].map(J)]))[0].n === 5);
  const t09 = await jt("t09"), t12 = await jt("t12"), r12 = await jt("r12"), d14 = await jt("d14"), r11 = await jt("r11"), d13 = await jt("d13");
  ok("F. JAMAIS touchées : la tâche au signal de vente (Lustre), la tâche de la republication engagée et cette republication, le retrait lié à la fusion",
    t09.status === "published" && t09.pf.sale_signal === "sold" && t12.status === "published" && r12.status === "pending" && d14.status === "failed", { t09, t12, r12, d14 });
  ok(`F. republication pas lancée → « cancelled » : « ${r11.error} »`, r11.status === "cancelled" && /pas une vente/.test(r11.error), r11);
  ok(`F. retrait en attente → « cancelled » et listé : « ${d13.error} »`, d13.status === "cancelled" && /retire-la toi-même/.test(d13.error)
    && app.retraits?.[0]?.numero === "3308401684", { d13, retraits: app.retraits });
  const walletApres = await q(`SELECT included_balance, purchased_balance FROM coin_wallets WHERE user_id = '${U}'`);
  ok(`F. la republication pas lancée rend son quota (règle de prod republish_refund_on_terminal) : ${JSON.stringify(walletAvant[0])} → ${JSON.stringify(walletApres[0])}`,
    walletApres[0].purchased_balance === walletAvant[0].purchased_balance + 1 && r11.pf.pepite_remboursee === true);
  ok("F. registre : l'ancien compte 'quitte' (remplacé par le nouveau), le nouveau 'suivi' (décidé par la personne)",
    JSON.stringify(await reg(U)) === JSON.stringify([{ compte: A, etat: "quitte", decide_par: "utilisateur", remplace_par: N, quitte: true }, { compte: N, etat: "suivi", decide_par: "utilisateur", remplace_par: null, quitte: false }].sort((a, b) => a.compte.localeCompare(b.compte))), await reg(U));
  const trace = (await q(`SELECT anciens, nouveau, par, jsonb_array_length(avant -> 'annonces') na, jsonb_array_length(avant -> 'taches') nt FROM comptes_plateforme_remplacements WHERE user_id = '${U}'`))[0];
  ok(`F. trace : état d'avant de ${trace?.na} annonces et ${trace?.nt} tâches ; usage_logs 'compte_plateforme_remplace'`,
    trace?.na === 13 && trace?.nt === 13 && (await v(`SELECT count(*)::int FROM usage_logs WHERE user_id = '${U}' AND feature = 'compte_plateforme_remplace'`)) === 1, trace);
  ok("F. le rangement des annonces du nouveau compte est relancé (rapprochement demandé, un appel à la fonction edge)",
    (await v("SELECT count(*)::int FROM net._appels WHERE url LIKE '%/functions/v1/rapprochement'")) === 1);
  ok("F. ensuite : n05 (nouveau compte, sans fiche) est prouvée vivante → le moteur la range ; a10 close ('disparue')",
    (await v(`SELECT annonce_non_prouvee_vivante('${ann.n05}', true)`)) === null && (await v(`SELECT annonce_non_prouvee_vivante('${ann.a10}', true)`)) === "disparue");
  ok("F. la place Leboncoin de la fiche 1001 est libre (plus aucune tâche publiée ni en file : plus de « déjà en ligne »)",
    (await v(`SELECT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.user_id = '${U}' AND c.inventaire_id = 1001 AND c.platform = 'leboncoin' AND c.status IN ('published', 'pending', 'processing', 'needs_user'))`)) === false);
  ok("F. aucun avertissement d'un déclencheur", avis.filter((m) => !/^inverse/.test(m)).length === 0, avis);
  const apresApp = await empreintes();
  const deja = await rpc(U, "SELECT remplacer_compte_plateforme('leboncoin', $1, false)", [N]);
  ok("F. deuxième appel : « déjà suivi », rien écrit", deja?.ok === true && deja?.deja === true && differences(apresApp, await empreintes()).length === 0, deja);
  ok("F. plus de question pour ayadi", JSON.stringify(await rpc(U, "SELECT compte_plateforme_a_confirmer()")) === "[]");

  // ══ F2. LA VEILLE N'OUVRE PLUS « VENDUE ? » SUR UN COMPTE QUITTÉ (dans une transaction annulée) ════════════════════
  titre("F2. Une page publique 410 d'une annonce d'un compte QUITTÉ n'ouvre plus rien (cross_post_jobs_alerte_tenue)");
  await db.query("BEGIN"); transactionOuverte = true;
  // La republication engagée de a12 se termine (échec) : sa tâche publiée t12, sur l'ancien compte, redevient lisible
  // par la veille — c'est la seule tâche publiée qui reste sur un compte quitté.
  await db.query(`SET LOCAL session_replication_role = replica; UPDATE cross_post_jobs SET status = 'failed' WHERE id = '${J("r12")}'; SET LOCAL session_replication_role = origin;`);
  const ventesF2 = await nbVentes(), retraitsF2 = await nbRetraits(), annF2 = await empreintes();
  avis.length = 0;
  await patchVeille(J("t12"));
  const t12b = await jt("t12");
  ok(`F2. 2e lecture hors ligne de a12 (compte quitté) : aucune question — la tâche est close « ${t12b.error} »`,
    t12b.status === "cancelled" && !("sale_signal" in t12b.pf) && !("unavailable_since" in t12b.pf) && /quitté le \d\d\/\d\d/.test(t12b.error)
    && /pas une vente/.test(t12b.error) && t12b.pf.compte_quitte?.par === "alerte_tenue" && t12b.pf.compte_quitte?.signal_ecarte === "unavailable", t12b);
  const diffF2 = differences(annF2, await empreintes());
  ok(`F2. 0 vente, 0 retrait créé (y compris des copies), 0 fiche touchée, 0 question ouverte (tables écrites : ${diffF2.join(", ")})`,
    (await nbVentes()) === ventesF2 && (await nbRetraits()) === retraitsF2 && !diffF2.includes("inventaire") && !diffF2.includes("ventes")
    && (await questionsOuvertes(U)) === 0 && diffF2.every((t) => ["cross_post_jobs"].includes(t)), diffF2);
  await patchVeille(J("u01"));
  const u01 = await jt("u01");
  ok("F2. non-régression : la même lecture sur une annonce du compte SUIVI ouvre bien « Vendue ? » (règle d'avant)",
    u01.status === "published" && u01.pf.sale_signal === "unavailable", u01);
  await patchVeille(J("tz1"));
  const tz1 = await jt("tz1");
  ok("F2. non-régression : annonce au compte INCONNU → « Vendue ? » comme avant", tz1.status === "published" && tz1.pf.sale_signal === "unavailable", tz1);
  ok("F2. aucun avertissement du déclencheur", avis.length === 0, avis);
  await db.query("ROLLBACK"); transactionOuverte = false;

  // ══ G. LA SYMÉTRIE (dans une transaction annulée) ═════════════════════════════════════════════════════════════════
  titre("G. Un relevé ultérieur de l'ANCIEN compte (le PC reconnecté) : rien importé, rien daté, la question revient");
  await db.query("BEGIN"); transactionOuverte = true;
  // La garde de prod garde_releve_pendant_republication refuse tout relevé tant que r12 est entre retrait et
  // recréation : on la termine d'abord (sans déclencheur).
  await db.query(`SET LOCAL session_replication_role = replica; UPDATE cross_post_jobs SET status = 'failed' WHERE id = '${J("r12")}'; SET LOCAL session_replication_role = origin;`);
  const RA3 = id(1, 20);
  await db.query(`INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, compte_plateforme, started_at, finished_at, updated_at, items_vus, total_entries, declencheur, erreur)
    VALUES ('${RA3}', '${U}', 'annonces', 'running', 'leboncoin', '${A}', now() - interval '3 minutes', NULL, now(), 2, 2, 'veilleur', '[défilement] [adresse] 1 page(s), 2 en ligne lues sur 2 annoncées')`);
  // L'extension réécrit les annonces vues (upsert : disparu_le remis à NULL) — background.js:20541-20551
  await db.query(`UPDATE annonces_plateforme SET run_id = '${RA3}', vu_le = now(), disparu_le = NULL, updated_at = now() WHERE id IN ('${ann.a01}', '${ann.a10}')`);
  const rapAvantG = await nbRappro();
  const closesIds = ANC.map(([c]) => c).filter((c) => c !== "a12").map((c) => ann[c]);
  const tachesCloses = await q("SELECT id, status, platform_fields FROM cross_post_jobs WHERE platform_fields ? 'compte_quitte' ORDER BY id");
  await db.query(`UPDATE vinted_sync_runs SET status = 'done', finished_at = now() WHERE id = '${RA3}'`);   // les déclencheurs de fin de relevé
  const qG = await rpc(U, "SELECT compte_plateforme_a_confirmer()");
  ok("G. la question revient : « autre compte », compte lu = l'ancien, compte suivi = le nouveau",
    qG?.[0]?.cas === "autre_compte" && qG[0].compte_lu === A && qG[0].compte_suivi === N, qG);
  ok("G. a10 revue (sans fiche) : 'compte_quitte' → jamais importée", (await v(`SELECT annonce_non_prouvee_vivante('${ann.a10}', true)`)) === "compte_quitte");
  ok("G. rien daté chez le nouveau compte, registre inchangé, aucune absence constatée sur les annonces closes, leurs tâches closes inchangées",
    (await v(`SELECT count(*)::int FROM annonces_plateforme WHERE user_id = '${U}' AND compte_plateforme = '${N}' AND disparu_le IS NOT NULL`)) === 0
    && (await reg(U)).length === 2
    && (await v("SELECT count(*)::int FROM rapprochements WHERE annonce_id = ANY ($1::uuid[])", [closesIds])) === 0
    && JSON.stringify(await q("SELECT id, status, platform_fields FROM cross_post_jobs WHERE platform_fields ? 'compte_quitte' ORDER BY id")) === JSON.stringify(tachesCloses));
  const autresG = await q(`SELECT a.listing_id, a.compte_plateforme FROM rapprochements r JOIN annonces_plateforme a ON a.id = r.annonce_id ORDER BY 1`);
  console.log(`    (règle d'avant, inchangée : ce relevé de l'ancien compte juge aussi les annonces au compte INCONNU — ${autresG.length} constat(s) d'absence : ${autresG.map((x) => x.listing_id + (x.compte_plateforme ? "" : " (compte inconnu)")).join(", ")})`);
  const veilleA = await rpc(U, "SELECT veille_recentes_ouvrir('leboncoin', ARRAY['3999999999'], $1, 'banc')", [A]);
  ok("G. veille avec l'ancien compte : 'compte_change' — alors que le dernier relevé l'a lu (la règle d'avant l'aurait ouverte)", veilleA?.motif === "compte_change", veilleA);
  await db.query("ROLLBACK"); transactionOuverte = false;

  // ══ H. LE PREMIER COMPTE D'UN NOUVEAU CLIENT (dans une transaction annulée) ════════════════════════════════════════
  titre("H. Un nouveau client : son premier relevé probant retient son compte");
  await db.query("BEGIN"); transactionOuverte = true;
  const RE1 = id(1, 30);
  await db.query(`SET session_replication_role = replica;
    INSERT INTO vinted_sync_runs (id, user_id, kind, status, platform, compte_plateforme, started_at, finished_at, updated_at, items_vus, total_entries, declencheur, erreur)
    VALUES ('${RE1}', '${U5}', 'annonces', 'done', 'leboncoin', '${E}', now() - interval '3 minutes', now() - interval '1 minute', now(), 1, 1, 'app', '[défilement] [adresse] 1 page(s), 1 en ligne lues sur 1 annoncées');
    INSERT INTO annonces_plateforme (user_id, platform, listing_id, statut_plateforme, run_id, vu_le, compte_plateforme) VALUES ('${U5}', 'leboncoin', '3500000001', 'en_ligne', '${RE1}', now(), '${E}');
    SET session_replication_role = origin;`);
  const c1 = await v(`SELECT constater_absences_releve('${RE1}')`);
  ok(`H. constater_absences_releve (${c1?.motif}) : le compte lu devient 'suivi' ('premier_releve')`,
    JSON.stringify(await reg(U5)) === JSON.stringify([{ compte: E, etat: "suivi", decide_par: "premier_releve", remplace_par: null, quitte: false }]), await reg(U5));
  const xmin1 = await v(`SELECT xmin::text FROM comptes_plateforme_suivi WHERE user_id = '${U5}'`);
  await v(`SELECT constater_absences_releve('${RE1}')`);
  ok("H. relancé : aucune ligne réécrite (même version de ligne)", (await v(`SELECT xmin::text FROM comptes_plateforme_suivi WHERE user_id = '${U5}'`)) === xmin1);
  await db.query("ROLLBACK"); transactionOuverte = false;

  // ══ I. LA CHARGE ══════════════════════════════════════════════════════════════════════════════════════════════════
  titre("I. La charge (U7 : 1 500 annonces sans fiche au compte X + 1 au compte Y, aucun compte suivi)");
  const mesure = async (lib) => {
    const t0 = process.hrtime.bigint();
    const n = await v(`SELECT count(*) FILTER (WHERE annonce_non_prouvee_vivante(id, true) IS NOT NULL)::int FROM annonces_plateforme WHERE user_id = '${U7}' AND inventaire_id IS NULL AND disparu_le IS NULL`);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`    ${lib} : ${n} non importables sur 1 501, ${ms.toFixed(0)} ms (${(ms / 1501).toFixed(3)} ms par annonce)`);
    return n;
  };
  ok("I. question ouverte (pire cas : un EXISTS par annonce) : les 1 501 retenues", (await mesure("question ouverte")) === 1501);
  await db.query("BEGIN");
  await db.query(`INSERT INTO comptes_plateforme_suivi (user_id, platform, compte, etat, decide_par) VALUES ('${U7}', 'leboncoin', '${X}', 'suivi', 'utilisateur')`);
  ok("I. compte X suivi : seule l'annonce du compte Y retenue", (await mesure("compte X suivi")) === 1);
  await db.query("ROLLBACK");
  let t0 = process.hrtime.bigint();
  const qU7 = await rpc(U7, "SELECT compte_plateforme_a_confirmer()");
  console.log(`    compte_plateforme_a_confirmer() pour U7 (simulation comprise) : ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0)} ms, ${qU7?.[0]?.simulation?.annonces} annonce(s) à clore`);
  t0 = process.hrtime.bigint();
  await rpc(U2, "SELECT compte_plateforme_a_confirmer()");
  console.log(`    compte_plateforme_a_confirmer() pour U2 (aucune question) : ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`);

  // ══ J. L'INVERSE ══════════════════════════════════════════════════════════════════════════════════════════════════
  titre("J. L'inverse (fichier tel quel) : corps de prod à l'octet, état d'avant restauré, tables et colonne retirées");
  avis.length = 0;
  e = await essayer(INVERSE);
  ok("J. appliqué", e === null, e);
  for (const sig of Object.values(SIG)) ok(`J. ${sig} : md5 de prod ${MD5_PROD[sig].md5}`, (await md5Brut(sig)) === MD5_PROD[sig].md5, await md5Brut(sig));
  for (const sig of Object.values(SIG)) ok(`J. ${sig} : droits de prod`, (await acl(sig)) === aclProd[sig], await acl(sig));
  ok("J. fonctions neuves retirées", !(await existe("remplacer_compte_plateforme(text,text,boolean)")) && !(await existe("remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)"))
    && !(await existe("compte_plateforme_a_confirmer()")) && !(await existe("compte_plateforme_a_confirmer_pour(uuid)")) && !(await existe("compte_plateforme_juger(uuid,text,text)")) && !(await existe("compte_plateforme_dernier_releve(uuid,text)")));
  ok("J. tables et colonne retirées (copies _backup_inv_1611_* sans droit client)",
    (await v("SELECT to_regclass('public.comptes_plateforme_suivi') IS NULL AND to_regclass('public.comptes_plateforme_remplacements') IS NULL"))
    && (await v("SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'annonces_plateforme' AND column_name = 'compte_quitte_le'")) === 0
    && (await v("SELECT count(*)::int FROM _backup_inv_1611_cps_remplacements")) === 1);
  console.log(`    avis de l'inverse : ${avis.join(" | ")}`);
  const FIN = await empreintes();
  const diffFin = differences(AVANT, FIN);
  const SUITES = ["usage_logs", "coin_wallets", "coin_ledger", "compte_signal", "rapprochement_comptes", "_appels", "cross_post_jobs", "_backup_inv_1611_cps_suivi", "_backup_inv_1611_cps_remplacements"];
  ok(`J. comparé à l'état d'AVANT la migration : annonces_plateforme et inventaire identiques ; écarts seulement dans ${diffFin.join(", ")}`,
    !diffFin.includes("annonces_plateforme") && !diffFin.includes("inventaire") && diffFin.every((t) => SUITES.includes(t)), diffFin);
  const r11fin = await jt("r11");
  ok("J. cross_post_jobs : toutes les tâches remises à l'octet sauf la republication remboursée (laissée close, nommée dans un avis)",
    r11fin.status === "cancelled" && avis.some((m) => m.includes(J("r11"))) && (await v(`SELECT count(*)::int FROM cross_post_jobs WHERE platform_fields ? 'compte_quitte'`)) === 1, { r11fin, avis });
  const t01fin = await jt("t01");
  ok("J. tâche publiée remise : statut, texte et platform_fields d'avant (aucune trace « compte_quitte »)", t01fin.status === "published" && t01fin.error === null && !("compte_quitte" in t01fin.pf));
  const t08fin = await jt("t08"), t05fin = await jt("t05");
  ok("J. les questions closes reviennent telles qu'avant : « Vendue ? » de a08 ouverte, première lecture de a05",
    t08fin.status === "published" && t08fin.pf.sale_signal === "unavailable" && t05fin.status === "published" && t05fin.pf.unavailable_pending_since != null
    && (await questionsOuvertes(U)) === 1, { t08fin, t05fin });
  await db.query("BEGIN");
  await patchVeille(J("t05"));
  const t05inv = await jt("t05");
  await db.query("ROLLBACK");
  ok("J. et la porte de prod est revenue : la 2e lecture de a05 rouvre « Vendue ? » (comme avant la migration)", t05inv.status === "published" && t05inv.pf.sale_signal === "unavailable", t05inv);
  ok("J. 0 retrait créé, 0 vente, aucun signal de vente changé par l'inverse", (await nbRetraits()) === retraitsAvant && (await nbVentes()) === ventesAvant && (await signaux()) === signauxAvant);
  e = await essayer(INVERSE);
  ok("J. inverse rejoué : sans erreur (garde md5 de prod acceptée), rien ne change", e === null && differences(FIN, await empreintes()).length === 0, e);

  // ══ K. FINS DE LIGNE (git core.autocrlf) ══════════════════════════════════════════════════════════════════════════
  titre("K. Les deux fichiers extraits en CRLF : même résultat");
  const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
  e = await essayer(crlf(MIGRATION));
  ok("K. migration en CRLF : appliquée (garde « après » sans CR)", e === null, e);
  e = await essayer(crlf(INVERSE));
  ok("K. inverse en CRLF : appliqué", e === null, e);
  for (const sig of Object.values(SIG)) ok(`K. ${sig} : remis à l'octet de prod (md5 ${MD5_PROD[sig].md5}), CR de prod compris`, (await md5Brut(sig)) === MD5_PROD[sig].md5, await md5Brut(sig));

  // ══ L. LE SCRIPT DE RÉPARATION D'AYADI ET SON INVERSE (fichiers tels quels, identifiants du décor substitués) ═══════
  titre("L. scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql et son inverse, rejoués sur le décor");
  e = await essayer(MIGRATION);
  ok("L. migration réappliquée après l'inverse", e === null, e);
  const vrai = (s) => s.replaceAll("cfdfda6f-d182-4974-81b2-07050fc95d37", U).replaceAll("23b59b14-5cde-4fff-8bcb-7c6464608a33", N)
    .replaceAll("bf460991-06f6-4460-a36f-b60393964407", A);
  const annL = await empreintes();
  // 1. Tel quel (bornes d'ayadi : ~108 annonces) : le décor n'en a que 13 → la garde refuse, RIEN n'est écrit.
  e = await essayer(vrai(REPARATION));
  await db.query("ROLLBACK").catch(() => {});
  ok(`L. garde du script : la simulation s'écarte du bilan attendu → refus (« ${String(e).slice(0, 90)} »), rien écrit, aucune sauvegarde`,
    /garde : 13 annonces/.test(e ?? "") && differences(annL, await empreintes()).length === 0
    && (await v("SELECT to_regclass('public._backup_1611_ayadi_lbc_annonces') IS NULL")), e);
  // 2. Bornes ramenées au décor (seule substitution) : § 0, § 1 (READ ONLY), § 2 (sauvegarde + garde + geste), § 3.
  const nAnnU = await v(`SELECT count(*)::int FROM annonces_plateforme WHERE user_id = '${U}' AND platform = 'leboncoin'`);
  avis.length = 0;
  e = await essayer(vrai(REPARATION).replace("BETWEEN 100 AND 115", "BETWEEN 1 AND 115"));
  const trL = (await q(`SELECT id, par, bilan FROM comptes_plateforme_remplacements WHERE user_id = '${U}' ORDER BY le DESC LIMIT 1`))[0];
  ok(`L. script joué : garde passée, geste « script » (${trL?.bilan?.annonces_closes} annonces, ${trL?.bilan?.taches_closes} tâches, ${trL?.bilan?.questions_vendue} question « Vendue ? » close)`,
    e === null && trL?.par === "script" && trL.bilan.annonces_closes === 13 && trL.bilan.questions_vendue === 1
    && (await v(`SELECT decide_par FROM comptes_plateforme_suivi WHERE user_id = '${U}' AND etat = 'suivi'`)) === "script"
    && avis.some((m) => m.startsWith("garde passée")), { e, avis });
  ok("L. sauvegardes posées (annonces et tâches Leboncoin d'avant, sans droit client) ; plus aucune question « Vendue ? » ouverte",
    (await v("SELECT count(*)::int FROM _backup_1611_ayadi_lbc_annonces")) === nAnnU && (await questionsOuvertes(U)) === 0
    && (await v("SELECT relrowsecurity FROM pg_class WHERE oid = 'public._backup_1611_ayadi_lbc_taches'::regclass")));
  const apresL = await empreintes();
  e = await essayer(vrai(REPARATION).replace("BETWEEN 100 AND 115", "BETWEEN 1 AND 115"));
  await db.query("ROLLBACK").catch(() => {});
  ok("L. script rejoué : refusé (sauvegarde déjà là / compte déjà suivi), rien écrit", e !== null && differences(apresL, await empreintes()).length === 0, e);
  // 3. L'inverse du script.
  avis.length = 0;
  e = await essayer(vrai(REPARATION_INVERSE));
  const finL = await empreintes();
  ok("L. inverse du script : annonces remises à l'octet, registre d'avant (aucune ligne), la question « Vendue ? » d'a08 revenue",
    e === null && finL.annonces_plateforme === annL.annonces_plateforme && (await reg(U)).length === 0 && (await questionsOuvertes(U)) === 1, { e, avis });

  code = rouges === 0 ? 0 : 1;
} catch (x) {
  if (x.message !== "calibrage") { console.log(`\n  ✗ ERREUR : ${x.stack}`); rouges++; }
} finally {
  await db.end().catch(() => {});
  await pgsrv.stop().catch(() => {});
  fs.rmSync(dossier, { recursive: true, force: true });
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(code === 3 ? 3 : rouges === 0 ? 0 : 1);
