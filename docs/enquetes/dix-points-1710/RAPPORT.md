# Session du 17/10 — migration 24 h et dix points (Louis, DeadRoz, linda, Thibault, Héloïse, Romain, patrick, Amiral, Fluxen, Ornella)

> Pour Nico. Court d'abord, détail ensuite. Heures de Paris. Enquêtes en lecture seule (SELECT bornés, journaux,
> code), puis correctifs de la RÈGLE (tous les comptes). Aucun mail, rien chez Stripe, aucun plafond changé, aucun
> geste sur une vraie commande ni sur un vrai acheteur.
> État de livraison (versions servies, heures de déploiement) : fin de ce fichier (§ Livraison) et
> `docs/agents/etat-2026-10-01.md` (§ 17/10 après-midi).

## 0. Migration « 24 h » (feu vert de Nico)

- **Cause** : une demande faite depuis le téléphone (récupérer un bordereau, commander l'étiquette Vinted,
  confirmer la disponibilité Leboncoin, accepter la commande Beebs) expirait après 30 min sans ordinateur.
- **Fait** : migration `20261017100000_bordereau_attente_24h.sql` — une seule ligne de `bordereau_demande_a_traiter`
  (corps relu en prod, md5 `e08f9b22…`) : 30 minutes → 24 hours ; commentaire de la table. Essai à blanc **14/14**
  (transaction annulée, prod relue inchangée), appliquée à **11:45** (`db query` + `migration repair`), puis les
  contrôles rejoués sur la vraie prod **12/12** (droits, sécurité, demande de 2 h rendue, 25 h expirée, génération
  de 23 h rendue seulement à une extension « generer », incertaine jamais refaite, compte sans drapeau refusé).
  Inverse : `supabase/rollbacks/20261017100000_bordereau_attente_24h.sql`.
- **Garde-fou** : l'extension relisait déjà la commande juste avant le geste ; la relecture DANS le geste est
  désormais exacte : annulée (Vinted 500, Leboncoin `*-cancelled`, Beebs `CANCELLED`), expédiée, ou en échec chez
  Vinted (210) = aucun geste, refus nommé (`commande_annulee`, `deja_expediee`) — la 0.6.122 rendait « déjà fait »
  pour tout statut Vinted ≥ 200 (sans geste non plus). App : « En attente de ton ordinateur…, 24 h au plus… Juste
  avant, il relit la commande… annulée ou déjà traitée entre-temps, rien n'est fait. »
- Selftests : `messagerie-generation` (22), `messagerie-app` (28).

## 1. eBay « prêt » alors qu'eBay bloque (Louis = Amiral, compte eBay plt-crea)

- **Cause** : trois règles, deux sources. La carte du Stock comptait les politiques RETENUES pour FillSell (« il reste
  2 étapes, à commencer par comment tu es payé ») ; Réglages › Compte eBay lisait les lignes du relevé, « ok » dès
  qu'une politique EXISTE chez eBay (« eBay est prêt ») ; personne ne lisait le plafond de vente eBay
  (`seller_state.selling_limit` = 0 article / 0 €, relevé du 17/10 09:48, après une déconnexion-reconnexion de Louis
  à 09:39 qui a vidé ses politiques retenues). Même contradiction chez 6 autres comptes (politiques existantes chez
  eBay, non retenues). Plafond à 0 : Louis seul sur 108 comptes.
- **Corrigé** : UNE règle `supabase/functions/_shared/ebay-etat-compte.js` (`etatCompteEbay`) pour tous les écrans
  (carte du Stock, stepper, lot, Réglages) ET le serveur (ebay-voie → worker, handler-watch, ebay-account). Une
  politique est faite quand elle est retenue ; plafond 0 en quantité OU en montant = jamais « prêt » : carte
  « eBay n'autorise pas encore ce compte à vendre : son plafond de vente est à 0 article et 0 € », lien vers son
  compte vendeur eBay, puis les étapes qui restent ; le serveur parque avant tout appel eBay. Simulation sur les 108
  comptes : verdict « prêt » serveur inchangé pour tous.
- **Relancé** : rien (Louis n'a aucun job eBay depuis le 19/09).

## 2. Pause « introuvable » jamais levée (DeadRoz, 60 republications Vinted)

- **Cause réelle** : la prémisse ne tenait pas — le relevé du 16/10 (19:36, complet : 588 lues sur 588, boutique des
  jobs) n'a PAS vu ces 60 annonces (aucune ligne `vinted_listing_snapshots` le 16/10) ; le `vinted_status = active`
  lu sur les fiches était celui du 15/10 07:37, figé par la garde É4 (une annonce en republication n'est jamais
  datée disparue). Mais la règle avait trois défauts : (1) handler-watch lisait les 50 PLUS ANCIENS relevés, toutes
  plateformes — 87 relevés Leboncoin vides cachaient le relevé Vinted (rang 89), la pause attendait pour toujours ;
  (2) « revue en ligne » se lisait sur la FICHE (a6e773d4, autre compte : repris sur une AUTRE annonce de sa fiche) ;
  (3) « complet » = `done`, un seul relevé suffisait — deux republications Leboncoin de DeadRoz closes sur des relevés
  « 0 sur 0 ».
- **Corrigé** (handler-watch v113, 13:13) : trace par l'IDENTIFIANT EXACT de l'annonce (relevé du jour ou fiche qui
  porte CE `vinted_item_id`) ; reprise dès qu'elle est revue en ligne ; clôture propre sur fiche vendue, trace
  vendue/fermée, ou DEUX relevés complets (total connu, lus ≥ annoncés, non vides, de SA boutique) sans elle ;
  relevés de LA plateforme, non vides, du plus récent.
- **Réparé** (13:15, `scripts/reparations/20261017_introuvable_rejuge.sql`, sauvegarde `_backup_1710_introuvable_rejuge`,
  inverse, 0 mail) : 8 décisions de l'ancienne règle rejugées, 4 gardées, 4 remises en pause sans rien retirer
  (eb1e852c, 011acb82, 20dade3e, a6e773d4 — ce dernier ne pouvait de toute façon rien retirer : capture purgée).
- **Les 60 de DeadRoz** : rien à relancer (déjà en file depuis ta relance de 10:48, étape `a_capturer`, rien
  retiré). Leur prochaine lecture les remettra en pause sans rien toucher ; ensuite la règle tranche : reprise si un
  relevé revoit CETTE annonce, clôture au 2e relevé complet sans elle (celui du 16/10 compte déjà pour un).

## 3. Plafond du jour atteint, sans explication (linda, nadege ; nerema75)

- **Cause** : la retenue (get-pending-jobs, 50/jour Premium, toutes plateformes ensemble, republications publiées
  du jour de Paris) marchait ; l'app ne la disait qu'à moitié : une note au clic sans durée ni heure, la carte du
  haut du Stock en « en cours », une ligne grise sur le dernier lot seulement, « En pause (limite du jour) » par job.
  linda (685 lancées) : retenue le 16/10 de 14:16 à 17:14, puis Chrome fermé — aujourd'hui 0/50, sa file attend son
  ordinateur. nadege : vraie retenue jusqu'à minuit (50/50 entre 00:05 et 03:39).
- **Corrigé** (web au push ; OTA) : avant le clic « Ta limite est de 50 republications par jour (toutes plateformes) :
  50 partent aujourd'hui, les 635 autres à partir de minuit (heure de Paris), 50 par jour. Pour toute ta file, ça
  prendra environ 14 jours. » ; pendant la retenue, carte du haut (barre en pause), tête de « Ta file » et ligne de
  la liste (toute la file) : « Limite du jour atteinte (50 sur 50 republications, toutes plateformes) : les 685 en
  file repartent à minuit (heure de Paris), 50 par jour : ça prendra environ 14 jours. » Exception écrite à la règle
  « aucun temps estimé » (`docs/regles/republication-et-publication.md` § 17/10). AUCUN plafond changé.
- **nerema75 : normal**, ce n'est pas le plafond — 0/50 aujourd'hui ; ses 25 traces « plafond » dataient du 15/10
  13:55 (périmées depuis 35 h) ; ses 25 republications attendent une AUTRE de ses boutiques Vinted (« ouvre ta
  boutique @… »), ce que l'app dit déjà. Le vrai défaut : la trace jamais levée → levée désormais (get-pending-jobs).

## 4. Marques Depop (Thibault, 14 fiches)

- **Cause** : l'extension posait une QUESTION pour toute marque hors de la liste Depop, et la liste d'absences ne
  connaissait pas « Autres » ; la personne ne voit pas la liste de Depop et sa réponse (« T shirt », « Jean »…) était
  redemandée à l'identique → boucle (IKKS : la fiche porte la marque « Diverse » d'un lot, IKKS n'est que dans le
  titre ; réponse « T shirt » enregistrée puis redemandée). Bonus : la clé compacte confondait 45 marques (H&M / H&M+,
  Lacoste / « Lacoste + »…).
- **Corrigé** : règle stricte au dépôt (extension 0.6.123, liste vivante de Depop) : absence (« Autres », « Divers »,
  « Sans »…) ou nom commun de vêtement (« Short », « T shirt »… ; jamais « gant », « polo », « bob », « top ») →
  « Other » (sans marque) ; égalité EXACTE (casse, accents, espaces) avec une marque Depop active → elle ; sinon
  « Other ». Jamais une autre marque, jamais une question. Filet serveur dès aujourd'hui pour les extensions
  actuelles (update-job-status v139, handler-watch v113) : publications seulement.
- **Relancé par le circuit** : les questions en attente sont tranchées au prochain passage (Thibault a répondu
  « Autre » entre-temps : 12 annonces parties depuis 12:07). « Plusieurs marques… » (H&M) : relancée une fois
  quand son poste aura la 0.6.123.
- **À trancher** : « Chic Me » → « Other » avec la règle stricte (2 publications du parc trouvaient « ChicMe »).

## 5. Mur Depop « configuration vendeur » (Héloïse, Romain Knockaert, Thibault)

- **Cause** : le mur était vu par job, sans mur de compte : chaque publication servie retapait le même mur (Thibault :
  39 publications, 37 relances à la main en 10 min), aucune reprise automatique (2 jobs de Thibault encore sur le mur
  alors que 22 publications sont passées depuis).
- **Corrigé** (gpj v255, ujs v139, hw v113 ; carte dans l'app ; sonde canSell dans la 0.6.123) : après ce mur, plus
  aucune publication Depop servie pour le compte (retenue avant essai, retraits jamais retenus), UNE carte « À
  régler » (« Ouvrir Depop », « C'est fait »), reprise automatique sur preuve (publication passée depuis le mur, ou
  sonde), sinon un éclaireur au barème ; jamais soldé à 72 h.
- **Relancé par le circuit** : Thibault relâché sur preuve ; Romain (8) et Héloïse (4) : un éclaireur dès que leur
  poste est revu ; rien n'existe chez Depop pour ces publications.

## 6. Marque inconnue de Vinted à la republication (patrick giry « Paris 2024 », Romain Guerin « pago »)

- **Cause** : la capture garde bien la marque de l'annonce avec son identifiant (305315, 352029), mais l'extension ne
  savait poser une marque qu'en CLIQUANT une ligne du menu de Vinted ; Vinted ne propose plus ces anciennes marques
  libres → 30 s d'attente, « Vinted ne connaît pas la marque ». 7 jobs sur 5 comptes.
- **Corrigé** (extension 0.6.123 + gpj v255) : la marque de l'annonce en ligne est reprise par son `brand_id` capturé,
  posé dans le corps du dépôt (sonde du POST, jamais d'écrasement) quand le menu ne la propose pas ; « Sans
  marque » (id 1) si c'est son état réel ; aucune question, jamais une marque devinée ; la fiche et les réponses ne
  changent rien à l'annonce. ⛔ Garde : aucune annonce n'est retirée pour ce motif tant que l'envoi direct n'est pas
  PROUVÉ (réponse 2xx de Vinted qui relit la marque posée) — en attendant, pause avant tout retrait, annonce intacte.
- **Relancé** : automatiquement une fois quand leur poste aura la 0.6.123 (3730ef49, 770bed7f, cec26662, 166e5729).
- **À faire par toi** : l'essai réel qui ouvre la garde (protocole § 6 bis ci-dessous).

### 6 bis. Protocole de l'essai réel (compte de Nico, annonce de test ≥ 999 €)
1. Une seule extension FillSell active dans ton Chrome, en 0.6.123 (ta copie la prend seule) ; Vinted connecté.
2. Dans l'app : une fiche « TEST FillSell — marque par identifiant — ne pas acheter », 999 €, T-shirts imprimés
   (Hommes), marque « Paris 2024 », taille M, très bon état, une couleur, une photo, colis Petit.
3. Chrome fermé, lance « Publier sur Vinted » : le job reste en file. Dis-le-moi : je pose par script (sauvegarde +
   inverse) `marque_id = 305315` et `marque_capturee = "Paris 2024"` sur ce seul job.
4. Rouvre Chrome. Attendu : dépôt, `platform_fields.marque_pose_envoi = {id: 305315, http: 200, relue: 305315,
   confirmee: true}` et l'annonce affiche « Paris 2024 ». Refus ou autre marque relue : on s'arrête, rien ne s'ouvre.
5. Retire l'annonce de test depuis l'app (« Retirer de Vinted »), puis supprime la fiche ; le job de publication reste
   en base : c'est la preuve que lit get-pending-jobs.

## 7. DeadRoz (Business) : 24 publications Leboncoin bloquées

- **Cause prouvée : une règle de Leboncoin.** Depuis le 13/10, le compte Leboncoin connecté dans son Chrome est un
  compte **PRO** (7 preuves : formulaire pro « conditions générales de vente / référence / prix neuf », grilles
  Leboncoin des pros, galerie à 10 emplacements, route de dépôt pro, signature de la veille des commandes, « Mes
  annonces » particulier renvoyé à l'accueil, 0 annonce sur l'API du compte). Hors forfait, Leboncoin fait payer
  chaque dépôt (« Valider et payer ») : 26 murs et 5 dépôts passés la même nuit, avec les mêmes 10 photos — ce n'est
  ni l'annonce ni le pack photos (le rapport du 16/10 § 10.6 C2 est rectifié). Depuis le 14/10 au soir, Leboncoin lui
  demande aussi de mettre à jour sa « ligne d'adressage ».
- **Fautes FillSell, corrigées** (ujs v139, gpj v255, hw v113, carte dans l'app) : 12 murs étaient classés « champ à
  choisir » (motif hérité d'une question déjà répondue) → plus jamais, pour toutes les versions d'extension ; 35
  envois sur le même mur après le premier → un compte prouvé pro au mur ne reçoit plus aucune publication ni
  republication Leboncoin (retenue avant essai, un éclaireur à la fois) ; une seule carte « Leboncoin : ton forfait
  pro » (« C'est fait ») ; reprise de tout le compte dès qu'un dépôt passe ; jamais soldé à 72 h.
- **Relancé** : rien (ils retomberaient sur le même mur). Éclaireur automatique au plus toutes les 12 h, ou « C'est
  fait » après qu'il a réglé son forfait. Le job Levi's « recreation_deja_partie » n'est pas touché. b67c3bfb reste une
  vraie question (« Type d'article neuf » + poids).
- **Question à lui poser** : a-t-il payé lui-même des dépôts du 14/10 ? (sinon doublons au déblocage).

## 8. Amiral : « le job ne porte pas le lien de l'annonce » (Rangement 12 pots, Leboncoin, 15/10)

- **Cause** : le job 317adae1 n'est pas né sans lien : né (créneau serveur) avec le lien d'une AUTRE annonce, recopié
  d'un dépôt source dont le lien avait été retrouvé PAR LE TITRE le 24/09 ; puis `annonce_partagee_reprendre` a
  RETIRÉ sa copie de dépôt (la « recapture » n'existe que pour Vinted) → Leboncoin ne peut plus la refaire. Rien
  n'est perdu : l'annonce 3276310850 est en ligne.
- **Correctif préparé** : migration `20261017110000_republication_nait_avec_son_lien.sql` (3 fonctions réécrites
  depuis la prod, garde md5) : une republication naît avec le lien EXACT et une copie qui désigne la même annonce,
  sinon refus « lien incertain » avant tout décompte ; une copie hors Vinted n'est jamais retirée (réalignée).
  Essai à blanc **18/18** (prod relue inchangée). ⛔ **Application refusée par la sécurité de la session** — à lancer
  par toi (§ Ce qu'il te reste à faire), puis la réparation de 317adae1 (copie reconstruite, sauvegarde + inverse).
- **Mesuré** : 0 republication née sans lien ni copie en 30 jours ; 1 copie perdue après la naissance (celle-ci).

## 9. Fluxen : eBay refuse les conditions de retour (400 / 25002)

- **Cause** : la politique envoyée était « Pas de retour » (créée par FillSell le 15/10 à 22:57, choix de la personne) ;
  eBay l'accepte à la création puis refuse de publier avec elle pour CE compte (indice fort : vendeur professionnel,
  retours obligatoires — 13 comptes « Pas de retour » publient sans refus). Ses 3 essais pour passer à « 30 jours »
  ont échoué (HTTP 502) : FillSell recréait une politique du même nom au lieu de la mettre à jour. Seul cas du parc.
- **Corrigé** (ebay-account v18, ebay-api-worker v88) : `creer_politique` met à jour la politique FillSell du même nom ;
  le refus 25002 est nommé : la politique de retours retenue est retirée et le job passe « compte à finir — retours »
  avec un message clair, ré-armé tout seul quand il choisit « Acceptés sous 30 jours ». FillSell ne choisit JAMAIS à
  sa place. Texte : « Pas de retour (vendeurs particuliers seulement) ».
- **Relancé** (13:17, `scripts/reparations/20261017_relance_fluxen_retours.sql`, sauvegarde + inverse) : le job
  b731ae0f, une fois (fiche en stock, aucune annonce eBay, aucun doublon).

## 10. Ornella : relevé Beebs vide (17/10 matin)

- **Cause** : c'était la veille (cron) de 08:32 sur SON poste, au réveil, pas « Synchroniser » ; les deux onglets de
  « Mes annonces » sont revenus vides, et le rattrapage par le flux a refusé de conclure sans dire pourquoi (le run
  n'en gardait rien). Hypothèse la plus probable, non prouvable a posteriori : un mur passager au réveil (la veille
  Vinted du même poste a pris un 403 à 08:16 ; Beebs sert sa vérification anti-robot sous la même adresse). Rien n'a
  été perdu (23 annonces revues à 08:41, 0 disparition). Pas l'effacement du 16/10 (il ne touchait que le compte de
  Nico), pas la garde « autre compte », pas le poste de Nico.
- **Corrigé** (extension 0.6.123) : la vérification anti-robot et le renvoi vers la connexion se nomment
  (`[anti_robot]`, `[pas_connecte]`), jamais « 0 annonce » ; le flux tranche sur SA liste (le compteur de Beebs n'a
  plus à égaler l'index, qui garde des annonces retirées) ; son verdict est écrit dans CHAQUE relevé.
- **Relancé** : rien (un relevé = son « Synchroniser » ou la veille). Le prochain dira la cause en clair.

## 11. Ventes Vinted en lot (Louis, risque de double vente)

- **Cause** : l'extension lisait bien les numéros d'articles d'une commande Vinted (`transaction.order.item_ids`) mais
  ne les gardait jamais ; tout le circuit de vente travaillait annonce par annonce : une commande en lot finalisée
  devenait UNE ligne « Lot N articles » sans fiche ni annonce (cas 2 : vente 184415), et le mail partait note par note,
  un article par mail. Cas 1 : la commande n'est pas encore finalisée ; le maillot a été vendu par la preuve de SA page
  (vente 188018, copie Leboncoin retirée) ; la robe citrouille n'a de numéro nulle part chez FillSell.
- **Les lots de Louis** : cas 1 = maillot (prouvé) + robe (aucune preuve en base : aucun retrait). Cas 2 : composition
  NON prouvable en base (3 jeux de candidats, aucun prouvé) ; toutes les copies Leboncoin candidates étaient déjà
  retirées → aucun risque de double vente connu de FillSell aujourd'hui.
- **Robe citrouille** : jamais importée parce que l'import ne part que sur « Synchroniser » (règle du 05/10) : le dernier
  « Synchroniser » de sa boutique (371531) date du 11/10, avant qu'elle existe ; celui du 14/10 a lu l'autre boutique
  (247512093) ; les relevés automatiques depuis l'ont vue sans l'importer (« 11 annonces sans fiche »). FillSell ne la
  voit sur aucune plateforme (relevé Leboncoin complet du 16/10 : rien) — une annonce posée à la main sur Leboncoin
  après le 16/10 18:08 ne serait pas encore vue.
- **Règle (tous les comptes)** : la commande est l'unité de vente, composition = numéros EXACTS (jamais le titre) ;
  une vente PAR ARTICLE ; chaque article qui a une fiche passe vendu et ses copies prouvées sont retirées par le
  circuit normal ; un article inconnu = vente sans fiche + question, jamais un retrait ; une vente déjà enregistrée par
  la preuve de sa page est adoptée, jamais doublée ; UN mail par commande qui liste TOUS ses articles. Prix : celui de
  Vinted par article s'il existe, sinon le total au prorata des prix d'annonce (centimes au plus grand reste, somme =
  total), base manquante = inconnu (jamais 0) ; exemple 5,10 € sur 4 articles à 1,50 € → 1,28 / 1,28 / 1,27 / 1,27.
- **Livré** : extension 0.6.123 (numéros de toute commande, arriéré « lot » de 30 jours relu une fois, veille →
  composition), push-ventes v12 (un mail liste tous les articles, rétrocompatible), migration `20261017120000`
  (essai à blanc sur la prod **35/35**). Voir § Livraison pour ce qui est appliqué.
- **Le parc** : 114 lignes « Lot N articles » sur 30 jours (42 comptes, 1 915 €), toutes sans fiche par construction ;
  leur composition sera relue une fois par la 0.6.123 sur chaque poste, puis réparée par
  `scripts/reparations/20261017_ventes_vinted_en_lot.sql` (sauvegardes, inverse, 0 mail ; NON appliqué : il faut
  d'abord les compositions relues).

## 12. Ventes Vinted annulées jamais détectées (Louis)

- **Cause réelle** : la seule commande que Vinted a déclarée annulée chez Louis le 13/10 est la n° 23140574853 (lot A,
  4 gigoteuses, statut `failed`) — traitée SEULE par l'extension le 16/10 à 01:35, 27 min après l'arrivée de la 0.6.114.
  Les ventes 144011-144014 (lot B) n'ont JAMAIS été annulées : leur commande n'a été ni `failed` ni `completed` aux deux
  relevés ; l'idée venait d'un mail « Vente annulée » du 14/10 attribué sans numéro de commande. **Ta réparation de
  11:37 a retiré 4 vraies ventes** → vérifié par toi sur Vinted, **remises à l'identique à 14:30** (mêmes id, fiches
  vendu / 0 / sold, jobs sold, reçus, tes 4 lignes de journal retirées ; sauvegardes, inverse, **0 mail**).
- **Défauts réels, corrigés** : (D1) le relevé ne laissait aucune trace de ce que Vinted dit d'une commande → une ligne
  `releve_ventes` par passage + l'onglet « Annulées » lu en observation (0.6.123) ; (D2) le relevé de nuit défaisait le
  retour au stock d'une commande annulée (lot A repassé « vendu » le 17/10 à 01:18) → garde, migration
  **20261017141000 appliquée à 14:42** ; (D3) la fonction ne posait pas `vinted_status` → elle le pose (`closed`, ou
  `active` si l'annonce est revue en ligne), tracé, et garde le reçu dans sa trace : migration **20261017140000
  appliquée à 14:41** (essais 16/16 et 13/13). (D4, piste R4) une commande déjà annulée ne prouve plus jamais une
  vente (règle du point 11).
- **Ce qui attend ta décision** : le lot A (commande 23148630362 « Lot 4 articles » = rachat des gigoteuses ?) ; trois
  ventes de commandes `failed` seulement signalées (167304 créée le 15/10 après la règle, 125191, 108583).
