// selftest:descente-formule — C4 (09/11/2026 nuit) : les règles PURES de la descente de formule à la fin de la période
// (supabase/functions/_shared/descente-formule.js). Aucun réseau. Le parcours réel, en mode test Stripe :
// scripts/stripe-test/descente-formule-test.mjs (horloges de test).
import assert from 'node:assert/strict';
import {
  peutDescendre, formuleStripe, formuleDuPrix, parametresDescente, descentePrevue, colonnesDescente, abonnementDeFormule, RANG_FORMULE,
} from '../supabase/functions/_shared/descente-formule.js';

let n = 0;
const ok = (c, m, d) => { try { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); } catch { console.log(`  ✗ ${m}${d !== undefined ? `   ← ${JSON.stringify(d).slice(0, 400)}` : ''}`); process.exitCode = 1; } };
const PRIX = { standard: 'price_prem', pro: 'price_pro', business: 'price_biz', cloud: 'price_cloud' };
const T0 = 1_800_000_000; // un instant fixe (s)
const FIN = T0 + 30 * 86400;
const sub = (o = {}) => ({ id: 'sub_1', status: 'active', current_period_end: FIN, metadata: { plan_type: 'pro', fillsell_user_id: 'u1' },
  items: { data: [{ id: 'si_1', price: { id: 'price_pro' }, quantity: 1 }] }, schedule: null, ...o });

console.log('1. Qui peut descendre');
ok(peutDescendre('pro', 'premium') && peutDescendre('business', 'pro') && peutDescendre('business', 'premium') && peutDescendre('pro', 'standard'), 'Pro→Premium, Business→Pro, Business→Premium (premium = standard)');
ok(!peutDescendre('premium', 'pro') && !peutDescendre('pro', 'business') && !peutDescendre('pro', 'pro'), 'jamais vers le haut ni sur place (la montée a son chemin)');
ok(!peutDescendre('pro', 'free') && !peutDescendre('pro', 'cloud') && !peutDescendre(undefined, 'premium') && !peutDescendre('pro', undefined), 'jamais vers Free (= résilier), le Cloud, ni une formule inconnue');
ok(formuleStripe('premium') === 'standard' && formuleStripe('founder') === 'standard' && formuleStripe('cloud') === null && RANG_FORMULE.business === 3, 'noms : premium/founder → standard ; cloud → rien');
ok(formuleDuPrix('price_biz', PRIX) === 'business' && formuleDuPrix('price_cloud', PRIX) === null && formuleDuPrix(null, PRIX) === null, 'formule d’un prix : Business ; Cloud et rien → null');

console.log('2. Les phases du schedule');
{
  const sched = { id: 'sub_sched_1', phases: [{ start_date: T0 - 86400, end_date: FIN, items: [{ price: 'price_pro', quantity: 1 }] }] };
  const p = parametresDescente({ abonnement: sub(), schedule: sched, vers: 'premium', prix: PRIX });
  ok(p.end_behavior === 'release' && p.phases.length === 2, 'deux phases, puis l’abonnement rendu à lui-même');
  ok(p.phases[0].start_date === T0 - 86400 && p.phases[0].end_date === FIN && p.phases[0].items[0].price === 'price_pro' && p.phases[0].proration_behavior === 'none',
    'phase 1 : EXACTEMENT l’abonnement d’aujourd’hui, jusqu’à la fin de la période payée, sans prorata', p.phases[0]);
  ok(p.phases[1].items[0].price === 'price_prem' && p.phases[1].iterations === 1 && p.phases[1].metadata.plan_type === 'standard' && p.phases[1].metadata.fillsell_user_id === 'u1' && p.phases[1].proration_behavior === 'none',
    'phase 2 : prix Premium, plan_type standard (⛔ sans lui un Pro au prix Premium resterait Pro), autres métadonnées gardées', p.phases[1]);
  const lance = (f) => { try { f(); return false; } catch { return true; } };
  ok(lance(() => parametresDescente({ abonnement: sub(), schedule: sched, vers: 'free', prix: PRIX }))
    && lance(() => parametresDescente({ abonnement: sub(), schedule: { phases: [] }, vers: 'premium', prix: PRIX }))
    && lance(() => parametresDescente({ abonnement: sub({ current_period_end: null }), schedule: sched, vers: 'premium', prix: PRIX }))
    && lance(() => parametresDescente({ abonnement: sub(), schedule: sched, vers: 'premium', prix: { pro: 'price_pro' } })),
  'formule sans prix, schedule sans phase, fin inconnue, prix manquant → lève (jamais un appel à moitié juste)');
}

console.log('3. La descente prévue, lue chez Stripe');
{
  const sched = (statut, phases) => ({ id: 'sub_sched_1', status: statut, phases });
  const ph = (debut, fin, prix) => ({ start_date: debut, end_date: fin, items: [{ price: prix }] });
  const s = sub({ schedule: 'sub_sched_1' });
  const futur = sched('active', [ph(T0 - 86400, FIN, 'price_pro'), ph(FIN, FIN + 30 * 86400, 'price_prem')]);
  const pr = descentePrevue([s], { sub_sched_1: futur }, PRIX, T0 * 1000);
  ok(pr?.formule === 'standard' && pr.le === new Date(FIN * 1000).toISOString() && pr.ref === 'sub_sched_1' && pr.depuis === 'pro', 'Pro avec phase Premium à venir → Premium prévu à la fin de période', pr);
  ok(descentePrevue([s], { sub_sched_1: futur }, PRIX, (FIN + 10) * 1000) === null, 'la phase commencée → plus rien de prévu');
  ok(descentePrevue([s], { sub_sched_1: sched('released', futur.phases) }, PRIX, T0 * 1000) === null && descentePrevue([s], { sub_sched_1: sched('canceled', futur.phases) }, PRIX, T0 * 1000) === null, 'schedule rendu ou annulé → rien de prévu');
  ok(descentePrevue([sub()], {}, PRIX, T0 * 1000) === null, 'sans schedule → rien de prévu');
  const montee = sched('active', [ph(T0 - 86400, FIN, 'price_pro'), ph(FIN, FIN + 30 * 86400, 'price_biz')]);
  ok(descentePrevue([s], { sub_sched_1: montee }, PRIX, T0 * 1000) === null, 'une phase future PLUS HAUTE n’est pas une descente');
  const sBiz = sub({ schedule: 'sub_sched_1', items: { data: [{ price: { id: 'price_biz' } }] }, metadata: { plan_type: 'business' } });
  ok(descentePrevue([sBiz], { sub_sched_1: futur }, PRIX, T0 * 1000)?.depuis === 'business', 'la formule ACTUELLE se lit sur le prix (Business), pas sur la phase 1');
  ok(descentePrevue([sub({ schedule: 'sub_sched_1', status: 'past_due' })], { sub_sched_1: futur }, PRIX, T0 * 1000) === null, 'un abonnement impayé (past_due) : rien de prévu');
  ok(JSON.stringify(colonnesDescente(pr)) === JSON.stringify({ formule_prevue: 'premium', formule_prevue_le: pr.le, formule_prevue_canal: 'stripe' })
    && JSON.stringify(colonnesDescente(null)) === JSON.stringify({ formule_prevue: null, formule_prevue_le: null, formule_prevue_canal: null }),
  'colonnes écrites : « premium » (nom de l’app), la date, stripe ; rien → trois NULL (la règle CHECK de la migration)');
}

console.log('4. La cible : l’abonnement de formule, jamais le Cloud');
{
  const cloud = sub({ id: 'sub_cloud', items: { data: [{ price: { id: 'price_cloud' } }] }, metadata: { option: 'cloud' } });
  const estCloud = (s) => s.metadata?.option === 'cloud';
  ok(abonnementDeFormule([cloud, sub()], PRIX, estCloud)?.id === 'sub_1', 'Pro + Cloud → le Pro');
  ok(abonnementDeFormule([cloud], PRIX, estCloud) === null, 'Cloud seul → aucune cible (rien à descendre)');
  ok(abonnementDeFormule([sub({ status: 'canceled' })], PRIX, estCloud) === null, 'abonnement arrêté → aucune cible');
}
console.log('4 bis. Stripe SEULEMENT (décision de Nico, 09/11 matin) : une boutique vivante → aucun parcours C4');
{
  const { boutiqueVivante } = await import('../supabase/functions/_shared/descente-formule.js');
  const MAINT = Date.parse('2026-11-09T08:00:00Z');
  const futur = '2026-12-01T00:00:00Z';
  ok(boutiqueVivante({ apple_original_transaction_id: '2000001', subscription_period_end: futur, is_premium: true, is_pro: true }, MAINT) === 'apple', 'Apple : jeton + fin à venir → apple (aucun C4, même avec un Stripe à côté)');
  ok(boutiqueVivante({ google_purchase_token: 'tok', google_product_id: 'app.fillsell.pro.monthly', subscription_period_end: futur, is_premium: true }, MAINT) === 'google', 'Google : jeton + produit + fin à venir → google');
  ok(boutiqueVivante({ apple_original_transaction_id: '2000001', subscription_period_end: '2026-10-01T00:00:00Z', is_premium: true }, MAINT) === null
    && boutiqueVivante({ google_purchase_token: 'tok', google_product_id: 'pro', subscription_period_end: null }, MAINT) === null,
  'boutique arrêtée (fin passée) ou sans fin → plus vivante : un ancien client Apple passé à Stripe garde C4');
  ok(boutiqueVivante({ stripe_customer_id: 'cus_1', is_premium: true, is_pro: true, subscription_period_end: futur }, MAINT) === null, 'abonné Stripe seul → null (C4 ouvert)');
  const src = (await import('node:fs')).readFileSync(new URL('../supabase/functions/changer-formule/index.ts', import.meta.url), 'utf8');
  const iGarde = src.indexOf('const boutique = boutiqueVivante(profil);');
  ok(iGarde > 0 && iGarde < src.indexOf('if (!profil.stripe_customer_id)') && iGarde < src.indexOf('action === "lire"') && iGarde < src.indexOf('action === "annuler"') && iGarde < src.indexOf('action !== "programmer"')
    && /select\("[^"]*google_product_id[^"]*subscription_period_end/.test(src),
  'changer-formule : la garde boutique passe AVANT toute lecture Stripe et tout geste (lire, programmer, annuler), colonnes lues');
}

console.log('5. L’écran (reglages/formuleDescente.js)');
{
  const UI = await import('../src/reglages/formuleDescente.js');
  const base = { ouvert: true, natif: false, isPremium: true, clientStripe: 'cus_1', resilie: false };
  ok(UI.blocDescenteVisible(base), 'montré : web, abonné Stripe actif, interrupteur ouvert');
  ok(!UI.blocDescenteVisible({ ...base, ouvert: false }) && !UI.blocDescenteVisible({ ...base, natif: true }) && !UI.blocDescenteVisible({ ...base, isPremium: false })
    && !UI.blocDescenteVisible({ ...base, clientStripe: null }) && !UI.blocDescenteVisible({ ...base, resilie: true }),
  'caché : interrupteur fermé (la prod ce soir), iPhone/Android, Free, sans client Stripe, formule résiliée');
  const NB = String.fromCharCode(0xa0);
  ok(UI.dateChangement('2026-12-08T23:30:00Z', 'fr') === `9${NB}décembre` && UI.dateChangement('2026-12-09T00:31:18Z', 'en') === `9${NB}December` && UI.dateChangement(null) === '',
    'la date du changement, heure de PARIS (23:30 UTC le 8 = le 9 à Paris), insécable');
  ok(JSON.stringify(UI.ordreProposees(['premium', 'pro'])) === '["pro","premium"]' && JSON.stringify(UI.ordreProposees(['premium', 'cloud'])) === '["premium"]', 'la plus proche d’abord (Pro avant Premium), rien d’inconnu');
  const F = UI.textesDescente('fr');
  ok(F.confirmerTexte('Pro', 'Premium', '12,99 €', '9 décembre') === "Ta formule Pro reste entière jusqu'au 9 décembre. Ensuite : Premium, 12,99 €/mois. Rien n'est remboursé ni prélevé aujourd'hui, et tu peux annuler ce changement jusqu'au 9 décembre.",
    'la confirmation dit tout : jusqu’à quand, après, le prix, rien remboursé ni prélevé, annulable');
  ok(UI.messageErreur('arret_deja_prevu', 'fr').startsWith("Ta formule s'arrête déjà") && UI.messageErreur('code_inconnu', 'en').startsWith('The change could not be made') && UI.messageErreur(undefined, 'fr').includes('Rien n'),
    'chaque refus dit une phrase (jamais un code brut) ; inconnu → « rien n’a changé »');
  const tout = JSON.stringify([UI.textesDescente('fr'), UI.textesDescente('en')].map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'function' ? v('Pro', 'Premium', '12,99 €', '9 décembre') : v]))));
  ok(!/pépite|plafond|sans ordinateur|\bvous\b/i.test(tout), 'vocabulaire : jamais « pépites » / « plafond », tutoiement');
  ok(UI.prixFormule('premium', 'fr') === '12,99 €' && UI.prixFormule('pro', 'en') === '€29.99', 'prix web (Stripe) de la formule cible');
}
console.log(process.exitCode ? '\n✗ selftest:descente-formule rouge' : `\n✓ selftest:descente-formule — ${n} contrôles verts`);
