# 10/11/2026 soir — le mur du lot facturait encore les imports (complément du correctif 806033f)

Heures de Paris partout. Ordre de Nico (10/11 soir) : un article importé dont on garde le titre ET la description
d'origine coûte 0 annonce, toutes voies (mur du lot, « Où publier ? », barre de sélection du Stock). Le compteur
serveur (juste) et les plafonds de la grille ne sont PAS touchés.

## Constat (base, lecture seule)
- van.nessa.calvo d0ac0538 (Free, web, essai Cloud) : `quotas_etat` 2/5 (ses 2 scans Lens de 18:48 et 18:51) ; ses 11
  `generate_listing` de la soirée portent `texte_vendeur_titre` = `texte_vendeur_description` = true (vinted_sync) et
  ne comptent pas — le serveur est juste.
- Mur du lot (`lot_mur_quota_affiche`, 3 annonces restantes à chaque fois) : 19:05 lot 6 → 3 retenus / 3 reportés ;
  19:13 lot 7 → 3 / 4 ; 19:22 lot 9 → 6 / 3 (3 fiches déjà rédigées pour les plateformes visées, gratuites par
  `ficheCouvre`). 10 articles reportés, tous des imports Vinted de son stock (208 fiches vinted_sync en stock, 2
  fiches Lens déjà publiées à 18:49 / 18:52).

## Cause (prouvée par le code et le selftest)
- 806033f a branché `redactionHorsQuota` sur le mur (`LotPublication.jsx`, `consomme`) et sur la barre du Stock
  (`StockTab.jsx`, `lotARediger`). Mais ces deux écrans reçoivent les fiches mises en forme par `mapItem`
  (`src/App.jsx`), qui range le titre sous **`title`** (`title:v.titre`) — aucune clé `titre`.
- `redactionHorsQuota` → `texteDuVendeurDeLaFiche` lisait `ligne.titre` : `undefined` → titre vide → « l'IA
  rédigera » → 1 annonce pour CHAQUE fiche du Stock. Le correctif ne pouvait rien changer au mur ni à la barre.
- « Où publier ? » n'était pas touché : `ListingPreviewScreen` lit la fiche en base (`titre`, `description`,
  `origine`).
- Pas une affaire de cache : `https://fillsell.app/build.json` servait `2026-11-10T17:25:12Z+806033f`, et l'ancienne
  version comme la nouvelle donnent le même mur (selftest sans le correctif : 9 imports, 3 restantes → 3 retenus,
  6 reportés). Le web se recharge seul à chaque build neuf (`App.jsx`, `/build.json` toutes les 5 min).
- Les selftests de 806033f n'essayaient que des objets de la base (`titre`), jamais une fiche du Stock.

## Correctif (règle, tous les comptes)
- `src/utils/sourceDuTexte.js` : `redactionHorsQuota` lit la fiche par `ficheAvecTitre` (`titre` s'il est là, sinon
  `title`). Une seule source pour les trois prévisions ; rien d'autre ne change (vraie rédaction IA, scan Lens, titre
  d'un seul mot, texte marqué lens / vocal / ia : comptent toujours).
- `scripts/source-du-texte-selftest.mjs` § 7 : la forme de `mapItem` relue dans `App.jsx`, son lot rejoué par
  `partagerQuota` (grille à 3 jauges et partage d'avant) — 9 imports, 3 restantes → 9 retenus, 0 reporté, 0 annonce ;
  9 imports + 4 fiches Lens → 12 retenus, 1 Lens reporté. Rouge sans le correctif (5 échecs), vert avec.
- Mobile : même bundle (`src/`) → OTA nécessaire. Extension et Cloud : aucun calcul de mur à eux.

## Comptes touchés depuis la mise en ligne de 806033f (18:25)
- Méthode : tous les `lot_mur_quota_affiche` depuis 18:25:12 (le mur ne trace pas les articles) ; plus les autres
  murs d'annonces (`offers_modal_open` quota_geste annonces, `premium_cta_click` lot_publication_mur).
- Résultat : **1 seul compte, d0ac0538** (3 murs, 10 articles reportés). Aucun autre mur d'annonces depuis 18:25.
- Limite : la barre de sélection du Stock (« au-delà de tes annonces ») n'est pas tracée ; quelqu'un a pu la voir
  sans ouvrir le lot — non mesurable. Avant 18:25, l'ancien décompte est celui du rapport
  `docs/enquetes/quota-texte-vendeur-1011/RAPPORT.md`.

## Son compte
- Rien publié à sa place, rien modifié en base : ses articles reportés restent dans son stock, elle les relancera.

## En service (10/11 soir)
- 90323d6 poussé 20:54:45 ; web `2026-11-10T19:56:01Z+90323d6` ; OTA 2.9.171 (delta) sur le canal production.
- Rejeu à blanc sur 9 vrais imports de son stock (vinted_sync, jamais publiés sur Leboncoin / Beebs ; code de l'app :
  `redactionHorsQuota` + `partagerQuota`, 3 annonces et 20 publications restantes, 2 plateformes) : avant 3 retenus /
  6 reportés ; après **9 retenus, 0 reporté, 0 annonce consommée, 18 publications : le mur ne s'affiche plus**.
  Aucune session ouverte chez elle (elle publiait en direct depuis son poste Cloud) ; rejeu navigateur non fait.
