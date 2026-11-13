// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (3e réponse de Nico, point a) — UN SEUL ABONNEMENT ACTIF PAR COMPTE, TOUS CANAUX CONFONDUS
//     npm run selftest:un-seul-abonnement
// ═══════════════════════════════════════════════════════════════════════════
// « Une montée depuis un autre canal crée un 2e abonnement, donc un double prélèvement. Règle : un seul abonnement actif
// par compte, tous canaux confondus. Une montée qui ne peut pas se faire sur le même canal est empêchée, avec un message
// clair qui dit où faire le changement. »
// Cas RÉELS (prod lue le 13/11, lecture seule : Stripe 45 abonnements non résiliés, stores_notifications_journal, profils) :
//   785352fe — Premium App Store (premium.standard, DID_RENEW 30/10, fin 30/11, renouvellement auto) puis Pro PAR CARTE le
//              10/11 18:03 depuis Réglages › Abonnement (29,99 € payés) : create-checkout-session « laissée passer » ;
//   c7c382b7 — Pro par carte depuis le 31/10, puis Cloud seul App Store le 12/11 18:18 (semaine gratuite → 19/11) ;
//   f0acd3af — Pro App Store (pro2.sub), puis Cloud seul App Store le 09/11 19:27 (semaine gratuite → 16/11).
// Sans réseau ni base : la règle exécutée, la fonction serveur et les appels de l'app relus, l'aide de l'app exécutée
// avec des doubles de supabase.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { ok(false, `module ${p} chargé`, e?.message ?? e); return {}; } };
const sansOrdinateur = (t) => !/ordinateur|computer|chrome/i.test(String(t ?? ''));

const U = await importer('supabase/functions/_shared/un-seul-abonnement.js');
const MAINTENANT = Date.parse('2026-11-13T12:00:00+01:00');
const LE_10_11 = Date.parse('2026-11-10T18:01:00+01:00');
const LE_12_11 = Date.parse('2026-11-12T18:17:00+01:00');
const LE_09_11 = Date.parse('2026-11-09T19:26:00+01:00');

// ── A. LA RÈGLE, SUR LES TROIS CAS RÉELS (l'instant d'AVANT le second achat) ─────────────────────────────────────────
console.log('A. Le second achat des trois comptes réels est empêché, avec « où faire le changement »');
if (U.decisionAchat) {
  // 785352fe le 10/11 à 18:01 : Premium App Store vivant, aucun abonnement Stripe ; demande : Pro par carte.
  const p785 = { apple_original_transaction_id: '170003804256997', is_premium: true, is_pro: false, subscription_period_end: '2026-11-30T17:32:00.000Z' };
  const d785 = U.decisionAchat({ canal: 'stripe', achat: 'palier', vivants: U.abonnementsVivants({ profil: p785, stripe: [], maintenant: LE_10_11 }) });
  const m785 = U.messageUnSeulAbonnement(d785, 'fr');
  ok(d785.permis === false && d785.motif === 'autre_canal' && d785.canal === 'apple', '785352fe : Pro par carte refusé — son Premium passe par l’App Store', JSON.stringify(d785));
  ok(/App Store/.test(m785) && /iPhone/.test(m785) && /Réglages › Abonnement/.test(m785) && /Rien n'a été débité/.test(m785) && /second abonnement/.test(m785) && sansOrdinateur(m785),
    '785352fe : la phrase dit OÙ changer (l’app FillSell sur l’iPhone, Réglages › Abonnement), « rien débité », jamais « ordinateur »', m785);
  const m785en = U.messageUnSeulAbonnement(d785, 'en');
  ok(/App Store/.test(m785en) && /iPhone/.test(m785en) && /Nothing was charged/.test(m785en) && sansOrdinateur(m785en), '785352fe : la même phrase en anglais', m785en);

  // c7c382b7 le 12/11 à 18:17 : Pro par carte (Stripe active) ; demande : Cloud seul sur iPhone.
  const sC7 = [{ id: 'sub_1UWfw4', status: 'active', cloud: false, rang: 2 }];
  const dC7 = U.decisionAchat({ canal: 'apple', achat: 'cloud_seul', vivants: U.abonnementsVivants({ profil: { stripe_customer_id: 'cus_VXlS', is_premium: true, is_pro: true }, stripe: sC7, maintenant: LE_12_11 }) });
  const mC7 = U.messageUnSeulAbonnement(dC7, 'fr');
  ok(dC7.permis === false && dC7.motif === 'autre_canal' && dC7.canal === 'stripe', 'c7c382b7 : Cloud seul App Store refusé — son Pro est payé par carte', JSON.stringify(dC7));
  ok(/payé par carte/.test(mC7) && /fillsell\.app/.test(mC7) && /Réglages › Abonnement/.test(mC7) && sansOrdinateur(mC7), 'c7c382b7 : la phrase envoie sur le web (fillsell.app, Réglages › Abonnement), jamais « ordinateur »', mC7);

  // f0acd3af le 09/11 à 19:26 : Pro App Store ; demande : Cloud seul App Store (autre groupe Apple = second abonnement).
  const pF0 = { apple_original_transaction_id: '700002777923663', is_premium: true, is_pro: true, subscription_period_end: '2026-11-24T15:50:41.000Z' };
  const dF0 = U.decisionAchat({ canal: 'apple', achat: 'cloud_seul', vivants: U.abonnementsVivants({ profil: pF0, maintenant: LE_09_11 }) });
  const mF0 = U.messageUnSeulAbonnement(dF0, 'fr');
  ok(dF0.permis === false && dF0.motif === 'formule_en_cours', 'f0acd3af : Cloud seul App Store refusé à un abonné Pro App Store (deux groupes Apple)', JSON.stringify(dF0));
  ok(/version avec Cloud/.test(mF0) && /Réglages › Abonnement/.test(mF0) && /sans second abonnement/.test(mF0) && sansOrdinateur(mF0), 'f0acd3af : la phrase dit de prendre sa formule avec Cloud (le même abonnement change)', mF0);

  // Aujourd'hui : les trois comptes ont DEUX abonnements vivants → rien de plus, le support.
  const auj = [
    ['785352fe', { ...p785, is_pro: true, stripe_customer_id: 'cus_VYUU' }, [{ id: 'sub_1UaISD', status: 'active', cloud: false, rang: 2 }]],
    ['c7c382b7', { stripe_customer_id: 'cus_VXlS', is_premium: true, is_pro: true, cloud_canal: 'apple', cloud_ref: '290003396083912', cloud_essai_debut: '2026-11-12T17:18:50Z', cloud_essai_fin: '2026-11-19T17:18:50Z' }, sC7],
    ['f0acd3af', { ...pF0, cloud_canal: 'apple', cloud_ref: '700002894618518', cloud_essai_debut: '2026-11-09T18:27:44Z', cloud_essai_fin: '2026-11-16T18:27:44Z' }, []],
  ];
  for (const [id8, profil, stripe] of auj) {
    const v = U.abonnementsVivants({ profil, stripe, maintenant: MAINTENANT });
    const d = U.decisionAchat({ canal: 'stripe', achat: 'formule', vivants: v });
    ok(v.length === 2 && d.motif === 'deux_abonnements', `${id8} : deux abonnements vivants aujourd’hui (${v.map((x) => `${x.canal}/${x.type}`).join(' + ')}) → tout achat de plus refusé`, JSON.stringify(v));
  }
  ok(typeof U.lignesDeuxAbonnements === 'function' && U.lignesDeuxAbonnements(U.abonnementsVivants({ profil: auj[1][1], stripe: sC7, maintenant: MAINTENANT })).length === 2, 'l’alerte « deux abonnements » a ses lignes (une par abonnement)');

  // ── B. Zéro régression : ce qui passait sur le même canal passe encore ───────────────────────────────────────────
  console.log('\nB. Le même canal : montée, descente et ajout du Cloud passent par le MÊME abonnement');
  const cas = [
    ['nouveau compte, web', { canal: 'stripe', achat: 'palier', vivants: [] }, true],
    ['compte offert (is_comped) : aucun abonnement', { canal: 'apple', achat: 'formule', vivants: U.abonnementsVivants({ profil: { is_comped: true }, maintenant: MAINTENANT }) }, true],
    ['Premium Stripe → Pro par carte (même abonnement, prix changé)', { canal: 'stripe', achat: 'palier', vivants: U.vivantsStripe([{ status: 'active', cloud: false, rang: 1 }]) }, true],
    ['Premium Stripe → Pro + Cloud (même abonnement)', { canal: 'stripe', achat: 'formule', vivants: U.vivantsStripe([{ status: 'active', cloud: false, rang: 1 }]) }, true],
    ['Cloud seul Stripe → Pro + Cloud (l’abonnement Cloud change de prix)', { canal: 'stripe', achat: 'formule', vivants: U.vivantsStripe([{ status: 'trialing', cloud: true }]) }, true],
    ['Premium App Store → Pro App Store (même groupe)', { canal: 'apple', achat: 'palier', vivants: U.abonnementsVivants({ profil: { ...p785 }, maintenant: MAINTENANT }) }, true],
    ['Premium Google Play → Pro + Cloud Google Play (remplacement)', { canal: 'google', achat: 'formule', vivants: U.abonnementsVivants({ profil: { google_purchase_token: 'x', google_product_id: 'app.fillsell.premium.standard', is_premium: true, subscription_period_end: '2026-12-06T14:43:03Z' }, googleActif: true, maintenant: MAINTENANT }) }, true],
    ['abonnement App Store fini (fin passée) : plus rien de vivant', { canal: 'stripe', achat: 'palier', vivants: U.abonnementsVivants({ profil: { apple_original_transaction_id: 'x', is_premium: false, subscription_period_end: '2026-10-01T00:00:00Z' }, maintenant: MAINTENANT }) }, true],
    ['Google relu « pas actif » : plus rien de vivant', { canal: 'stripe', achat: 'palier', vivants: U.abonnementsVivants({ profil: { google_purchase_token: 'x', google_product_id: 'app.fillsell.premium.standard', is_premium: true, subscription_period_end: '2026-11-26T09:53:00Z' }, googleActif: false, maintenant: MAINTENANT }) }, true],
    ['Cloud seul Stripe → forfait classique par carte (second abonnement Stripe)', { canal: 'stripe', achat: 'palier', vivants: U.vivantsStripe([{ status: 'active', cloud: true }]) }, false],
    ['forfait Stripe en impayé → nouvel achat (deux prélèvements à la carte mise à jour)', { canal: 'stripe', achat: 'palier', vivants: U.vivantsStripe([{ status: 'past_due', cloud: false, rang: 1 }]) }, false],
    ['Cloud seul Google Play → Premium Google Play (deux produits Google)', { canal: 'google', achat: 'palier', vivants: U.abonnementsVivants({ profil: { cloud_canal: 'google', is_cloud: true }, maintenant: MAINTENANT }) }, false],
  ];
  for (const [nom, e, attendu] of cas) {
    const d = U.decisionAchat(e);
    ok(d.permis === attendu, `${nom} → ${attendu ? 'permis' : 'refusé'}`, JSON.stringify(d));
    if (!d.permis) ok(sansOrdinateur(U.messageUnSeulAbonnement(d, 'fr')) && sansOrdinateur(U.messageUnSeulAbonnement(d, 'en')) && /Rien n'a été débité/.test(U.messageUnSeulAbonnement(d, 'fr')), `${nom} : la phrase (fr / en) sans « ordinateur »`, U.messageUnSeulAbonnement(d, 'fr'));
  }
}

// ── C. LE SERVEUR : le web refuse, la garde des boutiques existe ─────────────────────────────────────────────────────
console.log('\nC. create-checkout-session et garde-abonnement');
const ccs = lire('supabase/functions/create-checkout-session/index.ts');
ok(!/laissée passer/.test(ccs), 'create-checkout-session ne laisse plus passer une montée web au-dessus d’un abonnement de boutique (785352fe)');
ok(/decisionAchat\(\{ canal: "stripe", achat: "palier"/.test(ccs), 'forfait classique web : la règle « un seul abonnement » est appliquée (boutiques, Cloud seul, impayé)');
ok(/decisionAchat\(\{ canal: "stripe", achat: "cloud_seul"/.test(ccs), 'Cloud seul web : refusé à côté d’une formule (Stripe ou boutique)');
ok(/error: "un_seul_abonnement"/.test(ccs) && /messageUnSeulAbonnement\(d, "fr"\)/.test(ccs) && /messageUnSeulAbonnement\(d, "en"\)/.test(ccs), 'refus 409 « un_seul_abonnement » + la phrase fr / en (l’app l’affiche telle quelle)');
const garde = lire('supabase/functions/garde-abonnement/index.ts');
ok(/decisionAchat\(\{ canal, achat, vivants \}\)/.test(garde), 'garde-abonnement : la même règle, sur Stripe et Google relus');
ok(garde && !/\.(update|insert|upsert|delete)\(/.test(garde) && !/method:\s*"POST"/.test(garde) && !/stripe\.(subscriptions|customers)\.(create|update|cancel|del)/.test(garde), 'garde-abonnement : LECTURE SEULE (aucune écriture en base, aucun appel Stripe autre que GET)');
ok(/\[functions\.garde-abonnement\]\nverify_jwt = true/.test(lire('supabase/config.toml')), 'garde-abonnement : verify_jwt = true (appelée par l’app avec la session)');

// ── D. L'APP : la garde AVANT la feuille de la boutique ──────────────────────────────────────────────────────────────
console.log('\nD. L’app iPhone / Android demande AVANT d’ouvrir la feuille de la boutique');
const app = lire('src/App.jsx');
const iap = app.slice(app.indexOf('async function handleIAPPurchase'), app.indexOf('async function handleIAPRestore'));
const iG = iap.indexOf('gardeAchatBoutique('), iP = iap.indexOf('await purchasePremium(');
ok(iG > 0 && iP > iG && /achat:'palier'/.test(iap), 'forfait (Premium, Pro, Business) iPhone / Android : garde avant purchasePremium');
const ac = lire('src/cloud/achatCloud.js');
const acAch = ac.slice(ac.indexOf('async function acheter('));
ok(/gardeAchatBoutique\(\{[^}]*achat: 'cloud_seul'/.test(acAch) && acAch.indexOf('gardeAchatBoutique(') < acAch.indexOf('demanderConditions()'), 'Cloud seul iPhone / Android : garde avant les conditions et la feuille (c7c382b7, f0acd3af)');
ok(/d\?\.error === 'un_seul_abonnement'/.test(ac), 'Cloud seul web : le refus du serveur est dit (sa phrase), jamais « échec »');
const af = lire('src/cloud/achatFormuleCloud.js');
ok(/gardeAchatBoutique\(\{[^}]*achat: 'formule'/.test(af), 'formule avec Cloud iPhone / Android : garde avant la feuille');
ok(/un_seul_abonnement/.test(af), 'formule avec Cloud web : le refus du serveur est lu');

const G = await importer('src/lib/gardeAchat.js');
if (G.gardeAchatBoutique) {
  const profilDe = (data) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  // Serveur qui refuse (c7c382b7) : sa phrase, rien d'autre.
  const sb1 = { functions: { invoke: async () => ({ data: { permis: false, motif: 'autre_canal', canal: 'stripe', message_fr: 'PHRASE DU SERVEUR' }, error: null }) }, from: () => profilDe({}) };
  const g1 = await G.gardeAchatBoutique({ supabase: sb1, userId: 'c7c382b7', canal: 'apple', achat: 'cloud_seul' });
  ok(g1.permis === false && g1.message === 'PHRASE DU SERVEUR' && g1.source === 'serveur', 'serveur qui refuse : refusé, avec la phrase du serveur', JSON.stringify(g1));
  // Serveur absent (fonction pas encore déployée) : la preuve locale — c7c382b7 (client Stripe, Pro payé, aucune boutique).
  const sb2 = { functions: { invoke: async () => ({ data: null, error: { message: 'Function not found' } }) }, from: () => profilDe({ stripe_customer_id: 'cus_VXlS', is_premium: true, is_pro: true }) };
  const g2 = await G.gardeAchatBoutique({ supabase: sb2, userId: 'c7c382b7', canal: 'apple', achat: 'cloud_seul' });
  ok(g2.permis === false && g2.source === 'local' && /payé par carte/.test(g2.message ?? ''), 'serveur absent : la preuve locale refuse quand même (client Stripe payé)', JSON.stringify(g2));
  // f0acd3af en local : Pro App Store vivant.
  const sb3 = { functions: { invoke: async () => { throw new Error('réseau'); } }, from: () => profilDe({ apple_original_transaction_id: '700002777923663', is_premium: true, is_pro: true, subscription_period_end: '2099-01-01T00:00:00Z' }) };
  const g3 = await G.gardeAchatBoutique({ supabase: sb3, userId: 'f0acd3af', canal: 'apple', achat: 'cloud_seul' });
  ok(g3.permis === false && g3.motif === 'formule_en_cours', 'réseau coupé : f0acd3af (Pro App Store) ne prend pas un second abonnement Cloud', JSON.stringify(g3));
  // Rien de lisible : l'achat passe (l'alerte des webhooks prend le relais) — jamais bloquer sur un doute réseau.
  const sb4 = { functions: { invoke: async () => { throw new Error('réseau'); } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }) };
  const g4 = await G.gardeAchatBoutique({ supabase: sb4, userId: 'x', canal: 'google', achat: 'palier' });
  ok(g4.permis === true && g4.source === 'inconnu', 'rien de lisible : l’achat passe (source « inconnu »), l’alerte serveur veille', JSON.stringify(g4));
  // Serveur muet trop longtemps : le délai s'applique.
  const sb5 = { functions: { invoke: () => new Promise(() => {}) }, from: () => profilDe({}) };
  const t0 = Date.now();
  const g5 = await G.gardeAchatBoutique({ supabase: sb5, userId: 'x', canal: 'apple', achat: 'palier', delaiMs: 50 });
  ok(g5.permis === true && g5.source === 'local' && Date.now() - t0 < 2000, 'serveur qui ne répond pas : délai borné, puis la preuve locale', JSON.stringify(g5));
}

// ── E. LE FILET : un second abonnement qui passerait quand même est signalé à support@ (aucune annulation) ───────────
console.log('\nE. L’alerte « deux abonnements » (support@, aucun mail client, aucune annulation)');
const pn = lire('supabase/functions/_shared/payment-notify.ts');
ok(/export async function signalerDeuxAbonnements/.test(pn), 'payment-notify : signalerDeuxAbonnements');
ok(/body\?\.deux_abonnements/.test(lire('supabase/functions/email-tunnel/index.ts')), 'email-tunnel : l’alerte « deux abonnements » part à support@');
for (const f of ['apple-iap-webhook', 'google-play-webhook', 'stripe-webhook', 'validate-google-purchase']) {
  const s = lire(`supabase/functions/${f}/index.ts`);
  ok(/verifierDeuxAbonnements\(/.test(s), `${f} : vérifie « deux abonnements » à l’ouverture d’un abonnement`);
}
const da = lire('supabase/functions/_shared/deux-abonnements.ts');
ok(da && !/\.(update|insert|upsert|delete)\(/.test(da) && !/cancel|refund/i.test(da.replace(/\/\/.*$/gm, '')), 'le filet ne fait que LIRE et prévenir : aucune annulation, aucun remboursement, rien écrit');

console.log(`\n${rouges === 0 ? '✓' : '✗'} un-seul-abonnement : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
