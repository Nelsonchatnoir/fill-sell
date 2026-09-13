// ═══════════════════════════════════════════════════════════════════════════
// DESCRIPTION BEEBS : LE MINIMUM DE 5 CARACTÈRES (2026-09-13, dossier Joséphine)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE BEEBS FAIT (relevé sur pièces, 13/09, compte Pro de Joséphine, 4
// dépôts en 0.6.32 entre 10:12 et 10:18) : le formulaire de dépôt REFUSE côté
// navigateur une description de moins de 5 caractères — « Ajouter au moins
// 5 caractères » s'affiche sous le champ, le clic « Mettre en vente » n'émet
// aucune requête, rien n'est créé. Les 4 jobs avaient `description` VIDE
// (articles importés de Vinted par la synchronisation, sans description) ;
// le 5e job du même lot, avec 135 caractères, est parti en 30 s.
// ⚠️ Le texte « Sélectionner une valeur » relevé à côté n'est PAS une erreur :
// c'est le placeholder des sélecteurs OPTIONNELS laissés vides (Couleur,
// Matière — `required=false` dans platform_category_aspects). Il apparaît
// aussi sur un formulaire qui va passer. Ne pas en tirer une cause.
//
// CE QU'ON FAIT : quand la description servie fait moins de 5 caractères, on
// la construit avec des FAITS DÉJÀ PRÉSENTS sur le job — titre, état, marque,
// taille — dans cet ordre, jusqu'au minimum et au-delà (un titre seul fait
// une annonce maigre ; « Robe volants 36 — Neuf, sans étiquette — Sans marque
// — Taille S / 36 » dit la vérité de l'article). Rien n'est inventé, rien
// n'est deviné : un fait absent du job n'est jamais fabriqué, l'IA n'y touche
// pas. Un texte qui atteint déjà 5 caractères n'est PAS touché (la
// description de la vendeuse part telle quelle).
// FAIL-SAFE : si même le titre manque (job sans titre), on rend le texte
// d'origine — le refus qu'on comprend vaut mieux qu'une annonce fabriquée.
// Le job en base n'est jamais modifié : c'est le texte SERVI à l'extension
// (get-pending-jobs) qui est complété ; l'extension renvoie la description
// telle quelle au statut suivant.
// Différence assumée avec Leboncoin (_shared/description-leboncoin.ts) :
// là-bas le champ VIDE est accepté (8/8 publiés) et seul 1-9 est complété ;
// ici le vide est REFUSÉ, il faut donc partir de zéro.

export const BEEBS_DESCRIPTION_MIN = 5;

export interface ContexteBeebs {
  titre?: string;
  etat?: string;
  marque?: string;
  taille?: string;
}

/** Marque « vide » sous ses habits : ce que l'app et l'IA écrivent pour dire
 *  « aucune » — ne fait pas une phrase. */
const MARQUE_VIDE = /^(?:aucune?|sans(?:\s+marque)?|none|no brand|n\/a|-|—)$/i;

/** Les faits ajoutables, dans l'ordre où ils se lisent le mieux. Un fait déjà
 *  présent dans le texte (à la casse près) n'est jamais répété. */
function faitsAjoutables(texte: string, c: ContexteBeebs): string[] {
  const deja = texte.toLowerCase();
  const marque = String(c.marque ?? "").trim();
  const taille = String(c.taille ?? "").trim();
  const propose = [
    String(c.etat ?? "").trim(),
    marque && !MARQUE_VIDE.test(marque) ? marque : "",
    taille ? `Taille ${taille}` : "",
  ];
  return propose.filter((f) => f && !deja.includes(f.toLowerCase()));
}

/** Complète une description de moins de 5 caractères (vide comprise). Rend le
 *  texte servi et ce qui a été ajouté (pour la trace). `modifiee: false` =
 *  rien à faire, ou rien de vrai à écrire. */
export function completerDescriptionBeebs(
  texte: string,
  contexte: ContexteBeebs = {},
): { texte: string; ajouts: string[]; modifiee: boolean } {
  const original = String(texte ?? "");
  try {
    if (original.trim().length >= BEEBS_DESCRIPTION_MIN) return { texte: original, ajouts: [], modifiee: false };
    const titre = String(contexte.titre ?? "").trim();
    let sortie = original.trim();
    const ajouts: string[] = [];
    if (!sortie && titre) { sortie = titre; ajouts.push(titre); }
    if (!sortie) return { texte: original, ajouts: [], modifiee: false };
    for (const fait of faitsAjoutables(sortie, contexte)) {
      sortie = `${sortie} — ${fait}`;
      ajouts.push(fait);
    }
    if (sortie.trim().length < BEEBS_DESCRIPTION_MIN) return { texte: original, ajouts: [], modifiee: false };
    return { texte: sortie, ajouts, modifiee: sortie !== original };
  } catch {
    return { texte: original, ajouts: [], modifiee: false };
  }
}
