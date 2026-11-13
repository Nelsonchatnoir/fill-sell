# Parcours d'entrée (onboarding) : l'ordre des étapes et ce qu'il mesure

> Sujet ouvert le 13/11/2026 (bloc B2 de Nico). L'ordre des écrans est une DONNÉE : `src/entree/plan.js`. Une règle
> nouvelle de ce sujet s'ajoute ICI, jamais dans `CLAUDE.md`.

## 13/11/2026 — La voie de publication d'abord, eBay APRÈS, « Ton plan Free » dans le récap (bloc B2 de Nico)
- **Mesuré** sur les 119 inscrits du 08 au 13/11 (usage_logs `onboarding_choice`, profiles) : 11 n'ont rien validé ;
  107 ont validé « Où tu vends ? » ; 32 ont coché eBay, 23 ont ouvert le consentement eBay AU MILIEU du parcours et 12
  n'y sont jamais revenus (sur le web la page eBay remplace l'app, le parcours se marque fini à la sortie) — 9 d'entre
  eux avaient relié eBay ; 20 sont partis après « Où tu vends ? » sur ordinateur (14 avec l'extension vue ensuite :
  « Installer l'extension » ouvre /extension DANS l'onglet) ; 50 ont passé l'écran du plan Free. Sans voie de
  publication (extension vue ou FillSell Cloud), AUCUN inscrit n'a publié (0 sur 79) ; 16 ont publié, tous avec une
  voie ; 4 payent, dont 3 avec le Cloud.
- **Lecture corrigée** : les écrans sans choix (remontées, pseudo, récap) ne laissaient aucune trace ; « s'arrête après
  "offre gratuite comprise" » voulait dire « arrivé au récap ». Désormais chaque écran vu se journalise
  (`etape_vue` { etape, rang, total }, une fois par écran), « Compris » des remontées (`republication_comprise`) et la
  sortie (`parcours_termine` { destination, ensuite }).
- **Ordre** : « Où tu vends ? » → le choix de la voie (téléphone : « As-tu un ordinateur ? » avec les formules,
  « Comment tu veux publier ? » avec le Cloud seul ; ordinateur : l'extension) → ses écrans (Cloud 7 jours ou
  extension) → relevé / « Je débute » → remontées → (« Ta formule … + Cloud ») → pseudo → récap. Les règles Cloud du plan
  (`ordinateur`, `voie`, `cloud_*`, `formule`) sont inchangées, mot pour mot.
- **eBay après le parcours** : plus d'étape eBay. Le récap porte « Relier eBay » (eBay coché, pas relié) : l'adresse
  d'eBay est demandée, le parcours est MARQUÉ FINI (attendu), puis la page eBay s'ouvre (`src/entree/ebayApres.js`) ;
  eBay indisponible → on reste sur le récap, la phrase le dit. Ensuite : la carte « Tes plateformes à connecter » du
  Tableau et Réglages › Mes plateformes, inchangées.
- **« Ton plan Free »** n'est plus un écran : son contenu ENTIER (`PlanFree`, `EtapeFree.jsx` : 3 chiffres lus dans
  coin_config et ce qu'ils comptent, remise à zéro, « Sans limite, même en Free », l'exemple, la bande Cloud, « Besoin
  de plus un jour ? ») est dans le récap d'un compte Free avec la grille ; aucun bouton d'achat.
- **Reprise** : une position gardée sur une étape retirée (`fs_entree_etape` = ebay | free) reprend à l'étape qui la
  suivait (`indexDeReprise`). Les écrans `EtapeEbay` / `EtapeFree` restent montables : un retour arrière = la ligne du plan.
- Verrou `npm run selftest:entree-ordre` (24 rouges sur 3f17a8a, 43 verts après). Selftests mis à jour, changement
  volontaire : onboarding-trois-jauges, formules-cloud-ferme, formules-cloud-offres (plus d'étape « ebay » ni « free »).
