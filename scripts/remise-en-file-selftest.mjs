// VERROU « REMETTRE EN FILE = REMETTRE À ZÉRO TOUS LES COMPTEURS D'ESSAIS » (11/11/2026 soir)
// Cas : compte 64eab2f9, republications Vinted retirées le 10/11 ; remises en file le 11/11 à 12:50:49 (correctif
// d'extension, get-pending-jobs) puis 18:57:10 (à la main) avec recreation_tentee {n: 3} gardé → handler-watch les
// ressortait de la file dans la minute (essaisRates = 2). La RPC du bouton « Republier maintenant » (relancer_republish)
// ne remettait aucun compteur à zéro.
//   A. get-pending-jobs (réarmement d'un correctif d'extension) : l'ancienne écriture reproduit le défaut ; la nouvelle
//      (champsReamorcageCorrectif) rend un budget entier, garde les traces anti-doublon ;
//   B. handler-watch (cause levée, champsRelanceCauseLevee) : même règle, recreation_retries compris, garde du dressing gardée ;
//   C. tirages : toute tâche remise en file par remettreEnFile n'est jamais ressortie avant un nouvel essai, aucune trace perdue ;
//   D. lecture du code : chaque chemin serveur passe par la remise en file ; essaisRates ne lit que des compteurs remis à zéro ;
//      la liste SQL = la liste JS ;
//   E. sur un Postgres JETABLE (embedded-postgres, jamais la prod) : relancer_republish de PROD reproduit le défaut ; la
//      migration le corrige (jouée deux fois) ; la jumelle SQL rend exactement ce que rend remettreEnFile ; l'inverse rend
//      la définition de prod à l'octet, droits compris.
// Valeurs d'essai inventées (aucun titre, nom ni pseudo de client) ; identifiants de compte et de tâches : id8 seulement.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = 'supabase/migrations/20261111210000_remise_en_file_compteurs.sql';
const INVERSE = 'supabase/rollbacks/20261111210000_remise_en_file_compteurs_INVERSE.sql';

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`);
};
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const egal = (a, b) => canon(a) === canon(b);
const iso = (t) => new Date(t).toISOString();

let RF = null;
try { RF = await imp('supabase/functions/_shared/remise-en-file.js'); } catch (e) { ok(false, 'supabase/functions/_shared/remise-en-file.js : la remise en file existe', e.message); }
const RB = await imp('supabase/functions/_shared/recreation-bloquee.js');
const CE = await imp('supabase/functions/_shared/correctifs-extension.js');
const COMPTEURS = RF?.COMPTEURS_D_ESSAIS ?? ['recreation_retries', 'recreation_reprises', 'recreation_reprise', 'recreation_bloquee'];
const TRACES = RF?.TRACES_GARDEES ?? ['recreation_envois', 'recreation_depot_parti', 'deleted_at'];

// ── Le décor : une republication Vinted retirée la veille, trois tentatives de recréation refusées ─────────────────────
const M = Date.parse('2026-11-11T11:50:49Z');            // 12:50:49 à Paris
const ENVOIS = ['2026-11-10T19:23:43.000Z', '2026-11-10T19:24:30.000Z', '2026-11-10T19:30:28.000Z', '2026-11-10T19:42:28.029Z'];
const pfBase = () => ({
  republish_step: 'deleted', deleted_at: '2026-11-10T19:23:43.000Z', deleted_at_serveur: '2026-11-10T19:23:43.000Z',
  recreation_tentee: { at: '2026-11-10T19:42:28.029Z', n: 3 }, recreation_envois: [...ENVOIS],
  recreation_depot_parti: { at: '2026-11-10T19:42:30.000Z', raison: 'valeur d’essai' },
  recreation_retries: 2, deleted_hang_count: 3, needsUserAttempts: 4, stale_recoveries: 1, needs_user_tick_le: '2026-11-11T10:00:00Z',
  republish_snapshot: { etat: 'Neuf sans étiquette', color1_id: 1 }, capture_id: 4242,
});
const MSG_ETAT = "Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : Vinted exige « État ». Rien n'est perdu.";
const job = (pf, o = {}) => ({ id: '00000000-0000-4000-8000-0000c69af940', user_id: '64eab2f9-0000-4000-8000-000000000001',
  platform: 'vinted', action: 'republish', status: 'needs_user', title: 'Article d’essai', error: MSG_ETAT,
  created_at: '2026-11-09T17:58:04Z', handler_build: '2026-11-08T10:00:00Z+abcdef0 · v0.6.185', platform_fields: pf, ...o });
const enFile = (j, pf) => ({ ...j, status: 'pending', error: null, platform_fields: pf });
/** Un essai raté de l'extension après la remise en file (background.js : n + 1 ; retentative auto tant que retries < 2). */
const unEssaiRate = (pf, t) => ({ ...pf, recreation_tentee: { ...(pf.recreation_tentee ?? {}), at: iso(t), n: (Number(pf.recreation_tentee?.n) || 0) + 1 },
  recreation_retries: (Number(pf.recreation_retries) || 0) + 1, recreation_envois: [...(pf.recreation_envois ?? []), iso(t)] });

function budgetEntier(nom, pfR, t0) {
  const jR = enFile(job(pfR), pfR);
  ok(RB.decisionRecreationBloquee(jR, t0 + 60_000) === null, `${nom} : remise en file, handler-watch ne la ressort PAS au passage suivant`,
    { essais: RB.essaisRates(pfR), tentee: pfR.recreation_tentee });
  const apres1 = unEssaiRate(pfR, t0 + 5 * 60_000);
  ok(RB.decisionRecreationBloquee(enFile(job(apres1), apres1), t0 + 6 * 60_000) === null, `${nom} : après UN essai raté, toujours en file (budget entier)`,
    { essais: RB.essaisRates(apres1) });
  const apres3 = unEssaiRate(unEssaiRate(apres1, t0 + 15 * 60_000), t0 + 30 * 60_000);
  ok(RB.decisionRecreationBloquee(enFile(job(apres3), apres3), t0 + 31 * 60_000) === 'signaler', `${nom} : au bout du budget (3 essais ratés), la sortie de file joue encore`,
    { essais: RB.essaisRates(apres3) });
  const restants = COMPTEURS.filter((k) => k in pfR);
  ok(restants.length === 0, `${nom} : aucun compteur d'essais ne survit (${COMPTEURS.length} clés)`, restants);
  ok(pfR.recreation_tentee && typeof pfR.recreation_tentee === 'object' && pfR.recreation_tentee.n === 0 && pfR.recreation_tentee.at === '2026-11-10T19:42:28.029Z',
    `${nom} : recreation_tentee garde son heure (garde du dressing), son n repart de 0`, pfR.recreation_tentee);
  ok(egal(pfR.recreation_envois, ENVOIS) && pfR.recreation_depot_parti?.raison && pfR.deleted_at === '2026-11-10T19:23:43.000Z' && pfR.republish_step === 'deleted',
    `${nom} : traces anti-doublon gardées (envois, dépôt peut-être parti, heure du retrait, étape)`);
  const a = pfR.recreation_essais_avant_relance ?? {};
  ok(a.recreation_tentee?.n === 3 && a.recreation_retries === 2 && a.deleted_hang_count === 3 && typeof a.le === 'string',
    `${nom} : les compteurs d'avant sont archivés (recreation_essais_avant_relance)`, a);
}

console.log('A. get-pending-jobs — réarmement par un correctif d’extension (12:50:49 le 11/11)');
{
  const j = job(pfBase());
  const c = CE.correctifPourJob(j);
  ok(c?.cle === 'vinted_etat_a_confirmer', 'le cas est bien réarmé par « vinted_etat_a_confirmer »', c?.cle ?? null);
  // L'ancienne écriture (get-pending-jobs jusqu'au 11/11, à l'identique) : le défaut se reproduit.
  const ancien = { ...j.platform_fields };
  for (const k of ['needs_user_source', 'needsUserAttempts', 'needsUserBoucle', 'needsUserResolved', 'next_action_after', 'needs_user_vu_le',
    'needs_user_vu_erreur', 'needs_user_tick_le', 'needs_user_actif_ms', 'error_technique', 'processing_since', 'pas_de_rouge',
    'pas_de_rouge_reprises', ...(c?.clesARetirer ?? [])]) delete ancien[k];
  ok(RB.decisionRecreationBloquee(enFile(j, ancien), M + 16_000) === 'signaler', 'AVANT (preuve de la cause) : l’ancienne écriture est ressortie de la file 16 s plus tard');
  if (typeof CE.champsReamorcageCorrectif !== 'function') ok(false, 'correctifs-extension.js : champsReamorcageCorrectif existe (réarmement par la remise en file)');
  else {
    const pfR = CE.champsReamorcageCorrectif(j, c, { buildDuPoll: '2026-11-10T14:10:14Z+ba13a51 · v0.6.186', maintenant: iso(M) });
    budgetEntier('correctif', pfR, M);
    ok(pfR.correctif_leve?.cle === 'vinted_etat_a_confirmer' && pfR.build_min_requis === CE.BUILD_VINTED_ETAT_CONFIRME && pfR.capture_id === 4242,
      'correctif : correctif_leve et build_min_requis posés comme avant, la capture d’une annonce retirée gardée');
    const vivante = CE.champsReamorcageCorrectif(job({ ...pfBase(), republish_step: 'captured', deleted_at: undefined }), c, { maintenant: iso(M) });
    ok(vivante.republish_step === 'a_capturer' && !('capture_id' in vivante), 'correctif : une annonce pas encore retirée est re-vérifiée (a_capturer), comme avant');
  }
}

console.log('B. handler-watch — relance d’une cause levée par le serveur (champsRelanceCauseLevee)');
{
  const pf = { ...pfBase(), needs_user_source: 'recreation_bloquee', server_required_fields: [{ key: 'color', label: 'Couleur' }],
    recreation_bloquee: { le: '2026-11-11T11:51:05.054Z', essais: 2, par: 'handler-watch', statut_avant: 'pending' } };
  const j = job(pf, { error: 'validation_error : couleur exigée' });
  const cause = RB.causeLeveePourRelance(j, '2026-11-10T14:10:14Z+ba13a51 · v0.6.186');
  ok(cause?.code === 'vinted_couleur_connue_non_posee', 'le décor est relancé par une cause levée', cause?.code ?? null);
  if (cause) {
    const pfR = RB.champsRelanceCauseLevee(pf, cause, iso(M), { extensionBuild: '2026-11-10T14:10:14Z+ba13a51 · v0.6.186' });
    budgetEntier('cause levée', pfR, M);
    ok(!('needs_user_source' in pfR) && pfR.recreation_relancee?.[cause.code]?.le === iso(M), 'cause levée : la question levée, la relance unique tracée comme avant');
  }
}

console.log('C. Tirages : jamais ressortie avant un nouvel essai, aucune trace perdue');
if (RF) {
  let graine = 11112026;
  const h = (k) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % k; };
  let ressorties = 0, tracesPerdues = 0, entreeTouchee = 0;
  for (let t = 0; t < 600; t++) {
    const pf = { republish_step: 'deleted', deleted_at: iso(M - (1 + h(96)) * 3600_000) };
    for (const k of COMPTEURS) if (h(2)) pf[k] = ['recreation_reprise', 'recreation_bloquee'].includes(k) ? { n: h(9), at: iso(M - h(9e6)) } : h(9);
    if (h(3)) pf.recreation_tentee = { at: iso(M - h(9e6)), n: h(12) };
    for (const k of TRACES) if (!(k in pf) && h(2)) pf[k] = k === 'recreation_envois' ? [iso(M - 1000 * h(9e4))] : { at: iso(M - h(9e6)) };
    if (h(2)) pf.needs_user_source = ['recreation_bloquee', 'champ_a_choisir'][h(2)];
    const copie = canon(pf);
    const r = RF.remettreEnFile(pf, { par: 'tirage', maintenant: iso(M) });
    if (canon(pf) !== copie) entreeTouchee++;
    if (RB.decisionRecreationBloquee(enFile(job(r), r), M + 3 * 3600_000) !== null) ressorties++;
    if (TRACES.some((k) => k !== 'republish_step' && k in pf && !egal(pf[k], r[k]))) tracesPerdues++;
  }
  ok(ressorties === 0, '600 tirages : aucune tâche remise en file n’est ressortie avant un nouvel essai', ressorties);
  ok(tracesPerdues === 0, '600 tirages : aucune trace anti-doublon retirée ni changée', tracesPerdues);
  ok(entreeTouchee === 0, '600 tirages : l’entrée n’est jamais modifiée (fonction pure)', entreeTouchee);
  const vide = RF.remettreEnFile({}, { par: 'x', maintenant: iso(M) });
  ok(!('recreation_essais_avant_relance' in vide), 'sans compteur, aucune archive vide n’écrase une archive précédente');
}

console.log('D. Lecture du code : un seul chemin pour remettre en file');
{
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  const bloc = gpj.slice(gpj.indexOf('UN DÉFAUT D\'EXTENSION CORRIGÉ : LE JOB REPART'), gpj.indexOf('LA PAUSE « PAGE DE DÉPÔT LEBONCOIN »'));
  ok(bloc.length > 100 && /champsReamorcageCorrectif\(/.test(bloc) && !/for \(const k of \["needs_user_source", "needsUserAttempts"/.test(bloc),
    'get-pending-jobs : le réarmement des correctifs passe par champsReamorcageCorrectif (plus de liste à part)');
  const ce = lire('supabase/functions/_shared/correctifs-extension.js');
  const corpsCE = ce.slice(ce.indexOf('export function champsReamorcageCorrectif'));
  ok(/remettreEnFile\(/.test(corpsCE.slice(0, corpsCE.indexOf('\n}\n'))), 'champsReamorcageCorrectif appelle remettreEnFile');
  const rb = lire('supabase/functions/_shared/recreation-bloquee.js');
  const corpsCL = rb.slice(rb.indexOf('export function champsRelanceCauseLevee'));
  ok(/remettreEnFile\(/.test(corpsCL.slice(0, corpsCL.indexOf('\n}\n'))), 'champsRelanceCauseLevee (handler-watch) appelle remettreEnFile');
  const corpsER = rb.slice(rb.indexOf('export function essaisRates'));
  const lues = [...new Set([...corpsER.slice(0, corpsER.indexOf('\n}\n')).matchAll(/pf\.(\w+)/g)].map((x) => x[1]))];
  const horsRemise = lues.filter((k) => !COMPTEURS.includes(k) && k !== (RF?.COMPTEUR_GARDE ?? 'recreation_tentee'));
  ok(lues.length >= 3 && horsRemise.length === 0, `essaisRates ne lit que des compteurs remis à zéro (${lues.join(', ')})`, horsRemise);
  let mig = '';
  try { mig = lire(MIGRATION); } catch { /* absente */ }
  const tab = mig.match(/v_compteurs text\[\] := ARRAY\[([^\]]*)\]/);
  const listeSql = tab ? [...tab[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  ok(egal(listeSql, [...COMPTEURS]), 'la jumelle SQL retire exactement les compteurs de remettreEnFile, dans le même ordre', { sql: listeSql, js: COMPTEURS });
  const corpsRR = mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.relancer_republish'));
  ok(/public\.republication_remise_en_file\(/.test(corpsRR), 'relancer_republish (bouton « Republier maintenant ») passe par la remise en file');
  ok(mig && !/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m.test(mig), 'aucune transaction dans la migration');
}

console.log('E. Sur un Postgres JETABLE : relancer_republish avant / après / inverse');
let EmbeddedPostgres, pg;
try { ({ default: EmbeddedPostgres } = await import('embedded-postgres')); pg = (await import('pg')).default; }
catch { ok(false, 'embedded-postgres et pg introuvables', 'npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3'); }
let MIG = '', INV = '';
try { MIG = lire(MIGRATION); INV = lire(INVERSE); } catch (e) { ok(false, 'migration et inverse présentes', e.message); }
if (EmbeddedPostgres && pg && MIG && INV) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(path.join(tmpdir(), 'fillsell-remise-en-file-'));
  const port = 52000 + Math.floor(Math.random() * 2000);
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'remise', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  let client;
  try {
    await base.initialise();
    await base.start();
    client = new pg.Client({ connectionString: `postgres://postgres:remise@127.0.0.1:${port}/postgres` });
    await client.connect();
    client.on('notice', () => {});
    const q = async (sql, p = []) => (await client.query(sql, p)).rows;
    await q(String.raw`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
      CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid, platform text, action text, status text, error text,
        title text, created_at timestamptz DEFAULT now(), platform_fields jsonb);`);
    // AVANT : la définition de PROD (recopiée à l'octet dans l'inverse), droits de prod.
    const defProd = INV.slice(INV.indexOf('CREATE OR REPLACE FUNCTION public.relancer_republish'), INV.indexOf('$function$;', INV.indexOf('CREATE OR REPLACE FUNCTION public.relancer_republish')) + '$function$;'.length);
    await q(defProd);
    await q('REVOKE ALL ON FUNCTION public.relancer_republish(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.relancer_republish(uuid) TO authenticated, service_role');
    const etat = async () => (await q(`SELECT md5(pg_get_functiondef('public.relancer_republish(uuid)'::regprocedure)) m,
      (SELECT string_agg(x, ',' ORDER BY x) FROM unnest((SELECT proacl FROM pg_proc WHERE oid = 'public.relancer_republish(uuid)'::regprocedure)::text[]) x) acl,
      to_regprocedure('public.republication_remise_en_file(jsonb, text, text)') IS NOT NULL AS jumelle`))[0];
    const AVANT = await etat();
    // md5(pg_get_functiondef) de relancer_republish lu EN PROD le 11/11 vers 20:35 : l'inverse porte la définition de prod.
    ok(AVANT.m === '58ff40728065f2d93a99b031cffa7cc8', 'AVANT : la définition de l’inverse est celle de PROD (md5 lu en prod le 11/11)', AVANT.m);
    const UID = '64eab2f9-0000-4000-8000-000000000001';
    let seq = 0;
    const relancer = async (pf) => {
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      await q('INSERT INTO public.cross_post_jobs (id, user_id, platform, action, status, error, title, created_at, platform_fields) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, UID, 'vinted', 'republish', 'needs_user', 'remise en ligne ratée', 'Article d’essai', '2026-11-09T17:58:04Z', pf]);
      await q(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: UID, role: 'authenticated' })]);
      await q('SET ROLE authenticated');
      let r;
      try { r = (await q('SELECT public.relancer_republish($1) AS r', [id]))[0].r; } finally { await q('RESET ROLE'); }
      const ligne = (await q('SELECT status, platform_fields FROM public.cross_post_jobs WHERE id = $1', [id]))[0];
      return { r, ligne, job: { ...job(ligne.platform_fields), status: ligne.status, error: null } };
    };
    await q('GRANT SELECT, UPDATE ON public.cross_post_jobs TO authenticated');
    const pfBloquee = { ...pfBase(), needs_user_source: 'recreation_bloquee',
      recreation_bloquee: { le: '2026-11-11T17:00:19.802Z', essais: 2, par: 'handler-watch', statut_avant: 'pending' } };
    const t = Date.parse('2026-11-11T18:00:00Z');
    const av = await relancer(pfBloquee);
    ok(av.r?.ok === true && av.ligne.status === 'pending', 'AVANT : relancer_republish de prod remet la tâche en file');
    ok(RB.decisionRecreationBloquee(av.job, t) === 'signaler', 'AVANT (preuve de la cause) : handler-watch la ressort au passage suivant (compteurs gardés)',
      { essais: RB.essaisRates(av.ligne.platform_fields) });

    await q(MIG); await q(MIG);
    ok(true, 'APRÈS : migration appliquée deux fois sur la base jetable');
    const APRES = await etat();
    ok(APRES.jumelle === true && APRES.acl === AVANT.acl, 'APRÈS : la jumelle existe, les droits de relancer_republish sont inchangés', { AVANT, APRES });
    const ap = await relancer(pfBloquee);
    ok(ap.r?.ok === true && ap.ligne.status === 'pending' && ap.r.republish_step === 'deleted', 'APRÈS : relancer_republish remet en file, étape « deleted » gardée');
    ok(RB.decisionRecreationBloquee(ap.job, t) === null, 'APRÈS : handler-watch ne la ressort plus avant un nouvel essai', { essais: RB.essaisRates(ap.ligne.platform_fields) });
    const pfA = ap.ligne.platform_fields;
    ok(COMPTEURS.every((k) => !(k in pfA)) && pfA.recreation_tentee?.n === 0 && egal(pfA.recreation_envois, ENVOIS) && !('needs_user_source' in pfA),
      'APRÈS : compteurs retirés, garde du dressing et envois gardés, source « recreation_bloquee » levée');
    const pfVive = { republish_step: 'captured', capture_id: 7, recreation_retries: 1, needsUserAttempts: 5 };
    const vv = await relancer(pfVive);
    ok(vv.ligne.platform_fields.republish_step === 'a_capturer' && !('capture_id' in vv.ligne.platform_fields) && !('recreation_retries' in vv.ligne.platform_fields),
      'APRÈS : une annonce pas encore retirée repart à a_capturer (comme avant), compteurs remis à zéro');

    // La jumelle SQL = remettreEnFile, cas écrits + tirages (les heures « le » mises de côté).
    if (RF) {
      const sansLe = (pf) => { const x = JSON.parse(JSON.stringify(pf ?? null)); if (x?.remise_en_file) delete x.remise_en_file.le; if (x?.recreation_essais_avant_relance) delete x.recreation_essais_avant_relance.le; return x; };
      const cas = [pfBase(), pfBloquee, {}, { recreation_tentee: 'pas un objet', recreation_retries: 0 }, { needs_user_source: 'champ_a_choisir', recreation_reprise: { n: 2 } },
        { recreation_tentee: { at: '2026-11-10T19:42:28Z', n: 7, une_passe: true }, next_action_after: 'x', processing_since: 'y' }];
      let graine = 2111;
      const h = (k) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % k; };
      for (let i = 0; i < 150; i++) {
        const pf = {};
        for (const k of [...COMPTEURS, 'recreation_tentee', 'recreation_envois', 'needs_user_source', 'next_action_after', 'autre']) if (h(2)) pf[k] = h(3) ? { n: h(5), at: `2026-11-0${1 + h(9)}T00:00:00Z` } : h(7);
        cas.push(pf);
      }
      let ecarts = 0, premier = null;
      for (const pf of cas) {
        const js = RF.remettreEnFile(pf, { par: 'banc', motif: i18n(pf) });
        const sql = (await q('SELECT public.republication_remise_en_file($1::jsonb, $2, $3) AS r', [pf, 'banc', i18n(pf)]))[0].r;
        if (!egal(sansLe(js), sansLe(sql))) { ecarts++; premier ??= { pf, js, sql }; }
      }
      ok(ecarts === 0, `la jumelle SQL rend exactement ce que rend remettreEnFile (${cas.length} cas)`, premier);
      const nul = (await q('SELECT public.republication_remise_en_file(NULL, NULL) AS r'))[0].r;
      ok(nul && nul.remise_en_file?.par === '?' && Object.keys(nul).length === 1, 'jumelle : un platform_fields absent donne la seule marque de remise en file');
    }

    await q(INV);
    const INVERSE_ = await etat();
    ok(INVERSE_.m === AVANT.m && INVERSE_.acl === AVANT.acl && INVERSE_.jumelle === false, 'INVERSE : relancer_republish de prod à l’octet, droits compris, jumelle retirée', { AVANT, INVERSE_ });
    const inv = await relancer(pfBloquee);
    ok(RB.decisionRecreationBloquee(inv.job, t) === 'signaler', 'INVERSE : le défaut revient (preuve que la migration seule le corrige)');
    await q(MIG);
    const DENOUVEAU = await etat();
    ok(DENOUVEAU.m === APRES.m && DENOUVEAU.acl === APRES.acl, 'DE NOUVEAU la migration : l’état d’après, exactement');
  } catch (e) {
    ok(false, 'banc Postgres jetable', e?.stack ?? String(e));
  } finally {
    try { await client?.end(); } catch { /* fermé */ }
    try { await base.stop(); } catch { /* arrêté */ }
    try { rmSync(dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ }
  }
}
function i18n(pf) { return pf && typeof pf === 'object' && 'autre' in pf ? null : 'motif d’essai'; }

console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ROUGE(S)` : ' — tout est vert'}`);
process.exit(ko ? 1 : 0);
