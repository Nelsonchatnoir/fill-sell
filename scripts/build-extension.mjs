// `npm run build:extension` — produit le dossier MINIFIÉ de l'extension, à
// charger en « Load unpacked » (chrome://extensions) pour le test manuel sur
// les 4 plateformes AVANT de zipper pour le Chrome Web Store.
//
// C'est bien cet artefact MINIFIÉ qu'il faut tester (pas le source
// chrome-extension/) : c'est la minification qui pourrait casser un sélecteur
// ou une manip fiber en silence. Même transformation que le zip public Vercel
// (module partagé minify-extension.mjs) → tester ici = tester ce qui sera livré.
//
// Le source chrome-extension/ reste INTACT. Sortie dans build/extension/
// (gitignoré), reconstruite from scratch à chaque run.

import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformExtensionFile, isExcludedFromPackage } from './minify-extension.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'chrome-extension');
const OUT = path.join(ROOT, 'build', 'extension');

// BUILD_ID unique à CHAQUE build : horodatage local + hash git court. Injecté à
// la place du jeton __FILLSELL_BUILD_ID__ dans les .js (cf. background.js). C'est
// LUI, pas une chaîne codée en dur, qui prouve en console qu'on tourne bien sur
// le dernier build (le tag figé "2026-07-17…" a induit en erreur des tests entiers).
const BUILD_TOKEN = '__FILLSELL_BUILD_ID__';
function computeBuildId() {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let git = 'nogit';
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim() ? '-dirty' : '';
    git = hash + dirty;
  } catch { /* pas de git : horodatage seul */ }
  return `${ts}+${git}`;
}
const BUILD_ID = computeBuildId();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rmWithRetry(dir) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (e?.code !== 'EBUSY' && e?.code !== 'EPERM' && e?.code !== 'ENOTEMPTY') throw e;
      if (attempt === 4) {
        throw new Error(
          `Impossible de nettoyer ${dir} (${e.code}) : le dossier est VERROUILLÉ, ` +
          `presque sûrement parce que l'extension est chargée depuis là dans Chrome ` +
          `(le service worker en cours verrouille background.js).\n` +
          `  → Pour tester le dernier code TOUT DE SUITE : charge plutôt le dossier SOURCE ` +
          `chrome-extension/ (Load unpacked), un simple reload après git pull suffit, aucun build.\n` +
          `  → Pour reconstruire le build minifié : dans chrome://extensions, RETIRE l'extension ` +
          `(ou décharge-la), relance « npm run build:extension », puis recharge build/extension/.`
        );
      }
      await sleep(400 * attempt);
    }
  }
}

async function main() {
  const s = await stat(SRC).catch(() => null);
  if (!s?.isDirectory()) {
    console.error(`[build:extension] introuvable : ${SRC}`);
    process.exit(1);
  }

  // Repart d'un dossier propre — pas de fichier périmé résiduel.
  // ⚠️ Sur Windows, si l'extension est CHARGÉE depuis build/extension/ dans Chrome,
  // le dossier est VERROUILLÉ (le fichier du service worker en cours d'exécution)
  // et rm échoue en EBUSY → l'ancien build reste, un « reload » ne change rien.
  // On réessaie quelques fois, puis on échoue avec une consigne claire.
  await rmWithRetry(OUT);
  await mkdir(OUT, { recursive: true });

  let minified = 0;
  let copied = 0;
  let excluded = 0;

  async function walk(absDir) {
    for (const entry of await readdir(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      if (isExcludedFromPackage(rel)) { excluded += 1; continue; }

      const out = path.join(OUT, rel);
      await mkdir(path.dirname(out), { recursive: true });
      let content = await transformExtensionFile(rel, await readFile(abs));
      // Estampille du BUILD_ID : UNIQUEMENT dans les .js (toString/replace
      // corromprait un binaire — woff2, png). Le jeton n'existe que dans les
      // fichiers qu'on a instrumentés (background.js + logs "prêt" des content
      // scripts) ; ailleurs le replace est un no-op.
      if (/\.js$/i.test(rel)) {
        content = content.toString('utf8').split(BUILD_TOKEN).join(BUILD_ID);
      }
      await writeFile(out, content);
      if (/\.js$/i.test(rel)) minified += 1; else copied += 1;
    }
  }

  await walk(SRC);

  console.log(`[build:extension] OK → ${path.relative(ROOT, OUT)}`);
  console.log(`  ${minified} .js minifiés · ${copied} fichiers copiés · ${excluded} exclus (doc)`);
  console.log(`  BUILD_ID = ${BUILD_ID}`);
  console.log(`  → Vérif en console du service worker : taper  FILLSELL_BUILD_ID  (doit afficher ${BUILD_ID}).`);
  console.log(`  Charge/recharge ce dossier en « Load unpacked » (chrome://extensions) et teste les 4 plateformes.`);
}

main().catch(err => {
  // Échec BRUYANT : jamais un dossier à moitié minifié laissé en silence.
  console.error(`[build:extension] ÉCHEC : ${err?.stack ?? err}`);
  process.exit(1);
});
