# POINT DE REPRISE — TERMINAL CLOUD, 08/11/2026 soir (à lire EN ENTIER avant toute action)

Rédigé le 08/11 vers 20:15 (heure de Paris), à la demande de Nico, pour une session neuve ; **mis à jour après chaque point
terminé** (dernière mise à jour : 08/11 20:4x, migration 20261108200000 appliquée). Tout ce qui suit a été relu
en prod au moment d'écrire, sauf mention contraire.

## 1. L'état en service

| Quoi | État |
|---|---|
| Web (Vercel) | **4d606f9 + ba0bea7 poussés** (20:2x, ordre de Nico) ; build en ligne **2026-11-08T19:31:34Z+2ee78f8** (doc du terminal Problèmes posée par-dessus ba0bea7 ; contient tout notre code). Vérifié 20:3x : /app et ?onglet=stock rendus, 0 erreur console. |
| Migration **20261108200000** | **APPLIQUÉE** 20:3x (+ `migration repair`) après banc jetable vert 11/11 (`scripts/essais/20261108200000_banc.mjs`) ; corps prod relu = migration. Un poste qui repasse « actif » perd derniere_erreur et details.erreur/raison. Inverse : `supabase/rollbacks/20261108200000_poste_noter_erreur_effacee_INVERSE.sql`. |
| cloud-2 | orchestrateur **4391256d06e4** (course du poste neuf réglée 304369a + alerte « Me connecter en erreur ») ; image Chrome 61fb7ddd6e2a ; copie Cloud de l'extension **0.6.182-cloud** (CRX 6eab0eb5f00b, posée par le terminal Problèmes à 20:02). Santé ok, 2 postes : Nico (IP 42 = 94.194.94.68, coffre Vinted/Leboncoin/Beebs/Depop) et Virginie (IP 41 = 88.151.56.82, coffre vide). |
| Fonctions | email-tunnel **v85** (verify_jwt false) : alerte support@ « 0 plateforme connectée 30 min après l'essai » au passage horaire (délai réel 30-90 min). |
| OTA Capgo | canal production **2.9.166**. Rien publié ce soir (**ordre de Nico : pas d'OTA ce soir ; la prochaine attend que l'écart du module Capgo soit réglé, 8.53.1 dans l'app / 8.51.2 dans les binaires en ligne ; aucune OTA ne doit atteindre un binaire incompatible, preuve à l'appui**). La prochaine OTA commune (Cloud + Problèmes) doit être **≥ 2.9.168** (2.9.167 = le binaire Android). |
| Android | binaire **2.9.167 / versionCode 37** (7c82602, updater 8.53.1) : `build/AAB-A-TELEVERSER-2.9.167-vc37/fillsell-android-2.9.167-versionCode37-7c82602.aab`, sha256 98a662f4…d3f2, signature = vc36. **À téléverser par Nico** (Play Console › Production › Créer une release › Importer › Enregistrer › Vue d'ensemble de la publication › Envoyer les modifications pour examen). La vc36 a été refusée par Google (devises). |
| iPhone | aucun binaire neuf : tout passe par l'OTA. |

## 2. Ce qui a été fait ce soir (dans l'ordre)
1. **URGENT U1-U5** (ac219a2, web au push 17:01 UTC) : écran de connexion ouvert après l'essai sur les 3 canaux
   (web : /success → /app?connexion=cloud), carte « Connecte tes comptes » (Tableau, Stock), plus d'« installer
   l'extension » pour un client Cloud, « Synchroniser » sans connexion refusé (« pas encore connecté »), alerte email-tunnel.
   Détail : `docs/cloud/REPRISE.md` (tête).
2. **Refus Google de la vc36** (« Currency differences ») : prix affichés = prix de la boutique sur iPhone/Android
   (0dd0d2f, `src/lib/prixBoutique.js`), web inchangé ; binaire vc37 ; Play Console relue (4 abonnements, 175/175 pays ;
   l'app est distribuée dans 178 pays : 3 sans facturation Google, laissés tels quels sur décision de Nico).
3. **Fin d'U3** (4d606f9, local) : plus aucun « ordinateur / Chrome / ton extension » pour un client Cloud dans la
   publication par lot, l'attente de description, Réglages › Mes plateformes, la publication programmée, les retraits
   bloqués, la messagerie bêta, le message « ouvert dans Chrome ». `selftest:retraits-cloud` (40), suite complète verte.
4. **URGENCE LEBONCOIN** (client wtk8jnmnnf, iPhone, essai 19:01) :
   - cause prouvée : course à l'ouverture du poste NEUF entre « Me connecter » et le planificateur (deux ouvertures à
     140 ms ; la 2e, refusée « déjà une dans l'heure », fermait le navigateur de la 1re : « CDP : connexion fermée »).
     Pas le déploiement de 17:59. Les tentatives 2 et 3 du client n'ont montré aucune erreur de notre côté (page
     Leboncoin ouverte, DataDome passé ; la 3e par « Continuer avec Apple », fermée 10 s après le retour d'Apple).
   - correctif 304369a (une seule ouverture par compte à la fois), test qui rejoue la course ; déployé 19:26.
   - **preuve réelle sans identifiants** (ordre de Nico) : Nicotest servi à la main sans paiement, « Me connecter »
     ouvert au tour du planificateur → 1 navigateur, 1 session, 0 erreur, poste stable 10 min ; pages de connexion
     Leboncoin (DataDome passé seul en 2,2 s), Vinted, Beebs (DataDome passé), Depop lues dans le navigateur ET reçues
     par l'écran. Outils : `serveur-cloud/outils/essai-me-connecter-ticket.mjs`, `inspecter-page-connexion.mjs`.
     Nettoyage complet (`scripts/reparations/20261108_nicotest_*`) : accès retiré, IP 2 remise à son repos du 07/11,
     session révoquée, poste et profil retirés. Journal du test : `/srv/fillsell-cloud/archives/essai-nicotest-0811.log`.
   - **alerte immédiate** à support@ quand un « Me connecter » tombe en « erreur » (4391256, déployée 20:05).
   - le client **a arrêté son essai Apple à 19:33** (IP 1 au repos jusqu'au 15/11, poste éteint) : Nico lui écrit.

## 3. À faire, par ordre (ce que Nico attend)
1. ~~Pousser 4d606f9 (+ docs)~~ FAIT 20:2x, site vérifié.
2. **OTA commune ≥ 2.9.168** sur feu vert de Nico, avec le terminal Problèmes. ⚠️ `npx @capgo/cli bundle compatibility
   --channel production` signale @capgo/capacitor-updater **incompatible** (8.53.1 local / 8.51.2 au canal, natif
   changé) : relire le réglage « Disable auto update » du canal (aujourd'hui « major ») et décider avec Nico AVANT l'envoi
   (les binaires en ligne — iPhone 2.9.164, Android 2.9.10 — gardent l'updater 8.51.2 ; nos 4 appels existent dans les deux).
   ⚠️ Le module Android annonce « 8.52.1 » à Capgo même en 8.53.1/8.54.2 (constante PLUGIN_VERSION pas montée en amont).
3. ~~Migration 20261108200000~~ **APPLIQUÉE** 20:3x (banc jetable 11/11, feu vert de Nico conditionné au banc). Le poste éteint
   de wtk8jnmnnf garde son « CDP : connexion fermée » (règle : effacé seulement au retour « actif » ; aucune retouche à la main).
   Ancien texte : : `cloud_poste_noter` efface derniere_erreur et
   details.erreur/raison quand un poste repasse « actif » (le « CDP : connexion fermée » restait affiché après 19:26 :
   un reste, pas une panne). Essai sur base JETABLE puis feu vert nommé ; inverse dans `supabase/rollbacks/`.
4. **Surveiller** la prochaine connexion réelle d'un client (Virginie ; wtk8jnmnnf a arrêté) :
   `select user_id, plateforme, statut, ouverte_le, close_le, raison from cloud_connexions where ouverte_le > now() - interval '1 day' order by ouverte_le desc;`
   Une « erreur » envoie désormais un mail à support@ tout de suite.
5. **Reste d'U3, zone du terminal Problèmes (file de republication), NON TOUCHÉ** : StockTab `etapeRepublication`
   (« En attente de ton Chrome », « … dès que ton ordinateur reprend la main », « Connecte-toi à X sur ton ordinateur »,
   « … sur vinted.fr dans Chrome »), `RepublishAutoBlock` (« une par passage de l'extension, Chrome ouvert »), textes
   d'erreur de la republication automatique, `RepublicationPlanifiee.jsx` (« Heure locale · Chrome ouvert »),
   `fileDesJobs.js` (raisons Vinted « … dans Chrome »). Ailleurs dans le Stock, encore à revoir avec Nico : bandeau
   « Connecte-toi à X sur ton ordinateur » (texteConnecteToi), « Ton ordinateur dépose l'annonce », « … retire depuis ton
   ordinateur », « ça tourne tout seul, Chrome ouvert », « Ton ordinateur les republie une à une », menu « Voir la file
   de l'ordinateur ».
6. **ORDRE DE NICO (08/11 20:2x)** : (a) **C2 d'abord** — 3 maquettes animées du bandeau « NOUVEAU · FillSell Cloud »
   en Artifacts, donner les liens et **ATTENDRE son choix avant d'intégrer** ; **FAIT 20:4x** : toile
   https://claude.ai/artifact/KeD76ohqxxTNmmFEVsjVQh (A « Lueur » = bande encre + reflet toutes les 7 s ; B « Le relais »
   = encart menthe, le PC se ferme et le nuage prend le relais ; C « Halo » = carte blanche, liseré lumineux qui tourne,
   deux phrases qui défilent), chacune en web/iPhone × clair/sombre, refermable, rejouable. Sources :
   scratchpad `c2-bandeau/project/*.dc.html` (session du 08/11). **EN ATTENTE DU CHOIX DE NICO** — rien intégré.
   Règles d'affichage à coder ensuite (spéc. de Nico) : haut du Tableau pour tout compte sans Cloud (tous paliers) ; jamais
   pour un client Cloud (essai ou payant) ; refermé = 7 jours ; masqué là où le Cloud ne se vend pas (Android tant que la
   vc36/vc37 n'est pas publiée, binaire < 2.9.164, plus de place → rien ou liste d'attente, à proposer) ; usage_logs : vu,
   clic, fermeture (une ligne chacun dans le rapport). L'app est claire partout (décision du 29/10) : le sombre n'est
   montré que parce que Nico l'a demandé.
   Effet de la migration 20261108200000 vérifié en prod : au signe de vie de 20:38:52, les 2 postes actifs ont perdu
   details.raison (« arret_orchestrateur ») ; derniere_erreur nulle. (b) C1 (« plus besoin d'ordinateur »
   partout), C3 (Cloud visible en Business), C4 (voir les autres formules et pouvoir descendre) ; (c) jauges, puis landing.
   **C1-C4, jauges et landing** : le travail en cours est dans `git stash@{0}` (« C1 textes Cloud + jauges/landing WIP »).
   C1 avait des selftests rouges à reprendre (cloud-ecrans, cloud-prix-nom, onboarding-trois-jauges, essai-testflight-0711,
   aucune-estimation sur jaugesExplications.js:59). C2 : 3 maquettes de bandeau à montrer AVANT de coder. C4 : changement
   de formule différé (Stripe, Apple, Google) en bac à sable. Route `/demo/jauges` à remettre avec `lazySur`.
7. Autres préparés, non appliqués : migration **20261108160000** (places vraies pour un compte qui a son IP).

## 4. Pièges de la soirée
- Le dossier est PARTAGÉ : le terminal Problèmes indexe parfois ses fichiers (`git commit -- <chemins>` seulement,
  jamais un `git commit` nu) ; `deno.lock` bouge avec ses lancements Deno (le remettre à HEAD, rien d'utile).
- Son commit de docs **b983706** (copie 0.6.182-cloud) est dans le worktree détaché `.claude/worktrees/cloud-0182`,
  non poussé, refusé par le garde-fou : **ne pas le pousser à sa place** (Nico décide).
- Heredoc + node : « \b » devient un caractère de retour arrière (mémoire « piège \b heredoc ») — écrire les regex avec
  l'outil d'écriture, jamais dans un heredoc.
- `npm run build` refuse un arbre sale, un fichier non suivi d'un autre terminal suffit.
- Le deployer de cloud-2 refuse un `serveur-cloud/` non committé (y compris un outil neuf).
- L'outil de ticket doit ACCUSER chaque image (`{ t: 'ack' }`) : sans accusé, le serveur s'arrête à 2 images (une page
  « blanche » qui n'en est pas une).
- `cloud_ip_attribuer` rend à un compte SA propre IP au repos (« retour même compte ») avant une IP disponible.
