// ════════════════════════════════════════════════════════════════════════════
// PUBLIER UNE OTA CAPGO — une commande, tout est vérifié AVANT l'envoi (08/11/2026, ordre de Nico)
// ════════════════════════════════════════════════════════════════════════════
//   npm run ota -- --essai     tous les contrôles + build, AUCUN envoi (à faire d'abord)
//   npm run ota                contrôles, build, envoi --delta sur le canal production, relecture du canal
//   npm run ota -- --canal=test        (19/11, ordre de Nico) envoi sur le canal de TEST (l'appareil de Nico seul) ;
//                                      le commit peut ne pas être poussé (le web attend l'essai), production intouchée
//   npm run ota -- --promouvoir        après l'essai : sert sur production le MÊME bundle que le canal de test (aucun
//                                      rebuild), seulement si main est poussé et contient le commit du bundle
//
// Préalable (inchangé, docs/agents/pieges.md § Déploiement) : version montée dans package.json ET package-lock.json
// au-dessus du canal, COMMITÉE et POUSSÉE ; dossier principal, jamais un worktree.
//
// Le script s'ARRÊTE au premier défaut, sans rien envoyer :
//   A. dépôt : main, propre, = origin/main, pas un worktree ; versions package.json = lock > canal ;
//   B. modules natifs : Capgo « bundle compatibility » contre le canal — UN module natif différent du bundle en service
//      (version ou code natif) = refus. C'est la garde du 08/11 : aucune OTA ne doit atteindre un binaire qui n'a pas
//      le module qu'elle attend (updater 8.53.1 dans l'app, 8.51.2 dans TOUS les téléphones) ;
//   C. build : `npm run build`, empreinte = commit exact, sans « -dirty » ;
//   D. envoi (sauf --essai) : `bundle upload --delta --fail-on-incompatible` (la même garde, côté Capgo) ;
//   E. relecture du canal : il sert bien la nouvelle version.
// ════════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, CANAL, CANAL_TEST, CLI_CAPGO, buildConforme, lireCompatibilite, refusAvantEnvoi, refusPromotion } from './regles-ota.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESSAI = process.argv.includes('--essai');
const PROMOUVOIR = process.argv.includes('--promouvoir');
const CIBLE = process.argv.find((a) => a.startsWith('--canal='))?.slice('--canal='.length) || CANAL;
const CLE_CAPGO = path.join(process.env.USERPROFILE || process.env.HOME || '', '.capgo');

const lancer = (cmd, args, { muet = true } = {}) => {
  const r = spawnSync(cmd, args, { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!muet) process.stdout.write(sortie.slice(-4000));
  return { code: r.status, sortie };
};
const git = (...a) => lancer('git', a).sortie.trim();
const lireJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const ok = (t) => console.log(`  ✓ ${t}`);
function stop(lignes) {
  console.log('');
  for (const l of [].concat(lignes)) console.log(`  ✗ ${l}`);
  console.log('\nArrêt : RIEN n\'a été envoyé à Capgo.');
  process.exit(1);
}

async function canal(nom = CANAL) {
  if (!existsSync(CLE_CAPGO)) stop(`clé Capgo absente (${CLE_CAPGO}).`);
  const cle = readFileSync(CLE_CAPGO, 'utf8').trim();
  const r = await fetch(`https://api.capgo.app/channel?app_id=${APP_ID}&channel=${nom}`, { headers: { authorization: cle } });
  if (!r.ok) stop(`lecture du canal ${nom} refusée par Capgo (HTTP ${r.status}).`);
  const j = await r.json();
  const c = Array.isArray(j) ? j[0] : j;
  return { version: c?.version?.name ?? null, blocage: c?.disableAutoUpdate ?? null, sousNatif: c?.disableAutoUpdateUnderNative ?? null };
}

/** Le commit d'un bundle déjà envoyé (son commentaire Capgo, posé par l'envoi : « --comment <commit court> »). */
async function commitDuBundle(version) {
  const cle = readFileSync(CLE_CAPGO, 'utf8').trim();
  const r = await fetch(`https://api.capgo.app/bundle?app_id=${APP_ID}`, { headers: { authorization: cle } });
  if (!r.ok) return null;
  const j = await r.json();
  const b = (Array.isArray(j) ? j : j.data ?? []).find((x) => x.name === version && !x.deleted);
  const c = String(b?.comment ?? '').replace(/"/g, '');
  return /^[0-9a-f]{7,40}$/.test(c) ? c : null;
}

// ── PROMOTION (19/11/2026, ordre de Nico) : le bundle essayé sur le canal de test passe en production, sans rebuild ──
if (PROMOUVOIR) {
  console.log(`OTA Capgo — PROMOTION ${CANAL_TEST} → ${CANAL}${ESSAI ? ' — ESSAI (aucun envoi)' : ''}`);
  lancer('git', ['fetch', 'origin', 'main']);
  const pkgP = lireJson(path.join(RACINE, 'package.json'));
  const prod = await canal(CANAL);
  const test = await canal(CANAL_TEST);
  const commitBundle = await commitDuBundle(test.version);
  const compatP = lireCompatibilite(lancer('npx', ['--yes', CLI_CAPGO, 'bundle', 'compatibility', '--channel', CANAL, '--text']).sortie);
  const etatP = {
    branche: git('rev-parse', '--abbrev-ref', 'HEAD'), propre: git('status', '--porcelain') === '',
    poussee: git('rev-parse', 'HEAD') === git('rev-parse', 'origin/main'),
    versionPkg: pkgP?.version, versionTest: test.version, versionProd: prod.version, commitBundle,
    commitDansMain: Boolean(commitBundle) && lancer('git', ['merge-base', '--is-ancestor', commitBundle, 'origin/main']).code === 0,
    compat: compatP,
  };
  ok(`production : ${prod.version} · ${CANAL_TEST} : ${test.version} (commit ${commitBundle ?? '?'})`);
  const refusP = refusPromotion(etatP);
  if (refusP.length) stop(refusP);
  ok(`main poussé, contient ${commitBundle} ; ${compatP.modules.length} modules natifs identiques à production`);
  if (ESSAI) { console.log(`\nESSAI terminé : ${test.version} peut passer en production. Pour la servir : npm run ota -- --promouvoir`); process.exit(0); }
  const set = lancer('npx', ['--yes', CLI_CAPGO, 'channel', 'set', CANAL, APP_ID, '--bundle', test.version], { muet: false });
  if (set.code !== 0) stop(`Capgo a refusé de servir ${test.version} sur ${CANAL} (code ${set.code}).`);
  const apresP = await canal(CANAL);
  if (apresP.version !== test.version) stop(`le canal ${CANAL} sert ${apresP.version}, pas ${test.version}.`);
  ok(`canal ${CANAL} : ${apresP.version} (commit ${commitBundle}) — le bundle essayé, sans rebuild`);
  console.log('\nOTA publiée en production.');
  process.exit(0);
}

console.log(`OTA Capgo — canal ${CIBLE}${ESSAI ? ' — ESSAI (aucun envoi)' : ''}`);

// ── A. Dépôt et versions ─────────────────────────────────────────────────────
console.log('\nA. Dépôt et versions');
lancer('git', ['fetch', 'origin', 'main']);
const pkg = lireJson(path.join(RACINE, 'package.json'));
const lock = lireJson(path.join(RACINE, 'package-lock.json'));
const avant = await canal(CANAL);
const avantTest = CIBLE === CANAL_TEST ? await canal(CANAL_TEST) : null;
// Un numéro ne sert jamais deux fois : au-dessus de production ET du canal de test.
const plusHaute = [avant.version, avantTest?.version].filter(Boolean).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).pop();
const etat = {
  canal: CIBLE,
  aJour: lancer('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).code === 0,
  branche: git('rev-parse', '--abbrev-ref', 'HEAD'),
  propre: git('status', '--porcelain') === '',
  poussee: git('rev-parse', 'HEAD') === git('rev-parse', 'origin/main'),
  worktree: path.resolve(RACINE, git('rev-parse', '--git-dir')) !== path.resolve(RACINE, git('rev-parse', '--git-common-dir')),
  versionPkg: pkg?.version,
  versionLock: lock?.packages?.['']?.version === lock?.version ? lock?.version : `${lock?.version}/${lock?.packages?.['']?.version}`,
  versionCanal: plusHaute,
  versionsBinaires: [
    readFileSync(path.join(RACINE, 'android/app/build.gradle'), 'utf8').match(/^\s*versionName "([^"]+)"/m)?.[1] ?? 'illisible',
    readFileSync(path.join(RACINE, 'codemagic.yaml'), 'utf8').match(/agvtool new-marketing-version (\S+)/)?.[1] ?? 'illisible',
  ],
};
ok(`canal ${CANAL} : ${avant.version} (blocage « ${avant.blocage} », sous le natif : ${avant.sousNatif ? 'refusé' : 'permis'})`);
if (avantTest) ok(`canal ${CANAL_TEST} : ${avantTest.version ?? 'vide'} — cible de cet envoi (production intouchée)`);

// ── B. Modules natifs contre le canal ────────────────────────────────────────
console.log('\nB. Modules natifs (Capgo bundle compatibility, contre le bundle en service)');
const compatSortie = lancer('npx', ['--yes', CLI_CAPGO, 'bundle', 'compatibility', '--channel', CANAL, '--text']).sortie;
const compat = lireCompatibilite(compatSortie);
for (const m of compat.modules) console.log(`    ${m.statut === 'OK' ? '·' : '✗'} ${m.nom.padEnd(32)} ${m.local.padEnd(8)} canal ${m.distant || '—'}`);
const refus = refusAvantEnvoi({ ...etat, compat });
if (refus.length) stop(refus);
ok(`main propre et ${CIBLE === CANAL_TEST ? "à jour d'origin/main" : 'poussé'} (${git('rev-parse', '--short=7', 'HEAD')}), version ${etat.versionPkg} > canal ${etat.versionCanal}`);
ok(`${compat.modules.length} modules natifs identiques au canal : aucune OTA vers un binaire incompatible`);

// ── C. Build ─────────────────────────────────────────────────────────────────
console.log('\nC. Build web');
const court = git('rev-parse', '--short=7', 'HEAD');
if (lancer('npm', ['run', 'build'], { muet: false }).code !== 0) stop('npm run build a échoué (voir ci-dessus).');
const empreinte = lireJson(path.join(RACINE, 'dist', 'build.json'))?.build ?? '';
if (!buildConforme(empreinte, court)) stop(`empreinte du build « ${empreinte} » ≠ commit ${court} (ou « -dirty »).`);
if (git('status', '--porcelain') !== '') stop(`le build a sali l'arbre :\n${git('status', '--short')}`);
ok(`dist/ = ${empreinte}`);

if (ESSAI) {
  console.log(`\nESSAI terminé : tout est prêt pour ${etat.versionPkg}. Pour envoyer : npm run ota`);
  process.exit(0);
}

// ── D. Envoi ─────────────────────────────────────────────────────────────────
console.log(`\nD. Envoi ${etat.versionPkg} sur ${CIBLE} (--delta, --fail-on-incompatible)`);
const envoi = lancer('npx', ['--yes', CLI_CAPGO, 'bundle', 'upload', '--channel', CIBLE, '--bundle', etat.versionPkg,
  '--path', 'dist', '--delta', '--fail-on-incompatible', '--comment', `"${court}"`], { muet: false });
if (envoi.code !== 0) stop(`Capgo a refusé ou interrompu l'envoi (code ${envoi.code}). Le numéro ${etat.versionPkg} peut être consommé : en monter un neuf.`);

// ── E. Relecture ─────────────────────────────────────────────────────────────
const apres = await canal(CIBLE);
if (apres.version !== etat.versionPkg) stop(`le canal ${CIBLE} sert ${apres.version}, pas ${etat.versionPkg}.`);
ok(`canal ${CIBLE} : ${apres.version} (commit ${court})`);
if (CIBLE !== CANAL) {
  const prodApres = await canal(CANAL);
  if (prodApres.version !== avant.version) stop(`ALERTE : production sert ${prodApres.version} (avant : ${avant.version}).`);
  ok(`production intouchée : ${prodApres.version}`);
}
console.log(`\nOTA publiée sur ${CIBLE}.`);
