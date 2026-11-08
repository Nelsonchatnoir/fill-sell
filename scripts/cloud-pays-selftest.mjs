// selftest:cloud-pays — (05/11 soir, lot « Ouverture du Cloud », PHASE 3 point 3, ordre de Nico corrigé à 21:44) le
// Cloud ne se VEND qu'en France : un vendeur étranger ne passe jamais par une IP française. Les témoins (Nico, comptes
// de relecture) le voient partout ; un compte qui a déjà le Cloud garde ses écrans (état, connexion, arrêt) où qu'il soit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cloudVendableDansLePays, paysDuTelephoneCloud, PAYS_CLOUD_OUVERTS, CLOUD_BINAIRE_MIN, comparerVersions, binairePorteLeCloud,
  noterBinaireCloud, cloudOffreVendable, cloudOfferVisible, _binaireCloudAZero } from '../src/config/cloudOffer.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 1. La règle.
ok(JSON.stringify(PAYS_CLOUD_OUVERTS) === '["FR"]', 'un seul pays ouvert : la France');
ok(cloudVendableDansLePays({ ouvert: true, pays: 'FR' }) === true, 'offre ouverte, téléphone en France : vendu');
ok(cloudVendableDansLePays({ ouvert: true, pays: 'BE' }) === false && cloudVendableDansLePays({ ouvert: true, pays: 'US' }) === false
  && cloudVendableDansLePays({ ouvert: true, pays: 'GB' }) === false, 'Belgique, États-Unis, Royaume-Uni : jamais vendu (pas d’IP française pour un étranger)');
ok(cloudVendableDansLePays({ ouvert: true, pays: null }) === false, 'pays inconnu : pas la France, rien de vendu');
ok(cloudVendableDansLePays({ ouvert: false, pays: 'FR' }) === false, 'offre fermée (drapeau baissé) : rien, même en France');
ok(cloudVendableDansLePays({ temoin: true, ouvert: false, pays: 'US' }) === true, 'témoin (relecteur Apple aux États-Unis) : vendu partout, même drapeau baissé');

// 2. Le pays du téléphone.
ok(paysDuTelephoneCloud('Europe/Paris') === 'FR', 'Europe/Paris = France');
ok(paysDuTelephoneCloud('Europe/Brussels') === null && paysDuTelephoneCloud('America/New_York') === null && paysDuTelephoneCloud('Europe/London') === null,
  'Bruxelles, New York, Londres : pas de pays Cloud');
ok(paysDuTelephoneCloud('Europe/Monaco') === null, 'Monaco n’est pas la France (strict)');
ok(paysDuTelephoneCloud(null) === null && paysDuTelephoneCloud('') === null, 'fuseau illisible : null');

// 3. Câblage : la VENTE passe par cloudOffreVendable ; l'état, la connexion, l'arrêt et la reprise restent ouverts.
const app = lire('src/App.jsx');
ok(/if\(!achatCloud\|\|!cloudOffreVendable\(user\?\.id\)\)return;/.test(app), 'App : l’achat du Cloud (lancerAchatCloud) est borné au pays');
ok(/opts\?\.cloud===true&&cloudOffreVendable\(user\?\.id\)/.test(app) && /onCloudSeul=\{cloudOffreVendable\(user\?\.id\)\?/.test(app)
  && /onAjouterCloud=\{cloudOffreVendable\(user\?\.id\)\?/.test(app) && /essaiCloud=\{cloudOffreVendable\(user\.id\)&&achatCloud\?/.test(app),
  'App : formule + Cloud, Cloud seul, ajout, essai du parcours d’entrée — bornés');
ok(/\.\.\.\(cloudOfferVisible\(user\.id\)&&achatCloud\?\{\s*essayer:/.test(app) && /arreter:async\((opts)?\)=>/.test(app), // (07/11 soir) le geste reçoit { canal } de l'écran
  'App : l’arrêt et la reprise restent ouverts à un compte qui a le Cloud, où qu’il soit');
ok(/const cloudVisible = cloudOffreVendable\(userId\);/.test(lire('src/components/ConversionModal.jsx')), 'feuille des formules : offre bornée');
ok(/cloudOffreVendable\(userId\)\);/.test(lire('src/entree/useCloudEntree.js')), 'parcours d’entrée : voie Cloud bornée');
ok(/const visible = cloudOffreVendable\(userId\);/.test(lire('src/cloud/VoieSansOrdinateur.jsx')), '2e voie : bornée');
ok(/const optionSansOrdi = cloudOffreVendable\(userId\);/.test(lire('src/components/ExtensionPitchScreen.jsx')), 'écran de l’extension : option bornée');
ok(/const visible = cloudOfferVisible\(userId\);/.test(lire('src/cloud/HoteCloud.jsx')), 'HoteCloud (fin d’essai, état) : inchangé');

// 4. (08/11/2026, jour J) Dans l'app, le Cloud ne se vend qu'à partir du binaire relu avec lui (2.9.164) : Android
//    2.9.10 et iPhone 2.8 n'ont pas le module de notifications (la liste d'attente en promet une) — offre masquée,
//    allumée seule au binaire 2.9.164. Web : sans objet. Un client Cloud garde ses écrans partout.
ok(CLOUD_BINAIRE_MIN === '2.9.164', 'binaire minimal du Cloud : 2.9.164 (Apple 2611071917, Google vc36)');
ok(comparerVersions('2.9.10', '2.9.164') < 0 && comparerVersions('2.8', '2.9.164') < 0 && comparerVersions('2.9.164', '2.9.164') === 0
  && comparerVersions('2.9.165', '2.9.164') > 0 && comparerVersions('2.10', '2.9.164') > 0 && comparerVersions('3.0.0', '2.9.164') > 0,
  'versions comparées segment par segment (2.9.10 < 2.9.164, jamais en texte)');
ok(comparerVersions(null, '2.9.164') === -1 && comparerVersions('', '2.9.164') === -1 && comparerVersions('2.9.x', '2.9.164') === -1, 'version illisible : en dessous');
ok(binairePorteLeCloud('web') === true && binairePorteLeCloud('2.9.164') === true && binairePorteLeCloud('2.9.200') === true, 'web, 2.9.164 et au-dessus : le binaire porte le Cloud');
ok(binairePorteLeCloud('2.9.10') === false && binairePorteLeCloud('2.8') === false && binairePorteLeCloud('2.9.161') === false
  && binairePorteLeCloud(null) === false && binairePorteLeCloud(undefined) === false, 'Android 2.9.10, iPhone 2.8, 2.9.161, binaire pas encore lu : non');
ok(cloudVendableDansLePays({ ouvert: true, pays: 'FR', binaire: false }) === false, 'offre ouverte en France, vieux binaire : rien de vendu');
ok(cloudVendableDansLePays({ temoin: true, ouvert: false, pays: 'US', binaire: false }) === true, 'témoin : vendu même sur un vieux binaire (relecteurs, Nico)');
_binaireCloudAZero(null);
ok(cloudOffreVendable('u-ordinaire', 'Europe/Paris') === false, 'binaire pas encore lu : rien de vendu (fermé par défaut)');
ok(await noterBinaireCloud(Promise.reject(new Error('getInfo'))) === null, 'lecture du binaire en échec : null, jamais d’exception');
ok(await noterBinaireCloud(Promise.resolve('2.9.10')) === '2.9.10' && cloudOfferVisible('u-ordinaire') === false, 'binaire lu (promesse) : noté');
_binaireCloudAZero(null);
// Câblage : App.jsx lit le binaire au chargement (natif : App.getInfo ; web : 'web') et se redessine à son arrivée.
ok(/const binaireCloudLu=noterBinaireCloud\(Capacitor\.isNativePlatform\(\)\?CapacitorApp\.getInfo\(\)\.then\(\(i\)=>i\?\.version\?\?null\):'web'\);/.test(app),
  'App : le binaire est lu une fois au chargement (natif : getInfo().version ; web : sans objet)');
ok(/binaireCloudLu\.then\(\(\)=>\{if\(!mort\)setInterrupteursLus\(\(n\)=>n\+1\);\}\)/.test(app), 'App : l’app se redessine quand le binaire est lu');

console.log(`✓ selftest:cloud-pays — ${n} assertions`);
