// ═══════════════════════════════════════════════════════════════════════════
// VERROU « L'OTA S'APPLIQUE DÈS L'OUVERTURE SUIVANTE » (16/11/2026 soir, ordre 1 de Nico)
//     npm run selftest:ota-ouverture-suivante
// ═══════════════════════════════════════════════════════════════════════════
// Constat (16/11, iPhone de Nico) : l'OTA 2.9.207 publiée pendant que l'app tournait n'a été prise qu'après un passage
// en arrière-plan de plus (19:43:54 ouverture sur l'ancienne version, 19:44:46 issue de l'ancienne version, 19:46:47
// la nouvelle). Le plugin 8.51.2 ne cherche une OTA qu'au retour au premier plan, et en 'atBackground' (ce que devient
// 'atInstall' après le premier lancement) il ne la POSE qu'au passage en arrière-plan suivant.
// Ce test prouve, sans appareil (faux plugin, fausse horloge) :
//   A. bundle prêt dans la fenêtre de lancement (démarrage à froid ou retour au premier plan, personne n'a rien
//      touché) → splash montré PUIS CapacitorUpdater.set({ id }) — une seule fois ;
//   B. prêt pendant une action (achat, veille d'achat, parcours d'entrée, saisie, geste, fenêtre ouverte, publication)
//      ou hors de la fenêtre → reporté au prochain passage en arrière-plan (aucun set, aucun splash) ;
//   C. jamais deux rechargements (événements répétés, deux bundles, échec puis nouvel essai, garde de boucle) ;
//   D. échec du plugin (current, show, set refusé, set sans effet, addListener) → aucun blocage : le splash retombe,
//      rien ne jette ;
//   E. premier lancement d'un binaire : rien avant le signal du splash ; plafond iPhone → le bundle « retenu » est mis
//      en file (next + cancelDelay) au lieu d'attendre deux passages en arrière-plan ; plafond Android → le plugin
//      recharge lui-même (rideau seulement, jamais un 2e rechargement) ;
//   F. jamais un bundle plus ancien ni égal (appReady gardé d'une session précédente), ni le web ;
//   G. le câblage : main.jsx l'installe APRÈS notifyAppReady, App.jsx signale l'issue du splash et déclare les
//      occupations, l'achat du Cloud et des formules est déclaré ; capacitor.config.ts et le plafond de 10 s inchangés.
import { readFileSync } from 'node:fs';

let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

let M = null;
try {
  M = await import('../src/natif/miseAJourOuverture.js');
} catch (e) {
  ok(false, `src/natif/miseAJourOuverture.js absent ou illisible (${String(e?.message ?? e).slice(0, 120)})`);
}

// ── Le banc : faux plugin, faux splash, fausse horloge, faux document ────────────────────────────────────────────
const B207 = { id: 'b207', version: '2.9.207', status: 'success' };
const B208 = { id: 'b208', version: '2.9.208', status: 'pending' };
const B209 = { id: 'b209', version: '2.9.209', status: 'pending' };
const B206 = { id: 'b206', version: '2.9.206', status: 'success' };

function banc({ natif = true, plateforme = 'ios', courant = B207, suivant = null, setRefuse = false, setMuet = false, showRefuse = false,
  currentJette = false, ecouteJette = false, marque = null, attendreAvecGeste = false } = {}) {
  let t = 1_000_000;
  const j = { ordre: [], set: [], next: [], cancelDelay: 0, show: 0, hide: 0, journal: [] };
  const ecoutes = {}; const ecoutesApp = {}; const ecoutesDoc = {};
  const minuteries = [];
  const stock = new Map(marque ? [['fs_maj_ouverture', JSON.stringify(marque)]] : []);
  const doc = {
    activeElement: null, dialogues: [],
    addEventListener: (type, f) => { (ecoutesDoc[type] ??= []).push(f); },
    querySelectorAll: () => doc.dialogues,
  };
  const geste = (type = 'pointerdown') => { for (const f of ecoutesDoc[type] ?? []) f({ type }); };
  const deps = {
    natif, plateforme,
    CapacitorUpdater: {
      addListener: async (nom, f) => { if (ecouteJette) throw new Error('plugin absent'); (ecoutes[nom] ??= []).push(f); return { remove: async () => {} }; },
      current: async () => { if (currentJette) throw new Error('current'); return { bundle: courant, native: '2.9.164' }; },
      getNextBundle: async () => suivant,
      set: (o) => { j.ordre.push('set'); j.set.push(o?.id); if (setRefuse) return Promise.reject(new Error('set')); return setMuet ? new Promise(() => {}) : Promise.resolve(); },
      next: async (o) => { j.ordre.push('next'); j.next.push(o?.id); return o; },
      cancelDelay: async () => { j.ordre.push('cancelDelay'); j.cancelDelay++; },
    },
    SplashScreen: {
      show: async () => { j.ordre.push('show'); if (showRefuse) throw new Error('show'); j.show++; },
      hide: async () => { j.ordre.push('hide'); j.hide++; },
    },
    ecouterApp: async (nom, f) => { (ecoutesApp[nom] ??= []).push(f); return { remove: async () => {} }; },
    documentCible: doc,
    stockage: { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => { stock.set(k, String(v)); }, removeItem: (k) => { stock.delete(k); } },
    stockageSession: { getItem: () => null },
    horloge: () => t,
    attendre: async (ms) => { t += ms; if (attendreAvecGeste) geste('pointerdown'); },
    minuterie: (f, ms) => { minuteries.push({ f, a: t + ms, actif: true }); return minuteries.length - 1; },
    annulerMinuterie: (id) => { if (minuteries[id]) minuteries[id].actif = false; },
  };
  const avancer = (ms) => { t += ms; for (const m of minuteries) if (m.actif && m.a <= t) { m.actif = false; m.f(); } };
  const emettre = async (nom, data) => { for (const f of ecoutes[nom] ?? []) await f(data); await pause(); };
  const app = async (nom, data) => { for (const f of ecoutesApp[nom] ?? []) await f(data); await pause(); };
  return { j, deps, doc, geste, avancer, emettre, app, stock, poserCourant: (b) => { courant = b; }, poserSuivant: (b) => { suivant = b; } };
}
const pause = () => new Promise((r) => setTimeout(r, 0));
const regler = async () => { for (let i = 0; i < 5; i++) await pause(); };

if (M) {
  const { creerMiseAJourOuverture, deciderMiseAJour, comparerVersions, FENETRE_MS, SECOURS_RIDEAU_MS, GARDE_BOUCLE_MS } = M;

  console.log('A. Prêt dans la fenêtre de lancement → appliqué derrière le splash');
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    ok(m.demarrer() === 'natif', 'démarrage natif : écoutes posées');
    await regler();
    await b.emettre('updateAvailable', { bundle: B208 });
    ok(b.j.set.length === 0 && b.j.show === 0, 'avant le signal du splash : rien (le premier lancement reste au plugin)');
    await m.signalerDemarrage('deja_lance');
    await regler();
    ok(JSON.stringify(b.j.set) === '["b208"]', 'démarrage à froid, personne n’a rien touché : set({ id: b208 }) une fois');
    ok(b.j.ordre.indexOf('show') >= 0 && b.j.ordre.indexOf('show') < b.j.ordre.indexOf('set'), 'le splash est montré AVANT le rechargement (jamais la webview qui se recharge à vue)');
    ok(JSON.parse(b.stock.get('fs_maj_ouverture') ?? 'null')?.id === 'b208', 'la marque du rechargement est posée (garde de boucle, trace au retour)');
    await b.emettre('appReady', { bundle: B208, status: 'update downloaded, will install next background' });
    await b.emettre('updateAvailable', { bundle: B209 });
    await regler();
    ok(b.j.set.length === 1, 'appReady du même bundle, puis un autre bundle : toujours UN seul rechargement');
  }
  {
    const b = banc({ suivant: B208 });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('ota');
    await regler();
    ok(JSON.stringify(b.j.set) === '["b208"]', 'bundle déjà en file avant l’écoute (getNextBundle) : appliqué aussi');
  }
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    b.geste('pointerdown');
    await b.app('pause');
    await b.app('resume');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(JSON.stringify(b.j.set) === '["b208"]', 'iPhone : retour au premier plan (resume) = nouvelle fenêtre, le geste d’avant ne compte plus → appliqué');
  }
  {
    const b = banc({ plateforme: 'android' });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    b.geste('touchstart');
    await b.app('appStateChange', { isActive: false });
    await b.app('appStateChange', { isActive: true });
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(JSON.stringify(b.j.set) === '["b208"]', 'Android : retour au premier plan (appStateChange actif) = nouvelle fenêtre → appliqué');
  }

  console.log('B. Prêt pendant une action, ou hors de la fenêtre → reporté au passage en arrière-plan');
  const casOccupe = async (titre, preparer, raison) => {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    const fin = await preparer(b, m);
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    const d = m.etat().decisions.at(-1);
    ok(b.j.set.length === 0 && b.j.show === 0 && d?.action === 'reporter' && (!raison || String(d?.raison).includes(raison)), `${titre} → reporté (${d?.raison ?? 'aucune décision'})`);
    if (typeof fin === 'function') fin();
  };
  await casOccupe('achat en cours (feuille de la boutique)', async (_b, m) => { let fini; const p = m.occuperPendant('achat', () => new Promise((r) => { fini = r; })); return () => { fini(); return p; }; }, 'achat');
  await casOccupe('veille d’achat (attente de la banque)', async (_b, m) => { m.poserLecteurOccupations(() => ({ veille: true })); }, 'veille');
  await casOccupe('parcours d’entrée entamé', async (_b, m) => { m.poserLecteurOccupations(() => ({ parcours: true })); }, 'parcours');
  await casOccupe('publication (stepper ouvert)', async (_b, m) => { m.poserLecteurOccupations(() => ({ publication: true })); }, 'publication');
  await casOccupe('saisie (champ actif)', async (b) => { b.doc.activeElement = { tagName: 'INPUT' }; }, 'saisie');
  await casOccupe('saisie (texte éditable)', async (b) => { b.doc.activeElement = { tagName: 'DIV', isContentEditable: true }; }, 'saisie');
  await casOccupe('une fenêtre (dialog) ouverte', async (b) => { b.doc.dialogues = [{ getClientRects: () => [1] }]; }, 'fenetre');
  await casOccupe('un geste depuis l’ouverture', async (b) => { b.geste('pointerdown'); }, 'interaction');
  await casOccupe('une touche depuis l’ouverture', async (b) => { b.geste('keydown'); }, 'interaction');
  await casOccupe('fenêtre de lancement passée', async (b) => { b.avancer(FENETRE_MS + 1); }, 'hors_fenetre');
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    b.doc.dialogues = [{ getClientRects: () => [] }];
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 1, 'une fenêtre cachée (aucune boîte) ne bloque pas');
  }
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.app('pause');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0, 'prêt pendant l’arrière-plan : rien (le plugin le pose au passage en arrière-plan)');
  }
  {
    const b = banc({ attendreAvecGeste: true });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0 && b.j.show === 0, 'un geste pendant l’instant avant le rideau : abandon, ni splash ni rechargement');
  }
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    let fini;
    const p = m.occuperPendant('achat', () => new Promise((r) => { fini = r; }));
    await b.emettre('updateAvailable', { bundle: B208 });
    fini('ok');
    ok(await p === 'ok', 'occuperPendant rend le résultat de l’achat, tel quel');
    let jete = null;
    try { await m.occuperPendant('achat', async () => { throw new Error('refus'); }); } catch (e) { jete = e?.message; }
    ok(jete === 'refus' && !m.etat().occupations.includes('achat'), 'occuperPendant relance l’erreur de l’achat et libère l’occupation');
  }

  console.log('C. Jamais deux rechargements');
  {
    const b = banc({ marque: { id: 'b208', version: '2.9.208', de: '2.9.207', t: 1_000_000 - 10_000 } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0 && m.etat().decisions.at(-1)?.raison === 'recharge_recente', 'le même bundle rechargé il y a 10 s et pas arrivé : pas de nouvel essai (garde de boucle)');
  }
  {
    const b = banc({ marque: { id: 'b208', version: '2.9.208', de: '2.9.207', t: 1_000_000 - GARDE_BOUCLE_MS - 1 } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 1, 'au-delà de la garde de boucle : un nouvel essai permis');
  }
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await Promise.all([b.emettre('updateAvailable', { bundle: B208 }), b.emettre('updateAvailable', { bundle: B208 }), b.emettre('appReady', { bundle: B208, status: 'x' })]);
    await regler();
    ok(b.j.set.length === 1 && b.j.show === 1, 'trois signaux simultanés : un splash, un rechargement');
  }

  console.log('D. Échec du plugin → aucun blocage');
  {
    const b = banc({ setRefuse: true });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 1 && b.j.hide >= 1 && b.j.ordre.lastIndexOf('hide') > b.j.ordre.indexOf('set'), 'set refusé : le splash retombe aussitôt');
    await b.emettre('updateAvailable', { bundle: B209 });
    await regler();
    ok(b.j.set.length === 1, 'après un échec : plus aucun essai dans cette session (reporté)');
  }
  {
    const b = banc({ setMuet: true });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    void b.emettre('updateAvailable', { bundle: B208 }); // set ne rend jamais la main : on n'attend pas l'écoute
    await regler();
    ok(b.j.hide === 0, 'set lancé : le splash reste (la page va se recharger)');
    b.avancer(SECOURS_RIDEAU_MS + 1);
    ok(b.j.hide === 1, `set sans effet : le splash retombe au plus tard après ${SECOURS_RIDEAU_MS} ms (jamais d’écran bloqué)`);
  }
  {
    const b = banc({ showRefuse: true });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0, 'splash indisponible : pas de rechargement à vue, reporté');
  }
  {
    const b = banc({ currentJette: true });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    let jete = false;
    try { await m.signalerDemarrage('deja_lance'); await b.emettre('updateAvailable', { bundle: B208 }); await regler(); } catch { jete = true; }
    ok(!jete && b.j.set.length === 0 && b.j.show === 0, 'current() en échec : rien, aucune exception');
  }
  {
    const b = banc({ ecouteJette: true });
    const m = creerMiseAJourOuverture(b.deps);
    let jete = false;
    try { m.demarrer(); await regler(); await m.signalerDemarrage('deja_lance'); await regler(); } catch { jete = true; }
    ok(!jete, 'addListener en échec (vieux binaire) : aucune exception, l’app démarre');
  }

  console.log('E. Premier lancement d’un binaire neuf');
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0 && b.j.show === 0 && b.j.next.length === 0, 'sans signal du splash (premier lancement en cours, ou écran sans App) : jamais rien');
  }
  {
    const b = banc({ courant: { id: 'builtin', version: '2.9.164', status: 'success' } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('premier_lancement_plafond');
    b.geste('pointerdown');
    await b.emettre('appReady', { bundle: B208, status: 'Update delayed until delay conditions met' });
    await regler();
    ok(b.j.set.length === 0 && JSON.stringify(b.j.next) === '["b208"]' && b.j.cancelDelay === 1,
      'iPhone, plafond passé, la personne a commencé : le bundle retenu est mis en file (next + cancelDelay) → posé au PREMIER passage en arrière-plan, plus au deuxième');
  }
  {
    const b = banc({ courant: { id: 'builtin', version: '2.9.164', status: 'success' } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('premier_lancement_plafond');
    await b.emettre('appReady', { bundle: B208, status: 'Update delayed until delay conditions met' });
    await regler();
    ok(JSON.stringify(b.j.set) === '["b208"]' && b.j.cancelDelay === 1 && b.j.ordre.indexOf('show') < b.j.ordre.indexOf('set'),
      'iPhone, plafond passé, personne n’a rien touché : appliqué derrière le splash (délai levé)');
  }
  {
    const b = banc({ plateforme: 'android', courant: { id: 'builtin', version: '2.9.205', status: 'success' } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('premier_lancement_plafond');
    await b.emettre('updateAvailable', { bundle: B208 });
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0 && b.j.show === 1, 'Android, plafond passé : le plugin recharge lui-même → rideau (splash) seulement, jamais un 2e rechargement');
    b.avancer(SECOURS_RIDEAU_MS + 1);
    ok(b.j.hide === 1, 'Android : si le plugin ne recharge pas, le rideau retombe (jamais d’écran bloqué)');
    await b.emettre('updateAvailable', { bundle: B209 });
    await regler();
    ok(b.j.set.length === 0, 'Android : après le rideau, plus aucun rechargement de notre part dans cette session');
  }
  {
    const b = banc({ plateforme: 'android', courant: { id: 'builtin', version: '2.9.205', status: 'success' } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('premier_lancement_plafond');
    b.doc.activeElement = { tagName: 'INPUT' };
    await b.emettre('updateAvailable', { bundle: B208 });
    await regler();
    ok(b.j.set.length === 0 && b.j.show === 0, 'Android, plafond passé, saisie en cours : ni rideau ni rechargement de notre part');
  }

  console.log('F. Jamais un bundle plus ancien, égal, ou sur le web');
  {
    const b = banc();
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    await m.signalerDemarrage('deja_lance');
    await b.emettre('appReady', { bundle: B206, status: 'x' });
    await b.emettre('appReady', { bundle: B207, status: 'x' });
    await b.emettre('updateAvailable', { bundle: { id: 'builtin', version: '2.9.300', status: 'success' } });
    await b.emettre('updateAvailable', { bundle: { id: 'b300', version: '2.9.300', status: 'error' } });
    await b.emettre('appReady', { bundle: B208, status: 'Update install failed' });
    await regler();
    ok(b.j.set.length === 0 && b.j.show === 0, 'plus ancien, égal, builtin, en erreur, installation ratée : ignorés');
  }
  {
    const b = banc({ natif: false });
    const m = creerMiseAJourOuverture(b.deps);
    ok(m.demarrer() === 'web', 'web : rien n’est posé');
    await m.signalerDemarrage('web');
    ok(b.j.set.length === 0 && b.j.show === 0, 'web : aucun appel');
  }
  ok(comparerVersions('2.9.208', '2.9.207') === 1 && comparerVersions('2.9.207', '2.9.208') === -1 && comparerVersions('2.10.0', '2.9.300') === 1
    && comparerVersions('2.9.207', '2.9.207') === 0 && comparerVersions('2.9.208', 'builtin') === null, 'comparerVersions : numérique, segment par segment, null si illisible');
  ok(deciderMiseAJour({ natif: true, phase: 'actif', bundle: B208, courant: B207, fenetreOuverte: true, occupations: [] }).action === 'appliquer'
    && deciderMiseAJour({ natif: true, phase: 'actif', bundle: B208, courant: B207, fenetreOuverte: true, occupations: [], rechargeLance: true }).action === 'ignorer'
    && deciderMiseAJour({ natif: true, phase: 'actif', bundle: B208, courant: B207, fenetreOuverte: false, occupations: [] }).action === 'reporter'
    && deciderMiseAJour({ natif: true, phase: 'attente_demarrage', bundle: B208, courant: B207, fenetreOuverte: true, occupations: [] }).action === 'attendre',
  'deciderMiseAJour : la table (appliquer / ignorer / reporter / attendre)');

  console.log('G. Après le rechargement (nouvelle page)');
  {
    const b = banc({ courant: B208, marque: { id: 'b208', version: '2.9.208', de: '2.9.207', t: 1_000_000 - 2_000 } });
    const m = creerMiseAJourOuverture(b.deps);
    m.demarrer();
    b.avancer(SECOURS_RIDEAU_MS + 1);
    ok(b.j.hide === 1, 'nouvelle page juste après notre rechargement : le splash retombe au plus tard au secours, même si App ne monte pas');
    m.poserJournal((f, meta) => b.j.journal.push([f, meta]));
    await m.signalerDemarrage('ota');
    await regler();
    const l = b.j.journal.find(([f, meta]) => f === 'maj_ouverture' && meta?.action === 'appliquee');
    ok(l && l[1].vers === '2.9.208' && l[1].de === '2.9.207', 'la trace « appliquee » part de la NOUVELLE page (usage_logs maj_ouverture), de → vers');
  }
}

console.log('H. Le câblage');
const main = lire('src/main.jsx');
const iNotif = main.indexOf('CapacitorUpdater.notifyAppReady()');
const iInst = main.indexOf('installerMiseAJourOuverture(');
ok(iNotif > 0 && iInst > iNotif && main.indexOf('import') < iNotif, 'main.jsx : notifyAppReady reste la première instruction, la mise à jour d’ouverture est installée APRÈS');
const app = lire('src/App.jsx');
ok(/cacherSplashAuBonMoment\(\{ natif: Capacitor\.isNativePlatform\(\)[^\n]*\n\s*\.then\(signalerDemarrageSplash\)/.test(app), 'App.jsx : l’issue du splash est signalée (le premier lancement reste au plugin jusque-là)');
ok(/\.catch\(\(\) => \{ SplashScreen\.hide\(\{ fadeOutDuration: 350 \}\)\.catch\(\(\) => \{\}\); signalerDemarrageSplash\('echec'\); \}\)/.test(app), 'App.jsx : un splash en échec est caché ET signalé');
ok(/poserLecteurOccupations\(/.test(app) && /achat:iapLoading/.test(app) && /parcours:showOnboardingFlow/.test(app) && /veille:veilleEnCours\(/.test(app) && /publication:listingStepperOpen/.test(app), 'App.jsx : achat, veille, parcours, publication déclarés');
ok(/const r=await occuperPendant\('achat',\(\)=>achatCloud\.acheter\(origine\)\);/.test(app) && /const r=await occuperPendant\('achat',\(\)=>achatFormules\.acheter\(formule,\{origine,\.\.\.opts\}\)\);/.test(app), 'App.jsx : l’achat du Cloud et des formules est déclaré pendant toute la feuille');
ok(/poserJournalMiseAJour\(/.test(app), 'App.jsx : la trace maj_ouverture part dans usage_logs');
const config = lire('capacitor.config.ts');
ok(/autoUpdate: 'atInstall'/.test(config) && /autoSplashscreenTimeout: 10000/.test(config) && /launchAutoHide: false/.test(config), 'capacitor.config.ts inchangé (atInstall, 10 s, launchAutoHide false) : aucun binaire requis par ce correctif');
const splash = await import('../src/natif/splashDemarrage.js');
ok(splash.PLAFOND_MS === 10000, 'le plafond du premier lancement reste 10 s');
const pkg = JSON.parse(lire('package.json'));
ok(pkg.scripts['selftest:ota-ouverture-suivante'] === 'node scripts/ota-ouverture-suivante-selftest.mjs', 'package.json : selftest:ota-ouverture-suivante');

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
