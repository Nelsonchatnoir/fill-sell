import { texteComparable } from "./texteComparable";

// Sources qui portent une valeur réellement lue sur une annonce ou saisie par
// la personne. `lens` est volontairement absent : une estimation peut aider à
// rédiger, jamais faire disparaître une question obligatoire.
const SOURCE_CERTAINE = /^(?:capture(?:$|_)|vinted(?:$|_)|releve(?:$|_)|manuel(?:$|_))/;

const CLES_FICHE = {
  etat: "etat", condition: "etat",
  taille: "taille", size: "taille",
  couleur: "couleur", color: "couleur",
  matiere: "matiere", material: "matiere",
  genre: "genre",
  marque: "marque", brand: "marque",
  // Le relevé range le gabarit durable sous `attributs.colis` (Petit/Moyen/
  // Grand). Les copies l'appellent `format_colis`.
  format_colis: "colis",
};

/**
 * Valeur durable portée par inventaire.attributs.
 * Les anciennes chaînes nues sont des saisies/relevés antérieurs à la trace
 * de provenance et restent lisibles. Pour les objets modernes, `certaine`
 * refuse toute source inconnue ou estimée.
 */
export function valeurAttributFiche(attributs, fieldKey, { certaine = false } = {}) {
  const cle = CLES_FICHE[fieldKey];
  if (!cle || !attributs || typeof attributs !== "object" || Array.isArray(attributs)) return null;
  const entree = attributs[cle];
  const moderne = entree && typeof entree === "object" && !Array.isArray(entree);
  if (certaine && moderne && !SOURCE_CERTAINE.test(String(entree.source ?? "").trim())) return null;
  const valeur = moderne ? entree.v : entree;
  const texte = String(valeur ?? "").trim();
  return texte || null;
}

const FORMAT_BEEBS_PAR_COLIS_FICHE = {
  lettre: "Lettre",
  petit: "Petit colis",
  "petit colis": "Petit colis",
  moyen: "Moyen colis",
  "moyen colis": "Moyen colis",
  grand: "Grand colis",
  "grand colis": "Grand colis",
  "tres grand": "Très grand colis",
  "tres grand colis": "Très grand colis",
  "500g": "Lettre",
  "500 g": "Lettre",
  "1 kg": "Petit colis",
  "2 kg": "Moyen colis",
  "5 kg": "Grand colis",
  "10 kg": "Très grand colis",
  "poids jusqu'a 500g max": "Lettre",
  "poids jusqu'a 1 kg max": "Petit colis",
  "poids jusqu'a 2 kg max": "Moyen colis",
  "poids jusqu'a 5 kg max": "Grand colis",
  "poids jusqu'a 10 kg max": "Très grand colis",
};

// Traduction fermée, jamais une estimation de poids : seule une valeur exacte
// déjà portée par la fiche produit un format Beebs.
export function formatBeebsDepuisFiche(attributs, { certaine = false } = {}) {
  const brut = valeurAttributFiche(attributs, "format_colis", { certaine });
  if (!brut) return null;
  return FORMAT_BEEBS_PAR_COLIS_FICHE[texteComparable(brut)] ?? null;
}

// Repli strict des champs obligatoires : `undefined` signifie que cette clé
// n'a aucun équivalent certain sur la fiche ; `null`, qu'elle en a un mais que
// la fiche ne le connaît pas. Le caller laisse alors la question visible.
export function valeurFichePourChampRequis(platform, key, attributs) {
  const fiche = (cle) => valeurAttributFiche(attributs, cle, { certaine: true });
  if (platform === "leboncoin") {
    if (/_brand$/.test(key)) return fiche("marque");
    if (key === "condition" || /_condition$/.test(key)) return fiche("etat");
    if (/_size$/.test(key) || key === "clothing_st" || key === "baby_age") return fiche("taille");
    if (/_material$/.test(key)) return fiche("matiere");
    if (key === "clothing_type" || key === "shoe_type") {
      const genre = String(fiche("genre") ?? "").trim();
      return (({ Fille: "Enfant", Garçon: "Enfant", Bébé: "Enfant", Enfant: "Enfant" })[genre] ?? genre) || null;
    }
    return undefined;
  }
  if (platform === "beebs") {
    if (key === "Marque") return fiche("marque");
    if (key === "Pointure" || key === "Taille") return fiche("taille");
    if (key === "État") return fiche("etat");
    if (key === "Matière") return fiche("matiere");
    if (key === "Couleur") return fiche("couleur");
    if (key === "Format du colis") return formatBeebsDepuisFiche(attributs, { certaine: true });
    return undefined;
  }
  return undefined;
}
