// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107193200_republication_partie_declaration_constat (07/11 soir,
// rouges famille 1 — ayoubd72 90d11dae, Leboncoin 3296483096) : republication_annonce_partie lit aussi la déclaration
// « je l'ai retirée moi-même » et le constat de deux relevés probants (absence_releves), sauf annonce revue depuis.
//   1. départ = les définitions de PROD du 07/11 soir (l'inverse + scripts/preuve-republication-partie-declaration-constat.prod.sql),
//      md5 identiques à ceux lus en prod ;
//   2. la garde refuse une prod qui a changé, et un libellé de déclaration qui aurait changé ; la migration passe deux fois ;
//   3. chaque ligne de prod est gardée, dans l'ordre, AUCUNE n'est changée (trois insertions) ; STABLE, SECURITY INVOKER,
//      droits identiques ;
//   4. la déclaration est posée par le GESTE de l'app (UPDATE status/error comme dismissUnavailable, le vrai déclencheur
//      cross_post_jobs_declaration_retiree_ferme_retraits passe) ; le constat a la forme exacte de constater_absences_releve ;
//      cas par cas : 84bd972d (constat non démenti) → « annonce_partie » ; déclaration (deux libellés, lien seul) →
//      « annonce_partie » ; revue depuis (constat ou déclaration), autre numéro, autre plateforme, autre compte, constat
//      d'une autre fiche, constat incomplet, autre texte d'annulation, doute seul (sale_signal 'unavailable') → NULL ;
//      vente prouvée + déclaration → « annonce_vendue » (rang gardé) ; verdict du juge → inchangé ;
//   5. ZÉRO RÉGRESSION : 400 cas tirés (graine fixe) parmi les marques d'AVANT (verdicts du juge, ventes, signaux,
//      relevés, numéros, plateformes, comptes, fiches) sans les deux constats nouveaux : prod et nouvelle rendent la même
//      chose, cas par cas ; puis les mêmes 400 avec un constat nouveau ajouté : seul NULL devient « annonce_partie » ;
//   6. l'inverse rend la définition de prod (md5).
//
//   PREUVE_PG=embarque node scripts/preuve-republication-partie-declaration-constat.mjs   (Postgres jetable, port libre ≥ 55500)
//
// Jamais la prod. Aucun bouchon : constater_absences_releve est posée telle qu'en prod sans validation de son corps (la
// garde lit son md5 ; elle n'est jamais exécutée ici — son constat est posé avec la même forme : premier, second,
// listing_id, le).
import pg from 'pg';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MD5_PROD = {
  republication_annonce_partie: '1d076c65d9b0a9383f85d730e81d230c',
  constater_absences_releve: 'd36984b5c0fc70a5251059b5703f0404',
  retraits_clos_par_declaration_retiree: '9d2f717a6a67d61e73cbb325cb9741d7',
  retrait_meme_annonce: '8d2c103b78455e8fd87b7bc122502a38',
  listing_designe: '20dfe9e911566f45bbcb469530a65c61',
  _ts_ou_null: '1730a1261d395edf9efe7e9dbf87f069',
};

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const portLibre = async (depuis) => {
  for (let p = depuis; p < depuis + 40; p++) {
    const libre = await new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
    if (libre) return p;
  }
  throw new Error('aucun port libre');
};
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const port = await portLibre(55500);
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-partie-constat-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = `postgres://postgres:preuve@127.0.0.1:${port}/postgres`;
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261107193200_republication_partie_declaration_constat.sql');
const INVERSE = lire('../supabase/rollbacks/20261107193200_republication_partie_declaration_constat_INVERSE.sql');
const PROD = lire('./preuve-republication-partie-declaration-constat.prod.sql');
// Le libellé de l'app (src/App.jsx, MSG_REPONSE_RETIREE), lu dans le dépôt : la déclaration est posée avec CE texte.
const APP = lire('../src/App.jsx');
const MSG_APP = /const MSG_REPONSE_RETIREE =\s*\n?\s*"([^"]+)"/.exec(APP)?.[1];

const BANC = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text, platform_listing_id text, listing_url text, platform_fields jsonb, published_at timestamptz,
  created_at timestamptz DEFAULT now(), last_checked_at timestamptz, vu_en_ligne_le timestamptz, error text);
CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  inventaire_id bigint, statut_plateforme text, disparu_le timestamptz, vu_le timestamptz, transaction_plateforme text);
CREATE TABLE inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, preuves jsonb);
-- (la table que déclare constater_absences_releve : posée pour sa déclaration %ROWTYPE, jamais lue ici)
CREATE TABLE vinted_sync_runs (id uuid PRIMARY KEY, user_id uuid, platform text, kind text, status text, started_at timestamptz,
  finished_at timestamptz, vinted_user_id text, items_vus integer, total_entries integer, erreur text);
`;

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const NOMS = Object.keys(MD5_PROD);
const defs = async () => Object.fromEntries((await q(`SELECT p.proname, pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1)`, [NOMS])).map((r) => [r.proname, r.d]));
const ins = async (table, o) => {
  const k = Object.keys(o);
  return (await q(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(o)))[0];
};
const jours = (n) => new Date(Date.now() + n * 86400_000).toISOString();
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const DECL = MSG_APP, DECL_ANCIEN = "Annonce retirée par le vendeur (confirmé dans l'app)";
const URL_LBC = (n) => `https://www.leboncoin.fr/ad/mobilier_enfant/${n}`;
const juge = async (fn, u, fiche, pf, n) => (await q(`SELECT public.${fn}($1::uuid, $2::bigint, $3, $4) r`, [u, fiche, pf, n]))[0].r;
const deux = async (u, fiche, pf, n) => ({ prod: await juge('republication_annonce_partie_prod', u, fiche, pf, n), neuve: await juge('republication_annonce_partie', u, fiche, pf, n) });

// Le dépôt source (publié, lien exact) ; le constat de deux relevés probants (forme de constater_absences_releve) ;
// la déclaration posée par le GESTE de l'app.
async function source({ u = U, fiche, pf = 'leboncoin', n, extra = {} }) {
  return ins('cross_post_jobs', { user_id: u, inventaire_id: fiche, platform: pf, status: 'published', action: 'publish', platform_listing_id: n,
    listing_url: pf === 'leboncoin' ? URL_LBC(n) : null, platform_fields: JSON.stringify(extra), published_at: jours(-20), created_at: jours(-20), last_checked_at: jours(-9) });
}
const constat = (n, le = jours(-8), o = {}) => ({ absence_releves: { premier: 'c2e027f5-77ad-4143-aa51-60f903127da8', second: 'ff2ebb52-69ad-4c7b-899e-ced846e88195', listing_id: n, le, ...o } });
async function declarer({ u = U, fiche = null, pf = 'leboncoin', n, texte = DECL, lienSeul = false, lu = jours(-10) }) {
  const j = await ins('cross_post_jobs', { user_id: u, inventaire_id: fiche, platform: pf, status: 'published', action: 'publish',
    platform_listing_id: lienSeul ? null : n, listing_url: pf === 'leboncoin' ? URL_LBC(n) : null,
    platform_fields: JSON.stringify({ sale_signal: 'unavailable', unavailable_since: jours(-11) }), published_at: jours(-30), created_at: jours(-30), last_checked_at: lu });
  // dismissUnavailable (src/App.jsx) : status « cancelled », le texte, unavailable_since retiré — le déclencheur passe.
  await q(`UPDATE cross_post_jobs SET status = 'cancelled', error = $2, platform_fields = platform_fields - 'unavailable_since' WHERE id = $1`, [j.id, texte]);
  return j;
}
const releve = async ({ u = U, pf = 'leboncoin', n, fiche = null, vu, disparu = null, tx = null, statut = 'en_ligne' }) =>
  ins('annonces_plateforme', { user_id: u, platform: pf, listing_id: n, inventaire_id: fiche, statut_plateforme: statut, vu_le: vu, disparu_le: disparu, transaction_plateforme: tx });

try {
  await client.query(BANC);
  await client.query(PROD);
  console.log('1. Départ = les définitions de PROD du 07/11 soir');
  await client.query(INVERSE);
  const avant = await defs();
  const ecarts = NOMS.filter((n) => md5(avant[n] ?? '') !== MD5_PROD[n]);
  verifier(ecarts.length === 0, `md5 identiques à la prod (${NOMS.length} fonctions${ecarts.length ? ' — écarts : ' + ecarts.join(', ') : ''})`);
  verifier(MSG_APP === "Réponse dans l'app : « je l'ai retirée moi-même » — pas une vente", `le libellé de l'app (src/App.jsx MSG_REPONSE_RETIREE) est celui que lit la règle : « ${MSG_APP} »`);

  console.log('2. La garde, puis la migration');
  await client.query(avant.republication_annonce_partie.replace('  WITH lid AS', '  -- retouche faite en prod\n  WITH lid AS'));
  let refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/a changé en prod depuis le 07\/11 soir/.test(refus ?? ''), 'une prod qui a changé depuis la lecture : la migration refuse, rien n\'est appliqué');
  await client.query(avant.republication_annonce_partie);
  await client.query(`DROP TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits ON cross_post_jobs;
    CREATE TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits AFTER UPDATE OF status, error ON public.cross_post_jobs FOR EACH ROW
    WHEN (new.status = 'cancelled' AND new.error = 'Retirée (nouveau libellé)') EXECUTE FUNCTION retraits_clos_par_declaration_retiree()`);
  refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/libellé de la déclaration/.test(refus ?? ''), 'un libellé de déclaration qui a changé (déclencheur) : la migration refuse');
  await client.query(`DROP TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits ON cross_post_jobs`);
  await client.query(PROD.slice(PROD.indexOf('CREATE TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits')));
  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable
  verifier(true, 'la migration s\'applique, deux fois de suite');
  const apres = await defs();
  const lp = avant.republication_annonce_partie.split('\n'), ln = apres.republication_annonce_partie.split('\n');
  let k = 0; const manquantes = [];
  for (const l of lp) { const at = ln.indexOf(l, k); if (at < 0) manquantes.push(l.trim()); else k = at + 1; }
  verifier(manquantes.length === 0 && ln.length > lp.length, `chaque ligne de prod est gardée, dans l'ordre, aucune changée (${ln.length - lp.length} lignes insérées)`);
  const [meta] = await q(`SELECT provolatile, prosecdef, proacl::text acl FROM pg_proc WHERE proname = 'republication_annonce_partie'`);
  verifier(meta.provolatile === 's' && meta.prosecdef === false && meta.acl === '{postgres=X/postgres,service_role=X/postgres}',
    `STABLE, SECURITY INVOKER, droits de prod (${meta.acl})`);
  verifier(NOMS.filter((n) => n !== 'republication_annonce_partie').every((n) => md5(apres[n]) === MD5_PROD[n]), 'les auteurs lus et les aides : md5 de prod inchangés');
  await client.query(avant.republication_annonce_partie.replace('FUNCTION public.republication_annonce_partie(', 'FUNCTION public.republication_annonce_partie_prod('));

  console.log('3. Cas par cas (prod → nouvelle)');
  const cas = [];
  const noter = async (nom, u, fiche, pf, n, attendu, attenduProd = null) => {
    const r = await deux(u, fiche, pf, n);
    cas.push({ nom, ...r });
    verifier(r.neuve === attendu && r.prod === attenduProd, `${nom} : ${r.prod ?? 'NULL'} → ${r.neuve ?? 'NULL'}`);
  };
  // A — 84bd972d : la source porte le constat (30/10), l'annonce relevée disparue, jamais revue depuis.
  await source({ fiche: 1, n: '3296483096', extra: { source: 'releve', sale_signal: 'unavailable', ...constat('3296483096', jours(-8)) } });
  await releve({ n: '3296483096', fiche: 1, vu: jours(-10), disparu: jours(-8) });
  await noter('84bd972d : constat de deux relevés probants, jamais revue', U, 1, 'leboncoin', '3296483096', 'annonce_partie');
  // B — constat démenti : un relevé l'a revue après le constat.
  await source({ fiche: 2, n: '3300000002', extra: constat('3300000002', jours(-8)) });
  await releve({ n: '3300000002', fiche: 2, vu: jours(-1) });
  await noter('constat démenti (revue depuis)', U, 2, 'leboncoin', '3300000002', null);
  // C — constat d'un autre numéro (la republication d'avant), même fiche.
  await source({ fiche: 3, n: '3300000003', extra: constat('3299999999', jours(-8)) });
  await noter('constat d\'un AUTRE numéro', U, 3, 'leboncoin', '3300000003', null);
  // D — constat porté par un dépôt d'une autre fiche (même numéro) : hors de la lecture par fiche.
  await source({ fiche: 4, n: '3300000004' });
  await source({ fiche: 40, n: '3300000004', extra: constat('3300000004', jours(-8)) });
  await noter('constat sur une AUTRE fiche (lecture par la fiche seulement)', U, 4, 'leboncoin', '3300000004', null);
  // E — constat incomplet (un seul relevé).
  await source({ fiche: 5, n: '3300000005', extra: constat('3300000005', jours(-8), { second: '' }) });
  await noter('constat incomplet (un seul relevé)', U, 5, 'leboncoin', '3300000005', null);
  // F — déclaration (geste de l'app) sur un job SANS fiche, même numéro ; dernière vue avant.
  await source({ fiche: 6, n: '3300000006' });
  await declarer({ n: '3300000006', lu: jours(-10) });
  await releve({ n: '3300000006', fiche: 6, vu: jours(-15) });
  await noter('déclaration « je l\'ai retirée moi-même » (job sans fiche), jamais revue', U, 6, 'leboncoin', '3300000006', 'annonce_partie');
  // G — déclaration, puis un relevé l'a revue.
  await source({ fiche: 7, n: '3300000007' });
  await declarer({ n: '3300000007', lu: jours(-10) });
  await releve({ n: '3300000007', fiche: 7, vu: jours(-2) });
  await noter('déclaration démentie (revue depuis)', U, 7, 'leboncoin', '3300000007', null);
  // H — l'ancien libellé ; I — le lien seul (sans numéro).
  await source({ fiche: 8, n: '3300000008' });
  await declarer({ n: '3300000008', texte: DECL_ANCIEN });
  await noter('déclaration, ancien libellé', U, 8, 'leboncoin', '3300000008', 'annonce_partie');
  await source({ fiche: 9, n: '3300000009' });
  await declarer({ n: '3300000009', lienSeul: true });
  await noter('déclaration, lien seul (numéro lu dans le lien)', U, 9, 'leboncoin', '3300000009', 'annonce_partie');
  // J — autre texte d'annulation ; K — autre plateforme ; L — autre compte.
  await source({ fiche: 10, n: '3300000010' });
  await declarer({ n: '3300000010', texte: 'Annulée à ta demande — ton annonce est restée en ligne.' });
  await noter('annulation à la demande (autre texte)', U, 10, 'leboncoin', '3300000010', null);
  await source({ fiche: 11, n: '34000011', pf: 'beebs' });
  await declarer({ n: '34000011', pf: 'depop' });
  await noter('déclaration sur une AUTRE plateforme, même numéro', U, 11, 'beebs', '34000011', null);
  await source({ fiche: 12, n: '3300000012' });
  await declarer({ u: V, n: '3300000012' });
  await noter('déclaration d\'un AUTRE compte', U, 12, 'leboncoin', '3300000012', null);
  // M — un doute seul (sale_signal 'unavailable', sans constat) : jamais.
  await source({ fiche: 13, n: '3300000013', extra: { sale_signal: 'unavailable', unavailable_since: jours(-3) } });
  await noter('doute seul (sale_signal unavailable)', U, 13, 'leboncoin', '3300000013', null);
  // N — vente prouvée + déclaration : « annonce_vendue » d'abord (rang gardé).
  await source({ fiche: 14, n: '3300000014' });
  await declarer({ n: '3300000014' });
  await releve({ n: '3300000014', fiche: 14, vu: jours(-12), tx: 'sold' });
  await noter('vente prouvée + déclaration', U, 14, 'leboncoin', '3300000014', 'annonce_vendue', 'annonce_vendue');
  // O — verdict du juge (handler-watch) : inchangé ; P — numéro absent.
  await source({ fiche: 15, n: '3300000015', extra: { annonce_disparue: { at: jours(-5), pose_par: 'handler-watch (annonce publiée confirmée disparue)', motif: 'absente' } } });
  await noter('verdict du juge (handler-watch)', U, 15, 'leboncoin', '3300000015', 'annonce_partie', 'annonce_partie');
  await noter('numéro absent', U, 15, 'leboncoin', null, null);
  verifier(cas.filter((c) => c.prod !== c.neuve).length === 4, `seuls changent : ${cas.filter((c) => c.prod !== c.neuve).map((c) => c.nom.split(' :')[0].split(' (')[0]).join(' · ')}`);

  console.log('4. Zéro régression : 400 cas tirés parmi les marques d\'avant (graine fixe)');
  let graine = 20261107;
  const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const choix = (t) => t[Math.floor(alea() * t.length)];
  const tires = [];
  for (let i = 0; i < 400; i++) {
    const fiche = 1000 + i, pf = choix(['leboncoin', 'beebs', 'depop', 'opla']), n = String(3400000000 + i), u = choix([U, U, U, V]);
    const extra = {};
    const r = alea();
    if (r < 0.15) extra.annonce_disparue = { at: jours(-choix([1, 5, 9])), pose_par: choix(['handler-watch (introuvable confirmé par un relevé)', 'handler-watch (annonce publiée confirmée disparue)', 'sonde publique']), motif: choix(['absente', 'vendue', '« hidden »', '']) };
    else if (r < 0.25) extra.annonce_disparue = { le: jours(-choix([2, 6])), par: choix(['deux_releves_probants', 'deux_releves_complets_par_boutique', 'autre']) };
    if (alea() < 0.3) Object.assign(extra, { sale_signal: choix(['sold', 'unavailable']) });
    const jobStatut = choix(['published', 'published', 'cancelled', 'sold', 'failed']);
    await ins('cross_post_jobs', { user_id: u, inventaire_id: fiche, platform: pf, status: jobStatut, action: 'publish', platform_listing_id: choix([n, n, n, null]),
      listing_url: pf === 'leboncoin' ? URL_LBC(n) : null, platform_fields: JSON.stringify(extra), published_at: jours(-20), created_at: jours(-20), last_checked_at: jours(-9),
      error: jobStatut === 'cancelled' ? choix(['Annulée à ta demande — ton annonce est restée en ligne.', 'Annonce remplacée par sa republication', null]) : null });
    if (alea() < 0.6) await releve({ u, pf, n, fiche, vu: jours(-choix([0.5, 3, 7, 12])), disparu: alea() < 0.3 ? jours(-4) : null, tx: alea() < 0.1 ? 'sold' : null });
    tires.push({ u: U, uJob: u, fiche, pf, n });
  }
  let diff = 0; const repart = {};
  for (const t of tires) {
    const r = await deux(t.u, t.fiche, t.pf, t.n);
    if (r.prod !== r.neuve) diff++;
    repart[r.prod ?? 'NULL'] = (repart[r.prod ?? 'NULL'] ?? 0) + 1;
  }
  verifier(diff === 0, `sans constat nouveau, prod et nouvelle rendent la MÊME chose sur les 400 cas (prod : ${JSON.stringify(repart)})`);
  // Les mêmes 400, un constat nouveau ajouté sur le dépôt de la fiche (non démenti si aucun relevé ne l'a revue depuis).
  for (const t of tires) await q(`UPDATE cross_post_jobs SET platform_fields = platform_fields || $2::jsonb WHERE inventaire_id = $1`,
    [t.fiche, JSON.stringify(constat(t.n, jours(-6)))]);
  let seulNull = true, passes = 0, revues = 0;
  for (const t of tires) {
    const r = await deux(t.u, t.fiche, t.pf, t.n);
    const [{ vu }] = await q(`SELECT max(vu_le) vu FROM annonces_plateforme WHERE user_id = $1 AND platform = $2 AND listing_id = $3`, [t.u, t.pf, t.n]);
    const dementi = vu && new Date(vu) >= new Date(Date.now() - 6 * 86400_000 - 60_000);
    const sien = t.uJob === t.u;   // un constat sur le dépôt d'un AUTRE compte ne compte jamais
    if (r.prod !== r.neuve) { passes++; if (!sien || r.prod !== null || r.neuve !== 'annonce_partie' || dementi) seulNull = false; }
    else if (sien && r.prod === null && !dementi) seulNull = false;
    if (r.prod === null && dementi) revues++;
  }
  verifier(seulNull, `avec un constat ajouté : seuls des NULL deviennent « annonce_partie » (${passes}), jamais une annonce revue depuis (${revues} restent NULL), jamais un autre verdict changé`);

  console.log('5. L\'inverse');
  await client.query(INVERSE);
  const rendu = await defs();
  verifier(md5(rendu.republication_annonce_partie) === MD5_PROD.republication_annonce_partie, 'la définition de prod revient à l\'identique (md5)');
  const [meta2] = await q(`SELECT proacl::text acl FROM pg_proc WHERE proname = 'republication_annonce_partie'`);
  verifier(meta2.acl === '{postgres=X/postgres,service_role=X/postgres}', 'droits de prod rendus');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
