// ═══════════════════════════════════════════════════════════════════════════
// UNE PHOTO MORTE CHEZ LA PLATEFORME NE BLOQUE PLUS LA PUBLICATION (29/10)
// ═══════════════════════════════════════════════════════════════════════════
// ornellaracano, « Fausse plante tropicale 107 cm + pot noir » (job 64da7249, Leboncoin, 29/10 07:36 → 07:52) :
// la fiche importée de Vinted garde sa photo 2 sur images1.vinted.net ; la page de dépôt ne peut pas la lire,
// les deux balayages de rapatriement du serveur échouent (la photo n'existe plus chez Vinted — relue au
// navigateur le 29/10 : refus), et le message promettait « FillSell la rapatrie automatiquement et relance la
// publication toute seule » : faux pour toujours, la publication restait « pas abouti après plusieurs essais ».
// LA RÈGLE : après les deux balayages, UNE vérification de plus par job. Une photo encore lisible est rapatriée ;
// une photo qui répond 404 ou 410 (le serveur a lu 404 à 07:54 et 07:57) est retirée de la COPIE du job (la fiche n'est pas touchée), à
// condition qu'il reste au moins une photo, toutes à nous. La publication repart, et le message dit quelle photo
// manque et pourquoi. Rien n'est inventé ; un refus passager (5xx, réseau) ne retire jamais rien.
// Pur (Deno + Node) : scripts/photos-mortes-selftest.mjs.

const urlDe = (p) => (typeof p === "string" ? p : (p && typeof p === "object" && typeof p.url === "string" ? p.url : null));

/** Le nom de la plateforme qui hébergeait la photo. */
export function plateformeDePhoto(u) {
  const h = (() => { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ""; } })();
  if (/(^|\.)vinted\.(net|fr|com)$/.test(h)) return "Vinted";
  if (/(^|\.)beebs\.app$/.test(h)) return "Beebs";
  if (/(^|\.)leboncoin\.fr$/.test(h)) return "Leboncoin";
  if (/(^|\.)(ebayimg|ebay)\.com$/.test(h)) return "eBay";
  return "sa plateforme d'origine";
}

/**
 * Le verdict, pur.
 * @param {{ photos: unknown[], vivantes: Map<string, string>, mortes: Map<string, number>, estExterne: (u: string | null) => boolean }} arg
 *   photos    : les photos du job (chaînes ou { url }) ;
 *   vivantes  : url externe → url rapatriée chez nous ;
 *   mortes    : url externe → statut HTTP du refus permanent (4xx) ;
 *   estExterne: url encore hébergée chez une plateforme ?
 * @returns {{ verdict: "relancee" | "inchangee", photos: unknown[], indices: number[], message: string | null }}
 */
export function trancherPhotosMortes({ photos, vivantes, mortes, estExterne }) {
  const liste = Array.isArray(photos) ? photos : [];
  const indices = liste.map((p, i) => (mortes.has(String(urlDe(p))) ? i + 1 : 0)).filter(Boolean);
  const restantes = liste
    .filter((p) => !mortes.has(String(urlDe(p))))
    .map((p) => {
      const u = urlDe(p);
      const nv = u ? vivantes.get(u) : undefined;
      if (!nv) return p;
      return typeof p === "string" ? nv : { ...p, url: nv };
    });
  const toutesANous = restantes.every((p) => !estExterne(urlDe(p)));
  if (!restantes.length || !toutesANous || !(mortes.size || vivantes.size)) {
    return { verdict: "inchangee", photos: liste, indices, message: null };
  }
  const message = mortes.size
    ? `Reprise automatique : ${indices.length > 1 ? `les photos ${indices.join(", ")} n'existent` : `la photo ${indices[0]} n'existe`} plus chez ` +
      `${plateformeDePhoto([...mortes.keys()][0])} (supprimée là-bas). L'annonce part avec ${restantes.length > 1 ? `les ${restantes.length} autres photos` : "l'autre photo"} — ` +
      "tu peux en ajouter depuis la fiche de l'article."
    : "Reprise automatique : une photo de l'annonce était restée hébergée hors FillSell. Elle a été rapatriée et la publication repart toute seule — rien à faire.";
  return { verdict: "relancee", photos: restantes, indices, message };
}
