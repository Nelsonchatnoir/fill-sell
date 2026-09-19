-- ── « Type d'article neuf » Leboncoin : requis pour un vendeur PRO sur du NEUF,
--    jamais pour le parc (2026-09-19) ────────────────────────────────────────
--
-- LE FAIT. Le 18/09 entre 07h56 et 08h22, un relevé DOM a écrit
-- `new_item_type` en required=true sur 5 feuilles Leboncoin. Ses 7 valeurs
-- disent d'elles-mêmes à qui le champ s'adresse : Déstockage, Liquidation de
-- stock, Produit avec défaut, Modèle d'exposition, Création / Artisanat,
-- Retour client, Produit dégriffé. C'est le vocabulaire d'un professionnel qui
-- déclare POURQUOI il vend du neuf.
--
-- LA PREUVE QUE LE CHAMP N'EXISTE PAS SUR UN ARTICLE D'OCCASION — relevée sur
-- les 25 dépôts qui portent la clé, sans un seul contre-exemple :
--     état NEUF     → 13 dépôts,  0 « contrôle introuvable », 11 publiés
--     état OCCASION → 12 dépôts,  6 « contrôle introuvable »,  5 publiés
-- Le warning, verbatim, sur le job 7e4f3744 (Jogging Decathlon, « Très bon
-- état », PUBLIÉ) :
--     « new_item_type: contrôle introuvable même en seconde passe
--       (label[for="new_item_type"]) — valeur « Déstockage » non posée »
-- avec, sur la même ligne, lbc_depot.preuve = « confirmation (message « Votre
-- annonce est publiée ») ». On a fait déclarer « Déstockage » sur un jogging
-- d'occasion pour franchir une porte qui n'est pas sur sa page, et l'annonce
-- est partie quand même.
--
-- CE QUE ÇA A COÛTÉ EN 15 HEURES : 10 questions bloquantes au step Publier, sur
-- 5 comptes. Un seul (63ad8597) a jamais VU ce champ sur son formulaire. Les
-- 4 autres n'ont AUCUN job Leboncoin, et 2 d'entre eux aucun job du tout —
-- l'un a buté à 04h23 du matin sur un lot de cigares classé en Vêtements.
--
-- CE QUE FAIT CETTE MIGRATION, ET RIEN D'AUTRE.
-- `required = false` sur ces 5 lignes. La ligne RESTE : le champ existe
-- réellement pour un vendeur pro sur du neuf, et ses 7 options relevées sont
-- justes — on ne jette pas un relevé exact, on retire la généralisation. En
-- required=false la ligne n'est plus chargée par le stepper
-- (ListingPreviewScreen.jsx charge `.eq("required", true)`) : plus de blocage,
-- le catalogue garde la connaissance.
--
-- ⛔ CE QU'ELLE NE FAIT PAS. Elle ne réécrit AUCUN job passé : les 25
-- `platform_fields.lbcAspects.new_item_type = "Déstockage"` déjà posés restent
-- tels quels. On ne repasse pas sur l'historique.
--
-- ⚠️ PORTÉE DANS LE TEMPS — À LIRE AVANT DE CROIRE LE PROBLÈME RÉGLÉ.
-- Cette migration ne tient QUE jusqu'au prochain relevé. `persistDiscoveredAspects`
-- (chrome-extension/background.js) envoie `required` à CHAQUE upsert et
-- PostgREST écrase en merge-duplicates : la prochaine fois que le compte pro
-- déposera sur une de ces 5 feuilles, la ligne repassera à true toute seule.
-- Les horodatages le prouvent — ces lignes ont encore bougé le 19/09 à 01h57.
-- Le correctif durable est la garde de corroboration (lot A2) ; celle-ci
-- arrête l'hémorragie, elle ne ferme pas la plaie.

UPDATE public.platform_category_aspects
   SET required = false
 WHERE platform  = 'leboncoin'
   AND field_key = 'new_item_type'
   AND required  = true;
