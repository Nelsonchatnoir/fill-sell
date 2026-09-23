// Capture PNG de l'aperçu « lot zéro régression du 23/09 ». Outil de relecture,
// jamais livré — même patron que capture-bloc-general.mjs.
//
//     node scripts/apercu/capture-lot-2309.mjs
//
// Ce qu'il PROUVE, en plus de montrer (à 440 px ET à 360 px de fenêtre) :
//   · aucun texte posé sur la photo d'une carte hors la pastille d'état et la
//     quantité, toutes deux sur fond OPAQUE ;
//   · la bande .gmur est opaque et son texte contraste à 4,5:1 au moins ;
//   · le mur Opla porte UN message et UN bouton « Autoriser Opla » ;
//   · la session fermée porte « Me connecter », jamais « Autoriser Opla » ;
//   · les puces de versions existent sous le titre et la description, et un
//     tap pose le texte de la plateforme dans le champ ;
//   · le refus nomme le geste (« Compléter », « Autoriser Opla ») et ne dit
//     jamais « retire » ni « décoche » pour une attente ;
//   · aucun débordement horizontal.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5203;
const URL = `http://localhost:${PORT}/scripts/apercu/lot-2309.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu dans le délai');
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

// Contraste WCAG entre deux couleurs CSS « rgb(a) ».
const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; const [r, g, b] = m.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
const opaque = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return false; const p = m[1].split(',').map((x) => Number(x.trim())); return p.length < 4 || p[3] >= 0.99; };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [440, 360]) {
    console.log(`\n── fenêtre ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1400 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));

    const fichier = `lot-2309-${largeur}.png`;
    await page.screenshot({ path: path.join(SORTIE, fichier), fullPage: true });
    console.log(`écrit : screenshots-review/${fichier}`);

    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    verifier(!deborde, `aucun débordement horizontal à ${largeur} px`);

    // 1. Rien d'écrit sur la photo, sauf la pastille et la quantité — opaques.
    const surPhoto = await page.evaluate(() => {
      const out = [];
      for (const photo of document.querySelectorAll('.gphoto')) {
        for (const el of photo.querySelectorAll('*')) {
          const texte = (el.textContent || '').trim();
          if (!texte || el.children.length) continue;
          const cs = getComputedStyle(el.closest('.gstatus, .gqty') || el);
          out.push({ classe: (el.closest('.gstatus, .gqty') || el).className, texte, fond: cs.backgroundColor });
        }
      }
      return out;
    });
    verifier(surPhoto.every((x) => /gstatus|gqty/.test(x.classe)), 'sur la photo : seulement la pastille d’état et la quantité', JSON.stringify(surPhoto));
    verifier(surPhoto.every((x) => opaque(x.fond)), 'pastille et quantité sur fond opaque', JSON.stringify(surPhoto.map((x) => x.fond)));

    // 2. La bande .gmur : opaque, contrastée, UN bouton.
    const murs = await page.evaluate(() => [...document.querySelectorAll('.gmur')].map((m) => {
      const cs = getComputedStyle(m);
      const span = m.querySelector('span');
      const boutons = [...m.querySelectorAll('button, a')].map((b) => b.textContent.trim());
      return { fond: cs.backgroundColor, texte: span ? getComputedStyle(span).color : null, contenu: m.textContent.trim(), boutons };
    }));
    verifier(murs.length === 2, 'deux cartes portent une bande .gmur', String(murs.length));
    // Le texte reste DANS la bande : une carte de stock fait ~160-200 px, la
    // phrase ne doit ni déborder ni être coupée par la carte (overflow hidden).
    const dedans = await page.evaluate(() => [...document.querySelectorAll('.gmur')].map((m) => {
      const b = m.getBoundingClientRect();
      return [...m.querySelectorAll('span, button, a')]
        .filter((el) => !el.closest('button, a') || el.matches('button, a'))
        .map((el) => { const r = el.getBoundingClientRect(); const ok = r.right <= b.right + 0.5 && r.left >= b.left - 0.5 && el.scrollWidth <= el.clientWidth + 1; return ok ? null : `${el.tagName.toLowerCase()} « ${el.textContent.trim().slice(0, 24)} » ${Math.round(r.left)}–${Math.round(r.right)} dans ${Math.round(b.left)}–${Math.round(b.right)} (scroll ${el.scrollWidth}/${el.clientWidth})`; })
        .filter(Boolean);
    }));
    verifier(dedans.every((d) => d.length === 0), 'le texte et le bouton tiennent dans la bande (rien de coupé)', JSON.stringify(dedans));
    verifier(murs.every((m) => opaque(m.fond)), 'bande .gmur opaque', JSON.stringify(murs.map((m) => m.fond)));
    verifier(murs.every((m) => m.texte && contraste(m.texte, m.fond) >= 4.5), 'texte de la bande à 4,5:1 au moins', JSON.stringify(murs.map((m) => m.texte && contraste(m.texte, m.fond).toFixed(2))));
    verifier(murs[0]?.boutons.length === 1 && murs[0].boutons[0] === 'Autoriser Opla', 'permission manquante : UN bouton, « Autoriser Opla »', JSON.stringify(murs[0]?.boutons));
    verifier(/Opla attend ton autorisation/.test(murs[0]?.contenu ?? '') && !/ic[oô]ne|menu|Chrome/.test(murs[0]?.contenu ?? ''), 'le message unique, sans instruction de navigateur', murs[0]?.contenu);
    verifier(murs[1]?.boutons.length === 1 && murs[1].boutons[0] === 'Me connecter' && !/Autoriser Opla/.test(murs[1].contenu), 'session fermée : UN bouton, « Me connecter », jamais « Autoriser Opla »', JSON.stringify(murs[1]));

    // 3. Les versions du texte : deux rangées, un tap pose le texte.
    verifier((await page.locator('[data-versions="titre"] button').count()) >= 2, 'rangée de versions sous le titre (Beebs, Leboncoin…)');
    verifier((await page.locator('[data-versions="description"] button').count()) >= 2, 'rangée de versions sous la description');
    const puce = page.locator('[data-versions="titre"] button').first();
    const libelle = await puce.innerText();
    await puce.click();
    await page.waitForTimeout(200);
    const valeur = await page.locator('input[type="text"]').first().inputValue();
    verifier(/Leboncoin/.test(libelle) && /—/.test(valeur), `un tap sur « ${libelle} » pose le texte Leboncoin (le plus récent) dans le titre`, valeur);
    verifier((await page.locator('[data-versions="titre"] button', { hasText: 'Ma fiche' }).count()) === 1, 'et « Ma fiche » apparaît pour revenir au texte de la fiche');

    // 4. Les états et le refus.
    const chips = await page.locator('[data-chip]').allInnerTexts();
    verifier(chips.some((c) => /Leboncoin — en attente d'un champ \(Produit\)/.test(c)), 'puce Leboncoin : « en attente d’un champ (Produit) »', chips.join(' | '));
    verifier(chips.some((c) => /Opla — en attente de ton autorisation Opla/.test(c)), 'puce Opla : « en attente de ton autorisation Opla »', chips.join(' | '));
    verifier(chips.some((c) => /Beebs — en ligne/.test(c)), 'puce Beebs : en ligne (le verrou d’avant, inchangé)');
    const refus = await page.locator('[data-refus]').innerText();
    verifier(/complète-le/.test(refus) && /appuie sur « Autoriser Opla »/.test(refus) && !/retire|décoche/i.test(refus), 'le refus nomme le geste et ne dit jamais « retire/décoche » pour une attente', refus);
    verifier(/retire d'abord/.test(await page.locator('[data-refus-en-ligne]').innerText()), 'et « retire d’abord » ne reste que pour une annonce réellement en ligne');

    await page.screenshot({ path: path.join(SORTIE, `lot-2309-${largeur}-apres-tap.png`), fullPage: true });
    await page.close();
  }
  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ aperçu lot 23/09 : tout passe');
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
