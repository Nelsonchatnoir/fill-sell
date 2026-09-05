// ── Décodage d'image : AUCUNE promesse ne doit rester pendante ───────────────
// (2026-09-04, retour Romain Colson — « iphone prend des photos formats HEIC »)
//
// LE DÉFAUT DE FOND, dont le HEIC n'est que le déclencheur : le pipeline photo
// posait `img.onload` SANS `img.onerror` et sans délai maximum. Une image que
// le navigateur ne sait pas décoder ne déclenche jamais `onload` — la Promise
// n'était donc JAMAIS résolue, l'`await` ne rendait jamais la main, et l'écran
// restait sur « Upload en cours… » indéfiniment. Blocage total, silencieux,
// sans message ni possibilité de recommencer.
//
// Le HEIC coche exactement cette case : Safari le décode, Chrome et Firefox
// NON. Un iPhone photographie en HEIC ; dès que ces fichiers arrivent sur un
// ordinateur et passent par fillsell.app dans Chrome, tout se fige.
//
// RÈGLES POSÉES ICI :
//   1. on ACCEPTE tout (`accept="image/*"` inchangé) et on CONVERTIT —
//      jamais un message qui demande à l'utilisateur de convertir lui-même ;
//   2. toute attente de décodage porte un `onerror` ET un délai maximum ;
//   3. le décodeur HEIC est chargé À LA DEMANDE (import dynamique) : il ne
//      pèse rien pour les utilisateurs qui n'en rencontrent jamais.

/** Délai au-delà duquel un décodage est considéré perdu. Généreux : une photo
 *  de 12 Mpx sur un téléphone modeste peut prendre plusieurs secondes. */
export const DELAI_DECODAGE_MS = 20000;

/** Le fichier est-il (probablement) du HEIC/HEIF ? Le type MIME du navigateur
 *  n'est PAS fiable : Chrome rend souvent "" sur un .heic, et macOS annonce
 *  parfois image/heic-sequence. On regarde donc aussi le nom. */
export function estProbablementHeic(file) {
  const type = String(file?.type ?? "").toLowerCase();
  if (type.includes("heic") || type.includes("heif")) return true;
  return /\.(heic|heif)$/i.test(String(file?.name ?? ""));
}

/** Charge une Image() avec onerror ET délai maximum. Résout l'élément prêt à
 *  être dessiné, rejette dans tous les autres cas — jamais de pendante.
 *  L'objectURL est révoqué quoi qu'il arrive. */
export function chargerImage(blob, delaiMs = DELAI_DECODAGE_MS) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    let fini = false;
    const terminer = (fn, arg) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      URL.revokeObjectURL(url);
      fn(arg);
    };
    const minuteur = setTimeout(
      () => terminer(reject, new Error("decodage_timeout")),
      delaiMs,
    );
    img.onload = () => terminer(resolve, img);
    img.onerror = () => terminer(reject, new Error("decodage_impossible"));
    img.src = url;
  });
}

/** Convertit un HEIC en JPEG. Le décodeur (heic2any, ~1,5 Mo) est importé
 *  DYNAMIQUEMENT : Vite en fait un chunk séparé, téléchargé uniquement par les
 *  navigateurs qui rencontrent réellement un HEIC. Zéro octet pour les autres.
 *  heic2any peut rendre un tableau (HEIC « séquence », Live Photo) : on garde
 *  la première image. */
async function heicVersJpeg(file, quality = 0.92) {
  const { default: heic2any } = await import("heic2any");
  const sortie = await heic2any({ blob: file, toType: "image/jpeg", quality });
  return Array.isArray(sortie) ? sortie[0] : sortie;
}

/**
 * Rend un blob que le navigateur SAIT décoder, plus son type MIME réel.
 * Essaie le fichier tel quel ; si le décodage échoue ou expire et que le
 * fichier ressemble à du HEIC, convertit puis re-vérifie.
 * Lève une erreur explicite si rien n'y fait — l'appelant DOIT la montrer,
 * mais il ne restera jamais bloqué.
 * @returns {Promise<{ blob: Blob, mime: string, converti: boolean }>}
 */
export async function versImageDecodable(file) {
  try {
    await chargerImage(file);
    // Le type du navigateur peut être vide (fichier sans extension connue) :
    // s'il a su le décoder, il est affichable, on ne ment pas pour autant sur
    // le mime — on ne déclare que ce qu'on a vérifié.
    return { blob: file, mime: String(file?.type ?? "") || "image/jpeg", converti: false };
  } catch (e) {
    if (!estProbablementHeic(file)) throw e;
  }
  const jpeg = await heicVersJpeg(file);
  // Re-vérification : une conversion qui rend un blob indécodable serait pire
  // que l'échec initial (elle repartirait vers le storage).
  await chargerImage(jpeg);
  return { blob: jpeg, mime: "image/jpeg", converti: true };
}

// ── Réduction avant envoi à l'IA (2026-09-05) ────────────────────────────────
// L'API d'analyse REFUSE toute image dont un côté dépasse 8 000 px, et ce refus
// tombe AVANT la lecture : le scan entier échoue, l'utilisateur lit « échec »
// sans savoir pourquoi (6 scans sur 226 en 20 jours). Un iPhone Pro en 48 Mpx
// sort du 8064 × 6048 : il suffit d'une photo prise au maximum de définition.
//
// On réduit donc AVANT l'upload — et seulement au-dessus du seuil : sous 6 000 px
// la photo part inchangée, à sa définition d'origine. Le serveur refait la même
// mesure de son côté (les apps déjà installées ne montent pas ce correctif) ;
// ici, c'est la réduction la moins chère et la meilleure — le navigateur décode
// et redimensionne nativement.

/** Au-delà de ce côté, on réduit. Marge volontaire sous la limite de 8 000 px. */
export const COTE_DECLENCHEMENT_IA = 6000;

/** Côté le plus long visé après réduction. Très au-dessus de ce que le modèle
 *  exploite réellement : aucun détail utile n'est perdu. */
export const COTE_CIBLE_IA = 4000;

/**
 * Rend une version de l'image dont aucun côté ne dépasse `coteCible`, ou le blob
 * d'origine s'il est déjà sous le seuil. Redimensionnement PROPORTIONNEL : jamais
 * de déformation. Ne lève jamais pour une raison de taille — un échec de canvas
 * rend l'original, le garde-fou serveur prend alors le relais.
 * @returns {Promise<{ blob: Blob, mime: string, reduite: boolean, largeur: number|null, hauteur: number|null }>}
 */
export async function reduireSousLimiteIA(
  blob,
  coteDeclenchement = COTE_DECLENCHEMENT_IA,
  coteCible = COTE_CIBLE_IA,
  quality = 0.92,
) {
  const mimeOrigine = String(blob?.type ?? "") || "image/jpeg";
  let img;
  try {
    img = await chargerImage(blob);
  } catch {
    // Illisible ici : ce n'est pas à cette fonction de le signaler — l'appelant
    // a déjà passé la photo par versImageDecodable.
    return { blob, mime: mimeOrigine, reduite: false, largeur: null, hauteur: null };
  }
  const plusGrand = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!plusGrand || plusGrand <= coteDeclenchement) {
    return { blob, mime: mimeOrigine, reduite: false, largeur: img.naturalWidth || img.width, hauteur: img.naturalHeight || img.height };
  }
  try {
    const facteur = coteCible / plusGrand;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * facteur));
    c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * facteur));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const reduit = await new Promise((resolve, reject) => {
      c.toBlob(b => (b ? resolve(b) : reject(new Error("reduction_impossible"))), "image/jpeg", quality);
    });
    return { blob: reduit, mime: "image/jpeg", reduite: true, largeur: c.width, hauteur: c.height };
  } catch (e) {
    console.warn("[photos] réduction impossible, photo envoyée telle quelle :", e?.message ?? e);
    return { blob, mime: mimeOrigine, reduite: false, largeur: img.naturalWidth || img.width, hauteur: img.naturalHeight || img.height };
  }
}

/** Message utilisateur d'un échec de décodage — factuel, sans jargon, et sans
 *  jamais demander de convertir soi-même. */
export function messageDecodage(lang) {
  return lang === "en"
    ? "This photo could not be read. Try another one, or take it again from the app."
    : "Cette photo n'a pas pu être lue. Essaie-en une autre, ou reprends-la depuis l'app.";
}
