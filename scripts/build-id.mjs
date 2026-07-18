// BUILD_ID partagé — source UNIQUE pour les trois consommateurs :
//   1. build local minifié (scripts/build-extension.mjs, « Load unpacked ») ;
//   2. zip public fillsell.app (scripts/vite-plugin-zip-extension.mjs) ;
//   3. app web elle-même (define __FILLSELL_APP_BUILD__ dans vite.config.js),
//      qui compare son propre id à profiles.extension_build pour la bannière
//      « extension obsolète ».
// Format : horodatage ISO UTC + hash git court. Le PRÉFIXE ISO est triable —
// c'est LUI qui sert aux comparaisons d'obsolescence, jamais le hash.
import { execSync } from 'node:child_process';

export const BUILD_TOKEN = '__FILLSELL_BUILD_ID__';

export function computeBuildId(cwd = process.cwd()) {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let git = 'nogit';
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd }).toString().trim() ? '-dirty' : '';
    git = hash + dirty;
  } catch {
    // Pas de binaire git (ou pas un repo) : sur Vercel le SHA du commit est
    // fourni en variable d'environnement — on le prend en repli, sinon
    // l'horodatage seul suffit (le préfixe ISO reste comparable).
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    if (sha) git = sha.slice(0, 7);
  }
  return `${ts}+${git}`;
}
