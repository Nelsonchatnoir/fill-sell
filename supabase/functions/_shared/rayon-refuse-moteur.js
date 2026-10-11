// ═══════════════════════════════════════════════════════════════════════════
// UNE CATÉGORIE QUE LA PLATEFORME N'ACCEPTE PLUS : LE MOTEUR CHOISIT (12/10, A3)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : l'« Horloge puzzle en bois » de Louis (@evat), republication
// Vinted du 11/10 18:18. Son annonce est rangée en « Enfants › Jeux et jouets »
// (catalog_id 1499) ; Vinted a depuis découpé ce rayon en 13 sous-rayons (dont
// 10 ont eux-mêmes des sous-rayons) et n'accepte plus le parent. Le pré-vol
// s'est arrêté AVANT tout retrait (bien) et a demandé à Louis de choisir un
// sous-rayon (mal : la fiche suffisait). Pire, la question ne proposait que les
// ENFANTS directs : une réponse intermédiaire (« Figurines et accessoires »)
// reposait la question, et la seconde réponse cassait la descente.
//
// LA RÈGLE, toutes plateformes :
//   · le rayon d'origine n'est plus accepté (Vinted : niveau intermédiaire ;
//     Beebs : rayon absent de la copie ; Leboncoin : rayon refusé au pré-vol)
//     → le moteur choisit SEUL une FEUILLE à partir de la fiche (titre,
//     description, objet identifié par l'IA, marque, genre) : arbre réel de la
//     plateforme + resolve-categorie (mêmes garde-fous qu'à la publication :
//     clé de la liste seulement, null légitime, fourre-tout écarté) ;
//   · jamais une catégorie absurde : Vinted ne cherche QUE sous le rayon
//     d'origine ; un genre lu sur la fiche n'est jamais contredit ;
//   · la question ne vient qu'au dernier recours (l'IA répond null) — et elle
//     propose alors des FEUILLES (chemins complets), jamais un niveau
//     intermédiaire : une seule réponse suffit toujours ;
//   · le pré-vol reste le juge : rien n'est retiré avant qu'il ne repasse avec
//     le nouveau rayon (le job repart à l'étape où il était, 'captured').
// eBay (ebay-api-worker, rayon aveugle) et Depop (_shared/depop-rayon.js) ont
// déjà leur moteur ; Opla est sortie.
//
// Module PUR (aucun accès réseau ni base) : l'appel à l'IA est injecté.
// Importé par handler-watch (le balayage) et get-pending-jobs (la traduction
// d'une réponse « chemin complet » avant de servir le job).

import { CATALOGUE_VINTED_FR } from "./vinted-catalogue-fr.js";
import { FEUILLES as FEUILLES_BEEBS } from "../../../src/utils/arbres/beebsFeuilles.js";
import { FEUILLES as FEUILLES_LBC } from "../../../src/utils/arbres/leboncoinFeuilles.js";

export const SEPARATEUR_RAYON = " › ";
export const ESSAIS_RAYON_MAX = 3;
export const SOURCE_RAYON_A_CHOISIR = "rayon_a_choisir";

const norm = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

// ── Vinted : l'arbre du catalogue (identifiants, parents, libellés) ─────────
let arbre = null;
function arbreVinted() {
  if (arbre) return arbre;
  const parId = new Map();
  const enfants = new Map();
  for (const [id, parent, libelle] of CATALOGUE_VINTED_FR) {
    parId.set(id, { id, parent, libelle });
    if (!enfants.has(parent)) enfants.set(parent, []);
    enfants.get(parent).push(id);
  }
  arbre = { parId, enfants };
  return arbre;
}

function cheminVintedDe(id) {
  const { parId } = arbreVinted();
  const out = [];
  let n = parId.get(id);
  while (n) { out.unshift(n.libelle); n = parId.get(n.parent); }
  return out;
}

/** Identifiant du nœud Vinted désigné par un chemin de libellés, ou null. */
export function noeudVintedDuChemin(chemin) {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const { parId, enfants } = arbreVinted();
  let courant = 0;
  for (const libelle of chemin) {
    const suivant = (enfants.get(courant) ?? []).find((id) => norm(parId.get(id)?.libelle) === norm(libelle));
    if (suivant == null) return null;
    courant = suivant;
  }
  return courant;
}

function feuillesVintedSous(id) {
  const { enfants } = arbreVinted();
  const kids = enfants.get(id) ?? [];
  if (!kids.length) return [id];
  return kids.flatMap((k) => feuillesVintedSous(k));
}

// ── Leboncoin : les rayons d'OBJETS seulement (ni emploi, ni immobilier, ni
// véhicule, ni service, ni animal vivant) — jamais proposés à un article.
const LBC_HORS_OBJETS = /^(emploi|immobilier|locations de vacances|services|matériel professionnel)$/i;
const LBC_FEUILLES_HORS_OBJETS = new Set(["Véhicules > Voitures", "Véhicules > Motos", "Véhicules > Caravaning",
  "Véhicules > Utilitaires", "Véhicules > Nautisme", "Animaux > Animaux", "Animaux > Animaux perdus", "Divers > Autres"]);

// ── Le genre, LU sur la fiche (jamais deviné) ───────────────────────────────
// Mots entiers au sens des LETTRES (é, ç compris) : \b ne connaît que l'ASCII.
const mot = (m) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${m})(?![\\p{L}])`, "iu");
const GENRES = [
  { cle: "femme", re: mot("femmes?|woman|women") },
  { cle: "homme", re: mot("hommes?|man|men|masculin") },
  { cle: "fille", re: mot("filles?|girls?") },
  { cle: "garcon", re: mot("gar[cç]ons?|boys?") },
  { cle: "bebe", re: mot("b[ée]b[ée]s?|naissance|nourrisson|\\d{1,2} ?mois") },
];
/** Le genre dit EXPLICITEMENT par la fiche (champ genre, puis titre), sinon null. */
export function genreLu({ genre, titre } = {}) {
  const g = norm(genre);
  if (g) {
    if (/^(femme|femmes|women|woman)$/.test(g)) return "femme";
    if (/^(homme|hommes|men|man)$/.test(g)) return "homme";
    if (/^(fille|filles|girl|girls)$/.test(g)) return "fille";
    if (/^(gar[cç]on|gar[cç]ons|boy|boys)$/.test(g)) return "garcon";
    if (/^(b[ée]b[ée]|baby)$/.test(g)) return "bebe";
  }
  const trouves = GENRES.filter((x) => x.re.test(String(titre ?? ""))).map((x) => x.cle);
  return trouves.length === 1 ? trouves[0] : null;
}

// Segment de genre d'un chemin (Beebs « Mode > Homme », Vinted « Hommes »…), sinon null.
const GENRE_DU_SEGMENT = new Map([
  ["femme", "femme"], ["femmes", "femme"], ["homme", "homme"], ["hommes", "homme"],
  ["fille", "fille"], ["filles", "fille"], ["garçon", "garcon"], ["garçons", "garcon"],
  ["bébé", "bebe"], ["bébés", "bebe"],
]);
function genreDuChemin(chemin) {
  for (const s of chemin ?? []) {
    const g = GENRE_DU_SEGMENT.get(norm(s));
    if (g) return g;
  }
  return null;
}

/**
 * Les FEUILLES candidates (chemins complets) d'un rayon refusé.
 * Vinted : sous le rayon d'origine seulement. Beebs, Leboncoin : sous le rayon
 * d'origine s'il est connu, sinon l'arbre entier — élagué au genre lu.
 */
/** @param {{ plateforme?: string, base?: string[], genre?: string|null, titre?: string, enfantsVivants?: string[]|null, exclure?: string[]|null }} [p] */
export function feuillesCandidates({ plateforme = "", base = [], genre = null, titre = "", enfantsVivants = null, exclure = null } = {}) {
  const b = Array.isArray(base) ? base.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  let feuilles = [];
  if (plateforme === "vinted") {
    const id = noeudVintedDuChemin(b);
    if (id == null || !b.length) return [];
    feuilles = feuillesVintedSous(id).filter((f) => f !== id).map((f) => ({ chemin: cheminVintedDe(f), id: String(f) }));
    // Le catalogue VIVANT fait foi : quand Vinted a dit quels sous-rayons il
    // propose sous ce niveau, une feuille de notre relevé hors de cette liste
    // n'est jamais candidate (relevé du 25/09 périmé sur ce point).
    const vivants = Array.isArray(enfantsVivants) ? new Set(enfantsVivants.map(norm)) : null;
    if (vivants && vivants.size) feuilles = feuilles.filter((f) => vivants.has(norm(f.chemin[b.length])));
  } else if (plateforme === "beebs" || plateforme === "leboncoin") {
    const toutes = plateforme === "beebs" ? FEUILLES_BEEBS : FEUILLES_LBC.filter((f) =>
      !LBC_HORS_OBJETS.test(f.chemin[0]) && !LBC_FEUILLES_HORS_OBJETS.has(f.chemin.join(" > ")));
    const prefixe = b.map(norm);
    feuilles = toutes.filter((f) => prefixe.every((s, i) => norm(f.chemin[i]) === s))
      .map((f) => ({ chemin: f.chemin, id: f.id ?? null }));
  } else {
    return [];
  }
  // Le rayon que la plateforme vient de REFUSER n'est jamais reproposé.
  if (Array.isArray(exclure) && exclure.length) {
    const x = exclure.map(norm).join(" | ");
    feuilles = feuilles.filter((f) => f.chemin.map(norm).join(" | ") !== x);
  }
  // Le genre lu sur la fiche n'est jamais contredit : une feuille d'un AUTRE
  // genre est retirée (une feuille sans genre reste).
  const g = genreLu({ genre, titre });
  if (g) {
    const gardees = feuilles.filter((f) => { const gf = genreDuChemin(f.chemin); return !gf || gf === g; });
    if (gardees.length) feuilles = gardees;
  }
  return feuilles;
}

/** Le chemin relatif au rayon d'origine, tel qu'il est proposé dans la question. */
export function libelleFeuille(chemin, base) {
  const b = Array.isArray(base) ? base.length : 0;
  const reste = chemin.slice(b);
  return (reste.length ? reste : chemin).join(SEPARATEUR_RAYON);
}

/**
 * Le choix du moteur. Rend { chemin, id, source } (certain) ou
 * { doute: true, motif, feuilles } — jamais une feuille hors de la liste.
 * `appelerIA(corps)` : POST resolve-categorie (secret cron), rend son JSON.
 */
export async function resoudreRayonRefuse(entree, appelerIA) {
  const { plateforme, base, titre, description, objet, marque, genre, taille, user_id, enfantsVivants, exclure } = entree;
  const feuilles = feuillesCandidates({ plateforme, base, genre, titre, enfantsVivants, exclure });
  if (!feuilles.length) return { doute: true, motif: "aucune_feuille", feuilles };
  if (feuilles.length === 1) return { chemin: feuilles[0].chemin, id: feuilles[0].id, source: "seule_feuille", feuilles };
  if (feuilles.length > 600) return { doute: true, motif: "trop_de_feuilles", feuilles };
  let rep = null;
  try {
    rep = await appelerIA({
      titre: String(titre ?? "").slice(0, 200),
      attributs: {
        "objet identifié": String(objet ?? "").trim() || null,
        description: String(description ?? "").replace(/\s+/g, " ").trim() || null,
        marque: String(marque ?? "").trim() || null,
        genre: String(genre ?? "").trim() || null,
        taille: String(taille ?? "").trim() || null,
        "rayon d'origine": Array.isArray(base) && base.length ? base.join(" > ") : null,
      },
      candidats: { [plateforme]: feuilles.map((f) => ({ chemin: f.chemin, ...(f.id ? { id: f.id } : {}) })) },
      max_candidats: feuilles.length,
      user_id,
    });
  } catch (e) {
    return { doute: true, motif: "ia_indisponible", iaIndisponible: true, detail: String(e?.message ?? e).slice(0, 120), feuilles };
  }
  if (rep?.motif === "ia_indisponible") return { doute: true, motif: "ia_indisponible", iaIndisponible: true, feuilles };
  const c = rep?.choix?.[plateforme];
  if (!c || !Array.isArray(c.chemin)) return { doute: true, motif: "ia_sans_choix", feuilles };
  // On ne fait jamais confiance au texte rendu : la feuille doit être L'UNE des nôtres.
  const cle = c.chemin.map(norm).join(" | ");
  const f = feuilles.find((x) => x.chemin.map(norm).join(" | ") === cle);
  if (!f) return { doute: true, motif: "hors_liste", feuilles };
  return { chemin: f.chemin, id: f.id, source: "ia", feuilles };
}

/** La question de dernier recours : des FEUILLES, une réponse suffit. */
/** @param {{ plateforme?: string, base?: string[], feuilles?: Array<{ chemin: string[], id: string|null }>, cleChamp?: string }} [p] */
export function questionRayonRefuse({ plateforme = "", base = [], feuilles = [], cleChamp = CLE_REPONSE_RAYON } = {}) {
  const libelles = { vinted: "Catégorie Vinted", beebs: "Rayon Beebs", leboncoin: "Catégorie Leboncoin" };
  return {
    platform: plateforme,
    field_key: cleChamp,
    field_label: libelles[plateforme] ?? "Catégorie",
    input_type: "selection_only",
    // La liste ENTIÈRE des feuilles possibles : la modale « Compléter » en fait
    // un sélecteur FERMÉ (jamais « Autre valeur… », jamais une liste à
    // suggestions invisible sur iPhone) — chaque choix aboutit (12/10, Louis).
    options_completes: true,
    allowed_values: feuilles.slice(0, 600).map((f) => libelleFeuille(f.chemin, base)),
    target: { root: null, key: cleChamp },
    rayon_base: Array.isArray(base) ? base : [],
    raison: "rayon_refuse_par_la_plateforme",
  };
}

/**
 * Une réponse « chemin complet » (donnée à la question ci-dessus) → le chemin
 * de la feuille, ou null si ce n'est pas une feuille connue sous ce rayon.
 */
/** @param {{ plateforme?: string, base?: string[], reponse?: string }} [p] */
export function cheminDeLaReponse({ plateforme = "", base = [], reponse = "" } = {}) {
  const r = String(reponse ?? "").trim();
  if (!r) return null;
  const feuilles = feuillesCandidates({ plateforme, base });
  const f = feuilles.find((x) => norm(libelleFeuille(x.chemin, base)) === norm(r));
  return f ? { chemin: f.chemin, id: f.id } : null;
}

// ── LE CAS D'UN JOB, ET CE QUI S'ÉCRIT ──────────────────────────────────────
// La clé de la réponse de la personne (question de dernier recours) : jamais
// la clé que l'extension lit elle-même (categoryLevelChoice ne descend que
// d'UN niveau, beebsCategoryPath attend un tableau) — get-pending-jobs la
// traduit en chemin complet avant de servir le job (cheminDeLaReponse).
export const CLE_REPONSE_RAYON = "rayonChoisi";
const CHAMP_RAYON = { vinted: "categoryPath", beebs: "beebsCategoryPath", leboncoin: "lbcCategoryPath" };

/** Le chemin le plus profond de `chemin` qui existe dans l'arbre Vinted. */
function prefixeVintedConnu(chemin) {
  const c = Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  for (let n = c.length; n > 0; n--) if (noeudVintedDuChemin(c.slice(0, n)) != null) return c.slice(0, n);
  return [];
}

/**
 * Ce que le moteur doit trancher pour CE job, ou null (pas son cas) :
 *   · Vinted (publication ou republication) : question « categoryLevelChoice »
 *     de l'extension — le rayon d'origine s'arrête sur un niveau intermédiaire ;
 *   · Beebs (republication) : « le rayon Beebs manque dans la copie » ;
 *   · Leboncoin (republication) : rayon absent, ou refusé au pré-vol complet.
 */
export function rayonRefuseDuJob(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.platform === "vinted" && job.status === "needs_user") {
    const nf = pf.needsUserField;
    if (!nf || nf.field_key !== "categoryLevelChoice") return null;
    const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : {};
    const brut = job.action === "republish" ? snap.categoryPath : pf.categoryPath;
    const base = prefixeVintedConnu(brut);
    if (!base.length) return null;
    return { plateforme: "vinted", base, enfantsVivants: Array.isArray(nf.allowed_values) ? nf.allowed_values : null };
  }
  if (job?.platform === "beebs" && job.action === "republish" && job.status === "needs_user") {
    const manquants = Array.isArray(pf.republish_prevol_manquants) ? pf.republish_prevol_manquants : [];
    if (!manquants.includes("le rayon Beebs")) return null;
    if (Array.isArray(pf.beebsCategoryPath) && pf.beebsCategoryPath.length) return null;
    return { plateforme: "beebs", base: [] };
  }
  if (job?.platform === "leboncoin" && job.action === "republish" && ["pending", "needs_user"].includes(job.status)) {
    const detail = String(pf.republish_prevol_formulaire?.detail ?? "");
    const sansRayon = !(Array.isArray(pf.lbcCategoryPath) && pf.lbcCategoryPath.length);
    const refuse = /Catégorie\s*:/.test(detail) && pf.republish_prevol_formulaire?.verdict !== "ok";
    if (!sansRayon && !refuse) return null;
    return { plateforme: "leboncoin", base: [], ...(refuse && !sansRayon ? { exclure: pf.lbcCategoryPath } : {}) };
  }
  return null;
}

/**
 * Le job APRÈS le choix (du moteur ou de la personne) : rayon posé là où
 * l'extension le lit, question retirée, rien d'autre. Le statut repasse en
 * file ('pending') ; l'étape de republication ne bouge pas (le pré-vol refait
 * son contrôle avec le nouveau rayon, AVANT tout retrait).
 */
/** @param {any} job @param {{ chemin: string[], id?: string|null }} choix @param {{ plateforme?: string, base?: string[], source?: string, par?: string }} [o] */
export function pfApresRayon(job, choix, { plateforme = "", base = [], source = "ia", par = "" } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const chemin = choix.chemin.map(String);
  if (plateforme === "vinted" && job.action === "republish") {
    const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : null;
    if (snap) pf.republish_snapshot = { ...snap, categoryPath: chemin, ...(choix.id ? { catalog_id: Number(choix.id) } : {}) };
  } else {
    pf[CHAMP_RAYON[plateforme]] = chemin;
  }
  for (const k of ["categoryLevelChoice", CLE_REPONSE_RAYON, "needsUserField", "needsUserFields", "champs_a_completer",
    "needs_user_source", "next_action_after", "processing_since", "republish_prevol_manquants", "needs_user_sans_motif"]) delete pf[k];
  if (pf.needsUserBoucle && typeof pf.needsUserBoucle === "object") {
    const b = { ...pf.needsUserBoucle }; delete b.categoryLevelChoice; delete b[CLE_REPONSE_RAYON];
    pf.needsUserBoucle = b;
  }
  pf.rayon_moteur = {
    plateforme, base, chemin, id: choix.id ?? null, source, par, le: new Date().toISOString(),
    ...(pf.capture_id != null ? { capture_id: String(pf.capture_id) } : {}),
  };
  return pf;
}

/** Le message du job quand le moteur n'a pas pu trancher (dernier recours). */
export function messageRayonAChoisir(plateforme, base) {
  const nom = { vinted: "Vinted", beebs: "Beebs", leboncoin: "Leboncoin" }[plateforme] ?? plateforme;
  const ou = Array.isArray(base) && base.length ? ` de « ${base.join(" › ")} »` : "";
  return `Republication en pause AVANT toute suppression — ton annonce est intacte sur ${nom}. ${nom} n'accepte plus la catégorie de cette annonce, `
    + `et FillSell n'a pas pu choisir seul la bonne sous-catégorie${ou}. Choisis-la dans l'app (fiche de l'article, bouton « ✋ Compléter ») : la republication repartira toute seule.`;
}
