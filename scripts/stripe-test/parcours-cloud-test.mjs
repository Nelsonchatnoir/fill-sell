// (05/11 soir, lot « Ouverture du Cloud », décision b de Nico) LE PARCOURS CLOUD EN MODE TEST STRIPE, DE BOUT EN BOUT,
// SANS RIEN DÉPLOYER : de vrais objets Stripe du MODE TEST (horloge de test pour avancer le temps, cartes de test par leurs
// jetons pm_card_… — jamais un numéro de carte tapé), rejoués dans NOTRE code de décision, celui du webhook
// (supabase/functions/_shared/cloud-option.js : drapeauxDepuisStripe → miseAJourProfilDepuisStripe → etatCloud) et du
// mail d'impayé (_shared/paiement-echoue.js). Six parcours : essai de 7 jours, passage au payant, résiliation pendant
// l'essai, paiement refusé, remboursement, et (point 7) la page de paiement qui expire avec la place gardée.
//
//   node scripts/stripe-test/parcours-cloud-test.mjs            (par la Stripe CLI appariée par « stripe login » : mode
//                                                               TEST par défaut, jamais --live ; la clé ne passe pas ici)
//   STRIPE_CLI=<chemin de stripe.exe> …                         (si la CLI n'est pas dans le PATH)
//   STRIPE_TEST_KEY=sk_test_… …  ou le fichier .stripe-test.key (repli : une clé de TEST posée par Nico)
//
// ⛔ Jamais le mode réel : une clé non « test » est refusée, la CLI n'est jamais lancée avec --live, et tout objet rendu
// avec livemode = true arrête le banc. Rien n'est écrit en base FillSell : les profils sont calculés en mémoire.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ESSAI_CLOUD_JOURS, drapeauxDepuisStripe, miseAJourProfilDepuisStripe, etatCloud, parametresCheckoutCloud,
} from '../../supabase/functions/_shared/cloud-option.js';
import { faitsEchec } from '../../supabase/functions/_shared/paiement-echoue.js';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const cle = (process.env.STRIPE_TEST_KEY || (existsSync(`${RACINE}.stripe-test.key`) ? readFileSync(`${RACINE}.stripe-test.key`, 'utf8') : '')).trim();
const CLI = process.env.STRIPE_CLI || 'stripe';
const viaCli = !cle;
if (cle && !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(cle)) {
  console.error('Clé refusée : seule une clé de TEST (sk_test_ / rk_test_) est acceptée, jamais une clé réelle.');
  process.exit(2);
}
if (viaCli) {
  const v = spawnSync(CLI, ['version'], { encoding: 'utf8' });
  if (v.status !== 0) { console.error('Ni clé de TEST ni Stripe CLI utilisable (stripe login).'); process.exit(2); }
}

// ── Stripe, en formulaire (aucune dépendance) ──
const enForm = (o, pre = '') => Object.entries(o ?? {}).flatMap(([k, v]) => {
  const n = pre ? `${pre}[${k}]` : k;
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => (typeof x === 'object' ? enForm(x, `${n}[${i}]`) : [[`${n}[${i}]`, String(x)]]));
  if (typeof v === 'object') return enForm(v, n);
  return [[n, String(v)]];
});
async function stripe(methode, chemin, corps = null) {
  if (viaCli) {
    // La Stripe CLI : mode TEST par défaut (jamais --live) ; les paramètres en -d (requête pour un GET, corps sinon).
    const [base, requete] = chemin.split('?');
    const args = [methode.toLowerCase(), `/v1/${base}`];
    for (const [k, v] of [...new URLSearchParams(requete ?? '').entries(), ...enForm(corps ?? {})]) args.push('-d', `${k}=${v}`);
    const r = spawnSync(CLI, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let j = null;
    try { j = JSON.parse(r.stdout); } catch { throw new Error(`stripe ${args[0]} ${args[1]} → ${String(r.stderr || r.stdout).slice(0, 200)}`); }
    if (j?.error) throw new Error(`${methode} ${chemin} → ${j.error.message ?? j.error.type}`);
    if (j?.livemode === true) throw new Error('objet en mode RÉEL rendu : arrêt immédiat');
    return j;
  }
  const r = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2026-03-25.dahlia' },
    body: corps ? new URLSearchParams(enForm(corps)).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${j?.error?.message ?? ''}`);
  if (j?.livemode === true) throw new Error('objet en mode RÉEL rendu : arrêt immédiat');
  return j;
}
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function avancer(horloge, t) {
  await stripe('POST', `test_helpers/test_clocks/${horloge}/advance`, { frozen_time: t });
  for (let i = 0; i < 90; i++) {
    const h = await stripe('GET', `test_helpers/test_clocks/${horloge}`);
    if (h.status === 'ready') return h;
    await pause(2000);
  }
  throw new Error('horloge de test : avance trop longue');
}

let n = 0, ko = 0;
const journal = [];
const ok = (c, m, detail) => { n++; journal.push({ ok: !!c, m, detail: detail ?? null }); console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };

// ── Le produit et le prix Cloud de TEST (24,99 €, essai 7 j), créés une fois ──
async function prixCloudTest() {
  const ps = await stripe('GET', 'products?limit=100');
  let produit = ps.data.find((p) => p.metadata?.option === 'cloud' && p.metadata?.banc === 'parcours-cloud-test');
  if (!produit) produit = await stripe('POST', 'products', { name: 'FillSell Cloud (test)', metadata: { option: 'cloud', banc: 'parcours-cloud-test' } });
  const prix = await stripe('GET', `prices?product=${produit.id}&active=true&limit=10`);
  let p = prix.data.find((x) => x.unit_amount === 2499 && x.currency === 'eur' && x.recurring?.interval === 'month');
  if (!p) p = await stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: 2499, nickname: 'FillSell Cloud Mensuel (test)',
    recurring: { interval: 'month', trial_period_days: ESSAI_CLOUD_JOURS }, metadata: { option: 'cloud', essai_jours: String(ESSAI_CLOUD_JOURS) } });
  return p;
}

/** Un client de test sur une horloge, avec une carte de test (jeton pm_card_…), et son abonnement Cloud en essai. */
async function clientEnEssai(prix, jetonCarte, nom) {
  const t0 = Math.floor(Date.now() / 1000);
  const horloge = await stripe('POST', 'test_helpers/test_clocks', { frozen_time: t0, name: `cloud ${nom}` });
  const client = await stripe('POST', 'customers', { email: `banc-cloud-${nom}@exemple.invalid`, test_clock: horloge.id, metadata: { banc: 'parcours-cloud-test' } });
  const pm = await stripe('POST', `payment_methods/${jetonCarte}/attach`, { customer: client.id });
  await stripe('POST', `customers/${client.id}`, { invoice_settings: { default_payment_method: pm.id } });
  // Les MÊMES paramètres que le Checkout de production (parametresCheckoutCloud) : métadonnées, essai.
  const base = parametresCheckoutCloud({ prixCloud: prix.id, essai: true, userId: `banc-${nom}` });
  const sub = await stripe('POST', 'subscriptions', { customer: client.id, items: [{ price: prix.id }],
    trial_period_days: base.subscription_data.trial_period_days, metadata: base.subscription_data.metadata });
  return { horloge: horloge.id, t0, client: client.id, sub };
}

/** Ce que le webhook écrirait, puis l'état Cloud qui en découle (à l'instant de l'horloge). */
async function profilApres(clientId, prix, maintenantS, profil = {}) {
  const subs = await stripe('GET', `subscriptions?customer=${clientId}&status=all&limit=20`);
  const d = drapeauxDepuisStripe(subs.data, { cloud: prix.id });
  const p = { ...profil, ...miseAJourProfilDepuisStripe(d, profil.cloud_canal ?? null) };
  return { profil: p, etat: etatCloud(p, maintenantS * 1000), subs: subs.data };
}

const prix = await prixCloudTest();
console.log(`Prix Cloud de test : ${prix.id} (${prix.unit_amount / 100} €, essai ${prix.recurring?.trial_period_days} j)`);

// 1 + 2. Essai de 7 jours, puis passage au payant.
console.log('\n1-2. Essai de 7 jours, puis passage au payant (carte de test pm_card_visa)');
{
  const c = await clientEnEssai(prix, 'pm_card_visa', 'essai');
  ok(c.sub.status === 'trialing', `abonnement en essai (${c.sub.status})`);
  ok(c.sub.trial_end - c.sub.trial_start === ESSAI_CLOUD_JOURS * 86_400, `essai de ${(c.sub.trial_end - c.sub.trial_start) / 86_400} jours`);
  const a = await profilApres(c.client, prix, c.t0 + 60);
  ok(a.etat.actif === true && a.profil.is_cloud === false && a.profil.cloud_essai_debut != null, 'pendant l’essai : Cloud actif, sans facturation (is_cloud faux, essai daté)');
  ok(a.profil.is_premium === false, 'aucun palier ouvert par le Cloud');
  const inv0 = await stripe('GET', `invoices?subscription=${c.sub.id}&limit=5`);
  ok(inv0.data.every((i) => i.amount_paid === 0), 'rien prélevé pendant l’essai');
  await avancer(c.horloge, c.sub.trial_end + 3600);
  const b = await profilApres(c.client, prix, c.sub.trial_end + 3600, a.profil);
  const subB = b.subs.find((s) => s.id === c.sub.id);
  ok(subB?.status === 'active', `fin de l’essai : abonnement actif (${subB?.status})`);
  const inv = await stripe('GET', `invoices?subscription=${c.sub.id}&limit=5`);
  const payee = inv.data.find((i) => i.amount_paid === 2499);
  ok(!!payee, 'première facture payée : 24,99 €', inv.data.map((i) => [i.status, i.amount_paid]));
  ok(b.profil.is_cloud === true && b.etat.actif === true, 'passage au payant : Cloud actif, payé');
  // 5. Remboursement de cette première facture, puis arrêt de l'abonnement (geste du support).
  console.log('\n5. Remboursement (geste du support), puis arrêt');
  const pi = payee?.payment_intent ?? payee?.payments?.data?.[0]?.payment?.payment_intent ?? null;
  let rembourse = null;
  if (pi) rembourse = await stripe('POST', 'refunds', { payment_intent: typeof pi === 'string' ? pi : pi.id, metadata: { banc: 'parcours-cloud-test' } });
  ok(rembourse?.status === 'succeeded' && rembourse.amount === 2499, `remboursement de 24,99 € (${rembourse?.status ?? 'aucun paiement trouvé'})`);
  await stripe('DELETE', `subscriptions/${c.sub.id}`);
  const r = await profilApres(c.client, prix, c.sub.trial_end + 7200, b.profil);
  ok(r.profil.is_cloud === false && r.etat.actif === false, 'abonnement arrêté : Cloud coupé');
}

// 3. Résiliation pendant l'essai : arrêt immédiat, rien prélevé.
console.log('\n3. Résiliation pendant l’essai');
{
  const c = await clientEnEssai(prix, 'pm_card_visa', 'resiliation');
  await avancer(c.horloge, c.t0 + 2 * 86_400);
  await stripe('DELETE', `subscriptions/${c.sub.id}`);   // cancel-subscription, en essai : arrêt IMMÉDIAT
  const a = await profilApres(c.client, prix, c.t0 + 2 * 86_400 + 60);
  ok(a.etat.actif === false && a.profil.is_cloud === false, 'Cloud arrêté tout de suite');
  ok(a.profil.cloud_essai_arrete === true, 'essai marqué « arrêté » (pris : pas de second essai)');
  await avancer(c.horloge, c.sub.trial_end + 3600);
  const inv = await stripe('GET', `invoices?customer=${c.client}&limit=10`);
  ok(inv.data.every((i) => i.amount_paid === 0), 'rien prélevé, même après la date de fin d’essai');
}

// 4. Paiement refusé à la fin de l'essai.
console.log('\n4. Paiement refusé à la fin de l’essai (carte de test pm_card_chargeCustomerFail)');
{
  const c = await clientEnEssai(prix, 'pm_card_chargeCustomerFail', 'refus');
  await avancer(c.horloge, c.sub.trial_end + 3600);
  const a = await profilApres(c.client, prix, c.sub.trial_end + 3600);
  const sub = a.subs.find((s) => s.id === c.sub.id);
  ok(['past_due', 'unpaid', 'incomplete', 'canceled'].includes(sub?.status), `abonnement en impayé (${sub?.status})`);
  ok(a.profil.is_cloud === false && a.etat.actif === false, 'impayé : le Cloud s’arrête tout de suite (règle du 03/11)');
  const inv = await stripe('GET', `invoices?subscription=${c.sub.id}&limit=5`);
  const echec = inv.data.find((i) => i.status === 'open' && i.amount_due === 2499);
  ok(!!echec, 'facture de 24,99 € restée ouverte (paiement refusé)');
  const f = faitsEchec({ facture: echec, abonnement: sub, estCloud: true });
  ok(f.abonnement_actif === false && f.offre === 'cloud', 'le mail d’impayé ne dit pas « reste actif »');
}

// 5. (point 7, serveur plein au paiement) La page de paiement du Cloud expire avec la place gardée : Stripe accepte les
// paramètres EXACTS de production (expires_at à 31 min) et une page expirée ne se paie plus.
console.log('\n5. Page de paiement Cloud : expire avec la place gardée (31 min), une page expirée ne se paie plus');
{
  const client = await stripe('POST', 'customers', { email: 'banc-cloud-page@exemple.invalid', metadata: { banc: 'parcours-cloud-test' } });
  const base = parametresCheckoutCloud({ prixCloud: prix.id, essai: true, userId: 'banc-page' });
  const s = await stripe('POST', 'checkout/sessions', { ...base, customer: client.id,
    success_url: 'https://fillsell.app/success?produit=cloud&essai=1&session_id={CHECKOUT_SESSION_ID}', cancel_url: 'https://fillsell.app/cancel' });
  ok(s.status === 'open' && s.expires_at === base.expires_at, `session ouverte, expiration acceptée par Stripe (${new Date(s.expires_at * 1000).toISOString()})`);
  const e = await stripe('POST', `checkout/sessions/${s.id}/expire`);
  ok(e.status === 'expired' && !e.url, 'expirée : plus de lien de paiement (la personne repasse par l’app et la place est relue)');
}

const rapport ={ le: new Date().toISOString(), prix_test: prix.id, controles: n, echecs: ko, journal };
mkdirSync(`${RACINE}build`, { recursive: true });
writeFileSync(`${RACINE}build/parcours-cloud-test.json`, JSON.stringify(rapport, null, 2));
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles. Rapport : build/parcours-cloud-test.json`);
process.exit(ko === 0 ? 0 : 1);
