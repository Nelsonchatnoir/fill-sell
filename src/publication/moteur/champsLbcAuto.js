// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS OBLIGATOIRES DE LEBONCOIN SE REMPLISSENT SEULS (12/10, A10)
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 11/10 19:10-20:00 : « Univers » demandé à la main sur 13 vêtements
// (Mode > Vêtements) dont la fiche disait tout — catégorie Vinted « Enfants ›
// Vêtements pour filles › … », taille « 8 ans / 128 cm » ; « Produit » et
// « Type » demandés sur de l'électroménager et de la déco (un abandon). Mesuré
// sur 30 jours : Décoration « Produit » 84 questions, Mode « Univers » 78,
// Électroménager « Produit » 47 dont 47 % d'abandons.
//
// LA RÈGLE, tous les champs obligatoires de Leboncoin :
//   1. ce que la FICHE dit déjà se pose sans question : l'Univers d'un
//      vêtement / d'une chaussure vient du genre de la fiche, de la racine de
//      sa catégorie Vinted (Femmes / Hommes / Enfants), d'une taille enfant
//      (« 8 ans », « 18 mois ») ou d'un mot du titre — plusieurs sources qui
//      se contredisent = rien (universLbcDeLaFiche) ;
//   2. un champ à liste encore vide ou hors liste passe par une SECONDE passe
//      de l'IA, avec tout le contexte de la fiche (objet identifié par l'IA,
//      genre, catégorie Vinted, taille, marque), réponse contrôlée : une
//      entrée de LA liste, sinon rien (champsLbcSecondePasse) ;
//   3. sur les 6 feuilles Maison & Jardin où « Produit » dépend de « Univers /
//      Type », UNE question à l'IA sur les PAIRES « Type › Produit » (la liste
//      du second dépend du premier : une réponse les pose tous les deux) ;
//   4. la question ne reste qu'au vrai doute — avec ses choix (A10bis).
// Pur (Node + Vite) : scripts/champs-lbc-auto-selftest.mjs.
import { LBC_MAISON_JARDIN_DEPENDANTS } from "../../utils/lbcMaisonJardin.js";

export const SEPARATEUR_PAIRE = " › ";
const norm = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

// Valeurs de genre → valeur d'Univers Leboncoin (vêtements, chaussures).
const UNIVERS_DU_GENRE = new Map([
  ["femme", "Femme"], ["femmes", "Femme"], ["woman", "Femme"], ["women", "Femme"],
  ["homme", "Homme"], ["hommes", "Homme"], ["man", "Homme"], ["men", "Homme"],
  ["fille", "Enfant"], ["filles", "Enfant"], ["garçon", "Enfant"], ["garçons", "Enfant"], ["garcon", "Enfant"],
  ["bébé", "Enfant"], ["bebe", "Enfant"], ["enfant", "Enfant"], ["enfants", "Enfant"], ["kids", "Enfant"],
  ["maternité", "Maternité"], ["grossesse", "Maternité"],
]);
const mot = (m) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${m})(?![\\p{L}])`, "iu");
const TITRE = [
  ["Femme", mot("femmes?|woman|women")],
  ["Homme", mot("hommes?|man|men")],
  ["Enfant", mot("filles?|gar[cç]ons?|enfants?|b[ée]b[ée]s?|kids?|junior")],
  ["Maternité", mot("maternit[ée]|grossesse")],
];
// « 8 ans », « 18 mois », « naissance » — jamais une lettre seule (« 40 M » est une taille adulte).
const TAILLE_ENFANT = mot("\\d{1,2} ?(?:ans|mois)|naissance|pr[ée]matur[ée]");

/**
 * L'Univers que la fiche DIT (jamais deviné), ou null.
 * @returns {{ valeur: string, source: string } | null}
 */
export function universLbcDeLaFiche({ genres = [], cheminVinted = null, taille = null, titre = "", allowedValues = null } = {}) {
  const votes = [];
  for (const g of genres) {
    const u = UNIVERS_DU_GENRE.get(norm(g));
    if (u) votes.push({ valeur: u, source: "genre" });
  }
  const racine = Array.isArray(cheminVinted) && cheminVinted.length ? UNIVERS_DU_GENRE.get(norm(cheminVinted[0])) : null;
  if (racine) votes.push({ valeur: racine, source: "categorie_vinted" });
  if (TAILLE_ENFANT.test(String(taille ?? ""))) votes.push({ valeur: "Enfant", source: "taille" });
  const titreVotes = TITRE.filter(([, re]) => re.test(String(titre ?? ""))).map(([u]) => u);
  if (titreVotes.length === 1) votes.push({ valeur: titreVotes[0], source: "titre" });
  if (!votes.length) return null;
  const valeurs = new Set(votes.map((v) => v.valeur));
  if (valeurs.size !== 1) return null; // les sources se contredisent : la question
  const valeur = votes[0].valeur;
  // La liste de la plateforme fait la valeur exacte ; absente de la liste = rien.
  if (Array.isArray(allowedValues) && allowedValues.length) {
    const exacte = allowedValues.find((v) => norm(v) === norm(valeur));
    if (!exacte) return null;
    return { valeur: String(exacte), source: votes.map((v) => v.source).join("+") };
  }
  return { valeur, source: votes.map((v) => v.source).join("+") };
}

/** Les PAIRES « Type › Produit » d'une feuille Maison & Jardin (null ailleurs). */
export function pairesMaisonJardin(categorie) {
  const f = LBC_MAISON_JARDIN_DEPENDANTS[categorie];
  if (!f) return null;
  const paires = [];
  for (const [type, produits] of Object.entries(f.produits ?? {})) {
    for (const p of produits ?? []) paires.push({ libelle: `${type}${SEPARATEUR_PAIRE}${p}`, type, produit: p });
  }
  // Les fourre-tout (« Autre ») en dernier : jamais préférés à un vrai rayon.
  const fourreTout = (x) => /^autres?$/i.test(x.type) || /^autres?$/i.test(x.produit);
  return { typeKey: f.typeKey, produitKey: f.produitKey, paires: [...paires.filter((x) => !fourreTout(x)), ...paires.filter(fourreTout)] };
}

/** Une ligne du statut est-elle encore à trancher ? (vide, hors liste sans rapprochement, fourre-tout) */
export function aTrancher(a) {
  if (!a) return false;
  if (a.deduit?.valeur) return false;
  return a.state === "missing" || (a.state === "invalid" && !a.suggested);
}

// Champs que la seconde passe ne touche JAMAIS : la taille, la marque, la
// couleur, la matière ont leur propre chemin (fiche, question dédiée, IA
// couleur) ; l'état, le colis, le poids ne se devinent pas.
const JAMAIS = /^(taille|pointure|marque|couleur|mati[eè]re|[ée]tat|poids|format|colis|quantit[ée])/i;

/**
 * Ce que la seconde passe demande à l'IA pour la copie Leboncoin :
 *   { simples: [{ key, label, allowedValues, dedicatedTarget }], paire: { typeKey, produitKey, options } | null }
 * Une seule demande par (catégorie, champ, liste) — `deja` (Set) mémorise.
 */
export function champsLbcSecondePasse(list, { categorie, deja = new Set(), touchesParLaPersonne = new Set() } = {}) {
  const lignes = (list ?? []).filter((a) => aTrancher(a)
    && !touchesParLaPersonne.has(a.key)
    && !JAMAIS.test(String(a.label ?? a.key ?? ""))
    && !["taille", "marque", "couleur", "matiere", "etat"].includes(a.dedicatedTarget));
  const mj = pairesMaisonJardin(categorie);
  let paire = null;
  if (mj && lignes.some((a) => a.key === mj.typeKey || a.key === mj.produitKey)) {
    const cle = `${categorie}|paire`;
    if (!deja.has(cle)) paire = { cle, typeKey: mj.typeKey, produitKey: mj.produitKey, options: mj.paires.map((x) => x.libelle) };
  }
  const simples = lignes
    .filter((a) => !(mj && (a.key === mj.typeKey || a.key === mj.produitKey)))
    .filter((a) => (a.allowedValues?.length ?? 0) >= 2)
    .map((a) => ({ ...a, cle: `${categorie}|${a.key}|${a.allowedValues.length}` }))
    .filter((a) => !deja.has(a.cle));
  return { simples, paire };
}

/** La réponse de l'IA, CONTRÔLÉE : une entrée de la liste envoyée, sinon null. */
export function reponseDansLaListe(reponse, options) {
  const r = norm(reponse);
  if (!r || r === "null") return null;
  return (options ?? []).find((o) => norm(o) === r) ?? null;
}

/** « Type › Produit » → { type, produit } d'une paire connue, sinon null. */
export function paireDeLaReponse(categorie, reponse) {
  const mj = pairesMaisonJardin(categorie);
  if (!mj) return null;
  const x = mj.paires.find((p) => norm(p.libelle) === norm(reponse));
  return x ? { type: x.type, produit: x.produit, typeKey: mj.typeKey, produitKey: mj.produitKey } : null;
}
