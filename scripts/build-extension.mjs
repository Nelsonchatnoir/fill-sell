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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformExtensionFile, isExcludedFromPackage } from './minify-extension.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'chrome-extension');
const OUT = path.join(ROOT, 'build', 'extension');

async function main() {
  const s = await stat(SRC).catch(() => null);
  if (!s?.isDirectory()) {
    console.error(`[build:extension] introuvable : ${SRC}`);
    process.exit(1);
  }

  // Repart d'un dossier propre — pas de fichier périmé résiduel.
  await rm(OUT, { recursive: true, force: true });
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
      const content = await transformExtensionFile(rel, await readFile(abs));
      await writeFile(out, content);
      if (/\.js$/i.test(rel)) minified += 1; else copied += 1;
    }
  }

  await walk(SRC);

  console.log(`[build:extension] OK → ${path.relative(ROOT, OUT)}`);
  console.log(`  ${minified} .js minifiés · ${copied} fichiers copiés · ${excluded} exclus (doc)`);
  console.log(`  Charge ce dossier en « Load unpacked » (chrome://extensions) et teste les 4 plateformes.`);
}

main().catch(err => {
  // Échec BRUYANT : jamais un dossier à moitié minifié laissé en silence.
  console.error(`[build:extension] ÉCHEC : ${err?.stack ?? err}`);
  process.exit(1);
});
