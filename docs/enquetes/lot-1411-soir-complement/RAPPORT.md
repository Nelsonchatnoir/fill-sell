# Complément du 14/11 soir — points A et B (heure de Paris)

Aucun mail, rien chez Stripe, aucune annonce de client modifiée.

## A. Lecture de la description d'origine abandonnée trop tôt

**Cas (13e274de, fiche 1794681831450000, Android, lecteur « poste » = copie Cloud)** : « Publier » 20:05:56.999
(`lecture_origine_en_attente`) → la copie Cloud lit la page Vinted : `lecture_fond` OK à 20:06:02.392 (1 425 ms,
description: true) → écran fermé à 20:06:02.493 (`recuperation_description` issue « abandon », état « envoyee ») → aucune
publication. L'écran relit la base toutes les 6 s : il n'avait pas encore vu la lecture.

**Les 60 cas (30 jours, 32 comptes)** :
- lecteur : extension de l'appareil 14, poste du compte (ordinateur ou Cloud) 14, inconnu (builds d'avant la trace) 21,
  aucun lecteur 11 ;
- plateforme d'origine : Vinted ; appareil : Android, web, iPhone ;
- durée : 32 fermés en moins de 10 s ;
- issue : 33 suivis d'une lecture RÉUSSIE (dont 6 réussies AVANT la fermeture) ; 31 sans aucune publication dans les 24 h.

**Cause réelle** : seule la fin d'attente vue par l'écran (`onPret`) ouvrait le stepper. « Fermer (la lecture continue) »
laissait bien la lecture se faire, mais rien ne reprenait la publication quand elle aboutissait : la lecture réussie
était perdue. Le cas normal (lu pendant que l'écran est ouvert) n'avait aucun défaut.

**Ce qui change (app, tous les comptes, Cloud ou extension)** :
- fermer PENDANT la lecture (un lecteur, ni conclusion ni échec) garde la publication : trace « gardee » au lieu
  d'« abandon » ;
- le Stock relit la fiche (relecture bornée : toutes les 3 s, 5 min au plus) ;
- description **réellement en base** → le stepper s'ouvre avec elle (« … ta publication reprend ») ;
- lue sans texte → l'écran revient avec ses choix ;
- un autre écran de publication ouvert → la reprise attend qu'il se ferme ;
- rien en 5 min → message clair et trace `lecture_origine_non_aboutie` ;
- « Publier » de nouveau sur la fiche annule la reprise automatique.
- Inchangés : l'écran lui-même (lecture immédiate puis toutes les 6 s), `lecture_origine_en_attente`,
  `lecture_origine_sans_lecteur`, l'abandon sans lecteur, pendant une saisie, après un échec ou une conclusion.
- Jamais de publication sans description : le stepper ne s'ouvre qu'avec une description lue en base.

Verrou `selftest:lecture-origine-gardee` (25 ; rouge sur le code d'avant : 3/25).

## B. Catégorie eBay par mot : « caméra » rangée en Animalerie

**Cas (compte e5be98ba, job 86f5cd5f, « Caméra Q18 Pro »)** : mot-objet « caméra » (IA) → la seule feuille eBay exacte,
« Animalerie › Caméras » (259318), prise avec certitude. La règle du 10/10 (`vetoBrancheSpecialisee`) ne visait que les
feuilles qui nomment un vêtement. Dans l'arbre relevé (3 913 feuilles), « caméra » vit sous 4 racines.

**Ce qui change (eBay seulement)** : `vetoMotAmbiguSpecialise` (`src/utils/brancheSpecialiseeEbay.js`).
- Condition : une feuille d'une branche spécialisée (sport, auto-moto, bricolage, animalerie, collections), atteinte par
  un mot AMBIGU (présent sous au moins deux racines).
- Écartée quand l'OBJET la contredit (son icône mène à une autre racine eBay) et que ni le titre, ni la description, ni
  le mot ne nomment la spécialité ; eBay prend alors le chemin de l'icône.
- Appliquée aux trois points : la certitude du mot, le choix de l'IA, le chemin final.
- Une icône sans rayon eBay ne contredit rien. Un animal nommé (« chien », « chat »…) prouve « Animalerie ».

**Mesuré sur les 300 tâches eBay réelles (60 jours) rangées par le mot en branche spécialisée** : 8 écartées.
- La caméra.
- 5 classeurs Pokémon rangés en « Bricolage › Boîtes à outils ».
- Un autocollant Panini rangé en « Pins ».
- Un écusson motard rangé en « Collections » sous l'icône 🪖.
- Aucun autre rayon ne change : cartes à l'unité, écussons sous 📦 / 🚗, sacs à crottes, skis…

Garde-fou `categorie_a_confirmer` du serveur : inchangé. T-shirt Goldman : inchangé (rayon de mode, hors branche
spécialisée). Autres plateformes : inchangées.

Verrou `selftest:ebay-mot-ambigu` (17 ; rouge avant : 3/17).

**Le job de Clément (e5be98ba)** : déjà PUBLIÉ avant ce correctif, le 14/11 à 20:10:20 (annonce 800917061673). Après sa relance de
20:08:55, la règle « relance sans changement = proposition d'eBay » a fait choisir à l'IA, parmi les suggestions d'eBay,
« Informatique, réseaux › … › Portables : pièces de rechange › Autres » (168061). Il est passé par le mécanisme normal,
mais dans un rayon qui n'est pas bon non plus. Avec la règle, sa catégorie de départ aurait été celle de l'objet :
« Photo, caméscopes › Appareils photo numériques » (31388). Le changer sur l'annonce en ligne = modifier l'annonce
d'un client : décision de Nico.

**Lens HTTP 429 `identify_unavailable` (20:02)** : notre limite normale. Le budget IA « confort » est de 9 $ par jour
(`_shared/budget-ia.ts`, règle du 18/10) ; la dépense Anthropic du 14/11 est de 10,18 $ (`ia_depense_etat`). Au-delà, le
choix de rayon par l'IA (resolve-categorie) est coupé aussi, jusqu'au lendemain : c'est voulu.
