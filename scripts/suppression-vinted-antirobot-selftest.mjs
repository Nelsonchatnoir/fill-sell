// Un retrait Vinted ne porte le motif anti-robot que sur HTTP 403.
// `npm run selftest:suppression-vinted-antirobot`
import fs from 'node:fs';

let ko = 0;
const ok = (n, c) => { console.log(`  ${c ? 'ok  ' : '❌  '}  ${n}`); if (!c) ko++; };
const v = fs.readFileSync('chrome-extension/content-scripts/vinted.js', 'utf8');
const bg = fs.readFileSync('chrome-extension/background.js', 'utf8');

console.log('1. Une page inattendue ne devient jamais un anti-robot sans HTTP');
ok('la page non exacte arrête le retrait', /verificationBoutiqueImpossible: true/.test(v));
ok('elle nomme l’impossibilité de vérifier', /n'a pas pu ouvrir la page exacte de l'annonce pour vérifier sa boutique/.test(v));
ok('le bot-shield DOM porte un code HTTP inconnu', /page Vinted de vérification affichée \(code HTTP inconnu\)/.test(v));

console.log('\n2. Le seul motif anti-robot Vinted est le 403 exact');
ok('branche exacte HTTP 403', /resp\.status === 403 && session !== "expiree"/.test(v));
ok('résultat structuré httpStatus 403', /httpStatus: 403,[\s\S]{0,100}?motifCode: "antirobot_vinted_403"/.test(v));
ok('les autres 4xx ne sont plus assimilés', !/resp\.status >= 400 && resp\.status < 500/.test(v));
ok('les autres codes gardent le verdict neutre', /verdict\.conclusion = "http_autre"/.test(v));
ok('un 401 garde le chemin session', /session === "expiree"[\s\S]{0,180}?session Vinted expirée/.test(v));

console.log('\n3. Le background exige aussi la preuve exacte');
ok('prédicat dédié', /function estBlocageAntiRobotExact\(job, resultatOuErreur\)/.test(bg));
ok('Vinted exige httpStatus === 403', /job\?\.platform !== "vinted"[\s\S]{0,220}?Number\(resultat\.httpStatus\) === 403/.test(bg));
ok('le routage de retrait passe par ce prédicat', /else if \(estBlocageAntiRobotExact\(job, result\)\)/.test(bg));
ok('la capture passe par ce prédicat', /if \(estBlocageAntiRobotExact\(job, cap\)\)/.test(bg));
ok('le marqueur écrit le code et le motif canonique', /http: 403, motif_code: MOTIF_ANTIROBOT_VINTED_403/.test(bg));
ok('aucune suppression n’est conclue sur un refus', /Un REFUS n'est\s*\n\s*\/\/ pas une preuve de suppression/.test(v));

console.log(`\n${ko === 0 ? '✅ Vinted : anti-robot uniquement sur HTTP 403.' : `❌ ${ko} échec(s).`}`);
process.exit(ko === 0 ? 0 : 1);
