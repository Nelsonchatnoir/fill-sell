// (08/11/2026, ordre de Nico : « Cloud — dernières finitions : mails + résiliation ») LA RÉSILIATION ET LES MAILS CLOUD,
// sur les trois canaux, sans réseau ni base :
//   A. les règles d'arrêt (ecritureCloudStore) : essai → coupé tout de suite ; payé → arrêt programmé ; arrêt REJOUÉ →
//      rien d'écrit (un seul arrêt, une seule libération d'IP) ; coupure reçue après le prélèvement → période payée ;
//      paiement reçu après la coupure → l'arrêt reste programmé ; reprise → arrêt levé ; Google RESTARTED = reprise
//      (jamais un second essai gratuit) ;
//   B. les événements de mail d'une notification de boutique (evenementsBoutique) et d'un objet Stripe ;
//   C. les textes des mails × canal × langue (nom, prix lu ou absent, jamais 20 €, jamais « sans ordinateur », ton) ;
//   D. l'envoi : UN mail par événement, même rejoué ou reçu en même temps ; registre illisible = aucun mail.
import { ecritureCloudStore, lectureCloudApple, lectureCloudGoogle, PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE, OFFRE_ESSAI_CLOUD_GOOGLE, etatCloud } from '../supabase/functions/_shared/cloud-option.js';
import {
  evenementsBoutique, evenementArretStripe, evenementDebutStripe, evenementPaiementStripe, texteMailCloud, envoyerMailsCloud,
  EVENEMENTS_MAIL, montantStripe, finPeriodeStripe,
} from '../supabase/functions/_shared/cloud-mails.js';
import { texteRappel } from '../supabase/functions/_shared/cloud-rappel-veille.js';

const E = await import('../supabase/functions/_shared/emails-fillsell.ts');

let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${typeof d === 'string' ? d : JSON.stringify(d)}`.slice(0, 700) : ''}`); } };
const H = 3_600_000, J = 86_400_000;
const T0 = Date.parse('2026-11-10T10:00:00Z');
const iso = (t) => new Date(t).toISOString();
const appliquer = (profil, update) => ({ ...profil, ...(update ?? {}) });

// ── A. Les règles d'arrêt ──────────────────────────────────────────────────────
console.log('A. Les règles d\'arrêt (ecritureCloudStore)');
const enEssai = { cloud_canal: 'apple', cloud_ref: 'A1', is_cloud: false, cloud_essai_debut: iso(T0 - 2 * J), cloud_essai_fin: iso(T0 + 5 * J), cloud_essai_arrete: false, cloud_periode_fin: iso(T0 + 5 * J), cloud_arret_fin_periode: false };
const txEssai = { productId: PRODUIT_CLOUD_APPLE, offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: T0 - 2 * J, expiresDate: T0 + 5 * J, originalTransactionId: 'A1', transactionId: 'T-essai', price: 0, currency: 'EUR' };
const lAnnulEssai = lectureCloudApple(txEssai, { autoRenewStatus: 0 });
ok(lAnnulEssai.renouvellementAuto === false && lAnnulEssai.phaseEssai === true && lAnnulEssai.montantPaye === null, 'Apple : renouvellement coupé lu (autoRenewStatus 0), période d\'essai lue sur la transaction, aucun montant payé (essai à 0)', lAnnulEssai);
const a1 = ecritureCloudStore({ canal: 'apple', lecture: lAnnulEssai, sens: 'annulation', ref: 'A1', profil: enEssai, maintenant: T0 });
ok(a1.update?.cloud_essai_arrete === true && a1.update?.cloud_essai_fin === iso(T0) && !('is_premium' in a1.update), 'essai : arrêt IMMÉDIAT (fin ramenée à maintenant), aucune colonne de formule', a1);
const apresA1 = appliquer(enEssai, a1.update);
ok(etatCloud(apresA1, T0 + 1000).actif === false, 'après l\'arrêt : le Cloud n\'est plus actif (le déclencheur rend la place et l\'IP, le navigateur se ferme au tour suivant)');
const a1bis = ecritureCloudStore({ canal: 'apple', lecture: lAnnulEssai, sens: 'annulation', ref: 'A1', profil: apresA1, maintenant: T0 + 5000 });
ok(a1bis.update === null && a1bis.motif === 'essai_deja_arrete', 'la MÊME notification rejouée : rien d\'écrit (un seul arrêt, une seule libération d\'IP)', a1bis);
const paye = { ...enEssai, is_cloud: true, cloud_essai_fin: iso(T0 - 20 * J), cloud_essai_debut: iso(T0 - 27 * J), cloud_periode_fin: iso(T0 + 10 * J) };
const txPaye = { productId: PRODUIT_CLOUD_APPLE, purchaseDate: T0 - 20 * J, expiresDate: T0 + 10 * J, originalTransactionId: 'A1', transactionId: 'T-2', price: 24990, currency: 'EUR' };
const lAnnulPaye = lectureCloudApple(txPaye, { autoRenewStatus: 0 });
const a2 = ecritureCloudStore({ canal: 'apple', lecture: lAnnulPaye, sens: 'annulation', ref: 'A1', profil: paye, maintenant: T0 });
ok(a2.update?.cloud_arret_fin_periode === true && a2.update?.cloud_periode_fin === iso(T0 + 10 * J) && a2.update?.is_cloud === undefined && a2.update?.cloud_essai_arrete === undefined,
  'période payée : arrêt PROGRAMMÉ à la fin de la période, le Cloud tourne jusque-là', a2);
const a2bis = ecritureCloudStore({ canal: 'apple', lecture: lAnnulPaye, sens: 'annulation', ref: 'A1', profil: appliquer(paye, a2.update), maintenant: T0 + 60_000 });
ok(a2bis.update === null && a2bis.motif === 'arret_deja_programme', 'arrêt programmé rejoué : rien d\'écrit', a2bis);
const reprise = ecritureCloudStore({ canal: 'apple', lecture: { renouvellementAuto: true }, sens: 'reprise', ref: 'A1', profil: appliquer(paye, a2.update), maintenant: T0 + H });
ok(reprise.update?.cloud_arret_fin_periode === false && Object.keys(reprise.update).length === 1, 'réabonnement avant la fin : l\'arrêt programmé est levé, rien d\'autre (aucune double place)', reprise);
// La coupure arrive APRÈS le prélèvement de fin d'essai, avant que le paiement soit écrit chez nous.
const graceEssai = { ...enEssai, cloud_essai_fin: iso(T0 - H), cloud_periode_fin: iso(T0 - H) };
const txConverti = { productId: PRODUIT_CLOUD_APPLE, purchaseDate: T0 - H, expiresDate: T0 + 30 * J, originalTransactionId: 'A1', transactionId: 'T-conv', price: 24990, currency: 'EUR' };
const a3 = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple(txConverti, { autoRenewStatus: 0 }), sens: 'annulation', ref: 'A1', profil: graceEssai, maintenant: T0 });
ok(a3.update?.cloud_arret_fin_periode === true && a3.update?.cloud_essai_arrete === undefined, 'coupure reçue APRÈS le prélèvement (fin d\'essai payée) : période payée, arrêt programmé — jamais « aucun prélèvement »', a3);
const a3on = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple(txConverti, { autoRenewStatus: 0 }), sens: 'on', ref: 'A1', profil: appliquer(graceEssai, a3.update), maintenant: T0 + 1000 });
ok(a3on.update?.is_cloud === true && a3on.update?.cloud_arret_fin_periode === true, 'le paiement (DID_RENEW) reçu ENSUITE garde l\'arrêt programmé (avant : remis à faux, le Cloud aurait continué)', a3on);
const a3on2 = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple(txConverti, { autoRenewStatus: 1 }), sens: 'on', ref: 'A1', profil: graceEssai, maintenant: T0 });
ok(a3on2.update?.cloud_arret_fin_periode === false, 'paiement avec renouvellement actif : aucun arrêt programmé');
// L'essai FillSell est fini (grâce) mais la boutique est encore dans sa semaine : la coupure arrête tout, rien n'est prélevé.
const a4 = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple({ ...txEssai, expiresDate: T0 + H }, { autoRenewStatus: 0 }), sens: 'annulation', ref: 'A1', profil: graceEssai, maintenant: T0 });
ok(a4.update?.cloud_essai_arrete === true && a4.update?.cloud_essai_fin === undefined, 'grâce de fin d\'essai, boutique encore en essai : arrêté (place et IP rendues), fin d\'essai gardée', a4);
const autreCanal = ecritureCloudStore({ canal: 'google', lecture: {}, sens: 'annulation', ref: 'G1', profil: enEssai, maintenant: T0 });
ok(autreCanal.update === null, 'une coupure d\'un AUTRE canal ne touche jamais le Cloud porté par Apple');
// Google
const achatGoogleEssai = { startTime: iso(T0 - 2 * J), subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', latestOrderId: 'GPA.1', lineItems: [{ productId: PRODUIT_CLOUD_GOOGLE, expiryTime: iso(T0 + 5 * J), offerDetails: { offerId: OFFRE_ESSAI_CLOUD_GOOGLE }, autoRenewingPlan: { autoRenewEnabled: false } }] };
const lg = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, achatGoogleEssai, 3);
ok(lg.phaseEssai === true && lg.renouvellementAuto === false && lg.essai === false, 'Google CANCELED (3) pendant l\'essai : phase d\'essai lue (durée de la 1re période), renouvellement coupé lu', lg);
const lgPhase = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, { ...achatGoogleEssai, lineItems: [{ ...achatGoogleEssai.lineItems[0], offerPhase: { basePrice: {} } }] }, 3);
ok(lgPhase.phaseEssai === false, 'Google : la phase d\'offre, quand elle est donnée, fait foi (prix de base = période payée)');
const pg = { ...enEssai, cloud_canal: 'google', cloud_ref: 'G1' };
const g1 = ecritureCloudStore({ canal: 'google', lecture: lg, sens: 'annulation', ref: 'G1', profil: pg, maintenant: T0 });
ok(g1.update?.cloud_essai_arrete === true, 'Google : coupure pendant l\'essai = arrêt immédiat');
const g1restart = ecritureCloudStore({ canal: 'google', lecture: { ...lg, renouvellementAuto: true }, sens: 'reprise', ref: 'G1', profil: appliquer(pg, g1.update), maintenant: T0 + H });
ok(g1restart.update && g1restart.update.is_cloud === undefined && g1restart.update.cloud_essai_arrete === undefined && etatCloud(appliquer(appliquer(pg, g1.update), g1restart.update), T0 + H).actif === false,
  'Google RESTARTED (7) après un essai arrêté : une reprise seulement — le Cloud ne rouvre pas sans paiement (jamais un second essai gratuit)', g1restart);

// ── B. Les événements ─────────────────────────────────────────────────────────
console.log('\nB. Les événements de mail');
const evA1 = evenementsBoutique({ canal: 'apple', nature: 'annulation', avant: enEssai, update: a1.update, lecture: lAnnulEssai, ref: 'A1', maintenant: T0 });
ok(evA1.length === 1 && evA1[0].evenement === 'arret_essai' && evA1[0].cle === 'A1' && evA1[0].faits.aucunPrelevement === true, 'Apple, coupure pendant l\'essai : arrêt pendant l\'essai, « aucun prélèvement » confirmé par Apple', evA1);
ok(evenementsBoutique({ canal: 'apple', nature: 'annulation', avant: apresA1, update: a1bis.update, lecture: lAnnulEssai, ref: 'A1' }).length === 0, 'rejouée : aucun événement');
const sansConfirmation = evenementsBoutique({ canal: 'apple', nature: 'annulation', avant: enEssai, update: a1.update, lecture: { ...lAnnulEssai, renouvellementAuto: null }, ref: 'A1' });
ok(sansConfirmation.length === 0, 'sans la confirmation de la boutique (renouvellement non lu) : AUCUN mail « aucun prélèvement »');
const evA2 = evenementsBoutique({ canal: 'apple', nature: 'annulation', avant: paye, update: a2.update, lecture: lAnnulPaye, ref: 'A1', maintenant: T0 });
ok(evA2.length === 1 && evA2[0].evenement === 'arret_programme' && evA2[0].faits.finIso === iso(T0 + 10 * J) && evA2[0].cle === `A1:${iso(T0 + 10 * J)}`, 'Apple, coupure pendant une période payée : arrêt programmé, date de fin', evA2);
const evA3 = evenementsBoutique({ canal: 'apple', nature: 'paiement', avant: appliquer(graceEssai, a3.update), update: a3on.update, lecture: lectureCloudApple(txConverti, { autoRenewStatus: 0 }), ref: 'A1' });
ok(evA3.map((e) => e.evenement).join(',') === 'paiement,arret_programme' && evA3[0].faits.contexte === 'fin_essai' && evA3[0].faits.montant?.montant === 24.99,
  'paiement de fin d\'essai puis arrêt gardé : mail de paiement (24,99 lu sur la transaction) + arrêt programmé (même clé que la coupure : un seul)', evA3);
const debut = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple(txEssai, { autoRenewStatus: 1 }), sens: 'on', ref: 'A1', profil: {}, maintenant: T0 - 2 * J });
const evDebut = evenementsBoutique({ canal: 'apple', nature: 'debut', avant: {}, update: debut.update, lecture: lectureCloudApple(txEssai, { autoRenewStatus: 1 }), ref: 'A1' });
ok(evDebut.length === 1 && evDebut[0].evenement === 'essai_debut' && evDebut[0].faits.finIso === iso(T0 + 5 * J), 'Apple SUBSCRIBED avec l\'offre d\'essai : début d\'essai, date de fin', evDebut);
const renouv = evenementsBoutique({ canal: 'apple', nature: 'paiement', avant: { ...paye, cloud_periode_fin: iso(T0) }, update: { is_cloud: true, cloud_periode_fin: iso(T0 + 30 * J), cloud_arret_fin_periode: false },
  lecture: lectureCloudApple({ ...txPaye, transactionId: 'T-3', expiresDate: T0 + 30 * J }, { autoRenewStatus: 1 }), ref: 'A1' });
ok(renouv.length === 1 && renouv[0].faits.contexte === 'renouvellement' && renouv[0].cle === 'A1:T-3', 'renouvellement mensuel : un mail par transaction', renouv);
const rattrape = evenementsBoutique({ canal: 'google', nature: 'paiement', avant: { cloud_canal: 'google', cloud_ref: 'G1', is_cloud: false, cloud_essai_debut: iso(T0 - 90 * J), cloud_essai_fin: iso(T0 - 83 * J), cloud_periode_fin: iso(T0 - 2 * J) },
  update: { is_cloud: true, cloud_periode_fin: iso(T0 + 28 * J) }, lecture: { essai: false, fin: iso(T0 + 28 * J), transaction: 'GPA.7' }, ref: 'G1' });
ok(rattrape[0]?.faits.contexte === 'renouvellement', 'un paiement qui rattrape un impayé des mois après l\'essai : « renouvellement », jamais « fin d\'essai »', rattrape);
const imp = evenementsBoutique({ canal: 'google', nature: 'impaye', avant: { ...paye, cloud_canal: 'google', cloud_ref: 'G1' }, update: { is_cloud: false }, lecture: { fin: iso(T0 + 10 * J) }, ref: 'G1' });
ok(imp.length === 1 && imp[0].evenement === 'impaye' && imp[0].faits.contexte === 'renouvellement' && imp[0].cle === `G1:${iso(T0 + 10 * J)}`, 'Google ON_HOLD / IN_GRACE : impayé, clé = la période (les deux notifications font un seul mail)', imp);
// Stripe
const subEssai = { id: 'sub_E', status: 'trialing', trial_start: T0 / 1000 - 2 * 86_400, trial_end: T0 / 1000 + 5 * 86_400, current_period_end: T0 / 1000 + 5 * 86_400 };
ok(evenementDebutStripe(subEssai)[0]?.evenement === 'essai_debut' && evenementDebutStripe({ ...subEssai, status: 'canceled' }).length === 0, 'Stripe : début d\'essai seulement pour un abonnement en essai (pas pour un essai annulé par le verrou carte)');
const annule = { ...subEssai, status: 'canceled', ended_at: T0 / 1000 };
const evS = evenementArretStripe(annule, [{ amount_paid: 0 }]);
ok(evS.length === 1 && evS[0].evenement === 'arret_essai' && evS[0].faits.aucunPrelevement === true, 'Stripe : annulé avant la fin de l\'essai, factures à 0 → arrêt pendant l\'essai, aucun prélèvement (Stripe le montre)', evS);
ok(evenementArretStripe(annule, [{ amount_paid: 2499 }]).length === 0, 'Stripe : une facture PAYÉE → jamais « aucun prélèvement »');
const actifAnnule = { id: 'sub_P', status: 'active', cancel_at_period_end: true, cancel_at: T0 / 1000 + 20 * 86_400, current_period_end: T0 / 1000 + 20 * 86_400 };
const evP = evenementArretStripe(actifAnnule);
const formatRecent = { id: 'sub_P', status: 'active', cancel_at_period_end: true, cancel_at: T0 / 1000 + 20 * 86_400, items: { data: [{ current_period_end: T0 / 1000 + 20 * 86_400 }] } };
ok(evP[0]?.evenement === 'arret_programme' && evP[0].cle === evenementArretStripe(formatRecent)[0]?.cle && finPeriodeStripe(formatRecent) === T0 / 1000 + 20 * 86_400,
  'Stripe : arrêt programmé, MÊME clé que l\'événement reçu au format d\'API récent (fin de période sur les éléments) — cancel-subscription et le webhook font un seul mail', [evP, evenementArretStripe(formatRecent)]);
const facture = { id: 'in_1', amount_paid: 2499, currency: 'eur', billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: subEssai.trial_end, end: subEssai.trial_end + 30 * 86_400 } }] } };
const evF = evenementPaiementStripe(facture, subEssai);
ok(evF[0]?.faits.contexte === 'fin_essai' && evF[0].faits.montant?.montant === 24.99 && evF[0].cle === 'in_1', 'Stripe : la première facture après l\'essai → « fin d\'essai », montant PAYÉ lu sur la facture (24,99)', evF);
ok(evenementPaiementStripe({ ...facture, amount_paid: 0 }, subEssai).length === 0, 'Stripe : une facture à 0 (création de l\'essai) n\'est pas un paiement');
ok(montantStripe(1999, 'eur')?.montant === 19.99 && montantStripe(2499, 'jpy')?.montant === 2499, 'Stripe : montant remise comprise, devises sans décimale');

// ── C. Les textes ─────────────────────────────────────────────────────────────
console.log('\nC. Les textes (événement × canal × langue)');
const PRIX = { montant: 24.99, devise: 'EUR' };
const faitsDe = {
  essai_debut: { finIso: iso(T0 + 5 * J) },
  paiement: { contexte: 'fin_essai', montant: { montant: 22.49, devise: 'EUR' }, prochaineIso: iso(T0 + 35 * J) },
  arret_essai: { arreteIso: iso(T0), aucunPrelevement: true },
  arret_programme: { finIso: iso(T0 + 20 * J) },
  impaye: { contexte: 'renouvellement' },
};
const INTERDITS = [/sans ordinateur/i, /20 ?€|€ ?20\b|20,00|20\.00/, /🙏|😊|🎉|👋/u, /vinted/i, /\bvous\b|\bvotre\b/i, /option/i];
const tous = [];
for (const ev of EVENEMENTS_MAIL) for (const canal of ['stripe', 'apple', 'google']) for (const lang of ['fr', 'en']) {
  const t = texteMailCloud({ evenement: ev, lang, canal, faits: faitsDe[ev], prix: ev === 'essai_debut' ? PRIX : null });
  if (ev === 'impaye' && canal === 'stripe') { ok(t === null, 'impayé Stripe : son mail existe déjà (paiement-echoue.js), aucun doublon'); continue; }
  if (!t) { ok(false, `${ev} ${canal} ${lang} : texte absent`); continue; }
  tous.push({ ev, canal, lang, t });
  const plein = [t.sujet, t.preheader, ...t.paragraphes, t.bouton?.texte ?? ''].join(' ');
  const fautes = INTERDITS.filter((r) => r.test(plein)).map(String);
  ok(/FillSell Cloud/.test(plein) && fautes.length === 0 && t.categorie === 'support' && t.type === `cloud_${ev}`, `${ev} · ${canal} · ${lang} : « FillSell Cloud », aucun mot interdit, catégorie facturation`, fautes);
}
const fr = (ev, canal) => tous.find((x) => x.ev === ev && x.canal === canal && x.lang === 'fr')?.t;
const net = (s) => String(s).replace(/ | /g, ' ');
ok(fr('essai_debut', 'apple').paragraphes.some((p) => net(p).includes('24,99 € par mois') && /Apple qui prélève/.test(p)) && fr('essai_debut', 'apple').paragraphes.some((p) => /Réglages → ton nom → Abonnements/.test(p)),
  'début d\'essai Apple : le prix LU, Apple prélève, où l\'arrêter (Réglages → ton nom → Abonnements)');
const sansPrix = texteMailCloud({ evenement: 'essai_debut', lang: 'fr', canal: 'google', faits: faitsDe.essai_debut, prix: null });
ok(!/€/.test(sansPrix.paragraphes.join(' ')) && /prix mensuel affiché dans tes abonnements Google Play/.test(sansPrix.paragraphes.join(' ')), 'source muette : AUCUN montant écrit, la phrase renvoie aux abonnements Google Play');
ok(fr('paiement', 'stripe').paragraphes.some((p) => net(p).includes('22,49 €')), 'paiement : le montant PAYÉ (remise comprise), jamais un prix écrit en dur');
ok(fr('arret_essai', 'stripe').paragraphes.some((p) => /Aucun prélèvement/.test(p)) && fr('arret_essai', 'stripe').paragraphes.some((p) => /accusé de réception/.test(p))
  && !fr('arret_essai', 'apple').paragraphes.some((p) => /accusé de réception/.test(p)), 'arrêt pendant l\'essai : « aucun prélèvement » ; Stripe : accusé de réception (L215-1-1) ; Apple : c\'est Apple qui accuse');
ok(texteMailCloud({ evenement: 'arret_essai', lang: 'fr', canal: 'apple', faits: { arreteIso: iso(T0) } }) === null, 'arrêt pendant l\'essai SANS confirmation de la boutique : aucun mail');
ok(/s'arrêtera le/.test(fr('arret_programme', 'google').sujet) && fr('arret_programme', 'google').paragraphes.some((p) => /Rien ne sera prélevé ensuite/.test(p)), 'arrêt programmé : la date de fin au sujet, rien prélevé ensuite (confirmé par la boutique)');
ok(fr('impaye', 'apple').paragraphes.some((p) => /Paiement et livraison/.test(p)) && fr('impaye', 'apple').paragraphes.some((p) => /repart tout seul/.test(p)), 'impayé Apple : où mettre à jour le paiement, repart tout seul');
ok(tous.every(({ t, lang }) => t.paragraphes[0] === (lang === 'en' ? 'Hi,' : 'Salut,')), 'chaque mail commence par « Salut, » / « Hi, »');
const veille = texteRappel({ lang: 'fr', finIso: iso(T0 + 5 * J), canal: 'apple', prix: PRIX });
ok(veille.paragraphes[0] === 'Salut,' && /FillSell Cloud/.test(veille.sujet), 'la veille, alignée : « Salut, » et « FillSell Cloud »');
const rendu = E.mailCloud({ ...fr('arret_programme', 'stripe'), lang: 'fr' });
ok(/Nico/.test(rendu.html) && /FillSell/.test(rendu.html) && !/désinscri(re|ption)<\/a>/i.test(rendu.html) && rendu.sujet === fr('arret_programme', 'stripe').sujet, 'mise en page : signée Nico / FillSell, aucun lien de désinscription (facturation)');

// ── D. L'envoi : un mail par événement ────────────────────────────────────────
console.log('\nD. L\'envoi : un seul mail par événement');
function bancEnvoi({ registre = 'ok', envoi = 'ok' } = {}) {
  const lignes = new Map(); const envois = [];
  const deps = {
    reserver: async ({ userId, evenement, cle }) => {
      if (registre === 'absent') return 'erreur';
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const k = `${userId}|${evenement}|${cle}`;
      if (lignes.has(k)) return 'deja';
      lignes.set(k, { envoye: false }); return 'pris';
    },
    liberer: async ({ userId, evenement, cle }) => { lignes.delete(`${userId}|${evenement}|${cle}`); },
    noter: async ({ userId, evenement, cle }) => { lignes.get(`${userId}|${evenement}|${cle}`).envoye = true; },
    lirePrix: async () => PRIX,
    rendre: (t) => E.mailCloud(t),
    envoyer: async (m) => { if (envoi === 'ko') return { envoye: false, motif: 'resend_echec' }; envois.push(m); return { envoye: true }; },
  };
  return { deps, lignes, envois };
}
{
  const b = bancEnvoi();
  const p = { evenements: evA1, userId: 'u1', email: 'a@exemple.fr', lang: 'fr', canal: 'apple', deps: b.deps };
  const r = await Promise.all([1, 2, 3, 4, 5].map(() => envoyerMailsCloud(p)));
  ok(b.envois.length === 1 && r.flat().filter((x) => x.resultat === 'envoye').length === 1 && r.flat().filter((x) => x.resultat === 'deja_envoye').length === 4,
    'la même coupure reçue 5 fois EN MÊME TEMPS : un seul mail', r.flat());
  await envoyerMailsCloud(p);
  ok(b.envois.length === 1, 'rejouée plus tard : toujours un seul mail');
  ok(b.envois[0].type === 'cloud_arret_essai' && /Aucun prélèvement|aucun prélèvement/i.test(b.envois[0].html), 'le mail parti : arrêt pendant l\'essai, « aucun prélèvement »');
}
{
  const b = bancEnvoi({ envoi: 'ko' });
  const p = { evenements: evDebut, userId: 'u2', email: 'b@exemple.fr', lang: 'fr', canal: 'apple', deps: b.deps };
  const r1 = await envoyerMailsCloud(p);
  ok(r1[0].resultat === 'envoi_resend_echec' && b.lignes.size === 0, 'envoi raté : la clé est LIBÉRÉE (renvoyable au prochain rejeu de la boutique)', r1);
}
{
  const b = bancEnvoi({ registre: 'absent' });
  const r = await envoyerMailsCloud({ evenements: evA2, userId: 'u3', email: 'c@exemple.fr', lang: 'fr', canal: 'apple', deps: b.deps });
  ok(r[0].resultat === 'registre_illisible' && b.envois.length === 0, 'registre absent (migration pas appliquée) : AUCUN mail, jamais d\'exception', r);
}
{
  const b = bancEnvoi();
  const r = await envoyerMailsCloud({ evenements: [{ evenement: 'impaye', cle: 'x', canal: 'stripe', faits: {} }], userId: 'u4', email: 'd@exemple.fr', lang: 'fr', deps: b.deps });
  ok(r[0].resultat === 'sans_mail' && b.lignes.size === 0, 'un événement sans mail (impayé Stripe) ne réserve rien', r);
  const sansAdresse = await envoyerMailsCloud({ evenements: evDebut, userId: 'u5', email: null, deps: b.deps });
  ok(sansAdresse[0].resultat === 'sans_adresse' && b.envois.length === 0, 'sans adresse : rien');
  const prix = bancEnvoi();
  await envoyerMailsCloud({ evenements: evDebut, userId: 'u6', email: 'e@exemple.fr', lang: 'fr', canal: 'apple', deps: prix.deps });
  ok(net(prix.envois[0]?.html ?? '').includes('24,99 €'), 'début d\'essai : le prix de la prochaine échéance, lu à la source au moment du mail');
}

console.log(`\n${ko === 0 ? 'TOUT VERT' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
