# Reprise — enquête Bebertdeals et la remise en ligne Vinted (08/10 nuit)

Mandat de Nico : analyser avec preuves la synchro Vinted de Bebertdeals
(c15f4b0e) du 08/10, corriger la RÈGLE (pas le cas), retester, pousser ;
aucune donnée de client modifiée, aucune action sur les plateformes, aucun mail ;
tout correctif qui change ventes ou retraits sur le parc derrière un drapeau,
compromis dit avant d'armer.

Rapport : `docs/enquetes/bebertdeals-0810/RAPPORT.md` (causes, preuves, rayon
d'explosion, compromis, réparation proposée).

## Ce qui est fait

- **Moteur** : `supabase/functions/_shared/rapprochement/remises-en-ligne.js`
  (+ `pesee` exportée de `moteur.js`, appel dans `passe.js` après les fiches à
  la main, portée `remises` dans la fonction `rapprochement`).
- **Fonction `rapprochement` v15** déployée (`verify_jwt` false relu avant/après),
  **INERTE** : la lecture ne rend `remise_en_ligne_actif` qu'avec la migration
  ET le drapeau à 1.
- **App (web)** : la raison d'un refus du serveur est affichée aux trois
  confirmations de vente (`src/utils/raisonRefus.js`). OTA **non envoyée**.
- **Selftest** `selftest:remise-en-ligne-vinted` (moteur + migration ; `--prod`
  = preuve en base) ; suite complète des selftests relancée : 0 rouge.
- **Preuve en base** (transaction annulée, compte fictif) :
  `scripts/reparations/20261008_preuve_remise_en_ligne.mjs` — 20/20 vert :
  lecture, garde de vente (armée : refus ; coupée : comme avant), écriture de la
  chaîne, deux exemplaires jamais fondus, inverse, VRAIE vente « sold » → vente +
  retrait de la copie Leboncoin armé.
- **Rejeu à blanc** : `scripts/reparations/20261008_remises_en_ligne_vinted.mjs`
  (`--user`, `--parc`) — chiffres dans le rapport.

## Ce qui attend le feu vert nommé de Nico

1. **Migration `20261008160000_remise_en_ligne_vinted.sql`** (NON appliquée ;
   md5 des 4 fonctions de prod vérifiés au début ; drapeaux posés à 0 → la passe et
   la vente ne changent pas ; seul effet immédiat : une fusion faite À LA MAIN entre
   la fiche d'une annonce supprimée et celle de sa remise en ligne donne l'annonce
   vivante à la fiche gardée). Geste : `npx supabase db query --linked -f
   supabase/migrations/20261008160000_remise_en_ligne_vinted.sql` puis
   `npx supabase migration repair --linked --status applied 20261008160000`,
   relire, puis `node scripts/reparations/20261008_preuve_remise_en_ligne.mjs --appliquee`.
   Inverse : `supabase/rollbacks/20261008160000_remise_en_ligne_vinted_INVERSE.sql`.
2. **Armer** (une ligne chacun, journalisée dans `coin_config_journal`) :
   `UPDATE coin_config SET value = 1 WHERE key = 'rapprochement_remise_en_ligne';`
   puis, compromis compris, `… WHERE key = 'vente_garde_remise_en_ligne';`.
   Couper : la même ligne à 0.
3. **Rattrapage** compte par compte (après 1 et 2 ; sauvegarde
   `_backup_0810_remise_*` d'abord) : `node
   scripts/reparations/20261008_remises_en_ligne_vinted.mjs --user <uuid>
   --appliquer`. Bebertdeals d'abord (166 chaînes, 58 questions au rejeu).
4. **Réparations de données** (liste dans le rapport, § réparation) : les deux
   annonces Leboncoin en ligne d'articles vendus chez Bebertdeals (3271071626
   A178, 3271067256 C202), les fiches A177, les 16 annonces du parc (13 fiches,
   6 comptes, mêmes photos qu'un article vendu), 7373c96c et f44b5917.

## Ce qui n'est pas fait (proposé)

- **Extension** : les brouillons écartés par la base comptent encore comme
  « créés » (284 au lieu de 268 ; « 16 créés » au second passage = 0 fiche) ; une
  disparition bloquée par la garde « effondrement » devient impossible à dater
  (fenêtre de la règle 3). Correctifs proposés, rien construit (zip 0.6.104 en
  attente de téléversement).
- **Article republié PUIS vendu entre deux synchros** (la nouvelle fiche naît
  « vendue ») : la règle ne juge que les nouvelles annonces EN LIGNE ; les copies
  restées sur l'ancienne fiche ne sont pas retirées automatiquement — réparation
  au cas par cas, règle à concevoir (question « Déjà vendu ? » sur ces copies).
- OTA de l'app (la correction de l'affichage du refus n'atteint le mobile qu'avec elle).
