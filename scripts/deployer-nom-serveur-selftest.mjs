// selftest:deployer-nom-serveur (06/11/2026, avant l'essai de l'AX42) — un serveur NEUF ne prend jamais le nom de
// cloud-1. Avant : sans .env, serveur-cloud/outils/deployer.sh installait env.exemple tel quel (SERVEUR_NOM=cloud-1,
// compte de Nico, ENTRETIEN_POOL=1) : la machine neuve battait sous le nom de cloud-1 et tenait le pool avec lui.
// Ce selftest joue (1) outils/env-premier.sh pour de vrai sur une copie d'env.exemple, (2) la garde du nom de
// deployer.sh avec un faux ssh/scp/git (aucun réseau, aucun serveur), (3) le câblage du bloc distant.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASH = process.platform === 'win32' && existsSync('C:\\Program Files\\Git\\bin\\bash.exe') ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const ENV_PREMIER = path.join(RACINE, 'serveur-cloud/outils/env-premier.sh');
const MODELE = path.join(RACINE, 'serveur-cloud/deploiement/env.exemple');
const DEPLOYER = path.join(RACINE, 'serveur-cloud/outils/deployer.sh');
const FERME = '00000000-0000-0000-0000-000000000000';
const posix = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => `/${l.toLowerCase()}`);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const tmp = mkdtempSync(path.join(tmpdir(), 'deployer-nom-'));
const bash = (args, env = {}) => spawnSync(BASH, args, { encoding: 'utf8', env: { ...process.env, ...env } });
const lignes = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

try {
  // ── 1. env-premier.sh, pour de vrai ───────────────────────────────────────
  const env3 = path.join(tmp, 'env-cloud-3');
  let r = bash([posix(ENV_PREMIER), posix(MODELE), posix(env3), 'cloud-3']);
  ok(r.status === 0, `env-premier cloud-3 : ${r.stderr}`);
  const e = lignes(env3), m = lignes(MODELE);
  ok(m.SERVEUR_NOM === 'cloud-1' && m.ENTRETIEN_POOL === '1', 'le modèle dit bien cloud-1 / pool tenu (le piège existe)');
  ok(e.SERVEUR_NOM === 'cloud-3', 'SERVEUR_NOM = le nom donné');
  ok(e.COMPTES_AUTORISES === FERME, 'aucun compte servi (identifiant inexistant, jamais vide = tous)');
  ok(e.ENTRETIEN_POOL === '0', 'pas d\'entretien du pool');
  ok(Buffer.from(e.TICKETS_CLE ?? '', 'base64').length === 32, 'clé des tickets : 32 octets tirés sur place');
  for (const [k, v] of Object.entries(m)) {
    if (!['SERVEUR_NOM', 'COMPTES_AUTORISES', 'ENTRETIEN_POOL', 'TICKETS_CLE'].includes(k)) ok(e[k] === v, `${k} recopié du modèle`);
  }
  ok(Object.keys(e).length === Object.keys(m).length, 'aucune ligne perdue ni ajoutée');
  ok(!readdirSync(tmp).some((f) => f.includes('.neuf.')), 'aucun fichier temporaire laissé');

  // Un .env en place n'est jamais réécrit.
  const avant = readFileSync(env3, 'utf8');
  r = bash([posix(ENV_PREMIER), posix(MODELE), posix(env3), 'cloud-4']);
  ok(r.status !== 0 && /existe déjà/.test(r.stderr), '.env en place : refus');
  ok(readFileSync(env3, 'utf8') === avant, '.env en place : intact');

  // Nom absent ou douteux : refus, aucun fichier.
  for (const nom of [undefined, '', 'Cloud3', 'cloud-3#x', 'cloud 3', '-x', 'cloud-3/..']) {
    const cible = path.join(tmp, `env-refus-${n}`);
    r = bash([posix(ENV_PREMIER), posix(MODELE), posix(cible), ...(nom === undefined ? [] : [nom])]);
    ok(r.status !== 0 && !existsSync(cible), `nom ${JSON.stringify(nom)} : refus, aucun .env`);
  }

  // Un modèle qui aurait perdu une ligne : refus (le code retomberait sur cloud-1 / tous / pool tenu).
  for (const cle of ['SERVEUR_NOM', 'COMPTES_AUTORISES', 'ENTRETIEN_POOL', 'TICKETS_CLE']) {
    const modeleAmpute = path.join(tmp, `modele-sans-${cle}`);
    writeFileSync(modeleAmpute, readFileSync(MODELE, 'utf8').split('\n').filter((l) => !l.startsWith(`${cle}=`)).join('\n'));
    const cible = path.join(tmp, `env-sans-${cle}`);
    r = bash([posix(ENV_PREMIER), posix(modeleAmpute), posix(cible), 'cloud-3']);
    ok(r.status !== 0 && !existsSync(cible), `modèle sans ${cle} : refus, aucun .env`);
  }
  ok(!readdirSync(tmp).some((f) => f.includes('.neuf.')), 'aucun fichier temporaire laissé après les refus');

  // ── 2. La garde du nom dans deployer.sh (faux ssh / scp / git, faux dépôt) ─
  const faux = path.join(tmp, 'bin'); mkdirSync(faux);
  const depot = path.join(tmp, 'depot');
  for (const d of ['serveur-cloud/src', 'serveur-cloud/outils', 'serveur-cloud/navigateur-chrome', 'serveur-cloud/deploiement', 'serveur-cloud/public',
    'supabase/functions/_shared', 'src/cloud/connexion', 'build/extension-cloud']) mkdirSync(path.join(depot, d), { recursive: true });
  for (const f of ['serveur-cloud/package.json', 'serveur-cloud/package-lock.json', 'serveur-cloud/Dockerfile', 'serveur-cloud/public/index.html',
    // (14/11) + alertes-nico.js : la règle des mails à Nico, copiée dans lib/ avec cloud-pool.js.
    'supabase/functions/_shared/cloud-pool.js', 'supabase/functions/_shared/alertes-nico.js', 'src/cloud/connexion/clientConnexion.js', 'build/extension-cloud/manifest.json']) writeFileSync(path.join(depot, f), '{}');
  writeFileSync(path.join(depot, 'serveur-cloud/src/navigateur.js'), `const I = 'ghcr.io/steel-dev/steel-browser@sha256:${'a'.repeat(64)}';\n`);
  copyFileSync(DEPLOYER, path.join(depot, 'serveur-cloud/outils/deployer.sh'));
  const journal = path.join(tmp, 'ssh.log');
  // Faux ssh : 1er appel = la lecture du nom (réponse dans $FAUX_NOM) ; tout appel suivant = « on est allé trop loin ».
  writeFileSync(path.join(faux, 'ssh'), `#!/bin/bash\nfor a in "$@"; do last="$a"; done\necho "$last" >> "${posix(journal)}"\nif [ "$(wc -l < "${posix(journal)}")" -eq 1 ]; then printf '%s\\n' "$FAUX_NOM"; exit 0; fi\nexit 99\n`);
  writeFileSync(path.join(faux, 'scp'), '#!/bin/bash\nexit 99\n');
  writeFileSync(path.join(faux, 'git'), `#!/bin/bash\ncase "$*" in\n  "rev-parse --show-toplevel") echo "${posix(depot)}";;\n  status*) ;;\n  "rev-parse --short=12 HEAD") echo 0123456789ab;;\n  *) exit 98;;\nesac\n`);
  const jouer = (fauxNom, serveurNom) => {
    rmSync(journal, { force: true });
    const env = { PATH: `${posix(faux)}:${process.env.PATH}`, FAUX_NOM: fauxNom, HOME: posix(tmp) };
    if (serveurNom !== undefined) env.SERVEUR_NOM = serveurNom; else env.SERVEUR_NOM = '';
    const res = spawnSync(BASH, ['-c', `export PATH="${posix(faux)}:$PATH"; bash serveur-cloud/outils/deployer.sh 203.0.113.7 cloud-3.fillsell.app`],
      { cwd: depot, encoding: 'utf8', env: { ...process.env, ...env } });
    const appels = existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean) : [];
    return { ...res, appels, tout: `${res.stdout}${res.stderr}` };
  };
  let j = jouer('<aucun .env>', undefined);
  ok(j.status === 1 && /REFUS : premier déploiement/.test(j.tout) && j.appels.length === 1, `serveur neuf sans nom : refus AVANT tout envoi (${j.tout.slice(0, 200)})`);
  j = jouer('<aucun .env>', 'cloud-3');
  ok(/serveur NEUF : cloud-3/.test(j.tout) && j.appels.length === 2 && /mkdir -p \/srv\/fillsell-cloud\/paquets/.test(j.appels[1]), `serveur neuf nommé : la garde laisse passer (${j.tout.slice(0, 200)})`);
  j = jouer('<aucun .env>', 'cloud-3#x');
  ok(j.status === 1 && /REFUS : nom de serveur/.test(j.tout) && j.appels.length === 1, 'nom douteux : refus');
  j = jouer('cloud-2', 'cloud-3');
  ok(j.status === 1 && /s'appelle « cloud-2 »/.test(j.tout) && j.appels.length === 1, 'nom différent du .env en place : refus');
  j = jouer('', undefined);
  ok(j.status === 1 && /n'a pas de SERVEUR_NOM/.test(j.tout) && j.appels.length === 1, '.env en place sans nom : refus');
  j = jouer('cloud-2', undefined);
  ok(/serveur en place : cloud-2/.test(j.tout) && j.appels.length === 2, 'serveur en place, sans nom donné : redéploiement comme avant');
  j = jouer('cloud-2', 'cloud-2');
  ok(/serveur en place : cloud-2/.test(j.tout) && j.appels.length === 2, 'serveur en place, même nom : redéploiement');

  // ── 3. Le câblage du bloc distant ─────────────────────────────────────────
  const d = readFileSync(DEPLOYER, 'utf8');
  ok(spawnSync(BASH, ['-n', posix(DEPLOYER)]).status === 0, 'deployer.sh : syntaxe');
  ok(spawnSync(BASH, ['-n', posix(ENV_PREMIER)]).status === 0, 'env-premier.sh : syntaxe');
  ok(!/cp "\$P\/deploiement\/env\.exemple" "\$ENV"/.test(d), 'plus de copie d\'env.exemple tel quel');
  ok(/sh "\$P\/outils\/env-premier\.sh" "\$P\/deploiement\/env\.exemple" "\$ENV" "\$NOM"/.test(d), 'le .env neuf passe par env-premier.sh');
  ok(/bash -s -- "\$SHA" "\$DOMAINE" "\$IMAGE_STEEL" "\$\{SERVEUR_NOM:--\}" "\$\{DESTINATIONS_PROXY:-\}"/.test(d), 'le nom voyage en 4e (jamais vide : « - »), les sorties en dernier');
  ok(/NOM="\$4"; DESTINATIONS="\$\{5:-\}"/.test(d), 'le bloc distant lit le nom en $4 et les sorties en ${5:-}');
  ok(/cp -r serveur-cloud\/\{[^}]*outils[^}]*\}/.test(d), 'outils/ (donc env-premier.sh) part dans le paquet');
  const lanceur = readFileSync(path.join(RACINE, 'serveur-cloud/outils/lancer-serveur-test.mjs'), 'utf8');
  ok(/process\.env\.SERVEUR_NOM \|\|= NOM\.replace/.test(lanceur), 'lancer-serveur-test.mjs donne le nom au déploiement');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ selftest:deployer-nom-serveur — ${n} vérifications`);
