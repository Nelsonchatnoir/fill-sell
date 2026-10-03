// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION D'UNE ANNONCE eBAY, EN TEXTE (03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (03/10) : « le texte du vendeur fait foi, quelle que soit la
// plateforme ». eBay rend sa description en HTML (l'API Browse, champ
// `description` : texte brut OU HTML rendu, au choix du vendeur). L'extension
// ne la lit pas (itm.ebaydesc.com est hors de ses permissions, et on n'en
// ajoute aucune) : c'est la voie API qui la lit, et ce module la remet en
// texte, tel quel.
// ⛔ AUCUNE REFORMULATION — même règle que le relevé : retours à la ligne,
//    puces et émojis gardés ; on retire seulement le balisage (les feuilles de
//    style et les scripts d'un gabarit ne sont pas du texte).
// Pur, sans dépendance : servi par ebay-account (Deno) et éprouvé par
// scripts/texte-du-vendeur-selftest.mjs (Node).

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û", ugrave: "ù", icirc: "î", iuml: "ï", euml: "ë", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—", euro: "€", laquo: "«", raquo: "»", deg: "°" };

function decoderEntites(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tout;
    }
    const v = ENTITES[e.toLowerCase()];
    return v ?? tout;
  });
}

/** Le plafond d'une description reprise : au-delà, ce n'est plus un texte
 *  d'annonce mais un gabarit (conditions de vente, boutique entière). On ne
 *  rogne pas (un texte coupé au milieu d'une phrase partirait faux) : on ne
 *  reprend RIEN, et l'article suit le chemin d'aujourd'hui. */
export const DESCRIPTION_REPRISE_MAX = 5000;

/**
 * HTML (ou texte brut) → texte. Rend "" quand il ne reste rien de lisible.
 * @param {string} html
 */
export function texteDepuisHtml(html) {
  let t = String(html ?? "");
  if (!t.trim()) return "";
  // Du HTML : un retour à la ligne du code source n'est qu'un espace, ce sont
  // les balises qui font les lignes. Un bloc (div, liste, titre) = UNE fin de
  // ligne, un paragraphe = une ligne vide — jamais une cascade de vides.
  // Du texte brut (sans balise) garde ses retours tels quels.
  if (/<\/?[a-z][^>]*>/i.test(t)) {
    t = t.replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\u0001• ")
      .replace(/<\/li\s*>/gi, "\u0001")
      .replace(/<\/?p\b[^>]*>/gi, "\u0002")
      .replace(/<\/?(div|ul|ol|h[1-6]|tr|table|tbody|thead|section|article|blockquote|center|header|footer)\b[^>]*>/gi, "\u0001")
      .replace(/<\/t[dh]\s*>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/[  ]*[\u0001\u0002][\s\u0001\u0002]*/g, (m) => (m.includes("\u0002") ? "\n\n" : "\n"));
  }
  t = decoderEntites(t)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v  ]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Une puce seule sur sa ligne (liste vide) n'est pas du texte.
  t = t.split("\n").filter((l) => l !== "•").join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > DESCRIPTION_REPRISE_MAX) return "";
  return t;
}
