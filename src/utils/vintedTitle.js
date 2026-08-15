// Normalisation du titre AVANT envoi à Vinted (2026-08-15, Carla guerbet,
// « Robe JANE WOOD marron col halter ») : Vinted refuse en HTTP 400
// errors[{field:"title"}] « Le titre contient trop de lettres majuscules »
// quand la part de majuscules est trop élevée — l'annonce n'est PAS créée.
// Le titre refusé était à ~33 % de majuscules ; corrigé à la main en
// « Robe Jane wood marron col halter » (~7 %), il est passé en 1 minute.
// La cause ordinaire est l'IA qui écrit la marque en capitales, mais on
// normalise ICI (à la construction du job) et pas seulement dans le prompt :
// ça rattrape aussi les titres saisis à la main.
//
// C'est une NORMALISATION, jamais une garde : elle rend toujours un titre,
// ne lève jamais. Vinted seul — LBC/eBay/Beebs acceptent les capitales.

// Seuil de déclenchement : sous ~30 % de majuscules on ne touche à RIEN
// (le seuil exact de Vinted n'est pas public ; le refus observé était à 33 %,
// l'accepté à 7 %). Au-dessus, seuls les MOTS TOUT EN CAPITALES de 4 lettres
// et plus sont recasés (« JANE » → « Jane ») :
//   - les sigles courts restent intacts (XL, S, M, NB, EDT, ÉTÉ) ;
//   - les jetons avec chiffres ne matchent pas la séquence (PS2, A4) ;
//   - les nombres romains sont épargnés (« Louis XVIII » reste XVIII).
const RATIO_MAJUSCULES_MAX = 0.3;
const SEQUENCE_CAPITALES = /\p{Lu}{4,}/gu;
const NOMBRE_ROMAIN = /^[IVXLCDM]+$/;

export function normalizeVintedTitle(titre) {
  const s = String(titre ?? "");
  const lettres = (s.match(/\p{L}/gu) ?? []).length;
  if (!lettres) return s;
  const majuscules = (s.match(/\p{Lu}/gu) ?? []).length;
  if (majuscules / lettres <= RATIO_MAJUSCULES_MAX) return s;
  return s.replace(SEQUENCE_CAPITALES, (mot) =>
    NOMBRE_ROMAIN.test(mot) ? mot : mot[0] + mot.slice(1).toLowerCase()
  );
}
