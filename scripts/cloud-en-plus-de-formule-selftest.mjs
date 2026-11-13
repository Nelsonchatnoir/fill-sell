// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (dernière réponse de Nico, point d) — LE CLOUD AJOUTÉ À UNE FORMULE N'EST JAMAIS REFUSÉ
//     npm run selftest:cloud-en-plus-de-formule
// ═══════════════════════════════════════════════════════════════════════════
// « Une formule (Premium, Pro ou Business) + le Cloud, c'est NORMAL et c'est ce qu'on veut vendre : par le pack (Premium +
// Cloud, Pro + Cloud, Business + Cloud) ou par le Cloud seul en complément, sur n'importe quel canal. f0acd3af et c7c382b7
// sont des clients normaux. Le seul vrai double, ce sont DEUX FORMULES en même temps (785352fe : Premium App Store + Pro
// Stripe). […] d) Verrou : un selftest casse si la garde bloque un jour l'ajout du Cloud à une formule. »
// Ce verrou CASSE si, pour une formule Premium, Pro ou Business payée par Stripe, Apple ou Google :
//   · decisionAchat (supabase/functions/_shared/un-seul-abonnement.js, la règle unique du serveur et de l'app) refuse le
//     pack sur le canal de la formule, ou le Cloud seul sur N'IMPORTE quel canal ;
//   · la garde de l'app (src/lib/gardeAchat.js : réponse du serveur, ou preuve locale) le refuse ;
//   · garde-abonnement (iPhone / Android) ou create-checkout-session (web) appliquent une autre règle, oublient la colonne
//     cloud_formule (le Cloud d'un pack de boutique compté comme un Cloud seul), ou refusent le Cloud seul web à un abonné
//     (« offre_remplacee », cloudSeulRefuse) ;
//   · Réglages › Abonnement cache l'offre du Cloud seul à un abonné payant sans Cloud ;
//   · f0acd3af / c7c382b7 (formule + Cloud seul) sont refusés, alertés, ou ne peuvent plus monter / descendre leur formule.
// Sans réseau ni base : le vrai code exécuté (règle, garde de l'app avec des doubles de supabase), les fonctions serveur relues.
// VERROU_RACINE=<dossier> rejoue ce verrou sur une autre copie (preuve « rouge avant » sur 5c20c40).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = process.env.VERROU_RACINE || join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { ok(false, `module ${p} chargé`, e?.message ?? e); return {}; } };

const U = await importer('supabase/functions/_shared/un-seul-abonnement.js');
const MAINTENANT = Date.parse('2026-11-13T17:00:00+01:00');
const FIN = '2026-12-10T17:00:00.000Z';
const FORMULES = [['Premium', 1, 'app.fillsell.premium.standard'], ['Pro', 2, 'app.fillsell.pro.sub'], ['Business', 3, 'app.fillsell.business.sub']];
const CANAUX = ['stripe', 'apple', 'google'];
const drapeaux = (rang) => ({ is_premium: true, is_pro: rang >= 2, is_business: rang === 3 });
/** Le compte d'un abonné à la formule `rang`, payée sur `canal`, SANS Cloud (ce que le serveur lit). */
function abonne(canal, rang, produitGoogle) {
  if (canal === 'stripe') return { profil: { stripe_customer_id: 'cus_x', ...drapeaux(rang) }, stripe: [{ id: 'sub_formule', status: 'active', cloud: false, rang, palier: rang === 3 ? 'business' : rang === 2 ? 'pro' : 'standard' }], googleActif: null };
  if (canal === 'apple') return { profil: { apple_original_transaction_id: '700000000000001', ...drapeaux(rang), subscription_period_end: FIN }, stripe: [], googleActif: null };
  return { profil: { google_purchase_token: 'jeton', google_product_id: produitGoogle, ...drapeaux(rang), subscription_period_end: FIN }, stripe: [], googleActif: true };
}
/** Le même compte, une fois le Cloud SEUL pris sur `canalCloud` (essai en cours, ou payé). */
function avecCloudSeul(compte, canalCloud) {
  if (canalCloud === 'stripe') return { ...compte, profil: { ...compte.profil, stripe_customer_id: 'cus_x', cloud_canal: 'stripe' }, stripe: [...compte.stripe, { id: 'sub_cloud', status: 'trialing', cloud: true }] };
  return { ...compte, profil: { ...compte.profil, cloud_canal: canalCloud, cloud_ref: 'ref', cloud_essai_debut: '2026-11-13T10:00:00Z', cloud_essai_fin: '2026-11-20T10:00:00Z', is_cloud: false } };
}
const vivantsDe = (c) => U.abonnementsVivants?.({ profil: c.profil, stripe: c.stripe, googleActif: c.googleActif, maintenant: MAINTENANT }) ?? [];

// ── A. LA RÈGLE : chaque formule × chaque canal × chaque voie du Cloud → PERMIS ──────────────────────────────────────
console.log('A. decisionAchat : le Cloud ajouté à une formule (pack sur son canal, Cloud seul sur tout canal) est permis');
if (U.decisionAchat) {
  for (const [nom, rang, pg] of FORMULES) {
    for (const canal of CANAUX) {
      const c = abonne(canal, rang, pg);
      const v = vivantsDe(c);
      const dPack = U.decisionAchat({ canal, achat: 'formule', vivants: v });
      ok(dPack.permis === true, `${nom} ${canal} → ${nom} + Cloud sur ${canal} (le même abonnement change) : permis`, JSON.stringify(dPack));
      for (const canalCloud of CANAUX) {
        const d = U.decisionAchat({ canal: canalCloud, achat: 'cloud_seul', vivants: v });
        ok(d.permis === true, `${nom} ${canal} → Cloud seul sur ${canalCloud}${canalCloud === canal ? ' (même canal)' : ' (autre canal)'} : permis`, JSON.stringify(d));
        // Après : la formule monte / descend encore sur SON canal, et le filet ne voit AUCUN double.
        const apres = vivantsDe(avecCloudSeul(c, canalCloud));
        const dMontee = U.decisionAchat({ canal, achat: 'palier', vivants: apres });
        ok(dMontee.permis === true, `${nom} ${canal} + Cloud seul ${canalCloud} : changer de formule sur ${canal} reste permis`, JSON.stringify(dMontee));
        const compte = U.compterFormules?.(apres);
        ok(compte && compte.double === false && compte.formules.length === 1, `${nom} ${canal} + Cloud seul ${canalCloud} : une formule, un Cloud — aucune alerte « deux abonnements »`, JSON.stringify(compte ?? apres));
      }
    }
  }
}

// ── B. LES DEUX COMPTES RÉELS (prod lue le 13/11, lecture seule) : clients normaux ──────────────────────────────────
console.log('\nB. c7c382b7 et f0acd3af : formule + Cloud seul, jamais refusés, jamais alertés');
if (U.decisionAchat) {
  // c7c382b7 : Pro par carte (sub_1UWfw4, depuis le 31/10) + Cloud seul App Store (essai jusqu'au 19/11 18:18).
  const c7 = { profil: { stripe_customer_id: 'cus_VXlS', is_premium: true, is_pro: true, cloud_canal: 'apple', cloud_ref: '290003396083912', cloud_essai_debut: '2026-11-12T17:18:50Z', cloud_essai_fin: '2026-11-19T17:18:50Z' }, stripe: [{ id: 'sub_1UWfw4', status: 'active', cloud: false, rang: 2 }] };
  // f0acd3af : Pro App Store (pro2.sub, fin 24/11) + Cloud seul App Store (essai jusqu'au 16/11 19:27).
  const f0 = { profil: { apple_original_transaction_id: '700002777923663', is_premium: true, is_pro: true, subscription_period_end: '2026-11-24T15:50:41.000Z', cloud_canal: 'apple', cloud_ref: '700002894618518', cloud_essai_debut: '2026-11-09T18:27:44Z', cloud_essai_fin: '2026-11-16T18:27:44Z' }, stripe: [] };
  for (const [id8, c, canal] of [['c7c382b7', c7, 'stripe'], ['f0acd3af', f0, 'apple']]) {
    const v = vivantsDe(c);
    ok(U.compterFormules?.(v)?.double === false, `${id8} : aucune alerte « deux abonnements » (une formule + un Cloud seul)`, JSON.stringify(v));
    ok(U.decisionAchat({ canal, achat: 'palier', vivants: v }).permis === true, `${id8} : monter / descendre sa formule (Pro → Business, Pro → Premium) sur ${canal} : permis`, JSON.stringify(U.decisionAchat({ canal, achat: 'palier', vivants: v })));
    // Reconstitué à l'instant d'AVANT leur Cloud seul (12/11 18:17 et 09/11 19:26) : l'achat qu'ils ont fait est permis.
    const avant = vivantsDe({ ...c, profil: { ...c.profil, cloud_canal: null, cloud_ref: null, cloud_essai_debut: null, cloud_essai_fin: null } });
    ok(U.decisionAchat({ canal: 'apple', achat: 'cloud_seul', vivants: avant }).permis === true, `${id8} : le Cloud seul App Store qu'il a pris est permis`);
  }
  // 785352fe reste le seul vrai double : Premium App Store + Pro par carte.
  const p785 = { profil: { apple_original_transaction_id: '170003804256997', is_premium: true, is_pro: true, subscription_period_end: '2026-11-30T17:32:00.000Z', stripe_customer_id: 'cus_VYUU' }, stripe: [{ id: 'sub_1UaISD', status: 'active', cloud: false, rang: 2 }] };
  ok(U.compterFormules?.(vivantsDe(p785))?.double === true, '785352fe : DEUX formules (Premium App Store + Pro par carte) — le seul vrai double, toujours vu');
}

// ── C. LA GARDE DE L'APP (iPhone / Android) : jamais un refus pour un ajout du Cloud ────────────────────────────────
console.log('\nC. src/lib/gardeAchat.js : réponse du serveur ou preuve locale, le Cloud ajouté passe');
const G = await importer('src/lib/gardeAchat.js');
if (G.gardeAchatBoutique && U.decisionAchat) {
  const profilDe = (data) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  for (const [nom, rang, pg] of FORMULES) {
    for (const canal of CANAUX) {
      const c = abonne(canal, rang, pg);
      for (const canalApp of ['apple', 'google']) {
        for (const achat of canalApp === canal ? ['formule', 'cloud_seul'] : ['cloud_seul']) {
          // 1. Le serveur répond (garde-abonnement exécute decisionAchat sur ses lectures) : on rejoue sa réponse.
          const reponse = { ...U.decisionAchat({ canal: canalApp, achat, vivants: vivantsDe(c) }) };
          const sb = { functions: { invoke: async () => ({ data: reponse, error: null }) }, from: () => profilDe(c.profil) };
          const g = await G.gardeAchatBoutique({ supabase: sb, userId: 'x', canal: canalApp, achat });
          ok(g.permis === true, `garde app (serveur) : ${nom} ${canal} → ${achat === 'formule' ? `${nom} + Cloud` : 'Cloud seul'} sur ${canalApp} : permis`, JSON.stringify(g));
          // 2. Serveur muet : la preuve locale (le profil).
          const sbL = { functions: { invoke: async () => { throw new Error('réseau'); } }, from: () => profilDe(c.profil) };
          const gL = await G.gardeAchatBoutique({ supabase: sbL, userId: 'x', canal: canalApp, achat });
          ok(gL.permis === true, `garde app (preuve locale) : ${nom} ${canal} → ${achat === 'formule' ? `${nom} + Cloud` : 'Cloud seul'} sur ${canalApp} : permis`, JSON.stringify(gL));
        }
      }
    }
  }
}

// ── D. LES SERVEURS : la même règle, la colonne du pack lue, plus de « offre_remplacee » pour un abonné ──────────────
console.log('\nD. garde-abonnement et create-checkout-session');
const garde = lire('supabase/functions/garde-abonnement/index.ts');
const colonnesGarde = (/const COLONNES = ([^;]+);/.exec(garde)?.[1] ?? '');
ok(/cloud_formule/.test(colonnesGarde), 'garde-abonnement lit profiles.cloud_formule (sinon le Cloud d\'un pack App Store / Google Play compte pour un 2e abonnement : cdf7007c, Pro + Cloud App Store)', colonnesGarde);
ok(/decisionSurLectures\(\{ canal, achat, profil: p, stripe: stripeLus, googleActif \}\)/.test(garde), 'garde-abonnement décide par decisionSurLectures (la règle exécutée ici), rien d\'autre');
const ccs = lire('supabase/functions/create-checkout-session/index.ts');
ok(/decisionSurLectures\(\{ canal: "stripe", achat: "cloud_seul"/.test(ccs), 'create-checkout-session (Cloud seul web) décide par decisionSurLectures');
ok(/cloudSeulRefuse\(\{[^}]*formuleVivante/.test(ccs), 'create-checkout-session : le Cloud seul web n\'est plus « remplacé par les formules » pour un abonné (formuleVivante passée)');
const FS = await importer('supabase/functions/_shared/formules-serveur.js');
if (FS.cloudSeulRefuse) {
  ok(FS.cloudSeulRefuse({ profil: {}, formulesOuvertes: true, formuleVivante: true }) === false, 'cloudSeulRefuse : un abonné (formule vivante, tout canal) qui n\'a jamais eu le Cloud peut prendre le Cloud seul');
  ok(FS.cloudSeulRefuse({ profil: {}, formulesOuvertes: true, formuleVivante: false }) === true, 'cloudSeulRefuse : un compte SANS formule reste orienté vers les formules avec Cloud (11/11, inchangé)');
}
if (U.decisionSurLectures) {
  for (const [nom, rang, pg] of FORMULES) {
    for (const canal of CANAUX) {
      const c = abonne(canal, rang, pg);
      const d = U.decisionSurLectures({ canal: 'stripe', achat: 'cloud_seul', profil: c.profil, stripe: c.stripe, googleActif: c.googleActif, maintenant: MAINTENANT });
      ok(d.permis === true, `web : ${nom} ${canal} → Cloud seul par carte : permis (create-checkout-session)`, JSON.stringify(d));
    }
  }
  // Le pack de boutique : son Cloud n'est PAS un Cloud seul (cdf7007c : Pro + Cloud App Store) — monter / descendre passe.
  const pack = { apple_original_transaction_id: '700000000000002', is_premium: true, is_pro: true, subscription_period_end: FIN, cloud_canal: 'apple', cloud_formule: 'pro_cloud', is_cloud: true, cloud_ref: '700000000000002' };
  const dPack = U.decisionSurLectures({ canal: 'apple', achat: 'formule', profil: pack, maintenant: MAINTENANT });
  ok(dPack.permis === true && dPack.vivants.length === 1, 'Pro + Cloud App Store → Business + Cloud App Store : permis, UN abonnement vu (le Cloud du pack n\'est pas un Cloud seul)', JSON.stringify(dPack));
}

// ── E. L'ÉCRAN : Réglages › Abonnement propose le Cloud seul à un abonné payant sans Cloud ──────────────────────────
console.log('\nE. Réglages › Abonnement : le bloc du Cloud seul se montre à un abonné payant sans Cloud');
const FC = await importer('src/cloud/formulesCloud.js');
ok(typeof FC.blocCloudSeulCache === 'function', 'formulesCloud.js : la règle du bloc Cloud seul est une fonction pure (blocCloudSeulCache)');
if (FC.blocCloudSeulCache) {
  for (const canal of CANAUX) {
    ok(FC.blocCloudSeulCache({ formulesVisibles: true, formuleActuelle: null, cloudSeulEnCours: false, canalAbonnement: canal }) === false, `abonné ${canal} sans Cloud, formules ouvertes : le Cloud seul se propose (en plus de sa formule)`);
    ok(FC.blocCloudSeulCache({ formulesVisibles: true, formuleActuelle: 'pro_cloud', cloudSeulEnCours: false, canalAbonnement: canal }) === true, `abonné ${canal} à une formule avec Cloud : pas de Cloud seul (il l'a déjà)`);
  }
  ok(FC.blocCloudSeulCache({ formulesVisibles: true, formuleActuelle: null, cloudSeulEnCours: false, canalAbonnement: null }) === true, 'compte sans formule payante, formules ouvertes : les formules avec Cloud seulement (11/11, inchangé)');
  ok(FC.blocCloudSeulCache({ formulesVisibles: true, formuleActuelle: null, cloudSeulEnCours: true, canalAbonnement: null }) === false, 'client du Cloud seul : son bloc reste (inchangé)');
}
const spa = lire('src/reglages/SousPageAbonnement.jsx');
ok(/blocCloudSeulCache\(\{/.test(spa), 'SousPageAbonnement : cacherBlocCloud vient de blocCloudSeulCache');

console.log(`\n${rouges === 0 ? '✓' : '✗'} cloud-en-plus-de-formule : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
