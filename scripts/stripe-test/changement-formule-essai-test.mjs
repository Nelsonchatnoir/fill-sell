// (14/11/2026, bloc F — décision de Nico) CHANGER DE FORMULE PENDANT UN ESSAI, EN MODE TEST STRIPE, avec de vrais objets
// du mode test (horloges de test, cartes pm_card_…) et NOS paramètres (supabase/functions/_shared/changement-formule.js) :
//   1. essai « Pro + Cloud » (49,99 €) → « Business » : le DEVIS (aperçu de facture, essai arrêté) dit 59,99 € et ne change
//      rien ; SANS confirmation, l'abonnement reste en essai au même prix ;
//   2. CONFIRMÉ, carte acceptée : l'essai s'arrête, 59,99 € payés, Business appliqué ;
//   3. CONFIRMÉ, carte refusée : rien ne change (toujours en essai, prix d'avant), une facture ouverte à régler (page Stripe) ;
//   4. CONFIRMÉ, 3-D Secure à valider : même chose, rien ne change tant que la personne n'a pas validé.
//   node scripts/stripe-test/changement-formule-essai-test.mjs     (Stripe CLI appariée, mode TEST ; jamais --live)
// ⛔ Jamais le mode réel : tout objet rendu avec livemode = true arrête le banc. Rien n'est écrit en base FillSell.
// Ménage : horloges de test (clients, abonnements, factures avec elles) effacées, produit désactivé.
import { spawnSync } from 'node:child_process';
import { changementAConfirmer, parametresChangement, requeteDevis, SANS_KLARNA, MOYENS_SANS_KLARNA, changerSansKlarna } from '../../supabase/functions/_shared/changement-formule.js';

const CLI = process.env.STRIPE_CLI || 'stripe';
if (spawnSync(CLI, ['version'], { encoding: 'utf8' }).status !== 0) { console.error('Stripe CLI introuvable (stripe login).'); process.exit(2); }
const enForm = (o, pre = '') => Object.entries(o ?? {}).flatMap(([k, v]) => {
  const nom = pre ? `${pre}[${k}]` : k;
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => (typeof x === 'object' ? enForm(x, `${nom}[${i}]`) : [[`${nom}[${i}]`, String(x)]]));
  if (typeof v === 'object') return enForm(v, nom);
  return [[nom, String(v)]];
});
function stripe(methode, chemin, corps = null) {
  const [base, requete] = chemin.split('?');
  const args = [methode.toLowerCase(), `/v1/${base}`, ...(methode === 'DELETE' ? ['--confirm'] : []), '--stripe-version', '2023-10-16'];
  for (const [k, v] of [...new URLSearchParams(requete ?? '').entries(), ...enForm(corps ?? {})]) args.push('-d', `${k}=${v}`);
  const r = spawnSync(CLI, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`stripe ${args[0]} ${args[1]} → ${String(r.stderr || r.stdout).slice(0, 200)}`); }
  if (j?.livemode === true) throw new Error('objet en mode RÉEL rendu : arrêt immédiat');
  if (j?.error) throw new Error(`${args[0]} ${args[1]} → ${j.error.message}`);
  return j;
}
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 400)}` : ''}`); if (!c) ko++; };
const horloges = [];
const produit = stripe('POST', 'products', { name: 'banc changement-formule-essai (test)', metadata: { banc: 'changement-formule-essai' } });
const proCloud = stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: 4999, recurring: { interval: 'month' } });
const business = stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: 5999, recurring: { interval: 'month' } });

function essaiProCloud(nom, carte) {
  const h = stripe('POST', 'test_helpers/test_clocks', { frozen_time: Math.floor(Date.now() / 1000), name: `changement-formule ${nom}` });
  horloges.push(h.id);
  const c = stripe('POST', 'customers', { email: `banc-chgt-${nom}@exemple.invalid`, test_clock: h.id });
  const pm = stripe('POST', `payment_methods/${carte}/attach`, { customer: c.id });
  stripe('POST', `customers/${c.id}`, { invoice_settings: { default_payment_method: pm.id } });
  const sub = stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: proCloud.id }], trial_period_days: 7, metadata: { formule: 'pro_cloud' } });
  return { c, sub };
}
function changer(c, sub) {
  return stripe('POST', `subscriptions/${sub.id}`, parametresChangement({ itemId: sub.items.data[0].id, prix: business.id, essai: true }));
}

try {
  console.log('1. Devis sans confirmation : rien ne change');
  const a = essaiProCloud('devis', 'pm_card_visa');
  const chg = changementAConfirmer({ abonnement: a.sub, formuleActuelle: 'pro_cloud', formuleVers: 'business' });
  ok(chg.aConfirmer && chg.essai && chg.perdCloud && chg.alternativeCloud === 'business_cloud', 'la règle demande la fenêtre (essai, Cloud perdu, « Business + Cloud » proposé)');
  const q = requeteDevis({ client: a.c.id, abonnementId: a.sub.id, itemId: a.sub.items.data[0].id, prix: business.id, essai: true });
  const qs = new URLSearchParams(enForm(q)).toString();
  const devis = stripe('GET', `invoices/upcoming?${qs}`);
  ok(devis.amount_due === 5999, 'devis exact : 59,99 € débités maintenant (essai arrêté)', devis.amount_due);
  const relu = stripe('GET', `subscriptions/${a.sub.id}`);
  ok(relu.status === 'trialing' && relu.items.data[0].price.id === proCloud.id, 'sans confirmation : toujours en essai, Pro + Cloud inchangé');

  console.log('2. Confirmé, carte acceptée : essai arrêté, payé, appliqué');
  const b = essaiProCloud('ok', 'pm_card_visa');
  const mb = changer(b.c, b.sub);
  ok(mb.status === 'active' && mb.items.data[0].price.id === business.id && !mb.pending_update, 'Business appliqué, l\'essai est fini', { status: mb.status });
  ok(mb.latest_invoice?.status === 'paid' && mb.latest_invoice?.amount_paid === 5999, '59,99 € payés tout de suite', mb.latest_invoice?.amount_paid);

  console.log('3. Confirmé, carte refusée : rien ne change');
  const r = essaiProCloud('refus', 'pm_card_chargeCustomerFail');
  const mr = changer(r.c, r.sub);
  ok(mr.status === 'trialing' && mr.items.data[0].price.id === proCloud.id && Boolean(mr.pending_update), 'toujours en essai, Pro + Cloud gardé (mise à jour en attente du paiement)');
  ok(mr.latest_invoice?.status === 'open' && Boolean(mr.latest_invoice?.hosted_invoice_url), 'une facture ouverte, sa page à régler — rien de payé', mr.latest_invoice?.status);

  console.log('4. Confirmé, 3-D Secure à valider : rien ne change tant que ce n\'est pas validé');
  const t = essaiProCloud('3ds', 'pm_card_authenticationRequired');
  const mt = changer(t.c, t.sub);
  ok(mt.status === 'trialing' && mt.items.data[0].price.id === proCloud.id && Boolean(mt.pending_update), 'toujours en essai, rien appliqué');

  // ── (14/11/2026 13:00, décision 8 de Nico) KLARNA RETIRÉ DE TOUS LES PAIEMENTS STRIPE ──────────────────────────────
  console.log('5. Klarna : jamais proposé, jamais prélevé pour un changement');
  const ck = stripe('POST', 'checkout/sessions', { mode: 'subscription', line_items: [{ price: proCloud.id, quantity: 1 }], success_url: 'https://fillsell.app/ok', ...SANS_KLARNA });
  ok(Array.isArray(ck.payment_method_types) && !ck.payment_method_types.includes('klarna') && ck.payment_method_types.includes('card'), 'Checkout : Klarna absent (SANS_KLARNA), la carte proposée', ck.payment_method_types);
  try { stripe('POST', `checkout/sessions/${ck.id}/expire`); } catch { /* rien */ }
  const fr = stripe('POST', `invoices/${mr.latest_invoice.id}`, { payment_settings: { payment_method_types: [...MOYENS_SANS_KLARNA] } });
  ok(String(fr.payment_settings?.payment_method_types) === 'card,link', 'la page d’une facture de changement à régler : carte et Link seulement', fr.payment_settings);
  // La voie « moyen enregistré = Klarna » (forcée sur une carte de test : un Klarna de test exige une redirection) : le
  // changement passe restreint à carte / Link, puis l'abonnement retrouve son réglage d'avant (renouvellements inchangés).
  const k = essaiProCloud('klarna', 'pm_card_visa');
  const stripeSdk = { subscriptions: {
    retrieve: async (id) => ({ ...stripe('GET', `subscriptions/${id}`), default_payment_method: { type: 'klarna' } }),
    update: async (id, p) => stripe('POST', `subscriptions/${id}`, p) } };
  const appels = [];
  const espion = { subscriptions: { retrieve: stripeSdk.subscriptions.retrieve, update: async (id, p) => { appels.push(Object.keys(p)); return stripeSdk.subscriptions.update(id, p); } } };
  const mk = await changerSansKlarna(espion, k.sub, parametresChangement({ itemId: k.sub.items.data[0].id, prix: business.id, essai: true }));
  const reluK = stripe('GET', `subscriptions/${k.sub.id}`);
  ok(appels.length === 3 && appels[0].includes('payment_settings') && appels[1].includes('items') && appels[2].includes('payment_settings'),
    'Klarna enregistré : restreint à carte / Link, le changement, puis le réglage d’avant rendu', appels);
  ok(mk.latest_invoice?.status === 'paid' && reluK.items.data[0].price.id === business.id && (reluK.payment_settings?.payment_method_types ?? null) === null,
    'le changement payé par un moyen permis, l’abonnement rendu à son réglage d’avant (ses renouvellements comme avant)', { facture: mk.latest_invoice?.status, types: reluK.payment_settings?.payment_method_types });
} catch (e) {
  ko++; console.error('✗ banc interrompu :', e.message);
} finally {
  for (const h of horloges) { try { stripe('DELETE', `test_helpers/test_clocks/${h}`); } catch { /* déjà effacée */ } }
  try { stripe('POST', `products/${produit.id}`, { active: false }); } catch { /* rien */ }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — mode test Stripe`);
process.exit(ko ? 1 : 0);
