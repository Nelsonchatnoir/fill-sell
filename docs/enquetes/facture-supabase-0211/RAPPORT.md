# 02/11 — trois points clients (A) et facture Supabase (B)

Heure de Paris partout. Prod au départ : get-pending-jobs v322, handler-watch v156, update-job-status v164,
ebay-api-worker v105 ; extension 0.6.166 en examen au Chrome Web Store (pas remplacée).

## Partie A — trois petits points (comptes gratuits)

### 1. laurankoole — relevé Depop en HTTP 400 depuis le 29/10
- **Cause (mesurée)** : journal du serveur du 02/11 09:35:21 — `POST annonces_plateforme?on_conflict=…` → 400,
  `proxy_status: PostgREST; error=PGRST102` (« Empty or invalid json »), corps de 2 006 octets (3 annonces), aucune
  erreur Postgres : le corps est refusé AVANT la base. Les clés du lot sont identiques par construction ; le seul
  texte libre est le titre Depop = première ligne de la description coupée par `.slice(0, 120)` (unités UTF-16) :
  un émoji tranché laisse un surrogate seul, écrit `\udXXX` par JSON.stringify. Preuve du mécanisme (POST anonyme,
  rien d'écrit) : `[{"titre":"abc\ud83d"}]` → 400 PGRST102 ; `abc😀` et `abc` → 401 (RLS). Seul compte touché : seule
  boutique Depop dont une description a un émoji à cette place (3 échecs : 30/10 11:31, 02/11 09:08, 09:35).
- **Correctif (règle)** : `restRequest` (background.js) remplace tout demi-caractère d'un corps par U+FFFD
  (`jsonSansDemiCaractere`, toutes les écritures REST de l'extension, toutes plateformes) ; `depopPremiereLigne` coupe
  par point de code. Selftest `selftest:releve-demi-caractere` (15 vérifications) ; `selftest:lecture-page-publique`
  adapté (le bac à sable de restRequest embarque l'assistant).
- **Reste** : livré par l'extension 0.6.167, empaquetée APRÈS l'examen de la 0.6.166 (consigne de Nico). Son relevé
  repasse seul au premier relevé du poste mis à jour ; rien à réparer en base.

### 2. stephanie.heline — « ta connexion Vinted est bonne » à quelqu'un de déconnecté
- **Cause (mesurée)** : les 17 republications (pending, créées le 02/11 dès 10:15) portent
  `capture_echec = {http: 403, cause403: "session_absente", motif: "… aucune session Vinted dans ce navigateur"}` :
  l'extension avait PROUVÉ l'absence de session et envoyé needs_user « Connexion Vinted requise : connecte-toi… ».
  update-job-status (bloc « session bonne » du 23/09) l'a requalifié en pending « Ta connexion Vinted est bonne » sur
  `profiles.extension_sessions.vinted === true` — valeur GARDÉE par la sonde muette (règle B de l'extension) :
  `checked_at_par_plateforme.vinted` = 10:09:37, `http.vinted` = 403, `sonde_muette.vinted` 11:47, `vinted_identite`
  null. Le reste du serveur exigeait déjà une preuve fraîche (`_shared/session-prouvee.js`, 01/11) ; ce bloc non.
- **Correctif (règle)** : update-job-status **v165** (12:15:57, verify_jwt false avant/après) — la capture
  `session_absente` garde son needs_user et le message de l'extension ; sinon « connexion bonne » exige
  `sondeProuveSession` (mesure de CE poste, < 30 min). Selftest `selftest:session-bonne-capture` (10 vérifications,
  dont les données réelles du compte).
- **Preuve / reste** : jobs non touchés (consigne). Au prochain essai de capture de chacun, needs_user « connecte-toi
  sur vinted.fr dans Chrome, sur ton ordinateur » ; la reprise automatique les relance dès que la sonde la voit connectée.

### 3. dsjhdhayoub — 4 publications en attente depuis le 30/10 13:17, sans message
- **Cause (mesurée)** : les 4 tâches (lot 744f420a : 2 Leboncoin, 2 Beebs) ont été servies le 30/10 à 13:17:47
  (« 4 job(s) distribué(s) ») ; le dépôt Leboncoin 8edb11a1 est passé processing à 13:17:48 (fenêtre réduite), puis
  plus AUCUN appel du poste : pas de poll, pas de battement, sonde arrêtée à 13:17:56. handler-watch a remis 8edb11a1
  en file à 14:03 (« l'ordinateur … ne s'est plus manifesté »). Le 01/11 : appels de l'onglet de l'app à 12:00 et 21:00
  et un seul battement à 22:00:33 — même IP, même Mac — qui déclare encore 8edb11a1 « en cours depuis le 30/10 » : le
  Mac dort (réveils de veille de quelques secondes) avec le dépôt suspendu en mémoire. Rien ne retient ces tâches côté
  serveur : **c'est voulu**, rien ne part sans ordinateur allumé.
- **Défaut** : la tâche ne le disait pas toujours. Dans la file de l'app, les 3 tâches sans message disaient bien
  « En pause : ton ordinateur est éteint ou Chrome fermé » ; la 4e (8edb11a1, qui porte le message de reprise) disait
  « En pause : nouvel essai automatique, rien à faire » — faux.
- **Correctif (règle)** : `_shared/etat-job.js` — extension constatée éteinte/inactive + job hors voie api → motif
  `ordinateur`, avant `essai` (copie de l'extension régénérée). Selftest `selftest:etat-job` (+4 cas). Servi par le
  web au push, par l'OTA suivante sur mobile, par l'extension 0.6.167.

### Contrôles du lot A
- Suite complète des selftests : 1 rouge (`lecture-page-publique`, bac à sable sans le nouvel assistant) corrigé,
  relancé vert ; selftests du sujet verts ; `deno check` update-job-status vert ; lint : aucun problème nouveau
  (compteurs identiques à HEAD sur background.js et depop.js).
- Aucun job, aucune annonce, aucun mail, aucune migration touchés.

## Partie B — facture Supabase

(rédigée avec le lot B)
