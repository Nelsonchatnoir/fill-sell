// selftest:retraits-cloud — (08/11/2026, U3 de Nico, suite) UN CLIENT FILLSELL CLOUD NE LIT JAMAIS « ORDINATEUR / CHROME ».
//   Publication par lot, attente de description, retraits bloqués, Réglages › Mes plateformes, publication programmée,
//   messagerie bêta, message « ouvert dans Chrome » : pour un client Cloud, le sujet est FillSell Cloud.
//   1. Les réécritures (pures) : chaque phrase « ordinateur / Chrome / ton extension » des retraits et de la messagerie,
//      passée pour un client Cloud, n'en garde aucune trace ; pour un autre compte, rien ne change.
//   2. Les fonctions réelles (retraits, messagerie, attente de lecture) en mode Cloud / hors Cloud.
//   3. Le câblage des écrans (lot, Réglages, programmée, retraits, messagerie, App).
//   npm run selftest:retraits-cloud
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (c, m, d = '') => { assert.ok(c, `${m}${d ? ` — ${String(d).slice(0, 300)}` : ''}`); n++; console.log(`  ✓ ${m}`); };
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);

// Ce qu'un client Cloud ne doit jamais lire (« sans ordinateur », « no computer » sont permis : ils disent l'inverse).
const INTERDIT = /Chrome|\bton ordinateur\b|\bTon ordinateur\b|\bun ordinateur\b|\bcet ordinateur\b|\byour computer\b|\bYour computer\b|\bton extension\b|\bTon extension\b|\byour extension\b|\bYour extension\b|ordinateur allumé|computer on\b/;

const C = await charger('src/cloud/connexionsCloud.js');
const RC = await charger('src/utils/retraitsCloud.js');
const SO = await charger('src/cloud/textesSansOrdinateur.js');
const RB = await charger('src/utils/retraitsBloques.js');
const VUE = await charger('src/messagerie/vue.js');
const ATT = await charger('src/publication/attenteLectureRegles.js');

// ── 1. Les réécritures, sur chaque phrase des sources ───────────────────────
const litteraux = (src) => [...src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g)].map((m) => m[2]).filter((t) => /Chrome|ordinateur|computer|ton extension|your extension/i.test(t));
{
  const phrases = litteraux(lire('src/utils/retraitsBloques.js').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'));
  ok(phrases.length >= 20, `retraits : ${phrases.length} phrases « ordinateur / Chrome » trouvées dans les sources`);
  const restes = phrases.map((p) => RC.retraitPourLeCloud(p, true)).filter((t) => INTERDIT.test(t));
  ok(restes.length === 0, 'retraits, client Cloud : plus aucune phrase ne parle de Chrome ni de « ton ordinateur »', restes.join(' ‖ '));
  ok(phrases.every((p) => RC.retraitPourLeCloud(p, false) === p), 'retraits, autre compte : chaque phrase inchangée');
}
{
  const src = lire('src/messagerie/vue.js').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const phrases = litteraux(src);
  ok(phrases.length >= 10, `messagerie : ${phrases.length} phrases « ordinateur / Chrome / extension » trouvées`);
  const restes = phrases.map((p) => SO.phraseSansOrdinateur(p, true)).filter((t) => INTERDIT.test(t));
  ok(restes.length === 0, 'messagerie, client Cloud : plus aucune phrase ne parle de Chrome, de « ton ordinateur » ni de « ton extension »', restes.join(' ‖ '));
  ok(phrases.every((p) => SO.phraseSansOrdinateur(p, false) === p), 'messagerie, autre compte : chaque phrase inchangée');
}
{
  const exp = lire('src/messagerie/SectionAExpedier.jsx') + lire('src/messagerie/EspaceMessagerie.jsx');
  const phrases = litteraux(exp.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n'));
  const restes = phrases.map((p) => SO.phraseSansOrdinateur(p, true)).filter((t) => INTERDIT.test(t));
  ok(phrases.length >= 5 && restes.length === 0, 'expédition et conversations, client Cloud : aucune trace', restes.join(' ‖ '));
}

// ── 2. Les fonctions réelles ─────────────────────────────────────────────────
C.publierConnexionsCloud({ clientCloud: true, lu: true });
for (const mur of ['ordinateur', 'boutique', 'connexion', 'compte_vinted']) {
  for (const lang of ['fr', 'en']) {
    const t = RB.ligneCarteRetraitBloque('vinted', lang, mur, '@lo160');
    ok(!INTERDIT.test(t), `retrait « ${mur} » (${lang}), client Cloud : ${t}`);
  }
}
ok(/FillSell Cloud la retirera dès qu'il reprend/.test(RB.ligneCarteRetraitBloque('vinted', 'fr', 'ordinateur', null)), 'retrait, ordinateur muet → « FillSell Cloud la retirera dès qu’il reprend »');
ok(/connecte ta boutique @lo160 à FillSell Cloud/.test(RB.ligneCarteRetraitBloque('vinted', 'fr', 'boutique', '@lo160')), 'retrait, autre boutique → « connecte ta boutique @lo160 à FillSell Cloud »');
for (const e of [{ etat: 'en_attente' }, { etat: 'refusee', motif: 'empreinte_differente' }, { etat: 'refusee', motif: 'trop_ancienne' }]) {
  const t = JSON.stringify(VUE.etatReponse(e, 'fr'));
  ok(!INTERDIT.test(t), `messagerie, réponse ${e.etat}/${e.motif ?? '-'}, client Cloud : sans ordinateur`, t);
}
for (const etat of ['envoyee', 'prise', 'expiree', 'echec']) {
  const t = JSON.stringify(VUE.etatDemandeBordereau({ etat, motif: null }, 'fr', 'vinted'));
  ok(!INTERDIT.test(t), `bordereau « ${etat} », client Cloud : sans ordinateur`, t);
}
ok(ATT.phraseEtatDemande({ etat: 'envoyee' }, { lang: 'fr' }) === 'Demande envoyée à FillSell Cloud : il la lit dès qu’il la reçoit.'.replace('’', "'"), 'attente de lecture : « Demande envoyée à FillSell Cloud »', ATT.phraseEtatDemande({ etat: 'envoyee' }, { lang: 'fr' }));
ok(!INTERDIT.test(ATT.texteAttenteParOrdinateur('fr')) && !INTERDIT.test(ATT.texteAttenteParOrdinateur('en')), 'attente de lecture : « FillSell Cloud lit ta description »');
ok(ATT.libellesSansLecteur('fr').attendre === 'Attendre FillSell Cloud' && !INTERDIT.test(JSON.stringify(ATT.libellesSansLecteur('en'))), 'attente de lecture : « Attendre FillSell Cloud »');
ok(!INTERDIT.test(ATT.phraseSansLecteur({ disponible: false, raison: 'ordinateur_eteint', vuLe: null }, { lang: 'fr' })), 'attente de lecture, lecteur absent : la phrase de FillSell Cloud');
ok(!INTERDIT.test(ATT.texteAttenteSansLecteur({ raison: 'aucun_ordinateur' }, { lang: 'fr', contexte: 'lot' })), 'attente de lecture, « attendre » : la condition FillSell Cloud');
// Hors Cloud : mot pour mot comme avant.
C.publierConnexionsCloud(null);
ok(/ouvre Chrome sur ton ordinateur pour la retirer/.test(RB.ligneCarteRetraitBloque('vinted', 'fr', 'ordinateur', null)), 'hors Cloud : le retrait garde « ouvre Chrome sur ton ordinateur »');
ok(ATT.phraseEtatDemande({ etat: 'envoyee' }, { lang: 'fr' }) === "Demande envoyée à ton ordinateur : il la lit dès qu'il la reçoit.", 'hors Cloud : l’attente de lecture mot pour mot');
ok(ATT.libellesSansLecteur('fr').attendre === 'Attendre mon ordinateur', 'hors Cloud : « Attendre mon ordinateur »');

// ── 3. Le câblage des écrans ─────────────────────────────────────────────────
const lot = lire('src/publication/lot/LotPublication.jsx');
ok((lot.match(/useConnexionsCloudPartage\(\)/g) || []).length >= 4, 'lot : les écrans (envoi, plateformes, article, fin) savent le compte Cloud');
ok(/FillSell Cloud les dépose ensuite, une après l'autre : plus besoin d'ordinateur\./.test(lot) && /Avec FillSell Cloud : \$\{duree\}/.test(lot)
  && /FillSell Cloud ne répond pas pour l'instant : les annonces partiront dès qu'il reprend\./.test(lot)
  && /FillSell Cloud les dépose une après l'autre, sans ordinateur/.test(lot) && /n'est pas connecté à FillSell Cloud : ses annonces t'attendront\./.test(lot),
'lot : envoi, durée, poste muet, fin, session — dits par FillSell Cloud');
const plat = lire('src/reglages/SousPagePlateformes.jsx');
ok(/cloud \? \(fr \? 'Connexions FillSell Cloud'/.test(plat) && /connexionCloudDe\(cx, pf\)/.test(plat) && /extensionJamaisVue && !cloud/.test(plat), 'Réglages › Mes plateformes : état et mots de FillSell Cloud, jamais « installe l’extension »');
ok(/noteCloud: "Le quota se décompte .*FillSell Cloud publie pendant le créneau, sans ordinateur\."/.test(lire('src/reglages/SousPagePublicationProgrammee.jsx')), 'publication programmée : « FillSell Cloud publie pendant le créneau »');
ok(/retraitPourLeCloud\(fr/.test(lire('src/stock/EcranRetraitsBloques.jsx')), 'écran des retraits bloqués : la phrase d’en-tête passe au Cloud');
ok(/estClientCloud\(\) \? "FillSell lit leur annonce d'origine tout seul \(seul pour eBay, par FillSell Cloud pour les autres\)"/.test(lire('src/publication/lectureOrigine.js')), 'lecture d’origine : « par FillSell Cloud pour les autres »');
ok(/note === "vinted_sans_extension" && estClientCloud\(\)/.test(lire('src/publication/lot/FicheArticle.jsx')), 'fiche du lot : note Vinted sans ordinateur');
ok(/celui connecté à FillSell Cloud : elle est toujours en ligne/.test(lire('src/App.jsx')), 'App : « ouvert dans Chrome » → « connecté à FillSell Cloud »');

console.log(`\nTout est vert — ${n} contrôles.`);
