// ═══════════════════════════════════════════════════════════════════════════
// L'ESSAI DU CLOUD POUR LES ABONNÉS APP STORE / GOOGLE PLAY — PRÉPARÉ POUR LE PROCHAIN BINAIRE, INACTIF (13/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// 3e réponse de Nico, point f : « Essai pour les abonnés App Store / Google Play : prépare-le pour le prochain binaire, sans
// rien soumettre sans mon accord. » Sur le web, un abonné Premium / Pro qui n'a jamais eu le Cloud l'essaie 7 jours
// (create-checkout-session, voie « essai_abonne », décision 6 du 11/11). Dans les boutiques, un ABONNÉ n'a jamais l'offre
// d'introduction (Apple : « Existing subscribers are not eligible … upgrading » ; Google : offres « nouveaux clients »).
// Les seuls outils :
//   · APPLE — une OFFRE PROMOTIONNELLE sur app.fillsell.premium.cloud / app.fillsell.pro.cloud (créée dans App Store
//     Connect par Nico), dont la feuille d'achat exige une SIGNATURE du serveur (developer.apple.com, « Generating a
//     signature for promotional offers ») : ECDSA P-256 / SHA-256, avec la clé d'achats intégrés (.p8, la même que
//     l'App Store Server API : APPLE_API_PRIVATE_KEY / APPLE_API_KEY_ID), sur la charge
//       appBundleId ␣ keyIdentifier ␣ productIdentifier ␣ offerIdentifier ␣ appAccountToken ␣ nonce ␣ timestamp
//     (séparateur U+2063, appAccountToken et nonce en minuscules, timestamp en millisecondes) ; la signature voyage en
//     DER, base64. StoreKit 2 : Product.PurchaseOption.promotionalOffer(offerID:keyID:nonce:signature:timestamp:).
//   · GOOGLE — une offre « déterminée par le développeur » sur le forfait de base de la formule (Play Console) : pas de
//     signature, mais le module natif doit pouvoir CHOISIR cette offre (offerToken) — il prend aujourd'hui la 1re offre.
// ⛔ INACTIF : rien ne s'appelle tant que (1) l'interrupteur serveur ESSAI_ABONNES_BOUTIQUE n'est pas « 1 » ET (2) l'app
// ne tourne pas sur un binaire ≥ ESSAI_ABONNE_BINAIRE_MIN (src/lib/essaiAbonneBoutique.js, null aujourd'hui). Pur : les
// calculs ici (charge, DER, éligibilité) ; la signature passe par WebCrypto (Deno et Node).

export const SEPARATEUR_OFFRE_APPLE = '⁣';
export const BUNDLE_ID_APPLE = 'app.fillsell.app';
// Les identifiants d'offre À CRÉER par Nico (App Store Connect › Abonnements › Offres promotionnelles ; Play Console ›
// Forfait de base › Offres, éligibilité « Déterminée par le développeur »). Mêmes noms des deux côtés.
export const OFFRES_ESSAI_ABONNE = Object.freeze({
  apple: Object.freeze({ premium_cloud: 'essai-abonne-7j', pro_cloud: 'essai-abonne-7j' }),
  google: Object.freeze({ premium_cloud: 'essai-abonne-7j', pro_cloud: 'essai-abonne-7j' }),
});
export const PRODUITS_APPLE_ESSAI_ABONNE = Object.freeze({ premium_cloud: 'app.fillsell.premium.cloud', pro_cloud: 'app.fillsell.pro.cloud' });
const RANG_FORMULE = Object.freeze({ premium_cloud: 1, pro_cloud: 2 });

/**
 * L'abonné de CETTE boutique a-t-il droit à l'essai du Cloud sur la formule visée ? (pur) — la règle du web (décision 6) :
 * Premium + Cloud ou Pro + Cloud seulement (⛔ jamais Business + Cloud), le MÊME palier que son abonnement, sur le canal
 * où il paie, un seul abonnement vivant, et l'essai du Cloud jamais pris (les 4 verrous : essaiPermis du serveur).
 * @param {{ canal: string, formule: string, vivants?: Array<any>, essaiPermis?: boolean }} p
 */
export function essaiAbonneBoutiquePermis({ canal, formule, vivants = [], essaiPermis = false }) {
  if (canal !== 'apple' && canal !== 'google') return { permis: false, raison: 'canal' };
  if (!(formule in RANG_FORMULE)) return { permis: false, raison: 'formule_sans_essai' };
  const liste = Array.isArray(vivants) ? vivants : [];
  if (liste.length !== 1) return { permis: false, raison: liste.length ? 'deux_abonnements' : 'pas_abonne' };
  const v = liste[0];
  if (v.canal !== canal || v.type !== 'palier') return { permis: false, raison: 'autre_canal' };
  if (Number(v.rang) !== RANG_FORMULE[formule]) return { permis: false, raison: 'autre_palier' };
  if (essaiPermis !== true) return { permis: false, raison: 'essai_deja_pris' };
  return { permis: true, raison: null, offre: OFFRES_ESSAI_ABONNE[canal][formule] };
}

/** La charge signée d'une offre promotionnelle Apple (pure). */
export function chargeOffrePromoApple({ bundleId = BUNDLE_ID_APPLE, keyId, productId, offerId, appAccountToken, nonce, timestamp }) {
  const champs = [bundleId, keyId, productId, offerId, String(appAccountToken ?? '').toLowerCase(), String(nonce ?? '').toLowerCase(), String(timestamp)];
  if (champs.some((c) => !c || c === 'undefined')) throw new Error('offre promotionnelle : champ manquant');
  return champs.join(SEPARATEUR_OFFRE_APPLE);
}

/** Une signature ECDSA brute (r ‖ s, 64 octets — WebCrypto) en DER (ASN.1 SEQUENCE de deux INTEGER), attendue par Apple. */
export function derDepuisP1363(brut) {
  const o = brut instanceof Uint8Array ? brut : new Uint8Array(brut);
  if (o.length !== 64) throw new Error(`signature ECDSA P-256 inattendue (${o.length} octets)`);
  const entier = (b) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = Uint8Array.from([0, ...v]);
    return Uint8Array.from([0x02, v.length, ...v]);
  };
  const r = entier(o.slice(0, 32)), s = entier(o.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

const base64 = (octets) => {
  let bin = '';
  for (const x of octets) bin += String.fromCharCode(x);
  return btoa(bin);
};

/**
 * Signe une offre promotionnelle Apple. `cle` : CryptoKey ECDSA P-256 (usage « sign ») — la clé d'achats intégrés.
 * Rend ce que la feuille StoreKit attend : { offerIdentifier, keyIdentifier, nonce, timestamp, signature (base64 DER) }.
 */
export async function signerOffrePromoApple({ cle, keyId, productId, offerId, appAccountToken, nonce, timestamp, bundleId = BUNDLE_ID_APPLE, subtle = globalThis.crypto?.subtle }) {
  const charge = chargeOffrePromoApple({ bundleId, keyId, productId, offerId, appAccountToken, nonce, timestamp });
  const brut = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, new TextEncoder().encode(charge)));
  return { offerIdentifier: offerId, keyIdentifier: keyId, nonce: String(nonce).toLowerCase(), timestamp: Number(timestamp), signature: base64(derDepuisP1363(brut)) };
}
