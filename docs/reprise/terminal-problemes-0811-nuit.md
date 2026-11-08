# Reprise — terminal « Problèmes », lot de Nico du 08/11 soir (points 1 à 6)

Suite de `docs/reprise/terminal-problemes-0811-soir.md`. Heures de Paris. État de prod : `docs/agents/etat-2026-10-01.md`.

## Point 1 — julian.boissel (gratuit), Beebs : 5 publications « dépôt non confirmé » — ROUGE CONFIRMÉ (lecteur aveugle)
- Faits : 5 jobs × 4 essais (18:17 → 19:29), v0.6.179 ; sonde « AUCUNE capture » à chaque fois (aucune requête partie) ;
  « le formulaire affiche » = 5 CONTENEURS de champs (« Titre de votre annonce19/100… », « Supprimer la photo »…).
- Zéro doublon : le relevé Beebs de 19:11 (onglets « en ligne » ET « en vérification ») a lu 0 annonce, après 15 des 20
  clics ; les 5 derniers clics ont la même signature (aucune requête). `annonces_plateforme` beebs : 0. Aucun relevé Beebs
  depuis 19:11 (poste vivant, 0.6.179). RIEN relancé.
- Cause (relevé sur beebs.app/fr/listing, compte de Nico, aucun envoi) : formulaire react-hook-form ; au clic le
  gestionnaire valide (titre, photos, description, catégorie, attributs, ADRESSE, format, prix, date limite), pose les
  refus par setError et retourne sans requête. Trois refus étaient illisibles pour notre lecteur : « Vous devez être
  connecté pour ajouter un produit » (racine), « Sélectionner une valeur » (attribut vide, retiré de la regex le 13/09),
  l'adresse quand la section Adresse est masquée (aucun texte rendu — vérifié par setError). Le motif exact de Julian
  sera nommé au prochain essai par la 0.6.183 (il ne peut pas être lu après coup).
- Correctif (extension 0.6.183) : `BEEBS_MAIN_FONCTIONS.formulaire` (background) lit l'état du formulaire ;
  beebs.js lit le compteur d'envois avant le clic, l'état pendant l'attente, et nomme le refus (connexion → attente de
  session ; adresse masquée → compléter l'adresse du compte Beebs ; attribut/format → la question avec les valeurs de
  Beebs ; prix, texte, date limite → attente nommée). Le relevé du texte ne remonte plus les conteneurs.
  Selftest `selftest:beebs-refus-etat-formulaire`.

## Point 2 — « introuvable_a_confirmer » qui ne se libère pas (Logann Vinted ×6, ayadi007 Leboncoin ×4) — ROUGE CONFIRMÉ
- Logann : lectures 404 15:04:44 → 15:16:27 ; relevé complet 15:06 (404/404, boutique 55364004) SANS les 6 annonces
  (snapshots restés à 14:38:17). ayadi : lectures « unavailable » 11:44 → 11:55 ; relevé 18:11 (5/5) sans elles ;
  pages publiques Leboncoin des 4 annonces = HTTP 410 (témoins en ligne : 200) → réellement disparues.
- Cause : la clôture exige DEUX relevés complets ; handler-watch ne demandait le relevé qu'avec une borne partant de la
  PLUS ANCIENNE lecture (cadence 6 h) : le relevé de 15:06 (Logann) / 18:11 (ayadi) bloquait toute demande pendant 6 h
  alors qu'il ne tranchait rien seul. Rejeu exact de la décision : « absente d'un relevé complet : on attend le suivant ».
- Correctif (handler-watch + `_shared/introuvable-a-confirmer.js`) : la décision rend `releve_apres` (lecture, ou début du
  dernier relevé compté + 1 s) ; la demande suit le plus tardif, au plus une par heure, cadence de 6 h sinon ; message
  vrai après un premier relevé sans l'annonce ; un relevé d'un AUTRE compte Leboncoin connu ne prouve jamais une absence.
  Selftest `selftest:introuvable-a-confirmer` (127).
- Effet attendu : Logann (poste éteint depuis 18:04) → second relevé demandé à sa prochaine connexion, puis clôture
  « plus en ligne » ; ayadi (poste en ligne) → second relevé au prochain passage après déploiement, puis clôture.

## Point 4 — recrutementgroupezk704, retrait Beebs 53cff028 (annonce 34083555) — défaut de message, attente normale
- Annonce dans « En vérification » chez Beebs depuis le 30/09 (relevés 29/10 → 02/11) : aucun bouton de suppression
  possible ; le message affiché (attente) et le statut pending sont justes ; poste éteint depuis le 02/11 09:05.
- Défaut : beebs.js disait « page pas encore rendue » et le background COMPTAIT l'essai (compteur resté à 4) → chaque
  passage finissait « le retrait est arrêté » (failed) requalifié en pending par le serveur ; le brut gardé disait
  « arrêté ». Correctif : extension 0.6.183 (en vérification = attente, compteur intact) ; serveur
  (`brutSelonStatut`, update-job-status) : sur pending/needs_user, la conclusion « arrêté » ne survit pas au brut.
  Selftest `selftest:beebs-retrait-en-verification`.

## Point 5 — linda.sidhoum (Premium), 157 republications Vinted en attente — FONCTIONNEMENT NORMAL
- Chrome éteint/en veille : dernier travail 06/11 17:44 ; une seule interrogation le 07/11 03:41 (2 jobs servis) ; le
  signe de vie du 08/11 03:33 est un battement de présence (`battement_extension`), pas un poll (`vivant_depuis` resté au
  07/11). Aucun battement ni poll depuis.
- 5 jobs « preuve de boutique » : garde normale (captures sans page exacte, `item_lu` null) ; message inexact (« plusieurs
  boutiques » alors qu'elle n'en a qu'une, ouverte dans Chrome) → corrigé dans update-job-status quand la boutique de
  l'annonce = boutique ouverte. Selftest `selftest:vinted-preuve-boutique-meme`.

## Point 3 — taille eBay « 24 mois » (sos.cuisine.valenciennes = chaouidz, même compte) — ROUGE CONFIRMÉ
- Job ccffd8ef (08/11 17:55, rayon 51973 « Vêtements garçon (2-16 ans) ») : copie « 24 mois », liste eBay du rayon =
  lettres, statures 74-176, âges « 2 ans » à « 16 ans », AUCUN âge en mois → « on n'a pas su traduire ». Avec le code
  d'avant, les quatre chemins rendaient null. Seul échec de taille eBay en 10 jours.
- Correctif : règle E3 de `_shared/taille-ebay.js` (même âge autre écriture, stature enfant, tranches entières ; jamais
  un âge voisin ni une valeur hors liste). Changement voulu à faire valider : « 24 months » (2-16 ans) → « 2 ans »,
  « 18 mois » → « 86 » au lieu d'une question. Selftest `taille-ebay` 127/127 (35 échecs avec l'ancien fichier).
- ccffd8ef repart seul au premier passage de handler-watch redéployé (« 2 ans »), rien relancé à la main.

## Point 6 — josephinecerni (Pro), 874 republications du 04/11 22:07:43 → 22:14:08 — GESTE DE LA CLIENTE (pas l'app seule)
- Preuve : un seul `bulk_batch_id` (77b7bf38) — posé UNIQUEMENT par `lancerRepublicationLot` (StockTab), atteint
  seulement par le bouton de confirmation de la feuille de republication (`RepublishSheet.confirmer`) ; ordre article par
  article Vinted → Leboncoin → Beebs, ~3/s (boucle séquentielle de l'app) ; aucune création serveur possible avec ce
  marqueur. Ordre des articles = ordre de la liste du Stock (identifiants décroissants, créés du 26/10 au 23/08), PAS celui
  de « Remonter mes annonces » (plus anciennes en ligne d'abord) → parcours : Stock › « Remonter » (mode sélection) ›
  « Tout sélectionner » › « Republier les 296 » › feuille « Republier 874 annonces (296 articles sur 3 plateformes) ».
- La synchro (sync_click 22:07:09, relevé de 288 annonces en cours) n'a rien déclenché : la première republication
  (22:07:43.64) est antérieure au journal de la page 4 du relevé (22:07:43.88) ; aucun code ne relie fin de synchro et
  republication. Écran exact non journalisé en base (track() ne part que vers GTM).
- Proposition (NON intégrée, feu vert de Nico) : au-delà d'un seuil (ex. 50 republications), un second écran de
  confirmation « Tu lances 874 republications : Vinted 295, Leboncoin 296, Beebs 283. Chaque annonce est retirée puis
  redéposée. » avec « Confirmer 874 republications » / « Annuler » ; et « Tout sélectionner » qui dit le nombre.
- Constat lié (rien changé) : le MANUEL ignore les créneaux (décision de Nico, « point 7 », commentaire de
  get-pending-jobs) — d'où des republications à 9 h et 22 h ; la programmation automatique est bloquée « en vol »
  (`republish_planifiee_sweep`, garde anti-rafale : tout republish pending/processing de la plateforme, manuel compris)
  — `_bloque_en_vol` depuis le 08/11 10:36 (Vinted 254, Leboncoin 255, Beebs 235 en vol). File : 730 pending, 138
  publiées, 6 annulées. Rien touché.

## En service (08/11 23:10, autorisation nommée de Nico)
- handler-watch v186 (avant v185, false), update-job-status v187 (avant v186, false), ebay-api-worker v120 (avant v119,
  false), ebay-account v36 (avant v35, true), generate-listing v137 (avant v136, true). Code : 904bacb. Retour : f975a16.

## Ce qui attend
- **Chrome Web Store** : Nico téléverse `build/CWS-0.6.183-A-TELEVERSER/fillsell-extension-0.6.183-cws.zip`
  (BUILD_ID 2026-11-08T22:09:14Z+6c84532) — SEUL zip. Après acceptation : « 0.6.183 » dans ALREADY_PUBLISHED. Les points
  1 (refus Beebs nommé) et 4 (retrait en vérification = attente) n'agissent sur les postes qu'avec elle.
- **Copie Cloud 0.6.183-cloud** : autorisation nommée de Nico (jamais sans).
- **Point 6** : décision de Nico sur la confirmation renforcée d'un gros lot, et sur les créneaux du manuel.
- **Julian** : rien relancé ; ses 5 jobs restent « à toi ». Au prochain essai sous 0.6.183, le vrai motif s'écrit.

## À vérifier demain
- Logann / ayadi007 : second relevé demandé (`vinted_sync_runs.declencheur = serveur:introuvable_a_confirmer`), puis
  clôture « plus en ligne » (cancelled + annonce_disparue) ; Logann seulement quand son poste se rallume.
- ccffd8ef (eBay, « 24 mois ») : la question repart seule avec « 2 ans ».
