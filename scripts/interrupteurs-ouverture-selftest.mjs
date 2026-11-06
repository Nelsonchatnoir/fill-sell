// (06/11/2026 soir, décisions de Nico — points 1 et 5) LES INTERRUPTEURS D'OUVERTURE LUS AU DÉMARRAGE, et LE SPLASH
// QUI NE MONTRE JAMAIS UNE ANCIENNE VERSION.
//   1. config/interrupteurs.js : fermé tant que rien n'est lu ; ouvert seulement sur un 1 du serveur ; échec ou délai
//      dépassé = fermé (et connu : aucun écran n'attend) ; une seule requête ; les écouteurs sont prévenus.
//   2. config/cloudOffer.js : plus de drapeau figé ; l'offre suit l'interrupteur cloud_offre_ouverte ; témoins inchangés.
//   3. natif/splashDemarrage.js : OTA déjà là → caché tout de suite ; binaire déjà lancé → tout de suite ; premier
//      lancement d'un binaire neuf sur le web embarqué → attend « prêt » de Capgo, au plus le plafond (puis la mise à
//      jour tardive attend l'arrière-plan) ; tout échec → caché tout de suite.
//   4. Le code : plus aucun CLOUD_OFFER_ENABLED dans src/, la lecture part au chargement d'App.jsx, le Stock ne montre
//      ni l'ancienne ni la nouvelle carte tant que sync_multi_ouverte n'est pas su (le flash du 06/11), et App ne cache
//      plus le splash sans condition.
//   npm run selftest:interrupteurs-ouverture
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let echecs = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const I = await import('../src/config/interrupteurs.js');
const C = await import('../src/config/cloudOffer.js');
const S = await import('../src/natif/splashDemarrage.js');

const client = (reponse, { attente = 0, compteur = { n: 0 } } = {}) => ({
  compteur,
  from: (table) => ({ select: () => ({ in: async (_k, cles) => {
    compteur.n++; compteur.table = table; compteur.cles = cles;
    if (attente) await new Promise((r) => setTimeout(r, attente));
    if (reponse instanceof Error) throw reponse;
    return reponse;
  } }) }),
});

console.log('1. Les interrupteurs');
I._remettreAZero();
ok(!I.interrupteursConnus() && !I.interrupteurOuvert('cloud_offre_ouverte'), 'avant toute lecture : inconnus et fermés');
ok(C.cloudOffreOuverte() === false && C.cloudOfferVisible('u1') === false, 'avant toute lecture : le Cloud est fermé à tous');
let prevenu = 0;
I.ecouterInterrupteurs(() => { prevenu++; });
const cpt = { n: 0 };
const v = await I.lireInterrupteurs(client({ data: [{ key: 'cloud_offre_ouverte', value: 1 }, { key: 'sync_multi_ouverte', value: 1 }, { key: 'grille_trois_jauges', value: 0 }], error: null }, { compteur: cpt }));
ok(cpt.n === 1 && cpt.table === 'coin_config' && cpt.cles.includes('cloud_offre_ouverte') && cpt.cles.includes('grille_trois_jauges') && cpt.cles.includes('sync_multi_ouverte'), 'UNE requête sur coin_config, les clés d’ouverture');
ok(I.interrupteursConnus() && I.interrupteurOuvert('cloud_offre_ouverte') && I.interrupteurOuvert('sync_multi_ouverte') && !I.interrupteurOuvert('grille_trois_jauges') && !I.interrupteurOuvert('republication_multi_ouverte'), '1 = ouvert ; 0 ou absent = fermé');
ok(prevenu === 1 && v.cloud_offre_ouverte === 1, 'l’écouteur est prévenu une fois');
await I.lireInterrupteurs(client({ data: [], error: null }, { compteur: cpt }));
ok(cpt.n === 1, 'une lecture réussie n’est jamais refaite');
ok(C.cloudOffreOuverte() === true && C.cloudOfferVisible('n-importe-qui') === true, 'serveur à 1 : le Cloud est visible pour tous');
ok(C.cloudOffreVendable('n-importe-qui', 'Europe/Paris') === true && C.cloudOffreVendable('n-importe-qui', 'America/New_York') === false, 'ouvert : vendu en France seulement (règle des pays inchangée)');

I._remettreAZero();
await I.lireInterrupteurs(client({ data: null, error: { message: 'réseau' } }));
ok(I.interrupteursConnus() && !I.interrupteurOuvert('cloud_offre_ouverte'), 'erreur du serveur : connu et FERMÉ (aucun écran n’attend)');
const cpt2 = { n: 0 };
await I.lireInterrupteurs(client({ data: [{ key: 'cloud_offre_ouverte', value: 1 }], error: null }, { compteur: cpt2 }));
ok(cpt2.n === 1 && I.interrupteurOuvert('cloud_offre_ouverte'), 'après un échec, la lecture suivante réessaie');

I._remettreAZero();
await I.lireInterrupteurs(client(new Error('hors ligne')));
ok(I.interrupteursConnus() && !I.interrupteurOuvert('cloud_offre_ouverte'), 'exception : connu et fermé');

I._remettreAZero();
const t0 = Date.now();
await I.lireInterrupteurs(client({ data: [{ key: 'cloud_offre_ouverte', value: 1 }], error: null }, { attente: 500 }), { delaiMs: 60 });
ok(Date.now() - t0 < 400 && I.interrupteursConnus() && !I.interrupteurOuvert('cloud_offre_ouverte'), 'délai dépassé : rendu FERMÉ sans attendre la réponse');
I._remettreAZero();
await I.lireInterrupteurs(null);
ok(I.interrupteursConnus() && !I.interrupteurOuvert('cloud_offre_ouverte'), 'sans client : fermé');
I._remettreAZero();

console.log('2. Le splash');
const faux = ({ bundle = 'builtin', version = '2.9.163', build = '2611070900', deja = null, pret = 'tout_de_suite', jeterCurrent = false } = {}) => {
  const j = { cache: 0, ecoute: 0, retire: 0, delai: null, stock: { fs_binaire_lance: deja } };
  return {
    j,
    args: {
      natif: true,
      SplashScreen: { hide: async () => { j.cache++; } },
      CapacitorUpdater: {
        current: async () => { if (jeterCurrent) throw new Error('plugin'); return { bundle: { id: bundle }, native: version }; },
        addListener: async (nom, f) => { j.ecoute++; j.nomEcoute = nom; if (pret === 'tout_de_suite') setTimeout(f, 5); return { remove: async () => { j.retire++; } }; },
        setMultiDelay: async (o) => { j.delai = o; },
      },
      CapacitorApp: { getInfo: async () => ({ version, build }) },
      stockage: { getItem: (k) => j.stock[k] ?? null, setItem: (k, val) => { j.stock[k] = val; } },
      plafondMs: 80,
    },
  };
};
let f = faux({ bundle: 'a1b2c3' });
ok(await S.cacherSplashAuBonMoment(f.args) === 'ota' && f.j.cache === 1 && f.j.ecoute === 0, 'une OTA tourne déjà : caché tout de suite, rien attendu');
f = faux({ deja: '2.9.163+2611070900' });
ok(await S.cacherSplashAuBonMoment(f.args) === 'deja_lance' && f.j.cache === 1 && f.j.ecoute === 0, 'web embarqué, binaire déjà lancé : caché tout de suite (aucune attente réseau ajoutée)');
f = faux();
const r1 = await S.cacherSplashAuBonMoment(f.args);
ok(r1 === 'premier_lancement_pret' && f.j.nomEcoute === 'appReady' && f.j.cache === 1 && f.j.retire === 1 && f.j.delai === null, 'premier lancement : attend « appReady » de Capgo, puis caché, écoute retirée');
ok(f.j.stock.fs_binaire_lance === '2.9.163+2611070900', 'premier lancement : le binaire est noté (le suivant ne retardera rien)');
f = faux({ deja: '2.9.161+2611061217' });
ok(await S.cacherSplashAuBonMoment(f.args) === 'premier_lancement_pret', 'mise à jour du binaire (autre version/build) = premier lancement de CE binaire');
f = faux({ pret: 'jamais' });
const t1 = Date.now();
const r2 = await S.cacherSplashAuBonMoment(f.args);
ok(r2 === 'premier_lancement_plafond' && f.j.cache === 1 && Date.now() - t1 < 1000, 'Capgo muet : caché au plafond (jamais d’écran bloqué)');
ok(JSON.stringify(f.j.delai) === JSON.stringify({ delayConditions: [{ kind: 'background' }] }), 'au plafond : une mise à jour tardive attend l’arrière-plan (pas de rechargement en pleine utilisation)');
f = faux({ jeterCurrent: true });
ok(await S.cacherSplashAuBonMoment(f.args) === 'echec' && f.j.cache === 1, 'plugin en échec : caché tout de suite (le comportement d’avant)');
ok(await S.cacherSplashAuBonMoment({ natif: false }) === 'web', 'web : rien');
ok(S.PLAFOND_MS === 10000, 'plafond : 10 s');

console.log('3. Le code');
const fichiers = [];
const parcourir = (d) => { for (const e of readdirSync(new URL(`../${d}`, import.meta.url))) { const p = join(d, e); const s = statSync(new URL(`../${p}`, import.meta.url)); if (s.isDirectory()) parcourir(p); else if (/\.(js|jsx)$/.test(e)) fichiers.push(p); } };
parcourir('src');
const avecDrapeau = fichiers.filter((p) => /\bCLOUD_OFFER_ENABLED\b/.test(lire(p).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
ok(avecDrapeau.length === 0, `plus aucun drapeau CLOUD_OFFER_ENABLED dans le code de src/${avecDrapeau.length ? ` (${avecDrapeau.join(', ')})` : ''}`);
const app = lire('src/App.jsx');
ok(/^lireInterrupteurs\(supabase\);$/m.test(app), 'App.jsx lance la lecture au chargement du module (avant le premier rendu)');
ok(/ecouterInterrupteurs\(/.test(app), 'App se redessine à l’arrivée des interrupteurs');
ok(/cacherSplashAuBonMoment\(\{ natif: Capacitor\.isNativePlatform\(\)/.test(app) && !/useEffect\(\(\) => \{\s*if \(Capacitor\.isNativePlatform\(\)\) \{\s*SplashScreen\.hide/.test(app), 'App ne cache plus le splash sans condition au premier rendu');
const stock = lire('src/tabs/StockTab.jsx');
ok(/useState\(\(\) => syncMultiOuverteConnue\(\)\)/.test(stock), 'Stock : sync_multi_ouverte part de ce que le démarrage a lu (null si pas su), jamais de false par défaut');
ok(/\{syncMultiOuverte === null \? null : syncMultiOuverte \? \(/.test(stock), 'Stock : rien dans l’emplacement tant que l’interrupteur n’est pas su (ni l’ancienne carte Vinted, ni la nouvelle)');
ok(/useState\(\(\) => interrupteurOuvert\('republication_multi_ouverte'\)\)/.test(stock), 'Stock : republication multi part de la valeur lue au démarrage');
ok(!/from\('coin_config'\)\.select\('value'\)\.eq\('key', 'republication_multi_ouverte'\)/.test(stock), 'Stock : plus de requête à part pour republication_multi_ouverte');
const sync = lire('src/utils/syncPlateformes.js');
ok(/await lireInterrupteurs\(supabase\);\s*if \(interrupteurOuvert\('sync_multi_ouverte'\)\) return true;/.test(sync), 'lireSyncMultiOuverte passe par la lecture commune');

console.log(echecs ? `\n${echecs} ÉCHEC(S) — ${n} contrôles.` : `\nTout est vert — ${n} contrôles.`);
process.exit(echecs ? 1 : 0);
