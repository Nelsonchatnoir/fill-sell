# Point 5 — le prix à la republication (15/11/2026, heure de Paris)

Cas : nino57270 (7153db13), pièces auto sur Leboncoin, message du 15/11 13:34.

## La cause (prouvée en base)
- 15/11 : fiche « Calandre Audi A7 » passée de 225 à 200 € dans l'app à **13:22:04** (`prix_vente_change_par = app`),
  republication Leboncoin demandée à **13:22:50** → repartie à **225 €** (13:31). 14/11 : « Traverse Porsche 911 »
  299 → 250 € à 13:28:08, republiée à 13:28:17 → repartie à 299 €.
- `spend_coins_and_republish` (corps de prod lu à 15:25, md5 cba15cc9…) : sans prix choisi, Leboncoin, Beebs, Depop, Opla,
  eBay repartent au prix de la TÂCHE SOURCE (`COALESCE(prix choisi, prix de la tâche source)`, puis le prix relevé sur
  l'annonce) ; Vinted au prix capturé sur l'annonce. Le prix de la fiche n'était jamais lu.
- La feuille de republication n'offrait que « Garder », −5/−10/−15 %, et un champ de prix pour un article Vinted seul ;
  la baisse était calculée par l'app sur le prix Vinted ou la fiche, puis envoyée telle quelle à TOUTES les plateformes.

## Ce qui a changé
- **Règle unique au serveur** (`public.prix_de_republication`, migrations `20261115180000` à 15:38:35 et
  `20261115190000` à 15:42:38, feux verts ; `migration repair` faits) — pour toutes les plateformes et toutes les voies
  (bouton, lot, automatique, planifiée : `republish_planifiee_sweep` et `republish_auto_sweep_serveur` appellent
  `spend_coins_and_republish` sans prix) :
  1. un prix choisi (« Autre prix ») gagne ;
  2. sinon le prix de la **fiche** s'il a été changé **par la personne** après le moment où le prix de l'annonce a été
     **fixé** (dépôt, ou republication avec un prix choisi / repris) — une republication qui a recopié l'ancien prix ne
     compte pas (sinon la Calandre, repartie à 225 € à 13:31, serait restée à 225 €) ;
  3. sinon le prix de l'annonce (inchangé) ; une fiche changée par un relevé ou le serveur ne compte pas ;
  4. −5/−10/−15 % s'appliquent sur ce prix-là, **annonce par annonce** (plancher 2 €, arrondi à l'euro inférieur).
  Le pourquoi est gardé sur la tâche (`platform_fields.prix_decision`), jamais recopié d'une republication à l'autre. Rien
  d'autre ne change (titre, photos, description, catégorie, retrait puis recréation, créneaux, quotas, pépites).
- **App (web + OTA 2.9.199)** — feuille de republication : « Garder », « −5 % », « −10 % », « −15 % » et, pour UN article,
  **« Autre prix »** avec un champ. Prix contrôlé : en chiffres, au moins 1 €, deux décimales au plus — sinon une phrase
  claire et le bouton grisé (jamais 0 €). Le prix saisi part sur l'annonce ET devient le prix de la fiche (après au moins
  une republication partie). En lot : seulement les pourcentages ; un prix déjà changé dans une fiche est pris tout seul
  (règle 2). La baisse part au serveur en pourcentage (`p_baisse_pct`), plus en prix calculé.
- Aucun job existant modifié, aucune republication relancée, aucun mail.

## Le verrou et la preuve
- `selftest:prix-republication` (23 contrôles ; **21 rouges sur le code d'avant**) : casse si une republication ignore
  un prix changé dans la fiche (règle serveur, branchements, voies automatiques), si « Autre prix » disparaît ou sort en
  lot, si le contrôle de saisie laisse passer 0 € ou un texte, si le prix saisi n'est plus écrit dans la fiche.
- `selftest:prix-republication-pg` (banc 23/23 sur base jetable) : migration appliquée sur le corps de prod, rejouée,
  inverse ; **l'historique réel de la Calandre** (dépôt 250 €, republication à 225 € choisie le 24/10, republications
  sans prix le 13/11 et le 15/11 à 13:31) → prochaine republication à **200 €** ; fiche changée avant → prix de
  l'annonce ; fiche changée par un relevé eBay → prix de l'annonce ; −10 % sur la fiche (180 €) ou sur le prix relevé ;
  plancher ; prix choisi ; Vinted ; aucun prix connu → rien (jamais 0).
- Relu en prod (lecture, 15:43) sur ses fiches : Calandre → prochaine republication **200 €** (−10 % → 180 €) ; Traverse
  Porsche → **250 €** (−10 % → 225 €) ; Phare CUPRA (fiche changée par un relevé eBay) → garde 129 € (−10 % → 116 €).
- Essai réel : non fait (créer une republication sur une annonce de Nico demande sa session ; le banc rejoue le cas réel).
- Inverses : `supabase/rollbacks/20261115190000_…_INVERSE.sql` puis `20261115180000_…_INVERSE.sql` (à jouer AVEC le retour
  de l'app d'avant : l'app 2.9.199 envoie `p_baisse_pct`).
