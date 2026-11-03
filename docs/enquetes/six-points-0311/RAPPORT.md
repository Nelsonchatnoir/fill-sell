# Six points du 03/11 — retrait en boucle, descriptions, « Remonter », eBay disparue, annonces avalées, faux bouton

Heure de Paris partout. Aucune donnée client ici (comptes, numéros d'annonce et titres restent en base et dans le
rapport de session donné à Nico).

## 1. Un retrait eBay qui tournait en rond sur une annonce qu'eBay avait déjà supprimée

**Constat (lu en base et chez eBay le 03/11 vers 11:00)**
- Article vendu sur Vinted : commande lue `vendu_le` = 17/10 ; le « 07/10 » est la première capture de l'annonce Vinted.
  FillSell n'a vu la vente que le 02/11 à 23:56 : le dressing Vinted du compte n'avait été relevé que le 07/10 et le 02/11.
- Retrait eBay armé à 23:57 (`armer_retrait_job (serveur)`, chemin `vente_article_serveur`), une minute après la vente
  vue. **L'armement tardif n'est pas confirmé ici** : le retard est celui de la détection de la vente.
- eBay avait supprimé l'annonce : GetItem (jeton du vendeur) → Failure « Cette annonce a été supprimée, car elle enfreint
  notre Règlement sur les contrefaçons. » ; vitrine Browse → 404, errorId 11003. `verdictAvantRetraitTrading` lisait
  « illisible » : `pending`, « Retrait eBay reporté », à chaque passage depuis le 02/11 23:57.

**Règle (toutes plateformes)** — `_shared/ebay-retrait-trading.js` (`refusGetItemDefinitif`, `annonceSupprimeeParEbay`),
`_shared/retrait-deja-absent.js` (`dejaAbsente({ motifPlateforme })` → `deja_absente.motif_plateforme`), ebay-api-worker
(`retirerParTrading`) : quand la plateforme confirme que l'annonce n'existe plus, le retrait est FAIT (`deleted`, drapeau
`deja_absente`) et ses mots sont gardés tels quels. eBay : DEUX lectures concordantes — GetItem en échec définitif nommé
(aucune erreur passagère : jeton, quota, panne) ET vitrine 404 / terminée / vendue. Vitrine qui la vend encore, ou muette :
reporté comme avant. La publication d'origine est close « Annonce supprimée par eBay (pas par le vendeur) — pas une vente ».
App : barre du retrait « Déjà retirée par eBay : « motif » Plus rien à retirer. », ligne de la fiche « Retirée par eBay :
« motif » » (`barresJobs.motifRetraitParPlateforme`, StockTab). Vinted, Leboncoin, Beebs, Depop : la règle du 25/10 (déjà
absente = retrait fait) s'applique déjà ; leurs pages 404 ne donnent pas de motif — le champ est prêt s'il en vient un.

**Le parc** : retraits ouverts (45 jours) dont la plateforme confirme l'absence : 1 (ce cas). Les autres attendent une
connexion, une boutique, la vérification Beebs ou une page anti-robot : pas la même classe.

**Mesure à blanc** (03/11, hors Opla quittée) : 75 annonces encore « publiées » sur des articles vendus ; la plupart ont un
retrait en file ou ne sont pas prouvées (`armer_retraits_copies` n'arme que les annonces prouvées, les autres deviennent la
question « Déjà vendu ? »). **Trou réel** : le déclencheur `cross_post_jobs_publie_sur_article_vendu` ne regarde que
`UPDATE OF status` → `published` ; une annonce INSÉRÉE déjà publiée par un relevé (rattachement, import), ou re-pointée sur
une fiche, n'arme rien. 60 derniers jours : 4 annonces rattachées après la vente vue (2 sans aucun retrait, 1 retrait
annulé, 1 retrait fait). Proposition, NON appliquée (migration, feu vert de Nico) : `proposition-migration-armement.sql`.

## 2. Audit des descriptions (À BLANC, rien changé)

**Les emojis ne sont pas retirés exprès pour une plateforme : c'est un bug du 29/10 (lot B, `2d09632`).**
`consigneSansEmoji` (`src/utils/consignesRedaction.js:64-67`) cherche le MOT « emoji » dans la case « À éviter » des
consignes ; une phrase comme « Ne jamais supprimer les emojis » est lue comme un refus, et `respecterConsignes`
(`_shared/redaction-plateformes.ts:320-326`) efface alors tous les pictogrammes du texte GÉNÉRÉ, après le modèle (la
négation n'est pas lue ; même mécanisme pour « hashtag » / `#`). Le seul retrait d'emojis voulu porte sur les TITRES
(Vinted : 400 « trop de symboles d'affilée », 12/07, `3b30b7e`). Les cinq plateformes acceptent emojis et lignes vides en
description (preuve : nos dépôts réussis avec emojis et les relevés, sur 60 jours ; Depop : 1 000 caractères, 5 hashtags).
Le reste vient du prompt : structure imposée « phrases suivies, sans liste ni titres » (l.286), longueur visée 300-650
(l.182, l.293), interdiction d'écrire « testé » (l.276-285), aucune date du jour dans le contexte, description du Lens
reprise avec ses adjectifs, consignes du vendeur en dernier et subordonnées aux faits (`consignesRedaction.js:87-89`).

## 3. « Remonter mes annonces » plateforme par plateforme (demande d'un vendeur Pro)

`src/stock/remonterParPlateforme.js` (pur), `src/stock/ChoixPlateformeRemonter.jsx`, StockTab, EcranSelection.
- Pastilles « Toutes · Vinted n · Leboncoin n · Beebs n… » : les plateformes où une annonce est republiable maintenant
  (`plateformesRepubliables`) ; eBay jamais (FillSell ne republie pas eBay, décision du 02/11).
- Chaque ligne dit la date de LA plateforme (« Republiée sur Vinted il y a 2 j ») ; vue « Toutes » : « Vinted 2 j ·
  Leboncoin 2 j · eBay 42 j ». Source unique : `datesParPlateforme` (suivi du 31/10).
- Tri « plus anciennes d'abord » / « plus récentes d'abord » sur la dernière publication ou republication ; date inconnue
  à la fin. Plateforme choisie : la feuille de republication s'ouvre avec cette seule plateforme cochée.

## 4. Une annonce eBay « disparue » : elle avait bien été en ligne

- Publiée par l'API le 01/11 à 14:30:46 ; vitrine eBay (03/11) : fin le 01/11 à 14:47:45, 0 vendu → en ligne 17 minutes,
  puis arrêtée. Notre publication avait abouti. Une autre annonce du même objet, créée hors FillSell juste après, a été
  importée par le relevé du 02/11 sur une nouvelle fiche.
- Close `failed` « absente aux relevés complets … eBay n'a donné aucun motif » par la fonction SQL des relevés (branche
  `refus_moderation_probable`) sans lecture d'eBay : la veille eBay ne l'avait visitée qu'à 14:32 et elle est très en retard
  (03/11 : 11 635 annonces sous veille, dernière visite médiane il y a 351 h, 10 810 non vues depuis 24 h).
- **Règle** (`_shared/ebay-disparue-motif.js`, ebay-api-worker `motiverDisparuesEbay`) : une publication eBay close
  « absente, sans motif » est relue chez eBay (GetItem du vendeur + vitrine), bornée (3 par passe, une passe sur cinq,
  7 jours, 3 essais) ; le message dit ce qu'eBay sait : en ligne du … au …, arrêtée depuis le compte eBay avec le motif
  choisi (EndingReason), ou supprimée par eBay avec SES mots, remise en vente sous un autre numéro. Jamais sur une annonce
  qu'un retrait FillSell a touchée. Lecture GetItem de diagnostic, sans écriture : action `lire_getitem` (x-cron-secret).

## 5. Annonces qui « disparaissent » (Leboncoin, Beebs)

**Beebs — cause mesurée (Beebs ne la dit jamais)** : chez le compte Pro concerné, 14 dépôts réels (numéro lu en tête
de « En cours de vérification »), tous sortis de la vérification 3 à 39 min après sans paraître en ligne, puis clos au bout
de 7 jours. Ce qui les distingue : la phrase de son modèle « Jeu testé (aujourd'hui, le <date>,) et fonctionnel ». Depuis le
08/10 : avec la phrase 0 en ligne sur 89 ; sans 41 sur 43 (les 2 manquantes retirées par le vendeur). Expérience du 29/10
(même lot, même heure, même rayon) : 9 sur 9 refusées avec la phrase, 1 sur 1 en ligne sans. Écartés : compte bloqué
(ses republications passent), emoji du titre, prix, rayon, photos, Cloud, version d'extension. Le même texte passait le
28/09 : Beebs a durci sa vérification début octobre (date exacte non prouvable). Reste du parc sur 14 jours : 2 720 en
ligne sur 2 769 (98 %) ; l'autre compte signalé : 2 refus sur 296 dépôts (bruit normal, aucun motif lisible).
**Corrigé** : une annonce que Beebs a SORTIE de sa vérification ne dit plus « Beebs vérifie ton annonce » mais « Beebs a
sorti ton annonce de sa vérification le … sans la mettre en ligne pour l'instant » (StockTab, marqueur
`pas_encore_visible.sortie_constatee_le`). Le texte du vendeur n'est jamais réécrit (règle du 29/10). À décider :
dire au vendeur la cause mesurée sur son compte (seuil : au moins 5 refus et aucune acceptée avec la phrase) ; poser
`empreinte_contenu` sur tous les refus pour que la relance d'un contenu identique soit arrêtée (le 29/10, 10 relances
identiques sont reparties).

**Leboncoin — pas un « Leboncoin avale » unique ; mécanisme commun** : FillSell prend « numéro obtenu » pour « annonce
active ». Chez Leboncoin, une annonce passe par la modération (mesuré : jusqu'à 46 h), un brouillon Pro non payé, ou un
refus ; notre relevé jette ces états (`chrome-extension/background.js` ~20034-20049 n'écrit que « en_ligne » ou
« inconnu », le statut brut n'est gardé nulle part). Conséquences mesurées : (a) la grâce de 4 h de la clôture par les
relevés ferme des annonces encore en modération (2 clôtures abusives prouvées en 30 jours ; 4 dépôts sur 1 935 en ligne
après plus de 4 h : 8,6 h, 12,3 h, 21,8 h, 46,1 h) ; (b) chez un compte Pro hors forfait, chaque passage crée un brouillon
non payé (18 jobs arrêtés à « Valider et payer ») ; un brouillon relevé est rattaché comme publication et fait fermer le
vrai job « déjà en ligne » (82 annonces Leboncoin au statut inconnu importées en job sur le parc, 53 encore « published ») ;
(c) un refus de modération dont le motif n'est que dans le mail de Leboncoin. Relevés incomplets ou mauvais compte : 0.
**À décider (extension + migration)** : garder le statut brut Leboncoin (relevé et après le dépôt) ; ne jamais rattacher ni
importer comme « publiée » une annonce Leboncoin non active ; ne conclure « absente » qu'après 48 h ou sur un statut brut
« refusée » ; compte Pro hors forfait : un seul brouillon par article et un message clair.

## 6. Le bouton « Leboncoin remarche » promis par le message de pause

Le message de pause (`messageBlocageLbc`, depuis le 30/10) disait « appuie sur « Leboncoin remarche » dans FillSell » ; le
bouton n'existait nulle part, alors que le serveur savait faire l'essai demandé (`essai_demande_le`). Il existe :
`src/components/BandeauLeboncoinPause.jsx` + `src/utils/pauseLeboncoin.js`, monté dans App (PC et téléphone), montré
seulement quand `platform_settings.leboncoin.blocage_acces` tient (posé, non levé). Le geste relit la ligne puis pose
`essai_demande_le` par `platform_settings_fusionner` : une seule action Leboncoin au prochain passage de l'ordinateur, puis
levée et reprise prudente, ou pause prolongée. Jamais d'écriture sans pause en cours (elle créerait un blocage).
