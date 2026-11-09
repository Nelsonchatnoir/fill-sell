// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (09/11, point 3 de Nico — contact.grizstyle) UN TROU DE CORRESPONDANCE eBay EST À NOTRE CHARGE, JAMAIS AU CLIENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Cas (voie API, 09/11 00:30, needs_user « relancer ») :
//   · « Lit bébé Sauthon … » (Très bon état) : rayon 93391 « Bébé, puériculture › Lits, équipements d'intérieur ›
//     Lits, matelas, berceaux » — eBay n'y accepte que « Neuf » ; la reprise avec la proposition d'eBay retombe sur le
//     même rayon → « Change l'icône ou le genre de l'article ».
//   · « Lot femme M/L T40 – Last Queen + Neo Noir » : rayon de l'app « Robes » refusé par la vérification (un lot de
//     deux vêtements), aucune des 9 suggestions d'eBay retenue (toutes un type de vêtement) → « Aucune catégorie eBay
//     sûre… Change l'icône ou le genre ». eBay France n'a pas de rayon « lots » pour les vêtements femme ; il a
//     « Tenues, ensembles » (Femme 260011, Fille 156801, Garçon 156790, Bébé 260024 ; aucun pour Homme).
// Règles (tous les comptes) :
//   1. ÉTAT RÉEL : quand le rayon retenu n'accepte pas l'état de l'article, on cherche d'abord un rayon VOISIN de la
//      même branche qui l'accepte — la feuille « Autres » du même parent, puis des parents au-dessus (jamais une autre
//      racine) —, chaque candidat vérifié chez eBay (conditions de la catégorie). Rien ne l'accepte, même la
//      proposition d'eBay : c'est la règle d'eBay, pas une question — la publication se clôt, message vrai, rien à faire ;
//   2. LOT DE VÊTEMENTS sans rayon sûr : « Tenues, ensembles » du genre de l'article ;
//   3. un trou qui reste (aucun rayon sûr) est rangé CHEZ NOUS : `ebay_rayon_a_notre_charge` (en pause, « FillSell s'en
//      occupe »), jamais « change l'icône ou le genre, puis relance » ;
//   4. les publications déjà arrêtées ainsi (rayon ou état, « relancer » ou chez nous) sont rejouées seules, une fois
//      par version de ces règles (REGLE_RAYON_VERSION), sans la marque qui ferait prendre la proposition d'eBay à
//      l'aveugle.
// Pur (Deno + Node) : scripts/ebay-rayon-a-notre-charge-selftest.mjs.
import { FEUILLES } from "../../../src/utils/arbres/ebayFeuilles.js";

export const SOURCE_RAYON_A_NOTRE_CHARGE = "ebay_rayon_a_notre_charge";
export const REGLE_RAYON_VERSION = "2026-11-09";
export const VOISINS_MAX = 3;
export const REJOUER_MAX_PAR_PASSAGE = 20;

const VETEMENTS = "Vêtements, accessoires";
/** « Tenues, ensembles » par genre (arbre eBay France relevé, src/utils/arbres/ebayFeuilles.js). */
export const TENUES_ENSEMBLES = Object.freeze({
  femme: Object.freeze({ id: "260011", chemin: Object.freeze([VETEMENTS, "Femme : vêtements, accessoires", "Femme : vêtements", "Tenues, ensembles"]) }),
  fille: Object.freeze({ id: "156801", chemin: Object.freeze([VETEMENTS, "Enfant : vêtements, accessoires", "Fille : vêtements, accessoires", "Vêtements fille (2-16 ans)", "Tenues, ensembles"]) }),
  garcon: Object.freeze({ id: "156790", chemin: Object.freeze([VETEMENTS, "Enfant : vêtements, accessoires", "Garçon : vêtements, accessoires", "Vêtements garçon (2-16 ans)", "Tenues, ensembles"]) }),
  bebe: Object.freeze({ id: "260024", chemin: Object.freeze([VETEMENTS, "Bébé : vêtements, accessoires", "Bébé : vêtements", "Tenues, ensembles"]) }),
});

const chaine = (c) => (Array.isArray(c) ? c.map((s) => String(s ?? "").trim()).filter(Boolean) : []);

/** 1. Les rayons voisins à vérifier : « Autres » du même parent, puis des parents au-dessus, même racine. */
export function rayonsVoisinsPourEtat(categoryId, feuilles = FEUILLES) {
  const id = String(categoryId ?? "").trim();
  const f = feuilles.find((x) => x.id === id);
  if (!f) return [];
  const out = [];
  for (let k = f.chemin.length - 1; k >= 1 && out.length < VOISINS_MAX; k--) {
    const parent = f.chemin.slice(0, k);
    for (const x of feuilles) {
      if (!x.id || x.id === id || x.chemin.length !== k + 1) continue;
      if (!parent.every((s, i) => x.chemin[i] === s)) continue;
      if (!/^Autres\b/i.test(x.chemin[k])) continue;
      if (!out.some((o) => o.id === x.id)) out.push({ id: x.id, chemin: [...x.chemin] });
    }
  }
  return out.slice(0, VOISINS_MAX);
}

/** 2. Un lot ? (titre « Lot … », ou objet lu « lot de … ») — jamais « unité ou lot » (une annonce à l'unité). */
export function estUnLot(titre, objet) {
  const t = String(titre ?? "");
  if (/unit[ée]s?\s+ou\s+(en\s+)?lot/i.test(t)) return false;
  return /(^|[\s(«"'–-])lots?\b/i.test(t) || /^\s*lot\b/i.test(String(objet ?? ""));
}

/** Le genre d'un vêtement, lu sur le rayon de l'app, sinon sur le genre de la fiche. null = inconnu ou Homme. */
export function genreVetement(cheminMappe, genre) {
  const c = chaine(cheminMappe);
  if (c[0] === VETEMENTS && c.length > 1) {
    const s = c.join(" › ");
    if (s.includes("Femme : vêtements, accessoires › Femme : vêtements")) return "femme";
    if (s.includes("Vêtements fille (2-16 ans)")) return "fille";
    if (s.includes("Vêtements garçon (2-16 ans)")) return "garcon";
    if (s.includes("Bébé : vêtements, accessoires › Bébé : vêtements")) return "bebe";
    return null; // une branche de vêtements sans « Tenues, ensembles » (Homme, accessoires, chaussures…)
  }
  const g = String(genre ?? "").trim().toLowerCase();
  if (g === "femme") return "femme";
  if (g === "fille") return "fille";
  if (g === "garçon" || g === "garcon") return "garcon";
  if (g === "bébé" || g === "bebe") return "bebe";
  return null;
}

/**
 * 2. Le rayon d'un LOT DE VÊTEMENTS quand aucun rayon sûr n'a été trouvé. null = la règle ne s'applique pas.
 * @param {{ titre?: string, objet?: string|null, famille?: string|null, cheminMappe?: string[], genre?: string|null, categorieSource?: string|null }} x
 */
export function rayonLotDeVetements({ titre, objet = null, famille = null, cheminMappe = [], genre = null, categorieSource = null } = {}) {
  if (String(categorieSource ?? "") === "choix_humain") return null;
  if (!estUnLot(titre, objet)) return null;
  const c = chaine(cheminMappe);
  const vetement = (c[0] === VETEMENTS && !c.some((s) => /^(Femme|Homme|Fille|Garçon|Bébé|Enfant)\s*:\s*accessoires$/i.test(s) || /chaussures/i.test(s)))
    || (!c.length && String(famille ?? "") === "mode");
  if (!vetement) return null;
  const g = genreVetement(c, genre);
  const cible = g ? TENUES_ENSEMBLES[g] : null;
  return cible ? { id: cible.id, chemin: [...cible.chemin], detail: `lot de vêtements (${g}) : « Tenues, ensembles »` } : null;
}

/** 3. Le message d'un trou de correspondance qui reste : à notre charge, rien à faire. */
export function messageRayonANotreCharge() {
  return "En pause — FillSell s'en occupe : aucun rayon eBay sûr n'a encore été trouvé pour cet article. L'équipe complète " +
    "la correspondance, la publication repartira seule. Ta fiche ne change pas, rien à faire de ton côté.";
}

/** 1. Le message vrai quand eBay n'accepte l'état de l'article dans aucun rayon voisin ni dans le sien. */
export function messageEtatRefuseParEbay(etat, neufSeulement) {
  return neufSeulement
    ? "eBay n'accepte que des objets neufs dans le rayon de cet article et dans les rayons voisins : il ne peut pas y être " +
      "publié d'occasion. Rien n'a été envoyé à eBay ; tes autres plateformes ne sont pas concernées."
    : `eBay n'accepte pas l'état « ${String(etat ?? "").trim() || "de cet article"} » dans le rayon de cet article ni dans les ` +
      "rayons voisins. Rien n'a été envoyé à eBay ; tes autres plateformes ne sont pas concernées.";
}

/** 4. Une publication arrêtée sur un rayon ou un état, à rejouer avec ces règles ? */
export function aRejouer(job) {
  if (!job || job.status !== "needs_user" || job.platform !== "ebay") return false;
  if (!["publish", "republish"].includes(String(job.action ?? ""))) return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const src = String(pf.needs_user_source ?? "");
  if (!["", "relancer", SOURCE_RAYON_A_NOTRE_CHARGE].includes(src)) return false;
  const d = pf.last_diagnostic && typeof pf.last_diagnostic === "object" ? pf.last_diagnostic : {};
  const quoi = String(d.quoi ?? "");
  const etape = String(d.etape ?? "");
  const vise = (etape === "categorie" && quoi === "categorie_a_choisir") || (etape === "condition" && quoi === "etat_sans_correspondance");
  if (!vise) return false;
  return String(pf.rayon_rejoue?.version ?? "") !== REGLE_RAYON_VERSION;
}

/** 4. Les champs de la tâche rejouée : sans la marque « prendre la proposition d'eBay », sans la reprise faite. */
export function champsRejoues(pf, at = new Date().toISOString()) {
  const p = { ...(pf && typeof pf === "object" ? pf : {}) };
  for (const k of ["ebayCategorieAttente", "condition_relance_auto", "needs_user_source", "needsUserAttempts", "needs_user_tick_le",
    "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "next_action_after"]) delete p[k];
  p.rayon_rejoue = { version: REGLE_RAYON_VERSION, le: at };
  return p;
}
