# Point G — tailles

Supprimé : conversion automatique des nombres femme vers S/M/L dans les règles partagées Vinted/Opla ; suppression du pays avant comparaison dans Opla et le moteur de publication. Un nombre ne devient une lettre que si la valeur composite explicite ou la grille la désigne, jamais par une table générique. Les tailles enfant en cm gardent la traduction documentée (86 cm / 18 mois).

Beganton : job `f3ba2985-efdf-4577-b08b-eb9943d8e0e4`, capture 8786, identifiant 10026664652, taille « 10 years ». Le sélecteur Vinted ne traduisait pas l’âge anglais. Ajout years/ans et months/mois ; test sur le panneau réel simulé « 8 ans, 10 ans, 12 ans ». Aucun retrait n’avait eu lieu.

Tests : Vinted taille publication, EU extension/serveur (182 combinaisons historiques), Opla prévol/résolution/complétion, moteur publication, Deno get-pending-jobs/update-job-status, build web. Tous réussis après remplacement des anciennes attentes 38 → M. Les deux fonctions, l’app et l’extension importent ces règles ; livraison coordonnée avec F, pas de déploiement de generate-listing.

À livrer : fonctions, web/OTA, extension 0.6.76. Aucun job utilisateur modifié à la main.
