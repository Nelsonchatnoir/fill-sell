// ═══════════════════════════════════════════════════════════════════════════
// UN CORPS REST SANS DEMI-CARACTÈRE — SELFTEST (02/11, laurankoole)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis le 29/10, le relevé Depop de laurankoole échouait à chaque passage :
// « REST annonces_plateforme?on_conflict=user_id,platform,listing_id → HTTP 400 »
// (journal du serveur : PGRST102 « Empty or invalid json »). Le titre Depop
// (première ligne de la description) était coupé à 120 UNITÉS UTF-16 : un émoji
// tranché en deux laisse un surrogate seul, que JSON.stringify écrit « \udXXX »
// et que PostgREST refuse — le lot ENTIER, donc le relevé. Prouvé le 02/11 par
// un POST anonyme : « abc\ud83d » → 400 PGRST102, « abc😀 » → 401 (RLS).
// La règle : (1) restRequest remplace tout demi-caractère d'un corps par U+FFFD,
// pour TOUTES les écritures de l'extension ; (2) le titre Depop se coupe par
// point de code.
//
//   npm run selftest:releve-demi-caractere
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const extraire = (src, debut) => {
  const i = src.indexOf(debut);
  if (i < 0) return null;
  let prof = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}' && --prof === 0) return src.slice(i, j + 1);
  }
  return null;
};

const bg = lire('chrome-extension/background.js');
const fnJson = extraire(bg, 'function jsonSansDemiCaractere(');
ok(!!fnJson, 'background.js définit jsonSansDemiCaractere');
const ctx = {};
vm.runInNewContext(`${fnJson}; this.f = jsonSansDemiCaractere;`, ctx);
const f = ctx.f;
// Le cas réel : un émoji coupé en fin de titre, sorti de JSON.stringify.
const coupe = '😀'.slice(0, 1);
const corps = JSON.stringify([{ titre: `Pull ${coupe}`, prix: 10 }, { titre: 'ok 😀', prix: 5 }]);
ok(/\\ud83d"/.test(corps), 'JSON.stringify écrit bien le demi-caractère « \\ud83d » (le défaut reproduit)');
const net = f(corps);
const relu = JSON.parse(net);
ok(relu[0].titre === 'Pull \ufffd' && relu[1].titre === 'ok 😀', 'le demi-caractère devient U+FFFD, l\'émoji entier reste');
ok(!/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(net), 'plus aucune séquence \\ud800–\\udfff dans le corps envoyé');
// Demi-caractère bas seul, et en tête.
ok(JSON.parse(f(JSON.stringify({ t: '\ude00x' }))).t === '\ufffdx', 'un surrogate bas seul est remplacé aussi');
// Une barre littérale suivie de « ud83d » n'est PAS une séquence : le texte ne change pas.
const litteral = JSON.stringify({ t: 'C:\\ud83d' });
ok(f(litteral) === litteral && JSON.parse(f(litteral)).t === 'C:\\ud83d', 'une barre littérale suivie de « ud83d » reste telle quelle');
// Une paire écrite à la main (échappée) reste entière.
const paire = '{"t":"\\ud83d\\ude00"}';
ok(f(paire) === paire, 'une paire échappée à la main n\'est pas cassée');
// Un corps sans rien à corriger est rendu à l'identique (même chaîne).
const propre = JSON.stringify({ t: 'Doudoune The North Face – verte' });
ok(f(propre) === propre, 'un corps propre est rendu inchangé');
ok(f(undefined) === undefined, 'un corps absent reste absent');
// Branché dans restRequest, avant le fetch, pour toutes les écritures.
const iRest = bg.indexOf('async function restRequest(');
const rest = iRest < 0 ? '' : bg.slice(iRest, bg.indexOf('fetch(', iRest));
ok(/init = \{ \.\.\.init, body: jsonSansDemiCaractere\(init\.body\) \}/.test(rest),
  'restRequest nettoie init.body AVANT le fetch (toutes les écritures REST de l\'extension)');

// Le titre Depop se coupe par point de code.
const dp = lire('chrome-extension/content-scripts/depop.js');
const m = dp.match(/const depopPremiereLigne = \(texte\) => \{[\s\S]*?\n\};/);
ok(!!m, 'depop.js définit depopPremiereLigne en bloc');
const ctx2 = {};
vm.runInNewContext(`${m[0]}; this.g = depopPremiereLigne;`, ctx2);
const g = ctx2.g;
const longue = `${'a'.repeat(119)}😀 suite`;
const t = g(`\n  ${longue}\nligne 2`);
ok(t === `${'a'.repeat(119)}😀`, 'un émoji à la 120e place reste entier (120 caractères, pas 120 unités UTF-16)');
ok(t.isWellFormed?.() !== false, 'le titre rendu est bien formé');
ok(g('') === null && g(null) === null && g('\n \n') === null, 'aucune ligne = null');
ok(g('Court') === 'Court', 'un titre court est rendu tel quel');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ tout est vert');
process.exit(ko ? 1 : 0);
