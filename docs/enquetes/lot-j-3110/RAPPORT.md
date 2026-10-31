# Lot J — finition (31/10/2026 soir → 01/11 nuit)

Heure de Paris partout. Aucun mail, rien chez Stripe, aucune annonce touchée à la main. Les propositions du lot I
(fermeture des anciens échecs, ventes « inconnues », « Vendue ? » de Johan) ne sont pas touchées.
Selftest du lot : `npm run selftest:lot-j-3110`. Déploiements et preuves : § « Livraison ».

## 1. Leboncoin : la pause se lève après un essai réussi (Louis)
**Trouvé.**
- louis@ttfamily.fr : l'essai prudent (relevé 3dda4151, 19:38, 407 annonces lues sur 407) a bien LEVÉ la pause à
  19:40:28 (`leve_le`) : reprise prudente jusqu'au 01/11 01:40. La clé `blocage_acces` restait là, avec la levée dedans.
- Mais pendant ces 6 h de reprise, le serveur disait encore « pause » à l'extension (`blocages.leboncoin`, état
  « reprise ») : l'extension coupait la veille des commandes, le relevé des ventes et la recherche des liens. Ses
  ventes Leboncoin n'étaient donc PAS surveillées, alors que Leboncoin avait répondu.
- Deuxième défaut, plus grave : si Leboncoin avait refusé de nouveau après la levée, la pause ne se serait JAMAIS
  remise. `platform_settings_fusionner` fusionne l'objet ; le nouveau blocage gardait `leve_le` de l'ancien → l'état
  restait « reprise », puis « libre ».
- louis-seller@ttfamily.fr (machine virtuelle) : pause toujours posée, aucun essai (son poste ne fait jamais Leboncoin).

**Changé** (règle pour tous les comptes, `_shared/blocage-leboncoin.js`) :
- essai réussi → l'extension n'est plus mise en pause (absent = libre, toutes versions) : les ventes sont de nouveau
  surveillées tout de suite ; seules les actions restent espacées (une toutes les 10 min pendant 6 h, pas de rafale) ;
- refus après la levée → la pause se remet, avec le même délai (essai 24 h plus tard) : les clés de l'ancienne levée
  sont retirées (handler-watch, update-job-status) ;
- reprise finie → la clé `blocage_acces` est rangée dans `blocage_acces_dernier` (clé présente = pause en cours) ;
- un poste en machine virtuelle ne fait jamais l'essai (il le « consommait » sans rien faire) : louis-seller garde sa
  pause tant que SON essai n'a pas réussi sur un vrai poste.

## 2. Bouton « Synchroniser »
**Trouvé.** Rosa : 6 appuis. Le serveur ne relit pas une plateforme lue il y a moins de 15 min, mais le bouton restait
actif et rien ne le disait.

**Changé** (`src/stock/boutonSynchro.js`, `src/stock/BlocSynchro.jsx`) :
- sous le bouton : « Vinted à jour il y a 3 min · Leboncoin à jour il y a 4 min » (plateformes connectées seulement) ;
- tout lu il y a moins de 15 min → bouton grisé, « Tout est à jour, prochaine synchro automatique vers 14 h » ;
- il se rouvre seul à la fin des 15 min, ou dès qu'une plateforme n'est plus à jour ou vient d'être connectée ;
- stock remis à zéro (annonces trouvées, stock vide) : jamais grisé (règle du 26/10) ;
- cadence et relevés automatiques : inchangés.

## 3. eBay : compte qui n'est pas sur eBay France (Rosa, « reginat8117 », eBay États-Unis)
**Trouvé.**
- Ses 4 premières publications eBay (19:16 → 19:54) ont été créées AVANT qu'elle relie son compte eBay (20:05:39) :
  elles partaient par l'extension (essais coupés : « The page keeping the extension port… »).
- À la liaison, le serveur les a basculées vers l'API et rangées « compte à finir » (lien ebay.fr) SANS lire le pays du
  compte (`rerouterPublicationsVersApi`). Les 14 suivantes passaient par la garde du worker : closes avec le bon message.
- L'app lisait l'état du compte eBay une seule fois au chargement : un compte relié depuis un autre onglet laissait eBay
  proposé.
- Sur tout le parc, seules ces 4 tâches étaient dans ce cas.

**Changé** :
- passage « voie extension → api » : compte hors d'eBay France → clôture « FillSell publie seulement sur eBay France… » ;
- filet à chaque passage du worker : toute attente eBay (publication, republication ; jamais en cours, jamais un retrait)
  d'un compte hors d'eBay France est close sous sa vraie raison ; le brut technique est archivé, jamais affiché ;
- app : l'état eBay est relu au retour dans l'app (au plus une fois par minute) → eBay grisé avec sa phrase.
- eBay France : inchangé.

## 4. Leboncoin : adresse refusée en republication seulement (doriane-henri)
**Trouvé — la différence.**
- Publication : l'extension tape l'adresse des Réglages « 2 rue arsene soulages 12110 viviez ». Leboncoin ne connaît
  pas cette rue : l'extension se replie sur la commune « Viviez (12110) ». Ses 22 publications du jour sont TOUTES
  passées ainsi (warning `adresse_barreau3_repli_commune`).
- Republication : son annonce d'origine est localisée à la commune. Le serveur y ajoutait la rue des Réglages (règle du
  01/10, pour les comptes où Leboncoin exige une rue). Le contrôle de l'extension AVANT tout retrait cherche alors
  « 2 rue arsene soulages 12110 Viviez » : aucune proposition → pause « Vérifie tes Réglages ».
- Donc : chez nous. La rue servie était justement celle que Leboncoin ne connaît pas.

**Changé** :
- une publication passée par la commune avec l'adresse des Réglages prouve que Leboncoin ne connaît pas la rue et
  accepte la commune → la republication tape la commune (rue servie avant : retirée, jamais remise) ;
- même adresse passée en publication → jamais « tes Réglages » : « c'est chez nous », reprise automatique espacée.

## Livraison
(à compléter)
