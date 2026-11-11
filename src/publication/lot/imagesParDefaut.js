// ═══════════════════════════════════════════════════════════════════════════
// LES IMAGES PAR DÉFAUT CONNUES DES PLATEFORMES — UNE LISTE FERMÉE (11/11/2026, décision de Nico, choix b)
// ═══════════════════════════════════════════════════════════════════════════
// Une plateforme sert une image par défaut à une annonce sans photo ; un import l'a parfois rapatriée comme photo de
// la fiche. Seule une image de CETTE liste, reconnue À L'IDENTIQUE, est retirée des photos qui partent (« on ne
// retire jamais une photo sur un doute ») : zéro faux positif. Deux reconnaissances exactes, rien d'autre :
//   · l'ADRESSE exacte, quand la photo est encore celle de la plateforme (aucun téléchargement — et cdn.beebs.app
//     ne sert aucun en-tête CORS : ses octets ne sont lisibles par aucune page) ;
//   · les OCTETS exacts (taille, puis SHA-256), quand la photo est sa copie chez nous : le rapatriement
//     (handler-watch, rapatriePhoto) recopie les octets tels quels — vérifié le 11/11 sur le cas d'origine : même
//     SHA-256 pour l'image servie par Beebs et pour sa copie rapatrie-fiche/ de la fiche.
// L'estimation du lot (ficheLue.js, estPhotoDeRemplissage : ≤ 256 px et ≤ 40 couleurs) ne retire plus rien : elle
// repère les cas DOUTEUX, signalés (usage_logs, « photo_par_defaut_douteuse ») pour qu'une vraie image par défaut
// soit ajoutée ici, à la main, après avoir été regardée. La requête : docs/regles/republication-et-publication.md, T1.
// Pur (Node + navigateur) ; verrou : selftest:une-photo-suffit.

/**
 * La liste fermée. Une entrée = une image par défaut, telle que la plateforme la sert.
 * Beebs — relevée le 11/11/2026 sur l'annonce Beebs du cas du 26/10 (compte de Nico, fiche née du relevé Beebs) :
 * la photo lue sur l'annonce (capture) est cette image, la fiche en porte la copie rapatrie-fiche/. Un pictogramme
 * de casquette, 200 × 200, JPEG de 3 066 octets ; l'objet du CDN date du 15/03/2023 (Last-Modified), son ETag (MD5)
 * est e03550fedd1df9bff70229f58bb6f7ba. Une seule annonce de la base la portait le 11/11 (sur 8 916 annonces Beebs) :
 * que Beebs serve toujours cette adresse n'est pas prouvé, d'où les octets.
 */
export const IMAGES_PAR_DEFAUT = Object.freeze([
  Object.freeze({
    plateforme: "beebs",
    releveLe: "2026-11-11",
    adresses: Object.freeze(["https://cdn.beebs.app/7c49fc10-d3ac-40cc-8042-90523132ad74.jpg"]),
    octets: 3066,
    sha256: "f0b31c8669a358d81d37c4c9ab7f686b56872aa21a52599c5940373558aacc66",
    largeur: 200,
    hauteur: 200,
  }),
]);

const PAR_ADRESSE = new Map(IMAGES_PAR_DEFAUT.flatMap((e) => e.adresses.map((a) => [a, e])));
const TAILLES = new Set(IMAGES_PAR_DEFAUT.map((e) => e.octets));
/** La plus grande image par défaut connue, en octets : au-delà, ce n'en est aucune (la lecture s'arrête là). */
export const OCTETS_MAX = Math.max(0, ...TAILLES);

/** L'image par défaut connue à CETTE adresse exacte, ou null. */
export function imageParDefautDeLAdresse(url) {
  return typeof url === "string" ? PAR_ADRESSE.get(url) ?? null : null;
}

/** Une image de cette taille (en octets) peut-elle être une image par défaut connue ? Sinon, inutile de la hacher. */
export function tailleDImageParDefaut(n) {
  return TAILLES.has(n);
}

/** L'image par défaut connue de ces octets exacts (`sha256` : leur SHA-256 en hexadécimal), ou null. */
export function imageParDefautDesOctets(nbOctets, sha256) {
  if (!Number.isFinite(nbOctets) || typeof sha256 !== "string") return null;
  const h = sha256.toLowerCase();
  return IMAGES_PAR_DEFAUT.find((e) => e.octets === nbOctets && e.sha256 === h) ?? null;
}

const hex = (octets) => Array.from(octets, (b) => b.toString(16).padStart(2, "0")).join("");

/** Le SHA-256 (hexadécimal) d'octets : WebCrypto quand la page l'a, sinon sha256HexJs (WebCrypto peut manquer
 *  dans la vue web de l'app iOS, capacitor://localhost). Les octets lus font OCTETS_MAX au plus : le repli est
 *  instantané. */
export async function sha256Hex(octets) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    try { return hex(new Uint8Array(await subtle.digest("SHA-256", octets))); } catch { /* repli ci-dessous */ }
  }
  return sha256HexJs(octets);
}

// SHA-256 en JavaScript pur (FIPS 180-4), pour de petits octets. Verrou : même empreinte que WebCrypto sur la
// vraie image par défaut de Beebs (selftest:une-photo-suffit).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256HexJs(octets) {
  const n = octets.length;
  const bloc = Math.ceil((n + 9) / 64) * 64;
  const m = new Uint8Array(bloc);
  m.set(octets);
  m[n] = 0x80;
  const bits = n * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(bloc - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(bloc - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < bloc; o += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(o + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const sortie = new Uint8Array(32);
  const dvs = new DataView(sortie.buffer);
  for (let i = 0; i < 8; i++) dvs.setUint32(i * 4, H[i]);
  return hex(sortie);
}
