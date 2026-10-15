# Plateformes : Depop, eBay, Leboncoin, Opla

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 11/10 nuit — Depop comme Opla (ex-L59-69)
- 11/10 midi — poids Leboncoin (remplacé) (ex-L105-112)
- 10/10 soir — champs eBay : l'IA remplit avant de demander (ex-L147-156)
- 10/10 nuit — eBay : un vêtement de mode ne part pas en sport (ex-L157-165)
- 09/10 nuit — Depop pour le seul compte de Nico (ex-L166-184)
- Sortie d'Opla / Depop pour tous (ex-L399-408)
- 09/10 soir — frais de port Depop (ex-L409-418)
- 09/10 soir — catégories interdites par Depop (ex-L419-429)
- 10/10 matin — republication automatique Depop (ex-L430-441)

<!-- ex-CLAUDE.md L59-69 : 11/10 nuit — Depop comme Opla -->
- **⛔ 11/10 nuit — DEPOP COMME OPLA** — rapport `docs/enquetes/depop-comme-opla-1110/RAPPORT.md` : ⛔ **jamais de
  file silencieuse** — trace `extension_postes[…].depop_acces` (gpj), « Autoriser Depop » posé par handler-watch
  (`_shared/acces-depop.js` : 15 min avec un poste sans accès, 1 h sans aucun poste autorisé, jamais si un poste
  du compte a l'accès), levé par gpj / l'extension / handler-watch ; bouton « Autoriser Depop » dans l'app ;
  ⛔ **le rayon Depop passe par le moteur** (`_shared/depop-rayon.js` v3 : feuilles officielles, libellés corrigés,
  resolve-categorie v14, garde-fous — vêtement jamais en chaussures, Enfants jamais sans indice, enfant ET adulte
  = question ; gpj ne sert jamais une publication Depop sans rayon du moteur, handler-watch recalcule) ; Depop
  **jamais pré-cochée** dans le lot ; connexion : « connecte-toi à Depop sur ton ordinateur ». 6 jobs Simon/Jake
  traités par la règle (5 rayons corrigés, 1 question) ; audit : 5 rayons faux, aucun parti. gpj **v239**, hw
  **v99**, ujs **v134**, rc **v14** ; OTA **2.9.85** ; extension inchangée ; parcours réel chez Nico PAS fait
  (aucune session fillsell.app dans le Chrome piloté).

<!-- ex-CLAUDE.md L105-112 : 11/10 midi — poids Leboncoin (remplacé) -->
- **(REMPLACÉ le 11/10 soir : poids FACULTATIF, ligne du lot de dix points) POIDS LEBONCOIN (11/10 midi, Louis)** — rapport
  `docs/enquetes/louis-poids-lot-1110/RAPPORT.md` : 9bdcfce (10/10 13:50, 2.9.75) avait rendu le poids du lot
  « facultatif » → 12 livres et 18 vêtements de Louis partis sans poids (Leboncoin : 100 g, S ; le lot de 19:44
  n'avait 500 g que par les fiches). Rétabli : lot = poids OBLIGATOIRE pour Leboncoin (une valeur pour le lot),
  « Confirmer » le demande si ni copie ni fiche n'en ont, get-pending-jobs **v234** ne sert JAMAIS une
  publication Leboncoin sans poids (needs_user « Poids du colis », réponse une fois pour le lot,
  `_shared/poids-leboncoin.js`) ; republication et Beebs inchangés. OTA **2.9.81**. Selftest
  `selftest:lot-poids-leboncoin`. Les 30 annonces parties : rien modifié chez Leboncoin (à corriger à la main).

<!-- ex-CLAUDE.md L147-156 : 10/10 soir — champs eBay : l'IA remplit avant de demander -->
- **⛔ CHAMPS eBay : L'IA REMPLIT AVANT DE DEMANDER (10/10 soir, cas Manon)** : lot de
  polaires importées de Vinted, 63862 « Manteaux, vestes » : `Style`/`Type` (FREE_TEXT, aucune
  entrée de la liste ne décrit une polaire) demandés → eBay abandonné. La seconde passe FREE_TEXT
  de la voie API (`remplirAspects`) manquait à la voie formulaire : `generate-listing` **v115**
  (`completerAspectsIA`, mode eBay seulement, première passe inchangée, seconde passe UN aspect par appel ; hors liste = mot LU dans
  le texte, sinon question) ; moteur : rien sur la liste d'une autre catégorie, une demande par
  aspect ET catégorie, appel raté retenté (`src/publication/moteur/aspectsEbayAuto.js`).
  Mesure `usage_logs` `ebay_aspects_ia`. ⛔ SELECTION_ONLY = liste seule ; colis jamais deviné.
  Enquête : `docs/enquetes/manon-ebay-aspects-1010/RAPPORT.md` (« gilet » → 177856 Cyclisme :
  corrigé le 10/10 nuit, ligne suivante). Selftests `ebay-aspects-seconde-passe`, `ebay-aspects-auto`.

<!-- ex-CLAUDE.md L157-165 : 10/10 nuit — eBay : un vêtement de mode ne part pas en sport -->
- **⛔ eBay : UN VÊTEMENT DE MODE NE PART PAS EN SPORT (10/10 nuit, Nico)** : « gilet » →
  Cyclisme › Gilets, « veste » → Cyclisme › Vestes, « sac » → Golf › Sacs, « basket » →
  Collections › Pins, « collier » → Animalerie › Colliers… étaient des feuilles EXACTES (sans
  IA). Règle (`src/utils/brancheSpecialiseeEbay.js`, eBay SEULEMENT) : un rayon « vêtement » de
  Sports (hors Vacances), Auto-moto, Bricolage, Animalerie, Collections n'est retenu que si le
  titre / la description / l'objet disent la spécialité (sous Sports : un sport nommé suffit) ;
  sinon icône, question ou suggestion eBay. ⛔ La question IA COMMUNE aux plateformes n'est
  jamais modifiée (écart après la réponse). 8 annonces déjà mal rangées (3 en ligne), RIEN modifié :
  `docs/enquetes/ebay-mode-hors-sport-1010/RAPPORT.md`. Selftest `branche-specialisee-ebay`.

<!-- ex-CLAUDE.md L166-184 : 09/10 nuit — Depop pour le seul compte de Nico -->
- **⛔ DEPOP POUR LE SEUL COMPTE DE NICO (09/10 nuit)** : base (mig 20261009020000,
  garde `depop_autorise` : drapeau `depop_ouvert` RESTÉ À 0 ou `beta_flags.depop` —
  Nico seul), moteur commun corrigé (9eab08f : « EUR » ≡ « EU », « Comme neuf » = très
  bon), serveur (gpj v224 : un job Depop ne va QU'au poste qui déclare `depop_acces`),
  extension **0.6.105** (hôte www.depop.com OPTIONNEL, « Autoriser Depop » ; zip
  `build/CWS-0.6.105-A-TELEVERSER/`), app (Depop « à venir », ouverte par
  `rpc depop_autorise`, fail-closed). ⛔ Toute liste de plateformes nomme Depop ou
  dit pourquoi (`selftest:depop-partout`) ; jamais de rayon Depop par libellé ;
  l'annonce « Scotch » 945704866 est CELLE DE NICO. Reprise :
  `docs/reprise/terminal-depop-0910.md` ; contrats réels : `docs/plateformes/depop/CARTOGRAPHIE.md` § 8.
  **09/10 fin de matinée** : `rapprochement` **v17** — l'identifiant d'un dépôt FillSell est
  rattaché AVANT le moteur v3 (prouvé en réel, motif `identifiant_avant_moteur`) ; mig
  **20261009100000 APPLIQUÉE** ; fiche en double 1791529881380 RÉPARÉE (inverse complet) ;
  mig **20261009110000 APPLIQUÉE** (GO nommé : sept déclencheurs retrait/relevé ouverts à
  Depop) ; get-pending-jobs **v227** (réponse « annonce partagée » tranchée = sortie de `choix`) ;
  **parcours réel VERT** (relevé, republication, retrait, croisé ; FIN relue : plus aucune
  annonce de test chez Depop, « Scotch » intacte) ; extension `02f9f67` (lecture Depop « réseau »
  reprise) prouvée en page, JAMAIS chargée, HORS du zip 0.6.105 (inchangé) ; **OTA 2.9.68 NON
  lancée** (dossier partagé sale + commits non poussés d'un autre terminal) ; push : Nico.

<!-- ex-CLAUDE.md L399-408 : Sortie d'Opla / Depop pour tous -->
- **Sortie d'Opla (Nico)** : BASCULE LE 10/10 à 00:00 Paris, interrupteur
  coin_config `opla_sortie_le` (0 = désactivée) ; avant, Opla comme avant ;
  après, plus aucune publication ni republication Opla, synchro gardée pour
  les comptes reliés (`_shared/opla-sortie.js`). **Même instant : Depop pour tous**
  (mig 20261009230000 : `depop_autorise` lit `opla_sortie_le` ; republication
  auto Depop ouverte) ; l'app ne la montre qu'à une extension ≥ 0.6.106
  (`src/utils/basculeOplaDepop.js`), le site bascule seul (`src/utils/siteAvecDepop.js`).
  (10/10 après-midi) Une copie Opla rédigée AVANT la bascule ne se repropose
  plus (écran « Confirmer » du stepper) : le moteur ne garde que les copies des
  plateformes que le compte voit (`src/publication/copiesProposees.js`).

<!-- ex-CLAUDE.md L409-418 : 09/10 soir — frais de port Depop -->
- **⛔ FRAIS DE PORT DEPOP (09/10 soir, Nico : zéro friction)** : en France Depop
  ne fournit aucune étiquette, le vendeur fixe le port (0 à 99,99 €) — jamais
  deviné. Prix par défaut dans Réglages › Expédition
  (`platform_settings.depop.frais_port_defaut`, fusion seulement) ; le stepper
  et le lot le pré-remplissent et le DEMANDENT avant l'envoi (lot : une fois) ;
  feuille « Envoi suivi en France » (tarifs officiels Colissimo 01/04/2026 et
  Mondial Relay 15/06/2026, `src/utils/envoiSuiviFrance.js`, à revoir au
  01/01/2027) ; gpj **v228** pose le défaut sur tout job Depop sans port, sinon
  une republication (annonce importée) passe en needs_user AVEC le champ, avant
  tout retrait (`_shared/port-depop.js`). Selftest `selftest:port-depop`.

<!-- ex-CLAUDE.md L419-429 : 09/10 soir — catégories interdites par Depop -->
- **⛔ CATÉGORIES INTERDITES PAR DEPOP (09/10 soir, Nico)** : UNE table,
  `_shared/depop-interdits.js` (icône de `detectObjectIcon` → règle + citation
  officielle, centre d'aide en-gb lu le 09/10 : électrique/électronique —
  « Items that use electrical power (including batteries and solar power) are
  not allowed » —, puériculture). Appareils photo et montres classiques
  autorisés ; aucune catégorie de mode bloquée (sauf ⏱️ montres connectées,
  nommées par Depop) ; ambigus NON bloqués (`DEPOP_A_VERIFIER` : jeux en
  disque, DVD, horloges…). App : case Depop grisée avec la phrase ; lot :
  exclus de Depop seulement, comptés avant l'envoi (`lot/ExclusDepop.jsx`) ;
  gpj **v230** : filet sur tout job Depop qui dépose → needs_user, jamais servi.
  Selftest `selftest:depop-interdits`.

<!-- ex-CLAUDE.md L430-441 : 10/10 matin — republication automatique Depop -->
- **⛔ REPUBLICATION AUTOMATIQUE DEPOP (10/10 matin, Nico)** : MÊME circuit que
  Vinted, Leboncoin, Beebs (balayage `republish_planifiee_sweep`, mêmes paliers,
  plafonds et quotas) ; app : ligne Depop dans « Republication automatique »
  seulement si l'app propose Depop au compte (`plateformesDuCompte`, extension
  ≥ 0.6.106), une plateforme active garde sa ligne ; gpj **v231** : les créneaux
  viennent de la liste DU SERVEUR (plus de liste en dur) ; une republication
  AUTO d'un article interdit par Depop est close sans question (annonce
  intacte, verdict `depop_interdit`) et l'article n'est plus jamais candidat
  (mig **20261010100000 APPLIQUÉE**, feu vert nommé : `<plateforme>_interdit`
  exclu des candidats). Preuve réelle chez Nico (job 7cd5edaf, parti seul au
  créneau, recréé, ancienne en 404, test retirée). Selftest
  `selftest:republication-auto-depop`.
