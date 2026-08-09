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
// ⚠️ MIN_BUILD SE LIT DANS LE PAQUET PUBLIÉ, JAMAIS DANS LAST_COMMIT.
// Cette consigne disait « recopier LAST_COMMIT dans MIN_BUILD ». C'était vrai
// tant que LAST_COMMIT désignait le commit de code qui a PRODUIT le zip — et
// faux dès qu'un commit postérieur touche chrome-extension/ sans produire de
// paquet. Un README suffit : le 09/08, 6e08f44 (README seul) a poussé
// LAST_COMMIT à 14:53:38Z alors que le paquet 0.5.6 réellement publié porte
// 2026-08-09T14:16:20Z — 37 min PLUS TÔT. Recopier LAST_COMMIT aurait flaggé
// « obsolète » TOUTES les installs 0.5.6, sans rien de plus récent à
// installer : très exactement le bug du 29/07 que ces constantes existent pour
// empêcher. La garde ci-dessous ne voit pas ce cas (elle ne vérifie que
// MIN_BUILD <= LAST_COMMIT, pas MIN_BUILD <= build du paquet publié).
//
// Séquence de publication : bumper LAST_COMMIT au fil des commits extension →
// package:extension → téléverser + « Envoyer pour examen » → une fois la
// review ACCEPTÉE, LIRE le BUILD_ID dans le zip publié et le recopier dans
// MIN_BUILD (le parc est alors prévenu au bon moment, avec une version à aller
// chercher — et qui existe vraiment). Le BUILD_ID est injecté dans les
// fichiers du paquet ; pour le relire :
//   Add-Type -AssemblyName System.IO.Compression.FileSystem
//   # ouvrir build/fillsell-extension-<version>-cws.zip, chercher dans
//   # background.js le motif 20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ\+[0-9a-f]{7}
// 2026-08-09T12:20:00Z = 0.5.5 : l'upload photo Vinted est POST /api/v2/photos,
// pas /api/v2/images — la garde de la 0.5.3 attendait une preuve qui ne pouvait
// pas exister et bloquait TOUTE publication (annonce de Gabin supprimée puis
// jamais recréée, job 9a8eaad8). Preuve croisée réseau + vignettes
// image-wrapper, garde non bloquante après une suppression, et un job en
// needs_user ne gèle plus la file de republication du compte.
// 2026-08-09T14:14:47Z = 0.5.6 (commit 7ca4440) : le panneau de catégorie était
// OUVERT (chevron-up, close-button) pendant que la sonde « -content » jurait le
// contraire, et chaque retry le RE-BASCULAIT — trois annonces d'Ornella
// supprimées puis jamais recréées. Trois preuves d'ouverture dérivées du
// déclencheur, plus aucun clic sur un panneau déjà ouvert, budget croissant
// (fenêtre minimisée = timers throttlés à ≥ 1 s), et B.5 étendu à TOUT le
// remplissage : après une suppression, aucun échec ne bloque plus la
// soumission.
// 2026-08-09T14:53:38Z = 6e08f44, qui ne touche que chrome-extension/README.md
// (DRY_RUN décrit comme « doit rester à true » alors que les quatre plateformes
// publient en réel depuis le 12/07, et une section « Reste à faire » périmée).
// AUCUNE ligne de code d'extension ne bouge : le paquet 0.5.6 déjà construit
// reste exact, et EXTENSION_MIN_BUILD n'a donc pas à suivre. Recalage seul, du
// même geste que db9faba et f84326e — sans lui, `npm run build` échoue sur la
// garde ci-dessous.
// 2026-08-09T19:20:20Z = e78783e (0.5.7) : la file de jobs passe à TROIS rangs
// de priorité — une publication ne fait plus la queue derrière les
// republications pas encore supprimées (rang 2), tandis que les recréations
// dues (rang 0, annonce déjà hors ligne) gardent la priorité absolue. Le
// rythme humain est inchangé : seul l'ORDRE de passage bouge.
// EXTENSION_MIN_BUILD reste sur la 0.5.6 : la 0.5.7 n'est pas encore soumise
// au Chrome Web Store, et on ne réclame jamais au parc une version que
// personne ne peut installer (bug du 29/07).
export const EXTENSION_LAST_COMMIT = '2026-08-09T19:20:20Z';
// 2026-08-09T08:40:00Z = 0.5.4 : fin des faux « plus en ligne » Vinted
// (cancelPublishAfterDelete clôt publish + republish de l'ancienne annonce ;
// poll : ré-appariement listing_url vs inventaire.vinted_item_id avant tout
// drapeau — divergence → job clos superseded_listing — et double lecture 404
// via unavailable_pending_since) ; propagation sync→jobs des ventes Vinted
// RÉTABLIE sur publish ET republish (l'affichage app des bandeaux republish
// rouvrira par un commit séparé, sur GO, après acceptation de la 0.5.4).
// 2026-08-09T12:13:15Z = build de la 0.5.5 (= EXTENSION_LAST_COMMIT), PUBLIÉE
// et acceptée par le Chrome Web Store le 09/08.
// ⚠️ CETTE PROMOTION RATTRAPE DEUX OUBLIS : ni la 0.5.3 ni la 0.5.4 n'ont
// jamais été recopiées ici, donc le parc n'a JAMAIS été prévenu depuis la
// 0.5.0 — et les installs 0.5.3/0.5.4 portent le bug qui supprimait une
// annonce Vinted sans la recréer (mauvais endpoint d'upload, cf. ba5e90e).
// La séquence est celle du bandeau plus haut : elle n'est faite qu'APRÈS
// acceptation CWS, jamais avant (sinon on réclame une version que personne ne
// peut installer — le bug du 29/07). Chrome propage en quelques heures ; le
// bandeau donne la marche à suivre pour forcer tout de suite.
// 2026-08-09T14:16:20Z = BUILD_ID du paquet 0.5.6, VÉRIFIÉ EN LIGNE au Chrome
// Web Store (endpoint CRX clients2.google.com/service/update2/crx :
// version="0.5.6") et RELU DANS LE ZIP publié — '2026-08-09T14:16:20Z+349d45a',
// identique dans les 5 fichiers de build/fillsell-extension-0.5.6-cws.zip.
// Ce n'est PAS EXTENSION_LAST_COMMIT (14:53:38Z, commit README) : cf. le
// bandeau ⚠️ plus haut, l'écart de 37 min aurait flaggé tout le parc à tort.
// Ce que cette promotion débloque : la 0.5.6 corrige la suppression d'annonce
// Vinted sans recréation (panneau catégorie déjà ouvert que la sonde niait,
// 7ca4440) — au moment du bump, 12 des 13 installs du parc étaient SOUS ce
// build, et le bug avait encore frappé le 09/08 (2 comptes, needs_user).
// Ancienne valeur : 2026-08-09T12:13:15Z (0.5.5, servie le 09/08).
export const EXTENSION_MIN_BUILD = '2026-08-09T14:16:20Z';

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
