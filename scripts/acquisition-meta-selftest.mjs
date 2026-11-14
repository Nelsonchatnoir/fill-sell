// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 14/11/2026 (bloc E1) — LA SOURCE D'UNE INSCRIPTION VENUE DE LA PUB META, PAR CANAL
//     npm run selftest:acquisition-meta
// ═══════════════════════════════════════════════════════════════════════════
// Campagne Trafic du 13/11 (20:10) vers fillsell.app/installer?utm_source=meta&utm_medium=paid&utm_campaign=… :
//   · iPhone : aucun referrer App Store. Ce qui reste honnête : le lien de campagne d'App Store Connect (pt + ct), lu
//     en AGRÉGÉ dans App Analytics. Règle d'Apple (developer.apple.com/help/app-store-connect-analytics/acquisition/
//     campaign-links) : ct = 30 caractères au plus, jamais une espace en premier ou dernier caractère. La page coupait
//     à 40 → ROUGE avant.
//   · Android : Google Play rend le `referrer` posé par /installer (Install Referrer API) — il faut un module natif,
//     donc un binaire. Préparé INACTIF : PLAY_REFERRER_BINAIRE_MIN = null → rien n'est lu, aucun appel natif.
//     Ouvert (borne injectée ici), il ENRICHIT une seule fois la source par défaut de l'app (« app_android / store »,
//     jamais lue) avec les UTM de Google Play, et rien d'autre ; une source déjà relevée (le site) n'est jamais touchée.
//   · Web : les UTM de /installer suivent la personne jusqu'à l'inscription (capterSource, inchangé, déjà couvert).
//   · Base : la plateforme d'inscription quitte acquisition_source (sinon un Android « meta » serait compté « web ») →
//     colonne acquisition_plateforme, migration PRÉPARÉE, NON appliquée ; l'app n'envoie p_plateforme que sur le chemin
//     Google Play, et retombe sur l'appel à 7 paramètres si la base ne l'a pas encore (PGRST202).
// Avant ce lot : A, B, C, D, E, F, G rouges (fonctions et fichiers absents, ct à 40).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { ok(false, `module ${p} chargé`, e?.message ?? e); return {}; } };

// Faux localStorage (acquisition.js le lit par le global).
const stock = new Map();
globalThis.localStorage = { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
const poser = (v) => (v == null ? stock.delete('fs_acq') : stock.set('fs_acq', JSON.stringify(v)));
const acq = () => { try { return JSON.parse(stock.get('fs_acq') ?? 'null'); } catch { return null; } };

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0]';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0;]';
// Le lien EXACT des pubs (marketing/meta-ads/SUIVI-CAMPAGNE-META.md), plus le fbclid que Meta ajoute.
const RECH = '?utm_source=meta&utm_medium=paid&utm_campaign=installer-continu&utm_content=V1-podcast&fbclid=IwAR0abc';

const I = await importer('site/gabarits/installer.mjs');
const { LIENS } = await importer('site/gabarits/textes.mjs');
const liens = { appStore: LIENS?.appStore, googlePlay: LIENS?.googlePlay };

console.log('A. iPhone : le lien de campagne d’App Store Connect suit la règle d’Apple (ct ≤ 30, pas d’espace en bord)');
if (I.destinationInstallation) {
  const ctDe = (d) => { const m = /[?&]ct=([^&]*)/.exec(d ?? ''); return m ? decodeURIComponent(m[1]) : null; };
  const d1 = I.destinationInstallation(IPHONE, RECH, liens, I.PARAMS_UTM, '123456');
  ok(d1 === `${LIENS.appStore}?pt=123456&ct=installer-continu&mt=8`, 'campagne des pubs → pt, ct = utm_campaign, mt=8', d1);
  const long = 'campagne-de-test-au-nom-beaucoup-trop-long';
  const d2 = I.destinationInstallation(IPHONE, `?utm_campaign=${long}`, liens, I.PARAMS_UTM, '123456');
  ok(ctDe(d2) === long.slice(0, 30), 'utm_campaign de 42 caractères → ct coupé à 30 (Apple refuse au-delà)', ctDe(d2));
  const bord = `${'a'.repeat(29)} b`;
  const d3 = I.destinationInstallation(IPHONE, `?utm_campaign=${encodeURIComponent(bord)}`, liens, I.PARAMS_UTM, '123456');
  ok(ctDe(d3) === 'a'.repeat(29), 'la coupe à 30 ne laisse jamais une espace en dernier caractère', JSON.stringify(ctDe(d3)));
  ok(I.destinationInstallation(IPHONE, RECH, liens, I.PARAMS_UTM, '12 3"><x') === `${LIENS.appStore}?pt=123&ct=installer-continu&mt=8`,
    'pt : chiffres seuls (le jeton fournisseur est un nombre)');
  ok(I.destinationInstallation(IPHONE, RECH, liens, I.PARAMS_UTM, null) === LIENS.appStore, 'pt inconnu (aujourd’hui) → lien simple, aucun ct');
  ok(I.APP_STORE_PT === null, 'APP_STORE_PT reste null tant que Nico ne l’a pas lu dans App Store Connect (il ne se fabrique pas)');
}

console.log('\nB. Android : le referrer que Google Play rend est celui de /installer, lu sans rien d’autre');
const A = await importer('src/utils/acquisition.js');
if (A.lireReferrerPlay && I.destinationInstallation) {
  const d = I.destinationInstallation(ANDROID, RECH, liens, I.PARAMS_UTM, null);
  // Google Play rend la valeur du paramètre `referrer`, décodée une fois (ce que getInstallReferrer() renvoie).
  const rendu = decodeURIComponent(String(d).split('&referrer=')[1] ?? '');
  ok(JSON.stringify(A.lireReferrerPlay(rendu)) === JSON.stringify({ source: 'meta', medium: 'paid', campaign: 'installer-continu', content: 'V1-podcast' }),
    'chaîne complète : lien des pubs → /installer → Google Play → app = meta / paid / installer-continu / V1-podcast', JSON.stringify(A.lireReferrerPlay(rendu)));
  ok(A.lireReferrerPlay(encodeURIComponent(rendu))?.source === 'meta', 'referrer encore encodé une fois (utm_source%3D…) → lu pareil');
  ok(A.lireReferrerPlay('utm_source=google-play&utm_medium=organic') === null, 'installation organique (google-play / organic) → aucune campagne');
  ok(A.lireReferrerPlay('utm_source=(not%20set)&utm_medium=(not%20set)') === null, '« (not set) » → aucune campagne');
  ok(A.lireReferrerPlay('gclid=Cj0KCQ') === null && A.lireReferrerPlay('') === null && A.lireReferrerPlay(null) === null && A.lireReferrerPlay(42) === null,
    'sans utm_source, vide, absent ou pas une chaîne → null');
  const sale = A.lireReferrerPlay(`utm_source=meta&utm_campaign=${'a'.repeat(150)}%22%3E%3Cscript%3E&email=x%40y.fr&fbclid=IwAR&utm_term=t`);
  ok(sale && sale.campaign === 'a'.repeat(100) && !('email' in sale) && !('fbclid' in sale) && !('term' in sale) && Object.keys(sale).length === 4,
    'valeurs nettoyées et bornées à 100, et seuls source / medium / campaign / content sortent', JSON.stringify(sale));
  ok(A.lireReferrerPlay('utm_source=meta&utm_source=autre')?.source === 'meta', 'premier utm_source gagne');
}

console.log('\nC. INACTIF : sans binaire qui porte le module, rien n’est lu, aucun appel natif');
if ('PLAY_REFERRER_BINAIRE_MIN' in A && A.enrichirSourceAndroid && A.referrerPlayOuvert) {
  ok(A.PLAY_REFERRER_BINAIRE_MIN === null, 'PLAY_REFERRER_BINAIRE_MIN = null (aucun binaire n’a le module InstallReferrer)');
  ok(A.referrerPlayOuvert({ plateforme: 'android', binaire: '99.9.999' }) === false, 'fermé quel que soit le binaire');
  const defaut = { source: 'app_android', medium: 'store', referrer: null, at: '2026-11-14T08:00:00.000Z' };
  poser(defaut);
  let lus = 0, binaires = 0, dispo = 0;
  const r = await A.enrichirSourceAndroid({ plateforme: 'android', binaire: async () => { binaires++; return '99.9.999'; }, disponible: () => { dispo++; return true; }, lire: async () => { lus++; return { etat: 'ok', referrer: 'utm_source=meta' }; } });
  ok(r === null && lus === 0 && binaires === 0 && dispo === 0, 'aucune lecture du binaire, du module, ni du referrer', JSON.stringify({ r, lus, binaires, dispo }));
  ok(JSON.stringify(acq()) === JSON.stringify(defaut), 'la source mémorisée reste « app_android / store », octet pour octet');
} else ok(false, 'PLAY_REFERRER_BINAIRE_MIN, referrerPlayOuvert, enrichirSourceAndroid exportés par src/utils/acquisition.js');

console.log('\nD. Borne ouverte (injectée) : une seule lecture, la première source gagne, jamais une exception');
if (A.enrichirSourceAndroid) {
  const MIN = '2.9.200';
  const AT = '2026-11-14T08:00:00.000Z';
  const defaut = () => ({ source: 'app_android', medium: 'store', referrer: null, at: AT });
  const META = 'utm_source=meta&utm_medium=paid&utm_campaign=installer-continu&utm_content=V2-maman';
  const faux = (rep) => { const f = { n: 0 }; f.lire = async () => { f.n++; return typeof rep === 'function' ? rep(f.n) : rep; }; return f; };
  const ouvrir = (f, o = {}) => A.enrichirSourceAndroid({ plateforme: 'android', binaire: async () => o.binaire ?? '2.9.200', disponible: () => o.disponible ?? true, lire: f.lire, min: MIN, delaiMs: o.delaiMs ?? 200 });

  ok(A.referrerPlayOuvert({ plateforme: 'android', binaire: '2.9.1000', min: MIN }) === true && A.referrerPlayOuvert({ plateforme: 'android', binaire: '2.9.99', min: MIN }) === false
    && A.referrerPlayOuvert({ plateforme: 'ios', binaire: '9.9.9', min: MIN }) === false && A.referrerPlayOuvert({ plateforme: 'android', binaire: null, min: MIN }) === false,
    'comparaison numérique (2.9.1000 ≥ 2.9.200 > 2.9.99), Android seul, binaire illisible = fermé');

  poser(defaut()); let f = faux({ etat: 'ok', referrer: META });
  await ouvrir(f, { binaire: '2.9.199' });
  ok(f.n === 0 && acq().source === 'app_android', 'binaire 2.9.199 < borne → aucune lecture');
  await ouvrir(f, { disponible: false });
  ok(f.n === 0 && acq().source === 'app_android', 'module absent du binaire (isPluginAvailable faux) → aucune lecture');

  await ouvrir(f);
  const a = acq();
  ok(f.n === 1 && a.source === 'meta' && a.medium === 'paid' && a.campaign === 'installer-continu' && a.content === 'V2-maman',
    'Android installé depuis la pub → meta / paid / installer-continu / V2-maman', JSON.stringify(a));
  ok(a.plateforme === 'android' && a.referrer === 'https://play.google.com' && a.at === AT && a.play === 'campagne' && !('fbclid' in a),
    'plateforme android, referrer = Google Play, date de capture d’origine GARDÉE (garde « capture avant le compte »)', JSON.stringify(a));
  await ouvrir(f);
  ok(f.n === 1, 'deuxième lancement → plus aucune lecture (Google : « invoke the API only once »)');

  const web = { source: 'meta', medium: 'paid', campaign: 'installer-continu', content: 'V3-revendeur', referrer: null, at: AT };
  poser(web); f = faux({ etat: 'ok', referrer: 'utm_source=autre' });
  await ouvrir(f);
  ok(f.n === 0 && JSON.stringify(acq()) === JSON.stringify(web), 'source déjà relevée ailleurs (site, autre lien) → jamais lue ni touchée : la première source gagne');
  poser(null); await ouvrir(f);
  ok(f.n === 0 && acq() === null, 'aucune source mémorisée → rien n’est écrit (capterSource écrit le premier)');
  poser(defaut());
  const ios = faux({ etat: 'ok', referrer: META });
  await A.enrichirSourceAndroid({ plateforme: 'ios', binaire: async () => '9.9.9', disponible: () => true, lire: ios.lire, min: MIN });
  ok(ios.n === 0, 'iPhone → jamais (pas de referrer App Store)');

  poser(defaut()); f = faux({ etat: 'ok', referrer: 'utm_source=google-play&utm_medium=organic' });
  await ouvrir(f);
  ok(acq().source === 'app_android' && acq().medium === 'store' && acq().play === 'organique' && !acq().plateforme, 'organique → reste « app_android / store », marqué lu');
  await ouvrir(f);
  ok(f.n === 1, 'organique : lu une fois seulement');

  poser(defaut()); f = faux({ etat: 'indisponible' });
  await ouvrir(f); await ouvrir(f);
  ok(f.n === 1 && acq().play === 'indisponible' && acq().source === 'app_android', 'Play Store sans l’API (FEATURE_NOT_SUPPORTED) → une lecture, marqué, source intacte');

  poser(defaut()); f = faux({ etat: 'reessayer' });
  let leve = false;
  try { for (let i = 0; i < 5; i++) await ouvrir(f); } catch { leve = true; }
  ok(!leve && f.n === 3 && acq().play === 'echec' && acq().source === 'app_android', 'service indisponible : 3 essais au plus (un par lancement), puis « echec » ; jamais une exception', JSON.stringify({ n: f.n, a: acq() }));

  poser(defaut()); f = faux(() => new Promise(() => {}));
  const t0 = Date.now(); await ouvrir(f, { delaiMs: 80 });
  ok(Date.now() - t0 < 1500 && acq().play_essais === 1 && acq().source === 'app_android', 'module muet → borné par le délai, compté comme un essai');
  poser(defaut()); f = { n: 0, lire: async () => { f.n++; throw new Error('not implemented on android'); } };
  leve = false; try { await ouvrir(f); } catch { leve = true; }
  ok(!leve && acq().play_essais === 1, 'module qui lève → avalé, compté comme un essai');
  poser(defaut()); f = faux({ etat: 'ok', referrer: 'utm_source=meta&utm_medium=paid' });
  stock.set('fs_acq', '{pas du json');
  leve = false; try { await ouvrir(f); } catch { leve = true; }
  ok(!leve && f.n === 0, 'source mémorisée illisible → rien n’est lu ni écrit');
}

console.log('\nE. La pose sur le profil : p_plateforme sur le seul chemin Google Play, repli à 7 paramètres');
if (A.poserSourceSurProfil && A.enrichirSourceAndroid) {
  const fauxSb = (reponses) => { const appels = []; return { appels, rpc: async (nom, args) => { appels.push({ nom, args }); return reponses[appels.length - 1] ?? { error: null }; } }; };
  const cree = new Date(Date.now() - 3600e3).toISOString();
  const AT = new Date(Date.now() - 2 * 3600e3).toISOString();
  poser({ source: 'meta', medium: 'paid', campaign: 'installer-continu', content: 'V4-cloud', referrer: 'https://play.google.com', at: AT, plateforme: 'android', play: 'campagne' });
  let sb = fauxSb([]);
  await A.poserSourceSurProfil(sb, 'uid-a', { createdAt: cree });
  const x = sb.appels[0]?.args ?? {};
  ok(sb.appels.length === 1 && x.p_plateforme === 'android' && x.p_source === 'meta' && x.p_campaign === 'installer-continu' && x.p_content === 'V4-cloud'
    && x.p_referrer === 'https://play.google.com' && x.p_captee_le === AT && Object.keys(x).length === 8, 'Android venu de la pub → 8 paramètres, p_plateforme = android', JSON.stringify(sb.appels));
  sb = fauxSb([{ error: { code: 'PGRST202', message: 'Could not find the function public.poser_origine_inscription(p_campaign, …, p_plateforme, …) in the schema cache' } }]);
  await A.poserSourceSurProfil(sb, 'uid-a', { createdAt: cree });
  ok(sb.appels.length === 2 && Object.keys(sb.appels[1].args).length === 7 && !('p_plateforme' in sb.appels[1].args) && sb.appels[1].args.p_source === 'meta',
    'base sans la migration (PGRST202) → rejoué UNE fois à 7 paramètres : la source arrive quand même', JSON.stringify(sb.appels.map((a) => Object.keys(a.args).length)));
  sb = fauxSb([{ error: { code: '42501', message: 'permission denied' } }]);
  const warn = console.warn; console.warn = () => {};
  await A.poserSourceSurProfil(sb, 'uid-a', { createdAt: cree });
  console.warn = warn;
  ok(sb.appels.length === 1, 'une autre erreur → aucun rejeu');
  poser({ source: 'meta', medium: 'paid', campaign: 'installer-continu', content: 'V1-podcast', referrer: null, at: AT });
  sb = fauxSb([]);
  await A.poserSourceSurProfil(sb, 'uid-b', { createdAt: cree });
  ok(sb.appels.length === 1 && Object.keys(sb.appels[0].args).length === 7 && !('p_plateforme' in sb.appels[0].args), 'web (ordinateur depuis /installer) et iPhone → l’appel d’aujourd’hui, 7 paramètres');

  // La pose attend une lecture Google Play en cours (bornée) : un compte créé dans la foulée part avec la bonne source.
  poser({ source: 'app_android', medium: 'store', referrer: null, at: AT });
  let lache;
  const enCours = A.enrichirSourceAndroid({ plateforme: 'android', binaire: async () => '2.9.300', disponible: () => true, min: '2.9.200', delaiMs: 2000,
    lire: () => new Promise((r) => { lache = () => r({ etat: 'ok', referrer: 'utm_source=meta&utm_medium=paid&utm_campaign=installer-continu' }); }) });
  sb = fauxSb([]);
  const pose = A.poserSourceSurProfil(sb, 'uid-c', { createdAt: cree });
  await new Promise((r) => setTimeout(r, 30));
  lache?.();
  await Promise.all([enCours, pose]);
  ok(sb.appels[0]?.args?.p_source === 'meta' && sb.appels[0]?.args?.p_plateforme === 'android', 'la pose attend la lecture Google Play en cours (bornée par son délai)', JSON.stringify(sb.appels));
}

console.log('\nF. Le module natif Android (prochain binaire), branché sans jamais passer nu dans une promesse');
// (14/11, intégration) Le module natif attend l'accord de Nico pour le prochain binaire Android : il est gardé dans
// docs/enquetes/zero-friction-1411/en-attente/referrer-play-android.patch. Tant qu'il n'est pas posé dans android/, la
// borne reste FERMÉE (rien n'appelle un module absent) ; posé, ses contrôles d'origine s'appliquent.
const java = lire('android/app/src/main/java/app/fillsell/app/InstallReferrerPlugin.java');
if (!java) {
  ok(/export const PLAY_REFERRER_BINAIRE_MIN = null;/.test(lire('src/utils/acquisition.js')), 'module natif en attente (hors android/) : la borne reste fermée');
  ok(/registerPlugin\(InstallReferrerPlugin\.class\)/.test(lire('docs/enquetes/zero-friction-1411/en-attente/referrer-play-android.patch')), 'le module natif est gardé, prêt pour le prochain binaire (patch en attente)');
} else {
ok(/@CapacitorPlugin\(name = "InstallReferrer"\)/.test(java) && /@PluginMethod\s+public void lire\(final PluginCall call\)/.test(java), 'plugin « InstallReferrer », méthode lire');
ok(/InstallReferrerClient\.newBuilder\(getContext\(\)\)\.build\(\)/.test(java) && /startConnection\(/.test(java) && /getInstallReferrer\(\)/.test(java) && /endConnection\(\)/.test(java),
  'l’API officielle : newBuilder → startConnection → getInstallReferrer → endConnection');
ok(/FEATURE_NOT_SUPPORTED[\s\S]{0,120}"indisponible"/.test(java) && /"reessayer"/.test(java) && !/call\.reject\(/.test(java) && /compareAndSet\(false, true\)/.test(java),
  'toujours résolu (ok / indisponible / reessayer), jamais rejeté, une seule fois');
const main = lire('android/app/src/main/java/app/fillsell/app/MainActivity.java');
ok(/registerPlugin\(InstallReferrerPlugin\.class\);\s*super\.onCreate\(savedInstanceState\);/.test(main), 'MainActivity l’enregistre AVANT super.onCreate (règle Capacitor)');
ok(/implementation "com\.android\.installreferrer:installreferrer:2\.2"/.test(lire('android/app/build.gradle')), 'dépendance com.android.installreferrer:installreferrer:2.2');
}
const rp = lire('src/lib/referrerPlay.js');
ok(/registerPlugin\('InstallReferrer'\)/.test(rp) && /InstallReferrer\.lire\(\)/.test(rp) && /isPluginAvailable\('InstallReferrer'\)/.test(rp) && /getPlatform\(\) !== 'android'/.test(rp),
  'src/lib/referrerPlay.js : même nom, même méthode, Android seul, module présent seulement');
ok(rp && !/return InstallReferrer\b(?!\.)/.test(rp) && !/=>\s*InstallReferrer\b(?!\.)/.test(rp) && !/resolve\(InstallReferrer\b(?!\.)/.test(rp),
  'le module (un Proxy) n’est jamais rendu par une promesse (« then() is not implemented »)');
ok(/import \{ lancerLectureReferrerPlay \} from "\.\.\/lib\/referrerPlay"/.test(lire('src/router/AppRouter.jsx'))
  && /capterSource\(\{ plateforme: isNative \? Capacitor\.getPlatform\(\) : null \}\);\s*if \(isNative\) lancerLectureReferrerPlay\(\);/.test(lire('src/router/AppRouter.jsx')),
  'AppRouter : la lecture part juste après capterSource, sur natif seulement');
ok(!/@capacitor/.test(lire('src/utils/acquisition.js')), 'acquisition.js reste sans Capacitor (il est aussi dans le script en ligne du site)');

console.log('\nG. La plateforme d’inscription en base : migration PRÉPARÉE, NON appliquée, avec son inverse');
const nomMig = fs.readdirSync(join(ROOT, 'supabase/migrations')).find((f) => /^20261114\d{6}_origine_plateforme_inscription\.sql$/.test(f)) ?? '';
const mig = nomMig ? lire(`supabase/migrations/${nomMig}`) : '';
const inv = nomMig ? lire(`supabase/rollbacks/${nomMig.replace(/\.sql$/, '_INVERSE.sql')}`) : '';
ok(Boolean(mig) && /NON APPLIQUÉE/.test(mig), `migration ${nomMig || '20261114……_origine_plateforme_inscription.sql'} présente, marquée NON APPLIQUÉE`);
ok(/ADD COLUMN IF NOT EXISTS acquisition_plateforme text/.test(mig) && /CHECK \(acquisition_plateforme IN \('ios', 'android', 'web'\)\)/.test(mig), 'colonne acquisition_plateforme (ios / android / web)');
ok(['0915de0d5fa3e33176a2bbe05729ba9a', 'aec47bda23057b6eb38751b4854d35ff', '0fa3e0d510e18fc4ec776622571c9d85', '04b03db9afbfe7bb60bfec9340a2e906'].every((m) => mig.includes(m)) && /ON S''ARRÊTE/.test(mig),
  'garde : les 3 fonctions et la vue de la prod (md5 lus le 14/11), sinon on s’arrête');
ok(/NEW\.acquisition_plateforme\s*:= OLD\.acquisition_plateforme;/.test(mig), 'immuable : la plateforme se verrouille avec le reste');
ok(/DROP FUNCTION IF EXISTS public\.poser_origine_inscription\(text, text, text, text, text, text, timestamptz\);/.test(mig)
  && /p_plateforme text DEFAULT NULL/.test(mig) && /AND acquisition_captured_at IS NULL;/.test(mig)
  && /GRANT EXECUTE ON FUNCTION public\.poser_origine_inscription\(text, text, text, text, text, text, timestamptz, text\) TO authenticated, service_role;/.test(mig)
  && /REVOKE ALL ON FUNCTION public\.poser_origine_inscription\(text, text, text, text, text, text, timestamptz, text\) FROM PUBLIC, anon;/.test(mig),
  'RPC à 8 paramètres (le 8e par défaut : l’app d’aujourd’hui garde son appel), une seule pose, jamais anon');
ok((mig.match(/coalesce\((OLD|p)\.acquisition_plateforme,/g) ?? []).length === 2, 'archive et vue : coalesce(acquisition_plateforme, règle d’avant)');
ok(/DROP COLUMN IF EXISTS acquisition_plateforme/.test(inv) && /poser_origine_inscription\(\s*p_source\s+text,[\s\S]*p_captee_le timestamptz\s*\) RETURNS boolean/.test(inv)
  && /DROP FUNCTION IF EXISTS public\.poser_origine_inscription\(text, text, text, text, text, text, timestamptz, text\);/.test(inv), 'inverse : la RPC à 7 paramètres revient, la colonne part');
ok(fs.existsSync(join(ROOT, `scripts/essais/${nomMig.slice(0, 14)}_banc.mjs`)), 'banc sur Postgres jetable présent (scripts/essais/<version>_banc.mjs)');

console.log('\nH. Verrou d’ouverture : la borne ne s’ouvre pas sans la politique de confidentialité');
const legal = lire('src/pages/Legal.jsx');
const ouvert = A.PLAY_REFERRER_BINAIRE_MIN != null;
ok(!ouvert || ((legal.match(/Google Play/g) ?? []).length >= 2 && /source d'acquisition[\s\S]{0,600}Google Play/.test(legal)),
  ouvert ? 'borne ouverte : Legal.jsx nomme Google Play dans le paragraphe de la source d’acquisition (fr + en)' : 'borne fermée : rien à dire de plus dans Legal.jsx (le jour où elle s’ouvre, ce test l’exige)');

console.log(`\n${rouges === 0 ? '✓' : '✗'} acquisition-meta : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
