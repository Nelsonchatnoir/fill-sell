// VERROU ⛔ (11/11/2026, correction de Nico de 21:45, qui remplace sa réponse 7) : AUCUN ESSAI SUR BUSINESS + CLOUD, nulle
// part — payé dès le premier jour sur Stripe, Apple et Google, y compris pour un abonné Business qui ajoute le Cloud.
// Ce verrou échoue si UN chemin d'essai accepte business_cloud : Checkout Stripe (trial_period_days), schedule d'essai
// d'un abonné, « 7 jours offerts » d'un abonné Apple / Google, semaine gratuite d'une boutique (droits ouverts), offre
// d'essai lue chez Google, mail d'essai, mail de la veille. Rouge avant (aucun de ces modules), vert après. Sans réseau.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
const lance = (f) => { try { f(); return false; } catch { return true; } };
const charger = async (p) => (existsSync(join(ROOT, p)) ? import(pathToFileURL(join(ROOT, p)).href) : null);

const FS = await charger('supabase/functions/_shared/formules-serveur.js');
const CO = await charger('supabase/functions/_shared/cloud-option.js');
const CM = await charger('supabase/functions/_shared/cloud-mails.js');
const RV = await charger('supabase/functions/_shared/cloud-rappel-veille.js');
const CONTRAT = await charger('supabase/functions/_shared/formules-cloud.js');
ok(!!FS && !!CONTRAT, 'formules-serveur.js et le contrat formules-cloud.js existent');
if (FS && CONTRAT) {
  const prix = { premium_cloud: 'price_pc', pro_cloud: 'price_prc', business_cloud: 'price_bc', standard: 'p_std', pro: 'p_pro', business: 'p_biz', cloud: 'p_cloud' };
  console.log('1. La règle de la formule');
  ok(CONTRAT.essaiPossiblePourFormule('business_cloud') === false && CONTRAT.FORMULES_AVEC_ESSAI.join() === 'premium_cloud,pro_cloud', 'contrat : essai seulement sur premium_cloud et pro_cloud');
  ok(FS.essaiFormuleAccorde({ formule: 'business_cloud', essaiPermis: true }) === false, 'essaiFormuleAccorde(business_cloud, essai permis) = faux');
  console.log('2. Stripe : Checkout et schedule d\'abonné');
  ok(lance(() => FS.parametresCheckoutFormule({ formule: 'business_cloud', prixFormule: 'price_bc', essai: true, userId: 'u' })), 'Checkout Business + Cloud AVEC essai : refusé (lève)');
  const sansEssai = FS.parametresCheckoutFormule({ formule: 'business_cloud', prixFormule: 'price_bc', essai: false, userId: 'u' });
  ok(sansEssai.subscription_data.trial_period_days == null && !('trial_settings' in sansEssai.subscription_data) && sansEssai.metadata.essai_cloud === '0', 'Checkout Business + Cloud : jamais trial_period_days', sansEssai.subscription_data);
  const sched = { phases: [{ start_date: 1000, items: [{ price: 'p_biz', quantity: 1 }] }] };
  ok(lance(() => FS.parametresEssaiCloudAbonne({ formule: 'business_cloud', abonnement: { metadata: {} }, schedule: sched, prix })), 'schedule d\'essai d\'un abonné Business → Business + Cloud : refusé (lève)');
  console.log('3. La voie d\'un achat web');
  const nouveau = FS.voieFormuleStripe({ formule: 'business_cloud', essaiPermis: true });
  ok(nouveau.voie === 'checkout' && nouveau.essai === false, 'nouveau client, essai permis : Checkout SANS essai', nouveau);
  const abonneBiz = FS.voieFormuleStripe({ formule: 'business_cloud', essaiPermis: true,
    palierStripe: { id: 'sub_b', status: 'active', rang: 3, formule: null, schedule: null, pending_update: null, cancel_at_period_end: false } });
  ok(abonneBiz.voie === 'changement_prix' && abonneBiz.prorata === 'immediat' && abonneBiz.essai === false, 'abonné Business qui ajoute le Cloud : passage immédiat au prorata, jamais un essai', abonneBiz);
  for (const rang of [1, 2]) {
    const v = FS.voieFormuleStripe({ formule: 'business_cloud', essaiPermis: true, palierStripe: { id: 's', status: 'active', rang, formule: null, schedule: null, pending_update: null, cancel_at_period_end: false } });
    ok(v.voie !== 'essai_abonne' && v.essai !== true, `abonné de rang ${rang} vers Business + Cloud : jamais un essai`, v);
  }
  const depuisEssaiCloud = FS.voieFormuleStripe({ formule: 'business_cloud', essaiPermis: true, cloudSeulStripe: { id: 'sub_c', status: 'trialing' } });
  ok(depuisEssaiCloud.voie === 'changement_prix' && depuisEssaiCloud.prorata === 'immediat' && depuisEssaiCloud.finEssai === true,
    'essai du Cloud seul → Business + Cloud : l\'essai s\'arrête là, payé tout de suite (jamais la suite de l\'essai)', depuisEssaiCloud);
  const depuisEssaiFormule = FS.voieFormuleStripe({ formule: 'business_cloud', essaiPermis: true,
    palierStripe: { id: 'sub_f', status: 'trialing', rang: 2, formule: 'pro_cloud', schedule: null, pending_update: null, cancel_at_period_end: false } });
  ok(depuisEssaiFormule.prorata === 'immediat' && depuisEssaiFormule.finEssai === true, 'essai de Pro + Cloud → Business + Cloud : l\'essai s\'arrête là, payé tout de suite', depuisEssaiFormule);
  const ccF = existsSync(join(ROOT, 'supabase/functions/create-checkout-session/index.ts')) ? lire('supabase/functions/create-checkout-session/index.ts') : '';
  ok(/\.\.\.\(finEssai \? \{ trial_end: "now" \} : \{\}\),/.test(ccF), 'create-checkout-session : finEssai → trial_end « now » sur le changement de prix');
  console.log('4. Les boutiques : une semaine gratuite n\'ouvre rien');
  for (const produit of ['app.fillsell.business.cloud']) {
    const d = FS.droitsAchatBoutique({ produit, essaiBoutique: true, verdictEssai: { ok: true } });
    ok(d && d.ouvrir === false && d.raison === 'essai_interdit_formule', `${produit} en semaine gratuite : aucun droit avant le 1er paiement`, d);
    const pl = FS.planAchatBoutique({ produit, sens: 'on', essaiBoutique: true, verdictEssai: { ok: true }, rangAutres: 0 });
    ok(pl && pl.drapeaux === null && pl.credit === false && pl.cloud === 'rien', `${produit} en semaine gratuite : ni drapeaux, ni crédit, ni Cloud`, pl);
    const paye = FS.planAchatBoutique({ produit, sens: 'on', essaiBoutique: false, rangAutres: 0 });
    ok(paye?.drapeaux?.is_business === true && paye.credit === true && paye.cloud === 'ecrire', `${produit} payé : Business + Cloud ouverts au paiement`, paye);
  }
  ok(CONTRAT.PRODUITS_BOUTIQUES.business_cloud.google_offre_essai === null, 'Google : aucune offre d\'essai déclarée pour business-cloud-monthly');
  if (CO?.lectureFormuleGoogle) {
    const achat = (offre) => ({ startTime: '2026-11-12T10:00:00Z', lineItems: [{ productId: 'app.fillsell.business.cloud', expiryTime: '2026-11-19T10:00:00Z', ...(offre ? { offerDetails: { offerId: offre } } : {}) }] });
    ok(CO.lectureFormuleGoogle('app.fillsell.business.cloud', achat('business-cloud-trial-7d'), 4).essai === false
      && CO.lectureFormuleGoogle('app.fillsell.business.cloud', achat(null), 4).essai === false
      && CO.lectureFormuleGoogle('app.fillsell.business.cloud', achat(null), null).essai === false,
      'Google : un achat Business + Cloud n\'est JAMAIS lu comme un essai (même avec une offre au nom d\'essai)');
  } else ok(false, 'lectureFormuleGoogle existe (cloud-option.js)');
  console.log('5. « 7 jours de Cloud offerts » (abonné Apple / Google)');
  const cc = existsSync(join(ROOT, 'supabase/functions/create-checkout-session/index.ts')) ? lire('supabase/functions/create-checkout-session/index.ts') : '';
  const offert = /async function essaiOffertBoutique[\s\S]*?\n}\n/.exec(cc)?.[0] ?? '';
  ok(/if \(!estFormuleCloud\(formule\) \|\| !essaiPossiblePourFormule\(formule\)\) return rep\(\{ error: "essai_impossible"/.test(offert),
    'create-checkout-session : les 7 jours offerts refusent toute formule sans essai (Business + Cloud) AVANT toute écriture');
  ok(/const rangVise = formule === "pro_cloud" \? 2 : 1;/.test(offert), 'les 7 jours offerts ne visent que Premium (1) ou Pro (2)');
  console.log('6. create-checkout-session : aucun trial_period_days hors des deux paramétrages gardés');
  const occ = (cc.match(/trial_period_days/g) ?? []).length;
  ok(occ === 0, `aucun trial_period_days écrit dans create-checkout-session (il vient de parametresCheckoutFormule / parametresCheckoutCloud) — ${occ} trouvé(s)`);
  ok(/const essai = voie\.essai === true && essaiPossiblePourFormule\(formule\);/.test(cc), 'Checkout d\'une formule : l\'essai exige essaiPossiblePourFormule (double garde)');
  console.log('7. Mails');
  if (CM) {
    ok(CM.texteMailCloud({ evenement: 'essai_debut', lang: 'fr', canal: 'stripe', faits: { formule: 'business_cloud', finIso: '2026-11-19T10:00:00Z' } }) === null
      && CM.texteMailCloud({ evenement: 'essai_debut', lang: 'en', canal: 'apple', faits: { formule: 'business_cloud' } }) === null, 'aucun mail « essai » pour Business + Cloud (fr, en)');
    ok((CM.evenementDebutStripe?.({ id: 'sub_x', status: 'trialing', trial_end: 1800000000, metadata: { formule: 'business_cloud' } }) ?? ['x']).length === 0
      && (CM.evenementDebutFormuleStripe?.({ formule: 'business_cloud', ref: 'sub_x', finIso: null, abonne: true }) ?? ['x']).length === 0,
      'aucun événement « début d\'essai » pour Business + Cloud (Stripe, abonné)');
    const evB = CM.evenementsBoutique({ canal: 'apple', nature: 'debut', avant: {}, update: { cloud_essai_debut: '2026-11-12T10:00:00Z', cloud_essai_fin: '2026-11-19T10:00:00Z' }, lecture: { essai: true, formule: 'business_cloud' }, ref: 'A1' });
    ok(evB.every((e) => e.evenement !== 'essai_debut'), 'boutique : aucun « début d\'essai » pour Business + Cloud', evB);
  } else ok(false, 'cloud-mails.js chargé');
  if (RV) {
    const t = RV.texteRappel({ lang: 'fr', finIso: '2026-11-19T10:00:00Z', canal: 'offert', ref: 'offert:apple:business_cloud' });
    ok(!/Business \+ Cloud/.test(t.paragraphes.join(' ')), 'veille : des « 7 jours offerts » au nom de Business + Cloud ne sont jamais reconnus');
  }
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
