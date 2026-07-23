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

// Build extension MINIMAL requis par l'app web (2026-07-23, faux positif
// bannière) : la bannière « extension obsolète » comparait le build de
// l'extension au BUILD_ID du déploiement web courant — chaque déploiement web
// re-flaggait donc TOUTES les extensions installées, même quand
// chrome-extension/ n'avait pas bougé d'une ligne (vécu : build parti en
// review Chrome Web Store le 23/07, flaggé « pas à jour » dès le déploiement
// web suivant). La comparaison se fait désormais contre CETTE constante :
// l'horodatage UTC du dernier commit qui touche chrome-extension/.
// À BUMPER dans le même commit que tout changement sous chrome-extension/ —
// assertExtensionMinBuildCurrent() (appelé par vite.config.js) fait échouer
// le build local si on l'oublie.
export const EXTENSION_MIN_BUILD = '2026-07-22T16:54:49Z';

// Garde-fou : échoue bruyamment si un commit touchant chrome-extension/ est
// postérieur à EXTENSION_MIN_BUILD (constante pas bumpée → la bannière
// mentirait dans l'autre sens : extensions périmées jamais flaggées).
// Skippé quand git est absent ou le clone superficiel (Vercel : le commit
// frontière d'un shallow clone « introduit » tous les fichiers et produirait
// un faux échec) — la validation fait foi au build LOCAL avant push.
export function assertExtensionMinBuildCurrent(cwd = process.cwd()) {
  let lastIso;
  try {
    const shallow = execSync('git rev-parse --is-shallow-repository', { cwd }).toString().trim();
    if (shallow === 'true') return;
    lastIso = execSync('git log -1 --format=%cI -- chrome-extension/', { cwd }).toString().trim();
  } catch {
    return; // pas de git (Vercel) : la constante committée fait foi
  }
  const last = Date.parse(lastIso);
  const min = Date.parse(EXTENSION_MIN_BUILD);
  if (Number.isFinite(last) && Number.isFinite(min) && last > min) {
    throw new Error(
      `EXTENSION_MIN_BUILD (${EXTENSION_MIN_BUILD}) est antérieur au dernier commit ` +
      `touchant chrome-extension/ (${lastIso}). Bumper la constante dans ` +
      `scripts/build-id.mjs — sinon la bannière « extension obsolète » ne ` +
      `flaggera jamais les extensions antérieures à ce commit.`
    );
  }
}

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
