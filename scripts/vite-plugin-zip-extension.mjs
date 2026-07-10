import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

// Vite plugin : zippe le dossier `chrome-extension/` à chaque build et émet
// `fillsell-extension.zip` à la racine de dist/. Servi statiquement par Vercel
// (https://fillsell.app/fillsell-extension.zip) — le repo GitHub (privé) n'est
// jamais exposé. Le zip est toujours régénéré depuis la source committée, donc
// jamais périmé.
export default function zipExtension({
  sourceDir = 'chrome-extension',
  outFile = 'fillsell-extension.zip',
  // Racine du zip = « fillsell-extension/ » pour qu'après dézippage l'utilisateur
  // pointe sur un dossier clairement nommé dans chrome://extensions.
  rootFolder = 'fillsell-extension',
} = {}) {
  async function addDir(zip, absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await addDir(zip, abs);
      } else if (entry.isFile()) {
        const rel = path.relative(path.resolve(sourceDir), abs).split(path.sep).join('/');
        zip.file(`${rootFolder}/${rel}`, await readFile(abs));
      }
    }
  }

  return {
    name: 'zip-extension',
    apply: 'build',
    async generateBundle() {
      const absSource = path.resolve(sourceDir);
      try {
        const s = await stat(absSource);
        if (!s.isDirectory()) throw new Error(`${sourceDir} n'est pas un dossier`);
      } catch {
        this.warn(`[zip-extension] dossier introuvable : ${sourceDir} — zip non généré`);
        return;
      }
      const zip = new JSZip();
      await addDir(zip, absSource);
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });
      this.emitFile({ type: 'asset', fileName: outFile, source: buffer });
    },
  };
}
