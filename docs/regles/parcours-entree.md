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

## ⛔ 15/11/2026 soir (ordre de Nico) — Meta : deux pixels, et l'inscription envoyée aussi par le serveur (API de conversions)
- `src/utils/metaPixel.js` initialise les DEUX pixels (921207750637065, compte pub perso où tourne la campagne ;
  1425992186075849 « FillSell Web ») avant tout événement ; un `track` part vers les deux, jamais `trackSingle`. Même
  consentement qu'avant, jamais dans l'app native. Verrou `selftest:meta-pixel-deux-pixels`.
- Inscription WEB avec accord au bandeau SEULEMENT (décision de Nico du 15/11) : `src/utils/metaInscription.js` tire un
  event_id, le pixel envoie CompleteRegistration avec `eventID`, et `navigator.sendBeacon` demande à la fonction
  `meta-inscription` (verify_jwt false, garde maison) d'envoyer le MÊME event_id aux deux pixels par l'API de
  conversions : compte relu en base, né il y a moins de 30 min, une seule fois par compte (usage_logs
  « meta_capi_inscription »), e-mail et identifiant en SHA-256, fbp/fbc, IP, navigateur, adresse de la page — rien
  d'autre. Réponse 202 immédiate, envoi en arrière-plan : jamais une inscription ralentie. Compte NOUVEAU seulement
  (adresse déjà inscrite = `identities: []` : rien) ; Google/Apple sur le web : mesurés à la première session (< 10 min).
- Jetons : secrets `META_CAPI_TOKEN_<pixel>` (jamais dans le code). Sans jeton, la fonction note `jeton_absent` et
  n'envoie rien. La politique de confidentialité (Legal.jsx) dit ce qui part. Verrou `selftest:meta-capi-inscription`.

## ⛔ 17/11/2026 (ordre de Nico) — API de conversions Meta : elle envoie vraiment, l'essai et le premier paiement aussi
- Cause du 15/11 au 17/11 : les secrets n'avaient JAMAIS existé (Meta avait refusé les jetons) ; `jeton_absent` à chaque
  inscription, sans alerte. Rapport : `docs/enquetes/meta-capi-1711/RAPPORT.md`.
- **Un seul pixel serveur** (`PIXELS_CAPI`) : FillSell Web 1425992186075849, jeton en secret
  `META_CAPI_TOKEN_1425992186075849` (généré « sans Dataset Quality API », réglage irréversible évité). Le pixel
  921207750637065 appartient au compte pub PERSO, hors portefeuille : Meta n'y donne aucun jeton → navigateur seulement
  (`PIXELS_NAVIGATEUR_SEUL`), décision de Nico du 17/11. Le navigateur envoie toujours aux deux.
- **Accord web seulement** (décision de Nico du 17/11, qui confirme le 15/11) : une inscription faite dans l'app n'envoie
  rien (ni bandeau ni ATT dans l'app). La trace `meta_capi_inscription` EST la preuve de l'accord ; elle garde
  `contexte` { fbp, fbc, ua } (jamais l'IP, jamais l'e-mail) pour les événements d'après.
- **StartTrial / Subscribe / Purchase** (`_shared/meta-capi-envoi.js`, branchement Deno `_shared/meta-capi-deno.ts`),
  pour un compte qui a cette trace, quel que soit le canal : `mailsCloud` et `alerteSeuleCloud` (essai_debut → StartTrial
  au prix de la 1re échéance lu à la source ; paiement d'un début payant ou d'une fin d'essai → Subscribe + Purchase au
  montant payé) et `payment_alert` d'email-tunnel (paiement crédité des trois canaux : abonnement → Subscribe + Purchase,
  pack → Purchase). Une fois par compte et par nom (« le premier », trace `meta_capi_evenement`, event_id stable par
  compte et par nom) ; Purchase jamais sans montant ; Stripe en « website » avec le navigateur gardé, Apple/Google en
  « system_generated ». Jamais un compte de test (`estCompteDeTest` : nicolas.svobodny*, hoosslocal, googlereview,
  test*, nicotest*), jamais un achat de test. En arrière-plan (`EdgeRuntime.waitUntil`) : un webhook n'attend jamais Meta.
- **Échec jamais muet** : statut par pixel (`envoye`, `jeton_absent`, `http_<code>:…`, `echec:…`), ligne d'erreur qui
  nomme le secret, et UNE alerte à support@ (`meta_capi_alerte`) au 4e échec d'affilée des traces suivies (une par série).
- **Essai** (« Tester les événements ») : POST `{ essai_meta: { test_event_code, noms } }` à `meta-inscription` avec
  `x-cron-secret`, depuis la base (`net.http_post` + `public.cron_secret()` : le secret ne sort jamais) ; compte fictif,
  IP de documentation, trace `meta_capi_essai` hors série. Verrou `selftest:meta-capi-envoi`.

## ⛔ 18/11/2026 soir (lot T1 de Nico, maquettes validées le 18/11) — LA REFONTE DE L'ACCUEIL, jusqu'au Stock
- **Mesuré le 18/11** (49 inscrits) : 28 « pas d'ordinateur », 27 sur « Choisis ta formule » (3 gros prix, « Passer » en
  haut), 0 vrai clic sur une offre, 19 « Passer », 0 essai ; 3 synchros, 2 publications. Les 2 derniers essais ont été pris
  sur la carte Cloud du Stock. Maquettes : `C:\Users\nicol\fill-and-sell-design\accueil-1811\`. Récit :
  `docs/enquetes/accueil-1811/RAPPORT.md`.
- **Ordre** (`src/entree/plan.js`) : « Où tu vends ? » → téléphone (app iPhone/Android OU navigateur de téléphone) :
  « As-tu un ordinateur ? » → Non : l'écran Cloud UNIQUE `cloud_offre` (Pro + Cloud) → essai pris : « Connecte tes
  comptes » → synchro → pseudo (si aucun nom) ; « Plus tard » sur le Cloud : `sans_cloud` (« Pour publier, il te faut un
  ordinateur », le lien par mail, retour au Cloud possible, « Continuer sans publier pour l'instant ») ; Oui :
  l'extension (le lien par mail, le Cloud en alternative) → synchro → pseudo. Ordinateur (web) : pas de question,
  l'extension tout de suite. Cloud seul (formules non vendues sur ce compte) : l'écran `cloud` d'avant. Retirés : voie,
  présentation, « Choisis ta formule », « Rien à payer avant le … » (fusionné dans l'écran Cloud, date du 1er
  prélèvement comprise), remontées, récap, « Ta formule ». La sortie mène TOUJOURS au Stock.
- **Plus de « Passer » en haut** : une flèche de retour (jamais pendant un achat ni depuis « Connecte tes comptes ») ;
  chaque écran a sa sortie en bas, qui dit ce qu'elle implique. Le changement d'écran glisse dans le sens du parcours.
- **L'essai** n'est annoncé que si la carte d'offre le porte (`cartesFormulesCloud` : droit lu + boutique ;
  `regles.offreAccueil`) ; Business + Cloud n'en a jamais. Sinon : « Publie sans ordinateur », la vraie raison, le prix
  d'aujourd'hui. Phrase validée : « 0 € aujourd'hui, puis {prix}/mois, résiliable à tout moment » (décision 1 : « à tout
  moment », partout, iPhone, Android, web — « Résiliable en 1 clic » d'avant aligné aussi).
- **Jamais « Installer l'extension » sur un téléphone** : le lien par mail (`send-extension-link`), toujours.
- **Journal** (`usage_logs` onboarding_choice) : `etape_vue { etape, rang, total, chemin, appareil }` sur chaque écran ;
  `cloud_offre_vue { essai_propose, formule_proposee, raison_sans_essai, appareil }` une fois par décision affichée (jamais
  pendant la lecture) ; `cloud_offre_clic`, `cloud_plus_tard`, `cloud_autres_formules`, `formule_essai_*` /
  `formule_achat_*`, `lien_mail_demande` / `lien_mail_envoye`, `cloud_revu`, `continuer_sans_publier`,
  `cloud_alternative`, `retour { depuis }`, `releve_plus_tard`, `parcours_termine { destination, chemin, appareil }`.
- **Après l'accueil** : la carte Cloud EN TÊTE DU STOCK (`cloud/CarteCloudStock.jsx`, montée par App au-dessus du Stock :
  grande pour un compte gratuit, discrète pour un abonné) ; « Republie ton stock en 1 clic » (`stock/CarteRepublierStock`)
  AJOUTÉE sous le titre après la 1re synchro réussie, qui ouvre le geste existant « Remonter mes annonces » (coût affiché
  avant de valider ; cadence et quotas inchangés) ; « Pour bien démarrer » en tête du Tableau vide. **Le Stock garde
  tout** (retouche n° 1 de Nico) : liste de contrôle de 49 éléments, `selftest:stock-tout-reste`.
- **Propositions Cloud** (`cloud/propositionsCloud.js`, décisions 3 et 5) : 7 jours après un paiement (ligne coin_ledger
  de source « payment », ou un palier qui monte dans la session) AUCUNE proposition (bandeau, carte, fenêtre automatique) ;
  abonné payant : seulement la carte discrète du Stock, jamais de bandeau ; le bandeau du Tableau n'apparaît pas les 7
  premiers jours du compte. Les offres que la personne ouvre elle-même : toujours.
- **Offres** (`ConversionModal`) : plus d'interrupteur « Sans Cloud | Avec Cloud » ; chaque formule porte SOUS sa carte
  sa version + Cloud (prix, essai seulement s'il est vrai, bouton) — choisie AVANT de payer. Les achats : inchangés.
- **1re publication** : la retouche photo est CACHÉE pour une formule sans retouche (palier gratuit ; quota inconnu =
  caché), nouvel écran et écran classique (décision 2) — `selftest:retouche-free-cachee`.
- **Montée Google au prorata** (décision 4, remplace la décision 5 du 14/11) : hors essai CHARGE_PRORATED_PRICE (la
  différence, l'échéance gardée) ; pendant un essai, toujours le prix entier. Réglé par l'app (module patché déjà dans
  les binaires) : OTA. Apple : sa règle (prix plein, remboursement des jours non utilisés). L'écran dit le montant estimé
  (`lib/montantMontee.js`) sur les deux. Une montée Google de MÊME palier (Pro → Pro + Cloud) ne rouvre pas de cycle
  (`upgrade_monthly_grant` → no_upgrade_needed, aucun crédit) ; (19/11, ordre de Nico) elle est CONFIRMÉE quand même, au
  montant payé lu dans la commande Google : « Paiement reçu », Meta, mail « Ta formule passe à … » — règle commune
  `_shared/confirmation-paiement.js` (`docs/regles/mails-paiements-comptabilite.md` § 19/11).
- Verrous : `selftest:accueil-refonte`, `propositions-cloud`, `montant-montee`, `retouche-free-cachee`,
  `stock-tout-reste` (rouges sur le code d'avant, verts après) ; mis à jour (changement voulu) : entree-ordre,
  formules-cloud-ferme, formules-cloud-offres, onboarding-trois-jauges, achat-formule-issue-vraie,
  changement-formule-boutique, abonne-ajoute-le-cloud, textes-paiement-verite, cloud-bandeau.

## ⛔ 19/11/2026 (ordre de Nico) — l'écran d'inscription / connexion = la maquette 01
- `src/auth/EcranConnexion.jsx` (affichage seul) : l'orbite (icône FillSell, les cinq plateformes), « Publie une fois.
  Vends partout. », « Continuer avec Apple » (iPhone : feuille Apple native ; web : OAuth ; **jamais sur Android**),
  « Continuer avec Google », « Continuer avec mon e-mail », « Déjà un compte ? Se connecter », les mentions (`/legal#cgu`,
  `/legal#confidentialite`). Web large (≥ 900 px) : deux colonnes, l'orbite à droite avec sa légende.
- App.jsx : `etapeConnexion` 'choix' (l'écran 01) puis 'email' = le formulaire d'AVANT, champ pour champ (adresse ×2,
  mot de passe, oublié, « J'ai déjà reçu un code »), avec un retour. Les gestes sont ceux d'avant (handleAppleSignIn,
  handleOAuthSignIn, handleSignup, handleLogin, handleForgot ; écran du code à 6 chiffres inchangé).
- `/login?mode=login` ouvre directement la connexion (« Me connecter » de la page de confirmation, « Revenir à la
  connexion » de l'écran du code) ; `?mode=signup` (le site) : l'écran 01.
- Verrou `selftest:ecran-connexion` (48 ; 32 rouges sur le code d'avant, les 16 gestes d'avant verts des deux côtés).
