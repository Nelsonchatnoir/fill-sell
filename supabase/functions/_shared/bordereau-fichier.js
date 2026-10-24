// Règles pures de la fonction bordereau-fichier (24/10 soir, test réel du bordereau Vinted) — testées par
// scripts/bordereau-fichier-octets-selftest.mjs.

/** 5 Mo au plus : une étiquette pèse quelques centaines de Ko (même plafond que la copie, background.js). */
export const FICHIER_MAX_OCTETS = 5 * 1024 * 1024;

/**
 * Les SEULS hôtes dont la fonction lit un fichier : le stockage des étiquettes de Vinted (lien S3 présigné rendu par
 * …/shipment/digital_label, « digital_label.image_url »), toutes régions. Liste fermée : jamais une adresse choisie
 * par l'appelant ailleurs (la fonction ne doit pas devenir un relais vers n'importe quel site).
 */
const HOTES = [/^svc-shipping-labels\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/];

/** @param {URL} u */
export function hoteFichierAutorise(u) {
  if (!u || u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  return HOTES.some((re) => re.test(u.hostname.toLowerCase()));
}

/** Le genre d'un fichier d'étiquette d'après ses premiers octets (jamais d'après l'en-tête annoncé). */
export function genreDuFichier(o) {
  if (!o || o.length < 4) return null;
  if (o[0] === 0x25 && o[1] === 0x50 && o[2] === 0x44 && o[3] === 0x46) return { type: "application/pdf", ext: "pdf" };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: "image/png", ext: "png" };
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return null;
}
