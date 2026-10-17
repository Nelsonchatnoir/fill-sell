// ═══════════════════════════════════════════════════════════════════════════
// LA MÉMOIRE « COMPTE × CATÉGORIE » DES RÉPONSES (18/10 nuit, point 1, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Quand la personne répond ELLE-MÊME à un champ requis qui dépend du RAYON (et
// non de l'article), l'app retient sa réponse et la repose seule sur le prochain
// article du même rayon, sans reposer la question.
//
// CLÉ : utilisateur × compte plateforme × plateforme × catégorie cible × champ
// (table memoire_champs_categorie, RLS ; l'utilisateur est implicite côté app).
//
// LA LISTE EXACTE (mesurée le 17/10 sur 60 jours de réponses réelles, rapport
// docs/enquetes/session-nuit-1810-memoire-ia/RAPPORT.md) — SEULS les champs qui
// disent le PUBLIC du rayon :
//   · Leboncoin « Univers » quand sa liste est un public : clothing_type
//     (Mode > Vêtements), shoe_type (Mode > Chaussures), accessories_univers
//     (accessoires, montres et bijoux) — la réponse précédente du même compte
//     sur le même rayon était la bonne 68 fois sur 68 (Vêtements) ;
//   · eBay « Département » : la catégorie eBay est déjà genrée (« Vêtements
//     fille », « Femme : robes ») — même valeur sur 97 % des articles d'un même
//     compte et d'une même catégorie.
// JAMAIS (champs de l'ARTICLE) : taille, pointure, marque, état, couleur,
// matière, ISBN, poids, dimensions, colis, prix, titre, description ; ni les
// « Univers » / « Produit » / « Type » / « Genre » / « Support » qui nomment une
// famille d'OBJETS (Décoration : la réponse précédente n'était la bonne que
// 11 fois sur 16 pour l'Univers, 8 sur 16 pour le Produit ; genre de livre :
// 0 sur 5) ; ni l'âge Beebs (l'âge de l'enfant pour CET article : 1 sur 2).
// La base refuse tout autre champ (CHECK de la migration 20261018030000).
//
// GARDES (toutes ici, pures, testées par scripts/memoire-categorie-selftest.mjs) :
//   1. la mémoire ne remplit qu'un champ VIDE et REQUIS (jamais une saisie,
//      jamais une valeur posée par la fiche, Lens, le texte ou l'IA) ;
//   2. la valeur retenue doit être dans la grille ACTUELLE de la plateforme
//      (rendue avec l'écriture exacte de la grille) ; sortie de la grille =
//      ignorée, la question revient ;
//   3. un titre ou une description qui nomme un AUTRE public (« pull homme »
//      quand la mémoire dit Femme) l'emporte : la mémoire se tait ;
//   4. seule une réponse de la personne est retenue — un CHOIX dans la liste
//      (jamais une frappe en cours, jamais une déduction) — et une nouvelle
//      réponse remplace l'ancienne.
// Module pur (Node + Vite) : aucune dépendance React ni réseau.
import { texteComparable } from "../../utils/texteComparable.js";

/** Le compte quand FillSell ne connaît pas de boutique précise. */
export const COMPTE_PRINCIPAL = "principal";

/** plateforme → champs retenus (clé du champ telle que la porte la ligne de l'écran Publier). */
export const CHAMPS_MEMOIRE = Object.freeze({
  leboncoin: Object.freeze(["clothing_type", "shoe_type", "accessories_univers"]),
  ebay: Object.freeze(["Département"]),
});

const norm = (s) => texteComparable(s).replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

// Les mots d'un PUBLIC (une liste n'est retenue que si TOUTES ses valeurs n'en
// sont faites : si Leboncoin changeait la liste en familles d'objets, la mémoire
// se tairait d'elle-même).
const MOTS_PUBLIC = new Set([
  "femme", "femmes", "homme", "hommes", "enfant", "enfants", "mixte", "maternite", "unisexe", "unisex",
  "fille", "filles", "garcon", "garcons", "bebe", "bebes", "adulte", "adultes", "adolescent", "adolescents",
  "ado", "ados", "junior", "tout", "petit", "petits", "tout-petit", "tout-petits", "et", "autre", "autres",
]);
const estUnPublic = (v) => {
  const mots = norm(v).split(/[^a-z-]+/).filter(Boolean);
  return mots.length > 0 && mots.every((m) => MOTS_PUBLIC.has(m));
};

/** Le champ est-il retenu par la mémoire, pour CETTE liste de valeurs ? */
export function champMemorisable(plateforme, champ, allowedValues) {
  const champs = CHAMPS_MEMOIRE[plateforme];
  if (!champs || !champs.includes(champ)) return false;
  if (!Array.isArray(allowedValues) || allowedValues.length < 2) return false;
  return allowedValues.every(estUnPublic);
}

/** La clé d'une entrée (une ligne de la table). */
export function cleMemoire({ plateforme, compte, categorie, champ }) {
  return [plateforme, compte || COMPTE_PRINCIPAL, String(categorie ?? ""), champ].join("␟");
}

/** Les lignes de la table → Map(clé → { valeur, repondu_le, inventaire_id }). */
export function indexerMemoire(lignes) {
  const m = new Map();
  for (const l of lignes ?? []) {
    if (!l?.plateforme || !l?.categorie || !l?.champ || !String(l?.valeur ?? "").trim()) continue;
    m.set(cleMemoire(l), { valeur: String(l.valeur), repondu_le: l.repondu_le ?? null, inventaire_id: l.inventaire_id ?? null });
  }
  return m;
}

// Le groupe de public d'une valeur ou d'un texte : femme, homme, enfant,
// maternite, mixte. (Un « Bébé fille » est un enfant ; « Adulte unisexe », un mixte.)
const mot = (m) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${m})(?![\\p{L}])`, "iu");
const GROUPES = [
  ["maternite", mot("maternit[ée]|grossesse|enceinte")],
  ["enfant", mot("filles?|gar[cç]ons?|enfants?|b[ée]b[ée]s?|kids?|junior|ados?|adolescents?|tout-petits?")],
  ["femme", mot("femmes?|woman|women|dame")],
  ["homme", mot("hommes?|man|men")],
  ["mixte", mot("mixte|unisexe?|adultes?")],
];
function groupeDeLaValeur(v) {
  const t = String(v ?? "");
  for (const [g, re] of GROUPES) if (re.test(t)) return g;
  return null;
}
/** Les groupes de public qu'un texte NOMME (titre, description, objet IA). */
export function publicsNommes(textes) {
  const out = new Set();
  for (const t of [].concat(textes ?? [])) {
    const s = String(t ?? "");
    if (!s.trim()) continue;
    for (const [g, re] of GROUPES) if (re.test(s)) out.add(g);
  }
  return out;
}

/**
 * La valeur que la mémoire POSE sur une ligne de l'écran Publier, ou null.
 * @param {object} p
 * @param {Map}    p.memoire     indexerMemoire(...)
 * @param {string} p.plateforme
 * @param {string} [p.compte]
 * @param {string} p.categorie   catégorie cible (chemin « A > B » ou id eBay)
 * @param {object} p.ligne       { key|name, state, value, allowedValues, blocking }
 * @param {string[]} [p.textes]  titre, description, objet IA — le texte du vendeur
 * @returns {{ valeur: string, repondu_le: string|null, inventaire_id: number|null } | { ignoree: string } | null}
 */
export function valeurDeMemoire({ memoire, plateforme, compte = COMPTE_PRINCIPAL, categorie, ligne, textes = [] }) {
  if (!memoire || !memoire.size || !ligne || categorie == null || categorie === "") return null;
  const champ = ligne.key ?? ligne.name;
  if (!champMemorisable(plateforme, champ, ligne.allowedValues)) return null;
  // 1. VIDE et REQUIS seulement.
  if (ligne.state !== "missing" || String(ligne.value ?? "").trim()) return null;
  if (ligne.blocking === false) return null;
  if (ligne.deduit?.valeur || ligne.suggested) return null;
  const e = memoire.get(cleMemoire({ plateforme, compte, categorie, champ }));
  if (!e) return null;
  // 2. Dans la grille d'aujourd'hui, avec son écriture exacte.
  const exacte = ligne.allowedValues.find((v) => norm(v) === norm(e.valeur));
  if (!exacte) return { ignoree: "hors_liste" };
  // 3. Le texte du vendeur nomme un autre public : il l'emporte.
  const g = groupeDeLaValeur(exacte);
  const nommes = publicsNommes(textes);
  if (nommes.size && (!g || [...nommes].some((x) => x !== g))) return { ignoree: "texte_autre_public" };
  return { valeur: String(exacte), repondu_le: e.repondu_le ?? null, inventaire_id: e.inventaire_id ?? null };
}

/**
 * Une réponse de la personne à retenir ? Un CHOIX dans la liste d'un champ
 * retenu, jamais une frappe hors liste. Rend la valeur exacte de la liste.
 */
export function reponseARetenir({ plateforme, champ, allowedValues, valeur }) {
  if (!champMemorisable(plateforme, champ, allowedValues)) return null;
  const v = String(valeur ?? "").trim();
  if (!v) return null;
  return allowedValues.find((x) => x === v) ?? null;
}

/**
 * Les poses de la mémoire encore portées par la copie d'un moteur (la valeur
 * posée, ou la réponse que la personne a donnée par-dessus) — ce que l'écran
 * et le lot MONTRENT, modifiable. Une ligne redevenue question (vidée, hors
 * liste) n'est plus une pose : la question la montre.
 * @returns {{ k: string, pose: object, valeur: string }[]}
 */
export function posesMemoireVisibles(m) {
  const out = [];
  for (const [k, pose] of Object.entries(m?.posesMemoire ?? {})) {
    if (!pose) continue;
    const ligne = pose.plateforme === "ebay"
      ? (m.ebayRequiredStatus ?? []).find((x) => x.name === pose.champ)
      : (m.genericRequiredStatus?.[pose.plateforme] ?? []).find((x) => x.key === pose.champ);
    if (!ligne || ligne.state !== "ok") continue;
    const valeur = String(ligne.value ?? "");
    if (valeur !== pose.valeur && valeur !== pose.modifiee) continue;
    out.push({ k, pose, valeur });
  }
  return out;
}

/**
 * Les lignes à écrire au clic Publier : une réponse par (plateforme, champ),
 * seulement pour les plateformes réellement envoyées, seulement si la copie
 * porte ENCORE cette réponse, et jamais une ligne inchangée.
 * @param {object} p
 * @param {Record<string,{plateforme,champ,categorie,compte,valeur}>} p.reponses  réponses notées à l'écran
 * @param {Set<string>|string[]} p.envoyees   plateformes dont le job est parti
 * @param {(plateforme:string, champ:string) => string} p.valeurFinale  valeur sur la copie au départ
 * @param {Map} p.memoire  l'état connu (pour ne rien réécrire d'identique)
 * @param {number|null} [p.inventaireId]
 */
export function lignesAEcrire({ reponses, envoyees, valeurFinale, memoire, inventaireId = null }) {
  const env = new Set(envoyees ?? []);
  const out = [];
  for (const r of Object.values(reponses ?? {})) {
    if (!r || !env.has(r.plateforme)) continue;
    if (!(CHAMPS_MEMOIRE[r.plateforme] ?? []).includes(r.champ)) continue;
    if (r.categorie == null || r.categorie === "") continue;
    const finale = String(valeurFinale?.(r.plateforme, r.champ) ?? "").trim();
    if (!finale || finale !== String(r.valeur).trim()) continue;
    const compte = r.compte || COMPTE_PRINCIPAL;
    const deja = memoire?.get(cleMemoire({ plateforme: r.plateforme, compte, categorie: r.categorie, champ: r.champ }));
    if (deja && deja.valeur === finale) continue;
    out.push({ plateforme: r.plateforme, compte, categorie: String(r.categorie), champ: r.champ, valeur: finale, inventaire_id: inventaireId });
  }
  return out;
}
