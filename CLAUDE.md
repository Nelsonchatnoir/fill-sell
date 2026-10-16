# FillSell — consignes chargées à chaque session

⛔ **Ce fichier reste COURT (< 7 500 caractères) : il est relu à chaque échange de chaque session.** Jamais de
notes de session, de journal, de cas client, de numéro de version ni d'état de production ici : l'état va dans
`docs/agents/etat-2026-10-01.md`, le récit dans `docs/enquetes/<sujet>/RAPPORT.md`, une règle durable dans le
fichier `docs/regles/` de son sujet (nouveau sujet = une ligne dans l'index ci-dessous). Une ligne n'entre ici que
si elle sert à CHAQUE session. Jumeau Codex : `AGENTS.md`.

## FillSell
- Revente multi-plateformes : publier, republier, synchroniser le stock, suivre les ventes. App React/Vite : web
  sur Vercel derrière Cloudflare, mobile Capacitor mis à jour par OTA Capgo.
- Extension Chrome (`chrome-extension/`, build `build/extension/`) : gestes sur Vinted, Leboncoin, Beebs, Depop ;
  eBay par l'API ; Opla quittée le 10/10.
- Serveur : Supabase `tojihnuawsoohlolangc` (Postgres, fonctions edge `supabase/functions/`, pg_cron, pg_net).
- Un seul dossier, `C:\Users\nicol\fill-and-sell\`, PARTAGÉ entre terminaux : relire `git status` et
  `functions list` juste avant d'agir ; jamais committer ni pousser le travail d'un autre.
- Nico décide (feu vert nommé). Réponses en français, dans un bloc de code.

## Règles absolues
- Corriger la RÈGLE, jamais le cas : le correctif vaut pour tous les comptes ; le cas client se répare par ce circuit.
- Zéro régression : selftests du sujet + suite complète relancée avant le commit ; un rouge se dit, sortie à l'appui.
- Commit + push sur `main` (sans branche) ; UN push par lot, code et docs ensemble ; `git add` ciblé, jamais `.`.
- Rien chez Stripe (ni écriture, ni réglage) sans ordre explicite de Nico.
- Aucun mail client sans ordre explicite ; un mail = `envoyer_mail_ponctuel` (simulation d'abord), jamais une fonction.
- Aucune annonce client modifiée à la main ; correction de données = script `scripts/reparations/`, sauvegarde, inverse.
- Cadence de republication (créneaux, plafonds, paliers, quotas) intouchable sans décision de Nico.
- Tests sur les plateformes : comptes de Nico ou d'Ornella seulement ; annonce de test à 999 € ou plus.
- Heure de Paris partout (`AT TIME ZONE 'Europe/Paris'`, dates absolues dans les docs).
- Jamais de rapprochement, fusion ni retrait sur un titre seul ; deux annonces d'une plateforme = deux exemplaires ;
  le doute devient une question.
- Extension livrée PRÊTE : `npm run package:extension` → `build/CWS-<version>-A-TELEVERSER/` (numéro neuf, build
  tracé) ; Nico ne fait que zipper/téléverser sur le Chrome Web Store et « Envoyer pour examen ».

## Garde-fous qui cassent la prod
- ⛔ `supabase db push`, `db reset`, `db remote commit` INTERDITS. Migration = feu vert explicite, puis
  `npx supabase db query --linked -f <fichier>` + `npx supabase migration repair --linked --status applied <version>` ;
  une fonction SQL se réécrit depuis `pg_get_functiondef` en prod, jamais depuis le dépôt.
- Fonction edge : version et `verify_jwt` lus AVANT et APRÈS ; appelant sans session (cron, webhook) =
  `--no-verify-jwt` + garde maison. Imports distants épinglés. Secret de cron jamais écrit (`public.cron_secret()`).
- Tâche automatique ou relecture client : CPU mesuré avant la prod, lots bornés, comptes actifs, aucune ligne
  inchangée réécrite, jamais de `setInterval` qui relit la base (`src/utils/relectureBornee.js`).
- PostgREST coupe à 1 000 lignes sans erreur : lire par pages, `.in()` de masse par lots.
- `platform_settings` : `rpc platform_settings_fusionner` seulement. Prix d'achat NULL = inconnu, 0 = gratuit
  (`src/utils/comptabilite.js`). Palier : `_shared/palier.js` / `palier_de()`, jamais un drapeau seul.
- Écran blanc : `curl https://fillsell.app/build.json`, rechargement forcé, entrée lue avec `Origin`, état Vercel ;
  le code en dernier. OTA jamais depuis un worktree. Une seule extension FillSell active dans Chrome ; aucun
  fichier annexe dans `chrome-extension/` (casse `EXTENSION_LAST_COMMIT`).
- Un numéro de version ne s'écrit qu'après l'avoir LU (`functions list`, `build.json`, `profiles.extension_build`).

## Commandes
- Compiler : `npm run build:essai` (jamais servi) ; `npm run build` refuse un arbre sale ; `npm run lint`.
- Un selftest : `npm run selftest:<nom>` ; suite complète (bash) :
  `for s in $(node -p "Object.keys(require('./package.json').scripts).filter(k=>k.startsWith('selftest:')).join(' ')"); do npm run -s $s >/dev/null 2>&1 || echo "ROUGE $s"; done`
- Fonction edge : `npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'`
  puis `npx supabase functions deploy <nom> [--no-verify-jwt]`.
- Extension : `npm run build:extension`, livrable `npm run package:extension`. OTA : `docs/agents/pieges.md` § Déploiement.
- Site vitrine : `src/blog/`, `site/contenu/`, `site/donnees/` touchés = `npm run site:dater` dans le même commit.

## Où trouver quoi (à lire quand la tâche le demande)
- État de prod (versions, crons, ouvert ; le plus récent en fin, à relire avant tout déploiement) : `docs/agents/etat-2026-10-01.md`
- Consignes de Nico, pièges, architecture, glossaire : `docs/agents/` (`consignes-2026-09-28.md`, `pieges.md`, …)
- Historique des sessions (ex-CLAUDE.md) : `docs/regles/historique-sessions.md` ; rapports `docs/enquetes/` ; reprises `docs/reprise/`
- Moteur de fusion, Synchroniser, relevés : `docs/regles/rapprochement-et-releves.md`, `docs/multi-synchro.md`
- Ventes, mails et push de vente, retraits : `docs/regles/ventes-et-retraits.md`
- Republication, publication (unité, lot), cadence, quotas : `docs/regles/republication-et-publication.md`
- Depop, eBay, Leboncoin, Opla : `docs/regles/plateformes.md`, `docs/plateformes/depop/` (Vinted, Beebs : fichiers ci-dessus)
- Extension (versions servies, CWS, poste de Nico) : `docs/regles/extension-et-versions.md`, `docs/agents/extension.md`
- Base, migrations, fonctions edge (`verify_jwt` par appelant), crons, CPU, analytics : `docs/regles/base-supabase-et-fonctions.md`
- Git, push, build, écran blanc, site vitrine, selftests : `docs/regles/depot-git-build-site.md`
- Mails, `email_logs`, abonnements, prix d'achat : `docs/regles/mails-paiements-comptabilite.md`
- Messagerie des plateformes, commandes « à expédier », bordereaux (bêta) : `docs/regles/messagerie-et-bordereaux.md`
- Ménage du 15/10 (ancienne section → fichier) : `docs/menage-claude-md-1510.md`
