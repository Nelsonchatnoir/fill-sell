// selftest:mentions-abonnement — (05/11 soir, lot « Ouverture du Cloud », phase 2, décision l de Nico) l'écran d'achat
// d'un abonnement à renouvellement automatique dit qu'il se renouvelle, où il est prélevé, comment l'arrêter, et porte
// des liens qui marchent : conditions d'utilisation (EULA d'Apple sur iOS), conditions générales, confidentialité.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mentionsAbonnement, EULA_APPLE } from '../src/utils/mentionsAbonnement.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const ios = mentionsAbonnement({ canal: 'ios', lang: 'fr', cloud: true });
ok(/renouvellement automatique/.test(ios.texte) && /compte Apple/.test(ios.texte) && /24 h avant/.test(ios.texte), 'iOS FR : renouvellement automatique, compte Apple, résiliation 24 h avant');
ok(/Réglages › ton nom › Abonnements/.test(ios.texte), 'iOS FR : où l’arrêter');
ok(/7 jours d'essai gratuit/.test(ios.texte) && /24,99 € par mois/.test(ios.texte), 'Cloud montré : essai de 7 jours puis 24,99 € par mois');
ok(ios.liens.map((l) => l.cle).join(',') === 'eula,cgu,confidentialite', 'iOS : EULA, conditions générales, confidentialité');
ok(ios.liens[0].url === EULA_APPLE && EULA_APPLE === 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', 'iOS : l’EULA type d’Apple (le contrat choisi dans App Store Connect)');
ok(ios.liens[1].url === 'https://fillsell.app/legal#cgu' && ios.liens[2].url === 'https://fillsell.app/legal#confidentialite', 'FR : pages françaises');

const iosEn = mentionsAbonnement({ canal: 'ios', lang: 'en', cloud: true });
ok(/Auto-renewing subscriptions/.test(iosEn.texte) && /Apple Account/.test(iosEn.texte) && /Settings › your name › Subscriptions/.test(iosEn.texte), 'iOS EN');
ok(iosEn.liens[1].url === 'https://fillsell.app/legal?lang=en#cgu' && iosEn.liens[2].url === 'https://fillsell.app/legal?lang=en#confidentialite', 'EN : pages en anglais');
ok(!/[àéèêç]/i.test(iosEn.texte.replace(/24,99 €/, '')) && !/Conditions|Réglages|compte/.test(iosEn.texte), 'EN : aucun mot de français');
// (07/11, décision de Nico) Montants en anglais au format anglais : « €24.99 », jamais « 24,99 € ».
ok(/then €24\.99 a month\./.test(iosEn.texte) && !/24,99/.test(iosEn.texte), 'EN : le prix du Cloud à l’anglaise (« then €24.99 a month »)');
ok(/FillSell Cloud: €24\.99 a month\./.test(mentionsAbonnement({ canal: 'web', lang: 'en', cloud: true, essaiCloud: false }).texte), 'EN, essai déjà pris : « FillSell Cloud: €24.99 a month. »');

const android = mentionsAbonnement({ canal: 'android', lang: 'fr' });
ok(/compte Google Play/.test(android.texte) && /Play Store › Paiements et abonnements/.test(android.texte), 'Android : Google Play');
ok(android.liens.map((l) => l.cle).join(',') === 'cgu,confidentialite', 'Android : pas d’EULA d’Apple');
ok(!/FillSell Cloud/.test(android.texte), 'Cloud non montré : pas de ligne Cloud');
const web = mentionsAbonnement({ canal: 'web', lang: 'fr', cloud: true, essaiCloud: false });
ok(/ta carte/.test(web.texte) && /Réglages › Abonnement dans FillSell/.test(web.texte), 'web : carte, arrêt dans les réglages de FillSell');
ok(/FillSell Cloud : 24,99 € par mois\./.test(web.texte) && !/essai/.test(web.texte), 'essai déjà pris : pas d’essai promis');

// Câblage : les deux écrans d'où part un achat d'abonnement.
const modale = lire('src/components/ConversionModal.jsx');
ok(/import MentionsAbonnement from '\.\/MentionsAbonnement';/.test(modale) && /<MentionsAbonnement lang=\{fr \? 'fr' : 'en'\} cloud=\{Boolean\(offreCloud\)\}/.test(modale), 'la feuille des formules porte les mentions (et la ligne Cloud quand l’offre est montrée)');
const etape = lire('src/entree/EtapeCloud.jsx');
ok(/<MentionsAbonnement lang=\{c\.lang === 'en' \? 'en' : 'fr'\} cloud \/>/.test(etape), 'l’étape Cloud du parcours d’entrée aussi');
const comp = lire('src/components/MentionsAbonnement.jsx');
ok(/ouvrirLien\(l\.url\)/.test(comp) && /target="_blank"/.test(comp), 'liens ouverts dans le navigateur du système (natif) ou un nouvel onglet (web)');

console.log(`✓ selftest:mentions-abonnement — ${n} assertions`);
