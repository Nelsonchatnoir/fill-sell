# Reprise — terminal « départ, suppression, relevé Leboncoin, encart Cloud » (06/10)

Mandat de Nico du 06/10 matin, plus deux compléments dans la journée
(relevé Leboncoin partiel → nouveau zip ; encart « Bientôt : FillSell Cloud »).
État de prod : `docs/agents/etat-2026-10-01.md` § « 06/10 ».

## Fait et prouvé

### 1. « Pourquoi tu pars ? » à la suppression du compte
- Seul point d'entrée : Réglages › Mon compte (web, iOS, Android = même code).
  Bloc dans l'étape « Confirmation finale », au-dessus du bouton : six choix
  uniques (désélectionnables), champ libre toujours visible, FR/EN, « pas
  reliée à ton compte ». Zéro clic de plus, zéro étape de plus.
- `src/compte/supprimerCompte.js` : la réponse part AVANT tout effacement
  (`rpc enregistrer_depart`, 2,5 s au plus, échec avalé), puis la séquence
  d'avant à l'identique (stock sans retrait, profil, delete-account).
- **Table à lire dans les checks : `public.departs_compte`** (`le`, `motif`,
  `texte`, `palier`, `anciennete_minutes`, `extension_installee`,
  `extension_version`, `plateformes_connectees`, `nb_articles`,
  `plateforme_app`, `version_app`). Ni e-mail ni identifiant (RGPD). RLS, aucun
  droit client ; seule porte : `enregistrer_depart` (SECURITY DEFINER,
  authenticated). Une réponse par compte : `departs_compte_garde` (part avec
  le compte, cascade auth.users). Motifs : `installation`, `pas_marche`,
  `trop_cher`, `plus_besoin`, `autre_outil`, `autre` (null = rien coché).
  ```sql
  select le at time zone 'Europe/Paris', motif, texte, palier, anciennete_minutes,
         extension_installee, extension_version, plateformes_connectees,
         nb_articles, plateforme_app, version_app
    from public.departs_compte order by id desc;
  ```
  Lignes 1 et 2 = les deux essais du 06/10 (+test11, +test12), à ignorer.

### 2. Suppression de compte en 500
- Cause (mesurée) : 3 clés étrangères vers `inventaire` (ON DELETE SET NULL)
  sans index — `vinted_listing_snapshots` (347 000 lignes), `rapprochements`,
  `vinted_republish_captures`. Chaque article effacé relisait les tables
  entières : ~47 ms/article ; 200 articles = 9,1 s → 500 ; 3 434 ≈ 2,5 min (et
  delete-account ne pouvait plus effacer les gros comptes).
- Migrations 20261006090100/090200/090300 (index CONCURRENTLY,
  `indisvalid = true` relu après chacun), 20261006090000 (departs_compte) :
  appliquées sur feu vert explicite de Nico, inscrites (`migration repair`).
  `supprimer_mon_stock_sans_retrait` n'a PAS été réécrite.
- Preuves : `npm run preuve:suppression-gros-stock` (transaction annulée) :
  3 500 articles en 1,58 s, 0 retrait armé, autres comptes intacts. Essais
  réels (`scripts/suppression-compte-essai-reel.mjs`, Chrome isolé sur l'app
  locale branchée sur la prod) : +test11 (3 500 articles, 1 050 annonces en
  ligne, réponse « pas_marche » + texte) → RPC 204, delete-account 200, ligne
  `departs_compte` complète, compte supprimé ; +test12 (sans réponse) → ligne
  vide, compte supprimé. Plafond théorique : ~17 000 articles sous 8 s.

### 3. Relevé Leboncoin partiel → extension 0.6.100
- Cause : jeton de la page (`localStorage.luat`, 2 h) absent ou expiré ; la
  lecture par l'adresse s'arrêtait net, le repli sur la page ne voyait que 30
  annonces (fenêtre réduite), clos « done ».
- Correctif : jeton absent/expiré/401 → « Mes annonces » rechargée, la page
  repose son jeton (iframe `auth.leboncoin.fr/api/authorizer/v2/authorize`,
  prompt=none — observé le 06/10), adresse relue ; adresse relue aussi après
  un repli ; pagination à 10 de chevauchement ; relances espacées si le
  compteur bouge (Jocabroc) ; défilement patient ; **relevé partiel clos
  `incomplete`, jamais `done`** (toutes plateformes) ; ventes et commandes
  Leboncoin précédées du contrôle du jeton (pause 30 min après un échec).
- App (OTA 2.9.59) : `incomplete` et `done`+`[incomplet]` → « incomplet x/y »,
  jamais dans « Synchronisé » ni « N annonces à jour ».
- Preuve réelle (compte LBC de Nico, code exact de la 0.6.100 exécuté dans
  son onglet) : 10/10 ; jeton retiré → `jeton_absent` → page rechargée,
  jeton reposé ~5 s → 10/10 ; jeton expiré → `jeton_expire` → remplacé → 10/10.
- Tests : `selftest:lbc-jeton-releve` (340 annonces, réponses plafonnées à 30,
  liste décalée, 401 en route, session fermée, bornes), `releve-compte-vide`
  mis à la nouvelle règle, `veille-commandes` (page simulée avec jeton).
- **Zip** : `build/CWS-0.6.100-A-TELEVERSER/fillsell-extension-0.6.100-2b883ef-cws.zip`
  (sha256 `3c4891c8e0ec4177ef196a87b2b16a8d776cf3a07c606d22a925f43ec7aa14f3`,
  BUILD_ID `2026-10-06T06:11:17Z+2b883ef`, 31 fichiers = build/extension).
  La 0.6.99 (jamais téléversée) est dans `build/anciens-zips/`.
- Dossier non empaqueté de Nico (`C:\Users\nicol\FillSell-Extension-Nico`) :
  0.6.100 copiée (identique au build) ; 0.6.99 sauvegardée dans
  `build/anciennes-extensions-nico/`. Tourne seulement après « Recharger ».

### 4. Encart « FillSell Cloud — Bientôt »
- `src/cloud/EncartCloudBientot.jsx`, interrupteur `ENCART_CLOUD_BIENTOT`,
  inséré dans `ConversionModal.jsx` sous les paliers (3 vues). Masqué si
  option Cloud (eue, en cours, essai), état non lu, compte témoin.
- **À retirer à la sortie du Cloud** : `ENCART_CLOUD_BIENTOT = false`, ou
  supprimer le composant, ses 3 `{encartCloud}` + import dans
  ConversionModal, `scripts/encart-cloud-bientot-selftest.mjs` (et sa ligne
  package.json), `scripts/apercu/*encart-cloud*`.
- Note : l'ouverture de la modale fait désormais UNE lecture des colonnes
  Cloud pour un compte ordinaire (useCloudProfil), une seule fois.

## Reste à faire — Nico
1. **Téléverser** `build/CWS-0.6.100-A-TELEVERSER/fillsell-extension-0.6.100-2b883ef-cws.zip`
   puis « Envoyer pour examen » (PAS le zip 0.6.99).
2. **Après acceptation au CWS** :
   - `scripts/package-extension.mjs` : ajouter `"0.6.100"` à `ALREADY_PUBLISHED` ;
   - `scripts/build-id.mjs` : `EXTENSION_MIN_BUILD = '2026-10-06T06:11:17Z'`
     (le BUILD_ID de CE zip ; ni celui de la 0.6.99 `2026-10-05T18:52:55Z`,
     ni `EXTENSION_LAST_COMMIT`) ; puis pousser le web. Minimum serveur
     (0.6.81) : inchangé, décision de Nico.
3. Preuve de bout en bout chez Nico : « Recharger » l'extension non
   empaquetée (chrome://extensions), vérifier
   `select extension_build from profiles where id = '<Nico>'` =
   `2026-10-06T06:11:17Z+2b883ef`, puis « Synchroniser » Leboncoin (on peut
   retirer `luat` de l'onglet Leboncoin avant) : run `leboncoin` `done`,
   `items_vus` = `total_entries`, défilement `[adresse]` + « jeton renouvelé ».
4. Valider l'encart Cloud (captures envoyées le 06/10) — fait avant l'OTA si
   la ligne « OTA » ci-dessous dit « envoyée ».
5. Ventes à risque (liste du rapport du 06/10 : Ornella combinaison de ski
   vendue LBC + Vinted, 7 copies encore en ligne ailleurs) : à traiter compte
   par compte, rien n'a été modifié.
6. À trancher : `inventaire_journal` garde 64 lignes de 2 comptes supprimés
   (pas de FK vers auth.users) — la suppression ne les efface pas (inchangé
   par consigne) ; Opla n'a aucun juge de couverture (un relevé Opla partiel
   ne se voit pas).
