// Selftest — décisions de paiement Stripe (01/10), SANS réseau ni Stripe.
//
//     node scripts/paiement-stripe-selftest.mjs
//
// Les cas reprennent la forme EXACTE des objets lus en livemode le 01/10
// (refus 9cdr9rm4rn et nicolas.menar), réduits aux champs utiles et sans
// donnée personnelle.
import { choisirClientExistant, trierSessionsOuvertes, abonnementRemplacable, causeEchec } from '../supabase/functions/_shared/paiement-stripe.js';

let echecs = 0;
const ok = (cond, quoi) => { console.log(`  ${cond ? 'ok  ' : 'ÉCHEC'} ${quoi}`); if (!cond) echecs++; };

console.log('Un seul client Stripe par compte');
ok(choisirClientExistant([], 'u1') === null, 'aucun client → null (on en crée un, une fois)');
ok(choisirClientExistant([{ id: 'cus_A', created: 1, metadata: {} }, { id: 'cus_B', created: 2, metadata: {} }], 'u1') === 'cus_B', 'deux clients de la même adresse → le plus récent');
ok(choisirClientExistant([{ id: 'cus_A', created: 1, metadata: { fillsell_user_id: 'u1' } }, { id: 'cus_B', created: 2, metadata: {} }], 'u1') === 'cus_A', 'celui que FillSell a créé pour CE compte passe avant');
ok(choisirClientExistant([{ id: 'cus_A', created: 3, deleted: true }], 'u1') === null, 'un client supprimé ne compte pas');

console.log('Reprendre la session ouverte au lieu d\'en créer une autre');
{
  const t = 1_790_853_500;
  const s = (id, meta, extra = {}) => ({ id, status: 'open', mode: 'subscription', url: `https://checkout/${id}`, expires_at: t + 3600, metadata: meta, ...extra });
  const sessions = [s('cs_pro', { plan_type: 'pro' }), s('cs_std', { plan_type: 'standard' }), s('cs_pro3ds', { plan_type: 'pro', fillsell_carte_3ds: '1' })];
  const a = trierSessionsOuvertes(sessions, { planType: 'pro' }, t);
  ok(a.aReprendre?.id === 'cs_pro', 'même palier, même mode → reprise');
  ok(a.aRemplacer.map(x => x.id).join() === 'cs_std,cs_pro3ds', 'les autres sessions ouvertes sont remplacées');
  const b = trierSessionsOuvertes(sessions, { planType: 'pro', carte3ds: true }, t);
  ok(b.aReprendre?.id === 'cs_pro3ds', '« payer par carte » reprend la session carte + 3D Secure');
  const c = trierSessionsOuvertes([s('cs_vieille', { plan_type: 'pro' }, { expires_at: t + 60 })], { planType: 'pro' }, t);
  ok(c.aReprendre === null && c.aRemplacer.length === 1, 'une session qui expire dans la minute ne se rouvre pas');
  const d = trierSessionsOuvertes([s('cs_promo', { plan_type: 'pro', code_promo: 'FILLSELL50' })], { planType: 'pro' }, t);
  ok(d.aReprendre === null, 'une session avec code promo ne sert pas une demande sans code');
}

console.log('Ne remplacer qu\'un abonnement en attente, jamais un abonnement vivant');
ok(abonnementRemplacable({ status: 'incomplete', latest_invoice: { payment_intent: { status: 'requires_payment_method' } } }), 'incomplete + paiement refusé → remplaçable');
ok(!abonnementRemplacable({ status: 'incomplete', latest_invoice: { payment_intent: { status: 'processing' } } }), 'paiement en cours de traitement → jamais');
ok(!abonnementRemplacable({ status: 'active' }), 'actif → jamais');
ok(!abonnementRemplacable({ status: 'past_due' }), 'en retard → jamais');
ok(!abonnementRemplacable({ status: 'trialing' }), 'essai → jamais');

console.log('Pourquoi le paiement n\'est pas passé');
{
  // 01/10 13:14 — Apple Pay, banque : authentication_required (1A).
  const chApple = { id: 'ch_1', outcome: { type: 'issuer_declined', reason: 'authentication_required', network_decline_code: '1A' } };
  ok(causeEchec({ status: 'requires_payment_method', last_payment_error: { charge: 'ch_1', code: 'card_declined', decline_code: 'authentication_required', payment_method: { type: 'card' } } }, chApple) === 'authentification', 'Apple Pay refusé faute de 3D Secure → authentification');
  // 01/10 13:14 — même PaymentIntent, puis Klarna refuse (pas de charge sur l'erreur).
  ok(causeEchec({ status: 'requires_payment_method', last_payment_error: { code: 'payment_method_provider_decline', decline_code: 'klarna_payment_declined', payment_method: { type: 'klarna' } } }, chApple) === 'klarna', 'la DERNIÈRE tentative fait foi : Klarna');
  // 01/10 13:16 — Radar : refus générique côté erreur, « blocked » côté charge.
  const chRadar = { id: 'ch_2', outcome: { type: 'blocked', reason: 'highest_risk_level', risk_level: 'highest' } };
  ok(causeEchec({ status: 'requires_payment_method', last_payment_error: { charge: 'ch_2', code: 'card_declined', decline_code: 'generic_decline', payment_method: { type: 'card' } } }, chRadar) === 'radar', 'bloqué par Radar → radar');
  ok(causeEchec({ status: 'requires_payment_method', last_payment_error: { charge: 'ch_3', code: 'card_declined', decline_code: 'insufficient_funds' } }, null) === 'banque', 'refus de la banque → banque');
  ok(causeEchec({ status: 'requires_action', last_payment_error: null }, null) === 'authentification', 'validation en attente → authentification');
  ok(causeEchec({ status: 'requires_payment_method', last_payment_error: null }, null) === 'aucune_tentative', 'rien tenté → aucune_tentative');
  ok(causeEchec(null) === 'aucune_tentative', 'aucune tentative du tout');
}

if (echecs) { console.error(`\n${echecs} échec(s).`); process.exit(1); }
console.log('\n✅ Paiement Stripe : un client, une session, une cause lisible.');
