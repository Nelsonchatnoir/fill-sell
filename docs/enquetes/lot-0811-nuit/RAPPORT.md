# Lot de Nico du 08/11 soir — points 1 à 6 (terminal « Problèmes ») — rapport

Détail, preuves et suites : `docs/reprise/terminal-problemes-0811-nuit.md`. Règles : `docs/regles/plateformes.md`,
`docs/regles/rapprochement-et-releves.md`, `docs/regles/republication-et-publication.md`. Heures de Paris.

| Point | Classement | Cause prouvée | Correctif |
|---|---|---|---|
| 1. Beebs, 5 dépôts « non confirmés » (gratuit) | ROUGE (lecteur aveugle) | Formulaire react-hook-form : refus posés par setError sans requête ; trois refus invisibles au lecteur du texte (connexion, attribut vide, adresse masquée) | 0.6.183 : refus lu dans l'état du formulaire et nommé |
| 2. « Introuvable à confirmer » figé (Vinted ×6, Leboncoin ×4) | ROUGE | Deux relevés exigés ; demande bornée sur la plus ANCIENNE lecture, 6 h | Demande du relevé dont la décision a besoin, au plus 1/h ; comptes Leboncoin jamais mélangés |
| 3. Taille eBay « 24 mois » | ROUGE | Aucune règle âge en mois → liste en ans/statures | Règle E3 (`_shared/taille-ebay.js`) |
| 4. Retrait Beebs en pending, « arrêté » | Attente normale, message ROUGE | Annonce en vérification Beebs depuis le 30/09 ; essai compté → « arrêté » à chaque passage, requalifié pending | 0.6.183 (attente nommée) + `brutSelonStatut` |
| 5. 157 republications en attente (Premium) | NORMAL | Chrome éteint / en veille (battement 03:33 ≠ poll) | Message « preuve de boutique » rendu exact |
| 6. 874 republications d'un coup (Pro) | Geste de la cliente | Bouton de la feuille de republication (seul chemin qui pose `bulk_batch_id`) | Proposition de confirmation renforcée, non intégrée |

Effets vérifiés après déploiement (23:10) : relevé Leboncoin d'ayadi007 demandé par handler-watch v186 à 23:12:07
(`serveur:introuvable_a_confirmer`) ; message des pauses absentes d'un relevé réécrit ; job eBay ccffd8ef reparti seul
(« Taille = 2 ans », pending).
