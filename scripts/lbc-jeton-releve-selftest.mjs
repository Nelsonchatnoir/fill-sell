// Autotest — relevé Leboncoin : jeton renouvelé comme la page, plus jamais
// d'arrêt à 30 annonces, relevé partiel clos « incomplete » (0.6.100, 06/10/2026).
//
//     node --import ./scripts/loader-ext.mjs scripts/lbc-jeton-releve-selftest.mjs
//
// Cas réel : Joe0410, 06/10 07:02 — « [adresse muette : essai 1 : jeton_absent]
// repli sur la page · 30 annonce(s) affichée(s) sur 340 », clos « done ».
// Ce qu'il verrouille, en exécutant le VRAI code de background.js (extrait
// tel quel, dépendances simulées) :
//   1. la lecture par l'adresse : jeton absent / expiré dits sans appel,
//      identifiant tiré du jeton sans cookie, 340 annonces lues (pages de
//      100, ou réponses plafonnées à 30), liste qui se décale entre deux pages
//      sans annonce sautée, 401 en cours de route = lecture interrompue ;
//   2. l'orchestration : jeton absent → renouvelé par la page → relu ; session
//      fermée → on s'arrête (la page dira le mur) ; jamais plus de 3 lectures ;
//   3. le renouvellement : recharge « Mes annonces », attend un jeton valable,
//      reconnaît la page de connexion, abandonne au bout de 20 s ;
//   4. le statut de fin : partiel → « incomplete », jamais « done » ;
//   5. le câblage : relecture de l'adresse APRÈS la page, ventes et commandes
//      précédées du contrôle du jeton (avec pause après échec), cadence de la
//      veille qui compte « incomplete », défilement qui ne s'arrête plus au
//      premier palier muet ;
//   6. l'app : « incomplete » se dit « incomplet x/y », jamais « Synchronisé ».
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BG = fs.readFileSync(join(ROOT, 'chrome-extension/background.js'), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `\n      ${String(detail).slice(0, 500)}` : ''}`); } };

// Extrait le texte d'une fonction de background.js (accolades équilibrées).
function extraire(debut, depuis = 0) {
  const i = BG.indexOf(debut, depuis);
  if (i < 0) throw new Error(`introuvable : ${debut}`);
  const j = BG.indexOf(') {', i) + 2; // le corps, pas un paramètre déstructuré
  let prof = 0;
  for (let k = j; k < BG.length; k++) {
    if (BG[k] === '{') prof++;
    else if (BG[k] === '}') { prof--; if (prof === 0) return BG.slice(i, k + 1); }
  }
  throw new Error(`non fermée : ${debut}`);
}

// ── 1. La lecture par l'adresse, exécutée hors navigateur ───────────────────
const debutLecture = 'return executerDansOngletPlateforme("leboncoin", async (perPage, pagesMax) => {';
const iL = BG.indexOf(debutLecture, BG.indexOf('async function releverLeboncoinParApi()'));
const fL = BG.indexOf('}, [LBC_API_PAGE, LBC_API_PAGES_MAX]);', iL);
const texteLecture = BG.slice(iL + 'return executerDansOngletPlateforme("leboncoin", '.length, fL + 1);
const jwt = (charge) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.sig`;
const maintenantS = () => Math.floor(Date.now() / 1000);

function lecture({ luat = null, cookie = '', annonces = 0, plafond = null, decalage = null, http401Apres = null }) {
  const appels = [];
  // La liste « serveur » : triée par date, la plus récente d'abord.
  let liste = Array.from({ length: annonces }, (_, i) => ({ list_id: 1000 + i, status: 'active', subject: `A${i}` }));
  const fetch = async (url, opts) => {
    const corps = JSON.parse(opts.body);
    appels.push(corps);
    if (http401Apres != null && appels.length > http401Apres) return { status: 401, json: async () => ({}) };
    if (decalage && appels.length === decalage.apresAppel + 1) liste = liste.filter((a) => a.list_id !== decalage.retire);
    const n = Math.min(corps.limit, plafond ?? corps.limit);
    const ads = liste.slice(corps.offset, corps.offset + n);
    return { status: 200, json: async () => ({ ads, total: liste.length, account_stats: { active_ads: liste.length } }) };
  };
  const localStorage = { getItem: (k) => (k === 'luat' ? luat : null) };
  const document = { cookie };
  const setTimeout = (f) => f();
  const atob = (b) => Buffer.from(b, 'base64').toString('binary');
  const fn = new Function('fetch', 'localStorage', 'document', 'setTimeout', 'atob', `return ${texteLecture};`)(fetch, localStorage, document, setTimeout, atob);
  return fn(100, 30).then((r) => ({ r, appels, liste }));
}

console.log('1. La lecture par l’adresse');
{
  const { r, appels } = await lecture({ luat: null, cookie: 'lbc_user_id=u1', annonces: 5 });
  ok(r.ok === false && r.motif === 'jeton_absent' && appels.length === 0, 'jeton absent → « jeton_absent », aucun appel');
}
{
  const { r, appels } = await lecture({ luat: jwt({ account_id: 'u1', exp: maintenantS() - 60 }), cookie: 'lbc_user_id=u1', annonces: 5 });
  ok(r.ok === false && r.motif === 'jeton_expire' && appels.length === 0, 'jeton expiré → « jeton_expire », aucun appel (pas de 401 essuyé)');
}
{
  const { r, appels } = await lecture({ luat: jwt({ account_id: 'acc-42', exp: maintenantS() + 3600 }), cookie: '', annonces: 5 });
  ok(r.ok && appels[0]?.filters?.owner?.user_id === 'acc-42', 'sans cookie lbc_user_id : l’identifiant vient du jeton (account_id), comme la page');
}
{
  const { r, appels } = await lecture({ luat: jwt({ account_id: 'u1', exp: maintenantS() + 3600 }), cookie: 'lbc_user_id=u1', annonces: 340 });
  ok(r.ok && r.annonces.length === 340 && r.enLigne === 340 && r.actives === 340 && !r.motif, `340 annonces lues par l’adresse (${appels.length} pages)`, JSON.stringify({ n: r.annonces.length, m: r.motif }));
}
{
  const { r } = await lecture({ luat: jwt({ account_id: 'u1', exp: maintenantS() + 3600 }), cookie: 'lbc_user_id=u1', annonces: 340, plafond: 30 });
  ok(r.ok && r.annonces.length === 340, `serveur qui plafonne à 30 par réponse : 340 lues quand même (${r.pages} pages)`);
}
{
  // Une annonce de tête disparaît (vendue) après la page 1 : sans chevauchement,
  // l'annonce n°100 sautait et le compte tombait juste (339 = 339).
  const { r, liste } = await lecture({ luat: jwt({ account_id: 'u1', exp: maintenantS() + 3600 }), cookie: 'lbc_user_id=u1', annonces: 340, decalage: { apresAppel: 1, retire: 1000 } });
  const manquantes = liste.filter((a) => !r.annonces.some((x) => x.listing_id === String(a.list_id)));
  ok(r.ok && manquantes.length === 0, `liste décalée entre deux pages : aucune annonce vivante sautée (${manquantes.length} manquante(s))`);
}
{
  const { r } = await lecture({ luat: jwt({ account_id: 'u1', exp: maintenantS() + 3600 }), cookie: 'lbc_user_id=u1', annonces: 340, http401Apres: 2 });
  ok(r.ok && r.motif === 'http_401' && r.annonces.length < 340, `relevé interrompu (401 en page 3) : motif dit, ${r.annonces.length} lues — jamais présenté comme complet`);
}

// ── 2. L'orchestration (lireAdresseLbc), exécutée avec ses dépendances simulées
console.log('2. Jeton renouvelé puis adresse relue');
const texteOrch = (() => {
  const i = BG.indexOf('  const lireAdresseLbc = async (motifsApi, essais = 3) => {');
  const f = BG.indexOf('\n  };\n', i);
  return BG.slice(i + '  const lireAdresseLbc = '.length, f + 4);
})();
const RE = new RegExp(/const LBC_JETON_A_RENOUVELER_RE = \/(.*)\/;/.exec(BG)[1]);
function orchestration(lectures, renouvellements) {
  const vus = { lectures: 0, renouvellements: 0, pauses: [] };
  const releverLeboncoinParApi = async () => lectures[Math.min(vus.lectures++, lectures.length - 1)];
  const renouvelerJetonLeboncoin = async () => renouvellements[Math.min(vus.renouvellements++, renouvellements.length - 1)];
  const sleep = async (ms) => { vus.pauses.push(ms); };
  const randInt = (a) => a;
  const fn = new Function('releverLeboncoinParApi', 'renouvelerJetonLeboncoin', 'sleep', 'randInt', 'LBC_JETON_A_RENOUVELER_RE', `return ${texteOrch};`)(
    releverLeboncoinParApi, renouvelerJetonLeboncoin, sleep, randInt, RE);
  const motifs = [];
  return fn(motifs).then((api) => ({ api, motifs, vus }));
}
const complete = { ok: true, annonces: new Array(340), actives: 340, enLigne: 340, pages: 4, motif: null };
{
  const { api, motifs, vus } = await orchestration([{ ok: false, motif: 'jeton_absent' }, complete], [{ ok: true, attente_ms: 5000 }]);
  ok(api === complete && vus.renouvellements === 1 && vus.lectures === 2, 'jeton absent → renouvelé par la page → 340/340 par l’adresse (plus de repli sur la page)');
  ok(motifs.some((m) => /jeton renouvelé par la page/.test(m)) && vus.pauses.length === 0, 'le renouvellement est dit dans le relevé, relecture immédiate', motifs.join(' ; '));
}
for (const motif of ['jeton_expire', 'http_401', 'user_id_absent']) {
  const { api, vus } = await orchestration([{ ok: false, motif }, complete], [{ ok: true, attente_ms: 1000 }]);
  ok(api === complete && vus.renouvellements === 1, `${motif} → renouvelé puis relu`);
}
{
  const partiel401 = { ok: true, annonces: new Array(200), actives: 340, enLigne: 200, pages: 2, motif: 'http_401' };
  const { api, vus } = await orchestration([partiel401, complete], [{ ok: true, attente_ms: 1000 }]);
  ok(api === complete && vus.renouvellements === 1, '401 en cours de route (200/340) → jeton renouvelé → relecture complète');
}
{
  const { api, vus } = await orchestration([{ ok: false, motif: 'jeton_absent' }, complete], [{ ok: false, motif: 'session_fermee' }]);
  ok(api.ok === false && vus.lectures === 1 && vus.renouvellements === 1, 'session fermée → on s’arrête, la page dira le mur (aucune boucle)');
}
{
  const { vus } = await orchestration([{ ok: false, motif: 'jeton_absent' }], [{ ok: true, attente_ms: 1 }]);
  ok(vus.lectures <= 3 && vus.renouvellements <= 2, `jeton qui ne tient jamais : bornes tenues (${vus.lectures} lectures, ${vus.renouvellements} renouvellements)`);
}
{
  const partiel = { ok: true, annonces: new Array(192), actives: 193, enLigne: 192, pages: 2, motif: null };
  const { api, vus } = await orchestration([partiel, complete], [{ ok: true }]);
  ok(api === complete && vus.pauses[0] >= 10_000 && vus.renouvellements === 0, `compteur qui bouge (192/193, Jocabroc) : relance après ${vus.pauses[0] / 1000} s, puis complet`);
}

// ── 3. Le renouvellement par la page (chrome.* simulé, horloge simulée) ─────
console.log('3. Le renouvellement par la page');
const texteRenouv = extraire('async function renouvelerJetonLeboncoinPage()');
const texteEtat = extraire('function etatJetonLeboncoinDansLaPage()');
const texteValable = extraire('function jetonLeboncoinValable(');
async function renouveler({ urls, etats, jusqua = 20_000 }) {
  let horloge = 1_800_000_000_000;
  let n = 0;
  const Date_ = { now: () => horloge };
  const chrome = {
    tabs: { get: async () => ({ url: urls[Math.min(n, urls.length - 1)] }) },
    scripting: { executeScript: async () => [{ result: etats[Math.min(n++, etats.length - 1)] }] },
  };
  const getOrCreateWorkTab = async () => 7;
  const sleep = async (ms) => { horloge += ms; };
  const fn = new Function('chrome', 'getOrCreateWorkTab', 'sleep', 'Date', 'LBC_PAGE_JETON', 'LBC_JETON_ATTENTE_MS',
    `${texteEtat}\n${texteValable.replace('maintenantMs = Date.now()', 'maintenantMs = Date.now()')}\n${texteRenouv}\nreturn renouvelerJetonLeboncoinPage();`);
  return fn(chrome, getOrCreateWorkTab, sleep, Date_, 'https://www.leboncoin.fr/compte/part/mes-annonces', jusqua);
}
{
  const exp = Math.floor(1_800_000_000_000 / 1000) + 7200;
  const r = await renouveler({ urls: ['https://www.leboncoin.fr/compte/part/mes-annonces'], etats: [{ present: false }, { present: false }, { present: true, exp }] });
  ok(r.ok === true && r.attente_ms === 1000, `jeton posé par la page au 3e coup d’œil → ok (${r.attente_ms} ms)`);
}
{
  const r = await renouveler({ urls: ['https://auth.leboncoin.fr/login?x=1'], etats: [{ present: false }] });
  ok(r.ok === false && r.motif === 'session_fermee', 'redirection vers auth.leboncoin.fr → « session_fermee »');
}
{
  const r = await renouveler({ urls: ['https://www.leboncoin.fr/compte/part/mes-annonces'], etats: [{ present: false }] });
  ok(r.ok === false && r.motif === 'jeton_non_rendu' && r.attente_ms <= 21_000, `page muette : abandon borné (${r.attente_ms} ms)`);
}
{
  const vieux = Math.floor(1_800_000_000_000 / 1000) - 10;
  const r = await renouveler({ urls: ['https://www.leboncoin.fr/compte/part/mes-annonces'], etats: [{ present: true, exp: vieux }] });
  ok(r.ok === false && r.motif === 'jeton_toujours_expire', 'jeton resté expiré : dit tel quel');
}

// ── 4. Le statut de fin ─────────────────────────────────────────────────────
console.log('4. Le statut de fin d’un relevé');
const statut = new Function(`${extraire('function statutFinReleveAnnonces(')}\nreturn statutFinReleveAnnonces;`)();
ok(statut({ vues: 30, erreur: 'couverture partielle : 30 annonce(s) vue(s) sur 340', complet: false }) === 'incomplete', '30 vues sur 340 → « incomplete », jamais « done »');
ok(statut({ vues: 192, erreur: 'relevé par l’adresse interrompu (http_401)', complet: false }) === 'incomplete', 'relevé interrompu → « incomplete »');
ok(statut({ vues: 340, erreur: null, complet: true }) === 'done', 'tout vu → « done »');
ok(statut({ vues: 0, vide: 'aucune annonce en ligne', complet: true }) === 'done', 'compte vide dit par la plateforme → « done »');
ok(statut({ vues: 0, erreur: '« Mes annonces » n’a pas rendu sa liste', complet: false }) === 'failed', 'rien vu sur un relevé raté → « failed »');
ok(statut({ absente: true, vues: 0 }) === 'absente', 'plateforme absente → « absente »');
ok(/status: statutFinReleveAnnonces\(\{ absente: rienARelever, vues: annonces\.length, vide, erreur, complet \}\)/.test(BG), 'la clôture du relevé passe par ce statut');
ok(/erreur: \[vide \? `\[vide\] \$\{vide\}` : \(erreur \? `\[incomplet\] \$\{erreur\}`/.test(BG), 'le marqueur « [incomplet] » reste posé (rapprocher_releve ne date aucune disparition)');

// ── 5. Le câblage ───────────────────────────────────────────────────────────
console.log('5. Le câblage');
ok(!/jeton_absent\|user_id_absent\/\.test\(String\(api\?\.motif \?\? ""\)\)\) break;/.test(BG), 'plus d’arrêt net sur un jeton absent');
const blocLbc = BG.slice(BG.indexOf('  let motifsAdresseListe = [];'), BG.indexOf('  let dernierTabId = null;'));
ok(/const api = await lireAdresseLbc\(motifsApi\);/.test(blocLbc), 'le relevé lit l’adresse avec renouvellement du jeton');
const apresPage = BG.slice(BG.indexOf('// ── LEBONCOIN : LA PAGE A CHARGÉ, L\'ADRESSE EST RELUE'), BG.indexOf('// ── UN SEUL JUGE DE COUVERTURE'));
ok(/lireAdresseLbc\(motifsBis, 2\)/.test(apresPage) && /api\.annonces\.length >= vuesPage/.test(apresPage), 'après le repli sur la page, l’adresse est relue avant de conclure');
ok(/async function lireVentesLeboncoin\(connues\) \{[\s\S]{0,400}await assurerJetonLeboncoin\(\)/.test(BG), 'relevé des ventes Leboncoin : jeton contrôlé/renouvelé d’abord');
ok(/await assurerJetonLeboncoin\(\)\.catch\(\(\) => null\);\n  return executerDansOngletPlateforme\("leboncoin", async \(perPage, typeConnu\)/.test(BG), 'veille des commandes Leboncoin : jeton contrôlé/renouvelé d’abord');
ok(/LBC_RENOUVELLEMENT_PAUSE_MS = 30 \* 60_000/.test(BG) && /renouvellement_en_pause/.test(BG), 'lectures de fond : pause de 30 min après un renouvellement raté (jamais une page rechargée à chaque cycle)');
ok(/status=in\.\(done,incomplete\)&select=finished_at/.test(BG), 'cadence de la veille : un relevé incomplet compte (pas de veille plus fréquente)');
ok(/paliersMuets < 3/.test(BG) && /window\.scrollBy\(0, -Math\.max\(400/.test(BG), 'défilement : une cible connue ne s’arrête plus au premier palier muet');
ok(/offset = ads\.length > 20 \? fin - 10 : fin;/.test(BG), 'pagination de l’adresse : 10 annonces de chevauchement');
const manifeste = JSON.parse(fs.readFileSync(join(ROOT, 'chrome-extension/manifest.json'), 'utf8'));
// Le correctif part avec la 0.6.100 ET toutes les suivantes (06/10 : la 0.6.101
// le porte toujours) — jamais une égalité stricte, qui rougit à chaque version.
const versionNum = (v) => String(v).split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);
ok(versionNum(manifeste.version) >= versionNum('0.6.100'), `manifest en 0.6.100 ou plus (${manifeste.version})`);

// ── 6. L'app ────────────────────────────────────────────────────────────────
console.log('6. L’app');
const E = await import(pathToFileURL(join(ROOT, 'src/annonces/etatReleve.js')).href);
const T = { motEnCours: 'en cours', motIncomplet: 'incomplet', motAnnonces: 'annonces', motAConnecter: 'à connecter', motEchec: 'échec', motExpire: 'expiré', motAAutoriser: 'à autoriser' };
const pip = { pipOk: 'ok', pipWarn: 'warn', pipBad: 'bad' };
const fini = new Date(Date.now() - 60_000).toISOString();
const nouveau = { platform: 'leboncoin', status: 'incomplete', items_vus: 30, total_entries: 340, erreur: '[incomplet] couverture partielle : 30 annonce(s) vue(s) sur 340 « en ligne »', finished_at: fini };
const ancien = { ...nouveau, status: 'done' };
const plein = { platform: 'leboncoin', status: 'done', items_vus: 340, total_entries: 340, erreur: '[défilement] [adresse] 4 page(s)', finished_at: fini };
for (const [quoi, run] of [['« incomplete » (0.6.100)', nouveau], ['« done » + [incomplet] (extensions d’avant)', ancien]]) {
  const e = E.etatTuile({ run, T, fr: true, pip });
  ok(e.phase === 'incomplet' && e.n === '30/340' && e.pip === 'warn', `${quoi} : tuile « incomplet 30/340 », ambre`, JSON.stringify(e));
  const b = E.lireBilan({ plateformes: ['leboncoin'], runs: { leboncoin: run }, runVinted: null });
  ok(b.dernierFini === null && b.total === 0, `${quoi} : ne compte JAMAIS dans « Synchronisé » ni « N annonces à jour »`);
}
{
  const e = E.etatTuile({ run: plein, T, fr: true, pip });
  const b = E.lireBilan({ plateformes: ['leboncoin'], runs: { leboncoin: plein }, runVinted: null });
  ok(e.phase === 'fait' && e.n === 340 && b.total === 340 && b.dernierFini != null, 'relevé complet : inchangé (« 340 annonces », compté)');
}

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
