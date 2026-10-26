# Session du 26/10 (après-midi) — urgences, synchro, refonte du lot (maquettes), demandes de XEWER

Prompt de Nico du 26/10 (≈ 12:10). Ordre imposé : maquettes du bloc C montrées d'abord (aucun code C avant sa
validation), puis bloc A (urgences), bloc B (synchro) ; bloc C et D après validation. Heures de Paris.

## Résumé

| Point | État | Preuve |
|---|---|---|
| C — maquettes | publiées 12:22, **attente de la validation de Nico** | https://claude.ai/artifact/6A6aDWcZqXUZFVXhDMrFtS |
| A1 Elodie82 (Celine) | cause prouvée, règle corrigée, lien réparé 12:34 ; retrait au prochain passage de son ordinateur | § A1 |
| A2 retraits Beebs | cause prouvée (anti-robot), lecture par la page (0.6.147) ; les 11 annonces ne sont pas achetables | § A2 |
| A3 Ritthik (LG) | cause prouvée (vue acheteur = pas connecté), règle corrigée | § A3 |
| A4 canal coupé | règle corrigée (0.6.147) ; la sculpture de Jocabroc est publiée (11:39) | § A4 |
| B1 réimport | essai annulé : Leboncoin/eBay/Depop OK, Beebs retenu par la dette → migration PRÉPARÉE | § B1 |
| B2 « inconnu » exclu | app + extension corrigées | § B2 |
| B3 cadence stock vide | app + extension ; serveur dans la migration PRÉPARÉE | § B3 |
| B4 « terminé » trop tôt | app corrigée | § B4 |
| B5 doublon de Louis | analysé, règle proposée, **non codée** | § B5 |
| Johan (201 republications) | rythme conforme à la cadence, aucun frein anormal | § Surveillance |

⛔ Non fait par refus de l'outil : `functions deploy get-pending-jobs` (refusé par le classifieur « Production
Deploy », comme le 26/10 matin). update-job-status et handler-watch attendent avec lui (lignes en fin de rapport).

## A1 — Elodie82 : portefeuille Celine vendu sur Vinted, copie Leboncoin en ligne

- **Cassé** : retrait 35873583 (26/10 10:53) arrêté « l'annonce 3295261130 s'intitule « 404 » — listing_url douteux ».
- **Cause (prouvée dans un vrai navigateur, 12:25)** : le lien du retrait était `https://www.leboncoin.fr/ad/3295261130`
  (lu dans le relevé du compte). Leboncoin redirige `/ad/<id>` vers `/ad/ad/<id>` : une page 404. Même chose pour
  `/ad/x/<id>` (forme posée par l'extension au « dépôt payé »). `/ad/vetements/3295261130` et
  `/ad/accessoires_bagagerie/3295261130` ouvrent l'annonce (« Portefeuille Celine cuir noir texturé ») ; contrôle sur
  une seconde annonce d'un autre rayon : `/ad/vetements/3295273889` sert les baskets (canonique `/ad/chaussures/…`).
  L'extension FABRIQUAIT `/ad/<id>` dans son relevé quand l'API ne rendait pas d'URL (annonce en vérification).
- **Règle corrigée** : `_shared/annonce-lien.ts` — forme observée `/ad/<rayon réel>/<id>` (`lienOuvrable`,
  `lienDepuisId` Leboncoin) ; get-pending-jobs réécrit un lien Leboncoin qui ne s'ouvre pas avant de servir un retrait
  (compare-and-swap sur pending et le lien lu, trace `lien_reecrit`) ; extension 0.6.147 : `lienLeboncoinOuvrable`
  (retrait, dépôt payé), relevé sans `/ad/<id>`, lecture d'état de `/ad/x|ad/<id>` sous `/vi/<id>.htm`, page 404 =
  « introuvable à ce lien » (plus « s'intitule 404 »), `depot-coupe-tranche` ne recopie plus un lien de relevé faux.
- **Données** : `scripts/reparations/20261026_liens_leboncoin_404.sql` appliqué à 12:34 (essai à blanc d'abord) :
  6 jobs vivants (le retrait d'Elodie + 5 dépôts publiés) et 17 annonces de relevé → `/ad/vetements/<id>`.
  Sauvegardes `_backup_2610_liens_lbc_jobs`, `_backup_2610_liens_lbc_annonces` ; inverse à côté.
- **Reste** : le retrait part au prochain passage de l'ordinateur d'Elodie (vu pour la dernière fois à 11:17 ; son
  extension 0.6.144 ouvre le lien réparé tel quel). Aucun geste à la main sur son annonce.

## A2 — Retraits Beebs « Page de l'annonce sans bouton Supprimer, Mes annonces illisible »

- **Constat 12:55** : les 11 annonces visées (Sébastien 34219819, DeadRoz 34083555, the_closet72 ×8, Louis 34200505)
  rendent HTTP 404 ET sont absentes de l'index public Beebs (contrôle : l'annonce TEST de Nico 34132220 y est). Aucune
  n'est achetable : pas de double vente en cours. Mais « page 404 » ne prouve pas le retrait (une annonce en
  vérification rend aussi 404) : la preuve exige « Mes annonces » lue en entier.
- **Cause (prouvée)** : depuis le 26/10 **01:55**, la vérification anti-robot de Beebs (DataDome) répond 403 aux
  lectures de « Mes annonces » faites par fetch depuis l'onglet de travail : 19 dépôts Beebs sur 24 le 26/10, **0 sur
  735** du 14 au 25/10 (champ `preuve_identifiant_beebs` des dépôts). Les retraits ne pouvaient plus rien prouver et
  tournaient (« illisible en entier », 4 essais, reprise). Effet de bord : les dépôts n'ont plus de numéro, et la
  « dette Beebs » bloque tout import Beebs du compte (cf. B1).
- **Corrigé (0.6.147)** : quand la lecture par fetch est refusée, la MÊME page est chargée dans un cadre de même
  origine et lue par la MÊME fonction (mêmes clés, même compteur, même refus au moindre écart). Vérifié en vrai sur le
  compte de Nico : « en vérification » 1 clé / 1 carte (Medik8 33640171), « en ligne » 13 / compteur 13 — identique.
- **Reste** : effet seulement chez les postes en 0.6.147. DeadRoz : annonce en vérification depuis le 01/10 (règle du
  25/10 : message daté, aucun geste possible chez Beebs). Constats « 404 » rarement gardés sur le job (1 retrait Beebs
  sur 165) : piste notée, non traitée aujourd'hui.

## A3 — Ritthik 2003 : lecteur DVD LG, « Contrôle Supprimer introuvable »

- **Cause (prouvée)** : diagnostic du job : actions de la page « RiseFit · 38 annonces · Acheter · Faire une offre ·
  Contacter », « Gérer » absent = la VUE ACHETEUR. Son Chrome n'est pas connecté au compte Leboncoin qui a publié
  l'annonce : aucun relevé Leboncoin de ce compte depuis le 18/09, `extension_sessions.leboncoin` nul. Annonce lue en
  ligne à 13:00 (25 €, vendeur RiseFit).
- **Corrigé** : `_shared/lbc-vue-visiteur.js` + update-job-status (postes d'avant la 0.6.147) : pending, aucune
  tentative consommée, sonde espacée (échelle de l'extension), phrase vraie « En attente de ta connexion à
  Leboncoin… connecte-toi au compte Leboncoin qui l'a publiée » ; 0.6.147 : le handler le dit lui-même
  (« Connexion Leboncoin requise », traité en attente de session par le background).
- **Reste** : déploiement d'update-job-status (refusé à l'outil) ; le geste est chez Ritthik (se connecter).

## A4 — « A listener indicated an asynchronous response… message channel closed »

- **Cassé** : la page est rechargée/remplacée pendant que son script travaille. 2 080 publications Vinted portent ce
  message dans leur historique en 7 jours, toutes reparties ; le job repartait ~17 min plus tard en brûlant une
  tentative, l'exception Chrome affichée. Jocabroc (sculpture, Leboncoin) : publié à 11:39 (3295635307). La Fleur de
  Lotus (eBay) : aujourd'hui un autre mur (« compte eBay pas prêt pour vendre »).
- **Corrigé (0.6.147)** : publication en canal coupé : Leboncoin — l'adsubmit tranche avant toute reprise (2xx +
  numéro = publié, jamais un second dépôt ; parti sans réponse lisible = needs_user « vérifie tes annonces », même règle
  qu'eBay) ; sinon reprise rapide (2 min) sans tentative consommée, deux fois au plus, phrase vraie ; au-delà, le recul
  ordinaire. Vinted (redirection de succès) et eBay (sonde) passent toujours avant.

## B1 — Après « Réinitialiser », les annonces connues ne sont pas réimportées

- **Mesuré** : la passe du rapprochement de 10:37:40 n'a lu que 20 nœuds (15 fiches Vinted, 5 annonces) alors que
  37 annonces avaient été relues à 10:34-10:36 ; le compte a été vidé trois fois à la main depuis (lignes d'annonces
  et de relevés supprimées) : l'état de 10:37 n'est pas reconstructible.
- **Reproduit sur la règle (essai ANNULÉ, ROLLBACK)** : « Réinitialiser » sur le compte de Nico → les 37 annonces
  restent, sans fiche, toutes lues par le moteur ; Leboncoin, eBay et Depop se réimportent ; **Beebs : 0**, retenu par
  `releve_dette_beebs` (un dépôt Beebs sans numéro — cf. A2 — bloque TOUT import Beebs du compte).
- **Corrigé, en migration PRÉPARÉE** (`supabase/migrations/PROPOSITION_20261026150000_synchro_stock_vide_dette_beebs.sql.txt`,
  inverse dans `supabase/rollbacks/`, garde md5 des corps de prod) : la dette ne retient plus que les annonces apparues
  APRÈS le dépôt sans numéro (10 min de marge) — une annonce vue avant ne peut pas être lui. Essai annulé avec la
  migration : 10 annonces Beebs en ligne sur 10 réimportées, celle « en vérification » non.
- **Reste** : ⛔ feu vert nommé de Nico pour appliquer.

## B2 — Une plateforme « inconnue » exclue de la synchro

- **Cause** : `ciblesReleve` garde les plateformes choisies, connectées (sonde fraîche) ou avec des annonces en base ;
  la sonde de 10:44 a remis Leboncoin et Beebs à null sur un 403 ; le stock vidé n'avait plus leurs annonces.
- **Corrigé** : app — un relevé passé qui a LU des annonces vaut « déjà relevée » ; extension 0.6.147 — une plateforme
  sondée mais muette (403, réseau) garde sa valeur connue AVEC SA DATE (les lecteurs jugent la fraîcheur), l'heure de
  la sonde muette notée à part (`sonde_muette`). Seul un « déconnecté » prouvé ou une plateforme jamais utilisée
  (règle de Laura, 06/10) restent dehors.

## B3 — Cadence anti-rafale sur stock vide

- **Corrigé** : app (`source = 'stock_empty'` : l'appui lance la synchro), extension (`stockVideCadence` sur les deux
  cadences manuelles) ; serveur (`demander_sync_dressing`, `demander_sync_plateforme`) dans la migration préparée.

## B4 — « Rapprochement : terminé » pendant que 4 relevés sur 5 attendent

- **Corrigé** (app) : la ligne ne dit « fini » qu'une fois tous les relevés de la vague arrivés (ni en file, ni en cours).

## B5 — Doublon de Louis (licorne dans les nuages)

- Fiche 1789898228018 (Leboncoin 3294964243, 10 €, « Jeu coopératif licorne dans les nuages », marque « Autre ») et
  fiche 1792340705460677 (Beebs ×2 + Opla, 6 €, Haba). Même jeu, **photos différentes** (planche comparée) : moteur v3
  sur les vraies empreintes → `rien` (meilleure photo à 16 > 12 ; titre jac 0,5 / cont 0,75 / 3 mots communs).
  Les deux fiches existaient : en mode normal, la passe ne compare jamais deux fiches déjà rangées. L'IA est éteinte
  chez Louis (« Non, deux exemplaires » déjà répondu) — avec raison : il duplique ses articles.
- **Proposé, non codé** : une QUESTION (jamais une fusion) quand deux fiches de plateformes différentes ont le même
  objet nommé (marque connue d'un côté, nom de produit distinctif ≥ 3 mots communs, containment ≥ 0,75), photos
  « proches » (≤ 18) et aucun conflit. À mesurer sur le parc (nombre de questions nouvelles) avant de l'ouvrir.

## Surveillance — Johan (tiblancdeshaut, 0.6.131 → 0.6.144)

- 182 republications créées 10:16-10:24 (manuelles, pas planifiées). À 13:20 : 15 faites (≈ 4 à 10 par heure),
  166 en attente (Leboncoin 59, Vinted 51, Depop 29, Beebs 27), 0 échec. Rythme conforme à la cadence (un geste à la
  fois, suppression puis recréation) : aucun frein anormal. À ce rythme, il faut son ordinateur allumé environ un jour.

## Lignes pour Nico (déploiements refusés à l'outil)

```
npx supabase functions deploy get-pending-jobs
npx supabase functions deploy update-job-status --no-verify-jwt
npx supabase functions deploy handler-watch --no-verify-jwt
```
Avant (relu 13:12) : get-pending-jobs v293 true, update-job-status v152 false, handler-watch v134 false.
