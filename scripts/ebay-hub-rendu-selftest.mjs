// `node scripts/ebay-hub-rendu-selftest.mjs`
//
// LE HUB VENDEUR eBAY N'EST PAS RENDU QUAND SON URL L'EST (2026-09-22).
//
// Défaut mesuré : `deleteListing` concluait « Menu d'actions de la ligne
// introuvable » d'UNE SEULE requête synchrone, après un simple
// humanPause(1200, 2500), sur un onglet qui pouvait encore charger.
//   · job 4514680c (lohanobert59, montre Mortima) : vendue sur Vinted le 20/09
//     à 17:33:34, retrait eBay créé 4 s plus tard, CINQ échecs sur ce motif.
//     L'annonce eBay 168643821671 est restée en vente 48 h — vérifié en direct
//     le 22/09 : « Achat immédiat » toujours proposé.
//   · work_window_state du job : at_start.tab_status = "loading",
//     window_state "minimized", window_focused false. On a lu une page qui
//     chargeait encore, dans une fenêtre dont Chrome throttle les timers.
//   · relevé live du Hub le 22/09 : l'aria-label « Afficher d'autres actions
//     (<titre>) » n'a PAS changé (6 lignes / 6 boutons), et la colonne Actions
//     est montée par le client APRÈS `load` (load à 1 628 ms). Le sélecteur
//     était bon ; c'est le moment de la question qui était faux.
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE. Il extrait `deleteListing` ET `waitFor` de
//    chrome-extension/content-scripts/ebay.js — le texte exact qui part dans le
//    zip — et les fait tourner contre un faux DOM qui REJOUE la course. Rien
//    n'est relu, rien n'est recopié : si la fonction change, ce test change de
//    verdict.
//
// ⛔ ET ON PEUT LE FAIRE SUR LE PAQUET :
//    `node scripts/ebay-hub-rendu-selftest.mjs build/extension/content-scripts/ebay.js`
//    exécute le fichier MINIFIÉ qui part au Chrome Web Store. Un grep sur un
//    fichier minifié ne prouve rien ; l'exécuter prouve tout.
//
// ⚠️ CE QUI EST SIMULÉ, ET ASSUMÉ : `sleep` et `humanPause` sont remplacés par
//    une HORLOGE VIRTUELLE (Date.now piloté), pour que 20 s de budget réel
//    s'exécutent instantanément et sans dépendre du timer worker de la page.
//    `waitFor`, elle, est la VRAIE. Le moteur de sélecteurs du faux DOM ne
//    couvre que les sélecteurs réellement employés par deleteListing — c'est
//    borné, c'est voulu, et toute nouvelle forme de sélecteur fera échouer le
//    test au lieu de passer en silence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = (process.argv[2] ? String(process.argv[2]).replace(/\\/g, '/') : 'chrome-extension/content-scripts/ebay.js');
console.log(`fichier exécuté : ${FICHIER}\n`);
const SRC = fs.readFileSync(path.join(ROOT, FICHIER), 'utf8');

/** Extrait une fonction nommée de la source, par équilibrage d'accolades. */
function extraireFonction(source, nom) {
  const debut = source.search(new RegExp(`(?:async\\s+)?function\\s+${nom}\\s*\\(`));
  if (debut < 0) throw new Error(`${nom} introuvable dans ${FICHIER}`);
  let p = source.indexOf('(', debut);
  let parens = 0;
  for (; p < source.length; p++) {
    if (source[p] === '(') parens++;
    else if (source[p] === ')') { parens--; if (parens === 0) break; }
  }
  let i = source.indexOf('{', p);
  let profondeur = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') { profondeur--; if (profondeur === 0) return source.slice(debut, i + 1); }
  }
  throw new Error(`${nom} : accolades non équilibrées`);
}

const SRC_DELETE = extraireFonction(SRC, 'deleteListing');
const SRC_WAITFOR = extraireFonction(SRC, 'waitFor');

// ── Faux DOM : le strict nécessaire, et il le dit quand on sort du cadre ────
class Elem {
  constructor(tag, attrs = {}, enfants = []) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = [];
    this.parentElement = null;
    this.nodeType = 1;
    this._texte = attrs.text ?? '';
    for (const e of enfants) this.append(e);
  }
  append(e) { e.parentElement = this; this.children.push(e); return this; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  get textContent() {
    return this._texte + this.children.map((c) => c.textContent).join('');
  }
  get href() { return this.attrs.href ?? ''; }
  scrollIntoView() {}
  descendants() {
    const out = [];
    for (const c of this.children) { out.push(c, ...c.descendants()); }
    return out;
  }
  matches(sel) { return correspond(this, sel); }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) {
      for (const s of sel.split(',').map((x) => x.trim())) if (correspond(n, s)) return n;
    }
    return null;
  }
  querySelectorAll(sel) {
    const parts = sel.split(',').map((s) => s.trim());
    return this.descendants().filter((e) => parts.some((s) => correspond(e, s)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

/** Moteur de sélecteurs BORNÉ aux formes employées par deleteListing. */
function correspond(el, sel) {
  if (!el || el.nodeType !== 1) return false;
  // tag[attr*="valeur"] éventuellement suivi de « i »
  let m = sel.match(/^([a-z]+)\[([a-z-]+)\*=(?:"([^"]*)"|'([^']*)')(\s+i)?\]$/i);
  if (m) {
    const [, tag, attr, v1, v2, insensible] = m;
    if (el.tagName !== tag.toUpperCase()) return false;
    const val = String(el.getAttribute(attr) ?? '');
    const cible = v1 ?? v2;
    return insensible ? val.toLowerCase().includes(cible.toLowerCase()) : val.includes(cible);
  }
  // [class*="valeur"]
  m = sel.match(/^\[class\*="([^"]*)"\]$/);
  if (m) return String(el.getAttribute('class') ?? '').includes(m[1]);
  // tag.classe
  m = sel.match(/^([a-z]+)\.([a-z0-9_-]+)$/i);
  if (m) {
    return el.tagName === m[1].toUpperCase()
      && String(el.getAttribute('class') ?? '').split(/\s+/).includes(m[2]);
  }
  // tag nu
  if (/^[a-z]+$/i.test(sel)) return el.tagName === sel.toUpperCase();
  throw new Error(`selftest : sélecteur hors du cadre couvert → « ${sel} ». ` +
    `Étends correspond() SI c'est volontaire, ne contourne pas.`);
}

const MENU_LABEL = (titre) => `Afficher d'autres actions (${titre})`;

/**
 * Construit un Hub. `menusApres` = instant (horloge virtuelle) auquel la
 * colonne Actions se monte ; `lignesSansMenu` = titres privés de menu.
 * `ancresParasites` = ancres portant l'itemId mais HORS de toute ligne, posées
 * AVANT la grille (le piège de `querySelector`, qui rend la première du document).
 */
function faireHub({ annonces, menusApres = 0, lignesSansMenu = [], ancresParasites = [], horloge }) {
  const body = new Elem('body');
  for (const { id } of ancresParasites) {
    body.append(new Elem('div', { class: 'promo' }, [new Elem('a', { href: `/itm/${id}`, text: 'promo' })]));
  }
  const table = new Elem('table');
  body.append(table);
  for (const a of annonces) {
    const tr = new Elem('tr', { class: 'grid-row' });
    tr.append(new Elem('div', {}, [new Elem('a', { href: `/itm/${a.id}`, text: a.titre })]));
    tr.append(new Elem('div', {}, [new Elem('a', { href: `/itm/${a.id}?x=1`, text: '' })]));
    tr._menuVoulu = !lignesSansMenu.includes(a.titre);
    tr._titre = a.titre;
    table.append(tr);
  }
  let montes = false;
  const monterSiHeure = () => {
    if (montes || horloge.now() < menusApres) return;
    montes = true;
    for (const tr of table.children) {
      if (tr._menuVoulu) tr.append(new Elem('button', { 'aria-label': MENU_LABEL(tr._titre) }));
    }
  };
  // Le document interroge l'horloge à CHAQUE lecture : c'est ce qui rejoue la
  // course (la grille apparaît en cours de waitFor, pas avant l'appel).
  return {
    get readyState() { monterSiHeure(); return horloge.now() >= (menusApres / 2) ? 'complete' : 'loading'; },
    querySelectorAll(sel) { monterSiHeure(); return body.querySelectorAll(sel); },
    querySelector(sel) { monterSiHeure(); return body.querySelector(sel); },
    body,
  };
}

// ── Exécution du vrai code dans un bac à sable ──────────────────────────────
async function lancer({ url = 'https://www.ebay.fr/sh/lst/active', hub, job }) {
  const horloge = { t: 0, now() { return this.t; }, avancer(ms) { this.t += ms; } };
  const doc = typeof hub === 'function' ? hub(horloge) : hub;
  const journalHorloge = [];
  const sandbox = {
    location: { pathname: new URL(url).pathname, href: url },
    document: doc,
    Date: { now: () => horloge.now() },
    // Horloge virtuelle : 20 s de budget s'écoulent instantanément.
    sleep: async (ms) => { horloge.avancer(ms); journalHorloge.push(ms); },
    humanPause: async (min = 200) => { horloge.avancer(min); },
    DELETE_DRY_RUN: false,
    realClick: () => {},
    findEbayEnd: () => null,          // on s'arrête juste après le menu : c'est là que se joue le test
    estVisibleSansLayout: () => true,
    texteDe: (e) => String(e?.textContent ?? ''),
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const noms = Object.keys(sandbox);
  const corps = `${SRC_WAITFOR}\n${SRC_DELETE}\nreturn deleteListing(job);`;
  // eslint-disable-next-line no-new-func
  const fn = new Function(...noms, 'job', corps);
  const res = await fn(...noms.map((n) => sandbox[n]), job);
  return { ...res, horlogeFinale: horloge.now() };
}

let echecs = 0;
const ok = (cond, titre, detail = '') => {
  if (cond) { console.log(`  ✅ ${titre}`); return; }
  echecs++;
  console.log(`  ❌ ${titre}${detail ? `\n       ${detail}` : ''}`);
};

const MONTRE = { id: '168643821671', titre: 'Mortima Vintage Mechanical Watch 38mm' };
const AUTRES = [
  { id: '800423009959', titre: 'Quiksilver Swim Short M Orange Navy' },
  { id: '800578127338', titre: 'Camaieu Floral Blue Dress' },
];
const JOB = { listing_url: `https://www.ebay.fr/itm/${MONTRE.id}`, title: MONTRE.titre };

console.log('LE CAS RÉEL — job 4514680c, montre Mortima\n');

// ─────────────────────────────────────────────────────────────────────────────
{
  // La grille se monte à 6 s : APRÈS l'ancien budget (1,2–2,5 s), AVANT le neuf.
  const r = await lancer({
    job: JOB,
    hub: (h) => faireHub({ annonces: [...AUTRES, MONTRE], menusApres: 6000, horloge: h }),
  });
  ok(r.error === 'Action « Mettre fin à l\'annonce » introuvable',
    'colonne Actions montée à 6 s : on attend, on trouve la ligne ET son menu',
    `rendu : ${JSON.stringify(r.error)} — un « Menu d'actions de la ligne introuvable » ici serait la régression du 20/09`);
  ok(r.horlogeFinale >= 6000, 'le budget a réellement été consommé (pas de conclusion hâtive)',
    `horloge finale ${r.horlogeFinale} ms`);
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Hub qui ne rend JAMAIS sa grille : ancres présentes, zéro menu.
  const r = await lancer({
    job: JOB,
    hub: (h) => faireHub({ annonces: [...AUTRES, MONTRE], menusApres: 10 ** 9, horloge: h }),
  });
  ok(/n'a pas fini de s'afficher/.test(String(r.error)),
    'Hub jamais rendu : le message dit que c\'est CHEZ NOUS, pas « la ligne n\'a pas de menu »',
    `rendu : ${JSON.stringify(r.error)}`);
  ok(!/Menu d'actions de la ligne introuvable/.test(String(r.error)),
    'et surtout : il n\'accuse plus la ligne');
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // La VRAIE anomalie doit rester dicible : les autres lignes ont leur menu,
  // celle-ci non.
  const r = await lancer({
    job: JOB,
    hub: (h) => faireHub({ annonces: [...AUTRES, MONTRE], menusApres: 500, lignesSansMenu: [MONTRE.titre], horloge: h }),
  });
  ok(r.error === "Menu d'actions de la ligne introuvable",
    'ligne réellement dépourvue de menu (les autres en ont un) : le constat tient',
    `rendu : ${JSON.stringify(r.error)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Le piège de querySelector : une ancre portant le MÊME itemId, hors ligne,
  // placée AVANT la grille. L'ancienne version prenait celle-là.
  const r = await lancer({
    job: JOB,
    hub: (h) => faireHub({
      annonces: [...AUTRES, MONTRE], menusApres: 300,
      ancresParasites: [{ id: MONTRE.id }], horloge: h,
    }),
  });
  ok(r.error === 'Action « Mettre fin à l\'annonce » introuvable',
    'ancre parasite hors ligne posée en premier : on retient l\'ancre UTILE',
    `rendu : ${JSON.stringify(r.error)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Annonce réellement absente du Hub : message inchangé.
  const r = await lancer({
    job: JOB,
    hub: (h) => faireHub({ annonces: AUTRES, menusApres: 300, horloge: h }),
  });
  ok(r.error === 'Annonce introuvable dans le Hub vendeur',
    'annonce absente du Hub : message inchangé (non-régression)',
    `rendu : ${JSON.stringify(r.error)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Page inattendue : la garde d'entrée est intacte.
  const r = await lancer({
    job: JOB, url: 'https://www.ebay.fr/mys/home',
    hub: (h) => faireHub({ annonces: [MONTRE], menusApres: 0, horloge: h }),
  });
  ok(/^Page inattendue pour une fin d'annonce eBay/.test(String(r.error)),
    'hors /sh/lst : la garde d\'entrée est intacte (non-régression)',
    `rendu : ${JSON.stringify(r.error)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
{
  // Retrait par TITRE quand le job n'a pas d'identifiant dans son lien.
  const r = await lancer({
    job: { listing_url: 'https://www.ebay.fr/itm/', title: MONTRE.titre },
    hub: (h) => faireHub({ annonces: [...AUTRES, MONTRE], menusApres: 400, horloge: h }),
  });
  ok(r.error === 'Action « Mettre fin à l\'annonce » introuvable',
    'job sans identifiant : le repli par titre exact marche toujours (non-régression)',
    `rendu : ${JSON.stringify(r.error)}`);
}

console.log(`\n${echecs === 0 ? '✅ TOUT PASSE' : `❌ ${echecs} CONTRÔLE(S) EN ÉCHEC`}`);
process.exit(echecs === 0 ? 0 : 1);
