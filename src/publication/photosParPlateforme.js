// ═══════════════════════════════════════════════════════════════════════════
// LES PHOTOS DE CHAQUE PLATEFORME (30/10/2026, lot E — thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : toutes les photos de la fiche partaient partout, et chaque plateforme
// coupait à sa limite (Beebs garde les 10 premières, Depop les 8 premières,
// Leboncoin ses photos gratuites) — la personne ne choisissait rien.
// Désormais, sur la carte de chaque plateforme (comme le titre, le prix et la
// description) : voir toutes les photos de la fiche, choisir lesquelles partent,
// en retirer, les réordonner — dans la limite de la plateforme. Le choix vit
// dans edited[plateforme].photos (URLs, dans l'ordre) ; absent = la règle
// d'avant, à l'identique (toutes les photos, la plateforme coupe).
// Un job dont les photos sont CHOISIES :
//   · porte platform_fields.photos_choisies = true (jamais « complété » par les
//     photos de la fiche : contenuAImposer, photosApresRayonRetrouve) ;
//   · porte lbcPhotosCapped = true : spend_coins_and_publish ne réécrit jamais
//     la fiche avec la liste d'un job qui n'en porte qu'un extrait (règle du
//     27/09, même drapeau — aucune migration).
// Pur (Node + navigateur) : scripts/lot-e-3010-selftest.ts.

// La limite de photos de chaque plateforme (relevée sur les formulaires, cf. docs/regles/plateformes.md) :
// Leboncoin offre au plus 20 photos, dont seules les GRATUITES partent (lues au dépôt, dans l'ordre choisi).
export const PHOTOS_MAX_PLATEFORME = Object.freeze({ vinted: 20, depop: 8, beebs: 10, ebay: 24, leboncoin: 20, opla: 20 });
export const photosMaxPlateforme = (platform) => PHOTOS_MAX_PLATEFORME[platform] ?? 20;

/** Les URLs qui partiront sans choix de la personne (ce que la plateforme garde). */
export function photosParDefaut(platform, toutes) {
  return (toutes ?? []).slice(0, photosMaxPlateforme(platform));
}

/** Un choix valable : des URLs de la fiche, sans doublon, dans la limite ; sinon null (règle d'avant). */
export function choixValide(platform, choix, toutes) {
  if (!Array.isArray(choix)) return null;
  const connues = new Set(toutes ?? []);
  const vus = new Set();
  const propre = choix.filter((u) => typeof u === "string" && connues.has(u) && !vus.has(u) && vus.add(u));
  return propre.length ? propre.slice(0, photosMaxPlateforme(platform)) : null;
}

/** Le choix est-il différent de ce qui partirait sans lui ? */
export function choixDifferent(platform, choix, toutes) {
  const c = choixValide(platform, choix, toutes);
  if (!c) return false;
  const d = photosParDefaut(platform, toutes);
  return c.length !== d.length || c.some((u, i) => u !== d[i]);
}

/**
 * Les photos du job d'une plateforme : { photos, choisies }. `photosJob` : les entrées {type,url} de la fiche
 * (entreesPhotos), `choix` : edited[plateforme].photos.
 */
export function photosDuJob(platform, photosJob, choix) {
  const toutes = (photosJob ?? []).map((p) => p?.url).filter(Boolean);
  const c = choixValide(platform, choix, toutes);
  if (!c || !choixDifferent(platform, c, toutes)) return { photos: photosJob ?? [], choisies: false };
  const parUrl = new Map((photosJob ?? []).map((p) => [p.url, p]));
  return { photos: c.map((u) => parUrl.get(u)).filter(Boolean), choisies: true };
}
