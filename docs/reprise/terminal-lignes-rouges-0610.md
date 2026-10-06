# Reprise — terminal « lignes rouges + mails de vente + régression EU 40 » (06/10 soir)

Mandat de Nico du 06/10 après-midi : chaque ligne rouge a sa cause, son
correctif À LA RACINE, sa preuve réelle ; zéro régression (publication,
republication, retrait, relevé sur Vinted, Leboncoin, eBay, Beebs). Puis deux
compléments : mails de vente (règle produit) et régression dbz70 « EU 40 ».
État de prod : `docs/agents/etat-2026-10-01.md` § « 06/10 soir ».

## Livré en prod
- **Fonctions** (verify_jwt relu avant/après) : get-pending-jobs v220
  (`true`), handler-watch v89, push-ventes v6, email-tunnel v72 (`false`),
  send-extension-link v13 (`true`).
- **Migration 20261006180000** (mails de vente) : feu vert explicite de Nico,
  appliquée 16:41, inscrite (`migration repair`).
- **Extension 0.6.101** : `build/CWS-0.6.101-A-TELEVERSER/fillsell-extension-0.6.101-3e77bae-cws.zip`
  (BUILD_ID `2026-10-06T15:09:44Z+3e77bae`, sha256
  `85b752d0ab06e70c2bd65c4739bc544caa7cb620fd8e28aa27f89414e07bd39c`) — À
  TÉLÉVERSER par Nico puis « Envoyer pour examen ». Chargée chez Nico (17:14).
  Après acceptation : `ALREADY_PUBLISHED` += "0.6.101" ; EXTENSION_MIN_BUILD
  seulement sur décision de Nico.

## Les règles corrigées (et où)
1. **Une republication ne bute jamais sur une valeur que son annonce porte** —
   « EU N » ≡ « N » : serveur `_shared/vinted-taille-republication.ts`
   (`optionNuPourEu`, publication + republication, demi-pointures) ; extension
   `candidatsTailleVinted` (grille sans onglet ou onglet EU seulement).
   Commit fautif : **ca63277** (03/10, 0.6.90). handler-watch : une taille
   refusée que le serveur sait servir repart par une RECAPTURE (la valeur
   servie n'atteint le formulaire qu'à une capture).
2. **Un remplissage lent mais vivant n'est jamais coupé** — gpj : port de
   remplissage (10 min) pour un compte coupé à 5 min dans les 14 j et pour
   toute remise en ligne d'une annonce déjà retirée ; handler-watch : les
   arrêts « onglet muet » repartent une fois.
3. **Un retrait qui attend la personne se voit** — app (`utils/retraitsBloques.js`,
   « Annonces à retirer ») : session Vinted absente/illisible → « Me
   connecter » ; « compte bloqué » → retirer depuis l'appli Vinted ;
   handler-watch : le texte « Connecte-toi à Vinted » posé même poste éteint ;
   0.6.101 : retrait par l'API sous /main/banned (même garde de boutique).
4. **Une republication sur une annonce disparue de toutes les boutiques se
   clôt sans geste** — gpj (deux relevés complets par boutique), fiche datée
   `disparu_le` → l'app propose « Publier ».
5. **Leboncoin : les pages avant les photos sont remplies** (0.6.101,
   `advanceWizardTo` + `remplirEtapeAvantPhotos`).
6. **La marque d'origine se reconnaît par son id** (0.6.101, `marque_id`).
6 bis. **Un échec qu'une extension corrige repart seul dès que le poste l'a**
   (`_shared/relance-apres-maj.js`, handler-watch v89) : le dépôt de Glowik
   repartira une fois, sans geste, quand son Chrome aura la 0.6.101.
7. **Un mail à chaque vente, jamais plafonné ; récap supprimé** — migration
   20261006180000, push-ventes, email-tunnel. Garde « vente RÉCENTE prouvée »
   dans push-ventes v6 (Vinted : annonce vue en ligne hier/aujourd'hui ou
   publiée < 48 h ; jamais déjà vue vendue un jour précédent).

## ⚠️ Mails envoyés à tort pendant la première demi-heure (16:41 → 17:31)
- Louis (Amiral) : 4 mails à 17:03 (notes 311-314) pour des annonces Vinted
  déjà vendues les 30/09, 04/10, 05/10 (fiches à quantité 9997 qui repassent
  « vendues » à chaque relevé sur une ancienne annonce).
- Anastasia H : 2 mails à 16:58 (notes 238-239) pour des annonces vues en
  ligne pour la dernière fois le 06/09.
Corrigé par push-ventes v6 (garde avant tout envoi). **Proposé à Nico** :
corriger aussi les déclencheurs (`push_trg_inventaire_vinted` : annonce déjà
vue vendue un jour précédent → rien ; `push_trg_job` : preuve « vue en ligne »
au lieu de la date de constat) — migration à écrire sur son feu vert.

## Non-régression (06/10 soir, 0.6.101 chez Nico, compte de Nico)
- Relevés : Vinted, Leboncoin, Beebs, eBay — 4/4.
- Publication : Vinted 10269377209 ; Leboncoin 3283445560 ; eBay 820210473592 ;
  Beebs 34120357 (déposée, puis écartée par la modération Beebs : titre
  « TEST », attendu) ; rayon commerce de Glowik : « Votre annonce est publiée »
  (3283447282, jamais visible : modération Leboncoin).
- Republication : Vinted 10269377209 → 10269519592 ; Leboncoin 3283445560 →
  3283457369 (ancienne « désactivée », nouvelle « active » par l'API) ; Beebs,
  sur une VRAIE annonce de Nico (T-shirt Adidas, 4 €) : 34003891 → 34120571
  (« en vérification » chez Beebs) ; eBay : hors republication (garde-fou 17/09).
- Retrait : Vinted 10269519592 « Page not found » ; Leboncoin 3283457369
  « désactivée » ; eBay 820210473592 « Le vendeur a mis fin à cette annonce »
  (17:44) ; Beebs : geste partagé (`executerRetraitViaHandler`) prouvé par la
  republication (34003891 sortie de « En ligne »).
- Selftests : 203/203 (lbc-jeton-releve exigeait un manifest EXACTEMENT en
  0.6.100 : rouge depuis la 0.6.101, corrigé en « ≥ 0.6.100 »).
- Restes de test chez Nico : fiches « TEST FillSell… Call of Duty »
  (1791299785299, plus aucune annonce en ligne) et « TEST… présentoir »
  (1791300075263, annonce LBC 3283447282 jamais apparue). Le T-shirt Adidas
  repasse par la vérification Beebs (ses favoris Beebs repartent de zéro).

## Ce qui reste ouvert (et pourquoi)
- Glowik (LBC) : attend la 0.6.101 sur son poste (CWS) → repart seul (v89).
- DeadRoz (retrait Vinted après vente LBC du 01/10) : Vinted renvoie les pages
  de son compte vers /main/banned ; la 0.6.101 tente le retrait par l'API ;
  reprise seule 1 h/3 h/6 h ; carte « retire-la depuis l'appli Vinted ».
- Sandra (retrait Vinted, son geste) : même mur + poste éteint depuis le 03/10.
- geronimo (retrait Vinted armé par une suppression d'article ratée le 03/10,
  500 corrigé par les index du 06/10) : aucune session Vinted dans son Chrome ;
  décision de Nico : garder ou annuler (la fiche est restée en stock).
- pironneau (retrait Vinted après vente eBay du 04/10) : session Vinted
  illisible, poste muet depuis le 05/10 ; « Connecte-toi » affiché.
- wattelle (retrait Vinted, article supprimé le 06/10) : aucune session Vinted
  dans ce Chrome depuis le 19/09.
- Ciddjy : Beebs « Lot 5 pantalons garçon 36 mois » (retirée le 05/10)
  RECRÉÉE à 18:05 sur son poste (0.6.100, port allumé par la règle du soir) :
  34120602, preuve « Mes annonces » avant/après (en vérification chez Beebs).
  Restent 3 Vinted et Beebs « Lot 4 » (en file) : poste revenu 17:13, muet
  17:15 pendant une republication Vinted (remise en file à 18:00, rien retiré).
- Carla (20 Vinted en file), Jen (2) : port allumé, compteurs remis à zéro ;
  attendent leur poste (et la 0.6.101 pour la marque par son id).
- geronimo (Beebs/LBC « Vans », « Louveteaux ») : sessions fermées dans son Chrome.
- patrick giry (LBC, 30 dépôts) : Leboncoin exige nom et prénom (Transaction
  sécurisée) ; le message exact est affiché sur les 30. Proposé à Nico : une
  carte par compte au lieu de 30 lignes.
- Opla (dreap, Tiffany, graph'studio) : clos par la bascule du 10/10 (Nico).
- CLOS : dbz70 (10268609428, taille 40) ; Ornella JAZ (deux relevés complets
  sans l'annonce, « Page not found »).
