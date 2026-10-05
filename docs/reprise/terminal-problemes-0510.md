# Reprise — terminal « Problèmes », lot du 05/10 (clôture)

Mandat de Nico du 05/10 matin : 14 points, chacun corrigé à la racine,
retesté en réel, un seul push. Ce fichier dit ce qui est FAIT, EN COURS et
À FAIRE. État de prod : `docs/agents/etat-2026-10-01.md` § « 05/10 ».

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
- Nico : téléverser **0.6.98** (`build/CWS-0.6.98-A-TELEVERSER/`) — elle
  contient la 0.6.97. Si la 0.6.97 est déjà en examen au CWS : la laisser
  passer, puis envoyer la 0.6.98.
- Décision : enregistrer seule une vente Vinted prouvée par la commande (règle
  du 12/07) — non fait, la veille ne fait que faire relire l'annonce.

### Gestes refusés par le classifieur → Nico (dans cet ordre, depuis le dossier principal)
1. `! git -C C:/Users/nicol/fill-and-sell push origin main` — UN push (tout le lot de l'après-midi), puis
   `curl -s https://fillsell.app/build.json` doit dire `+<HEAD>` et l'entrée rendre 200 avec `Origin`.
2. `! cd C:/Users/nicol/fill-and-sell && npx @capgo/cli bundle upload --channel production --bundle 2.9.55 --path dist`
   — `dist/` déjà construit sur arbre propre (`2026-10-05T12:55:05Z+4efb8b8`) ; ne PAS le reconstruire ;
   puis `npx @capgo/cli channel list` doit dire 2.9.55.
Tant que ces deux gestes ne sont pas faits : web et app servent encore 4066332 / 2.9.54 (la fiche de Louis
y est publiable sur Leboncoin en choisissant le rayon sur la carte ; l'écran « Annonces à retirer » n'existe pas).
