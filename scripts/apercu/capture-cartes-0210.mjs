// Captures PNG + contrôles du bandeau « sortie d'Opla » et de la carte d'avis
// (02/10/2026). Outil de relecture, jamais livré — même patron que
// capture-lot-2309.mjs (vite + playwright, Chrome sans écran).
//
//     node scripts/apercu/capture-cartes-0210.mjs
//
// Ce qu'il PROUVE, en clair ET en sombre, sur téléphone (390 px) et ordinateur
// (1280 px), et dans le popup de l'extension (380 px) :
//   · les textes EXACTS de Nico, la pastille en tête, UN seul bouton principal ;
//   · la géométrie demandée : carte 20 px de rayon et 20 px de marge intérieure,
//     bordure 0,5 px, titre 20 px, texte 14 px / 1,55, icônes en carré de 28 px,
//     tuile de 52 px, bouton principal 48 px / 14 px de rayon, secondaires 44 px ;
//   · la grille de 4 px : toute marge, marge intérieure et espacement des
//     cartes est un multiple de 4 ;
//   · les contrastes AA (≥ 4,5:1) du texte, de la pastille et des boutons ;
//   · « réduire les animations » coupe l'entrée ;
//   · les gestes : « J'ai compris » ferme le bandeau, « Plus tard » / « C'est
//     déjà fait » / « Laisser un avis » rendent leur choix ;
//   · aucun débordement horizontal, aucune erreur de page.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'cartes-0210');
// Vite à froid met plus d'une minute à servir la première page (pré-assemblage
// des dépendances) : on réutilise un serveur déjà chaud si APERCU_PORT est posé.
const PORT = Number(process.env.APERCU_PORT || 5207);
const DEJA_LANCE = !!process.env.APERCU_PORT;
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/cartes-0210.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = DEJA_LANCE ? { pid: 0, stderr: { on() {} } } : spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { if (DEJA_LANCE) return; try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 240000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu dans le délai');
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

const TEXTES_BANDEAU = [
  'Changement de plateforme',
  'Opla : on arrête la publication',
  "Opla demande 1 000 € par mois pour garder son accès. On a refusé : ce n'est pas à toi de payer pour ça. À partir du 2 octobre, FillSell ne publie et ne republie plus sur Opla.",
  'Tes annonces Opla restent synchronisées',
  'Ventes détectées, copies retirées ailleurs',
  'Plus de publication ni de remise en avant',
  'Vinted, Leboncoin, eBay et Beebs continuent normalement.',
  "J'ai compris",
];
const TEXTES_AVIS = ['10 actions, zéro accroc', 'Si FillSell te fait gagner du temps, ton avis nous aide énormément.', 'Laisser un avis', 'Plus tard', "C'est déjà fait"];

// Tout ce que la page doit mesurer, d'un coup, dans le navigateur.
async function mesurer(page) {
  return page.evaluate(() => {
    const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; const [r, g, b] = m.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contraste = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
    // Fond EFFECTIF d'un élément : on remonte jusqu'au premier fond opaque, en
    // composant les fonds translucides rencontrés (pastilles, tuiles en sombre).
    const fondDe = (el) => {
      const couches = [];
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const m = c.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[3]) > 0)) { couches.push(m.map(Number)); if (m.length < 4 || Number(m[3]) >= 0.99) break; }
      }
      let [r, g, b] = [255, 255, 255];
      for (const c of couches.reverse()) { const a = c.length < 4 ? 1 : c[3]; r = c[0] * a + r * (1 - a); g = c[1] * a + g * (1 - a); b = c[2] * a + b * (1 - a); }
      return `rgb(${r},${g},${b})`;
    };
    const px = (v) => Number.parseFloat(v) || 0;
    const multiple4 = (v) => Math.abs(v / 4 - Math.round(v / 4)) < 0.01;
    return [...document.querySelectorAll('.fsc')].map((carte) => {
      const cs = getComputedStyle(carte);
      const titre = carte.querySelector('.fsc-titre');
      const texte = carte.querySelector('.fsc-texte');
      const pastille = carte.querySelector('.fsc-pastille');
      const principaux = [...carte.querySelectorAll('.fsc-btn-principal')];
      const contours = [...carte.querySelectorAll('.fsc-btn-contour')];
      const icos = [...carte.querySelectorAll('.fsc-ico')].map((i) => [i.getBoundingClientRect().width, i.getBoundingClientRect().height]);
      const tuile = carte.querySelector('.fsc-tuile');
      // Grille de 4 px : toute marge / marge intérieure / espacement non nul.
      const horsGrille = [];
      for (const el of [carte, ...carte.querySelectorAll('*')]) {
        if (el.closest('svg') && el.tagName !== 'svg') continue;
        const s = getComputedStyle(el);
        for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
          const v = px(s[prop]);
          if (v && !multiple4(v)) horsGrille.push(`${el.className || el.tagName}.${prop}=${v}`);
        }
      }
      const lignes = [...carte.querySelectorAll('.fsc-ligne')];
      return {
        textes: (carte.innerText || '').split('\n').map((t) => t.trim()).filter(Boolean),
        rayon: px(cs.borderTopLeftRadius), padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
        // Le filet de 0,5 px est une ombre sans flou (une bordure < 1 px est
        // arrondie à 1 px par Chrome) : on le lit dans box-shadow.
        bordure: (() => { const f = cs.boxShadow.match(/0px 0px 0px ([\d.]+)px/); return f ? Number(f[1]) : px(cs.borderTopWidth); })(),
        titre: titre && { taille: px(getComputedStyle(titre).fontSize), interlettre: px(getComputedStyle(titre).letterSpacing), poids: Number(getComputedStyle(titre).fontWeight), contraste: contraste(getComputedStyle(titre).color, fondDe(titre)) },
        texte: texte && { taille: px(getComputedStyle(texte).fontSize), interligne: px(getComputedStyle(texte).lineHeight) / px(getComputedStyle(texte).fontSize), contraste: contraste(getComputedStyle(texte).color, fondDe(texte)) },
        pastille: pastille && { premier: carte.firstElementChild === pastille, contraste: contraste(getComputedStyle(pastille).color, fondDe(pastille)) },
        principaux: principaux.map((b) => ({ h: b.getBoundingClientRect().height, l: b.getBoundingClientRect().width, rayon: px(getComputedStyle(b).borderTopLeftRadius), contraste: contraste(getComputedStyle(b).color, fondDe(b)) })),
        largeurCarte: carte.getBoundingClientRect().width - px(cs.paddingLeft) - px(cs.paddingRight) - 2 * px(cs.borderLeftWidth),
        contours: contours.map((b) => ({ h: b.getBoundingClientRect().height, top: b.getBoundingClientRect().top, contraste: contraste(getComputedStyle(b).color, fondDe(b)) })),
        icos, tuile: tuile && [tuile.getBoundingClientRect().width, tuile.getBoundingClientRect().height],
        separateurs: lignes.slice(1).every((l) => { const a = getComputedStyle(l, '::before'); return a.content !== 'none' && px(a.height) === 1 && /^matrix\(1, 0, 0, 0\.5,/.test(a.transform); }),
        horsGrille,
        animation: cs.animationName,
        aria: { libelle: !!carte.getAttribute('aria-labelledby') || !!carte.closest('[aria-labelledby]'), icosCachees: [...carte.querySelectorAll('.fsc-ico, .fsc-tuile, .fsc-etoiles')].every((i) => i.getAttribute('aria-hidden') === 'true') },
        poidsMax: Math.max(...[carte, ...carte.querySelectorAll('*')].map((e) => Number(getComputedStyle(e).fontWeight) || 400)),
      };
    });
  });
}

function controlerCarte(m, nom, attendus) {
  const textes = m.textes.join(' ¶ ');
  for (const t of attendus) verifier(m.textes.includes(t), `${nom} : texte exact « ${t.slice(0, 48)}${t.length > 48 ? '…' : ''} »`, textes.slice(0, 200));
  verifier(m.rayon === 20, `${nom} : rayon 20 px`, String(m.rayon));
  verifier(m.padding.every((p) => p === 20), `${nom} : marge intérieure 20 px`, m.padding.join('/'));
  verifier(m.bordure === 0.5, `${nom} : filet de 0,5 px`, String(m.bordure));
  verifier(m.titre?.taille === 20 && m.titre.interlettre < 0, `${nom} : titre 20 px, interlettrage serré`, JSON.stringify(m.titre));
  verifier(m.texte?.taille === 14 && Math.abs(m.texte.interligne - 1.55) < 0.02, `${nom} : texte 14 px, interligne 1,55`, JSON.stringify(m.texte));
  verifier(m.titre.contraste >= 4.5 && m.texte.contraste >= 4.5, `${nom} : contraste AA titre ${m.titre.contraste.toFixed(1)}:1 / texte ${m.texte.contraste.toFixed(1)}:1`);
  verifier(m.principaux.length === 1, `${nom} : UN seul bouton principal`, String(m.principaux.length));
  const b = m.principaux[0];
  verifier(b && Math.round(b.h) === 48 && b.rayon === 14 && Math.abs(b.l - m.largeurCarte) < 1, `${nom} : bouton principal 48 px, rayon 14, pleine largeur`, JSON.stringify(b));
  verifier(b && b.contraste >= 4.5, `${nom} : bouton principal lisible ${b?.contraste.toFixed(1)}:1`);
  verifier(m.horsGrille.length === 0, `${nom} : grille de 4 px respectée`, m.horsGrille.slice(0, 6).join(', '));
  verifier(m.poidsMax <= 700, `${nom} : graisse ≤ 700`, String(m.poidsMax));
  verifier(m.aria.libelle && m.aria.icosCachees, `${nom} : titre annoncé, icônes décoratives cachées aux lecteurs d'écran`);
}

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const fichiers = [];
  const cas = [
    // Téléphone : le bandeau seul (sur iOS/Android, l'avis passe par la fenêtre
    // officielle du store, il n'y a pas de carte).
    { scene: 'app', largeur: 390, hauteur: 900, nom: 'tableau-de-bord-mobile', avis: false },
    { scene: 'app', largeur: 1280, hauteur: 900, nom: 'tableau-de-bord-ordinateur', avis: true },
    { scene: 'popup', largeur: 380, hauteur: 700, nom: 'popup-extension', avis: true },
  ];
  for (const c of cas) {
    for (const theme of ['clair', 'sombre']) {
      console.log(`\n── ${c.nom} · ${theme} ──`);
      const page = await navigateur.newPage({ viewport: { width: c.largeur, height: c.hauteur }, deviceScaleFactor: 2 });
      page.setDefaultNavigationTimeout(180000);
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
      await page.goto(`${BASE}#scene=${c.scene}&theme=${theme}${c.avis ? '' : '&avis=0'}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.fsc', { timeout: 180000 });
      await page.waitForTimeout(900);
      verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
      const deborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      verifier(!deborde, `aucun débordement horizontal à ${c.largeur} px`);
      const mesures = await mesurer(page);
      if (c.scene === 'app') {
        verifier(mesures.length === (c.avis ? 2 : 1), c.avis ? 'bandeau puis carte d’avis en tête du tableau de bord' : 'téléphone : le bandeau seul, en tête', String(mesures.length));
        const [bandeau, avis] = mesures;
        controlerCarte(bandeau, 'bandeau Opla', TEXTES_BANDEAU);
        verifier(bandeau.pastille?.premier && bandeau.pastille.contraste >= 4.5, `bandeau Opla : pastille en tête, ${bandeau.pastille?.contraste.toFixed(1)}:1`);
        verifier(bandeau.icos.length === 3 && bandeau.icos.every(([w, h]) => w === 28 && h === 28), 'bandeau Opla : 3 icônes en carré de 28 px', JSON.stringify(bandeau.icos));
        verifier(bandeau.separateurs, 'bandeau Opla : séparateurs fins entre les lignes');
        verifier(bandeau.animation === 'fsc-entree', 'bandeau : entrée animée (fondu + montée)', bandeau.animation);
      }
      if (c.scene === 'app' && c.avis) {
        const avis = mesures[1];
        controlerCarte(avis, 'carte d’avis', TEXTES_AVIS);
        verifier(avis.tuile?.[0] === 52 && avis.tuile?.[1] === 52, 'carte d’avis : tuile de 52 px', JSON.stringify(avis.tuile));
        verifier(avis.contours.length === 2 && avis.contours.every((x) => Math.round(x.h) === 44) && Math.abs(avis.contours[0].top - avis.contours[1].top) < 1, 'carte d’avis : deux boutons contour de 44 px côte à côte', JSON.stringify(avis.contours));
        verifier(avis.contours.every((x) => x.contraste >= 4.5), 'carte d’avis : boutons contour lisibles');
        verifier(avis.animation === 'fsc-entree', 'entrée animée (fondu + montée)', avis.animation);
        const lien = await page.getAttribute('.fsc-btn-principal[href]', 'href');
        verifier(lien === 'https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm/reviews', 'carte d’avis : mène à la page d’avis de l’extension', lien ?? '');
      } else if (c.scene === 'popup') {
        verifier(mesures.length === 1, 'popup : une carte d’avis', String(mesures.length));
        controlerCarte(mesures[0], 'popup · carte d’avis', TEXTES_AVIS);
        verifier(mesures[0].tuile?.[0] === 52, 'popup : tuile de 52 px', JSON.stringify(mesures[0].tuile));
        verifier(mesures[0].contours.length === 2 && mesures[0].contours.every((x) => Math.round(x.h) === 44), 'popup : deux boutons contour de 44 px', JSON.stringify(mesures[0].contours));
      }
      const fichier = `${c.nom}-${theme}.png`;
      await page.screenshot({ path: path.join(SORTIE, fichier), fullPage: false });
      fichiers.push(`screenshots-review/cartes-0210/${fichier}`);
      // Les gestes (sur la variante claire de chaque scène).
      if (theme === 'clair') {
        if (c.scene === 'app') {
          if (c.avis) await page.click('text=Plus tard');
          await page.click("text=J'ai compris");
          await page.waitForTimeout(450);
          const journal = await page.evaluate(() => window.__journal);
          const reste = await page.evaluate(() => document.querySelectorAll('.fsc').length);
          verifier((!c.avis || journal.includes('plus_tard')) && journal.includes('compris') && reste === 0, '« Plus tard » et « J’ai compris » rendent leur choix et ferment les cartes', JSON.stringify({ journal, reste }));
        } else {
          await page.click("text=C'est déjà fait");
          const journal = await page.evaluate(() => window.__journal);
          verifier(journal.includes('deja_fait'), 'popup : « C’est déjà fait » rend son choix', JSON.stringify(journal));
        }
      }
      await page.close();
    }
  }
  // « Réduire les animations » coupe l'entrée.
  const ctx = await navigateur.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(180000);
  await p.goto(`${BASE}#scene=app&theme=clair`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.fsc', { timeout: 180000 });
  await p.waitForTimeout(300);
  const anim = await p.evaluate(() => [...document.querySelectorAll('.fsc')].map((c) => getComputedStyle(c).animationName));
  verifier(anim.length === 2 && anim.every((a) => a === 'none'), '« réduire les animations » : aucune animation', JSON.stringify(anim));
  await navigateur.close();
  console.log('\nCaptures :');
  for (const f of fichiers) console.log(`  ${f}`);
} catch (e) {
  echecs.push(String(e?.stack ?? e));
  console.error(e);
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ tous les contrôles passent');
stop();
process.exit(echecs.length ? 1 : 0);
