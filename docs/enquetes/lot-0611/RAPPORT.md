# Lot de Nico du 06/11/2026 — 11 points (terminal « Problèmes », reprise du 05/11)

Heures de Paris. Règles durables : `docs/regles/ventes-et-retraits.md` § 06/11, `docs/regles/rapprochement-et-releves.md`
§ 06/11, `docs/regles/extension-et-versions.md` § 06/11. Déploiements et versions : `docs/agents/etat-2026-10-01.md` § 06/11.

## 1. Version minimum abandonnée définitivement
- `0.6.175` ajoutée à `ALREADY_PUBLISHED` ; `EXTENSION_MIN_BUILD` ne se pose JAMAIS (consigne de fin de
  `package-extension.mjs` remplacée) ; sa valeur (0.6.124) ne sert plus qu'au bandeau, qui informe sans jamais dire que la
  file attend.
- Supprimé côté serveur : porte globale de get-pending-jobs (file vide + `extension_update_required`) et refus 409
  d'update-job-status ; filtre par job `build_min_requis` (le champ reste une trace) ; retenues Beebs < 0.6.83 et < 0.6.95,
  colis Vinted < 0.6.84, preuves de retrait < 0.6.80, Opla < 0.6.74, attente ISBN « mise à jour », condition de build de la
  pause « marque » ; la mise en pause `pauseAttente` (needs_user_source « build_min_requis ») ; la condition de build des
  recréations bloquées. App : plus de pastille « En pause — mise à jour ».
- Gardé (ce n'est pas « trop ancien ») : `posteApresDefaut` (un build qui a PLANTÉ sur un job ne le reprend pas — sinon il
  replanterait toutes les 30 min) ; la relance automatique, une fois, quand le poste a le build ; les adaptations de
  capacité (un champ en plus servi à un poste récent).
- Selftest `aucune-retenue-par-version` ; 9 selftests adaptés.
- Tâche de Marta MELE 2fd83d73 (pause « build_min_requis » depuis le 29/10, son poste avait le build depuis le 02/11) :
  relancée par le circuit normal (`scripts/reparations/20261106_relance_marta_pause_version.mjs`, règle
  `vinted_categorie_page_etrangere_publish_en_pause`, `champsRelance`). Seule tâche en pause pour ce motif.

## 2-3. Doudou de nicolas.menar (fiche 1790106697754007, vendue sur Vinted le 06/10)
- Relues le 06/11 à 09:57 sur leur page publique : Leboncoin 3274924341 (Doudou, 24 €) et 3267000921 (Lot 2 doudous,
  36 €) — HTTP 200, `active`, aucune transaction.
- Photos : 3274924341 = la photo même de la fiche (même cadrage, même tache). Le LOT : le doudou du BAS porte la même
  tache brune ovale, au même endroit (bordure grise, couture gauche de la mousseline, petit point sombre juste au-dessus)
  que le doudou vendu ; le doudou du haut n'en a pas. → **le lot contient le doudou vendu** : retrait.
- Retraits armés à 09:58 par `armer_retrait_annonce_pour` (`scripts/reparations/20261106_doudou_lbc_retraits.sql`,
  sauvegarde `_backup_0611_doudou_lbc_retraits`, inverse) : a8d477e9 (3274924341), 81ea0f96 (3267000921).

## 4. Le « Oui » qui n'armait rien hors session
- Cause : `inventaire_doublon_decider` lisait le compte sur la session (`auth.uid()`) — sans session, « unauthorized ».
- Règle : migration `20261106100000_doublon_decider_auteur_legitime` — corps unique (`_corps`, compte de la QUESTION),
  deux entrées (l'app ; l'équipe sur ordre, service seulement, auteur nommé). **PRÉPARÉE, NON APPLIQUÉE** : feu vert nommé
  de Nico. Banc jetable `scripts/essais/20261106100000_banc.mjs` : 30/30 (défaut rejoué ; la personne obtient exactement les
  mêmes issues ; l'équipe la même issue que la personne ; droits ; inverse).

## 5. Point 1 c, version étroite
- Migration `20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree` **PRÉPARÉE, NON APPLIQUÉE**.
- Cas réels (prod, lecture seule, `scripts/essais/20261106120000_cas_reels.sql`) : 152 fiches (36 comptes) changent de
  compte, toutes de 1 à 0 ; 0 franchit le seuil 2 que lisent les appelants → aucune décision ne change aujourd'hui ; la
  version large en changeait 238 dont 2 au seuil (les deux pièces uniques du STOP du 05/11), intactes ici. Effet voulu :
  les 7 séries de Louis vendues le 06/11 compteront 1 au lieu de 2 quand le relevé verra leur remise en vente.
- Banc `scripts/essais/20261106120000_banc.mjs` : 10/10.

## 6. Juge « annonce publiée disparue » : RALLUMÉ
- Simulation (vrai code, vraie prod) : 5 082 jugées, 17 fermetures, 17 vérifiées parties (Vinted 11 × 404, 3 × « Vendu » ;
  Leboncoin 3 × 410). Vraies republications : 596 dont l'ancienne annonce ≠ celle en ligne (390 des comptes de l'incident) :
  toutes « attendre », jugées sur le numéro en ligne. Zéro faux → `JUGER_ANNONCES_PUBLIEES_DISPARUES = true`.

## 7. Les couples « à vérifier »
- `docs/enquetes/rattachements-0511/TRI-PHOTOS-79.md` : 78 ce matin (le 79e est sorti : annexe) — 62 vrais, 3 faux,
  13 indécidables. Rien touché.

## 8. Louis
- Les 7 ventes en série « Achat en cours » : enregistrées le 06/11 à 07:15, les 7 remises en vente publiées à 07:20.
- Deux AUTRES ventes en série jamais enregistrées : 3297299585 (« Rangement Noir et Gris », Vendu depuis le 05/11 09:49) et
  3280443604 (« Rangement Blanc », Vendu depuis le 24/10 12:10). Cause : la lecture fraîche (24/10, décision 7) sautait
  un job déjà marqué `sale_signal = sold` — ici un « Vendu » lu sur la page, SANS preuve exacte — et la preuve de la
  transaction n'arrivait jamais. Règle : migration `20261106110000_lecture_fraiche_preuve_exacte` **PRÉPARÉE, NON
  APPLIQUÉE** ; banc 11/11. Une fois appliquée, les deux ventes passent au relevé suivant de Louis.

## 9. Spam support@
- Sortis (« Non-spam ») : Pascal Caffray (15/10, « Erreur compte synchro eBay » — attend une réponse), Nicolas THOBOIS
  (24/10, « STOP »), alertes internes « Paiement échoué » nivake03 (23/10) et nadegemarcelin78 (09/10).
- Laissés : 2 invitations TestFlight « AdsGPT … OpenAI OpenAds Campaign » (22/10) — leurre non sollicité.

## 10. Champs requis : trois choix (rien appliqué) — voir le rapport de session.

## 11. Retrait Leboncoin en boucle (Cédric GRIZSTYLE)
- Annonce 3303036848 republiée le 05/11 à 22:27, vendue sur Vinted (retrait armé 22:31), vue « active » au tableau de bord
  à 22:30, puis 410 « désactivée » à 22:48 et 23:04 : lectures dans la fenêtre de modération (2 h), chacune comptée comme
  un essai. Leboncoin ne distingue pas modération et retrait (page et tableau de bord) : seul le temps depuis le dépôt.
- Règle : `_shared/lbc-retrait-moderation.js` (update-job-status) — dans la fenêtre, attente sans essai consommé ; après,
  le 410 clôt sans message.
- Retrait de Cédric clos à 10:08 par la clôture du serveur (« déjà hors ligne ») : page relue 410 à 09:57, 11 h 30 après
  le dépôt ; copie publiée f21124c0 close « pas une vente » (`scripts/reparations/20261106_retrait_lbc_cedric_clos.mjs`,
  sauvegarde `_backup_0611_retrait_lbc_cedric`, inverse).
