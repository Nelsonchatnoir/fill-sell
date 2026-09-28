# Point E — disparitions, 28 septembre

Migration `20260928133555_point_e_verdicts_releves_complets` APPLIQUÉE à 15:35 (GO Nico). Inverse écrite avant application, même nom dans `supabase/rollbacks/`.

- `trancher_publications_sans_lien` utilise la garde commune de relevé complet et non vide. Deux cycles distincts de la même boutique sont exigés, après quatre heures de grâce. L'absence ouvre la question existante `sale_signal=unavailable` ; elle ne prouve pas un refus de modération et ne rembourse plus un dépôt de ce seul fait. Traitement borné à 25 dépôts.
- `releve_clos_tranche_publications` ne clôt plus un retrait Leboncoin sans lien sur une seule absence.
- `releve_incomplet_reprise` reprend aussi les relevés `done` dont le compteur est inférieur au total annoncé.
- `constater_absences_releve` respecte la grâce des annonces récemment publiées ou republiées. Beebs reste exclu des verdicts d'absence.
- Extension 0.6.76 en préparation : quatre heures de grâce communes ; deux lectures espacées pour un signal de vente. Le relevé Vinted ne transforme plus une observation en vente du stock, même si une écriture de signal échoue. Les annonces importées entrent dans le suivi existant.
- Disparitions Vinted : deux relevés complets de la boutique confirmée ; aucune disparition à partir d'une page partielle. Un remplacement massif n'est plus ignoré du seul fait de son volume. La mémoire locale ne vaut que sur le même poste ; sa perte reporte le verdict.

Validation : migration rejouée puis annulée ; tests SQL sur tables temporaires (lecture unique, vide, partielle, reprise, double lecture, exclusion Beebs), test des deux lectures, tests du veilleur et de republication. Après migration, RPC observées 31–79 ms ; cron doublons 35 ms et veilleur 30 ms, sans dégradation constatée.

Limite de livraison : les écritures directes des anciennes extensions restent celles de leur version jusqu'à mise à jour. Les changements locaux ne sont pas encore servis au parc. Aucun stock ni ancien verdict n'a été réparé manuellement.
