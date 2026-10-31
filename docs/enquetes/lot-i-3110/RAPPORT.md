# Lot I — petits problèmes restants (31/10/2026 soir)

Heure de Paris partout. Rien réparé à la main chez un client, aucun mail, rien chez Stripe.
Selftest du lot : `npm run selftest:lot-i-3110`. Déploiements, OTA, extension et preuves : § « Livraison » en fin de rapport.

## 1. Rosa Metra (Pro depuis le 31/10 18:19)
**Trouvé.**
- Sa boutique Vinted connectée est « reginathestore » (n° 3207059549), lue sur **vinted.fr**. C'est le compte français
  de son navigateur (pays FR, langue fr). Aucun site étranger n'était autorisé.
- Ses deux relevés (18:25 et 18:41) ont reçu de Vinted lui-même : `item_count=0, total_items_count=0`. Cette boutique
  n'a jamais rien mis en vente.
- Ce numéro est le plus élevé des 358 boutiques Vinted connues de FillSell : la boutique est toute neuve. Aucun autre
  compte FillSell ne l'utilise.
- Leboncoin est relié, mais 0 annonce en ligne (« 0 en ligne lues sur 0 annoncées »).
- eBay : 0 annonce. Beebs : 403. Depop : accès accordé, rien d'autre.
- **vinted.co.uk n'est pas lisible par FillSell.** Il n'est ni dans le manifeste de l'extension ni dans la liste des
  sites Vinted (`vinted-origine.js` : zone euro seulement). Si son stock est sur une boutique britannique, l'extension
  ne peut pas la lire. Ajouter le Royaume-Uni serait un vrai chantier (livres sterling, catalogue) : à décider.
- **Le blocage ne vient pas de chez nous** : il n'y a rien à lire sur les comptes connectés.
- Depuis 19:04, elle crée ses annonces : 2 analyses Lens et une publication sur 3 plateformes à 19:16.
  - Vinted : publiée.
  - Depop : attend son moyen de paiement.
  - eBay : « onglet figé avant le dépôt ». Hors lot, à regarder.

**Changé.**
- b) À chaque relevé Vinted, le site lu est enregistré (extension 0.6.163) :
  - dans `usage_logs` `sync_page.metadata.domaine` (ex. « vinted.fr »), à chaque page ;
  - dans la note « dressing lu vide », qui dit maintenant « lu sur vinted.fr ».
- c) Stock vide après une synchro à zéro : la carte de synchro propose aussi « Crée ta première annonce » (photo, puis
  Lens). « Synchroniser » reste en place.
  - La règle est dans `src/stock/synchroSansRien.js`.
  - Lens s'ouvre par l'événement `fillsell:ouvrir-lens` : aucune prop neuve au Stock.

**Reste.**
- Lui demander si elle vend sur vinted.co.uk (aucun mail envoyé).
- Le site lu n'est pas encore une colonne de `vinted_sync_runs` : ce serait une migration. Il est tracé dans
  `usage_logs` à la place.

## 2. Couleur Vinted : « appareil photo »
**Trouvé** (PAUGUES, job b6046532, « Polaroid Land Camera »). La chaîne complète :
1. Le rayon « Appareils photo » figurait dans notre liste des rayons sans couleur. Or Vinted l'exige désormais :
   formulaire relevé « Couleur » obligatoire à 15:18 et refus 400 « Le champ Couleur doit être renseigné ». Même chose
   pour « Téléphones portables » (formulaire relevé les 25 et 29/10).
2. La question « Couleur » est partie sans liste. La fenêtre « Compléter » laissait taper du texte libre (« Autre
   valeur… ») : la réponse « appareil photo » a été écrite dans `vintedAspects.color` et dans « tranché par toi ».
3. Cette réponse prime sur tout dans l'extension. La reprise serveur (« couleur retraduite ») vidait `colors`, mais
   laissait la réponse en place.
4. Résultat : même échec, puis « on ne sait pas pourquoi ».

Le mot « appareil photo » vient donc de la saisie libre de la question. Ni Lens ni la génération ne l'ont posé comme
couleur.

**Changé** (la règle : la couleur vient de la palette, ou elle est demandée) :
- `_shared/vinted-exigences.js` : « Appareils photo » et « Téléphones portables » ne sont plus exemptés. Une couleur
  posée sur un formulaire sans ce champ ne bloque rien.
- `_shared/pas-de-rouge.js` (`couleurVintedHorsPalette`) : sur « Vinted ne propose pas la couleur », la réponse
  fautive est retirée.
  - 1re fois : reprise.
  - 2e fois : la question avec la palette de la page, en liste fermée.
- App : la question « Couleur » Vinted est une liste fermée (palette de la page, sinon le catalogue, sinon la palette
  Vinted). Aucune valeur hors palette ne peut être écrite.

**Alizée (26) et Anastasia H (6), vérifié sur le code et la base, rien relancé.**
- Leurs échecs disent « la couleur [Marine / Argenté / Multicolore] existe bien mais n'a pas pu être posée ». Ils
  datent des extensions 0.6.148 et 0.6.149 : à partir du 28/10, Vinted a changé ses menus (« bloom »), et ces versions
  ne les lisent pas.
- La 0.6.150 et les suivantes les lisent :
  - en deux jours, 115 republications portant exactement ces couleurs (Marine 41, Argenté 27, Multicolore 47) ont été
    publiées en 0.6.159 / 0.6.161 ;
  - aucune tâche ouverte ne porte cette erreur en 0.6.153 ou plus.
- Anastasia H : sa dernière tentative (13:52) tournait en 0.6.148. Elle est en 0.6.161 depuis 16:42 : ses 6
  republications passeront à leur tour.
- Alizée : son poste est muet depuis le 28/10 18:38, en 0.6.149. Il passera en 0.6.161 au prochain démarrage de Chrome.
- Dans les deux cas, rien n'a été retiré : arrêt avant toute suppression.

**Reste.** Le job b6046532 de PAUGUES garde sa mauvaise réponse en base, et je ne l'ai pas réparé à la main.
- Après le déploiement d'update-job-status, si elle clique « Relancer », un essai échoue encore.
- Puis la question avec la palette s'ouvre.
- Une réparation directe (retirer `vintedAspects.color`) attend ton feu vert.

## 3. Leboncoin : formulaire bloqué avant l'aperçu
**Trouvé.** La même signature dans chaque cas :
- Page « Dites-nous en plus sur votre article », juste après « La photo n° N a bien été ajoutée ».
- Aucun champ sur la page (`critères []`, pas un seul `label[for]`), État introuvable, « Continuer » refusé.
- Cas : Ornella (VTech, 5 essais sur 5), Srideals (passé au 2e essai), Jocabroc (passé au 5e), the_closet72 (28-29/10,
  0.6.149/0.6.152). Johan et Amiral n'ont pas cette signature dans la base.
- Les mêmes rayons passent ailleurs : 13 dépôts « Jeux & Jouets » sur 3 comptes depuis le 29/10, et Ornella publie
  ses vêtements normalement.
- Conclusion : chargement tardif ou partiel des critères après les photos. Pas une version de page différente : les
  titres et les boutons relevés sont ceux de la page normale.

**Changé** (extension 0.6.163). Quand le job porte des critères et que la page n'en montre aucun :
- l'attente se prolonge de 30 s au plus, avec le bas du formulaire ramené à l'écran ;
- sinon l'état de la page est noté (visibilité, éléments en chargement, barres, squelettes, photos) ;
- jamais un « Continuer » sur un formulaire vide.

**Pour Nico, sur le Mac d'Ornella, en une phrase.** Dépose « Jouet VTech – Trompette » à la main sur leboncoin.fr
avec ses 5 photos, et regarde sur la page « Dites-nous en plus sur votre article » combien de secondes après « La photo
n° 5 a bien été ajoutée » le champ « État » apparaît (ou s'il n'apparaît jamais), et dans quelle catégorie Leboncoin a
rangé l'annonce.

## 4. Vinted « grille incohérente »
**Trouvé.** Les 7 republications sont toutes en 0.6.149, arrêtées avant toute suppression.
- Asma : 4 (5e7b61b1, 79db9102, 119803a4, 6afcb6e8).
- labouquinerie85 : 3 (1551e403, 242874e4, 72311c9d).
- La cause est le même changement de menus Vinted du 28/10 : la 0.6.149 relisait des champs vides.
- La lecture est déjà en phase depuis la 0.6.150 : 13 republications « Livres » publiées en 0.6.159 / 0.6.161 ces 3
  derniers jours, et aucune reprise « grille » en 0.6.161.
- La règle `vinted_menus_bloom_grille` (`_shared/relance-apres-maj.js`, handler-watch toutes les 3 min) les relancera
  une fois, dès que leurs postes auront une version ≥ 0.6.150.
- Les deux postes sont éteints depuis le 28/10 au soir.

**Changé :** rien, il n'y avait rien à changer. **Reste :** que leurs ordinateurs se rallument.

## 5. Ventes Vinted d'articles « inconnus »
**Trouvé** (10 ventes du 31/10) :
- **XEWER** : une commande de 6 « Bloc mystère Diddl ». Les annonces ont été créées vers 13:05, après le dernier
  relevé de 11:02. Inconnues de FillSell.
- **MeMiniandMove** : 2 pulls Tommy Hilfiger. Annonces créées à 17:31 et 18:03, dernier relevé à 09:15. Inconnues.
- **Camille201292** : un pull « EDiva ». L'annonce était encore en brouillon aux relevés du 30/10, donc écartée de
  l'import, comme le veut la règle ; Camille l'a publiée elle-même ensuite.
  - Fiche candidate 1792749394990004 : même marque, même couleur et même prix, mais une autre taille.
  - Doute : à trancher par les photos.
- **Lohan** : une montre Seiko. Même titre qu'une fiche déjà vendue à 16:31.
  - Il s'agit d'un 2e exemplaire ou d'une remise en vente à la main.
  - Doute : à lui demander.
- Aucune des 10 annonces n'est connue de FillSell sous un autre numéro, sur tout le parc.
- **Aucune copie encore en ligne ailleurs n'a été trouvée.** Pour MeMiniandMove, Leboncoin et Beebs ne sont plus
  relevés (session fermée), donc ce n'est pas vérifiable chez elle.

Ce n'est pas un trou du rattachement par numéro : ces annonces ont été créées hors FillSell après le dernier relevé.

**Proposé, non fait** (décisions produit) :
- Demander un relevé du dressing après une vente d'article inconnu. Cela passe outre la fenêtre de 20 h.
- Faire envoyer le titre de l'article par la veille. Aujourd'hui, la vente s'intitule « Article Vinted N ».
- Montrer la question dans l'app. Aujourd'hui, une commande dont tous les articles sont inconnus ne déclenche ni push
  ni mail.

## 6. Republication « recréée » pas encore confirmée (Johan, 29/10)
**Trouvé.** Les republications 7ff873c5 et 098cab75 sont passées « published » à l'étape « recreated » les 26 et 27/10.
- Leurs nouvelles annonces (3296005486, 3296315778) n'ont été écrites que par le dépôt lui-même, et jamais revues par
  un relevé.
- Un relevé les a datées disparues, puis « Vendue ? » a été posé sur ces nouvelles annonces.
- Pourquoi les gardes n'ont pas joué :
  - la garde « republication engagée » ne couvre que pending, processing et needs_user ;
  - la règle « jamais vue en ligne = jamais Vendue ? » ne vise que les dépôts (publish).

**Changé.** Migration **20261031210000 PRÉPARÉE, NON APPLIQUÉE** : un changement de schéma demande ton feu vert nommé.
- La nouvelle fonction `republication_recreee_non_confirmee` repère une republication publiée à l'étape « recreated »,
  depuis moins de 72 h, que ni la veille ni un relevé n'a revue.
- Elle est ajoutée aux trois gardes :
  - les relevés (aucune date de disparition) ;
  - « Vendue ? » (y compris sur la nouvelle annonce du job lui-même) ;
  - le dressing Vinted.
- Au-delà de 72 h, tout reprend comme avant.
- Fonctions réécrites depuis la production. Inverse : `supabase/rollbacks/20261031210000_…_INVERSE.sql`.
- Essai à blanc (BEGIN … ROLLBACK) : elle compile, les trois gardes la portent, la production est inchangée après
  (empreinte relue).
- Coût mesuré : 7 ms par appel sur le compte le plus chargé.
- Couverture aujourd'hui : 463 republications (27 comptes ; dont Leboncoin 100, Vinted 331).

**Reste :** ton feu vert sur 20261031210000.

## 7. Achats Google Play
**Trouvé.** Les 6 « GOOGLE_NON_ACHETE » sont des abandons, au pire un paiement refusé dans la feuille Google.
- Le module Android jette le code de Google et rejette « Purchase is not purchased » pour tout refus, annulation
  comprise.
- Aucun jeton, aucune validation serveur, aucune notification Google.
- Les durées sont celles des abandons Apple (5 à 17 s).
- chaouidz a payé par Stripe pendant que la feuille Google était ouverte.

**Vrai défaut trouvé à côté : la seule réussite a été remboursée par Google.**
- BONCOIN : abonnement du 26/10 09:53, remboursé le 29/10 à 10:04, soit 72 h après. Même chose pour Malena le 28/09.
- Seul le module Android confirmait l'abonnement : en asynchrone, puis il ferme aussitôt sa connexion (lu dans
  `NativePurchasesPlugin.java`).
- Le serveur ne confirmait que les packs.

**Changé.**
- L'app classe ce cas en `abandon_ou_refus` (trace `checkout_abandon`, motif `google_non_achete`) et affiche « Achat
  non finalisé : rien n'a été débité », au lieu de « ❌ Purchase is not purchased ».
- Le serveur confirme l'abonnement après avoir écrit le droit :
  - `_shared/google-accuse-abonnement.js` ;
  - dans validate-google-purchase ;
  - et en filet dans google-play-webhook, sur chaque notification « on ».

**Reste.**
- Les 6 lignes passées gardent leur ancien nom : les réécrire est une réparation de données, qui attend ton feu vert.
- Vérifier dans la Play Console le motif du remboursement de BONCOIN (GPA.3369-1510-4339-09469).
- La cause exacte (annulation ou carte refusée) ne sera lisible qu'avec un binaire Android neuf (patch du module).

## 8. À lister et proposer, sans rien réparer
**Lignes d'anciens bugs restées en échec.**

| Ligne | Compte | Constat |
|---|---|---|
| 22362f3a, ef037533 (Beebs) | louis-seller | 404, jamais vues ; fiches en stock, en ligne ailleurs |
| abd12bb5 (Beebs) | XEWER | Fiche vendue sur eBay |
| db4c9690 (Leboncoin) | PAUGUES | Mur « Valider et payer », corrigé en 0.6.155 ; le message affiché est faux |
| 36529e5f (Leboncoin) | PAUGUES | Fiche supprimée par la personne |
| ce64ebe4 (Leboncoin) | Juliette | Refus Leboncoin probable |
| e9b398db (Leboncoin) | Jocabroc | Fiche supprimée par la personne |
| a79256da (Vinted) | linda | Taille d'identifiant 4 non résolue ; seul cas du parc ; vraie question |
| 1a323b66 (Beebs) | DeadRoz | Vraie question, posée exprès |

Règles proposées :
- **R1** (automatique, handler-watch) : fermer une publication en échec dont la fiche est supprimée ou vendue et qui
  n'a aucune annonce vivante. 30 lignes concernées aujourd'hui, aucune annonce vivante.
- **R2** : fermer « en ligne sous l'annonce … » quand une autre annonce de la fiche est vue sur la même plateforme.
- **R3** (à toi de décider) : passer en « Arrêtée » un refus prouvé de plus de 7 jours.

Défaut constaté : handler-watch fermera 1a323b66 avec « Elle n'a rien retiré », ce qui est faux (l'annonce Beebs est
retirée). Le texte n'est choisi que sur l'étape `deleted`.

**Les 7 annonces Leboncoin « disparues avant le 22/10ʼ.** Aucune n'était en ligne, aucune n'a été revue après sa date.
- Six avaient déjà été retirées par leur propre republication, mais ont été datées pendant l'étape « deleted »
  plutôt qu'à la recréation.
- La septième (xxewwer) était à l'étape « captured ».
- Seul effet : les dates de l'historique.
- Réparation proposée : mettre `disparu_le` à la date de recréation, avec sauvegarde et inverse. Bénéfice faible.

**Les « Vendue ? » de Johan (3297733232, 3297738346).**
- Ses propres remises en ligne du 29/10 ont été remplacées par celles du 30/10, et ne sont plus vues par 2 relevés.
- La fusion du 31/10 les a placées sur les fiches d'origine.
- Réponse juste : « Non, je l'ai retirée / remise en ligne ». Jamais « Oui ».
- Règle proposée : fermer seul un « Vendue ? » sans preuve quand une autre annonce de la même fiche, sur la même
  plateforme, est en ligne au dernier relevé, est apparue après, et que la quantité vaut 1. Johan a 107 « Vendue ? »
  ouverts, dont 69 dans ce cas.

## 9. Preuve Beebs
L'annonce 34270410 n'est pas sortie de vérification vers « en ligne ».
- Elle a quitté la liste « en vérification » entre 11:46 et 12:08, sans paraître dans les 6 relevés suivants (dernier
  à 15:50).
- La règle « pas encore visible » la protège d'un « Vendue ? ».
- Rien forcé.
- Des sorties de ce type sont déjà apparues 48 à 126 h plus tard : à revoir à partir du 02/11.

## Livraison (31/10 soir)
- Commits : f8430f8 (lot), 22b4230 (EXTENSION_LAST_COMMIT), f6c6bd3 (OTA 2.9.143), puis docs ; suite complète
  **507 / 0 rouge** (seconde passe sur l'état final, 20:25), lint sans erreur nouvelle sur les fichiers touchés,
  `build:essai` vert.
- **Déployées par Claude** (versions lues avant et après) :
  - get-pending-jobs v313 → **v314** (20:27:27, verify_jwt vrai, inchangé) : couleur des rayons Appareils photo et
    Téléphones portables ;
  - update-job-status v160 → **v161** (20:27:50, verify_jwt faux, inchangé) : règle « couleur hors palette ».
    Elle emporte aussi les règles du lot F déjà servies par get-pending-jobs (`etat-job.js`, `file-pause.js`).
  - Journaux après déploiement : get-pending-jobs 25 appels, tous 200 ; update-job-status 1 appel, 200.
- **REFUSÉS par le classifieur (« Production Deploy »), à lancer par Nico** (dépôt = code prêt, identique au déployé
  avant modification, relu fichier par fichier) :
  - `npx supabase functions deploy validate-google-purchase` (v13, verify_jwt vrai) ;
  - `npx supabase functions deploy google-play-webhook --no-verify-jwt` (v33, verify_jwt faux) ;
  - OTA : `npx @capgo/cli bundle upload --channel production --bundle 2.9.143 --path dist`. Le canal a été lu en
    2.9.142. Le `dist/` est déjà construit (`2026-10-31T19:26:37Z+f6c6bd3`) : ne pas le reconstruire.
- **Extension 0.6.163 PRÊTE** :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.163-A-TELEVERSER\fillsell-extension-0.6.163-cws.zip`
  - BUILD_ID `2026-10-31T19:28:46Z+f6c6bd3`, 602 485 octets, sha256 `4ffcdcf3…df8d`.
  - Elle remplace la 0.6.162, jamais servie (seul le poste de Nico l'avait). Le dossier 0.6.162 est rangé dans
    `build/anciens-zips/CWS-0.6.162-3876dc8-REMPLACE-PAR-0.6.163`.
- **Migration 20261031210000 : NON appliquée**, feu vert de Nico attendu (point 6).
- Essais réels : aucun.
  - Couleur et Google : règles serveur jouées par selftest. Aucun dépôt d'essai Vinted en « Appareils photo » ; aucun
    achat réel.
  - Leboncoin : cas non reproductible chez nous ; la vérification se fait sur le Mac d'Ornella.
  - Carte « première annonce » : le stock de Nico n'est pas vide, et jamais de connexion automatisée à fillsell.app.

## Suite (31/10, 21:56 → 22:05) — autorisations de Nico
- Nico a autorisé les trois mises en production, puis donné « Feu vert pour migration 6 ».
- validate-google-purchase v13 → **v14** (21:56:42, verify_jwt vrai) et google-play-webhook v33 → **v34** (21:56:50,
  verify_jwt faux) : versions et accès lus avant et après. Sondes sans effet : OPTIONS → 200 « ok », GET → 405.
- **OTA 2.9.143** : canal production 2.9.142 → **2.9.143** (21:57:34), avec le dist existant, sans le reconstruire.
- **Migration 20261031210000 appliquée** à 22:01:12, puis marquée « applied ».
  - Avant la pose, les empreintes des trois fonctions étaient celles d'où la migration a été écrite.
  - Après : chacune appelle la garde. Elles sont SECURITY DEFINER sous postgres. Les déclencheurs sont branchés.
  - 502 remises en ligne recréées, pas encore revues, sont protégées. Aucune erreur Postgres ; les fonctions répondent
    en 200.
- Reste à Nico : téléverser l'extension 0.6.163 (chemin ci-dessus, réparé : des échappements l'avaient abîmé).
