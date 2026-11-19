// ═══════════════════════════════════════════════════════════
// VERROU — UN PAIEMENT RÉEL = UNE CONFIRMATION, APPLE / GOOGLE / STRIPE (19/11/2026, ordre de Nico)
//                                                                     npm run selftest:confirmation-paiement
// ═══════════════════════════════════════════════════════════
// Nico, 19/11 : « depuis le prorata, une montée Google au même palier (Pro → Pro + Cloud) n'envoie plus le mail
// « Paiement reçu » ni l'événement Meta. Un client qui paie reçoit toujours sa confirmation, avec le montant réellement
// payé, exactement comme sur iPhone. Même règle des deux côtés. L'événement Meta part aussi avec le montant réel.
// Jamais deux mails pour un même paiement, jamais de mail pour un essai à 0 €. »
// Ce verrou fait tomber :
//   · une montée au prorata (Google, Stripe) sans « Paiement reçu » ni Meta ; un essai à 0 € confirmé ;
//   · deux confirmations pour un paiement (webhook + validation de l'app, rejeu de la boutique) ;
//   · un mail Google sans le montant payé alors que la commande le donne ; « est renouvelée » sur une montée ;
//   · Meta sans le montant réel ; Apple (la référence) qui change.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: e?.message ?? String(e) }; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (t) => String(t ?? '').replace(ESP, ' ');

const R = await charger('supabase/functions/_shared/confirmation-paiement.js');
const GC = await charger('supabase/functions/_shared/google-commande.js');
const CM = await charger('supabase/functions/_shared/cloud-mails.js');
const CO = await charger('supabase/functions/_shared/cloud-option.js');
const META = await charger('supabase/functions/_shared/meta-capi.js');
const d = R.decisionConfirmation ?? (() => ({ confirmer: null }));
ok(typeof R.decisionConfirmation === 'function' && typeof R.confirmerPaiement === 'function', 'la règle commune existe (_shared/confirmation-paiement.js)', R.__erreur ?? '');
ok(typeof GC.lireMontantCommandeGoogle === 'function', 'la lecture de la commande Google existe (_shared/google-commande.js)', GC.__erreur ?? '');

console.log('\n— A. La règle, canal par canal');
// Apple (la référence) : une montée Pro → Pro + Cloud rouvre une période pleine → crédit → confirmé, au prix de la transaction.
const txApple = { productId: 'app.fillsell.pro.cloud', offerType: null, price: 49990, currency: 'EUR', purchaseDate: Date.parse('2026-11-19T10:00:00Z'), expiresDate: Date.parse('2026-12-19T10:00:00Z'), transactionId: '2000000123', originalTransactionId: '2000000001' };
const lecApple = CO.lectureFormuleApple?.(txApple) ?? {};
ok(lecApple.montantPaye?.montant === 49.99 && lecApple.montantPaye?.devise === 'EUR', 'Apple : le montant payé est celui de la transaction (49,99 €)', JSON.stringify(lecApple.montantPaye));
let x = d({ essai: lecApple.essai, granted: true, raison: null, changement: false, montant: lecApple.montantPaye });
ok(x.confirmer === true && x.voie === 'credit', 'Apple : montée Pro → Pro + Cloud (période neuve, crédit) → confirmée', JSON.stringify(x));
ok(R.texteMontantAlerte?.(lecApple.montantPaye) === '49.99 EUR', 'Apple : « Paiement reçu » et Meta au montant payé (49.99 EUR)');
const essaiApple = CO.lectureFormuleApple?.({ ...txApple, offerType: 1, offerDiscountType: 'FREE_TRIAL', price: 0 }) ?? {};
x = d({ essai: essaiApple.essai, granted: false, raison: null });
ok(essaiApple.essai === true && essaiApple.montantPaye === null && x.confirmer === false && x.raison === 'essai_0_euro', 'Apple : essai à 0 € → aucune confirmation', JSON.stringify(x));
// Google : la montée au prorata garde l'échéance → même palier → pas de crédit (no_upgrade_needed) → confirmée QUAND MÊME.
const paye = { montant: 21.43, devise: 'EUR' }, plein = { montant: 49.99, devise: 'EUR' };
const chg = R.changementAuProrataGoogle?.({ remplace: true, montant: paye, prixPlein: plein, debut: '2026-11-19T10:00:00Z', fin: '2026-12-02T08:00:00Z' });
ok(chg === true, 'Google : jeton qui en remplace un autre + commande partielle (21,43 € < 49,99 €) = montée au prorata');
x = d({ essai: false, granted: false, raison: 'no_upgrade_needed', changement: chg, montant: paye });
ok(x.confirmer === true && x.voie === 'prorata', 'Google : montée Pro → Pro + Cloud au prorata, sans crédit → confirmée (la cause du 19/11)', JSON.stringify(x));
ok(R.texteMontantAlerte?.(paye) === '21.43 EUR', 'Google : « Paiement reçu » et Meta au montant réellement payé (21.43 EUR)');
ok(R.changementAuProrataGoogle?.({ remplace: true, montant: plein, prixPlein: plein }) === false, 'Google : un remplacement AU PRIX PLEIN n\'est pas une montée au prorata');
ok(R.changementAuProrataGoogle?.({ remplace: false, montant: paye, prixPlein: plein }) === false, 'Google : un achat neuf (rien de remplacé) n\'est pas une montée');
ok(R.changementAuProrataGoogle?.({ remplace: true, debut: '2026-11-19T10:00:00Z', fin: '2026-12-02T08:00:00Z' }) === true
  && R.changementAuProrataGoogle?.({ remplace: true, debut: '2026-11-19T10:00:00Z', fin: '2026-12-19T10:00:00Z' }) === false,
  'Google, montant illisible : l\'échéance gardée (période < 27 j) le dit ; une période pleine, non');
x = d({ essai: true, granted: false, raison: null, changement: false, montant: null });
ok(x.confirmer === false && x.raison === 'essai_0_euro', 'Google : essai à 0 € → aucune confirmation');
x = d({ essai: false, granted: false, raison: 'already_granted', changement: false, montant: paye });
ok(x.confirmer === false, 'Google : un renouvellement rejoué (déjà crédité) → rien de plus');
x = d({ essai: false, granted: false, raison: 'no_upgrade_needed', changement: true, montant: null });
ok(x.confirmer === false && x.raison === 'changement_montant_inconnu', 'Google : montée sans montant lisible → pas de « Paiement reçu » à 0 € (l\'alerte Cloud le signale)');
// Stripe : la facture de prorata d'une montée (subscription_update) — même règle.
const mStripe = CM.montantStripe?.(2143, 'eur');
x = d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: mStripe });
ok(mStripe?.montant === 21.43 && x.confirmer === true && x.voie === 'prorata', 'Stripe : facture de prorata d\'une montée, sans crédit → confirmée (21,43 €)', JSON.stringify(x));
x = d({ granted: true, raison: null, changement: false, montant: CM.montantStripe?.(4999, 'eur') });
ok(x.confirmer === true && x.voie === 'credit', 'Stripe : renouvellement crédité → confirmé (comme avant)');
x = d({ granted: false, raison: 'no_upgrade_needed', changement: false, montant: CM.montantStripe?.(4999, 'eur') });
ok(x.confirmer === false, 'Stripe : facture rejouée sur un cycle déjà crédité → rien de plus');
ok(CM.evenementPaiementStripe?.({ id: 'in_essai', amount_paid: 0, currency: 'eur', billing_reason: 'subscription_create' }).length === 0
  && CM.montantStripe?.(0, 'eur') === null, 'Stripe : facture d\'essai à 0 € → aucun paiement, aucun montant');

console.log('\n— B. Une seule confirmation par paiement (registre, clé = numéro du paiement)');
const scene = () => {
  const registre = new Set(); const envoyees = []; let panne = false;
  const deps = {
    reserver: async ({ cle }) => (panne ? 'erreur' : registre.has(cle) ? 'deja' : (registre.add(cle), 'pris')),
    notifier: async (a) => { envoyees.push(a); }, journal: () => {},
  };
  return { deps, envoyees, registre, panne: (v) => { panne = v; } };
};
const confirmer = (s, decision, canal, paiement) => R.confirmerPaiement?.({ decision, canal, paiement, alerte: { canal, paiement }, deps: s.deps });
{
  const s = scene();
  // La validation de l'app passe la première (montée de palier : crédit), le webhook ensuite (même commande, sans crédit).
  await confirmer(s, d({ granted: true }), 'google', 'GPA.1111-2222-3333-44444');
  await confirmer(s, d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: paye }), 'google', 'GPA.1111-2222-3333-44444');
  await confirmer(s, d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: paye }), 'google', 'GPA.1111-2222-3333-44444');   // rejeu Pub/Sub
  ok(s.envoyees.length === 1, 'Google : validation de l\'app + webhook + rejeu Pub/Sub de la même commande → UNE confirmation', s.envoyees.length);
  await confirmer(s, d({ granted: true }), 'google', 'GPA.1111-2222-3333-44444..0');   // le renouvellement du mois suivant
  ok(s.envoyees.length === 2, 'Google : le renouvellement suivant (autre commande) → sa propre confirmation');
}
{
  const s = scene();
  await confirmer(s, d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: mStripe }), 'stripe', 'in_123');
  await confirmer(s, d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: mStripe }), 'stripe', 'in_123');
  ok(s.envoyees.length === 1, 'Stripe : la facture de prorata rejouée par Stripe → UNE confirmation');
}
{
  const s = scene(); s.panne(true);
  ok(await confirmer(s, d({ granted: true }), 'apple', '2000000123') === 'envoyee' && s.envoyees.length === 1, 'registre illisible, voie du crédit : la confirmation part quand même (comme avant)');
  ok(await confirmer(s, d({ granted: false, raison: 'no_upgrade_needed', changement: true, montant: paye }), 'google', 'GPA.9') === 'registre_illisible' && s.envoyees.length === 1,
    'registre illisible, voie du prorata : rien (jamais de doublon possible)');
  ok(await confirmer(s, d({ essai: true }), 'google', 'GPA.8') === 'non_confirmee' && s.envoyees.length === 1, 'essai : rien n\'est réservé ni envoyé');
}
ok(R.cleConfirmation?.('google', 'GPA.1') === 'confirmation:google:GPA.1', 'la clé : confirmation:<canal>:<numéro du paiement>');

console.log('\n— C. La commande Google : le montant réellement payé');
ok(JSON.stringify(GC.montantDeCommandeGoogle?.({ total: { currencyCode: 'EUR', units: '21', nanos: 430000000 } })) === JSON.stringify({ montant: 21.43, devise: 'EUR' }), 'total { units 21, nanos 0.43 } → 21,43 €');
ok(GC.montantDeCommandeGoogle?.({ total: { currencyCode: 'EUR', units: '0' } }) === null && GC.montantDeCommandeGoogle?.({}) === null, 'commande à 0 € ou sans total → aucun montant (rien d\'inventé)');
const faux = (statut, corps) => async (url, opts) => { faux.url = url; faux.auth = opts?.headers?.Authorization; return { status: statut, ok: statut >= 200 && statut < 300, json: async () => corps }; };
let lu = await GC.lireMontantCommandeGoogle?.({ jeton: 'J', orderId: 'GPA.3365-1', fetchImpl: faux(200, { total: { currencyCode: 'EUR', units: '79', nanos: 990000000 } }) });
ok(lu?.raison === 'ok' && lu?.montant?.montant === 79.99 && /\/applications\/app\.fillsell\.app\/orders\/GPA\.3365-1$/.test(faux.url) && faux.auth === 'Bearer J',
  'orders.get : la commande lue par son numéro, avec le jeton du compte de service', JSON.stringify(lu) + ' ' + faux.url);
lu = await GC.lireMontantCommandeGoogle?.({ jeton: 'J', orderId: 'GPA.1', fetchImpl: faux(403, {}) });
ok(lu?.montant === null && lu?.raison === 'droit_refuse', 'droit refusé (403) → montant inconnu, raison dite');
lu = await GC.lireMontantCommandeGoogle?.({ jeton: 'J', orderId: 'GPA.1', fetchImpl: faux(404, {}) });
ok(lu?.montant === null && lu?.raison === 'introuvable', 'commande introuvable (404) → montant inconnu');
lu = await GC.lireMontantCommandeGoogle?.({ jeton: 'J', orderId: 'GPA.1', fetchImpl: async () => { throw new Error('coupé'); } });
ok(lu?.montant === null && lu?.raison === 'reseau', 'réseau coupé → montant inconnu, jamais une erreur qui bloque le paiement');
ok((await GC.lireMontantCommandeGoogle?.({ jeton: 'J', orderId: null }))?.raison === 'sans_commande', 'sans numéro de commande → rien n\'est lu');

console.log('\n— D. Le mail au client : Google comme iPhone, au montant payé');
const tok = 'jeton-neuf', fin = '2026-12-02T08:00:00.000Z';
const lecG = { formule: 'pro_cloud', essai: false, phaseEssai: false, transaction: 'GPA.1111', fin, montantPaye: paye, changement: true };
// La validation de l'app a écrit le Cloud AVANT la notification (avant.is_cloud = true) : jamais « est renouvelée ».
const evs = CM.evenementsBoutique?.({ canal: 'google', nature: 'debut', avant: { is_cloud: true, cloud_ref: tok }, update: { is_cloud: true, cloud_periode_fin: fin }, lecture: lecG, ref: tok }) ?? [];
const evP = evs.find((e) => e.evenement === 'paiement');
ok(evP?.faits?.contexte === 'changement' && evP?.faits?.montant?.montant === 21.43 && evP?.cle === `${tok}:GPA.1111`,
  'Google, montée au prorata : un événement « paiement », contexte changement, 21,43 €, clé = jeton + commande', JSON.stringify(evs));
const mail = evP ? CM.texteMailFormule?.({ evenement: 'paiement', lang: 'fr', canal: 'google', faits: evP.faits }) : null;
const corps = net([mail?.sujet, mail?.preheader, ...(mail?.paragraphes ?? [])].join(' | '));
ok(/Ta formule passe à Pro \+ Cloud/.test(corps), 'le sujet : « Ta formule passe à Pro + Cloud »', corps);
ok(/Google Play a prélevé 21,43 € sur ton compte Google\./.test(corps), 'le montant payé : « Google Play a prélevé 21,43 € sur ton compte Google. »', corps);
ok(/Paiement reçu : 21,43 €/.test(corps) && /différence au prorata/.test(corps), 'l\'aperçu « Paiement reçu : 21,43 € » et « la différence au prorata »', corps);
const evsApple = CM.evenementsBoutique?.({ canal: 'apple', nature: 'debut', avant: { is_cloud: false }, update: { is_cloud: true }, lecture: { ...lecApple, formule: 'pro_cloud' }, ref: '2000000001' }) ?? [];
const mailA = CM.texteMailFormule?.({ evenement: 'paiement', lang: 'fr', canal: 'apple', faits: evsApple.find((e) => e.evenement === 'paiement')?.faits ?? {} });
ok(/Apple a prélevé 49,99 € sur ton compte Apple\./.test(net((mailA?.paragraphes ?? []).join(' '))), 'Apple (inchangé) : « Apple a prélevé 49,99 € sur ton compte Apple. »');
const evsCloud = CM.evenementsBoutique?.({ canal: 'google', nature: 'debut', avant: {}, update: { is_cloud: true }, lecture: { essai: false, transaction: 'GPA.2', fin, montantPaye: paye, changement: true }, ref: 'cloud-seul' }) ?? [];
ok(evsCloud.find((e) => e.evenement === 'paiement')?.faits?.contexte === 'debut', 'le Cloud seul n\'a pas de « changement » (texte absent) : il garde « a commencé »');
const evsEssai = CM.evenementsBoutique?.({ canal: 'google', nature: 'debut', avant: {}, update: { is_cloud: true, cloud_essai_debut: '2026-11-19T10:00:00Z', cloud_essai_fin: '2026-11-26T10:00:00Z' }, lecture: { formule: 'pro_cloud', essai: true, transaction: 'GPA.3', fin: '2026-11-26T10:00:00Z' }, ref: 't' }) ?? [];
ok(evsEssai.length >= 1 && !evsEssai.some((e) => e.evenement === 'paiement'), 'essai Google à 0 € : le mail d\'essai seulement, jamais de mail de paiement');

console.log('\n— E. Meta : le montant réel');
const dm = META.demandesDePaiement?.({ ok: true, type: 'abonnement', canal: 'google', montant: '21.43 EUR' }) ?? [];
ok(dm.length === 2 && dm.every((q) => q.montant?.montant === 21.43 && q.montant?.devise === 'EUR'), 'Google : Subscribe + Purchase à 21,43 € (avant : aucun montant, Purchase refusé)', JSON.stringify(dm));
ok((META.demandesDeCloud?.([{ evenement: 'paiement', faits: { contexte: 'changement', montant: paye } }]) ?? []).length === 0,
  'la montée ne double pas Meta par le mail Cloud : l\'alerte « Paiement reçu » seule le porte (règle « une fois par compte » inchangée)');

console.log('\n— F. Les branchements (Google, Stripe ; Apple, la référence, inchangé)');
const gw = lire('supabase/functions/google-play-webhook/index.ts');
const plan = gw.slice(gw.indexOf('async function planGoogle('), gw.indexOf('\nserve(async'));
ok(/const payeGoogle = \[1, 2, 4\]\.includes\(notificationType\) && lecture\.essai !== true && lecture\.phaseEssai !== true\s*\? await lireMontantCommandeGoogle\(\{ jeton: accessToken, orderId: \(lecture\.transaction as string \| null\) \?\? null \}\)/.test(plan),
  'webhook Google : la commande lue (jamais pendant un essai) avant les événements');
ok(plan.indexOf('const payeGoogle') < plan.indexOf('const evenements') && /\(lecture as Record<string, unknown>\)\.montantPaye = payeGoogle\.montant/.test(plan) && /\(lecture as Record<string, unknown>\)\.changement = true/.test(plan),
  'webhook Google : le mail reçoit le montant payé et la montée au prorata');
ok(/confirmerPaiementServeur\(supabaseAdmin, \{\s*decision: decisionConfirmation\(\{ essai: lecture\.essai === true, granted: g\?\.granted === true, raison: g\?\.reason \?\? null, changement: changementGoogle, montant: payeGoogle\.montant \}\),\s*canal: "google", paiement: \(lecture\.transaction as string \| null\) \?\? null/.test(plan)
  && /montant: texteMontantAlerte\(payeGoogle\.montant\)/.test(plan), 'webhook Google (formules avec Cloud) : la règle commune, clé = commande, montant payé');
ok(!/granted === true\) \{\s*await notifierPaiement\(\{ canal: "google"[^}]*type: "abonnement"/.test(gw), 'webhook Google : plus aucune alerte d\'abonnement liée au seul crédit');
ok(/lectureCloud as Record<string, unknown>\)\.montantPaye = lu\.montant/.test(gw), 'webhook Google (Cloud seul) : le mail dit le montant payé');
const vg = lire('supabase/functions/validate-google-purchase/index.ts');
ok(/const orderIdV = \(lectureV\.transaction as string \| null\) \?\? null;/.test(vg) && /canal: "google", paiement: orderIdV, userId, journal: "\[validate-google-purchase\]"/.test(vg),
  'validation de l\'app (formules avec Cloud) : même règle, MÊME clé que le webhook (la commande)');
ok(/canal: "google", paiement: orderId, userId, journal: "\[validate-google-purchase\]"/.test(vg) && /canal: "google", paiement: orderId, userId, journal: "\[google-play-webhook\]"/.test(gw),
  'formules sans Cloud : webhook et validation, même clé (la commande)');
ok(!/granted === true\) \{\s*\/\/ granted=false = cycle déjà crédité \(le webhook est passé avant\)/.test(vg), 'validation de l\'app : plus aucune alerte d\'abonnement liée au seul crédit');
const sw = lire('supabase/functions/stripe-webhook/index.ts');
const paye_ = sw.slice(sw.indexOf('if (event.type === "invoice.paid")'), sw.indexOf('if (event.type === "customer.subscription.deleted")'));
ok(/changement: invoice\.billing_reason === "subscription_update", montant: montantStripe\(invoice\.amount_paid \?\? 0, invoice\.currency \?\? ""\)/.test(paye_)
  && /canal: "stripe", paiement: invoice\.id \?\? null/.test(paye_), 'Stripe : la facture de prorata confirmée, clé = la facture');
ok(paye_.indexOf('if (subFacture?.status === "trialing")') > 0 && paye_.indexOf('if (subFacture?.status === "trialing")') < paye_.indexOf('confirmerPaiementServeur'),
  'Stripe : la facture d\'un essai sort AVANT toute confirmation (essai à 0 €)');
const aw = lire('supabase/functions/apple-iap-webhook/index.ts');
ok(/notifierPaiement\(\{[\s\S]{0,400}montant[\s\S]{0,200}\}\)/.test(aw) && /tx\.price/.test(aw), 'Apple (la référence) : l\'alerte part au montant de la transaction, comme avant');
const dn = lire('supabase/functions/_shared/confirmation-paiement-deno.ts');
ok(/from\("cloud_mails"\)\.insert\(\{ user_id: p\.userId, evenement: "paiement", cle, canal: p\.canal \}\)/.test(dn) && /=== "23505"\) return "deja"/.test(dn),
  'la réservation : registre cloud_mails (insertion unique, 23505 = déjà confirmé)');
ok(/payment_alert/.test(lire('supabase/functions/_shared/payment-notify.ts')), 'l\'alerte passe par payment_alert d\'email-tunnel (« Paiement reçu » + Meta), inchangé');

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
