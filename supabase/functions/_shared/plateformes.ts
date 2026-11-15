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
 * Les plateformes CONNUES des mails, dans l'ordre d'affichage. Opla y reste
 * (une vente vue sur Opla se nomme encore « Vendu sur Opla » chez les comptes
 * au dressing Opla synchronisé), mais elle n'est plus PROPOSÉE depuis la
 * sortie d'Opla du 02/10/2026 : cf. SLUGS_PLATEFORMES_PROPOSEES.
 */
export const PLATEFORMES: Readonly<Record<string, DescriptionPlateforme>> = {
  vinted: { label: "Vinted", logo: "logo-vinted.png" },
  leboncoin: { label: "Leboncoin", logo: "logo-leboncoin.png" },
  ebay: { label: "eBay", logo: "logo-ebay.png" },
  // (29/10/2026) Nouveau logo Beebs (jaune, « B » noir) sous un NOUVEAU nom : les images de fillsell.app sont servies
  // « immutable » un an (vercel.json) ; l'ancien fichier reste en ligne pour les mails déjà envoyés.
  beebs: { label: "Beebs", logo: "logo-beebs-2910.png" },
  opla: { label: "Opla", logo: "logo-opla.png" },
  // Depop (09/10/2026) : nommée pour les comptes où elle est ouverte (« Vendu
  // sur Depop »). (15/11/2026, point 1 du lot (2) de Nico) PROPOSÉE comme les
  // autres : FillSell publie aussi sur Depop (cf. SLUGS_PLATEFORMES_PROPOSEES).
  depop: { label: "Depop", logo: "logo-depop.png" },
};

/** Les slugs, dans l'ordre. */
export const SLUGS_PLATEFORMES: readonly string[] = Object.keys(PLATEFORMES);

/**
 * Les plateformes que FillSell PROPOSE (02/10/2026, sortie d'Opla) : celles
 * qu'un mail énumère (« il part sur … »), dont il montre les logos et qu'il
 * cite au pied. Opla n'en fait plus partie.
 *
 * (15/11/2026, point 1 du lot (2) de Nico) Depop en fait partie : l'en exclure
 * (09/10) faisait annoncer « Vinted, Leboncoin, eBay et Beebs » et quatre logos
 * dans le mail de bienvenue, alors que FillSell publie aussi sur Depop. Ordre
 * des mails : Vinted, Leboncoin, eBay, Beebs, Depop. Verrou :
 * selftest:mails-plateformes-completes.
 */
export const SLUGS_PLATEFORMES_PROPOSEES: readonly string[] = SLUGS_PLATEFORMES.filter((s) => s !== "opla");

// (15/11/2026) Un nombre en toutes lettres, au féminin (« cinq plateformes »,
// « quatre autres ») : un mail qui COMPTE les plateformes proposées le lit ici,
// jamais en dur — « Quatre plateformes » avait survécu dans le blast d'août.
const NOMBRES_EN_LETTRES: Readonly<Record<string, readonly string[]>> = {
  fr: ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"],
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"],
};

/** « cinq » / « five » ; au-delà de dix, le chiffre. */
export function nombreEnLettres(n: number, lang: string): string {
  const mots = NOMBRES_EN_LETTRES[lang === "en" ? "en" : "fr"];
  return Number.isInteger(n) && n >= 0 && n < mots.length ? mots[n] : String(n);
}

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

/** Les plateformes proposées, en clair, pour les phrases qui les listent toutes. */
export function toutesLesPlateformes(lang: string): string {
  return listeNaturelle(
    SLUGS_PLATEFORMES_PROPOSEES.map((s) => PLATEFORMES[s].label),
    lang,
  );
}
