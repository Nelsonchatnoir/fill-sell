// ═══════════════════════════════════════════════════════════════════════════
// LA STRATÉGIE DE PRIX DU VENDEUR (29/10, lot B 1.4 — promesse faite à XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// Mail de Nico à XEWER (27/10, point 5) : « ta logique de prix fera partie de tes consignes. Vente rapide à prix
// attractif, prix du marché ou prix plus haut pour attendre le bon acheteur, c'est toi qui choisis ta ligne, et
// l'estimation la suivra. »
// La matière existe déjà dans l'analyse (lens-analysis) : fourchette_marche { bas, moyen, haut } et
// prix_vente_suggere. La stratégie ne fait que CHOISIR la borne — aucun appel, aucune IA, aucun prix inventé.
// ⛔ Un prix tapé par le vendeur n'est JAMAIS recalculé : la stratégie ne sert qu'à l'estimation qu'il demande
//    (« Estimer avec l'IA ») et à l'affichage avant la publication.
// Rangée dans profiles.platform_settings.redaction.strategie_prix ('rapide' | 'marche' | 'haut', absent = 'marche',
// le comportement d'avant). Pur, partagé par l'app (scripts/strategie-prix-selftest.mjs).

export const STRATEGIES_PRIX = Object.freeze(["rapide", "marche", "haut"]);
export const STRATEGIE_PAR_DEFAUT = "marche";

export const LIBELLES_STRATEGIE = Object.freeze({
  fr: Object.freeze({
    rapide: "vente rapide",
    marche: "prix du marché",
    haut: "prix haut",
  }),
  en: Object.freeze({
    rapide: "quick sale",
    marche: "market price",
    haut: "higher price",
  }),
});

// Les mots du mail du 27/10, pour l'écran Réglages.
export const TITRES_STRATEGIE = Object.freeze({
  fr: Object.freeze({
    rapide: "Vente rapide, prix attractif",
    marche: "Prix du marché",
    haut: "Prix plus haut, attendre le bon acheteur",
  }),
  en: Object.freeze({
    rapide: "Quick sale, attractive price",
    marche: "Market price",
    haut: "Higher price, wait for the right buyer",
  }),
});

/** La stratégie lisible d'une valeur quelconque (absente ou inconnue → prix du marché). */
export function strategieValide(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return STRATEGIES_PRIX.includes(s) ? s : STRATEGIE_PAR_DEFAUT;
}

export function libelleStrategie(v, lang = "fr") {
  return LIBELLES_STRATEGIE[lang === "en" ? "en" : "fr"][strategieValide(v)];
}

const nombre = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Un prix de revente se tape à l'euro : 23,6 € devient 24 €, jamais moins de 1 €.
const arrondi = (n) => Math.max(1, Math.round(n));

/**
 * Le prix que l'estimation propose selon la stratégie, lu dans le résultat de l'analyse.
 * Rend { prix, borne: 'bas'|'moyen'|'haut'|'suggere', fourchette: { bas, haut } | null, strategie } ou null
 * quand l'analyse ne porte aucun prix (mode identify, échec).
 */
export function prixSelonStrategie(analyse, strategie) {
  const s = strategieValide(strategie);
  const f = analyse && typeof analyse === "object" && analyse.fourchette_marche && typeof analyse.fourchette_marche === "object"
    ? analyse.fourchette_marche : null;
  const bas = nombre(f?.bas) ?? nombre(analyse?.fourchette_min);
  const haut = nombre(f?.haut) ?? nombre(analyse?.fourchette_max);
  const moyen = nombre(f?.moyen);
  const suggere = nombre(analyse?.prix_vente_suggere);
  const fourchette = bas != null && haut != null && haut >= bas ? { bas, haut } : null;
  let prix = null;
  let borne = null;
  if (s === "rapide" && bas != null) { prix = bas; borne = "bas"; }
  else if (s === "haut" && haut != null) { prix = haut; borne = "haut"; }
  else if (moyen != null) { prix = moyen; borne = "moyen"; }
  if (prix == null && suggere != null) { prix = suggere; borne = "suggere"; }
  if (prix == null) return null;
  return { prix: arrondi(prix), borne, fourchette, strategie: s };
}

/** La position (0 → 1) du prix dans la fourchette, pour la jauge de l'écran (null sans fourchette). */
export function positionDansFourchette(prix, fourchette) {
  const p = nombre(prix);
  if (p == null || !fourchette || !(fourchette.haut > fourchette.bas)) return null;
  return Math.min(1, Math.max(0, (p - fourchette.bas) / (fourchette.haut - fourchette.bas)));
}
