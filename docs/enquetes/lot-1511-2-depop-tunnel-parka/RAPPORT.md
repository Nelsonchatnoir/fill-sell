# Lot du 15/11 (2) — Depop dans les mails, « Comment ça marche », parka Leboncoin (heure de Paris)

Aucun mail à un utilisateur (4 mails de test à l'adresse de Nico seulement), rien chez Stripe, aucun quota, prix ni offre
changé, aucun autre job de joshua touché, rien publié sur son compte.

## Point 1 — Depop oublié dans les mails

**Trouvé** : `supabase/functions/_shared/plateformes.ts` est la source unique des plateformes des mails, mais
`SLUGS_PLATEFORMES_PROPOSEES` excluait Depop depuis le 09/10 (« jamais proposée dans un mail ») — d'où « Vinted,
Leboncoin, eBay et Beebs » et quatre logos dans le welcome, et « Vinted · Leboncoin · eBay · Beebs » au pied de tous les
mails du gabarit. Seul gabarit hors source unique : le blast manuel `blast_relaunch_aout` (liste, logos et « Quatre
plateformes / les trois autres » en dur dans email-tunnel).

**Changé** :
- `plateformes.ts` : Depop proposée (ordre Vinted, Leboncoin, eBay, Beebs, Depop ; Opla toujours exclue) ;
  `nombreEnLettres` (« cinq », « quatre autres ») pour tout mail qui compte les plateformes.
- Welcome (à l'inscription et rattrapage J+1, FR/EN, Cloud et sans Cloud) : « … eBay, Beebs et Depop » + 5 logos ; pied de
  carte complété dans tous les mails du gabarit (comment ça marche, relances, lien d'installation, résiliation, impayés,
  veille Cloud, mails Cloud, ventes, rafale…) ; `blast_relaunch_aout` lit liste, logos et nombre à la source.
- Logo Depop : `public/email/logo-depop.png` existait déjà (PNG 128×128 RGBA comme les autres, servi en 200) ; rien
  changé dans `public/`. Pour que cinq logos tiennent sur un téléphone de 360 px (5 × 52 px = 323 px > 264 px utiles),
  `email-template.ts` les ramène à 44 px sous 620 px de large ; ordinateur inchangé (52 px). Textes, ton, signature et
  textes Cloud de ce matin inchangés.
- Verrou **`selftest:mails-plateformes-completes`** (353 rendus FR/EN, Cloud/sans Cloud, chaque événement Cloud, blast
  rendu par la vraie fonction) : casse si une liste ou un bandeau n'a pas les cinq, si Opla apparaît, si un nombre est
  faux, si le bandeau ne tient pas à 360 px, si un mail n'est pas classé, ou si une liste/un logo/un nombre est en dur
  dans un gabarit. ROUGE avant : 31 verts, 30 rouges sur 61 ; VERT après : 61/61. Les verrous « à l'octet »
  (`mails-cloud-sans-ordinateur`, `deja-vendu-mail`, `ventes-prix-inconnu`) n'admettent que l'insertion de Depop.

**Preuve** : simulation (`envoyer_mail_ponctuel`, réponses 52710 → 52713, « simulation »), puis un envoi de chaque
mail à l'adresse de Nico (52717 → 52720, `envoyes: 1`, 12:09) : « [Test] Bienvenue sur FillSell (sans Cloud…) »,
« [Test] … (Cloud…) », « [Test] Ce que FillSell fait sans que tu y penses (pied avec Depop) », « [Test] Relance d'août
(manuelle, cinq plateformes) ». Capture à 360 px : texte « Vinted, Leboncoin, eBay, Beebs et Depop », cinq logos sur
une ligne.

## Point 2 — « Comment ça marche » n'atteignait presque personne

**Trouvé** : `email-tunnel` lisait `email_tunnel_candidates()` par un rpc NU : 3 777 comptes, sans ordre, et PostgREST
coupe à 1 000 lignes sans erreur ; les inscrits de la veille tombaient presque tous hors de la tranche (12 envois en
12 jours pour 243 inscrits). Le rattrapage J+1 du welcome et le blast manuel avaient le même trou. Le plafond de
2 mails / 24 h n'était appliqué qu'aux envois ponctuels, pas au tunnel.

**Changé** (`_shared/candidats-tunnel.js`, `email-tunnel`, `_shared/plafond-mails.js`) :
- liste lue par pages (ordre stable : inscription puis id), une page en erreur arrête tout (rien envoyé) ;
- J+1 : seulement la fenêtre de la règle (inscrits de la VEILLE, filtrés par la base) — aucun rattrapage : qui l'a
  manqué les jours d'avant reste hors fenêtre ; désinscriptions marketing respectées comme avant (registre + porte) ;
- plafond STRICT de 2 mails de notre initiative par personne sur 24 h glissantes (email_logs), ce passage compris ;
  un mail DEMANDÉ par la personne ne compte pas (lien d'installation `extension_link`, réponse du support
  `support_reponse` — liste fermée ; sans cela, 122 des 364 inscrits du 01 au 14/11, qui avaient demandé le lien le
  premier jour, ne l'auraient jamais reçu) ; un compte au plafond est retenu ce jour-là (`retenus_plafond` dans la
  réponse), jamais rattrapé ;
- le blast manuel lit aussi la liste entière (il ne part que sur commande).
- Verrou **`selftest:tunnel-candidats-complets`** (19) : casse si la liste peut être tronquée au-delà de 1 000, si une
  page en erreur passe pour la fin, si un rpc nu revient, si le J+1 lit autre chose que la veille, ou part sans le
  plafond. ROUGE avant : 6 rouges sur 18 ; VERT après : 19/19. `selftest:plafond-mails` mis à la règle.

**Envois attendus après correction** (relu en base, inscrits du 01 au 14/11) : 364 inscrits, 2 désinscrits, 10 au
plafond → **352, soit ≈ 25 « comment ça marche » par jour** (9 à 79 selon le jour). Premier passage corrigé : cron du
16/11 à 10:00 (inscrits du 15/11). Aucun envoi manuel : le passage du 15/11 (10:00) avait déjà eu lieu.

## Point 3 — Parka de joshua bloquée à la catégorie Leboncoin

⚠️ Les heures du constat étaient en UTC : essais à **09:37, 09:55, 10:11, 10:27** (Paris) ; dépôts réussis du même
compte à **10:31** (boucles Harley) et **10:44** (Phat Farm).

**Trouvé** :
- Journal de fenêtre du job (`platform_fields.work_window_state`) : les quatre fins à l'étape « categorie »
  (`fins` : 09:37:50, 09:55:16, 10:11:18, 10:27:19) ; au 4e essai, étape « categorie » posée à 10:27:18.032 et échec à
  10:27:19.535 — exactement le `sleep(1500)` de `selectCategory`, puis UN seul regard. Fenêtre de travail minimisée,
  onglet inactif, page « complete ». Les dépôts Harley et Phat Farm, même fenêtre, même état, sont passés.
- Reproduit sur le compte Leboncoin de Nico (son Chrome, page de dépôt, titre exact, rien déposé, titre effacé ensuite) :
  Leboncoin affiche « Choisissez une catégorie suggérée » — **Mode › Vêtements**, Loisirs › Sport & Plein air,
  Famille › Vêtements bébé — et « Ou choisissez une autre catégorie » / bouton **Choisissez**, ~0,5 s après la frappe,
  dès que son classifieur (`/api/ad-classifier/v2/classify`, ~0,35 s après la dernière frappe) a répondu ; le bloc
  disparaît pendant la frappe. Même chose pour un titre absurde (« zzqxv wkkp »), pour « PSG 2002-2003 », pour les
  titres Harley et Phat Farm. Le bloc ne dépend pas de requestAnimationFrame (testé).
- Donc : rien n'est propre à ce titre ; l'extension regardait une seule fois, 1,5 s après le titre, un bloc que
  Leboncoin rend plus tard dans une fenêtre minimisée (minuteries bridées par Chrome). Même erreur sur 6 tâches en
  30 jours (joshua ×3 dont 2 passées plus tard, un autre compte ×3 le 12/11, annulées). Le repli sur le sélecteur
  manuel n'était pas en cause : bouton « Choisissez » bien trouvé quand le bloc est là.

**Changé, pour tous** (extension **0.6.191**, `leboncoin.js`, `background.js`) : le bloc de catégorie est ATTENDU
jusqu'à 20 s (après les 1,5 s d'avant) ; page toujours cachée et rien après 4 s → la fenêtre de travail devient visible
sans le focus (message `ONGLET_TRAVAIL_VISIBLE` → geste existant de l'onglet muet, re-minimisée après le job) ; rien
après 10 s → le titre est redit à Leboncoin (événement « input ») ; puis la suggestion qui correspond à NOTRE catégorie,
sinon le sélecteur manuel (trouvé aussi par son libellé « Ou choisissez une autre catégorie ») — jamais la suggestion
d'une autre catégorie ; rien en 20 s → même motif qu'avant + relevé (attente, page cachée/visible, fenêtre, titre,
listes). Cas normal (bloc là à 1,5 s) strictement inchangé.
- Verrou **`selftest:lbc-categorie-attente`** (fonctions réelles extraites de leboncoin.js) : bloc tardif → Mode ›
  Vêtements ; suggestions sans notre catégorie → sélecteur manuel ; page cachée → fenêtre montrée ; rien → relevé ;
  libellé ; cas normal inchangé ; service worker ; relance après mise à jour. ROUGE sur le code d'avant : 12 échecs ;
  VERT après.

**Relance** : la parka ne peut passer qu'avec la 0.6.191 sur le PC de joshua (il a la **0.6.186**). La relancer
maintenant la referait échouer. La règle de relance après mise à jour (`_shared/relance-apres-maj.js`, entrée
`lbc_categorie_bloc_attendu`, build `2026-11-15T10:36:59Z`) la relance **une seule fois**, toute seule, dès que
`profiles.extension_build` de joshua atteint la 0.6.191 : status pending, error null, champs needs_user_* /
next_action_after / processing_since retirés, needsUserAttempts à 0, erreurs archivées CONSERVÉES (handler-watch,
balayage 3 min). Le résultat se lira après son passage en 0.6.191 (téléversement CWS par Nico, examen, mise à jour
automatique). Aucun autre job de joshua touché.

## Livraison
- Commits : 84a8d8f (extension 0.6.191), b8d189c (mails, tunnel, relance après mise à jour, EXTENSION_LAST_COMMIT),
  plus ce rapport et l'état de prod — un push.
- Suite **791/791** (par morceaux), lint identique à HEAD (une erreur « chrome non déclaré » de plus dans
  leboncoin.js, même nature que les 583 existantes), build:essai vert.
- Fonctions (verify_jwt relu avant et après, inchangé) : email-tunnel 102 → **103**, handler-watch 205 → **206**,
  update-job-status 201 → **202**, push-ventes 32 → **33**, stripe-webhook 85 → **86**, apple-iap-webhook 62 → **63**,
  google-play-webhook 55 → **56** (false) ; envoi-ponctuel 18 → **19**, send-extension-link 29 → **30**,
  cancel-subscription 67 → **68**, create-checkout-session 87 → **88** (true). Ces fonctions embarquaient aussi des
  changements déjà sur main et pas encore servis : `lbc-forfait.js` (fea32ce) pour handler-watch ; `cloud-prix.js`,
  `cloud-rappel-veille.js`, `changement-formule.js` (5fa2c74 : moyen de paiement nommé, Klarna) pour les webhooks,
  push-ventes, send-extension-link et cancel-subscription.
- **Extension : seul zip à téléverser** `C:\Users\nicol\fill-and-sell\build\CWS-0.6.191-A-TELEVERSER\fillsell-extension-0.6.191-cws.zip`
  (BUILD_ID 2026-11-15T11:07:11Z+b8d189c) ; la 0.6.190, jamais téléversée, est écartée
  (`build/CWS-PERIMES/REMPLACEE-PAR-0.6.191-1511-fillsell-extension-0.6.190-49a3412-cws.zip`).
- Pas d'OTA ni de changement web nécessaires (rien dans `src/`).
