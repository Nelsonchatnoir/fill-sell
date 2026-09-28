// Pagination par identifiant : chaque requête est bornée, aucun total tronqué.
// Une erreur annule le résultat entier ; l'appelant garde son dernier affichage.
export async function lireToutesPages(construire, taille = 500) {
  const lignes = [];
  let apres = null;
  for (;;) {
    let requete = construire().order('id', { ascending: true }).limit(taille);
    if (apres !== null) requete = requete.gt('id', apres);
    const { data, error } = await requete;
    if (error) throw error;
    if (!data?.length) return lignes;
    const suivant = data[data.length - 1].id;
    if (suivant == null || suivant === apres) throw new Error('Pagination sans progression');
    lignes.push(...data);
    apres = suivant;
    // Même une page plus courte que demandé peut venir d'une limite serveur.
    // Seule une page vide clôt la lecture.
  }
}
