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

/** Message utilisateur d'un échec de décodage — factuel, sans jargon, et sans
 *  jamais demander de convertir soi-même. */
export function messageDecodage(lang) {
  return lang === "en"
    ? "This photo could not be read. Try another one, or take it again from the app."
    : "Cette photo n'a pas pu être lue. Essaie-en une autre, ou reprends-la depuis l'app.";
}
