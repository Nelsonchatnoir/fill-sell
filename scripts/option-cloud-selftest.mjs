// Selftest — l'option « FillSell Cloud » vue par les paiements (04/10/2026),
// SANS réseau, sans Stripe, sans base.
//
//     node scripts/option-cloud-selftest.mjs
//
// Les objets reprennent la forme des événements réels (abonnement Stripe à
// deux articles, transaction Apple décodée, purchases.subscriptionsv2 Google),
// réduits aux champs utiles, sans donnée personnelle.
import {
  ESSAI_CLOUD_JOURS, PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE, OFFRE_ESSAI_CLOUD_GOOGLE,
  etatCloud, essaiCloudPermis, itemPalier, itemCloud, litAbonnementStripe, drapeauxDepuisStripe,
  miseAJourProfilDepuisStripe, parametresCheckoutAvecCloud, lectureCloudApple, lectureCloudGoogle,
  ecritureCloudStore, avertissementCloudSuspendu,
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

console.log('1. L\'état Cloud d\'un compte');
ok(ESSAI_CLOUD_JOURS === 3, 'l\'essai dure 3 jours');
ok(etatCloud({}, T0).etat === 'aucun', 'rien → aucun');
{
  const e = etatCloud({ is_premium: false, cloud_essai_debut: new Date(T0 - J).toISOString(), cloud_essai_fin: new Date(T0 + 2 * J).toISOString() }, T0);
  ok(e.etat === 'essai' && e.actif === true && e.quotas === 'gratuit' && e.joursRestants === 2, 'essai en cours, palier non facturé → essai ACTIF, quotas du gratuit, J-2');
}
ok(etatCloud({ is_cloud: true, is_premium: true }, T0).etat === 'paye', 'payé avec palier → paye');
{
  const e = etatCloud({ is_cloud: true, is_premium: false, is_pro: false }, T0);
  ok(e.etat === 'suspendu' && e.actif === false, 'payé SANS palier (palier résilié chez Apple/Google) → suspendu, inactif');
}
ok(etatCloud({ cloud_essai_debut: new Date(T0 - 5 * J).toISOString(), cloud_essai_fin: new Date(T0 - 2 * J).toISOString() }, T0).etat === 'essai_termine', 'essai fini, pas payé → essai_termine');
ok(etatCloud({ is_comped: true, is_cloud: true }, T0).etat === 'paye', 'un palier offert (is_comped) porte l\'option');

console.log('2. Un seul essai par compte');
ok(essaiCloudPermis({}, []) === true, 'compte vierge → essai permis');
ok(essaiCloudPermis({ cloud_essai_debut: '2026-09-01T00:00:00Z' }, []) === false, 'essai déjà pris (quel que soit le canal) → refusé');
ok(essaiCloudPermis({ is_cloud: true }, []) === false, 'option déjà payée → pas d\'essai');
ok(essaiCloudPermis({}, [{ status: 'canceled', metadata: { essai_cloud: '1' } }]) === false, 'un abonnement Stripe résilié qui a porté l\'essai → refusé');
ok(essaiCloudPermis({}, [sub('s1', 'canceled', ['price_std', 'price_cloud'], { trial_start: 1 })], PRIX) === false, 'même sans métadonnée : un ancien abonnement Cloud avec essai → refusé');
ok(essaiCloudPermis({}, [sub('s2', 'canceled', ['price_std'], { trial_start: 1 })], PRIX) === true, 'un vieil essai Premium sans Cloud (avant le 22/07) ne compte pas');

console.log('3. Stripe — un abonnement, deux articles');
{
  const s = sub('s_essai', 'trialing', ['price_pro', 'price_cloud'], { trial_start: Math.floor(T0 / 1000), trial_end: Math.floor((T0 + 3 * J) / 1000) });
  ok(itemPalier(s, PRIX)?.price.id === 'price_pro', 'itemPalier rend l\'article du palier, jamais celui de l\'option');
  ok(itemCloud(s, PRIX)?.price.id === 'price_cloud', 'itemCloud rend l\'article de l\'option');
  const l = litAbonnementStripe(s, PRIX);
  ok(l.palier === 'pro' && l.cloud && l.essai && l.rang === 2, 'lecture : Pro + Cloud en essai');
  const d = drapeauxDepuisStripe([s], PRIX);
  ok(d.is_premium === false && d.is_pro === false && d.is_cloud === false, 'ESSAI palier + Cloud : aucun drapeau de palier (quotas du gratuit), option pas encore payée');
  ok(d.essai_en_cours && d.cloud_essai_debut === new Date(T0).toISOString() && d.cloud_essai_fin === new Date(T0 + 3 * J).toISOString(), 'les dates de l\'essai viennent de trial_start / trial_end');
  const u = miseAJourProfilDepuisStripe(d, null);
  ok(u.is_cloud === false && u.cloud_canal === 'stripe' && u.cloud_essai_debut && u.cloud_ref === 's_essai', 'écriture : canal stripe, référence, dates d\'essai');
}
{
  const s = sub('s_paye', 'active', ['price_pro', 'price_cloud']);
  const d = drapeauxDepuisStripe([s], PRIX);
  ok(d.is_premium && d.is_pro && !d.is_business && d.is_cloud, 'converti (active) : Pro + option payée');
  ok(d.a_resilier.length === 0, 'rien à résilier');
}
{
  const d = drapeauxDepuisStripe([sub('s_biz', 'active', ['price_biz'])], PRIX);
  ok(d.is_business && d.is_pro && d.is_premium && !d.is_cloud, 'Business seul : drapeaux cumulatifs, pas d\'option');
}
{
  const d = drapeauxDepuisStripe([sub('s_legacy', 'trialing', ['price_std'])], PRIX);
  ok(d.is_premium === true, 'un essai historique SANS Cloud compte comme avant (premium)');
}
{
  const d = drapeauxDepuisStripe([sub('s_seul', 'active', ['price_cloud'])], PRIX);
  ok(d.is_cloud === false && d.a_resilier.join() === 's_seul', 'Cloud SANS palier (édition manuelle) : jamais actif, abonnement à résilier');
}
{
  const d = drapeauxDepuisStripe([sub('s_fini', 'canceled', ['price_pro', 'price_cloud'])], PRIX);
  ok(!d.is_premium && !d.is_cloud, 'abonnement résilié : palier ET option tombent ensemble');
  const u = miseAJourProfilDepuisStripe(d, 'stripe');
  ok(u.is_cloud === false && !('cloud_essai_debut' in u), 'écriture : option à false, l\'essai pris n\'est pas effacé');
  const u2 = miseAJourProfilDepuisStripe(d, 'apple');
  ok(!('is_cloud' in u2), 'un Cloud porté par Apple n\'est JAMAIS touché par un événement Stripe');
}
{
  const d = drapeauxDepuisStripe([sub('s_annule', 'active', ['price_std', 'price_cloud'], { cancel_at_period_end: true })], PRIX);
  ok(d.cloud_annule_fin_periode === true && d.subscription_cancel_at_period_end === true, 'résiliation programmée : palier et option annulés à l\'échéance');
}
{
  const p = parametresCheckoutAvecCloud({ prixPalier: 'price_std', prixCloud: 'price_cloud', essai: true });
  ok(p.line_items.length === 2 && p.payment_method_collection === 'always', 'checkout palier + Cloud : deux lignes, carte obligatoire');
  ok(p.subscription_data.trial_period_days === 3 && p.subscription_data.trial_settings.end_behavior.missing_payment_method === 'cancel', 'essai 3 jours ; sans carte, annulé');
  const q = parametresCheckoutAvecCloud({ prixPalier: 'price_std', prixCloud: 'price_cloud', essai: false });
  ok(!('trial_period_days' in q.subscription_data) && q.metadata.essai_cloud === '0', 'essai déjà pris : même panier, payé tout de suite');
}

console.log('4. Apple — groupe « FillSell Cloud »');
{
  const tx = { productId: PRODUIT_CLOUD_APPLE, offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: T0, expiresDate: T0 + 3 * J, originalTransactionId: '2000001' };
  const l = lectureCloudApple(tx);
  ok(l && l.cloud && l.essai && l.palier === null, 'offre d\'introduction sur Cloud → essai');
  const e = ecritureCloudStore({ canal: 'apple', lecture: l, sens: 'on', ref: '2000001', profil: {} });
  ok(e.update.is_cloud === false && e.update.cloud_essai_debut && e.update.cloud_canal === 'apple' && e.grantPalier === null, 'essai : dates posées, option pas payée, aucun grant');
}
{
  const l = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, purchaseDate: T0 + 3 * J, expiresDate: T0 + 33 * J, originalTransactionId: '2000001' });
  ok(l && !l.essai, 'DID_RENEW sans offerType → payé');
  const e = ecritureCloudStore({ canal: 'apple', lecture: l, sens: 'on', ref: '2000001', profil: { cloud_canal: 'apple', cloud_ref: '2000001' } });
  ok(e.update.is_cloud === true && !('is_premium' in e.update), 'payé : is_cloud, les drapeaux de palier ne bougent pas (le palier vit ailleurs)');
}
{
  const l = lectureCloudApple({ productId: 'app.fillsell.pro_cloud.sub', offerType: 1, purchaseDate: T0, expiresDate: T0 + 3 * J });
  ok(l.palier === 'pro' && l.essai, 'produit combiné Pro + Cloud (proposé) en intro → essai, palier pro');
  const paye = ecritureCloudStore({ canal: 'apple', lecture: { ...l, essai: false }, sens: 'on', ref: 'x', profil: {} });
  ok(paye.update.is_pro === true && paye.update.is_premium === true && paye.update.is_cloud === true && paye.grantPalier === 'pro', 'combiné payé : palier + option + grant');
  const off = ecritureCloudStore({ canal: 'apple', lecture: l, sens: 'off', ref: 'x', profil: { cloud_canal: 'apple', cloud_ref: 'x' } });
  ok(off.update.is_cloud === false && off.update.is_pro === false, 'combiné expiré : palier et option tombent');
}
ok(lectureCloudApple({ productId: 'app.fillsell.pro2.sub' }) === null, 'un palier seul n\'est pas l\'affaire de ce module');
{
  const e = ecritureCloudStore({ canal: 'apple', lecture: { fin: null }, sens: 'off', ref: 'autre', profil: { cloud_canal: 'stripe', cloud_ref: 'sub_1' } });
  ok(e.update === null, 'un OFF Apple sur une option portée par Stripe n\'écrit RIEN');
  const a = ecritureCloudStore({ canal: 'google', lecture: { fin: '2026-11-01T00:00:00Z' }, sens: 'annulation', ref: 'tok', profil: { cloud_canal: 'google', cloud_ref: 'tok' } });
  ok(a.update.cloud_annule_fin_periode === true && a.update.cloud_fin_periode === '2026-11-01T00:00:00Z', 'annulation : accès conservé jusqu\'à l\'échéance');
}

console.log('5. Google — purchases.subscriptionsv2');
{
  const achat = { startTime: new Date(T0).toISOString(), lineItems: [{ productId: PRODUIT_CLOUD_GOOGLE, expiryTime: new Date(T0 + 3 * J).toISOString(), offerDetails: { basePlanId: 'cloud-monthly', offerId: OFFRE_ESSAI_CLOUD_GOOGLE } }] };
  const l = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, achat, 4);
  ok(l && l.cloud && l.essai, 'PURCHASED (4) avec l\'offre cloud-trial-3d → essai');
  const r = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, { ...achat, lineItems: [{ ...achat.lineItems[0], expiryTime: new Date(T0 + 33 * J).toISOString() }] }, 2);
  ok(r && !r.essai, 'RENEWED (2) après l\'essai → payé même si offerId reste sur la ligne');
  const v = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, achat, null);
  ok(v && v.essai, 'validation côté app (sans type) : 3 jours d\'échéance → essai');
}
{
  const achat = { startTime: new Date(T0).toISOString(), lineItems: [{ productId: 'app.fillsell.pro.sub', expiryTime: new Date(T0 + 3 * J).toISOString(), offerDetails: { basePlanId: 'pro-monthly', offerId: 'pro-cloud-trial-3d' } }] };
  const l = lectureCloudGoogle('app.fillsell.pro.sub', achat, 4, (id) => (id === 'app.fillsell.pro.sub' ? 'pro' : null));
  ok(l && !l.cloud && l.palier === 'pro' && l.essai, 'palier Pro acheté avec l\'offre pro-cloud-trial-3d (proposée) → palier en essai, pas facturé');
  ok(lectureCloudGoogle('app.fillsell.pro.sub', { lineItems: [{ offerDetails: { offerId: 'autre' } }] }, 4, () => 'pro') === null, 'un palier sans offre Cloud ne concerne pas ce module');
}

console.log('6. Le texte de la suspension');
ok(avertissementCloudSuspendu('apple').includes("l'App Store") && avertissementCloudSuspendu('google').includes('Google Play'), 'le texte nomme la boutique où résilier');
ok(avertissementCloudSuspendu('apple', 'en').startsWith('Your Cloud option is paused'), 'version anglaise');

console.log(echecs === 0 ? '\nTOUT VERT' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
