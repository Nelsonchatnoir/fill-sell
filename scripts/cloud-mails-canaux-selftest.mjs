// Autotest des MAILS FillSell Cloud, MAIL × CANAL (07/11/2026 soir, essai bac à sable Apple de Nico).
//
//     npm run selftest:cloud-mails-canaux   (node scripts/cloud-mails-canaux-selftest.mjs)
//
// Constat de Nico (07/11 19:11, compte de test Nicotest, Cloud pris seul dans l'App Store) : le mail de la veille
// disait l'ancien prix écrit en dur, « prélevés sur la carte que tu as enregistrée » (faux chez Apple), « l'arrêt est
// immédiat et rien n'est facturé » (promesse qu'une boutique seule peut tenir) et « l'option Sans ordinateur ».
// Ce test prouve, sans réseau ni base ni envoi :
//   0. l'inventaire : les seuls mails CLIENT du Cloud sont le rappel de la veille (email-tunnel, tous canaux) et le
//      paiement échoué (email-tunnel ← stripe-webhook, Stripe seulement) ; Apple et Google n'en déclenchent aucun
//      autre ; l'arrêt du Cloud n'envoie aucun mail (constat, à décider) ;
//   1. la lecture du prix À LA SOURCE (_shared/cloud-prix.js) : abonnement Stripe, renouvellement signé d'Apple (jamais
//      le prix 0 de la transaction d'essai), subscriptionsv2 de Google ; tout doute → muette (aucun montant) ;
//   2. CHAQUE aperçu de scripts/apercu/mails-cloud.mjs (le vrai code : lecture, texte, gabarit), nourri par des
//      sources aux montants inhabituels : le mail écrit le montant de SA source et aucun autre ; source muette →
//      aucun montant ; le prélèvement et l'arrêt dépendent du canal (carte enregistrée pour Stripe seulement ;
//      Apple / Google Play prélèvent et résilient, lien direct vers leurs abonnements) ; aucun « rien n'est
//      facturé » ; le nom « FillSell Cloud », jamais « option » ni « Sans ordinateur » ;
//   3. aucun montant écrit en dur dans le code des mails (hors commentaires) ;
//   4. email-tunnel : lit cloud_canal / cloud_ref, le prix à la source avant l'envoi, ne rappelle pas un abonnement
//      qui ne se renouvelle pas, met en page par mailRappelVeilleCloud ;
//   5. témoins : le texte en service en prod (email-tunnel déployé le 29/10, d'avant c3a4aff) et celui d'avant ce
//      correctif sont ATTRAPÉS par ces mêmes contrôles.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  APPLE_API_BAC_A_SABLE, APPLE_API_PRODUCTION, SOURCES, charge, formatPrix, lirePrixCloud, prixDepuisAppleRenouvellement,
  prixDepuisAppleStatuts, prixDepuisGoogle, prixDepuisStripe, prixValide,
} from '../supabase/functions/_shared/cloud-prix.js';
import {
  LIEN_ABONNEMENTS_APPLE, LIEN_ABONNEMENTS_GOOGLE, LIEN_APP, texteRappel,
} from '../supabase/functions/_shared/cloud-rappel-veille.js';
import { PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE } from '../supabase/functions/_shared/cloud-option.js';
import {
  CANAUX, FIN_ESSAI, REFS, depsFactices, jws, rendusMailsCloud, reponsesSources,
} from './apercu/mails-cloud.mjs';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, d = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 600)}` : ''}`); } };
const titre = (t) => console.log(`\n${t}`);
const net = (s) => String(s).replace(/[  ]/g, ' ');
const texteVisible = (html) => net(html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<head[\s\S]*?<\/head>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#847;|&zwnj;|&middot;/g, ' ').replace(/&#8594;|&rarr;/g, '→').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' '));
const liens = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, '&'));

// Les détecteurs — les mêmes pour les aperçus et pour les témoins.
const MONTANT = /\d+[,.]\d{2}\s?€|€\s?\d+(?:[.,]\d{1,2})?|\b\d+(?:[,.]\d{2})?\s?(?:EUR|euros?)\b/i;
const PROMESSE = /rien n'est factur|rien ne sera factur|nothing is charged|nothing will be charged|nothing gets charged/i;
const NOM_INTERDIT = /\boption\b|\badd-on\b|sans ordinateur|no computer/i;
const CARTE_FILLSELL = /carte que tu as enregistrée|card you saved/i;

// ═══ 0. L'inventaire des mails CLIENT du Cloud ═══════════════════════════════════════════════════════════════
titre('0. Les mails client du Cloud : le rappel de la veille (tous canaux), le paiement échoué (Stripe)');
{
  const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const f of ['apple-iap-webhook', 'google-play-webhook', 'validate-apple-receipt', 'validate-google-purchase']) {
    const code = sansCommentaires(lire(`supabase/functions/${f}/index.ts`));
    ok(!/signalerPaiementEchoue|envoyerEmail|renderEmail|mailRappelVeilleCloud|mailPaiementEchoue/.test(code),
      `${f} : aucun mail client (ni paiement échoué, ni rappel) — la boutique prévient elle-même`);
  }
  const wh = sansCommentaires(lire('supabase/functions/stripe-webhook/index.ts'));
  ok(/signalerPaiementEchoue\(/.test(wh) && !/envoyerEmail|renderEmail/.test(wh), 'stripe-webhook : le seul mail client qu’il déclenche est le paiement échoué (rendu par email-tunnel)');
  const cs = lire('supabase/functions/cancel-subscription/index.ts');
  const blocCloud = cs.slice(cs.indexOf('if (option === "cloud") {\n      if (!cloudVivant)'), cs.indexOf('let periodEnd'));
  ok(blocCloud.length > 200 && !/envoyerAccuseResiliation|envoyerEmail/.test(blocCloud),
    'cancel-subscription : arrêter le Cloud (Stripe) n’envoie AUCUN mail aujourd’hui — constat remonté à Nico (accusé de résiliation à décider)');
  const tunnel = lire('supabase/functions/email-tunnel/index.ts');
  ok(/mailRappelVeilleCloud\(/.test(tunnel) && /mailPaiementEchoue\(/.test(tunnel), 'email-tunnel rend les deux mails du Cloud (rappel de la veille, paiement échoué)');
  const autres = ['push-ventes', 'send-extension-link', 'envoi-ponctuel', 'support-mail', 'push-cloud-place']
    .filter((f) => /FillSell Cloud|cloud_essai|option: ?"cloud"|offre: ?'cloud'/.test(sansCommentaires(lire(`supabase/functions/${f}/index.ts`))));
  ok(autres.length === 0 || (autres.length === 1 && autres[0] === 'push-cloud-place'), 'aucune autre fonction n’écrit un mail du Cloud (push-cloud-place : une notification « place libre », sans prix)', autres.join(', '));
}

// ═══ 1. La lecture du prix à la source ═══════════════════════════════════════════════════════════════════════
titre('1. Le prix lu À LA SOURCE (Stripe, Apple, Google) — tout doute → aucun montant');
{
  const sub = (o = {}) => ({ id: 'sub_1', status: 'trialing', cancel_at_period_end: false, cancel_at: null, discount: null, discounts: [],
    items: { data: [{ quantity: 1, price: { unit_amount: 2349, currency: 'eur', recurring: { interval: 'month', interval_count: 1 } } }] }, ...o });
  ok(JSON.stringify(prixDepuisStripe(sub()).prix) === JSON.stringify({ montant: 23.49, devise: 'EUR' }) && prixDepuisStripe(sub()).renouvelle === true, 'Stripe : unit_amount 2349 eur → 23,49 EUR, renouvelle');
  ok(prixDepuisStripe(sub({ items: { data: [{ quantity: 2, price: { unit_amount: 2349, currency: 'eur', recurring: { interval: 'month' } } }] } })).prix.montant === 46.98, 'Stripe : quantité 2 → le total');
  ok(prixDepuisStripe(sub({ discount: { coupon: { percent_off: 50 } } })).prix === null, 'Stripe : une remise → muette (la facture ne serait pas « X par mois »)');
  ok(prixDepuisStripe(sub({ discounts: ['di_1'] })).prix === null, 'Stripe : discounts[] non vide → muette');
  ok(prixDepuisStripe(sub({ items: { data: [{ price: { unit_amount: 24990, currency: 'eur', recurring: { interval: 'year', interval_count: 1 } } }] } })).prix === null, 'Stripe : prix annuel → muette (jamais « par mois »)');
  ok(prixDepuisStripe(sub({ cancel_at_period_end: true })).renouvelle === false && prixDepuisStripe(sub({ status: 'canceled' })).renouvelle === false, 'Stripe : arrêt prévu / annulé → ne renouvelle pas');
  ok(prixDepuisStripe(sub({ items: { data: [{ price: { unit_amount: 3000, currency: 'jpy', recurring: { interval: 'month' } } }] } })).prix.montant === 3000, 'Stripe : devise sans décimale (JPY) lue telle quelle');
  ok(prixDepuisStripe(sub({ items: { data: [{ price: { unit_amount: null, currency: 'eur', recurring: { interval: 'month' } } }] } })).prix === null, 'Stripe : prix par paliers (unit_amount null) → muette');

  const ri = (o = {}) => ({ productId: PRODUIT_CLOUD_APPLE, autoRenewProductId: PRODUIT_CLOUD_APPLE, autoRenewStatus: 1, renewalPrice: 31490, currency: 'EUR', ...o });
  ok(JSON.stringify(prixDepuisAppleRenouvellement(ri()).prix) === JSON.stringify({ montant: 31.49, devise: 'EUR' }), 'Apple : renewalPrice 31490 (millièmes) EUR → 31,49 EUR');
  ok(prixDepuisAppleRenouvellement(ri({ autoRenewStatus: 0 })).renouvelle === false, 'Apple : renouvellement automatique coupé → ne renouvelle pas (aucun rappel)');
  ok(prixDepuisAppleRenouvellement(ri({ offerType: 2 })).prix === null && prixDepuisAppleRenouvellement(ri({ offerType: 3 })).prix === null && prixDepuisAppleRenouvellement(ri({ offerType: 4 })).prix === null,
    'Apple : offre promotionnelle / code / reconquête à l’échéance → muette');
  ok(prixDepuisAppleRenouvellement(ri({ offerType: 1 })).prix?.montant === 31.49, 'Apple : offerType 1 (l’essai gratuit en cours) → le prix plein de l’échéance');
  ok(prixDepuisAppleRenouvellement(ri({ renewalPrice: undefined })).prix === null && prixDepuisAppleRenouvellement(ri({ renewalPrice: 0 })).prix === null, 'Apple : renewalPrice absent ou 0 → muette (jamais « 0 € »)');
  ok(prixDepuisAppleRenouvellement(ri({ autoRenewProductId: 'app.fillsell.pro.sub', productId: 'app.fillsell.pro.sub' })).prix === null, 'Apple : un autre produit → muette');
  ok(prixDepuisAppleRenouvellement(ri(), 2).renouvelle === false && prixDepuisAppleRenouvellement(ri(), 5).renouvelle === false, 'Apple : abonnement expiré / révoqué → ne renouvelle pas');
  {
    // La réponse d'Apple pendant l'essai : la TRANSACTION vaut 0 (offre d'introduction gratuite), le RENOUVELLEMENT le vrai prix.
    const rep = { environment: 'Sandbox', data: [{ lastTransactions: [{ originalTransactionId: '42', status: 1,
      signedTransactionInfo: jws({ productId: PRODUIT_CLOUD_APPLE, price: 0, currency: 'EUR', offerType: 1, offerDiscountType: 'FREE_TRIAL' }),
      signedRenewalInfo: jws(ri()) }] }] };
    const l = prixDepuisAppleStatuts(rep, '42');
    ok(l.prix?.montant === 31.49 && l.environnement === 'Sandbox' && l.source === SOURCES.apple, 'Apple : pendant l’essai, le prix du RENOUVELLEMENT (31,49), jamais le 0 de la transaction d’essai');
    ok(charge(jws({ a: 1 }))?.a === 1 && charge('illisible') === null, 'Apple : un JWS illisible → rien (jamais d’exception)');
    ok(prixDepuisAppleStatuts({ data: [{ lastTransactions: [{ originalTransactionId: '42', signedRenewalInfo: 'x.y.z' }] }] }, '42').prix === null, 'Apple : renouvellement illisible → muette');
  }
  const achat = (o = {}, plan = {}) => ({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: PRODUIT_CLOUD_GOOGLE,
    autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: 'EUR', units: '27', nanos: 990000000 }, ...plan } }], ...o });
  ok(JSON.stringify(prixDepuisGoogle(achat()).prix) === JSON.stringify({ montant: 27.99, devise: 'EUR' }), 'Google : recurringPrice 27 + 0,99 EUR → 27,99 EUR');
  ok(prixDepuisGoogle(achat({}, { autoRenewEnabled: false })).renouvelle === false && prixDepuisGoogle(achat({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' })).renouvelle === false, 'Google : renouvellement coupé / annulé → ne renouvelle pas');
  ok(prixDepuisGoogle(achat({}, { priceChangeDetails: { newPrice: { currencyCode: 'EUR', units: '30' } } })).prix === null, 'Google : changement de prix en cours → muette');
  ok(prixDepuisGoogle(achat({ lineItems: [{ productId: 'app.fillsell.pro.sub', autoRenewingPlan: { autoRenewEnabled: true } }] })).prix === null, 'Google : un autre produit → muette');
  ok(prixDepuisGoogle(achat({}, { recurringPrice: undefined })).prix === null, 'Google : recurringPrice absent → muette');

  ok(net(formatPrix({ montant: 24.99, devise: 'EUR' }, 'fr')) === '24,99 €' && formatPrix({ montant: 24.99, devise: 'EUR' }, 'en') === '€24.99', 'format : « 24,99 € » (fr, insécable) / « €24.99 » (en)');
  ok(formatPrix(null) === null && formatPrix({ montant: 0, devise: 'EUR' }) === null && formatPrix({ montant: 5, devise: 'euro' }) === null && prixValide({ montant: NaN, devise: 'EUR' }) === null, 'format : prix absent, nul ou devise illisible → rien');

  // lirePrixCloud : les appels, les en-têtes, les pannes.
  const src = reponsesSources({ apple: 31.49, google: 27.99, stripe: 23.49 });
  const journal = [];
  const lus = {};
  for (const canal of CANAUX) lus[canal] = await lirePrixCloud({ canal, ref: REFS[canal], deps: depsFactices(src, { journal }) });
  ok(lus.apple.prix?.montant === 31.49 && lus.google.prix?.montant === 27.99 && lus.stripe.prix?.montant === 23.49, 'lirePrixCloud : chaque canal rend le montant de SA source (31,49 / 27,99 / 23,49)');
  ok(journal.some((j) => j.url.startsWith(APPLE_API_PRODUCTION)) && journal.some((j) => j.url.startsWith(APPLE_API_BAC_A_SABLE)) && lus.apple.environnement === 'Sandbox',
    'Apple : production d’abord, bac à sable sur un 404 (l’achat de Nicotest est du bac à sable)');
  ok(journal.find((j) => j.url.includes('api.stripe.com'))?.auth === 'Bearer sk_factice' && journal.find((j) => j.url.includes('storekit'))?.auth === 'Bearer jwt-apple-factice'
    && journal.find((j) => j.url.includes('androidpublisher'))?.auth === 'Bearer jeton-google-factice', 'les trois appels portent leur jeton (clé Stripe, JWT App Store, jeton Google)');
  ok(journal.find((j) => j.url.includes('androidpublisher')).url.includes('/applications/app.fillsell.app/purchases/subscriptionsv2/tokens/'), 'Google : purchases.subscriptionsv2 du paquet app.fillsell.app');
  const lent = { fetch: () => new Promise(() => {}), cleStripe: 'k', jetonApple: async () => 'j', jetonGoogle: async () => 'j', delaiMs: 30 };
  const l1 = await lirePrixCloud({ canal: 'stripe', ref: 'sub_1', deps: lent });
  ok(l1.prix === null && l1.raison === 'delai_depasse', 'source qui ne répond pas → muette en 5 s au plus (ici 30 ms), le passage continue', l1.raison);
  const l2 = await lirePrixCloud({ canal: 'apple', ref: '1', deps: { ...depsFactices(src), jetonApple: async () => { throw new Error('clé Apple absente'); } } });
  ok(l2.prix === null && /^erreur:/.test(l2.raison), 'jeton refusé → muette, jamais d’exception', l2.raison);
  const l3 = await lirePrixCloud({ canal: 'google', ref: 'x', deps: depsFactices(src, { muette: true }) });
  ok(l3.prix === null && l3.raison === 'google_http_503', 'HTTP 503 → muette');
  const l4 = await lirePrixCloud({ canal: 'offert', ref: null, deps: depsFactices(src) });
  const l5 = await lirePrixCloud({ canal: 'stripe', ref: 'cus_pasunabonnement', deps: depsFactices(src) });
  ok(l4.prix === null && l4.raison === 'canal_sans_source' && l5.prix === null && l5.raison === 'reference_illisible', 'canal sans source (offert, inconnu) ou référence illisible → muette, aucun appel');
}

// ═══ 2. Chaque mail × canal, par le VRAI code (aperçus de scripts/apercu/mails-cloud.mjs) ═══════════════════════
titre('2. Chaque mail × canal — prix de la source, prélèvement et arrêt du canal, aucune promesse, le nom');
const MONTANTS = { apple: 31.49, google: 27.99, stripe: 23.49 };   // inhabituels : seule la source a pu les donner
const rendus = await rendusMailsCloud({ montants: MONTANTS });
{
  const couverture = new Set(rendus.map((r) => `${r.mail}:${r.canal}`));
  ok(['rappel_veille', 'paiement_echoue'].every((m) => CANAUX.every((c) => couverture.has(`${m}:${c}`))), `la grille est complète : 2 mails × 3 canaux (${rendus.length} aperçus)`);
  const AUTRES = Object.values(MONTANTS).map((m) => [net(formatPrix({ montant: m, devise: 'EUR' }, 'fr')), formatPrix({ montant: m, devise: 'EUR' }, 'en')]).flat();
  for (const r of rendus) {
    const nom = `${r.fichier}`;
    if (!r.existe) {
      ok(/aucun mail/i.test(r.html), `${nom} : sans objet (aucun mail ${r.canal} de ce type) — dit tel quel`);
      continue;
    }
    const vu = texteVisible(r.html);
    const tout = `${r.sujet} ${vu}`;
    const hrefs = liens(r.html);
    ok(r.sujet.includes('FillSell Cloud') && vu.includes('FillSell Cloud'), `${nom} : le sujet et le corps nomment « FillSell Cloud »`, r.sujet);
    ok(!NOM_INTERDIT.test(tout), `${nom} : ni « option », ni « add-on », ni « Sans ordinateur »`, (tout.match(NOM_INTERDIT) ?? [])[0]);
    ok(!/\b20 ?€|€ ?20\b|24[,.]99/.test(tout), `${nom} : ni l’ancien prix, ni un 24,99 écrit en dur (la source a dit ${MONTANTS[r.canal]})`);
    if (r.mail === 'rappel_veille') {
      ok(!PROMESSE.test(tout), `${nom} : aucune promesse « rien n’est facturé »`);
      ok(r.html.includes(`<html lang="${r.lang}"`), `${nom} : rendu ${r.lang} de bout en bout`);
      if (r.variante === 'prix_lu') {
        const attendu = r.lang === 'en' ? formatPrix(r.lecture.prix, 'en') : net(formatPrix(r.lecture.prix, 'fr'));
        ok(r.lecture.source === SOURCES[r.canal] && r.lecture.prix?.montant === MONTANTS[r.canal], `${nom} : prix lu chez ${r.lecture.source} (${MONTANTS[r.canal]})`);
        ok(tout.includes(r.lang === 'en' ? `${attendu} a month` : `${attendu} par mois`), `${nom} : le mail écrit « ${attendu} » — le montant de SA source`);
        const etrangers = AUTRES.filter((a) => a !== attendu && tout.includes(a));
        ok(etrangers.length === 0, `${nom} : aucun autre montant`, etrangers.join(', '));
      } else {
        ok(r.lecture.prix === null && !MONTANT.test(tout) && !tout.includes('€'), `${nom} : source muette (${r.lecture.raison}) → aucun montant, aucun « € »`);
        ok(/au prix mensuel indiqué/.test(tout), `${nom} : une phrase sans montant qui dit où voir le prix`);
      }
      if (r.canal === 'apple') {
        ok(!CARTE_FILLSELL.test(tout) && /C'est Apple qui prélève|Apple charges it/.test(tout) && /compte Apple|Apple Account/.test(tout), `${nom} : Apple prélève, sur le moyen de paiement du compte Apple (jamais « la carte enregistrée »)`);
        ok(hrefs.includes(LIEN_ABONNEMENTS_APPLE) && LIEN_ABONNEMENTS_APPLE === 'https://apps.apple.com/account/subscriptions' && /abonnements Apple|Apple subscriptions/.test(tout) && !/Réglages → Abonnement :|Settings → Subscription:/.test(tout),
          `${nom} : l’arrêt chez Apple, bouton direct vers apps.apple.com/account/subscriptions`);
        ok(!hrefs.some((h) => h.includes('play.google.com')), `${nom} : aucun lien Google Play`);
      }
      if (r.canal === 'google') {
        ok(!CARTE_FILLSELL.test(tout) && /Google Play qui prélève|Google Play charges it/.test(tout) && /compte Google|Google Account/.test(tout), `${nom} : Google Play prélève, sur le moyen de paiement du compte Google`);
        ok(hrefs.includes(LIEN_ABONNEMENTS_GOOGLE) && LIEN_ABONNEMENTS_GOOGLE === `https://play.google.com/store/account/subscriptions?sku=${PRODUIT_CLOUD_GOOGLE}&package=app.fillsell.app`,
          `${nom} : l’arrêt chez Google Play, bouton direct (sku=${PRODUIT_CLOUD_GOOGLE}&package=app.fillsell.app)`);
        ok(!hrefs.some((h) => h.includes('apps.apple.com')), `${nom} : aucun lien Apple`);
      }
      if (r.canal === 'stripe') {
        ok(CARTE_FILLSELL.test(tout) && !/Apple|Google/.test(tout), `${nom} : la carte enregistrée (Stripe), ni Apple ni Google`);
        ok(/Réglages → Abonnement|Settings → Subscription/.test(tout) && /l'essai continue jusqu'à sa fin, puis l'abonnement s'arrête chez Stripe|the trial runs until its end, then the subscription stops at Stripe/.test(tout) && !/tout de suite|straight away/.test(tout) /* (13/11, décision de Nico — plus aucun arrêt immédiat d'un essai) */ && hrefs.includes(LIEN_APP),
          `${nom} : l’arrêt dans l’app (vrai arrêt : annulé chez Stripe avant la première échéance), bouton vers l’app`);
      }
    }
    if (r.mail === 'paiement_echoue') {
      ok(r.canal === 'stripe' && (r.variante.startsWith('souscription/') || /page sécurisée de Stripe|Stripe's secure page/.test(vu)) && !/Apple|Google/.test(vu),
        `${nom} : Stripe seulement (la page Stripe de la facture ; une souscription ramène à l’app)`);
      ok(!MONTANT.test(tout), `${nom} : aucun montant (règle du mail d’échec)`);
      ok(!/reste actif|stays active/.test(tout), `${nom} : jamais « reste actif » (un Cloud impayé s’arrête)`);
      ok(!/choisis à nouveau ta formule|pick your plan again/.test(tout), `${nom} : on reprend FillSell Cloud, on ne « choisit pas une formule »`);
    }
  }
  // Une source muette sur un canal n'en contamine pas un autre ; le même mail, nourri par 24,99, dit 24,99.
  const normal = await rendusMailsCloud();
  const a = normal.find((r) => r.fichier === '01-rappel-veille-apple-fr.html');
  ok(texteVisible(a.html).includes('24,99 € par mois') && a.lecture.prix.montant === 24.99, 'prix configuré (24,99 EUR sur les trois canaux) → « 24,99 € par mois », lu chez Apple');
}

// ═══ 3. Aucun montant écrit dans le code des mails ═══════════════════════════════════════════════════════════
titre('3. Aucun montant en dur dans le code des mails du Cloud (hors commentaires)');
{
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  const tunnel = lire('supabase/functions/email-tunnel/index.ts');
  const veilleTunnel = tunnel.slice(tunnel.indexOf('async function rappelsVeilleCloud'), tunnel.indexOf('let veilleCloud'));
  const apercuTunnel = tunnel.slice(tunnel.indexOf('if (template === "cloud_veille")'), tunnel.indexOf('if (template === "relance_1"'));
  const ef = lire('supabase/functions/_shared/emails-fillsell.ts');
  const morceaux = {
    'cloud-rappel-veille.js': lire('supabase/functions/_shared/cloud-rappel-veille.js'),
    'cloud-prix.js': lire('supabase/functions/_shared/cloud-prix.js'),
    'cloud-prix-source.ts': lire('supabase/functions/_shared/cloud-prix-source.ts'),
    'paiement-echoue.js': lire('supabase/functions/_shared/paiement-echoue.js'),
    'emails-fillsell.ts (mailRappelVeilleCloud)': ef.slice(ef.indexOf('export interface RappelVeilleCloud'), ef.indexOf('// 8. ventes_du_jour')),
    'email-tunnel (passage de la veille)': veilleTunnel,
    'email-tunnel (aperçu cloud_veille)': apercuTunnel,
  };
  for (const [quoi, s] of Object.entries(morceaux)) {
    ok(s.length > 200 && !MONTANT.test(code(s)), `${quoi} : aucun montant écrit`, (code(s).match(MONTANT) ?? [])[0]);
  }
}

// ═══ 4. Le câblage d'email-tunnel ═══════════════════════════════════════════════════════════════════════════
titre('4. email-tunnel : canal et référence lus, prix à la source avant l’envoi, rendu par mailRappelVeilleCloud');
{
  const t = lire('supabase/functions/email-tunnel/index.ts');
  const v = t.slice(t.indexOf('async function rappelsVeilleCloud'), t.indexOf('let veilleCloud'));
  ok(/import \{ lecteurPrixCloud \} from "\.\.\/_shared\/cloud-prix-source\.ts"/.test(t), 'email-tunnel importe le lecteur de prix (aucune règle recopiée)');
  // (13/11, décision de Nico — couper le renouvellement ne coupe plus rien) + cloud_arret_fin_periode : un essai au
  // renouvellement coupé n'a pas de rappel (decisionRappel), même quand la source se tait.
  ok(/\.select\("id, email, lang, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_arret_fin_periode, cloud_canal, cloud_ref"\)/.test(v), 'la lecture du passage prend cloud_canal, cloud_ref et cloud_arret_fin_periode');
  const iDecision = v.indexOf('if (d.action !== "envoyer")'), iLu = v.indexOf('await lirePrix(p.cloud_canal, p.cloud_ref)'), iStop = v.indexOf('if (lu.renouvelle === false)'),
    iDry = v.indexOf('if (dry)'), iMail = v.indexOf('mailRappelVeilleCloud('), iEnvoi = v.indexOf('await envoyer(');
  ok(iDecision > 0 && iLu > iDecision && iStop > iLu && iDry > iStop && iMail > iDry && iEnvoi > iMail, 'ordre : décision → prix lu → « ne renouvelle pas » = aucun rappel → dry_run → rendu → envoi');
  // (11/11/2026, offres Cloud — changement VOLONTAIRE, nommé dans le rapport OFFRES-SERVEUR) le rendu reçoit en plus la
  // formule LUE à la source (« Pro + Cloud »), l'essai d'un abonné et la référence (7 jours offerts) — rien d'autre.
  ok(/mailRappelVeilleCloud\(\{ lang, finIso: String\(p\.cloud_essai_fin\), canal: \(p\.cloud_canal as string \| null\) \?\? null, prix: lu\.prix,\s*formule: \(lu as \{ formule\?: string \| null \}\)\.formule \?\? null, abonne: \(lu as \{ abonne\?: boolean \}\)\.abonne === true, ref: \(p\.cloud_ref as string \| null\) \?\? null,\s*moyenPaiement: \(lu as \{ moyen\?: string \| null \}\)\.moyen \?\? null \}\)/.test(v), 'le rendu reçoit le canal du profil, le prix LU, et (11/11) la formule lue à la source, l\'essai d\'abonné, la référence, (14/11) le moyen de paiement lu chez Stripe — rien d’autre');
  ok(!/texteRappel\(/.test(t) && !/PRIX_AFFICHE/.test(t), 'plus aucun texteRappel sans canal ni prix, plus aucun PRIX_AFFICHE dans email-tunnel');
  ok(/prix_lus: prixLus/.test(v), 'la réponse du passage dit les prix lus (dry_run : la preuve sans envoi)');
  ok(/const LECTURES_PRIX_MAX = 20;/.test(v) && /const BUDGET_PRIX_MS = 60_000;/.test(v) && /\.order\("cloud_essai_fin", \{ ascending: true \}\)/.test(v)
    && v.indexOf('lecturesPrix >= LECTURES_PRIX_MAX') < iLu && v.indexOf('lecturesPrix >= LECTURES_PRIX_MAX') > iDecision,
  'lectures bornées par passage (20 appels, 60 s), la fin la plus proche d’abord ; au-delà, le passage suivant');
  ok(/type:\s*TYPE_RAPPEL, categorie:\s*CATEGORIE_RAPPEL as "support", dedup:\s*DEDUP_RAPPEL as "reservation"/.test(v), 'envoi inchangé : type cloud_essai_veille, catégorie support, réservation (un seul)');
  const ef = lire('supabase/functions/_shared/emails-fillsell.ts');
  ok(/import \{ texteRappel \} from "\.\/cloud-rappel-veille\.js"/.test(ef) && /export function mailRappelVeilleCloud/.test(ef), 'la mise en page vit dans emails-fillsell.ts, sur le texte de cloud-rappel-veille.js');
  const src = lire('supabase/functions/_shared/cloud-prix-source.ts');
  ok(/STRIPE_SECRET_KEY/.test(src) && /genererJWTApple\(BUNDLE_APPLE\)/.test(src) && /jetonGooglePlay\(\)/.test(src) && !/https?:\/\/(?!api\.|androidpublisher)/.test(src.replace(/\/\/.*$/gm, '')),
    'cloud-prix-source.ts : clé Stripe, JWT App Store (clé « Achat intégré »), jeton Google ; aucun import distant');
}

// ═══ 5. Témoins : les textes fautifs sont attrapés ═══════════════════════════════════════════════════════════
titre('5. Témoins : le texte en service en prod (29/10) et celui d’avant ce correctif sont attrapés');
{
  const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const tmp = mkdtempSync(join(tmpdir(), 'fs-mails-cloud-'));
  try {
    const charger = async (rev, nom) => {
      writeFileSync(join(tmp, nom), git('show', `${rev}:supabase/functions/_shared/cloud-rappel-veille.js`));
      return import(pathToFileURL(join(tmp, nom)).href);
    };
    // email-tunnel en prod : déployé le 29/10 16:13, d'avant c3a4aff (24,99 € et « FillSell Cloud », 04/11).
    const prod = await charger('c3a4aff~1', 'veille-prod.mjs');
    const p = prod.texteRappel({ lang: 'fr', finIso: FIN_ESSAI });
    const tp = [p.sujet, p.preheader, ...p.paragraphes].join(' ');
    ok(/Ton essai de 7 jours de l'option Sans ordinateur se termine le dimanche 8 novembre à 18h51/.test(tp), 'témoin prod : c’est mot pour mot le mail reçu par Nicotest (« … de l’option Sans ordinateur se termine le dimanche 8 novembre à 18h51 »)');
    ok(NOM_INTERDIT.test(tp) && PROMESSE.test(tp) && CARTE_FILLSELL.test(tp) && /\b20 €/.test(tp), 'témoin prod : attrapé (nom « option Sans ordinateur », « rien n’est facturé », « carte enregistrée » pour un client Apple, « 20 € » en dur)');
    // Avant ce correctif (base 1251dba) : le nom réparé, mais le prix en dur et un seul texte pour tous les canaux.
    const avant = await charger('1251dba', 'veille-avant.mjs');
    const a = avant.texteRappel({ lang: 'fr', finIso: FIN_ESSAI });
    const ta = [a.sujet, a.preheader, ...a.paragraphes].join(' ');
    ok(PROMESSE.test(ta) && CARTE_FILLSELL.test(ta) && /24,99 €/.test(ta) && !/Apple/.test(ta) && /\boption\b/.test(ta),
      'témoin d’avant ce correctif : attrapé (24,99 € en dur, « carte enregistrée » et « rien n’est facturé » pour tous les canaux, « l’option »)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const neuf = texteRappel({ lang: 'fr', finIso: FIN_ESSAI, canal: 'apple', prix: { montant: 24.99, devise: 'EUR' } });
  const tn = [neuf.sujet, neuf.preheader, ...neuf.paragraphes].join(' ');
  ok(!NOM_INTERDIT.test(tn) && !PROMESSE.test(tn) && !CARTE_FILLSELL.test(tn), 'le même mail, aujourd’hui, pour Nicotest (Apple) : aucun des trois défauts');
}

console.log(ko ? `\n✗ cloud-mails-canaux : ${ko} rouge(s) sur ${n}` : `\n✓ cloud-mails-canaux : ${n} contrôles verts, 0 rouges`);
process.exit(ko ? 1 : 0);
