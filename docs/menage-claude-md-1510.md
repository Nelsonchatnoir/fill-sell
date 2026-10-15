# Ménage du contexte chargé d'office — 15/10/2026 soir

But : le contexte mémoire chargé à CHAQUE échange de CHAQUE session passe de 41,8k tokens (mesure `/context` de
Nico, terminal neuf, 15/10 soir) à moins de 5k, **sans rien perdre**. Aucun fichier de code, de configuration, de
migration ni de build touché ; aucun déploiement.

## 1. Inventaire des fichiers chargés d'office

| Fichier | Chargé ? | Avant (car.) | Après (car.) | ÷ 4 avant → après | Estimation réelle* avant → après |
|---|---|---|---|---|---|
| `CLAUDE.md` (racine du dépôt) | oui, toujours | 74 635 (1 016 lignes) | 6 285 (71 lignes) | 18,7k → 1,6k | ~34,9k → ~2,9k |
| `~/.claude/projects/C--Users-nicol-fill-and-sell/memory/MEMORY.md` | oui, toujours | 14 820 (59 lignes) | 1 501 (12 lignes) | 3,7k → 0,4k | ~6,9k → ~0,7k |
| `~/.claude/CLAUDE.md` (utilisateur) | absent | — | — | — | — |
| `CLAUDE.local.md`, imports `@…` | aucun | — | — | — | — |
| `build/*/CLAUDE.md` (5 copies de livraisons, ignorées par git) | non : seulement si une session lit un fichier de ces dossiers | 124 049 au total | inchangés | — | — |
| `AGENTS.md` | non (lu par Codex, pas par Claude) | 37 426 octets | inchangé | — | — |
| **Total chargé d'office** | | **89 455** | **7 786** | 22,4k → 1,9k | **41,8k → ~3,6k** |

\* Le « ÷ 4 » sous-estime : `/context` a mesuré 41,8k tokens pour 89 455 caractères, soit ~2,14 caractères par
token (français, accents, « », ⛔, backticks). L'estimation réelle applique ce rapport mesuré. Nico vérifie par
`/context` dans un terminal neuf.

## 2. Ce qui reste chargé d'office

- `CLAUDE.md` : règle anti-regonflement (en tête), FillSell en 5 lignes, règles absolues (une ligne chacune),
  garde-fous qui cassent la prod, commandes essentielles, index « où trouver quoi ».
- `MEMORY.md` : règle anti-regonflement (12 lignes au plus), lien vers l'index complet, 3 mémoires récentes, les
  règles permanentes (feu vert de migration, pas de login en automatisation, test ≥ 999 €, dossier partagé,
  classifieur, git add, pas de surveillance en boucle, quotas, piège `\b`), socle.

## 3. Où est parti le reste

- **CLAUDE.md** → `docs/regles/` (9 fichiers, copie MOT POUR MOT par plages de lignes, chaque bloc précédé de
  `<!-- ex-CLAUDE.md Lx-y : … -->`, sommaire en tête) :
  - `historique-sessions.md` — journal daté multi-sujets (15/10, 12/10, 11/10, 05/10, « Ouvert ») ;
  - `rapprochement-et-releves.md` — moteur de fusion, règles du 27/09, rattachement avant stock, relevés ;
  - `ventes-et-retraits.md` — ventes prouvées, signal unique, mails et push de vente, retraits ;
  - `republication-et-publication.md` — republication, lot, cadence, gratuit 50/mois, marque, défauts 04/10 ;
  - `plateformes.md` — Depop (5 blocs), eBay (2), Leboncoin, sortie d'Opla ;
  - `extension-et-versions.md` — versions servies, relance après MAJ, boucles, dossier de l'extension de Nico ;
  - `base-supabase-et-fonctions.md` — db push interdit, migrations, données, fonctions edge et `verify_jwt`,
    imports épinglés, secret de cron, trigger, GRANT, tâches automatiques, CPU, crons coupés, analytics, pg_net ;
  - `depot-git-build-site.md` — dossier unique, AGENTS.md jumeau, git, un push par lot, écran blanc, site vitrine,
    format des réponses, selftests ;
  - `mails-paiements-comptabilite.md` — `envoyer_mail_ponctuel`, `email_logs`, premium/palier, Apple, prix d'achat.
- **MEMORY.md** → `memory/index-complet-1510.md` (dans le dossier mémoire de Claude, hors dépôt) : les 58 lignes,
  mot pour mot, dans le même ordre. Les fichiers de mémoire eux-mêmes n'ont pas bougé.

## 4. Table de correspondance — ancien `CLAUDE.md` (commit `57e74fa`) → nouveau fichier

Contrôles faits : les 78 plages sont contiguës et couvrent les lignes 1 à 1 016 ; leur concaténation redonne
l'ancien fichier octet pour octet ; les 924 lignes non vides de l'ancien fichier sont toutes présentes dans
`docs/regles/` (0 absente). Pour revérifier :

```
git show 57e74fa:CLAUDE.md | node -e "const fs=require('fs');const old=fs.readFileSync(0,'utf8').split('\n').filter(l=>l.trim());const s=new Set(fs.readdirSync('docs/regles').map(f=>fs.readFileSync('docs/regles/'+f,'utf8')).join('\n').split('\n'));console.log(old.filter(l=>!s.has(l)).length,'ligne(s) perdue(s)')"
```

| Anciennes lignes | Section | Nouveau fichier |
|---|---|---|
| L1-11 | « État de production au 08/10 » (en-tête et liste des sections de l'état) | `docs/regles/historique-sessions.md` |
| L12-22 | 15/10 soir — mission de clôture (1 → 14) | `docs/regles/historique-sessions.md` |
| L23-30 | 15/10 jour — clore tous les points | `docs/regles/historique-sessions.md` |
| L31-37 | 15/10 nuit — reprise en main (P1-0 → P11) | `docs/regles/historique-sessions.md` |
| L38-45 | 12/10 — rapprochement en tranches (ferreirasab) | `docs/regles/rapprochement-et-releves.md` |
| L46-58 | 12/10 nuit — clôture A1 → A11 (Morgane) | `docs/regles/historique-sessions.md` |
| L59-69 | 11/10 nuit — Depop comme Opla | `docs/regles/plateformes.md` |
| L70-78 | 11/10 nuit — lot Louis (fin) | `docs/regles/historique-sessions.md` |
| L79-93 | 11/10 soir — lot de dix points | `docs/regles/historique-sessions.md` |
| L94-104 | 11/10 fin d'après-midi (Louis) — boutique, ancienneté, quota | `docs/regles/historique-sessions.md` |
| L105-112 | 11/10 midi — poids Leboncoin (remplacé) | `docs/regles/plateformes.md` |
| L113-122 | 11/10 midi — lot unique | `docs/regles/historique-sessions.md` |
| L123-137 | 11/10 — une annonce vendue ne se signale qu'une fois | `docs/regles/ventes-et-retraits.md` |
| L138-146 | 09-10/10 — publication en lot : page blanche | `docs/regles/republication-et-publication.md` |
| L147-156 | 10/10 soir — champs eBay : l'IA remplit avant de demander | `docs/regles/plateformes.md` |
| L157-165 | 10/10 nuit — eBay : un vêtement de mode ne part pas en sport | `docs/regles/plateformes.md` |
| L166-184 | 09/10 nuit — Depop pour le seul compte de Nico | `docs/regles/plateformes.md` |
| L185-201 | 08/10 — ventes prouvées automatiques | `docs/regles/ventes-et-retraits.md` |
| L202-215 | 08/10 nuit — multi-synchro | `docs/regles/rapprochement-et-releves.md` |
| L216-224 | 08/10 — aucune fiche ne naît d'un relevé sans décision v3 | `docs/regles/rapprochement-et-releves.md` |
| L225-235 | 08/10 soir — fiche créée à la main face à une fiche Vinted | `docs/regles/rapprochement-et-releves.md` |
| L236-249 | 08/10 nuit — remise en ligne Vinted (Bebertdeals) | `docs/regles/rapprochement-et-releves.md` |
| L250-263 | 08/10 — une republication dont la suppression est partie va au bout | `docs/regles/republication-et-publication.md` |
| L264-270 | 08/10 matin — boucles | `docs/regles/rapprochement-et-releves.md` |
| L271-276 | 08/10 — Vinted : la fiche et le signal suivent l'annonce en ligne | `docs/regles/ventes-et-retraits.md` |
| L277-295 | « Servi » — versions servies (extension, web, OTA, fonctions) | `docs/regles/extension-et-versions.md` |
| L296-303 | 06/10 — notifications push à chaque vente | `docs/regles/ventes-et-retraits.md` |
| L304-316 | 06/10 soir — un mail à chaque vente, jamais plafonné | `docs/regles/ventes-et-retraits.md` |
| L317-322 | 06/10 soir — une republication ne bute jamais sur une valeur que son annonce porte | `docs/regles/republication-et-publication.md` |
| L323-328 | 06/10 soir — un échec qu'une extension corrige repart seul | `docs/regles/extension-et-versions.md` |
| L329-332 | 05/10 soir — gratuit = 50 republications par mois | `docs/regles/republication-et-publication.md` |
| L333-342 | 05/10 — lot du jour (sessions extension, remise en vente, eBay, veille des commandes, palier) | `docs/regles/historique-sessions.md` |
| L343-346 | 04/10 — incident CPU 99 % | `docs/regles/base-supabase-et-fonctions.md` |
| L347-358 | 04/10 nuit — défauts clients (marque absente, texte de la fiche, colis) | `docs/regles/republication-et-publication.md` |
| L359-363 | 04/10 — retraits | `docs/regles/ventes-et-retraits.md` |
| L364-365 | 04/10 — boucles (onglet muet, canal coupé) | `docs/regles/extension-et-versions.md` |
| L366-367 | 04/10 — cadence (plafond Premium, coin_config journalisé) | `docs/regles/republication-et-publication.md` |
| L368-372 | 04/10 — relevés et fiches (Louis) | `docs/regles/rapprochement-et-releves.md` |
| L373-376 | 03/10 — le dossier de l'extension de Nico se lit dans Chrome | `docs/regles/extension-et-versions.md` |
| L377-379 | 03/10 — WebFetch n'est jamais une preuve de l'état d'une annonce Vinted | `docs/regles/rapprochement-et-releves.md` |
| L380-383 | 03/10 — relevés (5 min sans progression) | `docs/regles/rapprochement-et-releves.md` |
| L384-395 | 03/10 nuit — marque, annonce de test, republication | `docs/regles/republication-et-publication.md` |
| L396-398 | Selftests (compte et morceaux mis de côté) | `docs/regles/depot-git-build-site.md` |
| L399-408 | Sortie d'Opla / Depop pour tous | `docs/regles/plateformes.md` |
| L409-418 | 09/10 soir — frais de port Depop | `docs/regles/plateformes.md` |
| L419-429 | 09/10 soir — catégories interdites par Depop | `docs/regles/plateformes.md` |
| L430-441 | 10/10 matin — republication automatique Depop | `docs/regles/plateformes.md` |
| L442-443 | platform_settings (fusion seulement) | `docs/regles/base-supabase-et-fonctions.md` |
| L444-446 | 02/10 soir — ventes : annonce_id = la preuve | `docs/regles/ventes-et-retraits.md` |
| L447-448 | Crons coupés | `docs/regles/base-supabase-et-fonctions.md` |
| L449-450 | Migrations (db query puis migration repair) | `docs/regles/base-supabase-et-fonctions.md` |
| L451-452 | Données (scripts/reparations, sauvegarde, inverse) | `docs/regles/base-supabase-et-fonctions.md` |
| L453-454 | Publication en lot (03/10) | `docs/regles/republication-et-publication.md` |
| L455-460 | Ouvert (binaires 2.9.38, comptes en suspens) | `docs/regles/historique-sessions.md` |
| L461-470 | « FillSell — Instructions Claude » : jumeau AGENTS.md, chrome-extension/ | `docs/regles/depot-git-build-site.md` |
| L471-494 | ⛔ supabase db push INTERDIT ; partir de pg_get_functiondef | `docs/regles/base-supabase-et-fonctions.md` |
| L495-526 | Dossier de travail unique, extension unique, déploiement CWS, OTA jamais depuis un worktree | `docs/regles/depot-git-build-site.md` |
| L527-563 | ⛔ Règles définitives du 27/09 soir (synchronisation) | `docs/regles/rapprochement-et-releves.md` |
| L564-586 | ⛔ Rattachement avant stock (07/10) | `docs/regles/rapprochement-et-releves.md` |
| L587-611 | ⛔ Un relevé d'import ne part que sur « Synchroniser » (05/10) | `docs/regles/rapprochement-et-releves.md` |
| L612-640 | ⛔ Tâche automatique ou relecture en boucle : mesurée, bornée (04/10) | `docs/regles/base-supabase-et-fonctions.md` |
| L641-664 | ⛔ Site vitrine statique (09/10) | `docs/regles/depot-git-build-site.md` |
| L665-668 | Format des réponses | `docs/regles/depot-git-build-site.md` |
| L669-673 | Git (migrations inscrites, push direct sur main) | `docs/regles/depot-git-build-site.md` |
| L674-686 | ⛔ Un seul push sur main par lot | `docs/regles/depot-git-build-site.md` |
| L687-724 | ⛔ Écran blanc : le build avant le code | `docs/regles/depot-git-build-site.md` |
| L725-800 | Déploiement des fonctions edge (geste verify_jwt, règle de l'appelant, état du 18/09) | `docs/regles/base-supabase-et-fonctions.md` |
| L801-884 | ⛔ Envoyer un mail — une seule ligne, jamais une fonction | `docs/regles/mails-paiements-comptabilite.md` |
| L885-915 | ⛔ Jamais d'import distant flottant | `docs/regles/base-supabase-et-fonctions.md` |
| L916-920 | Trigger handle_new_user | `docs/regles/base-supabase-et-fonctions.md` |
| L921-941 | Secret de cron (vault + environnement) | `docs/regles/base-supabase-et-fonctions.md` |
| L942-949 | Premium detection (palier unique) | `docs/regles/mails-paiements-comptabilite.md` |
| L950-953 | apple-iap-webhook | `docs/regles/mails-paiements-comptabilite.md` |
| L954-960 | Supabase migrations (GRANT sur toute nouvelle table) | `docs/regles/base-supabase-et-fonctions.md` |
| L961-986 | email_logs — type one-shot dans l'index | `docs/regles/mails-paiements-comptabilite.md` |
| L987-1008 | Prix d'achat : vide ≠ zéro | `docs/regles/mails-paiements-comptabilite.md` |
| L1009-1013 | Queries Supabase analytics | `docs/regles/base-supabase-et-fonctions.md` |
| L1014-1016 | pg_net | `docs/regles/base-supabase-et-fonctions.md` |

**MEMORY.md** : ses 58 lignes d'index (59 avec le titre) → `memory/index-complet-1510.md`, même ordre, mot pour
mot (contrôle : chaque ligne retrouvée avant écriture ; écriture refusée si un autre terminal avait modifié
MEMORY.md pendant le rangement).

## 5. Ce qui a été volontairement sorti de CLAUDE.md, et pourquoi

- **Tout l'état de production daté** (versions de fonctions, OTA, extension, migrations appliquées, rapports
  du 03/10 au 15/10) : il se périme en un jour, `functions list` / `cron.job` / `profiles.extension_build` font foi,
  et il est déjà tenu dans `docs/agents/etat-2026-10-01.md`. → `historique-sessions.md` et fichiers de sujet.
- **Les cas clients** (Louis, Nadège, Corinne, Bebertdeals, Manon, ferreirasab, Marine…) : utiles pour un sujet
  précis, jamais à chaque session. → fichiers de sujet.
- **Le détail des règles métier** (Depop, eBay, ventes prouvées, remise en ligne Vinted, mails de vente…) : la
  règle de fond reste en une ligne quand elle sert partout (titre jamais une preuve, deux annonces = deux
  exemplaires), le détail est atteint par l'index.
- **Les listes de fonctions edge par `verify_jwt`** (état du 18/09 et du 01/10, déjà périmées) : la règle « c'est
  l'appelant qui décide » et le geste de lecture restent dans CLAUDE.md. → `base-supabase-et-fonctions.md`.
- **La procédure mail complète, `email_logs`, premium, Apple** : seulement quand on touche un mail ou un paiement ;
  CLAUDE.md garde « aucun mail client » et « `envoyer_mail_ponctuel` en simulation ». → `mails-paiements-comptabilite.md`.
- **Le détail du diagnostic d'écran blanc et du site vitrine** : les quatre étapes sont gardées en une ligne,
  le pourquoi (incidents du 11/09, 18/09, 01/10, 10/10) est atteint par l'index. → `depot-git-build-site.md`.

## 6. Ce qui n'a pas été touché (et reste à décider)

- Les commentaires de code qui renvoient à « cf. CLAUDE.md » (19 fichiers : fonctions edge, scripts) visent des
  sections désormais dans `docs/regles/` ; la table ci-dessus donne le fichier. Non modifiés (fichiers de code).
- `AGENTS.md` (jumeau Codex) : 37 426 octets, déjà AU-DESSUS des ~32 Ko que Codex lit. Hors du périmètre de ce
  ménage (non chargé par Claude) ; à alléger de la même façon, avec renvoi à `docs/regles/`, si Nico le veut.
- Les fichiers existants de `docs/agents/` (état, consignes, pièges) : inchangés.
