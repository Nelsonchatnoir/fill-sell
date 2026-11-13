// (13/11/2026 soir, décision de Nico) VERROU — « COUPER LE RENOUVELLEMENT NE COUPE PLUS RIEN ».
//
//     npm run selftest:essai-renouvellement-coupe
//     (node --import ./scripts/loader-ext.mjs scripts/essai-renouvellement-coupe-selftest.mjs)
//
// AVANT : un client en essai Cloud qui coupait son renouvellement (Apple AUTO_RENEW_DISABLED, Google CANCELED, Stripe
// cancel_at_period_end depuis le portail) voyait son Cloud COUPÉ sur-le-champ, et recevait « … est arrêtée, sans aucun
// prélèvement » — cdf7007c, essai Pro + Cloud Apple du 13/11 13:13, renouvellement coupé à 13:54, Cloud coupé à la même
// seconde alors qu'Apple maintenait l'essai (et le Pro) jusqu'au 20/11 13:13.
// APRÈS : le Cloud reste actif jusqu'à la fin prévue de l'essai (ou de la période payée), puis s'arrête seul, sans
// prélèvement ; même règle sur les trois canaux ; AUCUN mail au client (l'alerte interne à support@ seulement) ; l'app dit
// « Ton essai Cloud continue jusqu'au {date}. Rien ne sera prélevé. ».
// (13/11, ~19:20, décisions de Nico) PLUS AUCUN ARRÊT IMMÉDIAT D'UN ESSAI, sur aucun canal : le bouton « Arrêter l'essai »
// du web coupe aussi le renouvellement (cancel-subscription : cancel_at_period_end, jamais subscriptions.cancel ; l'essai
// du Cloud d'un abonné : schedule rendu, essai_cloud_sans_suite) ; seuls le remboursement, la révocation et l'impayé
// (« off ») coupent encore un essai tout de suite. AUCUN RATTRAPAGE : un essai arrêté par l'ancienne règle le reste, rien ne
// le rouvre (annulation rejouée, reprise du renouvellement, restauration Apple, validation Google), sauf un vrai paiement.
//
// Ce verrou exécute le VRAI code, sans réseau ni base : ecritureCloudStore, evenementsBoutique, envoyerMailsCloud,
// texteAlerteCloud, decisionRappel, drapeauxDepuisStripe / miseAJourProfilDepuisStripe, evenementArretStripe,
// essaiCloudAbonneStripe, cloudDuProfil et les règles d'écran de l'app, lireReponseArret, les textes (app, conditions, CGV),
// les écrans de Réglages RENDUS (Vite SSR + react-dom/server), et le code de cancel-subscription / stripe-webhook (lu). Il
// casse si couper le renouvellement — ou le bouton « Arrêter » du web — coupe à nouveau le Cloud avant la fin de la
// période, ou si un essai arrêté par l'ancienne règle se rouvre sans paiement. Rouge sur 23ef826, vert après le lot.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}` : ''}`); } };
const appel = (f, ...a) => (typeof f === 'function' ? f(...a) : undefined);
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const net = (s) => String(s ?? '').replace(NBSP, ' ');

const CO = await import('../supabase/functions/_shared/cloud-option.js');
const CM = await import('../supabase/functions/_shared/cloud-mails.js');
const CA = await import('../supabase/functions/_shared/cloud-alerte-nico.js');
const CR = await import('../supabase/functions/_shared/cloud-rappel-veille.js');
const P = await import('../src/utils/palier.js');
const R = await import('../src/cloud/regles.js');
const TX = await import('../src/cloud/textes.js');
const TF = await import('../src/cloud/textesFormules.js');
const COND = await import('../src/cloud/conditionsCloud.js');
const LEG = await import('../src/cloud/textesLegaux.js');

const H = 3_600_000, J = 86_400_000;
// L'état de cdf7007c, lu en prod le 13/11 (sans aucune donnée personnelle : référence factice).
const DEBUT = Date.parse('2026-11-13T12:13:39Z');
const FIN = Date.parse('2026-11-20T12:13:39Z');           // fin d'essai d'Apple (expiresDate / renewalDate)
const T0 = Date.parse('2026-11-13T12:54:49Z');            // la coupure (DID_CHANGE_RENEWAL_STATUS / AUTO_RENEW_DISABLED)
const iso = (t) => new Date(t).toISOString();
const appliquer = (p, u) => ({ ...p, ...(u ?? {}) });
const essaiDe = (canal, ref) => ({ cloud_canal: canal, cloud_ref: ref, is_cloud: false, cloud_essai_debut: iso(DEBUT), cloud_essai_fin: iso(FIN),
  cloud_essai_arrete: false, cloud_periode_fin: iso(FIN), cloud_arret_fin_periode: false, email: 'essai@exemple.fr' });
const evenementsMailClient = (evs) => (evs ?? []).filter((e) => CM.EVENEMENTS_MAIL.includes(e.evenement));

async function bancEnvoi(evenements, canal) {
  const envois = [];
  const deps = {
    reserver: async () => 'pris', liberer: async () => {}, noter: async () => {}, lirePrix: async () => null,
    rendre: (t) => ({ sujet: t.sujet, html: (t.paragraphes ?? []).join(' ') }),
    envoyer: async (m) => { envois.push(m); return { envoye: true }; },
  };
  const bilan = await CM.envoyerMailsCloud({ evenements, userId: 'u-essai', email: 'essai@exemple.fr', lang: 'fr', canal, deps });
  return { envois, bilan };
}

// ── A. Les boutiques : la coupure pendant l'essai ─────────────────────────────────────────────────────────────────
async function boutique({ nom, canal, ref, lecture, profil = essaiDe(canal, ref) }) {
  console.log(`\nA. ${nom}`);
  const a = CO.ecritureCloudStore({ canal, lecture, sens: 'annulation', ref, profil, maintenant: T0 });
  const u = a.update ?? {};
  ok(a.update != null && u.cloud_arret_fin_periode === true && !('cloud_essai_arrete' in u) && !('cloud_essai_fin' in u) && !('is_cloud' in u) && !('is_premium' in u),
    `${nom} : couper le renouvellement pendant l'essai ne coupe RIEN (seulement « renouvellement coupé » noté)`, a);
  const apres = appliquer(profil, a.update);
  ok(CO.etatCloud(apres, T0 + 1000).actif === true && CO.etatCloud(apres, FIN - 1000).actif === true && CO.etatCloud(apres, FIN - 1000).etat === 'essai',
    `${nom} : le Cloud reste ACTIF jusqu'à la fin d'essai de la boutique (20/11 13:13 à Paris)`, CO.etatCloud(apres, T0 + 1000));
  const finie = CO.etatCloud(apres, FIN);
  ok(finie.actif === false && finie.etat === 'essai_termine' && finie.essaiArrete === false,
    `${nom} : puis il s'arrête SEUL à la fin, sans arrêt écrit (essai terminé, pas « arrêté »)`, finie);
  ok(apres.cloud_essai_fin === iso(FIN) && apres.cloud_essai_arrete === false, `${nom} : la fin reste celle de la boutique`, apres);
  const vu = P.cloudDuProfil(apres, T0 + 1000);
  ok(vu.etat === 'essai' && vu.actif === true && vu.essaiSansSuite === true && vu.essaiFin === iso(FIN),
    `${nom} : l'app lit un essai actif « sans suite » jusqu'au 20/11 (même état que le serveur)`, vu);
  const rejouee = CO.ecritureCloudStore({ canal, lecture, sens: 'annulation', ref, profil: apres, maintenant: T0 + 5000 });
  ok(rejouee.update === null, `${nom} : la même notification rejouée n'écrit rien`, rejouee);
  const evs = CM.evenementsBoutique({ canal, nature: 'annulation', avant: profil, update: a.update, lecture, ref, maintenant: T0 });
  ok(evenementsMailClient(evs).length === 0, `${nom} : AUCUN mail au client (ni « arrêtée », ni « arrêt programmé »)`, evs);
  const alerte = (evs ?? []).find((e) => e.evenement === 'essai_renouvellement_coupe');
  ok(alerte?.faits?.finIso === iso(FIN) && alerte?.faits?.aucunPrelevement === true && String(alerte?.cle ?? '').startsWith(`${ref}:`),
    `${nom} : l'alerte interne seule (renouvellement coupé, fin = celle de la boutique)`, evs);
  const env = await bancEnvoi(evs, canal);
  ok(env.envois.length === 0 && env.bilan.every((l) => l.resultat !== 'envoye'), `${nom} : l'envoi des mails clients n'envoie rien`, env.bilan);
  const t = alerte ? CA.texteAlerteCloud({ evenement: alerte.evenement, canal, faits: alerte.faits, userId: 'u-essai', profil: { email: 'essai@exemple.fr' }, cle: alerte.cle, maintenant: T0 }) : null;
  ok(/Renouvellement coupé pendant l’essai/.test(t?.sujet ?? '') && /continue jusqu’au vendredi 20 novembre 2026 à 13:13/.test(t?.html ?? '') && /aucun mail au client/.test(t?.html ?? ''),
    `${nom} : l'alerte à support@ dit la vérité (le Cloud continue jusqu'au 20/11, aucun mail au client)`, t?.sujet);
  const veille = CR.decisionRappel({ profil: apres, dejaEnvoye: false, mails24h: 0, heureParis: 12, maintenant: FIN - 20 * H });
  ok(veille.action === 'rien', `${nom} : aucun rappel de la veille (« ensuite, … par mois » serait faux)`, veille);
  const reprise = CO.ecritureCloudStore({ canal, lecture: { ...lecture, renouvellementAuto: true }, sens: 'reprise', ref, profil: apres, maintenant: T0 + H });
  const repris = appliquer(apres, reprise.update);
  ok(reprise.update?.cloud_arret_fin_periode === false && P.cloudDuProfil(repris, T0 + H).essaiSansSuite === false && CO.etatCloud(repris, T0 + H).actif === true
    && CR.decisionRappel({ profil: repris, heureParis: 12, maintenant: FIN - 20 * H }).action === 'envoyer',
    `${nom} : renouvellement remis → la conversion de fin d'essai repart (rappel de la veille compris)`, reprise);
  const off = CO.ecritureCloudStore({ canal, lecture, sens: 'off', ref, profil, maintenant: T0 });
  ok(off.update?.cloud_essai_arrete === true && off.update?.cloud_essai_fin === iso(T0) && CO.etatCloud(appliquer(profil, off.update), T0 + 1000).actif === false,
    `${nom} : un VRAI arrêt (remboursement, révocation, expiration : « off ») reste IMMÉDIAT`, off);
  return { a, apres };
}

const txAppleEssai = (productId) => ({ productId, offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: DEBUT, expiresDate: FIN,
  originalTransactionId: 'A-REF', transactionId: 'T-essai', price: 0, currency: 'EUR' });
await boutique({ nom: 'Apple, Cloud seul, renouvellement signé sans transaction', canal: 'apple', ref: 'A-REF',
  lecture: { fin: iso(FIN), renouvellementAuto: false, phaseEssai: null } });
await boutique({ nom: 'Apple, Cloud seul, avec la transaction d\'essai', canal: 'apple', ref: 'A-REF',
  lecture: CO.lectureCloudApple(txAppleEssai(CO.PRODUIT_CLOUD_APPLE), { autoRenewStatus: 0 }) });
const lectureAppleFormule = CO.lectureFormuleApple(txAppleEssai('app.fillsell.pro.cloud'), { autoRenewStatus: 0 });
ok(lectureAppleFormule?.formule === 'pro_cloud' && lectureAppleFormule?.renouvellementAuto === false, 'Apple : la formule Pro + Cloud est lue, renouvellement coupé', lectureAppleFormule);
const appleFormule = await boutique({ nom: 'Apple, formule Pro + Cloud (le cas de cdf7007c)', canal: 'apple', ref: 'A-REF', lecture: lectureAppleFormule });
const achatGoogle = (offre, produit) => ({ startTime: iso(DEBUT), subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', latestOrderId: 'GPA.1',
  lineItems: [{ productId: produit, expiryTime: iso(FIN), offerDetails: { offerId: offre }, autoRenewingPlan: { autoRenewEnabled: false } }] });
await boutique({ nom: 'Google, Cloud seul (CANCELED, type 3)', canal: 'google', ref: 'G-REF',
  lecture: CO.lectureCloudGoogle(CO.PRODUIT_CLOUD_GOOGLE, achatGoogle(CO.OFFRE_ESSAI_CLOUD_GOOGLE, CO.PRODUIT_CLOUD_GOOGLE), 3) });
const lectureGoogleFormule = CO.lectureFormuleGoogle('app.fillsell.pro.cloud', achatGoogle('pro-cloud-trial-7d', 'app.fillsell.pro.cloud'), 3);
await boutique({ nom: 'Google, formule Pro + Cloud (CANCELED, type 3)', canal: 'google', ref: 'G-REF', lecture: lectureGoogleFormule });
{
  console.log('\nA bis. La grâce de fin d\'essai (essai FillSell fini, la boutique encore dans sa semaine)');
  const grace = { ...essaiDe('apple', 'A-REF'), cloud_essai_fin: iso(T0 - H) };
  const g = CO.ecritureCloudStore({ canal: 'apple', lecture: CO.lectureCloudApple({ ...txAppleEssai(CO.PRODUIT_CLOUD_APPLE), expiresDate: T0 + H }, { autoRenewStatus: 0 }), sens: 'annulation', ref: 'A-REF', profil: grace, maintenant: T0 });
  ok(g.update?.cloud_arret_fin_periode === true && !('cloud_essai_arrete' in (g.update ?? {})) && !('cloud_essai_fin' in (g.update ?? {})),
    'pendant la grâce : la coupure est notée, rien n\'est arrêté de force (la grâce suit son cours)', g);
}
{
  console.log('\nA ter. La période PAYÉE : inchangée (déjà jusqu\'à la fin)');
  const paye = { ...essaiDe('apple', 'A-REF'), is_cloud: true, cloud_essai_debut: iso(DEBUT - 30 * J), cloud_essai_fin: iso(DEBUT - 23 * J), cloud_periode_fin: iso(FIN + 20 * J) };
  const p = CO.ecritureCloudStore({ canal: 'apple', lecture: { fin: iso(FIN + 20 * J), renouvellementAuto: false }, sens: 'annulation', ref: 'A-REF', profil: paye, maintenant: T0 });
  ok(p.update?.cloud_arret_fin_periode === true && p.update?.cloud_periode_fin === iso(FIN + 20 * J) && !('cloud_essai_arrete' in (p.update ?? {}))
    && CO.etatCloud(appliquer(paye, p.update), FIN + 20 * J - 1000).actif === true, 'payé : tourne jusqu\'à la fin de la période, puis s\'arrête', p);
  const evP = CM.evenementsBoutique({ canal: 'apple', nature: 'annulation', avant: paye, update: p.update, lecture: { fin: iso(FIN + 20 * J), renouvellementAuto: false }, ref: 'A-REF', maintenant: T0 });
  ok(evP.map((e) => e.evenement).join(',') === 'arret_programme', 'payé : le mail « arrêt programmé » d\'avant, inchangé', evP);
}

// ── B. Stripe ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB. Stripe : le renouvellement coupé pendant l\'essai (portail, dashboard)');
const s = (t) => Math.floor(t / 1000);
const subCoupe = { id: 'sub_C', status: 'trialing', metadata: { option: 'cloud' }, trial_start: s(DEBUT), trial_end: s(FIN), current_period_end: s(FIN), cancel_at_period_end: true, cancel_at: s(FIN) };
ok(appel(CO.coupureRenouvellementStripe, subCoupe) === true && appel(CO.coupureRenouvellementStripe, { ...subCoupe, cancel_at_period_end: false, cancel_at: null }) === false
  && appel(CO.coupureRenouvellementStripe, { ...subCoupe, status: 'active' }) === false, 'Stripe : une résiliation programmée EN ESSAI est une coupure du renouvellement (pure)');
for (const [nom, sub, attendu] of [
  ['Cloud seul', subCoupe, null],
  ['formule Pro + Cloud', { ...subCoupe, id: 'sub_F', metadata: { formule: 'pro_cloud', plan_type: 'pro' } }, 'pro_cloud'],
]) {
  const d = CO.drapeauxDepuisStripe([sub], {});
  const u = CO.miseAJourProfilDepuisStripe(d, 'stripe');
  const profil = appliquer({ cloud_canal: 'stripe' }, u);
  ok(d.cloud_vivant === true && u.cloud_arret_fin_periode === true && u.cloud_essai_fin === iso(FIN) && !('cloud_essai_arrete' in u) && u.is_cloud === false && (attendu == null || u.cloud_formule === attendu),
    `Stripe, ${nom} : l'abonnement en essai reste porteur, « renouvellement coupé », fin = trial_end`, u);
  ok(CO.etatCloud(profil, T0 + 1000).actif === true && CO.etatCloud(profil, FIN).actif === false && P.cloudDuProfil(profil, T0 + 1000).essaiSansSuite === true,
    `Stripe, ${nom} : actif jusqu'à trial_end, puis arrêté seul ; l'app lit « sans suite »`, profil);
  const evs = CM.evenementArretStripe(sub);
  ok(evenementsMailClient(evs).length === 0 && evs.some((e) => e.evenement === 'essai_renouvellement_coupe' && e.faits?.finIso === iso(FIN)),
    `Stripe, ${nom} : AUCUN mail au client, l'alerte interne seule`, evs);
}
{
  const src = lire('supabase/functions/stripe-webhook/index.ts');
  const debut = src.indexOf('if (event.type === "customer.subscription.updated")');
  const fin = src.indexOf('La métadonnée `formule` suit le PRIX');
  const bloc = debut > 0 && fin > debut ? src.slice(debut, fin) : '';
  ok(bloc.length > 0 && !/subscriptions\.cancel\(/.test(bloc) && (bloc.match(/coupureRenouvellementStripe\(subscription\)/g) ?? []).length >= 2,
    'stripe-webhook : un abonnement Cloud (seul ou formule) en essai résilié au portail n\'est PLUS annulé (aucun subscriptions.cancel), la coupure est relue');
  // (13/11, décision de Nico — plus aucun arrêt immédiat d'un essai) Avant : « le bouton Arrêter l'essai de l'app reste un VRAI
  // arrêt immédiat » (subscriptions.cancel). Maintenant le web coupe le renouvellement, comme les boutiques.
  const cs = lire('supabase/functions/cancel-subscription/index.ts');
  const code = cs.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const fCouper = code.slice(code.indexOf('async function couperEssaiStripe('), code.indexOf('const SANS_DESCENTE'));
  ok(!/subscriptions\.cancel\(/.test(code) && /stripe\.subscriptions\.update\(sub\.id, \{ cancel_at_period_end: true \}\)/.test(fCouper)
    && /if \(!coupureRenouvellementStripe\(sub\)\)/.test(fCouper) && /subscriptionSchedules\.release\(idSched\)/.test(fCouper),
    'cancel-subscription : plus aucun subscriptions.cancel ; arrêter un essai = cancel_at_period_end (idempotent, schedule rendu d\'abord)');
  const blocs = [
    ['Cloud seul', code.slice(code.indexOf('if (cloudVivant.status === "trialing") {'), code.indexOf('const fini = await stripe.subscriptions.update(cloudVivant.id'))],
    ['formule avec Cloud', code.slice(code.indexOf('if (formuleSub && formuleSub.status === "trialing") {'), code.indexOf('if (formuleSub) {'))],
    ['« Se désabonner » d\'une formule', code.slice(code.indexOf('if (paliersVivants[0].status === "trialing" && formuleDAbonnementStripe('), code.indexOf('const sched = paliersVivants[0].schedule;'))],
  ];
  for (const [nom, b] of blocs) {
    ok(b.length > 0 && /await couperEssaiStripe\(/.test(b) && /cloud_arret_fin_periode: true/.test(b) && !/cloud_essai_arrete/.test(b)
      && /return reponseEssaiSansSuite\(finIso/.test(b) && /evenementArretStripe\(coupe\)/.test(b),
      `cancel-subscription, ${nom} en essai : renouvellement coupé, le Cloud continue (cloud_arret_fin_periode), jamais cloud_essai_arrete ; réponse « sans suite »`, b.slice(0, 300));
  }
  const bAbonne = code.slice(code.indexOf('if (essaiAbonneSub) {'), code.indexOf('if (formuleSub && formuleSub.status === "trialing") {'));
  ok(/subscriptionSchedules\.release\(idSched\)/.test(bAbonne) && /metadata: \{ essai_cloud_sans_suite: "1" \}/.test(bAbonne)
    && !/essai_cloud_formule: ""/.test(bAbonne) && !/cloud_essai_arrete/.test(bAbonne) && /cloud_arret_fin_periode: true/.test(bAbonne)
    && /evenement: "essai_renouvellement_coupe"/.test(bAbonne) && !/evenement: "arret_essai"/.test(bAbonne),
    'cancel-subscription, essai du Cloud d\'un abonné : schedule rendu (jamais la formule avec Cloud), marque « sans suite », métadonnées de l\'essai gardées, aucun mail client', bAbonne.slice(0, 300));
  const repCode = code.slice(code.indexOf("const reponseEssaiSansSuite"), code.indexOf('console.log("[cancel-subscription] Profile:"'));
  ok(/essai_sans_suite: true/.test(repCode) && /aucun_prelevement: true/.test(repCode) && /fin_essai: finIso/.test(repCode) && /period_end: finIso \? dateSeuleParis/.test(repCode),
    'cancel-subscription : la réponse dit « essai sans suite », sa fin, et period_end pour les apps d\'avant');
  // L'essai du Cloud d'un ABONNÉ arrêté : la marque posée par cancel-subscription → actif jusqu'à la fin, sans suite, jamais facturé.
  const subAbonne = { id: 'sub_A', status: 'active', items: { data: [] }, current_period_end: s(FIN + 20 * J),
    metadata: { plan_type: 'pro', essai_cloud_formule: 'pro_cloud', essai_cloud_debut: String(s(DEBUT)), essai_cloud_fin: String(s(FIN)) } };
  const coupeAbonne = { ...subAbonne, metadata: { ...subAbonne.metadata, essai_cloud_sans_suite: '1' } };
  const dAv = CO.drapeauxDepuisStripe([subAbonne], {}), dAp = CO.drapeauxDepuisStripe([coupeAbonne], {});
  const pAp = appliquer({ cloud_canal: 'stripe' }, CO.miseAJourProfilDepuisStripe(dAp, 'stripe'));
  ok(dAv.cloud_arret_fin_periode === false && dAp.cloud_arret_fin_periode === true && dAp.cloud_essai_fin === iso(FIN) && dAp.is_cloud === false && dAp.is_pro === true
    && dAv.cloud_formule === 'pro_cloud' && !('cloud_formule' in dAp)
    && CO.etatCloud(pAp, T0 + 1000).actif === true && CO.etatCloud(pAp, FIN).actif === false && P.cloudDuProfil(pAp, T0 + 1000).essaiSansSuite === true,
    'Stripe, essai du Cloud d\'un abonné arrêté : Pro payé continue, Cloud actif jusqu\'à la fin de son essai puis arrêté seul, « sans suite »', [dAv, dAp]);
  const CP = await import('../supabase/functions/_shared/cloud-prix.js');
  ok(CP.prixDepuisStripe(coupeAbonne).renouvelle === false && CP.prixDepuisStripe(subAbonne).renouvelle === true,
    'Stripe, essai d\'un abonné arrêté : la source dit « ne renouvelle pas » (aucun rappel de la veille)');
  const annule = { ...subCoupe, status: 'canceled', cancel_at_period_end: false, cancel_at: null, ended_at: s(T0) };
  const evA = CM.evenementArretStripe(annule, [{ amount_paid: 0 }]);
  const uA = CO.miseAJourProfilDepuisStripe(CO.drapeauxDepuisStripe([annule], {}), 'stripe');
  ok(evA[0]?.evenement === 'arret_essai' && evA[0].faits?.aucunPrelevement === true && uA.cloud_essai_arrete === true && uA.cloud_essai_fin === iso(T0),
    'Stripe, abonnement ANNULÉ avant la fin de son essai (hors de l\'app : dashboard, verrou de carte) : l\'essai s\'arrête (inchangé)', [evA, uA]);
  const rembourse = { ...subCoupe, status: 'active', cancel_at_period_end: false, cancel_at: null, trial_end: null, fillsell_periode_remboursee: true };
  ok(CO.drapeauxDepuisStripe([rembourse], {}).cloud_vivant === false, 'Stripe, période remboursée : le Cloud tombe tout de suite (inchangé)');
}

// ── C. L'app : le message, les règles d'écran, les fenêtres ─────────────────────────────────────────────────────────
console.log('\nC. L\'app');
const Tfr = TX.textesCloud('fr'), Ten = TX.textesCloud('en');
ok(appel(Tfr.essaiSansSuite, R.dateLongue(iso(FIN), 'fr')) === "Ton essai Cloud continue jusqu'au 20 novembre. Rien ne sera prélevé."
  && appel(Ten.essaiSansSuite, R.dateLongue(iso(FIN), 'en')) === 'Your Cloud trial continues until 20 November. Nothing will be charged.',
  'le message, mot pour mot : « Ton essai Cloud continue jusqu\'au 20 novembre. Rien ne sera prélevé. » (et l\'anglais)',
  [appel(Tfr.essaiSansSuite, '20 novembre'), appel(Ten.essaiSansSuite, '20 November')]);
const cloudCoupe = P.cloudDuProfil(appleFormule.apres, T0 + 1000);
const cloudVeille = P.cloudDuProfil(appleFormule.apres, FIN - 20 * H);
ok(R.rappelVeilleDu(cloudVeille, FIN - 20 * H) === null && R.rappelVeilleDu(P.cloudDuProfil(essaiDe('apple', 'A-REF'), FIN - 20 * H), FIN - 20 * H) === 'demain',
  'la feuille « Demain, le Cloud passe à … » ne s\'ouvre plus pour un essai au renouvellement coupé (elle reste pour les autres)');
ok(R.arretEssaiConfirme(cloudCoupe, { cloud_essai_refus: null }) === true
  && R.issueVeilleArret({ etat: 'boutique', arretConfirme: true, sansSuite: true }) === 'continue_sans_prelevement'
  && R.issueVeilleArret({ etat: 'boutique', arretConfirme: false }) === 'boutique_ouverte',
  'la feuille de la veille, après l\'ouverture de la boutique : la coupure confirmée en base → « ton essai continue … rien ne sera prélevé »');
ok(R.issueVeilleArret({ etat: 'arretee', aucunPrelevement: true, sansSuite: true }) === 'continue_sans_prelevement'
  && R.issueVeilleArret({ etat: 'arretee', aucunPrelevement: true }) === 'arrete_sans_prelevement',
  'la feuille de la veille, web : la réponse « sans suite » de cancel-subscription → « ton essai continue … rien ne sera prélevé »');
{
  const fr = appel(Tfr.arreterEssai, 'Pro', '20 novembre') ?? '';
  const en = appel(Ten.arreterEssai, 'Pro', '20 November') ?? '';
  ok(/^Ton Cloud continue jusqu'au 20 novembre, puis s'arrête seul, sans prélèvement\./.test(fr) && !/tout de suite|24 heures/.test(fr)
    && /^Your Cloud keeps running until 20 November, then stops on its own, without being charged\./.test(en),
    'la fenêtre « Arrêter FillSell Cloud ? » du web : le texte des boutiques, sans « 24 heures » (plus « Il s\'arrête tout de suite »)', [fr, en]);
  const tf = TF.textesFormules('fr');
  ok(appel(tf.arreterEssaiTexte, '20 novembre') === "Ton essai continue jusqu'au 20 novembre, puis s'arrête seul : rien n'est prélevé pour l'essai."
    && !/C'est arrêté/.test(appel(tf.arreterEssaiFait, true, 'Pro') ?? 'C\'est arrêté') && appel(tf.arreterEssaiFait, false, 'Pro') === '',
    'formule avec Cloud sur le web, « Arrêter l\'essai » : la fenêtre dit qu\'il continue jusqu\'à sa fin ; plus jamais « C\'est arrêté »');
  const app = lire('src/App.jsx');
  ok(/if\(json\.essai_sans_suite===true\)\{[\s\S]{0,700}Ton essai Cloud continue jusqu'au \$\{finEssai\}\. Rien ne sera prélevé\./.test(app),
    '« Se désabonner » d\'une formule en essai (web) : l\'app dit « Ton essai Cloud continue jusqu\'au … Rien ne sera prélevé. »');
}
{
  const fr = appel(Tfr.arreterBoutique, 'apple', '20 novembre') ?? '';
  const gg = appel(Tfr.arreterBoutique, 'google', '20 novembre') ?? '';
  const PROMESSE = /tout de suite|rien n.est factur|rien ne sera prélevé|c.est arrêté|aucun prélèvement/i;
  ok(/Annulé au moins 24 heures avant la fin de l'essai, ton Cloud continue jusqu'au 20 novembre, puis s'arrête seul, sans prélèvement\./.test(fr)
    && /Annulé avant la fin de l'essai, ton Cloud continue jusqu'au 20 novembre, puis s'arrête seul, sans prélèvement\./.test(gg)
    && !PROMESSE.test(fr) && !PROMESSE.test(gg),
    'la fenêtre « Arrêter FillSell Cloud ? » d\'une boutique dit la vraie règle, au conditionnel (rien d\'affirmé avant la boutique)', [fr, gg]);
  const tf = appel(TF.textesFormules('fr').annulerBoutiqueEssai, 'apple', '20 novembre') ?? '';
  ok(/au moins 24 heures avant la fin de l'essai, ta formule et le Cloud continuent jusqu'au 20 novembre, puis s'arrêtent seuls, sans prélèvement\./.test(tf) && !PROMESSE.test(tf),
    'formule avec Cloud prise sur une boutique, « Retirer le Cloud » pendant l\'essai : la même règle', tf);
}

// Les écrans de Réglages, RENDUS.
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const texte = (el) => net(renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' '))
    .split(String.fromCharCode(0x2060)).join('').replace(/\s+/g, ' ');
  const BR = await vite.ssrLoadModule('/src/cloud/BlocCloudReglages.jsx');
  const BF = await vite.ssrLoadModule('/src/cloud/BlocFormulesReglages.jsx');
  const MSG = "Ton essai Cloud continue jusqu'au 20 novembre. Rien ne sera prélevé.";
  const actions = { arreter: async () => ({}), meConnecter() {} };
  const blocApple = texte(h(BR.default, { lang: 'fr', cloud: cloudCoupe, nomPalier: 'Pro', actions, canal: 'apple', plateforme: 'ios' }));
  ok(blocApple.includes(MSG) && !/Ensuite,/.test(blocApple) && !/Arrêter le Cloud/.test(blocApple) && /Essai gratuit/.test(blocApple),
    'Réglages › Abonnement, Cloud seul pris sur l\'App Store, renouvellement coupé : le message, plus de « Ensuite, … /mois », plus rien à arrêter', blocApple);
  const blocAvant = texte(h(BR.default, { lang: 'fr', cloud: P.cloudDuProfil(essaiDe('apple', 'A-REF'), T0 + 1000), nomPalier: 'Pro', actions, canal: 'apple', plateforme: 'ios' }));
  ok(!blocAvant.includes(MSG) && /Ensuite,/.test(blocAvant) && /Arrêter le Cloud/.test(blocAvant), 'le même essai, renouvellement actif : l\'écran d\'avant (« Ensuite, … », « Arrêter le Cloud »)', blocAvant);
  const profilStripe = appliquer({ cloud_canal: 'stripe' }, CO.miseAJourProfilDepuisStripe(CO.drapeauxDepuisStripe([subCoupe], {}), 'stripe'));
  // (13/11, décision de Nico — plus aucun arrêt immédiat d'un essai) Avant : « Arrêter le Cloud » restait (vrai arrêt immédiat).
  const blocStripe = texte(h(BR.default, { lang: 'fr', cloud: P.cloudDuProfil(profilStripe, T0 + 1000), nomPalier: null, actions, canal: 'stripe', plateforme: 'web' }));
  ok(blocStripe.includes(MSG) && !/Arrêter le Cloud/.test(blocStripe), 'Cloud seul par carte, renouvellement coupé (bouton du web ou portail) : le message, plus de bouton d\'arrêt', blocStripe);
  const blocStripeAvant = texte(h(BR.default, { lang: 'fr', cloud: P.cloudDuProfil({ ...essaiDe('stripe', 'sub_C') }, T0 + 1000), nomPalier: null, actions, canal: 'stripe', plateforme: 'web' }));
  ok(/Arrêter le Cloud/.test(blocStripeAvant) && !blocStripeAvant.includes(MSG), 'le même essai par carte, renouvellement actif : « Arrêter le Cloud » est là', blocStripeAvant);
  const confStripe = texte(h(BR.ConfirmationArretCloud, { lang: 'fr', cloud: P.cloudDuProfil(essaiDe('stripe', 'sub_C'), T0 + 1000), nomPalier: null, voie: 'stripe', onArreter() {}, onAnnuler() {} }));
  ok(/Ton Cloud continue jusqu'au 20 novembre, puis s'arrête seul, sans prélèvement\./.test(confStripe) && !/tout de suite/.test(confStripe),
    'sa confirmation (Stripe), rendue : le texte des boutiques, avec la date de fin d\'essai (plus « tout de suite »)', confStripe);
  const AC = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const lu = AC.lireReponseArret({ success: true, option: 'cloud', essai_sans_suite: true, aucun_prelevement: true, fin_essai: iso(FIN), period_end: '20/11/2026' }, {}, 'fr');
  ok(lu?.etat === 'ok' && net(lu?.message) === MSG, 'après le clic (web) : « Ton essai Cloud continue jusqu\'au 20 novembre. Rien ne sera prélevé. »', lu);
  const cWeb = { lang: 'fr', isPremium: true, isPro: true, isBusiness: false, plateforme: 'web', natif: false, user: { id: 'u-essai' } };
  const profilFWeb = { etat: 'ok', formuleActuelle: 'pro_cloud', canalAbonnement: 'stripe', echeance: iso(FIN) };
  const blocFWeb = texte(h(BF.default, { c: cWeb, visible: true, lecture: { etat: 'ok', cloud: P.cloudDuProfil(profilStripe, T0 + 1000) }, profil: profilFWeb, actions: { arreter: async () => ({}) } }));
  ok(blocFWeb.includes(MSG) && !/Arrêter l'essai/.test(blocFWeb), 'formule Pro + Cloud par carte, essai coupé : le message, plus de bouton « Arrêter l\'essai »', blocFWeb);
  const blocFWebAvant = texte(h(BF.default, { c: cWeb, visible: true, lecture: { etat: 'ok', cloud: P.cloudDuProfil(essaiDe('stripe', 'sub_F'), T0 + 1000) }, profil: profilFWeb, actions: { arreter: async () => ({}) } }));
  ok(/Arrêter l'essai/.test(blocFWebAvant) && !blocFWebAvant.includes(MSG), 'la même formule, essai en cours : « Arrêter l\'essai » est là', blocFWebAvant);
  const confApple = texte(h(BR.ConfirmationArretCloud, { lang: 'fr', cloud: P.cloudDuProfil(essaiDe('apple', 'A-REF'), T0 + 1000), nomPalier: 'Pro', voie: 'apple', onArreter() {}, onAnnuler() {} }));
  ok(/ton Cloud continue jusqu'au 20 novembre, puis s'arrête seul, sans prélèvement\./.test(confApple) && /Ouvrir mes abonnements Apple/.test(confApple),
    'la confirmation Apple, rendue : la règle de la coupure avec la date de fin d\'essai, puis le bouton qui ouvre les abonnements', confApple);
  const c = { lang: 'fr', isPremium: true, isPro: true, isBusiness: false, plateforme: 'ios', natif: true, user: { id: 'u-essai' } };
  const profilF = { etat: 'ok', formuleActuelle: 'pro_cloud', canalAbonnement: 'apple', echeance: iso(FIN) };
  const blocF = texte(h(BF.default, { c, visible: true, lecture: { etat: 'ok', cloud: cloudCoupe, profil: appleFormule.apres }, profil: profilF, actions: {} }));
  ok(blocF.includes('Ta formule : Pro + Cloud.') && blocF.includes(MSG) && !/Retirer le Cloud/.test(blocF),
    'Réglages › Abonnement, formule Pro + Cloud prise sur l\'App Store, renouvellement coupé (cdf7007c) : le message, plus rien à retirer', blocF);
  const blocFAvant = texte(h(BF.default, { c, visible: true, lecture: { etat: 'ok', cloud: P.cloudDuProfil(essaiDe('apple', 'A-REF'), T0 + 1000) }, profil: profilF, actions: {} }));
  ok(!blocFAvant.includes(MSG) && /Retirer le Cloud/.test(blocFAvant), 'la même formule, renouvellement actif : l\'écran d\'avant (« Retirer le Cloud »)', blocFAvant);
} finally {
  await vite.close();
}

// ── D. Les conditions du Cloud et les CGV ───────────────────────────────────────────────────────────────────────────
console.log('\nD. Les conditions du Cloud et les CGV');
for (const lang of ['fr', 'en']) {
  for (const formules of [false, true]) {
    const a7 = (COND.conditionsCloud(lang, { formules }).articles ?? []).find((a) => /^7\./.test(a.t))?.ps?.[0] ?? '';
    // (13/11, décision de Nico — plus aucun arrêt immédiat d'un essai) « Pendant l'essai, cet arrêt est immédiat » est retiré.
    ok(lang === 'fr'
      ? a7.includes("Sur tous les canaux, la résiliation coupe le renouvellement et n'arrête rien tout de suite : le Cloud reste actif jusqu'à la fin prévue de l'essai ou de la période payée, puis s'arrête seul")
        && !/immédiat|tout de suite et rien/.test(a7.replace("n'arrête rien tout de suite", ''))
      : a7.includes('On every channel, cancelling turns off renewal and stops nothing right away: the Cloud stays active until the planned end of the trial or of the paid period, then stops on its own')
        && !/immediate/.test(a7),
    `conditions du Cloud (${lang}${formules ? ', formules' : ''}), article 7 : la règle neuve, plus aucun arrêt immédiat`, a7);
  }
  const cgv = LEG.textesLegauxCloud(lang).cgvArticle7.ps.join(' ');
  ok(lang === 'fr' ? cgv.includes("Sur tous les canaux, la résiliation coupe le renouvellement et n'arrête rien tout de suite : l'option FillSell Cloud reste active jusqu'à la fin prévue de l'essai ou de la période payée") && !/immédiatement/.test(cgv)
    : cgv.includes('On every channel, cancelling turns off renewal and stops nothing right away: the FillSell Cloud add-on stays active until the planned end of the trial or of the paid period') && !/immediately/.test(cgv),
  `CGV article 7 (${lang}) : la même règle, plus « immédiatement »`);
}
{
  const SRV = await import('../supabase/functions/_shared/cloud-conditions.js');
  const tete = SRV.CGU_CLOUD_HISTORIQUE?.slice(0, 2).map((e) => e.changement).join(',');
  ok(tete === 'formules_arret_renouvellement,arret_renouvellement_coupe' && SRV.CGU_CLOUD_VERSION === '2026-11-13' && SRV.CGU_CLOUD_VERSION_MINIMALE === '2026-11-04',
    'conditions : en tête, datée du jour réel du push (13/11 au soir : 2026-11-13 ; avant : jamais 2026-11-13, déjà livrée avec l\'autre texte), minimales inchangées (changement en faveur du client)', [tete, SRV.CGU_CLOUD_VERSION]);
  ok(/couper le renouvellement n'arrête plus rien tout de suite/.test(COND.conditionsCloud('fr').version ?? '') && /reste valable/.test(COND.conditionsCloud('fr').version ?? ''),
    'la ligne de version dit le changement, et que l\'acceptation d\'avant reste valable', COND.conditionsCloud('fr').version);
}

// ── E. AUCUN RATTRAPAGE (13/11 ~19:20, décision de Nico) ─────────────────────────────────────────────────────────────
// « La nouvelle règle vaut seulement pour les renouvellements coupés APRÈS le déploiement. » Un essai arrêté par l'ancienne
// règle (cloud_essai_arrete vrai, fin ramenée à l'arrêt) n'est JAMAIS rouvert par une notification qui arrive ensuite —
// annulation rejouée, reprise du renouvellement pendant la semaine de la boutique, restauration Apple, validation Google —,
// sauf un VRAI nouveau paiement, comme avant. Aucune fonction de réparation n'existe plus.
console.log('\nE. Aucun rattrapage : un essai arrêté par l\'ancienne règle le reste');
{
  ok(!('reparationEssaiRenouvellementCoupe' in CO), 'aucune fonction de réparation (cloud-option.js)');
  ok(!fs.existsSync(join(ROOT, 'scripts/reparations/20261113_essai_renouvellement_coupe.sql')), 'aucun script de réouverture (scripts/reparations)');
  const ARRET = '2026-11-13T12:54:51.721Z';
  const MAINT = Date.parse('2026-11-14T10:00:00Z');
  const pasRouvert = (nom, canal, ref, ecrire) => {
    const avant = { ...essaiDe(canal, ref), cloud_essai_arrete: true, cloud_essai_fin: ARRET };
    const r = ecrire(avant);
    const apres = appliquer(avant, r?.update);
    const e = CO.etatCloud(apres, MAINT);
    ok(e.actif === false && apres.cloud_essai_arrete === true && P.cloudDuProfil(apres, MAINT).actif === false && P.cloudDuProfil(apres, MAINT).essaiSansSuite === false,
      `essai arrêté par l'ancienne règle, ${nom} : rien ne se rouvre`, { update: r?.update ?? null, motif: r?.motif ?? null, etat: e.etat });
    return { avant, r, apres };
  };
  const lApple = (ar) => CO.lectureCloudApple(txAppleEssai(CO.PRODUIT_CLOUD_APPLE), { autoRenewStatus: ar });
  const rej = pasRouvert('annulation Apple rejouée', 'apple', 'A-REF', (p) => CO.ecritureCloudStore({ canal: 'apple', lecture: lApple(0), sens: 'annulation', ref: 'A-REF', profil: p, maintenant: MAINT }));
  ok(rej.r?.update === null && rej.r?.motif === 'essai_deja_arrete', '… l\'annulation rejouée n\'écrit rien', rej.r);
  const repr = pasRouvert('reprise du renouvellement Apple (AUTO_RENEW_ENABLED) pendant la semaine d\'Apple', 'apple', 'A-REF',
    (p) => CO.ecritureCloudStore({ canal: 'apple', lecture: { fin: iso(FIN), renouvellementAuto: true, phaseEssai: null }, sens: 'reprise', ref: 'A-REF', profil: p, maintenant: MAINT }));
  ok(JSON.stringify(repr.r?.update) === JSON.stringify({ cloud_arret_fin_periode: false })
    && CM.evenementsBoutique({ canal: 'apple', nature: 'reprise', avant: repr.avant, update: repr.r?.update, lecture: { renouvellementAuto: true }, ref: 'A-REF', maintenant: MAINT }).length === 0,
    '… la reprise n\'écrit que « pas d\'arrêt programmé » (comme avant), aucun mail ; le Cloud ne repart qu\'au premier paiement d\'Apple', repr.r);
  pasRouvert('restauration Apple (reçu : semaine gratuite, renouvellement coupé)', 'apple', 'A-REF',
    (p) => CO.ecritureCloudStore({ canal: 'apple', lecture: lApple(0), sens: 'on', ref: 'A-REF', profil: p, maintenant: MAINT }));
  pasRouvert('restauration Apple (reçu : semaine gratuite, renouvellement remis)', 'apple', 'A-REF',
    (p) => CO.ecritureCloudStore({ canal: 'apple', lecture: lApple(1), sens: 'on', ref: 'A-REF', profil: p, maintenant: MAINT }));
  const achatG = achatGoogle(CO.OFFRE_ESSAI_CLOUD_GOOGLE, CO.PRODUIT_CLOUD_GOOGLE);
  pasRouvert('validate-google-purchase (jeton CANCELED encore dans sa semaine)', 'google', 'G-REF',
    (p) => CO.ecritureCloudStore({ canal: 'google', lecture: CO.lectureCloudGoogle(CO.PRODUIT_CLOUD_GOOGLE, achatG, null), sens: 'on', ref: 'G-REF', profil: p, maintenant: MAINT }));
  pasRouvert('Google RESTARTED (type 7)', 'google', 'G-REF',
    (p) => CO.ecritureCloudStore({ canal: 'google', lecture: { ...CO.lectureCloudGoogle(CO.PRODUIT_CLOUD_GOOGLE, achatG, 7), renouvellementAuto: true }, sens: 'reprise', ref: 'G-REF', profil: p, maintenant: MAINT }));
  pasRouvert('formule Pro + Cloud Apple, annulation rejouée', 'apple', 'A-REF',
    (p) => CO.ecritureCloudStore({ canal: 'apple', lecture: CO.lectureFormuleApple(txAppleEssai('app.fillsell.pro.cloud'), { autoRenewStatus: 0 }), sens: 'annulation', ref: 'A-REF', profil: p, maintenant: MAINT }));
  const v = lire('supabase/functions/validate-google-purchase/index.ts');
  ok(!/cloud_essai_arrete:\s*false/.test(v) && !/cloud_essai_arrete:\s*false/.test(lire('supabase/functions/validate-apple-receipt/index.ts')),
    'les validations (Apple, Google) n\'écrivent jamais cloud_essai_arrete à faux');
  // Un VRAI nouveau paiement : le Cloud repart, payé, comme avant.
  const avant = { ...essaiDe('apple', 'A-REF'), cloud_essai_arrete: true, cloud_essai_fin: ARRET };
  const paye = CO.ecritureCloudStore({ canal: 'apple', lecture: CO.lectureCloudApple({ productId: CO.PRODUIT_CLOUD_APPLE, purchaseDate: FIN, expiresDate: FIN + 30 * J, originalTransactionId: 'A-REF', transactionId: 'T-2', price: 24990, currency: 'EUR' }, { autoRenewStatus: 1 }), sens: 'on', ref: 'A-REF', profil: avant, maintenant: FIN + H });
  ok(paye.update?.is_cloud === true && CO.etatCloud(appliquer(avant, paye.update), FIN + 2 * H).etat === 'paye',
    'sauf un VRAI paiement (DID_RENEW) : le Cloud repart, payé — comme avant', paye);
}

// ── F. Les autres portes ────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nF. Les autres portes');
{
  const v = lire('supabase/functions/validate-apple-receipt/index.ts');
  ok((v.match(/\}, renouvDuRecu\((txCloud|activeSub)\.original_transaction_id\)\)!;/g) ?? []).length === 2,
    'validate-apple-receipt : une restauration garde « renouvellement coupé » (le renouvellement du reçu suit la lecture)');
  const on = CO.ecritureCloudStore({ canal: 'apple', lecture: CO.lectureCloudApple(txAppleEssai(CO.PRODUIT_CLOUD_APPLE), { autoRenewStatus: 0 }), sens: 'on', ref: 'A-REF', profil: appleFormule.apres, maintenant: T0 + H });
  ok(on.update?.cloud_arret_fin_periode === true && on.update?.cloud_essai_fin === iso(FIN), '… sa lecture « on » garde la coupure et la fin de la boutique', on);
  const t = lire('supabase/functions/email-tunnel/index.ts');
  ok(/\.select\("id, email, lang, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_arret_fin_periode, cloud_canal, cloud_ref"\)/.test(t),
    'email-tunnel : le passage du rappel de la veille lit cloud_arret_fin_periode');
}

console.log(`\n${ko === 0 ? 'TOUT VERT' : `${ko} ROUGE(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
