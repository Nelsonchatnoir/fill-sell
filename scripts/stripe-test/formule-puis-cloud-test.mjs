// (08/11/2026, point 1 de Nico : « formule + FillSell Cloud » n'achetait que la formule) LE PARCOURS EN DEUX ACHATS, EN
// MODE TEST STRIPE, avec de VRAIS objets du mode test (horloge de test, cartes pm_card_…), rejoués dans NOTRE code de
// décision (supabase/functions/_shared/cloud-option.js : drapeauxDepuisStripe → miseAJourProfilDepuisStripe → etatCloud)
// et dans les textes de l'étape 2 (src/cloud/cloudEnsuite.js : issueCloudEnsuite) :
//   1. Pro d'abord : le profil est Pro, SANS Cloud — exactement ce que la fenêtre « Bienvenue » dit (« FillSell Cloud ne
//      l'est pas encore ») ; puis l'étape 2 (abonnement Cloud à part, essai de 7 jours) : Pro ET Cloud en essai, deux
//      abonnements distincts du même client ;
//   2. étape 2 abandonnée (la page de paiement du Cloud expire sans paiement) : Pro reste, aucun Cloud — l'issue dite est
//      « FillSell Cloud n'a pas été ajouté. Ta formule Pro reste active. » ;
//   3. étape 2 refusée (carte refusée, sans essai) : abonnement Cloud non vivant, Pro intact, issue « pas ajouté ».
//
//   node scripts/stripe-test/formule-puis-cloud-test.mjs     (Stripe CLI appariée, mode TEST ; jamais --live)
// ⛔ Jamais le mode réel : tout objet rendu avec livemode = true arrête le banc. Rien n'est écrit en base FillSell.
// Ménage : les horloges de test (et leurs clients, abonnements, factures) sont effacées à la fin.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drapeauxDepuisStripe, miseAJourProfilDepuisStripe, etatCloud, parametresCheckoutCloud } from '../../supabase/functions/_shared/cloud-option.js';
import { issueCloudEnsuite } from '../../src/cloud/cloudEnsuite.js';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
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
  return j;
}
const exiger = (j, quoi) => { if (j?.error) throw new Error(`${quoi} → ${j.error.message ?? j.error.type}`); return j; };
let n = 0, ko = 0;
const journal = [];
const ok = (c, m, d) => { n++; journal.push({ ok: !!c, m, detail: d ?? null }); console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 500)}` : ''}`); if (!c) ko++; };
const horloges = [];

function prixTest(option, montant, nom) {
  const ps = exiger(stripe('GET', 'products?limit=100'), 'produits');
  let produit = ps.data.find((p) => p.metadata?.banc === 'formule-puis-cloud' && p.metadata?.option === option);
  if (!produit) produit = exiger(stripe('POST', 'products', { name: `${nom} (test)`, metadata: { banc: 'formule-puis-cloud', option } }), 'produit');
  const prix = exiger(stripe('GET', `prices?product=${produit.id}&active=true&limit=10`), 'prix');
  let p = prix.data.find((x) => x.unit_amount === montant && x.currency === 'eur' && x.recurring?.interval === 'month');
  if (!p) p = exiger(stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: montant, recurring: { interval: 'month' }, metadata: { option } }), 'prix');
  return p;
}
function client(nom, carte = 'pm_card_visa') {
  const t0 = Math.floor(Date.now() / 1000);
  const horloge = exiger(stripe('POST', 'test_helpers/test_clocks', { frozen_time: t0, name: `formule-puis-cloud ${nom}` }), 'horloge');
  horloges.push(horloge.id);
  const c = exiger(stripe('POST', 'customers', { email: `banc-formule-cloud-${nom}@exemple.invalid`, test_clock: horloge.id, metadata: { banc: 'formule-puis-cloud' } }), 'client');
  const pm = exiger(stripe('POST', `payment_methods/${carte}/attach`, { customer: c.id }), 'carte');
  exiger(stripe('POST', `customers/${c.id}`, { invoice_settings: { default_payment_method: pm.id } }), 'carte par défaut');
  return { id: c.id, t0 };
}
const profil = (clientId, prix) => {
  const subs = exiger(stripe('GET', `subscriptions?customer=${clientId}&status=all&limit=20`), 'abonnements');
  return { subs: subs.data, p: miseAJourProfilDepuisStripe(drapeauxDepuisStripe(subs.data, prix), null) };
};

try {
  const prixPro = prixTest('pro', 2999, 'FillSell Pro');
  const prixCloud = prixTest('cloud', 2499, 'FillSell Cloud');
  const PRIX = { pro: prixPro.id, cloud: prixCloud.id };
  console.log(`Prix de test : Pro ${prixPro.id} (29,99 €), Cloud ${prixCloud.id} (24,99 €)`);

  console.log('\n1. Pro, puis l\'étape 2 « Ajouter FillSell Cloud »');
  {
    const c = client('ok');
    const pro = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: prixPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    let { p } = profil(c.id, PRIX);
    ok(pro.status === 'active' && p.is_pro === true && p.is_premium === true, 'étape 1 : Pro payé, le profil est Pro', { status: pro.status, p });
    ok(etatCloud(p, Date.now()).actif === false && !p.cloud_essai_debut, 'étape 1 : AUCUN Cloud — c’est ce que dit la fenêtre « Bienvenue » (étape 2 proposée)');
    const base = parametresCheckoutCloud({ prixCloud: prixCloud.id, essai: true, userId: 'banc-ok' });
    const cloud = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: prixCloud.id }], trial_period_days: base.subscription_data.trial_period_days, metadata: base.subscription_data.metadata }), 'abonnement Cloud');
    const r = profil(c.id, PRIX);
    p = r.p;
    ok(cloud.status === 'trialing' && cloud.id !== pro.id && r.subs.filter((s) => ['active', 'trialing'].includes(s.status)).length === 2, 'étape 2 : un DEUXIÈME abonnement, à part, en essai', r.subs.map((s) => [s.id, s.status]));
    ok(p.is_pro === true && etatCloud(p, Date.now()).actif === true && !!p.cloud_essai_debut, 'après l’étape 2 : Pro ET FillSell Cloud (essai) sur le même compte', p);
    const issue = issueCloudEnsuite({ etat: 'actif' }, 'pro', 'fr');
    ok(issue.cle === 'actif' && /FillSell Cloud est ajouté/.test(issue.titre), `issue dite : « ${issue.titre} »`);
  }

  console.log('\n2. Étape 2 abandonnée : la page de paiement du Cloud expire sans paiement');
  {
    const c = client('abandon');
    exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: prixPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const session = exiger(stripe('POST', 'checkout/sessions', { mode: 'subscription', customer: c.id, line_items: [{ price: prixCloud.id, quantity: 1 }],
      success_url: 'https://fillsell.app/success?produit=cloud', cancel_url: 'https://fillsell.app/app' }), 'session Cloud');
    const expiree = exiger(stripe('POST', `checkout/sessions/${session.id}/expire`), 'expiration');
    const { p, subs } = profil(c.id, PRIX);
    ok(expiree.status === 'expired' && subs.length === 1, 'Stripe : session du Cloud expirée, un seul abonnement (Pro)', { status: expiree.status, subs: subs.map((s) => s.status) });
    ok(p.is_pro === true && etatCloud(p, Date.now()).actif === false, 'profil : Pro intact, aucun Cloud');
    const issue = issueCloudEnsuite({ etat: 'annule' }, 'pro', 'fr');
    ok(issue.cle === 'annule' && /n'a pas été ajouté/.test(issue.titre) && /Ta formule Pro reste active/.test(issue.texte), `issue dite : « ${issue.titre} » — « …${issue.texte.slice(-90)} »`);
  }

  console.log('\n3. Étape 2 refusée : carte refusée, sans essai');
  {
    const c = client('refus');
    exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: prixPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const refus = exiger(stripe('POST', 'payment_methods/pm_card_chargeCustomerFail/attach', { customer: c.id }), 'carte refusée');
    const cloud = stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: prixCloud.id }], default_payment_method: refus.id, payment_behavior: 'default_incomplete', metadata: { option: 'cloud' } });
    const { p } = profil(c.id, PRIX);
    ok(!!cloud?.error || ['incomplete', 'incomplete_expired'].includes(cloud?.status), `Stripe : le Cloud n'est pas payé (${cloud?.error?.code ?? cloud?.status})`);
    ok(p.is_pro === true && etatCloud(p, Date.now()).actif === false, 'profil : Pro intact, Cloud NON vivant (un abonnement incomplet n’ouvre rien)', p);
    const issue = issueCloudEnsuite({ etat: 'erreur', message: "Le paiement du Cloud n'a pas pu s'ouvrir. Rien n'a été prélevé : réessaie dans un instant." }, 'pro', 'fr');
    ok(issue.cle === 'echec' && /Ta formule Pro reste active/.test(issue.texte), `issue dite : « ${issue.titre} »`);
  }
} catch (e) {
  ko++;
  console.error(`✗ banc interrompu : ${e.message}`);
} finally {
  for (const h of horloges) { try { stripe('DELETE', `test_helpers/test_clocks/${h}`); } catch { /* ménage best-effort */ } }
  console.log(`  ménage : ${horloges.length} horloge(s) de test effacée(s) (clients, abonnements et factures de test avec elles)`);
}
mkdirSync(`${RACINE}build`, { recursive: true });
writeFileSync(`${RACINE}build/formule-puis-cloud-test.json`, JSON.stringify({ le: new Date().toISOString(), controles: n, rouges: ko, journal }, null, 2));
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\nTout est vert — ${n} contrôles. Rapport : build/formule-puis-cloud-test.json`);
process.exit(ko ? 1 : 0);
