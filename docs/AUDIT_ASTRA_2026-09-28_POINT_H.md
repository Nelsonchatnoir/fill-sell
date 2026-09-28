# Point H — compteurs au-delà de 2 000 annonces

`compterAnnoncesParPlateforme` et `lireStatsAnnoncesParArticle` demandaient 2 000 lignes, tronquées également par le plafond PostgREST. Ils lisent maintenant des pages successives de 500, ordonnées par identifiant, jusqu’à une page vide. Les retraits dont dépend le comptage suivent la même règle. Une erreur ne livre aucun résultat partiel ; le dernier affichage complet reste conservé. Deux lectures du même écran ne se chevauchent plus.

Tests : 0, 1 000, 2 001, 4 507 lignes avec plafond serveur de 200 ; absence de doublons ; erreur de troisième page ; appels séquentiels. Build réussi. Web/OTA à livrer.

Autres limites 2 000 repérées : historique du veilleur et lecture ops-digest. Ce ne sont pas les compteurs de stock ; leurs bornes ne sont pas supprimées en élargissant les lectures globales de production. Le veilleur fait l’objet du contrôle des relevés d’Albert.
