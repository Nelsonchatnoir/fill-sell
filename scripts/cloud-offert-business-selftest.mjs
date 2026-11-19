// VERROU « LE CLOUD OFFERT LIÉ AU BUSINESS SUIT LE BUSINESS » (19/11/2026, décision de Nico)
// `npm run selftest:cloud-offert-business` — sans base, sans réseau.
// Cas : le compte Business faf5021a reçoit le Cloud OFFERT « à vie tant que son Business est actif ». Il avait pris lui-même
// « Business + Cloud » chez Stripe ; son abonnement est remis sur le prix Business. Sans cette règle, le webhook Stripe
// (« plus de Cloud chez Stripe ») couperait son Cloud ; et un Cloud offert sans lien ne s'arrêterait jamais avec le Business.
// La règle (cloud-option.js, cloudOffertSelonPalier, branchée dans stripe-webhook APRÈS le recalcul Stripe + stores) :
//   cloud_canal 'offert' + beta_flags.cloud_offert = 'business' → is_cloud = Business final ; jamais de date de fin.
//   Un Cloud offert SANS lien (compte de Nico) et tout autre canal : rien ne change.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 300)}` : ''}`); } };
const C = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/cloud-option.js')).href);

console.log('1. La règle pure');
{
  const lie = { cloud_canal: 'offert', beta_flags: { cloud_offert: 'business' } };
  ok(typeof C.cloudOffertSelonPalier === 'function' && typeof C.cloudOffertLieAuPalier === 'function', 'cloudOffertSelonPalier et cloudOffertLieAuPalier existent');
  if (typeof C.cloudOffertSelonPalier === 'function') {
    const actif = C.cloudOffertSelonPalier(lie, { is_business: true, is_pro: true, is_premium: true });
    ok(actif.is_cloud === true && actif.cloud_canal === 'offert' && actif.cloud_periode_fin === null && actif.cloud_arret_fin_periode === false, 'Business payé → Cloud actif, offert, sans date de fin', actif);
    const fini = C.cloudOffertSelonPalier(lie, { is_business: false, is_pro: false, is_premium: false });
    ok(fini.is_cloud === false, 'Business arrêté (résiliation à terme, impayé) → le Cloud s\'arrête avec lui', fini);
    ok(Object.keys(C.cloudOffertSelonPalier({ cloud_canal: 'offert', beta_flags: {} }, { is_business: false })).length === 0, 'Cloud offert SANS lien (compte de Nico) : rien ne change');
    ok(Object.keys(C.cloudOffertSelonPalier({ cloud_canal: 'stripe', beta_flags: { cloud_offert: 'business' } }, { is_business: true })).length === 0, 'canal stripe avec la marque : rien (la marque ne vaut qu\'avec le canal offert)');
    ok(Object.keys(C.cloudOffertSelonPalier({ cloud_canal: 'offert', beta_flags: { cloud_offert: 'premium' } }, { is_business: true })).length === 0, 'palier inconnu de la règle : rien');
    ok(Object.keys(C.cloudOffertSelonPalier(lie, {})).length === 0, 'drapeaux non recalculés (is_business absent) : rien, jamais un arrêt deviné');
    ok(Object.keys(C.cloudOffertSelonPalier(null, { is_business: true })).length === 0, 'profil illisible : rien');
  }
  // Le recalcul Stripe d'un abonnement Business seul (plus de Cloud chez Stripe) ne touche pas un Cloud offert.
  const u = C.miseAJourProfilDepuisStripe({ is_premium: true, is_pro: true, is_business: true, subscription_cancel_at_period_end: false, cloud_vivant: false }, 'offert');
  ok(!('is_cloud' in u) && !('cloud_canal' in u), 'Stripe sans Cloud + canal offert : les colonnes Cloud ne sont pas effacées par le recalcul', u);
}

console.log('2. Le webhook Stripe applique la règle après les stores');
{
  const w = readFileSync(path.join(RACINE, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  ok(/import \{[^}]*\bcloudOffertSelonPalier\b[^}]*\} from "\.\.\/_shared\/cloud-option\.js";/.test(w), 'stripe-webhook importe cloudOffertSelonPalier');
  ok(/select\("cloud_canal, beta_flags,/.test(w), 'le profil lu porte beta_flags (la marque du lien)');
  const iStores = w.indexOf('drapeauxStripeAvecStores(d, prof ?? null)');
  const iRegle = w.indexOf('Object.assign(update, cloudOffertSelonPalier(prof ?? null, update));');
  const iEcrit = w.indexOf('await supabase.from("profiles").update(update).eq("stripe_customer_id", customerId);');
  ok(iStores > 0 && iRegle > iStores && iEcrit > iRegle, 'ordre : drapeaux Stripe → stores vivants → Cloud offert → écriture');
}

console.log(ko ? `\n✗ cloud-offert-business : ${ko} échec(s) sur ${n}` : `\n✓ cloud-offert-business : ${n}/${n}`);
process.exit(ko ? 1 : 0);
