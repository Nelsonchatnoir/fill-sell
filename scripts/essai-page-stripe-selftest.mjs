// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 2 DU LOT DU 16/11/2026 MIDI — LA PAGE DE L'ESSAI CLOUD DONNE ENVIE DE METTRE SA CARTE
//     npm run selftest:essai-page-stripe
// ═══════════════════════════════════════════════════════════════════════════
// Constat (annexe p6 du 16/11 matin) : la page Stripe d'un essai ne portait aucun texte de FillSell ; la page /cancel
// rouvrait Premium SEUL à 12,99 € pour un essai Premium + Cloud (metadata.plan_type) ; rien ne proposait de reprendre un
// essai abandonné au retour dans l'app. (Google Pay et l'icône FillSell : réglages du compte Stripe, faits le 16/11 par
// le navigateur sur ordre de Nico — relus par l'API, pas testables ici.)
// Ce test prouve, sans réseau :
//   A. la phrase sous le bouton : « 0 € aujourd'hui. Rien n'est prélevé avant le JJ/MM. Tu arrêtes en un clic depuis l'app
//      FillSell, quand tu veux. » (JJ/MM = fin de l'essai, heure de Paris) ; en anglais aussi ;
//   B. parametresCheckoutFormule et parametresCheckoutCloud la posent (custom_text.submit) pour un ESSAI seulement ;
//   C. create-checkout-session passe la langue de la personne aux deux ;
//   D. la page /cancel rouvre la FORMULE demandée (produitDeLaSession), jamais Premium seul ; le diagnostic la rend ;
//      « Payer par carte » refait la préparation si le serveur la redemande ;
//   E. « Reprendre ton essai » : la règle (20 s à 24 h, Cloud éteint, formule en vente) et son branchement dans App.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(new URL(`../${p}`, import.meta.url).href); } catch (e) { console.log(`  (module ${p} : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
const T0 = Date.parse('2026-11-16T11:00:00Z'); // 16/11 12:00 à Paris

const TX = await importer('supabase/functions/_shared/texte-page-essai.js');
const FS = await importer('supabase/functions/_shared/formules-serveur.js');
const CO = await importer('supabase/functions/_shared/cloud-option.js');
const PS = await importer('supabase/functions/_shared/plan-de-session.js');
const RE = await importer('src/cloud/repriseEssai.js').catch(() => null);

console.log('\nA. La phrase sous le bouton de la page Stripe');
const attendueFr = "0 € aujourd'hui. Rien n'est prélevé avant le 23/11. Tu arrêtes en un clic depuis l'app FillSell, quand tu veux.";
ok(TX?.texteSousBoutonEssai?.({ lang: 'fr', maintenant: T0 }) === attendueFr, `fr : « ${attendueFr} »`, TX?.texteSousBoutonEssai?.({ lang: 'fr', maintenant: T0 }));
ok(/^€0 today\. Nothing is charged before 23\/11/.test(TX?.texteSousBoutonEssai?.({ lang: 'en', maintenant: T0 }) ?? ''), 'en : « €0 today. Nothing is charged before 23/11… »');
ok(TX?.dateFinEssaiCourte?.(Date.parse('2026-11-16T23:30:00Z')) === '24/11', 'la date suit l’heure de Paris (16/11 23:30 UTC = 17/11 00:30 à Paris → 24/11)', TX?.dateFinEssaiCourte?.(Date.parse('2026-11-16T23:30:00Z')));

console.log('\nB. Les sessions Checkout : la phrase pour un ESSAI seulement');
{
  const f = FS?.parametresCheckoutFormule?.({ formule: 'premium_cloud', prixFormule: 'price_x', essai: true, userId: 'u', lang: 'fr', maintenant: T0 });
  ok(f?.custom_text?.submit?.message === attendueFr && f?.subscription_data?.trial_period_days === 7, 'Premium + Cloud à l’essai : custom_text.submit = la phrase, essai de 7 jours inchangé', JSON.stringify(f?.custom_text));
  const p = FS?.parametresCheckoutFormule?.({ formule: 'pro_cloud', prixFormule: 'price_y', essai: false, userId: 'u', lang: 'fr', maintenant: T0 });
  ok(p && !('custom_text' in p), 'Pro + Cloud payé tout de suite : aucune phrase d’essai');
  const b = FS?.parametresCheckoutFormule?.({ formule: 'business_cloud', prixFormule: 'price_z', essai: false, userId: 'u', lang: 'fr', maintenant: T0 });
  ok(b && !('custom_text' in b), 'Business + Cloud : aucune phrase d’essai');
  const c = CO?.parametresCheckoutCloud?.({ prixCloud: 'price_c', essai: true, userId: 'u', lang: 'en', maintenant: T0 });
  ok(/^€0 today\./.test(c?.custom_text?.submit?.message ?? ''), 'Cloud seul à l’essai : la phrase aussi (en anglais pour un compte anglais)', JSON.stringify(c?.custom_text));
}

console.log('\nC. create-checkout-session passe la langue');
{
  const ccs = lire('supabase/functions/create-checkout-session/index.ts');
  ok(/parametresCheckoutFormule\(\{ formule, prixFormule, essai, userId: user\.id, lang: langueDePage \}\)/.test(ccs), 'formules : parametresCheckoutFormule(…, lang)');
  ok(/parametresCheckoutCloud\(\{ prixCloud: cloudPriceId, essai, userId: authUser\.id, lang: lang === "en" \? "en" : "fr" \}\)/.test(ccs), 'Cloud seul : parametresCheckoutCloud(…, lang)');
}

console.log('\nD. La page /cancel rouvre la formule demandée');
{
  const f = PS?.produitDeLaSession;
  ok(f?.({ formule: 'premium_cloud', plan_type: 'standard' }) === 'premium_cloud', 'essai Premium + Cloud → premium_cloud (avant : « standard », Premium seul à 12,99 €)');
  ok(f?.({ formule: 'pro_cloud', plan_type: 'pro' }) === 'pro_cloud', 'Pro + Cloud → pro_cloud (avant : Pro seul)');
  ok(f?.({ option: 'cloud', plan_type: 'cloud' }) === 'cloud' && f?.({ plan_type: 'pro' }) === 'pro' && f?.({}) === null, 'Cloud seul → cloud ; un palier → son palier ; rien → null');
  const ccs = lire('supabase/functions/create-checkout-session/index.ts');
  ok(/const plan = produitDeLaSession\(s\.metadata\);/.test(ccs), 'le diagnostic de /cancel rend produitDeLaSession (plus metadata.plan_type seul)');
  const cancel = lire('src/pages/Cancel.jsx');
  ok(/error === 'preparation_requise'|preparation_requise/.test(cancel) && /cloud_essai_preparer_moi/.test(cancel), '« Payer par carte » refait la préparation (place serveur) quand le serveur la redemande');
}

console.log('\nE. « Reprendre ton essai »');
{
  const marque = { formule: 'premium_cloud', at: T0, canal: 'stripe' };
  const v = (o) => RE?.bandeauRepriseVisible?.({ marque, cloudActif: false, vendable: true, maintenant: T0 + 60_000, ...o });
  ok(v({}) === true, 'retour 1 min après, Cloud éteint, formule en vente : visible');
  ok(v({ maintenant: T0 + 5_000 }) === false, 'pendant qu’on est encore sur la page de paiement (5 s) : jamais');
  ok(v({ maintenant: T0 + 25 * 3600_000 }) === false, 'après 24 h : plus rien');
  ok(v({ cloudActif: true }) === false && v({ cloudActif: null }) === false, 'Cloud actif (essai démarré) ou pas encore lu : jamais');
  ok(v({ vendable: false }) === false, 'formule fermée sur ce canal : jamais');
  ok(RE?.noterEssaiAReprendre?.({ formule: 'business_cloud' }, { setItem() { throw new Error('ne doit pas écrire'); } }) === false, 'Business + Cloud (sans essai) : aucune marque');
  const app = lire('src/App.jsx');
  ok(/noterEssaiAReprendre\(/.test(app) && /<BandeauReprendreEssai /.test(app) && /lancerAchatFormule\(formule,\{essaiAffiche:true\},'reprise_essai'\)/.test(app), 'App : la marque est posée, le bandeau monté, « Reprendre » relance le même chemin d’achat');
  ok(/effacerEssaiAReprendre\(\);/.test(lire('src/pages/Success.jsx')), 'retour de Stripe réussi (/success) : la marque s’efface (jamais « pas démarré » avant que le serveur écrive le Cloud)');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
