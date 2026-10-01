// Capture et PREUVE des barres de progression et de la file des jobs (01/10).
// Outil de relecture, jamais livré — même patron que capture-lot-2309.mjs.
//
//     node scripts/apercu/capture-barres.mjs [chemin/articles.json]
//
// Le fichier d'articles (facultatif, hors dépôt) porte les vrais titres,
// photos et prix — injectés dans la page (window.__APERCU__). Sans lui, des
// articles neutres.
// Pour CHAQUE scène, à 390 px (téléphone) ET 1280 px (ordinateur) :
//   · aucune erreur de page, aucun défilement horizontal ;
//   · chaque barre tient DANS son conteneur, rien ne chevauche le pourcentage ;
//   · un titre trop long est coupé proprement (une ligne, points de suspension) ;
//   · une barre « en cours » BOUGE (transformée relevée à 1 s d'écart) et
//     n'affiche jamais 100 % ni « Terminé » avant la fin ;
// puis les vérifications propres à chaque scène (fin douce, 3 sur 4, file…).
// PNG dans screenshots-review/barres/.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'barres');
const PORT = 5207;
const BASE = `http://localhost:${PORT}/scripts/apercu/barres.html`;
fs.mkdirSync(SORTIE, { recursive: true });
const articles = process.argv[2] && fs.existsSync(process.argv[2]) ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu');
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

// Relevé générique d'une page : barres, débordements, chevauchements.
const RELEVE = () => {
  const r = (el) => el.getBoundingClientRect();
  const dedans = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
  const croise = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const barres = [...document.querySelectorAll('.fsb')].map((b) => {
    const parent = b.parentElement;
    const droite = b.querySelector('.fsb-droite');
    const txt = b.querySelector('.fsb-article-txt') ?? b.querySelector('.fsb-tete .fsb-phrase');
    const titre = b.querySelector('.fsb-article-titre');
    const rempli = b.querySelector('.fsb-rempli');
    return {
      etat: b.dataset.etat, ton: b.dataset.ton,
      dansParent: dedans(r(b), r(parent)),
      chevauche: Boolean(droite && txt && croise(r(droite), r(txt))),
      titreCoupe: titre ? (titre.scrollWidth <= titre.clientWidth || getComputedStyle(titre).textOverflow === 'ellipsis') : true,
      titreUneLigne: titre ? r(titre).height < 26 : true,
      pct: b.querySelector('.fsb-pct')?.textContent ?? null,
      badge: b.querySelector('.fsb-badge')?.textContent ?? null,
      phrase: b.querySelector('.fsb-phrase')?.textContent ?? '',
      t: rempli?.style.transform ?? '',
      v: 100 + Number(((rempli?.style.transform ?? '').match(/-?[\d.]+/) ?? ['-100'])[0]),
    };
  });
  return {
    barres,
    debordeH: document.documentElement.scrollWidth > window.innerWidth + 1,
    texte: document.body.innerText,
  };
};

const SCENES = [
  { nom: 'cartes', attente: 1200 },
  { nom: 'bandeau', attente: 1200 },
  { nom: 'file-typique', attente: 1200 },
  { nom: 'file-vide', attente: 800 },
  { nom: 'file-cinquante', attente: 1200 },
  { nom: 'file-ordinateur', attente: 1000 },
  { nom: 'repub-remise', attente: 1200 },
  { nom: 'repub-arret', attente: 1200 },
  { nom: 'retrait', attente: 1200 },
  { nom: 'suivi-une', attente: 1500 },
  { nom: 'suivi-quatre', attente: 1500 },
  { nom: 'suivi-partiel', attente: 1500 },
  { nom: 'generation-retouche', attente: 1500 },
  { nom: 'generation-fin', attente: 1500 },
  { nom: 'lens-scan', attente: 1200 },
  { nom: 'lens-preparation', attente: 1200 },
];

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [390, 1280]) {
    console.log(`\n══ fenêtre ${largeur} px ══`);
    for (const sc of SCENES) {
      console.log(`── ${sc.nom}`);
      const page = await navigateur.newPage({ viewport: { width: largeur, height: largeur < 500 ? 844 : 900 }, deviceScaleFactor: largeur < 500 ? 2 : 1 });
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
      if (articles) await page.addInitScript((a) => { window.__APERCU__ = a; }, articles);
      await page.goto(`${BASE}#scene=${sc.nom}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForSelector('[data-apercu]', { timeout: 120000 });
      await page.waitForTimeout(sc.attente);
      const a = await page.evaluate(RELEVE);
      await page.waitForTimeout(1000);
      const b = await page.evaluate(RELEVE);
      await page.screenshot({ path: path.join(SORTIE, `${sc.nom}-${largeur}.png`), fullPage: true });
      verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
      verifier(!b.debordeH, 'aucun défilement horizontal');
      verifier(b.barres.every((x) => x.dansParent), 'chaque barre tient dans son conteneur', JSON.stringify(b.barres.filter((x) => !x.dansParent).map((x) => x.phrase)));
      verifier(b.barres.every((x) => !x.chevauche), 'rien ne chevauche le pourcentage ou le badge');
      verifier(b.barres.every((x) => x.titreCoupe && x.titreUneLigne), 'titres longs coupés sur une ligne');
      const enCours = b.barres.map((x, i) => [x, a.barres[i]]).filter(([x, y]) => x.etat === 'en_cours' && y && y.etat === 'en_cours');
      if (enCours.length) verifier(enCours.every(([x, y]) => x.v > y.v), `les barres en cours bougent (${enCours.map(([x, y]) => `${y.v.toFixed(1)}→${x.v.toFixed(1)}`).join(', ')})`);
      verifier(b.barres.every((x) => x.etat === 'termine' || (x.pct !== '100\u202F%' && !/Terminé/.test(x.badge ?? ''))), 'jamais 100 % ni « Terminé » avant la fin');

      // ── Vérifications propres à la scène ──
      if (sc.nom === 'cartes') {
        verifier(b.barres.length === 9, `9 barres compactes (${b.barres.length})`);
        // La séance : Vinted sort du travail à 2,5 s, la barre ne recule pas.
        const vals = [];
        for (let i = 0; i < 12; i++) {
          vals.push(await page.evaluate(() => { const r = document.querySelector('[data-carte="seance"] .fsb-rempli'); return 100 + Number(((r?.style.transform ?? '').match(/-?[\d.]+/) ?? ['-100'])[0]); }));
          await page.waitForTimeout(200);
        }
        verifier(vals.every((x, i) => i === 0 || x >= vals[i - 1] - 0.01), `une plateforme finit avant l'autre : la barre ne recule jamais (${vals.map((x) => x.toFixed(0)).join('→')})`);
        await page.waitForTimeout(300);
        const fin = await page.evaluate(RELEVE);
        verifier(fin.barres.some((x) => x.etat === 'termine' && /Terminé/.test(x.badge ?? '')), 'la carte qui finit : 100 % et « Terminé » avec la coche');
        await page.screenshot({ path: path.join(SORTIE, `cartes-fin-${largeur}.png`), fullPage: true });
        await page.waitForTimeout(5500);
        const apres = await page.evaluate(RELEVE);
        verifier(apres.barres.length === 8, `puis sa barre s'efface (${apres.barres.length} barres)`);
        await page.click('[data-carte] .fsb-haut');
        verifier(await page.evaluate(() => window.__fileOuverte === 1), 'un tap sur la barre ouvre la file (et ne remonte pas à la carte)');
      }
      if (sc.nom === 'bandeau') {
        verifier(b.barres[0]?.etat === 'en_cours' && b.barres[0].v > 40 - 0.1 && b.barres[0].v < 60, `bandeau : posé sur 2 sur 5 et glisse vers 3 sur 5 (${b.barres[0]?.v.toFixed(1)} %)`);
        await page.waitForTimeout(1500);
        const c = await page.evaluate(RELEVE);
        verifier(c.barres[1]?.etat === 'pause' && Math.abs(c.barres[1].v - b.barres[1].v) < 0.2 && Math.abs(c.barres[1].v - 99 / 3) < 0.5, `ordinateur muet : posée sur 1 sur 3 (${c.barres[1]?.v.toFixed(1)} %), elle ne bouge plus`);
      }
      if (sc.nom === 'file-typique') {
        for (const g of ['EN COURS', 'À VENIR · 2', 'EN PAUSE · 3', 'UN GESTE À FAIRE · 2']) verifier(b.texte.toUpperCase().includes(g), `groupe « ${g} »`);
        verifier(/3 en cours ou à venir · 3 en pause · 2 gestes à faire/.test(b.texte), 'compteur en tête');
        verifier(/En pause jusqu'à \d\d:\d\d \(rythme de republication\)/.test(b.texte), 'pause avec heure connue (heure de Paris)');
        verifier(/Nouvel essai à \d\d:\d\d/.test(b.texte), 'nouvel essai à une heure connue');
        verifier(b.texte.includes('En attente, ton annonce est intacte'), 'retenue serveur : « ton annonce est intacte »');
        verifier(b.texte.includes('connecte-toi à Beebs'), 'le geste de connexion');
        verifier(b.barres.length === 1 && /photos|Retrait/.test(b.barres[0].phrase), 'le job en cours porte SA barre (une seule)');
      }
      if (sc.nom === 'file-vide') verifier(b.texte.includes('Rien en cours ni à venir'), 'file vide : une phrase claire');
      if (sc.nom === 'file-cinquante') {
        verifier(/50 en cours ou à venir/.test(b.texte), 'file de 50 : le compte exact');
        const defile = await page.evaluate(() => { const c = [...document.querySelectorAll('[role="dialog"] div')].find((d) => getComputedStyle(d).overflowY === 'auto'); return c ? c.scrollHeight > c.clientHeight : false; });
        verifier(defile, 'la liste défile, l’en-tête reste');
      }
      if (sc.nom === 'file-ordinateur') verifier((b.texte.match(/En attente de ton ordinateur/g) ?? []).length === 2 && b.texte.includes('Part de nos serveurs'), 'Chrome fermé : « En attente de ton ordinateur », eBay par nos serveurs à part');
      if (sc.nom === 'repub-remise') verifier(/remise en ligne vers \d\d:\d\d/.test(b.barres[0]?.phrase ?? ''), 'republication : « remise en ligne vers HH:MM »');
      if (sc.nom === 'repub-arret') verifier(b.barres[0]?.etat === 'echec' && b.barres[0]?.ton === 'action', 'republication arrêtée : barre orange, arrêtée');
      if (sc.nom === 'retrait') verifier(b.barres.length === 1 && /Retrait en cours/.test(b.barres[0].phrase), 'le retrait en cours a sa barre compacte');
      if (sc.nom === 'suivi-partiel') {
        const titre = await page.evaluate(() => document.querySelector('.fsn-h')?.textContent ?? '');
        verifier(/3 sur 4/.test(b.barres[0]?.badge ?? '') && b.barres[0]?.etat === 'partiel' && !/Terminé/.test(titre), `une plateforme bloque : « 3 sur 4 », jamais « Terminé » (titre : « ${titre} »)`);
      }
      if (sc.nom === 'suivi-quatre') verifier(b.barres.length === 1 && b.texte.includes('Vinted') && b.texte.includes('Beebs'), 'une barre d’ensemble et une ligne par plateforme');
      if (sc.nom === 'generation-fin') {
        let fin = null;
        for (let i = 0; i < 40; i++) { fin = await page.evaluate(RELEVE); if (fin.barres[0]?.etat === 'termine') break; await page.waitForTimeout(100); }
        verifier(fin.barres[0]?.etat === 'termine' && /Terminé/.test(fin.barres[0]?.badge ?? ''), 'rédaction finie : la barre arrive à 100 % et « Terminé »');
        await page.screenshot({ path: path.join(SORTIE, `generation-fin-terminee-${largeur}.png`), fullPage: true });
        await page.waitForTimeout(1200);
        verifier(await page.evaluate(() => Boolean(document.querySelector('[data-annonces]')) && !document.querySelector('.fsb')), 'puis les annonces remplacent la barre');
      }
      if (sc.nom === 'lens-scan') {
        await page.waitForTimeout(3500);
        const fin = await page.evaluate(RELEVE);
        verifier(/Analyse de l'article/.test(fin.barres[0]?.phrase ?? ''), 'Lens : photos envoyées une à une, puis l’analyse');
      }
      await page.close();
    }
  }
  await navigateur.close();
} catch (e) {
  console.error(e);
  echecs.push(String(e));
}
console.log(echecs.length ? `\n✗ ${echecs.length} vérification(s) en échec` : '\n✓ toutes les vérifications passent');
process.exit(echecs.length ? 1 : 0);
