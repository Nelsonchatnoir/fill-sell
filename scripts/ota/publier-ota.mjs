// ════════════════════════════════════════════════════════════════════════════
// PUBLIER UNE OTA CAPGO — une commande, tout est vérifié AVANT l'envoi (08/11/2026, ordre de Nico)
// ════════════════════════════════════════════════════════════════════════════
//   npm run ota -- --essai     tous les contrôles + build, AUCUN envoi (à faire d'abord)
//   npm run ota                contrôles, build, envoi --delta sur le canal production, relecture du canal
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
import { APP_ID, CANAL, CLI_CAPGO, buildConforme, lireCompatibilite, refusAvantEnvoi } from './regles-ota.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESSAI = process.argv.includes('--essai');
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

async function canal() {
  if (!existsSync(CLE_CAPGO)) stop(`clé Capgo absente (${CLE_CAPGO}).`);
  const cle = readFileSync(CLE_CAPGO, 'utf8').trim();
  const r = await fetch(`https://api.capgo.app/channel?app_id=${APP_ID}&channel=${CANAL}`, { headers: { authorization: cle } });
  if (!r.ok) stop(`lecture du canal ${CANAL} refusée par Capgo (HTTP ${r.status}).`);
  const j = await r.json();
  const c = Array.isArray(j) ? j[0] : j;
  return { version: c?.version?.name ?? null, blocage: c?.disableAutoUpdate ?? null, sousNatif: c?.disableAutoUpdateUnderNative ?? null };
}

console.log(`OTA Capgo — canal ${CANAL}${ESSAI ? ' — ESSAI (aucun envoi)' : ''}`);

// ── A. Dépôt et versions ─────────────────────────────────────────────────────
console.log('\nA. Dépôt et versions');
lancer('git', ['fetch', 'origin', 'main']);
const pkg = lireJson(path.join(RACINE, 'package.json'));
const lock = lireJson(path.join(RACINE, 'package-lock.json'));
const avant = await canal();
const etat = {
  branche: git('rev-parse', '--abbrev-ref', 'HEAD'),
  propre: git('status', '--porcelain') === '',
  poussee: git('rev-parse', 'HEAD') === git('rev-parse', 'origin/main'),
  worktree: path.resolve(RACINE, git('rev-parse', '--git-dir')) !== path.resolve(RACINE, git('rev-parse', '--git-common-dir')),
  versionPkg: pkg?.version,
  versionLock: lock?.packages?.['']?.version === lock?.version ? lock?.version : `${lock?.version}/${lock?.packages?.['']?.version}`,
  versionCanal: avant.version,
  versionsBinaires: [
    readFileSync(path.join(RACINE, 'android/app/build.gradle'), 'utf8').match(/^\s*versionName "([^"]+)"/m)?.[1] ?? 'illisible',
    readFileSync(path.join(RACINE, 'codemagic.yaml'), 'utf8').match(/agvtool new-marketing-version (\S+)/)?.[1] ?? 'illisible',
  ],
};
ok(`canal ${CANAL} : ${avant.version} (blocage « ${avant.blocage} », sous le natif : ${avant.sousNatif ? 'refusé' : 'permis'})`);

// ── B. Modules natifs contre le canal ────────────────────────────────────────
console.log('\nB. Modules natifs (Capgo bundle compatibility, contre le bundle en service)');
const compatSortie = lancer('npx', ['--yes', CLI_CAPGO, 'bundle', 'compatibility', '--channel', CANAL, '--text']).sortie;
const compat = lireCompatibilite(compatSortie);
for (const m of compat.modules) console.log(`    ${m.statut === 'OK' ? '·' : '✗'} ${m.nom.padEnd(32)} ${m.local.padEnd(8)} canal ${m.distant || '—'}`);
const refus = refusAvantEnvoi({ ...etat, compat });
if (refus.length) stop(refus);
ok(`main propre et poussé (${git('rev-parse', '--short=7', 'HEAD')}), version ${etat.versionPkg} > canal ${etat.versionCanal}`);
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
console.log(`\nD. Envoi ${etat.versionPkg} (--delta, --fail-on-incompatible)`);
const envoi = lancer('npx', ['--yes', CLI_CAPGO, 'bundle', 'upload', '--channel', CANAL, '--bundle', etat.versionPkg,
  '--path', 'dist', '--delta', '--fail-on-incompatible', '--comment', `"${court}"`], { muet: false });
if (envoi.code !== 0) stop(`Capgo a refusé ou interrompu l'envoi (code ${envoi.code}). Le numéro ${etat.versionPkg} peut être consommé : en monter un neuf.`);

// ── E. Relecture ─────────────────────────────────────────────────────────────
const apres = await canal();
if (apres.version !== etat.versionPkg) stop(`le canal sert ${apres.version}, pas ${etat.versionPkg}.`);
ok(`canal ${CANAL} : ${apres.version} (commit ${court})`);
console.log('\nOTA publiée.');
