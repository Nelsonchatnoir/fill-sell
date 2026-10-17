# Lot 4.3 / 4.4 — Ventes en lot et fiches à plusieurs exemplaires (vérification LECTURE SEULE, 17/10/2026 ≈ 20:00 Paris)

Rien n'a été modifié. Dépôt à `9129f95` (+ lots 2-4 non commités, sans rapport avec ce sujet).
Règle durable : `docs/regles/ventes-et-retraits.md` § 18/10.

## A. Ventes en lot (plusieurs annonces dans une commande)

Point commun : `enregistrer_ventes_relevees` (`supabase/migrations/20261017120000_ventes_vinted_en_lot.sql`) ne découpe
une commande qu'à deux endroits — Vinted (l.1253 `IF p_platform = 'vinted' AND … count(*) >= 2 → vente_vinted_lot_noter`)
et eBay (l.1267). Partout ailleurs, une ligne `lot` donne UNE vente sans fiche ni annonce (l.1039-1041 `v_bande := 'lot'`,
l.1223 `quantite 1 … CASE WHEN v_lot THEN NULL ELSE v_listing END`). Hors eBay et lots Vinted, le relevé ne passe jamais une
fiche à « vendu » : il insère seulement la ligne de vente (l.1213-1287).

- **Leboncoin : MANQUE.** Une vente groupée (`bundle`) = une seule ligne « lot », sans numéro d'annonce
  (`chrome-extension/background.js:17729-17730` : `listing_id: null … lot: String(t?.item?.type ?? "") === "bundle"`).
  La veille des commandes écarte les lots (`background.js:20526` : `commandes.filter((c) => !c.lot)`). Les annonces du lot
  ne sont repérées qu'une par une par le veilleur (`sale_signal`) et la vente attend un clic (`:21420-21421`). Risque : la
  ligne « lot » (`inventaire_id` NULL) n'est pas vue par la garde anti-doublon de `enregistrer_vente_atomique`
  (`20261015000000_signal_vente_jamais_en_boucle.sql:399-403`, filtre sur `inventaire_id`) → lot compté deux fois possible.
- **Beebs : MANQUE.** Les ventes Beebs ne sont jamais relevées : `VENTES_PLATEFORMES = ["vinted","leboncoin","opla"]` +
  `"depop"` (`background.js:17417-17419`) ; la fonction SQL refuse Beebs (`20261017120000:913`). Les commandes Beebs
  (`o.products[]`) ne sont lues que par la messagerie bêta (`messagerie.js:777,781`, `"${produits.length} articles"`,
  `annonce_ref` seulement si l'article est unique) → `plateforme_commandes`, qui « ne touche jamais ventes ni inventaire »
  (`20261016170000_messagerie_bordereaux_beta.sql:183`). Reste le veilleur, annonce par annonce, et le clic.
- **Depop : OK pour reconnaître chaque article, avec un risque.** `content-scripts/depop.js:816-833` : une ligne par
  annonce `STATUS_PURCHASED` (`ref: String(o.id)`, `listing_id: o.slug`, `lot: false`). Fiche → vendu et retrait des copies
  par le veilleur (`background.js:21422-21426`, `sale_evidence … exact: true`) puis `ventes_prouvees_tick` →
  `enregistrer_vente_atomique`. Risque : si le relevé écrit la vente avant, `enregistrer_vente_atomique` refuse
  `vente_deja_liee` (`20261015000000:399-403`) ; l'équivalent Vinted (`vente_relevee_meme_cession`) ne couvre que Vinted
  (`20261015120000:56`) → fiche en stock et copies en ligne.
- **eBay : OK pour plusieurs annonces, MANQUE pour la quantité d'une ligne.** `ebay-ventes-sync/index.ts:112-145` :
  `items.map((li) => ({ ref: \`${o.orderId}:${li.lineItemId}\`, … listing_id: li.legacyItemId … lot: false }))`, puis
  `ebay_commande_appliquer` pour chacune (`20261017120000:1267-1269`) ; la notification parcourt aussi toutes les lignes
  (`ebay-notifications/index.ts:226`). Le manque : `li.quantity` jamais lu (`:127-145`), vente écrite `quantite = 1`
  (`20261017120000:1223`) au prix `lineItemCost` (toutes les unités) → une ligne de 2 exemplaires = une vente à 1
  exemplaire, marge fausse ; le stock reste juste grâce à la quantité eBay.
- **Colonne `ventes.quantite`** : existe, vaut toujours 1, une ligne par exemplaire (`enregistrer_vente_atomique` boucle
  `FOR v_n IN 1..v_q … quantite 1`, `20261015000000:415-423`).

## B. Fiche à plusieurs exemplaires (stock > 1)

- **Garde côté serveur : OK.** `20261015000000:406` `v_restant := quantite - v_q` ; `:425-426` `IF v_restant>0 THEN UPDATE
  inventaire SET quantite=v_restant` ; `:446` copies touchées seulement si `(v_restant=0 OR …)`. Déclencheur fiche
  (`20260926203051_article_vendu_retire_ses_copies.sql:297-302`) : seulement au passage à « vendu » ou quantité ≤ 0.
  Déclencheur preuve de vente (`:344-346`) : `if coalesce(v_q,1) > 1 then return new;`. Lots Vinted (`20261017120000:635`) :
  `doute:plusieurs_exemplaires_sans_annonce`. Notification eBay (`_shared/ebay-commande-notification.js:77-78`) : pas de
  « vendue » si `dispo > ligne.quantite`.
- **Commande eBay sur une fiche à plusieurs exemplaires : MANQUE.** `ebay_commande_appliquer`
  (`20261009190000_ebay_commande_un_exemplaire.sql:195-210`) ne regarde que la quantité eBay, jamais `i.quantite`
  (`ELSIF q->>'etat' IN ('epuisee','terminee') THEN … UPDATE inventaire SET statut='vendu', quantite=0`). La publication
  par l'API met toujours 1 exemplaire (`ebay-api-worker/index.ts:510` `quantity: 1`, `:538` `availableQuantity: 1`) →
  une fiche à 3 exemplaires publiée sur eBay passe entière à « vendu » à la vente eBay, et le déclencheur retire toutes
  ses copies. `annonce_ebay_aligne_quantite` (`:307-313`) recopie la quantité eBay (1) sur la fiche à la première lecture.
- **Baisser la quantité eBay au lieu de retirer : MANQUE.** `reviserQuantiteAnnonce` (`ReviseInventoryStatus`,
  `ebay-api-worker/index.ts:3112-3164`) n'est lancée qu'à la main (`x-cron-secret`, route `reviser_quantite_annonce`
  `:3495`), jamais par une vente ailleurs → N reste sur eBay (survente possible). Le chemin inverse existe
  (`ebay_commande_appliquer:217-225` aligne le stock sur eBay).
- **Autres plateformes** : Leboncoin pro multi-unités « reste ouvert » (`20261009190000:32-33`, relevé saute les comptes pro
  `background.js:17699`) ; Depop : publication à plusieurs exemplaires possible (`depop.js:404`) mais seule une annonce
  entièrement vendue est relevée (`depop.js:820`).
- **Affichage** (`src/utils/comptabilite.js:70`) : `const q = i.quantite || 1` ne sert qu'au total investi du stock.

## Verdict

Rien corrigé le 18/10 : chaque correctif touche une fonction de prod (`enregistrer_ventes_relevees`,
`ebay_commande_appliquer`) ou un relevé de commandes, et ne se prouve qu'avec de VRAIES ventes (lot Leboncoin, ligne eBay à
2 unités, vente Beebs). À décider par Nico : (1) eBay `li.quantity` → `quantite` ; (2) Leboncoin `bundle` : lire les
annonces du lot dans le détail de la commande ; (3) relevé des ventes Beebs (`o.products[]` → ventes) ; (4) eBay :
`ebay_commande_appliquer` tient compte de `i.quantite`, et une vente ailleurs révise la quantité eBay (−1) au lieu de
retirer l'annonce.
