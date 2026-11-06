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
