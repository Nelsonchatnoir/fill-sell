// Résolveur d'imports SANS extension, pour exécuter du code de `src/` sous Node
// (2026-09-20). Vite résout « ./texteComparable » tout seul ; Node ESM, non.
// Les selftests qui touchent à la cascade ont besoin d'importer des modules de
// src/ qui s'importent entre eux sans extension — sans ce hook, il faudrait
// soit réécrire les imports de src/ (interdit : c'est du code de production),
// soit recopier le module dans le test (une recopie se périme).
//
//   node --import ./scripts/loader-ext.mjs scripts/<test>.mjs
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (!specifier.startsWith('.') || !context.parentURL) throw e;
      const base = new URL(specifier, context.parentURL);
      for (const suffixe of ['.js', '.mjs', '/index.js']) {
        const essai = new URL(base.href + suffixe);
        if (existsSync(fileURLToPath(essai))) {
          return { url: pathToFileURL(fileURLToPath(essai)).href, shortCircuit: true };
        }
      }
      throw e;
    }
  },
});
