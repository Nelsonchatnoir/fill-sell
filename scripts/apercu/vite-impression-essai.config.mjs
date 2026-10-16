// Essai du découpage du build pour le module d'impression des bordereaux (16/10/2026).
// Outil de relecture, jamais livré :
//   npx vite build --config scripts/apercu/vite-impression-essai.config.mjs
// Une entrée (entree-impression-essai.html) importe le module comme l'app le
// fera ; la sortie doit montrer pdf.js, son « worker » et pdf-lib dans des
// chunks à part (chargés à l'ouverture d'un aperçu), jamais dans l'entrée.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export default defineConfig({
  root: RACINE,
  plugins: [react()],
  build: {
    outDir: path.join(os.tmpdir(), 'fillsell-essai-impression'),
    emptyOutDir: true,
    rollupOptions: { input: path.join(RACINE, 'scripts', 'apercu', 'entree-impression-essai.html') },
  },
});
