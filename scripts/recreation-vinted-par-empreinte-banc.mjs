// ═══════════════════════════════════════════════════════════════════════════
// BANC — migration 20261113190000_recreation_vinted_par_empreinte (13/11, décision K1 de Nico) sur un VRAI Postgres
// JETABLE — JAMAIS la prod.
//   node scripts/cloud/pg-jetable.mjs scripts/recreation-vinted-par-empreinte-banc.mjs
//   (ou PREUVE_PG=postgres://… vers un Postgres jetable)
// A. la PROD (migration 20261018170000 = pg_get_functiondef de prod le 13/11, md5 01b1d478…) : rattachement et RETRAIT
//    d'une copie de plus au seul accord titre + heure + boutique (comptes 2189c4d8 / 02ca0f20, 25 et 27/10) ;
// B. la migration : plus rien au titre ; rattachement / retrait sur le numéro rendu par Vinted ou un jeton de photo
//    de notre envoi ; doute (deux tâches, numéro antérieur, autre boutique) → l'import suit son cours ;
// C. l'inverse : la définition revient à l'octet (md5 de prod), la fonction neuve part ;
// D. la migration rejouée : idempotente.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)/.test(PG_URL)) { console.error("PREUVE_PG : un Postgres JETABLE (jamais la prod)."); process.exit(2); }
const require = createRequire(import.meta.url);
const { Client } = require(process.env.PREUVE_MODULES ? path.join(process.env.PREUVE_MODULES, "pg") : "pg");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const AVANT = lire("supabase/migrations/20261018170000_recreation_vinted_rattachee_au_releve.sql");
const MIGRATION = lire("supabase/migrations/20261113190000_recreation_vinted_par_empreinte.sql");
const INVERSE = lire("supabase/rollbacks/20261113190000_recreation_vinted_par_empreinte_INVERSE.sql");
// md5(pg_get_functiondef(...)) lus en PROD le 13/11 (lecture seule).
const MD5_PROD = {
  "public.inventaire_rattache_recreation_vinted()": "01b1d478a5df6034deba01a435f2bb6a",
  "public.recreation_vinted_envois(jsonb)": "a6b28b6fe18937e0e3d106026d7e684e",
  "public.recreation_vinted_retrait_le(jsonb)": "f2218ccb807780be7a7c02f0f95515bd",
  "public.recreation_vinted_titre_norm(text)": "ad73fc570a911f0f053a3f19b36b0b01",
};

const db = new Client({ connectionString: PG_URL });
await db.connect();
// Le déclencheur avale toute erreur (« import inchangé ») : un « rien » ne doit jamais venir d'une erreur avalée.
const avalees = [];
db.on("notice", (n) => { if (/import inchangé/.test(String(n?.message ?? ""))) avalees.push(String(n.message)); });
let verts = 0, rouges = 0;
const ok = (c, m, d) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
await db.query("DO $$ BEGIN RAISE WARNING 'banc : import inchangé (essai de l''écoute)'; END $$");
await new Promise((r) => setTimeout(r, 50));
ok(avalees.length === 1, "l'écoute des avertissements du déclencheur fonctionne", avalees);
avalees.length = 0;

await db.query(`
  DROP TABLE IF EXISTS public.cross_post_jobs CASCADE; DROP TABLE IF EXISTS public.inventaire CASCADE;
  CREATE TABLE public.inventaire (id bigserial PRIMARY KEY, user_id uuid NOT NULL, titre text, origine text, statut text DEFAULT 'stock',
    vinted_item_id text, listed_at_guess timestamptz, vinted_status text, vinted_view_count int, vinted_favourite_count int,
    vinted_account_id text, last_synced_at timestamptz, disparu_le timestamptz, photos jsonb);
  CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, inventaire_id bigint,
    platform text, action text, status text, photo_option text, voie text, title text, listing_url text, platform_listing_id text,
    platform_fields jsonb, error text, published_at timestamptz, created_at timestamptz DEFAULT now());
`);
await db.query(AVANT); // la prod

const md5 = async (sig) => (await db.query(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) m`)).rows[0].m;
const existe = async (sig) => (await db.query(`SELECT to_regprocedure('${sig}') IS NOT NULL e`)).rows[0].e;

const U = "2189c4d8-0000-4000-8000-000000000001";   // compte 2189c4d8 (forme réelle de a4733d01, 25/10)
const BOUTIQUE = "295151754";
const JETON = "01_0aaa1_EssaiJetonNotreEnvoiA1";
const photo = (jeton, n) => `https://images1.vinted.net/tc/${jeton}/${n}.jpeg?s=essai`;
// Heures relatives à maintenant (le déclencheur lit now() : 30 jours, 3 jours), écarts RÉELS de a4733d01 :
// retrait −4 h, copie vue 14 s après, second essai 15 min après, copie gardée 47 s plus tard.
const RETRAIT = "now() - interval '4 hours'";
const pfBase = (extra = {}) => `jsonb_build_object(
  'vinted_account_id', '${BOUTIQUE}', 'vinted_item_id', '10373678756',
  'suppression_verdict', jsonb_build_object('date_serveur', ${RETRAIT}), 'deleted_at', ${RETRAIT},
  'recreation_envois', jsonb_build_array(${RETRAIT}, ${RETRAIT} + interval '15 minutes'),
  'recreation_tentee', jsonb_build_object('at', ${RETRAIT} + interval '15 minutes', 'n', 2)) || '${JSON.stringify(extra)}'::jsonb`;

async function decor({ statut = "pending", etape = "deleted", extra = {}, deuxieme = false } = {}) {
  await db.query("ALTER TABLE public.inventaire DISABLE TRIGGER USER; DELETE FROM public.cross_post_jobs; DELETE FROM public.inventaire;");
  const { rows: [f] } = await db.query(`INSERT INTO public.inventaire (user_id, titre, origine, vinted_item_id, vinted_account_id, listed_at_guess, photos)
    VALUES ('${U}', 'Doudoune essai T40', 'vinted_sync', $1, '${BOUTIQUE}', now() - interval '60 days', '["${photo("01_0ancien_EssaiAncienneAnnonce", 0)}"]') RETURNING id`,
    [statut === "published" ? "10527026734" : "10373678756"]);
  const pf = statut === "published" ? { ...extra, new_vinted_item_id: "10527026734", old_vinted_item_id: "10373678756" } : extra;
  await db.query(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, published_at, platform_fields)
    VALUES ('${U}', ${f.id}, 'vinted', 'republish', '${statut}', 'Doudoune essai T40', ${statut === "published" ? `${RETRAIT} + interval '16 minutes'` : "null"},
      ${pfBase({ ...pf, republish_step: etape })})`);
  if (deuxieme) {
    const { rows: [g] } = await db.query(`INSERT INTO public.inventaire (user_id, titre, origine, vinted_item_id, vinted_account_id, listed_at_guess)
      VALUES ('${U}', 'Autre article essai', 'vinted_sync', '10373600000', '${BOUTIQUE}', now() - interval '60 days') RETURNING id`);
    await db.query(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, platform_fields)
      VALUES ('${U}', ${g.id}, 'vinted', 'republish', 'pending', 'Autre article essai', ${pfBase({ ...extra, republish_step: "deleted", vinted_item_id: "10373600000" })})`);
  }
  await db.query("ALTER TABLE public.inventaire ENABLE TRIGGER USER;");
  return f.id;
}
// L'import du relevé (comme l'upsert de l'extension : origine vinted_sync).
async function importer({ numero = "10526669221", titre = "Doudoune essai T40", photos = [photo("01_0copie_EssaiPhotoDeLaCopie", 1)], boutique = BOUTIQUE, apres = "14 seconds" } = {}) {
  const r = await db.query(`INSERT INTO public.inventaire (user_id, titre, origine, vinted_item_id, vinted_account_id, listed_at_guess, photos)
    VALUES ('${U}', $1, 'vinted_sync', $2, $3, ${RETRAIT} + interval '${apres}', $4::jsonb) RETURNING id`, [titre, numero, boutique, JSON.stringify(photos)]);
  return r.rowCount; // 0 = l'import n'a pas créé de fiche (rattaché ou copie retirée)
}
const etat = async () => {
  const j = (await db.query(`SELECT status, platform_fields pf, platform_listing_id FROM public.cross_post_jobs WHERE action = 'republish' ORDER BY created_at, id LIMIT 1`)).rows[0];
  const del = (await db.query(`SELECT platform_listing_id, platform_fields pf FROM public.cross_post_jobs WHERE action = 'delete'`)).rows;
  const n = (await db.query(`SELECT count(*)::int n FROM public.inventaire`)).rows[0].n;
  return { j, del, n };
};

console.log("A. AVANT — la prod (20261018170000)");
for (const [sig, m] of Object.entries(MD5_PROD)) ok(await md5(sig) === m, `${sig} : définition installée = prod (md5 ${m.slice(0, 8)}…)`, await md5(sig));
await decor({ statut: "published", etape: "recreated" });
{
  const cree = await importer();
  const e = await etat();
  ok(cree === 0 && e.del.length === 1 && e.del[0].platform_listing_id === "10526669221",
    "a4733d01 (compte 2189c4d8) : la copie de plus au même titre, sans aucune photo de notre envoi, est RETIRÉE (le défaut)", e.del);
}
await decor();
{
  const cree = await importer({ numero: "10527026734", apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 0 && e.j.status === "published", "remise en ligne au même titre, sans preuve : RATTACHÉE (le défaut)", e.j?.status);
}
await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  const cree = await importer({ numero: "10527026734", titre: "Titre réécrit sur Vinted", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 1 && e.j.status === "pending", "copie à NOS photos sous un autre titre : ignorée (fiche neuve de plus, la remise en ligne reste ouverte)", e.j?.status);
}

console.log("B. MIGRATION");
await db.query(MIGRATION);
ok(await md5("public.inventaire_rattache_recreation_vinted()") !== MD5_PROD["public.inventaire_rattache_recreation_vinted()"], "définition changée");
{
  const r = (await db.query("SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'public.inventaire_rattache_recreation_vinted()'::regprocedure")).rows[0];
  ok(r.prosecdef === true && JSON.stringify(r.proconfig) === JSON.stringify(["search_path=public, pg_temp"]), "SECURITY DEFINER et search_path inchangés", r);
  const t = (await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.inventaire'::regclass AND NOT tgisinternal")).rows[0].n;
  ok(t === 1, "aucun déclencheur posé ni retiré (inventaire_a_rattache_recreation_vinted, inchangé)", t);
  const src = (await db.query("SELECT prosrc FROM pg_proc WHERE oid = 'public.inventaire_rattache_recreation_vinted()'::regprocedure")).rows[0].prosrc;
  ok(!/titre_norm|\.titre\s*=|=\s*new\.titre/.test(src), "le corps ne compare plus aucun titre");
  const j = async (v) => (await db.query("SELECT public.recreation_vinted_jetons_photos($1::jsonb) j", [JSON.stringify(v)])).rows[0].j;
  ok(JSON.stringify(await j([photo(JETON, 1), { url: "https://images1.vinted.net/t/01_00c7b_EssaiJetonUpload000/f800/1.jpeg" }, "https://images1.vinted.net/tc/court/1.jpeg", 5, null]))
    === JSON.stringify(["01_00c7b_EssaiJetonUpload000", JETON].sort()), "recreation_vinted_jetons_photos : /t/ et /tc/, chaînes et objets, jetons courts et valeurs illisibles ignorés",
    await j([photo(JETON, 1)]));
  ok(JSON.stringify(await j({ a: 1 })) === "[]" && JSON.stringify(await j(null)) === "[]", "pas une liste : aucun jeton, aucune erreur");
}
await decor({ statut: "published", etape: "recreated" });
{
  const cree = await importer();
  const e = await etat();
  ok(cree === 1 && e.del.length === 0, "a4733d01 rejoué : copie de plus sans preuve → AUCUN retrait, elle entre au stock (le moteur des doublons la juge par ses photos)", e.del);
}
await decor({ statut: "published", etape: "recreated", extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  const cree = await importer({ photos: [photo(JETON, 1), photo("01_0autre_EssaiAutrePhotoXX", 2)] });
  const e = await etat();
  ok(cree === 0 && e.del.length === 1 && e.del[0].platform_listing_id === "10526669221" && e.del[0].pf.arme_par.preuve === "jeton_photo",
    "copie de plus portant une photo de NOTRE envoi : retrait armé, preuve « jeton_photo » tracée", e.del);
  ok((e.j.pf.doublons_retires ?? [])[0]?.preuve === "jeton_photo", "la republication garde la trace du doublon retiré et de sa preuve");
}
await decor();
{
  const cree = await importer({ numero: "10527026734", apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 1 && e.j.status === "pending", "remise en ligne au même titre, sans preuve : plus rattachée — l'import suit son cours, get-pending-jobs juge par les photos", e.j?.status);
}
const fiche = await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  const cree = await importer({ numero: "10527026734", titre: "Titre réécrit sur Vinted", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  const e = await etat();
  const f = (await db.query(`SELECT vinted_item_id FROM public.inventaire WHERE id = ${fiche}`)).rows[0];
  ok(cree === 0 && e.j.status === "published" && e.j.platform_listing_id === "10527026734" && f.vinted_item_id === "10527026734",
    "copie à NOS photos sous un AUTRE titre : rattachée à sa fiche, la remise en ligne close (published), aucune fiche neuve", e.j?.status);
  ok(e.j.pf.rattachement_releve?.preuve === "jeton_photo" && /photo téléversée par notre envoi/.test(e.j.pf.reconciliation), "preuve tracée (jeton_photo)", e.j.pf.rattachement_releve);
}
await decor({ extra: { copie_par_numero: { id: "10527026734", source: "onglet" } } });
{
  const cree = await importer({ numero: "10527026734", titre: "Titre réécrit", apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 0 && e.j.status === "published" && e.j.pf.rattachement_releve?.preuve === "numero_vinted", "le numéro rendu par Vinted à notre envoi : rattachée (preuve numero_vinted)", e.j?.pf?.rattachement_releve);
}
await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } }, deuxieme: true });
{
  const cree = await importer({ numero: "10527026734", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  ok(cree === 1, "deux remises en ligne prouvées pour la même annonce : doute → rien (l'import suit son cours)");
}
await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  const cree = await importer({ numero: "10373600001", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  ok(cree === 1, "un numéro PLUS ANCIEN que l'annonce retirée n'est jamais la copie (même à nos photos)");
  const cree2 = await importer({ numero: "10527026799", photos: [photo(JETON, 1)], boutique: "999", apres: "15 minutes 47 seconds" });
  ok(cree2 === 1, "une autre boutique n'est jamais la copie");
  const cree3 = await importer({ numero: "10527026800", photos: [photo(JETON, 1)], apres: "3 hours" });
  ok(cree3 === 1, "hors de la fenêtre de nos envois (± 20 min) : jamais la copie");
}
await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  await db.query(`ALTER TABLE public.inventaire DISABLE TRIGGER USER; INSERT INTO public.inventaire (user_id, titre, origine, vinted_item_id, vinted_account_id, listed_at_guess)
    VALUES ('${U}', 'x', 'vinted_sync', '10527026734', '${BOUTIQUE}', now()); ALTER TABLE public.inventaire ENABLE TRIGGER USER;`);
  const cree = await importer({ numero: "10527026734", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 1 && e.j.status === "pending", "ligne déjà connue (mise à jour du relevé) : rien à rattacher");
}

console.log("C. INVERSE");
await db.query(INVERSE);
ok(await md5("public.inventaire_rattache_recreation_vinted()") === MD5_PROD["public.inventaire_rattache_recreation_vinted()"], "la définition revient à l'octet (md5 de prod)",
  await md5("public.inventaire_rattache_recreation_vinted()"));
ok(!(await existe("public.recreation_vinted_jetons_photos(jsonb)")), "recreation_vinted_jetons_photos retirée");
await decor();
{
  const cree = await importer({ numero: "10527026734", apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 0 && e.j.status === "published", "comportement d'avant revenu (rattachement au titre)", e.j?.status);
}

console.log("D. MIGRATION rejouée");
await db.query(MIGRATION);
await db.query(MIGRATION);
await decor({ extra: { recreation_photos_envoyees: { ids: [111], jetons: [JETON] } } });
{
  const cree = await importer({ numero: "10527026734", titre: "Titre réécrit sur Vinted", photos: [photo(JETON, 1)], apres: "15 minutes 47 seconds" });
  const e = await etat();
  ok(cree === 0 && e.j.status === "published", "rejouée deux fois : idempotente, la copie à nos photos est rattachée");
}
await decor();
{
  const cree = await importer({ numero: "10527026734", apres: "15 minutes 47 seconds" });
  ok(cree === 1, "rejouée : toujours rien au titre seul");
}

await new Promise((r) => setTimeout(r, 50));
ok(avalees.length === 0, "aucune erreur avalée par le déclencheur pendant le banc (chaque « rien » est une décision, pas une panne)", avalees);

await db.end();
console.log(`\n${verts}/${verts + rouges} contrôles verts`);
if (rouges) process.exit(1);
