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
import { CATALOGUE_VINTED_COMPTES } from "./vinted-catalogue-comptes.js";
import { langueEtrangereDesRacines } from "./vinted-pays.ts";
import { FEUILLES as FEUILLES_BEEBS } from "../../../src/utils/arbres/beebsFeuilles.js";
import { FEUILLES as FEUILLES_LBC } from "../../../src/utils/arbres/leboncoinFeuilles.js";
import { PAIRES_ARBRES_VINTED, IDS_ANCIEN_ARBRE } from "./vinted-arbre-compte.js";

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
  // (30/10, lot E) + l'arbre servi à certains comptes (racine « Accessoires de mode ») : identifiants globaux, un
  // identifiant déjà connu de l'arbre anonyme n'est jamais réécrit.
  for (const [id, parent, libelle] of [...CATALOGUE_VINTED_FR, ...CATALOGUE_VINTED_COMPTES]) {
    if (parId.has(id)) continue;
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

// ═══════════════════════════════════════════════════════════════════════════
// (07/11 nuit, point 1 — 9256e3ae, job dca7193f) UN RAYON DE L'ANCIEN ARBRE SUR UN COMPTE BASCULÉ
// ═══════════════════════════════════════════════════════════════════════════
// « Éponge anti-buée pour voiture » publiée en « Hommes › Accessoires › Autres » (99, choisi par la personne) sur un
// compte que Vinted a basculé sur son nouvel arbre (« Hommes » n'y propose plus que Vêtements, Chaussures, Sacs et
// sacoches, Chapeaux et casquettes, Soins). 99 n'a AUCUN équivalent (PAIRES_ARBRES_VINTED) ; le moteur ne cherchait que
// SOUS le rayon d'origine — une feuille morte : « aucune_feuille » —, la question de l'extension partait avec les rayons
// du niveau « Hommes », la personne a pris « Sacs et sacoches », et la question suivante proposait dix sacs.
// LA RÈGLE (tous les comptes) : un chemin qui passe par un nœud que la bascule a RETIRÉ (feuille de IDS_ANCIEN_ARBRE, ou
// nœud dont toutes les feuilles sont retirées ou déplacées ailleurs) se cherche dans TOUT l'arbre VIVANT du compte basculé :
//   · un équivalent sûr (même identifiant pour un rayon déplacé, même libellé pour un accessoire) → posé seul ;
//   · sinon l'IA, en deux temps (la branche — ce qu'elle contient montré —, puis la feuille dans la branche) ;
//   · sinon la question de FEUILLES (chemins complets), avec la sortie « Abandonner Vinted pour cet article » nommée.
// Jamais un rayon de l'ancien arbre proposé à un compte basculé ; jamais quand la page du compte montre encore le niveau
// retiré (compte resté sur l'ancien arbre : la question de l'extension reste la bonne).
const cleCheminVinted = (c) => (Array.isArray(c) ? c : String(c ?? "").split(" > "))
  .map((s) => norm(s).replace(/\s*&\s*/g, " et ")).join(" > ");
let vivantVinted = null;
function arbreVivantVinted() {
  if (vivantVinted) return vivantVinted;
  const { parId, enfants } = arbreVinted();
  const versNouveau = new Map(PAIRES_ARBRES_VINTED.map(([a, n]) => [cleCheminVinted(a), n.split(" > ")]));
  // Le nouveau chemin de chaque feuille gardée (déplacée ou renommée), null pour une feuille retirée.
  const destin = new Map();
  for (const id of parId.keys()) {
    if ((enfants.get(id) ?? []).length) continue;
    if (IDS_ANCIEN_ARBRE.has(id)) { destin.set(id, null); continue; }
    const chemin = cheminVintedDe(id);
    destin.set(id, versNouveau.get(cleCheminVinted(chemin)) ?? chemin);
  }
  // Un nœud intermédiaire est MORT quand aucune de ses feuilles ne vit encore sous lui (retirée, ou déplacée ailleurs).
  const morts = new Set();
  for (const id of parId.keys()) {
    if (!(enfants.get(id) ?? []).length) continue;
    const prefixe = cleCheminVinted(cheminVintedDe(id));
    const vit = feuillesVintedSous(id).some((f) => {
      const d = destin.get(f);
      return d != null && cleCheminVinted(d).startsWith(prefixe + " > ");
    });
    if (!vit) morts.add(id);
  }
  // Les feuilles vivantes : jamais retirées, jamais restées sous un nœud mort (chemin traduit quand il a bougé).
  const feuilles = [];
  for (const [id, d] of destin) {
    if (d == null) continue;
    const ancetreMort = (() => { let n = parId.get(parId.get(id)?.parent); while (n) { if (morts.has(n.id)) return true; n = parId.get(n.parent); } return false; })();
    if (ancetreMort && cleCheminVinted(d) === cleCheminVinted(cheminVintedDe(id))) continue;
    feuilles.push({ chemin: d.slice(), id: String(id) });
  }
  vivantVinted = { morts, feuilles, destin };
  return vivantVinted;
}

/** Les identifiants des nœuds d'un chemin de libellés (du haut vers le bas), ou null. */
function idsDuCheminVinted(chemin) {
  const { parId, enfants } = arbreVinted();
  const ids = [];
  let courant = 0;
  for (const libelle of chemin) {
    const suivant = (enfants.get(courant) ?? []).find((id) => norm(parId.get(id)?.libelle) === norm(libelle));
    if (suivant == null) return null;
    ids.push(suivant);
    courant = suivant;
  }
  return ids;
}

/** L'indice du premier niveau RETIRÉ par la bascule dans ce chemin (-1 : chemin vivant). */
export function niveauMortVinted(chemin) {
  const ids = Array.isArray(chemin) && chemin.length ? idsDuCheminVinted(chemin) : null;
  if (!ids) return -1;
  const { morts } = arbreVivantVinted();
  return ids.findIndex((id) => morts.has(id) || IDS_ANCIEN_ARBRE.has(id));
}

/** L'équivalent sûr d'une feuille de l'ancien arbre dans l'arbre vivant (même id déplacé, même libellé), ou null. */
function equivalentVivantVinted(chemin) {
  const ids = idsDuCheminVinted(chemin);
  const id = ids?.[ids.length - 1];
  if (id == null) return null;
  const { enfants } = arbreVinted();
  if ((enfants.get(id) ?? []).length) return null; // un nœud intermédiaire n'a pas d'équivalent unique
  // Rayon DÉPLACÉ (sacs, chapeaux…) : même identifiant, nouveau chemin.
  const d = arbreVivantVinted().destin.get(id);
  if (d && cleCheminVinted(d) !== cleCheminVinted(cheminVintedDe(id))) return { chemin: d.slice(), id: String(id) };
  // Accessoire RETIRÉ remplacé sous « Accessoires de mode » : même libellé, nouvel identifiant.
  const versNouveau = new Map(PAIRES_ARBRES_VINTED.map(([a, n]) => [cleCheminVinted(a), n.split(" > ")]));
  const n = versNouveau.get(cleCheminVinted(cheminVintedDe(id)));
  if (!n) return null;
  const idNouveau = noeudVintedDuChemin(n);
  if (idNouveau == null || (enfants.get(idNouveau) ?? []).length) return null;
  return { chemin: n.slice(), id: String(idNouveau) };
}

/** Les feuilles de l'arbre VIVANT (compte basculé) : chemins complets, identifiants. */
export function feuillesArbreVivantVinted() {
  return arbreVivantVinted().feuilles.map((f) => ({ chemin: f.chemin.slice(), id: f.id }));
}

// Les sous-niveaux de chaque nœud, dans l'arbre vivant et dans l'arbre relevé (ancien) : clé = chemin du parent.
let niveauxVinted = null;
function niveauxDesArbresVinted() {
  if (niveauxVinted) return niveauxVinted;
  const ajouter = (m, chemin) => {
    for (let k = 0; k < chemin.length; k++) {
      const p = cleCheminVinted(chemin.slice(0, k));
      if (!m.has(p)) m.set(p, new Set());
      m.get(p).add(norm(chemin[k]).replace(/\s*&\s*/g, " et "));
    }
  };
  const nouveau = new Map();
  for (const f of arbreVivantVinted().feuilles) ajouter(nouveau, f.chemin);
  const ancien = new Map();
  for (const id of arbreVinted().parId.keys()) ajouter(ancien, cheminVintedDe(id));
  niveauxVinted = { nouveau, ancien };
  return niveauxVinted;
}

/**
 * Les rayons qu'une page Vinted a montrés à un niveau (allowed_values de la question de l'extension) sont-ils ceux
 * d'un niveau du NOUVEL arbre que l'ancien n'a pas ? Preuve que le compte est basculé — jamais une supposition :
 * liste vide, rayon inconnu de nos relevés, ou niveau identique dans l'ancien arbre → non.
 */
export function pageDuNouvelArbreVinted(options) {
  const vus = [...new Set((Array.isArray(options) ? options : []).map((o) => norm(o).replace(/\s*&\s*/g, " et ")).filter(Boolean))];
  if (vus.length < 2) return false;
  const { nouveau, ancien } = niveauxDesArbresVinted();
  for (const [p, enfants] of nouveau) {
    if (!vus.every((v) => enfants.has(v))) continue;
    const a = ancien.get(p);
    if (!a || !vus.every((v) => a.has(v))) return true;
  }
  return false;
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

// ── (25/10, chaouidz) LES GENRES POSSIBLES D'APRÈS LE RAYON VINTED DE LA FICHE ─
// Un REPLI, quand la fiche ne dit pas le genre (genreLu nul) — le moteur ne
// tourne de toute façon que si le rayon manque, donc si le fil d'Ariane de
// l'annonce d'origine n'a pas été lu (c'est lui qui fait foi : « Mode › Garçon ›
// Chaussures (garçon) › Baskets (garçon) » sur la page de 32089448). Il ÉLAGUE,
// il ne choisit jamais : Vinted range les tailles bébé DANS « Vêtements pour
// garçons » (catalog 1653 « … › Chaussures › Chaussures bébé » pour cette même
// basket, rangée « Baskets (garçon) » chez Beebs) — donc garçon ET bébé, jamais
// bébé seul. Hors des vêtements genrés (jeux, puériculture, santé et grossesse…),
// aucun élagage : null.
export function genresDuRayonVinted(catalogId) {
  const id = Number(catalogId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const chemin = cheminVintedDe(id).map(norm);
  if (chemin[0] === "femmes") return ["femme"];
  if (chemin[0] === "hommes") return ["homme"];
  if (chemin[0] === "enfants" && chemin[1] === "vêtements pour garçons") return ["garcon", "bebe"];
  if (chemin[0] === "enfants" && chemin[1] === "vêtements pour filles") return ["fille", "bebe"];
  return null;
}

/**
 * Les FEUILLES candidates (chemins complets) d'un rayon refusé.
 * Vinted : sous le rayon d'origine seulement. Beebs, Leboncoin : sous le rayon
 * d'origine s'il est connu, sinon l'arbre entier — élagué au genre lu.
 */
/** @param {{ plateforme?: string, base?: string[], genre?: string|null, titre?: string, enfantsVivants?: string[]|null, exclure?: string[]|null, genresPossibles?: string[]|null }} [p] */
export function feuillesCandidates({ plateforme = "", base = [], genre = null, titre = "", enfantsVivants = null, exclure = null, genresPossibles = null } = {}) {
  const b = Array.isArray(base) ? base.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  let feuilles = [];
  if (plateforme === "vinted") {
    const id = noeudVintedDuChemin(b);
    if (id == null || !b.length) return [];
    if (niveauMortVinted(b) >= 0 && !Array.isArray(enfantsVivants)) {
      // (07/11 nuit, point 1) Chemin de l'ancien arbre sur un compte basculé (plan « rayon disparu » : enfantsVivants
      // null) : l'équivalent sûr s'il existe, sinon TOUT l'arbre vivant (jamais « sous » une branche morte). Un compte
      // resté sur l'ancien arbre (plan d'avant : enfantsVivants lus sur sa page) garde la règle d'avant ci-dessous.
      const eq = equivalentVivantVinted(b);
      feuilles = eq ? [eq] : feuillesArbreVivantVinted();
    } else {
      feuilles = feuillesVintedSous(id).filter((f) => f !== id).map((f) => ({ chemin: cheminVintedDe(f), id: String(f) }));
      // Le catalogue VIVANT fait foi : quand Vinted a dit quels sous-rayons il
      // propose sous ce niveau, une feuille de notre relevé hors de cette liste
      // n'est jamais candidate (relevé du 25/09 périmé sur ce point).
      const vivants = Array.isArray(enfantsVivants) ? new Set(enfantsVivants.map(norm)) : null;
      if (vivants && vivants.size) feuilles = feuilles.filter((f) => vivants.has(norm(f.chemin[b.length])));
    }
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
    // (07/11 nuit) Vinted : les rayons les plus proches du refusé d'abord (une question plafonnée à 600 garde les bons).
    if (plateforme === "vinted") feuilles = trierParProximite(feuilles, exclure);
  }
  // Le genre lu sur la fiche n'est jamais contredit : une feuille d'un AUTRE
  // genre est retirée (une feuille sans genre reste).
  const g = genreLu({ genre, titre });
  if (g) {
    const gardees = feuilles.filter((f) => { const gf = genreDuChemin(f.chemin); return !gf || gf === g; });
    if (gardees.length) feuilles = gardees;
  } else if (plateforme !== "vinted" && Array.isArray(genresPossibles) && genresPossibles.length) {
    // (25/10) Repli : les genres possibles d'après le rayon Vinted de la fiche
    // (genresDuRayonVinted) — une feuille sans genre reste, comme au-dessus.
    const possibles = new Set(genresPossibles);
    const gardees = feuilles.filter((f) => { const gf = genreDuChemin(f.chemin); return !gf || possibles.has(gf); });
    if (gardees.length) feuilles = gardees;
  }
  return feuilles;
}

/** Le chemin relatif au rayon d'origine, tel qu'il est proposé dans la question. */
export function libelleFeuille(chemin, base) {
  // (07/11 nuit, point 1) Relatif au rayon d'origine seulement quand il en est le préfixe : une feuille de l'arbre
  // vivant cherchée hors d'une branche morte se lit en entier (« Maison › Entretien de la maison › … »).
  const b = Array.isArray(base) && base.length && base.length < chemin.length
    && base.every((s, i) => norm(chemin[i]) === norm(s)) ? base.length : 0;
  const reste = chemin.slice(b);
  return (reste.length ? reste : chemin).join(SEPARATEUR_RAYON);
}

/** Les feuilles les plus proches d'un chemin d'abord (plus long préfixe commun), l'ordre de l'arbre ensuite. */
function trierParProximite(feuilles, chemin) {
  const ref = (Array.isArray(chemin) ? chemin : []).map(norm);
  const commun = (c) => { let n = 0; while (n < c.length && n < ref.length && norm(c[n]) === ref[n]) n++; return n; };
  return feuilles.map((f, i) => ({ f, i, n: commun(f.chemin) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.f);
}

/**
 * (07/11 nuit, point 1) L'arbre VIVANT entier, en deux temps : la BRANCHE (deux premiers niveaux, ce qu'elle contient
 * montré — consigne « le plus proche », comme la descente de l'app), puis la FEUILLE dans la branche (consigne
 * ordinaire : null est une bonne réponse). Jamais une feuille hors de nos listes. Le doute rend les feuilles de la
 * branche retenue (ou, sans branche, celles de la racine d'origine) : la question qui suit reste lisible.
 */
async function descenteArbreVivantVinted({ feuilles, base, titre, attributsIA, user_id }, appelerIA) {
  const cle = (c) => c.map(norm).join(" | ");
  const racineOrigine = Array.isArray(base) && base.length ? norm(base[0]) : null;
  const repli = (() => {
    const r = racineOrigine ? feuilles.filter((f) => norm(f.chemin[0]) === racineOrigine) : [];
    return (r.length ? r : feuilles).slice(0, 600);
  })();
  const branches = new Map();
  for (const f of feuilles) {
    const tete = f.chemin.slice(0, 2);
    const k = cle(tete);
    if (!branches.has(k)) branches.set(k, { chemin: tete, sous: new Set() });
    if (f.chemin.length > 2) branches.get(k).sous.add(f.chemin[2]);
  }
  const candidatsBranches = [...branches.values()].map((b) => ({ chemin: b.chemin, ...(b.sous.size ? { sous: [...b.sous].slice(0, 30) } : {}) }));
  let rep1 = null;
  try {
    rep1 = await appelerIA({
      titre: String(titre ?? "").slice(0, 200), attributs: attributsIA, consigne: "plus_proche",
      candidats: { vinted: candidatsBranches }, max_candidats: candidatsBranches.length, user_id,
    });
  } catch (e) {
    return { doute: true, motif: "ia_indisponible", iaIndisponible: true, detail: String(e?.message ?? e).slice(0, 120), feuilles: repli };
  }
  if (rep1?.motif === "ia_indisponible") return { doute: true, motif: "ia_indisponible", iaIndisponible: true, feuilles: repli };
  const c1 = rep1?.choix?.vinted;
  const branche = Array.isArray(c1?.chemin) ? candidatsBranches.find((b) => cle(b.chemin) === cle(c1.chemin)) : null;
  if (!branche) return { doute: true, motif: "ia_sans_branche", feuilles: repli };
  const dansBranche = feuilles.filter((f) => cle(f.chemin.slice(0, branche.chemin.length)) === cle(branche.chemin));
  let rep2 = null;
  try {
    rep2 = await appelerIA({
      titre: String(titre ?? "").slice(0, 200), attributs: attributsIA,
      candidats: { vinted: dansBranche.map((f) => ({ chemin: f.chemin, ...(f.id ? { id: f.id } : {}) })) },
      max_candidats: dansBranche.length, user_id,
    });
  } catch (e) {
    return { doute: true, motif: "ia_indisponible", iaIndisponible: true, detail: String(e?.message ?? e).slice(0, 120), feuilles: dansBranche };
  }
  if (rep2?.motif === "ia_indisponible") return { doute: true, motif: "ia_indisponible", iaIndisponible: true, feuilles: dansBranche };
  const c2 = rep2?.choix?.vinted;
  const f = Array.isArray(c2?.chemin) ? dansBranche.find((x) => cle(x.chemin) === cle(c2.chemin)) : null;
  if (!f) return { doute: true, motif: c2 ? "hors_liste" : "ia_sans_choix", feuilles: dansBranche };
  return { chemin: f.chemin, id: f.id, source: "ia_arbre_vivant", branche: branche.chemin, feuilles: dansBranche };
}

/**
 * Le choix du moteur. Rend { chemin, id, source } (certain) ou
 * { doute: true, motif, feuilles } — jamais une feuille hors de la liste.
 * `appelerIA(corps)` : POST resolve-categorie (secret cron), rend son JSON.
 */
export async function resoudreRayonRefuse(entree, appelerIA) {
  const { plateforme, base, titre, description, objet, marque, genre, taille, user_id, enfantsVivants, exclure, genresPossibles } = entree;
  const feuilles = feuillesCandidates({ plateforme, base, genre, titre, enfantsVivants, exclure, genresPossibles });
  if (!feuilles.length) return { doute: true, motif: "aucune_feuille", feuilles };
  // (07/11 nuit, point 2) Vinted refuse le rayon AUX COMPTES PRO (exclure = le rayon refusé, seul cas Vinted qui en
  // porte un) : ce n'est pas une affaire de catalogue, c'est une règle de Vinted pour ce compte — le moteur ne
  // contourne jamais une interdiction en rangeant l'article ailleurs à sa place. La personne choisit (autre rayon, ou
  // Vinted abandonné) ; les rayons les plus proches du refusé en tête.
  if (plateforme === "vinted" && Array.isArray(exclure) && exclure.length) {
    return { doute: true, motif: "choix_de_la_personne", feuilles: trierParProximite(feuilles, exclure) };
  }
  if (feuilles.length === 1) return { chemin: feuilles[0].chemin, id: feuilles[0].id, source: "seule_feuille", feuilles };
  const attributsIA = {
    "objet identifié": String(objet ?? "").trim() || null,
    description: String(description ?? "").replace(/\s+/g, " ").trim() || null,
    marque: String(marque ?? "").trim() || null,
    genre: String(genre ?? "").trim() || null,
    taille: String(taille ?? "").trim() || null,
    "rayon d'origine": Array.isArray(base) && base.length ? base.join(" > ") : null,
  };
  if (feuilles.length > 600) {
    // (07/11 nuit, point 1) L'arbre vivant entier (≈ 2 500 feuilles) ne tient pas dans une question : deux temps.
    if (plateforme === "vinted") return descenteArbreVivantVinted({ feuilles, base, titre, attributsIA, user_id }, appelerIA);
    return { doute: true, motif: "trop_de_feuilles", feuilles };
  }
  let rep = null;
  try {
    rep = await appelerIA({
      titre: String(titre ?? "").slice(0, 200),
      attributs: attributsIA,
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
/** @param {{ plateforme?: string, base?: string[], feuilles?: Array<{ chemin: string[], id: string|null }>, cleChamp?: string, raison?: string }} [p] */
export function questionRayonRefuse({ plateforme = "", base = [], feuilles = [], cleChamp = CLE_REPONSE_RAYON, raison = RAISON_RAYON_REFUSE } = {}) {
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
    raison: [RAISON_RAYON_ABSENT, RAISON_RAYON_DISPARU, RAISON_RAYON_INTERDIT_PRO, RAISON_RAYON_REFUSE_AU_COMPTE].includes(raison) ? raison : RAISON_RAYON_REFUSE,
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
  if (f) return { chemin: f.chemin, id: f.id };
  // (07/11 nuit, point 1) Une question posée AVANT ce correctif sur un rayon de l'ancien arbre (compte resté sur
  // l'ancien arbre : feuilles SOUS le rayon, libellés relatifs) se retraduit toujours : jamais une réponse perdue.
  if (plateforme === "vinted" && niveauMortVinted(base) >= 0) {
    const id = noeudVintedDuChemin(base);
    const avant = id == null ? [] : feuillesVintedSous(id).filter((x) => x !== id).map((x) => ({ chemin: cheminVintedDe(x), id: String(x) }));
    const g = avant.find((x) => norm(libelleFeuille(x.chemin, base)) === norm(r));
    if (g) return { chemin: g.chemin, id: g.id };
  }
  return null;
}

// ── LE CAS D'UN JOB, ET CE QUI S'ÉCRIT ──────────────────────────────────────
// La clé de la réponse de la personne (question de dernier recours) : jamais
// la clé que l'extension lit elle-même (categoryLevelChoice ne descend que
// d'UN niveau, beebsCategoryPath attend un tableau) — get-pending-jobs la
// traduit en chemin complet avant de servir le job (cheminDeLaReponse).
export const CLE_REPONSE_RAYON = "rayonChoisi";
const CHAMP_RAYON = { vinted: "categoryPath", beebs: "beebsCategoryPath", leboncoin: "lbcCategoryPath" };
// ── (25/10, chaouidz) UN RAYON ABSENT N'EST PAS UN RAYON REFUSÉ ─────────────
// « basket Nike noir et blanche taille 18 » (republication Beebs 8a608034,
// annonce 32089448) : Beebs n'avait RIEN refusé — la copie (relevé, aucune
// capture) n'avait pas de rayon, et le message disait « Beebs n'accepte plus la
// catégorie de cette annonce ». La raison de la question et son message disent
// désormais lequel des deux cas c'est.
export const RAISON_RAYON_REFUSE = "rayon_refuse_par_la_plateforme";
export const RAISON_RAYON_ABSENT = "rayon_absent_de_la_copie";
// (07/11 nuit, point 1) Publication Vinted dont le rayon n'existe plus dans l'arbre du compte (bascule de Vinted).
export const RAISON_RAYON_DISPARU = "rayon_disparu_de_l_arbre_du_compte";
// (07/11 nuit, point 2) Publication Vinted refusée par Vinted parce que le compte est Pro (« Les utilisateurs Vinted Pro
// ne peuvent pas ajouter d'articles dans ce catalogue ») : la personne choisit, jamais le moteur.
export const RAISON_RAYON_INTERDIT_PRO = "rayon_interdit_aux_comptes_pro";
// La marque que l'extension (≥ 0.6.179) pose sur sa question « categoryLevelChoice » quand Vinted a refusé le rayon au
// compte Pro (needsUserField.raison, 60 caractères au plus — markNeedsUser) : miroir de vinted.js / background.js.
export const RAISON_NU_INTERDIT_PRO = "rayon_interdit_pro";
// Même refus du rayon au compte, sans la mention « Pro » dans le texte de Vinted (autre langue, autre motif) : même
// traitement, message sans « Pro ».
export const RAISON_RAYON_REFUSE_AU_COMPTE = "rayon_refuse_au_compte";
export const RAISON_NU_REFUSE_AU_COMPTE = "rayon_refuse_au_compte";

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
 * (25/10) `raison` dit lequel des deux cas c'est : RAISON_RAYON_ABSENT (la copie
 * n'a pas de rayon — Beebs toujours, Leboncoin sans rayon) ou
 * RAISON_RAYON_REFUSE (la plateforme refuse celui qu'elle porte).
 */
export function rayonRefuseDuJob(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.platform === "vinted" && job.status === "needs_user") {
    const nf = pf.needsUserField;
    if (!nf || nf.field_key !== "categoryLevelChoice") return null;
    // ⛔ (29/10, lot B 4.1 — mele.marta 2fd83d73) Des racines d'une AUTRE langue (« Elettronica, Libri e media… »)
    //    ne prouvent aucun refus : Vinted a servi la page dans la langue du compte et le rayon était juste (3026). Le
    //    libellé français est seulement introuvable — même règle que « seul un refus prouvé est un refus ».
    if (langueEtrangereDesRacines(nf.allowed_values)) return null;
    const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : {};
    const brut = job.action === "republish" ? snap.categoryPath : pf.categoryPath;
    const base = prefixeVintedConnu(brut);
    if (!base.length) return null;
    // (07/11 nuit, point 2) Rayon interdit aux comptes Pro (marque de l'extension) : publication seulement. La question
    // part sur les feuilles de la même racine (les plus proches d'abord), le rayon refusé exclu ; jamais un choix du
    // moteur (resoudreRayonRefuse : exclure ⇒ la personne). Une republication garde le message vrai, sans question.
    if ([RAISON_NU_INTERDIT_PRO, RAISON_NU_REFUSE_AU_COMPTE].includes(String(nf.raison ?? ""))) {
      if (job.action !== "publish") return null;
      const raison = String(nf.raison) === RAISON_NU_INTERDIT_PRO ? RAISON_RAYON_INTERDIT_PRO : RAISON_RAYON_REFUSE_AU_COMPTE;
      return { plateforme: "vinted", base: base.slice(0, 1), raison, exclure: base, enfantsVivants: null };
    }
    // (07/11 nuit, point 1) Chemin de l'ancien arbre (niveau retiré par la bascule) sur une page PROUVÉE du nouvel arbre
    // (pageDuNouvelArbreVinted) : tout l'arbre vivant (enfantsVivants null — c'est ce qui le dit à feuillesCandidates).
    // Page de l'ancien arbre (le niveau retiré s'y voit encore) ou preuve absente : la règle d'avant, à l'identique.
    const mort = niveauMortVinted(base);
    if (mort >= 0) {
      const vus = new Set((Array.isArray(nf.allowed_values) ? nf.allowed_values : []).map(norm));
      if (!vus.has(norm(base[mort])) && pageDuNouvelArbreVinted(nf.allowed_values)) {
        return { plateforme: "vinted", base, raison: job.action === "publish" ? RAISON_RAYON_DISPARU : RAISON_RAYON_REFUSE, enfantsVivants: null };
      }
      return { plateforme: "vinted", base, raison: RAISON_RAYON_REFUSE, enfantsVivants: Array.isArray(nf.allowed_values) ? nf.allowed_values : [] };
    }
    return { plateforme: "vinted", base, raison: RAISON_RAYON_REFUSE, enfantsVivants: Array.isArray(nf.allowed_values) ? nf.allowed_values : null };
  }
  if (job?.platform === "beebs" && job.action === "republish" && job.status === "needs_user") {
    const manquants = Array.isArray(pf.republish_prevol_manquants) ? pf.republish_prevol_manquants : [];
    if (!manquants.includes("le rayon Beebs")) return null;
    if (Array.isArray(pf.beebsCategoryPath) && pf.beebsCategoryPath.length) return null;
    return { plateforme: "beebs", base: [], raison: RAISON_RAYON_ABSENT };
  }
  if (job?.platform === "leboncoin" && job.action === "republish" && ["pending", "needs_user"].includes(job.status)) {
    const detail = String(pf.republish_prevol_formulaire?.detail ?? "");
    const sansRayon = !(Array.isArray(pf.lbcCategoryPath) && pf.lbcCategoryPath.length);
    // ⛔ (29/10, point 3 — camille.ferren c82117cd) SEUL un refus PROUVÉ est un refus : la racine ou la feuille que
    //    l'arbre AFFICHÉ par Leboncoin n'a pas (« Catégorie: feuille "X" introuvable sous "Y". Options affichées… »).
    //    « ni suggestion ni sélecteur manuel trouvés » / « panneau des racines introuvable » disent que la PAGE n'a pas
    //    été lue (verdict « illisible », nouvel essai dans 30 min) : la catégorie d'origine n'y est pour rien. Avant, le
    //    moteur l'écartait (« Loisirs créatifs », en ligne et relevée le 28/10), en choisissait une autre
    //    (« Jeux & Jouets », 27 dépôts acceptés en 4 jours), puis disait « Leboncoin n'accepte plus la catégorie ».
    const refuse = /Catégorie\s*:\s*(?:racine|feuille)\b[^.]*introuvable/i.test(detail)
      && pf.republish_prevol_formulaire?.verdict !== "ok";
    if (!sansRayon && !refuse) return null;
    return { plateforme: "leboncoin", base: [], raison: sansRayon ? RAISON_RAYON_ABSENT : RAISON_RAYON_REFUSE,
      ...(refuse && !sansRayon ? { exclure: pf.lbcCategoryPath } : {}) };
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
export function messageRayonAChoisir(plateforme, base, raison = RAISON_RAYON_REFUSE) {
  const nom = { vinted: "Vinted", beebs: "Beebs", leboncoin: "Leboncoin" }[plateforme] ?? plateforme;
  // (07/11 nuit) Publications Vinted seulement (rayonRefuseDuJob) : la sortie « Abandonner Vinted pour cet article »
  // existe dans la même fenêtre (StockTab, NeedsUserModal — abandonPossible : publication arrêtée, rien en ligne).
  const sortie = "Si tu ne veux pas de cet article sur Vinted : « Abandonner Vinted pour cet article », dans la même fenêtre.";
  if (raison === RAISON_RAYON_DISPARU) {
    const quoi = Array.isArray(base) && base.length ? ` « ${base.join(" › ")} »` : "";
    return `Publication en pause, rien n'est parti sur Vinted : ton compte Vinted n'a plus la catégorie${quoi} (Vinted a réorganisé son catalogue), `
      + "et FillSell n'a pas trouvé seul où ranger cet article. Choisis sa catégorie Vinted dans l'app (fiche de l'article, bouton « ✋ Compléter ») : "
      + `la publication repartira toute seule. ${sortie}`;
  }
  if (raison === RAISON_RAYON_INTERDIT_PRO || raison === RAISON_RAYON_REFUSE_AU_COMPTE) {
    return (raison === RAISON_RAYON_INTERDIT_PRO
      ? "Vinted n'autorise pas les comptes Pro à vendre dans le rayon choisi pour cet article : rien n'a été publié. "
      : "Vinted refuse le rayon choisi pour cet article à ton compte : rien n'a été publié. ")
      + "Choisis un autre rayon Vinted dans l'app (fiche de l'article, bouton « ✋ Compléter ») : la publication repartira toute seule. "
      + sortie;
  }
  // (25/10, chaouidz) Rayon ABSENT de la copie : la plateforme n'a rien refusé — le dire.
  if (raison === RAISON_RAYON_ABSENT) {
    const quoi = { beebs: "le rayon Beebs", leboncoin: "la catégorie Leboncoin" }[plateforme] ?? `la catégorie ${nom}`;
    const le = { beebs: "le", leboncoin: "la" }[plateforme] ?? "la";
    return `Republication en pause AVANT toute suppression — ton annonce est intacte sur ${nom}. FillSell n'a pas retrouvé ${quoi} de cette annonce `
      + `(sa copie n'en porte pas) et n'a pas pu ${le} choisir seul. Choisis-${le} dans l'app (fiche de l'article, bouton « ✋ Compléter ») : la republication repartira toute seule.`;
  }
  const ou = Array.isArray(base) && base.length ? ` de « ${base.join(" › ")} »` : "";
  return `Republication en pause AVANT toute suppression — ton annonce est intacte sur ${nom}. ${nom} n'accepte plus la catégorie de cette annonce, `
    + `et FillSell n'a pas pu choisir seul la bonne sous-catégorie${ou}. Choisis-la dans l'app (fiche de l'article, bouton « ✋ Compléter ») : la republication repartira toute seule.`;
}

/**
 * (07/11 nuit, point 1 — dca7193f) Un doute « aucune_feuille » posé AVANT que le moteur ne sache chercher hors d'une
 * branche morte se rejuge UNE fois quand il a désormais des feuilles pour ce même rayon (handler-watch, balayage des
 * questions posées : sans cette porte, le compteur d'essais déjà plein laissait la question de l'extension — dix sacs
 * pour une éponge — à la personne). Le rejugement réécrit rayon_moteur (motif nouveau, essais au-delà du plafond) :
 * jamais une boucle. Pur.
 * @param {any} rm  platform_fields.rayon_moteur du job
 * @param {{ plateforme: string, base: string[], enfantsVivants?: string[]|null, exclure?: string[]|null } | null} plan
 */
export function rayonMoteurARejuger(rm, plan) {
  if (!rm || typeof rm !== "object" || !rm.doute || rm.motif !== "aucune_feuille" || !plan) return false;
  if (Array.isArray(rm.base) && rm.base.join(" > ") !== (plan.base ?? []).join(" > ")) return false;
  return feuillesCandidates({ plateforme: plan.plateforme, base: plan.base, enfantsVivants: plan.enfantsVivants ?? null, exclure: plan.exclure ?? null }).length > 0;
}
