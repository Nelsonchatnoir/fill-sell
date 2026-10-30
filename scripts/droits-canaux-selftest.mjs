// (30/10, lot D point 2 — BONCOIN) Un canal qui s'arrête ne retire que SON droit — jamais celui d'un autre.
// Règles pures (_shared/droits-canaux.js) + câblage relu dans les quatre fonctions qui écrivent les drapeaux.
import fs from 'node:fs';
import {
  drapeauxDuRang, rangDesDrapeaux, rangGoogleVivant, rangAppleVivant, patchArretGoogle,
  drapeauxStripeAvecStores, abonnementGoogleActif, rangStripeVivant, rangProduitGoogleOuApple,
} from '../supabase/functions/_shared/droits-canaux.js';
import { ligneMrrStripe, mrrParCanal, palierProduitStore } from '../supabase/functions/_shared/mrr.js';

let echecs = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok  ', m); else { echecs++; console.error('  ÉCHEC', m); } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const t = Date.parse('2026-10-30T09:00:00Z');

console.log('1. Les rangs');
ok(rangProduitGoogleOuApple('app.fillsell.premium.standard') === 1 && rangProduitGoogleOuApple('app.fillsell.pro.sub') === 2
  && rangProduitGoogleOuApple('app.fillsell.business.sub') === 3 && rangProduitGoogleOuApple('app.fillsell.cloud.sub') === 0, 'le palier se lit sur le produit (Cloud jamais un palier)');
ok(JSON.stringify(drapeauxDuRang(3)) === JSON.stringify({ is_premium: true, is_pro: true, is_business: true }) && rangDesDrapeaux({ is_pro: true }) === 2, 'drapeaux cumulatifs');

console.log('2. BONCOIN : Google remboursé, Premium Stripe');
const boncoin = { id: 'b', google_purchase_token: 'tok', google_product_id: 'app.fillsell.premium.standard', apple_original_transaction_id: null, stripe_customer_id: 'cus_x', is_premium: true, is_pro: false, is_business: false, subscription_period_end: '2026-11-26T08:53:37Z' };
{
  const { patch } = patchArretGoogle(boncoin, { terminal: true, rangStripe: 1, maintenant: t });
  ok(patch.is_premium === true && patch.is_pro === false, 'son Premium Stripe RESTE (le remboursement Google ne le coupe plus)');
  ok(patch.google_purchase_token === null && patch.google_product_id === null && patch.subscription_period_end === null && patch.subscription_cancel_at_period_end === false, 'le canal Google est EFFACÉ (jeton, produit, fin)');
  ok(!('is_founder' in patch), 'is_founder jamais touché');
}
console.log('3. Google seul');
{
  const g = { ...boncoin, stripe_customer_id: null };
  const { patch } = patchArretGoogle(g, { terminal: true, rangStripe: 0, maintenant: t });
  ok(patch.is_premium === false && patch.google_purchase_token === null, 'Google seul révoqué → gratuit, canal effacé');
  const p2 = patchArretGoogle(g, { terminal: false, rangStripe: 0, maintenant: t }).patch;
  ok(p2.is_premium === false && !('google_purchase_token' in p2), 'arrêt PASSAGER (attente, grâce, pause) → droit coupé, jeton GARDÉ pour la reprise');
}
console.log('4. Apple vivant + Google arrêté');
{
  const a = { ...boncoin, apple_original_transaction_id: 'apl', stripe_customer_id: null, is_pro: true };
  const { patch } = patchArretGoogle(a, { terminal: true, rangStripe: 0, maintenant: t });
  ok(patch.is_pro === true && !('subscription_period_end' in patch), 'le Pro Apple reste, sa fin aussi');
}
console.log('5. Fin Stripe : jamais sous un store vivant');
{
  const finiStripe = { is_premium: false, is_pro: false, is_business: false };
  const gVivant = { google_purchase_token: 'tok', google_product_id: 'app.fillsell.pro.sub', subscription_period_end: '2026-11-20T00:00:00Z' };
  const r = drapeauxStripeAvecStores(finiStripe, gVivant, t);
  ok(r.is_pro === true && r.rangStore === 2 && r.rangStripe === 0, 'Pro Google vivant : la fin d’un abonnement Stripe ne le coupe plus');
  const gMort = { ...gVivant, subscription_period_end: '2026-10-29T09:04:13Z' };
  ok(drapeauxStripeAvecStores(finiStripe, gMort, t).is_pro === false, 'jeton Google à fin PASSÉE : rien gardé');
  ok(rangGoogleVivant({ google_purchase_token: 'tok', google_product_id: 'app.fillsell.premium.standard', subscription_period_end: null }, t) === 0, 'jeton sans fin : jamais vivant');
  ok(rangAppleVivant({ apple_original_transaction_id: 'x', is_premium: true, subscription_period_end: '2026-12-01T00:00:00Z' }, t) === 1, 'Apple vivant = drapeaux + fin à venir');
}
console.log('6. L’état relu chez Google');
ok(abonnementGoogleActif({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }, t) === true, 'ACTIVE → actif');
ok(abonnementGoogleActif({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ expiryTime: '2026-11-10T00:00:00Z' }] }, t) === true, 'résilié mais payé jusqu’au 10/11 → actif');
ok(abonnementGoogleActif({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ expiryTime: '2026-10-29T09:04:13Z' }] }, t) === false, 'résilié, fin passée → pas actif');
ok(['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', ''].every((e) => abonnementGoogleActif({ subscriptionState: e }, t) === false), 'expiré, grâce (impayé), en attente, pause → pas actif');
console.log('7. Stripe vivant');
ok(rangStripeVivant([{ status: 'active', r: 1 }, { status: 'past_due', r: 3 }, { status: 'trialing', r: 2, cloud: true }], (s) => s.r, (s) => !!s.cloud) === 1, 'payé = active | trialing, Cloud exclu, impayé exclu');

console.log('8. Le câblage');
const gw = lire('supabase/functions/google-play-webhook/index.ts');
ok((gw.match(/prof\?\.google_purchase_token !== purchaseToken/g) ?? []).length === 2, 'google-play-webhook : OFF et CANCELED ignorés si le jeton est ABSENT ou remplacé');
ok(/arreterCanalGoogle\(prof, \{ terminal: notificationType === 12 \|\| notificationType === 13/.test(gw), 'google-play-webhook : arrêt terminal sur 12 / 13, drapeaux des autres canaux');
ok(/d\.type === "abonnement" && compte\?\.id/.test(gw) && /raison: "remboursement"/.test(gw), 'google-play-webhook : un abonnement remboursé efface le canal');
ok(!/const update: Record<string, unknown> = \{ is_premium: isPremium \};[\s\S]{0,200}if \(!isPremium\)/.test(gw) && /return new Response\(JSON\.stringify\(\{ ok: true, premium: false \}\)/.test(gw), 'google-play-webhook : l’OFF n’écrit plus is_premium:false à l’aveugle');
const vg = lire('supabase/functions/validate-google-purchase/index.ts');
ok(/patchArretGoogle\(prof, \{ terminal, rangStripe, produit: productId \}\)/.test(vg) && !/update\(\{ is_premium: false, is_pro: false, is_business: false \}\)/.test(vg), 'validate-google-purchase : même règle');
const sw = lire('supabase/functions/stripe-webhook/index.ts');
ok(/drapeauxStripeAvecStores\(d, prof \?\? null\)/.test(sw), 'stripe-webhook : la fin Stripe ne coupe jamais un store vivant');
const cc = lire('supabase/functions/create-checkout-session/index.ts');
ok(/refusDoubleAbonnement\(profilStore, plan\.rang, 0, Date\.now\(\), \{ googleActif \}\)/.test(cc) && /subscriptionsv2\/tokens/.test(cc), 'create-checkout-session : la garde relit l’abonnement chez Google');

console.log('9. Le MRR : actifs seulement, par canal');
{
  const prix = { standard: 'price_std', pro: 'price_pro', business: 'price_biz', cloud: 'price_cloud' };
  const sub = (status, id, montant, extra = {}) => ({ id: 'sub_' + id, status, metadata: extra.metadata ?? {}, items: { data: [{ quantity: 1, price: { id, unit_amount: montant, recurring: extra.recurring ?? { interval: 'month', interval_count: 1 } } }] } });
  ok(ligneMrrStripe(sub('active', 'price_std', 1299), prix)?.eur === 12.99, 'Premium Stripe actif → 12,99 €');
  ok(ligneMrrStripe(sub('trialing', 'price_cloud', 2000), prix) === null && ligneMrrStripe(sub('past_due', 'price_pro', 2999), prix) === null, 'essai et impayé : 0');
  ok(ligneMrrStripe(sub('active', 'price_biz', 59988, { recurring: { interval: 'year', interval_count: 1 } }), prix)?.eur === 49.99, 'annuel ramené au mois');
  ok(ligneMrrStripe(sub('active', 'price_cloud', 2000, { metadata: { option: 'cloud' } }), prix)?.palier === 'cloud', 'Cloud compté à part');
  ok(palierProduitStore('app.fillsell.cloud.sub') === 'cloud' && palierProduitStore('app.fillsell.premium.standard') === 'premium' && palierProduitStore('app.fillsell.coins.100') === null, 'produits des stores (packs exclus)');
  const m = mrrParCanal([{ canal: 'stripe', palier: 'premium', eur: 12.99 }, { canal: 'google', palier: 'premium', eur: 12.99 }, { canal: 'apple', palier: 'pro', eur: 29.99 }, { canal: 'google', palier: 'pro', eur: 0 }]);
  ok(m.stripe.abonnes === 1 && m.google.abonnes === 1 && m.apple.eur === 29.99 && m.total.eur === 55.97 && m.total.abonnes === 3, 'additionné par canal (une ligne à 0 € ne compte pas)');
  const audit = lire('supabase/functions/abonnements-stores-audit/index.ts');
  ok(/mrr: mrrParCanal\(lignesMrr\)/.test(audit) && /u\.searchParams\.set\("status", "active"\)/.test(audit) && /offerDiscountType !== "FREE_TRIAL"/.test(audit), 'abonnements-stores-audit rend le MRR (Stripe « active », Apple hors essai, Google hors grâce)');
}

if (echecs) { console.error(`\n✗ ${echecs} échec(s) — ${n} contrôles`); process.exit(1); }
console.log(`\n✓ tout est vert — ${n} contrôles`);
