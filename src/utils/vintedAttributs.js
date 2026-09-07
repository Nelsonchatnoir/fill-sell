// ═══════════════════════════════════════════════════════════════════════════
// LES LIBELLÉS VINTED DEVIENNENT inventaire.attributs (2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule traduction, partagée par les deux affluents qui apportent de la
// donnée Vinted à l'article :
//   · le DÉTAIL lu au clic Publier (chemin léger, un appel, aucune photo
//     ré-hébergée) — source 'vinted_detail' ;
//   · une CAPTURE de republication déjà en base — source 'capture'.
// Les deux rendent le même objet `libelles`, DÉJÀ RÉSOLU par l'extension
// (« M / 38 / 10 », « Très bon état », « Sans marque ») : aucun identifiant
// brut ne passe par ici, et rien n'est deviné — un libellé absent reste absent.
//
// PRIORITÉS (posées côté base par inventaire_attributs_fusion_trg) :
//   manuel 5 > vinted_detail 4 > capture 3 > vinted_liste 2 > lens 1 >
//   backfill_job 0. Écrire ici ne peut donc jamais écraser une saisie de
//   l'utilisateur, quelle que soit la fraîcheur de la donnée Vinted.
//
// ⛔ NON-RÉGRESSION (règle du 07/09) : la MARQUE n'est jamais proposée quand
// l'article en porte déjà une. Mesuré sur les 2 278 articles capturés : 7
// divergences, dont 4 où Vinted était MOINS bon — ses marques fourre-tout
// (« Boutique Belgique », « boutique italienne », « Vintage Dressing »)
// remplaçaient « Flamant Rose » ou « Sans marque ». On comble un vide, on ne
// remplace pas un choix.
// ═══════════════════════════════════════════════════════════════════════════

/** Marques « fourre-tout » de Vinted : un rangement, pas une marque. */
const MARQUES_SANS_VALEUR = /^(boutique\s|vintage dressing$|autre$|autres$)/i;

/**
 * Traduit les libellés d'une lecture Vinted en champs d'inventaire.attributs.
 * @param {object} libelles   { taille, etat, marque, couleurs[], isbn, colis, categoryPath }
 * @param {object} natif      payload d'édition Vinted (pour catalog_id / mesures)
 * @param {"vinted_detail"|"capture"} source
 * @param {object} contexte   { marqueDejaConnue } — garde de non-régression
 * @returns {{attributs: object, catalogId: number|null, description: string|null}}
 */
export function attributsDepuisVinted(libelles, natif, source, contexte = {}) {
  const at = new Date().toISOString();
  const attributs = {};
  const poser = (cle, valeur) => {
    const v = typeof valeur === "string" ? valeur.trim() : valeur;
    if (v == null || v === "") return;
    attributs[cle] = { v, source, at };
  };

  const l = libelles && typeof libelles === "object" ? libelles : {};
  poser("taille", l.taille);
  poser("etat", l.etat);
  poser("isbn", l.isbn);
  poser("colis", l.colis);
  if (Array.isArray(l.couleurs)) {
    poser("couleur", l.couleurs[0]);
    poser("couleur2", l.couleurs[1]);
  }
  // Marque : seulement si l'article n'en a aucune, et jamais un fourre-tout.
  const marque = String(l.marque ?? "").trim();
  if (marque && !contexte.marqueDejaConnue && !MARQUES_SANS_VALEUR.test(marque)) {
    poser("marque", marque);
  }
  // Mesures : Vinted les porte en centimètres sur le payload d'édition. Elles
  // n'ont de sens que pour eBay (aspects dédiés) ; on les garde telles quelles.
  const n = natif && typeof natif === "object" ? natif : {};
  for (const [cle, champ] of [["mesure_longueur", "measurement_length"], ["mesure_largeur", "measurement_width"]]) {
    const val = Number(n[champ]);
    if (Number.isFinite(val) && val > 0) poser(cle, String(val));
  }
  const catalogId = Number(n.catalog_id);
  if (Number.isFinite(catalogId) && catalogId > 0) {
    attributs.categorie_vinted = { v: catalogId, source, at, ...(Array.isArray(l.categoryPath) ? { chemin: l.categoryPath } : {}) };
  }

  // ── D'OÙ VIENT LA DESCRIPTION (2026-09-07, question de Nico) ─────────────
  // Le verrou « on ne réécrit pas la description » ne doit protéger que le
  // texte de la VENDEUSE. Or `inventaire.description` peut aussi porter un
  // texte que NOUS avons produit : un article créé par le Lens ou par la
  // saisie vocale y range la description d'analyse. Verrouiller celle-là
  // figerait notre propre brouillon à la place d'une vraie annonce rédigée par
  // plateforme — une régression de qualité, sans aucun risque de litige à
  // couvrir. On marque donc explicitement l'origine, et le verrou ne s'applique
  // qu'aux descriptions VINTED. Tout le reste garde le comportement d'avant.
  const description = typeof n.description === "string" && n.description.trim() ? n.description : null;
  if (description) attributs.description_source = { v: "vinted", source, at };

  return {
    attributs,
    catalogId: Number.isFinite(catalogId) && catalogId > 0 ? catalogId : null,
    description,
  };
}

// ── LA DESCRIPTION DE LA VENDEUSE NE SE RÉÉCRIT PAS (2026-09-07) ────────────
// Règle posée par Nico : « une vendeuse qui signale les défauts de son vêtement
// ne doit jamais voir ce texte remplacé par une description générée — c'est un
// risque de litige pour elle ». Une description Vinted présente est donc
// publiée TELLE QUELLE sur les trois autres plateformes, et l'IA n'est même pas
// appelée pour ce texte (l'appel serait payé pour être jeté).
// SEULE EXCEPTION, demandée elle aussi : une description vide ou d'UN SEUL MOT
// ne dit rien de l'article — l'IA reprend alors la main.
// Mesure du 07/09 sur 2 278 articles capturés : 0 description vide, médiane
// 123 caractères, maximum 1 982 (Vinted plafonne à 3 000) — aucune ne dépasse
// la limite d'une plateforme, donc aucune troncature n'est jamais nécessaire.
export function descriptionVendeuseUtilisable(description) {
  const t = String(description ?? "").trim();
  if (!t) return false;
  return t.split(/\s+/).filter(Boolean).length >= 2;
}
