# Consignes opérationnelles — 28 septembre 2026

Ces consignes remplacent les indications historiques contraires. Les états de livraison doivent être relus en production ; les rapports de passe distinguent code enregistré et code livré.

- **Identité** : lien ou identifiant exact, historique de jobs, ou confirmation de la personne. Jamais titre, prix, photo identique ni ressemblance. Deux annonces d’une même plateforme sont deux exemplaires tant que le contraire n’est pas prouvé.
- **Vente sûre** : décision Nico du 28/09 après contrôle Angel — une vente vue sur l’identifiant exact s’enregistre automatiquement par `enregistrer_vente_atomique`, stock et ligne de vente dans la même transaction, puis retraits des copies prouvées des autres plateformes. Aucun retrait des autres plateformes s’il reste du stock. Doute, absence ou modération ne constituent pas une vente.
- **Retraits** : `armer_retrait_job` exige désormais une vente enregistrée, la fiche vendue et une autre plateforme. Un drapeau `sale_signal` seul ne suffit pas. L’ancienne chaîne signal → retrait avant enregistrement est interdite.
- **Relevés** : pas de disparition sur lecture vide ou incomplète ; confirmation par deux relevés complets. Beebs : aucune conclusion d’absence depuis l’index public. Les anciens appariements titre/prix sont des soupçons à soumettre, jamais des identités certaines.
- **Republication** : les imports peuvent être republiés. Copie complète et identité avant tout retrait ; sans cela l’annonce reste en ligne. Un refus propre à un article ne retient pas toute la file.
- **Tailles** : aucune table générique 38 → M. Garder le pays. Une équivalence composite explicite ou une traduction d’âge dans la grille est permise, dont 86 cm / 18 mois dans le contexte prévu. « 10 years » se traduit en « 10 ans ».
- **Grâce** : le code 0.6.76 préparé applique 4 h aux publications et republications ; les anciennes versions peuvent encore embarquer 2/12 h. Ne pas confondre règle corrigée et parc déjà mis à jour.
- **Authentification** : conserver EXACTEMENT le `verify_jwt` lu en production, avant et après déploiement. `get-pending-jobs=true`, `update-job-status=false` avec contrôle de session propre. Le type d’appelant ne justifie jamais un changement de réglage.
- **CWS** : 0.6.75 publiée et servie, confirmé par Nico sur les builds officiels du parc le 28/09. Build minimum demandé : `2026-09-27T20:16:30Z`, jamais LAST_COMMIT. La promotion serveur suit la livraison du message de mise à jour dans l’app. 0.6.76 en préparation, jamais minimum avant acceptation CWS.
- **Poste Nico** : extension non empaquetée dans `C:\Users\nicol\FillSell-Extension-Nico`, chargée par Fable. Ce dossier stable est autorisé et distinct du prototype cloud, qui reste préservé.
- **Production** : migrations une par une, inverse avant application, rejeu annulé, timeout et contrôle des crons/latences. Pas de balayage massif, pas de correction manuelle des données utilisateurs. Les actions nommées par Nico passent par les fonctions normales de l’app.

Historique : `etat-2026-09-27.md`. Suivi de la passe : rapports `docs/AUDIT_ASTRA_2026-09-28_POINT_*.md` et incidents nommés. Aucun mail sans GO distinct.
