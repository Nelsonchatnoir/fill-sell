// ── Palette couleurs Vinted : liste FERMÉE + normalisation ───────────────────
//
// Origine du chantier (2026-07-30, job 243097d4) : l'IA a émis couleur
// "Argent", qui n'est PAS un libellé de la palette Vinted ("Argenté") — le
// sélecteur de l'extension n'a rien trouvé, a laissé le champ vide, et le
// serveur a refusé le dépôt :
//   /api/v2/item_upload/items → 400 {"code":99, "field":"color",
//     "Le champ Couleur doit être renseigné"}
// Règle : la charge utile VINTED (platform_fields.colors) ne porte QUE des
// libellés exacts de cette palette — jamais une valeur libre. Les champs
// couleur Leboncoin/Beebs sont LIBRES et ne passent pas par ici.
//
// PALETTE RELEVÉE LE 2026-07-30 sur l'API RÉELLE (GET vinted.fr/api/v2/colors,
// session anonyme, Accept-Language fr-FR) — 29 libellés, dans l'ordre `order`
// de l'API. Diffère des listes qui circulent en ligne : Corail, Fuchsia et
// Transparence existent bel et bien. Les codes serveur sont en commentaire
// pour retrouver la correspondance dans les payloads réseau.
export const VINTED_COLORS = [
  "Noir",        // BLACK
  "Gris",        // GREY
  "Blanc",       // WHITE
  "Crème",       // CREAM
  "Beige",       // BODY
  "Abricot",     // APRICOT
  "Orange",      // ORANGE
  "Corail",      // CORAL
  "Rouge",       // RED
  "Bordeaux",    // BURGUNDY
  "Fuchsia",     // PINK
  "Rose",        // ROSE
  "Violet",      // PURPLE
  "Lila",        // LILAC
  "Bleu clair",  // LIGHT-BLUE
  "Bleu",        // BLUE
  "Marine",      // NAVY
  "Turquoise",   // TURQUOISE
  "Menthe",      // MINT
  "Vert",        // GREEN
  "Vert foncé",  // DARK-GREEN
  "Kaki",        // KHAKI
  "Marron",      // BROWN
  "Moutarde",    // MUSTARD
  "Jaune",       // YELLOW
  "Argenté",     // SILVER
  "Doré",        // GOLD
  "Multicolore", // VARIOUS
  "Transparence",// CLEAR
];

// Comparaison insensible à la casse et aux accents ("Crème"/"creme").
const strip = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const PALETTE_BY_KEY = new Map(VINTED_COLORS.map((t) => [strip(t), t]));

// Variantes courantes → libellé palette. Clés en forme strip() (minuscules,
// sans accents). Établies depuis les valeurs réellement observées en base le
// 2026-07-30 ("Argent" ×3 — l'échec du job 243097d4) complétées des synonymes
// évidents ; volontairement CONSERVATRICE : une variante douteuse vaut mieux
// en color_unmapped qu'en mauvaise couleur. "V" (×7 en base, troncature IA)
// est indevinable — il part en color_unmapped, c'est voulu.
const VINTED_COLOR_VARIANTS = {
  "argent": "Argenté",
  "silver": "Argenté",
  "or": "Doré",
  "gold": "Doré",
  "bleu marine": "Marine",   // AVANT le scan par mots : sinon Bleu + Marine
  "navy": "Marine",
  "bleu ciel": "Bleu clair",
  "ciel": "Bleu clair",
  "anthracite": "Gris",
  "gris anthracite": "Gris",
  "ecru": "Crème",
  "ivoire": "Crème",
  "camel": "Marron",
  "fushia": "Fuchsia",       // faute d'orthographe fréquente
  "transparent": "Transparence",
  "transparente": "Transparence",
  "multicolor": "Multicolore",
  "multi": "Multicolore",
};

// Scan par mots entiers, libellés composés d'abord ("Bleu clair", "Vert
// foncé" avant "Bleu"/"Vert") : "Bleu gris" → Bleu + Gris, "Gris anthracite"
// → Gris. Chaque libellé trouvé est retiré du segment pour ne pas re-matcher.
const SCAN_ORDER = [...VINTED_COLORS].sort((a, b) => {
  const wa = strip(a).split(" ").length, wb = strip(b).split(" ").length;
  return wb - wa || strip(b).length - strip(a).length;
});

// Normalise une couleur source (IA ou éditée, éventuellement composée :
// "Marine et Blanc", "Bleu gris", "Argent") vers AU PLUS DEUX libellés exacts
// de la palette (limite du picker Vinted, dominante d'abord).
// Retour : { colors: string[], unmapped: string|null } — unmapped porte la
// valeur brute quand RIEN ne se normalise (posée en
// platform_fields.color_unmapped par l'appelant, requêtable en SQL).
export function normalizeVintedColors(raw) {
  const out = [];
  const push = (title) => {
    if (title && !out.includes(title) && out.length < 2) out.push(title);
  };
  // Mêmes séparateurs que l'ancien split (dominante d'abord).
  const segments = String(raw ?? "")
    .split(/\s+et\s+|[,/&+]/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    const key = strip(seg);
    if (PALETTE_BY_KEY.has(key)) { push(PALETTE_BY_KEY.get(key)); continue; }
    if (VINTED_COLOR_VARIANTS[key]) { push(VINTED_COLOR_VARIANTS[key]); continue; }
    let rest = ` ${key} `;
    for (const title of SCAN_ORDER) {
      const k = ` ${strip(title)} `;
      if (rest.includes(k)) { push(title); rest = rest.replace(k, " "); }
    }
  }
  const brut = String(raw ?? "").trim();
  return { colors: out, unmapped: out.length || !brut ? null : brut };
}
