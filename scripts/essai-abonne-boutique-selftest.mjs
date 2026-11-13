// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (3e réponse de Nico, point f) — L'ESSAI DU CLOUD DES ABONNÉS APP STORE / GOOGLE PLAY : PRÊT, INACTIF
//     npm run selftest:essai-abonne-boutique
// ═══════════════════════════════════════════════════════════════════════════
// « Essai pour les abonnés App Store / Google Play : prépare-le pour le prochain binaire, sans rien soumettre sans mon
// accord. » Aujourd'hui (audit du 13/11, § 3) : un abonné de la boutique n'a jamais l'offre d'introduction (Apple :
// « Existing subscribers are not eligible … upgrading » ; Google : offres « nouveaux clients ») — le web, lui, offre 7 jours
// de Cloud à l'abonné Premium / Pro (décision 6). Préparé : la signature Apple des offres promotionnelles (ECDSA P-256 /
// SHA-256, charge séparée par U+2063, signature DER en base64 — developer.apple.com, « Generating a signature for
// promotional offers »), l'éligibilité (règle du web), l'appel de l'app derrière une version native minimale (null).
// Cas RÉELS (prod lue le 13/11) : 229c7b07 (Business App Store : jamais d'essai, Business + Cloud n'en a pas),
// af37fa49 / eacbe32c (Pro App Store, jamais eu le Cloud : éligibles à Pro + Cloud), f0acd3af (Pro App Store, semaine du
// Cloud seul déjà prise le 09/11 : plus d'essai), 785352fe (deux abonnements : rien).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { webcrypto, createPublicKey, verify } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { ok(false, `module ${p} chargé`, e?.message ?? e); return {}; } };

const O = await importer('supabase/functions/_shared/offre-essai-abonne.js');
console.log('A. La signature Apple d’une offre promotionnelle (la règle d’Apple, vérifiée avec une clé jetable)');
if (O.signerOffrePromoApple) {
  const { privateKey, publicKey } = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const champs = { keyId: 'ABC123DEFG', productId: 'app.fillsell.pro.cloud', offerId: 'essai-abonne-7j', appAccountToken: 'AF37FA49-0000-4000-8000-000000000000', nonce: 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF', timestamp: 1794571200000 };
  const charge = O.chargeOffrePromoApple(champs);
  const attendue = ['app.fillsell.app', 'ABC123DEFG', 'app.fillsell.pro.cloud', 'essai-abonne-7j', 'af37fa49-0000-4000-8000-000000000000', 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff', '1794571200000'].join('⁣');
  ok(charge === attendue, 'la charge : bundle ␣ clé ␣ produit ␣ offre ␣ appAccountToken ␣ nonce ␣ horodatage (U+2063, minuscules, ms)', JSON.stringify(charge));
  const s = await O.signerOffrePromoApple({ cle: privateKey, ...champs, subtle: webcrypto.subtle });
  const der = Buffer.from(s.signature, 'base64');
  ok(der[0] === 0x30 && der[2] === 0x02, 'la signature est en DER (SEQUENCE de deux INTEGER), comme Apple l’attend');
  const pub = createPublicKey({ key: Buffer.from(await webcrypto.subtle.exportKey('spki', publicKey)), format: 'der', type: 'spki' });
  ok(verify('sha256', Buffer.from(attendue, 'utf8'), { key: pub, dsaEncoding: 'der' }, der) === true, 'la signature DER se vérifie (ECDSA P-256 / SHA-256) sur la charge exacte');
  ok(s.offerIdentifier === 'essai-abonne-7j' && s.keyIdentifier === 'ABC123DEFG' && s.nonce === champs.nonce.toLowerCase() && s.timestamp === champs.timestamp, 'ce que rend la fonction = les paramètres de promotionalOffer(offerID:keyID:nonce:signature:timestamp:)');
  let leve = false; try { O.chargeOffrePromoApple({ ...champs, offerId: '' }); } catch { leve = true; }
  ok(leve, 'un champ manquant lève (jamais une signature d’une charge incomplète)');
}

console.log('\nB. L’éligibilité (la règle du web, décision 6) sur les cas réels');
if (O.essaiAbonneBoutiquePermis) {
  const pro = [{ canal: 'apple', type: 'palier', rang: 2 }];
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'pro_cloud', vivants: pro, essaiPermis: true }).permis === true, 'af37fa49 / eacbe32c (Pro App Store, jamais eu le Cloud) → Pro + Cloud avec 7 jours d’essai');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'pro_cloud', vivants: pro, essaiPermis: false }).raison === 'essai_deja_pris', 'f0acd3af (semaine du Cloud déjà prise) → pas d’essai');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'business_cloud', vivants: [{ canal: 'apple', type: 'palier', rang: 3 }], essaiPermis: true }).permis === false, '229c7b07 (Business) → jamais : Business + Cloud n’a pas d’essai');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'pro_cloud', vivants: [{ canal: 'apple', type: 'palier', rang: 2 }, { canal: 'stripe', type: 'palier', rang: 2 }], essaiPermis: true }).raison === 'deux_abonnements', '785352fe (deux abonnements) → rien');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'pro_cloud', vivants: [{ canal: 'stripe', type: 'palier', rang: 2 }], essaiPermis: true }).raison === 'autre_canal', 'abonné par carte → le web (son essai d’abonné), jamais la boutique');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'google', formule: 'premium_cloud', vivants: [{ canal: 'google', type: 'palier', rang: 1 }], essaiPermis: true }).offre === 'essai-abonne-7j', 'Premium Google Play → l’offre « déterminée par le développeur » de Premium + Cloud');
  ok(O.essaiAbonneBoutiquePermis({ canal: 'apple', formule: 'pro_cloud', vivants: [], essaiPermis: true }).raison === 'pas_abonne', 'pas abonné → l’offre d’introduction d’Apple, pas celle-ci');
}

console.log('\nC. INACTIF : rien ne s’appelle, rien n’est passé à la feuille, rien n’est soumis');
const E = await importer('src/lib/essaiAbonneBoutique.js');
ok(E.ESSAI_ABONNE_BINAIRE_MIN?.ios === null && E.ESSAI_ABONNE_BINAIRE_MIN?.android === null, 'version native minimale : null sur iOS et Android (aucun binaire ne l’a)');
ok(E.essaiAbonneBoutiqueOuvert?.({ platform: 'ios', binaire: '9.9.999' }) === false && E.essaiAbonneBoutiqueOuvert?.({ platform: 'android', binaire: '9.9.999' }) === false, 'fermé quel que soit le binaire');
if (E.offreEssaiAbonne) {
  let appels = 0;
  const r = await E.offreEssaiAbonne({ supabase: { functions: { invoke: async () => { appels++; return { data: { permis: true, promotionalOffer: { signature: 'x' } } }; } } }, platform: 'ios', binaire: '2.9.999', formule: 'pro_cloud' });
  ok(r === null && appels === 0, 'fermé : aucun appel au serveur, aucune offre');
}
const fn = lire('supabase/functions/signer-offre-boutique/index.ts');
ok(/if \(Deno\.env\.get\("ESSAI_ABONNES_BOUTIQUE"\) !== "1"\) return json\(\{ error: "ferme" \}, 409\)/.test(fn) && fn.indexOf('ESSAI_ABONNES_BOUTIQUE') < fn.indexOf('createClient('), 'serveur : fermé par défaut, AVANT toute lecture (profil, Stripe, clé)');
ok(fn && !/\.(update|insert|upsert|delete)\(/.test(fn), 'serveur : rien n’est écrit (les droits viennent des webhooks à la transaction réelle)');
ok(/\[functions\.signer-offre-boutique\]\nverify_jwt = true/.test(lire('supabase/config.toml')), 'serveur : verify_jwt = true (appelée par l’app avec la session)');
const af = lire('src/cloud/achatFormuleCloud.js');
ok(/abonneBoutique && !descente \? await offreEssaiAbonne\(/.test(af) && /\.\.\.\(offreEssai \? \{ offreEssai \} : \{\}\)/.test(af), 'app : l’offre n’est demandée que pour un abonné de la boutique, et ne change rien à la feuille quand elle est nulle');
const iap = lire('src/lib/iap.js');
ok(/offreEssai\?\.apple && Capacitor\.getPlatform\(\) === 'ios'\) purchaseOptions\.promotionalOffer/.test(iap) && /offreEssai\?\.google && Capacitor\.getPlatform\(\) === 'android'\) purchaseOptions\.offerIdentifier/.test(iap), 'module d’achat : promotionalOffer (iOS) / offerIdentifier (Android) transmis seulement quand une offre existe');

console.log(`\n${rouges === 0 ? '✓' : '✗'} essai-abonne-boutique : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
