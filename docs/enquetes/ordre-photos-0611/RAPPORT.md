# L'ordre des photos — the_closet72 (Pro), signalement du 06/11/2026 à 18:29 (heure de Paris)

## 1. Constat, relu en base et dans les journaux PostgREST

- Compte 8ac5bbda (thecloset72000), Android, OTA 2.9.162, extension 0.6.175. Articles :
  - Lee noir 1793979746421 : créé 16:42 (scan Lens), **publié 16:50:59** sur 5 plateformes ;
  - Wrangler W32 1793980565627 : créé 16:55, **publié 17:05:26** sur 5 plateformes.
- Les 10 jobs portent les photos dans l'ordre de prise de vue (0, 1, 2…), sans choix par plateforme (`photos_choisies`
  absent).
- **La fiche enregistrée AU CLIC « Publier »** (`fiches_annonce`, mise à jour à 16:50:59 et 17:05:27) porte `photos` ET
  `processedPhotos` dans l'ordre 0, 1, 2… : à l'instant de publier, l'écran de publication n'avait jamais vu d'autre
  ordre. `spend_coins_and_publish` a donc réécrit `inventaire.photos` dans cet ordre-là, comme prévu.
- L'ordre choisi (5, 0, 4, 8, 14, 11… ; 3, 0, 11, 13, 12…) a été posé **APRÈS** la publication, dans
  **Stock › Modifier l'article** : `PATCH inventaire … select=id` de `handleEditSave` à **17:21:44** (Lee) et
  **17:35:40** (Wrangler). Signature : entrées déplacées avec leur `type` d'origine (`photo_5` en couverture) — le
  geste du Stock ; l'écran de publication, lui, retire ce `type` positionnel.
- L'extension n'est pas en cause : Vinted, Leboncoin, Beebs, Depop et eBay (extension comme API) envoient
  `job.photos` dans l'ordre (téléchargements en parallèle, ordre gardé par index ; audit de code du 06/11).

## 2. La cause

Entre l'article et ce qui part en ligne, l'ordre ne voyageait que dans UN sens, au clic « Publier ». Une fois
l'article publié, **rien ne portait plus un ordre changé sur l'article** :
1. **Republication** (`spend_coins_and_republish`, plateformes autres que Vinted) : les photos de l'**ancien job**
   d'abord, la fiche seulement en repli. Preuve en prod : Alizee, Leboncoin republiée le 10/10 à 16:56 dans l'ordre
   d'avant (couverture fausse) alors que l'article avait été réordonné à 16:48.
2. **Remise en vente après vente** (`remises_en_vente_tick`) : pareil, le job vendu d'abord.
3. **Republication « avec toutes tes photos »** de Leboncoin (`republier-photos-lbc`) : la liste du job d'abord.
4. **Tâches pas encore parties** (publication programmée, en attente du poste, échouée à relancer) : l'ordre de leur
   création.
5. **Annonces déjà en ligne** : rien ne les remet dans l'ordre (c'est le cas de the_closet72 : point 5 ci-dessous).

## 3. Ce qui est corrigé (règle pour tous les comptes)

Règle (`supabase/functions/_shared/ordre-photos.js`, jumeau SQL exact `public.photos_ordre_article`) :
l'ordre de l'article fait foi ; un ordre choisi pour une plateforme le remplace pour elle ; un dépôt plafonné
(quota gratuit Leboncoin) garde les N premières de l'article ; sinon le job garde SES photos (rien d'ajouté, rien de
retiré) remises dans l'ordre de l'article ; le moindre doute (photo du job absente de l'article, doublon, URL
illisible) → le job tel quel. Toute erreur interne de la règle SQL rend le job tel quel (jamais une republication
refusée pour l'ordre).

- **Migration `20261106230000_ordre_photos_article.sql`** — **APPLIQUÉE le 06/11 à 19:39** (feu vert de Nico, après la
  suite complète 603/603 verte ; `republier-photos-lbc` v8 à 19:40) :
  la règle ; `spend_coins_and_republish` et `remises_en_vente_tick` = définitions de prod du 06/11 (fixtures
  `scripts/fixtures/ordre-photos/`), une insertion chacune ; déclencheur `inventaire_ordre_photos_vers_taches`
  (l'ordre changé sur l'article passe aux tâches pending / needs_user / failed de cet article ; jamais processing,
  jamais une annonce en ligne, jamais un choix par plateforme, aucune ligne inchangée réécrite ; une requête
  indexée par changement de photos).
- **`republier-photos-lbc`** : la ligne de republication passe par la même règle (`_shared/photos-lbc-amputees.js`).
- **Aucune OTA, aucune extension** : publication, lot et envoi respectaient déjà l'ordre (verrouillé ci-dessous).
- **Selftest `selftest:ordre-photos`** (dans la suite) : règle JS ; `construireJobs` (écran ET lot) sur les 5
  plateformes, choix par plateforme, plafond Leboncoin ; limites Vinted 20 / Depop 8 ; republication Leboncoin ;
  migration = définitions de prod à l'insertion près ; sur un Postgres jetable (embedded-postgres) : règle SQL = règle
  JS sur 1 120 cas, déclencheur (7 situations), les deux insertions de prod exécutées avec leurs vraies variables.
  Une mutation de la règle le fait virer au rouge (7 KO, vérifié).
- `selftest:remise-en-vente-chemins` (signalé rouge par le terminal Cloud) : il accepte désormais 20261106230000 comme
  dernière définition de `remises_en_vente_tick`, SEULEMENT si son corps est celui de 20261105170000 au seul
  remplacement près de l'expression des photos (toute autre modification : rouge, vérifié).

Repéré, non observé en base, non touché : à la réouverture de l'écran de publication, les photos de l'hôte (Stock ou
Lens) priment sur celles de la fiche enregistrée (`appliquerFiche`) ; un ordre changé dans l'écran puis fermé SANS
publier serait repris dans l'ordre de l'article. Sans date sur l'ordre de l'article, impossible de trancher qui est
le plus récent : à décider (écrire l'ordre de l'écran sur l'article dès le geste).

## 4. Le parc (relu le 06/11 vers 18:50)

Annonces en ligne (job publié, non vendu) dont les photos communes avec l'article sont dans un autre ordre :
- **the_closet72, 06/11 : 10** (Lee + Wrangler × 5 plateformes) — réordonnées dans le Stock après publication ;
  remises dans l'ordre par la personne elle-même sur les plateformes (consigne de Nico, 18:41) : **on n'y touche pas**.
- **the_closet72, 31/10 → 02/11 : 18** et **Nico, 30/10 → 05/11 : 4** — ordre CHOISI par plateforme
  (`photos_choisies`) : c'est le choix de la personne, pas un défaut.
- **Vrais écarts restants : 10 annonces, 3 comptes** :
  - DeadRoz : 8 (Beebs × 4, Leboncoin × 4, publiées 14 → 20/10), couverture correcte, ordre intérieur différent
    (article réordonné ensuite par une publication Depop — vérifié sur 1791926965462004, Depop le 19/10 à 19:02) ;
  - Alizee : 1 (Leboncoin, republiée le 10/10), **couverture fausse** (défaut de la republication, corrigé ici) ;
  - Ornella (compte de test) : 1 (eBay, 10/09), couverture fausse (Stock après publication).
- Tâches pas encore parties avec un ordre périmé : **0 sur 949**.
- Historique (tous statuts, annulés compris) : 81 jobs depuis le 08/08, 5 comptes ; hors choix par plateforme :
  49 jobs, 4 comptes.

## 5. Proposition de remise en ordre (rien exécuté — feu vert de Nico)

Promesse faite à the_closet72 : remise en ordre par l'app, sans quota, sur place quand la plateforme le permet. Elle
a déjà corrigé ses annonces : la règle « lire d'abord » ci-dessous les laisse intactes.

**Règle pour tous, avant toute remise en ordre automatique** : lire l'ordre RÉELLEMENT en ligne (relecture fraîche de
l'annonce), le traduire en photos de l'article par les empreintes d'image (`photo_empreintes`, dHash/pHash, robustes au
ré-hébergement entre plateformes), puis :
- en ligne = ordre de l'article → rien ;
- en ligne = ordre de NOTRE dépôt (job) ≠ article → remise en ordre ;
- en ligne ≠ dépôt et ≠ article → la personne l'a changée sur la plateforme → **on n'y touche pas** ;
- correspondance incomplète ou ambiguë → rien (le doute devient une question).
Une annonce à la fois, à la cadence de la file, hors quota (`hors_quota`, 0 pièce), jamais de mail.

Par plateforme :
- **eBay (voie API)** : modification SUR PLACE déjà en service (`ebay-account › lire_annonce / modifier_annonce`,
  mêmes numéro, vues et favoris), gratuite chez eBay. Coût : 2 appels eBay par annonce, aucune version d'extension.
  Prêt dès le feu vert (Ornella 1).
- **Vinted** : modification sur place possible (formulaire d'édition de l'annonce : mêmes numéro, favoris, vues),
  mais l'extension ne sait pas encore le faire : un geste neuf (photos de l'annonce réordonnées, rien d'autre) =
  **nouvelle version d'extension (CWS)**. À décider : la règle actuelle n'appelle l'édition Vinted que sur geste humain,
  à l'unité. Aucune annonce Vinted dans les écarts restants.
- **Leboncoin, Beebs, Depop** : la modification sur place existe chez chacune (Leboncoin : modification gratuite,
  repasse en modération quelques minutes ; Depop : édition du produit ; Beebs : édition de l'annonce), mais aucun geste
  d'extension ne la fait aujourd'hui : **nouvelle version d'extension**, une plateforme à la fois. Repli si refusé :
  republication hors quota (retrait puis recréation), qui fait perdre favoris, vues et ancienneté — à n'employer que
  pour une couverture fausse (Alizee 1), jamais pour l'ordre intérieur seul (DeadRoz 8).
- Ordre proposé : (1) eBay sur place ; (2) Leboncoin sur place (Alizee, DeadRoz) ; (3) Beebs ; (4) Depop, Vinted
  pour l'avenir.

## 6. Exécution (06/11 soir, feux verts de Nico)
- Suite complète 603/603 verte (par morceaux) ; migration appliquée 19:39 ; republier-photos-lbc v8 ; poussé 3e7ec79.
- **eBay, sur place** : fonction `remise-ordre-photos-ebay` v1 (rôle de service seulement, refuse une clé client : 403
  vérifié) ; le périmètre est recalculé à chaque passage (hors the_closet72, hors choix pour eBay). Simulation : 1 annonce
  (Ornella, 307172283859), en ligne = ordre de notre dépôt → remise dans l'ordre de l'article à 20:07 (« photos »).
  Relecture : périmètre vide. À vérifier au prochain check : couverture eBay = photo `_1`.
- **Leboncoin : PAS lancé.** Périmètre : Alizee 1 (3285834507, couverture fausse), DeadRoz 4 (couverture juste, ordre
  intérieur). Aucun geste d'extension ne sait modifier une annonce Leboncoin sur place aujourd'hui : il faut une nouvelle
  version (lecture de l'ordre en ligne par les empreintes, modification de l'ordre seul, vérification), essayée sur une
  annonce de test de Nico ≥ 999 €, puis la mise à jour de l'extension chez Alizee et DeadRoz.
- Beebs (DeadRoz 4), Vinted, Depop : non touchés (Beebs : aucun chemin sur place ; Vinted, Depop : aucune annonce dans
  les écarts restants).
