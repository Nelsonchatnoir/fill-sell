// ═══════════════════════════════════════════════════════════════════════════
// « UN DVD N'A PAS D'ISBN » — côté SERVEUR (07/09/2026, lot de 24 DVD d'Ornella,
// commit app 9958a8f). COPIE MIROIR de src/utils/shared.js
// (SUPPORT_NON_LIVRE_RE, LIVRE_EXPLICITE_RE, estSupportNonLivre) : Deno ne
// peut pas importer src/, et le déploiement n'embarque que supabase/functions.
// Les deux regex doivent rester IDENTIQUES octet pour octet à celles de l'app :
// `npm run selftest:support-non-livre` le vérifie. Toute modification se fait
// aux DEUX endroits, jamais ici seul.
//
// La famille Lens `livres_medias` s'appelle littéralement « livres ET
// médias » : elle porte les livres, mais AUSSI les DVD, Blu-ray, CD, vinyles
// et jeux vidéo. Ce prédicat dit « support NON-livre », et rien d'autre :
//  · uniquement des mots qui désignent un SUPPORT physique (dvd, vinyle,
//    console…), JAMAIS un sujet. « Musique », « film » et « série » sont
//    volontairement ABSENTS : un livre parle toujours de son sujet — leçon
//    Delavier (« La Méthode Delavier de MUSCULATION » reste un livre), qu'on
//    ne rejoue pas à l'envers ;
//  · DÉSARMÉ dès que le texte nomme explicitement un livre (« méthode + CD »,
//    « roman », « manga », « tome ») : un livre vendu avec un CD reste un
//    livre — le faux positif le plus probable de toute la règle.
// Lecteurs serveur : ebay-api-worker (garde famille livres de la catégorie),
// _shared/ebay-publication (estLivre → « Modèle : Ne s'applique pas »,
// et l'aspect ISBN jamais réclamé à un média).
// ═══════════════════════════════════════════════════════════════════════════
export const SUPPORT_NON_LIVRE_RE =
  /\b(dvd|blu[-\s]?ray|vhs|k7|laserdisc|vinyles?|33\s?tours|45\s?tours|cd|cds|cd-?rom|jeux?\s+vid[ée]o|video\s?games?|consoles?|playstation|xbox|nintendo|game\s?boy|gamecube|megadrive|dreamcast)\b/i;
export const LIVRE_EXPLICITE_RE =
  /\b(livres?|romans?|mangas?|bandes?\s+dessin[ée]es?|bd|tomes?|beaux?[-\s]livres?|books?|novels?|isbn)\b/i;

// true = le texte désigne un support vidéo/audio/jeu, donc PAS un livre, donc
// PAS d'ISBN. Même signature que l'app : autant de textes qu'on veut (titre,
// description…), joints par un espace.
export function estSupportNonLivre(...textes: unknown[]): boolean {
  const t = textes.filter(Boolean).map(String).join(" ");
  if (!t.trim()) return false;
  if (LIVRE_EXPLICITE_RE.test(t)) return false;
  return SUPPORT_NON_LIVRE_RE.test(t);
}
