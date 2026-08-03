// Filtre des hallucinations Whisper (2026-08-03).
//
// Sur un audio vide ou inaudible, Whisper ne rend PAS une erreur : il invente
// ses phrases fétiches (crédits de sous-titres, remerciements de fin de vidéo)
// ou recrache le prompt de biasing qu'on lui envoie (la liste de marques
// ci-dessous). Relevé prod du 03/08 (usage_logs, feature voice_intent, depuis
// le 01/07) : 24 appels sur 215 étaient l'une de ces phrases — facturés
// Whisper PUIS Haiku, et rendus tasks: [] à l'utilisateur sans aucun message.
//
// Chaque famille de motifs ci-dessous a été OBSERVÉE en prod (dont la graphie
// « para la communauté » et l'écho du prompt de marques). Le filtre est
// volontairement conservateur : signatures de sous-titrage impossibles dans
// une phrase de revendeur, formules de politesse SEULES (texte entier), et
// écho où 100 % des mots viennent du prompt. Ne pas élargir sans relevé.

// Prompt de biasing envoyé à Whisper par voice-transcribe. Vit ici pour que
// la détection d'écho reste alignée sur ce qui est réellement envoyé : toute
// marque ajoutée au prompt entre automatiquement dans le vocabulaire d'écho.
export const WHISPER_BIAS_PROMPT =
  "FillSell, Vinted, eBay, Erborian, Medik8, Stihl, Levi's, Zara, Nike, Adidas, Hermès, Chanel, Louboutin, Patagonia, North Face, Balenciaga, Vestiaire Collective";

// minuscules + accents retirés + espaces réduits
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Signatures de crédits vidéo : leur PRÉSENCE suffit, où que ce soit dans le
// texte — aucune phrase de revendeur ne les contient.
const SIGNATURES = [
  "amara.org",           // « Sous-titres réalisés para/par la communauté d'Amara.org »
  "soustitreur",         // « ❤️ par SousTitreur.com » (7 occurrences en prod)
  "sous-titr",           // sous-titres / sous-titrage (dont « ST' 501 », Radio-Canada)
  "radio-canada",
  "merci d'avoir regarde",   // « Merci d'avoir regardé cette vidéo ! » (4 occ.)
  "thank you for watching",
  "thanks for watching",
  "laissez un commentaire",  // observé le 31/07
  "n'oubliez pas de vous abonner",
  "abonnez-vous a la chaine",
  "subscribe to the channel",
];

// Formules que Whisper pose sur du silence — hallucination seulement si le
// texte ENTIER s'y réduit (ponctuation ôtée). « Bon appétit ! » et « Adios »
// observés en prod ; une vraie phrase qui les CONTIENT passe.
const TEXTE_ENTIER = new Set([
  "merci",
  "thank you",
  "bon appetit",
  "adios",
  "au revoir",
  "a bientot",
  "ciao",
  "amen",
  "bye bye",
]);

const VOCAB_PROMPT = new Set(
  normaliser(WHISPER_BIAS_PROMPT).split(/[\s,]+/).filter(Boolean),
);

/**
 * Rend la raison du rejet, ou null si le texte semble être une vraie parole.
 * Raisons : "silence" (vide ou ponctuation seule), "credits_video"
 * (signature de sous-titres/fin de vidéo), "formule_seule" (politesse posée
 * sur du silence), "echo_prompt" (Whisper recrache la liste de marques).
 */
export function detecterHallucinationWhisper(texte: string): string | null {
  const brut = (texte ?? "").trim();
  if (!brut || /^[\s.!?…,:;'"«»\-]*$/.test(brut)) return "silence"; // « ... » : 3 occ. prod

  const norme = normaliser(brut);
  for (const s of SIGNATURES) {
    if (norme.includes(s)) return "credits_video";
  }

  const sansPonctuation = norme.replace(/[.!?…,:;'"«»]/g, "").replace(/\s+/g, " ").trim();
  if (TEXTE_ENTIER.has(sansPonctuation)) return "formule_seule";

  // Écho du prompt : « Vinted, eBay, Erborian, Medik8, Zara, Nike, … » (2 occ.
  // prod, dont une de 25 mots). 5 mots minimum ET 100 % issus du prompt :
  // « j'ai vendu des Nike et des Adidas » contient « vendu » → passe.
  const mots = norme.split(/[\s,.!?]+/).filter(Boolean);
  if (mots.length >= 5 && mots.every((m) => VOCAB_PROMPT.has(m))) return "echo_prompt";

  return null;
}
