// Selftest — l'abonnement « FillSell Cloud » vu par les paiements (04/10/2026),
// SANS réseau, sans Stripe, sans base.
//
//     node scripts/option-cloud-selftest.mjs
//
// Modèle final (Nico, 04/10 nuit) : Cloud = abonnement SÉPARÉ, 20 €/mois, essai
// 7 jours, ouvert à tous (Free compris), cumulable avec un palier, et qui
// CONTINUE quand le palier tombe. Jamais premium à lui seul.
import {
  ESSAI_CLOUD_JOURS, PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE, OFFRE_ESSAI_CLOUD_GOOGLE,
  etatCloud, estAbonnementCloud, litAbonnementStripe, drapeauxDepuisStripe, miseAJourProfilDepuisStripe,
  essaiCloudPermis, parametresCheckoutCloud, sessionEstCloud, lectureCloudApple, lectureCloudGoogle,
  ecritureCloudStore, verdictEssaiStore,
} from '../supabase/functions/_shared/cloud-option.js';

let echecs = 0;
const ok = (cond, quoi) => { console.log(`  ${cond ? 'ok  ' : 'ÉCHEC'} ${quoi}`); if (!cond) echecs++; };
const T0 = Date.parse('2026-10-05T10:00:00Z');
const J = 86_400_000;
const PRIX = { standard: 'price_std', pro: 'price_pro', business: 'price_biz', cloud: 'price_cloud' };
const sub = (id, status, prix, extra = {}) => ({
  id, status, metadata: {}, cancel_at_period_end: false,
  items: { data: prix.map((p, i) => ({ id: `si_${id}_${i}`, price: { id: p } })) },
  current_period_end: Math.floor((T0 + 20 * J) / 1000),
  ...extra,
});
const cloud = (id, status, extra = {}) => sub(id, status, ['price_cloud'], { metadata: { option: 'cloud' }, ...extra });

console.log('1. L\'état Cloud — indépendant du palier');
ok(ESSAI_CLOUD_JOURS === 7, 'l\'essai dure 7 jours');
ok(etatCloud({}, T0).etat === 'aucun', 'rien → aucun');
{
  const e = etatCloud({ cloud_essai_debut: new Date(T0 - J).toISOString(), cloud_essai_fin: new Date(T0 + 6 * J).toISOString() }, T0);
  ok(e.etat === 'essai' && e.actif && e.joursRestants === 6, 'compte FREE en essai → actif, J-6');
}
ok(etatCloud({ is_cloud: true }, T0).actif === true, 'compte FREE avec Cloud payé → actif');
ok(etatCloud({ is_cloud: true, is_premium: false, is_pro: false }, T0).etat === 'paye', 'palier tombé, Cloud payé → Cloud CONTINUE (paye)');
ok(etatCloud({ cloud_essai_debut: new Date(T0 - 9 * J).toISOString(), cloud_essai_fin: new Date(T0 - 2 * J).toISOString() }, T0).etat === 'essai_termine', 'essai fini, pas payé → essai_termine, inactif');

console.log('2. Stripe — un abonnement Cloud À PART');
ok(estAbonnementCloud(cloud('c1', 'active'), PRIX), 'metadata.option = cloud → Cloud');
ok(estAbonnementCloud(sub('c2', 'active', ['price_cloud']), PRIX), 'sans métadonnée, uniquement le prix Cloud → Cloud');
ok(!estAbonnementCloud(sub('p1', 'active', ['price_pro']), PRIX), 'un palier n\'est pas Cloud');
ok(litAbonnementStripe(cloud('c1', 'active'), PRIX).rang === -1, 'un abonnement Cloud est hors de l\'échelle des paliers (rang -1)');
{
  const d = drapeauxDepuisStripe([cloud('c1', 'trialing', { trial_start: Math.floor(T0 / 1000), trial_end: Math.floor((T0 + 7 * J) / 1000) })], PRIX);
  ok(!d.is_premium && !d.is_pro && !d.is_business, 'Cloud SEUL en essai : is_premium JAMAIS vrai');
  ok(!d.is_cloud && d.cloud_essai_debut === new Date(T0).toISOString() && d.cloud_essai_fin === new Date(T0 + 7 * J).toISOString(), 'essai daté par trial_start / trial_end, pas encore payé');
}
{
  const d = drapeauxDepuisStripe([cloud('c1', 'active')], PRIX);
  ok(d.is_cloud && !d.is_premium, 'Cloud SEUL payé : is_cloud, jamais premium');
}
{
  const d = drapeauxDepuisStripe([sub('p1', 'active', ['price_pro']), cloud('c1', 'active')], PRIX);
  ok(d.is_premium && d.is_pro && !d.is_business && d.is_cloud, 'Pro + Cloud cumulés : deux abonnements, deux jeux de drapeaux');
}
{
  const d = drapeauxDepuisStripe([sub('p1', 'canceled', ['price_pro']), cloud('c1', 'active')], PRIX);
  ok(!d.is_premium && !d.is_pro && d.is_cloud, 'palier résilié → Free, Cloud CONTINUE');
}
{
  const d = drapeauxDepuisStripe([sub('legacy', 'active', ['price_inconnu_founder'])], PRIX);
  ok(d.is_premium && !d.is_cloud, 'un abonnement legacy (prix inconnu) reste premium comme avant');
}
{
  const d = drapeauxDepuisStripe([sub('p1', 'active', ['price_std'], { cancel_at_period_end: false }), cloud('c1', 'active', { cancel_at_period_end: true })], PRIX);
  ok(d.subscription_cancel_at_period_end === false && d.cloud_arret_fin_periode === true, 'résilier Cloud ne marque pas le palier comme résilié');
}
{
  const d = drapeauxDepuisStripe([cloud('c1', 'canceled')], PRIX);
  const u = miseAJourProfilDepuisStripe(d, 'stripe');
  ok(u.is_cloud === false && !('cloud_essai_debut' in u), 'Cloud résilié : option à false, l\'essai pris n\'est pas effacé');
  ok(!('is_cloud' in miseAJourProfilDepuisStripe(d, 'apple')), 'un Cloud porté par Apple n\'est JAMAIS touché par un événement Stripe');
}

console.log('3. Un seul essai par compte (garde serveur Stripe)');
ok(essaiCloudPermis({}, [], PRIX) === true, 'compte vierge → essai');
ok(essaiCloudPermis({ cloud_essai_debut: '2026-09-01T00:00:00Z' }, [], PRIX) === false, 'essai déjà pris, quel que soit le canal → refusé');
ok(essaiCloudPermis({}, [cloud('old', 'canceled', { trial_start: 1 })], PRIX) === false, 'ancien abonnement Cloud avec essai chez Stripe → refusé');
ok(essaiCloudPermis({}, [sub('p', 'canceled', ['price_std'], { trial_start: 1 })], PRIX) === true, 'un vieil essai Premium (avant le 22/07) ne compte pas');
{
  const p = parametresCheckoutCloud({ prixCloud: 'price_cloud', essai: true, userId: 'u1' });
  ok(p.line_items.length === 1 && p.line_items[0].price === 'price_cloud', 'Checkout Cloud : une seule ligne, le prix Cloud');
  ok(p.payment_method_collection === 'always', 'carte obligatoire, même pendant l\'essai');
  ok(p.subscription_data.trial_period_days === 7 && p.subscription_data.trial_settings.end_behavior.missing_payment_method === 'cancel', 'essai 7 jours ; sans carte, annulé');
  ok(p.subscription_data.metadata.option === 'cloud' && p.metadata.plan_type === 'cloud', 'metadata.option = cloud sur la session ET l\'abonnement');
  ok(sessionEstCloud({ metadata: p.metadata }) && !sessionEstCloud({ metadata: { plan_type: 'pro' } }), 'une session Cloud ne sert jamais une demande de palier');
  const q = parametresCheckoutCloud({ prixCloud: 'price_cloud', essai: false, userId: 'u1' });
  ok(!('trial_period_days' in q.subscription_data), 'essai déjà pris : payé tout de suite');
}

console.log('4. Apple — app.fillsell.cloud.sub');
{
  const l = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: T0, expiresDate: T0 + 7 * J, originalTransactionId: '2000001' });
  ok(l && l.essai, 'offre d\'introduction → essai');
  const e = ecritureCloudStore({ canal: 'apple', lecture: l, sens: 'on', ref: '2000001', profil: {} });
  ok(e.update.is_cloud === false && e.update.cloud_essai_debut && e.update.cloud_canal === 'apple', 'essai : dates posées, option pas encore payée');
  ok(!Object.keys(e.update).some((k) => /^is_(premium|pro|business)$/.test(k)), 'aucune colonne de palier écrite');
}
{
  const l = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, purchaseDate: T0 + 7 * J, expiresDate: T0 + 37 * J, originalTransactionId: '2000001' });
  ok(l && !l.essai, 'DID_RENEW sans offerType → payé');
  ok(ecritureCloudStore({ canal: 'apple', lecture: l, sens: 'on', ref: '2000001', profil: { cloud_canal: 'apple', cloud_ref: '2000001' } }).update.is_cloud === true, 'payé : is_cloud');
}
ok(lectureCloudApple({ productId: 'app.fillsell.pro2.sub' }) === null, 'un palier n\'est pas l\'affaire de ce module');
ok(ecritureCloudStore({ canal: 'apple', lecture: {}, sens: 'off', ref: 'x', profil: { cloud_canal: 'stripe', cloud_ref: 'sub_1' } }).update === null, 'un OFF Apple sur un Cloud porté par Stripe n\'écrit RIEN');
{
  const a = ecritureCloudStore({ canal: 'google', lecture: { fin: '2026-11-01T00:00:00Z' }, sens: 'annulation', ref: 'tok', profil: { cloud_canal: 'google', cloud_ref: 'tok' } });
  ok(a.update.cloud_arret_fin_periode === true && a.update.cloud_periode_fin === '2026-11-01T00:00:00Z', 'annulation : accès conservé jusqu\'à l\'échéance');
}

console.log('5. Google — offre cloud-trial-3d (7 jours)');
{
  const achat = { startTime: new Date(T0).toISOString(), lineItems: [{ productId: PRODUIT_CLOUD_GOOGLE, expiryTime: new Date(T0 + 7 * J).toISOString(), offerDetails: { basePlanId: 'cloud-monthly', offerId: OFFRE_ESSAI_CLOUD_GOOGLE } }] };
  ok(lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, achat, 4)?.essai === true, 'PURCHASED (4) avec l\'offre d\'essai → essai');
  ok(lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, { ...achat, lineItems: [{ ...achat.lineItems[0], expiryTime: new Date(T0 + 37 * J).toISOString() }] }, 2)?.essai === false, 'RENEWED (2) → payé');
  ok(lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, achat, null)?.essai === true, 'validation côté app : échéance à 7 jours → essai');
  ok(lectureCloudGoogle('app.fillsell.pro.sub', achat, 4) === null, 'un palier Google n\'est pas l\'affaire de ce module');
}

console.log("6. Arrêt de l'essai : effet IMMÉDIAT (palier.js) ; payé : fin de période");
{
  const p = { cloud_essai_debut: new Date(T0 - J).toISOString(), cloud_essai_fin: new Date(T0 + 6 * J).toISOString(), cloud_essai_arrete: true };
  const e = etatCloud(p, T0);
  ok(e.etat === "essai_termine" && !e.actif && e.essaiArrete, "essai arrêté (drapeau) → essai_termine tout de suite, même si la fin n'a pas bougé");
  const d = drapeauxDepuisStripe([cloud("c1", "canceled", { trial_start: Math.floor((T0 - J) / 1000), trial_end: Math.floor((T0 + 6 * J) / 1000), ended_at: Math.floor(T0 / 1000) })], PRIX);
  const u = miseAJourProfilDepuisStripe(d, "stripe");
  ok(u.cloud_essai_arrete === true && u.cloud_essai_fin === new Date(T0).toISOString(), "Stripe : abonnement terminé pendant l'essai → cloud_essai_arrete, fin ramenée à l'arrêt");
  const d2 = drapeauxDepuisStripe([cloud("c2", "canceled", { trial_start: Math.floor((T0 - 7 * J) / 1000), trial_end: Math.floor(T0 / 1000), ended_at: Math.floor(T0 / 1000) })], PRIX);
  ok(!("cloud_essai_arrete" in miseAJourProfilDepuisStripe(d2, "stripe")), "essai arrivé à son terme sans carte : pas un arrêt");
  const prof = { cloud_canal: "apple", cloud_ref: "A1", cloud_essai_debut: new Date(T0 - J).toISOString(), cloud_essai_fin: new Date(T0 + 6 * J).toISOString() };
  const a = ecritureCloudStore({ canal: "apple", lecture: { fin: new Date(T0 + 6 * J).toISOString() }, sens: "annulation", ref: "A1", profil: prof, maintenant: T0 });
  ok(a.update.cloud_essai_arrete === true && a.update.cloud_essai_fin === new Date(T0).toISOString(), "Apple : renouvellement coupé pendant l'essai → arrêt immédiat");
  const b = ecritureCloudStore({ canal: "apple", lecture: { fin: "2026-11-05T10:00:00.000Z" }, sens: "annulation", ref: "A1", profil: { ...prof, is_cloud: true }, maintenant: T0 });
  ok(b.update.cloud_arret_fin_periode === true && !("cloud_essai_arrete" in b.update), "payé : arrêt à la fin de la période");
  const e2 = etatCloud({ is_cloud: true, cloud_periode_fin: "2026-11-05T10:00:00.000Z", cloud_arret_fin_periode: true }, T0);
  ok(e2.etat === "paye" && e2.arretPrevuLe === "2026-11-05T10:00:00.000Z", "payé avec arrêt demandé : tourne, arretPrevuLe = fin de période");
}

console.log("7. UN SEUL ESSAI PAR COMPTE FILLSELL, TOUS CANAUX");
{
  const apresStripe = { cloud_canal: "stripe", cloud_ref: "sub_1", cloud_essai_debut: new Date(T0 - 20 * J).toISOString(), cloud_essai_fin: new Date(T0 - 13 * J).toISOString(), is_cloud: false };
  const introApple = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, offerType: 1, purchaseDate: T0, expiresDate: T0 + 7 * J, originalTransactionId: "A9" });
  const r1 = ecritureCloudStore({ canal: "apple", lecture: introApple, sens: "on", ref: "A9", profil: apresStripe, maintenant: T0 });
  ok(r1.motif === "essai_deja_pris" && r1.update.is_cloud === false && !("cloud_essai_debut" in r1.update), "essai Stripe PUIS tentative Apple → semaine Apple NON activée, l'essai Stripe reste");
  ok(etatCloud({ ...apresStripe, ...r1.update }, T0).actif === false, "… et Cloud ne tourne pas pendant cette semaine gratuite");
  const renouv = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, purchaseDate: T0 + 7 * J, expiresDate: T0 + 37 * J, originalTransactionId: "A9" });
  const r1b = ecritureCloudStore({ canal: "apple", lecture: renouv, sens: "on", ref: "A9", profil: { ...apresStripe, ...r1.update }, maintenant: T0 + 7 * J });
  ok(r1b.update.is_cloud === true, "… Cloud démarre au premier paiement Apple réel");

  const apresApple = { cloud_canal: "apple", cloud_ref: "A1", cloud_essai_debut: new Date(T0 - 20 * J).toISOString(), cloud_essai_fin: new Date(T0 - 13 * J).toISOString(), is_cloud: false };
  ok(essaiCloudPermis(apresApple, [], PRIX) === false, "essai Apple PUIS tentative Stripe → Checkout SANS essai (payé tout de suite)");
  ok(!("trial_period_days" in parametresCheckoutCloud({ prixCloud: "price_cloud", essai: essaiCloudPermis(apresApple, [], PRIX), userId: "u" }).subscription_data), "… la session Stripe ne porte aucun jour gratuit");

  const apresGoogle = { cloud_canal: "google", cloud_ref: "tokG", cloud_essai_debut: new Date(T0 - 3 * J).toISOString(), cloud_essai_fin: new Date(T0 + 4 * J).toISOString(), is_cloud: false };
  const r3 = ecritureCloudStore({ canal: "apple", lecture: introApple, sens: "on", ref: "A9", profil: apresGoogle, maintenant: T0 });
  ok(r3.motif === "essai_deja_pris" && r3.update.cloud_essai_debut === undefined, "essai Google PUIS tentative Apple → semaine Apple NON activée");
  const essaiApple2 = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, { startTime: new Date(T0).toISOString(), lineItems: [{ expiryTime: new Date(T0 + 7 * J).toISOString(), offerDetails: { offerId: OFFRE_ESSAI_CLOUD_GOOGLE } }] }, 4);
  const r4 = ecritureCloudStore({ canal: "google", lecture: essaiApple2, sens: "on", ref: "tokX", profil: apresApple, maintenant: T0 });
  ok(r4.motif === "essai_deja_pris", "essai Apple PUIS tentative Google → NON activée");
  ok(verdictEssaiStore(apresGoogle, "google", "tokG").ok === true, "rejeu du MÊME essai (même canal, même référence) → toujours accepté");
  ok(verdictEssaiStore({}, "apple", "A1").ok === true, "premier essai, quel que soit le canal → accepté");
}

console.log(echecs === 0 ? '\nTOUT VERT' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
