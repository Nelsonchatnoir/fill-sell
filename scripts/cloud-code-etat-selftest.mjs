// VERROU (15/11/2026 soir, ordre de Nico — point D ; cliente af37fa49) : PENDANT UNE PAGE DE CODE ET À LA FERMETURE DE
// « ME CONNECTER », usage_logs DIT LA LONGUEUR DU CHAMP DU CODE, S'IL A LE CLAVIER, ET SI UNE VALIDATION EST PARTIE.
//
// Ce qui manquait (diagnostic du 15/11 soir) : à 20:15, sur son ordinateur, page du code Kiabi, une frappe reçue, aucune
// vérification chez Kiabi, puis « Fermer » — et rien ne disait ce qu'elle voyait dans le champ (vide ? 6 chiffres ? le
// clavier ailleurs ?). Désormais l'orchestrateur Cloud (donc web, iPhone, Android, toute version de l'app) écrit
// « cloud_connexion_code_etat » : moments demande / saisie / validation / nouveau_code / passe / fermeture ; longueur,
// longueur attendue, clavier, validation (envoyée ou non : bouton désactivé, Entrée hors du champ), compteurs.
// JAMAIS la valeur : seule la longueur sort de la page ; mot de passe, e-mail, identifiant jamais mesurés ; la lecture de
// DÉTECTION (toutes les 2 s, hors code) reste identique à l'octet. Bornes : au plus 40 lignes par connexion, une
// « saisie » au changement seulement, une toutes les 3 s au plus ; aucune ligne sans code.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. Le serveur (node --test, « point D »)');
for (const fichier of ['serveur-cloud/tests/code-connexion.test.mjs', 'serveur-cloud/tests/simulation.test.mjs']) {
  const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=point D', fichier], { cwd: racine, encoding: 'utf8', timeout: 240_000 });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passe = Number(sortie.match(/ℹ pass (\d+)/)?.[1] ?? 0), echoue = Number(sortie.match(/ℹ fail (\d+)/)?.[1] ?? 1);
  ok(r.status === 0 && passe >= 3 && echoue === 0, `${fichier} : ${passe} verts, ${echoue} rouges`);
  if (r.status !== 0) console.log(sortie.split('\n').filter((l) => /✖|Assertion|Error|actual|expected/.test(l)).slice(0, 12).join('\n'));
}

console.log('2. Les sources');
const code = lire('serveur-cloud/src/codeConnexion.js');
const cnx = lire('serveur-cloud/src/connexion.js');
ok(/export const EXPRESSION_CODE_DEMANDE = lecturePage\(false\);/.test(code) && /export const EXPRESSION_ETAT_CODE = lecturePage\(true\);/.test(code),
  'une seule lecture écrite deux fois : détection (sans mesure) et état (avec la longueur)');
ok(/lg: secret\(i\) \? null : String\(i\.value \?\? ''\)\.length/.test(code), 'seule la LONGUEUR sort de la page ; mot de passe / e-mail / identifiant : null');
ok(/feature: 'cloud_connexion_code_etat'/.test(cnx) && /base\.from\('usage_logs'\)\.insert/.test(cnx), 'écrit par l\'orchestrateur dans usage_logs (web et mobile, toute version de l\'app)');
ok(/const LIGNES_CODE_MAX = 40;/.test(cnx) && /const ECART_LIGNES_CODE_MS = 3000;/.test(cnx), 'bornes : 40 lignes par connexion, une « saisie » toutes les 3 s au plus');
ok(/expression: code \? EXPRESSION_ETAT_CODE : EXPRESSION_CODE_DEMANDE/.test(cnx), 'toujours UNE lecture toutes les 2 s (mesurée seulement pendant un code)');
ok(/tracerCode\('fermeture', \{ raison, connectee, en_attente: codeEnAttente \}\)/.test(cnx), 'la fermeture de « Me connecter » écrit sa ligne');
ok(!/valeur|value/i.test((cnx.match(/const metadata = \{[\s\S]*?\};/) ?? [''])[0]), 'la ligne ne porte aucune valeur saisie');

console.log(`\n${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
