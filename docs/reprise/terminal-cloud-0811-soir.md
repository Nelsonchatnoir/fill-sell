# POINT DE REPRISE — TERMINAL CLOUD, 08/11/2026 soir (à lire EN ENTIER avant toute action)

Rédigé le 08/11 vers 20:15 (heure de Paris), à la demande de Nico, pour une session neuve ; **mis à jour après chaque point
terminé** (dernière mise à jour : 08/11 20:4x, migration 20261108200000 appliquée). Tout ce qui suit a été relu
en prod au moment d'écrire, sauf mention contraire.

## 000. NUIT EN AUTONOMIE (Nico valide tout, 08/11 ~23:55 → matin) — avancement
1. Push c6deec5 / 0658714 / f6f45e3 : FAIT (f574e40..f6f45e3, 23:5x).
2. Play Console vc37 : « Enregistrer » puis « Envoyer 14 modifications pour examen » FAIT (~23:57) ; état « Modifications en
   cours d'examen » (vérifications rapides de Google, puis envoi). ⚠️ « Publication gérée » ACTIVÉE : une fois validée par
   Google, la mise en ligne attend un clic « Publier » (vue d'ensemble de la publication). Brouillon vc33 (tests
   internes), fiche, prix, pays : non touchés.
3. Copie Cloud **0.6.183-cloud** (CRX 0.6.183.44921, commit f6f45e3) en service sur cloud-2 (23:55) ; postes de Nico et
   Virginie rouverts seuls en ~5 s sur la copie neuve. 2e preuve sur poste NEUF (Nicotest,
   `scripts/reparations/20261108p_nicotest_preuve_sso*.sql`, remis comme avant) : Vinted→Google, Leboncoin→Apple,
   Beebs→Google, Depop→Apple, chaque page du fournisseur en 390×844 ; aucun refus, aucune boucle, aucune erreur ; le refus
   des cookies de Vinted marche (clique:true).
4. Bandeau web : EN PROD (bfbb809 poussé ; `build.json` = `2026-11-08T23:52:06Z+10c8ac9` relu le 09/11 00:53). Relu en
   prod : (a) Chrome de Nico, session déjà ouverte, LECTURE seule (aucune connexion), compte client Cloud → Tableau SANS
   bandeau, `scrollWidth` = largeur (1536) ; la fenêtre de Chrome est maximisée et refuse 1440/390 (`resize_window`
   sans effet) — les largeurs 1440/390/SE/Pro Max restent prouvées par le harnais du vrai composant (point 4 plus bas) ;
   (b) `usage_logs` prod 09/11 00:28→00:53 : `cloud_bandeau_vu` ×3, 2 comptes, plateforme web seulement ; 0 vu par un
   compte qui a eu le Cloud ; 0 événement Android. Play Console relue 00:5x : vc37 toujours « en cours d'examen ».
5. OTA 2.9.168 : condition de Nico PROUVÉE et poussée (10c8ac9) — si la lecture des prix Apple échoue (erreur, vide,
   partielle, > 8 s, module absent), l'écran d'achat garde les prix de la 2.9.166, boutons actifs, essai décidé par le
   serveur ; Android inchangé. Preuves : `selftest:prix-boutique` vert ; rendu WebKit iPhone SE de la vraie feuille des
   offres en échec Apple (`scripts/apercu/offres-cloud.jsx?canal=apple-echec`) : 0 « … », 0 bouton inactif, l'achat
   part, 0 erreur. **OTA pas encore envoyée** : `npm run ota` refuse un arbre sale — le terminal « Problèmes » a son lot
   en cours dans le dossier partagé (il prévient quand c'est poussé) ; ensuite version 2.9.168, `npm run ota -- --essai`,
   `npm run ota`, relecture du canal et de la compatibilité.
6. C1 « plus besoin d'ordinateur » : FAIT (commit du 09/11 ~01:3x). Partout dans les écrans Cloud : titre de la feuille
   ouverte sur le Cloud « Plus besoin d'ordinateur. », accroche neuve du bloc Cloud des Réglages, ce que fait le Cloud
   (« … sans ordinateur, 24 h/24, et tes ventes sont suivies »), carte des Réglages payée, carte Cloud du parcours
   d'entrée, connexions, « Je débute », Synchroniser (« FillSell Cloud travaille… sans ordinateur »), mail « essai
   commencé ». Plus jamais « ordinateur éteint » / « computer off » dans une phrase Cloud (règle ajoutée à
   `selftest:cloud-ecrans`). Défauts VUS sur les captures et corrigés à la règle : (a) quota Free pas lu → « tu restes à
   les annonces par mois » → phrases justes (« tu gardes les quotas du plan Free »), fr/en, 3 phrases ; (b) « +24,99 €/ »
   | « mois » coupé à 375 px → gluon U+2060 après la barre ; (c) zone de toucher du « i » de « Comment tu veux
   publier ? » = 41-42 px (bordure sous `inset:-12`) → `-13.5` = 44 ; (d) liens légaux des feuilles d'achat (Conditions,
   Confidentialité) = 16,5 px → 44,5 px par marge intérieure compensée. Preuve : `node scripts/apercu/capture-c1-cloud.mjs`
   (vrais composants, Chrome 1440/390/320, WebKit iPhone SE/15 Pro Max, fr/en, 80 pages) : 570 contrôles verts ; avec
   `--comparer=` le plan de chaque texte est IDENTIQUE à l'avant sauf la phrase du quota et la coupure du libellé (rien
   d'autre ne bouge). ⚠️ Le mail « essai commencé » (`_shared/cloud-mails.js`) n'est PAS déployé : il part de fonctions
   de paiement (stripe-webhook, apple-iap-webhook, google-play-webhook, cancel-subscription, email-tunnel) — on ne les
   redéploie pas de nuit pour une phrase ; il partira au prochain déploiement de l'une d'elles.
   Remarque, hors C1 (rien touché) : le site vitrine dit encore « Chez FillSell, seul un compte eBay relié publie
   ordinateur éteint » (`site/contenu/fr/comparatif/fillsell-vs-reposter.md:158`, `crosslisting.md:221`, `concurrents.yml`)
   — faux depuis l'ouverture du Cloud, à reprendre avec Nico.
7. C4 « voir les autres formules et descendre » : PRÊT, PAS EN PROD — tout est dans
   `docs/enquetes/c4-descente-0911/RAPPORT.md`. Stripe prouvé en mode test (banc 23/23, horloges de test) : descente à
   l'échéance, droits et crédit du mois justes, annulation, Cloud intact ; deux dangers PROUVÉS et réglés dans le lot
   (une montée directe garde le schedule → refusée tant qu'une descente est prévue ; Stripe refuse une résiliation
   directe sous schedule → release puis résiliation). Dans `main`, inerte : règles pures (`selftest:descente-formule`
   28/28), écran Réglages › Abonnement fermé par `coin_config.descente_formule_ouverte` (absente), migration
   `20261109020000` NON appliquée (banc base jetable 14/14). Hors `main` : le lot des chemins d'argent
   (`lot-c4-paiements.patch` : changer-formule, stripe-webhook, cancel-subscription, create-checkout-session) — le garde
   `selftest:paiements-non-regression` les verrouille. Pourquoi pas en prod : iPhone et Android ne font jamais tomber un
   palier aujourd'hui (Pro resterait ouvert au prix Premium), niveaux App Store Connect à vérifier (crossgrade immédiat si
   Premium = Pro), portail Stripe face à un schedule non vérifié (réglage Stripe = ordre de Nico).

## 00. URGENCES DE LA NUIT (08/11, après 22:30) — jade60890 perdue, poste Cloud pris pour une extension
**A. « Boucle » Vinted (jade60890, iPhone, essai Apple 22:15:23 → arrêté 22:18)** — CORRIGÉ, DÉPLOYÉ, PROUVÉ.
- Cause (journal orchestrateur 21:15:50-56 UTC) : « Continuer avec Google » de Vinted ouvre `www.vinted.fr/web/api/auth/
  google_authorize`, chemin absent de la liste de Vinted → refusé à chaque toucher (« Cette page n'est pas la connexion »),
  5 touchers en 6 s → garde anti-boucle → fermeture « réessaie plus tard ». Leboncoin : « Continuer avec Apple », page Apple
  affichée (retour déclaré 22:16:12), fermée 17 s plus tard à l'étape mot de passe Apple (abandon, écran sain). Beebs :
  page OK (DataDome seul), « Continuer avec Google » → fenêtre Google rendue en 1366×767 sur l'iPhone (illisible), 13
  touchers, abandon. Alerte support@ : rien parti (4391256 ne couvrait que l'échec d'OUVERTURE).
- Correctif (f975a16 + 35ae0ec, orchestrateur 35ae0ec7b81d sur cloud-2, tests 206/206 dont la course 304369a) :
  `CHEMIN_AUTH_PLATEFORME` (API d'authentification des plateformes permises) ; refus < 4 s après un toucher = retour à la
  page + alerte, jamais une boucle ; vraie boucle = 2 nouveaux essais propres (purge + rechargement) avant le message final
  « l'équipe est prévenue » (plus jamais « réessaie plus tard ») ; `etat('erreur')` → alerte support@ ; fenêtres de
  connexion sociale ouvertes par une page de bureau = format téléphone ; « Refuser les cookies » reconnaît OneTrust de
  Vinted (« Cookies requis uniquement »).
- Preuve sur poste NEUF (Nicotest servi à la main, `scripts/reparations/20261108n_nicotest_preuve_sso*.sql`, nettoyé et
  vérifié : IP 2 au repos du 14/11, 0 poste, 0 coffre ; outil `serveur-cloud/outils/essai-connexion-sso.mjs`) : Vinted →
  Google « Accéder à l'application Vinted » 390×844 ; Leboncoin → Apple « app leboncoin » 390×844 ; Beebs → Google
  « Accéder à l'application Beebs » 390×844 (`vue_fenetre_telephone`) ; Depop : page de connexion stable. Aucun identifiant.
  Vinted ouvert 3 fois (1re et 2e : le bandeau OneTrust couvrait l'écran et notre refus ne le fermait pas — 2e défaut trouvé).
- hoosslocal@gmail.com = Nicotest (5322fa18) : ses connexions 19:49-19:57 (« remplacee », « navigateur_ferme ») = la preuve
  de la session précédente ; « essai_deja_pris » 19:42 = attendu. Parcours normal, aucun défaut.
**B. Poste Cloud pris pour une extension** — CORRIGÉ À LA RACINE (migration + get-pending-jobs).
- Cause : get-pending-jobs horodatait `extension_last_seen_at` pour le poste Cloud (capacité `poste_cloud`, build
  « …-cloud » dans extension_postes). Jade : 22:18:35 posé par son poste qui s'éteignait (Cloud arrêté 22:18:09) →
  « extension vue » au parcours d'entrée (22:18:58) → voie extension, relevés Vinted/Leboncoin/Beebs « queued ».
- Correctif : migration **20261108230000** (banc jetable 13/13, APPLIQUÉE + repair) : colonne `extension_ordinateur_vu_le`
  (vraie extension seule), comptes au Cloud arrêté remis d'aplomb PAR LA RÈGLE, déclencheur à l'arrêt du Cloud ; inverse
  `supabase/rollbacks/20261108230000_*`. get-pending-jobs : un poste Cloud ne signe que si cloud_voie ; une vraie extension
  signe aussi extension_ordinateur_vu_le. `selftest:poste-cloud-pas-extension` 13/13.
- Comptes remis d'aplomb par la règle : **jade60890** (mal aiguillée : 3 relevés en attente, l'app lui dit maintenant
  « Extension requise » / installer l'extension), **wtk8jnmnnf** (Cloud arrêté, aucun relevé en attente), Nicotest. Nico et
  Virginie (Cloud actif) : inchangés, leurs postes Cloud continuent de prendre leurs jobs.
**C. Pool d'IP sous la marge (22:52:35)** : 2 IP saines libres (3, 40 ; la 39 est réservée à Nico) pour une marge de 3 ;
  IP au repos 7 j : 4 (Jade, 15/11), 1 (wtk8, 15/11), 2 (Nicotest, 14/11) ; 5 et 6 expirées. Aucun achat : l'achat auto
  ne part que sous cloud_ip_stock_min = 2. **Décision de Nico (23:4x) : « on peut les réattribuer, celles où la connexion
  n'a jamais réussi »** → FAIT : migration **20261108233000** (cloud_ip_remettre_en_pool : le repos de 7 j ne vaut que pour
  une IP dont le compte a réussi une connexion pendant qu'il la tenait ; banc jetable 10/10 ; APPLIQUÉE + repair ; corps
  prod = migration ; inverse = corps prod) + orchestrateur **065871458a15** (entretien.js : contrôle de sortie tenté sans
  attendre les 7 j). IP 1 et 4 : repos, purge prouvée → sortent au prochain contrôle de santé (au plus 2/h). IP 2
  (Nicotest) : purge à refaire par l'entretien d'abord. Aucun achat.
**D. Commits LOCAUX non poussés** (push refusé par le classifieur, « Out-of-Place Publication ») : c6deec5 (poste ≠
  extension, get-pending-jobs **v353 déjà en service**), 0658714 (règle des IP, orchestrateur déjà déployé) + ce point de
  reprise. → Nico : `! git push origin main`. Le lot du point 4 (bandeau B, règle Android vc37, harnais) est rangé dans
  **git stash@{0}** (vert, non poussé) ; l'ancien stash C1 est devenu stash@{1}.

## 0. Décisions de Nico du 08/11 soir (2e session) — avancement, point par point
1. **OTA / écart Capgo — RÉGLÉ** : @capgo/capacitor-updater **revenu en 8.51.2** (retour de 7c82602). Preuves : le JS
   du module est identique entre 8.51.2 et 8.53.1 (seuls les noms de variables des `catch` diffèrent ; le natif seul
   change) ; les 3 280 appareils lus chez Capgo (API `/device`, curseur) sont TOUS en 8.51.2 (aucun 8.52.1/8.53.1 :
   la vc37 en 8.53.1 n'a jamais été installée) ; `bundle compatibility --channel production` : 9/9 modules compatibles.
   La 8.53.1 n'apportait que des statistiques plus justes (faux « download_fail ») : rien d'indispensable, et l'iPhone
   (pas de binaire neuf) restait de toute façon en 8.51.2. Garde : **`npm run ota`** (`scripts/ota/publier-ota.mjs`,
   règles `scripts/ota/regles-ota.mjs`, `selftest:ota-garde` 30/30) refuse tout module natif différent du canal, une
   version ≤ canal ou ≤ binaire (2.9.167 refusée), un arbre sale/non poussé/worktree ; envoie `--delta
   --fail-on-incompatible`, CLI épinglé 8.101.1. `npm run binaires -- --aab-seul` : AAB refait sans réécrire les
   secrets de prod. ⚠️ `npm install` RETIRE les paquets posés en `--no-save` (embedded-postgres, pg : bancs jetables) →
   `npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3` (selftest:ordre-photos rouge sinon).
2. **Play Console — AAB vc37 IMPORTÉ, ARRÊTÉ AVANT « Enregistrer » (2 avertissements, consigne de Nico)** :
   AAB refait `npm run binaires -- --aab-seul` sur **861420b** : `build/AAB-A-TELEVERSER-2.9.167-vc37/fillsell-android-2.9.167-versionCode37-861420b.aab`,
   18 205 224 o, sha256 a3239de9…6b9a, signature habituelle, updater natif 8.51.2, morceau `prixBoutique` (0dd0d2f) présent.
   Ancien AAB 8.53.1 (7c82602, sha 98a662f4) rangé dans `build/AAB-PERIMES/AAB-2.9.167-vc37-7c82602-updater-8.53.1-JAMAIS-LIVRE-…`.
   Relu avant : vc37 jamais utilisé chez Google (dernier 36) ; aucun brouillon en Production ; **brouillon inactif vc33
   (2.9.161) sur Tests internes, NON touché** ; tests fermés Alpha (vc20, juillet) et ouverts (inactif) sans brouillon ;
   « 14 modifications pas encore envoyées » = l'envoi refusé de la vc36 (release + fiche FR/EN : nom, descriptions,
   captures, image, vidéo ; sécurité des données ; accès) — elles repartiront avec l'envoi, sans retouche.
   Fait : Production › Créer une version (release n° 13) › AAB importé (37 (2.9.167), SDK cible 36) › notes copiées de la
   vc36 (identiques mot pour mot, FR + EN) › nom « 2.9.167 » › Suivant. Google affiche **2 avertissements** : pas de
   fichier de désobscurcissement (R8/ProGuard), pas de symboles de débogage du code natif — recommandations, non
   bloquantes. **Reste (sur feu vert de Nico)** : « Enregistrer » › Vue d'ensemble › « Envoyer les modifications pour
   examen » › relire « En cours d'examen ». Voie de téléversement (l'outil du navigateur plafonne à 10 Mo) : page
   relais sur 127.0.0.1 (`scratchpad/serveur-aab/serveur.cjs`, un seul fichier, arrêt seul en 20 min) ouverte en
   fenêtre par la Play Console, `postMessage` du fichier, empreinte vérifiée dans la page, injection dans le champ.
4. **Bandeau « NOUVEAU · FillSell Cloud » (maquette B « Le relais », CLAIR seulement) — INTÉGRÉ en haut du Tableau**
   (`src/cloud/BandeauCloudTableau.jsx`, règles pures `src/cloud/bandeauCloud.js`, `selftest:cloud-bandeau` 42/42).
   Montré seulement si : Cloud VENDABLE ici (`cloudOffreVendable` : offre ouverte, France, binaire ; **Android : minimum
   relevé à la vc37 2.9.167** — `CLOUD_BINAIRE_MIN_ANDROID`, la vc36 refusée ne vend rien ; s'allume seul quand Google
   publie la vc37), état du compte LU, pas client Cloud (essai compris), **jamais eu le Cloud** (essai pris/arrêté/refusé,
   abonnement passé : « Essayer 7 jours » y mentirait), pas refermé depuis 7 jours sur l'appareil
   (`fs_bandeau_cloud_ferme:<uid>`), ni parcours d'entrée ni « Me connecter » ouverts. Rien tant qu'une lecture manque
   (pas de clignotement). « Essayer 7 jours » = `lancerAchatCloud('bandeau_tableau')` (Stripe web, Apple iPhone). Aucun
   prix. Moins d'animations : tout arrêté, état final fixe. Mesure usage_logs : `cloud_bandeau_vu` (1 par ouverture de
   l'app), `cloud_bandeau_clic`, `cloud_bandeau_ferme` (+ `cloud_cta_click` origine `bandeau_tableau`). Lecture :
   `select feature, count(*), count(distinct user_id) from usage_logs where feature like 'cloud_bandeau_%' or (feature='cloud_cta_click' and metadata->>'origine'='bandeau_tableau') group by 1;`
   Vérif : `node scripts/apercu/capture-bandeau-cloud.mjs` (vrai composant, faux Supabase) — Chrome 1440 et 390, WebKit
   iPhone SE (320 !) et 15 Pro Max 430, FR/EN : 0 débordement, scène 132×88 entière, × hors scène/textes, titre /
   accroche / bouton sur une ligne, boutons ≥ 44 px, contrastes 6,08 à 15,1, Tableau décalé verticalement seulement,
   ×/rechargement retenu, essai pris / client / non vendable = rien. (WebKit de Playwright sous Windows rend Space
   Grotesk sans le gras — idem pour le reste de l'app, propre au moteur de test.)
6. **C3 (Cloud visible en Business) — DÉJÀ TENU, prouvé** : harnais `scripts/apercu/offres-cloud.jsx` +
   `capture-offres-cloud.mjs` (vraie feuille des offres, Cloud ouvert, fuseau Paris, faux Supabase) : Free = voie
   « Free + FillSell Cloud », Premium / Pro / Business = carte « Ajouter à ta formule … » (présentation, essai 7 jours,
   places, bouton) ; client Cloud = ligne « déjà actif ». Capture `screenshots-review/offres-web-390-business-grille.png`.
   **C4 (voir les autres formules et descendre) — NON COMMENCÉ, volontairement** : c'est un chantier de paiement complet
   (Stripe : changement programmé sans prorata via subscription schedule ; Apple : achat du palier inférieur du même
   groupe = bascule au renouvellement, à relire dans apple-iap-webhook ; Google : remplacement DEFERRED ; état « Ta
   formule passera à X le JJ/MM » + annulation = colonnes neuves → migration sur base jetable + feu vert ; bancs Stripe
   test + bac à sable Apple/Google). Rien à moitié (pas de pli « autres formules » sans descente qui marche).
3. **Landing + modales (toile https://claude.ai/artifact/W3TVVFa8FtcwKpuPvyq9Nu) — FAIT, version 6** : vrais logos
   (icônes des apps = celles des mails, `public/email/logo-*.png` ; App Store = pomme du badge officiel ; Google Play =
   triangle du badge officiel `site/medias/badges`) devant chaque plateforme ou store cité : liste du Cloud, pastilles
   iPhone/Android, ligne eBay, option Cloud, liste commune des tarifs, exemples des fiches (landing et app). Logo et nom
   insécables. Défauts vus et corrigés : chiffre « 1 500 / 1 200 / illimitées » sous l'icône ⓘ (tuiles), libellé
   « publications » collé au bord (tuiles de la landing). Vérifié : bureau 1536, téléphone 375, artboard App 390.

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
