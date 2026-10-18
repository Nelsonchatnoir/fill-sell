// ═══════════════════════════════════════════════════════════════════════════
// UNE BOUTIQUE = UN COMPTE : CE QUE L'APP DIT — `npm run selftest:boutique-autre-compte-app`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10, Louis : son 2e compte FillSell importait la boutique Vinted @evat déjà
// suivie par le 1er (ventes en double). Le serveur refuse désormais l'import d'une
// boutique suivie par un AUTRE compte, avec `[boutique_a_confirmer][boutique_autre_compte]`
// (l'ancien marqueur reste devant pour les vieilles extensions) — migration
// 20261018200000. Vérifie, sans réseau, que l'app :
//   1. reconnaît le marqueur (module annonces/boutiqueAutreCompte.js) ;
//   2. ne pose JAMAIS la question « c'est bien ta boutique ? » dessus ;
//   3. classe la fin du relevé « autre compte » et dit LA phrase (FR, EN) ;
//   4. traduit le refus de la confirmation par la même phrase (jamais « réessaie ») ;
//   5. dit, sur un relevé Leboncoin / Beebs, les annonces écartées « autre compte ».
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estBoutiqueAutreCompte, texteBoutiqueAutreCompte, loginDuRun, texteEcarteesAutreCompte, titreEcarteesAutreCompte, MARQUEUR_BOUTIQUE_AUTRE_COMPTE } from '../src/annonces/boutiqueAutreCompte.js';
import { runPoseQuestionBoutique, decisionQuestionBoutique } from '../src/annonces/synchroniser.js';
import { situationFinReleve, texteFinReleve, texteSituation } from '../src/annonces/finReleve.js';
import { textesAnnonces } from '../src/annonces/textes.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, detail = '') => { total++; if (!c) echecs++; console.log(`${c ? '  ✓' : '  ✗'} ${l}${c || !detail ? '' : `   ← ${String(detail).slice(0, 400)}`}`); };

// Le texte EXACT du serveur (migration 20261018200000), sinon sa forme connue.
const MIG_SERVEUR = 'supabase/migrations/20261018200000_une_boutique_un_compte_comptes_lies.sql';
const ERREUR_SERVEUR = (() => {
  if (existsSync(path.join(RACINE, MIG_SERVEUR))) {
    const m = lire(MIG_SERVEUR).match(/raise exception '(\[boutique_a_confirmer\]\[boutique_autre_compte\][^']*)'/);
    if (m) return m[1];
  }
  return '[boutique_a_confirmer][boutique_autre_compte] Cette boutique Vinted est déjà suivie par un autre compte FillSell. Rien n’a été importé et rien n’a changé sur Vinted : une boutique se suit sur un seul compte.';
})();
const RUN_LOUIS = { id: 'run-louis', status: 'failed', erreur: ERREUR_SERVEUR, vinted_user_id: '123456', vinted_login: 'evat' };
const RUN_QUESTION = { id: 'run-q', status: 'failed', erreur: "[boutique_a_confirmer] Ce navigateur est connecté au dressing @celineetmarie — ce compte FillSell suit @narema75. Rien n'a été importé.", vinted_user_id: '36325065', vinted_login: 'celineetmarie' };
const PHRASE_FR = "Ce navigateur est connecté à la boutique Vinted @evat, déjà suivie par un autre compte FillSell. Rien n'a été importé et rien n'a changé sur Vinted. Une boutique se suit sur un seul compte : ouvre ici la boutique de ce compte, ou écris-nous pour la transférer avec son historique.";
const PHRASE_EN = "This browser is signed in to the Vinted shop @evat, already followed by another FillSell account. Nothing was imported and nothing changed on Vinted. A shop is followed on one account only: open this account's shop here, or write to us to transfer it with its history.";

console.log('1. Le marqueur');
ok(MARQUEUR_BOUTIQUE_AUTRE_COMPTE === '[boutique_autre_compte]' && ERREUR_SERVEUR.includes(MARQUEUR_BOUTIQUE_AUTRE_COMPTE), 'le marqueur est celui que le serveur écrit', ERREUR_SERVEUR);
ok(estBoutiqueAutreCompte(ERREUR_SERVEUR) && !estBoutiqueAutreCompte(RUN_QUESTION.erreur) && !estBoutiqueAutreCompte(null), 'reconnu ; l\'ancienne question seule ne l\'est pas');
ok(loginDuRun(RUN_LOUIS) === 'evat' && loginDuRun({ vinted_login: '@evat ' }) === 'evat' && loginDuRun({}) === null, 'le pseudo vu par le run, jamais deviné du texte');

console.log('\n2. Jamais la question « c\'est bien ta boutique ? »');
ok(!runPoseQuestionBoutique(RUN_LOUIS) && runPoseQuestionBoutique(RUN_QUESTION), 'synchroniser.js : la boutique d\'un autre compte ne pose pas la question ; l\'ancienne la pose toujours');
ok(decisionQuestionBoutique({ run: RUN_LOUIS }) === 'aucune', 'appui sur « Synchroniser » : pas de feuille de confirmation');
const ST = lire('src/tabs/StockTab.jsx');
ok(/const runPoseQuestionBoutique = \(r\) => r\?\.status === 'failed' && String\(r\?\.erreur \?\? ''\)\.includes\('\[boutique_a_confirmer\]'\) && !estBoutiqueAutreCompte\(r\?\.erreur\);/.test(ST), 'StockTab : la même exclusion sur sa copie locale');
const iBranche = ST.indexOf('if (estBoutiqueAutreCompte(brut)) {');
const iQuestion = ST.indexOf("if (brut.includes('[boutique_a_confirmer]')) {");
ok(iBranche > 0 && iQuestion > iBranche && /if \(estBoutiqueAutreCompte\(brut\)\) \{\n\s+return \{ ton: 'orange', decision: null, texte: texteBoutiqueAutreCompte\(loginDuRun\(run\), lang\) \};/.test(ST),
  'StockTab : le bilan teste le marqueur AVANT [boutique_a_confirmer] — orange, decision null, LA phrase');

console.log('\n3. La fin du relevé : « autre compte », et LA phrase');
const T = textesAnnonces('fr'); const TE = textesAnnonces('en');
ok(situationFinReleve(RUN_LOUIS) === 'autre_compte' && situationFinReleve({ erreur: '[boutique_autre_compte] x' }) === 'autre_compte', 'classé « autre compte » (avec ou sans l\'ancien marqueur)');
ok(texteFinReleve(RUN_LOUIS, 'Vinted', T) === PHRASE_FR, 'FR, mot pour mot', texteFinReleve(RUN_LOUIS, 'Vinted', T));
ok(texteFinReleve(RUN_LOUIS, 'Vinted', TE) === PHRASE_EN, 'EN, mot pour mot', texteFinReleve(RUN_LOUIS, 'Vinted', TE));
ok(texteBoutiqueAutreCompte('evat', 'fr') === PHRASE_FR && texteBoutiqueAutreCompte('@evat', 'en') === PHRASE_EN, 'une seule source pour la phrase (textes.js), partout la même');
ok(/^Ce navigateur est connecté à une boutique Vinted, déjà suivie/.test(texteBoutiqueAutreCompte(null, 'fr')), 'sans pseudo connu : la phrase sans @');
ok(texteSituation('autre_compte', 'Vinted', T) === T.finAutreCompte('Vinted') && texteFinReleve(RUN_QUESTION, 'Vinted', T) === T.finAutreCompte('Vinted'), 'l\'ancienne situation « autre compte » garde sa phrase');
ok(![PHRASE_FR, PHRASE_EN].some((p) => /\[|\]|réessaie|try again|c'est bien ta boutique/i.test(p)), 'ni marqueur, ni « réessaie », ni question');
ok(/finBoutiqueAutreCompte: \(b\) =>/.test(lire('src/annonces/textes.js')) && (lire('src/annonces/textes.js').match(/finBoutiqueAutreCompte:/g) ?? []).length === 2, 'textes FR et EN');
ok(/boutiqueAutreCompte: estBoutiqueAutreCompte\(run\.erreur\) \? \{ login: loginDuRun\(run\) \} : null/.test(ST), 'StockTab : la fin Vinted remonte au bloc de synchro');
const BS = lire('src/stock/BlocSynchro.jsx');
ok(/if \(t\.p === 'vinted' && etatVinted\?\.fin\?\.boutiqueAutreCompte\) \{\n\s+return \{\n\s+cle: 'vinted-autre-compte',\n\s+platform: 'vinted',\n\s+titre: T\.titrePointBoutiqueAutreCompte,\n\s+texte: T\.finBoutiqueAutreCompte\(etatVinted\.fin\.boutiqueAutreCompte\.login \?\? null\),\n\s+\};/.test(BS),
  'bloc de synchro : le point dit LA phrase, sans « Réessayer » ni « Choisir ma boutique »');
ok(/texteSituation\(t\.e\.situation, t\.nom, T, t\.p !== 'vinted' \? \(r\.runs\[t\.p\] \?\? null\) : null\)/.test(BS), 'bloc de synchro : les autres plateformes passent leur run');

console.log('\n4. Le refus de « c\'est bien ma boutique » : la même phrase');
const VS = lire('src/utils/vintedSync.js');
ok(/export async function confirmerBoutiqueVinted\(userId, \{ vintedUserId, login, lang = 'fr' \}\)/.test(VS)
  && /if \(eMaj && estBoutiqueAutreCompte\(`\$\{eMaj\.message \?\? ''\} \$\{eMaj\.details \?\? ''\}`\)\) \{\n\s+return \{ success: false, error: 'boutique_autre_compte', texte: texteBoutiqueAutreCompte\(login, lang\) \};/.test(VS),
  'vintedSync : le refus du pin rend son code et LA phrase');
ok(/if \(!r\?\.success && r\?\.error === 'boutique_autre_compte'\) \{\n[\s\S]{0,200}setMessage\(\{ ton: 'orange', texte: r\.texte \}\);\n\s+return \{ ok: false, erreur: 'boutique_autre_compte', texte: r\.texte \};/.test(ST), 'StockTab : orange, la phrase, jamais « réessaie dans un instant »');
const CB = lire('src/stock/ConfirmationBoutique.jsx');
ok(/if \(!r\?\.ok\) setErreur\(typeof r\?\.texte === 'string' && r\.texte \? r\.texte : T\.erreur\);/.test(CB), 'la feuille de confirmation montre la phrase sur place');

console.log('\n5. Leboncoin, Beebs : les annonces écartées « autre compte »');
ok(texteEcarteesAutreCompte(3, 'fr') === '3 annonces de ce compte sont déjà suivies par un autre compte FillSell : elles ne sont pas importées ici.', 'FR, mot pour mot', texteEcarteesAutreCompte(3, 'fr'));
ok(texteEcarteesAutreCompte(1, 'fr') === '1 annonce de ce compte est déjà suivie par un autre compte FillSell : elle n’est pas importée ici.', 'singulier', texteEcarteesAutreCompte(1, 'fr'));
ok(texteEcarteesAutreCompte(3, 'en') === '3 listings of this account are already followed by another FillSell account: they are not imported here.' && titreEcarteesAutreCompte('Leboncoin', 3, 'fr') === 'Leboncoin : 3 annonces suivies par un autre compte', 'EN et titre');
ok(/for \(const e of ecarteesDuCompte\) \{\n\s+out\.push\(\{ cle: `ecartees-autre-compte-\$\{e\.platform\}`, icone: Store, ton: 'info', compte: false,/.test(ST), 'dit dans le bloc de synchro (là où le relevé se lit), une information : pas comptée « à régler »');
const MIG = lire('supabase/migrations/20261018190000_surveillance_releves.sql');
ok(/e\.motif = 'autre_compte:' \|\| s\.pf/.test(MIG) && /count\(DISTINCT e\.vinted_item_id\)/.test(MIG) && /coalesce\(d\.started_at, now\(\) - interval '7 days'\) - interval '1 minute'/.test(MIG),
  'la RPC compte les annonces DISTINCTES écartées depuis le dernier relevé réussi (motif du serveur autre_compte:<plateforme>)');
if (existsSync(path.join(RACINE, MIG_SERVEUR))) {
  ok(/'autre_compte:' \|\| coalesce\(new\.platform, ''\)/.test(lire(MIG_SERVEUR)), 'même motif que le serveur (migration 20261018200000)');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
