# Phase 3, point 1 — inventaire de ce qui n'est pas en anglais (05/11/2026, 22:20)

Outil : `node scripts/i18n/inventaire-francais.mjs [--json fichier]` — relit tout `src/` (490 fichiers, 135 726 lignes)
avec un vrai analyseur JavaScript : chaque chaîne ou texte d'écran en français qui n'est gardé par AUCUNE langue (ni
`fr ? … : …`, ni objet `{ fr, en }`, ni module `FR` / `EN`). Écartés : journaux, télémétrie, comparaisons avec les mots
des plateformes, motifs de recherche, clés techniques. C'est une heuristique : elle compte et liste ; la preuve reste le
parcours sur un téléphone réglé en anglais (ordre de Nico).

## Les chiffres
- Textes français relevés : 10 140 ; déjà gardés par la langue : 9 220.
- **Écrans de l'app sans anglais : ~920** (estimation haute : quelques motifs d'erreurs comptés à tort) —
  Tableau et Statistiques 282 (StatsBureau 65, StatsTelephone 59, detail 55, TableauBureau 50, TableauTelephone 44) ;
  utils/shared.js 108 (messages d'erreur montrés et motifs reconnus) ; autres règles de saisie et étiquettes 135 ;
  App.jsx 79 ; composants 72 (ListingPreviewScreen 44) ; publication 72 ; pages 67 (page de retour du paiement 15,
  désinscription 14, retour eBay 14, mot de passe 10) ; onglets 32 (StockTab 27) ; Cloud 30 (conditions du Cloud,
  en français seulement) ; autres 43.
- Données des plateformes : ~4 600 (arbres de catégories, couleurs, modèles, grilles de colis de Vinted, Leboncoin,
  Beebs, eBay, Depop) — leur langue est celle du SITE de la plateforme : relève du point 2 (plateformes par pays : un
  site anglais a ses propres catégories), pas d'une traduction.
- Site vitrine (page d'accueil) : ~110 ; pages internes de Nico (maquettes, démo de la barre) : ~150 — hors app.

## Côté serveur (relu)
- Mails : `_shared/emails-fillsell.ts` prend la langue (bienvenue, « comment ça marche », lien de l'extension,
  résiliation, ventes, rafale) — à vérifier un par un en anglais ; les mails du parcours (email-tunnel) à relire.
- Notifications de vente : push-ventes suit la langue du profil (`langue(n.lang)`).
- Lens : la copie Vinted est rédigée dans la langue du SITE Vinted du vendeur (`langue-vendeur.ts`, zone euro) ; pour
  un vendeur anglophone (Vinted UK, eBay.com…) : à prouver au point 2.
- Messages d'erreur rendus par le serveur (fonctions edge, fonctions SQL : « Le job a changé entre-temps… ») : en
  français — à inventorier et à traduire à l'affichage (point 1, suite).

## Ordre de traduction proposé (le plus vu d'abord)
1. Paiement et Cloud (page de retour, écrans d'attente, mentions — déjà bilingues pour les mentions) ;
2. erreurs et messages montrés (shared.js, erreurs du serveur) ;
3. Stock, publication, fiche (App.jsx, StockTab, ListingPreviewScreen, publication/) ;
4. Tableau et Statistiques (src/ecrans) ;
5. pages restantes, conditions du Cloud (texte juridique : version anglaise « pour information », le français fait foi).

## Point 3 — le Cloud ne se vend qu'en France (05/11 22:25, web au push ; app avec la 2.9)
- `src/config/cloudOffer.js` : `cloudOffreVendable(userId)` = témoin (Nico, comptes de relecture) OU (offre ouverte ET
  téléphone en France). Pays du téléphone = fuseau horaire (`Europe/Paris` ; Monaco, Belgique, Royaume-Uni, États-Unis… =
  pas la France ; inconnu = pas la France). `PAYS_CLOUD_OUVERTS = ['FR']` : un pays s'y ajoute après une preuve réelle
  avec une IP de ce pays.
- Bornés : l'achat (lancerAchatCloud), formule + Cloud, Cloud seul, ajout, l'essai du parcours d'entrée, l'offre de la
  feuille des formules, la 2e voie, l'option de l'écran de l'extension. Inchangés (un abonné à l'étranger garde tout) :
  état et fin d'essai (HoteCloud), Réglages, « Me connecter », arrêt et reprise.
- Aujourd'hui (drapeau baissé) rien ne change pour personne : seuls les témoins voient l'offre, partout — le relecteur
  Apple (États-Unis) peut l'acheter. Prix des boutiques inchangés.
- Selftests : cloud-pays (18) neuf ; cloud-achat et onboarding-trois-jauges adaptés (la vente lit cloudOffreVendable) ;
  cloud-ecrans, cloud-executant, cloud-me-connecter, cloud-prix-nom, telephone-ebay-sans-ordinateur verts ; build vert.

## Bilan du 05/11 à 23:05 — traduit / masqué / prouvé / reste
- **Traduit** (web au push, app avec la 2.9) — 637eb7b (pages de paiement, compte, mot de passe, désinscription, retour
  eBay, conditions du Cloud en anglais POUR INFORMATION), 8c2cd90 + 1d2ce40 (App, Stock : import, export, connexion,
  réglages…), eff2149 (utilitaires : eBay, ventes, transporteurs Leboncoin, rayons, refus Beebs), d072da6 (composants,
  publication, réglages : bandeau Opla, avis, livraison, photos, questions, catalogue), a5f5516 et 8d66277 (les appelants
  passent la langue). Le français est resté mot pour mot (arbre et rendu comparés à HEAD par les relecteurs) ; 150 suites
  vertes au dernier lot, build vert.
- **Mails et notifications** : ils étaient TOUS en français (profiles.lang = « fr » pour 3 605 comptes, la langue de
  l'app ne vivait que dans fs_lang) ; la langue de l'app va désormais au profil (eff2149) — les modèles des mails et des
  notifications étaient déjà bilingues.
- **Masqué** (eff2149) : téléphone aux États-Unis, Royaume-Uni, Irlande, Canada, Australie, Nouvelle-Zélande sans trace
  française du compte → Leboncoin et Beebs masqués ; Vinted, eBay, Depop masqués tant qu'un interrupteur
  `<plateforme>_pays_<cc>` ne les ouvre pas. Le Cloud ne se vend qu'en France (d64c79a).
- **Prouvé** : pages publiques de fillsell.app en anglais, sans un mot de français (WebKit iPhone en-US, 6 pages) ; vraies
  pages lues : vinted.com (en USD), vinted.co.uk, vinted.ie, Depop mondial, eBay partout. AUCUNE plateforme n'est prouvée
  avec FillSell hors de France (il faudrait un compte de test dans ces pays) : toutes restent masquées.
- **Reste** : (1) la preuve du parcours connecté en anglais, sur un téléphone (geste de Nico :
  `PHASE3-PARCOURS-ANGLAIS.md`) ; (2) à décider par Nico : l'export Excel en anglais ? le canal de notification Android
  « Ventes » ? (3) des messages ÉCRITS EN BASE en français et montrés plus tard (arrêt d'un dépôt à ta demande, refus Beebs
  même contenu, motif d'une vente refusée, erreurs des fonctions eBay) : à traduire à l'affichage (humanizeJobError) ;
  (4) les vocabulaires des plateformes et les consignes de l'IA restent en français tant qu'aucune plateforme anglophone
  n'est ouverte (point 2).
