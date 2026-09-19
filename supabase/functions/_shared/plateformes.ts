// ============================================================================
// Les plateformes, nommées UNE FOIS pour tous les emails.
//
// POURQUOI CE FICHIER EXISTE (relevé du 19/09/2026)
// email-tunnel portait sa propre table :
//     const PLATEFORME_LABEL = { vinted, leboncoin, ebay, beebs };
//     const labelPlateforme = (p) => PLATEFORME_LABEL[p] ?? p;
// Le `?? p` imprimait le SLUG BRUT dès qu'une plateforme manquait à la table.
// Opla n'y était pas — et Opla tourne (59 jobs créés en 10 jours au relevé) :
// un mail de relance sur un job Opla écrivait « Tu as préparé … pour opla »,
// en minuscules, au client.
//
// LA GARDE : labelPlateforme() rend `null` sur un slug inconnu, JAMAIS le slug.
// Les appelants passent par plateformesEnClair(), qui filtre les inconnus et
// retombe sur une formule générique si la liste devient vide. Un slug inconnu
// part en console.warn : il est visible dans les logs de la fonction, jamais
// dans la boîte de quelqu'un.
//
// ⛔ Toute nouvelle plateforme s'ajoute ICI, et son logo dans public/email/.
//    Pas de seconde table ailleurs : c'est exactement comme ça que le trou
//    Opla est né.
// ============================================================================

/** Base des logos de plateformes (public/email/, servi par fillsell.app). */
export const BASE_LOGOS = "https://fillsell.app/email";

export interface DescriptionPlateforme {
  /** Nom tel qu'il s'écrit pour un humain. */
  readonly label: string;
  /** Fichier dans public/email/. */
  readonly logo: string;
}

/**
 * Les CINQ plateformes, dans l'ordre d'affichage des mails.
 * Opla est la cinquième depuis le 15/09/2026.
 */
export const PLATEFORMES: Readonly<Record<string, DescriptionPlateforme>> = {
  vinted: { label: "Vinted", logo: "logo-vinted.png" },
  leboncoin: { label: "Leboncoin", logo: "logo-leboncoin.png" },
  ebay: { label: "eBay", logo: "logo-ebay.png" },
  beebs: { label: "Beebs", logo: "logo-beebs.png" },
  opla: { label: "Opla", logo: "logo-opla.png" },
};

/** Les slugs, dans l'ordre. */
export const SLUGS_PLATEFORMES: readonly string[] = Object.keys(PLATEFORMES);

/**
 * Nom lisible d'une plateforme, ou `null` si le slug est inconnu.
 * ⛔ Ne JAMAIS remplacer ce null par le slug : c'est toute la garde.
 */
export function labelPlateforme(slug: unknown): string | null {
  const cle = String(slug ?? "").trim().toLowerCase();
  const connue = PLATEFORMES[cle];
  if (connue) return connue.label;
  if (cle) console.warn("plateforme_inconnue_dans_un_email", cle);
  return null;
}

/** Énumération naturelle : « a, b et c » / « a, b and c ». */
export function listeNaturelle(morceaux: string[], lang: string): string {
  const et = lang === "en" ? "and" : "et";
  const xs = morceaux.filter(Boolean);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} ${et} ${xs[xs.length - 1]}`;
}

/**
 * Les plateformes citées dans une phrase, en clair, dédoublonnées et dans
 * l'ordre canonique.
 *
 * Aucun slug inconnu n'en sort. Si TOUS les slugs sont inconnus (plateforme
 * neuve pas encore déclarée ici), on rend une formule générique plutôt qu'une
 * phrase tronquée : « tes plateformes » / « your marketplaces ».
 */
export function plateformesEnClair(slugs: unknown[], lang: string): string {
  const vus = new Set<string>();
  for (const s of slugs ?? []) {
    const cle = String(s ?? "").trim().toLowerCase();
    if (PLATEFORMES[cle]) vus.add(cle);
    else labelPlateforme(cle); // pour le console.warn, et rien d'autre
  }
  const labels = SLUGS_PLATEFORMES
    .filter((s) => vus.has(s))
    .map((s) => PLATEFORMES[s].label);
  if (labels.length === 0) return lang === "en" ? "your marketplaces" : "tes plateformes";
  return listeNaturelle(labels, lang);
}

/** Les cinq noms, en clair, pour les phrases qui les listent toutes. */
export function toutesLesPlateformes(lang: string): string {
  return listeNaturelle(
    SLUGS_PLATEFORMES.map((s) => PLATEFORMES[s].label),
    lang,
  );
}
