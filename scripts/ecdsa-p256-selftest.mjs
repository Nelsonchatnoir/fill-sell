// Auto-test de la vérification ECDSA P-256 interne (supabase/functions/_shared/
// ecdsa-p256.ts) — 06/09/2026. Node (≥ 23, types TS retirés nativement) produit
// des signatures ECDSA-SHA1 et ECDSA-SHA256 DER avec node:crypto, exactement le
// format qu'eBay envoie (clé SPKI « MFkw… », signature DER, digest SHA1), et le
// module doit les accepter — et refuser un corps ou une signature altérés.
//
//   node scripts/ecdsa-p256-selftest.mjs
//
// Pourquoi ce test existe : le 06/09 la première version (crypto.subtle.verify)
// a rendu « Not implemented » sur le vrai test eBay — le runtime Deno de
// Supabase n'a pas ECDSA+SHA-1. On ne redéploie plus une brique crypto sans
// l'avoir vue accepter et refuser ce qu'il faut.
import { createSign, generateKeyPairSync, createHash, randomBytes } from 'node:crypto';
import { cleSpkiVersPoint, signatureDerVersRS, verifierEcdsaP256 } from '../supabase/functions/_shared/ecdsa-p256.ts';

let echecs = 0;
const attendu = (nom, ok) => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}`); if (!ok) echecs++; };

for (const digest of ['sha1', 'sha256']) {
  for (let tour = 0; tour < 5; tour++) {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }));
    const corps = Buffer.from(JSON.stringify({ metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' }, notification: { notificationId: randomBytes(8).toString('hex'), data: { username: 'u' + tour } } }));
    const sigDer = new Uint8Array(createSign(digest).update(corps).sign(privateKey)); // DER, comme eBay/Java
    const q = cleSpkiVersPoint(spki);
    const { r, s } = signatureDerVersRS(sigDer);
    const condense = new Uint8Array(createHash(digest).update(corps).digest());

    attendu(`${digest} #${tour} : signature authentique acceptée`, verifierEcdsaP256(q, condense, r, s) === true);

    const corpsAltere = Buffer.from(corps); corpsAltere[corpsAltere.length - 3] ^= 0x01;
    const condenseAltere = new Uint8Array(createHash(digest).update(corpsAltere).digest());
    attendu(`${digest} #${tour} : corps altéré refusé`, verifierEcdsaP256(q, condenseAltere, r, s) === false);

    attendu(`${digest} #${tour} : s altéré refusé`, verifierEcdsaP256(q, condense, r, (s + 1n) % (2n ** 256n)) === false);

    const { publicKey: autre } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const qAutre = cleSpkiVersPoint(new Uint8Array(autre.export({ type: 'spki', format: 'der' })));
    attendu(`${digest} #${tour} : autre clé refusée`, verifierEcdsaP256(qAutre, condense, r, s) === false);
  }
}

// Courbe hors périmètre : erreur explicite, jamais un faux « invalide ».
try {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  cleSpkiVersPoint(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })));
  attendu('P-384 : doit lever', false);
} catch (e) {
  attendu(`P-384 : lève « ${e.message} »`, /courbe non gérée/.test(e.message));
}

// Clé publique au format eBay : PEM sans retours à la ligne, comme le rend getPublicKey.
{
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).replace(/\n/g, '');
  const corps64 = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '');
  const spki = new Uint8Array(Buffer.from(corps64, 'base64'));
  const corps = Buffer.from('{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION"}}');
  const sig = new Uint8Array(createSign('sha1').update(corps).sign(privateKey));
  const { r, s } = signatureDerVersRS(sig);
  attendu('PEM eBay sans retours à la ligne : accepté', verifierEcdsaP256(cleSpkiVersPoint(spki), new Uint8Array(createHash('sha1').update(corps).digest()), r, s) === true);
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);
