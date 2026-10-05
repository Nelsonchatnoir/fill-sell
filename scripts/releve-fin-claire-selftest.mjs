// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉS : SEULEMENT SUR « SYNCHRONISER », CHAQUE FIN DITE EN CLAIR (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Marine (docs/enquetes/marine-0510/RAPPORT.md). Vérifie, sans réseau :
//   1. qui est un geste, qui est de la veille (app, base, extension alignées) ;
//   2. la situation lue sur chaque fin de relevé, textes d'avant compris ;
//   3. la phrase montrée : jamais « le défaut est chez nous », jamais un code
//      HTTP, une page ou des minutes ;
//   4. plus aucun texte qui promette une reprise automatique.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECLENCHEURS_VEILLE, estReleveDeVeille, FILTRE_SANS_VEILLE } from '../src/utils/declencheursReleve.js';
import { situationFinReleve, texteSituation } from '../src/annonces/finReleve.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const ok = (nom, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { echecs += 1; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`); }
};
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n');

console.log('\n1. Geste ou veille : les trois côtés disent la même chose');
const GESTES = ['bouton', 'bouton_distant', 'app', 'app:redemande', 'bouton_distant:redemande'];
const COUPES = ['serveur:premier_releve', 'reprise', 'reprise_connexion', 'serveur:reprise_absente', 'serveur:levee_antirobot', 'reprise:redemande', 'serveur:premier_releve:redemande', null];
ok('la veille ne compte aucun geste', GESTES.every((d) => !estReleveDeVeille(d)));
ok('les déclencheurs coupés ne sont pas de la veille', COUPES.every((d) => !estReleveDeVeille(d)));
const bg = lire('chrome-extension/background.js');
const reExt = bg.match(/const DECLENCHEURS_GESTE_RE = (\/.+\/);/);
ok('l\'extension déclare ses gestes', !!reExt);
// eslint-disable-next-line no-eval
const geste = reExt ? eval(reExt[1]) : null;
ok('extension : les gestes importent', !!geste && GESTES.every((d) => geste.test(d)));
ok('extension : veille et coupés n\'importent pas', !!geste && [...DECLENCHEURS_VEILLE, ...COUPES.filter(Boolean)].every((d) => !geste.test(d)));
const mig = lire('supabase/migrations/20261005200000_releves_sur_geste.sql');
ok('base : même expression de geste', mig.includes("'^(bouton|bouton_distant|app)(:redemande)?$'"));
ok('base : même liste de veille', DECLENCHEURS_VEILLE.every((d) => mig.includes(`'${d}'`)));
ok('filtre PostgREST : déclencheur absent gardé, veille écartée', FILTRE_SANS_VEILLE.startsWith('declencheur.is.null,declencheur.not.in.(') && DECLENCHEURS_VEILLE.every((d) => FILTRE_SANS_VEILLE.includes(`"${d}"`)));
ok('extension : interrupteur des reprises automatiques éteint', bg.includes('const REPRISE_AUTOMATIQUE_RELEVE = false;'));
const hw = lire('supabase/functions/handler-watch/index.ts');
ok('handler-watch : reprise au retour de la connexion éteinte', hw.includes('const RELANCE_AUTOMATIQUE_RELEVE = false;'));

console.log('\n2. La situation lue sur chaque fin');
const cas = [
  ['[pas_connecte] aucune session Vinted dans ce navigateur — Vinted a refusé la lecture du compte 3 fois (HTTP 401)', 'pas_connecte'],
  ["Vinted a refusé la lecture du compte 3 fois de suite (HTTP 401), rechargement de la page compris. Si tu es bien…", 'pas_connecte'],
  ['[cause403] session_absente — aucune session Vinted dans ce navigateur (HTTP 403 sur la sonde)', 'pas_connecte'],
  ['[incomplet] session leboncoin : page de connexion · [rattachement] …', 'pas_connecte'],
  ['[incomplet] accès Opla non accordé · [rattachement] …', 'pas_connecte'],
  ['[boutique_a_confirmer] Ce navigateur est connecté au dressing @x — ce compte FillSell suit @y.', 'autre_compte'],
  ['[anti_robot] Vinted a refusé l\'accès à son API (HTTP 403, protection anti-robot)', 'anti_robot'],
  ['[watchdog] La synchronisation s\'est arrêtée avant la fin. … (arrêt sans progression depuis 7 min : page 1, 64 lus, extension vue il y a 2 min)', 'arret'],
  ["[watchdog] synchronisation arrêtée en cours de route : aucune progression depuis 7 min (page 1, 64 articles lus). Chrome tournait bien de ton côté … Le défaut est chez nous, pas chez toi.", 'arret'],
  ["demande jamais réclamée en 6 h — ton ordinateur n'avait pas Chrome ouvert avec l'extension FillSell.", 'pas_prise'],
  ['page 2 : réseau : Vinted n\'a pas répondu en 60 s', 'echec'],
];
for (const [erreur, attendu] of cas) {
  const s = situationFinReleve({ erreur });
  ok(`${attendu.padEnd(12)} ← « ${erreur.slice(0, 60)}… »`, s === attendu, s);
}

console.log('\n3. La phrase montrée');
const T = {
  signalNonConnecte: (n) => `Connecte-toi à ${n} sur ton ordinateur, puis appuie sur « Synchroniser ».`,
  finAutreCompte: (n) => `autre compte ${n}`, finAntiRobot: (n) => `anti-robot ${n}`,
  finArret: (n) => `arrêt ${n}`, finPasPrise: (n) => `pas prise ${n}`, finEchec: (n) => `échec ${n}`,
};
ok('Marine non connectée → « Connecte-toi à Vinted sur ton ordinateur »', texteSituation('pas_connecte', 'Vinted', T).startsWith('Connecte-toi à Vinted sur ton ordinateur'));
const textes = lire('src/annonces/textes.js');
for (const cle of ['signalNonConnecte', 'finAutreCompte', 'finAntiRobot', 'finArret', 'finPasPrise', 'finEchec']) {
  ok(`textes : « ${cle} » existe en français et en anglais`, textes.split(`  ${cle}: (nom) =>`).length === 3);
}
const phrases = textes.split('\n').filter((l) => /^\s+(fin[A-Z]\w+|signalNonConnecte|signalTechnique|signalIncomplet|texteEndormie|extensionEndormie|murReprise):/.test(l)).join('\n');
ok('aucune phrase de fin ne contient un code HTTP, une page ou des minutes', !/HTTP|page \$\{|\d+ min/.test(phrases));
ok('aucune phrase ne promet une reprise automatique', !/tout(e)? seul|on our own|starts again on its own|réessaie tout seul|repart toute seule/i.test(phrases));
ok('« le défaut est chez nous » n\'est plus écrit par le chien de garde',
  hw.split('\n').filter((l) => /défaut est chez nous/i.test(l) && !/^\s*\/\//.test(l)).length === 0);

console.log('\n4. Le parcours d\'entrée ne lance rien tout seul');
const entree = lire('src/entree/useContexteEntree.js');
ok('l\'effet ne part que sur une demande déjà faite (en_file)', entree.includes("if (releve.etat !== 'en_file') return undefined;"));

console.log('');
if (echecs) { console.error(`✗ ${echecs} vérification(s) en échec`); process.exit(1); }
console.log('✓ relevés sur geste, fins dites en clair : toutes les vérifications passent');
