# Correction g — les valeurs fausses déjà en ligne (25/10/2026 soir, SIMULATION seulement : rien n'a été modifié)

Décision de Nico : corriger APRÈS que c) et d) sont en place, avec les MÊMES règles ; valeur indéterminée → on ne touche
pas, on liste ; modification de l'annonce EN PLACE seulement (jamais retrait + recréation : on garde favoris et
ancienneté) ; si une plateforme ne permet pas la modification en place, n'agis pas et liste le cas.

## Le constat qui décide (prouvé, lecture du code et de la base)
- **Leboncoin et Beebs : aucune modification en place n'existe dans FillSell.** La base n'accepte que trois actions de job
  (`publish`, `delete`, `republish` — contrainte `cross_post_jobs_action_check` ; 0 job d'un autre type depuis le 21/07) ;
  `leboncoin.js` et `beebs.js` ne savent que publier, retirer et lire ; les boutons « Modifier » n'y servent que de repères
  pour trouver « Supprimer ». Précédents : 03/10 (prix Beebs de Louis corrigé par une republication), 11/10 (« FillSell ne
  sait pas encore modifier une annonce Leboncoin en ligne »). Seul eBay se modifie en place (API).
- **Donc : rien n'est appliqué, rien ne part, aucun PC n'est attendu.**

## La simulation (mêmes règles que c et d, sur les annonces en ligne)
| compte | plateforme | annonce | en ligne | les règles disent | source |
|---|---|---|---|---|---|
| chaouidz | Leboncoin | 3294638238 | Pointure « 16 » | **31** | fiche « EU 31 » + « Pointure 31 » du titre |
| chaouidz | Beebs | 34229052 | Pointure « 16 » (index Beebs : `size_baby_shoes` 16) | **31** | idem |
| louis-seller | Beebs | 34200707 « Dance floor thérapie » | Âge « 8 ans - 12 ans » | **16 ans et +** | texte : « développement personnel », aucun signe jeunesse |
| louis-seller | Beebs | 26 autres livres | Âge « 8 ans - 12 ans » | **indéterminé → on ne touche pas** | aucun signe adulte sûr dans le texte (10 sont des romans adultes selon leur auteur ou leur résumé, 10 sont jeunesse : la règle ne tranche pas sans écrit) |

Trouvées en plus par la simulation (hors des cas attendus — non touchées, listées) :
| compte | plateforme | annonce | en ligne | les règles disent |
|---|---|---|---|---|
| josephinecerni | Beebs | 33904993 « DVD Limitless » | 8 ans - 12 ans | 16 ans et + (film pour adultes, aucun signe jeunesse) |
| voirememe | Beebs | 34174205 « Funko Star Wars Rivals Premier set » | 2 ans - 3 ans | 3 ans - 4 ans (âge écrit par le vendeur) |

Pointures sur tout le parc (541 annonces Leboncoin / Beebs en ligne relevées, pointure envoyée) : 0 autre écart. Les deux
annonces de chaouidz n'y figurent pas parce qu'aucun relevé ne les a encore enregistrées (`annonces_plateforme`) : elles
viennent des jobs eux-mêmes.

## ⚠️ À savoir
- Une republication (planifiée ou manuelle) de ces annonces recopie les champs du dernier dépôt publié
  (`spend_coins_and_republish`) : elle remettrait « 16 » ou « 8 ans - 12 ans ». Corriger d'abord le job source par script
  (sauvegarde, inverse) éviterait de le propager — décision de Nico (non fait).
- La correction en place par la personne (« Modifier » sur Leboncoin ou Beebs) garde numéro, favoris et ancienneté : aucun
  mail n'a été envoyé (aucun ordre).
