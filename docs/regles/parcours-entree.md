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
