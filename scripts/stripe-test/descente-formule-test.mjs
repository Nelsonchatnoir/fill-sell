// (09/11/2026 nuit, point C4 de Nico) DESCENDRE DE FORMULE À LA FIN DE LA PÉRIODE, EN MODE TEST STRIPE, avec de VRAIS
// objets du mode test (horloges de test, cartes pm_card_…), rejoués dans NOTRE code de décision :
// supabase/functions/_shared/descente-formule.js (parametresDescente, descentePrevue, colonnesDescente),
// _shared/cloud-option.js (drapeauxDepuisStripe → miseAJourProfilDepuisStripe) et _shared/paiement-stripe.js
// (palierDeFacture : le crédit du mois suit ce que Stripe facture).
//   A. Pro → Premium : programmée, Pro ENTIER jusqu'à la fin de période, rien facturé ; à l'échéance, 12,99 € et Premium
//      seulement (is_pro faux) ; la descente n'est plus « prévue » ; l'abonnement continue seul au nouveau prix.
//   B. Business → Pro : à l'échéance, Pro (is_business faux), 29,99 €.
//   C. Annuler la descente avant l'échéance (release) : Pro reste, 29,99 € à l'échéance, plus rien de prévu.
//   D. Monter pendant une descente prévue : ce que Stripe fait d'une mise à jour directe, puis release d'abord → la
//      montée passe et la descente disparaît.
//   E. Résilier pendant une descente prévue : idem (release d'abord, puis cancel_at_period_end).
//   F. Le Cloud (abonnement à part) n'est jamais touché par la descente de la formule.
//   G. Contrôle témoin : SANS la métadonnée de phase 2, un Pro passé au prix Premium resterait Pro (le piège documenté).
//
//   node scripts/stripe-test/descente-formule-test.mjs     (Stripe CLI appariée, mode TEST ; jamais --live)
// ⛔ Jamais le mode réel : tout objet rendu avec livemode = true arrête le banc. Rien n'est écrit en base FillSell.
// Ménage : les horloges de test (et leurs clients, abonnements, factures) sont effacées à la fin.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drapeauxDepuisStripe, miseAJourProfilDepuisStripe } from '../../supabase/functions/_shared/cloud-option.js';
import { palierDeFacture } from '../../supabase/functions/_shared/paiement-stripe.js';
import { parametresDescente, descentePrevue, colonnesDescente, peutDescendre, abonnementDeFormule } from '../../supabase/functions/_shared/descente-formule.js';

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
const ok = (c, m, d) => { n++; journal.push({ ok: !!c, m, detail: d ?? null }); console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 600)}` : ''}`); if (!c) ko++; };
const horloges = [];

function prixTest(option, montant, nom) {
  const ps = exiger(stripe('GET', 'products?limit=100'), 'produits');
  let produit = ps.data.find((p) => p.metadata?.banc === 'descente-formule' && p.metadata?.option === option);
  if (!produit) produit = exiger(stripe('POST', 'products', { name: `${nom} (test)`, metadata: { banc: 'descente-formule', option } }), 'produit');
  const prix = exiger(stripe('GET', `prices?product=${produit.id}&active=true&limit=10`), 'prix');
  let p = prix.data.find((x) => x.unit_amount === montant && x.currency === 'eur' && x.recurring?.interval === 'month');
  if (!p) p = exiger(stripe('POST', 'prices', { product: produit.id, currency: 'eur', unit_amount: montant, recurring: { interval: 'month' }, metadata: { option } }), 'prix');
  return p;
}
function client(nom) {
  const t0 = Math.floor(Date.now() / 1000);
  const horloge = exiger(stripe('POST', 'test_helpers/test_clocks', { frozen_time: t0, name: `descente-formule ${nom}` }), 'horloge');
  horloges.push(horloge.id);
  const c = exiger(stripe('POST', 'customers', { email: `banc-descente-${nom}@exemple.invalid`, test_clock: horloge.id, metadata: { banc: 'descente-formule' } }), 'client');
  const pm = exiger(stripe('POST', 'payment_methods/pm_card_visa/attach', { customer: c.id }), 'carte');
  exiger(stripe('POST', `customers/${c.id}`, { invoice_settings: { default_payment_method: pm.id } }), 'carte par défaut');
  return { id: c.id, t0, horloge: horloge.id };
}
// Avance l'horloge de test et attend qu'elle soit prête (Stripe la fait avancer en tâche de fond).
function avancer(c, jusqua) {
  exiger(stripe('POST', `test_helpers/test_clocks/${c.horloge}/advance`, { frozen_time: jusqua }), 'avance');
  for (let i = 0; i < 90; i++) {
    const h = stripe('GET', `test_helpers/test_clocks/${c.horloge}`);
    if (h.status === 'ready') return h;
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
  }
  throw new Error('horloge de test : pas prête après 3 min');
}
const abonnements = (clientId) => exiger(stripe('GET', `subscriptions?customer=${clientId}&status=all&limit=20`), 'abonnements').data;
const lireSchedules = (subs) => Object.fromEntries(subs.filter((s) => s.schedule).map((s) => {
  const id = typeof s.schedule === 'string' ? s.schedule : s.schedule.id;
  return [id, exiger(stripe('GET', `subscription_schedules/${id}`), 'schedule')];
}));
const profil = (clientId, prix, maintenantS) => {
  const subs = abonnements(clientId);
  const p = miseAJourProfilDepuisStripe(drapeauxDepuisStripe(subs, prix), null);
  const prevue = descentePrevue(subs, lireSchedules(subs), prix, maintenantS * 1000);
  return { subs, p, prevue, colonnes: colonnesDescente(prevue) };
};
// La descente telle que la fonction changer-formule la posera : schedule depuis l'abonnement, puis ses deux phases.
function programmer(sub, vers, prix, { sansMeta = false } = {}) {
  const sched = exiger(stripe('POST', 'subscription_schedules', { from_subscription: sub.id }), 'schedule depuis l’abonnement');
  const params = parametresDescente({ abonnement: sub, schedule: sched, vers, prix });
  if (sansMeta) params.phases[1].metadata = { ...sub.metadata };
  return exiger(stripe('POST', `subscription_schedules/${sched.id}`, params), 'phases de la descente');
}
const derniereFacture = (subId) => exiger(stripe('GET', `invoices?subscription=${subId}&limit=1`), 'factures').data[0];
const UN_MOIS_ET_UN_JOUR = 32 * 86400;

try {
  const pPremium = prixTest('standard', 1299, 'FillSell Premium');
  const pPro = prixTest('pro', 2999, 'FillSell Pro');
  const pBusiness = prixTest('business', 5999, 'FillSell Business');
  const pCloud = prixTest('cloud', 2499, 'FillSell Cloud');
  const PRIX = { standard: pPremium.id, pro: pPro.id, business: pBusiness.id, cloud: pCloud.id };
  console.log(`Prix de test : Premium ${pPremium.id}, Pro ${pPro.id}, Business ${pBusiness.id}, Cloud ${pCloud.id}`);

  console.log('\n0. Règles pures');
  ok(peutDescendre('pro', 'premium') && peutDescendre('business', 'pro') && peutDescendre('business', 'standard'), 'descendre : Pro→Premium, Business→Pro, Business→Premium');
  ok(!peutDescendre('premium', 'pro') && !peutDescendre('pro', 'pro') && !peutDescendre('pro', 'free') && !peutDescendre(null, 'standard'), 'jamais : monter, rester, Free (= résilier), formule inconnue');

  console.log('\nA. Pro → Premium à la fin de la période');
  {
    const c = client('a');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro', fillsell_user_id: 'banc-a' } }), 'abonnement Pro');
    const fin = sub.current_period_end;
    const sched = programmer(sub, 'premium', PRIX);
    let r = profil(c.id, PRIX, c.t0);
    ok(sched.status === 'active' && sched.phases.length === 2 && sched.phases[0].end_date === fin && sched.phases[1].start_date === fin, 'Stripe : schedule actif, phase 1 jusqu’à la fin de la période payée, phase 2 à cette date', sched.phases.map((ph) => [ph.start_date, ph.end_date]));
    ok(r.p.is_pro === true && r.p.is_premium === true, 'avant l’échéance : Pro ENTIER (rien ne change tout de suite)', r.p);
    ok(r.prevue?.formule === 'standard' && r.prevue.le === new Date(fin * 1000).toISOString() && r.colonnes.formule_prevue === 'premium', `prévue : Premium le ${r.prevue?.le}`, r.prevue);
    const facturesAvant = exiger(stripe('GET', `invoices?subscription=${sub.id}&limit=10`), 'factures').data;
    ok(facturesAvant.length === 1 && facturesAvant[0].amount_paid === 2999, 'rien facturé ni remboursé en programmant (une seule facture : 29,99 € du départ)', facturesAvant.map((f) => f.amount_paid));
    avancer(c, fin + 3600);
    r = profil(c.id, PRIX, fin + 3600);
    const s2 = r.subs.find((s) => s.id === sub.id);
    const f2 = derniereFacture(sub.id);
    ok(s2.status === 'active' && s2.items.data[0].price.id === pPremium.id && s2.metadata.plan_type === 'standard', 'à l’échéance : même abonnement, prix Premium, plan_type standard', { status: s2.status, prix: s2.items.data[0].price.id, meta: s2.metadata });
    ok(r.p.is_premium === true && r.p.is_pro === false && r.p.is_business === false, 'droits : Premium seulement (is_pro faux)', r.p);
    ok(f2.amount_paid === 1299 && f2.status === 'paid' && palierDeFacture(f2, s2, PRIX) === 'premium', `facture du renouvellement : 12,99 € payée, crédit du mois au palier « ${palierDeFacture(f2, s2, PRIX)} » (nom de l'app)`, { montant: f2.amount_paid, statut: f2.status });
    ok(r.prevue === null && r.colonnes.formule_prevue === null, 'plus rien de « prévu » une fois la descente faite', r.prevue);
    avancer(c, fin + UN_MOIS_ET_UN_JOUR + 3600);
    const s3 = abonnements(c.id).find((s) => s.id === sub.id);
    const f3 = derniereFacture(sub.id);
    ok(s3.status === 'active' && s3.items.data[0].price.id === pPremium.id && f3.amount_paid === 1299 && !s3.schedule, 'le mois suivant : toujours Premium à 12,99 €, abonnement rendu à lui-même (plus de schedule)', { prix: s3.items.data[0].price.id, montant: f3.amount_paid, schedule: s3.schedule });
  }

  console.log('\nB. Business → Pro à la fin de la période');
  {
    const c = client('b');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pBusiness.id }], metadata: { plan_type: 'business' } }), 'abonnement Business');
    programmer(sub, 'pro', PRIX);
    let r = profil(c.id, PRIX, c.t0);
    ok(r.p.is_business === true && r.prevue?.formule === 'pro', 'avant : Business entier, Pro prévu', { p: r.p, prevue: r.prevue });
    avancer(c, sub.current_period_end + 3600);
    r = profil(c.id, PRIX, sub.current_period_end + 3600);
    const f = derniereFacture(sub.id);
    ok(r.p.is_business === false && r.p.is_pro === true && f.amount_paid === 2999 && palierDeFacture(f, r.subs[0], PRIX) === 'pro', 'après : Pro (is_business faux), 29,99 €, crédit au palier pro', { p: r.p, montant: f.amount_paid });
  }

  console.log('\nC. Annuler la descente avant l’échéance');
  {
    const c = client('c');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const sched = programmer(sub, 'premium', PRIX);
    const rel = exiger(stripe('POST', `subscription_schedules/${sched.id}/release`), 'release');
    let r = profil(c.id, PRIX, c.t0);
    ok(rel.status === 'released' && !r.subs[0].schedule && r.prevue === null, 'annulée : schedule rendu, plus rien de prévu', { statut: rel.status, schedule: r.subs[0].schedule });
    avancer(c, sub.current_period_end + 3600);
    r = profil(c.id, PRIX, sub.current_period_end + 3600);
    const f = derniereFacture(sub.id);
    ok(r.p.is_pro === true && r.subs[0].items.data[0].price.id === pPro.id && f.amount_paid === 2999, 'à l’échéance : toujours Pro, 29,99 €', { p: r.p, montant: f.amount_paid });
  }

  console.log('\nD. Monter pendant une descente prévue');
  {
    const c = client('d');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const sched = programmer(sub, 'premium', PRIX);
    const direct = stripe('POST', `subscriptions/${sub.id}`, { items: [{ id: sub.items.data[0].id, price: pBusiness.id }], proration_behavior: 'always_invoice' });
    const s1 = abonnements(c.id)[0];
    const schedApres = exiger(stripe('GET', `subscription_schedules/${sched.id}`), 'schedule');
    const montee = direct?.error ? 'refusée' : 'acceptée';
    console.log(`    (Stripe : une montée DIRECTE sur un abonnement tenu par un schedule est ${montee}${direct?.error ? ` — « ${direct.error.message} »` : ''} ; schedule ensuite : ${schedApres.status}, phases ${schedApres.phases.length})`);
    journal.push({ constat: 'montée directe sous schedule', resultat: montee, message: direct?.error?.message ?? null, schedule: schedApres.status, prix: s1.items.data[0].price.id });
    // Le chemin RETENU (create-checkout-session) : rendre l'abonnement à lui-même d'abord, puis monter.
    if (!direct?.error) {
      // La montée directe est passée : la descente prévue ne doit plus pouvoir s'appliquer derrière.
      const r = profil(c.id, PRIX, c.t0);
      // ⛔ LE DANGER, prouvé : la montée directe passe, mais le schedule RESTE et sa phase 2 ramènerait le Business à
      // Premium à l'échéance. D'où la règle de create-checkout-session : rendre l'abonnement à lui-même AVANT de monter.
      ok(s1.items.data[0].price.id === pBusiness.id && schedApres.status === 'active' && r.prevue?.formule === 'standard',
        'témoin : montée directe acceptée MAIS la descente reste programmée derrière le Business (le danger que le release d’abord évite)', { prevue: r.prevue, sched: schedApres.status, phases: schedApres.phases.map((ph) => ph.items.map((it) => it.price)) });
    }
    if (schedApres.status === 'active') exiger(stripe('POST', `subscription_schedules/${sched.id}/release`), 'release avant montée');
    const s2 = abonnements(c.id)[0];
    const up = s2.items.data[0].price.id === pBusiness.id ? s2
      : exiger(stripe('POST', `subscriptions/${sub.id}`, { items: [{ id: s2.items.data[0].id, price: pBusiness.id }], proration_behavior: 'always_invoice', metadata: { plan_type: 'business' } }), 'montée après release');
    const r = profil(c.id, PRIX, c.t0);
    ok(up.items.data[0].price.id === pBusiness.id && r.p.is_business === true && r.prevue === null, 'release puis montée : Business tout de suite, plus aucune descente prévue', { p: r.p, prevue: r.prevue });
    avancer(c, sub.current_period_end + 3600);
    const r2 = profil(c.id, PRIX, sub.current_period_end + 3600);
    ok(r2.p.is_business === true && r2.subs[0].items.data[0].price.id === pBusiness.id, 'à l’échéance : toujours Business (la descente annulée ne revient pas)', r2.p);
  }

  console.log('\nE. Résilier pendant une descente prévue');
  {
    const c = client('e');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const sched = programmer(sub, 'premium', PRIX);
    const direct = stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: true });
    console.log(`    (Stripe : une résiliation DIRECTE sous schedule est ${direct?.error ? 'refusée' : 'acceptée'}${direct?.error ? ` — « ${direct.error.message} »` : ''})`);
    journal.push({ constat: 'résiliation directe sous schedule', resultat: direct?.error ? 'refusée' : 'acceptée', message: direct?.error?.message ?? null });
    const schedApres = exiger(stripe('GET', `subscription_schedules/${sched.id}`), 'schedule');
    if (schedApres.status === 'active') exiger(stripe('POST', `subscription_schedules/${sched.id}/release`), 'release avant résiliation');
    const res = exiger(stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: true }), 'résiliation après release');
    let r = profil(c.id, PRIX, c.t0);
    ok(res.cancel_at_period_end === true && r.p.is_pro === true && r.prevue === null && r.p.subscription_cancel_at_period_end === true, 'release puis résiliation : Pro jusqu’à l’échéance, arrêt programmé, plus de descente', { p: r.p, prevue: r.prevue });
    avancer(c, sub.current_period_end + 3600);
    r = profil(c.id, PRIX, sub.current_period_end + 3600);
    ok(r.subs[0].status === 'canceled' && r.p.is_premium === false && r.p.is_pro === false, 'à l’échéance : abonnement arrêté, Free (aucune facture Premium)', { status: r.subs[0].status, p: r.p });
  }

  console.log('\nF. Le Cloud n’est jamais touché');
  {
    const c = client('f');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    const cloud = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pCloud.id }], metadata: { option: 'cloud' } }), 'abonnement Cloud');
    const subs0 = abonnements(c.id);
    const cible = abonnementDeFormule(subs0, PRIX, (s) => s.metadata?.option === 'cloud');
    ok(cible?.id === sub.id, 'la cible de la descente est l’abonnement de FORMULE, jamais le Cloud', { cible: cible?.id, pro: sub.id, cloud: cloud.id });
    programmer(cible, 'premium', PRIX);
    avancer(c, sub.current_period_end + 3600);
    const r = profil(c.id, PRIX, sub.current_period_end + 3600);
    const cl = r.subs.find((s) => s.id === cloud.id);
    ok(r.p.is_pro === false && r.p.is_premium === true && r.p.is_cloud === true && cl.status === 'active' && cl.items.data[0].price.id === pCloud.id && !cl.schedule,
      'après : Premium + Cloud intact (même prix, aucun schedule)', { p: r.p, cloud: [cl.status, cl.items.data[0].price.id] });
  }

  console.log('\nG. Témoin : sans la métadonnée de phase 2, le piège');
  {
    const c = client('g');
    const sub = exiger(stripe('POST', 'subscriptions', { customer: c.id, items: [{ price: pPro.id }], metadata: { plan_type: 'pro' } }), 'abonnement Pro');
    programmer(sub, 'premium', PRIX, { sansMeta: true });
    avancer(c, sub.current_period_end + 3600);
    const r = profil(c.id, PRIX, sub.current_period_end + 3600);
    ok(r.subs[0].items.data[0].price.id === pPremium.id && r.p.is_pro === true, 'témoin : prix Premium mais plan_type pro → resterait Pro (d’où la métadonnée de phase 2, vérifiée en A)', { prix: r.subs[0].items.data[0].price.id, p: r.p });
  }
} catch (e) {
  ko++;
  console.error(`✗ banc interrompu : ${e.message}`);
} finally {
  for (const h of horloges) { try { stripe('DELETE', `test_helpers/test_clocks/${h}`); } catch { /* ménage best-effort */ } }
  console.log(`  ménage : ${horloges.length} horloge(s) de test effacée(s) (clients, abonnements et factures de test avec elles)`);
}
mkdirSync(`${RACINE}build`, { recursive: true });
writeFileSync(`${RACINE}build/descente-formule-test.json`, JSON.stringify({ le: new Date().toISOString(), controles: n, rouges: ko, journal }, null, 2));
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\nTout est vert — ${n} contrôles. Rapport : build/descente-formule-test.json`);
process.exit(ko ? 1 : 0);
