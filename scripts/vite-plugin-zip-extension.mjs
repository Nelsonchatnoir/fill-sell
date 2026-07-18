import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { transformExtensionFile, isExcludedFromPackage } from './minify-extension.mjs';
import { BUILD_TOKEN, computeBuildId } from './build-id.mjs';

// Vite plugin : zippe le dossier `chrome-extension/` à chaque build et émet
// `fillsell-extension.zip` à la racine de dist/. Servi statiquement par Vercel
// (https://fillsell.app/fillsell-extension.zip) — le repo GitHub (privé) n'est
// jamais exposé. Le zip est toujours régénéré depuis la source committée, donc
// jamais périmé.
//
// ⚠️ Piège corrigé le 2026-07-12 : quand le fichier n'existe pas (serveur dev,
// ou déploiement dont le build ne l'a pas émis), le fallback SPA répond 200
// avec index.html — le navigateur télécharge alors ~9 Ko de HTML nommés .zip
// et Windows affiche « le dossier compressé est vide ». Deux parades :
//   - configureServer : en dev, le zip est généré à la volée et servi avec le
//     bon content-type (plus de fallback silencieux) ;
//   - generateBundle : zéro fichier zippé = échec BRUYANT du build (this.error),
//     jamais un zip vide émis sans erreur.
export default function zipExtension({
  sourceDir = 'chrome-extension',
  outFile = 'fillsell-extension.zip',
  // Racine du zip = « fillsell-extension/ » pour qu'après dézippage l'utilisateur
  // pointe sur un dossier clairement nommé dans chrome://extensions.
  rootFolder = 'fillsell-extension',
  // BUILD_ID injecté dans les .js à la place du jeton __FILLSELL_BUILD_ID__ —
  // même mécanisme que le build local (2026-07-18) : sans lui, le zip public
  // livrait le jeton nu et un utilisateur en mode dev ne pouvait pas savoir si
  // sa version était obsolète. vite.config.js passe l'id partagé avec l'app
  // (define __FILLSELL_APP_BUILD__) pour que la bannière compare des ids issus
  // du MÊME calcul ; à défaut on en calcule un ici.
  buildId = computeBuildId(),
} = {}) {
  // Construit le buffer du zip depuis la source. Retourne { buffer, fileCount } ;
  // lève si le dossier source est introuvable.
  async function buildZipBuffer() {
    const absSource = path.resolve(sourceDir);
    const s = await stat(absSource);
    if (!s.isDirectory()) throw new Error(`${sourceDir} n'est pas un dossier`);

    const zip = new JSZip();
    let fileCount = 0;

    async function addDir(absDir) {
      const entries = await readdir(absDir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          await addDir(abs);
        } else if (entry.isFile()) {
          const rel = path.relative(absSource, abs).split(path.sep).join('/');
          // Doc interne (README.md…) : jamais dans le paquet livré.
          if (isExcludedFromPackage(rel)) continue;
          // .js minifié (profil prudent), reste passthrough — cf. minify-extension.mjs.
          let content = await transformExtensionFile(rel, await readFile(abs));
          // Estampille du BUILD_ID : UNIQUEMENT dans les .js (toString/replace
          // corromprait un binaire) — miroir exact de build-extension.mjs.
          if (/\.js$/i.test(rel)) {
            content = content.toString('utf8').split(BUILD_TOKEN).join(buildId);
          }
          zip.file(`${rootFolder}/${rel}`, content);
          fileCount += 1;
        }
      }
    }

    await addDir(absSource);
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    return { buffer, fileCount };
  }

  return {
    name: 'zip-extension',
    // Pas de `apply: 'build'` : le plugin doit aussi vivre en dev pour servir
    // le zip via configureServer (sinon fallback SPA → HTML déguisé en .zip).

    // Dev : sert le zip à la volée, régénéré à chaque requête (source à jour).
    configureServer(server) {
      server.middlewares.use(`/${outFile}`, async (_req, res) => {
        try {
          const { buffer, fileCount } = await buildZipBuffer();
          if (fileCount === 0) throw new Error(`aucun fichier dans ${sourceDir}`);
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Length', buffer.length);
          res.setHeader('Content-Disposition', `attachment; filename="${outFile}"`);
          res.end(buffer);
        } catch (err) {
          // 404 franc plutôt que laisser le fallback SPA servir index.html en 200.
          res.statusCode = 404;
          res.end(`[zip-extension] ${err?.message ?? err}`);
        }
      });
    },

    // Build : émet le zip dans dist/, et échoue si la source est vide/absente.
    async generateBundle() {
      let result;
      try {
        result = await buildZipBuffer();
      } catch (err) {
        this.error(`[zip-extension] ${err?.message ?? err} — build interrompu, ` +
          `sinon ${outFile} serait absent du déploiement et le fallback SPA ` +
          `servirait index.html à sa place (zip « vide » côté utilisateur).`);
      }
      if (result.fileCount === 0) {
        this.error(`[zip-extension] 0 fichier trouvé dans ${sourceDir} — zip vide refusé.`);
      }
      this.emitFile({ type: 'asset', fileName: outFile, source: result.buffer });
    },
  };
}
