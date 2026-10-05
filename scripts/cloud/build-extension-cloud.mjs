// LA COPIE CLOUD DE L'EXTENSION — celle qui tourne dans les navigateurs FillSell
// Cloud (serveurs Hetzner). Construite à partir du chrome-extension/ COMMITÉ
// (git archive : jamais un fichier de travail), transformée EXACTEMENT comme le
// paquet du Chrome Web Store (scripts/minify-extension.mjs), puis ajustée par
// des patchs à ancre UNIQUE (une ancre absente ou double = arrêt, rien n'est
// produit). Le dossier chrome-extension/ n'est JAMAIS modifié : l'extension
// du parc reste strictement identique.
//
//   node scripts/cloud/build-extension-cloud.mjs [--commit=HEAD]
//   → build/extension-cloud/ (copiée sur le serveur par serveur-cloud/outils/deployer.sh)
//
// Ce qui change dans la copie Cloud (et rien d'autre) :
//   · Vinted, Leboncoin, Beebs seulement : eBay passe par l'API (jamais par ce
//     navigateur), Opla sort le 10/10 (aucune permission Opla → « sans_opla ») ;
//   · le poste se déclare « poste_cloud » à get-pending-jobs (qui ne lui sert que
//     ces plateformes et n'écrase pas profiles.extension_build de l'ordinateur) ;
//   · les demandes « Me connecter » de l'extension sont ignorées : dans le Cloud,
//     c'est l'écran de l'app (orchestrateur) qui ouvre la page de connexion ;
//   · identifiant fixe (clé de manifeste) : dnankhhfellobiobloopcjgkdioblpjd ;
//   · BUILD_ID « …-cloud » : handler_build dit qui a traité quoi.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'build', 'extension-cloud');
const TRAVAIL = path.join(RACINE, 'build', 'extension-cloud-src');
const BUILD_TOKEN = '__FILLSELL_BUILD_ID__';
// Clé PUBLIQUE de la copie Cloud (fixe l'identifiant ; rien de secret).
const CLE_PUBLIQUE = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnz+xal/tm6qqr81BGvwBZtEVu295j+t0LAHLM4nAiJwbRL6E+uSRMBEBQ9n4cM8wg9YJuV0QyCuotpO6JkfZcCKmZzlN3RCRNdzWsyRqvf+jjw/7J3FpIPcHSDeqxJbMpLfN1smMBNIPPmZT1/laTAeHjmw9htncYuysvTeMOHpViDuJgUTSfG1+8NX5Fw6v6cF/FnvEMaYAWqguWpKFqt4HgWDTDAZL5/bMOOtx6a7wu7+rqnqXnMnrNtORR1B8SYhjuzsaDD3bUMXOg7s8o+pT65HJ/KXBDm96WDKThA9Bh4xZ/q+rlF5esJIVdutY0IAxy7hz8BdZOb1k8x+pYwIDAQAB';
export const ID_EXTENSION_CLOUD = 'dnankhhfellobiobloopcjgkdioblpjd';
export const PLATEFORMES = ['vinted', 'leboncoin', 'beebs'];
const PF = PLATEFORMES.join(',');
const L = (a) => '[' + a.map((x) => JSON.stringify(x)).join(', ') + ']';

/** Les patchs de background.js (pur : testé par scripts/cloud-extension-selftest.mjs). */
export function patcherBackground(bg) {
  const appliques = [];
  const patch = (nom, ancre, remplacement) => {
    const n = bg.split(ancre).length - 1;
    if (n !== 1) throw new Error(`patch « ${nom} » : ancre trouvée ${n} fois (attendu 1) :\n  ${ancre}`);
    bg = bg.replace(ancre, () => remplacement);
    appliques.push(nom);
  };
  patch('constantes Cloud',
    'const FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__";',
    'const FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__";\n'
    + `const FILLSELL_CLOUD = true; // copie Cloud (scripts/cloud/build-extension-cloud.mjs)\n`
    + `const CLOUD_PLATEFORMES = ${L(PLATEFORMES)};`);
  patch('jobs : plateformes du Cloud seulement (le serveur filtre aussi)',
    '    jobs = rep.jobs;',
    '    jobs = (Array.isArray(rep.jobs) ? rep.jobs : []).filter((j) => CLOUD_PLATEFORMES.includes(j.platform));');
  patch('capacités : poste_cloud',
    'caps.push((await oplaAccesAccorde()) ? "opla_acces" : "sans_opla");',
    'caps.push((await oplaAccesAccorde()) ? "opla_acces" : "sans_opla");\n  caps.push("poste_cloud");');
  patch('« Me connecter » : géré par l\'écran Cloud de l\'app',
    'if (Array.isArray(rep.connexion_commands) && rep.connexion_commands.length) {',
    'rep.connexion_commands = []; // Cloud : la connexion passe par l\'écran « Me connecter » de l\'app\n    if (Array.isArray(rep.connexion_commands) && rep.connexion_commands.length) {');
  patch('sondes de session (rapport)',
    'async function reportPlatformSessions(accessToken, { plateformes = ["vinted", "leboncoin", "ebay", "beebs", "opla"]',
    `async function reportPlatformSessions(accessToken, { plateformes = ${L(PLATEFORMES)}`);
  patch('sondes de session (lecture)',
    'async function probePlatformSessions(plateformes = ["vinted", "leboncoin", "ebay", "beebs", "opla"])',
    `async function probePlatformSessions(plateformes = ${L(PLATEFORMES)})`);
  patch('détection de vente : plateformes du Cloud',
    '"&status=eq.published&action=in.(publish,republish)&listing_url=not.is.null" +',
    `"&status=eq.published&action=in.(publish,republish)&listing_url=not.is.null&platform=in.(${PF})" +`);
  patch('URL manquantes : plateformes du Cloud',
    '"&status=eq.published&action=in.(publish,republish)&listing_url=is.null" +',
    `"&status=eq.published&action=in.(publish,republish)&listing_url=is.null&platform=in.(${PF})" +`);
  patch('relevés d\'annonces : Leboncoin, Beebs',
    'const RELEVE_PLATEFORMES = ["leboncoin", "beebs", "ebay", "opla"];',
    'const RELEVE_PLATEFORMES = ["leboncoin", "beebs"]; // Cloud : eBay par l\'API, Opla sorti');
  patch('relevés de ventes : Vinted, Leboncoin',
    'const VENTES_PLATEFORMES = ["vinted", "leboncoin", "opla"];',
    'const VENTES_PLATEFORMES = ["vinted", "leboncoin"]; // Cloud');
  patch('reprise des jobs orphelins : plateformes du Cloud',
    '"cross_post_jobs?select=id,platform,action,title,inventaire_id,created_at,platform_fields&status=eq.processing",',
    `"cross_post_jobs?select=id,platform,action,title,inventaire_id,created_at,platform_fields&status=eq.processing&platform=in.(${PF})",`);
  return { bg, appliques };
}

/** Le manifeste de la copie Cloud (pur : testé). */
export function patcherManifeste(man) {
  const MATCHES = { vinted: ['https://*.vinted.fr/*', 'https://*.vinted.com/*'], leboncoin: ['https://*.leboncoin.fr/*'], beebs: ['https://*.beebs.app/*'] };
  const permis = new Set([...PLATEFORMES.flatMap((p) => MATCHES[p]), 'https://fillsell.app/*']);
  const supabase = (man.host_permissions ?? []).filter((h) => /supabase\.co/.test(h));
  if (supabase.length !== 1) throw new Error('manifeste : hôte Supabase introuvable');
  const m = { ...man };
  m.host_permissions = [...permis, ...supabase];
  delete m.optional_host_permissions;
  m.content_scripts = (man.content_scripts ?? []).filter((cs) => (cs.matches ?? []).every((x) => permis.has(x)));
  if (m.content_scripts.length !== 1 + PLATEFORMES.length) throw new Error(`manifeste : ${m.content_scripts.length} content_scripts gardés (attendu ${1 + PLATEFORMES.length})`);
  m.web_accessible_resources = (man.web_accessible_resources ?? []).map((w) => ({ ...w, matches: (w.matches ?? []).filter((x) => permis.has(x)) }));
  m.version_name = `${man.version}-cloud`;
  m.key = CLE_PUBLIQUE;
  return m;
}

async function main() {
  const commit = (process.argv.find((a) => a.startsWith('--commit='))?.slice(9)) || 'HEAD';
  const require = createRequire(path.join(RACINE, 'package.json'));
  const JSZip = require('jszip');
  const { transformExtensionFile, isExcludedFromPackage } = await import(pathToFileURL(path.join(RACINE, 'scripts', 'minify-extension.mjs')).href);
  const sha = execFileSync('git', ['-C', RACINE, 'rev-parse', '--short=7', commit]).toString().trim();
  await rm(TRAVAIL, { recursive: true, force: true });
  await mkdir(TRAVAIL, { recursive: true });
  const archive = execFileSync('git', ['-C', RACINE, 'archive', '--format=zip', commit, 'chrome-extension'], { maxBuffer: 256 * 1024 * 1024 });
  const zin = await JSZip.loadAsync(archive);
  for (const [nom, e] of Object.entries(zin.files)) {
    if (e.dir) continue;
    const dest = path.join(TRAVAIL, ...nom.split('/'));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await e.async('nodebuffer'));
  }
  const SRC = path.join(TRAVAIL, 'chrome-extension');
  const bgChemin = path.join(SRC, 'background.js');
  const { bg, appliques } = patcherBackground(await readFile(bgChemin, 'utf8'));
  await writeFile(bgChemin, bg);
  execFileSync(process.execPath, ['--check', bgChemin], { stdio: 'pipe' });
  const manChemin = path.join(SRC, 'manifest.json');
  const man = patcherManifeste(JSON.parse(await readFile(manChemin, 'utf8')));
  await writeFile(manChemin, JSON.stringify(man, null, 2) + '\n');
  const BUILD_ID = `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}+${sha}-cloud`;
  await rm(SORTIE, { recursive: true, force: true });
  let nJs = 0, nAutres = 0;
  async function parcourir(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { await parcourir(abs); continue; }
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      if (isExcludedFromPackage(rel)) continue;
      let contenu = await transformExtensionFile(rel, await readFile(abs));
      if (/\.js$/i.test(rel)) { contenu = Buffer.from(contenu.toString('utf8').split(BUILD_TOKEN).join(BUILD_ID), 'utf8'); nJs++; } else nAutres++;
      const out = path.join(SORTIE, ...rel.split('/'));
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, contenu);
    }
  }
  await parcourir(SRC);
  await rm(TRAVAIL, { recursive: true, force: true });
  console.log('── Extension Cloud ──');
  console.log(`  commit      : ${sha} (${commit})`);
  console.log(`  version     : ${man.version} (${man.version_name})`);
  console.log(`  BUILD_ID    : ${BUILD_ID}`);
  console.log(`  identifiant : ${ID_EXTENSION_CLOUD}`);
  console.log(`  fichiers    : ${nJs} .js · ${nAutres} autres → ${SORTIE}`);
  for (const a of appliques) console.log(`  ✓ ${a}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`ÉCHEC : ${e.message}`); process.exit(1); });
}
