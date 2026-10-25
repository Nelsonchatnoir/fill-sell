# Base Supabase, migrations, fonctions edge, crons, tâches automatiques

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- 04/10 — incident CPU 99 % (ex-L343-346)
- platform_settings (fusion seulement) (ex-L442-443)
- Crons coupés (ex-L447-448)
- Migrations (db query puis migration repair) (ex-L449-450)
- Données (scripts/reparations, sauvegarde, inverse) (ex-L451-452)
- ⛔ supabase db push INTERDIT ; partir de pg_get_functiondef (ex-L471-494)
- ⛔ Tâche automatique ou relecture en boucle : mesurée, bornée (04/10) (ex-L612-640)
- Déploiement des fonctions edge (geste verify_jwt, règle de l'appelant, état du 18/09) (ex-L725-800)
- ⛔ Jamais d'import distant flottant (ex-L885-915)
- Trigger handle_new_user (ex-L916-920)
- Secret de cron (vault + environnement) (ex-L921-941)
- Supabase migrations (GRANT sur toute nouvelle table) (ex-L954-960)
- Queries Supabase analytics (ex-L1009-1013)
- pg_net (ex-L1014-1016)

<!-- ex-CLAUDE.md L343-346 : 04/10 — incident CPU 99 % -->
- **⛔ Incident CPU 99 % (04/10, 12:22 et 17:40)** : compute Micro → Small
  (Nico) ; crons **27** (`*/10`) et **28** (`7-59/15`) relancés le soir sous
  mesure ; règle « tâche automatique mesurée, bornée » plus bas ; alerte
  `veille-cpu` (cron 29). Cron 30 (photos eBay, 663 fiches) fini et retiré.

<!-- ex-CLAUDE.md L442-443 : platform_settings (fusion seulement) -->
- **⛔ `platform_settings`** (02/10) : jamais d'update/PATCH de l'objet entier,
  toujours `rpc platform_settings_fusionner` ; la garde en base refuse le reste.

<!-- ex-CLAUDE.md L447-448 : Crons coupés -->
- **Crons coupés** : 17 `doublons-balayage-2min`, 22 `fusion-photo-lot-10min`
  (27 et 28 actifs, relancés bornés le 04/10 au soir).

<!-- ex-CLAUDE.md L449-450 : Migrations (db query puis migration repair) -->
- **Migrations** : jamais à la main. `db query --linked -f <fichier>` PUIS
  `migration repair --linked --status applied <version>`, relecture.

<!-- ex-CLAUDE.md L451-452 : Données (scripts/reparations, sauvegarde, inverse) -->
- **Données** : toute correction = requête dans `scripts/reparations/`
  (`git add -f`, `*.sql` est ignoré), sauvegarde avant, inverse prêt.

<!-- ex-CLAUDE.md L471-494 : ⛔ supabase db push INTERDIT ; partir de pg_get_functiondef -->
## ⛔ `supabase db push` est INTERDIT

Tant que la baseline n'est pas refaite, **ne jamais lancer `supabase db push`**
sur ce projet.

Les historiques de migrations divergent (audit du 26/09) : les 35 versions
distantes sans fichier ont été CAPTURÉES dans le dépôt, mais ~118 fichiers
locaux n'ont aucune trace dans l'historique distant (appliqués hors historique,
ou jamais appliqués). Un push rejouerait des migrations **non idempotentes**,
dont :
- un `cron.schedule('handler-watch-3min')` → job planifié **en double** ;
- un revert de grants → **soldes utilisateurs modifiés**.

Les migrations s'appliquent **une par une**, après vérification de leur effet
réel en prod. Interdits également tant que ce bandeau est là : `db reset`,
`db remote commit`.

⛔ **AVANT de réécrire une fonction SQL : partir de la définition EN PROD**
(`pg_get_functiondef`), jamais du dernier fichier du dépôt. Le 26/09, 22
fonctions tournaient dans une version qu'aucun fichier ne portait (correctifs
appliqués en direct, migrations « patch » par remplacement de texte). Elles
sont capturées dans `20260926235900_depot_suit_la_prod_capture_2609.sql` —
mais tout correctif appliqué en direct depuis recrée l'écart.


<!-- ex-CLAUDE.md L612-640 : ⛔ Tâche automatique ou relecture en boucle : mesurée, bornée (04/10) -->
## ⛔ TÂCHE AUTOMATIQUE OU RELECTURE EN BOUCLE : MESURÉE, BORNÉE (04/10)

Le 04/10, la base a saturé deux fois (12:22 et 17:40, CPU 99 %) : app et web
bloqués sur l'écran de chargement pour TOUT LE MONDE. Causes : deux crons
ajoutés le matin (27 `ebay-releve-api`, 28 `releve-completer`) qui
travaillaient pour tous les comptes et réécrivaient chaque annonce, même
inchangée (chaque écriture déclenche `annonce_vers_fiche`) ; et des écrans qui
relisaient la base à cadence fixe, onglet caché compris, sans ralentir quand
elle peinait (tout l'historique des jobs toutes les 20 s, 7 requêtes toutes
les 30 s).

Toute nouvelle tâche automatique (cron, trigger, boucle de fonction edge) ou
relecture côté client (app, extension) :
- est **mesurée en CPU AVANT la mise en prod** : un passage manuel, le CPU lu
  avant et pendant (métriques `/customer/v1/privileged/metrics` ou table
  `veille_cpu`) et `pg_stat_statements` ; le chiffre va dans le rapport ;
- ne vise que les **comptes actifs** : `comptes_actifs(7)` (extension ou
  session de l'app vues dans les 7 jours) ;
- travaille par **lots bornés** (comptes, écritures, durée par passage) et
  **n'écrit jamais une ligne inchangée** ;
- côté client, passe par `src/utils/relectureBornee.js` : onglet visible
  seulement, une lecture à la fois, attente doublée sur erreur ou lenteur.
  **Jamais de `setInterval` qui relit la base, jamais de relecture en
  boucle.**

Alerte : `veille-cpu` (cron `veille-cpu-2min`) prévient support@fillsell.app
au-delà de 70 % pendant 10 min, au plus une fois par heure, puis au retour
sous 50 %. L'ops-digest affiche le maximum des 24 h.

Veilles LUES par l'ops-digest (18/10, lecture seule, STABLE, service_role, section absente si
illisible) : `releves_morts_veille(p_jours, p_limite)` (mig 20261018010000 — relevés morts
sans alerte, filet du chien de garde) et `champs_requis_veille(p_jours, p_limite)` (mig
20261018020000 — champ obligatoire nouveau sur un rayon connu, questions posées par champ,
deux fenêtres). Même modèle que `ventes_prouvees_veille`. Rien n'est relancé ni écrit.


<!-- ex-CLAUDE.md L725-800 : Déploiement des fonctions edge (geste verify_jwt, règle de l'appelant, état du 18/09) -->
## Déploiement des Edge Functions

### ⛔ LE GESTE, AVANT TOUT DÉPLOIEMENT — UNE LIGNE, À COPIER

```
npx supabase functions list | grep -o '"slug":"<nom>"[^}]*' | grep -o '"version":[0-9]*\|"verify_jwt":[a-z]*'
```

**On lit l'état RÉEL avant, on le relit après.** Un déploiement sans
`--no-verify-jwt` remet `verify_jwt` à `true` : le cron ou le webhook tombe en
401, en silence, et personne ne le voit avant que les jobs s'empilent.
C'est ce geste qui a évité de casser le cron `ebay-api-worker-2min` le
18/09 — la fonction tourne en `false` et **ne figurait pas** dans la liste
ci-dessous, qui était la seule source consultée jusque-là.

### LA RÈGLE — C'EST L'APPELANT QUI DÉCIDE, PAS LA LISTE

Une liste se périme à chaque fonction ajoutée : c'est exactement comme ça que
le trou d'`ebay-api-worker` est né. La question n'est jamais « est-elle dans la
liste ? » mais **« qui l'appelle, et cet appelant a-t-il une session
Supabase ? »** :

| L'appelant | verify_jwt | Ce que la fonction doit faire |
|---|---|---|
| pg_cron / pg_net (trigger) | **false** | garde `x-cron-secret` obligatoire |
| Webhook externe (Stripe, Apple, Google, eBay) | **false** | vérifier la signature de l'émetteur |
| Lien public, redirection OAuth | **false** | jeton dans l'URL, jamais rien d'implicite |
| App ou extension (JWT utilisateur) | **true** (défaut) | rien, la plateforme garde |
| DEUX appelants dont un sans session | **false** | garde maison à deux branches |

⛔ `verify_jwt: false` n'est JAMAIS « pas d'authentification » : c'est
« l'authentification est faite par la fonction elle-même ». Une fonction en
`false` sans garde propre est une porte ouverte.

Commande : `supabase functions deploy <nom> --no-verify-jwt`

### L'ÉTAT RELEVÉ LE 18/09/2026 — 33 fonctions en `verify_jwt: false` sur 57

Relevé par `functions list`, pas recopié. Il se périme : le geste ci-dessus
fait foi, pas ce tableau.

⚠️ **Relevé du 01/10/2026 : 49 fonctions actives, 24 en `false`.**
`send-batch-notifications` et `send-chantier-zip` **n'existent plus en
prod**. Liste à jour : `docs/agents/architecture.md`.

**Appelées par pg_cron / pg_net (`x-cron-secret`)** — `cron.job` le prouve :
`ebay-api-worker` (*/2) · `republish-auto-sweep` (*/3) · `handler-watch` (*/3)
· `beebs-lien` (*/5) · `email-tunnel` (9h + horaire, **et** le trigger
`handle_new_user`) · `ops-digest` (8h50) · `republish-purge` (3h40) ·
`lens-temp-purge` (3h50 — jamais de purge côté client : un client ne voit que
SON scan, c'est ce qui effaçait les photos d'articles avant le 15/09) ·
`empreintes-urls` (appelée par `fusion_photo_tick`, cron 20 chaque minute) ·
(`stripe-recalage-1er-du-mois`, one-shot du 01/10 : SUPPRIMÉE le 03/10) ·
`doublons-balayage` (cron 17, **INACTIF depuis le 28/09** ; déclarée
`verify_jwt = false` dans `config.toml`).

**Webhooks externes** (l'émetteur n'a pas de session) : `stripe-webhook` ·
`apple-iap-webhook` · `google-play-webhook` · `ebay-account-deletion` ·
`ebay-oauth-callback` (redirection eBay).

**Appel public assumé** : `email-desinscription` (le lien des emails ; un
`verify_jwt` à true le rendrait inopérant et bloquerait toute campagne) ·
`apple-subscription-status` · `apple-notification-history`.

**Font leur PROPRE garde** : `resolve-categorie` (deux appelants : l'app avec
JWT, le worker eBay avec `x-cron-secret`) · `voice-intent` (Bearer + getUser
maison, pour maîtriser sa réponse 401/CORS) · `update-job-status` ·
`check-listing-status`.

**One-shots déployés à la main** : aucun en prod au 01/10 (les
`send-<prénom>-<date>` sont interdits, cf. plus bas). (`send-chantier-zip` et `check-early-adopter` —
stubs 410 — ont été SUPPRIMÉES de la prod le 26/09/2026 : 0 appel en 30 jours
de journaux, 0 cron, 0 fonction SQL, 0 ligne de code.)
(`send-relance` a été SUPPRIMÉE de la prod le 20/09/2026 — jeton en clair dans
un fichier gitignoré, campagnes toutes parties, aucun appelant.)


<!-- ex-CLAUDE.md L885-915 : ⛔ Jamais d'import distant flottant -->
### ⛔ JAMAIS D'IMPORT DISTANT FLOTTANT — TOUJOURS UNE VERSION ÉPINGLÉE

`https://esm.sh/@supabase/supabase-js@2` suit **toutes** les 2.x publiées, y
compris celle qui casse. Le 23/09, `@2` a résolu vers 2.117.1, dont la
dépendance `@supabase/functions-js@2.117.1` rend **404** sur esm.sh (le paquet
n'y a jamais été publié). Mesuré en direct : `2.117.1 → 404`, `2.117.0 → 200`.
Effet : **plus aucune fonction edge important supabase-js ne pouvait être
déployée** — 48 fichiers, c'est-à-dire à peu près tout le serveur. Découvert
par hasard, en déployant autre chose ; personne n'aurait rien vu jusqu'au
premier déploiement d'urgence.

Une dépendance flottante, c'est **une panne de déploiement décidée par
quelqu'un d'autre, un jour qu'on ne choisit pas**. On épingle tout :
`@supabase/supabase-js@2.117.0`, `std@0.168.0`, `stripe@12.18.0`,
`@peculiar/x509@1.9.0`, `imagescript@1.3.0`.

Le contrôle qui l'empêche de revenir, y compris dans un fichier neuf :
```
npm run selftest:imports-epingles
```
Il échoue sur toute importation distante sans version complète (`@2` compte
comme flottant) et sur toute version qui s'écarte de celle qu'on a éprouvée.
**Pour changer de version** : bouger `VERSIONS_ATTENDUES` dans
`scripts/imports-epingles-selftest.mjs`, un `sed` sur `supabase/functions/`,
relancer le test. Une ligne, pas quarante-six.

⚠️ **Pas d'import map partagé, et c'est un choix** : on ne peut pas le PROUVER
sans déployer (`deno check` résout côté client, c'est le bundler du serveur qui
tranche à la livraison, et la CLI n'a pas de `--dry-run`). Un import map non
éprouvé déplacerait le risque d'un cran, jusqu'au premier déploiement pressé.


<!-- ex-CLAUDE.md L916-920 : Trigger handle_new_user -->
## Trigger handle_new_user

Le trigger pg_net appelle email-tunnel via le header `x-cron-secret`, dont la valeur se lit par `public.cron_secret()` (vault, secret `cron_secret`) — jamais écrite dans le dépôt.
Ne pas utiliser de query param ni de header `Authorization` dans pg_net — seul le header custom fonctionne.


<!-- ex-CLAUDE.md L921-941 : Secret de cron (vault + environnement) -->
## Secret de cron — dans le vault et l'environnement, jamais dans le dépôt (30/09)

Le secret `x-cron-secret` protège toutes les fonctions en `verify_jwt = false`
appelées par pg_cron / pg_net. Depuis le 30/09 il n'est écrit NULLE PART dans le
dépôt (l'ancienne valeur, sur GitHub depuis juin, a été changée le 30/09) :

- côté base : vault, secret `cron_secret`, lu par `public.cron_secret()` (SECURITY
  DEFINER, fermée à anon/authenticated). Les commandes `cron.job` et les
  fonctions pg_net construisent l'en-tête par
  `jsonb_build_object('x-cron-secret', public.cron_secret())` ;
- côté fonctions : variable `CRON_SECRET` (`supabase secrets set`), y compris
  `_shared/payment-notify.ts` ;
- dans les migrations historiques, la valeur est remplacée par
  `__CRON_SECRET_DU_VAULT__` : ces fichiers ne se rejouent jamais tels quels.

⛔ Une rotation change les DEUX au même moment (vault + `CRON_SECRET`), puis
on relit `cron.job_run_details` ET les codes HTTP (`net._http_response`) des
crons suivants : un cron « succeeded » peut cacher un 401. Procédure :
`docs/ROTATION_CRON_SECRET.md`. Un nouveau cron ou trigger pg_net n'écrit
JAMAIS la valeur : il appelle `public.cron_secret()`.


<!-- ex-CLAUDE.md L954-960 : Supabase migrations (GRANT sur toute nouvelle table) -->
## ⛔ SECURITY DEFINER : l'identité se vérifie DANS la fonction (20/10 soir)
Une fonction SECURITY DEFINER qui reçoit un `p_user` / une fiche ne lui fait jamais confiance sous une session :
`IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN` l'utilisateur (et la fiche) doivent être ceux de
`auth.uid()`, sinon `RAISE … USING ERRCODE = '42501'`. service_role (fonctions edge) et les appels sans jeton (cron,
SQL) restent libres. Retirer `anon` ne suffit pas : `authenticated` agissait pour n'importe quel compte
(`spend_coins_for_generate`, `spend_coins_for_lens`, `fiche_completer_photos_capture` — migration `20261020200000`).
Un déclencheur qui appelle une telle fonction attrape son exception : l'écriture d'origine ne casse jamais.

## Supabase migrations — droits EXPLICITES (régime du 30/10, posé le 24/10)

Depuis le 24/10 (migration `20261024110000`, en avance sur Supabase qui l'impose à tous le 30/10/2026), une table
créée dans `public` ne reçoit AUCUN droit d'office : ni anon, ni authenticated, ni service_role. En base :
- le déclencheur d'événement `fillsell_table_nait_protegee` active la RLS de toute nouvelle table de `public` ; une
  sauvegarde (`est_table_de_sauvegarde` : `_…`, `sauvegarde…`, `…backup…`, `…_AAAAMMJJ`) n'a aucun droit client ;
  une table réelle reçoit les droits de `service_role` (table et séquences) pour que les fonctions edge marchent ;
- aucune nouvelle fonction n'est exécutable par anon par défaut ; une fonction SECURITY DEFINER de lecture ne
  s'ouvre à authenticated que si l'app ou une fonction l'appelle sous la session (et elle contrôle `auth.uid()`).

Toute migration qui crée une table l'ÉCRIT (selftest `tables-droits-explicites`) :
```sql
ALTER TABLE public.nouvelle_table ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nouvelle_table TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nouvelle_table TO authenticated;   -- seulement si l'app la lit
-- ou, pour une table que seul le serveur lit : « -- droits : serveur seulement (nouvelle_table) »
```
Une sauvegarde de script de réparation : `ALTER TABLE … ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE … FROM anon,
authenticated;` (le déclencheur le fait aussi). Inverse du régime : `supabase/rollbacks/20261024110000_*_INVERSE.sql`
(remet les droits sauvegardés dans `_backup_2410_securite_droits`).


<!-- ex-CLAUDE.md L1009-1013 : Queries Supabase analytics -->
## Queries Supabase analytics

- Toujours utiliser `AT TIME ZONE 'Europe/Paris'`.
- Toujours exclure les emails de test via un CTE `excluded` avec `unnest(ARRAY[...])`.


<!-- ex-CLAUDE.md L1014-1016 : pg_net -->
## pg_net

`net._http_response` se purge automatiquement. Vérifier le statut immédiatement après l'appel.

## Questions à l'IA : partage, cache, regroupement (18/10 nuit, point 5)
- **Partage dans l'app** : toute question à `resolve-categorie` passe par `src/utils/questionCategorie.js` (identique en vol =
  un appel ; < 10 min = réponse rendue ; jamais une erreur gardée). Ne jamais réintroduire un `functions.invoke("resolve-categorie")`
  direct (selftest `question-categorie` le refuse).
- **Cache serveur** : `_shared/claude-cache.ts` → `questionClaude(corps, { admin, fonction, interrupteur })`, table
  `ia_questions_cache` (service_role, 30 j, empreinte sha256 de modèle + consigne + message + réglages). Interrupteurs
  `coin_config` : `ia_cache_categorie`, `ia_cache_aspects`, `ia_aspects_groupes` (1 = allumé, relus une fois par minute et par
  instance). Une réponse relue n'est ni payée ni comptée dans un plafond (`resolve_categorie_cache`, 0 $).
- **Regroupement des aspects eBay** (`completerAspectsIAGroupe`) : ÉTEINT — banc du 18/10 : qualité en baisse (cas Manon).
  Rejouer le banc avant tout changement : fonction `ia-banc-deduction` (secret de cron, lecture seule), rapport
  `docs/enquetes/session-nuit-1810-memoire-ia/point5-banc.md`.

## Règles (18/10 — dépense IA, déduction apprise)
- **Plafond de la dépense IA codé en dur** (`_shared/budget-ia.ts`) : Anthropic, jour/mois, « moteur » 6/120 $,
  « confort » 9/160 $, « essentiel » 14/185 $ ; au-delà, l'ancien chemin (question, arbre, saisie à la main), rien
  débité. Compteur `ia_depense_jour` (déclencheur sur `usage_logs` quand `metadata.cost_usd`, et sur
  `rapprochement_ia_verdicts`), lu par `ia_depense_etat()` (service_role). Toute nouvelle fonction IA y passe.
- **Correspondances apprises** : `deduction_apprise` (reconstruite chaque nuit, cron `deduction-apprise-nuit`),
  `deduction_bascule` par (plateforme, champ) : fantôme → actif (≥ 48 h, ≥ 15 cas, 100 %) → coupe (< 97 % ou refus
  +15 points), cron `deduction-bascule-6h` ; l'app lit `deduction_apprise_pour` (session). Banc :
  `node scripts/banc-deduction-apprise.mjs` (aucun appel IA).
- **Leviers IA, champ par champ** (18/10 après-midi, migration `20261018160000`) : `ia_leviers_bascule` (plateforme,
  champ, levier L1/L2/L3/L4, état fantome/actif/coupe/eteint, `seuil_precision` = précision de l'existant au banc),
  lue par `_shared/ia-leviers-bascule.ts` dans `generate-listing` (resolve_aspects générique) APRÈS l'existant, sur les
  seuls champs restés vides ; niveau « moteur » du plafond IA. `ia_leviers_evaluer()` (cron `ia-leviers-6h`, `47 */6`) :
  fantôme → actif (≥ 48 h, ≥ 15 cas jugés, précision ≥ seuil) ; actif → coupe (< 95 % gardés sur ≥ 10 en 72 h, ou refus
  +15 points). Journaux `usage_logs` `ia_levier` (coût sur la 1re ligne d'un appel → `ia_depense_jour`) et
  `ia_levier_bascule`. Bilan des questions : `questions_publication_bilan(debut, fin)` (affichées, levées par la
  personne / le moteur, abandons). Banc : `node scripts/bancs/zero-friction/banc-ia.mjs` (fonction `ia-banc-deduction`,
  modes `leviers` et `ebay_annonces`, secret de cron jamais écrit).

## 24/10 — une suppression de compte libère ses boutiques (migration `20261024100000`)
- `boutiques_plateforme.user_id`, `comptes_lies.user_a/user_b`, `fiches_liees_comptes.user_a/user_b` → `auth.users(id)`
  ON DELETE CASCADE : quel que soit le chemin de suppression (delete-account, tableau de bord), la réservation d'une
  boutique Vinted / Leboncoin / Beebs / eBay / Depop et les liens entre comptes partent avec le compte ; une boutique
  ne reste jamais « prise » par un compte qui n'existe plus. 7 réservations orphelines libérées le 23/10 (sauvegarde
  `_backup_2410_boutiques_orphelines`, inverse `supabase/rollbacks/20261024100000_*_INVERSE.sql`).

## ⛔ 25/10 nuit — l'origine d'une inscription se pose par RPC et survit au compte (point 6 ; migration `20261025013000`, appliquée 01:30)
- `authenticated` n'écrit plus `profiles.acquisition_*` (GRANT par colonnes, migration 20260706400000) : l'UPDATE de l'app
  rendait un 403 avalé à chaque session d'un compte de moins de 30 jours (0 origine sur 3 229 profils ; lizzyguzzy :
  `PATCH /rest/v1/profiles` → 403 le 23/10 à 22:11:58). L'origine passe par `poser_origine_inscription` (SECURITY
  DEFINER : la personne connectée, son seul profil, une fois, compte de moins de 30 jours, capture antérieure au compte,
  valeurs bornées, « @ » masqué, referrer réduit au domaine). App : web au push, mobile à l'OTA.
- Un profil supprimé laisse UNE ligne ANONYME dans `origines_comptes_supprimes` (jour, mois d'inscription, ancienneté,
  origine, plateforme, fournisseur, palier, canal de paiement — ni e-mail, ni identifiant, ni horodatage précis),
  écrite par un déclencheur BEFORE DELETE qui ne bloque JAMAIS une suppression. Les statistiques d'acquisition se lisent
  dans la vue `origines_inscriptions` (vivants + partis), service_role seul.
- Une table « serveur seulement » le DIT : le déclencheur d'événement du 30/10 donne SELECT, INSERT, UPDATE, DELETE à
  service_role ; une archive écrite par un déclencheur ou des fonctions SECURITY DEFINER retire l'écriture à service_role
  (`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER … FROM service_role`) et porte le marqueur
  « droits : serveur seulement — <table> » (selftest `tables-droits-explicites`).

## 25/10 nuit — esm.sh peut refuser de construire un paquet (« no space left on device »)
- Un déploiement dont un import esm.sh n'est pas déjà construit échoue (« Failed to bundle the function … 500 ») ; la
  version en prod reste intacte. Ne pas changer l'import d'une fonction de paiement pour contourner : vérifier
  `curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Deno/2.1.4" https://esm.sh/<paquet>@<version>` (200 attendu),
  puis redéployer. Cas du 25/10 : apple-iap-webhook (`@peculiar/x509@1.9.0`), trois essais de 01:35 à 01:50.
