// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (3e réponse de Nico, point b) — UN REMBOURSEMENT STRIPE EST TRAITÉ COMME CHEZ APPLE
//     npm run selftest:remboursement-stripe
// ═══════════════════════════════════════════════════════════════════════════
// « Remboursement Stripe : traite-le comme chez Apple (droits coupés, alerte support). » Avant : stripe-webhook ne traitait
// aucun charge.refunded (audit du 13/11, R3) ; Apple REFUND / REVOKE coupe le droit et alerte « ↩️ Remboursement »
// (apple-iap-webhook), sans mail client ; et le Cloud SEUL remboursé par Apple était coupé SANS alerte.
// Cas RÉELS (Stripe relu le 13/11, lecture seule : 4 remboursements) :
//   · 785352fe — re_3UaISD… 8,66 € sur sa facture Pro de 29,99 € (10/11 18:43, motif « Chevauchement Premium Apple
//     10/11-30/11 après passage Pro Stripe ») : PARTIEL → le Pro est gardé, l'alerte part ;
//   · 447d920c — re_3URxQy… 19,80 € (18/10 19:24, Business du 2e compte, code non appliqué) : PARTIEL → gardé.
// Un remboursement TOTAL de la facture en cours coupe palier ET Cloud de cet abonnement, durablement (tant que la dernière
// facture est remboursée), sans rien écrire chez Stripe ni écrire au client.
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

const R = await importer('supabase/functions/_shared/remboursement-stripe.js');
const C = await importer('supabase/functions/_shared/cloud-option.js');

console.log('A. La décision, sur les cas réels et la règle d’Apple');
if (R.decisionRemboursementStripe) {
  const sub785 = { id: 'sub_1UaISDQZRA77vrWJVACbgfhI', status: 'active', latest_invoice: 'in_1UaISDQZRA77vrWJdBA3W5l8' };
  const fac785 = { id: 'in_1UaISDQZRA77vrWJdBA3W5l8', amount_paid: 2999, subscription: sub785.id };
  const d785 = R.decisionRemboursementStripe({ charge: { id: 'ch_3UaISD', amount: 2999, amount_refunded: 866, refunded: false }, facture: fac785, abonnement: sub785 });
  ok(d785.type === 'abonnement' && d785.total === false && d785.couper === false, '785352fe : 8,66 € rendus sur 29,99 € (partiel) → le Pro est gardé', JSON.stringify(d785));
  const d447 = R.decisionRemboursementStripe({ charge: { amount: 5999, amount_refunded: 1980, refunded: false }, facture: { id: 'in_x', amount_paid: 5999 }, abonnement: { id: 'sub_x', status: 'active', latest_invoice: 'in_x' } });
  ok(d447.couper === false && d447.total === false, '447d920c : 19,80 € rendus (partiel) → gardé');
  const dTot = R.decisionRemboursementStripe({ charge: { amount: 2999, amount_refunded: 2999, refunded: true }, facture: fac785, abonnement: sub785 });
  ok(dTot.couper === true && /retiré/.test(dTot.droit) && /reste ACTIF chez Stripe/.test(dTot.droit), 'remboursement TOTAL de la facture en cours → droits coupés (comme Apple REFUND), l’alerte dit d’annuler chez Stripe si voulu', JSON.stringify(dTot));
  ok(R.decisionRemboursementStripe({ charge: { refunded: true }, facture: { id: 'in_ancienne' }, abonnement: { id: 's', status: 'active', latest_invoice: 'in_recente' } }).couper === false, 'facture d’une période PASSÉE remboursée → la période en cours (payée) est gardée');
  ok(R.decisionRemboursementStripe({ charge: { refunded: true }, facture: { id: 'in_1' }, abonnement: { id: 's', status: 'canceled', latest_invoice: 'in_1' } }).couper === false, 'abonnement déjà terminé → rien à couper');
  const dPack = R.decisionRemboursementStripe({ charge: { refunded: true, metadata: { purchase_type: 'coins' } }, facture: null, abonnement: null });
  ok(dPack.type === 'pack' && dPack.couper === false && /Pépites restent créditées/.test(dPack.droit), 'pack de Pépites remboursé → alerte seule, Pépites gardées (même règle qu’Apple / Google)');
  ok(R.factureDeCharge({ invoice: 'in_9' }) === 'in_9' && R.abonnementDeLaFacture({ parent: { subscription_details: { subscription: 'sub_9' } } }) === 'sub_9', 'les deux formes d’objets Stripe sont lues (2023-10-16 et dahlia)');
}

console.log('\nB. Durable : un abonnement dont la période est remboursée ne porte plus rien, quel que soit l’événement');
if (R.periodeRemboursee && C.drapeauxDepuisStripe) {
  const prix = { pro: 'price_pro', pro_cloud: 'price_pro_cloud', cloud: 'price_cloud' };
  const sPro = { id: 'sub_p', status: 'active', latest_invoice: 'in_p', metadata: { plan_type: 'pro' }, items: { data: [{ price: { id: 'price_pro' } }] } };
  ok(R.periodeRemboursee(sPro, { id: 'in_p', amount_paid: 2999, charge: { amount: 2999, amount_refunded: 2999, refunded: true } }) === true, 'dernière facture payée puis remboursée en entier → période remboursée');
  ok(R.periodeRemboursee(sPro, { id: 'in_p', amount_paid: 2999, charge: { amount: 2999, amount_refunded: 866 } }) === false, 'partiel (785352fe) → pas remboursée');
  ok(R.periodeRemboursee({ ...sPro, status: 'trialing' }, { id: 'in_p', amount_paid: 0, charge: null }) === false, 'essai (0 € payé) → jamais « remboursée »');
  const d = C.drapeauxDepuisStripe([{ ...sPro, fillsell_periode_remboursee: true }], prix);
  ok(d.is_premium === false && d.is_pro === false, 'Pro remboursé → drapeaux Stripe à faux (les autres canaux restent : drapeauxStripeAvecStores)', JSON.stringify(d));
  const sF = { id: 'sub_f', status: 'active', latest_invoice: 'in_f', metadata: { plan_type: 'pro', formule: 'pro_cloud' }, items: { data: [{ price: { id: 'price_pro_cloud' } }] }, current_period_end: 1796922209 };
  const dF = C.drapeauxDepuisStripe([{ ...sF, fillsell_periode_remboursee: true }], prix);
  ok(dF.is_pro === false && dF.is_cloud === false && dF.cloud_vivant === false, 'Pro + Cloud remboursé → palier ET Cloud coupés', JSON.stringify(dF));
  const sC = { id: 'sub_c', status: 'active', latest_invoice: 'in_c', metadata: { option: 'cloud' }, items: { data: [{ price: { id: 'price_cloud' } }] } };
  const dC = C.drapeauxDepuisStripe([{ ...sC, fillsell_periode_remboursee: true }], prix);
  ok(dC.is_cloud === false && dC.cloud_vivant === false, 'Cloud SEUL remboursé → Cloud coupé (R3)', JSON.stringify(dC));
  const dSans = C.drapeauxDepuisStripe([sPro], prix);
  ok(dSans.is_pro === true, 'zéro régression : sans remboursement, le Pro payé reste Pro');
}

console.log('\nC. stripe-webhook : charge.refunded traité, l’alerte part, aucun mail client, rien écrit chez Stripe');
const w = lire('supabase/functions/stripe-webhook/index.ts');
const i0 = w.indexOf('if (event.type === "charge.refunded")');
const bloc = i0 >= 0 ? w.slice(i0, w.indexOf('\n  }\n', i0)) : '';
ok(i0 > 0, 'stripe-webhook écoute charge.refunded');
ok(/decisionRemboursementStripe\(/.test(bloc) && /if \(dR\.couper[^)]*\) await recomputeStripeFlags\(/.test(bloc), 'remboursement total de la période en cours → recalcul des droits (palier et Cloud coupés)');
ok(/signalerRemboursementStore\(\{\s*canal: "stripe"/.test(bloc), 'alerte « ↩️ Remboursement » à support@ (canal stripe)');
ok(bloc && !/mailsCloud|signalerPaiementEchoue|envoyer_mail|notifierPaiement/.test(bloc), 'aucun mail client');
ok(bloc && !/stripe\.(subscriptions|refunds|invoices)\.(cancel|update|del|create)|stripe\.subscriptions\.cancel/.test(bloc), 'rien écrit chez Stripe (aucune annulation, aucun remboursement)');
const rec = w.slice(w.indexOf('async function annoterRemboursements'), w.indexOf('// (08/11) Les mails Cloud d\'un client Stripe'));
ok(/periodeRemboursee\(/.test(rec) && /expand: \["charge"\]/.test(rec) && /const subs = await annoterRemboursements\(subsBruts/.test(rec), 'recomputeStripeFlags relit la dernière facture (avec sa charge) : un autre événement ne rouvre pas les droits remboursés');
const lit = lire('supabase/functions/_shared/cloud-option.js');
ok(/fillsell_periode_remboursee === true/.test(lit), 'litAbonnementStripe : une période remboursée ne paie rien');
ok(/canal: "apple" \| "google" \| "stripe"/.test(lire('supabase/functions/_shared/payment-notify.ts')), 'payment-notify : le remboursement accepte le canal stripe');
ok(/Stripe a rendu l'argent au client/.test(lire('supabase/functions/email-tunnel/index.ts')), 'email-tunnel : l’alerte d’un remboursement Stripe dit qui a rendu l’argent');

console.log('\nD. Apple : le Cloud SEUL remboursé alerte aussi (R3)');
const a = lire('supabase/functions/apple-iap-webhook/index.ts');
const ac = a.slice(a.indexOf('const lectureCloud = lectureCloudApple(tx, renouvCloud);'), a.indexOf('// ── (11/11/2026) LE GROUPE « FillSell Plan »'));
ok(/if \(natureRemb && sens === "off"\)[\s\S]{0,200}signalerRemboursementStore\(/.test(ac), 'apple-iap-webhook : Cloud seul REFUND / REVOKE → « ↩️ Remboursement » à support@');

console.log(`\n${rouges === 0 ? '✓' : '✗'} remboursement-stripe : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
