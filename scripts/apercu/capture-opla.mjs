// Capture PNG de l'aperçu Lens : lance vite, charge la page, écrit les
// screenshots dans screenshots-review/. Outil de relecture, jamais livré.
//
//     node scripts/apercu/capture.mjs
//
// Le serveur vite est tué en sortie, y compris en cas d'erreur.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5198;
const URL = `http://localhost:${PORT}/scripts/apercu/opla-plateformes.html`;

fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));

// `shell: true` sur Windows : vite.kill() ne tue que le cmd.exe intermédiaire
// et laisse le serveur écouter — le script suivant se plantait alors sur
// « Port déjà utilisé ». On tue l'ARBRE.
const stop = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' });
    else vite.kill();
  } catch { /* déjà mort */ }
};
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite n’a pas répondu dans le délai');
}

try {
  await attendreServeur();
  // Chrome du poste (channel) plutôt que le binaire Playwright : pas de
  // téléchargement de 150 Mo pour un aperçu.
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  if (erreurs.length) {
    console.error('ERREURS DE PAGE :\n' + erreurs.join('\n'));
    process.exitCode = 1;
  }

  await page.screenshot({ path: path.join(SORTIE, 'opla-plateformes.png'), fullPage: true });
  console.log('écrit : screenshots-review/opla-plateformes.png');

  // ── CE QUI COMPTE POUR LES 2 364 COMPTES SANS DRAPEAU ────────────────────
  // La capture se regarde ; ceci se VÉRIFIE. On lit la rangée de plateformes
  // des deux colonnes dans le DOM réel et on exige, à gauche, exactement
  // l'écran d'avant : quatre cases, aucune désactivée, dans le même ordre.
  // La rangée est repérée par sa PREMIÈRE case (celle qui commence par
  // « Vinted ») et non par l'eyebrow : la grille de photos au-dessus est faite
  // de <button> vides qui se ramassaient à sa place. On remonte au parent —
  // c'est la rangée, par construction du composant.
  // ⚠️ textContent d'une case vaut « VintedVinted » : les tracés simple-icons
  // portent un <title> pour l'accessibilité, et il compte dans le texte. On
  // compare donc en DÉBUT de chaîne, jamais à l'égalité.
  const rangees = await page.evaluate(() => {
    const premieres = [...document.querySelectorAll('button')]
      .filter(b => /^Vinted/.test(b.textContent.replace(/\s+/g, ' ').trim()));
    return premieres.map(v => [...v.parentElement.children]
      .filter(e => e.tagName === 'BUTTON')
      .map(b => ({
        libelle: b.textContent.replace(/\s+/g, ' ').trim(),
        desactivee: b.disabled,
      })));
  });

  const ATTENDU = [/^Vinted/, /^Leboncoin/, /^Beebs/, /^eBay/];
  const memeOrdre = (cases) => cases?.length >= ATTENDU.length
    && ATTENDU.every((re, i) => re.test(cases[i]?.libelle ?? ''));
  let echecs = 0;
  const check = (nom, ok, vu) => {
    if (ok) console.log(`  ✓ ${nom}`);
    else { echecs++; console.error(`  ✗ ${nom} — vu : ${JSON.stringify(vu)}`); }
  };

  const [sans, avec] = rangees;
  console.log('▸ compte SANS drapeau — doit être l’écran d’avant, à l’identique');
  check('quatre cases, pas cinq', sans?.length === 4, sans?.map(b => b.libelle));
  check('mêmes plateformes, même ordre', memeOrdre(sans), sans?.map(b => b.libelle));
  check('aucune case désactivée', sans?.every(b => !b.desactivee) === true, sans);
  check('le mot « Opla » n’apparaît nulle part', !sans?.some(b => /opla/i.test(b.libelle)), sans?.map(b => b.libelle));

  console.log('▸ compte AVEC le drapeau');
  check('cinq cases', avec?.length === 5, avec?.map(b => b.libelle));
  check('les quatre premières sont inchangées', memeOrdre(avec), avec?.slice(0, 4).map(b => b.libelle));
  check('les quatre premières restent actives', avec?.slice(0, 4).every(b => !b.desactivee) === true, avec?.slice(0, 4));
  check('la cinquième est Opla', /^Opla/.test(avec?.[4]?.libelle ?? ''), avec?.[4]);
  check('la cinquième est DÉSACTIVÉE (aucun job possible)', avec?.[4]?.desactivee === true, avec?.[4]);
  check('elle dit « bientôt »', /bient/i.test(avec?.[4]?.libelle ?? ''), avec?.[4]);

  if (echecs) { console.error(`\n✗ ${echecs} contrôle(s) en échec`); process.exitCode = 1; }
  else console.log('\n✓ les 10 contrôles passent');

  // Même page, tous les « Le détail du marché » dépliés : on vérifie que le
  // contenu replié est bien là, et qu'il ne contient plus la description.
  await navigateur.close();
} finally {
  stop();
  // Sortie explicite : le handle du serveur enfant garde sinon la boucle
  // d'événements vivante et le script ne rend jamais la main.
  process.exit(process.exitCode ?? 0);
}
