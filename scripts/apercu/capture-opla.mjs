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

  // Même page, tous les « Le détail du marché » dépliés : on vérifie que le
  // contenu replié est bien là, et qu'il ne contient plus la description.
  await navigateur.close();
} finally {
  stop();
  // Sortie explicite : le handle du serveur enfant garde sinon la boucle
  // d'événements vivante et le script ne rend jamais la main.
  process.exit(process.exitCode ?? 0);
}
