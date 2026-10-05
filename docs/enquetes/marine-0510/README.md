# Journaux Supabase du compte 6b2057a9-ee51-4070-8732-9759d30fd521 (05/10/2026)

Extraction brute pour l'enquête sur le départ de cette utilisatrice (compte
supprimé le 05/10 à 17:14 UTC). Ce dossier ne contient que les extraits, sans
aucune analyse.

- **Projet** : `tojihnuawsoohlolangc`
- **Fenêtre** : 2026-10-05T16:20:00Z → 2026-10-05T17:20:00Z (18:20 → 19:20, heure de Paris)
- **Extraction** : 2026-10-05, vers 17:50 UTC (19:50 à Paris), par l'outil MCP
  `query_logs` (flux unifié `logs`, ClickHouse), avec `iso_timestamp_start` et
  `iso_timestamp_end` passés à chaque requête.
- **Format** : TSV en UTF-8, une ligne d'en-tête, triées par heure.
  `heure_utc` est à la milliseconde. `heure_paris` = UTC + 2 h.

## Fichiers

| Fichier | Lignes de données | Source |
|---|---:|---|
| `edge_logs.tsv` | 2 807 | `edge_logs` (passerelle API : REST, Auth, Storage) |
| `function_edge_logs.tsv` | 44 | `function_edge_logs` (requêtes HTTP vers les fonctions edge) |
| `function_logs.tsv` | 285 | `function_logs` (console des fonctions edge) |
| `storage_logs.tsv` | 152 | `storage_logs` |
| `auth_logs.tsv` | 11 | `auth_logs` |
| `auth_audit_logs.tsv` | 7 | `auth_audit_logs` |

Aucune ligne ne mentionne l'uuid dans la fenêtre pour les sources
`postgres_logs`, `postgrest_logs` et `pgbouncer_logs`, qui n'ont donc pas de
fichier.

## Filtre utilisé

Une ligne est retenue quand l'uuid apparaît dans le message ou dans N'IMPORTE
QUELLE valeur des attributs :

```sql
select … from logs
where source = '<source>'
  and (event_message like '%6b2057a9-ee51-4070-8732-9759d30fd521%'
       or arrayExists(v -> v like '%6b2057a9-ee51-4070-8732-9759d30fd521%',
                      mapValues(log_attributes)))
order by timestamp, id
```

Pour `edge_logs`, cela couvre le sujet du JWT
(`request.sb.jwt.authorization.payload.subject`), `request.sb.auth_user` et
les URL qui portent l'uuid, y compris les appels des fonctions edge faits avec
la clé de service. Les 2 807 lignes ont été lues par pages de 500
(`LIMIT/OFFSET`) puis dédoublonnées sur l'`id` du journal. Ce compte est égal au
`count(*)` de la même requête.

### Fonctions edge : lignes reliées par `execution_id`

- Pour `function_logs` et `function_edge_logs`, on a gardé les lignes qui
  mentionnent l'uuid (`lien = uuid`), plus celles qui partagent leur
  `execution_id` avec l'une de ces lignes (`lien = execution_id`). Ce sont les
  boot/shutdown du worker, les lignes sans uuid de la même exécution et les
  appels pg_net de `handler-watch`. La requête utilisée :
  `log_attributes['execution_id'] in (select log_attributes['execution_id'] from logs where source in ('function_logs','function_edge_logs') and <filtre uuid>)`.
- Un `execution_id` désigne un worker, et un même worker sert parfois
  plusieurs comptes. On a donc **écarté** les lignes reliées qui concernent
  explicitement un AUTRE compte :
  - **4 requêtes** `function_edge_logs` dont le JWT porte un autre sujet
    (48 candidates, 44 gardées, 42 directes) ;
  - **7 lignes** `function_logs` dont le message nomme un autre `userId` /
    `user` (292 candidates, 285 gardées, 93 directes).
- La colonne `fonction` reprend le slug d'après `function_id` (lu dans
  `function_edge_logs` et `supabase functions list`).

## Colonne « client »

- **`edge_logs`** et **`storage_logs`** : étiquette tirée du user-agent, du
  referer et de `x-client-info`.
  - `web-pc-chrome154` : UA Windows Chrome 154, referer fillsell.app
  - `web-pc-chrome152` : UA Windows Chrome 152, referer fillsell.app
  - `extension-pc` : UA Windows Chrome, sans referer
  - `app-android` : referer `https://localhost/` (WebView Capacitor, Samsung SM-S921B, Android 16)
  - `web-mobile-android` : UA « Android 10; K » (Chrome mobile)
  - `serveur-fonction-edge` : UA Deno
  - vide : aucun en-tête (lignes « Lifecycle » du stockage)
- **`function_edge_logs`** et **`auth_audit_logs`** : ces sources n'ont pas de
  referer, l'étiquette ne vient que du user-agent.
  - `pc-chrome154` / `pc-chrome152` : web OU extension, on ne peut pas trancher
  - `app-android`, `web-mobile-android`, `serveur-fonction-edge`
  - `pg_net-cron` : appel planifié

## Données retirées

- Jamais repris : adresse IP (`cf_connecting_ip`, `x_forwarded_for`,
  `x_real_ip`, `remote_addr`, `req.remoteAddress`), clé API, hash et préfixe de
  clé, préfixe de signature, `session_id`, jeton, e-mail (`actor_username`,
  `user_email`), téléphone, ville, code postal, région, opérateur réseau.
- Les messages bruts de `auth_logs` / `auth_audit_logs` (JSON contenant
  l'e-mail et l'IP) ne sont pas repris : seuls les champs listés en en-tête le
  sont.
- Les messages de `storage_logs` au format `projet | méthode | statut | IP | …`
  ne sont pas repris non plus, puisque leurs champs sont déjà en colonnes. Les
  messages « [Lifecycle] » le sont.
- Toutes les chaînes passent par un filtre qui remplace :
  - un e-mail par `<email>` ;
  - un JWT, un `Bearer …` ou une valeur de paramètre `token`, `apikey`,
    `code`, `secret`, `password` ou `signature` par `<jeton>` ;
  - une IPv4 par `<ip>` ;
  - un numéro de téléphone français par `<telephone>`.

  Dans cette extraction, aucun remplacement n'a été nécessaire : relu par
  `grep` après écriture.
- La query string de `edge_logs` est décodée (`decodeURLComponent`) et coupée à
  400 caractères (`…` en fin). Les messages de `function_logs` sont gardés en
  entier (620 caractères au plus) ; un saut de ligne y est rendu par ` ⏎ `.
- Les uuid (utilisateur, annonce, job, relevé, fiche) et les titres d'articles
  présents dans les filtres de requête sont conservés.
