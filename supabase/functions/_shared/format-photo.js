// ═══════════════════════════════════════════════════════════════════════════
// LE FORMAT D'UNE PHOTO SE LIT DANS SES OCTETS, JAMAIS DANS SON NOM (04/11, romain.guerin85)
// ═══════════════════════════════════════════════════════════════════════════
// Un HEIC d'iPhone arrive souvent sans type (Chrome rend "") et parfois sans extension .heic : la détection par le
// nom ou le type laissait passer des fichiers que ni Chrome ni les plateformes ne décodent. Les quelques premiers
// octets suffisent : JPEG (FF D8 FF), PNG (89 PNG), WebP (RIFF…WEBP), et la famille ISO-BMFF (« ftyp » à l'octet 4)
// dont les marques disent HEIC/HEIF ou AVIF.
// Pur (Deno + Node + Vite), sans import : lu par l'app (src/utils/imageDecode.js) et par la fonction photo-heic-jpeg.

const MARQUES_HEIC = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "mif2"]);
const texte = (o, a, b) => String.fromCharCode(...o.subarray(a, Math.min(b, o.length)));

/**
 * Le format d'une photo d'après ses premiers octets (32 au moins conseillés) :
 * "jpeg" | "png" | "webp" | "heic" | "avif" | "inconnu".
 * @param {Uint8Array|ArrayBuffer} entree
 */
export function formatPhoto(entree) {
  const o = entree instanceof Uint8Array ? entree : new Uint8Array(entree ?? new ArrayBuffer(0));
  if (o.length < 12) return "inconnu";
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "jpeg";
  if (o[0] === 0x89 && texte(o, 1, 4) === "PNG") return "png";
  if (texte(o, 0, 4) === "RIFF" && texte(o, 8, 12) === "WEBP") return "webp";
  if (texte(o, 4, 8) === "ftyp") {
    const taille = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
    const fin = Math.min(taille || o.length, o.length);
    const marques = [texte(o, 8, 12)];
    for (let i = 16; i + 4 <= fin; i += 4) marques.push(texte(o, i, i + 4));
    const heic = marques.some((m) => MARQUES_HEIC.has(m));
    if (marques.some((m) => m === "avif" || m === "avis") && !marques.some((m) => /^he[iv]/.test(m))) return "avif";
    if (heic) return "heic";
  }
  return "inconnu";
}

/** Un format que Chrome, Safari et les plateformes décodent tous. */
export const FORMATS_UNIVERSELS = Object.freeze(["jpeg", "png", "webp"]);
