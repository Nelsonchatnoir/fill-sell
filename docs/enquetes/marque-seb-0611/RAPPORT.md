# La marque « SEB » — Louis (Amiral), 06/11/2026 soir (heure de Paris)

## 1. Origine de « SEB » (lecture seule, traces des dépôts)
Les traces `platform_fields.warnings` des dépôts Leboncoin de la série :
- **Pré-remplie par Leboncoin, gardée par notre règle** (rangs du matin 4, 6, 7 ; dépôt de 20:07 du rang 1, 3303702852) :
  la fiche dit « Sans marque » / « Marque générique » (relevé Beebs), le job part « Sans marque » ; Leboncoin pré-remplit
  « SEB » (lu dans la description « … yaourtière Multidélices de chez SEB ») ; la 0.6.175 le GARDE :
  « marque: pré-rempli LBC "SEB" CONSERVÉ — notre valeur "Sans marque" est un repli générique ».
- **Reprise d'une annonce existante** (rang 3, 12 adaptateurs Orange) : la fiche porte « SEB »
  (`attributs.marque` source `releve_leboncoin`, 20/09 : lue sur son annonce Leboncoin d'origine) ; le job part « SEB ».
- **Posée par Louis lui-même** : aucun cas (aucune marque de source « manuel » dans tout le périmètre mesuré).
- Les 2 inserts Zombicide refusés le matin partaient « Sans marque » (« posée par son identifiant Leboncoin ») : leur
  refus n'est PAS expliqué par la marque.
- Autres comptes : même produit sur un second compte de Louis (447d920c, 1 annonce Beebs « Seb »). Ailleurs : voir § 3.

## 2. Corrigé (pour tous les comptes, toutes les plateformes)
- Règle `_shared/marque-compatible.js` (détail : `docs/regles/plateformes.md` § 06/11 soir) : marque citée seulement
  « pour / compatible / adapté / s'adapte / de votre… » → « Sans marque » ; vrai produit de marque → gardée.
- `get-pending-jobs` v345 : chaque tâche servie à l'extension (publication, republication, lot, remise en vente),
  marque et caractéristique eBay « Marque » ; trace `marque_compatible_retiree` (avec `par_le_vendeur`).
- `ebay-api-worker` : même règle à la prise (voie API) — commitée, PAS déployée (refus du classifieur ; 2 annonces eBay API concernées dans le parc, aucune de Louis).
- Extension **0.6.176** (Leboncoin) : le pré-rempli de compatibilité n'est plus jamais gardé (la 0.6.175 le garde quoi que
  le serveur envoie : impossible de corriger Leboncoin sans nouvelle version).
- Selftest `marque-compatible` (accessoire compatible → aucune marque ; vrai produit → gardée ; branchements ; copie
  identique dans l'extension).
- **Pas fait ce soir, à décider** :
  - la ligne « À régler » quand la personne a écrit elle-même la marque d'un accessoire compatible : 0 cas aujourd'hui ;
    la trace serveur `par_le_vendeur` est prête ; l'écran demande une version de l'app (OTA) ;
  - le statut (point 4) : « jamais published tant que pas vu en ligne » change le sens de « published » pour tout le
    parc (déclencheurs de vente, de retrait, de republication, écrans) — trop large pour un soir. En place : la série
    n'avance qu'une fois le dépôt VU en ligne ; la règle B ferme un dépôt jamais paru. Proposition : un état
    « en vérification » (platform_fields) posé au dépôt Leboncoin et levé par le premier relevé qui le voit, lu par
    l'app et par la série ; un refus lu (page désactivée hors de la fenêtre de modération, règle B) le ferme et arrête
    la série.

## 3. Le parc (06/11 21:00)
- **94 annonces** en ligne (90) ou en file (4) portent une marque que leur texte ne cite que comme compatibilité,
  **7 comptes** : Louis 83 (Amiral) + 1 (second compte) — SEB, Multidélices ; puis 4 « Accessoires » (robes de poupée),
  2 Waeco (sonde « pour glacière Waeco »), 2 Lego (« compatible avec les briques Lego »), 1 Forestier, 1 Neff
  (« ensemble cuisson vapeur pour four marque Neff » : cas limite, la règle de Nico s'applique).
- Écartés après relecture (vrais produits) : tondeuse « pour chiens Moser », 2 jeux Nintendo (Zelda, Smash Bros.).
- **Refus de modération Leboncoin notés depuis le 25/10 : 8 dépôts** (Louis 7, un autre compte 1) ; **5 avec cette
  cause** (Louis). Les 76 dépôts « jamais vus » que la règle B ne sait pas trancher ne sont pas comptés.
- Rien modifié sur les annonces en ligne (elles changent à leur prochaine republication, par la règle).

## 4. La série de Louis
- 3303702852 (rang 1) : modifiée par Louis (sans SEB), acceptée selon son mail de 20:40 ; **pas encore vue** par les
  relevés de 20:55 à 21:12 (toujours en modération ?). La série attend de la voir en ligne ; le job est déjà « published ».
- ⚠ **Défaut de mon code, corrigé à 21:13** : la v344 redemandait un relevé « Mes annonces » à chaque passage de son
  extension (~toutes les 2 min : 10 relevés « Mes annonces » de 400 annonces de 20:55 à 21:12, au lieu d'un) — les vieux relevés sans
  `queued_at` passaient en tête du tri. v345 : au plus un relevé toutes les 45 min tant qu'un dépôt attend.
- Nouvel ordre (21:15) : rangs 2-7 (rangements et adaptateurs SEB) attendent l'extension 0.6.176 chez Louis ; rangs 8-9
  (Zombicide) en dernier. Au moins 60 min entre deux dépôts, chacun vu en ligne avant le suivant, arrêt au premier refus.

## 5. Suite du 06/11 ~22:10 (retour de Nico)
- `ebay-api-worker` **v115** déployé à 22:07 sur ordre explicite (`--no-verify-jwt`, avant v114) ; il refuse un appel sans
  secret (401, vérifié).
- Ligne « À régler » (marque écrite par la personne, retirée à la publication) : `src/utils/marqueRetireeVendeur.js` +
  `StockTab` (une ligne par article, ouvre sa fiche, disparaît quand la fiche ne porte plus la marque) — pour l'OTA
  ≥ 2.9.164, non publiée (le web la reçoit au push, comme tout `src/`). 0 cas aujourd'hui.

## 6. Les 2 inserts Zombicide refusés le 06/11 au matin (lecture seule)
- Identiques à l'octet d'un dépôt à l'autre, refusés comme acceptés : titre, description (empreintes md5), prix (10 € /
  8 €), mêmes 4 fichiers photo, rayon « Loisirs › Jeux & Jouets », état, matière, âge, type de jouet, adresse (Oignies).
- Acceptés avant : 19/09, 06/10 (premières publications) et 02/10, 18-19/10, 28/10, 30/10 (REPUBLICATIONS : l'ancienne
  annonce retirée AVANT le dépôt). Refusés le 06/11 : des REMISES EN VENTE déposées pendant que l'annonce vendue,
  IDENTIQUE (mêmes titre, description, prix, photos — vérifié), était encore ACTIVE sur le compte : 3298021777 et
  3297234692, « active », transaction « pending » au relevé de 19:09, toujours au relevé de 22:01.
- Seules autres différences : la marque posée explicitement « Sans marque » (identifiant `no_brand`, absente des traces
  d'avant) ; la couleur « Jaune » ajoutée sur le jaune ; 4 photos au lieu de 3 sur le dépôt jaune du 30/10.
- ⚠ Les remises d'octobre citées comme passées « alors que l'annonce vendue était encore visible » sont en fait parties
  APRÈS sa disparition du relevé : 06/10 vendue disparue 08:48 → remise 17:05 ; 08/10 08:59 → 09/10 22:50 ; 10/10 08:33 →
  11:35 (mêmes titre, description et photos que la vendue). Aucune remise acceptée n'a été déposée pendant que
  l'annonce vendue identique était active.
- Conséquence pour la série : ses remises « SEB » ont, elles aussi, leur annonce vendue identique encore active. La série
  ne va au rang 2 que si 3303702852 (rang 1, modifiée par Louis) est VUE en ligne : pas vue au relevé de 22:01 ; si elle
  ne paraît pas, rien d'autre ne part. La règle A retirée ce soir retenait exactement ce cas, pour tous les comptes.
