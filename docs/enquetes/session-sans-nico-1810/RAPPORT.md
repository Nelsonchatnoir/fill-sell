# Session sans Nico — 17/10 soir → 18/10 (feu vert global, zéro question) — RAPPORT

Ordre des lots. Heures de Paris. Tout ce qui est « FAIT » a sa vérification nommée ; tout ce qui ne l'est pas dit pourquoi.

## LOT 1 — commandes annulées jamais une vente ; Leboncoin pro « Valider et payer » — FAIT ET VÉRIFIÉ
- 3 ventes failed (108583, 125191, 167304) retirées par script (sauvegardes + inverses, 0 mail) ; fiches au stock ; les 3 copies
  de 125191 remises par les jobs normaux (`remises_en_vente`).
- RÈGLE : migration `20261018000000` (essai à blanc 14/14 ROLLBACK, puis appliquée) — `vente_commande_annulee_vinted` sans
  date-charnière, copies remises en file, `ventes_statut_classe` (Vinted canceled/cancelled, eBay refunded).
- Louis lot A : rien à la main. DeadRoz : relevé Leboncoin = 0 annonce (compte pro) → rien redéposé d'office, attentes gardées,
  nouveau parcours à son poste avec la 0.6.124.
- Leboncoin pro : FillSell prépare le dépôt jusqu'au mur, rend l'onglet, la personne clique « Valider et payer » ; FillSell ne
  paie jamais ; comptes pro prouvés seulement ; `get-pending-jobs` v257, `update-job-status` v141, `handler-watch` v116.
- Note 2348 de Louis à 12 €. Commit `9129f95`, web vérifié.

## LOT 2 — la vraie marque partout — FAIT ET VÉRIFIÉ (Leboncoin : à prouver à la republication)
- Égalité tolérante casse/espaces/ponctuation/accents seulement ; jamais une marque contenue ou voisine ; marque libre
  (Vinted, eBay) exacte ; liste fermée (Depop, Leboncoin, Beebs) → « Autre »/« Other » + « Marque : X » une fois dans la
  description. Blocs `⟦marque-exacte⟧` (leboncoin.js, beebs.js), `depopCleMarqueExacte`. Selftest `marques-exactes` (62 :
  Chic Me, Daily paper, Chicago Bulls, Bonobo, Jules, Orchestra, Du Pareil au Même, Grain de Blé, Paris 2024, pago).
- Essai réel « Paris 2024 » (compte de Nico, 999 €) : **Vinted 10416597607** Marque « Paris 2024 » ✓ (titre à tirets refusé par
  Vinted, corrigé par « ✋ Compléter ») ; **eBay 820249047001** Marque « Paris 2024 » ✓ ; **Depop** Other + « Marque : Paris
  2024 » dans la description ✓ ; **Beebs 34185769** Autre + description au dépôt ✓, puis l'annonce a disparu de Beebs (ni en
  ligne ni en vérification : retirée par Beebs) ; **Leboncoin 3290209516** publié AVANT le correctif de la garde de description
  (sans la marque), « en cours de vérification » depuis 19:3x jusqu'à la fin de session → la description avec la marque reste
  à PROUVER à sa republication (l'app refuse à juste titre de republier une annonce en vérification).
- Retraits d'essai lancés par l'app à 20:42 : **Vinted retirée** (job `deleted`, page Vinted « Page not found » relue) ;
  **eBay retirée** (`deleted`) ; Beebs : job en attente automatique (« pas encore visible sur Beebs » — l'annonce n'y existe
  plus, retirée par Beebs) ; Depop : nouvel essai automatique (session Depop illisible, réseau, 1/5). Leboncoin : « Oublier »
  seulement tant que la vérification dure — laissé en l'état. La fiche 1792257905547 est gardée (ses jobs sont la preuve).

## LOT 3 — champs déduits — FAIT EN PARTIE (code + veille) ; essai réel non concluant
- FAIT : taille enfant reconnue dans le vocabulaire des quatre plateformes (`childSizes.parseChildSize`), traduite vers la grille
  cible AVANT la question (`listes.jugerValeurContreListe`) et à l'insert ; âge Beebs lu sur la fiche ; télémétrie
  `champ_requis_bloquant` retenue pendant une IA en vol ; `champs_requis_veille` (migration 20261018020000) → ops-digest v37
  (champ obligatoire nouveau sur un rayon connu : 0 aujourd'hui ; questions 7 j : 609 contre 423). Selftest `champs-deduits`
  (29, vraies grilles Beebs/Vinted). Audit complet : `lot3-audit-champs.md`.
- PAS FAIT : mémoire « compte × catégorie » (aucune n'existe, ajout = nouvelles écritures platform_settings non prouvables en
  une session) ; cache/regroupement IA (resolve-categorie ≈ 3 appels/article sans cache ; génération ≈ 0,011 $/article, import
  gratuit, 1 000 articles Business ≈ 12-15 $, plafond resolve-categorie atteint vers 1 300 articles) ; preuve « 7 jours après »
  (à relire vers le 25/10 : `select champs_requis_veille();`).
- Essai réel : une fiche créée à la main n'a pas de taille, et la réponse « 9-12 mois / 74 cm » donnée sur la carte Vinted ne se
  propage pas à la copie Beebs (par construction : la recopie passe par la fiche). Fiche d'essai supprimée, rien publié.

## LOT 4 — FAIT (4.1, 4.2) ; VÉRIFIÉ SANS CORRECTIF (4.3, 4.4)
- 4.1 Relevés morts : Lohan = boutique à confirmer (02 → 16/10) puis session Vinted fermée, revenu seul le 17/10 14:34 ; Rui =
  session fermée depuis le 11/09, dormant (rien relancé) ; 0 run figé. `releves_morts_veille` (migration 20261018010000) →
  ops-digest v36. Rapport `lot4-releves-morts.md`.
- 4.2 Session perdue / compte restreint : une ligne « À régler » (connexion, restriction Vinted avec sa date), masquable par
  plateforme (le masque tombe au retour), interrupteur Réglages › Préférences, lecture bornée 10 min. Selftest `alertes-compte`.
- 4.3 Ventes en lot : Vinted ✓, eBay ✓ (sauf quantité de ligne), Depop ✓ ; **Leboncoin ✗ (bundle = une ligne « lot » sans
  annonce), Beebs ✗ (aucune vente relevée)** — non corrigé (fonctions de prod + vraies ventes nécessaires).
- 4.4 Multi-exemplaires : garde serveur ✓ ; **eBay ✗** (fiche à N exemplaires passe « vendu » à la première vente eBay ;
  quantité eBay jamais révisée par une vente ailleurs) — non corrigé. Rapport `lot4-ventes-lot-multi-exemplaires.md`.

## LOT 5 — offres aux favoris — PAS FAIT (rien n'existe à finir)
Aucun envoi d'offre codé sur aucune plateforme, pas de table/drapeau/écran ; décisions de Nico en attente depuis l'audit du
24/09 ; chemin le plus sûr = API eBay officielle. Inventaire et garde-fous réutilisables : `lot5-offres-favoris.md`.

## LOT 6 — études — FAIT (sans code)
`lot6-etudes.md` : détection des commandes (PC allumé : Vinted/Leboncoin 10 min ± 90 s, Beebs/Depop bêta seulement ; PC éteint :
rien sauf eBay) ; paiement échoué (un mail, aucune relance) ; parrainage (rien n'existe, proposition avec anti-abus).

## INCIDENT — écran blanc /app 20:18 → 20:21 (ced6cfd)
Import `alertesCompte` masqué par une constante locale de StockTab → ReferenceError dans un useMemo, invisible au build.
Retour arrière Vercel 20:19 (vers 9129f95), correctif `1af55c7` (import renommé) + garde `selftest:imports-jamais-masques`
(3 069 imports, 384 fichiers, 0 ombre). Après le rollback, le push suivant n'a pas repris la prod seul : `request_promote`.

## CHOIX PRIS SANS NICO
Rien relancé pour Rui ; rien d'ouvert en lot 5 ; lots 4.3/4.4 documentés, pas corrigés ; mémoire compte × catégorie et cache IA
non faits ; fiche d'essai Paris 2024 gardée (preuve), fiche « body bébé » supprimée ; Leboncoin d'essai laissé en vérification ;
Vercel rollback puis promote sans attendre ; `selftest:opla-message-unique` (non enregistré, rouge d'avant) laissé tel quel.

## LIVRAISON
- Zip : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.124-A-TELEVERSER\fillsell-extension-0.6.124-ced6cfd-cws.zip` (seul dans son
  dossier ; BUILD_ID 2026-10-17T18:16:49Z+ced6cfd ; contient 0.6.122 + 0.6.123 + lots de la session). Zips 0.6.122/0.6.123 →
  `build/CWS-PERIMES/` (jamais téléversés). Manifest : seule la version change — AUCUNE permission nouvelle.
- CWS, pratiques de confidentialité à cocher (inchangées) : « Communications personnelles » (messagerie bêta : lecture et envoi
  de messages des plateformes) et « Informations permettant d'identifier personnellement l'utilisateur » (pseudo, e-mail,
  adresse d'expédition lus sur les plateformes connectées) ; cocher aussi « Informations financières » si la case existait déjà
  pour les ventes / prix lus (inchangé par ce lot).
- Web : `5e59c50` servi (`build.json` 2026-10-17T18:40:35Z+5e59c50), entrée 200 avec `Origin`, /app rendu, console propre.
- OTA : **2.9.99** (canal production 2.9.98 → 2.9.99, build 5e59c50, relu `channel list`).
- Selftests : avant 341/345 ; après **344/345** (seul rouge `vinted-origine`, d'avant) ; nouveaux : marques-exactes 62,
  alertes-compte 21, champs-deduits 29, commande-annulee-jamais-vente 23, imports-jamais-masques.
- Après l'acceptation CWS : `EXTENSION_MIN_BUILD = '2026-10-17T18:16:49Z'` + `ALREADY_PUBLISHED` (0.6.124) + push.
- Non fait : l'onglet Vinted « Vends ton article » d'une session précédente n'a pas pu être fermé (groupe d'un autre Claude,
  beforeunload) ; `npm run lint` plante (mémoire, bundle Android — d'avant).
