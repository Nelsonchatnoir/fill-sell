# Pièges connus — tout ce qui a déjà cassé

> Référence pour agents de code, appelée par `AGENTS.md` (racine). Rédigé le 27/09/2026.
> Se périme : la base de prod, `git log` et les outils font foi, jamais ce fichier.


Chaque ligne a coûté des heures ou des données. Les notes détaillées de
Claude sont dans `C:\Users\nicol\.claude\projects\C--Users-nicol-fill-and-sell\memory\`
(un fichier par fait, index `MEMORY.md`) — lisibles, mais la prod fait foi.

## Déploiement
- **Écran blanc** = d'abord l'empreinte du build (`AGENTS.md` § 3.6). Six pushs en dix
  minutes = prod à l'écran blanc (18/09).
- **OTA** : ordre bump version → **commit** → build → upload. Builder avant de
  commiter embarque une empreinte `-dirty` du commit précédent (irrattrapable :
  Capgo refuse un numéro déjà consommé). Un simple fichier non suivi suffit à
  faire `-dirty`. Un envoi figé à 99 % consomme quand même le numéro (2.9.24).
  Ne jamais rebuilder un `dist/` déjà empreint pour le renvoyer sous un autre
  numéro.
- **Extension** : un push sur `main` ne déploie PAS l'extension. Le zip du
  24/07 est parti sans le fix Beebs parce qu'il sortait d'un autre dossier
  (worktree supprimé depuis : UN SEUL dossier de travail). Deux extensions
  actives dans le même Chrome se disputent les jobs et `handler_build` ment.
- **`verify_jwt`** : un redéploiement d'une fonction non déclarée dans
  `config.toml` sans `--no-verify-jwt` casse son cron en 401 silencieux.
- **Import distant flottant** (`@2`) : le 23/09, `supabase-js@2` a résolu vers
  une version dont une dépendance rendait 404 → 48 fonctions indéployables.
- **Migration repartie d'un vieux corps** : l'import automatique est resté
  mort du 19 au 23/09 parce qu'une migration réécrivait une fonction depuis
  un fichier périmé. Toujours partir de `pg_get_functiondef` en prod.
- **`\b` via heredoc Bash → U+0008** : regex morte sans erreur (« neuf
  seulement », 24-25/09). Écrire le code avec un éditeur, pas un heredoc.
  `String.replace` + `$'` a corrompu une migration générée.

## Données et base
- **`updated_at` n'existe pas sur `cross_post_jobs`** : l'ajouter à un
  `.select()` a vidé toutes les cartes du Stock de tous les comptes (05/08,
  build vert). Un select PostgREST est tout-ou-rien.
- **`email_logs` > 1000 lignes** : lecture non paginée = tronquée en silence.
- **Type d'email one-shot hors de l'index** = doublon (welcome, 03/08).
- **`position('' in x)` vaut 1** : un identifiant vide « trouve » tout.
  Toujours exiger un identifiant non vide avant de comparer.
- **Prix d'achat 0 ≠ inconnu** ; `isNaN(null) === false`.
- **`spend_coins_and_publish` recopiait les photos du premier job venu**
  (DISTINCT ON sans ORDER BY) : un job Leboncoin plafonné à 3 photos
  réécrivait la fiche (16 fiches sur 17). Corrigé le 27/09 ; tout DISTINCT ON
  exige un ORDER BY qui dit lequel gagne.
- **Premium fantôme** : `is_founder` / identifiants Apple-Google ne sont pas
  des signaux premium.

## Extension et plateformes
- **`listing_url` croisée** (13/07, « le bug de données le plus dangereux ») :
  sur une page de liste, « un seul lien → c'est le bon » a attribué l'URL
  d'une annonce à un autre article ; une vente aurait retiré la mauvaise
  annonce. Règle : `requireTitle: true` sur toute page de liste, et depuis le
  27/09 **jamais de repli par titre** quand le dépôt a rendu l'identifiant.
  Requêtes d'audit après toute campagne :
  ```sql
  SELECT listing_url, count(DISTINCT inventaire_id) FROM cross_post_jobs
  WHERE listing_url IS NOT NULL AND action='publish'
  GROUP BY listing_url HAVING count(DISTINCT inventaire_id) > 1;
  ```
- **Fausses alertes « plus en ligne » / « disparue »** : le veilleur hors
  Vinted concluait sur UNE lecture (232 jobs Opla d'un compte le 23/09
  pendant que 34 relevés voyaient les annonces). Corrigé : 2 lectures (0.6.72)
  + levée automatique à la clôture d'un relevé qui revoit l'annonce
  (migration 20260927170000).
- **`needs_user` muets** : des jobs attendaient un geste sans motif ni écran.
  Corrigé le 27/09 (trigger + filet dans `update-job-status`, section 🔇 de
  l'ops-digest).
- **Faux « déconnecté »** : un mur vu par un handler n'est pas une
  déconnexion si la sonde voit la session bonne → refus passager (nouvel
  essai 3, 6, 10 min), jamais « connecte-toi » (0.6.71, 27/09).
- **Beebs index public** : `beebs-lien` v2 a clos 13 dépôts en « tu peux la
  republier » parce qu'absents de l'index (qui ne voit ni la modération ni
  les ventes) → invitation au doublon. Restauré le 27/09 ; règle `AGENTS.md` § 4.3.
- **Relevé Leboncoin PRO redirigé vers l'accueil** : le relevé a importé des
  annonces d'inconnus (25/09). Un relevé doit vérifier qu'il lit bien SA liste.
- **Relevé vide = rien** : une boucle de relevés Leboncoin (24/09) relançait
  sans fin ; garde serveur du veilleur (espacement, arrêt après 2 relevés
  vides) et règle : un relevé vide ne prouve aucune disparition.
- **Boucle de doublons** : supprimer une fiche « en gardant l'annonce » la
  remettait sans fiche → le relevé suivant la ré-importait (5 fois pour la
  même annonce Beebs, 23/09). Une fiche supprimée laisse une trace
  (`fiche_supprimee_le`) qui empêche le ré-import.
- **ISBN Vinted `0000000000000`** : une republication a posté `isbn: null` →
  annonce supprimée et perdue (27/09). La valeur capturée se remet TELLE QUELLE
  (0.6.70) ; retenue serveur tant que le poste n'a pas ce build.
- **Fenêtre de travail minimisée** : `getClientRects()`, `offsetParent`,
  `innerText` mentent (pas de layout) ; utiliser `textContent` et les gardes
  existantes (`estVisibleSansLayout`). La **réponse serveur** prouve une
  publication, jamais la navigation.
- **Opla HTTP 494** = cookies opla.co > 16 Ko (Vercel) : purge côté extension.
- **Leboncoin** : compte PRO = autres routes ; options payantes hors forfait
  PRO = jamais cochées ; transporteurs à poser après le format.
- **Onglet Beebs figé** après un dépôt raté : ouvrir un onglet neuf.

## Navigateur et sessions
- **Jamais de login fillsell.app en automatisation** dans le profil Chrome de
  Nico : la session Supabase vit dans le localStorage de l'origine, partagé ;
  un login invalide la famille de jetons → session de l'app ET de l'extension
  mortes (07/08, annonce hors ligne 1 h). Lecture seule sur une session déjà
  ouverte, sinon demander à Nico.
- **Promesse produit** : une fois publié, tout le reste est automatique et
  invisible. Jamais de fenêtre qui prend le focus, jamais
  `windows.update({focused:true})`, jamais `chrome.debugger` (bandeau), jamais
  une permission qui exige une réactivation manuelle.
