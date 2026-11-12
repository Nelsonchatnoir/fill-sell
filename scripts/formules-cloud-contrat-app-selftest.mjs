// VERROU (12/11/2026, offres Cloud) — CE QUE L'APP ATTEND DU SERVEUR (rapport OFFRES-APP § 6, jonction du coordinateur) :
//   · profiles.cloud_formule ('premium_cloud' | 'pro_cloud' | 'business_cloud' | NULL), migration 20261112000000 + inverse +
//     banc, posée par les flux des trois canaux quand la formule est active ou en essai, remise à NULL quand elle tombe ;
//   · create-checkout-session : { url, formule } ; un changement sur l'abonnement Stripe existant → { upgraded | essai_abonne,
//     change: true } ; erreurs preparation_requise, conditions_a_accepter, abonnement_autre_canal (+ canal) avec
//     message_fr / message_en ;
//   · les conditions : { version: '2026-11-12', changement: 'formules_cloud_article_6' } en tête de CGU_CLOUD_HISTORIQUE, la
//     minimale INCHANGÉE (Cloud seul), une formule exige ≥ 2026-11-12 ;
//   · retirer le Cloud : changer-formule { action: 'programmer', vers: 'pro' | 'standard' | 'business' } depuis la formule
//     avec Cloud ; arrêter pendant l'essai : cancel-subscription { option: 'cloud' }.
// Rouge avant, vert après. Sans réseau.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n') : '');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
const charger = async (p) => (existsSync(join(ROOT, p)) ? import(pathToFileURL(join(ROOT, p)).href) : null);

console.log('1. La colonne profiles.cloud_formule');
const mig = lire('supabase/migrations/20261112000000_profiles_cloud_formule.sql');
const inv = lire('supabase/rollbacks/20261112000000_profiles_cloud_formule_INVERSE.sql');
ok(/ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS cloud_formule text;/.test(mig) && /CHECK \(cloud_formule IS NULL OR cloud_formule IN \('premium_cloud', 'pro_cloud', 'business_cloud'\)\)/.test(mig)
  && !/GRANT|REVOKE|POLICY/i.test(mig.replace(/^--.*$/gm, '')), 'migration : colonne NULL + contrainte des 3 valeurs, aucun droit posé (ceux des colonnes Cloud)');
ok(/ALTER TABLE public\.profiles DROP COLUMN IF EXISTS cloud_formule;/.test(inv) && existsSync(join(ROOT, 'scripts/essais/20261112000000_banc.mjs')), 'inverse (DROP COLUMN) et banc sur base jetable');
const CO = await charger('supabase/functions/_shared/cloud-option.js');
const FS = await charger('supabase/functions/_shared/formules-serveur.js');
if (CO && FS) {
  const prix = { pro: 'p_pro', pro_cloud: 'p_prc', standard: 'p_std', cloud: 'p_cloud' };
  const d1 = CO.drapeauxDepuisStripe([{ id: 's', status: 'trialing', trial_start: 1900000000, trial_end: 1900604800, items: { data: [{ price: { id: 'p_prc' } }] }, metadata: { formule: 'pro_cloud' } }], prix);
  ok(d1.cloud_formule === 'pro_cloud' && CO.miseAJourProfilDepuisStripe(d1, 'stripe').cloud_formule === 'pro_cloud', 'Stripe : formule en essai → cloud_formule écrite');
  const d2 = CO.drapeauxDepuisStripe([{ id: 's', status: 'active', items: { data: [{ price: { id: 'p_pro' } }] }, metadata: { plan_type: 'pro', essai_cloud_formule: 'pro_cloud', essai_cloud_debut: '1900000000', essai_cloud_fin: '1900604800' } }], prix);
  ok(d2.cloud_formule === 'pro_cloud', 'Stripe : essai du Cloud d\'un abonné → la formule qui suivra');
  const d3 = CO.drapeauxDepuisStripe([{ id: 's', status: 'active', items: { data: [{ price: { id: 'p_cloud' } }] }, metadata: { option: 'cloud' } }], prix);
  ok(!('cloud_formule' in d3) && !('cloud_formule' in CO.drapeauxDepuisStripe([{ id: 's', status: 'active', items: { data: [{ price: { id: 'p_pro' } }] }, metadata: { plan_type: 'pro' } }], prix)), 'Cloud seul ou palier seul : la clé n\'apparaît pas (sorties d\'avant identiques)');
}
const wh = lire('supabase/functions/stripe-webhook/index.ts');
ok(/select\("cloud_formule"\)\.eq\("stripe_customer_id", customerId\)\.maybeSingle\(\);\s*if \(!ecf && cf\?\.cloud_formule/.test(wh), 'stripe-webhook : remise à NULL quand la formule tombe, seulement si la colonne en porte une (colonne absente : rien)');
ok(/update\.cloud_formule = plan\.cloud === "ecrire" \? f\.formule : null;/.test(lire('supabase/functions/apple-iap-webhook/index.ts')), 'apple-iap-webhook : posée avec le Cloud de la formule, NULL quand il est coupé');
const gp = lire('supabase/functions/google-play-webhook/index.ts');
ok(/update\.cloud_formule = plan\.cloud === "ecrire" \? f\.formule : null;/.test(gp) && /await ecrire\(\{ \.\.\.maj, cloud_formule: null \}\);/.test(gp), 'google-play-webhook : posée / remise à NULL');
ok(/cloud_formule: formuleV!\.formule/.test(lire('supabase/functions/validate-google-purchase/index.ts')) && /cloud_formule: formuleA\.formule/.test(lire('supabase/functions/validate-apple-receipt/index.ts')), 'validate-google-purchase et validate-apple-receipt : posée');
ok((lire('supabase/functions/cancel-subscription/index.ts').match(/cloud_formule: null/g) ?? []).length === 2, 'cancel-subscription : NULL à l\'arrêt d\'un essai (abonné, formule)');
console.log('2. create-checkout-session');
const cc = lire('supabase/functions/create-checkout-session/index.ts');
ok(/error: "abonnement_autre_canal", motif: r\.motif, canal: r\.canal \?\? null, formule,\s*message_fr: messageVoieFormule\(r, "fr"\), message_en: messageVoieFormule\(r, "en"\)/.test(cc), 'abonnement Apple / Google : « abonnement_autre_canal » + canal + message_fr / message_en');
ok(/return rep\(\{ url: session\.url, formule, essai \}\);/.test(cc) && /essai_abonne: true, change: true, formule/.test(cc) && /upgraded: true, change: true, formule/.test(cc), 'réponses : { url, formule } ; changement sur l\'abonnement existant → change: true');
ok(/error: "preparation_requise", formule/.test(cc) && /error: "conditions_a_accepter", formule, version: versionCguFormules\(\)/.test(cc), 'erreurs preparation_requise et conditions_a_accepter (avec la version)');
console.log('3. Les conditions');
const CC = await charger('supabase/functions/_shared/cloud-conditions.js');
if (CC && FS) {
  ok(CC.CGU_CLOUD_HISTORIQUE[0].version === '2026-11-12' && CC.CGU_CLOUD_HISTORIQUE[0].changement === 'formules_cloud_article_6' && CC.CGU_CLOUD_VERSION_MINIMALE === '2026-11-04',
    'en tête : { 2026-11-12, formules_cloud_article_6 } ; minimale inchangée (2026-11-04)');
  ok(FS.CHANGEMENT_CGU_FORMULES === 'formules_cloud_article_6' && FS.versionCguFormules() === '2026-11-12', 'la version des formules = 2026-11-12');
  ok(FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-12' }) && !FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-11' }) && !FS.conditionsFormulesAcceptees({ cloud_cgu_version: '2026-11-04' })
    && CC.conditionsCloudAcceptees({ cloud_cgu_version: '2026-11-04' }), 'formule : ≥ 2026-11-12 exigé ; le Cloud seul accepte toujours 2026-11-04');
} else ok(false, 'cloud-conditions.js et formules-serveur.js chargés');
console.log('4. Retirer le Cloud, arrêter pendant l\'essai');
const DF = await charger('supabase/functions/_shared/descente-formule.js');
ok(!!DF && DF.peutDescendre('pro_cloud', 'pro') && DF.peutDescendre('premium_cloud', 'standard') && DF.peutDescendre('business_cloud', 'business'), 'changer-formule { programmer, vers: pro | standard | business } depuis la formule avec Cloud : permis');
ok(/if \(formuleSub && formuleSub\.status === "trialing"\) \{/.test(lire('supabase/functions/cancel-subscription/index.ts')), 'cancel-subscription { option: cloud } arrête l\'essai d\'une formule avec Cloud');
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
