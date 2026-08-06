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
// web suivant). La comparaison se fait désormais contre une constante figée,
// jamais contre le BUILD_ID du web — cf. les DEUX constantes ci-dessous.
// assertExtensionMinBuildCurrent() (appelé par vite.config.js) fait échouer le
// build local si l'une des deux est en retard ou incohérente.
//
// ── DEUX constantes, DEUX sens (scindées le 2026-07-29) ─────────────────────
// Une seule constante portait les deux jusqu'ici, et c'est précisément ce qui
// a fait mentir la bannière ce soir-là. Le bump de rattrapage à
// 2026-07-29T15:00:00Z (les deux commits Beebs du jour, 24b2881 et 9000cdf,
// touchaient chrome-extension/ sans bump : `npm run build` LOCAL échouait —
// Vercel, lui, skippe la garde, clone shallow) a satisfait la garde au build
// ET, du même geste, allumé « extension obsolète » pour les 6 installs actives
// du parc, dont 4 déjà sur la 0.4.5 du CWS : un bandeau exact à la lettre mais
// qui ne menait nulle part, le bouton « Mettre à jour » renvoyant sur la même
// version. Ce n'était pas un accident, c'était mécanique.
//
// EXTENSION_LAST_COMMIT = horodatage UTC du dernier commit touchant
//   chrome-extension/. Sert UNIQUEMENT aux gardes de build (celle ci-dessous,
//   et la vérification du paquet dans package-extension.mjs). À BUMPER dans le
//   même commit que tout changement sous chrome-extension/.
//
// EXTENSION_MIN_BUILD = build de la dernière extension RÉELLEMENT INSTALLABLE
//   par un utilisateur (version publiée sur le Chrome Web Store). C'est LUI
//   que la bannière compare au build installé (App.jsx). À ne bumper qu'après
//   une publication ACCEPTÉE par le CWS — sinon on demande aux utilisateurs
//   d'installer quelque chose qui n'existe pas encore.
//
// Séquence de publication : bumper LAST_COMMIT au fil des commits extension →
// package:extension → téléverser + « Envoyer pour examen » → une fois la
// review ACCEPTÉE, recopier LAST_COMMIT dans MIN_BUILD (le parc est alors
// prévenu au bon moment, avec une version à aller chercher).
// 2026-08-06T16:05:00Z = dropdowns Vinted : attente de la fin du loader de
// champ (<champ>--loader, dérivé du data-testid du trigger) dans openDropdown
// — l'entonnoir de TOUS les champs du formulaire — avant tout clic, timeout
// borné 15 s (job f9861e8a « Jean Zara » : brand/color encore en chargement
// quand le code cliquait ; course, pas un cas particulier — 3 recréations sur
// 5 passaient selon le timing). Erreurs openDropdown/Marque passées à la
// convention error court / last_diagnostic.
// (recalée 16:05 → 16:15 : le commit 2794630 est tombé à 16:11:58Z, après la
// valeur visée — même mésaventure que 4c7d444, la garde de vite.config.js
// aurait bloqué le prochain build web local.)
export const EXTENSION_LAST_COMMIT = '2026-08-06T16:15:00Z';
// 2026-08-05T20:05:00Z = build de la 0.5.0 (= EXTENSION_LAST_COMMIT), acceptée
// et SERVIE par le Chrome Web Store le 06/08 : le parc 0.4.x est prévenu avec
// une version réellement installable.
export const EXTENSION_MIN_BUILD = '2026-08-05T20:05:00Z';

// Garde-fou : échoue bruyamment si un commit touchant chrome-extension/ est
// postérieur à EXTENSION_LAST_COMMIT (constante pas bumpée → le paquet publié
// pourrait ne pas contenir le dernier code, et le jour de la promotion vers
// EXTENSION_MIN_BUILD la bannière ne flaggerait jamais les extensions
// antérieures à ce commit).
// Vérifie AUSSI l'invariant MIN_BUILD <= LAST_COMMIT : une bannière ne doit
// jamais exiger un build postérieur au dernier code committé, faute de quoi
// elle réclame une version que personne ne peut installer — le bug du 29/07.
// Skippé quand git est absent ou le clone superficiel (Vercel : le commit
// frontière d'un shallow clone « introduit » tous les fichiers et produirait
// un faux échec) — la validation fait foi au build LOCAL avant push.
export function assertExtensionMinBuildCurrent(cwd = process.cwd()) {
  const lastCommit = Date.parse(EXTENSION_LAST_COMMIT);
  const min = Date.parse(EXTENSION_MIN_BUILD);
  if (Number.isFinite(lastCommit) && Number.isFinite(min) && min > lastCommit) {
    throw new Error(
      `EXTENSION_MIN_BUILD (${EXTENSION_MIN_BUILD}) est POSTÉRIEUR à ` +
      `EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT}) : la bannière ` +
      `« extension obsolète » exigerait un build qui n'existe dans aucun ` +
      `commit, donc dans aucun paquet installable. Corriger scripts/build-id.mjs.`
    );
  }
  let lastIso;
  try {
    const shallow = execSync('git rev-parse --is-shallow-repository', { cwd }).toString().trim();
    if (shallow === 'true') return;
    lastIso = execSync('git log -1 --format=%cI -- chrome-extension/', { cwd }).toString().trim();
  } catch {
    return; // pas de git (Vercel) : les constantes committées font foi
  }
  const last = Date.parse(lastIso);
  if (Number.isFinite(last) && Number.isFinite(lastCommit) && last > lastCommit) {
    throw new Error(
      `EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT}) est antérieur au dernier ` +
      `commit touchant chrome-extension/ (${lastIso}). Bumper la constante dans ` +
      `scripts/build-id.mjs — sinon le paquet publié peut ne pas contenir ce ` +
      `commit, et la bannière ne flaggera jamais les extensions antérieures.`
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
