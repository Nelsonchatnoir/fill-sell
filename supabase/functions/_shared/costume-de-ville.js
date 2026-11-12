// ═══════════════════════════════════════════════════════════════════════════
// « COSTUME » = COSTUME DE VILLE, JAMAIS UN DÉGUISEMENT (règle de Nico, 11/11 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (compte 238dc49b, 11/11 20:13) : « Veste de costume bleu », mot-objet de l'IA « veste de costume ».
// Aucune feuille exacte → étape 3 (l'IA choisit parmi des candidates ratissées par le mot) : 18 candidates
// (src/utils/categorieParMot.js candidatsParMot), parmi lesquelles « Vêtements spécialisés et costumes » (92 — le
// rayon des DÉGUISEMENTS et tenues de travail) ; la bonne, « Hommes > Vêtements > Costumes et blazers > Blazers »
// (1786), n'y était PAS (son libellé ne porte ni « veste » ni « costume »). L'IA a pris 92 ; Vinted a refusé la taille
// « 50 » (grille en lettres de ce rayon).
//
// LA RÈGLE, appliquée par resolve-categorie APRÈS la réponse de l'IA (à chaque appel, la question à l'IA inchangée) :
//   · le TEXTE dit le sens : un déguisement se dit (« déguisement », « carnaval », « Halloween », « cosplay »,
//     « super-héros », « panoplie », « costume de pirate »…) ; sinon « costume », « veste de costume », « blazer »,
//     « smoking », « costume trois pièces », « tailleur » = la tenue de ville ;
//   · le RAYON a une famille, lue sur ses libellés : déguisements (« Déguisements », « Vêtements spécialisés et
//     costumes », « Costumes et tenues particulières », « Cosplay… ») ou ville (« Costumes et blazers », « Blazers et
//     tailleurs », « Blazers », « Ensembles costume », « Pantalons de costume », « Gilets de costume », « Costumes de
//     mariage », « Vestes et blazers »…) ; « Pochettes de costume » (un accessoire) n'est d'aucune des deux ;
//   · sens et famille contraires → le choix de l'IA ne part pas. Il est remplacé par LA candidate de la bonne famille
//     qui répond à la pièce (veste → Blazers, pantalon → Pantalons de costume, gilet, mariage, sinon l'ensemble) ;
//     sur Vinted, faute de candidate, par la feuille RÉELLE du catalogue (_shared/vinted-catalogue-fr.js) sous
//     « Hommes > Vêtements > Costumes et blazers » ou « Femmes > Vêtements > Blazers et tailleurs » ; sinon AUCUN
//     choix (mieux vaut rien qu'un rayon faux : l'app garde sa suite, la question au besoin).
// ⛔ Plateformes couvertes : Vinted et Beebs (libellés relus dans leurs arbres). eBay et Leboncoin : rien ne change
//    (« Costumes » d'eBay n'est pas lu ici). Ne reclasse aucune annonce existante : seulement les choix à venir.
// Module PUR (Deno + Node), un import relatif sans import.
import { CATALOGUE_VINTED_FR } from "./vinted-catalogue-fr.js";

export const PLATEFORMES_COSTUME = Object.freeze(["vinted", "beebs"]);

/** Minuscules, sans accents, ponctuation → espace (même esprit que texteComparable). */
export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['’]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

// Un déguisement SE DIT. Les thèmes suivent « costume de / d' » (« costume de pirate ») ou figurent seuls quand ils ne
// peuvent désigner qu'un déguisement (« cosplay », « panoplie »).
// ⛔ Jamais « prince » : « costume prince de Galles » est un tissu de costume de ville.
const THEMES = "pirate|pirates|sorcier|sorciere|princesse|clown|vampire|zombie|squelette|ninja|cow boy|cowboy|indien|indienne|"
  + "fee|elfe|pere noel|mere noel|lutin|dinosaure|licorne|superman|batman|spiderman|spider man|joker|minnie|mickey|"
  + "dark vador|star wars|harry potter|chevalier|mousquetaire|gladiateur|momie|diable|diablesse|ange|abeille|lapin|"
  + "animal|policier|pompier|infirmiere|mascotte|super heros|superheros|super heroine|personnage";
const DEGUISEMENT_RE = new RegExp(String.raw`\b(deguis\w*|carnaval\w*|halloween|cosplay\w*|panoplie\w*|mascotte\w*|`
  + String.raw`super ?hero(s|ine|ines)?|soiree (deguisee|costumee)|fete (deguisee|costumee)|bal (masque|costume)|`
  + String.raw`costumes? (de |d |du )?(scene|theatre|spectacle|${THEMES})\b)`);
const VILLE_RE = /\b(costumes?|blazers?|smokings?|complet veston|tailleurs?|vestes? de costume)\b/;

/** Le sens du texte : « deguisement », « ville », ou null (rien ne parle de costume). */
export function sensDuCostume(texte) {
  const t = norm(texte);
  if (!t) return null;
  if (DEGUISEMENT_RE.test(t)) return "deguisement";
  if (VILLE_RE.test(t)) return "ville";
  return null;
}

const FAMILLE_DEGUISEMENT_RE = /\b(deguisements?|cosplay)\b|^vetements specialises et costumes$|^costumes et tenues particulieres$/;
const FAMILLE_VILLE_RE = /^(costumes et blazers|blazers et tailleurs|vestes et blazers|blazers?|tailleurs? pieces separees|ensembles? (de )?costume|ensembles? tailleur.*|pantalons? (de costume|tailleurs?)|gilets? de costume|costumes? de mariage|jupes et robes tailleurs?|autres ensembles .*tailleurs|autres costumes|blazers et tailleurs)( (homme|femme|garcon|fille))?$/;

/** La famille d'un rayon (chemin de libellés) : « deguisement », « ville » ou null. */
export function familleDuRayon(chemin) {
  const segs = (Array.isArray(chemin) ? chemin : []).map(norm).filter(Boolean);
  if (segs.some((s) => FAMILLE_DEGUISEMENT_RE.test(s))) return "deguisement";
  if (segs.some((s) => FAMILLE_VILLE_RE.test(s))) return "ville";
  return null;
}

/** La pièce d'une tenue de ville : « veste », « pantalon », « gilet », « mariage » ou « ensemble ». */
export function pieceDuCostume(texte) {
  const t = norm(texte);
  if (/\bpantalons? (de costume|de smoking|tailleurs?)\b/.test(t)) return "pantalon";
  if (/\bgilets? de costume\b/.test(t)) return "gilet";
  if (/\b(vestes? (de costume|de smoking|tailleurs?)|blazers?)\b/.test(t)) return "veste";
  if (/\bmariag\w*|\bmaries?\b/.test(t)) return "mariage";
  return "ensemble";
}

// La feuille qui répond à la pièce, lue sur son DERNIER libellé.
const FEUILLE_PIECE = {
  ville: {
    veste: /^(blazers?|vestes et blazers)( (homme|femme))?$/,
    pantalon: /^pantalons? (de costume|tailleurs?)( (homme|femme))?$/,
    gilet: /^gilets? de costume( (homme|femme))?$/,
    mariage: /^costumes? de mariage( (homme|femme))?$/,
    ensemble: /^(ensembles? (de )?costume|ensembles? tailleur.*)( (homme|femme))?$/,
  },
};
const feuilleRepond = (sens, piece, chemin) => {
  const der = norm((Array.isArray(chemin) ? chemin : []).at(-1));
  if (sens === "deguisement") return FAMILLE_DEGUISEMENT_RE.test(der);
  return Boolean(FEUILLE_PIECE.ville[piece]?.test(der));
};

// ── Le catalogue Vinted (serveur) : la feuille réelle sous le rayon de ville du genre du choix ────────────────────────
let INDEX = null;
function indexVinted() {
  if (INDEX) return INDEX;
  const parId = new Map(), enfants = new Map();
  for (const [id, parent, lib] of CATALOGUE_VINTED_FR) {
    parId.set(id, { id, parent, lib });
    if (!enfants.has(parent)) enfants.set(parent, []);
    enfants.get(parent).push(id);
  }
  INDEX = { parId, enfants };
  return INDEX;
}
function noeudParChemin(chemin) {
  const { parId, enfants } = indexVinted();
  let courant = 0;
  for (const lib of chemin) {
    const suivant = (enfants.get(courant) ?? []).find((id) => parId.get(id)?.lib === lib);
    if (suivant == null) return null;
    courant = suivant;
  }
  return courant;
}
const RAYON_VILLE_VINTED = { Hommes: ["Hommes", "Vêtements", "Costumes et blazers"], Femmes: ["Femmes", "Vêtements", "Blazers et tailleurs"] };
/** Sur Vinted, la feuille de ville du genre du choix qui répond à la pièce, ou null. */
export function feuilleVilleVinted(cheminChoisi, piece) {
  const base = RAYON_VILLE_VINTED[String(cheminChoisi?.[0] ?? "")];
  if (!base) return null;
  const noeud = noeudParChemin(base);
  if (noeud == null) return null;
  const { parId, enfants } = indexVinted();
  const feuilles = (enfants.get(noeud) ?? []).filter((id) => !(enfants.get(id) ?? []).length)
    .filter((id) => feuilleRepond("ville", piece, [parId.get(id).lib]));
  if (feuilles.length !== 1) return null;
  return { chemin: [...base, parId.get(feuilles[0]).lib], id: String(feuilles[0]), source: "garde_costume_catalogue" };
}

/**
 * Le verdict sur UN choix de l'IA, ou null (rien à redire).
 * @param {{ plateforme: string, texte: string, choix: { chemin: string[], id?: string|null }, candidats?: Array<{ chemin: string[], id?: string|null }>, catalogue?: boolean }} a
 * @returns {null | { sens: string, famille: string, remplacement: { chemin: string[], id: string|null, source: string } | null, motif: string }}
 */
export function verdictCostume({ plateforme, texte, choix, candidats = [], catalogue = true }) {
  if (!PLATEFORMES_COSTUME.includes(String(plateforme))) return null;
  const sens = sensDuCostume(texte);
  const famille = familleDuRayon(choix?.chemin);
  if (!sens || !famille || sens === famille) return null;
  const piece = sens === "ville" ? pieceDuCostume(texte) : null;
  const bonnes = (Array.isArray(candidats) ? candidats : [])
    .filter((c) => Array.isArray(c?.chemin) && familleDuRayon(c.chemin) === sens && feuilleRepond(sens, piece, c.chemin));
  // Même genre que le choix d'abord (le choix de l'IA a jugé le genre ; la règle ne juge que le sens du costume).
  const memeRacine = bonnes.filter((c) => c.chemin[0] === choix.chemin[0]);
  const parmi = memeRacine.length ? memeRacine : bonnes;
  let remplacement = parmi.length === 1 ? { chemin: parmi[0].chemin, id: parmi[0].id ?? null, source: "garde_costume" } : null;
  if (!remplacement && !parmi.length && catalogue && plateforme === "vinted" && sens === "ville") remplacement = feuilleVilleVinted(choix.chemin, piece);
  const motif = sens === "ville"
    ? `« costume » = tenue de ville (règle de Nico) : « ${choix.chemin.join(" > ")} » est un rayon de déguisements`
    : `déguisement nommé dans le texte : « ${choix.chemin.join(" > ")} » est un rayon de costumes de ville`;
  return { sens, famille, remplacement, motif };
}
