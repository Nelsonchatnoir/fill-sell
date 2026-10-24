# Lot du 24/10 — 10 points (fait le 23/10, de 20:39 à minuit)

Heures de Paris. Tout a été fait par l'agent ; Nico n'a rien à taper.

## En tête

- **À téléverser au Chrome Web Store** (seule dans son dossier) :
  **`C:\Users\nicol\fill-and-sell\build\CWS-0.6.132-A-TELEVERSER\fillsell-extension-0.6.132-123e626-cws.zip`**
  (BUILD_ID `2026-10-23T21:11:42Z+123e626`). Elle contient toute la 0.6.131, qui est **servie** depuis ce soir (16 comptes à 22:51).
  L'ancien dossier est rangé dans `build\CWS-PERIMES\CWS-0.6.131-SERVIE-remplacee-par-0.6.132\`.
- **Selftests** : départ 384 jouées, **383 vertes** (seul rouge `messages-cause-vraie`, 20:39-20:48). Arrivée **390 jouées,
  390 vertes** (23:00-23:09), dont 6 nouvelles. **Zéro régression** : aucun selftest existant n'est devenu rouge ;
  trois ont été recalés sur la nouvelle forme du code, sans rien affaiblir (`tailles-titre`, `publication-moteur`,
  `messages-cause-vraie`).
- **Push** : fait, un seul pour le lot — `f081a28` (code, extension 0.6.132, migrations, réparation), `123e626`
  (`EXTENSION_LAST_COMMIT`, app 2.9.111), puis le commit des docs (ce rapport, l'état de prod).
- **Mails** : `email_logs` relu avant et après chaque geste. **Aucun mail parti à cause de ce lot.** Les 15 mails de la
  soirée sont ceux de la vie normale : 8 « welcome » (inscriptions), 3 « extension_link », 2 mails internes de
  paiement, et 2 vraies ventes Vinted (21:07, 21:17), notées avant mon premier changement en prod (21:21).

## Ce qui est en prod

| Quoi | Avant → après |
|---|---|
| Migrations (essai à blanc d'abord, corps relus en prod après) | `20261024100000` boutiques (21:21, essai 8/8) · `20261024110000` sécurité (21:27, essai 24/24) · `20261024120000` droits des tables récentes (21:30) · `20261024130000` numéro de commande Beebs (22:20, essai 7/7) · `20261024140000` vraie cause des refus (22:44, essai 11/11) |
| `ebay-api-worker` | v92 → **v93** (21:36), `verify_jwt` false avant et après |
| `get-pending-jobs` | v275 → **v276** (22:49), `verify_jwt` true avant et après |
| `handler-watch` | v124 → **v125** (22:49), `verify_jwt` false avant et après |
| App | 2.9.110 → **2.9.111** (OTA 23:11, build `2026-10-23T21:10:40Z+123e626`, canal production relu à 2.9.111) ; le web suit le push |
| Extension | 0.6.131 (servie) → **0.6.132 à téléverser** |

## Point par point

### 1. Tailles des jeans (W/L), âge, rayon Beebs
**Cause.** Trois défauts. (a) Le « 34 » de « 33/34 » (la longueur L) passait pour la taille FR 34 de Beebs et Leboncoin
(un XS) : la recherche d'option était trop lâche. (b) Le texte n'était pas lu : « 33/34 », « W33 L34 », « W33 », « 33 US »
reposaient la question. (c) Depop : le W partait tel quel (« W30 », refusé) ou mal converti (« W31 L34 » → « 40 »). L'âge
en années (« 8 ans ») n'était pas lu non plus, et le rayon Beebs « neuf seulement » ou enfant/adulte se cachait derrière
la question de taille.
**Correctif (tout le parc).** Le tour de taille est lu partout (fiche, titre, description), jamais un prix, une mesure
en cm, une année ni une durée. Il est traduit dans la grille de chaque plateforme : Vinted W → FR, Beebs et Leboncoin
FR, eBay la valeur W, Depop le W sur ses grilles « bas » (62 homme ≤ 40, 24 femme ≤ 34). Une taille certaine ne pose plus
de question ; deux tailles différentes lues la gardent. L'âge est lu pour un article enfant. Le rayon Beebs incohérent
est dit sur la ligne du rayon. Code : app, `get-pending-jobs` v276, `handler-watch` v125.
**Preuve (rejeu sur 30 jours de vraies données).**
- 514 questions montrées, 304 rejouables. 5 auraient été évitées : 4 âges Beebs, et le jean de Johan (voir décision 2).
- 862 copies dont la taille était déjà déduite : **0 changée**.
- 312 bas Depop : 15 changent. 1 publié (« W31 L34 » parti en « 40 », il serait « 31 ») ; 14 jeans annulés (« W30 »
  refusé), qui passeraient.
- Selftests `lot-2410-tailles` (55 contrôles) et `tailles-titre` (68).
- Pas d'essai en direct : publier une fiche de test demande l'app connectée, ce que l'agent ne fait jamais.
**Données modifiées.** Aucune. 4 annonces publiées portent une taille fausse, celle de l'ancienne règle : Leboncoin
« 34 » pour un 35/34 (fiche 1790955715624) ; Beebs et Leboncoin « 34 » pour un 34/34 (1791926965462017) ; Leboncoin
« 34 » pour le 33/34 de Johan (1792769972063). Voir décision 1.

### 2. Depop de Johan : « présignature refusée pour la photo »
**Cause.** Depop refuse par moments, pour une seule photo, la demande d'envoi (refus CORS, « Failed to fetch »). Cela
touche ≈ 5 % des photos sur tout le parc (louis-seller : 41 sur 206). L'extension ne réessayait que les lectures : une
seule photo ratée arrêtait toute la publication.
**Correctif.** Extension 0.6.132 : la présignature et l'envoi d'une photo sont réessayés 3 fois (1 s, 2,5 s, 5 s). La
validation est inchangée et la création de l'annonce n'est jamais rejouée.
**Preuve.** Lecture des journaux, et selftest `depop-photos-reprise` (11).
**Johan.** Sa publication Depop (fiche 1792769972063) est « en file » : elle repart seule à chaque passage, et passera
pour de bon avec la 0.6.132. Ses autres plateformes sont en ligne (Vinted, Beebs, Leboncoin).

### 3. Achat Beebs = vente : la lecture ne voyait rien
**Cause** (code de beebs.app relu le 23/10). La carte d'une commande est un composant que le serveur appelle avec
l'objet commande (`OrderCard`). Elle fabrique son lien dans le navigateur : le flux de la page « Ventes » n'a **aucun
lien** de commande. Le lecteur cherchait des liens, d'où 59 lectures fantômes à 0 commande, dont la vraie vente de
Johan du 21/10.
**Correctif.** Extension 0.6.132 : les commandes se lisent dans les objets du flux. Les renvois « $7b » et
« $7b:props:… » sont suivis, un achat n'est jamais une vente, les liens restent lus en second. Le serveur accepte
désormais un numéro de commande court (migration `20261024130000`, essai 7/7). Le rattachement se fait toujours par
le numéro de PRODUIT exact.
**Preuve.**
- Selftest `beebs-commandes-flux-rsc` (11 cas), sur la forme réelle du flux : sur la même page, l'ancien lecteur voit
  0 commande, le nouveau 1.
- Rejeu serveur sur la vraie vente de Johan (produit 34209247, transaction annulée) : reconnue « déjà vendue », aucune
  double vente. L'annulation est comptée, rien n'est défait. Les produits d'un autre compte ne sont jamais rattachés.
- Le compte Beebs de Nico n'a aucune commande (ni achat ni vente) : pas de vraie commande à lire sur un compte de test.
  Celles de Johan, Louis et Sébastien ne se lisent que dans leur navigateur, avec la 0.6.132.
**L'interrupteur `ventes_beebs_commandes` reste à 0** : il ne s'allume que sur des bilans fantômes réels (voir décision 3).

### 4. Rattrapage « Achat en cours » Leboncoin
La 0.6.131 est servie (16 comptes à 22:51, 85 encore en 0.6.128).
- Script `20261022_leboncoin_achats_en_cours_existants.sql` lancé à 22:54, après un essai à blanc.
- Résultat : **4 ventes** (louelkevinpro 3, nicolas.menar 1). Ce sont des fiches importées le jour même depuis des
  annonces déjà « Vendu » ou « Achat en cours ». **0 mail**, 1 note classée « ignorée », 0 retrait. Sauvegarde
  `_backup_2210_lbc_achats`.
- **Reste à attendre** : 26 lectures de plus de 72 h, sur 16 comptes. La plupart de ces comptes sont inactifs depuis
  septembre ou octobre ; louis et baptiste.giboire sont actifs, en 0.6.128. Ces lectures attendent un relevé fait par
  une extension ≥ 0.6.129 (mise à jour Chrome automatique), puis ce même script.

### 5. Thierry (antikcollections) : republications arrêtées
**Cause : pas la cadence.** Aucune retenue n'a été écrite. Son poste était muet : aucun appel de 14:55 à 15:28, de
15:42 à 16:32, ni après 17:16 (PC en veille). Les tâches restées « en cours » ont été remises en file par le chien de
garde. Les 22 republications restantes sont toutes hors quota : elles partiront seules quand son PC sera allumé
(10 faites, 3 closes : 2 articles vendus entre-temps).
**Défaut de règle trouvé.** Le retrait eBay d'un article vendu sur Vinted à 16:40 attendait son PC, alors que son
compte eBay est relié par l'API.
**Correctif.** Un retrait eBay qui attend le poste depuis 15 min, ou un poste muet : l'API le fait
(`retraitAttendLePoste`, `ebay-api-worker` v93).
**Preuve sur eBay.** 168782813446 (sesterce Marc Aurèle) terminée à 21:38 ; page relue : « Le vendeur a mis fin à cette
annonce … car l'objet n'est plus disponible ». Selftest `ebay-retrait-trading`.

### 6. Refus des plateformes
- **jocabroc8 (eBay, 09/10 et 11/10) : ce n'étaient pas des refus.** eBay a mis les deux annonces en ligne (API), puis
  le vendeur y a mis fin 2 et 17 min après (« car elle comportait une erreur », pages 407277712724 et 407283170246
  relues). FillSell disait à tort « refusée par la modération ».
  - Correctif : une annonce eBay dont la fin est connue est close « arrêtée sur eBay — pas par FillSell », sans rouge
    (migration `20261024140000`).
  - Réparé : les 2 jobs reçoivent ce motif vrai.
  - **Plus grave**, trouvé en chemin : jocabroc8 a **deux fiches pour la même estampe** (1791040801501 et 1791818408222),
    et **deux annonces eBay en ligne** pour ce seul objet : 407302931655 à 40 € (FillSell) et 407302958488 à 44,58 €.
    Même chose pour le tableau « paysage lierre pilier » (1790781836119004 et 1791087674193002). Voir décision 4.
- **louis-seller, T-shirt Raiponce : vrai refus Leboncoin le 18/10** (motif donné au seul vendeur).
  - Le 23/10 à 18:33 il l'a relancé ; le redépôt est en ligne (3293872836). Mais la relance gardait le numéro de
    l'annonce morte (3290885485), et le relevé a créé un second suivi (db986536).
  - Correctif : une relance après un dépôt prouvé mort efface son numéro, son lien et ses traces ; la relance par
    copie n'en hérite plus (`src/utils/relanceDepotMort.js`, app 2.9.111).
  - Réparé : l'ancien job est clos « redéposée, l'annonce en ligne est 3293872836 », le suivi vivant est intact.
- **louis-seller, Short Okaïdi : déjà en ligne via le compte relié louis@** (3286756945). Leboncoin a refusé le doublon,
  et FillSell affichait en rouge « Publication non confirmée ».
  - Correctif : un dépôt sans lien dont l'article est en ligne ailleurs (même fiche ou compte relié) est clos sans
    rouge (migration `20261024140000`).
  - Réparé : le job affiche « déjà en ligne par ton compte relié ».
- **recrutementgroupezk704 (5 dépôts Leboncoin du 14/10)** : Leboncoin a confirmé chaque dépôt, puis ne les a jamais
  mis en ligne.
  - Les 5 refusés sont exactement les 5 déposés le 14/10 entre 05:25 et 06:48, 3 h 30 après 40 retraits Leboncoin du
    même compte en 20 min.
  - Les 22 dépôts du même lot faits le 19/10 sont **tous passés**, avec un contenu de même forme (descriptions, photos,
    rayons).
  - Aucune différence de notre côté. Le motif exact n'est donné qu'au vendeur. Rien relancé (voir décision 5).
- **Données** : 4 jobs réparés à 22:46 (sauvegarde protégée `_backup_2410_refus_plateformes`, inverse
  `scripts/reparations/20261024_refus_plateformes_vraie_cause_INVERSE.sql`) : 0 mail, 0 push, 0 retrait, 0 annonce
  touchée. Essai à blanc 11/11 sur les vrais jobs. Selftest `refus-plateformes-vraie-cause` (8).

### 7. Djellaba : « Costumes » au lieu de « Vêtements traditionnels »
**Cause.** L'arbre eBay de l'app n'avait pas la branche « Vêtements traditionnels, du monde » (155240).
**Correctif.** Branche relevée sur ebay.fr (feuilles par région) et règle `vetementTraditionnel` :
- mots sûrs : djellaba, qamis, takchita, abaya, boubou, sari, hanbok, yukata, dirndl… ;
- mots que la mode emprunte (caftan, kimono, poncho, kilt…) : seulement avec leur origine collée ;
- jamais un kimono de judo, une poupée, un tissu ; deux régions nommées = rien ne change.
**Preuve (rejeu 30 jours).** 6 805 copies eBay rejouées, **1 change** (la djellaba de Sébastien : 3001 → 155253). 71
fiches portent un mot « traditionnel » : 4 bien rangées, 0 robe « caftan » de mode basculée. Selftest
`vetement-traditionnel-ebay` (22).
**Données.** Aucune : l'annonce de Sébastien reste où elle est (décision 6).

### 8. Boutiques réservées par des comptes supprimés
- **Règle** : toute suppression de compte libère ses boutiques et ses liens entre comptes, toutes plateformes, quel
  que soit le chemin (clés étrangères ON DELETE CASCADE sur 5 colonnes).
- **Nettoyé** : 7 réservations orphelines (les 5 connues, plus 3139310768 et 32668712) ; sauvegarde protégée, inverse,
  essai 8/8.

### 9. Selftest `messages-cause-vraie` rouge
Pas un défaut du code : le test portait une date écrite en dur (18/10/2026), devenue passée. Il construit maintenant J+5
à l'heure de Paris et ajoute le cas « échue » (J-2). Il est plus strict qu'avant. 24/24.

### 10. Sécurité avant le 30/10
**Fait (migrations `20261024110000` et `20261024120000`).**
- Une table créée dans `public` naît avec la RLS (déclencheur `fillsell_table_nait_protegee`). Une sauvegarde n'a
  aucun droit client ; une vraie table reçoit service_role. Les droits par défaut sont déjà au régime du 30/10.
- Toutes les sauvegardes existantes ont la RLS, sans anon ni authenticated.
- 19 fonctions de lecture fermées à anon, et à authenticated sauf les 2 que l'app appelle sous session ; 49 fonctions
  de déclencheur fermées à anon et à authenticated (un déclencheur n'a pas besoin de ce droit) ; 5 RPC fermées à anon.
- Selftest `tables-droits-explicites` (35), règle écrite dans `docs/regles/base-supabase-et-fonctions.md`.

**Advisors sécurité, avant → après.**

| Alerte | Avant | Après |
|---|---|---|
| ERREUR « RLS désactivée » (4 sauvegardes lisibles avec la clé publique) | 4 | **0** |
| Fonctions SECURITY DEFINER appelables par anon | 73 | **0** |
| Appelables par authenticated (celles que l'app appelle sous session, chacune contrôle `auth.uid()`) | 145 | 79 |
| `search_path` modifiable | 68 | 68 |
| Protection des mots de passe divulgués | 1 | 1 |

Les erreurs « permission denied » des journaux ont le même rythme avant et après (`profiles`, `push_oublier_appareil` :
elles existaient déjà ce matin). Aucune nouvelle.

**Advisors performance** : inchangés (55 `auth_rls_initplan`, 1 politique en double ; en info : 21 clés étrangères
sans index, 745 tables sans clé primaire, les sauvegardes).

**Protection des mots de passe divulgués : à cocher par Nico** (un réglage d'Auth, pas du SQL). Ouvrir
https://supabase.com/dashboard/project/tojihnuawsoohlolangc/auth/providers?provider=Email, puis dans le panneau
**Email**, activer **« Prevent use of leaked passwords »** et cliquer **Save**. Offre Pro : déjà la vôtre.

## Décisions pour Nico (ma recommandation en premier)

1. **4 annonces avec une taille fausse** (« 34 » au lieu du W ; point 1).
   **Je recommande** de les corriger par une republication normale, hors quota. Sinon on les laisse.
2. **Jean de Johan « 33/34 »** : la règle lit W33 (FR 42), la notation Levi's taille/longueur ; Johan a répondu W34
   (FR 44).
   **Je recommande** de garder sa réponse : la règle ne remplace jamais une réponse donnée. Lui demander de vérifier
   l'étiquette.
3. **Interrupteur Beebs** : l'allumer seulement quand des bilans fantômes de la 0.6.132 auront lu de vraies commandes,
   sans fausse vente. Je les relis et je viens avec la liste.
4. **jocabroc8 : deux fiches et deux annonces eBay en ligne pour la même estampe** (et deux fiches pour le tableau).
   C'est un risque de vente double.
   **Je recommande** de lui demander s'il s'agit du même objet, puis de fusionner sur son oui. Sans réponse : ne
   retirer l'annonce à 44,58 € qu'avec son accord. Rien n'est fait sans toi (jamais sur un titre seul).
5. **recrutementgroupezk704, 4 dépôts refusés** (le 5e article est vendu).
   **Je recommande** que le vendeur lise le motif dans Leboncoin (« Mes annonces »), puis relance depuis l'app. La
   relance repart désormais sans le numéro mort. Je ne les ai pas relancés : un refus répété peut faire restreindre un
   compte.
6. **Djellaba de Sébastien (eBay, en « Costumes »)**.
   **Je recommande** de la republier dans « Vêtements traditionnels » par le circuit normal, hors quota. Sinon elle
   reste.
7. **Rattrapage Leboncoin automatique** : aujourd'hui la règle n'agit qu'au changement de transaction. Une fiche
   importée APRÈS la lecture, ou une lecture de plus de 72 h, attend un script.
   **Je recommande** que la règle s'applique aussi à une lecture fraîche dont la vente n'est pas enregistrée, avec zéro
   mail pour une vente de plus de 24 h. À écrire sur ton feu vert.
8. **Quotas d'une annonce eBay arrêtée par le vendeur** : la publication est rendue (comme avant, rien changé). À
   trancher : doit-elle compter ?

## 24/10 nuit — décision 4 de Nico : l'estampe en double de jocabroc8

**Décision (00:40).** Garder l'annonce eBay la plus ancienne et retirer l'autre tout de suite, par le circuit normal de
l'app. Aucun message chez le vendeur, aucune vente en cours touchée.

**La plus ancienne.**
- 407302931655 (40 €) : publiée par l'API FillSell le 20/10 à 07:40:10. Elle est gardée.
- 407302958488 (50 USD, environ 44,58 €) : son numéro est postérieur et ses photos eBay sont celles de la première
  (copiées). Importée par le relevé, rattachée à la main le 21/10. Elle est retirée.
- Pages eBay relues à 00:50 : les deux en ligne, même vendeur (JocaBroc), 0 vendu.
- En base : 0 vente et 0 commande sur les deux fiches.

**Défaut de règle trouvé avant d'agir.** Le PC de jocabroc8 est muet depuis 21:03 : c'est donc l'API Trading qui fait
le retrait. Or elle laissait la publication d'origine « published » sur une annonce terminée, et la veille eBay posait
ensuite « Plus en ligne — Vendue ? » : une fausse question au vendeur.
**Correctif (tout le parc).** Après la preuve, la publication est close « retirée — pas une vente », comme après un
retrait par l'extension.
- Le numéro doit être exact et la fiche celle du retrait ; une annonce qu'eBay dit vendue n'est jamais close ainsi.
- `ebay-api-worker` v93 → **v94** (00:47, `verify_jwt` false avant et après).
- Selftest `ebay-retrait-trading` : 14 contrôles de plus.
- Le défaut a laissé sa trace sur 13939a70 et 559613dd : fiches vendue et supprimée, rien à réparer.

**Geste (00:54).** Script `scripts/reparations/20261024_jocabroc8_estampe_retrait_ebay.sql`, passé d'abord à blanc.
- Sauvegardes protégées : `_backup_2410_jocabroc8_estampe_jobs` et `_annonces`. Inverse : `…_INVERSE.sql`.
- Un job de retrait, **26a0bf3c** : la ligne exacte du retrait ciblé de l'app (chemin d'audit `intervention_support`).

**Résultat (relu en base le 24/10 à 09:24).**
- 01:10:06 : le poste du vendeur étant muet, l'API reprend le retrait.
- 01:10:08 : eBay termine 407302958488 (EndFixedPriceItem, HTTP 200, statut « Ended »). Le job 26a0bf3c est « deleted ».
- 01:10:09 : la publication b55aefd3 passe « cancelled » (« retirée — pas une vente », `removed_by_user`,
  `retiree_par_trading`). C'est le premier cas réel de la v94 : aucune question « vendue ? ».
- L'annonce relevée 9d6878eb est datée « retirée » à 01:10. 407302931655 (job e4954f7d) est toujours publiée.

**Données modifiées (liste exacte).**
- Job 26a0bf3c créé (le retrait).
- `usage_logs` : 1 ligne `retrait_annonces`.
- Job 20587777 : la phrase écrite le 23/10, « en ligne sous l'annonce 407302958488 », nomme maintenant 407302931655.
- Au retrait, par le circuit :
  - la publication b55aefd3 passe « cancelled » (« retirée — pas une vente ») ;
  - l'annonce relevée 9d6878eb est datée « retirée » (déclencheur `cross_post_jobs_retrait_ferme_annonce`).
- Rien d'autre.

**Mails.** 0 mail et 0 push causés par ce geste. `email_logs` relu avant et après : 41 mails pour jocabroc8 (le
dernier, à 23:25, est une vraie vente eBay d'une assiette, sans lien avec l'estampe). Depuis 00:40, un seul mail sur
tout le parc : un « welcome » (inscription) à 00:41. Relu le 24/10 à 09:24 : 42 mails ; le nouveau, à 06:39, est le
mail d'une vraie vente eBay d'un autre article (peinture « nature morte », 80 €, 407277705492).

**Reste du point 4** : traité le 24/10 au matin, sur les arbitrages de Nico (section suivante, étape 1).

## 24/10 matin — arbitrages de Nico (étape 0, étape 1, décisions 1 à 8)

Heures de Paris. Tout vérifié et retesté par l'agent ; Nico n'a rien à faire. **Mails et notifications causés : 0**
(`email_logs` et `push_ventes` relus avant et après chaque geste ; les 4 mails de vente du parc entre 09:55 et 10:40 sont
de vraies ventes d'autres articles : DVD Star Trek sur Leboncoin chez Sébastien, Gundam et deux monnaies sur Vinted).

### Étape 0 — la v94 dans le dépôt : fait
- Suite complète relancée en 4 tranches (09:26 → 09:34) : **390/390 verts**.
- Commit `5365b15` poussé. Code poussé = code en prod : 14 des 32 fichiers d'`ebay-api-worker` téléchargés de la prod
  sont identiques à l'octet (dont `index.ts`) ; les 18 autres n'ont pas été modifiés depuis le déploiement de 00:47.

### Étape 1 — fin du point 4 (jocabroc8) : fait, sauf la règle Vinted (feu vert à donner)
- **eBay, pages publiques relues** : 407302958488 « Le vendeur a mis fin à cette annonce … l'objet n'est plus
  disponible » ; 407302931655 en ligne (40 €, « Achat immédiat »). La publication b55aefd3 est « cancelled »
  (« retirée — pas une vente ») depuis 01:10:09 : la v94 a marché en réel.
- **Les fiches de l'estampe : il y en avait trois**, une par remise en ligne Leboncoin faite par le vendeur lui-même
  (3274383890 → 3281462401 → 3286304245). La vraie : **1791818408222**, qui porte les deux annonces vivantes
  (Leboncoin 3286304245, eBay 407302931655). Preuve par la photo : fichiers identiques (sommes de contrôle) sur les
  deux anciennes, la même photo retouchée sur la vraie ; jamais deux annonces en ligne en même temps.
- **Le tableau : trois fiches aussi** (Vinted 10191253036 → 10221845199 → 10357380180, republiée par FillSell en
  10480086312). Ses annonces vivantes étaient sur deux fiches (Vinted d'un côté, Leboncoin et eBay de l'autre) :
  **risque de vente double, levé**. Vraie fiche : **1791983641199002** (l'identité Vinted vivante y reste). Même
  toile sur les trois (lièvre au pilier, lierre, même jardin) : « paysage pilier lierre » et « lièvre nature morte »
  sont le même tableau.
- **Geste (09:59:31)** : `scripts/reparations/20261024_jocabroc8_fiches_en_double.sql`, essai à blanc d'abord.
  - 5 annonces mortes closes « Annonce remplacée par ta remise en ligne (nouvelle annonce …) — ce n'est pas une
    vente » : leurs questions « vendue ? » tombent (Leboncoin 3274383890, 3281462401, 3279551924 ; Vinted
    10191253036, 10221845199, « Page not found », témoin du même vendeur ouvert).
  - 4 fusions par le circuit du bouton « Fusionner » (`inventaire_fusionner_pour`, défaisable), tracées comme les
    fusions sur décision de Nico avec preuve photo (`utilisateur:photo_go_nico_2410`).
  - Mesuré dans la transaction : 0 mail, 0 notification, 0 quota, 0 job créé, 0 vente. Sauvegardes protégées
    `_backup_2410_jocabroc8_doubles_*` ; inverse `…_INVERSE.sql` essayé à blanc (les 6 fiches reviennent).
- **Les deux annonces Vinted qui ne s'ouvrent plus — la cause** : le vendeur supprime ses annonces Vinted et les
  recrée (nouvel identifiant) ; la synchro en fait chaque fois une fiche neuve, et l'annonce morte garde « vendue ? ».
  La règle qui les rattache existe depuis le 08/10 (`_shared/rapprochement/remises-en-ligne.js`, enquête
  Bebertdeals) mais **n'a jamais été branchée** : la migration 20261008160000 attend un feu vert nommé, ses
  interrupteurs n'existent pas en prod, aucune des trois fonctions centrales (`rapprochement_v3_lire`,
  `rapprochement_v3_appliquer`, `enregistrer_vente_atomique`) ne la porte.
  **Pas branchée dans ce lot** : le fichier du 08/10 réécrit ces trois fonctions telles qu'elles étaient le 08/10 ;
  l'appliquer ferait reculer seize jours de correctifs (moteur v23+, ventes). Il faut la reconstruire sur les
  versions en prod, l'essayer à blanc, mesurer le nombre de fiches fusionnées sur le parc (≥ 2 796 au 08/10), puis
  l'armer : **à lancer sur ton feu vert nommé**.

### Décision 1 — les « 4 tailles 34 » : règle corrigée, 1 republication, 3 laissées (et pourquoi)
- **Relu en ligne** : aucune annonce n'affiche « 34 » ; le « 34 » était dans les COPIES en base.
  - Beebs 34165464 (Levi's 517 « W34 L34 (44) », recrutementgroupezk704) : **aucune taille** → republiée.
  - Leboncoin 3291177691 (même jean) : « Taille L », juste pour un W34 → gardée.
  - Leboncoin 3293835887 (Johan) : aucune taille. La grille Leboncoin homme n'a que des lettres et aucune table
    homme n'est publiée (règle du 28/09 : la personne choisit) → pas republiée, la lettre est à Johan.
  - Beebs 34222058 (Johan) : « Taille 44 », juste. Jean 35/34 de patrick.giry07 : vendu, jamais en ligne.
- **La règle (tous les comptes)** : une republication recopie la taille de l'ancienne copie ; sur Beebs (grille
  homme « 32 » … « 64 »), le « 34 » repartait tel quel. `get-pending-jobs` v276 → **v277** (10:11, `verify_jwt`
  true avant et après) : pour un bas au W certain (réponse de la personne d'abord, sinon un seul W au titre ou à la
  description), un nombre nu égal au W ou à la longueur est servi en taille française du W (W34 = FR 44) ; tout le
  reste passe inchangé (`_shared/taille-corrigee-par-le-w.js`, selftest `taille-corrigee-par-le-w`, 24 contrôles).
- **Republication (10:12:36)**, par le circuit normal (`spend_coins_and_republish`, en tant que le compte), marquée
  hors quota : job f4e7d1ab. Gardes vérifiées : fiche au stock, 0 vente, 0 commande, aucune tâche en file, la
  taille servie calculée = « 44 ». **À vérifier au prochain check** : le PC du vendeur est éteint depuis le 23/10 à
  23:53 ; attendu : page Beebs « Taille 44 ». Script `20261024_taille_w_beebs_republier.sql`.

### Décision 2 — le jean de Johan : texte prêt, rien envoyé
Réponse W34 gardée (Beebs « 44 »). Texte proposé (Nico décide de l'envoi) :
« Bonjour Johan, petite vérification sur ton jean Levi's 501 « 33/34 » : chez Levi's, le premier nombre est le tour
de taille (W) et le second la longueur (L), ce qui ferait un W33. Tu nous as indiqué W34. Peux-tu regarder l'étiquette
cousue à l'intérieur de la ceinture et nous dire ce qui y est écrit (par exemple « W33 L34 ») ? On ajustera la taille
de tes annonces si besoin. Merci ! »

### Décision 3 — interrupteur Beebs : reste à 0 ; liste vide
- La 0.6.132 n'est encore chez personne (aucun poste ne sert le build `2026-10-23T21:11:42Z+123e626`) : **0 commande
  lue par la 0.6.132**. Les 5 bilans Beebs depuis le 23/10 23:11 viennent de la 0.6.131 : 0 commande.
- Limite trouvée : un bilan ne garde que des COMPTEURS (`usage_logs` « ventes_beebs_commandes ») — jamais le numéro
  de commande ni le produit. Même avec la 0.6.132, la liste commande par commande ne sera lisible que chez les comptes
  de la bêta messagerie (`plateforme_commandes`). Pour l'avoir partout : `commandes_beebs_noter` doit garder le détail
  en mode fantôme (numéro, statut, produit, verdict) — **une migration, à faire sur ton feu vert**.

### Décision 5 — recrutementgroupezk704 : cause trouvée chez nous, 1 dépôt relancé
- **Motif exact** : Leboncoin ne le donne qu'au vendeur, par mail ; FillSell ne le lit nulle part (ni « Mes
  annonces », ni l'API du tableau de bord, ni la messagerie).
- **La cause, par nos données** : les 5 dépôts du 14/10 (05:25 → 06:48) ont été faits par l'extension **0.6.110** :
  5 sur 5 jamais en ligne. Ce compte est un compte Leboncoin **pro** ; la 0.6.110 ne tenait pas le formulaire pro
  (aucune trace `compte_pro` : la sonde attendait 4 s des critères que ce formulaire affiche plus tard, l'étape
  « options » n'était pas tenue). Depuis la 0.6.123 → 0.6.128 (compte pro reconnu, sonde 15 s, critères posés), ses
  dépôts des 19 et 20/10 portent `compte_pro` : **150 déposés, 0 refusé**. Même catégorie, mêmes champs, aucun
  téléphone, mail, autre site ni mot-clé : rien d'autre ne sépare les refusés des acceptés.
  - Écartés, preuves à l'appui : les 38 retraits Leboncoin de 01:32 → 01:52 (articles vendus, annonces déjà
    désactivées) ; un doublon (aucune annonce du vendeur avec les mêmes numéros d'article) ; la marque devinée par
    Leboncoin (juste sur les 5) ; la catégorie du short Nike (« Sport & Plein air ») — un short Jordan est en ligne
    dans cette catégorie.
- **La règle** : corrigée depuis la 0.6.123 → 0.6.128 ; le poste du vendeur sert la 0.6.131. Preuve par les tests :
  `lbc-forfait-pro`, `lbc-pro-poids`, `taille-rayon-paiement` verts.
- **Relance (10:23:35)**, un seul dépôt, par le circuit du bouton « Relancer » : le jean Levi's 550 (job a47bdb31),
  le plus proche des 150 passés. Script `20261024_recrutement_lbc_relance_1.sql` (+ inverse). 0 mail.
  **À vérifier au prochain check** : le dépôt (PC du vendeur éteint), puis l'annonce en ligne ; **les 3 autres**
  (short Adidas, short Nike, Levi's 505 W40) seulement si celui-ci passe. Le 5e article (Levi's 505 W33) est vendu.
  Si le compte pro est hors forfait, Leboncoin demandera au vendeur « Valider et payer » (FillSell ne paie jamais).

### Décision 6 — la djellaba : règle à la racine, annonce rangée
- **La règle (tous les comptes)** : la règle « vêtement traditionnel » ne jouait qu'à l'écran Publier ; le serveur eBay
  pouvait encore ranger en « Costumes » (copie, relance, catalogue Vinted — c'était le cas de la djellaba —, suggestion
  d'eBay). `ebay-api-worker` v94 → **v95** (10:27, `verify_jwt` false avant et après) : `resoudreCategorie` la joue
  en tête, avant toute suggestion d'eBay ; jamais sur un rayon choisi par la personne ni déjà dans la branche
  (`_shared/ebay-rayon-traditionnel.js`, selftest `ebay-rayon-traditionnel`, 16 contrôles).
- **L'annonce (10:31)** : eBay est hors republication depuis le 17/09 ; le circuit normal pour corriger le rayon d'une
  annonce eBay en ligne est le « rangement par la règle d'aujourd'hui » (décision de Nico du 11/10) : même numéro,
  vues et favoris gardés, aucun quota. Lecture à blanc d'abord (en ligne, 0 vendu, 0 commande), sauvegarde complète
  (`_backup_2410_ebay_djellaba`), écriture gardée par l'empreinte, relecture : **366745645547 est dans « Vêtements,
  accessoires › Déguisements, occasions spéciales › Vêtements traditionnels, du monde › Asie du Sud-Ouest/Moyen-
  Orient »** (155253), même annonce, en ligne, prix 52,70 € et quantité inchangés, aucun écart. Script
  `20261024_djellaba_ebay_rayon.sql` (+ inverse). Un aspect non obligatoire hérité de « Costumes » reste
  (« Style : Tuxedo ») : le circuit ne réécrit que les aspects obligatoires. Appel du worker par la base
  (`public.cron_secret()`, jamais écrit) ; premier essai refusé « sauvegarde absente » (table pas encore dans le cache
  de l'API) : `NOTIFY pgrst, 'reload schema'`, puis l'écriture, rien d'écrit chez eBay entre les deux.

### Décision 7 — rattrapage Leboncoin automatique : fait
- Migration **20261024150000** appliquée à 10:36 (essai à blanc sur 20 vraies lectures, puis annulé ; corps relus en
  prod après) : un relevé qui RELIT « Achat en cours » ou « Vendu » (lecture < 1 h, annonce en ligne) joue la règle
  quand le job Leboncoin publié de CE numéro porte une fiche au stock sans preuve de vente ; la preuve est marquée
  « rattrapage » avec sa première lecture ; **aucune note (ni mail ni notification) quand la vente a plus de 24 h ou un
  âge inconnu**. Selftest `lbc-rattrapage-lecture-fraiche` (20). Inverse : `supabase/rollbacks/20261024150000_…`.
- Essai sur les 20 lectures concernées aujourd'hui : 20 preuves, 0 note ; 10 lectures sans job : aucune trace.
  **À vérifier au prochain check** : au prochain relevé de chaque compte, ces ventes s'enregistrent (et leurs copies
  ailleurs se retirent, comme le 22/10), 0 mail.

### Décision 8 — quota d'une annonce eBay arrêtée par le vendeur : rien à faire, rien changé.

### Clôture
- Suite complète relancée en 3 tranches avant le commit (10:40 → 10:48) : **393/393 verts** (390 + 3 nouveaux :
  `taille-corrigee-par-le-w`, `ebay-rayon-traditionnel`, `lbc-rattrapage-lecture-fraiche`). Commit + push, un seul.
- **L'extension n'a pas changé** dans ce lot : pas de nouveau zip. La 0.6.132 reste celle à téléverser.
