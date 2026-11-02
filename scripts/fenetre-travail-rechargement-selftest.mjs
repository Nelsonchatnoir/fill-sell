// `npm run selftest:fenetre-travail-rechargement`
//
// UN RECHARGEMENT DE L'EXTENSION NE CRÉE PLUS DE FENÊTRE DE TRAVAIL EN LAISSANT L'ANCIENNE (02/11 soir, demande de Nico).
//
// Cause (background.js, bandeau de compterOngletsFenetre) : un rechargement vide storage.session ; l'onglet de travail
// dont la plateforme a réécrit l'URL (sans #fillsell-worker) n'avait plus de marque et comptait « utilisateur » ;
// resolveWorkWindow « rendait » alors SA fenêtre (oubliée du registre, jamais fermée) et en créait une neuve. Et le
// porte-page about:blank#fillsell-worker est INVISIBLE à l'extension (sans permission « tabs » : adresse vide).
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : les fonctions de la fenêtre de travail sont extraites de background.js et tournent
//    contre un faux Chrome qui, comme le vrai sans permission « tabs », rend une adresse VIDE pour about:blank et pour
//    les sites hors permissions d'hôte. `node scripts/fenetre-travail-rechargement-selftest.mjs <fichier>` exécute un
//    autre background (l'ancien, le paquet minifié).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = process.argv[2] ? String(process.argv[2]) : 'chrome-extension/background.js';
const BG = fs.readFileSync(path.isAbsolute(FICHIER) ? FICHIER : path.join(RACINE, FICHIER), 'utf8').replace(/\r\n/g, '\n');
console.log(`fenetre-travail-rechargement-selftest — fichier exécuté : ${FICHIER}`);

function extraireFonction(source, nom) {
  const debut = source.indexOf(`function ${nom}(`);
  if (debut < 0) return null;
  let p = source.indexOf('(', debut); let parens = 0;
  for (; p < source.length; p++) { if (source[p] === '(') parens++; else if (source[p] === ')') { parens--; if (parens === 0) break; } }
  let i = source.indexOf('{', p); let prof = 0;
  for (; i < source.length; i++) { if (source[i] === '{') prof++; else if (source[i] === '}') { prof--; if (prof === 0) break; } }
  const avant = source.lastIndexOf('async ', debut);
  return source.slice(avant === debut - 6 ? avant : debut, i + 1);
}
const constante = (nom) => {
  const m = BG.match(new RegExp(`const ${nom} = ([^;\\n]+);`));
  if (!m) throw new Error(`constante ${nom} introuvable`);
  return m[1];
};

const FONCTIONS = ['hotePlateformeTravail', 'compterOngletsFenetre', 'idsOngletsTravailConnus', 'memoriserOngletsTravail',
  'memoriserOngletsTravailBrut', 'lireRegistreFenetres', 'memoriserFenetreCreee', 'oublierFenetresCreees',
  'fenetresCreeesVivantes', 'fenetresDeTravailObservees', 'fenetresTravailVivantes', 'getOrCreateWorkWindow',
  'resolveWorkWindow', 'findExistingWorkWindow', 'consolidateWorkWindows', 'fermerFenetresAvantMaj'];
const SOURCE = FONCTIONS.map((f) => extraireFonction(BG, f)).filter(Boolean).join('\n');
const PREAMBULE = [
  `const WORK_WINDOW_KEY = ${constante('WORK_WINDOW_KEY')};`,
  `const WORK_TAB_FRAGMENT = ${constante('WORK_TAB_FRAGMENT')};`,
  `const TEMP_TAB_FRAGMENT = ${constante('TEMP_TAB_FRAGMENT')};`,
  `const TEMP_TAB_ID_KEY = ${constante('TEMP_TAB_ID_KEY')};`,
  `const WORK_WINDOWS_CREATED_KEY = ${constante('WORK_WINDOWS_CREATED_KEY')};`,
  `const MAX_FENETRES_TRAVAIL = ${constante('MAX_FENETRES_TRAVAIL')};`,
  BG.includes('const ONGLETS_TRAVAIL_CONNUS_KEY') ? `const ONGLETS_TRAVAIL_CONNUS_KEY = ${constante('ONGLETS_TRAVAIL_CONNUS_KEY')};` : '',
  'const workTabKey = (platform) => `fillsell_work_tab_${platform}`;',
  'const PLATFORM_HANDLERS = { vinted: {}, leboncoin: {}, ebay: {}, beebs: {}, opla: {}, depop: {} };',
  'const PLATFORM_HOSTS = { vinted: "vinted.fr", leboncoin: "leboncoin.fr", ebay: "ebay.fr", beebs: "beebs.app", opla: "opla.co", depop: "depop.com" };',
  'let workWindowInFlight = null;',
  'let memoriserOngletsChaine = Promise.resolve();',
].join('\n');
assert.ok(BG.includes('const workTabKey = (platform) => `fillsell_work_tab_${platform}`;'), 'la clé des onglets de travail du banc est celle du background');

// ── Le faux Chrome : fenêtres, onglets (ordre = index), stockage. Adresse VIDE pour about:blank (pas de « tabs »). ──
function faireChrome({ fenetres = [], session = {}, local = {} } = {}) {
  const wins = new Map(); const tabs = new Map(); let prochain = 1000;
  const j = { creees: [], fermees: [], deplaces: [], retires: [], evenements: [] };
  const ajouterOnglet = (windowId, t) => {
    const id = t.id ?? prochain++;
    tabs.set(id, { id, windowId, url: t.url ?? '', autoDiscardable: t.autoDiscardable ?? true, active: false });
    wins.get(windowId).ordre.push(id);
    return id;
  };
  for (const w of fenetres) {
    wins.set(w.id, { id: w.id, state: w.state ?? 'minimized', focused: false, type: 'normal', ordre: [] });
    for (const t of w.tabs ?? []) ajouterOnglet(w.id, t);
  }
  const vueOnglet = (id) => { const t = tabs.get(id); const w = wins.get(t.windowId); return { ...t, index: w.ordre.indexOf(id) }; };
  const vueFenetre = (w, populate) => ({ id: w.id, state: w.state, focused: w.focused, type: w.type, ...(populate ? { tabs: w.ordre.map(vueOnglet) } : {}) });
  const retirerOnglet = (id) => {
    const t = tabs.get(id); if (!t) return;
    const w = wins.get(t.windowId); w.ordre = w.ordre.filter((x) => x !== id); tabs.delete(id);
    if (!w.ordre.length) wins.delete(w.id);
  };
  const zone = (o) => ({
    get: async (k) => { if (k == null) return { ...o }; const ks = [].concat(k); return Object.fromEntries(ks.filter((x) => x in o).map((x) => [x, structuredClone(o[x])])); },
    set: async (v) => { Object.assign(o, structuredClone(v)); },
    remove: async (k) => { for (const x of [].concat(k)) delete o[x]; },
  });
  const chrome = {
    windows: {
      getAll: async ({ populate } = {}) => [...wins.values()].map((w) => vueFenetre(w, populate)),
      get: async (id, { populate } = {}) => { const w = wins.get(id); if (!w) throw new Error(`No window with id: ${id}`); return vueFenetre(w, populate); },
      create: async ({ state }) => {
        const id = prochain++; wins.set(id, { id, state: state ?? 'normal', focused: false, type: 'normal', ordre: [] });
        ajouterOnglet(id, { url: '' });   // le porte-page : about:blank#fillsell-worker, lu VIDE sans permission « tabs »
        j.creees.push(id); return vueFenetre(wins.get(id), false);
      },
      update: async (id, props) => { const w = wins.get(id); if (!w) throw new Error('No window'); if (props.state) w.state = props.state; return vueFenetre(w); },
      remove: async (id) => { const w = wins.get(id); if (!w) throw new Error('No window'); for (const t of [...w.ordre]) tabs.delete(t); wins.delete(id); j.fermees.push(id); },
    },
    tabs: {
      get: async (id) => { if (!tabs.has(id)) throw new Error(`No tab with id: ${id}`); return vueOnglet(id); },
      move: async (id, { windowId }) => {
        const t = tabs.get(id); if (!t || !wins.has(windowId)) throw new Error('move impossible');
        const avant = wins.get(t.windowId); avant.ordre = avant.ordre.filter((x) => x !== id);
        if (!avant.ordre.length) wins.delete(avant.id);
        t.windowId = windowId; wins.get(windowId).ordre.push(id); j.deplaces.push(id); return vueOnglet(id);
      },
      remove: async (id) => { if (!tabs.has(id)) throw new Error('No tab'); retirerOnglet(id); j.retires.push(id); },
      update: async (id, props) => { const t = tabs.get(id); if (!t) throw new Error('No tab'); Object.assign(t, props); return vueOnglet(id); },
    },
    storage: { session: zone(session), local: zone(local) },
  };
  return { chrome, j, wins, tabs };
}
const charger = (fc) => new Function('chrome', 'journaliserEvenementFenetre', 'console',
  `${PREAMBULE}\n${SOURCE}\nreturn { ${FONCTIONS.filter((f) => SOURCE.includes(`function ${f}(`)).join(', ')} };`)(
  fc.chrome, async (type, detail) => { fc.j.evenements.push({ type, ...detail }); }, { log: () => {}, warn: () => {} });

let n = 0, ko = 0;
const cas = async (nom, f) => {
  try { await f(); n++; console.log(`  ✓ ${nom}`); }
  catch (e) { ko++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split('\n')[0]}`); }
};
const REG = 'fillsell_work_windows_created';
const VINTED_ACCUEIL = 'https://www.vinted.fr/';
const LBC_TRAVAIL = 'https://www.leboncoin.fr/#fillsell-worker';

await cas('rechargement : la fenêtre du registre garde son onglet Vinted sans fragment → réutilisée, AUCUNE fenêtre créée, rien rendu', async () => {
  // L'état exact relevé dans le navigateur Cloud le 02/11 : porte-page illisible en tête, Vinted revenu sur son
  // accueil (sans fragment), Leboncoin et Depop avec fragment ; storage.session vidé par le rechargement.
  const fc = faireChrome({
    fenetres: [{ id: 1, tabs: [{ url: '' }, { id: 11, url: VINTED_ACCUEIL, autoDiscardable: false }, { id: 12, url: LBC_TRAVAIL, autoDiscardable: false }, { id: 13, url: 'https://www.depop.com/fr/#fillsell-worker', autoDiscardable: false }] }],
    local: { [REG]: [1] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 1);
  assert.deepEqual(fc.j.creees, [], 'aucune fenêtre créée');
  assert.deepEqual(fc.j.fermees, []);
  assert.ok(!fc.j.evenements.some((e) => e.type === 'fenetre_rendue_a_l_utilisateur'), 'la fenêtre n\'est pas « rendue »');
  assert.deepEqual(await f.lireRegistreFenetres(), [1], 'elle reste au registre');
  assert.equal(fc.wins.get(1).ordre.length, 4, 'ses onglets restent où ils sont');
});

await cas('dix rechargements de suite : toujours UNE fenêtre de travail', async () => {
  const fc = faireChrome({
    fenetres: [{ id: 1, tabs: [{ url: '' }, { id: 11, url: VINTED_ACCUEIL, autoDiscardable: false }] }],
    local: { [REG]: [1] },
  });
  for (let i = 0; i < 10; i++) {
    const f = charger(fc);
    await fc.chrome.storage.session.remove(['fillsell_work_window']);   // le rechargement vide storage.session
    assert.equal(await f.getOrCreateWorkWindow(), 1);
  }
  assert.equal(fc.wins.size, 1);
  assert.deepEqual(fc.j.creees, []);
});

await cas('vieille fenêtre de travail perdue du registre (réduite, onglet au drapeau) → ses onglets rapatriés, elle est FERMÉE', async () => {
  const fc = faireChrome({
    fenetres: [
      { id: 2, tabs: [{ url: '' }, { id: 21, url: LBC_TRAVAIL, autoDiscardable: false }] },
      { id: 9, tabs: [{ url: '' }, { id: 91, url: VINTED_ACCUEIL, autoDiscardable: false }] },
    ],
    session: { fillsell_work_window: 2 },
    local: { [REG]: [2] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 2);
  assert.deepEqual(fc.j.fermees, [9], 'la vieille fenêtre est fermée');
  assert.ok(fc.wins.get(2).ordre.includes(91), 'son onglet Vinted est rapatrié (le ménage des orphelins ferme le doublon en fin de cycle)');
  assert.ok(fc.j.evenements.some((e) => e.type === 'consolidation' && e.window_id === 9 && e.closed === true && e.heritee === true));
});

await cas('vieille fenêtre perdue, seule au monde → adoptée (remise au registre), aucune fenêtre créée', async () => {
  const fc = faireChrome({ fenetres: [{ id: 9, tabs: [{ url: '' }, { id: 91, url: VINTED_ACCUEIL, autoDiscardable: false }] }] });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 9);
  assert.deepEqual(fc.j.creees, []);
  assert.deepEqual(await f.lireRegistreFenetres(), [9]);
});

await cas('fenêtre de la personne (Gmail illisible) avec notre onglet de repli → notre onglet rapatrié, sa fenêtre JAMAIS fermée', async () => {
  const fc = faireChrome({
    fenetres: [
      { id: 2, tabs: [{ url: '' }] },
      { id: 5, tabs: [{ id: 51, url: '' }, { id: 52, url: 'https://www.vinted.fr/items/new#fillsell-worker' }] },
    ],
    session: { fillsell_work_window: 2 },
    local: { [REG]: [2] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 2);
  assert.ok(fc.wins.has(5), 'la fenêtre de la personne reste ouverte');
  assert.deepEqual(fc.wins.get(5).ordre, [51], 'son onglet à elle reste, intact');
  assert.ok(fc.wins.get(2).ordre.includes(52), 'notre onglet de repli est rapatrié');
  assert.deepEqual(fc.j.fermees, []);
});

await cas('fenêtre de la personne, visible, avec un onglet Vinted au drapeau d\'une autre extension → intouchable', async () => {
  const fc = faireChrome({
    fenetres: [
      { id: 2, tabs: [{ url: '' }] },
      { id: 6, state: 'normal', tabs: [{ id: 61, url: '' }, { id: 62, url: VINTED_ACCUEIL, autoDiscardable: false }] },
    ],
    session: { fillsell_work_window: 2 },
    local: { [REG]: [2] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 2);
  assert.deepEqual(fc.wins.get(6).ordre, [61, 62]);
  assert.deepEqual(fc.j.deplaces, []);
  assert.deepEqual(fc.j.fermees, []);
});

await cas('fenêtre de la personne sans aucun de nos onglets → aucune adoption : UNE fenêtre neuve, la sienne intacte', async () => {
  const fc = faireChrome({ fenetres: [{ id: 7, state: 'normal', tabs: [{ id: 71, url: '' }, { id: 72, url: VINTED_ACCUEIL }] }] });
  const f = charger(fc);
  const id = await f.getOrCreateWorkWindow();
  assert.equal(fc.j.creees.length, 1);
  assert.equal(id, fc.j.creees[0]);
  assert.deepEqual(fc.wins.get(7).ordre, [71, 72]);
});

await cas('fenêtre du registre où la personne a ouvert fillsell.app (MeMiniandMove) → rendue, jamais fermée (inchangé)', async () => {
  const fc = faireChrome({
    fenetres: [{ id: 1, state: 'fullscreen', tabs: [{ url: '' }, { id: 11, url: 'https://fillsell.app/stock' }, { id: 12, url: LBC_TRAVAIL }] }],
    session: { fillsell_work_window: 1 },
    local: { [REG]: [1] },
  });
  const f = charger(fc);
  const id = await f.getOrCreateWorkWindow();
  assert.notEqual(id, 1);
  assert.ok(fc.wins.has(1) && fc.wins.get(1).ordre.includes(11), 'sa fenêtre et son onglet restent');
  assert.ok(fc.j.evenements.some((e) => e.type === 'fenetre_rendue_a_l_utilisateur'));
  assert.ok(fc.wins.get(id).ordre.includes(12), 'notre onglet Leboncoin rapatrié dans la neuve');
});

await cas('fenêtre du registre en trop avec DEUX onglets illisibles → nos onglets rapatriés, fenêtre laissée (doute)', async () => {
  const fc = faireChrome({
    fenetres: [
      { id: 1, tabs: [{ id: 10, url: '' }, { id: 14, url: '' }, { id: 11, url: VINTED_ACCUEIL }] },
      { id: 2, tabs: [{ url: '' }] },
    ],
    session: { fillsell_work_window: 2 },
    local: { [REG]: [1, 2] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 2);
  assert.ok(fc.wins.get(2).ordre.includes(11));
  assert.deepEqual(fc.wins.get(1).ordre, [10, 14]);
  assert.deepEqual(fc.j.fermees, []);
});

await cas('avant une mise à jour : seules les fenêtres sûrement à nous sont fermées', async () => {
  if (!SOURCE.includes('function fermerFenetresAvantMaj(')) throw new Error('fermerFenetresAvantMaj absente');
  const fc = faireChrome({
    fenetres: [
      { id: 1, tabs: [{ url: '' }, { id: 11, url: VINTED_ACCUEIL }] },
      { id: 3, tabs: [{ id: 30, url: '' }, { id: 31, url: '' }, { id: 32, url: LBC_TRAVAIL }] },
    ],
    local: { [REG]: [1, 3] },
  });
  const f = charger(fc);
  await f.fermerFenetresAvantMaj();
  assert.deepEqual(fc.j.fermees, [1]);
  assert.ok(fc.wins.has(3));
});

await cas('ids durables : ajoutés, morts purgés, onglet rendu à la personne retiré', async () => {
  if (!SOURCE.includes('function memoriserOngletsTravail(')) throw new Error('memoriserOngletsTravail absente');
  const fc = faireChrome({ fenetres: [{ id: 1, tabs: [{ url: '' }, { id: 11, url: VINTED_ACCUEIL }, { id: 12, url: LBC_TRAVAIL }] }] });
  const f = charger(fc);
  await f.memoriserOngletsTravail([11, 12, 999]);
  assert.deepEqual([...(await f.idsOngletsTravailConnus())].sort(), [11, 12]);
  await f.memoriserOngletsTravail([], [12]);
  assert.deepEqual([...(await f.idsOngletsTravailConnus())], [11]);
  // storage.session vidé (rechargement) : l'id durable reste.
  await fc.chrome.storage.session.remove(['fillsell_work_tab_vinted']);
  assert.ok((await f.idsOngletsTravailConnus()).has(11));
});

await cas('le Cloud : fenêtre de steel (about:blank, hors registre) jamais touchée, fenêtre de travail réutilisée', async () => {
  const fc = faireChrome({
    fenetres: [
      { id: 653, state: 'normal', tabs: [{ id: 654, url: '' }] },
      { id: 743, state: 'normal', tabs: [{ url: '' }, { id: 745, url: VINTED_ACCUEIL, autoDiscardable: false }, { id: 747, url: LBC_TRAVAIL, autoDiscardable: false }] },
    ],
    local: { [REG]: [743] },
  });
  const f = charger(fc);
  assert.equal(await f.getOrCreateWorkWindow(), 743);
  assert.ok(fc.wins.has(653));
  assert.deepEqual(fc.j.creees, []);
  assert.deepEqual(fc.j.fermees, []);
});

console.log(`\n${n} cas passés, ${ko} échec(s)`);
if (ko) process.exit(1);
