# 26/10 soir — Johan Désiré (Pro) : une annonce hors ligne derrière une relecture qui ne part pas

Heure de Paris (UTC+1 depuis le 25/10). Compte `7b9d8a71`, extension 0.6.144 (`2026-10-25T15:28:19Z+7b08e45`).

## Chronologie vérifiée (base + journaux)

| Heure | Fait |
|---|---|
| 15:49 | « Jean Lee Carol Western Gris Anthracite / Noir Délavé - Taille W24 L31 » (job `7ff873c5`) retirée de Leboncoin (`republish_step = deleted`, retrait confirmé par la page). |
| 16:08 → 16:33 | Essai de recréation : onglet figé dans une fenêtre minimisée, fin à l'étape `depot` sur `/deposer-une-annonce/options`, « A listener indicated an asynchronous response… message channel closed ». |
| 17:08 | get-pending-jobs : essai suspect (le dépôt a pu partir) → job retenu, relevé `serveur:verif_redepot` `16031563` posé. |
| 17:24, 17:53, 18:10 | Relevé SERVI à l'extension (17:24 : « demande de sync leboncoin servie → 28 jobs retenus ») — jamais réclamé : aucune requête de prise sur ce relevé dans les journaux. |
| 18:10 → | Plus aucune activité du poste. 172 republications retenues (Leboncoin 70, Depop 29, Beebs 24 ; Vinted 49, restriction jusqu'au 09/11). |

## Cause (prouvée)

1. **L'ordinateur dort.** L’activité du poste vient par rafales d’une minute (16:51, 17:08, 17:23, 17:52, 18:10…) séparées de
   16 à 29 min de silence total. Chaque rafale reprend un cycle EN COURS avec un jeton expiré (401 puis rafraîchi) : le
   cycle était suspendu, pas terminé. La messagerie (bêta) attendait une lecture Vinted bornée par un minuteur de 45 s
   (`executerDansOngletPlateforme`) : ce minuteur n'a pas sonné pendant 17 à 28 min → processus en veille.
2. **Le relevé servi partait en DERNIER.** En 0.6.144 (et 0.6.147), un relevé servi n'est lancé qu'après le cycle
   entier (tâches, lecture d'origine, lecture de fond, commandes, messagerie, bordereau, veilleur, republication auto),
   et sous le verrou de flux, derrière tous les polls que l'alarme de 2 min ajoutait à chaque sonnerie (aucune
   déduplication). Pendant une minute d'éveil, jamais atteint.
3. **Aucune borne courte côté serveur** : la garde attendait le relevé jusqu'à 6 h (`RELEVE_ATTENTE_MAX_H`) avant de le
   dire, et une annonce Leboncoin en relecture retenait tout le groupe Leboncoin / Beebs / Depop.

Sur 7 jours : 36 relevés de vérification faits, 2 non faits (Baptiste, 21/10 : Chrome fermé 6 h ; Johan).

## Corrigé (la règle, tous les comptes)

- **get-pending-jobs** : relevé de vérification servi `devant: true` (avec son déclencheur) ; pas de lecture de fond
  servie tant qu'il attend ; servi à un poste qui polle (3 passages, 20 min) sans être pris → relancé une fois, puis
  needs_user avec le titre et le geste (`_shared/releve-verif-non-pris.js`) ; une annonce en relecture ne retient plus
  que sa plateforme (`_shared/retenue-hors-ligne.js`, règle 3).
- **Extension 0.6.148** : la relecture `devant` part en tête de cycle (chemin ordinaire `lancerRelevePlateforme`, prise
  en base), puis un poll repart aussitôt ; un seul poll attend le verrou à la fois.
- Inchangé : jamais un redépôt sans relevé complet postérieur à l'essai ; identité certaine → rattachée ; doute →
  needs_user avec les liens.

## Johan

- Rien touché à la main sur son compte. Le chemin normal reprend seul : à sa prochaine minute d'éveil, Beebs et Depop
  ne sont plus retenus (marques levées au passage) ; la relecture reste servie devant. Avec la 0.6.144 elle ne part
  qu'en fin de cycle : si le poste ne la prend toujours pas, elle est relancée, puis on lui demande de regarder ses
  annonces Leboncoin (needs_user). Avec la 0.6.148 (à téléverser), elle part en tête du premier cycle.
- Suivi en base : `cross_post_jobs.platform_fields.releve_verif_suivi` du job `7ff873c5`.

## Parc

Republications à l'étape `deleted` encore ouvertes (26/10 ~18:40) : 14. Une seule derrière une relecture non prise
(Johan). Les autres : 7 comptes inactifs depuis août (0.5.4 / 0.6.6, extension jamais revenue), 1 needs_user Vinted
(25/10, autre cause), 1 Vinted en reprise (Chrome fermé), 4 en cours normal à la minute du relevé. Aucune autre à
traiter par cette règle.

## Suite (20:05)

- get-pending-jobs v295 déployée à 19:58 (verify_jwt true) ; commits poussés ; OTA 2.9.122.
- La relecture est partie à 19:40:10 (le poste de Johan est resté éveillé à partir de 19:35 : sa 0.6.144 a atteint la
  fin de cycle). 91 annonces en ligne lues, aucune apparue depuis le retrait → redépôt → 19:41:46, annonce
  3296005486 (adsubmit 201 « created », confirmation « Votre annonce est publiée ») ; une seule annonce, pas de double.
- Retenues levées à 19:42:48 ; la file repart dans son ordre : une republication à la fois, la plus ancienne d'abord.
  Beebs et Depop passent après 41 republications Leboncoin plus anciennes (22/10) : c'est l'ordre de la file, pas un
  gel. Changer cet ordre (alterner les plateformes) toucherait la cadence : décision de Nico.
