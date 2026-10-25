// ═══════════════════════════════════════════════════════════════════════════
// DEPOP — LA COPIE D'UNE REPUBLICATION SE COMPLÈTE AVANT LE DÉPART (24/10, lot « zéro blocage », A2)
// ═══════════════════════════════════════════════════════════════════════════
// Thibault, 24/10 : 29 republications Depop en pause « la description, le rayon
// Depop et l'état manquent dans la copie » ou « indique les frais de port », alors
// que tout est en base. Cause : la copie d'une republication recopie le DERNIER job
// publié de l'annonce (spend_coins_and_republish) ; pour une annonce Depop déposée
// par FillSell sans numéro (platform_listing_id NULL), le relevé crée un second job
// « published » de SUIVI, vide (`source: releve`) — c'est lui qui est recopié. Le
// dépôt FillSell du MÊME lien (même produit Depop) porte pourtant description,
// rayon, état, port, marque, taille, couleurs.
//
// Règle (Nico, B5) : la copie lit tout ce que la recréation exige, AVANT de lancer
// quoi que ce soit — jamais après le retrait. Chaque champ vient, dans l'ordre :
//   1. du DÉPÔT FillSell de la même annonce (même lien, même numéro ou même produit
//      Depop) — jamais d'un job de suivi vide ;
//   2. de l'annonce en ligne relevée (`annonces_plateforme.capture`) ;
//   3. de la fiche (`inventaire`) ;
// et jamais par-dessus une valeur déjà sur la copie (une réponse de la personne —
// le port que Thibault a saisi — reste telle quelle). Rien d'inventé : un rayon
// ne se déduit de la capture que s'il désigne UNE feuille Depop existante ; l'état
// suit la fiche (jamais embelli, jamais descendu : règle du 22/10). Ce qui reste
// inconnu reste au contrôle avant retrait (pré-vol de l'extension), qui ne retire rien.
// Pur, sans I/O : scripts/copie-republication-depop-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

import { FEUILLES_DEPOP } from "./depop-feuilles.js";
import { tierEtat } from "./etat-plateformes.js";
import { portDepopValide } from "./port-depop.js";

// Le palier de chaque état Depop (sens retour : used_like_new = le plus BAS des deux).
const PALIER_PAR_ETAT_DEPOP = Object.freeze({
  brand_new: "neuf_etiquette",
  used_like_new: "tres_bon",
  used_excellent: "tres_bon",
  used_good: "bon",
  used_fair: "satisfaisant",
});
const ETAT_DEPOP_PAR_PALIER = Object.freeze({
  neuf_etiquette: "brand_new",
  neuf_sans: "used_like_new",
  tres_bon: "used_excellent",
  bon: "used_good",
  satisfaisant: "used_fair",
});
// Types où Depop n'accepte QUE brand_new (même liste que src/utils/depopAttributs.js).
const TYPES_NEUF_SEULEMENT = new Set(["bath-and-body", "fragrance", "hair-products", "makeup", "nails", "skincare"]);

const IDS_FEUILLES = new Set(FEUILLES_DEPOP.map((f) => f.id));
const FEUILLE_PAR_ID = new Map(FEUILLES_DEPOP.map((f) => [f.id, f]));

const vide = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Le slug Depop d'un lien ou d'un identifiant (« thznd_733-pull-zara-taille-38-d8e8 »), ou "". */
export function slugDepop(lienOuId) {
  const s = String(lienOuId ?? "").trim();
  if (!s) return "";
  const m = s.match(/depop\.com\/(?:[a-z]{2}\/)?products\/([^/?#]+)/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9][a-z0-9_-]*$/i.test(s) && !/^\d+$/.test(s) ? s.toLowerCase() : "";
}

/** Les champs que le pré-vol de l'extension exige d'une republication Depop (background.js). */
export function champsManquantsCopieDepop(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const m = [];
  if (vide(job?.description)) m.push("description");
  if (!(Array.isArray(pf.depopCategoryPath) && pf.depopCategoryPath.length === 3 && IDS_FEUILLES.has(pf.depopCategoryPath.join("/")))) m.push("rayon");
  if (vide(pf.depopEtat)) m.push("etat");
  if (pf.depopPort == null || String(pf.depopPort).trim() === "") m.push("port");
  // (26/10 nuit, point 10 — la doudoune enfant de Thibault) Un article ENFANT exige « Pour » (depopGenre : male,
  // female, unisex — depop.js le demande au pré-vol sinon). Il manquait au compte : la copie, complète par ailleurs,
  // ne cherchait jamais le genre que le dépôt FillSell portait (« male »).
  if (Array.isArray(pf.depopCategoryPath) && pf.depopCategoryPath[0] === "kidswear" && !GENRES_DEPOP.has(String(pf.depopGenre ?? "").trim())) m.push("genre");
  return m;
}
const GENRES_DEPOP = new Set(["male", "female", "unisex"]);

/** Le dépôt FillSell est-il bien CETTE annonce ? Lien, numéro ou produit Depop identiques — jamais le titre. */
export function depotDeLAnnonce(depot, job, capture = null) {
  if (!depot || depot.platform !== "depop" || depot.action !== "publish") return false;
  const pfD = depot.platform_fields && typeof depot.platform_fields === "object" ? depot.platform_fields : {};
  if (String(pfD.source ?? "") === "releve") return false; // un job de suivi n'est pas un dépôt
  if (job?.inventaire_id != null && depot.inventaire_id != null && String(depot.inventaire_id) !== String(job.inventaire_id)) return false;
  if (job?.user_id && depot.user_id && String(depot.user_id) !== String(job.user_id)) return false;
  const slugJob = slugDepop(job?.platform_listing_id) || slugDepop(job?.listing_url);
  const slugDepot = slugDepop(depot.platform_listing_id) || slugDepop(depot.listing_url);
  if (slugJob && slugDepot && slugJob === slugDepot) return true;
  const produit = String(pfD.depop_product_id ?? "").trim();
  const produitCapture = String(capture?.depop_id ?? "").trim();
  return Boolean(produit && produitCapture && produit === produitCapture);
}

/** Le département Depop d'un genre (« Femme » → womenswear), ou null. */
export function departementDepopDuGenre(genre) {
  const g = norm(genre);
  if (!g) return null;
  if (/^(femme|women|womenswear)$/.test(g)) return "womenswear";
  if (/^(homme|men|menswear)$/.test(g)) return "menswear";
  if (/^(fille|garcon|enfant|bebe|kids?|kidswear|girl|boy)$/.test(g)) return "kidswear";
  return null;
}

/** Le rayon Depop (3 identifiants) d'une capture « groupe/type » + genre — seulement s'il désigne UNE feuille. */
export function rayonDepopDeLaCapture(capture) {
  const cat = String(capture?.categorie ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!cat) return null;
  const parts = cat.split("/");
  if (parts.length === 3 && IDS_FEUILLES.has(cat)) return parts;
  if (parts.length !== 2) return null;
  const dept = departementDepopDuGenre(capture?.genre);
  if (dept) {
    const id = `${dept}/${cat}`;
    return IDS_FEUILLES.has(id) ? id.split("/") : null;
  }
  // Sans genre : seulement si le couple groupe/type n'existe que dans UN département.
  const candidats = FEUILLES_DEPOP.filter((f) => f.id.endsWith(`/${cat}`));
  return candidats.length === 1 ? candidats[0].id.split("/") : null;
}

// Un état de fiche est une chaîne ou un attribut { v, source, at } (inventaire.attributs.etat).
const palierDe = (v) => {
  const s = String((v && typeof v === "object" ? v.v : v) ?? "").trim();
  if (!s) return null;
  if (PALIER_PAR_ETAT_DEPOP[s]) return PALIER_PAR_ETAT_DEPOP[s];
  return tierEtat(s) ?? null;
};

/**
 * L'état Depop à poser. La FICHE fait foi (règle du 22/10 : en republication, l'état de
 * la fiche ne descend jamais, et on ne l'embellit pas) ; sans état sur la fiche, le
 * code exact du dépôt FillSell ; sinon l'annonce en ligne (lue au palier le plus bas).
 * null si aucune source, ou si le type n'accepte que le neuf et que l'article ne l'est
 * pas (la question reste, jamais un état embelli).
 */
export function etatDepopPourLaCopie({ depot = null, fiche = null, capture = null, typeProduit = null } = {}) {
  const pfD = depot?.platform_fields && typeof depot.platform_fields === "object" ? depot.platform_fields : {};
  const palierFiche = palierDe(fiche?.etat);
  let id = null;
  if (palierFiche) id = ETAT_DEPOP_PAR_PALIER[palierFiche] ?? null;
  else if (PALIER_PAR_ETAT_DEPOP[String(pfD.depopEtat ?? "")]) id = String(pfD.depopEtat);
  else {
    const p = palierDe(capture?.etat);
    id = p ? (ETAT_DEPOP_PAR_PALIER[p] ?? null) : null;
  }
  if (!id) return null;
  if (TYPES_NEUF_SEULEMENT.has(String(typeProduit ?? "")) && id !== "brand_new") return null;
  return id;
}

// Les champs du dépôt FillSell que la copie reprend quand elle ne les a pas (jamais par-dessus).
const CLES_DU_DEPOT = Object.freeze([
  "depopCategoryPath", "depopCategoryId", "depopCategoryLibelles", "depopEtat", "depopPort",
  "depopMarque", "depopTaille", "depopCouleurs", "marque", "taille", "genre", "couleur",
  // (26/10 nuit, point 10) « Pour » d'un article enfant, tel que le dépôt FillSell l'a envoyé à Depop.
  "depopGenre",
]);

/**
 * La copie complétée d'une republication Depop.
 * @param {{ job: object, depots?: object[], capture?: object|null, fiche?: object|null, le?: string|null }} p
 * @returns {null | { description: string|null, platform_fields: object, sources: Record<string, string>, manquants: string[] }}
 *   null = rien à compléter (ou rien trouvé) ; `description` null = inchangée.
 */
export function completerCopieDepop({ job, depots = [], capture = null, fiche = null, le = null } = {}) {
  if (!job || job.platform !== "depop" || job.action !== "republish") return null;
  const avant = champsManquantsCopieDepop(job);
  if (!avant.length) return null;
  const pf = { ...(job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {}) };
  const sources = {};
  const depot = (Array.isArray(depots) ? depots : [])
    .filter((d) => depotDeLAnnonce(d, job, capture))
    .sort((a, b) => String(b.published_at ?? b.created_at ?? "").localeCompare(String(a.published_at ?? a.created_at ?? "")))[0] ?? null;
  const pfD = depot?.platform_fields && typeof depot.platform_fields === "object" ? depot.platform_fields : {};

  // 1. Description : l'annonce en ligne (ce qu'elle dit aujourd'hui), le dépôt, la fiche.
  let description = null;
  if (vide(job.description)) {
    const d = [[capture?.description, "annonce_en_ligne"], [depot?.description, "depot_fillsell"], [fiche?.description, "fiche"]]
      .find(([v]) => !vide(v));
    if (d) { description = String(d[0]).trim(); sources.description = d[1]; }
  }
  // 2. Ce que le dépôt FillSell portait, clé par clé, jamais par-dessus la copie.
  if (depot) {
    for (const k of CLES_DU_DEPOT) {
      if (!vide(pf[k]) || vide(pfD[k])) continue;
      if (k === "depopCategoryPath" && !(Array.isArray(pfD[k]) && pfD[k].length === 3 && IDS_FEUILLES.has(pfD[k].join("/")))) continue;
      if (k === "depopPort" && portDepopValide(pfD[k]) == null) continue;
      if (k === "depopEtat") continue; // l'état se décide plus bas, sur toutes les sources
      pf[k] = Array.isArray(pfD[k]) ? [...pfD[k]] : pfD[k];
      sources[k] = "depot_fillsell";
    }
  }
  // 3. Le rayon : sinon la capture (groupe/type + genre), seulement si une seule feuille.
  if (!(Array.isArray(pf.depopCategoryPath) && pf.depopCategoryPath.length === 3 && IDS_FEUILLES.has(pf.depopCategoryPath.join("/")))) {
    const r = rayonDepopDeLaCapture(capture);
    if (r) {
      pf.depopCategoryPath = r;
      pf.depopCategoryId = r.join("/");
      const f = FEUILLE_PAR_ID.get(r.join("/"));
      if (f?.fr) pf.depopCategoryLibelles = [...f.fr];
      sources.depopCategoryPath = "annonce_en_ligne";
    }
  }
  // 4. L'état : le palier le plus bas des sources, jamais au-dessus de la fiche ni de l'annonce.
  if (vide(pf.depopEtat)) {
    const type = Array.isArray(pf.depopCategoryPath) ? pf.depopCategoryPath[2] : null;
    const e = etatDepopPourLaCopie({ depot, fiche, capture, typeProduit: type });
    if (e) { pf.depopEtat = e; sources.depopEtat = palierDe(fiche?.etat) ? "fiche" : (PALIER_PAR_ETAT_DEPOP[String(pfD.depopEtat ?? "")] ? "depot_fillsell" : "annonce_en_ligne"); }
  }
  // 5. Marque : l'annonce en ligne, quand ni la copie ni le dépôt ne la portent.
  if (vide(pf.depopMarque) && !vide(capture?.marque)) { pf.depopMarque = String(capture.marque).trim(); sources.depopMarque = "annonce_en_ligne"; }

  if (!Object.keys(sources).length) return null;
  const apres = champsManquantsCopieDepop({ ...job, description: description ?? job.description, platform_fields: pf });
  // La question du port est levée quand le port est désormais connu ; jamais une autre question.
  if (!apres.includes("port") && pf.needsUserField && String(pf.needsUserField?.field_key ?? "") === "depopPort") delete pf.needsUserField;
  delete pf.republish_prevol_manquants;
  pf.copie_completee = { le, sources, depot_id: depot?.id ?? null, manquants_avant: avant, manquants_apres: apres };
  return { description, platform_fields: pf, sources, manquants: apres };
}
