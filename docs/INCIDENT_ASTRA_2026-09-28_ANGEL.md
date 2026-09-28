# Retraits Opla d’Angel — 28/09/2026

## Cause et preuves

À 15:25:01–02 (Paris), le relevé Vinted `b32f6f49-2821-4c73-be9f-e56ab7d7148c`, extension 0.6.75 build `2026-09-27T20:16:30Z+66a8887`, a écrit `sale_signal=sold` sur trois jobs Vinted. Les snapshots des identifiants exacts 10164957815, 10098135391 et 10073758066 portent également `sold` aux mêmes heures.

Le trigger `cross_post_jobs_preuve_vente_retire_copies` réagit à ce drapeau sans attendre l’enregistrement d’une vente. `armer_retrait_job` vérifiait l’identité du dépôt cible, mais pas l’existence d’une vente. Le champ `arme_par.depot` désigne le dépôt Opla à retirer, pas le job de vente. Le statut actuel `cancelled` ne date pas l’annulation : les horodatages du 27/09 sont ceux de la création/import. La fonction exigeait `published` au moment de l’armement.

Retraits réellement aboutis : `2970f9a2-554b-41d2-ae36-c28210c8e2e0`, `1abfb2e8-87e5-490d-957f-0e7c3900ce17`, `7c537825-f4d6-4fb9-9b08-14e216f7acb6` (DELETE 204 puis GET 404). Fiches toujours stock, quantité 1, aucune ligne de vente. Cette chaîne préexistait à C ; C réserve les jobs, il ne transforme pas le relevé en vente.

## Protection appliquée (GO Nico)

- `20260928135541_point_a_retrait_exige_vente_enregistree` : protection immédiate du chemin signalé, appliquée à 15:55.
- `20260928135758_point_a_tous_retraits_vente_enregistree` : même règle pour tous les appelants de `armer_retrait_job`, appliquée à 15:57. Vente liée par user_id + inventaire_id, fiche vendue, plateforme de vente différente. Les quantités historiques des fiches vendues ne sont pas traitées comme du stock restant.
- Inverses dans `supabase/rollbacks/`, mêmes noms ; ordre inverse pour un retour complet. Aucun balayage ni changement de données utilisateurs.
- Rejeux annulés : dépôt publié sans vente refusé ; chemins `preuve_vente_serveur`, `publie_apres_vente_serveur`, `vente_article_serveur` refusés sans vente. Tables temporaires, aucune annonce touchée.
- Index existant `ventes_user_inventaire_idx`. Crons après application : doublons 45–57 ms, handler-watch 25–53 ms. Appels RPC observés après : 22–167 ms puis 25–112 ms, HTTP 200/204.

## Étendue et reprise

Lecture bornée à 501 retraits du jour : 21 trouvés, donc couverture complète à 15:57. Sept portent `preuve_vente_serveur` ; seuls les trois d’Angel n’ont pas de vente enregistrée. Les quatre autres concernent xxewwer et Louis et ont une vente enregistrée.

Recréation non exécutée : confirmation demandée à Nico devant les trois snapshots Vinted `sold`. En outre, seules les données Opla du Gommage sont sauvegardées complètement ; Yves rocher monoi et Masque nuit n’ont ni capture Opla ni description de fiche/dépôt, et aucune capture de republication Vinted. Ne pas inventer ces données ni écrire des publications à la main. Utiliser le chemin normal après clarification.
