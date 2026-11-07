// (08/11/2026, ordre de Nico : « Cloud — dernières finitions », PREUVE Stripe) LA RÉSILIATION DU CLOUD EN MODE TEST
// STRIPE, avec de VRAIS objets du mode test (horloges de test, cartes de test pm_card_…), rejoués dans NOTRE code :
// ce que cancel-subscription fait chez Stripe (annulation immédiate pendant l'essai ; cancel_at_period_end une fois
// payé), puis les décisions écrites et les mails (_shared/cloud-option.js, _shared/cloud-mails.js) :
//   1. essai → arrêt pendant l'essai : Stripe montre l'abonnement annulé avant la fin de l'essai, AUCUNE facture payée,
//      même après la date de fin d'essai (horloge avancée) → mail « arrêt pendant l'essai, aucun prélèvement » ;
//   2. essai → prix de la PREMIÈRE échéance lu sur la facture à venir (mail de début d'essai) ;
//   3. essai → fin d'essai payée (24,99 € lus sur la facture payée → mail de paiement) → arrêt (cancel_at_period_end)
//      → mail d'arrêt programmé avec la date de fin (même clé quel que soit le format d'API) → réabonnement (levé) →
//      ré-arrêt → horloge avancée après l'échéance : abonnement terminé, Cloud coupé, aucune nouvelle facture.
//
//   node scripts/stripe-test/resiliation-cloud-test.mjs     (Stripe CLI appariée, mode TEST ; jamais --live)
// ⛔ Jamais le mode réel : tout objet rendu avec livemode = true arrête le banc. Rien n'est écrit en base FillSell.
// Ménage : les horloges de test (et leurs clients, abonnements, factures) sont effacées à la fin.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESSAI_CLOUD_JOURS, drapeauxDepuisStripe, miseAJourProfilDepuisStripe, etatCloud, parametresCheckoutCloud } from '../../supabase/functions/_shared/cloud-option.js';
import { evenementArretStripe, evenementPaiementStripe, montantStripe, texteMailCloud } from '../../supabase/functions/_shared/cloud-mails.js';

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
  if (j?.error) throw new Error(`${methode} ${chemin} → ${j.error.message ?? j.error.type}`);
  if (j?.livemode === true) throw new Error('objet en mode RÉEL rendu : arrêt immédiat');
  return j;
}
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function avancer(horloge, t) {
  stripe('POST', `test_helpers/test_clocks/${horloge}/advance`, { frozen_time: t });
  for (let i = 0; i < 90; i++) { if (stripe('GET', `test_helpers/test_clocks/${horloge}`).status === 'ready') return; await pause(2000); }
  throw new Error('horloge de test : avance trop longue');
}
let n = 0, ko = 0;
const journal = [];
const ok = (c, m, d) => { n++; journal.push({ ok: !!c, m, detail: d ?? null }); console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 500)}` : ''}`); if (!c) ko++; };
const horloges = [];

function prixCloudTest() {
  const ps = stripe('GET', 'products?limit=100');
  let produit = ps.data.find((p) => p.metadata?.option === 'cloud' && p.metadata?.banc === 'parcours-cloud-test');
  if (!produit) produit = stripe('POST', 'products', { name: 'FillSell Cloud (test)', metadata: { option: 'cloud', banc: 'parcours-cloud-test' } });
  const prix = stripe('GET', `prices?product=${produit.id}&active=true&limit=10`);
  let p = prix.data.find((x) => x.unit_amount === 2499 && x.currency === 'eur' && x.recurring?.interval === 'month');
  if (!p) p = stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: 2499, nickname: 'FillSell Cloud Mensuel (test)', recurring: { interval: 'month' }, metadata: { option: 'cloud' } });
  return p;
}
function clientEnEssai(prix, nom) {
  const t0 = Math.floor(Date.now() / 1000);
  const horloge = stripe('POST', 'test_helpers/test_clocks', { frozen_time: t0, name: `resiliation ${nom}` });
  horloges.push(horloge.id);
  const client = stripe('POST', 'customers', { email: `banc-resiliation-${nom}@exemple.invalid`, test_clock: horloge.id, metadata: { banc: 'resiliation-cloud-test' } });
  const pm = stripe('POST', 'payment_methods/pm_card_visa/attach', { customer: client.id });
  stripe('POST', `customers/${client.id}`, { invoice_settings: { default_payment_method: pm.id } });
  const base = parametresCheckoutCloud({ prixCloud: prix.id, essai: true, userId: `banc-${nom}` });
  const sub = stripe('POST', 'subscriptions', { customer: client.id, items: [{ price: prix.id }], trial_period_days: base.subscription_data.trial_period_days, metadata: base.subscription_data.metadata });
  return { horloge: horloge.id, t0, client: client.id, sub };
}
const profilDe = (clientId, prix, profil = {}) => {
  const subs = stripe('GET', `subscriptions?customer=${clientId}&status=all&limit=20`);
  return { ...profil, ...miseAJourProfilDepuisStripe(drapeauxDepuisStripe(subs.data, { cloud: prix.id }), profil.cloud_canal ?? null) };
};

try {
  const prix = prixCloudTest();
  console.log(`Prix Cloud de test : ${prix.id} (${prix.unit_amount / 100} €)`);

  console.log('\n1. Arrêt PENDANT l\'essai (ce que fait cancel-subscription : annulation immédiate)');
  {
    const c = clientEnEssai(prix, 'essai');
    await avancer(c.horloge, c.t0 + 2 * 86_400);
    const annule = stripe('DELETE', `subscriptions/${c.sub.id}`);
    const factures = stripe('GET', `invoices?subscription=${c.sub.id}&limit=20`).data;
    const evs = evenementArretStripe(annule, factures);
    ok(annule.status === 'canceled' && annule.ended_at < annule.trial_end, `Stripe : abonnement annulé (${annule.status}) avant la fin de l'essai`);
    ok(factures.every((f) => f.amount_paid === 0), `Stripe : ${factures.length} facture(s), toutes à 0 € payés`, factures.map((f) => [f.status, f.amount_paid]));
    ok(evs.length === 1 && evs[0].evenement === 'arret_essai' && evs[0].faits.aucunPrelevement === true, 'mail « arrêt pendant l\'essai, aucun prélèvement » décidé sur ce que Stripe MONTRE', evs);
    const p = profilDe(c.client, prix);
    ok(p.cloud_essai_arrete === true && etatCloud(p, (c.t0 + 2 * 86_400 + 60) * 1000).actif === false, 'profil écrit : essai arrêté, Cloud inactif tout de suite');
    await avancer(c.horloge, c.sub.trial_end + 2 * 86_400);
    const apres = stripe('GET', `invoices?customer=${c.client}&limit=20`).data;
    ok(apres.every((f) => f.amount_paid === 0), 'deux jours APRÈS la date de fin d\'essai : toujours rien prélevé');
    const t = texteMailCloud({ evenement: 'arret_essai', lang: 'fr', canal: 'stripe', faits: evs[0].faits });
    ok(/Aucun prélèvement/.test(t.paragraphes.join(' ')), `texte : « ${t.sujet} »`);
  }

  console.log('\n2-3. Fin d\'essai payée, arrêt programmé, réabonnement, coupure à l\'échéance');
  {
    const c = clientEnEssai(prix, 'paye');
    const aVenir = stripe('GET', `invoices/upcoming?subscription=${c.sub.id}`);
    const m = montantStripe(aVenir.amount_due, aVenir.currency);
    ok(m?.montant === 24.99 && m.devise === 'EUR', `début d'essai : la première échéance lue sur la facture à venir = ${m?.montant} ${m?.devise}`, aVenir.amount_due);
    await avancer(c.horloge, c.sub.trial_end + 3600);
    const sub = stripe('GET', `subscriptions/${c.sub.id}`);
    const payee = stripe('GET', `invoices?subscription=${c.sub.id}&limit=5`).data.find((f) => f.amount_paid > 0);
    const evP = evenementPaiementStripe(payee, sub);
    ok(sub.status === 'active' && evP[0]?.faits.contexte === 'fin_essai' && evP[0].faits.montant?.montant === 24.99, `fin d'essai : facture ${payee?.id} payée 24,99 € → mail « fin d'essai », montant lu sur la facture`, evP);
    const programme = stripe('POST', `subscriptions/${c.sub.id}`, { cancel_at_period_end: true });
    const evA = evenementArretStripe(programme);
    const finIso = new Date(programme.current_period_end * 1000).toISOString();
    const formatRecent = { ...programme, current_period_end: undefined, items: { data: [{ current_period_end: programme.current_period_end }] } };
    ok(evA[0]?.evenement === 'arret_programme' && evA[0].faits.finIso === finIso && evA[0].cle === evenementArretStripe(formatRecent)[0]?.cle,
      `arrêt après l'essai : programmé au ${finIso.slice(0, 10)} (même clé que l'événement du webhook)`, evA);
    let p = profilDe(c.client, prix);
    ok(p.is_cloud === true && p.cloud_arret_fin_periode === true && etatCloud(p, (c.sub.trial_end + 7200) * 1000).actif === true, 'profil : payé, arrêt programmé, le Cloud tourne jusqu\'à l\'échéance');
    stripe('POST', `subscriptions/${c.sub.id}`, { cancel_at_period_end: false });
    p = profilDe(c.client, prix);
    ok(p.cloud_arret_fin_periode === false && p.is_cloud === true, 'réabonnement avant l\'échéance : arrêt levé, rien coupé');
    stripe('POST', `subscriptions/${c.sub.id}`, { cancel_at_period_end: true });
    await avancer(c.horloge, programme.current_period_end + 3600);
    const fin = stripe('GET', `subscriptions/${c.sub.id}`);
    const toutes = stripe('GET', `invoices?subscription=${c.sub.id}&limit=20`).data;
    p = profilDe(c.client, prix);
    ok(fin.status === 'canceled' && p.is_cloud === false && etatCloud(p, (programme.current_period_end + 3700) * 1000).actif === false, `à l'échéance : abonnement ${fin.status}, Cloud coupé`);
    ok(toutes.filter((f) => f.amount_paid > 0).length === 1, 'une seule facture payée en tout (la fin d\'essai) : rien prélevé après l\'arrêt', toutes.map((f) => [f.billing_reason, f.amount_paid]));
  }
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  for (const h of horloges) { try { stripe('DELETE', `test_helpers/test_clocks/${h}`); } catch (e) { console.log(`  (horloge ${h} non effacée : ${e.message.slice(0, 80)})`); } }
  console.log(`  ménage : ${horloges.length} horloge(s) de test effacée(s) (clients, abonnements et factures de test avec elles)`);
}
mkdirSync(`${RACINE}build`, { recursive: true });
writeFileSync(`${RACINE}build/resiliation-cloud-test.json`, JSON.stringify({ le: new Date().toISOString(), controles: n, echecs: ko, journal }, null, 2));
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles. Rapport : build/resiliation-cloud-test.json`);
process.exit(ko === 0 ? 0 : 1);
