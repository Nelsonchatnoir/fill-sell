# Lot « problèmes » du 20/11/2026 — rapport d'Opus-2 (heure de Paris)

Rien n'est poussé sur main : attente du mot de Nico (consigne du lot). Commits locaux au-dessus d'e8cfe30 (2.9.221 d'Opus-1).
Aucun mail client. Aucune extension au Chrome Web Store.

## 1. get-pending-jobs sous 5 Mo — FAIT, en ligne
- Code déplacé tel quel (ré-exporté) : `src/utils/iconeObjet.js`, `_shared/restriction-vinted.js`. Graphe 4,69 → 4,24 Mo.
  Empreinte identique sur 9 219 textes. Verrou `selftest:get-pending-jobs-taille-2011`.
- **v393 → v394 à 10:22:55**, verify_jwt true avant/après ; appels 200, distribution normale.

## 2. Faux doublon thecloset72000 — FAIT, en ligne, prouvé
- Cause : une question « Est-ce le même article ? » (photo_identique, 07:40) liait sa fiche #409C14 au jean #407C15 en ligne ;
  `spend_coins_and_publish` refusait les 5 plateformes (« déjà publié »).
- Règle : une AUTRE fiche ne bloque jamais (avertissement non bloquant) ; une référence/SKU différente = deux articles
  (moteur ET base). **Migration appliquée à 11:35:37** ; **rapprochement v45 à 11:22:39**.
- Preuve (sans rien publier) : sa publication des 5 plateformes, rejouée en lecture seule, arrive jusqu'à la création des
  tâches. La question erronée est close par la règle (11:54:55).
- 30 jours : 7 autres comptes, 18 refus « already_published » ; le blocage « autre fiche » est plausible chez 2 d'entre eux
  (cfdfda6f : 9, 2c89e573 : 1) ; les 5 autres = la même fiche vraiment en ligne/en file. 1 650 questions ouvertes au parc :
  aucune ne bloque plus.
- **Nico peut prévenir le client dès maintenant** : il peut republier son jean.

## 3. Boucle après republication réussie (gjehly) — FAIT, en ligne, réparé
- Cause : un « failed » TARDIF d'une ancienne exécution (lecture de l'ANCIENNE annonce supprimée, 404) était accepté sur une
  tâche déjà publiée et la remettait à « a_capturer ». **update-job-status v213 à 11:22:09** : refus 409 de tout rapport
  tardif sur une republication réussie.
- 20 tâches touchées (seul compte). **19 remises « publiées » avec leur nouvelle annonce à 12:07:12** (lues en ligne sur
  Vinted le 20/11 09:47) ; la 20e (ad1c8d23) : sa nouvelle annonce est VENDUE, laissée telle quelle.
- Doublons Vinted : aucun ancien numéro encore en ligne. 5 paires de fiches au même titre existent sur le compte, chacune
  avec SA fiche et SA annonce (deux exemplaires, pas le défaut) : Pinocchio n°113, Ernesto de la Cruz n°63, lot de 8 cartes
  D100, Crash Bandicoot 2 PS1, Lilo #35 — à faire regarder par le client si ce ne sont pas deux exemplaires.

## 4. eBay 25713 — FAIT, en ligne
- Le job e343458f est **en ligne** (annonce 800941511446, publiée 08:32 après une relance manuelle ; quantité 1 relue à 09:40).
- Règle : 25713 = refus passager ; l'offre est supprimée puis recréée au passage suivant, 3 essais puis message clair.
  **ebay-api-worker v143 à 11:22:35.**

## 5. Beebs « à reconnecter » sur le Cloud — cause trouvée et corrigée ; preuve des retraits : PAS ENCORE
- Tessy (2f8b09d2) : **faux diagnostic**. Jeton long Beebs vivant. Le 18/11 à 19:46, un vrai captcha DataDome ; Beebs fermé
  « à résoudre ». Mais l'essai automatique de re-vérification ÉCHOUAIT toujours avant de regarder la page (exception par
  page inexistante sous Chrome) ; Beebs fermé au relais → chaque visite de renouvellement : erreur de tunnel (vu en direct à
  11:03:42) → « à reconnecter » pour toujours. Corrigé (orchestrateur 686e93bd4f5d). **Son nouvel essai automatique : ce soir
  20:48** ; il regardera enfin la page. Sa republication Beebs partira dès que Beebs sera rouvert.
- Romane (13e274de) : **vraie déconnexion aujourd'hui** — plus aucun jeton Beebs dans son navigateur (le coffre la disait
  « à reconnecter » depuis le 14/11 11:35, et une réouverture a effacé la session). Elle doit refaire « Me connecter » Beebs :
  ses 7 retraits partiront ensuite. Nico peut le lui dire.
- Règles corrigées pour tous les comptes Cloud : page non chargée = « site injoignable », jamais « à reconnecter » ;
  un « à reconnecter » pour jeton non renouvelé reste joignable et n'est jamais purgé tant que le jeton long vit ; le coffre
  redevient « connecté » quand le site renouvelle le jeton ; l'essai de vérification a son exception sous Chrome.
- Marjorie, Doriane : jamais connectées à Beebs sur le Cloud — normal.

## 6. Copie Cloud de l'extension — FAIT
- Pilote sur le seul Cloud de Nico : **posé à 12:11:06**, navigateur rouvert à 12:12:23 sur 0.6.194.46579 ; aucune tâche en
  cours ; ses 4 sessions identiques avant/après.
- Tous les navigateurs de cloud-2 : **0.6.194.46587 à 13:31** (BUILD 686e93b-cloud) ; 14 navigateurs rouverts ; sessions =
  coffre partout ; les tâches en cours aux arrêts sont allées au bout.

## 7. Relevé Beebs de Louis — cause trouvée et corrigée ; preuve du relevé de nuit : DEMAIN MATIN
- Causes : chaque mise à jour de la copie Cloud déplaçait l'alarme quotidienne (19/11 13:02 → 13:27) ; et la cadence de
  20 h comptait les relevés lancés depuis l'app (celui de 18:45 repoussait la nuit).
- Corrigé pour tous les comptes Cloud : alarmes la nuit ; seuls les relevés automatiques comptent. **Le relevé automatique de
  Louis est réglé cette nuit à 03:47.** Relevé Beebs réussi aujourd'hui : 09:01, 123 annonces lues.

## 8. Import Beebs de Louis (Présentoir) — DÉJÀ RÉGLÉ, prouvé
- « Présentoir » Beige et Blanc : 3 photos distinctes chacune, identiques aux 3 de leur annonce Beebs (récupérées le 20/11
  ~09:43). Sur tous les comptes, aucune fiche importée de Beebs n'a moins de photos que son annonce. Louis peut envoyer.

## 9. IP — étapes 1 à 4 faites ; 5 et 6 : PAS FAITES
- Relecture du 19/11 soir : 98 dépôts à une photo depuis 22:35, tous d'annonces d'origine LUES (« Écusson pm 122 » :
  une seule photo sur ses annonces Leboncoin lues = un vrai article à une photo) ; aucun retrait au mur « Valider et payer ».
- **Migrations 190000, 200000, 170000, 230000 appliquées à 12:17** ; **script de réglages joué à 12:43** ; **orchestrateur
  déployé (38b8775e7471 à 12:47, puis 686e93bd4f5d à 13:20)** ; le contrôle avant attribution travaille (IP 39 saine,
  IP 81 suspecte).
- Lecture IPRoyal « Extra Requirements » : la question réelle est `{ id: 7, text: "Extra requirements:" }` — le code ne la
  trouvait pas (tout achat aurait été refusé). Corrigé.
- **Essai réel : pas fait.** L'IP 90 n'a pas été touchée (attribuée à 5b1dfdea). Seule IP libre et saine : la 39 (Orange) ;
  l'essai l'attribuerait à un compte de test puis la rendrait au stock. **Rachat automatique : toujours COUPÉ.**

## Compléments de l'après-midi (heure de Paris)
- **Pool d'IP vide** : règle « France + plateformes ouvertes », hébergeur / proxy / opérateur en information seulement
  (orchestrateur eaeace71c388 à 14:26, 526a2ac57f98 à 15:00). 80 saine 14:27, 39 saine 14:33 ; 88 et 81 hors pool (Beebs
  406), 89 hors pool (aucune connexion), 82 dehors (Royaume-Uni). **2 IP saines libres.** Rien acheté.
- **Marjorie** : pas mon déploiement — séquence de 50 republications atteinte à 11:52, pause de cadence jusqu'à 13:52, la
  file est repartie à 13:52:49.
- **linda** : la règle « compte refusé par Beebs » (cette nuit) retient sa file ; Beebs a encore refusé à 12:55 et 15:01
  après sa reconnexion de 12:42 (« Vous devez être connecté pour ajouter un produit »), alors que la session Beebs (Google)
  est bien dans son navigateur Cloud. Le refus vient du compte Beebs : à voir avec elle (même compte Beebs ? essai dans
  l'appli Beebs). Rien de plus à corriger chez nous sans preuve.
- **Retrait Beebs e59ce552** : parti — supprimé à 10:22–10:24 (preuve : absente de « Mes annonces » après confirmation,
  lue à 10:24:20). Cause du message Vinted corrigée (extension + update-job-status v214 à 15:28:54).
- **ops-digest** : fausse alerte de 09:50 (8b7b607f, parti à 15:03 dans son créneau) — règle posée, ops-digest v73 à
  15:29:01. Section 12 (« pending > 48 h ») : liste du récapitulatif sans mail, inchangée.
