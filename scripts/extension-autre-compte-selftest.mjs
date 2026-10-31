// selftest:extension-autre-compte — (15/10, P18, cas Stéphanie) L'app dit
// clairement quand l'extension de CE navigateur ne travaille pas pour le
// compte connecté, et « Synchroniser » ne relève plus le dressing d'un AUTRE
// compte par le chemin direct.
// Données réelles du 12/10 (Stéphanie, même Mac, même adresse IP) : compte A
// ouvert à 13:54:53, l'extension passe pour A à 13:55:35 ; compte B (ses 26
// articles) ouvert à 13:57:14 — deux comptes FillSell, une extension.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

// Le module importe React et vintedSync (supabase) : on lit ses fonctions pures sans les charger.
const src = lire('src/utils/extensionAutreCompte.js');
const pures = src.slice(src.indexOf('export const SILENCE_AUTRE_COMPTE_MS'), src.indexOf('/**\n * { autreCompte, muette }'));
const tmp = join(ROOT, 'build', `.selftest-autre-compte-${process.pid}.mjs`);
fs.mkdirSync(join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(tmp, pures);
const m = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

console.log('1. La preuve : extension présente ici, aucun passage pour CE compte');
ok(m.compteSansExtension({ inconnu: false, jamaisVue: true, vueIlYaMs: null }) === true, 'jamais vue pour ce compte → sans extension');
ok(m.compteSansExtension({ inconnu: false, jamaisVue: false, vueIlYaMs: 7 * 60_000 }) === true, 'dernier passage il y a 7 min (Chrome ouvert, passage toutes les 2 min) → sans extension');
ok(m.compteSansExtension({ inconnu: false, jamaisVue: false, vueIlYaMs: 90_000 }) === false, 'passage il y a 1 min 30 → l\'extension travaille pour ce compte');
ok(m.compteSansExtension({ inconnu: true }) === false && m.compteSansExtension(null) === false, 'lecture ratée → on ne conclut rien');
ok(m.SILENCE_AUTRE_COMPTE_MS === 6 * 60_000 && m.ATTENTE_CONFIRMATION_MS === 3 * 60_000, 'constaté deux fois : au chargement, puis 3 min plus tard');

console.log('2. Le texte : la cause et le geste, avec l\'adresse du compte d\'ici');
const t = m.texteExtensionAutreCompte('fr', 'stephanie@exemple.fr');
ok(/n'est pas connectée à ce compte/.test(t.titre), 'titre : « pas connectée à ce compte »');
ok(/« Changer de compte FillSell \? »/.test(t.texte) && /« Basculer l'extension »/.test(t.texte), 'le geste reprend MOT POUR MOT le popup de l\'extension');
const popup = lire('chrome-extension/popup.js');
ok(popup.includes('Changer de compte FillSell ?') && popup.includes("Basculer l'extension"), 'mêmes mots dans le popup (chrome-extension/popup.js)');
ok(t.texte.includes('stephanie@exemple.fr') && !m.texteExtensionAutreCompte('fr', null).texte.includes('null'), 'l\'adresse d\'ICI seulement (jamais celle de l\'autre compte)');
ok(/isn't signed in to this account/.test(m.texteExtensionAutreCompte('en', null).titre), 'anglais');

console.log('3. Bornée : deux lectures par page, une relecture au retour sur l\'onglet');
ok(!/setInterval\(/.test(src), 'aucun setInterval');
ok(/if \(vue\) return; \/\/ une seule vérification par ouverture de page/.test(src) && /RELECTURE_MIN_MS = 30 \* 1000/.test(src), 'une vérification par page, relecture au plus toutes les 30 s');
ok(/if \(isNative \|\| !userId\) return undefined;/.test(src), 'jamais sur l\'app native');

console.log('4. StockTab : l\'alerte, et « Synchroniser » ne relève plus l\'autre compte');
const s = lire('src/tabs/StockTab.jsx');
const iGarde = s.indexOf('if (extensionAutreCompte) {\n      setMessage(');
const iDirect = s.indexOf('    if (extCapable) {\n      setAttente(true);');
ok(iGarde > 0 && iDirect > iGarde, 'la garde passe AVANT le chemin direct (rien ne part)');
ok(/logSyncClick\('refusée', 'extension_autre_compte'\)/.test(s), 'l\'appui refusé est journalisé (sync_click)');
ok((s.match(/extensionAutreCompte=\{extensionAutreCompte\}/g) || []).length === 2, 'les deux montages de la ligne Vinted reçoivent le constat');
const iAlertes = s.indexOf('const alertesCompte = (() => {');
const iAlerte = s.indexOf("cle: 'ext-autre-compte'");
ok(iAlertes > 0 && iAlerte > iAlertes && iAlerte < s.indexOf('if (isMobile && !stockVide) {', iAlertes), 'alerte dans les points du compte, stock VIDE compris (jamais un bandeau)');
// (31/10, lot F) « Autre compte » seulement sur PREUVE : le constat se journalise sous son nom, un silence à part.
ok(/feature: etat === 'autre_compte' \? 'extension_autre_compte' : 'extension_muette'/.test(s)
  && /preuve: etat === 'autre_compte' \? 'compte_extension' : 'silence'/.test(s),
  'constat journalisé (usage_logs extension_autre_compte sur preuve, extension_muette sur silence)');
ok(m.etatExtensionDuNavigateur({ compte: null, silenceConfirme: true }) === 'muette'
  && m.etatExtensionDuNavigateur({ compte: { vivant: true, meme: false } }) === 'autre_compte',
  'un silence n\'est jamais « autre compte » ; la preuve donnée par l\'extension, si (lot F, 31/10)');

console.log(`\n✓ extension-autre-compte : ${n} contrôles verts`);
