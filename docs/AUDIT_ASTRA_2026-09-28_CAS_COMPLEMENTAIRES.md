# Cas complémentaires — état de la passe

## Albert : relevés Leboncoin et Beebs

Six runs du 28/09 entre 11:43 et 13:30 ont expiré à 31–33 minutes, progression restée à zéro malgré une extension active. Le relevé n’écrivait son nombre lu qu’à la fin, après les captures et le rapprochement ; ses longues lectures injectées n’entretenaient pas le service worker. L’injection de lecture de liste n’avait pas non plus de borne côté worker.

Correctifs : maintien du worker par appel Chrome toutes les 20 secondes, arrêté dans le finally ; aucune fausse progression écrite par ce timer. Nombre réellement lu écrit dès le retour de la liste. Injection de liste bornée à trois minutes, résultat incomplet si elle ne répond pas. Tests exécutant les fonctions réelles : injection qui ne répond jamais, fermeture du timer lors d’une erreur. La cause précise du gel sur son poste n’a pas été observée en direct ; reprise naturelle à vérifier après livraison 0.6.76.

Phrase pour Albert : « J’ai corrigé la reprise des lectures qui se bloquaient ; la prochaine mise à jour de l’extension apporte le correctif. »

## Malena : session Opla

Les jobs 58293b9b et b0c68f34 portent 12/13 cookies, mais seulement les six plus gros dans le diagnostic. Le serveur ne pouvait donc pas établir l’absence du cookie de session. L’ancien booléen session vérifie `opla_has_session`, pas le vrai cookie `__session` et ses fragments : il n’est pas une preuve.

L’extension mesure désormais la présence du cookie réel dans la liste complète (sans envoyer les valeurs). Le serveur demande la reconnexion si son absence est prouvée. Un nombre de tentatives ne devient plus une preuve de déconnexion. Nécessite 0.6.76 pour ce nouveau signal.

## Tessy : photos Beebs

L’erreur connue `Élément introuvable: #input-pictures` tombait dans le motif inconnu. Elle porte maintenant sa propre famille et un message sur l’ajout des photos ; essais bornés, puis relance. Cela corrige le diagnostic affiché ; la disparition effective du contrôle sur les anciennes versions ne se résout pas par ce texte seul.

## Louis : Leboncoin

Job 232c54d6-c19b-4386-80c8-f835a8ab4949 : dépôt annoncé réussi, rayon `Divers > Autres`, source `defaut`. Le verdict du 28/09 venait uniquement de l’absence au relevé, sans réponse de modération. La cause d’un refus de modération n’est donc pas établie. La garde contre le rayon par défaut est déjà présente dans le code courant ; le point E supprime la conclusion de refus tirée d’une absence. L’abandon utilisateur reste respecté.
# Double retrait eBay xxewwer

Les jobs 97170b15 et c9d402b9 ont supprimé le même identifiant eBay
377494187315, à 02:16 et 07:12 le 28/09. `armer_retrait_job` ne cherchait
que les retraits en attente, jamais ceux déjà aboutis. La migration
20260928142419 inclut un retrait abouti postérieur au dépôt exact, et verrouille
le dépôt pendant la réservation. Aucun retrait supplémentaire ni reprise de données.
Rejeu annulé : le même identifiant est bloqué ; un autre reste distinct.
Retour arrière homonyme dans `supabase/rollbacks/`. Appliquée à 16:24 Paris.
