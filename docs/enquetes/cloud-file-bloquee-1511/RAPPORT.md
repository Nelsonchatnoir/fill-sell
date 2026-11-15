# 15/11/2026 — Cloud : file de 13e274de à l'arrêt, gestes « À régler » impossibles au Cloud

Heure de Paris partout. Compte désigné par son id8 (13e274de : Pro, essai Cloud, poste cloud-2). Aucun mail envoyé, rien
chez Stripe, aucune annonce ni tâche de la cliente touchée à la main. Commit fea32ce.

## Point 1 — la jupe de 13e274de ne partait plus

**Cause, preuve à l'appui.** Ce n'est ni une boucle sur les retraits Beebs ni un blocage de tout Leboncoin. C'est la règle
du 18/10 « un dépôt payant à la fois » (`_shared/lbc-forfait.js`, `partagerCandidatsAPayer`) : compte Leboncoin pro hors
forfait, le dépôt « Lot 4 bracelets » (c7c98610) attendait « Valider et payer » depuis le 14/11 21:47. Toute autre
publication Leboncoin restait donc en file, **sans rien écrire**. Journal de get-pending-jobs, à chaque passage, toutes les
2 min depuis 21:47 (relu de 23:45 à 00:15) :
`compte Leboncoin pro, dépôts à payer par la personne (dernier mur 2026-11-14T20:47:00.773Z) → aucune publication servie
(un dépôt attend « Valider et payer »), 1 en file, 0 republication(s) retenue(s)`.
Dans le même passage, les autres retenues sont saines :
- les 6 retraits Beebs sont retenus sans aucune tentative consommée (« session connue morte », texte du Cloud déjà écrit) ;
- la republication Vinted est dite « republication automatique en pause ».

Le poste ne tourne pas en boucle. Il reste allumé pour les retraits en attente (motif « retrait »), et il a publié une
annonce Vinted à 03:09.
Ce n'est pas une régression du correctif d'af37fa49 du 14/11 (`_shared/file-sans-blocage.js` : la place d'une
republication retenue, et le tour au poste Cloud). C'est une variante non couverte : une retenue **voulue**, mais muette.

**Règle corrigée (tous les comptes).** Une publication gardée en file derrière un dépôt à payer porte :
- le marqueur `attente_depot_payant` = { job, titre, etat, depuis } ;
- le message qui NOMME ce dépôt : « … Le dépôt de « Lot 4 bracelets… » attend ton « Valider et payer » (dans « À régler ») :
  celle-ci sera préparée juste après, toute seule » ; au bout de 24 h sans paiement, « … n'a pas été validé : valide-le ou
  annule-le ».

Ce marquage suit quatre règles :
- il est écrit une fois par dépôt et par état, 40 au plus par passage, en compare-and-swap sur pending (aucune ligne
  inchangée réécrite) ;
- il est levé (trace `attente_depot_payant_levee`) dès que la publication n'est plus retenue ainsi ;
- l'app la dit « En pause » avec cette raison (`src/utils/fileDesJobs.js`, `depotPayantEnPause`), jamais « En file » ;
- la cadence ne change pas, et un dépôt payant reste préparé un à la fois.

Verrou **`selftest:attente-depot-payant-visible`** : rouge sur le code d'avant (la règle n'existait pas), 28/28 après.

**Preuve en base.** get-pending-jobs v376 est déployé à 01:14. Au passage de 01:15:04, la jupe (99c09d0f) porte le
marqueur et le message ci-dessus, état `a_payer`. L'attente est voulue (décision du 18/10) : la jupe ne part pas, elle
**le dit**. Elle partira toute seule après le paiement des bracelets, ou leur annulation.

## Point 2 — « Valider et payer » au Cloud

**Les messages concernés.** Le recensement complet (fichier:ligne) est plus bas. Pour le Cloud, voici l'avant et l'après :

| Où | Avant (compte Cloud) | Après (compte Cloud) |
|---|---|---|
| Tâche (extension → `error`, `last_diagnostic.detail`) | « dans l'onglet Leboncoin ouvert sur ton ordinateur, clique « Valider et payer »… » | update-job-status : poste Cloud = `MSG_LBC_A_PAYER_CLOUD` (« …dans ton FillSell Cloud : dans « À régler », appuie sur « Payer sur Leboncoin » — la page s'ouvre dans l'app, et c'est toi qui cliques « Valider et payer »… ») |
| Même texte, réécrit par l'app (`texteTacheCloud`) | « Si FillSell te le demande, résous la vérification… » (« Valider » lu comme « valide ») | la phrase du Cloud ci-dessus |
| Carte « Leboncoin : ton forfait pro » | « …dans l'onglet ouvert sur ton ordinateur » ; « refait le dépôt sur ton ordinateur et te laisse l'onglet » ; « onglet fermé » | « …dans ton FillSell Cloud : appuie sur « Payer sur Leboncoin »… » + bouton ; « refait le dépôt dans ton Cloud… » ; « page fermée » |
| Stepper (`phraseEtat`, a_payer_lbc) | « …dans l'onglet ouvert sur ton ordinateur » | « …appuie sur « Payer sur Leboncoin » dans « À régler » » |
| Alertes de compte (carte et ligne « À régler ») | « tu n'es plus connecté sur ton ordinateur », « dans le Chrome où l'extension est installée » | « à reconnecter dans ton FillSell Cloud », bouton « Me connecter » |
| Depop vendeur, identité Leboncoin (« C'est fait ») | « Ouvre Depop sur ton ordinateur », « On essaie une annonce sur ton ordinateur » | « son app ou son site, depuis ton téléphone », « depuis ton FillSell Cloud » |
| Bandeau « Leboncoin en pause » | « Connecte-toi à Leboncoin sur ton ordinateur », « au prochain passage de ton ordinateur » | « Reconnecte Leboncoin à FillSell Cloud », « au prochain passage de FillSell Cloud » |
| Choix de la boutique Vinted | « Connectée dans Chrome », « sur vinted.fr, dans Chrome, sur ton ordinateur » | « dans ton FillSell Cloud », « reconnecte Vinted à ton Cloud avec l'autre boutique » |
| Autres textes de l'extension et du serveur (conditions Vinted, « Ferme Chrome… puis relance », « DEVANT ton ordinateur », « l'onglet resté ouvert », « mis en veille par Chrome », « Ta connexion n'est pas en cause ») | laissés tels quels, ou réécrits à contresens (« Reconnecte Vinted » pour des conditions à accepter, « rien à faire » quand un geste restait) | `texteTacheCloud` : plus aucun mot du PC ; un geste de COMPTE reste le même geste, « depuis ton téléphone » ; un geste du PC retiré est remplacé par « FillSell Cloud réessaie tout seul ; si ça bloque encore, relance-la depuis l'app » |
| Mail de relance (email-tunnel) | « une extension installée dans Chrome sur ton ordinateur », « dès que ton ordinateur sera allumé » | aucun mail à un compte au Cloud actif ; la tâche est notée `cloud_sans_relance` pour le digest |

Comptes sans Cloud : textes et gestes inchangés. Les deux verrous le vérifient.

**Pourquoi « voie = extension ».** `cross_post_jobs.voie` ne vaut que « extension » ou « api » (contrainte
`cross_post_jobs_voie_check`). La valeur « api » est réservée à eBay par l'API (déclencheur `cross_post_jobs_voie_ebay`).
« extension » veut donc dire « exécuté par un navigateur ». Or la copie Cloud de l'extension en est un : la valeur est
juste et ne choisit aucun message. Le message venait de trois endroits :
- le texte en dur de l'extension, le même dans la copie Cloud ;
- la réécriture de l'app, qui le faussait ;
- la carte, qui n'avait pas de variante Cloud.

La source est corrigée côté serveur, qui sait quel poste écrit (`estPosteCloud(handler_build)`).

**Le nouveau parcours « À régler » (Cloud).** Voir `a-regler-cloud.png`.
1. La carte dit « …est prête sur Leboncoin, dans ton FillSell Cloud » et propose le bouton **« Payer sur Leboncoin »**.
2. Le bouton ouvre, dans l'app, la vue de son Cloud (la même que « Me connecter »), en mode « payer »
   (`serveur-cloud/src/paiement.js`, orchestrateur fea32cebd669). Cette vue ne montre que **l'onglet que l'extension
   suit pour CE dépôt**. L'extension le marque, et l'orchestrateur le retrouve par cette marque. Romane avait deux onglets
   au même écran : le dépôt de 21:36, jamais suivi, n'est jamais montré.
3. La personne clique elle-même « Valider et payer ». Aucun clic de FillSell : seuls ses gestes sont rejoués. L'onglet
   n'est jamais fermé. La navigation reste en https, jamais vers une autre plateforme ; le prestataire de paiement et la
   banque (3-D Secure) passent.
4. Fin : page de confirmation de Leboncoin, ou tâche « published » → « C'est fait… FillSell reprend tout seul ». La
   publication suivante (la jupe) se prépare ensuite.
5. Onglet introuvable (navigateur Cloud redémarré) : c'est dit, noté sur la tâche (`attente_paiement.onglet_ferme_le`,
   comme l'extension), et la carte propose « Préparer à nouveau ».

**Tests.**
- Verrou **`selftest:cloud-payer-leboncoin`** : 46/46. Il était rouge sur le code d'avant (`paiement.js` absent ;
  l'ancienne réécriture rendait « résous la vérification »). Il joue la vue « payer » contre un faux navigateur à deux
  onglets.
- Trois selftests qui lisaient le texte du code sont élargis, sans rien relâcher : `cloud-me-connecter`,
  `lbc-forfait-pro` et `lbc-mur-paiement-perime`.
- Suite **785/785** (par morceaux), lint identique à HEAD sur les fichiers touchés, build:essai vert.
- **Essai réel unique** sur le compte de Nico (f44b5917), en production (cloud-2), à 07:56 : vue « payer » ouverte avec un
  numéro de tâche sans paiement → « Rien à payer » en 100 ms, fermée, rien touché (journal `paiement_rien`).
- Le paiement réel lui-même n'est pas essayé : aucun compte de Nico ou d'Ornella n'est un compte pro hors forfait, et
  FillSell ne paie jamais.

**Effet du déploiement chez 13e274de.** Le redémarrage de l'orchestrateur (07:55) a fermé et rouvert les 8 navigateurs
Cloud, comme tout déploiement de l'orchestrateur. La page « Valider et payer » des bracelets, ouverte depuis le 14/11 21:47,
n'existe donc plus. Au premier « Payer sur Leboncoin », la vue le dira, le notera, et la carte proposera
« Préparer à nouveau ». Rien n'a été modifié à la main sur son compte.

## Recensement (point 2.1) — messages « ordinateur / onglet / Chrome / extension » visibles par un compte Cloud
- Leboncoin « Valider et payer » :
  - `_shared/lbc-forfait.js` (MSG_LBC_A_PAYER) et `chrome-extension/content-scripts/leboncoin.js` ;
  - `src/stock/EcranForfaitLbc.jsx` (prête, onglet fermé, préparation, essai, étiquette) ;
  - `src/utils/etatsPublication.js` (a_payer_lbc).
  → corrigés.
- Écrans de l'app : `EcranAlertesCompte.jsx`, `utils/alertesCompte.js`, `EcranVendeurPlateforme.jsx`,
  `EcranIdentiteLbc.jsx`, `utils/pauseLeboncoin.js` (bandeau) et `stock/Haut.jsx` (boutique Vinted). → corrigés.
- Textes de l'extension (copie Cloud identique), affichés par `humanizeJobError` → `texteTacheCloud` :
  - conditions Vinted (vinted.js:40, background.js:7781) ;
  - étape de compte Vinted (background.js:6122) ;
  - autre boutique (vinted.js:3084, background.js:32080) ;
  - refus à l'aperçu Leboncoin (leboncoin.js:2293) ;
  - recaptures périmées (background.js:31685, 31764) ;
  - page de dépôt inconnue (leboncoin.js:1593, beebs.js:1763).
  → corrigés par la règle de réécriture. Anti-robot et connexion étaient déjà réécrits.
- Textes du serveur :
  - `_shared/interruption-poste.js:69-95` et `_shared/tache-sans-demarrage.js:55-64` ;
  - update-job-status:1714 et 1566 ; handler-watch:704-712 ;
  - get-pending-jobs:14549 (anti-robot Vinted, désormais « Résoudre la vérification ») ;
  - `_shared/retrait-introuvable.js:175`.
  → corrigés à l'affichage par la même règle.
- Peu atteignables, laissés : `relance-apres-maj.js`, `recreation-bloquee.js:179`, get-pending-jobs:1617/3040/6185 (la
  copie Cloud est toujours à jour) ; `delegation-leboncoin.js:93-99` (délégation seulement) ; `poste-virtuel.js` (exclu au
  poste Cloud).
- Mails :
  - relance des publications en attente (`emails-fillsell.ts:332-440`) → plus jamais à un compte au Cloud actif ;
  - **à décider (Nico)** : `mailBienvenue` et `mailCommentCaMarche` (lendemain de l'inscription, « extension installée
    dans Chrome sur ton ordinateur ») partent sans regarder le Cloud. Un compte qui prend le Cloud dès le premier jour
    les reçoit. Il faut soit une version Cloud, soit ne pas les envoyer : c'est un choix de contenu.
- Push de ventes, `push-cloud-place`, `cloud-mails.js` : aucune mention du PC.
