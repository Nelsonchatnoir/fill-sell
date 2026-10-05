# Reprise — terminal « Problèmes », lot du 05/10 (clôture)

Mandat de Nico du 05/10 matin : 14 points, chacun corrigé à la racine,
retesté en réel, un seul push. Ce fichier dit ce qui est FAIT, EN COURS et
À FAIRE. État de prod : `docs/agents/etat-2026-10-01.md` § « 05/10 ».

## ⛔ BILAN AVANT /clear (05/10 ~15:30) — LIRE D'ABORD, il remplace les listes « À faire » plus bas

### Fini et prouvé (relu en prod à 15:30)
- Web `2026-10-05T13:07:43Z+b38d842` (entrée 200 avec `Origin`) ; OTA **2.9.55**
  sur production (`channel list`) ; dossier CWS = la seule 0.6.98.
- **eBay, voie = création, TOUS comptes** : 774 jobs d'import (44 comptes,
  772 annonces) réétiquetés `extension`. Sauvegarde prise AVANT l'écriture
  (11:43:40Z) : `scripts/reparations/20261005_ebay_imports_voie_extension_SAUVEGARDE.json`,
  inverse `…_INVERSE.sql`, commit f5d9ff7. Relu à 15:30 : 774/774 en
  `extension`, **0** import encore en `api` sur l'ensemble des comptes. Retrait
  Batman clos (vendu sur eBay).
- Cron 31 `remises-en-vente-5min` actif (10 fiches Vinted de Louis publiées,
  0 doublon) ; remise en vente, colis Vinted, transporteurs LBC, marque :
  prouvés en réel (§ « Fait » plus bas) ; sessions extension 403 corrigées.
- Veille des commandes : interrupteur à 1, amorcée sur le poste de Nico
  (2 traces `amorcage` dans `usage_logs`).

### Livré, pas encore prouvé en réel
- **Louis « Rangement Rouge et Bleu » (1791017762605) et « Rouge et Jaune »
  (1791017762018)** : publiables sur Leboncoin depuis le web b38d842 et l'OTA
  2.9.55. Preuves : index Beebs `Yaourtières` en prod → même feuille d'origine
  que les 10 fiches sœurs, toutes parties le 05/10 vers 10:13 en « Maison &
  Jardin > Électroménager » ; `selftest:origine-index-beebs` vert (aucun refus,
  aucune question de rayon). **Pas encore publiées (0 job LBC)** : au premier
  clic, vérifier `platform_fields.lbcCategoryPath` = Électroménager.
  ⚠️ Le selftest tourne hors ligne : il ne prouve pas le rayon exact.
- eBay `ORDER_CONFIRMATION` : en base, seulement les 8 notifications d'essai
  eBay (14:15–14:32, données factices → `illisible`/`invalide`, attendu).
  Première vraie commande : verdict `valide` + `commandes_ebay` sur le job.
- Veille des commandes : aucune commande neuve vue → relecture prioritaire
  pas encore observée en réel.

### Reste
- **Nico** : téléverser `build/CWS-0.6.98-A-TELEVERSER/fillsell-extension-0.6.98-b7b756c-cws.zip`
  puis « Envoyer pour examen » (0.6.96 et 0.6.97 jamais servies). Ensuite,
  décider s'il force la MAJ (minimum serveur 0.6.81, inchangé).
- Une fois la 0.6.98 servie : Carla / Ciddjy `remplissage_mesures` (lenteur
  Vinted Mac, point 9) ; Joséphine, 8 retraits Beebs à revoir.
- Joséphine, 8 retraits Opla (articles vendus encore en ligne) : elle doit se
  reconnecter à opla.co dans Chrome.
- Nala 377453677328 (nicolas.menar) : question « Déjà vendu ? » ouverte depuis
  le 03/10, attend sa réponse (voulu).
- **Décisions de Nico** : (a) enregistrer seule une vente Vinted prouvée par
  la commande (renverse la règle du 12/07) ; (b) « Petit » n'est plus forcé
  sur la Mode Vinted (« rien de deviné ») : à confirmer.
- Point 11 TRANCHÉ (« jamais bloqué », la limite du jour est dite) ; GO cron
  31 et point 14 FAITS : les mentions « À faire » plus bas sont périmées.

## Sorti
- **Web** : un push sur `main` (Vercel) — commits du 05/10 jusqu'à l'OTA 2.9.54.
- **OTA** : **2.9.54** (canal production relu après envoi).
- **Fonctions** (versions lues dans `functions list`) : get-pending-jobs v216,
  update-job-status v128, handler-watch v81, generate-listing v112,
  voice-intent v155 (`false`), voice-transcribe v46, deal-analysis v42,
  avis-demande v4 — `verify_jwt` relu avant/après, inchangé.
- **Migrations** (appliquées et inscrites) : 20261005090000 (sessions
  extension), 20261005100000 (remise en vente), 20261005110000 (palier).
  **En attente du GO de Nico** : 20261005100100 (cron `remises-en-vente-5min`).
- **Extension** : `build/CWS-0.6.97-A-TELEVERSER/fillsell-extension-0.6.97-ddf3ebe-cws.zip`
  (BUILD_ID `2026-10-05T10:59:34Z+ddf3ebe`), seul dans son dossier ; les zips
  intermédiaires du jour sont dans `build/anciens-zips/`. Minimum serveur
  inchangé (0.6.81). La 0.6.96 (b32685f) était à téléverser avant.

## Fait (point par point)
1. Logo d'une plateforme vendue — règle `vintedPresenceArticle` (annonce de
   la fiche vendue/close/disparue = hors vente ; job neuf postérieur = en
   vente) ; ujs remet `vinted_status='active'` quand la fiche suit une annonce
   neuve. Selftest. Visible après OTA/push.
2. Remise en vente après vente partielle — prouvée en réel (compte de Nico :
   vente d'1 unité sur 2 → recréation automatique sur Vinted 10252167885).
3. Taille de colis Vinted — lot + stepper + retenu par rayon + gpj + 0.6.97 ;
   prouvé en réel (réponse « 5 kg » → package_size_id 8 ; retenu « 10 kg »
   → package_size_id 9).
4. Transporteurs LBC — 0.6.97 pose et relit l'ensemble exact ; cause des
   écarts à 999 € : Leboncoin VERROUILLE Courrier suivi et Colissimo
   au-delà de 400 € ; dépôt et republication prouvés (seul transporteur libre
   choisi, relu sur l'annonce). Republication : le choix RETENU passe devant
   l'annonce (gpj).
5. Marque — liste fermée + tri des suggestions dans l'extension (parité
   testée) ; b) prouvé en réel (« Kodak Ektachrome Super » → question →
   « Kodak » retenu → 2e publication en « Kodak » sans question).
6. Carte « Prêt » sans rayon — la question du rayon est posée.
7. Tests 0.6.96 : LBC republication et Beebs republication faits le 04/10 ;
   refaits en 0.6.97 le 05/10 (LBC republication OK ; Beebs : annonce de test
   retirée par la modération avant le clic, preuve d'absence).
8. Relevés — régression des sessions (403) corrigée ; version notée avant le
   premier relevé ; relevés frais devant les jobs ; poste Opla vivant < 2 h ;
   plus de demandes aux extensions muettes > 48 h.
9. Lenteur Vinted Mac — cadenceur à échéances + attentes par événements +
   mesures `remplissage_mesures` (0.6.97, à vérifier chez Carla/Ciddjy).
10. Palier — source unique serveur + extension.
11. File de nadegemarcelin78 — ce sont des clics MANUELS retenus par le
    plafond (la planification auto ne surcrée pas) ; réécritures inutiles de
    gpj supprimées.
12. Joséphine — 7 republications Beebs relancées pour un poste 0.6.97.
13. Fiches de test de Nico supprimées (3), réglages de test retirés.
14. Étude : `docs/agents/etude-delai-ventes-0510.md`.

## En cours / à surveiller
- Joséphine : retraits Beebs (8) à revoir dès qu'un poste 0.6.96+ tourne chez
  elle ; retraits Opla (8, articles VENDUS encore en ligne) : il faut qu'elle
  se reconnecte à opla.co dans Chrome — aucune action possible de notre côté.
- Carla / Ciddjy : lire `platform_fields.remplissage_mesures` sur leurs jobs
  Vinted une fois la 0.6.97 installée (rattrapees > 0, total_ms < 150 s).
- `remplissage_mesures` n'est pas encore enregistré quand la publication
  RÉUSSIT (seulement sur échec/reprise) : la durée se lit aussi par
  processing_since → published_at.

## À faire (décisions de Nico)
- GO cron remise en vente : `npx supabase db query --linked -f
  supabase/migrations/20261005100100_remises_en_vente_cron.sql` puis
  `migration repair --linked --status applied 20261005100100` (rattrape 10
  fiches Vinted de Louis au premier tour).
- Téléverser la 0.6.97 (après acceptation de la 0.6.96).
- Point 11 : borner aussi la création MANUELLE au plafond du jour (renverse
  la doctrine du 04/09 « 300 sélectionnés = 300 en file ») ?
- Point 14 : feu vert sur la recommandation (veille des commandes, eBay
  ORDER_CONFIRMATION, notification Chrome / push).
- « Petit » n'est plus forcé sur la Mode Vinted (règle du 12/07 remplacée
  par « rien de deviné », 05/10) : à confirmer.

## 05/10 après-midi — reprise (mandat de Nico après /clear)

### Fait
- **Push** main (32 commits) 13:22 → web `2026-10-05T11:22:33Z+4066332`
  (chunk App vérifié : « Recommandé par Vinted », `colis_retenus`).
- **0.6.97 contient tout la 0.6.96** : b32685f (0.6.96) est un ancêtre de
  ddf3ebe ; `beebs.js` identique ; dans `background.js`, seules lignes retirées :
  tri des marques, transporteurs LBC « dès un seul », palier — rien sur photos
  Beebs (93949ba), colis Beebs (7c03a7f), preuve de retrait Beebs (17c319a).
- **Cron 31 remise en vente** (GO) : 10 fiches de Louis publiées sur Vinted,
  Rouge/Gris « déjà en vente », 9 abandons quantité 0 ; 0 doublon.
- **URGENT eBay voie de création** : mig 20261005140000 + 774 imports
  réétiquetés (sauvegarde/inverse) ; Batman vendu sur eBay (rien à retirer) ;
  test SQL avant/après. Retraits à relancer : aucun (12 relus sur eBay ; Nala
  377453677328 = question « Déjà vendu ? » ouverte depuis le 03/10, voulue).
- **Point 11** : la feuille de republication dit la limite du jour
  (`utils/plafondRepublication.js`) ; jamais bloqué.
- **Point 14** : eBay ORDER_CONFIRMATION (fonction `ebay-notifications`,
  66 abonnés, test signé reçu) ; veille des commandes Vinted/LBC dans 0.6.98
  (interrupteur `veille_commandes_ouverte`).
- **Point 9** : mesures du remplissage aussi au succès (0.6.98).
- **Retraits bloqués par une connexion** : textes + jamais soldés (serveur) ;
  « À régler » → « Annonces à retirer » (app) ; 9 textes réparés.
- **Louis 1791017762605** : « objet non reconnu » (ni objet IA, ni mot du
  titre, annonce Beebs sans capture) → la catégorie se lit aussi dans
  `donnees_index` (« Yaourtières » → Électroménager) ; publiable sur
  Leboncoin sans choisir de rayon dès le web poussé et l'OTA.

### En cours / à surveiller
- 0.6.98 copiée sur le poste de Nico (copie de développement) : relire
  `profiles.extension_build` (b7b756c) et `usage_logs` feature
  `veille_commandes` (évènement « amorcage » = la veille tourne).
- Première vraie commande eBay : `ebay_notification_verdicts` kind `commande`
  verdict `valide` + `commandes_ebay` sur le job.
- Carla / Ciddjy : `platform_fields.remplissage_mesures` sur leurs publications
  Vinted réussies une fois la 0.6.98 servie.

### À faire
- Nico : téléverser **0.6.98** (`build/CWS-0.6.98-A-TELEVERSER/fillsell-extension-0.6.98-b7b756c-cws.zip`,
  SHA-256 `17f719fe…a46792`) puis « Envoyer pour examen ». La 0.6.97 n'a jamais
  été téléversée : la 0.6.98 part directement.
- Décision : enregistrer seule une vente Vinted prouvée par la commande (règle
  du 12/07) — non fait, la veille ne fait que faire relire l'annonce.

### 05/10 ~15:00 — push et OTA faits (autorisation explicite de Nico, absent du poste)
- **Push** `4066332..820a135` → web `2026-10-05T13:02:26Z+820a135` ; entrée
  `assets/index-DoOjO_v5.js` 200 avec et sans `Origin`.
- **OTA 2.9.55** envoyée depuis le dossier principal, `dist/` NON reconstruit :
  stamp `2026-10-05T12:55:05Z+4efb8b8`, tous les fichiers écrits entre 14:55:10
  et 14:55:11 (même build), HEAD = 4efb8b8 + un commit de docs seul. Zéro
  régression : 4066332 (2.9.54) est un ancêtre de 4efb8b8, les 19 lignes
  retirées de `src/` depuis sont des remplacements (aucune fonction 2.9.54
  perdue) ; bundle relu : « Recommandé par Vinted », `colis_retenus` (2.9.54),
  « Annonces à retirer », `donnees_index`, « Ta limite du jour » (2.9.55).
  Capgo : checksum compatible (aucune alerte native) ; `channel list` →
  production **2.9.55**.
- **Dossier CWS** : `build/CWS-0.6.98-A-TELEVERSER/` ne contient que le zip
  0.6.98 ; 0.6.96 et 0.6.97 rangées dans `build/CWS-PERIMES/`
  (`CWS-0.6.96-b32685f-JAMAIS-SERVIE-…`, `CWS-0.6.97-ddf3ebe-JAMAIS-TELEVERSEE-…`) ;
  aucun compte n'a jamais tourné en 0.6.96/0.6.97 (`profiles.extension_build` :
  56 en 2a088e4 = 0.6.94, 1 en b7b756c = poste de Nico). La 0.6.98 contient
  la 0.6.96 et la 0.6.97 : b32685f et ddf3ebe ancêtres de b7b756c, mêmes 31
  fichiers, marqueurs Beebs 0.6.96 (lecture de page, formats de colis, index
  public) présents ; 0.6.97 → 0.6.98 : 13 lignes retirées, toutes remplacées
  (texte du retrait en attente, vérification prioritaire, mesures au succès).
- **Veille des commandes et modération** : elle ne lit que la liste des
  COMMANDES (une modération n'en crée aucune) et ne fait que relire l'annonce
  par la lecture habituelle, qui ne dit « vendue » que sur preuve positive
  (Vinted `is_closed` + `item_closing_action=sold` — masquée, réservée ou « en
  vérification » = en ligne ; Leboncoin « Article vendu » sur la page vivante)
  et une annonce LBC en attente de validation n'a pas encore de `listing_url`,
  donc n'est jamais désignée ; au pire une question « Vendue ? », jamais une
  vente enregistrée sans le clic.
