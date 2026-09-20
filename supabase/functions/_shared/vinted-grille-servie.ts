// ═══════════════════════════════════════════════════════════════════════════
// « LA GRILLE NE CORRESPOND PAS » — SAUF QUAND LA VALEUR Y EST (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Job e8e1cd5a (laforge.vinted, « Blouse Caroll fleurie multicolore »). Après
// deux reprises, on posait ce message :
//
//   « Le formulaire Vinted n'a pas accepté Taille « S », État « Très bon
//     état ». Ce n'est pas une information manquante, ton annonce la porte
//     déjà. Relance depuis l'app ; si ça se reproduit, écris-nous et on
//     regarde la catégorie de l'annonce. »
//
// Or le relevé du MÊME refus, enregistré dans le job au même instant, dit ce
// que Vinted offrait :
//     Taille (accepte : XXXS · XXS · XS · S · M · L · XL · XXL)
//     État  (accepte : Neuf avec étiquette · … · Très bon état · …)
//
// « S » y est. « Très bon état » y est. La grille correspond parfaitement.
// Ce n'est donc PAS une incohérence de grille : c'est le CHAMP qui a été relu
// VIDE après qu'on l'a rempli — notre saisie n'est pas arrivée jusqu'au
// formulaire. On envoyait quelqu'un enquêter sur une catégorie irréprochable,
// pour un défaut qui est chez nous.
//
// ⛔ LA DISCRIMINATION NE SE DEVINE PAS, ELLE SE LIT : la valeur refusée
//    figure-t-elle dans la liste que Vinted vient de servir ? Cette question a
//    une réponse exacte, et elle sépare deux causes qui n'ont ni le même
//    message ni le même correctif.
// ⛔ ET ELLE NE CONCLUT RIEN SANS PREUVE : liste vide, valeur vide, ou champ
//    qu'on n'a pas su rapprocher ⇒ `false`, c'est-à-dire « on ne sait pas », et
//    le message d'avant s'applique tel quel.

/** Minuscules, sans accents, espaces réduits — pour comparer deux libellés. */
export const comparableLibelle = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

/**
 * La valeur que le pré-vol a vue refusée figure-t-elle dans la liste que la
 * plateforme a servie pour CE champ ?
 *   true  → la grille est bonne, c'est la saisie qui n'a pas pris ;
 *   false → on ne peut rien affirmer (ou la valeur est réellement hors grille).
 */
export function valeurFigureDansListeServie(
  { champDemande, valeurs, listeServie, libelles }: {
    /** `needsUserField.field_key` ou son libellé — le champ dont on a la liste. */
    champDemande: unknown;
    /** Les valeurs portées par la capture, par clé de champ (taille, etat…). */
    valeurs: Record<string, string | undefined>;
    /** `needsUserField.allowed_values` : ce que la plateforme propose. */
    listeServie: unknown[];
    /** Clé de champ → libellé affiché (taille → « Taille »). */
    libelles: Record<string, string>;
  },
): { offerte: boolean; champ: string; valeur: string } {
  const liste = (Array.isArray(listeServie) ? listeServie : []).map(String).filter(Boolean);
  const cle = comparableLibelle(champDemande);
  const champ = Object.keys(libelles)
    .find((k) => k === cle || comparableLibelle(libelles[k]) === cle) ?? "";
  const valeur = String(valeurs?.[champ] ?? "").trim();
  if (!liste.length || !champ || !valeur) return { offerte: false, champ, valeur };
  return {
    offerte: liste.some((v) => comparableLibelle(v) === comparableLibelle(valeur)),
    champ,
    valeur,
  };
}
