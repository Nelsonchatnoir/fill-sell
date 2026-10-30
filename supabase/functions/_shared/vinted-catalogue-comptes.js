// ============================================================================
// ARBRE VINTED SERVI À CERTAINS COMPTES (30/10/2026, lot E — DBZ70 romainvintedpro70)
// Vinted remanie ses catégories COMPTE PAR COMPTE (déjà noté le 28/09, Casio 5570). L'arbre anonyme
// (vinted-catalogue-fr.js, relevé le 25/09 et encore le 30/10) range les accessoires sous « Femmes › Accessoires »
// (1574), « Hommes › Accessoires » (1714) ; certains comptes — DBZ70, Nico — reçoivent une RACINE « Accessoires de mode »
// (5496) dont l'ancienne feuille est devenue un nœud à 14 sous-rayons. Les republications de DBZ70 (breloques Pokémon,
// Jibbitz Crocs), capturées sur 5496, s'arrêtaient sur « choisis une sous-catégorie » : le moteur de rayon du serveur
// (rayon-refuse-moteur.js) ne connaissait pas cette racine et laissait la question à la personne.
// Source : GET https://www.vinted.fr/api/v2/item_upload/catalogs, session du compte de Nico, 30/10/2026 vers 19:45
// (Paris) — sous-arbre de 5496 recopié tel quel. Lignes [id, id_parent (0 = racine), libellé]. Identifiants
// globaux (aucun ne figure dans l'arbre anonyme). Un nouveau relevé d'un compte se fait de la même façon.
// ============================================================================
export const CATALOGUE_VINTED_COMPTES = [[5496,0,"Accessoires de mode"],[5541,5496,"Bandanas et foulards"],[5542,5496,"Ceintures"],[5556,5496,"Bretelles"],[5547,5496,"Gants"],[5548,5496,"Accessoires pour cheveux"],[5549,5496,"Mouchoirs"],[5498,5496,"Bijoux"],[5559,5498,"Bracelets de cheville"],[5560,5498,"Bijoux de corps"],[5561,5498,"Bracelets"],[5562,5498,"Broches"],[5563,5498,"Charms et pendentifs"],[5564,5498,"Boutons de manchette"],[5565,5498,"Boucles d'oreilles"],[5567,5498,"Ensembles de bijoux"],[5568,5498,"Colliers"],[5569,5498,"Bagues"],[5552,5496,"Porte-clés"],[5554,5496,"Pochettes de costume"],[5555,5496,"Écharpes et châles"],[5546,5496,"Lunettes de soleil"],[5553,5496,"Cravates et nœuds papillon"],[5557,5496,"Parapluies"],[5570,5496,"Montres"]];
