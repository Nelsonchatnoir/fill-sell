// Essai RÉEL de bout en bout — suppression du compte avec « Pourquoi tu pars ? » (06/10/2026).
//
//     node scripts/suppression-compte-essai-reel.mjs --email nicolas.svobodny+test11@gmail.com [--articles 3500] [--motif pas_marche --texte "…"]
//
// ⚠️ Écrit en PROD (c'est le but) : crée un compte d'essai, le remplit, puis le
// SUPPRIME par l'écran réel. Rien ne reste, sauf la ligne anonyme de
// `departs_compte` (c'est ce qu'on prouve).
//   1. inscription par l'API publique (comme l'écran d'inscription), e-mail
//      confirmé par la clé de service (.env, jamais affichée) ;
//   2. stock semé en SQL : N fiches, annonces Leboncoin rattachées, relevés
//      Vinted, publications EN LIGNE (liens de forme réelle, numéros fictifs —
//      aucun poste ne sert ce compte : pas d'extension, pas d'eBay relié),
//      ventes ;
//   3. l'APP LOCALE (vite, http://localhost:5173, branchée sur la prod) dans un
//      Chromium Playwright ISOLÉ (profil vierge, jamais le Chrome de Nico ; la
//      session est posée dans CE profil seulement — règle « jamais de login
//      fillsell.app en automatisation » respectée) : Réglages › Mon compte ›
//      Supprimer mon compte › Continuer › réponse (ou rien) › Supprimer
//      définitivement ; chaque réponse réseau est relevée ;
//   4. relecture en base : ligne de départ, compte, profil, stock, garde.
// Sort en 1 au premier écart. Captures dans screenshots-review/.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nom, defaut = null) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? process.argv[i + 1] : defaut; };
const EMAIL = arg('email');
const N = Number(arg('articles', '0'));
const MOTIF = arg('motif');
const TEXTE = arg('texte');
if (!EMAIL || !/\+test\d+@gmail\.com$/.test(EMAIL)) { console.log('--email nicolas.svobodny+testNN@gmail.com obligatoire (adresse de test interne)'); process.exit(2); }

const env = Object.fromEntries(fs.readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const libSb = fs.readFileSync(join(ROOT, 'src/lib/supabase.js'), 'utf8');
const URL_SB = /supabaseUrl = '([^']+)'/.exec(libSb)[1];
const ANON = /supabaseAnonKey = '([^']+)'/.exec(libSb)[1];
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(URL_SB).hostname.split('.')[0];

let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`); } };
const sql = (texte) => {
  const f = join(os.tmpdir(), `essai-suppression-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(f, texte);
  try {
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', f, '-o', 'json'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.indexOf('{'))).rows;
  } finally { fs.rmSync(f, { force: true }); }
};

// ── 1. Inscription ─────────────────────────────────────────────────────────
console.log(`1. Inscription de ${EMAIL}`);
const motDePasse = `Essai-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const inscr = await fetch(`${URL_SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: motDePasse }) });
const inscrJ = await inscr.json();
// L'identifiant se lit EN BASE : pour une adresse déjà inscrite, l'API répond
// 200 avec un utilisateur factice (protection contre l'énumération).
const uidRendu = inscrJ.user?.id ?? inscrJ.id ?? null;
const uid = sql(`select id from auth.users where email = '${EMAIL}'`)[0]?.id ?? null;
// Reprise : le compte d'essai existait déjà (essai interrompu) → on le reprend,
// avec un mot de passe neuf posé par la clé de service.
const reprise = Boolean(uid) && uid !== uidRendu;
ok(uid && (inscr.ok || reprise), reprise ? `compte d'essai repris (inscrit lors d'un essai interrompu)` : `inscription par l'API publique (${inscr.status})`, JSON.stringify(inscrJ).slice(0, 300));
if (!uid) process.exit(1);
const conf = await fetch(`${URL_SB}/auth/v1/admin/users/${uid}`, { method: 'PUT', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify(reprise ? { email_confirm: true, password: motDePasse } : { email_confirm: true }) });
ok(conf.ok, `e-mail confirmé (${conf.status})`);
const cnx = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: motDePasse }) });
const session = await cnx.json();
ok(cnx.ok && session.access_token, `connexion (${cnx.status})`);

// ── 2. Stock ───────────────────────────────────────────────────────────────
const dejaSeme = N > 0 && Number(sql(`select count(*) n from public.inventaire where user_id = '${uid}'`)[0].n) >= N;
if (dejaSeme) console.log(`2. Stock déjà semé (${N} fiches)`);
if (N > 0 && !dejaSeme) {
  console.log(`2. Stock semé : ${N} fiches`);
  const base = 8100000000000000 + (Date.now() % 1000000) * 10000;
  const t0 = Date.now();
  sql(`
    insert into public.inventaire (id, user_id, titre, prix_vente, quantite)
      select ${base} + g, '${uid}', 'Essai suppression ' || g, 10, 1 from generate_series(1, ${N}) g;
    insert into public.annonces_plateforme (user_id, platform, listing_id, inventaire_id)
      select '${uid}', 'leboncoin', 'essai-' || i.id, i.id from public.inventaire i where i.user_id = '${uid}' order by i.id limit ${Math.ceil(N * 0.43)};
    insert into public.rapprochements (user_id, annonce_id, decision, par, inventaire_id)
      select '${uid}', a.id, 'attache', 'auto', a.inventaire_id from public.annonces_plateforme a where a.user_id = '${uid}';
    insert into public.vinted_listing_snapshots (user_id, vinted_item_id, captured_on, inventaire_id)
      select '${uid}', 'essai-' || i.id, current_date, i.id from public.inventaire i where i.user_id = '${uid}';
    insert into public.cross_post_jobs (user_id, platform, action, status, listing_url, inventaire_id, title)
      select '${uid}', 'leboncoin', 'publish', 'published', 'https://www.leboncoin.fr/ad/essai/' || i.id, i.id, i.titre
        from public.inventaire i where i.user_id = '${uid}' order by i.id limit ${Math.ceil(N * 0.3)};
    insert into public.ventes (id, user_id, titre, prix_vente, quantite, inventaire_id, plateforme, vendu_le)
      select i.id, '${uid}', i.titre, 10, 1, i.id, 'Vinted', now() from public.inventaire i where i.user_id = '${uid}' order by i.id desc limit ${Math.ceil(N * 0.09)};
    select 1;`);
  const [c] = sql(`select (select count(*) from public.inventaire where user_id = '${uid}') fiches, (select count(*) from public.cross_post_jobs where user_id = '${uid}' and status = 'published') en_ligne, (select count(*) from public.ventes where user_id = '${uid}') ventes`);
  ok(Number(c.fiches) === N, `${c.fiches} fiches, ${c.en_ligne} publications en ligne, ${c.ventes} ventes (${Date.now() - t0} ms)`);
}

// ── 3. L'écran réel ────────────────────────────────────────────────────────
console.log('3. Suppression par l’écran (app locale, Chromium isolé)');
const vite = spawn('npx vite --port 5173 --strictPort', { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const arreterVite = () => {
  vite.kill();
  if (process.platform === 'win32') {
    // npx garde vite comme petit-enfant détaché : on ferme aussi qui écoute le 5173.
    const pids = new Set([String(vite.pid)]);
    try { for (const l of execFileSync('netstat', ['-ano'], { encoding: 'utf8' }).split(/\r?\n/)) if (/:5173\s.*LISTENING/.test(l)) pids.add(l.trim().split(/\s+/).pop()); } catch { /* */ }
    for (const pid of pids) { try { execFileSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ } }
  }
};
try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite ne démarre pas')), 90000);
    // Le message de vite est coloré : codes ANSI retirés avant de lire le port.
    vite.stdout.on('data', (d) => { if (/localhost:5173/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) { clearTimeout(t); res(); } });
    vite.on('exit', (code) => rej(new Error(`vite sorti (${code})`)));
  });
} catch (e) { arreterVite(); throw e; }
const { chromium } = await import('playwright');
// Le binaire Chrome installé, avec un profil VIERGE et temporaire (jamais celui de Nico).
const nav = await chromium.launch({ channel: 'chrome', headless: true }).catch((e) => { arreterVite(); throw e; });
const reseau = [];
const nomCapture = EMAIL.replace(/[^a-z0-9]+/gi, '-');
fs.mkdirSync(join(ROOT, 'screenshots-review'), { recursive: true });
let page = null;
try {
  const ctx = await nav.newContext({ viewport: { width: 440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  await ctx.addInitScript(([cle, val]) => { try { localStorage.setItem(cle, val); } catch { /* */ } }, [`sb-${REF}-auth-token`, JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) + session.expires_in })]);
  page = await ctx.newPage();
  page.on('dialog', async (d) => { reseau.push({ url: 'ALERTE', status: 0, texte: d.message() }); await d.dismiss(); });
  page.on('response', async (r) => {
    const u = r.url();
    if (/rpc\/(enregistrer_depart|supprimer_mon_stock_sans_retrait)|rest\/v1\/profiles\?.*id=eq|functions\/v1\/delete-account/.test(u) && r.request().method() !== 'OPTIONS') {
      reseau.push({ url: u.replace(URL_SB, ''), methode: r.request().method(), status: r.status(), corps: r.request().postData() });
    }
  });
  await page.goto('http://localhost:5173/app', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByRole('button', { name: 'Réglages' }).first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(2500);
  // Comme un nouvel inscrit : bandeau cookies refusé, parcours d'entrée passé.
  for (let i = 0; i < 10; i++) {
    let geste = false;
    for (const nom of ['Refuser', 'Passer', 'Entrer dans FillSell', 'Plus tard']) {
      const b = page.getByRole('button', { name: nom, exact: true });
      if (await b.first().isVisible().catch(() => false)) { await b.first().click().catch(() => {}); geste = true; await page.waitForTimeout(700); }
    }
    const lien = page.getByText('Passer', { exact: true });
    if (!geste && await lien.first().isVisible().catch(() => false)) { await lien.first().click().catch(() => {}); geste = true; await page.waitForTimeout(700); }
    if (!geste) break;
  }
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.screenshot({ path: join(ROOT, `screenshots-review/depart-${nomCapture}-accueil.png`) });
  await page.getByRole('button', { name: 'Réglages' }).first().click();
  await page.getByText('Mon compte et mes données', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.locator('[data-question-depart]').waitFor();
  if (MOTIF) await page.locator(`[data-motif="${MOTIF}"]`).click();
  if (TEXTE) await page.locator('[data-question-depart] textarea').fill(TEXTE);
  await page.locator('[data-question-depart]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(ROOT, `screenshots-review/depart-${nomCapture}.png`), fullPage: false });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await page.waitForURL((u) => !/\/app/.test(u.pathname), { timeout: 120000 });
  const duree = Date.now() - t0;
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(reseau, null, 2));
  const st = (re) => reseau.filter((x) => re.test(x.url)).map((x) => x.status);
  ok(st(/enregistrer_depart/).join() === '200', `réponse de départ enregistrée (HTTP ${st(/enregistrer_depart/).join() || 'aucun appel'})`);
  ok(st(/supprimer_mon_stock_sans_retrait/).join() === '204' || st(/supprimer_mon_stock_sans_retrait/).join() === '200', `stock effacé sans erreur (HTTP ${st(/supprimer_mon_stock_sans_retrait/).join()})`);
  ok(st(/delete-account/).join() === '200', `delete-account (HTTP ${st(/delete-account/).join()})`);
  ok(!reseau.some((x) => x.status >= 500), 'aucune erreur 500');
  ok(!reseau.some((x) => x.url === 'ALERTE'), 'aucune alerte d’erreur à l’écran');
  ok(reseau.findIndex((x) => /enregistrer_depart/.test(x.url)) < reseau.findIndex((x) => /supprimer_mon_stock/.test(x.url)), 'la réponse part AVANT l’effacement');
  console.log(`  (clic → sortie de l'app : ${duree} ms)`);
} catch (e) {
  await page?.screenshot({ path: join(ROOT, `screenshots-review/depart-${nomCapture}-ECHEC.png`) }).catch(() => {});
  console.log('  ✗ écran :', e.message.split(String.fromCharCode(10))[0], '— capture screenshots-review/depart-…-ECHEC.png');
  ko++;
} finally {
  await nav.close();
  arreterVite();
}

// ── 4. Relecture en base ───────────────────────────────────────────────────
console.log('4. Relecture en base');
const [etat] = sql(`select
  (select count(*) from auth.users where id = '${uid}') compte,
  (select count(*) from public.profiles where id = '${uid}') profil,
  (select count(*) from public.inventaire where user_id = '${uid}') fiches,
  (select count(*) from public.ventes where user_id = '${uid}') ventes,
  (select count(*) from public.cross_post_jobs where user_id = '${uid}') jobs,
  (select count(*) from public.departs_compte_garde where user_id = '${uid}') garde,
  (select row_to_json(d) from public.departs_compte d order by id desc limit 1) depart`);
ok(Number(etat.compte) === 0 && Number(etat.profil) === 0, 'compte et profil supprimés');
ok(Number(etat.fiches) === 0 && Number(etat.ventes) === 0 && Number(etat.jobs) === 0, 'stock, ventes et jobs effacés');
ok(Number(etat.garde) === 0, 'la garde « une réponse par compte » est partie avec le compte');
const d = typeof etat.depart === 'string' ? JSON.parse(etat.depart) : etat.depart;
console.log('  ligne departs_compte :', JSON.stringify(d));
ok(d && d.motif === (MOTIF ?? null) && d.texte === (TEXTE ?? null), 'motif et texte gardés tels que donnés');
ok(d && d.nb_articles === N && d.plateforme_app === 'web' && d.palier === 'free' && d.anciennete_minutes >= 0 && d.anciennete_minutes < 60, 'contexte : articles, plateforme, palier, ancienneté');
ok(d && !Object.keys(d).some((k) => /user|email|compte_id/.test(k)), 'aucun identifiant ni e-mail dans la ligne');
console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
