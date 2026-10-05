// ═══════════════════════════════════════════════════════════════════════════
// VINTED — LE FORMAT DU COLIS, CHOISI PAR LE VENDEUR (2026-09-27, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Je veux choisir moi-même la taille du colis Vinted. »
//
// LES VALEURS SONT CELLES DU FORMULAIRE, JAMAIS INVENTÉES :
//   · l'id ↔ libellé est la table de vinted.js (VINTED_PACKAGE_SIZES_PAR_ID),
//     relevée sur le formulaire réel : 1 Petit / 2 Moyen / 3 Grand (05/08),
//     8-10 = 5/10/20 kg (« Vases », 16/08), 11-14 = 5/10/20/30 kg
//     (« Nacelles », 16/08) ;
//   · la GRILLE d'un rayon (laquelle des trois) est celle VUE sur de vraies
//     annonces de ce rayon (arbres/vintedColisGrilles.js, généré). Un rayon
//     jamais observé → aucun choix proposé, Vinted garde la main ;
//   · seule extension de ce relevé : les rayons Femmes et Hommes, 4 224
//     formats observés sur 255 rayons, ZÉRO hors Petit/Moyen/Grand — c'est
//     aussi la grille que vinted.js suppose en y posant « Petit » d'office.
//     « Enfants » n'y est PAS : la puériculture y sert des kilos.
//
// ⛔ SANS CHOIX, RIEN NE CHANGE : aucune clé n'est posée sur le job, et
//    vinted.js fait exactement ce qu'il faisait (« Petit » sur la Mode, le
//    format recommandé par Vinted ailleurs).
// ⛔ VINTED SEULEMENT : les formats Leboncoin/Beebs (`format_colis`) ne sont
//    ni lus ni écrits ici.
// ⛔ LA REPUBLICATION n'a rien à faire : elle recrée l'annonce avec l'id de
//    colis CAPTURÉ sur l'annonce en ligne (background.js, packageSizeId) —
//    c'est-à-dire le format choisi ici.
//
// L'extension sait déjà poser un id : `platform_fields.packageSizeId` (et
// son libellé `packageSize`) — le canal de la recréation depuis le 16/08
// (selectPackageSize : id d'abord, même libellé sous un autre id ensuite,
// sinon le format recommandé par Vinted est gardé). Aucun changement
// d'extension.
//
// (05/10, point 3, décision de Nico) « Ajoute-la au bloc Livraison et à
// l'envoi. Même principe que pour Leboncoin : rien de deviné ; le choix de la
// personne est retenu pour les publications suivantes. »
//   · LA GRILLE RELEVÉE SUR LE FORMULAIRE PASSE AVANT LA TABLE GÉNÉRÉE, et son
//     libellé fait foi : le relevé des 03-04/10 (platform_category_aspects)
//     dit « 1|Petit, 2|Moyen, 3|Grand, 8|Volumineux et lourd » là où la table
//     du 27/09 nomme l'id 8 « 5 kg » (ancienne grille) — la carte cachait
//     « Volumineux et lourd » ;
//   · LE CHOIX EST RETENU PAR RAYON : platform_settings.vinted.colis_retenus
//     = { "<A > B > C>": { id, libelle } }, écrit par la RPC
//     platform_settings_fusionner SEULEMENT ; null = « Vinted choisit » ;
//   · L'ORDRE de ce qui part : le choix fait sur la copie (carte du stepper,
//     bloc Livraison du lot) > le choix rangé sur la fiche > le retenu du
//     rayon > rien (Vinted garde son défaut). Rien n'est jamais deviné — ni
//     du poids, ni du rayon ;
//   · `platform_fields.colis_source` dit d'où vient le format du job :
//     'manuel' (choix de la personne, sur la copie ou sur la fiche, y compris
//     « Vinted choisit » — le serveur n'y touche jamais) ou 'retenu' (le
//     retenu du rayon — le serveur peut le relire à jour au service).
//     Absente : aucun choix, le job part comme avant.
// ═══════════════════════════════════════════════════════════════════════════
import { GRILLE_PAR_CHEMIN } from "./arbres/vintedColisGrilles.js";

/** Id Vinted → libellé affiché par le formulaire (miroir de vinted.js). */
export const COLIS_VINTED = {
  1: "Petit", 2: "Moyen", 3: "Grand",
  8: "5 kg", 9: "10 kg", 10: "20 kg",
  11: "5 kg", 12: "10 kg", 13: "20 kg", 14: "30 kg",
};
const GRILLES = { PMG: [1, 2, 3], KG3: [8, 9, 10], KG4: [11, 12, 13, 14] };
const RACINES_PMG = new Set(["Femmes", "Hommes"]);

const cheminTexte = (chemin) =>
  Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).filter(Boolean).join(" > ") : String(chemin ?? "").trim();

/**
 * La clé d'un rayon dans `platform_settings.vinted.colis_retenus` : le chemin
 * en texte, « A > B > C » (segments rognés, vides retirés) — la même que
 * `platform_category_aspects.category_key`. Le serveur l'imite à l'octet.
 * null pour un rayon vide.
 */
export function cleColisRetenu(chemin) {
  return cheminTexte(chemin) || null;
}

/** Le rayon est-il de la Mode adulte (où vinted.js pose « Petit » d'office) ? */
export function rayonModeVinted(chemin) {
  const racine = cheminTexte(chemin).split(" > ")[0];
  return RACINES_PMG.has(racine);
}

/**
 * Les formats que Vinted propose pour ce rayon, ou null si sa grille n'a
 * jamais été observée (aucun choix proposé dans ce cas).
 * Ordre (05/10) : la grille RELEVÉE sur le formulaire de ce rayon (chargée
 * par chargerGrilleColisRelevee), puis la table générée du 27/09, puis la
 * grille de la Mode adulte.
 * @returns {{id:number, libelle:string}[] | null}
 */
export function grilleColisVinted(chemin) {
  const cle = cheminTexte(chemin);
  if (!cle) return null;
  // (05/10, point 3) Le relevé d'abord, avec SES libellés : la table générée
  // nomme l'id 8 « 5 kg » (grille au poids de septembre), le formulaire
  // d'aujourd'hui l'appelle « Volumineux et lourd », à côté de Petit / Moyen /
  // Grand — la carte le cachait. (03/10, point 13) C'est aussi ce qui donne
  // une grille aux rayons inconnus de la table.
  const relevee = GRILLES_RELEVEES.get(cle);
  if (relevee?.length) return relevee;
  const genere = GRILLE_PAR_CHEMIN.get(cle);
  if (genere && GRILLES[genere]) return GRILLES[genere].map((id) => ({ id, libelle: COLIS_VINTED[id] }));
  const ids = rayonModeVinted(cle) ? GRILLES.PMG : null;
  return ids ? ids.map((id) => ({ id, libelle: COLIS_VINTED[id] })) : null;
}

// ── LES GRILLES RELEVÉES PAR L'EXTENSION (03/10, point 13, Louis) ───────────
// 8 des 20 publications Vinted de Louis tombaient dans des rayons inconnus de
// la table générée (« Petits appareils de cuisine », « Autres rangements ») :
// la carte ne proposait rien, Vinted choisissait seul. L'extension (0.6.90)
// range les formats offerts par le formulaire au catalogue
// (platform_category_aspects vinted / package_size, « id|libellé ») ; la carte
// les relit ici. Cache par rayon, le temps de la session.
const GRILLES_RELEVEES = new Map();

/** « 11|5 kg » → { id: 11, libelle: "5 kg" } (le libellé seul ne suffit pas : « 5 kg » existe sous 8 et 11). */
export function grilleReleveeDepuisOptions(options) {
  const vus = new Set();
  return (Array.isArray(options) ? options : [])
    .map((o) => { const m = String(o ?? "").match(/^(\d+)\|(.+)$/); return m ? { id: Number(m[1]), libelle: m[2].trim() } : null; })
    .filter((g) => g && g.id > 0 && g.libelle && !vus.has(g.id) && vus.add(g.id));
}

/**
 * Charge (une fois par rayon et par session) la grille relevée au catalogue ;
 * rend la grille du rayon. (05/10) Lue AUSSI pour un rayon que la table
 * générée connaît : le relevé du formulaire passe avant elle.
 */
export async function chargerGrilleColisRelevee(supabase, chemin) {
  const cle = cheminTexte(chemin);
  if (!cle || GRILLES_RELEVEES.has(cle) || !supabase) return grilleColisVinted(chemin);
  try {
    const { data } = await supabase.from("platform_category_aspects").select("allowed_values")
      .eq("platform", "vinted").eq("category_key", cle).eq("field_key", "package_size").maybeSingle();
    const g = grilleReleveeDepuisOptions(data?.allowed_values);
    GRILLES_RELEVEES.set(cle, g);
  } catch { /* lecture ratée : la carte garde son comportement habituel */ }
  return grilleColisVinted(chemin);
}

/** Le choix rangé sur la fiche (attributs.colis_vinted, source manuel) : id > 0, 0 = « Vinted choisit », null = rien. */
export function colisVintedDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs.colis_vinted : null;
  if (!a || typeof a !== "object" || a.source !== "manuel") return null;
  const id = Number(a.v);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

// ── LE FORMAT RETENU PAR RAYON (05/10, point 3, décision de Nico) ───────────
// platform_settings.vinted.colis_retenus = { "<A > B > C>": { id, libelle } }.
// Une valeur null (ou absente) = « Vinted choisit ». Un retenu ne part que s'il
// est dans la grille ACTUELLE du rayon — un format que Vinted n'offre plus
// n'est jamais posé.
const objetOuVide = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** Les retenus lus dans un platform_settings complet (jamais null). */
export function colisRetenusDuProfil(platformSettings) {
  return objetOuVide(platformSettings?.vinted?.colis_retenus);
}

/** Le retenu de CE rayon, s'il est dans sa grille : { id, libelle } (libellé de la grille) ou null. */
export function colisRetenuDuRayon(retenus, chemin) {
  const cle = cleColisRetenu(chemin);
  if (!cle) return null;
  const r = objetOuVide(retenus)[cle];
  if (!r || typeof r !== "object") return null;
  const id = Number(r.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return grilleColisVinted(chemin)?.find((g) => g.id === id) ?? null;
}

// Le cache de la session, par compte : UNE lecture (la seule colonne utile,
// par son chemin JSON), puis les écritures de cette session le tiennent à
// jour. Jamais une relecture en boucle.
const RETENUS = new Map(); // userId → { valeur } | { promesse }

/** Pose les retenus déjà lus ailleurs (le lot lit platform_settings en entier). */
export function semerColisRetenus(userId, retenus) {
  if (userId) RETENUS.set(String(userId), { valeur: objetOuVide(retenus) });
}

/** Les retenus en cache pour ce compte, ou null s'ils n'ont pas encore été lus. */
export function colisRetenusEnCache(userId) {
  return RETENUS.get(String(userId ?? ""))?.valeur ?? null;
}

/** Lit (une fois par session) les retenus du compte ; rend {} en cas d'échec de lecture. */
export async function chargerColisRetenus(supabase, userId) {
  if (!userId) return {};
  const k = String(userId);
  const e = RETENUS.get(k);
  if (e?.valeur) return e.valeur;
  if (e?.promesse) return e.promesse;
  if (!supabase) return {};
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.from("profiles")
        .select("colis:platform_settings->vinted->colis_retenus").eq("id", userId).maybeSingle();
      if (error) { RETENUS.delete(k); return {}; }
      const v = objetOuVide(data?.colis);
      RETENUS.set(k, { valeur: v });
      return v;
    } catch { RETENUS.delete(k); return {}; }
  })();
  RETENUS.set(k, { promesse });
  return promesse;
}

/**
 * Retient le choix fait pour CE rayon (carte du stepper, bloc du lot).
 * `id` > 0 = un format de la grille du rayon ; 0 ou null = « Vinted choisit »
 * (la clé passe à null). `fusionner` = fusionnerReglages
 * (utils/reglagesPlateformes.js), injecté : ⛔ jamais d'écriture de l'objet
 * entier. Rend la promesse de l'écriture, ou null quand rien n'est à écrire
 * (rayon vide, format hors grille, valeur inchangée).
 */
export function retenirColisVinted({ userId = null, chemin, id, fusionner }) {
  const cle = cleColisRetenu(chemin);
  if (!cle || typeof fusionner !== "function") return null;
  const n = Number(id);
  let valeur = null;
  if (id != null && Number.isInteger(n) && n > 0) {
    const g = grilleColisVinted(chemin)?.find((x) => x.id === n);
    if (!g) return null; // jamais un format hors de la grille du rayon
    valeur = { id: g.id, libelle: g.libelle };
  }
  const actuels = colisRetenusEnCache(userId);
  if (actuels) {
    const avant = actuels[cle] ?? null;
    if (JSON.stringify(avant) === JSON.stringify(valeur)) return null; // inchangé : aucune écriture
    RETENUS.set(String(userId), { valeur: { ...actuels, [cle]: valeur } });
  }
  return Promise.resolve(fusionner(["vinted", "colis_retenus"], { [cle]: valeur })).then((r) => {
    // L'écriture rend platform_settings en entier : le cache repart de là.
    if (userId && r?.data && typeof r.data === "object") semerColisRetenus(userId, colisRetenusDuProfil(r.data));
    return r;
  });
}

/**
 * Ce que la carte affiche, et ce que le job emportera.
 * `pf` = platform_fields de la copie Vinted. `packageSizeId` > 0 = choix fait
 * ici ; 0 = « Vinted choisit », choisi ici ; absent = on relit la fiche, puis
 * le retenu du rayon (05/10).
 * @returns {{id:number, libelle:string, origine:"choix"|"fiche"|"retenu"} | null} null = comportement habituel
 */
export function colisVintedRetenu({ pf, chemin, attributsFiche = null, retenus = null }) {
  const grille = grilleColisVinted(chemin);
  if (!grille) return null;
  const dansGrille = (id) => grille.find((g) => g.id === id) ?? null;
  const brut = pf?.packageSizeId;
  if (brut !== undefined && brut !== null && brut !== "") {
    const id = Number(brut);
    if (id === 0) return null;
    const g = dansGrille(id);
    if (g) return { ...g, origine: "choix" };
    // Choix hors de la grille de CE rayon (rayon changé depuis) : il ne
    // partira pas — on montre ce qui partira à sa place.
  }
  const fiche = colisVintedDeLaFiche(attributsFiche);
  if (fiche === 0) return null;
  const gf = fiche ? dansGrille(fiche) : null;
  if (gf) return { ...gf, origine: "fiche" };
  const gr = colisRetenuDuRayon(retenus, chemin);
  return gr ? { ...gr, origine: "retenu" } : null;
}

/**
 * Au clic Publier : pose (ou retire) le format sur la copie Vinted du job, et
 * dit ce qu'il faut ranger sur la fiche. MUTE `pf`.
 *   · choix fait ici, dans la grille du rayon PUBLIÉ → packageSizeId +
 *     packageSize, colis_source 'manuel' ; rangé sur la fiche ;
 *   · « Vinted choisit » fait ici → clés retirées (comportement habituel),
 *     colis_source 'manuel' ; rangé sur la fiche (v = 0) pour ne plus
 *     reprendre l'ancien choix ;
 *   · rien fait ici (ou choix hors de la grille du rayon publié — rayon
 *     changé depuis) → le choix de la fiche s'il est dans la grille
 *     ('manuel', « Vinted choisit » compris), sinon le retenu du rayon
 *     ('retenu'), sinon rien (comportement habituel) ; rien n'est rangé.
 * `retenus` = platform_settings.vinted.colis_retenus (05/10).
 * @returns {{ranger: {v:number, libelle:string|null} | null}}
 */
export function colisVintedPourJob(pf, attributsFiche = null, retenus = null) {
  if (!pf || typeof pf !== "object") return { ranger: null };
  const brut = pf.packageSizeId;
  const choixIci = brut !== undefined && brut !== null && brut !== "";
  const grille = grilleColisVinted(pf.categoryPath);
  const poser = (g, source) => {
    pf.packageSizeId = g.id;
    pf.packageSize = g.libelle;
    pf.colis_source = source;
  };
  if (choixIci) {
    // Clés posées par la carte : retirées, puis reposées seulement si valides.
    delete pf.packageSizeId;
    delete pf.packageSize;
    delete pf.colis_source;
    const id = Number(brut);
    if (id === 0) {
      pf.colis_source = "manuel";
      return { ranger: { v: 0, libelle: null } };
    }
    const g = grille?.find((x) => x.id === id);
    if (g) {
      poser(g, "manuel");
      return { ranger: { v: g.id, libelle: g.libelle } };
    }
    // Hors de la grille du rayon publié : comme sans choix (ci-dessous).
  }
  const fiche = colisVintedDeLaFiche(attributsFiche);
  if (fiche === 0) {
    pf.colis_source = "manuel";
    return { ranger: null };
  }
  const gf = fiche ? grille?.find((x) => x.id === fiche) : null;
  if (gf) {
    poser(gf, "manuel");
    return { ranger: null };
  }
  const gr = colisRetenuDuRayon(retenus, pf.categoryPath);
  if (gr) poser(gr, "retenu");
  return { ranger: null };
}
