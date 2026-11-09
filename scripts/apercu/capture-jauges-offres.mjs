// Preuve des carrés des jauges au tap (maquette « les carrés au tap » validée par Nico, intégrée le 09/11/2026).
// Outil de relecture, jamais livré. VRAIE feuille des offres (ConversionModal) et VRAI « Ton plan » (PlanDetailsModal),
// grille à 3 jauges allumée, faux Supabase (scripts/apercu/jauges-offres.jsx). Fuseau Europe/Paris.
//
//   node scripts/apercu/capture-jauges-offres.mjs [--formats=chrome-390,iphone-se] [--langs=fr]
//
// Formats : Chrome 1440, 390 et 320 (souris) ; WebKit iPhone SE et iPhone 15 Pro Max (toucher). FR et EN. Vues :
// feuille des offres de chaque palier (Free, Premium, Pro, Business) et « Ton plan » (Premium, Pro, Business).
// Mesure, pour CHAQUE carré : bouton réel (aria-haspopup="dialog", aria-expanded, nom accessible), ≥ 44 px, le « i »
// sans chevauchement du chiffre ni du mot (rectangles du texte), chiffre et mot sur une ligne, sans débordement,
// contrastes (texte ≥ 4,5:1, « i » ≥ 3:1 et relevé) ; ouverture au tap / clic (dialog, aria-modal, titre relié, focus
// dans la feuille), EXEMPLE avec un logo chargé devant chaque plateforme, fermeture (croix, fond, Échap) en tournant,
// focus rendu au carré, l'hôte jamais fermé ; une fois par vue : appui long, clavier (Entrée, Tab, Échap), clic dans
// la feuille ; une fois par format : mouvement réduit. Ligne commune « Dans tous les forfaits » : 5 logos chargés,
// chacun devant son nom, insécables. Débordement de page. Captures PNG dans screenshots-review/ (ignoré par git).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5263;
const ARGS = process.argv.slice(2);
const formatsVoulus = ARGS.find((a) => a.startsWith('--formats='))?.split('=')[1]?.split(',');
const langsVoulues = ARGS.find((a) => a.startsWith('--langs='))?.split('=')[1]?.split(',') ?? ['fr', 'en'];
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', process.env.APERCU_VITE_CONFIG ?? 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/jauges-offres.html`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const FORMATS = [
  { nom: 'chrome-1440', moteur: 'chromium', toucher: false, ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'chrome-390', moteur: 'chromium', toucher: false, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
  { nom: 'chrome-320', moteur: 'chromium', toucher: false, ctx: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 } },
  { nom: 'iphone-se', moteur: 'webkit', toucher: true, ctx: { ...devices['iPhone SE (3rd gen)'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', toucher: true, ctx: { ...devices['iPhone 15 Pro Max'] } },
].filter((f) => !formatsVoulus || formatsVoulus.includes(f.nom));
const VUES = [
  ['offres', 'free'], ['offres', 'premium'], ['offres', 'pro'], ['offres', 'business'],
  ['plan', 'premium'], ['plan', 'pro'], ['plan', 'business'],
];
const TITRES = { fr: { annonces: 'Annonces', publications: 'Publications', remontees: 'Remontées' }, en: { annonces: 'Listings', publications: 'Publications', remontees: 'Bumps' } };
const QUESTION = { fr: "qu'est-ce que ça compte ?", en: 'what does it count?' };

// ── Outils injectés dans la page ─────────────────────────────────────────────
const OUTILS = () => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const sur = (h, b) => ({ r: h.r * h.a + b.r * (1 - h.a), g: h.g * h.a + b.g * (1 - h.a), b: h.b * h.a + b.b * (1 - h.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Les fonds possibles sous un élément : couleurs de fond composées depuis la racine ; un dégradé ajoute ses arrêts
  // comme fonds possibles (le pire est retenu : estimation prudente).
  const fondsSous = (el) => {
    const chaine = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) chaine.unshift(e);
    let fonds = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const e of chaine) {
      const cs = getComputedStyle(e);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) fonds = fonds.map((f) => sur(bg, f));
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        const arrets = [...img.matchAll(/rgba?\([^)]+\)/g)].map((x) => parse(x[0])).filter((c) => c && c.a > 0);
        const plus = [];
        for (const f of fonds) for (const c of arrets) plus.push(sur(c, f));
        fonds = [...fonds, ...plus].slice(0, 40);
      }
    }
    return fonds;
  };
  const contraste = (el, couleur = null) => {
    const c = parse(couleur ?? getComputedStyle(el).color);
    let op = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= Number(getComputedStyle(e).opacity) || 1;
    return Math.min(...fondsSous(el).map((f) => ratio(sur({ ...c, a: c.a * op }, f), f)));
  };
  const rectsTexte = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
  };
  const lignes = (rects) => new Set(rects.map((x) => Math.round(x.top / 3))).size;
  const chevauche = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  // Un texte coupé ou qui déborde : chaque nœud de texte visible doit tenir dans la boîte de son élément ET dans celle
  // de chaque ancêtre qui rogne (overflow autre que visible), racine comprise.
  const debordants = (racine) => {
    const res = [];
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest('style, svg, script')) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5);
      if (!rects.length) continue;
      const boites = [el.getBoundingClientRect()];
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX !== 'visible' || a === racine) boites.push(a.getBoundingClientRect());
        if (a === racine) break;
      }
      const hors = rects.some((t) => boites.some((b) => t.left < b.left - 1 || t.right > b.right + 1));
      if (hors) res.push(`${el.tagName.toLowerCase()}[${n.textContent.trim().slice(0, 30)}]`);
    }
    return res;
  };
  // Les logos d'un texte : chaque nom de plateforme écrit doit avoir son logo chargé juste devant, sur la même ligne.
  const logosDe = (racine) => {
    const NOMS = ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'];
    const texte = racine.textContent;
    const ecrits = NOMS.flatMap((n) => [...texte.matchAll(new RegExp(`\\b${n}\\b`, 'g'))].map(() => n));
    const blocs = [...racine.querySelectorAll('[data-plateforme-logo]')];
    const defauts = [];
    for (const b of blocs) {
      const nom = b.getAttribute('data-plateforme-logo');
      const img = b.firstElementChild;
      if (!img || img.tagName !== 'IMG') { defauts.push(`${nom}: pas d'image devant`); continue; }
      if (!img.complete || !(img.naturalWidth > 0)) defauts.push(`${nom}: image non chargée (${img.getAttribute('src')})`);
      if (!new RegExp(`logo-${nom.toLowerCase()}`).test(img.getAttribute('src'))) defauts.push(`${nom}: mauvais logo ${img.getAttribute('src')}`);
      if (b.textContent !== nom) defauts.push(`${nom}: texte « ${b.textContent} »`);
      if (getComputedStyle(b).whiteSpace !== 'nowrap') defauts.push(`${nom}: pas insécable`);
      const ri = img.getBoundingClientRect();
      const rt = rectsTexte(b).filter((r) => r.left >= ri.right - 1);
      if (!rt.length || !(Math.min(ri.bottom, rt[0].bottom) - Math.max(ri.top, rt[0].top) > 2) || ri.right > rt[0].left + 1) defauts.push(`${nom}: logo pas devant le nom sur la même ligne`);
      if (ri.width < 8 || ri.height < 8) defauts.push(`${nom}: logo trop petit ${ri.width}×${ri.height}`);
    }
    if (blocs.length !== ecrits.length) defauts.push(`${ecrits.length} noms écrits pour ${blocs.length} logos`);
    return { noms: ecrits, logos: blocs.length, defauts };
  };
  window.__outils = { contraste, rectsTexte, lignes, chevauche, debordants, logosDe };
};

const RELEVE_CARRES = () => {
  const O = window.__outils;
  const res = [];
  document.querySelectorAll('[data-carre-jauge]').forEach((b, i) => {
    b.setAttribute('data-idx-test', String(i));
    const carte = b.closest('[data-jauges-carte]')?.getAttribute('data-jauges-carte');
    const rb = b.getBoundingClientRect();
    const info = b.querySelector('[data-carre-info] svg');
    const chiffre = b.querySelector('[data-carre-chiffre]');
    const mot = b.querySelector('[data-carre-mot]');
    const ri = info?.getBoundingClientRect();
    const rc = O.rectsTexte(chiffre);
    const rm = O.rectsTexte(mot);
    const dedans = (r) => r.left >= rb.left - 0.5 && r.right <= rb.right + 0.5 && r.top >= rb.top - 0.5 && r.bottom <= rb.bottom + 0.5;
    res.push({
      i, carte, cle: b.getAttribute('data-carre-jauge'),
      balise: b.tagName, type: b.getAttribute('type'), haspopup: b.getAttribute('aria-haspopup'), expanded: b.getAttribute('aria-expanded'),
      nom: b.getAttribute('aria-label'), texte: `${chiffre.textContent} ${mot.textContent}`.replace(/\s+/g, ' ').trim(), sombre: b.classList.contains('fs-sombre'),
      h: Math.round(rb.height * 10) / 10, w: Math.round(rb.width * 10) / 10,
      iPresent: Boolean(info && ri.width > 0), iDansCarre: Boolean(ri && dedans(ri)), iEnHautADroite: Boolean(ri && ri.top - rb.top < 12 && rb.right - ri.right < 12),
      iSurChiffre: Boolean(ri && rc.some((r) => O.chevauche(ri, r))), iSurMot: Boolean(ri && rm.some((r) => O.chevauche(ri, r))),
      // La bande du « i » : sa boîte finit avant la ligne du chiffre (boîte de ligne de l'élément, pas l'encre).
      iAuDessus: Boolean(ri && ri.bottom <= chiffre.getBoundingClientRect().top + 0.5),
      ecartIChiffre: ri ? Math.round((chiffre.getBoundingClientRect().top - ri.bottom) * 10) / 10 : null,
      lignesChiffre: O.lignes(rc), lignesMot: O.lignes(rm),
      texteDansCarre: [...rc, ...rm].every(dedans),
      debordeChiffre: chiffre.scrollWidth > chiffre.clientWidth + 1, debordeMot: mot.scrollWidth > mot.clientWidth + 1,
      cChiffre: Math.round(O.contraste(chiffre) * 100) / 100, cMot: Math.round(O.contraste(mot) * 100) / 100,
      cInfo: info ? Math.round(O.contraste(info.parentElement) * 100) / 100 : 0,
      cParMois: (() => { const pm = b.closest('[data-jauges-carte]').lastElementChild; return Math.round(O.contraste(pm) * 100) / 100; })(),
    });
  });
  return res;
};

const RELEVE_PAGE = () => {
  const O = window.__outils;
  const commun = document.querySelector('[data-texte-logos]')?.closest('div');
  const tuiles = [...document.querySelectorAll('[data-jauges-carte]')];
  const feuille = tuiles[0]?.closest('[style*="overflow"]');
  return {
    debordePage: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    debordeFeuille: feuille ? feuille.scrollWidth > feuille.clientWidth + 1 : null,
    debordants: tuiles.flatMap((t) => O.debordants(t.parentElement)).slice(0, 10),
    cartesHorsEcran: tuiles.filter((t) => t.getBoundingClientRect().right > window.innerWidth + 0.5 || t.getBoundingClientRect().left < -0.5).length,
    commun: commun ? { ...O.logosDe(commun.querySelector('[data-texte-logos]')), texte: commun.innerText.replace(/\s+/g, ' ').trim(), debordants: O.debordants(commun) } : null,
    polices: document.fonts.check('700 17px "Space Grotesk"'),
  };
};

const RELEVE_FEUILLE = () => {
  const O = window.__outils;
  const racine = document.querySelector('[data-explication-jauge]');
  if (!racine) return null;
  const dlg = racine.querySelector('[role="dialog"]');
  const titreId = dlg?.getAttribute('aria-labelledby');
  const titre = titreId ? document.getElementById(titreId) : null;
  const fermer = racine.querySelector('[data-fermer-jauge]');
  const rf = fermer.getBoundingClientRect();
  const rd = dlg.getBoundingClientRect();
  const exemple = racine.querySelector('[data-exemple-jauge]');
  const textes = [...dlg.querySelectorAll('h2, p, strong, [data-exemple-jauge] > div')];
  const cs = getComputedStyle(dlg);
  return {
    cle: racine.getAttribute('data-explication-jauge'),
    role: dlg?.getAttribute('role'), modal: dlg?.getAttribute('aria-modal'), titre: titre?.textContent ?? null,
    description: document.getElementById(dlg.getAttribute('aria-describedby') ?? '')?.textContent ?? null,
    focusDedans: dlg.contains(document.activeElement), focusSurFermer: document.activeElement === fermer,
    fermerNom: fermer.getAttribute('aria-label'), fermerW: Math.round(rf.width), fermerH: Math.round(rf.height),
    dansEcran: rd.left >= -0.5 && rd.right <= window.innerWidth + 0.5 && rd.bottom <= window.innerHeight + 0.5,
    defile: dlg.scrollHeight > dlg.clientHeight + 1, hauteur: Math.round(rd.height),
    debordants: O.debordants(dlg), debordeH: dlg.scrollWidth > dlg.clientWidth + 1,
    exemple: O.logosDe(exemple.querySelector('[data-texte-logos]')),
    contrasteMin: Math.round(Math.min(...textes.map((t) => O.contraste(t))) * 100) / 100,
    zIndex: getComputedStyle(racine).zIndex, animation: cs.animationName,
    texte: dlg.textContent.replace(/\s+/g, ' ').trim(),
  };
};

const navs = { chromium: await chromium.launch({ channel: 'chrome' }), webkit: await webkit.launch() };
const bilan = {};
const releve = {};
const rouges = [];
const ok = (fmt, cond, msg) => {
  bilan[fmt] ??= { verts: 0, rouges: 0 };
  if (cond) bilan[fmt].verts++;
  else { bilan[fmt].rouges++; rouges.push(`${fmt} · ${msg}`); }
};

const attendre = async (page, f, arg, ms = 3000) => {
  const fin = Date.now() + ms;
  for (;;) { if (await page.evaluate(f, arg)) return true; if (Date.now() > fin) return false; await page.waitForTimeout(40); }
};
const ouverte = (cle) => { const r = document.querySelector('[data-explication-jauge]'); return cle ? r?.getAttribute('data-explication-jauge') === cle : Boolean(r); };
const fermee = () => !document.querySelector('[data-explication-jauge]');

try {
  for (const f of FORMATS) {
    for (const lang of langsVoulues) {
      for (const [vue, palier] of VUES) {
        const nomVue = `${f.nom}/${lang}/${vue}-${palier}`;
        const ctx = await navs[f.moteur].newContext({ ...f.ctx, timezoneId: 'Europe/Paris', locale: lang === 'en' ? 'en-US' : 'fr-FR' });
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e.message)));
        await page.goto(`${BASE}?vue=${vue}&palier=${palier}&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForSelector('[data-carre-jauge]', { timeout: 30000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        await page.evaluate(OUTILS);
        await attendre(page, () => [...document.querySelectorAll('[data-plateforme-logo] img')].every((i) => i.complete), null, 5000);
        const carres = await page.evaluate(RELEVE_CARRES);
        const pg = await page.evaluate(RELEVE_PAGE);
        releve[nomVue] = { carres, page: pg, feuilles: [] };
        ok(f.nom, erreurs.length === 0, `${nomVue} : erreurs JS ${erreurs.join(' | ')}`);
        ok(f.nom, carres.length > 0 || (vue === 'offres' && palier === 'business'), `${nomVue} : aucun carré`);
        ok(f.nom, !pg.debordePage, `${nomVue} : la page déborde en largeur`);
        ok(f.nom, pg.debordeFeuille !== true, `${nomVue} : la feuille déborde en largeur`);
        ok(f.nom, pg.debordants.length === 0, `${nomVue} : texte qui déborde ${pg.debordants.join(' ; ')}`);
        ok(f.nom, pg.cartesHorsEcran === 0, `${nomVue} : carte hors écran`);
        ok(f.nom, pg.polices, `${nomVue} : Space Grotesk non chargée`);
        if (vue === 'offres' && pg.commun) {
          ok(f.nom, pg.commun.noms.length === 5 && pg.commun.logos === 5 && pg.commun.defauts.length === 0,
            `${nomVue} : ligne commune ${pg.commun.noms.join(',')} / ${pg.commun.logos} logos ${pg.commun.defauts.join(' ; ')}`);
          ok(f.nom, pg.commun.debordants.length === 0, `${nomVue} : ligne commune déborde ${pg.commun.debordants.join(' ; ')}`);
        }
        for (const c of carres) {
          const q = `${nomVue} carré ${c.carte}/${c.cle}`;
          ok(f.nom, c.balise === 'BUTTON' && c.type === 'button' && c.haspopup === 'dialog' && c.expanded === 'false', `${q} : bouton/aria ${c.balise} ${c.haspopup} ${c.expanded}`);
          ok(f.nom, String(c.nom).replace(/\s+/g, ' ') === `${c.texte} — ${QUESTION[lang]}`, `${q} : nom accessible « ${c.nom} » (texte « ${c.texte} »)`);
          ok(f.nom, c.h >= 44 && c.w >= 44, `${q} : ${c.w}×${c.h} < 44`);
          ok(f.nom, c.iPresent && c.iDansCarre && c.iEnHautADroite && c.iAuDessus, `${q} : « i » placé ${JSON.stringify({ p: c.iPresent, d: c.iDansCarre, hd: c.iEnHautADroite, dessus: c.iAuDessus })}`);
          ok(f.nom, !c.iSurChiffre && !c.iSurMot, `${q} : « i » sur le chiffre ou le mot`);
          ok(f.nom, c.lignesChiffre === 1 && c.lignesMot === 1 && c.texteDansCarre && !c.debordeChiffre && !c.debordeMot,
            `${q} : texte coupé (lignes ${c.lignesChiffre}/${c.lignesMot}, dedans ${c.texteDansCarre}, déborde ${c.debordeChiffre}/${c.debordeMot})`);
          ok(f.nom, c.cChiffre >= 4.5 && c.cMot >= 4.5 && c.cParMois >= 4.5, `${q} : contraste chiffre ${c.cChiffre} mot ${c.cMot} par mois ${c.cParMois}`);
          ok(f.nom, c.cInfo >= 3, `${q} : contraste du « i » ${c.cInfo}`);
        }

        // ── Captures des cartes et de la ligne commune ──
        const prefixe = `jauges-${f.nom}-${lang}-${vue}-${palier}`;
        const cartes = [...new Set(carres.map((c) => c.carte))];
        for (const carte of cartes) {
          const loc = page.locator(`[data-jauges-carte="${carte}"]`).first().locator('xpath=..');
          await loc.scrollIntoViewIfNeeded();
          await loc.screenshot({ path: path.join(SORTIE, `${prefixe}-carte-${carte}.png`) }).catch(() => {});
        }
        if (vue === 'offres' && pg.commun) {
          const loc = page.locator('[data-texte-logos]').first().locator('xpath=ancestor::div[2]');
          await loc.scrollIntoViewIfNeeded();
          await loc.screenshot({ path: path.join(SORTIE, `${prefixe}-commun.png`) }).catch(() => {});
        }

        // ── Chaque carré : ouvrir, relever la feuille, fermer (croix, fond, Échap en tournant) ──
        const METHODES = ['croix', 'fond', 'echap'];
        let n = 0;
        for (const c of carres) {
          const loc = page.locator(`[data-idx-test="${c.i}"]`);
          const methodes = c.i === carres[0].i ? METHODES : [METHODES[n % 3]];
          n++;
          for (const m of methodes) {
            const q = `${nomVue} carré ${c.carte}/${c.cle} (${m})`;
            await loc.scrollIntoViewIfNeeded();
            if (f.toucher) await loc.tap(); else await loc.click();
            const vu = await attendre(page, ouverte, c.cle);
            ok(f.nom, vu, `${q} : la feuille ne s'ouvre pas`);
            if (!vu) continue;
            // La feuille monte en 0,26 s : on mesure une fois les animations finies (sous charge, WebKit traîne).
            await page.evaluate(() => Promise.race([
              Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
              new Promise((r) => setTimeout(r, 2500)),
            ]));
            await page.waitForTimeout(60);
            const fe = await page.evaluate(RELEVE_FEUILLE);
            releve[nomVue].feuilles.push({ carre: `${c.carte}/${c.cle}`, ...fe });
            ok(f.nom, (await loc.getAttribute('aria-expanded')) === 'true', `${q} : aria-expanded pas à true`);
            ok(f.nom, fe.role === 'dialog' && fe.modal === 'true' && fe.titre === TITRES[lang][c.cle], `${q} : dialog/aria-modal/titre ${fe.role} ${fe.modal} ${fe.titre}`);
            ok(f.nom, fe.focusDedans && fe.focusSurFermer, `${q} : focus pas dans la feuille`);
            ok(f.nom, fe.fermerW >= 44 && fe.fermerH >= 44 && fe.fermerNom === (lang === 'en' ? 'Close' : 'Fermer'), `${q} : bouton fermer ${fe.fermerW}×${fe.fermerH} « ${fe.fermerNom} »`);
            ok(f.nom, fe.dansEcran && !fe.debordeH && fe.debordants.length === 0, `${q} : feuille hors écran ou débordante ${fe.debordants.join(' ; ')}`);
            // L'exemple des annonces ne nomme aucune plateforme ; publications et remontées en nomment 3 et 2.
            const attendus = { annonces: 0, publications: 3, remontees: 2 }[c.cle];
            ok(f.nom, fe.exemple.defauts.length === 0 && fe.exemple.logos === attendus && fe.exemple.noms.length === attendus, `${q} : logos de l'exemple ${fe.exemple.noms.join(',')} (${fe.exemple.logos}/${attendus}) ${fe.exemple.defauts.join(' ; ')}`);
            ok(f.nom, fe.contrasteMin >= 4.5, `${q} : contraste de la feuille ${fe.contrasteMin}`);
            ok(f.nom, Number(fe.zIndex) > 10100, `${q} : z-index ${fe.zIndex}`);
            if (vue === 'offres' && palier === 'free' && c.carte === 'pro' && m === methodes[0]) {
              await page.screenshot({ path: path.join(SORTIE, `${prefixe}-feuille-${c.cle}.png`) });
            }
            if (m === 'croix') { if (f.toucher) await page.locator('[data-fermer-jauge]').tap(); else await page.locator('[data-fermer-jauge]').click(); }
            else if (m === 'fond') { const v = page.viewportSize(); if (f.toucher) await page.touchscreen.tap(Math.round(v.width / 2), 6); else await page.mouse.click(Math.round(v.width / 2), 6); }
            else await page.keyboard.press('Escape');
            const parti = await attendre(page, fermee);
            ok(f.nom, parti, `${q} : la feuille ne se ferme pas`);
            const apres = await page.evaluate((i) => ({
              focus: document.activeElement?.getAttribute('data-idx-test') === String(i),
              expanded: document.querySelector(`[data-idx-test="${i}"]`)?.getAttribute('aria-expanded'),
              hote: document.querySelectorAll('[data-carre-jauge]').length > 0 && !window.__gestes.some((g) => g.nom === 'fermer'),
            }), c.i);
            ok(f.nom, apres.focus, `${q} : focus pas rendu au carré`);
            ok(f.nom, apres.expanded === 'false', `${q} : aria-expanded resté ${apres.expanded}`);
            ok(f.nom, apres.hote, `${q} : l'hôte s'est fermé`);
          }
        }

        // ── Une fois par vue : appui long, clic dans la feuille, clavier ──
        if (carres.length) {
          const c = carres[carres.length - 1];
          const q = `${nomVue} carré ${c.carte}/${c.cle}`;
          const loc = page.locator(`[data-idx-test="${c.i}"]`);
          await loc.scrollIntoViewIfNeeded();
          await loc.dispatchEvent('pointerdown', { button: 0, pointerType: f.toucher ? 'touch' : 'mouse', isPrimary: true, bubbles: true });
          await page.waitForTimeout(250);
          ok(f.nom, await page.evaluate(fermee), `${q} : appui court (250 ms) a ouvert`);
          await page.waitForTimeout(400);
          ok(f.nom, await page.evaluate(ouverte, c.cle), `${q} : l'appui long n'ouvre pas`);
          await loc.dispatchEvent('pointerup', { button: 0, pointerType: f.toucher ? 'touch' : 'mouse', isPrimary: true, bubbles: true });
          await loc.dispatchEvent('click');
          await page.locator('[data-fond-jauge]').dispatchEvent('click');
          await page.waitForTimeout(150);
          ok(f.nom, await page.evaluate(ouverte, c.cle), `${q} : le relâcher de l'appui long a refermé la feuille`);
          if (f.toucher) await page.locator('[data-exemple-jauge]').tap(); else await page.locator('[data-exemple-jauge]').click();
          await page.waitForTimeout(150);
          ok(f.nom, await page.evaluate(ouverte, c.cle) && await page.evaluate(() => !window.__gestes.some((g) => g.nom === 'fermer')), `${q} : un clic dans la feuille la ferme (ou ferme l'hôte)`);
          await page.keyboard.press('Escape');
          ok(f.nom, await attendre(page, fermee), `${q} : Échap après appui long`);
          // Clavier
          await page.evaluate((i) => document.querySelector(`[data-idx-test="${i}"]`).focus(), c.i);
          await page.keyboard.press('Enter');
          ok(f.nom, await attendre(page, ouverte, c.cle), `${q} : Entrée n'ouvre pas`);
          await page.waitForTimeout(100);
          await page.keyboard.press('Tab');
          ok(f.nom, await page.evaluate(() => document.activeElement?.hasAttribute('data-fermer-jauge')), `${q} : Tab sort de la feuille`);
          await page.keyboard.press('Shift+Tab');
          ok(f.nom, await page.evaluate(() => document.activeElement?.hasAttribute('data-fermer-jauge')), `${q} : Maj+Tab sort de la feuille`);
          await page.keyboard.press('Escape');
          ok(f.nom, await attendre(page, fermee), `${q} : Échap (clavier) ne ferme pas`);
          ok(f.nom, await page.evaluate((i) => document.activeElement?.getAttribute('data-idx-test') === String(i), c.i), `${q} : focus pas rendu (clavier)`);
          ok(f.nom, await page.evaluate(() => !window.__gestes.some((g) => g.nom === 'fermer') && document.querySelectorAll('[data-carre-jauge]').length > 0), `${q} : l'hôte s'est fermé (Échap)`);
        }
        await ctx.close();
        console.log(`${nomVue.padEnd(44)} carrés=${String(carres.length).padStart(2)} ${bilan[f.nom] ? `verts=${bilan[f.nom].verts} rouges=${bilan[f.nom].rouges}` : ''}`);
      }
    }
    // ── Mouvement réduit (une fois par format) ──
    {
      const ctx = await navs[f.moteur].newContext({ ...f.ctx, timezoneId: 'Europe/Paris', locale: 'fr-FR', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${BASE}?vue=offres&palier=free&lang=fr`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForSelector('[data-carre-jauge]', { timeout: 30000 });
      const carre = page.locator('[data-jauges-carte="pro"] [data-carre-jauge="annonces"]');
      await carre.scrollIntoViewIfNeeded();
      const tr = await carre.evaluate((b) => getComputedStyle(b).transitionDuration);
      if (f.toucher) await carre.tap(); else await carre.click();
      await attendre(page, ouverte, 'annonces');
      const anim = await page.evaluate(() => [getComputedStyle(document.querySelector('.fs-jauge-feuille')).animationName, getComputedStyle(document.querySelector('.fs-jauge-fond')).animationName]);
      ok(f.nom, anim.every((a) => a === 'none') && /^0s(, 0s)*$/.test(tr), `mouvement réduit : animations ${anim.join(',')} transition ${tr}`);
      await ctx.close();
    }
  }
} finally {
  await navs.chromium.close();
  await navs.webkit.close();
  stop();
}
fs.writeFileSync(path.join(SORTIE, 'jauges-offres-releve.json'), JSON.stringify(releve, null, 1));
console.log('\nBILAN PAR FORMAT');
for (const [fmt, b] of Object.entries(bilan)) console.log(`  ${fmt.padEnd(20)} ${b.verts} verts, ${b.rouges} rouges`);
if (rouges.length) { console.log('\nROUGES'); for (const r of rouges.slice(0, 80)) console.log(`  ✗ ${r}`); if (rouges.length > 80) console.log(`  … ${rouges.length - 80} de plus`); }
console.log(`\nRelevé : ${path.join(SORTIE, 'jauges-offres-releve.json')} · captures : ${SORTIE}${path.sep}jauges-*.png`);
process.exit(rouges.length ? 1 : 0);
