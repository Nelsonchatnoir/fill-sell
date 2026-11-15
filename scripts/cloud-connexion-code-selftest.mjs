// VERROU (15/11/2026, cliente af37fa49 — Pro + Cloud, Beebs « Continuer avec Kiabi », 3 connexions perdues de 07:43 à
// 08:00) : LE CODE DEMANDÉ PENDANT « ME CONNECTER » EST DIT, ATTENDU, ET SA FERMETURE EXPLIQUÉE.
//
// Ce qui s'est passé (enregistrements cloud-2 etat/essais/beebs-2026-11-15T06-43-19-152Z, T06-45-17-174Z,
// T06-58-59-349Z ; usage_logs ; cloud_connexions) : la page Kiabi s'affichait (correctif du 14/11), l'e-mail puis le mot de
// passe passaient (identity.kiabi.com /identity/v1/password/login 200), puis Kiabi, devant un appareil inconnu, exigeait
// un CODE envoyé par e-mail (/identity/v1/mfa/stepup → /identity/v1/passwordless/start → page signInWithCode). Aucun code
// n'est jamais revenu à Kiabi : fermée par elle 66 s après, fermée « faute de geste » (5 min) après deux allers-retours
// vers sa boîte mail, fermée par elle 43 s après. FillSell ne disait rien du code ; la page se fermait au bout de 5 min,
// le temps d'aller lire l'e-mail compris, sur « Fermé après un moment sans geste ».
//
// Ce verrou garde, pour TOUS les comptes et tous les fournisseurs :
//   1. le serveur (tests node : serveur-cloud/tests/code-connexion.test.mjs + la simulation « 15/11, af37fa49 ») ;
//   2. l'app : l'automate passe le code à l'écran (agir.code), le client lit { t:'code' } et prête son champ caché à un
//      code (one-time-code), l'écran montre le bandeau par-dessus la page sans rien décaler, et ne cache jamais
//      l'avertissement « se ferme dans 1 minute ».
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. Le serveur (node --test)');
for (const args of [['--test', 'serveur-cloud/tests/code-connexion.test.mjs'],
  ['--test', '--test-name-pattern=15/11, af37fa49|Kiabi', 'serveur-cloud/tests/simulation.test.mjs']]) {
  const r = spawnSync(process.execPath, args, { cwd: racine, encoding: 'utf8', timeout: 240_000 });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passe = Number(sortie.match(/ℹ pass (\d+)/)?.[1] ?? 0), echoue = Number(sortie.match(/ℹ fail (\d+)/)?.[1] ?? 1);
  ok(r.status === 0 && passe > 0 && echoue === 0, `${args.at(-1)} : ${passe} verts, ${echoue} rouges`);
  if (r.status !== 0) console.log(sortie.split('\n').filter((l) => /✖|Assertion|Error/.test(l)).slice(0, 12).join('\n'));
}

console.log('2. L\'automate de l\'écran (suiviVue.js)');
const { creerSuiviVue } = await import('../src/cloud/connexion/suiviVue.js');
const vus = [];
const s = creerSuiviVue({ finales: ['expire'], agir: { code: (c) => vus.push(c), message: (m) => vus.push(`m:${m}`) } });
s.etape('code', { attendu: true, canal: 'email', qui: 'Kiabi', titre: 'Code envoyé par e-mail', texte: 'Kiabi vient de…' });
s.etape('code', null);
ok(vus[0]?.qui === 'Kiabi' && vus[0]?.canal === 'email' && vus[1] === null, 'le code passe à l\'écran, puis « plus de code » (null)');
ok(!vus.some((v) => typeof v === 'string'), 'le code n\'est jamais pris pour un message ordinaire');

console.log('3. Le client (clientConnexion.js)');
const client = lire('src/cloud/connexion/clientConnexion.js');
ok(/else if \(m\.t === 'code'\) \{ champCode\(m\.attendu === true, m\.chiffres === true\); surEtat\('code', m\.attendu === true \? m : null\); \}/.test(client),
  '{ t:\'code\' } lu : champ caché préparé, puis l\'écran prévenu');
ok(/champ\.autocomplete = attendu \? 'one-time-code' : 'off'/.test(client), 'code attendu : le téléphone propose le code reçu (one-time-code) ; sinon le champ d\'avant');
ok(/champ\.autocomplete = 'off';/.test(client), 'le champ d\'avant reste « off » à l\'ouverture');

console.log('4. L\'écran (MeConnecterCloud.jsx › Vue)');
const ecran = lire('src/cloud/MeConnecterCloud.jsx');
ok(/data-cloud-code=/.test(ecran) && /position: 'absolute', top: 8, left: 12, right: 12/.test(ecran), 'bandeau du code PAR-DESSUS la page (aucun décalage de la page)');
ok(/data-cloud-bouton="code-compris"/.test(ecran) && /data-cloud-bouton="code-voir"/.test(ecran), '« Compris » le replie, « Voir » le rouvre');
ok(/\{!finie && !ailleurs && code && message === code\.texte \? '' : message\}/.test(ecran), 'la ligne d\'état ne cache QUE le texte du code (jamais l\'avertissement)');
ok(/setCode\(null\)/.test(ecran.slice(ecran.indexOf('fin: (etape, m) =>'), ecran.indexOf('fin: (etape, m) =>') + 200)), 'une fin retire le bandeau');
ok(/cloud_connexion_code_vu/.test(ecran) && /codeTrace\.current/.test(ecran), 'tracé une fois par code demandé');

console.log('5. Les pages Kiabi après le code (plateformes.js)');
const plat = lire('serveur-cloud/src/plateformes.js');
ok(/signInWithCode\|signUp\|codeExchange\|passwordless\|passwordReset\)\\\/\?\$\/i/.test(plat), 'codeExchange, signInWithCode… permis, sans sous-chemin');

console.log(`\n${n - ko}/${n} vérifications ${ko ? `— ${ko} ROUGE(S)` : 'vertes'}`);
process.exit(ko ? 1 : 0);
