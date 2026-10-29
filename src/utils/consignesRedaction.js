// ═══════════════════════════════════════════════════════════════════════════
// LES CONSIGNES DU VENDEUR POUR L'IA (29/10, lot B 1.3 — promesse faite à XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// Mail de Nico à XEWER (27/10, point 4) : « tu enregistres une fois ton propre modèle (ta structure de titre, ta
// structure de description, les infos que tu mets toujours, ta façon de présenter l'état), et FillSell s'en sert à
// chaque annonce, en le combinant avec l'analyse des photos, les infos détectées et ce que tu dictes au micro. »
// Rangées dans profiles.platform_settings.redaction.consignes, propres au compte, modifiables à tout moment
// (Réglages › Rédaction). Le serveur (supabase/functions/_shared/redaction-plateformes.ts) les lit et les ajoute au
// prompt de CHAQUE rédaction — scan Lens comme génération de l'écran de publication.
// ⛔ Elles ne servent qu'aux générations : un texte tapé par le vendeur ne passe jamais par l'IA (règle du 21/09,
//    « le texte du vendeur fait foi », et lot B partie 2). Elles ne changent jamais un FAIT (état lu, marque, taille)
//    ni les listes fermées des plateformes.
// Pur, sans réseau, partagé par l'app et le serveur (scripts/consignes-redaction-selftest.mjs).

export const CHAMPS_CONSIGNES = Object.freeze(["ton", "titre", "description", "etat", "toujours", "eviter"]);
export const TONS = Object.freeze(["simple", "precis", "chaleureux"]);
export const LONGUEUR_MAX_CONSIGNE = 600;

const LIBELLES_TON = Object.freeze({ simple: "simple et direct", precis: "précis et factuel", chaleureux: "chaleureux" });

// Un texte de consigne propre : pas de caractère de contrôle (hors tabulation et retour à la ligne), pas de balise,
// longueur bornée.
const sansControle = (s) => Array.from(s).filter((ch) => {
  const c = ch.charCodeAt(0);
  return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127);
}).join("");
const propre = (v) => sansControle(String(v ?? ""))
  .replace(/[<>]/g, "")
  .replace(/\r\n/g, "\n")
  .trim()
  .slice(0, LONGUEUR_MAX_CONSIGNE);

/**
 * Les consignes lisibles d'un objet quelconque (champs inconnus jetés, vides retirés).
 * @param {any} c
 * @returns {Record<string, string>}
 */
export function consignesValides(c) {
  const src = c && typeof c === "object" && !Array.isArray(c) ? c : {};
  /** @type {Record<string, string>} */
  const out = {};
  const ton = String(src.ton ?? "").trim().toLowerCase();
  if (TONS.includes(ton)) out.ton = ton;
  for (const k of CHAMPS_CONSIGNES) {
    if (k === "ton") continue;
    const t = propre(src[k]);
    if (t) out[k] = t;
  }
  return out;
}

/** Le vendeur a-t-il écrit au moins une consigne ? */
export function aDesConsignes(c) {
  return Object.keys(consignesValides(c)).length > 0;
}

/** Le vendeur refuse-t-il les hashtags (« pas de hashtags », « # ») dans ses consignes ? */
export function consigneSansHashtag(c) {
  const v = consignesValides(c);
  return /hashtag|#/i.test(String(v.eviter ?? ""));
}

/** Le vendeur refuse-t-il les émojis ? */
export function consigneSansEmoji(c) {
  const v = consignesValides(c);
  return /[ée]moji|smiley|[ée]motic/i.test(String(v.eviter ?? ""));
}

/**
 * Le bloc ajouté au prompt système de la rédaction ("" sans consigne : prompt d'avant, à l'identique).
 * Rédigé en français : les prompts des plateformes françaises le sont ; pour une copie dans une autre langue,
 * la directive de langue du prompt reste la règle (les consignes portent sur la forme, pas sur la langue).
 */
export function directiveConsignes(c) {
  const v = consignesValides(c);
  if (!Object.keys(v).length) return "";
  const lignes = [];
  if (v.ton) lignes.push(`- Ton : ${LIBELLES_TON[v.ton]}.`);
  if (v.titre) lignes.push(`- Structure de ses titres : ${v.titre}`);
  if (v.description) lignes.push(`- Format de ses descriptions : ${v.description}`);
  if (v.etat) lignes.push(`- Sa façon de présenter l'état : ${v.etat}`);
  if (v.toujours) lignes.push(`- À toujours mentionner : ${v.toujours}`);
  if (v.eviter) lignes.push(`- À éviter : ${v.eviter}`);
  return [
    "CONSIGNES DU VENDEUR — il les a enregistrées pour TOUTES ses annonces. Applique-les au titre et à la description :",
    ...lignes,
    "Elles priment sur le gabarit ci-dessus pour la FORME (structure, ton, mentions, hashtags, émojis, longueur dans les limites de la plateforme). " +
    "Elles ne changent JAMAIS un fait : l'état réel, la marque, la taille, ce qui est lu sur les photos ; et jamais les valeurs des listes fermées de platform_fields. " +
    "Si une consigne demande d'affirmer un fait que l'article ne permet pas d'affirmer, ignore cette consigne-là.",
  ].join("\n");
}
