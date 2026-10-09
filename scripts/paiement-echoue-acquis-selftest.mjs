// Selftest — le mail « paiement échoué » ne part que sur un échec ACQUIS
// (09/10/2026, cas Marta), SANS réseau ni Stripe.
//
//     npm run selftest:paiement-echoue-acquis   (node scripts/paiement-echoue-acquis-selftest.mjs)
//
// Ce qu'il prouve, sur les FAITS RÉELS relevés dans les journaux de
// stripe-webhook (ce que la fonction a lu chez Stripe à l'instant de
// l'événement : billing_reason, statut de la facture relue, cause relue sur
// le PaymentIntent, prochaine tentative, abonnement « actif ») :
//   · Marta (09/10, Pro, 3D Secure au Checkout, payé 34 s après) : AUCUN mail ;
//   · romain.knc (08/10, Premium, même parcours, payé 2,9 min après) : AUCUN mail ;
//   · nadegemarcelin78 (09/10 01:58 Paris, renouvellement refusé par la
//     banque) : le mail part TOUJOURS, avec le même texte qu'avant ;
//   · geronimo0550 (06/10, renouvellement échoué) : le mail part toujours ;
//   · « Lojh boutique » (souscription abandonnée, abonnement passé à
//     incomplete_expired le 03/10 à 21:46 UTC) : le mail part — au moment où
//     l'échec est ACQUIS, pas pendant le paiement ;
//   · un échec suivi d'un succès, un événement relivré après paiement, une
//     personne qui a payé autrement : jamais de mail ;
//   · la cause fine (causeDuPaiement) est la règle du 07/08 à l'identique ;
//   · le câblage : la décision précède tout signal dans stripe-webhook, le seul
//     appel à signalerPaiementEchoue passe par elle, l'abandon est écouté sur
//     incomplete_expired, et les droits (upgrade_monthly_grant) ne bougent pas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  decisionMailEchec, causeDuPaiement, faitsEchec, texteEchec, EVENEMENTS_ECHEC,
} from '../supabase/functions/_shared/paiement-echoue.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(`\n${t}`);
const lire = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const s = (iso) => Math.floor(Date.parse(iso) / 1000);
const MOIS = 30 * 86_400;
const LIEN = (id) => `https://invoice.stripe.com/i/acct_1/live_${id}`;

// ── Les pièces réelles (journaux de stripe-webhook v57) ──────────────────────
// Marta, cus_VPOXODf6ppd23H — 2026-10-09 (UTC) :
//   09:05:53 [checkout] client Stripe créé pour ac19c8c9-…
//   09:06:46.172 invoice.payment_failed facture=in_1UOZlGQZRA77vrWJJtwrivJd billing_reason=subscription_create amount_due=2999
//   09:06:46.180 invoice.payment_action_required (même facture)
//   09:06:46.883 échec … cause=3ds contexte=souscription bouton=app relance=aucune actif=false
//   09:06:47 email_logs payment_failed:in_1UOZlG… (le mail parti à tort)
//   09:07:20.337 subscription.updated … status: active
//   09:07:21.558 coin_ledger grant_upgrade pro (source payment)
const MARTA = {
  facture: {
    id: 'in_1UOZlGQZRA77vrWJJtwrivJd', status: 'open', billing_reason: 'subscription_create',
    amount_due: 2999, hosted_invoice_url: LIEN('marta'), next_payment_attempt: null,
    lines: { data: [{ period: { start: s('2026-10-09T09:06:42Z'), end: s('2026-11-09T09:06:42Z') } }] },
  },
  abonnement: { id: 'sub_marta', status: 'incomplete', trial_end: null, metadata: { plan_type: 'pro' } },
  pi: { status: 'requires_action', last_payment_error: null },
};
// romain.knc, cus_VP0aAgGAxeEQD1 — 2026-10-08 08:20:51 (UTC), même parcours, payé 08:23:45.
const ROMAIN = {
  facture: { ...MARTA.facture, id: 'in_1UOCZFQZRA77vrWJwGV5cmI0', amount_due: 1299 },
  abonnement: { ...MARTA.abonnement, id: 'sub_romain', metadata: { plan_type: 'premium' } },
  pi: MARTA.pi,
};
// nadegemarcelin78, cus_V9ileuDYFPcQ1n — 2026-10-08 23:57:58 (UTC) = 09/10 01:57:58 Paris :
//   invoice.payment_failed facture=in_1UKe75QZRA77vrWJGQibRJMe billing_reason=subscription_cycle amount_due=1299
//   échec … cause=carte_refusee contexte=renouvellement bouton=facture relance=2026-10-09T21:57:52.000Z actif=true
//   → bouton=facture ⇔ facture relue OUVERTE avec un lien Stripe ; actif=true ⇔ abonnement active | past_due.
const NADEGE = {
  facture: {
    id: 'in_1UKe75QZRA77vrWJGQibRJMe', status: 'open', billing_reason: 'subscription_cycle',
    amount_due: 1299, hosted_invoice_url: LIEN('nadege'), next_payment_attempt: s('2026-10-09T21:57:52Z'),
    lines: { data: [{ period: { start: s('2026-10-08T23:50:00Z'), end: s('2026-10-08T23:50:00Z') + MOIS } }] },
  },
  abonnement: { id: 'sub_nadege', status: 'past_due', trial_end: null, metadata: {} },
  pi: { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'generic_decline' } },
};
// geronimo0550, cus_VCguVZShSNFum8 — 2026-10-06 06:56:26 (UTC) :
//   billing_reason=subscription_cycle, cause=autre, bouton=facture, relance=2026-10-07T17:14:38Z, actif=true
const GERONIMO = {
  facture: { ...NADEGE.facture, id: 'in_1UN9phQZRA77vrWJia5A4RIF', next_payment_attempt: s('2026-10-07T17:14:38Z') },
  abonnement: { ...NADEGE.abonnement, id: 'sub_geronimo', status: 'active' },
  pi: { status: 'requires_payment_method', last_payment_error: { code: 'processing_error' } },
};
// « Lojh boutique » (d74ce4ab-…), cus_VMzBk22OhFEgQq :
//   2026-10-02 22:45:20 [checkout] client Stripe créé ; aucun paiement ;
//   2026-10-03 21:46:04 subscription.updated … status: incomplete_expired (23 h après) ;
//   profil toujours gratuit (ni is_premium, ni is_pro, ni Apple / Google).
const LOJH = {
  facture: { id: 'in_lojh', status: 'void', billing_reason: 'subscription_create', amount_due: 1299, hosted_invoice_url: null, next_payment_attempt: null, lines: { data: [] } },
  abonnement: { id: 'sub_lojh', status: 'incomplete_expired', trial_end: null, metadata: { plan_type: 'premium', fillsell_user_id: 'd74ce4ab-b15a-485c-988c-c5412081b92f' } },
  pi: { status: 'canceled', last_payment_error: null },
};

const echec = (cas, evenement) => decisionMailEchec({ evenement, facture: cas.facture, abonnement: cas.abonnement });

titre('Marta (09/10) : 3D Secure pendant le paiement initial, payé 34 s plus tard → AUCUN mail');
{
  for (const ev of EVENEMENTS_ECHEC) {
    const d = echec(MARTA, ev);
    ok(d.envoyer === false && d.raison === 'paiement_initial_en_cours', `${ev} (11:06:46) → aucun mail (${d.raison})`);
  }
  const actif = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: { ...MARTA.facture, status: 'paid' }, abonnement: { ...MARTA.abonnement, status: 'active' } });
  ok(actif.envoyer === false && actif.raison === 'pas_un_abandon', 'subscription.updated « active » (11:07:20) → aucun mail');
  const relivre = echec({ ...MARTA, facture: { ...MARTA.facture, status: 'paid' } }, 'invoice.payment_failed');
  ok(relivre.envoyer === false && relivre.raison === 'facture_payee', 'le même échec relivré par Stripe après le paiement (facture relue payée) → aucun mail');
  ok(causeDuPaiement({ pi: MARTA.pi, evenement: 'invoice.payment_failed' }).cause === '3ds', 'la cause relue reste « 3ds » (comme le journal : cause=3ds)');
}

titre('romain.knc (08/10) : même parcours, payé 2,9 min plus tard → AUCUN mail');
for (const ev of EVENEMENTS_ECHEC) {
  const d = echec(ROMAIN, ev);
  ok(d.envoyer === false && d.raison === 'paiement_initial_en_cours', `${ev} → aucun mail`);
}

titre('Paiement initial : AUCUN motif ne fait partir le mail pendant la session (3DS, refus, autre carte)');
for (const pi of [
  { status: 'requires_action', last_payment_error: null },
  { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } },
  { status: 'requires_payment_method', last_payment_error: { code: 'expired_card' } },
  { status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'authentication_required' } },
]) {
  const cause = causeDuPaiement({ pi, evenement: 'invoice.payment_failed' }).cause;
  const d = echec({ ...MARTA, pi }, 'invoice.payment_failed');
  ok(d.envoyer === false, `souscription, cause ${cause} → aucun mail tant que Stripe n'a pas abandonné`);
}

titre('nadegemarcelin78 (09/10 01:58 Paris) : VRAI échec de renouvellement → le mail part TOUJOURS');
{
  for (const ev of EVENEMENTS_ECHEC) {
    const d = echec(NADEGE, ev);
    ok(d.envoyer === true && d.raison === 'echec_acquis', `${ev} → mail (${d.raison})`);
  }
  ok(echec({ ...NADEGE, abonnement: { ...NADEGE.abonnement, status: 'active' } }, 'invoice.payment_failed').envoyer === true, 'abonnement « active » (actif=true du journal) → mail aussi');
  ok(echec({ ...NADEGE, abonnement: null }, 'invoice.payment_failed').envoyer === true, 'abonnement illisible → le mail part quand même (jamais un blocage)');
  const { cause, code } = causeDuPaiement({ pi: NADEGE.pi, evenement: 'invoice.payment_failed' });
  ok(cause === 'carte_refusee' && code === 'generic_decline', 'cause relue : carte_refusee (comme le journal)');
  const f = faitsEchec({ facture: NADEGE.facture, abonnement: NADEGE.abonnement });
  ok(f.contexte === 'renouvellement' && f.lien_facture === LIEN('nadege') && f.abonnement_actif === true
    && f.relance_le === '2026-10-09T21:57:52.000Z', 'faits identiques au journal : renouvellement, bouton facture, relance 21:57:52Z, actif');
  const t = texteEchec({ lang: 'fr', cause, contexte: f.contexte, lienFacture: f.lien_facture, relanceLe: f.relance_le, abonnementActif: f.abonnement_actif });
  ok(t.sujet === "Ton paiement n'a pas abouti" && t.bouton?.texte === 'Régler la facture' && t.bouton?.url === LIEN('nadege'),
    'texte inchangé : « Ton paiement n\'a pas abouti », bouton « Régler la facture »');
  ok(t.suite.some((x) => x.includes('vendredi 9 octobre')) && t.suite.includes("Ton abonnement reste actif pour l'instant."), 'relance « vendredi 9 octobre » et « reste actif »');
}

titre('geronimo0550 (06/10) : renouvellement échoué → le mail part toujours');
ok(echec(GERONIMO, 'invoice.payment_failed').envoyer === true, 'invoice.payment_failed → mail');

titre('Fin d\'essai (Cloud ou palier) : échec acquis → mail, comme avant');
{
  const finEssai = s('2026-10-10T08:00:00Z');
  const d = decisionMailEchec({
    evenement: 'invoice.payment_failed',
    facture: { status: 'open', billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: finEssai } }] } },
    abonnement: { status: 'past_due', trial_end: finEssai, metadata: { option: 'cloud' } },
  });
  ok(d.envoyer === true, 'fin d\'essai Cloud impayée → mail');
}

titre('« Lojh boutique » (03/10) : souscription ABANDONNÉE (incomplete_expired) → le mail part, une fois acquis');
{
  const d = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: LOJH.facture, abonnement: LOJH.abonnement });
  ok(d.envoyer === true && d.raison === 'souscription_abandonnee', `incomplete_expired, facture annulée, rien payé ailleurs → mail (${d.raison})`);
  ok(decisionMailEchec({ evenement: 'customer.subscription.deleted', facture: LOJH.facture, abonnement: LOJH.abonnement }).envoyer === true,
    'si Stripe le dit par subscription.deleted : même verdict');
  const { cause } = causeDuPaiement({ pi: LOJH.pi, evenement: 'customer.subscription.updated' });
  const f = faitsEchec({ facture: LOJH.facture, abonnement: LOJH.abonnement });
  const t = texteEchec({ lang: 'fr', cause, contexte: f.contexte });
  ok(f.contexte === 'souscription' && t.bouton?.url === 'https://fillsell.app' && t.intro.includes("n'a pas pu démarrer"),
    'texte « souscription » : « Ton abonnement n\'a pas pu démarrer », bouton vers l\'app');
  const paye = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: LOJH.facture, abonnement: LOJH.abonnement, memeOffreVivante: true });
  ok(paye.envoyer === false && paye.raison === 'paye_par_un_autre_abonnement', 'a payé par un autre abonnement (autre session, autre carte) → aucun mail');
  const ouvert = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: LOJH.facture, abonnement: LOJH.abonnement, compteDejaOuvert: true });
  ok(ouvert.envoyer === false && ouvert.raison === 'compte_deja_abonne', 'palier déjà ouvert ailleurs (Apple, Google, offert) → aucun mail');
  const factPayee = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: { ...LOJH.facture, status: 'paid' }, abonnement: LOJH.abonnement });
  ok(factPayee.envoyer === false, 'facture relue payée → aucun mail');
  const pasCreation = decisionMailEchec({ evenement: 'customer.subscription.updated', facture: { ...LOJH.facture, billing_reason: 'subscription_cycle' }, abonnement: LOJH.abonnement });
  ok(pasCreation.envoyer === false && pasCreation.raison === 'pas_une_souscription', 'dernière facture qui n\'est pas la création → aucun mail');
  for (const st of ['incomplete', 'active', 'past_due', 'unpaid', 'canceled']) {
    ok(decisionMailEchec({ evenement: 'customer.subscription.updated', facture: LOJH.facture, abonnement: { ...LOJH.abonnement, status: st } }).envoyer === false,
      `abonnement « ${st} » → ce n'est pas un abandon, aucun mail`);
  }
}

titre('Les autres gardes');
{
  const montee = decisionMailEchec({ evenement: 'invoice.payment_action_required', facture: { status: 'open', billing_reason: 'subscription_update' } });
  ok(montee.envoyer === false && montee.raison === 'montee_de_palier', 'montée de palier (subscription_update) → aucun mail (règle du 24/09)');
  const annulee = echec({ ...NADEGE, facture: { ...NADEGE.facture, status: 'void' } }, 'invoice.payment_failed');
  ok(annulee.envoyer === false && annulee.raison === 'facture_annulee', 'renouvellement dont la facture relue est annulée → aucun mail');
  const payee = echec({ ...NADEGE, facture: { ...NADEGE.facture, status: 'paid' } }, 'invoice.payment_failed');
  ok(payee.envoyer === false && payee.raison === 'facture_payee', 'renouvellement déjà réglé quand l\'événement arrive → aucun mail');
  ok(decisionMailEchec({ evenement: 'invoice.paid', facture: NADEGE.facture }).envoyer === false, 'tout autre événement → aucun mail');
}

titre('La cause fine : la règle du 07/08, à l\'identique');
{
  const c = (pi, ev = 'invoice.payment_failed') => causeDuPaiement({ pi, evenement: ev });
  ok(c(null).cause === 'autre' && c(null, 'invoice.payment_action_required').cause === '3ds', 'PaymentIntent illisible : autre, ou 3ds sur action_required');
  ok(c({ status: 'requires_action' }).cause === '3ds', 'requires_action → 3ds');
  ok(c({ status: 'requires_payment_method', last_payment_error: { code: 'authentication_required' } }).cause === '3ds', 'authentication_required → 3ds');
  ok(c({ last_payment_error: { code: 'expired_card' } }).cause === 'carte_expiree' && c({ last_payment_error: { code: 'card_declined', decline_code: 'expired_card' } }).cause === 'carte_expiree', 'carte expirée (code ou decline_code)');
  const r = c({ last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } });
  ok(r.cause === 'carte_refusee' && r.code === 'insufficient_funds', 'card_declined → carte_refusee + decline_code');
  const a = c({ last_payment_error: { code: 'processing_error' } });
  ok(a.cause === 'autre' && a.code === 'processing_error', 'autre code → autre + code brut');
  ok(c({ status: 'succeeded' }, 'invoice.payment_action_required').cause === '3ds', 'sans erreur : la cause de l\'événement reste');
}

titre('Rejeu des 4 mails « payment_failed » de l\'historique (email_logs, tout le parc)');
{
  const rejeu = [
    ['geronimo0550', 'in_1UN9phQZRA77vrWJia5A4RIF', GERONIMO, true],
    ['romain.knc', 'in_1UOCZFQZRA77vrWJwGV5cmI0', ROMAIN, false],
    ['nadegemarcelin78', 'in_1UKe75QZRA77vrWJGQibRJMe', NADEGE, true],
    ['Marta MELE', 'in_1UOZlGQZRA77vrWJJtwrivJd', MARTA, false],
  ];
  for (const [qui, facture, cas, attendu] of rejeu) {
    const d = echec(cas, 'invoice.payment_failed');
    ok(d.envoyer === attendu, `${qui} (${facture}) : ${attendu ? 'mail gardé' : 'mail supprimé'} — ${d.raison}`);
  }
}

titre('Le câblage : la décision avant tout signal, l\'abandon écouté, les droits intacts');
{
  const wh = lire('../supabase/functions/stripe-webhook/index.ts');
  const iDecision = wh.indexOf('decisionMailEchec({ evenement: event.type, facture, abonnement })');
  const iSortie = wh.indexOf('if (!decision.envoyer)', iDecision);
  const iSignal = wh.indexOf('await signalerEchecAcquis(supabase, { invoice, facture, abonnement, evenement: event.type })');
  ok(iDecision > 0 && iSortie > iDecision && iSignal > iSortie, 'payment_failed / action_required : facture relue → décision → sortie sans mail → signal');
  ok((wh.match(/signalerPaiementEchoue\(/g) ?? []).length === 1 && /async function signalerEchecAcquis[\s\S]*await signalerPaiementEchoue\(/.test(wh),
    'un SEUL appel à signalerPaiementEchoue, dans signalerEchecAcquis');
  ok((wh.match(/await signalerEchecAcquis\(/g) ?? []).length === 2, 'signalerEchecAcquis n\'est appelé que par les deux chemins décidés');
  const iUpd = wh.indexOf('if (event.type === "customer.subscription.updated")');
  const iCrochet = wh.indexOf('if (status === "incomplete_expired") {', iUpd);
  const iCloud = wh.indexOf('if (estAbonnementCloud(subscription, prixConnus())) {', iUpd);
  ok(iUpd > 0 && iCrochet > iUpd && iCloud > iCrochet && wh.slice(iCrochet, iCloud).includes('signalerSouscriptionAbandonnee(supabase, subscription, customerId, event.type)'),
    'subscription.updated incomplete_expired → signalerSouscriptionAbandonnee, AVANT la sortie Cloud');
  ok(/decisionMailEchec\(\{ evenement, facture, abonnement: subscription, memeOffreVivante, compteDejaOuvert \}\)/.test(wh),
    'l\'abandon passe par la même décision (autre abonnement vivant, compte déjà ouvert)');
  ok(/stripe\.subscriptions\.list\(\{ customer: customerId, status: "all", limit: 20 \}\)/.test(wh) && /palierDuProfil\(prof\) !== "gratuit"/.test(wh),
    'avant l\'abandon : abonnements du client relus chez Stripe, palier du compte par palierDuProfil');
  ok((wh.match(/supabase\.rpc\("upgrade_monthly_grant"/g) ?? []).length === 2 && !/grant_upgrade|grant_monthly/.test(lire('../supabase/functions/_shared/paiement-echoue.js')),
    'droits intacts : les deux appels upgrade_monthly_grant d\'avant, aucun grant dans les règles du mail');
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
