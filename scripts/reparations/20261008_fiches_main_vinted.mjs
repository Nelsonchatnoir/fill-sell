// ═══════════════════════════════════════════════════════════════════════════
// FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED — rejeu à blanc, puis
// rattrapage du stock existant (08/10/2026 soir, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le moteur v3 (_shared/rapprochement/fiches-main.js, portée « toutes »)
// tourne ICI, sur la lecture de la prod (rapprochement_v3_lire) et les
// empreintes déjà calculées : rien n'est écrit.
//   · contrôle de non-régression : les décisions des annonces sont identiques,
//     règle allumée ou éteinte (le sous-graphe des fiches n'y touche pas) ;
//   · la garde de la base (rapprochement_v3_fiches_fusionnables, migration
//     20261008150000) est évaluée dans une transaction ANNULÉE (la fonction
//     est créée puis retirée avec elle) ;
//   · rapport : build/fiches-main/rejeu.json (+ exemples à l'écran).
//
//   node scripts/reparations/20261008_fiches_main_vinted.mjs                 (rejeu du parc)
//   node scripts/reparations/20261008_fiches_main_vinted.mjs --user <uuid>   (un compte)
//   node scripts/reparations/20261008_fiches_main_vinted.mjs --appliquer [--user <uuid>]
//        ⛔ seulement après le feu vert de Nico sur 20261008150000 ET un rejeu à
//        zéro fusion à tort : sauvegarde (_backup_0810_fiches_main_*), puis
//        rapprochement_v3_appliquer avec les SEULES décisions de la règle
//        (fusionner_fiche, fiche_a_verifier) ; inverse :
//        scripts/reparations/20261008_fiches_main_vinted_INVERSE.sql.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { passe, urlsDe } from '../../supabase/functions/_shared/rapprochement/passe.js';

const execP = promisify(exec);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(RACINE, 'supabase', 'migrations', '20261008150000_fiche_a_la_main_face_a_vinted.sql');
const SORTIE = path.join(RACINE, 'build', 'fiches-main');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const USER = val('--user');
const APPLIQUER = args.includes('--appliquer');
const TYPES = new Set(['fusionner_fiche', 'fiche_a_verifier']);
const esc = (s) => String(s).replace(/'/g, "''");

async function q(sql) {
  const f = path.join(os.tmpdir(), `fm-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const { stdout } = await execP(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 30 });
    const i = stdout.indexOf('{'); return i >= 0 ? JSON.parse(stdout.slice(i)).rows : [];
  } catch (e) { const t = String(e.stdout || '') + String(e.stderr || e.message); const i = t.indexOf('ERROR'); throw new Error(i >= 0 ? t.slice(i, i + 1500) : t.slice(0, 2000)); }
  finally { fs.rmSync(f, { force: true }); }
}

// Les comptes qui ont à la fois une fiche à la main et une fiche Vinted en stock.
const MAIN = String.raw`i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%'`;
async function comptes() {
  if (USER) return [USER];
  const rows = await q(`SELECT i.user_id FROM inventaire i
    WHERE i.fusionne_dans IS NULL AND i.statut = 'stock' AND ${MAIN}
      AND EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = i.user_id AND v.fusionne_dans IS NULL AND v.statut = 'stock'
                    AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync'))
    GROUP BY i.user_id ORDER BY count(*) DESC;`);
  return rows.map((r) => r.user_id);
}

async function lireCompte(user) {
  const donnees = (await q(`SELECT public.rapprochement_v3_lire('${user}'::uuid) d;`))[0].d;
  const urls = urlsDe(donnees);
  const emp = new Map(); const illisibles = new Set();
  for (let i = 0; i < urls.length; i += 400) {
    const lot = urls.slice(i, i + 400);
    const r = (await q(`SELECT public.rapprochement_v3_empreintes((SELECT array_agg(x) FROM jsonb_array_elements_text('${esc(JSON.stringify(lot))}'::jsonb) x)) r;`))[0].r;
    for (const e of r.empreintes ?? []) if (e.variantes) emp.set(e.url, e);
    for (const u of r.illisibles ?? []) illisibles.add(u);
  }
  return { donnees, emp, urls, manquantes: urls.filter((u) => !emp.has(u) && !illisibles.has(u)) };
}

// La garde de la base, évaluée dans une transaction annulée.
async function gardes(user, paires) {
  if (!paires.length) return new Map();
  const m = fs.readFileSync(MIGRATION, 'utf8').split('\r\n').join('\n');
  const debut = m.indexOf('CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiches_fusionnables(');
  const fin = m.indexOf('\n$function$;', debut) + '\n$function$;'.length;
  const fn = m.slice(debut, fin);
  const valeurs = paires.map(([h, v]) => `(${Number(h)}::bigint, ${Number(v)}::bigint)`).join(',');
  const rows = await q(`BEGIN;
${fn}
CREATE TEMP TABLE _g ON COMMIT DROP AS
  SELECT p.h, p.v, public.rapprochement_v3_fiches_fusionnables('${user}'::uuid, p.h, p.v) raison FROM (VALUES ${valeurs}) p(h, v);
SELECT h::text, v::text, raison FROM _g;
ROLLBACK;`);
  return new Map(rows.map((r) => [`${r.h}|${r.v}`, r.raison]));
}

const sansMain = (ds) => ds.filter((d) => !TYPES.has(d.type));
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function rejouer(user) {
  const t0 = Date.now();
  const { donnees, emp, urls, manquantes } = await lireCompte(user);
  const avec = passe(donnees, emp, { mode: 'normal', fichesMain: 'toutes' });
  const sans = passe(donnees, emp, { mode: 'normal', fichesMain: 'nouvelles' });
  const regression = !memes(sansMain(avec.decisions), sans.decisions);
  const main = avec.decisions.filter((d) => TYPES.has(d.type));
  const F = new Map((donnees.fiches ?? []).map((f) => [String(f.id), f]));
  const g = await gardes(user, main.map((d) => [d.garde, d.absorbe]));
  const resume = (f) => f && { id: f.id, titre: f.titre, prix: f.prix, taille: f.taille, marque: f.marque, statut: f.statut, origine: f.origine,
    vinted_item_id: f.vinted_item_id, created_at: f.created_at, quantite: f.quantite, photo: (f.photos ?? [])[0] ?? null, n_photos: (f.photos ?? []).length };
  const cas = main.map((d) => ({
    type: d.type, motif: d.motif, preuves: d.preuve ?? d.preuves, garde_base: g.get(`${d.garde}|${d.absorbe}`) ?? null,
    main: resume(F.get(String(d.garde))), vinted: resume(F.get(String(d.absorbe))),
  }));
  return { user, ms: Date.now() - t0, fiches: donnees.fiches.length, photos: urls.length, sans_empreinte: manquantes.length,
    regression, bilan: avec.bilan.fiches_main ?? null, cas, decisions: main };
}

async function parLots(liste, n, f) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < liste.length) { const k = i++; try { out[k] = await f(liste[k]); } catch (e) { out[k] = { user: liste[k], erreur: String(e.message ?? e).slice(0, 400) }; } } }));
  return out;
}

const users = await comptes();
console.log(`${users.length} compte(s) avec des fiches à la main et des fiches Vinted en stock`);

// --empreintes : les photos de leurs fiches jamais empreintées (ces comptes
// n'avaient jamais eu de passe : aucune autre plateforme). Le même chemin que la
// passe (rapprochement_v3_empreinter → pg_net → empreintes-urls), borné :
// 600 photos toutes les 20 s, arrêt si le CPU de la base dépasse 50 %.
if (args.includes('--empreintes')) {
  const liste = users.map((u) => `'${u}'`).join(',');
  const manquantes = async () => (await q(`SELECT DISTINCT z.url FROM (
      SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END url
        FROM inventaire i, jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
       WHERE i.user_id IN (${liste}) AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
         AND COALESCE(i.origine, '') NOT LIKE 'releve\\_%' AND o <= 6) z
     WHERE z.url ~ '^https://' AND NOT EXISTS (SELECT 1 FROM photo_empreintes p WHERE p.url = z.url AND p.variantes IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM photo_empreintes_echecs x WHERE x.url = z.url)
     ORDER BY 1;`)).map((r) => r.url);
  const cpu = async () => Number((await q(`SELECT pct FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;`))[0]?.pct);
  let reste = await manquantes(); let avant = Infinity; let sansProgres = 0;
  const mesures = [];
  while (reste.length && sansProgres < 4) {
    const c = await cpu(); mesures.push({ le: new Date().toISOString(), cpu: c, reste: reste.length });
    console.log(`${new Date().toISOString().slice(11, 19)} reste ${reste.length} · CPU ${c} %`);
    if (c > 50) { console.log('CPU > 50 % : pause 2 min'); await new Promise((r) => setTimeout(r, 120_000)); continue; }
    const lot = reste.slice(0, 600);
    await q(`SELECT public.rapprochement_v3_empreinter((SELECT array_agg(x) FROM jsonb_array_elements_text('${esc(JSON.stringify(lot))}'::jsonb) x)) r;`);
    await new Promise((r) => setTimeout(r, 20_000));
    reste = await manquantes();
    sansProgres = reste.length >= avant ? sansProgres + 1 : 0; avant = reste.length;
  }
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'empreintes-cpu.json'), JSON.stringify(mesures, null, 1));
  console.log(`fin : ${reste.length} sans empreinte (illisibles ou en échec)`);
  process.exit(0);
}
const emails = new Map((await q(`SELECT id::text, email FROM profiles WHERE id IN (${users.map((u) => `'${u}'`).join(',') || 'NULL'});`)).map((r) => [r.id, r.email]));
const res = await parLots(users, 3, async (u) => { const r = await rejouer(u); process.stdout.write('.'); return r; });
console.log();
fs.mkdirSync(SORTIE, { recursive: true });
for (const r of res) r.email = emails.get(r.user) ?? null;
fs.writeFileSync(path.join(SORTIE, APPLIQUER ? 'avant-application.json' : 'rejeu.json'), JSON.stringify({ le: new Date().toISOString(), comptes: res }, null, 1));

const tous = res.flatMap((r) => (r.cas ?? []).map((c) => ({ ...c, email: r.email, user: r.user })));
const fus = tous.filter((c) => c.type === 'fusionner_fiche');
const fusOk = fus.filter((c) => c.garde_base == null);
const ques = tous.filter((c) => c.type === 'fiche_a_verifier' || (c.type === 'fusionner_fiche' && c.garde_base != null));
const rien = tous.filter((c) => ['introuvable', 'paire_tranchee', 'main_pas_a_la_main', 'vinted_sans_annonce', 'main_pas_en_stock', 'vinted_pas_en_stock', 'vinted_disparue'].includes(c.garde_base));
const parRaison = {};
for (const c of fus) { const k = c.garde_base ?? 'fusion'; parRaison[k] = (parRaison[k] || 0) + 1; }
const parMotif = {};
for (const c of tous.filter((x) => x.type === 'fiche_a_verifier')) parMotif[c.motif] = (parMotif[c.motif] || 0) + 1;
console.log(JSON.stringify({
  comptes: res.length, erreurs: res.filter((r) => r.erreur).map((r) => [r.email ?? r.user, r.erreur]),
  regressions: res.filter((r) => r.regression).map((r) => r.email ?? r.user),
  sans_empreinte: res.reduce((s, r) => s + (r.sans_empreinte ?? 0), 0),
  fusions_moteur: fus.length, fusions_que_la_base_ferait: fusOk.length, fusions_tournees_en_question: parRaison,
  questions: ques.length - rien.length, questions_par_motif: parMotif, rien_par_la_base: rien.length,
  comptes_touches: new Set(tous.map((c) => c.user)).size,
  ms_max: Math.max(...res.map((r) => r.ms ?? 0)),
}, null, 1));

if (APPLIQUER) {
  // ⛔ Seulement la migration posée (feu vert nommé de Nico) : sans elle, la base
  // ne connaît pas ces décisions (type_inconnu) et n'a pas ses gardes.
  const [m] = await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'rapprochement_v3_fiches_fusionnables';`);
  if (!Number(m?.n)) { console.error('ARRÊT : migration 20261008150000 absente de la prod (feu vert de Nico attendu).'); process.exit(2); }
  const sauvegarde = fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261008_fiches_main_vinted_sauvegarde.sql'), 'utf8');
  const total = { faits: {}, sautes: {}, erreurs: [] };
  for (const r of res) {
    const ds = (r.decisions ?? []).filter((d) => TYPES.has(d.type));
    if (!ds.length || r.erreur || r.regression) continue;
    await q(sauvegarde.replace(/__USER__/g, r.user));
    for (let i = 0; i < ds.length; i += 150) {
      const x = (await q(`SELECT public.rapprochement_v3_appliquer('${r.user}'::uuid, '${esc(JSON.stringify(ds.slice(i, i + 150)))}'::jsonb, 'normal', false) r;`))[0]?.r ?? {};
      if (x.reason === 'occupe') { total.erreurs.push({ user: r.user, erreur: 'occupe' }); break; }
      for (const [k, v] of Object.entries(x.faits ?? {})) total.faits[k] = (total.faits[k] ?? 0) + v;
      for (const [k, v] of Object.entries(x.sautes ?? {})) total.sautes[k] = (total.sautes[k] ?? 0) + v;
      total.erreurs.push(...(x.erreurs ?? []).map((e) => ({ user: r.user, ...e })));
    }
    console.log(`${r.email ?? r.user} : ${ds.length} décision(s) écrites`);
  }
  fs.writeFileSync(path.join(SORTIE, 'application.json'), JSON.stringify({ le: new Date().toISOString(), ...total }, null, 1));
  console.log(JSON.stringify(total, null, 1));
}
