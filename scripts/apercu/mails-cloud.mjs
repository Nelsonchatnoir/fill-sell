// Les aperçus des MAILS FillSell Cloud, mail × canal (07/11/2026 soir, essai bac à sable Apple de Nico).
//
//     node scripts/apercu/mails-cloud.mjs <dossier>     → écrit un fichier HTML par mail × canal (+ index.html)
//
// Rien n'est envoyé, rien n'est lu en base ni sur le réseau. Chaque aperçu passe par le VRAI code :
//   · le prix : lirePrixCloud (_shared/cloud-prix.js), nourri par des réponses de SOURCE factices mais conformes
//     (abonnement Stripe relu, Get All Subscription Statuses d'Apple avec un renouvellement signé, subscriptionsv2
//     de Google) — la même lecture que le passage horaire d'email-tunnel ;
//   · le texte et la mise en page : mailRappelVeilleCloud / mailPaiementEchoue (_shared/emails-fillsell.ts), le
//     gabarit commun (_shared/email-template.ts).
// Importé par scripts/cloud-mails-canaux-selftest.mjs, qui contrôle CHAQUE aperçu produit ici.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APPLE_API_BAC_A_SABLE, APPLE_API_PRODUCTION, GOOGLE_API, STRIPE_API, lirePrixCloud,
} from '../../supabase/functions/_shared/cloud-prix.js';
import { PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE } from '../../supabase/functions/_shared/cloud-option.js';

const E = await import('../../supabase/functions/_shared/emails-fillsell.ts');

export const CANAUX = ['apple', 'google', 'stripe'];
export const LANGUES = ['fr', 'en'];
// La fin d'essai de l'essai de Nico (compte Nicotest, bac à sable Apple) : dimanche 8 novembre, 18h51 à Paris.
export const FIN_ESSAI = '2026-11-08T17:51:03Z';
export const REFS = { apple: '2000001262935799', google: 'jeton-google-factice.AO-J1Oz', stripe: 'sub_1FactICEcloud' };

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Un JWS de la forme d'Apple (en-tête.charge.signature) ; la signature n'est pas relue (réponse de l'API d'Apple). */
export const jws = (charge) => `${b64url({ alg: 'ES256', x5c: ['factice'] })}.${b64url(charge)}.signature-factice`;

/**
 * Les réponses des trois sources, pour des montants donnés (en unités : 24.99 = 24,99).
 * Par défaut : les prix configurés le 07/11 (Stripe price_1UYWNmQZRA77vrWJZIWshl1B relu en lecture : 2499 EUR par
 * mois ; Apple et Google : 24,99 € — doc de l'état de prod). Le selftest passe d'autres montants pour prouver que
 * le mail écrit CE QUE LA SOURCE DIT.
 */
export function reponsesSources({ apple = 24.99, google = 24.99, stripe = 24.99, devise = 'EUR' } = {}) {
  const enMilli = Math.round(apple * 1000);
  const unites = Math.trunc(google);
  const nanos = Math.round((google - unites) * 1e9);
  return {
    apple: {
      environment: 'Sandbox', bundleId: 'app.fillsell.app',
      data: [{
        subscriptionGroupIdentifier: 'groupe-fillsell-cloud',
        lastTransactions: [{
          originalTransactionId: REFS.apple, status: 1,
          // La TRANSACTION de l'essai : l'offre d'introduction gratuite, prix 0 — jamais la source du mail.
          signedTransactionInfo: jws({ productId: PRODUIT_CLOUD_APPLE, originalTransactionId: REFS.apple, price: 0, currency: devise, offerType: 1, offerDiscountType: 'FREE_TRIAL' }),
          // Le RENOUVELLEMENT : ce qu'Apple prélèvera à l'échéance.
          signedRenewalInfo: jws({ productId: PRODUIT_CLOUD_APPLE, autoRenewProductId: PRODUIT_CLOUD_APPLE, autoRenewStatus: 1, renewalPrice: enMilli, currency: devise, originalTransactionId: REFS.apple, renewalDate: Date.parse(FIN_ESSAI) }),
        }],
      }],
    },
    google: {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{
        productId: PRODUIT_CLOUD_GOOGLE, expiryTime: FIN_ESSAI,
        offerDetails: { basePlanId: 'cloud-monthly', offerId: 'cloud-trial-3d' },
        autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: devise, units: String(unites), nanos } },
      }],
    },
    stripe: {
      id: REFS.stripe, object: 'subscription', status: 'trialing', cancel_at_period_end: false, cancel_at: null, discount: null, discounts: [],
      metadata: { option: 'cloud' },
      items: { data: [{ quantity: 1, price: { id: 'price_1UYWNmQZRA77vrWJZIWshl1B', unit_amount: Math.round(stripe * 100), currency: devise.toLowerCase(), recurring: { interval: 'month', interval_count: 1 } } }] },
    },
  };
}

const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });

/** Un fetch factice qui répond comme les trois API (Apple : 404 en production pour un achat du bac à sable). */
export function fetchFactice(sources, { muette = false, journal = [] } = {}) {
  return async (url, init = {}) => {
    journal.push({ url, auth: init?.headers?.Authorization ?? null });
    if (muette) return reponse(503, { error: 'indisponible' });
    if (url.startsWith(`${STRIPE_API}/subscriptions/`)) return reponse(200, sources.stripe);
    if (url.startsWith(`${APPLE_API_PRODUCTION}/inApps/v1/subscriptions/`)) return reponse(404, { errorCode: 4040010 });
    if (url.startsWith(`${APPLE_API_BAC_A_SABLE}/inApps/v1/subscriptions/`)) return reponse(200, sources.apple);
    if (url.startsWith(`${GOOGLE_API}/applications/app.fillsell.app/purchases/subscriptionsv2/tokens/`)) return reponse(200, sources.google);
    return reponse(404, {});
  };
}

export const depsFactices = (sources, opts = {}) => ({
  fetch: fetchFactice(sources, opts),
  cleStripe: 'sk_factice',
  jetonApple: async () => 'jwt-apple-factice',
  jetonGoogle: async () => 'jeton-google-factice',
});

/**
 * Tous les aperçus : { fichier, mail, canal, lang, variante, lecture, sujet, html, existe }.
 *   montants : les prix renvoyés par les sources factices (défaut : 24,99 sur les trois canaux).
 */
export async function rendusMailsCloud({ montants } = {}) {
  const sources = reponsesSources(montants);
  const out = [];
  // 1. Le rappel de la veille (cloud_essai_veille) — les trois canaux, deux langues, prix lu ; puis source muette.
  for (const canal of CANAUX) {
    const lu = await lirePrixCloud({ canal, ref: REFS[canal], deps: depsFactices(sources) });
    const muette = await lirePrixCloud({ canal, ref: REFS[canal], deps: depsFactices(sources, { muette: true }) });
    for (const lang of LANGUES) {
      const m = E.mailRappelVeilleCloud({ lang, finIso: FIN_ESSAI, canal, prix: lu.prix });
      out.push({ fichier: `01-rappel-veille-${canal}-${lang}.html`, mail: 'rappel_veille', canal, lang, variante: 'prix_lu', lecture: lu, sujet: m.sujet, html: m.html, existe: true });
    }
    const m = E.mailRappelVeilleCloud({ lang: 'fr', finIso: FIN_ESSAI, canal, prix: muette.prix });
    out.push({ fichier: `02-rappel-veille-${canal}-source-muette-fr.html`, mail: 'rappel_veille', canal, lang: 'fr', variante: 'source_muette', lecture: muette, sujet: m.sujet, html: m.html, existe: true });
  }
  // 2. Le paiement échoué de FillSell Cloud — Stripe SEULEMENT (Apple et Google relancent eux-mêmes leurs impayés :
  //    leurs webhooks n'appellent jamais signalerPaiementEchoue). Aucun montant, par règle (texteEchec).
  const LIEN = 'https://invoice.stripe.com/i/acct_apercu/apercu';
  const RELANCE = '2026-11-11T09:00:00Z';
  const echecs = [
    { ctx: 'fin_essai', cause: 'carte_refusee' }, { ctx: 'fin_essai', cause: '3ds' },
    { ctx: 'renouvellement', cause: 'carte_refusee' }, { ctx: 'souscription', cause: '3ds' },
  ];
  for (const { ctx, cause } of echecs) {
    for (const lang of LANGUES) {
      const m = E.mailPaiementEchoue({ lang, cause, contexte: ctx, lienFacture: LIEN, relanceLe: RELANCE, abonnementActif: ctx === 'renouvellement', offre: 'cloud' });
      out.push({ fichier: `03-paiement-echoue-${ctx}-${cause}-stripe-${lang}.html`, mail: 'paiement_echoue', canal: 'stripe', lang, variante: `${ctx}/${cause}`, lecture: null, sujet: m.sujet, html: m.html, existe: true });
    }
  }
  for (const canal of ['apple', 'google']) {
    const boutique = canal === 'apple' ? 'Apple' : 'Google Play';
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Paiement échoué — ${boutique} : aucun mail</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
<h1 style="font-size:20px">Paiement échoué FillSell Cloud — ${boutique} : aucun mail de FillSell</h1>
<p>Ce mail n'existe que pour Stripe. Un impayé ${boutique} est relancé par ${boutique} lui-même (relances de facturation,
délai de grâce, ses propres e-mails) ; le webhook ${canal === 'apple' ? 'apple-iap-webhook' : 'google-play-webhook'} n'appelle jamais
<code>signalerPaiementEchoue</code> (contrôlé par <code>npm run selftest:cloud-mails-canaux</code>).</p></body></html>`;
    out.push({ fichier: `03-paiement-echoue-${canal}-aucun-mail.html`, mail: 'paiement_echoue', canal, lang: 'fr', variante: 'sans_objet', lecture: null, sujet: '(aucun mail)', html, existe: false });
  }
  return out;
}

function index(rendus) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lignes = rendus.map((r) => `<tr><td><a href="${esc(r.fichier)}">${esc(r.fichier)}</a></td><td>${esc(r.mail)}</td><td>${esc(r.canal)}</td><td>${esc(r.lang)}</td><td>${esc(r.variante)}</td>
<td>${r.lecture ? esc(`${r.lecture.source} → ${r.lecture.prix ? `${r.lecture.prix.montant} ${r.lecture.prix.devise}` : `muette (${r.lecture.raison})`}`) : '—'}</td><td>${esc(r.sujet)}</td></tr>`).join('\n');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Mails FillSell Cloud</title>
<body style="font-family:system-ui,sans-serif;margin:24px;line-height:1.4">
<h1 style="font-size:20px">Mails FillSell Cloud — aperçus mail × canal (rien envoyé)</h1>
<p>Produits par <code>node scripts/apercu/mails-cloud.mjs</code> : le vrai code de lecture du prix (sources factices conformes aux API Stripe,
Apple, Google), le vrai texte et le vrai gabarit. Mails Cloud qui n'existent pas aujourd'hui : début d'essai, arrêt (Stripe, Apple, Google),
renouvellement réussi — aucun code ne les envoie.</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr><th>fichier</th><th>mail</th><th>canal</th><th>langue</th><th>variante</th><th>prix lu à la source</th><th>sujet</th></tr>
${lignes}</table></body></html>`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dossier = process.argv[2];
  if (!dossier) { console.error('usage : node scripts/apercu/mails-cloud.mjs <dossier>'); process.exit(2); }
  mkdirSync(dossier, { recursive: true });
  const rendus = await rendusMailsCloud();
  for (const r of rendus) writeFileSync(join(dossier, r.fichier), r.html);
  writeFileSync(join(dossier, 'index.html'), index(rendus));
  console.log(`${rendus.length} aperçus écrits dans ${dossier} (+ index.html)`);
  for (const r of rendus) console.log(`  ${r.fichier}  —  ${r.sujet}`);
}
