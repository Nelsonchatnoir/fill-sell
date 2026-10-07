// ═══════════════════════════════════════════════════════════════════════════
// RÉPARATION DU PARC PAR LE RAPPROCHEMENT v3 (08/10/2026) — LE LANCEUR
// ═══════════════════════════════════════════════════════════════════════════
// « Le parc est réparé automatiquement par la même passe » (Nico, 08/10) : les
// comptes touchés par les moteurs d'avant (articles importés sans rapprochement
// complet, « à vérifier » posés par le moteur du 07/10 ou le rattrapage,
// annonces sans article, propositions figées) sont rejoués par la fonction
// edge `rapprochement` en mode réparation — la même passe que « Synchroniser »,
// avec les décisions automatiques d'avant rejugées. Jamais une décision de la
// personne, jamais un article qu'elle a modifié (question), jamais une annonce
// touchée sur une plateforme.
//
//   node scripts/reparations/20261008_reparation_rapprochement_v3.mjs --lister
//       les comptes concernés, et pourquoi ;
//   node scripts/reparations/20261008_reparation_rapprochement_v3.mjs --simuler [--user <uuid>]
//       la passe en mode réparation, SANS écriture (la fonction rend son plan) ;
//   node scripts/reparations/20261008_reparation_rapprochement_v3.mjs --appliquer --user <uuid> | --tous [--simulation <fichier>]
//       sauvegarde (_backup_0810_v3_*, RLS fermées), puis la passe, un compte
//       après l'autre ; arrêt net si un compte s'écarte de sa simulation.
// Inverse : scripts/reparations/20261008_reparation_rapprochement_v3_INVERSE.sql
// La fonction est appelée par la base (net.http_post, secret du vault) : ce
// script ne porte aucun secret.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const USER = val('--user');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function q(sql) {
  const f = path.join(os.tmpdir(), `reparation-v3-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    const i = out.indexOf('{'); return i >= 0 ? JSON.parse(out.slice(i)).rows : [];
  } catch (e) {
    const t = String(e.stdout || '') + String(e.stderr || e.message); const i = t.indexOf('ERROR');
    throw new Error(i >= 0 ? t.slice(i, i + 900) : t.slice(0, 1500));
  } finally { fs.rmSync(f, { force: true }); }
}

// Les comptes concernés : une annonce vivante sans article, un article « à
// vérifier » posé automatiquement, ou un article importé par un ancien moteur.
const COMPTES_SQL = `
  SELECT c.user_id, string_agg(DISTINCT c.motif, ',') motifs, palier_de(c.user_id) palier,
         EXISTS (SELECT 1 FROM comptes_actifs(30) a WHERE a.user_id = c.user_id) actif30
    FROM (
      SELECT user_id, 'annonces_sans_article' motif FROM annonces_plateforme
       WHERE inventaire_id IS NULL AND ignoree_le IS NULL AND disparu_le IS NULL AND platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
      UNION SELECT user_id, 'a_verifier_auto' FROM inventaire
       WHERE a_verifier IS NOT NULL AND fusionne_dans IS NULL AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710')
      UNION SELECT i.user_id, 'import_ancien_moteur' FROM inventaire i
       WHERE i.origine LIKE 'releve\\_%' AND i.fusionne_dans IS NULL AND i.statut = 'stock'
         AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.inventaire_id = i.id AND r.decision = 'import' AND r.par = 'auto'
                       AND COALESCE(r.detail ->> 'regle', '') <> 'rapprochement_v3')
    ) c
   GROUP BY c.user_id`;

const comptes = () => (USER ? [{ user_id: USER }] : q(`${COMPTES_SQL} ORDER BY (palier_de(c.user_id) = 'free'), c.user_id;`))
  .filter((r) => (!args.includes('--payants') || r.palier !== 'free') && (!args.includes('--gratuits') || r.palier === 'free'))
  // --part k/n (08/10 nuit) : plusieurs instances de simulation en parallèle, chacune sa part des comptes
  .filter((r) => { const p = val('--part'); if (!p) return true; const [k, n] = p.split('/').map(Number); return (parseInt(String(r.user_id).slice(0, 8), 16) % n) === k; });
// --sauf <uuid,uuid> : des comptes déjà traités à part (Corinne, appliquée la première le 08/10)
const SAUF = new Set(String(val('--sauf') ?? '').split(',').filter(Boolean));
const comptesSauf = () => comptes().filter((r) => !SAUF.has(r.user_id));

// Appel de la fonction edge par la base (secret du vault), réponse lue dans
// net._http_response (qui se purge : lue tout de suite, en boucle courte).
function appelerFonction(user, corps) {
  const [{ id }] = q(`SELECT net.http_post(
    url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement',
    body := '${JSON.stringify({ user_id: user, ...corps }).replace(/'/g, "''")}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    timeout_milliseconds := 150000) id;`);
  return id;
}
async function attendreReponse(id, maxMs = 170_000) {
  const debut = Date.now();
  while (Date.now() - debut < maxMs) {
    await pause(4000);
    const r = q(`SELECT status_code, content::text content, error_msg FROM net._http_response WHERE id = ${id};`);
    if (r.length) {
      if (r[0].error_msg) throw new Error(`pg_net : ${r[0].error_msg}`);
      return { status: r[0].status_code, corps: JSON.parse(r[0].content || '{}') };
    }
  }
  throw new Error('pas de réponse de la fonction en 170 s');
}
const etatCompte = (u) => q(`SELECT jsonb_build_object(
  'stock', (SELECT count(*) FROM inventaire WHERE user_id='${u}' AND fusionne_dans IS NULL AND statut='stock' AND a_verifier IS NULL),
  'a_verifier', (SELECT count(*) FROM inventaire WHERE user_id='${u}' AND fusionne_dans IS NULL AND statut='stock' AND a_verifier IS NOT NULL),
  'fiches', (SELECT count(*) FROM inventaire WHERE user_id='${u}'),
  'fusions', (SELECT count(*) FROM inventaire_fusions WHERE user_id='${u}' AND defait_le IS NULL),
  'questions', (SELECT count(*) FROM inventaire_doublons WHERE user_id='${u}' AND statut='proposee'),
  'sans_article', (SELECT count(*) FROM annonces_plateforme WHERE user_id='${u}' AND inventaire_id IS NULL AND ignoree_le IS NULL AND disparu_le IS NULL AND platform IN ('leboncoin','beebs','ebay','opla')),
  'jobs_actifs', (SELECT count(*) FROM cross_post_jobs WHERE user_id='${u}' AND status IN ('pending','processing','needs_user')),
  'titres_en_double', (SELECT count(*) FROM (SELECT titre_norm(titre) FROM inventaire WHERE user_id='${u}' AND fusionne_dans IS NULL AND statut='stock' AND a_verifier IS NULL GROUP BY 1 HAVING count(*)>1) d)) v;`)[0].v;

if (args.includes('--lister')) {
  const l = comptes();
  console.log(l.length, 'compte(s)');
  for (const c of l) console.log(c.user_id, c.palier, c.actif30 ? 'actif30' : '', c.motifs);
  process.exit(0);
}

if (args.includes('--simuler')) {
  const l = comptes();
  const res = [];
  fs.mkdirSync(path.join(RACINE, 'build', 'rattachement'), { recursive: true });
  const sortie = path.join(RACINE, 'build', 'rattachement', `simulation-v3-${Date.now()}.json`);
  for (const c of l) {
    const u = c.user_id;
    try {
      // (08/10) Chaque appel met 600 photos en file (pg_net) et répond tout de
      // suite ; on relit 12 s plus tard, en passant le progrès (precedent,
      // passages) : six relectures sans progrès, la fonction classe avec ce
      // qu'elle a. Jamais plus de 20 tours.
      let x = {}; let precedent = null; let passages = 0;
      for (let tour = 0; tour < 20; tour++) {
        const id = appelerFonction(u, { reparer: true, simuler: true, ...(precedent != null ? { precedent, passages } : {}) });
        const { corps } = await attendreReponse(id);
        x = (corps.comptes ?? [])[0] ?? {};
        if (x.etat !== 'empreintes' || x.erreur) break;
        console.log(u, 'photos en file', x.photos, 'manquantes', x.manquantes, 'passages', x.passages_photos);
        precedent = x.manquantes; passages = x.passages_photos ?? 0;
        await pause(12000);
      }
      const v = { u, etat: x.etat, erreur: x.erreur ?? null, decisions: x.decisions ?? 0, plan: x.passe?.plan ?? null, par_plateforme: x.passe?.par_plateforme ?? null,
        photos_calculees: x.photos ?? 0, photos_sans_empreinte: x.photos_sans_empreinte ?? null, avant: etatCompte(u) };
      res.push(v);
      console.log(u, JSON.stringify({ etat: v.etat, erreur: v.erreur, decisions: v.decisions, plan: v.plan, photos: v.photos_calculees, sans: v.photos_sans_empreinte }));
    } catch (e) {
      res.push({ u, erreur: String(e.message) }); console.log(u, 'ERREUR', String(e.message).slice(0, 300));
    }
    fs.writeFileSync(sortie, JSON.stringify(res, null, 1));
    const cpu = q('SELECT pct FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;')[0]?.pct;
    if (cpu != null && cpu > 60) { console.log(`CPU ${cpu} % : pause 60 s`); await pause(60000); }
  }
  console.log(`${res.length} compte(s) — ${sortie}`);
  process.exit(0);
}

if (args.includes('--appliquer')) {
  if (!USER && !args.includes('--tous') && !args.includes('--payants') && !args.includes('--gratuits')) { console.error('--user <uuid> | --payants | --gratuits | --tous'); process.exit(1); }
  const sim = val('--simulation') ? new Map(JSON.parse(fs.readFileSync(val('--simulation'), 'utf8')).map((x) => [x.u, x])) : null;
  // (08/10 nuit) Un compte déjà réparé cette nuit (plusieurs instances, reprise après un arrêt) n'est pas repris :
  // la passe est idempotente mais l'écart à la simulation ne se relirait plus.
  const dejaFaits = new Set(q(`SELECT user_id FROM rapprochement_comptes WHERE etat = 'termine' AND bilan ->> 'mode' = 'reparation' AND fin_le > now() - interval '12 hours';`).map((r) => r.user_id));
  const l = comptesSauf().filter((r) => !dejaFaits.has(r.user_id));
  console.log(`${l.length} compte(s) à appliquer (${dejaFaits.size} déjà réparé(s) cette nuit)`);
  fs.mkdirSync(path.join(RACINE, 'build', 'rattachement'), { recursive: true });
  const sortie = path.join(RACINE, 'build', 'rattachement', `application-v3-${Date.now()}.json`);
  const res = [];
  for (const c of l) {
    const u = c.user_id;
    const avant = etatCompte(u);
    // 1. la sauvegarde (jamais deux fois le même compte dans la même nuit)
    q(fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261008_reparation_v3_sauvegarde.sql'), 'utf8').replace(/__USER__/g, u));
    // 2. la passe, en mode réparation (créations autorisées : décision de Nico)
    let corps;
    try {
      const id = appelerFonction(u, { reparer: true });
      ({ corps } = await attendreReponse(id));
    } catch (e) {
      console.error(`ARRÊT : ${u} — ${e.message}`); fs.writeFileSync(sortie, JSON.stringify(res, null, 1)); process.exit(2);
    }
    let x = (corps.comptes ?? [])[0] ?? {};
    // une relance (budget épuisé) : on attend la fin
    for (let k = 0; k < 20 && (x.etat === 'empreintes' || x.etat === 'creation' || corps.inacheve); k++) {
      await pause(15000);
      const r = q(`SELECT etat, bilan FROM rapprochement_comptes WHERE user_id = '${u}';`)[0];
      if (r?.etat === 'termine') { x = { etat: 'termine', faits: r.bilan?.faits, sautes: r.bilan?.sautes, erreurs: (r.bilan?.erreurs ?? []).length }; break; }
      x = { etat: r?.etat ?? x.etat };
    }
    const apres = etatCompte(u);
    const v = { u, etat: x.etat, erreur: x.erreur ?? null, faits: x.faits ?? null, sautes: x.sautes ?? null, erreurs: x.erreurs ?? 0, avant, apres };
    res.push(v); fs.writeFileSync(sortie, JSON.stringify(res, null, 1));
    console.log(u, JSON.stringify({ etat: v.etat, faits: v.faits, sautes: v.sautes, erreurs: v.erreurs, stock: `${avant.stock}→${apres.stock}`, a_verifier: `${avant.a_verifier}→${apres.a_verifier}`, sans_article: `${avant.sans_article}→${apres.sans_article}` }));
    // 3. garde-fous : rien de supprimé, aucun job actif créé, aucune erreur, pas d'écart à la simulation
    // (08/10 nuit) « rien de supprimé » = jamais MOINS de fiches ; une fiche créée pour une annonce sans article
    // (creer / entrer_stock) est le travail attendu (2d596c5a : 0 → 2, deux annonces sans article rattachées).
    if (apres.fiches < avant.fiches || apres.jobs_actifs > avant.jobs_actifs || v.erreur || (v.erreurs ?? 0) > 0 || v.etat !== 'termine') {
      console.error(`ARRÊT : ${u} — fiches ${avant.fiches}→${apres.fiches}, jobs actifs ${avant.jobs_actifs}→${apres.jobs_actifs}, erreurs ${v.erreurs}, état ${v.etat} ${v.erreur ?? ''}`);
      process.exit(2);
    }
    const s0 = sim?.get(u);
    if (s0?.plan) {
      // (08/10 nuit) Une décision SAUTÉE par une garde de la base (double_vendu, fusionner_article_modifie, creer_refuse…)
      // est traitée, pas perdue : l'écart se mesure sur ce qui n'a été ni fait ni sauté (0f8722f5 : 10 « en double »
      // sur une annonce vendue, 10 sautées, 0 faite — ce n'est pas un écart).
      const prevu = Object.values(s0.plan).reduce((a, b) => a + b, 0);
      const fait = Object.values(v.faits ?? {}).reduce((a, b) => a + b, 0) + Object.values(v.sautes ?? {}).reduce((a, b) => a + b, 0);
      if (prevu - fait > Math.max(5, 0.25 * prevu)) { console.error(`ARRÊT : ${u} s'écarte de la simulation (prévu ${prevu}, faites+sautées ${fait})`); process.exit(3); }
    }
    const cpu = q('SELECT pct FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;')[0]?.pct;
    if (cpu != null && cpu > 60) { console.log(`CPU ${cpu} % : pause 60 s`); await pause(60000); }
  }
  console.log(`${res.length} compte(s) — ${sortie}`);
  process.exit(0);
}

console.error('--lister | --simuler | --appliquer');
process.exit(1);
