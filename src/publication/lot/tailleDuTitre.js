// ═══════════════════════════════════════════════════════════════════════════
// LA TAILLE QUE LE TITRE CONTREDIT (19/11/2026, thecloset — décision de Nico, point d)
// ═══════════════════════════════════════════════════════════════════════════
// « Quand la taille d'un article contredit celle écrite dans son titre (FR, W, EU…), l'article passe en « À vérifier »
// dans la liste du lot, avec les deux valeurs côte à côte ; sa réponse vaut pour toutes les plateformes. »
// La RÈGLE de détection est celle du serveur (Opus-2, 05f8546) : supabase/functions/_shared/taille-contredite-titre.js,
// tailleContreditTitre({ titre, taille, rayon }) → null | { taille_fiche, taille_titre, systeme } — on ne compare que
// dans le même système, le doute ne se tranche pas (null). L'écran du lot l'appelle par ce point d'entrée, rien d'autre.
export { tailleContreditTitre, SYSTEMES_CONTREDITS } from "../../../supabase/functions/_shared/taille-contredite-titre.js";
