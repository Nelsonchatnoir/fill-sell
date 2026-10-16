# Refonte — Étape 2 : état des lieux de l'onboarding et des pages vides (16/10/2026)

> Parcours fait au navigateur (Playwright, profil isolé — jamais le Chrome de Nico) avec un compte GRATUIT neuf,
> marqué test (`support+refonte.test.1610@fillsell.app`, `profiles.beta_flags.compte_test = true`, désinscrit des
> mails AVANT sa création : 0 ligne dans `email_logs`). Formats : téléphone 390 px puis ordinateur 1 280 px.
> Captures : `docs/refonte/captures/telephone/`, `ordinateur/`, `extension/` (+ `journal.json` : texte et boutons de chaque écran).
> Scripts rejouables : `scripts/refonte/parcours-nouvel-inscrit.mjs`, `scripts/refonte/popup-extension-vide.mjs`.
> Données réelles (lecture seule, 30 derniers jours au 15/10 23:00, comptes internes exclus).

## 1. Les chiffres : où les nouveaux inscrits décrochent (30 jours, 690 inscrits)

| Marche | Comptes | Part | Lecture |
|---|---|---|---|
| Inscrits | **690** | 100 % | |
| Ont terminé (ou fermé) le parcours d'entrée (`onboarded_at`) | 618 | 90 % | le drapeau est posé même en fermant l'app |
| Ont répondu « Où tu vends ? » | 456 | 66 % | Vinted 398 · Leboncoin 227 · eBay 117 · Beebs 108 · **Depop 0 (jamais proposée)** · « rien en ligne » 41 |
| Ont demandé le lien de l'extension | 324 | 47 % | |
| **Extension vue au moins une fois** | **150** | **22 %** | le mur n° 1 : 174 des 324 demandeurs de lien ne reviennent jamais sur un ordinateur |
| Ont une fiche | 318 | 46 % | 285 créées à la main / Lens |
| **Ont demandé une publication** | **150** | **22 %** | |
| Ont au moins une annonce publiée | 144 | 21 % | |
| Payants (toutes formules) | 17 | 2,5 % | |

Les cinq décrochages, en une ligne chacun :
1. **Téléphone → ordinateur** : 324 demandent le lien, 150 ont l'extension (−54 %). Le parcours dit « M'envoyer le lien » et
   s'arrête là ; rien ne ramène la personne devant son ordinateur.
2. **« Synchroniser » sans session** : relevés `absente` « page de connexion » — Beebs 46 comptes, Leboncoin 45, eBay 57,
   Vinted `session_absente` 62. Le premier contact avec une plateforme est un mur, dit après coup (« à connecter »).
3. **Demande jamais réclamée en 6 h** (Chrome fermé) : Vinted 17, Leboncoin 21, eBay 19, Beebs 15, Opla 25 comptes — la
   synchro demandée depuis le téléphone meurt sans que personne ne rouvre Chrome.
4. **eBay relié mais pas prêt** : 71 comptes reliés par l'API, 24 jamais vérifiés, 20 bloqués par l'état eBay (politiques /
   lieu d'expédition manquants), 6 sur un site étranger (Canada, Belgique, Autriche…), 3 révoqués. Seuls 30 sont prêts.
   4 publications eBay annulées sur « compte à finir », 7 sur « connexion requise ».
5. **Depop absente de l'entrée** : 0 compte n'a pu la cocher (l'écran propose Vinted, Leboncoin, eBay, Beebs) ; les
   seules publications Depop des nouveaux (2 comptes) attendent l'autorisation (`depop_acces`) ou une relance.

Journal d'entrée (`usage_logs onboarding_choice`) : plateformes 463 · continuer_telephone 212 · plus_tard 205 ·
releve_demande 174 · passe_releve 95 · passe_republication 98 · ebay_oauth_ouvert 85 · ebay_plus_tard 17 · passe_pseudo 33 ·
passe_debut 26 · premiere_annonce 20 · passe_plateformes 16 · passe_ebay 13.

## 2. Écran par écran : ce qui est confus, vide ou décourageant (classé par gravité)

### Grave (bloque ou perd la personne)
- **Extension (entrée, écran 3 ; Stock vide ; Ventes vides ; Réglages › Plateformes)** — captures tel. 08, 14, 18, 23 : le même
  mur est dit quatre fois, quatre façons (« M'envoyer le lien », « Extension requise », « Installer », « Installe
  l'extension… c'est elle qui connecte tes plateformes »). Aucun écran ne dit QUAND ni COMMENT la personne reverra son
  téléphone « réagir » après l'installation.
- **Réglages › Mes plateformes** (tel. 23) : quatre fois « pas encore vérifié » + « Je ne vends pas sur X » — pour un
  nouvel inscrit c'est un formulaire d'aveu, pas un chemin. Depop n'y figure pas (compte neuf), eBay y est deux fois
  (session ET compte API) sans dire laquelle compte.
- **Stock vide** (tel. 14) : « Jamais synchronisé · Extension requise · 1 point à régler · 0 Publier · 0 À régler ·
  Republication automatique (Pro) · Ajouter un article · 0 article · Ton stock est vide » — huit blocs pour dire « rien »,
  et le geste utile (photographier) est en dernier.
- **Popup de l'extension connecté, sans job** (extension 02) : cinq lignes « Pas encore vérifié / Je ne vends pas sur X /
  Vérifier » + Depop « Autoriser » + « Aucune annonce à publier » : la personne vient d'installer, on lui demande cinq
  gestes de vérification avant de lui dire que c'est bon.

### Moyen (confus)
- **Entrée, écran 1 « Où tu vends ? »** (tel. 06) : quatre plateformes sur cinq (Depop manque) ; « Je n'ai encore rien en
  ligne » est en bas, en gris, alors que c'est la réponse de 41 comptes.
- **Entrée, écran 4 « Tu ne ressaisis rien »** (tel. 09) : le bouton « Synchroniser mes annonces » est actif sans
  extension ; la ligne grise « Ton ordinateur doit être allumé… » est la seule à dire que ça n'arrivera pas maintenant.
  Après le tap : « Demande gardée — elle part dès que l'extension tourne » (tel. 10) — vrai, mais la personne n'a pas
  d'extension et ne sait pas que c'est la prochaine marche.
- **Entrée, écran eBay** (tel. 07) : promet « ventes détectées par l'API » sans dire que le compte eBay doit être
  VENDEUR (politiques, lieu d'expédition) — 20 comptes reliés restent bloqués là.
- **Arrivée dans l'app** : Lens plein écran « Scanne. On gère le reste. » (tel. 12/13) — le téléphone peut scanner,
  mais rien ne partira sans ordinateur : la promesse précède le mur.
- **Tableau (dashboard) vide** (ordi. 14) : « STOCK VIDE · À TOI DE JOUER — Tes annonces Vinted… » puis un bloc Lens :
  deux appels à l'action concurrents.
- **Ventes vides** (tel. 18) : explication juste, mais deux CTA d'offre (« Voir mes stats avancées », « Voir les offres »)
  sur un écran où la personne n'a rien vendu.
- **Réglages** (tel. 22) : « Comptes connectés 0 sur 4 », « Adresse de remise à renseigner », « Republication automatique
  Inactif » : trois manques listés sans ordre.

### Léger
- Bandeau traceurs avant la carte de connexion (tel. 01) ; formulaire de création sans mot sur le mail de confirmation
  (tel. 03) ; écran de confirmation « Ton inscription est en cours » (tel. 04) correct.
- Entrée, écran pseudo (tel. 12) : facultatif, en avant-dernière position.
- Stats vides (tel. 19) : tirets « -- » partout, pas de phrase.
- Popup sans session (extension 01) : juste, court.

## 3. Chargements et attentes (constat, avant l'étape 1)
- Trois vocabulaires pour un `pending` (« En attente », « En file », « Dans la file… », « En attente de son tour », « En file
  d'attente »), cinq calculs de la nature d'un `needs_user`, une quarantaine de délais promis (« ~5 min », « vers 17:36 »,
  « toutes les heures ») — inventaire complet : `docs/refonte/inventaire/`. Corrigé à l'étape 1 (six mots, une source, zéro délai).
- Synchroniser : « Environ N min » (retiré), constellation animée, barre par plateformes.
- Barre de progression des jobs : pourcentage glissant sur des durées médianes (jamais affichées) — à décider.

## 4. Direction visuelle (une seule, qui garde l'identité)
L'app a DÉJÀ une identité tenue : Space Grotesk, canvas `#EDEAE0`, papier `#F6F5F1`, encre `#10201B`, sarcelle `#2F9E90` /
`#1B6E62`, ambre `#E8956D`, rayons 16-24, dégradé 120° sarcelle (`src/components/ui.jsx`, `src/stock/jetons.js`,
`src/entree/theme.js`). Ce qui dérive : le popup de l'extension (sarcelle `#1D9E75`, pêche `#F9A26C`, gris `#F5F6F5`), le
Lens (plein écran dégradé), quelques ambres (`#FEF3C7` vs `#FFF6E3`).
Direction retenue pour les maquettes (étape 3) :
- **Jetons** : ceux de `jetons.js` (teal, tealDeep, menthe, ambre, rouge réservé à « pas partie »), le popup s'y aligne.
- **Typo** : Space Grotesk seule ; titres 26/1.15 −0.03em, corps 14/1.55, secondaire `#5C6560` (4,9:1).
- **Composants de base** : carte 20 px, bouton primaire 52 px pleine largeur dégradé, pastille d'état (point + mot : les six
  mots de l'étape 1), ligne « geste » (icône 40 px + titre + un seul bouton), écran vide = une phrase + LE geste.
- **Animations** : transform/opacity seulement, ≤ 400 ms en entrée, aucune boucle sur du texte ; une seule animation
  « vivante » par écran (point qui respire) ; `prefers-reduced-motion` = aucune animation, état d'arrivée direct ;
  mesuré (`node scripts/refonte/maquettes-verif.mjs`, Chromium 390 px, processeur ralenti ×6) : peinture médiane ~25 ms
  par écran, pics isolés < 200 ms, seuil refusé à 400 ms ; « réduire les animations » = 0 animation en cours.

## 5. Maquettes (étape 3) — à valider par Nico, rien en prod

- **Les 25 écrans** (onboarding 8, connexion des 5 plateformes, états vides 9, attentes 3), chacun cliquable avec sa ligne
  « ce qui change ». Trois façons de les ouvrir sur un téléphone, détaillées dans `docs/refonte/maquettes/LISEZMOI.md` :
  le fichier fixe `maquettes-statique.html` (sans JavaScript, envoyé à Nico le 16/10 à 07:50), l'adresse publique de dépannage
  `raw.githack.com/Nelsonchatnoir/fill-sell/main/docs/refonte/maquettes/index.html` (page d'avertissement à passer une fois ;
  n'existe que parce que le dépôt est public), et la prévisualisation Vercel.
- **Pourquoi pas encore Vercel** : la nuit, l'intégration n'a pas eu le droit de créer un projet (`403` sur `fillsell-maquettes`)
  et le projet `fill-sell` protège ses prévisualisations par une connexion Vercel (`ssoProtection all_except_custom_domains`).
  Le 16/10 au matin, une prévisualisation sur `fill-sell` (cible preview, aucun réglage touché, fichiers prêts dans
  `docs/refonte/maquettes/vercel-previsualisation/`) a été refusée par le classifieur de Claude Code (« Production Deploy ») :
  feu vert de Nico requis, puis lien partageable (`patch_url_protection_bypass`) qui s'ouvre sans compte. À la main :
  `npx vercel login` puis `npx vercel deploy docs/refonte/maquettes --yes`.
- **L'artefact Claude** https://claude.ai/artifact/69UNak2x84i3NVY7GuMPTz (privé) s'ouvre sur ordinateur ; l'app Claude iOS
  l'a refusé le 16/10 (« This browser isn't supported »).
- Sources : `docs/refonte/maquettes/index.html` + `maquettes.js` (vanilla, aucun framework) ; captures
  `docs/refonte/captures/maquettes/` ; vérification `node scripts/refonte/maquettes-verif.mjs [adresse]`.
