// VERROU (11/11/2026, offres Cloud, plan § 7 et § 10.2 cas 3 à 10) — STRIPE : formuleDuProduit (un seul module de prix,
// les trois prix live du 11/11 comme données), la lecture d'un abonnement de formule (palier ET Cloud), la voie d'un
// achat web (jamais deux abonnements, un abonné reste sur son canal, essai d'abonné Premium / Pro par schedule, prorata
// sinon, Cloud seul → formule sur le MÊME abonnement), aucun crédit pendant un essai, descente / retrait du Cloud, et
// les cinq fonctions qui lisent les prix à UN endroit. Rouge avant (modules absents), vert après. Sans réseau.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n') : '');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
const charger = async (p) => (existsSync(join(ROOT, p)) ? import(pathToFileURL(join(ROOT, p)).href) : null);
const FS = await charger('supabase/functions/_shared/formules-serveur.js');
const CO = await charger('supabase/functions/_shared/cloud-option.js');
const DF = await charger('supabase/functions/_shared/descente-formule.js');
const PS = await charger('supabase/functions/_shared/paiement-stripe.js');
ok(!!FS, 'formules-serveur.js existe');
if (FS) {
  const L = FS.PRIX_STRIPE_LIVE_1111;
  console.log('1. Les prix Stripe, à un seul endroit');
  ok(L.premium_cloud.prix === 'price_1UahzRQZRA77vrWJUC2gXx06' && L.pro_cloud.prix === 'price_1Uai1KQZRA77vrWJZxj33yC9' && L.business_cloud.prix === 'price_1Uai2nQZRA77vrWJZgYHM3eu',
    'les trois prix live du 11/11 (données) : premium_cloud, pro_cloud, business_cloud');
  ok(FS.SECRETS_PRIX_STRIPE.premium_cloud === 'STRIPE_PRICE_PREMIUM_CLOUD' && FS.SECRETS_PRIX_STRIPE.pro_cloud === 'STRIPE_PRICE_PRO_CLOUD' && FS.SECRETS_PRIX_STRIPE.business_cloud === 'STRIPE_PRICE_BUSINESS_CLOUD', 'trois secrets neufs nommés');
  const env = { STRIPE_PRICE_STANDARD: 'p_std', STRIPE_PRICE_PRO: 'p_pro', STRIPE_PRICE_BUSINESS: 'p_biz', STRIPE_PRICE_CLOUD: 'p_cloud',
    STRIPE_PRICE_PREMIUM_CLOUD: L.premium_cloud.prix, STRIPE_PRICE_PRO_CLOUD: L.pro_cloud.prix, STRIPE_PRICE_BUSINESS_CLOUD: L.business_cloud.prix };
  const prix = FS.prixStripeDepuis((k) => env[k]);
  ok(prix.pro_cloud === L.pro_cloud.prix && prix.standard === 'p_std' && FS.prixStripeDepuis(() => undefined).pro_cloud === '', 'prixStripeDepuis lit les sept secrets ; absent = « » (jamais reconnu)');
  const sansCopie = ['create-checkout-session/index.ts', 'stripe-webhook/index.ts', 'cancel-subscription/index.ts', 'changer-formule/index.ts', '_shared/stripe-rang-vivant.ts']
    .filter((f) => /Deno\.env\.get\("STRIPE_PRICE_(STANDARD|PRO|BUSINESS|CLOUD)"\)/.test(lire(`supabase/functions/${f}`)));
  ok(sansCopie.length === 0, 'plus aucune copie des secrets STRIPE_PRICE_* dans les cinq fonctions (lus par _shared/prix-stripe.ts)', sansCopie);
  console.log('2. formuleDuProduit, sur les trois canaux');
  const fd = (id) => { const f = FS.formuleDuProduit(id, prix); return f ? `${f.formule}/${f.palier}/${f.cloud}/${f.rang}` : null; };
  ok(fd(L.premium_cloud.prix) === 'premium_cloud/premium/true/1' && fd(L.pro_cloud.prix) === 'pro_cloud/pro/true/2' && fd(L.business_cloud.prix) === 'business_cloud/business/true/3', 'Stripe : les trois formules avec Cloud');
  ok(fd('p_std') === 'premium/premium/false/1' && fd('p_pro') === 'pro/pro/false/2' && fd('p_biz') === 'business/business/false/3' && fd('p_cloud') === 'cloud/null/true/0', 'Stripe : les paliers et le Cloud seul');
  ok(fd('app.fillsell.premium.cloud') === 'premium_cloud/premium/true/1' && fd('app.fillsell.pro.cloud') === 'pro_cloud/pro/true/2' && fd('app.fillsell.business.cloud') === 'business_cloud/business/true/3', 'Apple / Google : les trois formules avec Cloud');
  ok(fd('app.fillsell.pro2.sub') === 'pro/pro/false/2' && fd('app.fillsell.pro.sub') === 'pro/pro/false/2' && fd('app.fillsell.premium.standard') === 'premium/premium/false/1'
    && fd('app.fillsell.business.sub') === 'business/business/false/3' && fd('app.fillsell.cloud.sub') === 'cloud/null/true/0' && fd('app.fillsell.coins.100') === null && fd('') === null,
    'boutiques : paliers, Cloud seul ; packs et inconnus → null');
  ok(FS.nomDeFormule('pro_cloud') === 'Pro + Cloud' && FS.nomDeFormule('standard') === 'Premium' && FS.nomDeFormule('cloud') === 'FillSell Cloud', 'les noms dits au client');
  if (CO) {
    console.log('3. Un abonnement de formule porte le palier ET le Cloud (cas 3, 4, 5, 10)');
    const sub = (o) => ({ id: 'sub_f', status: 'trialing', trial_start: 1800000000, trial_end: 1800604800, current_period_end: 1800604800,
      items: { data: [{ price: { id: L.pro_cloud.prix } }] }, metadata: { plan_type: 'pro', formule: 'pro_cloud', essai_cloud: '1' }, ...o });
    const essai = CO.drapeauxDepuisStripe([sub()], prix);
    ok(essai.is_premium && essai.is_pro && !essai.is_business && essai.is_cloud === false && essai.cloud_essai_fin && essai.cloud_ref === 'sub_f', 'essai Pro + Cloud : drapeaux Pro, Cloud en essai (dates), pas payé', essai);
    const actif = CO.drapeauxDepuisStripe([sub({ status: 'active' })], prix);
    ok(actif.is_pro && actif.is_cloud === true, 'fin d\'essai sans choix (active) : Pro et Cloud payés', actif);
    const descendu = CO.drapeauxDepuisStripe([sub({ status: 'active', items: { data: [{ price: { id: L.premium_cloud.prix } }] }, metadata: { plan_type: 'standard', formule: 'premium_cloud' } })], prix);
    ok(descendu.is_premium && !descendu.is_pro && descendu.is_cloud === true, 'passage à Premium + Cloud : drapeaux Premium, Cloud gardé', descendu);
    const arrete = CO.drapeauxDepuisStripe([sub({ status: 'canceled', ended_at: 1800100000 })], prix);
    ok(!arrete.is_premium && !arrete.is_pro && arrete.is_cloud === false && arrete.cloud_essai_arrete_le, 'essai arrêté : tout tombe, l\'essai reste « pris » (arrêté le)', arrete);
    const biz = CO.drapeauxDepuisStripe([sub({ status: 'active', items: { data: [{ price: { id: L.business_cloud.prix } }] }, metadata: { plan_type: 'business', formule: 'business_cloud' } })], prix);
    ok(biz.is_business && biz.is_pro && biz.is_premium && biz.is_cloud === true, 'Business + Cloud : drapeaux Business et Cloud', biz);
    const retire = CO.drapeauxDepuisStripe([sub({ status: 'active', items: { data: [{ price: { id: 'p_pro' } }] }, metadata: { plan_type: 'pro', formule: 'pro_cloud' } })], prix);
    ok(retire.is_pro && retire.is_cloud === false && retire.cloud_vivant === false, 'Cloud retiré (le prix est redevenu Pro) : Pro reste, le Cloud tombe — le PRIX fait foi', retire);
    const abonne = CO.drapeauxDepuisStripe([{ id: 'sub_a', status: 'active', items: { data: [{ price: { id: 'p_pro' } }] },
      metadata: { plan_type: 'pro', essai_cloud_formule: 'pro_cloud', essai_cloud_debut: '1800000000', essai_cloud_fin: '1800604800' } }], prix);
    ok(abonne.is_pro && abonne.is_cloud === false && abonne.cloud_essai_debut && abonne.cloud_essai_fin === new Date(1800604800000).toISOString(), 'essai du Cloud d\'un abonné (schedule) : sa formule payée, le Cloud en essai 7 jours', abonne);
    ok(FS.essaiCloudAbonneStripe({ metadata: { essai_cloud_formule: 'pro_cloud', essai_cloud_debut: '1000', essai_cloud_fin: '2000' } }) === null, 'une métadonnée d\'essai restée après la fin ne dit plus « essai en cours »');
    ok(CO.essaiCloudPermis({}, [sub({ status: 'canceled' })], prix) === false, 'un essai de formule avec Cloud compte comme l\'essai (un par personne)');
    ok(JSON.stringify(CO.litAbonnementStripe({ id: 's', status: 'active', items: { data: [{ price: { id: 'p_pro' } }] }, metadata: { plan_type: 'pro' } }, prix))
      === JSON.stringify({ id: 's', status: 'active', vivant: true, paye: true, cloud: false, palier: 'pro', rang: 2, essai: false, trial_start: null, trial_end: null, essai_arrete_le: null, cancel_at_period_end: false, current_period_end: null }),
      'un abonnement de palier sans formule se lit EXACTEMENT comme avant');
  }
  console.log('4. La voie d\'un achat web (cas 6, 8, 9)');
  const pal = (o) => ({ id: 'sub_p', status: 'active', rang: 2, formule: null, schedule: null, pending_update: null, cancel_at_period_end: false, ...o });
  const v = (o) => FS.voieFormuleStripe({ formule: 'pro_cloud', essaiPermis: true, ...o });
  ok(v({ boutique: { canal: 'apple', rang: 2 } }).motif === 'abonnement_boutique' && v({ boutique: { canal: 'google', rang: 1 } }).canal === 'google', 'abonné Apple / Google : refus, « change de formule dans l\'app iPhone / Android »');
  ok(v({ cloudBoutique: 'apple' }).motif === 'cloud_boutique', 'Cloud seul tenu par Apple : refus (jamais deux abonnements)');
  ok(v({ palierStripe: pal(), cloudSeulStripe: { id: 'c', status: 'active' } }).motif === 'deux_abonnements', 'palier + Cloud seul Stripe : refus (support)');
  ok(v({ palierStripe: pal() }).voie === 'essai_abonne', 'abonné Pro qui essaie le Cloud : schedule (7 jours en payant Pro)');
  ok(FS.voieFormuleStripe({ formule: 'premium_cloud', essaiPermis: true, palierStripe: pal({ rang: 1 }) }).voie === 'essai_abonne', 'abonné Premium qui essaie le Cloud : schedule');
  ok(v({ palierStripe: pal(), essaiPermis: false }).voie === 'changement_prix' && v({ palierStripe: pal(), essaiPermis: false }).prorata === 'immediat', 'essai déjà pris : passage tout de suite au prorata (décision 7)');
  ok(FS.voieFormuleStripe({ formule: 'pro_cloud', essaiPermis: true, palierStripe: pal({ rang: 1 }) }).voie === 'changement_prix', 'Premium vers Pro + Cloud (palier supérieur) : prorata, sans essai');
  ok(v({ palierStripe: pal({ rang: 3 }) }).motif === 'descente_par_changer_formule', 'Business vers Pro + Cloud : une descente → changer-formule');
  ok(v({ palierStripe: pal({ formule: 'pro_cloud' }) }).voie === 'deja', 'déjà Pro + Cloud : rien à vendre');
  ok(v({ palierStripe: pal({ schedule: 'sub_sched_1' }) }).motif === 'changement_prevu', 'un changement déjà prévu (schedule) : refus');
  ok(FS.voieFormuleStripe({ formule: 'pro_cloud', palierStripe: pal({ rang: 1, status: 'trialing', formule: 'premium_cloud' }) }).prorata === 'aucun', 'pendant un essai de formule : changement sans prorata (l\'essai continue)');
  ok(v({ cloudSeulStripe: { id: 'c', status: 'trialing' } }).voie === 'changement_prix' && v({ cloudSeulStripe: { id: 'c', status: 'trialing' } }).prorata === 'aucun', 'client du Cloud seul en essai → formule : le MÊME abonnement, sans prorata');
  ok(v({ cloudSeulStripe: { id: 'c', status: 'active' } }).prorata === 'immediat', 'client du Cloud seul payé → formule : le même abonnement, au prorata');
  ok(v({}).voie === 'checkout' && v({}).essai === true && v({ essaiPermis: false }).essai === false, 'nouveau : Checkout, essai seulement s\'il est permis');
  const p0 = FS.parametresCheckoutFormule({ formule: 'pro_cloud', prixFormule: 'p', essai: true, userId: 'u' });
  ok(p0.subscription_data.trial_period_days === 7 && p0.payment_method_collection === 'always' && p0.subscription_data.metadata.formule === 'pro_cloud' && p0.subscription_data.metadata.plan_type === 'pro' && !('option' in p0.metadata),
    'Checkout Pro + Cloud : 7 jours, carte demandée, métadonnées formule + plan_type (jamais option « cloud »)');
  const sched = { phases: [{ start_date: 1000, items: [{ price: 'p_pro', quantity: 1 }], discounts: [{ discount: 'di_1' }] }] };
  const es = FS.parametresEssaiCloudAbonne({ formule: 'pro_cloud', abonnement: { metadata: { plan_type: 'pro' } }, schedule: sched, prix, maintenant: 1800000000000 });
  ok(es.phases[0].end_date === 1800000000 + 7 * 86400 && es.phases[0].items[0].price === 'p_pro' && es.phases[1].items[0].price === prix.pro_cloud
    && es.phases[1].proration_behavior === 'create_prorations' && es.phases[1].metadata.formule === 'pro_cloud' && es.phases[0].metadata.essai_cloud_formule === 'pro_cloud'
    && es.phases[1].discounts?.[0]?.discount === 'di_1' && es.end_behavior === 'release' && es.phases[1].metadata.essai_cloud_formule === '',
    'schedule d\'abonné : 7 jours au prix actuel, puis la formule (prorata sur la prochaine facture), remise gardée', es.phases);
  console.log('5. Descente, retrait du Cloud, colonnes prévues (cas 4, 7)');
  if (DF) {
    ok(DF.peutDescendre('pro_cloud', 'premium_cloud') && DF.peutDescendre('pro_cloud', 'pro') && DF.peutDescendre('business_cloud', 'business')
      && !DF.peutDescendre('pro_cloud', 'premium') && !DF.peutDescendre('premium_cloud', 'pro_cloud') && !DF.peutDescendre('pro', 'premium_cloud'),
      'Pro + Cloud → Premium + Cloud ou Pro (retrait) ; jamais vers le haut, ni d\'un palier vers une formule avec Cloud');
    const c1 = DF.colonnesDescente({ formule: 'premium_cloud', le: '2026-12-01T00:00:00Z' });
    const c2 = DF.colonnesDescente({ formule: 'pro', le: '2026-12-01T00:00:00Z' });
    ok(c1.formule_prevue === 'premium' && c2.formule_prevue === 'pro', 'formule_prevue reste dans la contrainte de prod (premium | pro)');
    const pd = DF.parametresDescente({ abonnement: { current_period_end: 2000, metadata: { plan_type: 'pro', formule: 'pro_cloud' } }, schedule: { phases: [{ start_date: 1000, items: [{ price: prix.pro_cloud, quantity: 1 }] }] }, vers: 'pro', prix });
    ok(pd.phases[1].items[0].price === 'p_pro' && pd.phases[1].metadata.formule === '' && pd.phases[1].metadata.plan_type === 'pro', 'retirer le Cloud : phase 2 au prix Pro, métadonnée `formule` effacée');
  }
  if (PS) ok(PS.palierDeFacture({ lines: { data: [{ amount: 4999, price: { id: prix.pro_cloud } }] } }, null, prix) === 'pro', 'une facture Pro + Cloud crédite le palier Pro');
  console.log('6. Les fonctions Stripe');
  const cc = lire('supabase/functions/create-checkout-session/index.ts');
  ok(/if \(typeof product === "string" && estFormuleCloud\(product\)\) \{\s*return await acheterFormuleCloud/.test(cc), 'create-checkout-session : premium_cloud | pro_cloud | business_cloud passent par acheterFormuleCloud');
  ok(/interrupteurFormules\(supabase, "stripe", profil\)/.test(cc) && /conditionsFormulesAcceptees\(profil\)/.test(cc) && /permis\?\.fraiche !== true/.test(cc), 'gardes : interrupteur du canal, conditions ≥ la version des formules, préparation fraîche');
  // (13/11/2026, décision de Nico — « le Cloud seul en complément, sur n'importe quel canal ») … SAUF à un abonné (formuleVivante) :
  // l'interrupteur est lu une fois (formulesOuvertesWeb), le refus garde sa forme.
  ok(/const formulesOuvertesWeb = await interrupteurFormules\(supabase, "stripe", profilSeul\)/.test(cc)
    && /cloudSeulRefuse\(\{ profil: profilSeul, formulesOuvertes: formulesOuvertesWeb, formuleVivante(: false)? \}\)/.test(cc) && /error: "offre_remplacee"/.test(cc), 'product « cloud » refusé à qui ne l\'a jamais eu quand les formules sont ouvertes (jamais à un abonné)');
  ok(/if \(!pendantEssai && maj\.status !== "trialing"\) \{\s*const \{ error: grantErr \} = await supabase\.rpc\("upgrade_monthly_grant"/.test(cc), 'changement de prix : aucun crédit pendant un essai');
  const wh = lire('supabase/functions/stripe-webhook/index.ts');
  ok(/if \(subFacture\?\.status === "trialing"\) \{\s*await recomputeStripeFlags\(supabase, customerId\);[\s\S]{0,400}?return new Response/.test(wh), 'stripe-webhook : une facture pendant un essai ne crédite rien (sortie avant le crédit)');
  ok(/if \(formuleDeMetadonnees\(session\.metadata\)\) \{\s*return await formuleCloudSouscrite/.test(wh) && /\} else if \(sub && !carteRefusee && sub\.status === "active"\) \{[\s\S]{0,300}upgrade_monthly_grant/.test(wh), 'stripe-webhook : une formule souscrite ne crédite que payée (jamais en essai)');
  ok(/if \(formuleSub && status === "trialing" && cancelAtPeriodEnd\) \{\s*let evenementsArretF[\s\S]{0,200}stripe\.subscriptions\.cancel/.test(wh), 'stripe-webhook : arrêt pendant l\'essai d\'une formule = effet immédiat');
  const cs = lire('supabase/functions/cancel-subscription/index.ts');
  ok(/if \(essaiAbonneSub\) \{[\s\S]{0,700}subscriptionSchedules\.release/.test(cs) && /formuleSub\.status === "trialing"/.test(cs) && /error: "retirer_par_changer_formule"/.test(cs), 'cancel-subscription : essai d\'abonné arrêté (schedule rendu), essai de formule arrêté tout de suite, retrait du Cloud payé → changer-formule');
  const cf = lire('supabase/functions/changer-formule/index.ts');
  ok(/action === "retirer_cloud"/.test(cf) && /cible\.status === "trialing" && estFormuleCloud\(actuelle\)/.test(cf) && /error: "essai_cloud_en_cours"/.test(cf), 'changer-formule : retirer le Cloud, changer pendant l\'essai sans prorata, jamais par-dessus l\'essai d\'un abonné');
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
