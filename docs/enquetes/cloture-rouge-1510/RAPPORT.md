# Clôture du rouge — 15/10 soir (heure de Paris)

Mandat de Nico, 9 points. Règles durables : `docs/regles/republication-et-publication.md`,
`docs/regles/rapprochement-et-releves.md`, `docs/regles/ventes-et-retraits.md` (§ 15/10 soir (3)).

## Servi
| Élément | Avant | Après |
|---|---|---|
| get-pending-jobs | v250 | **v253** (`verify_jwt` true avant/après) |
| handler-watch | v109 | **v111** (false) |
| update-job-status | v136 | **v137** (false) |
| beebs-lien | v13 | **v14** (false) |
| ebay-api-worker | v85 | **v86** (false) |
| Migration | — | **20261015210000** APPLIQUÉE sur « Feu vert » (déclencheur `remis_en_file_le` + `rapprocher_recabler_job` emporte le titre) ; essai à blanc avant, inverse `supabase/rollbacks/` |
| Extension | 0.6.113 à téléverser | **0.6.114** `build/CWS-0.6.114-A-TELEVERSER/fillsell-extension-0.6.114-18cc681-cws.zip` (BUILD_ID `2026-10-15T19:36:02Z+18cc681`, contient la 0.6.113, rangée dans `build/CWS-PERIMES/`) |
| Selftests | 313 | **319/319** |

## Point par point
1. **Ciddjy, Beebs, « Jogging 18 mois »** — deux fiches distinctes (…006 → 7b37d91b, …007 → cee154c7), **0 annonce en
   ligne** (index public Beebs du compte, 77 annonces, exhaustif, aucune « Jogging »). 7b37d91b (19:50-19:54) : la sonde
   prouve qu'AUCUNE requête n'est partie (rien créé) ; le motif exact du clic sans effet n'est pas dans la trace (aucun
   message de validation lu, état du bouton jamais relevé) → la 0.6.114 relève le bouton. « En cours 15 à 42 min » :
   poste a2ea1be5 muet (veille), repris par handler-watch, 3 reprises → « relancer ». **Règle** : jamais un 2e dépôt
   Beebs à l'aveugle (gpj v252) — 3 jobs retenus jusqu'au relevé du compte (cee154c7, da40eadc, 830d52cb) ; 7b37d91b
   remis en file (aucune requête partie, script `20261015_cloture_rouge_soir_2.sql`).
2. **Joe0410, retrait T-shirt Nasa** — **pas en ligne** : absent de l'index public (302 annonces, exhaustif) et de
   « En vérification » (relevé complet 18:57 : seule 33911255). Numéro jamais capturé : dépôt du 30/09 07:03 par la 0.6.79
   (avant la lecture « Mes annonces » avant/après), réponse de Beebs sans product_id, annonce jamais vue par un relevé.
   Ce qui bloquait : 33911255 « Polo Scott » (déposé le 06/09, job ba7cc76b). **Règle** : une annonce numérotée avant le
   dépôt ne peut pas être lui (mesuré : 0 inversion réelle sur 314 966 paires Beebs) ; dépôts sans numéro rattachés par
   les photos de notre copie (beebs-lien v14 : 3 de nicolas.menar). Le retrait se conclut « rien à retirer » au prochain
   relevé complet (le dernier, 19:47, était incomplet).
3. **eBay** — Amega (compte relié « vintora16 ») : **retiré par l'API Trading à 21:08** (EndFixedPriceItem HTTP 200, relu
   « Ended », 178450879276). Babaa (aucun compte relié, session Chrome fermée depuis le 12/10) : aucune voie serveur —
   mais les **6 annonces étaient déjà terminées par la personne le 14/10** (pages publiques relues) : retraits clos
   (script `..._3_ebay_babaa.sql`). **Règle** : retrait d'un compte relié bloqué faute de session → API Trading
   (GetItem avant/après, vendeur vérifié) ; mur « Connexion eBay » qui propose aussi de relier le compte.
4. **ana0115, « Tee shirt femme »** — cause : copie de l'annonce sans description → 5 redépôts refusés « Ajouter au moins
   5 caractères » (la fiche en a 182). **Règles** : toute remise en ligne Beebs part avec ≥ 5 caractères (annonce → fiche
   → faits) ; une recréation bloquée repart seule quand la cause est levée — **relancée seule à 21:09**, en ligne dès que
   Chrome tourne chez elle (annonce hors ligne depuis 15:02, le message le dit).
5. **geronimo, Louveteaux** — cause : le balayage comptait l'âge depuis la création (03/10). **Règle** : depuis la dernière
   remise en file (handler-watch v110 + déclencheur de la base). Seul des 30 relancés annulé à tort ; **remis en file**
   (script `20261015_cloture_rouge_soir.sql`, aucune annonce en ligne vérifiée avant). Glowik 2c38bff2 (créé le 06/10)
   aurait été annulé le 16/10 : protégé.
6. **Identité Leboncoin** — XEWER : le lien était juste, le TITRE du job périmé (import né d'une proposition fausse,
   recâblé sans titre) ; DeadRoz : annonce modifiée sur Leboncoin après le dépôt. **Règle** : identifiant + même fiche +
   photos identiques → titre du job aligné, job relancé ; au recâblage, le titre suit (migration). **Corrigés** : DeadRoz
   c85ac0e1 + 61370f28 (3279304096, en file pour le créneau du 16/10 08:00) et 7fe5890e (3279512631) ; XEWER b1ddec2c +
   e28911c2 (3259156501 → **republiée 3289045934**) ; lorenzocourouau87 60ea4686, 7f70a3f9, 8c649be9. Non touché : XEWER
   Skylanders 6542490d (photos d'une autre prise de vue — deuxième exemplaire probable).
7. **Ornella, support de fond photo** — catégorie juste (Photo, audio & vidéo › Accessoires). Motif de la modération
   illisible de notre côté (ni en base, 403 à la lecture). Nos écarts : marque « Canon » devinée par Leboncoin (corrigé
   0.6.113/0.6.114) ; 17 mots-clés servis (ligne « Mots-clés : » gardée par la règle du 10/09) → **règle changée (décision
   de Nico)** : la ligne compte dans les 5 (gpj v253). **Pas republiée** : l'objet est VENDU sur Vinted et sa fiche
   supprimée (republier = double vente) ; la vente n'a pas de ligne `ventes` (hors périmètre, à voir).
8. **Marque Vinted** — Romain « pago » (352029) et patrick « Paris 2024 » (305315) : anciennes marques libres que le menu
   ne propose plus ; update-job-status les « reprenait » deux fois puis retirait la question ; la recréation repartait de
   la marque capturée. **Règle** : la question (« Sans marque » ou une marque du catalogue) part une fois avant toute
   suppression ; la réponse prime à la recréation (0.6.114). Les deux jobs n'ont pas tourné ce soir (postes muets).
   **Non fait** : poser le brand_id capturé dans le corps de la recréation — exige un essai réel (compte de Nico).
9. **camille.ferren** — **clos** : l'annonce 3288747290 porte exactement les photos de notre copie (0-1 bit) →
   recréation rattachée (published). **PAUGUES lampe** : règle « feuille nommée par l'objet » (gpj v252) → Décoration ›
   Éclairage › Lampe à poser au prochain passage (prouvé sur ses données) ; 3/244 publications du parc concernées.
   **PAUGUES livre accordéon** : seule la personne décide (livre d'artiste tiré à 7, ISBN illisible sur les photos,
   Vinted exige un ISBN sur cette feuille) : annuler Vinted pour ce livre ou choisir un autre rayon.

## À prévenir (aucun message envoyé)
Ciddjy (ouvrir Chrome : ses dépôts Beebs attendent un relevé de son compte) · ana0115 (ouvrir Chrome : son tee-shirt se
remet en ligne seul) · Romain GUERIN et patrick giry (répondre une fois à la question « Marque ») · PAUGUES (livre
accordéon : décision) · Babaa (rien à retirer ; pour les prochains retraits sans Chrome : relier son compte eBay).
