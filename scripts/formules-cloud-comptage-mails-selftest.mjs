// VERROU (11/11/2026, offres Cloud) — trois cas du plan :
//   A. LE COMPTAGE (§ 9, cas 11) : mrr.js sépare les formules avec Cloud des formules seules et du Cloud seul (7
//      catégories), en € par catégorie et en COMPTES distincts ; le Cloud seul Google (par cloud_ref) et Apple (son
//      groupe) comptés par abonnements-stores-audit ;
//   B. LES MAILS (§ 8.5, textes 5 et 6 validés) : la formule nommée (« Pro + Cloud ») dans le début d'essai, le paiement,
//      l'arrêt, l'impayé, la veille ; la variante de l'abonné et des 7 jours offerts ; jamais « Ta formule FillSell ne
//      change pas » pour une formule ; le Cloud seul garde ses textes ;
//   C. LES INTERRUPTEURS ET LES CONDITIONS (§ 7.7, § 8.6) : cloud_formules_<canal> absent ou ≠ 1 = fermé, témoin
//      (beta_flags.cloud) ouvert ; une formule exige les conditions ≥ la version qui la décrit (échec fermé tant qu'elle
//      n'existe pas) ; le Cloud seul n'est plus vendu à qui ne l'a jamais eu.
// Rouge avant (modules absents ou sans ces règles), vert après. Sans réseau.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n') : '');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
const charger = async (p) => (existsSync(join(ROOT, p)) ? import(pathToFileURL(join(ROOT, p)).href) : null);
const MRR = await charger('supabase/functions/_shared/mrr.js');
const CM = await charger('supabase/functions/_shared/cloud-mails.js');
const RV = await charger('supabase/functions/_shared/cloud-rappel-veille.js');
const FS = await charger('supabase/functions/_shared/formules-serveur.js');
const CP = await charger('supabase/functions/_shared/cloud-prix.js');

console.log('A. Le comptage');
ok(Array.isArray(MRR?.CATEGORIES_MRR) && MRR.CATEGORIES_MRR.join() === 'premium,pro,business,cloud,premium_cloud,pro_cloud,business_cloud', 'sept catégories (cloud = le Cloud SEUL)', MRR?.CATEGORIES_MRR);
if (MRR?.CATEGORIES_MRR) {
  ok(MRR.PRIX_MENSUELS_TTC.premium_cloud === 34.99 && MRR.PRIX_MENSUELS_TTC.pro_cloud === 49.99 && MRR.PRIX_MENSUELS_TTC.business_cloud === 79.99 && MRR.PRIX_MENSUELS_TTC.cloud === 24.99, 'prix de repli : 34,99 / 49,99 / 79,99 ; Cloud seul 24,99');
  ok(MRR.palierProduitStore('app.fillsell.pro.cloud') === 'pro_cloud' && MRR.palierProduitStore('app.fillsell.cloud.sub') === 'cloud' && MRR.palierProduitStore('app.fillsell.pro2.sub') === 'pro', 'boutiques : une formule avec Cloud est SA catégorie');
  const prix = { standard: 'p_std', pro: 'p_pro', business: 'p_biz', cloud: 'p_cloud', pro_cloud: 'p_prc' };
  const sub = (id, price, montant, o = {}) => ({ id, status: 'active', customer: 'cus_1', items: { data: [{ price: { id: price, unit_amount: montant, recurring: { interval: 'month' } } }] }, metadata: {}, ...o });
  ok(MRR.ligneMrrStripe(sub('s1', 'p_prc', 4999), prix)?.palier === 'pro_cloud' && MRR.ligneMrrStripe(sub('s2', 'p_pro', 2999), prix)?.palier === 'pro', 'Stripe : Pro + Cloud à part de Pro');
  ok(MRR.ligneMrrStripe(sub('s3', 'p_inconnu', 4999, { metadata: { formule: 'pro_cloud' } }), prix)?.palier === 'pro_cloud', 'Stripe : la métadonnée `formule` en repli (prix inconnu)');
  ok(MRR.ligneMrrStripe(sub('s4', 'p_prc', 4999, { status: 'trialing' }), prix) === null, 'un essai ne compte pas');
  const m = MRR.mrrParCanal([
    { canal: 'stripe', palier: 'pro_cloud', eur: 49.99, ref: 's1', compte: 'u1' }, { canal: 'stripe', palier: 'pro', eur: 29.99, ref: 's2', compte: 'u1' },
    { canal: 'apple', palier: 'premium_cloud', eur: 34.99, ref: 'u2', compte: 'u2' }, { canal: 'google', palier: 'cloud', eur: 24.99, ref: 'u3', compte: 'u3' },
  ]);
  ok(m.total.abonnes === 4 && m.total.comptes === 3 && m.total.eur_par_palier.pro_cloud === 49.99 && m.total.par_palier.cloud === 1 && m.stripe.comptes === 1, 'total : 4 abonnements, 3 comptes distincts, € par catégorie', m.total);
}
const au = lire('supabase/functions/abonnements-stores-audit/index.ts');
ok(/p\.cloud_canal === "google" && p\.cloud_ref && p\.cloud_ref !== p\.google_purchase_token/.test(au) && /p\.cloud_canal === "apple" && p\.cloud_ref && p\.cloud_ref !== p\.apple_original_transaction_id/.test(au),
  'abonnements-stores-audit : le Cloud seul Google (cloud_ref) et Apple (son groupe) enfin comptés');
ok(/compteDuClient/.test(au) && /cloud_ref\.not\.is\.null/.test(au), 'abonnements-stores-audit : comptes distincts (client Stripe → compte), profils au Cloud seul relus');

console.log('B. Les mails');
if (CM && FS) {
  const t = (evenement, faits, canal = 'stripe', lang = 'fr', prix = null) => CM.texteMailCloud({ evenement, lang, canal, faits, prix });
  const e1 = t('essai_debut', { formule: 'pro_cloud', finIso: '2026-11-19T10:00:00Z' }, 'stripe', 'fr', { montant: 49.99, devise: 'EUR' });
  ok(e1?.sujet === 'Ton essai Pro + Cloud a commencé' && /Pro \+ Cloud continue à 49,99[\s  ]€ par mois/u.test(e1.paragraphes.join(' ')) && /Premium \+ Cloud/.test(e1.paragraphes.join(' ')), 'début d\'essai : « Ton essai Pro + Cloud a commencé », le prix lu, l\'autre formule proposée', e1?.paragraphes);
  const e2 = t('essai_debut', { formule: 'pro_cloud', abonne: true, finIso: '2026-11-19T10:00:00Z' });
  ok(/tu ne paies que ta formule Pro/.test(e2?.paragraphes.join(' ') ?? '') && /rester en Pro sans Cloud/.test(e2?.paragraphes.join(' ') ?? ''), 'début d\'essai d\'un abonné : il ne paie que sa formule, il peut rester sans Cloud');
  const e3 = t('paiement', { formule: 'pro_cloud', contexte: 'fin_essai', montant: { montant: 49.99, devise: 'EUR' } });
  ok(e3?.sujet === 'Ton essai est fini : Pro + Cloud continue', 'paiement : « Ton essai est fini : Pro + Cloud continue »');
  const e4 = t('arret_programme', { formule: 'pro_cloud', retraitCloud: true, finIso: '2026-12-01T10:00:00Z' }, 'apple');
  ok(/Le Cloud s'arrêtera le/.test(e4?.sujet ?? '') && /redevient Pro/.test(e4?.paragraphes.join(' ') ?? ''), 'retrait du Cloud : « Le Cloud s\'arrêtera le … ; ta formule redevient Pro »');
  ok(t('impaye', { formule: 'premium_cloud' }, 'google')?.sujet === 'Ton paiement Premium + Cloud n\'est pas passé', 'impayé : la formule nommée');
  ok(t('essai_debut', { finIso: '2026-11-19T10:00:00Z' })?.sujet === 'Ton essai FillSell Cloud a commencé', 'le Cloud seul garde ses textes');
  const evS = CM.evenementPaiementStripe({ id: 'in_1', amount_paid: 4999, currency: 'eur', billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: 1800604800, end: 1803196800 } }] } },
    { trial_end: 1800604800, metadata: { formule: 'pro_cloud' } });
  ok(evS[0]?.faits?.formule === 'pro_cloud' && evS[0].faits.contexte === 'fin_essai', 'Stripe : le paiement d\'une formule porte son nom (fin d\'essai)');
}
if (RV) {
  const v = RV.texteRappel({ lang: 'fr', finIso: '2026-11-19T10:00:00Z', canal: 'stripe', formule: 'pro_cloud', prix: { montant: 49.99, devise: 'EUR' } });
  ok(v.sujet.startsWith('Ton essai Pro + Cloud se termine le') && !/ne change pas/.test(v.paragraphes.join(' ')) && /Premium \+ Cloud/.test(v.paragraphes.join(' ')), 'veille : « Ton essai Pro + Cloud se termine le … », jamais « Ta formule ne change pas »', v.paragraphes);
  const vo = RV.texteRappel({ lang: 'fr', finIso: '2026-11-19T10:00:00Z', canal: 'offert', ref: 'offert:google:premium_cloud' });
  ok(/7 jours de Cloud offerts/.test(vo.sujet) && /Sans geste de ta part, le Cloud s'arrête/.test(vo.paragraphes.join(' ')) && /Google Play/.test(vo.paragraphes.join(' ')), '7 jours offerts : sans geste, le Cloud s\'arrête ; le passage se fait dans Google Play');
  const vs = RV.texteRappel({ lang: 'fr', finIso: '2026-11-19T10:00:00Z', canal: 'apple', prix: { montant: 24.99, devise: 'EUR' } });
  ok(/FillSell Cloud/.test(vs.sujet) && /Ta formule FillSell ne change pas/.test(vs.paragraphes.join(' ')), 'veille du Cloud seul : inchangée');
}
if (CP) {
  ok(CP.prixDepuisGoogle({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'app.fillsell.pro.cloud', autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { units: '49', nanos: 990000000, currencyCode: 'EUR' } } }] }).formule === 'pro_cloud'
    && CP.prixDepuisStripe({ status: 'active', items: { data: [{ price: { unit_amount: 2999, currency: 'eur', recurring: { interval: 'month' } } }] }, metadata: { essai_cloud_formule: 'pro_cloud', essai_cloud_debut: '1900000000', essai_cloud_fin: '1900604800' } }).raison === 'essai_abonne',
    'la source du prix dit la formule (Google), et se tait pour l\'essai d\'un abonné (le prix d\'après n\'est pas celui d\'aujourd\'hui)');
}
const et = lire('supabase/functions/email-tunnel/index.ts');
ok(/formule: \(lu as \{ formule\?: string \| null \}\)\.formule \?\? null, abonne: \(lu as \{ abonne\?: boolean \}\)\.abonne === true, ref: \(p\.cloud_ref as string \| null\) \?\? null/.test(et), 'email-tunnel passe la formule lue à la source à la veille');

console.log('C. Interrupteurs et conditions');
if (FS) {
  ok(FS.formulesOuvertesPour({ valeur: undefined }) === false && FS.formulesOuvertesPour({ valeur: 0 }) === false && FS.formulesOuvertesPour({ valeur: '1' }) === true
    && FS.formulesOuvertesPour({ valeur: null, temoin: true }) === true, 'cloud_formules_<canal> : absent / 0 = fermé, 1 = ouvert, témoin = ouvert');
  ok(FS.CLES_INTERRUPTEURS_FORMULES.stripe === 'cloud_formules_stripe' && FS.CLES_INTERRUPTEURS_FORMULES.apple === 'cloud_formules_apple' && FS.CLES_INTERRUPTEURS_FORMULES.google === 'cloud_formules_google', 'les trois clés de coin_config');
  ok(FS.temoinCloud({ beta_flags: { cloud: true } }) === true && FS.temoinCloud({ beta_flags: { cloud: 'true' } }) === false && FS.temoinCloud(null) === false, 'témoin : beta_flags.cloud === true seulement');
  const H0 = [{ version: '2026-11-11', changement: 'reformulation_articles_4_9' }, { version: '2026-11-04', changement: 'prix_article_6' }];
  const H1 = [{ version: '2026-11-12', changement: FS.CHANGEMENT_CGU_FORMULES }, ...H0];
  ok(FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-11' }, H0) === false, 'tant que la version des formules n\'est pas écrite : refusé (échec fermé)');
  ok(FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-11' }, H1) === false && FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-12' }, H1) === true
    && FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-13' }, H1) === true, 'une formule exige une acceptation ≥ la version qui décrit les formules');
  ok(FS.cloudSeulRefuse({ profil: {}, formulesOuvertes: true }) === true && FS.cloudSeulRefuse({ profil: { cloud_essai_debut: '2026-11-08T14:16:00Z' }, formulesOuvertes: true }) === false
    && FS.cloudSeulRefuse({ profil: {}, formulesOuvertes: false }) === false, 'product « cloud » : refusé à qui ne l\'a jamais eu (formules ouvertes) ; gardé pour un client du Cloud seul');
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
