// VERROU (11/11/2026, offres Cloud, plan § 7.4-7.6 et § 10.2 cas 3, 5, 6, 7, 10) — APPLE ET GOOGLE : les trois formules
// avec Cloud reconnues (webhooks et validations) ; le produit RENOUVELÉ fait foi (DID_RENEW recalcule drapeaux et Cloud :
// retrait du Cloud, descente annoncée par DID_CHANGE_RENEWAL_PREF) ; Google : linkedPurchaseToken lu, l'expiration du jeton
// REMPLACÉ ne retire rien ; jamais descendre sous un autre canal vivant ; décision 8 (semaine gratuite d'une boutique à qui
// a déjà eu son essai : droits au 1er paiement réel) ; aucun crédit du mois pendant un essai. Rouge avant, vert après.
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
ok(!!FS && !!CO?.lectureFormuleApple, 'formules-serveur.js et les lectures de formule (cloud-option.js) existent');
if (FS && CO?.lectureFormuleApple) {
  console.log('1. Ce qu\'un événement de boutique ouvre (pur)');
  const on = (produit, o = {}) => FS.planAchatBoutique({ produit, sens: 'on', ...o });
  const a = on('app.fillsell.pro.cloud', { essaiBoutique: true, verdictEssai: { ok: true } });
  ok(a.drapeaux?.is_pro === true && a.cloud === 'ecrire' && a.credit === false, 'Pro + Cloud en semaine gratuite (premier essai) : droits Pro + Cloud, AUCUN crédit', a);
  const r = on('app.fillsell.pro.cloud', { essaiBoutique: true, verdictEssai: { ok: false, raison: 'essai_deja_pris' } });
  ok(r.drapeaux === null && r.cloud === 'rien' && r.credit === false, 'décision 8 : essai déjà pris → rien ne monte pendant la semaine gratuite', r);
  const paye = on('app.fillsell.premium.cloud', { essaiBoutique: false, rangAutres: 0 });
  ok(paye.drapeaux?.is_premium && !paye.drapeaux.is_pro && paye.credit === true && paye.cloud === 'ecrire', 'Premium + Cloud payé : Premium, Cloud, crédit du mois', paye);
  const retrait = on('app.fillsell.pro2.sub', { cloudLie: true, rangAutres: 0 });
  ok(retrait.drapeaux?.is_pro && retrait.cloud === 'couper', 'DID_RENEW du produit Pro après Pro + Cloud (Cloud lié) : Pro reste, le Cloud s\'arrête', retrait);
  const desc = on('app.fillsell.premium.standard', { cloudLie: true, rangAutres: 0 });
  ok(desc.drapeaux?.is_premium && desc.drapeaux.is_pro === false, 'DID_RENEW du produit Premium après Pro (descente annoncée) : le palier DESCEND', desc);
  const garde = on('app.fillsell.premium.standard', { cloudLie: true, rangAutres: 2 });
  ok(garde.drapeaux?.is_pro === true, 'jamais sous un autre canal vivant (Stripe Pro) : Pro gardé', garde);
  const off = FS.planAchatBoutique({ produit: 'app.fillsell.pro.cloud', sens: 'off', rangAutres: 1 });
  ok(off.drapeaux?.is_premium && !off.drapeaux.is_pro && off.cloud === 'couper' && off.credit === false, 'expiration de Pro + Cloud : le droit Apple/Google tombe (reste Premium d\'un autre canal), le Cloud s\'arrête', off);
  ok(FS.planAchatBoutique({ produit: 'app.fillsell.cloud.sub', sens: 'on' }) === null && FS.planAchatBoutique({ produit: 'app.fillsell.coins.100', sens: 'on' }) === null, 'Cloud seul et packs : hors de ce chemin');
  ok(FS.formulePrevueEcrivable('premium_cloud') === 'premium' && FS.formulePrevueEcrivable('pro') === 'pro' && FS.formulePrevueEcrivable('business_cloud') === null, 'formule prévue : dans la contrainte de prod');
  console.log('2. Lectures Apple et Google');
  const la = CO.lectureFormuleApple({ productId: 'app.fillsell.pro.cloud', offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: 1800000000000, expiresDate: 1800604800000, originalTransactionId: '200' }, { autoRenewStatus: 1 });
  ok(la?.formule === 'pro_cloud' && la.essai === true && la.renouvellementAuto === true, 'Apple : Pro + Cloud, offre d\'introduction = essai', la);
  ok(CO.lectureFormuleApple({ productId: 'app.fillsell.pro2.sub' }) === null && CO.lectureCloudApple({ productId: 'app.fillsell.pro.cloud' }) === null, 'Apple : une formule n\'est jamais lue comme le Cloud seul, ni un palier comme une formule');
  const lg = CO.lectureFormuleGoogle('app.fillsell.pro.cloud', { startTime: '2026-11-12T10:00:00Z', lineItems: [{ productId: 'app.fillsell.pro.cloud', expiryTime: '2026-11-19T10:00:00Z', offerDetails: { offerId: 'pro-cloud-trial-7d' } }] }, 4);
  ok(lg?.formule === 'pro_cloud' && lg.essai === true, 'Google : Pro + Cloud avec son offre pro-cloud-trial-7d = essai', lg);
  ok(CO.lectureCloudGoogle('app.fillsell.cloud.sub', { startTime: '2026-11-12T10:00:00Z', lineItems: [{ expiryTime: '2026-11-19T10:00:00Z', offerDetails: { offerId: 'cloud-trial-3d' } }] }, 4).essai === true, 'Google : le Cloud seul garde sa lecture (cloud-trial-3d)');
  console.log('3. apple-iap-webhook');
  const ap = lire('supabase/functions/apple-iap-webhook/index.ts');
  ok(/const formuleTx = formuleDuProduit\(productId\);/.test(ap) && /if \(formuleTx\.cloud \|\| cloudLiePlan \|\| profilPlan\?\.formule_prevue_canal === "apple"/.test(ap) && /return await planApple\(/.test(ap),
    'les formules (et un produit sans Cloud dont le Cloud est lié, ou annoncé) passent par planApple');
  ok(/sousType === "DOWNGRADE" && vers && vers\.formule !== "cloud"/.test(ap) && /formule_prevue_canal: "apple"/.test(ap), 'DID_CHANGE_RENEWAL_PREF / DOWNGRADE : la formule prévue est notée (« Cloud retiré le … »)');
  ok(/retraitCloud: true/.test(ap), 'retrait du Cloud annoncé : le mail « le Cloud s\'arrêtera le … »');
  ok(/rangAutres: await rangAutresQueApple\(profil\)/.test(ap) && /return rangDesDrapeaux\(profil\);/.test(ap), 'Stripe relu pour ne jamais descendre sous un autre canal ; Stripe illisible → rien ne descend');
  ok(/if \(plan\.credit\) \{/.test(ap), 'crédit du mois seulement si planAchatBoutique le permet (jamais pendant un essai)');
  ok(/const formuleRen = renewalProductId \? formuleDuProduit\(renewalProductId\) : null;/.test(ap), 'renouvellement seul (sans transaction) d\'une formule : coupé ou remis');
  console.log('4. google-play-webhook et validate-google-purchase');
  const gp = lire('supabase/functions/google-play-webhook/index.ts');
  ok(/!PREMIUM_PRODUCT_IDS\.includes\(subscriptionId\) && subscriptionId !== PRODUIT_CLOUD_GOOGLE && !formuleDuProduit\(subscriptionId\)/.test(gp), 'Google : les formules ne sont plus « non-premium product »');
  ok((gp.match(/canceledStateContext\?\.replacementCancellation != null/g) ?? []).length >= 2, 'l\'expiration d\'un jeton REMPLACÉ ne retire rien (paliers d\'avant ET formules)');
  ok(/purchase\?\.linkedPurchaseToken/.test(gp) && /pl\?\.cloud_ref === lieJ/.test(gp), 'linkedPurchaseToken lu : le Cloud lié au jeton remplacé suit le nouveau produit');
  ok(/debut > Date\.now\(\) \+ 60_000/.test(gp) && /formule_prevue_canal: "google"/.test(gp), 'remplacement DIFFÉRÉ : noté « prévu », appliqué à son début');
  ok(/const essaiBoutique = notificationType === 4 && \(lecture\.essai === true \|\| lecture\.phaseEssai === true\);/.test(gp) && /if \(plan\.credit\) \{/.test(gp), 'Google : aucun crédit pendant un essai');
  const vg = lire('supabase/functions/validate-google-purchase/index.ts');
  ok(/const estAbonnement = SUB_PRODUCT_IDS\.includes\(productId\) \|\| estFormuleV;/.test(vg) && /if \(planV\.credit\) \{/.test(vg), 'validate-google-purchase : les formules reconnues, crédit seulement hors essai');
  const va = lire('supabase/functions/validate-apple-receipt/index.ts');
  ok(/\.\.\.FORMULES_APPLE\]/.test(va) && /if \(refusEssaiA\) delete update\.is_premium;/.test(va), 'validate-apple-receipt : les formules reconnues ; semaine gratuite refusée → aucun drapeau ne bouge');
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
