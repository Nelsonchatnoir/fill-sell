// ══════════════════════════════════════════════════════════════════════════════
// PRÉPARATION DES IMAGES ENVOYÉES À L'API (2026-09-05)
// ══════════════════════════════════════════════════════════════════════════════
// L'INCIDENT : le 05/09 à 08:39 UTC, l'API a refusé un scan entier —
//   Anthropic 400: messages.0.content.2.image.source.url:
//   At least one of the image dimensions exceed max allowed size: 8000 pixels
// Une seule photo dépassait 8 000 px de côté (un iPhone Pro en 48 Mpx sort du
// 8064 × 6048), l'appel ne partait JAMAIS, la fonction rendait 500 et
// l'utilisateur lisait « échec » sans rien de plus. 6 scans sur 226 en 20 jours,
// 4 comptes, tous avec tours=0 et input_tokens=0 : l'API n'a jamais lu la
// moindre photo. Invisible aussi longtemps parce qu'usage_logs ne portait que
// `issue: echec`, sans motif.
//
// CE QUE FAIT CE MODULE, ET DANS CET ORDRE :
//   1. il MESURE chaque photo sans la télécharger — l'en-tête suffit (quelques
//      dizaines de Ko en requête Range), donc un scan normal ne paie rien ;
//   2. sous le seuil, il ne touche à RIEN : l'image part par URL comme avant,
//      mêmes octets, même préfixe de cache. Aucun scan existant ne change ;
//   3. au-dessus, il réduit — d'abord par la transformation d'images du
//      Storage (le redimensionnement se fait côté service, mémoire nulle ici),
//      sinon par un décodage local BORNÉ EN PIXELS ;
//   4. si rien n'a marché, il rend la photo ÉCARTÉE avec son motif. L'appelant
//      continue le scan avec les autres — un cliché ne tue plus le lot.
//
// ⛔ POURQUOI LE DÉCODAGE LOCAL EST PLAFONNÉ : une Edge Function dispose de
// ~256 Mo. Décoder une photo de 48 Mpx en RGBA, c'est 195 Mo d'un bloc — l'isolat
// se fait tuer, et un isolat tué ne rembourse RIEN (le débit, lui, a déjà eu
// lieu). Au-delà du budget, on ÉCARTE la photo : perdre une vue est réparable,
// débiter sans rendre l'analyse ne l'est pas.

/** Limite DURE de l'API : au-delà, l'image est refusée en 400. Jamais visée. */
export const COTE_MAX_API = 8000;

/** Seuil de déclenchement de la réduction. Large marge sous la limite : une
 *  photo à 7 900 px passerait aujourd'hui, mais rien ne garantit que le côté
 *  mesuré ici soit celui que l'API compte (rotation EXIF), et une marge coûte
 *  moins cher qu'un refus. */
export const COTE_DECLENCHEMENT = 6000;

/** Côté le plus long après réduction. Reste très au-dessus de ce que le modèle
 *  exploite (l'API ramène de toute façon le grand côté à ~1 568 px pour son
 *  propre calcul) : on ne perd aucun détail utile, on sort seulement de la
 *  zone de refus. */
export const COTE_CIBLE = 4000;

/** Budget de décodage local, en pixels. 16 Mpx ≈ 64 Mo en RGBA. */
export const BUDGET_PIXELS_DECODAGE = 16_000_000;

/** Qualité JPEG des images réduites (0-100). 82 est indiscernable à l'œil sur
 *  une photo d'article et divise le poids par ~4. */
const QUALITE_JPEG = 82;

/** Plafond de l'API pour une image en base64 : 5 Mo. On vise sous 4 Mo. */
const POIDS_MAX_BASE64 = 4_000_000;

/** En-tête lu pour mesurer une image. 192 Ko : un JPEG d'appareil photo place
 *  son segment SOF après l'EXIF et sa vignette, qui pèsent souvent > 64 Ko. */
const OCTETS_ENTETE = 192 * 1024;

const DELAI_RESEAU_MS = 15000;

export type Dimensions = { largeur: number; hauteur: number };

export type SourceImage =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: string; data: string };

export type PhotoPreparee = {
  /** Rang dans le lot reçu du client — c'est CE numéro que voit l'utilisateur. */
  index: number;
  url: string;
  /** null ⇒ photo écartée : elle ne part pas à l'API. */
  source: SourceImage | null;
  /** null si l'en-tête n'a pas pu être lu (format inconnu, serveur muet). */
  dimensions: Dimensions | null;
  reduite: null | "transformation_storage" | "decodage_local";
  /** Motif d'écartement, ou null. */
  ecartee: string | null;
};

// ── Mesure : dimensions lues dans l'en-tête, sans décoder ────────────────────

function dimensionsJpeg(o: Uint8Array): Dimensions | null {
  let i = 2;
  while (i + 9 < o.length) {
    if (o[i] !== 0xff) { i++; continue; } // resynchronisation sur le marqueur
    const marqueur = o[i + 1];
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) { i += 2; continue; }
    if (marqueur === 0xd9 || marqueur === 0xda) return null; // début des données : plus de SOF à attendre
    const taille = (o[i + 2] << 8) | o[i + 3];
    // SOF0..SOF15, sauf les tables de Huffman (C4), l'arithmétique (C8) et DNL (CC).
    const estSOF = marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;
    if (estSOF) {
      const hauteur = (o[i + 5] << 8) | o[i + 6];
      const largeur = (o[i + 7] << 8) | o[i + 8];
      return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null;
    }
    if (taille < 2) return null;
    i += 2 + taille;
  }
  return null;
}

function dimensionsWebp(o: Uint8Array, vue: DataView): Dimensions | null {
  const format = String.fromCharCode(o[12], o[13], o[14], o[15]);
  if (format === "VP8X" && o.length >= 30) {
    const largeur = 1 + (o[24] | (o[25] << 8) | (o[26] << 16));
    const hauteur = 1 + (o[27] | (o[28] << 8) | (o[29] << 16));
    return { largeur, hauteur };
  }
  if (format === "VP8 " && o.length >= 30) {
    return { largeur: vue.getUint16(26, true) & 0x3fff, hauteur: vue.getUint16(28, true) & 0x3fff };
  }
  if (format === "VP8L" && o.length >= 25 && o[20] === 0x2f) {
    const bits = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24);
    return { largeur: 1 + (bits & 0x3fff), hauteur: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/** Dimensions lues dans les premiers octets, ou null si le format n'est pas
 *  reconnu. On ne DEVINE jamais : un null laisse la photo passer telle quelle. */
export function dimensionsDepuisEntete(o: Uint8Array): Dimensions | null {
  if (o.length < 24) return null;
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);

  // PNG : signature + IHDR en tête de fichier, toujours au même endroit.
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) {
    return { largeur: vue.getUint32(16), hauteur: vue.getUint32(20) };
  }
  // GIF87a / GIF89a : largeur et hauteur en petit-boutiste dès l'octet 6.
  if (o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46) {
    return { largeur: vue.getUint16(6, true), hauteur: vue.getUint16(8, true) };
  }
  // RIFF….WEBP
  if (o[0] === 0x52 && o[1] === 0x49 && o[2] === 0x46 && o[3] === 0x46
      && o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50) {
    return dimensionsWebp(o, vue);
  }
  if (o[0] === 0xff && o[1] === 0xd8) return dimensionsJpeg(o);
  return null;
}

/** Dimensions cibles, PROPORTIONNELLES : on ne déforme jamais. */
export function dimensionsReduites(source: Dimensions, coteCible = COTE_CIBLE): Dimensions {
  const plusGrand = Math.max(source.largeur, source.hauteur);
  if (plusGrand <= coteCible) return source;
  const facteur = coteCible / plusGrand;
  return {
    largeur: Math.max(1, Math.round(source.largeur * facteur)),
    hauteur: Math.max(1, Math.round(source.hauteur * facteur)),
  };
}

// ── Réseau ───────────────────────────────────────────────────────────────────

/** Lit AU PLUS `maxOctets` du début d'une URL, puis coupe le flux. Une requête
 *  Range évite de rapatrier 20 Mo pour lire 4 nombres ; si le serveur l'ignore,
 *  la lecture s'arrête quand même au budget et le reste est annulé. */
async function lireDebut(
  url: string,
  maxOctets: number,
): Promise<{ octets: Uint8Array; type: string } | null> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
  try {
    const r = await fetch(url, { headers: { Range: `bytes=0-${maxOctets - 1}` }, signal: ctrl.signal });
    if (!r.ok || !r.body) { await r.body?.cancel().catch(() => {}); return null; }
    const type = r.headers.get("content-type") ?? "";
    const lecteur = r.body.getReader();
    const morceaux: Uint8Array[] = [];
    let total = 0;
    while (total < maxOctets) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
      total += value.length;
    }
    await lecteur.cancel().catch(() => {});
    const octets = new Uint8Array(total);
    let pos = 0;
    for (const m of morceaux) { octets.set(m.subarray(0, Math.min(m.length, total - pos)), pos); pos += m.length; }
    return { octets, type };
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Découpe une URL publique du Storage de CE projet, ou null si l'URL vient
 *  d'ailleurs (la transformation d'images ne s'applique qu'à nos buckets). */
function cheminStorage(url: string, supabaseUrl: string): { bucket: string; chemin: string } | null {
  const prefixe = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`;
  if (!url.startsWith(prefixe)) return null;
  const reste = url.slice(prefixe.length).split("?")[0];
  const coupe = reste.indexOf("/");
  if (coupe <= 0 || coupe === reste.length - 1) return null;
  return { bucket: reste.slice(0, coupe), chemin: reste.slice(coupe + 1) };
}

/** Redimensionnement PAR LE STORAGE : l'image est réduite côté service, on ne
 *  télécharge rien et on n'occupe aucune mémoire. `resize=contain` conserve les
 *  proportions et n'agrandit jamais.
 *  Rend l'URL transformée seulement si elle a été VÉRIFIÉE (image servie, et
 *  dimensions redescendues) — la transformation d'images dépend du plan du
 *  projet, une URL qui rend du JSON d'erreur serait un refus de plus. */
async function viaTransformationStorage(
  url: string,
  supabaseUrl: string,
  cible: Dimensions,
): Promise<string | null> {
  const st = cheminStorage(url, supabaseUrl);
  if (!st) return null;
  const transformee = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/render/image/public/${st.bucket}/${st.chemin}`
    + `?width=${cible.largeur}&height=${cible.hauteur}&resize=contain&quality=${QUALITE_JPEG}`;
  const debut = await lireDebut(transformee, 32 * 1024);
  if (!debut || !debut.type.startsWith("image/")) return null;
  const dims = dimensionsDepuisEntete(debut.octets);
  // Dimensions illisibles : le service a bien rendu une image, on lui fait
  // confiance. Dimensions lisibles mais toujours hors seuil : on refuse.
  if (dims && Math.max(dims.largeur, dims.hauteur) > COTE_DECLENCHEMENT) return null;
  return transformee;
}

function versBase64(octets: Uint8Array): string {
  // btoa ne prend qu'une chaîne, et String.fromCharCode(...tableau) explose la
  // pile au-delà de ~100 k arguments : on avance par tranches.
  let brut = "";
  const pas = 0x8000;
  for (let i = 0; i < octets.length; i += pas) {
    brut += String.fromCharCode(...octets.subarray(i, i + pas));
  }
  return btoa(brut);
}

/** Repli : décodage et redimensionnement DANS la fonction, puis envoi en
 *  base64. Sert quand la transformation du Storage n'est pas disponible, ou
 *  quand la photo ne vient pas de nos buckets.
 *  ⛔ Refusé au-delà du budget pixels : voir l'en-tête de fichier. */
async function viaDecodageLocal(
  url: string,
  source: Dimensions,
  cible: Dimensions,
): Promise<SourceImage | null> {
  if (source.largeur * source.hauteur > BUDGET_PIXELS_DECODAGE) return null;
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
  try {
    // Import DYNAMIQUE : une indisponibilité du décodeur ne doit pas empêcher
    // la fonction de démarrer — elle retombe alors sur l'écartement de la photo.
    const { decode } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return null; }
    const octets = new Uint8Array(await r.arrayBuffer());
    const image = await decode(octets) as unknown as {
      resize: (l: number, h: number) => unknown;
      encodeJPEG: (q: number) => Promise<Uint8Array>;
    };
    if (!image || typeof image.resize !== "function" || typeof image.encodeJPEG !== "function") return null;
    image.resize(cible.largeur, cible.hauteur);
    let jpeg = await image.encodeJPEG(QUALITE_JPEG);
    if (jpeg.length * 1.37 > POIDS_MAX_BASE64) jpeg = await image.encodeJPEG(60);
    if (jpeg.length * 1.37 > POIDS_MAX_BASE64) return null;
    return { type: "base64", media_type: "image/jpeg", data: versBase64(jpeg) };
  } catch (e) {
    console.warn("[lens-analysis][image] décodage local impossible :", (e as Error)?.message ?? e);
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

async function preparerUne(url: string, index: number, supabaseUrl: string): Promise<PhotoPreparee> {
  const base: PhotoPreparee = {
    index, url, source: { type: "url", url }, dimensions: null, reduite: null, ecartee: null,
  };

  const debut = await lireDebut(url, OCTETS_ENTETE);
  const dims = debut ? dimensionsDepuisEntete(debut.octets) : null;
  base.dimensions = dims;

  // Dimensions inconnues : on ne touche à rien. Mesurer est une optimisation,
  // pas une autorisation — le filet d'aval (refus de l'API) reste en place.
  if (!dims) return base;
  if (Math.max(dims.largeur, dims.hauteur) <= COTE_DECLENCHEMENT) return base;

  const cible = dimensionsReduites(dims);

  const transformee = await viaTransformationStorage(url, supabaseUrl, cible);
  if (transformee) {
    return { ...base, source: { type: "url", url: transformee }, reduite: "transformation_storage" };
  }

  const locale = await viaDecodageLocal(url, dims, cible);
  if (locale) return { ...base, source: locale, reduite: "decodage_local" };

  return {
    ...base,
    source: null,
    ecartee: dims.largeur * dims.hauteur > BUDGET_PIXELS_DECODAGE
      ? "trop_grande_pour_reduction_locale"
      : "reduction_impossible",
  };
}

/**
 * Prépare TOUT le lot — jamais la seule première photo. Les mesures partent en
 * parallèle : un scan de 5 photos ne paie qu'un aller-retour, pas cinq.
 * Ne lève jamais : une photo qui résiste ressort `source: null`, à charge de
 * l'appelant de continuer avec les autres et de journaliser le motif.
 */
export async function preparerPhotos(urls: string[], supabaseUrl: string): Promise<PhotoPreparee[]> {
  return await Promise.all(urls.map((url, i) => preparerUne(url, i, supabaseUrl)));
}

/** Trace compacte d'une photo pour usage_logs — jamais l'URL entière (elle
 *  contient l'identifiant utilisateur et n'a aucune valeur d'enquête). */
export function tracePhoto(p: PhotoPreparee, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    photo: p.index + 1,
    largeur: p.dimensions?.largeur ?? null,
    hauteur: p.dimensions?.hauteur ?? null,
    ...(p.reduite ? { reduite: p.reduite } : {}),
    ...(p.ecartee ? { motif: p.ecartee } : {}),
    ...(extra ?? {}),
  };
}
