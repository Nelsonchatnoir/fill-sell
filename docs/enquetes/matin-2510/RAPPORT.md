# 25/10 matin — lot de Nico (OTA, décisions, rouges du matin, observations, Depop, push, restes de la nuit, Louis)

Consigne de Nico (25/10 ~08:30) : toute republication passe à 100 % ; rien ne remonte en décision sans avoir été OBSERVÉ
dans le vrai navigateur ; la technique se tranche sans lui ; la règle à la racine ; zéro régression ; coding + commit +
push. Heure de Paris (heure d'hiver depuis 03:00 : UTC+1).

## Livré et prouvé

| Sujet | Ce qui est fait | Preuve |
|---|---|---|
| OTA 2.9.114 | envoyée 08:37 | canal production relu = 2.9.114 |
| OTA 2.9.115 | lot du jour (Leboncoin réservé à la France, suivi de lot neutre, eBay hors France grisé), 11:09 | build `2026-10-25T10:08:53Z+07df378`, canal relu = 2.9.115 |
| apple-iap-webhook | v39 : `npm:@peculiar/x509@1.9.0` (esm.sh en panne depuis 01:35) + `cryptoProvider.set(crypto)` | banc local, puis notification de TEST Apple `SUCCESS` (journal : TEST, jws_ok, Production). La v38 sans cryptoProvider a refusé la TEST de 08:51:33 (aucune réelle) |
| 8 dates Apple | `20261025_fin_periode_apple_rattrapage.sql`, 08:54:23 | essai à blanc 8/8, relecture 8/8 |
| 64 ventes en double (28/09) | `20261025_ventes_en_double.sql`, 08:55:46 | essai à blanc 64 lignes / 24 articles / 416,64 € ; 24 gardées relues ; 0 mail lié |
| Push « Vente annulée » | migration `20261025040000` (feu vert nommé, 10:11:13, essai 19/19) + push-ventes v14 | simulation en prod : armée, 0 annonce en attente ; APNs/FCM absents (geste de Nico) |
| ISBN tel quel (décision) | serveur + 0.6.143 (sonde armée sur 10 caractères) ; garde `BUILD_ISBN_10_TEL_QUEL` | les 30 retenues (Rég 6f1b1f70, Vincent A. ×29) partent seules au 1er poll d'un poste en 0.6.143 |
| Leboncoin hors France (décision) | codes postaux officiels ; plus proposé ; get-pending-jobs clôt | 11:11:14 : les 38 dépôts de Marta clos `lbc_hors_france` au poll suivant le déploiement, message vrai, 0 mail |
| Colis Vinted | OBSERVÉ (formulaire + référentiel) : le menu dépend du rayon | après déploiement : paugues 110c27ae / 5ad5bbb1 renvoyées en recapture dans LEUR rayon, Romain c28e2c60 « Grand » posé, sans question |
| Depop « EU N » | OBSERVÉ (grilles IT déclarées EUR) ; connecteur 0.6.143 | rejeu 945 jobs / 49 317 fiches : seuls des « EU N » changent ; selftest cinq-points-2210 73/73 |
| Louis (« complètement bloqué ») | 5 textes lus sur SES pages Vinted publiques et posés (script, 10:50) ; règle : la lecture d'origine passe devant la file | `lecture-origine-devant` 14/14 ; serveur v282 ; extension 0.6.143 trace une lecture ratée |

**Fonctions** (version et `verify_jwt` relus avant et après) : get-pending-jobs v281 → **v282** (true),
update-job-status v148 → **v149** (false), handler-watch v129 → **v130** (false), ebay-api-worker v96 → **v97** (false),
generate-listing v123 → **v124** (true), ebay-account v18 → **v19** (true), ops-digest v39 → **v40** (false),
ia-banc-deduction v7 → **v8** (false), apple-iap-webhook v37 → **v39** (false), push-ventes v13 → **v14** (false).
Journaux après déploiement (11:10 → 11:25) : aucune erreur.

**Extension 0.6.143** : `build\CWS-0.6.143-A-TELEVERSER\fillsell-extension-0.6.143-e464533-cws.zip` (587 423 octets,
sha256 `89c52b902b40eb41b214e5ce65e9d0bdb64764bfcaff625b7357a602b6c4a878`, BUILD_ID `2026-10-25T10:19:14Z+e464533`).
Poste de Nico : ce build copié dans `FillSell-Extension-Nico` à 11:19:52 (rechargement seul au premier moment sûr ;
ancienne copie sauvée dans `build/anciennes-extensions-nico/…0.6.142-355cbd0-20261025-1119`). Aucun bandeau
« mets à jour » (décision de Nico : `EXTENSION_MIN_BUILD` inchangé).

**Selftests** : suite complète 427/427 verte avant le commit (dont 13 nouveaux) ; deno check vert ; ESLint : aucune
erreur sur une ligne ajoutée.

## Les rouges du matin — causes établies

- **Deborah, « Lot de 10 pin's »** : annonce NON perdue — la republication est passée à 08:10 (nouvelle 10519929174 en
  ligne, bouton « Acheter », observée ; ancienne 10350034040 en 404). La coupure de 07:43 était AVANT tout retrait : onglet
  de travail gelé sur son poste resté en 0.6.131 (le correctif « fenêtre restaurée pour un onglet muet » est dans la
  0.6.139+, servie par le Store depuis 00:28, pas encore prise par son Chrome) ; la reprise serveur (A5) l'a relancée
  seule. Le texte faux « pendant la suppression » est corrigé dans la 0.6.142/0.6.143.
- **chaouidz, Beebs** : Beebs n'avait rien refusé — la copie (venue d'un relevé) n'avait ni rayon ni attributs. OBSERVÉ
  sur l'annonce : « Mode › Garçon › Chaussures (garçon) › Baskets (garçon) », « Fermeture : À enfiler ». Règle :
  l'extension reprend le fil d'Ariane et TOUTES les lignes libellé/valeur de l'annonce d'origine (vide seulement) ;
  message vrai côté serveur. Le cas : rayon répondu par la personne, « Fermeture » posée par script (11:16), en file.
- **boncoin59300, retrait Beebs** : demandé parce que la fiche, importée de Vinted le 24/10, était déjà VENDUE sur Vinted
  le 14/08 (l'annonce Beebs rattachée par photo identique). Risque de double vente : nul — la page Beebs rend 404
  (observé). Règle : deux constats 404 à ≥ 6 h prouvent l'absence malgré l'index public en retard.
- **DeadRoz, retrait Beebs** : l'annonce est « en vérification » chez Beebs depuis le 01/10 ; Beebs n'offre AUCUN geste
  pour la retirer pendant la vérification (observé sur le compte de Nico) ; page publique 404, rien d'achetable. Règle :
  message daté et vrai, servi toutes les 12 h, retiré dès que Beebs la met en ligne.
- **Rég, « Moby Dick »** : la retenue ISBN (10 zéros jamais « prouvés ») ; part avec la 0.6.143 (décision appliquée).
- **Alicéane, 12 « vendus »** : vrai lot — Vinted affiche « Vendu » sur les 12 annonces (observé), aucun retrait déclenché.

## Audit de la nuit — traité

N3 (doublon réel chez Vincent A. : titre à saut de ligne non reconnu ; règle + réparation, 2e copie retirée par le
circuit) · N4 (Depop) · N5 (taille eBay en liste fermée) · N6 (retours eBay : question au niveau du compte) · N9
(couleur de republication, sous-catégorie, causes nommées) · N10 (eBay hors France clos, plateformes écartées non
servies) · N11 (refus de vérification Beebs prouvé à 7 jours ; 18 annonces mises en ligne 48-126 h après leur sortie
de vérification interdisaient les 30 min) · Fleur de Lotus (photos : la preuve de réception est le compteur « N/25 » et
la vignette i.ebayimg.com — OBSERVÉ sur un brouillon de test du compte de Nico — mesurée par la 0.6.143 en mode
observer ; refus « Photos » nommé ; compte non vendeur : un seul éclaireur).

## Reste, avec sa cause

- Les correctifs d'extension (ISBN des 30, colis en une passe, Beebs attributs, Depop, eBay photos) n'agissent qu'avec la
  0.6.143 servie par le Chrome Web Store. Côté serveur, tout tourne déjà.
- Push « Vente annulée » : rien ne peut arriver sur un téléphone tant que les clés Apple/Google et le binaire avec le
  module ne sont pas là (App Store 2.8, Google Play 2.9.10 n'ont pas le module). Le geste de Nico : `docs/push/CLES-NICO.md`.
- Annonce eBay 820227542038 (Taille « Gants de ski enfant » au lieu de « M ») : lecture à blanc faite (un seul
  changement, sauvegarde complète) ; l'écriture a buté sur le cache du schéma (nouvelle table de sauvegarde), et la
  relance de l'appel a été refusée par le mode auto.
- Dépôt d'issue inconnue (règle N3) : retenu jusqu'à un relevé complet de la personne, sinon question au bout de 6 h
  (2 cas en 8 jours).
- Brouillon de test eBay `5432798485410` (« TEST FillSell 999 ne pas acheter », jamais publié) sur le compte de Nico.
