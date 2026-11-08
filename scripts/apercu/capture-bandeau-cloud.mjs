// Captures + mesures du bandeau « NOUVEAU · FillSell Cloud » du Tableau (08/11/2026 soir, point 4 de Nico).
// Outil de relecture, jamais livré — même patron que capture-encart-cloud.mjs.
//
//   node scripts/apercu/capture-bandeau-cloud.mjs
//
// Le VRAI composant, faux client Supabase (aucune requête vers la base). Chrome (bureau 1440, téléphone 390) et
// WebKit, le moteur de Safari (iPhone SE 375 × 667, iPhone 15 Pro Max 430 × 932). Assertions écrites AVANT de
// regarder les captures :
//   · montré au compte qui n'a jamais eu le Cloud ; rien pour l'essai déjà pris, le client Cloud, l'appareil non vendable ;
//   · rien ne déborde ; la scène est entière dans le bandeau ; le × ne recouvre ni la scène ni les textes ;
//   · « NOUVEAU · FillSell Cloud », l'accroche et le bouton tiennent sur UNE ligne ; boutons ≥ 44 px ; textes ≥ 4,5:1 ;
//   · le premier bloc du Tableau garde sa place horizontale et sa largeur (il descend seulement de la hauteur du bandeau) ;
//   · moins d'animations : aucune animation ; × : disparaît, retenu après rechargement ; mesure vu / clic / fermeture.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5213;
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' });
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      for (const l of net.split(/\r?\n/)) if (new RegExp(`:${PORT}\\s.*LISTENING`).test(l)) spawnSync('taskkill', ['/pid', l.trim().split(/\s+/).pop(), '/f', '/t'], { stdio: 'ignore' });
    } else serveur.kill();
  } catch { /* déjà arrêté */ }
};
process.on('exit', stop);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/bandeau-cloud.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0;
const ok = (c, m, d) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 500)}` : ''}`); } };

const MESURES = () => {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const q = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; if (/gradient/.test(getComputedStyle(e).backgroundImage)) return [18, 76, 67, 1]; } return [255, 255, 255, 1]; };
  const ratio = (el) => { const a = lum(parse(getComputedStyle(el).color)); const b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), d: Math.round(b.right), b: Math.round(b.bottom) }; };
  const q = (s) => document.querySelector(s);
  const ban = q('[data-cloud-bandeau]');
  const lignes = (el) => { if (!el) return 0; const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2; return Math.round(el.getBoundingClientRect().height / lh); };
  return {
    present: Boolean(ban),
    vw: window.innerWidth,
    debordePage: document.documentElement.scrollWidth > window.innerWidth + 1,
    bandeau: r(ban), scene: r(q('.fsbc-scene')), pc: r(q('.fsbc-pc')), nuage: r(q('.fsbc-nuage')),
    ligne1: r(q('.fsbc-ligne1')), accroche: r(q('.fsbc-accroche')), sous: r(q('.fsbc-sous')), btn: r(q('.fsbc-btn')), fermer: r(q('.fsbc-fermer')),
    lignesAccroche: lignes(q('.fsbc-accroche')), lignesBtn: lignes(q('.fsbc-btn')), lignesTitre: q('.fsbc-ligne1') ? Math.round(q('.fsbc-ligne1').getBoundingClientRect().height) : 0,
    temoin: r(q('[data-temoin-tableau]')),
    contrastes: ban ? [...ban.querySelectorAll('.fsbc-pastille,.fsbc-titre,.fsbc-accroche,.fsbc-sous,.fsbc-btn')].map((e) => ({ t: e.className, r: Math.round(ratio(e) * 100) / 100 })) : [],
    animEcran: q('.fsbc-ecran') ? getComputedStyle(q('.fsbc-ecran')).animationName : null,
    annonceVisible: q('.fsbc-annonce') ? getComputedStyle(q('.fsbc-annonce')).display !== 'none' : null,
    evenements: window.__evenements.map((e) => e.evenement),
  };
};
const ALLER = { waitUntil: 'domcontentloaded', timeout: 120000 };
const dans = (a, b, marge = 0) => a && b && a.x >= b.x - marge && a.y >= b.y - marge && a.d <= b.d + marge && a.b <= b.b + marge;
const croise = (a, b) => a && b && a.x < b.d && b.x < a.d && a.y < b.b && b.y < a.b;

const ECRANS = [
  { nom: 'web-bureau-1440', moteur: chromium, ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'web-telephone-390', moteur: chromium, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'iphone-se-375', moteur: webkit, ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max-430', moteur: webkit, ctx: { ...devices['iPhone 15 Pro Max'] } },
];

const navs = { chromium: await chromium.launch({ channel: 'chrome', headless: true }), webkit: await webkit.launch({ headless: true }) };
try {
  for (const e of ECRANS) {
    console.log(`\n── ${e.nom}`);
    const nav = e.moteur === webkit ? navs.webkit : navs.chromium;
    const plateforme = e.moteur === webkit ? 'ios' : 'web';
    for (const lang of ['fr', 'en']) {
      const ctx = await nav.newContext(e.ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}?profil=libre&lang=${lang}&plateforme=${plateforme}`, ALLER);
      await page.waitForSelector('[data-cloud-bandeau]', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      const m = await page.evaluate(MESURES);
      ok(m.present, `${lang} : bandeau montré au compte qui n'a jamais eu le Cloud`);
      ok(!m.debordePage, `${lang} : rien ne déborde à l'horizontale (page ${m.vw} px)`);
      ok(m.bandeau.x >= 0 && m.bandeau.d <= m.vw, `${lang} : bandeau dans l'écran (${m.bandeau.x}→${m.bandeau.d})`);
      ok(dans(m.scene, m.bandeau) && dans(m.pc, m.scene, 1) && dans(m.nuage, m.scene, 1), `${lang} : scène entière dans le bandeau (PC et nuage dans la scène, ${m.scene.w}×${m.scene.h})`, JSON.stringify({ s: m.scene, pc: m.pc, n: m.nuage, b: m.bandeau }));
      ok(m.scene.w === 132 && m.scene.h === 88, `${lang} : scène à sa taille, ni rognée ni écrasée (132×88)`, `${m.scene.w}×${m.scene.h}`);
      ok(!croise(m.fermer, m.scene) && !croise(m.fermer, m.ligne1) && !croise(m.fermer, m.accroche) && !croise(m.fermer, m.btn), `${lang} : × ne recouvre ni la scène, ni le titre, ni l'accroche, ni le bouton`);
      ok(m.lignesTitre <= 26, `${lang} : « NOUVEAU · FillSell Cloud » sur une ligne (${m.lignesTitre} px)`);
      ok(m.lignesAccroche === 1, `${lang} : accroche sur une ligne`, m.lignesAccroche);
      ok(m.lignesBtn === 1 || m.btn.h <= 48, `${lang} : bouton sur une ligne (${m.btn.h} px)`);
      ok(m.btn.h >= 44 && m.fermer.w >= 44 && m.fermer.h >= 44, `${lang} : bouton ${m.btn.w}×${m.btn.h}, × ${m.fermer.w}×${m.fermer.h} (≥ 44 px)`);
      ok(m.contrastes.every((c) => c.r >= 4.5), `${lang} : textes ≥ 4,5:1 (${m.contrastes.map((c) => c.r).join(' / ')})`, JSON.stringify(m.contrastes));
      ok(m.evenements.filter((x) => x === 'cloud_bandeau_vu').length === 1, `${lang} : « vu » journalisé une fois`);
      await page.screenshot({ path: path.join(SORTIE, `bandeau-cloud-${e.nom}-${lang}.png`), fullPage: true });
      // Le premier bloc du Tableau : même place horizontale, même largeur, plus bas de la hauteur du bandeau + 14 px.
      const ref = await ctx.newPage();
      await ref.goto(`${BASE}?sans=1&lang=${lang}`, ALLER);
      await ref.waitForSelector('[data-temoin-tableau]');
      await ref.waitForTimeout(300);
      const t0 = await ref.evaluate(() => { const b = document.querySelector('[data-temoin-tableau]').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width) }; });
      ok(t0.x === m.temoin.x && t0.w === m.temoin.w && Math.abs(m.temoin.y - (t0.y + m.bandeau.h + 14)) <= 1,
        `${lang} : le Tableau ne bouge pas, il descend seulement de ${m.bandeau.h + 14} px`, JSON.stringify({ sans: t0, avec: m.temoin, h: m.bandeau.h }));
      if (lang === 'fr') {
        await page.click('.fsbc-btn');
        const apresClic = await page.evaluate(() => ({ essais: window.__essais, ev: window.__evenements.map((x) => x.evenement) }));
        ok(apresClic.essais === 1 && apresClic.ev.includes('cloud_bandeau_clic'), '« Essayer 7 jours » lance le parcours d’achat (une fois) et journalise le clic');
        await page.click('.fsbc-fermer');
        const apres = await page.evaluate(() => ({ present: Boolean(document.querySelector('[data-cloud-bandeau]')), ev: window.__evenements.map((x) => x.evenement), cle: Object.keys(localStorage).find((k) => k.startsWith('fs_bandeau_cloud_ferme:')) }));
        ok(!apres.present && apres.ev.includes('cloud_bandeau_ferme') && apres.cle, '× : le bandeau disparaît, la fermeture est journalisée et retenue');
        await page.goto(`${BASE}?profil=libre&garder=1&plateforme=${plateforme}`, ALLER);
        await page.waitForSelector('[data-temoin-tableau]');
        await page.waitForTimeout(800);
        ok(!(await page.$('[data-cloud-bandeau]')), 'rouvert (rechargement) : il ne revient pas');
      }
      await ctx.close();
    }
    // Moins d'animations : rien ne bouge, état final fixe.
    const ctxR = await nav.newContext({ ...e.ctx, reducedMotion: 'reduce' });
    const pr = await ctxR.newPage();
    await pr.goto(`${BASE}?profil=libre&plateforme=${plateforme}`, ALLER);
    await pr.waitForSelector('[data-cloud-bandeau]');
    await pr.waitForTimeout(400);
    const mr = await pr.evaluate(MESURES);
    ok(mr.animEcran === 'none' && mr.annonceVisible === false, 'moins d’animations : animations coupées, annonces volantes masquées');
    await pr.screenshot({ path: path.join(SORTIE, `bandeau-cloud-${e.nom}-moins-d-animations.png`), fullPage: true });
    await ctxR.close();
    // Jamais : essai déjà pris, client Cloud, appareil non vendable.
    for (const [qs, quoi] of [['profil=essai', 'essai déjà pris'], ['client=1', 'client Cloud'], ['vendable=0', 'Cloud non vendable ici (Android avant la vc37)']]) {
      const c2 = await nav.newContext(e.ctx);
      const p2 = await c2.newPage();
      await p2.goto(`${BASE}?${qs}&plateforme=${plateforme}`, ALLER);
      await p2.waitForSelector('[data-temoin-tableau]');
      await p2.waitForTimeout(800);
      ok(!(await p2.$('[data-cloud-bandeau]')), `${quoi} : aucun bandeau`);
      await c2.close();
    }
  }
} finally {
  await navs.chromium.close();
  await navs.webkit.close();
  stop();
}
console.log(ko ? `\n${ko} CONTRÔLE(S) ROUGE(S)` : '\nTout est vert.');
console.log(`Captures : ${SORTIE}`);
process.exit(ko ? 1 : 0);
