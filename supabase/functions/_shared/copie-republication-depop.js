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
// (13/11, point 5c) LA COULEUR fait exception à cet ordre : l'annonce EN LIGNE d'abord (une couleur posée sur Depop
// reste la sienne), puis le dépôt, puis la fiche — et elle se complète même sur une copie par ailleurs complète.
// Pur, sans I/O : scripts/copie-republication-depop-selftest.mjs, scripts/depop-couleur-fiche-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

import { FEUILLES_DEPOP } from "./depop-feuilles.js";
import { tierEtat } from "./etat-plateformes.js";
import { portDepopValide } from "./port-depop.js";
import { couleurDepopACompleter, couleurDepopRepublication } from "./depop-couleur.js";

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
  // (30/10, lot E) La matière envoyée au dépôt.
  "depopMatieres",
]);

// ── (07/11, famille 6c') LA TAILLE DE LA COPIE ────────────────────────────────────────────────────────────────────────
// La grille Depop du rayon, quand le serveur la connaît : celle d'une question « Taille (Depop) » déjà posée par le
// formulaire (options complètes), sinon null.
export function grilleDepopConnue(pf) {
  const f = pf?.needsUserField;
  if (!f || String(f.field_key ?? "") !== "depopTaille" || !Array.isArray(f.allowed_values)) return null;
  const g = f.allowed_values.map((v) => String(v ?? "").trim()).filter(Boolean);
  return g.length ? g : null;
}
const AUTRE_DEPOP = /^(?:other|autres?)$/i;
const valeurTaille = (v) => String((v && typeof v === "object" ? v.v : v) ?? "").trim();
/** La taille écrite dans un titre (« … size 33 … », « taille M ») : un seul jeton, ou "". */
export function tailleDuTitreDepop(titre) {
  const ms = [...String(titre ?? "").matchAll(/\b(?:size|taille)\s*:?\s*([a-z0-9]{1,4})\b/gi)].map((m) => m[1]);
  const uniques = [...new Set(ms.map((x) => x.toUpperCase()))];
  return uniques.length === 1 ? ms[0] : "";
}
/**
 * La taille Depop que la copie d'une republication peut porter, ou null. Une republication remet l'annonce TELLE QU'ELLE
 * EST : la taille de l'annonce en ligne d'abord.
 *   1. capture.taille, relevée par l'API Depop (capture.source « api ») : c'est un libellé de SA grille, celui que
 *      l'annonce affiche — dans la grille connue s'il y en a une ; jamais « Other » ;
 *   2. sinon, et SEULEMENT si la grille du rayon est connue (question déjà posée) : la taille de la fiche, puis celle du
 *      titre, qui y figure EXACTEMENT (jamais une voisine, jamais traduite ici — l'extension rejuge la grille).
 * Rien d'autre : sans source certaine, la copie reste sans taille et le formulaire pose la question, comme avant.
 * @returns {null | { valeur: string, source: 'annonce_en_ligne'|'fiche'|'titre' }}
 */
export function tailleDepopPourLaCopie({ capture = null, fiche = null, titre = "", grille = null } = {}) {
  const dansGrille = (v) => !grille || grille.includes(v);
  const cap = valeurTaille(capture?.taille);
  if (cap && !AUTRE_DEPOP.test(cap) && String(capture?.source ?? "") === "api" && dansGrille(cap)) return { valeur: cap, source: "annonce_en_ligne" };
  if (!grille) return null;
  for (const [v, source] of [[valeurTaille(fiche?.taille), "fiche"], [tailleDuTitreDepop(titre), "titre"]]) {
    if (v && !AUTRE_DEPOP.test(v) && grille.includes(v)) return { valeur: v, source };
  }
  return null;
}

/**
 * La copie complétée d'une republication Depop.
 * @param {{ job: object, depots?: object[], capture?: object|null, fiche?: object|null, le?: string|null }} p
 * @returns {null | { description: string|null, platform_fields: object, sources: Record<string, string>, manquants: string[] }}
 *   null = rien à compléter (ou rien trouvé) ; `description` null = inchangée.
 */
export function completerCopieDepop({ job, depots = [], capture = null, fiche = null, le = null } = {}) {
  if (!job || job.platform !== "depop" || job.action !== "republish") return null;
  const avant = champsManquantsCopieDepop(job);
  // (13/11, point 5c) La couleur se complète aussi sur une copie par ailleurs complète (elle n'est jamais exigée par
  // Depop : sans elle, l'annonce recréée repartait sans couleur alors que la fiche en porte une).
  const couleurAFaire = couleurDepopACompleter(job.platform_fields);
  if (!avant.length && !couleurAFaire) return null;
  const pf = { ...(job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {}) };
  const sources = {};
  const depot = (Array.isArray(depots) ? depots : [])
    .filter((d) => depotDeLAnnonce(d, job, capture))
    .sort((a, b) => String(b.published_at ?? b.created_at ?? "").localeCompare(String(a.published_at ?? a.created_at ?? "")))[0] ?? null;
  const pfD = depot?.platform_fields && typeof depot.platform_fields === "object" ? depot.platform_fields : {};

  // 1. Description : l'annonce en ligne (ce qu'elle dit aujourd'hui), le dépôt, la fiche.
  let description = null;
  if (avant.length && vide(job.description)) {
    const d = [[capture?.description, "annonce_en_ligne"], [depot?.description, "depot_fillsell"], [fiche?.description, "fiche"]]
      .find(([v]) => !vide(v));
    if (d) { description = String(d[0]).trim(); sources.description = d[1]; }
  }
  // 2. Ce que le dépôt FillSell portait, clé par clé, jamais par-dessus la copie.
  if (avant.length && depot) {
    for (const k of CLES_DU_DEPOT) {
      if (!vide(pf[k]) || vide(pfD[k])) continue;
      if (k === "depopCategoryPath" && !(Array.isArray(pfD[k]) && pfD[k].length === 3 && IDS_FEUILLES.has(pfD[k].join("/")))) continue;
      if (k === "depopPort" && portDepopValide(pfD[k]) == null) continue;
      if (k === "depopEtat") continue; // l'état se décide plus bas, sur toutes les sources
      if (k === "depopCouleurs" || k === "couleur") continue; // (13/11) la couleur se décide plus bas, l'annonce en ligne d'abord
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
  // 3 bis. (26/10 nuit, point 10c) « Pour » d'un article ENFANT, quand ni la copie ni le dépôt FillSell ne le portent :
  // le genre BRUT de l'annonce en ligne (capture.depopGenre, lu par depop.js à côté de « enfant » — male, female,
  // unisex), jamais déduit, jamais « Mixte » inventé.
  if (Array.isArray(pf.depopCategoryPath) && pf.depopCategoryPath[0] === "kidswear"
      && !GENRES_DEPOP.has(String(pf.depopGenre ?? "").trim())
      && String(capture?.genre ?? "") === "enfant" && GENRES_DEPOP.has(String(capture?.depopGenre ?? "").trim())) {
    pf.depopGenre = String(capture.depopGenre).trim();
    sources.depopGenre = "annonce_en_ligne";
  }
  // 4. L'état : le palier le plus bas des sources, jamais au-dessus de la fiche ni de l'annonce.
  if (vide(pf.depopEtat)) {
    const type = Array.isArray(pf.depopCategoryPath) ? pf.depopCategoryPath[2] : null;
    const e = etatDepopPourLaCopie({ depot, fiche, capture, typeProduit: type });
    if (e) { pf.depopEtat = e; sources.depopEtat = palierDe(fiche?.etat) ? "fiche" : (PALIER_PAR_ETAT_DEPOP[String(pfD.depopEtat ?? "")] ? "depot_fillsell" : "annonce_en_ligne"); }
  }
  // 5. Marque : l'annonce en ligne, quand ni la copie ni le dépôt ne la portent.
  // (13/11) Les étapes 5 et 6 ne s'ajoutent qu'à une copie qu'on complète déjà (une copie complète reçoit seulement sa
  // couleur, étape 7).
  if (avant.length && vide(pf.depopMarque) && !vide(capture?.marque)) { pf.depopMarque = String(capture.marque).trim(); sources.depopMarque = "annonce_en_ligne"; }
  // 6. (07/11, famille 6c' — a3002ab6 1fbef555, jean Kaporal « 33 ») La TAILLE, quand ni la copie ni le dépôt FillSell ne
  // la portent (depopTaille / taille) : sans elle, le formulaire de recréation demandait « Taille (Depop) » alors que
  // l'annonce en ligne, la fiche et le titre disaient tous « 33 », dans la grille. Voir tailleDepopPourLaCopie.
  if (avant.length && vide(pf.depopTaille) && vide(pf.taille)) {
    const t = tailleDepopPourLaCopie({ capture, fiche, titre: job.title, grille: grilleDepopConnue(pf) });
    if (t) { pf.depopTaille = t.valeur; sources.depopTaille = t.source; }
  }
  // 7. (13/11, point 5c — compte 8ac5bbda) LA COULEUR, par identifiants (_shared/depop-couleur.js) : l'annonce EN LIGNE
  // d'abord (relevé de l'API Depop : sa couleur posée sur Depop reste la sienne — 9ec3b807 « Bleu, Marine », fiche
  // « Bleu ») ; en ligne sans couleur alors que le dépôt en avait envoyé une : retirée sur Depop, rien n'est remis ; sans
  // relevé de l'API : le dépôt FillSell ; puis la fiche (096856f2 : dépôt et annonce sans couleur, fiche « Gris »).
  // Jamais par-dessus une couleur de la copie.
  if (couleurAFaire) {
    const c = couleurDepopRepublication({ pf, depot, capture, ficheAttributs: fiche });
    if (c?.ids?.length) { pf.depopCouleurs = [...c.ids]; sources.depopCouleurs = c.source; }
  }

  if (!Object.keys(sources).length) return null;
  const apres = champsManquantsCopieDepop({ ...job, description: description ?? job.description, platform_fields: pf });
  // La question du port est levée quand le port est désormais connu ; jamais une autre question.
  if (!apres.includes("port") && pf.needsUserField && String(pf.needsUserField?.field_key ?? "") === "depopPort") delete pf.needsUserField;
  delete pf.republish_prevol_manquants;
  pf.copie_completee = { le, sources, depot_id: depot?.id ?? null, manquants_avant: avant, manquants_apres: apres };
  return { description, platform_fields: pf, sources, manquants: apres };
}
