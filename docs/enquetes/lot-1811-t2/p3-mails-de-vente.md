> Annexe du rapport du lot T2 du 18/11 (docs/enquetes/lot-1811-t2/RAPPORT.md) : enquête de l'agent, copiée telle quelle,
> noms, pseudos et adresses remplacés par l'id8 du compte ou un repère (règle « données de clients »).

# Point 3 du lot du 18/11/2026 : mails de vente pour des ventes anciennes (A) et après désinscription (B)

Enquête en lecture seule. Aucune écriture en base, aucun mail, aucun déploiement. Heures de Paris.
Toutes les requêtes ont été relancées après la correction de `q.mjs` (un fichier SQL par appel). Les fichiers `.sql`
cités sont dans `(dossier de travail vidé) `, avec les définitions de prod lues par `pg_get_functiondef` le 18/11 (`prod_*.sql`).

## 0. En bref
- **A est réel et touche tous les comptes neufs.**
  - Bilan : 10 mails, 10 comptes, 29 ventes antérieures annoncées, du 02/11 au 18/11. Seule la fenêtre de 30 jours
    du journal `push_ventes` est visible.
  - Cause : aucune garde ne compare la vente au début du suivi. Ni l'inscription, ni le premier relevé de la
    plateforme ne sont lus. La seule borne est « la vente, ou la lecture de sa preuve, a moins de 24 h ».
- **B est un trou latent, et il ne vient pas de l'adresse.**
  - Cause : le mail de vente part en `categorie: "support"`. Or la porte `envoyerEmail()` ne consulte
    `estDesinscrit()` que pour `marketing`.
  - Faits sur 4e0a80fe : elle n'a reçu qu'UN mail de vente, le 17/11 à 00:00:37. C'est un mail du cas A (vente du
    16/11 15:22, soit 8 h 29 avant son inscription). Il est parti 7 h 37 AVANT sa désinscription (17/11 07:37:19).
  - Depuis : aucun mail, car aucune vente.
  - Sur tout le parc : 0 mail de vente parti après une désinscription, parce qu'aucune des 28 personnes désinscrites
    n'a vendu depuis. Le prochain mail de vente de 4e0a80fe partirait pourtant.
- **Aucune décision de Nico ne dit « mail de vente = transactionnel, hors désinscription ».** Le classement `support`
  est un choix d'implémentation, écrit dans la règle du 06/10 (citations au § 2.3).

## 1. Cause A : mails pour des ventes antérieures au suivi

### 1.1 4e0a80fe (4e0a80fe), le cas témoin
```sql
select id, origine, plateforme, vente_id, commande_ref, (vendu_le at time zone 'Europe/Paris') vendu,
       (cree_le at time zone 'Europe/Paris') note, mail_statut, (mail_traite_le at time zone 'Europe/Paris') mail
from push_ventes where user_id = '4e0a80fe-1549-406f-bbc9-bb6eb07e046c';
```
- Inscription (`profiles.created_at`) : 16/11 23:51:14. Connexion eBay : 23:51:46. Premier relevé eBay : 17/11 00:00:13.
- Le 17/11 à 00:00:20, une seule écriture crée 23 ventes eBay (`source = 'releve'`), vendues du 12/02 au 16/11.
- Une seule a moins de 24 h : la vente 665454, vendue le 16/11 à 15:22:05. Elle donne la note 13033 (`commande`) et le
  mail `vente:13033`, parti le 17/11 à 00:00:37.

### 1.2 Ampleur sur tout le parc (30 jours de `push_ventes`, du 19/10 22:50 au 18/11)
Requêtes : `a2.sql` (vente datée avant l'inscription ou avant le premier relevé), `a6.sql` (chemin job), et le compte
final ci-dessous.

| Mail (Paris) | Compte | Chemin | Ventes antérieures dans le mail |
|---|---|---|---|
| 02/11 12:35 | 64eab2f9 | job Leboncoin | 1 (« Achat en cours » déjà là au 1er relevé ; vente relevée du 30/10) |
| 05/11 09:23 | a5da17ee | job Leboncoin | 5 sur les 7 ventes du mail |
| 08/11 21:11 | 3bb92a70 | commande eBay | 3 (vendues de 2,3 h à 19,6 h avant l'inscription) |
| 09/11 12:33 | cb64f482 | commande eBay | 5 |
| 11/11 18:32 | d666c271 | commande eBay | 4 |
| 13/11 03:35 | 2c89e573 | job Leboncoin | 5 (inscrit le 26/10, 1er relevé Leboncoin le 12/11 23:42) |
| 15/11 00:41 | 963630d0 | job Leboncoin | 2 |
| 15/11 22:31 | 020816ba | job Leboncoin | 2 (1re lecture « Achat en cours » à 21:07:48 = 1er relevé, 4 min après l'inscription) |
| 17/11 00:00 | 4e0a80fe (4e0a80fe) | commande eBay | 1 |
| 18/11 13:28 | 86a71015 | job eBay | 1 (vendue le 16/11 22:47, environ 38 h avant l'inscription du 18/11 12:52) |

Ce qui ne bloquerait rien à tort :
- Sur les 2 079 notes mailées en 30 jours, **0** est née sans relevé préalable de sa plateforme (`a5.sql`).
- Le critère « date de vente < début du suivi » n'écarte que les 13 notes `commande` du tableau.
- `vinted_sync_runs` n'est purgé par aucun cron ni aucune fonction (requêtes sur `cron.job` et `pg_proc`).
- Avant le 19/10, les notes sont purgées : les mails de vente partis moins de 2 h après une inscription (12/10, 18/10)
  ne sont pas prouvables.

### 1.3 Par quel chemin, et pourquoi la garde laisse passer
Le circuit : relevé ou commande → déclencheur → `push_noter` (ou `push_noter_commande_vinted`) → note `push_ventes` →
`push_ventes_a_envoyer` → fonction edge `push-ventes` → `envoyerEmail` (`vente:<note>`). Aucune étape ne lit
`profiles.created_at` ni la date du premier relevé.

- **Chemin `commande`** (13 notes) : `push_trg_ventes('releve')`, déclencheur `ventes_push_releve` sur INSERT.
  - `prod_push_trg_ventes.sql:13` : `if new.vendu_le < now() - interval '24 hours' then return new;`.
    C'est la seule borne : l'âge de la vente au moment de la lecture.
  - `:20` : depuis la migration 20261105180000 (appliquée le 05/11 à 20:27:11), une date lue suffit. L'exigence
    « plateforme suivie » n'est plus demandée pour une vente datée.
  - Le premier relevé d'un compte neuf lit tout son historique, et les ventes des 24 dernières heures partent en mail.
    Les 13 cas sont tous postérieurs au 05/11.
  - Même borne dans `vente_vinted_lot_eclater` (`prod_vente_vinted_lot_eclater.sql:371`), qui appelle
    `push_noter_commande_vinted`.
- **Chemin `job`** (16 notes) : `push_trg_job`. La borne porte sur l'âge de la LECTURE de la preuve, jamais sur la date
  d'achat ni sur le début du suivi.
  - `prod_push_trg_job.sql:33-38` : rattrapage « lecture fraîche » (règle du 24/10), qui exige
    `premiere_lecture` < 24 h.
  - `:83-93` : preuve exacte, avec `sale_evidence.lu_le` < 24 h.
  - Cas Leboncoin : un « Achat en cours » lu DÈS le premier relevé, puis rattaché à une tâche d'import
    (`platform_fields.rattachement.import = true`), part en mail.
  - Cas eBay : une tâche importée dont le premier contrôle Browse lit « vendus: 1 » (une vente du 16/11 déjà
    relevée, sans numéro de commande) part aussi en mail.
- Sans danger par construction, et inchangés par le correctif : origines `vinted` et `annonce` (l'état « en ligne »
  d'avant est exigé), `declaree` (aucun mail).

## 2. Cause B : la désinscription n'arrête pas les mails de vente

### 2.1 Preuves en base
```sql
select email, user_id, desinscrit, (desinscrit_le at time zone 'Europe/Paris'), origine
from email_destinataires where user_id = '4e0a80fe-1549-406f-bbc9-bb6eb07e046c';
-- <e-mail> | 4e0a80fe… | true | 2026-11-17 07:37:19 | reponse_unsubscribe_17_11
select email_type, (sent_at at time zone 'Europe/Paris') from email_logs
where user_id = '4e0a80fe-1549-406f-bbc9-bb6eb07e046c' or lower(email) like '%<e-mail>%';
-- welcome 16/11 23:51:15 · extension_link 16/11 23:52:53 · vente:13033 17/11 00:00:37 (rien après 07:37:19)
```
- Tout le parc (`b1.sql`) : 0 ligne `vente:%` postérieure à une désinscription, qu'elle vienne de `email_destinataires`
  ou de `marketing_optout`.
- `b2.sql` : les 28 personnes désinscrites n'ont aucune note ni aucune vente depuis. Le trou n'a donc pas encore servi.
- La porte réserve `vente:<note>` dans `email_logs` AVANT l'envoi : `email_logs` fait foi. Resend n'a pas été parcouru
  (il aurait fallu lire des centaines de mails d'autres clients).
- Ni casse ni alias en cause :
  - `profiles.email` = `email_destinataires.email` = `<e-mail>`, même `user_id`.
  - 0 écart d'adresse sur les 27 désinscrits rattachés à un profil.
  - `normaliserEmail` passe en minuscules et ne retire pas le « +alias », volontairement.
  - `estDesinscrit()` lit l'adresse, puis le `user_id`, puis `marketing_optout` : elle répondrait `true` pour 4e0a80fe.
- À noter : la ligne de 4e0a80fe (origine `reponse_unsubscribe_17_11`) a été posée hors de `desinscrire()`. Il n'y a pas
  de trace `marketing_optout` dans `email_logs`. C'est sans effet sur la garde, mais la trace d'audit manque.
- Le mail de vente n'a ni lien ni en-tête de désinscription (catégorie `support`). 4e0a80fe a répondu « unsubscribe »
  par mail.

### 2.2 Le chemin qui ne lit pas `desinscrit`
- `supabase/functions/push-ventes/index.ts:143-146` (vente seule ou groupe) et `:231-234` (rafale) :
  `envoyerEmail({ …, type: \`vente:${n.id}\`, categorie: "support", dedup: "reservation" })`.
- `supabase/functions/_shared/desinscription.ts:398` : `if (categorie === "marketing") { … estDesinscrit … }`.
  Une catégorie `support` n'est jamais filtrée, par conception (en-tête du fichier, l. 41-43 :
  « 'support' — … alerte sur son propre travail. JAMAIS filtré »).
- `email-desinscription` et `email-tunnel ?unsub=` écrivent bien les deux registres. Seul l'envoi ignore le résultat.
- Le même trou existe sur un autre mail, hors de l'ordre du 18/11. `job_pending_relaunch` (relance,
  `email-tunnel/index.ts:2116-2122`) est en `support`, alors que la page dit « Tu ne recevras plus d'emails de
  relance ». C'est à trancher par Nico.

### 2.3 Y a-t-il une décision « mail de vente = transactionnel » ? Non, seulement une catégorie d'implémentation
- `docs/regles/ventes-et-retraits.md:83-87` (06/10 soir, décision de Nico « UN MAIL À CHAQUE VENTE, JAMAIS PLAFONNÉ ») :
  « `push-ventes` envoie le mail (type `vente:<note>`, **support**, réservation, index `email_logs_vente_unique`) ».
  La décision porte sur « à chaque vente, jamais plafonné ». « support » y figure comme détail technique, sans un mot
  sur la désinscription.
- Même mention technique ailleurs :
  - `supabase/migrations/20261006180000_mails_de_vente.sql:45-46` ;
  - `push-ventes/index.ts:20` ;
  - `docs/regles/mails-paiements-comptabilite.md:70-72` (29/10, thecloset72000) : les mails `vente:` sont hors du
    plafond de 2 par 24 h. Cela ne parle que du plafond.
- `src/pages/Desinscription.jsx:166-169` ne promet que « Les messages liés à ton compte — réponse à une question,
  sécurité, facturation — continuent ». Les ventes n'y figurent pas.
- Conclusion : l'ordre du 18/11 contredit la ligne 87 du 06/10, qui est une implémentation et non une décision
  explicite. Cette ligne est à réécrire dans le même commit.

## 3. Le correctif (la règle, pour tous les comptes)

### 3.1 A : une vente antérieure au début du suivi n'est jamais annoncée (ni mail, ni push)
Le **début du suivi** d'une plateforme pour un compte est le plus tard de deux dates :
- l'inscription ;
- le PREMIER relevé de cette plateforme (`vinted_sync_runs`, toutes sortes de relevé). À défaut de relevé, la
  connexion eBay pour eBay ; à défaut, l'inscription.

`now()` n'est jamais pris comme repli : un compte sans relevé ne perd jamais ses mails. La vente et les retraits ne
changent pas, seule la note est concernée.

Nouvelle fonction, migration `2026111812xxxx_vente_avant_suivi.sql` :
```sql
create or replace function public.vente_avant_suivi(p_user uuid, p_pf text, p_vendu_le timestamptz, p_job uuid)
returns text language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_pf text := public.plateforme_normalisee(p_pf); v_inscrit timestamptz; v_r record; v_debut timestamptz;
        v_j record; v_lu timestamptz;
begin
  if p_user is null or v_pf is null then return null; end if;
  select p.created_at into v_inscrit from public.profiles p where p.id = p_user;
  select coalesce(r.started_at, r.queued_at) debut, coalesce(r.finished_at, r.updated_at, r.started_at, r.queued_at) fin
    into v_r from public.vinted_sync_runs r where r.user_id = p_user and r.platform = v_pf
   order by coalesce(r.started_at, r.queued_at) asc nulls last limit 1;          -- index vinted_sync_runs_user_date
  v_debut := greatest(v_inscrit, coalesce(v_r.debut,
               case when v_pf = 'ebay' then (select e.connected_at from public.ebay_accounts e
                                              where e.user_id = p_user and e.revoked_at is null) end, v_inscrit));
  if v_debut is null then return null; end if;
  -- 1. date de vente LUE (commande) antérieure au suivi
  if p_vendu_le is not null then return case when p_vendu_le < v_debut then 'avant_suivi:date' end; end if;
  if p_job is null then return null; end if;
  select j.platform_listing_id, j.platform_fields into v_j from public.cross_post_jobs j where j.id = p_job and j.user_id = p_user;
  if not found then return null; end if;
  -- 2. l'état vendu / « Achat en cours » était déjà là au PREMIER relevé de la plateforme
  v_lu := public._ts_ou_null(v_j.platform_fields #>> '{sale_evidence,rattrapage,premiere_lecture}');
  if v_lu is not null and v_r.fin is not null and v_lu <= v_r.fin then return 'avant_suivi:etat_initial'; end if;
  -- 3. preuve sans numéro de commande à elle : la vente relevée de CETTE annonce (numéro exact) est antérieure, aucune depuis
  if nullif(btrim(coalesce(v_j.platform_fields #>> '{sale_evidence,order_id}', '')), '') is null
     and nullif(btrim(coalesce(v_j.platform_fields #>> '{vente_commande_ebay,commande}', '')), '') is null
     and nullif(btrim(coalesce(v_j.platform_listing_id, '')), '') is not null
     and exists (select 1 from public.ventes v where v.user_id = p_user and v.source = 'releve'
                   and v.annonce_id = v_j.platform_listing_id and v.vendu_le < v_debut   -- ventes_annonce_idx
                   and public.plateforme_normalisee(coalesce(nullif(btrim(v.plateforme_code), ''), v.plateforme)) = v_pf)
     and not exists (select 1 from public.ventes w where w.user_id = p_user and w.annonce_id = v_j.platform_listing_id
                       and w.vendu_le >= v_debut) then
    return 'avant_suivi:vente_relevee';
  end if;
  return null;
end $$;
revoke all on function public.vente_avant_suivi(uuid, text, timestamptz, uuid) from public, anon, authenticated;
```

Branchements, réécrits depuis `pg_get_functiondef` de prod. md5 au 18/11, sans retour chariot : `push_noter`
31f8991857f493e5ec277eb399689679, `push_noter_commande_vinted` 2cf1bb10fe432f2b29a2677ec3b671cf.
L'INVERSE porte ces deux textes mot pour mot.

`push_noter` (`prod_push_noter.sql:44-58`). Avant :
```sql
  if not p_declaree then
    v_motif := public.push_vente_deja_signalee(p_user, v_pf, v_cles, now(), null, false);
  end if;
  … case when p_declaree then 'declaree' when v_motif is not null then 'doublon' else 'a_envoyer' end,
```
Après :
```sql
  if not p_declaree then
    v_motif := public.push_vente_deja_signalee(p_user, v_pf, v_cles, now(), null, false);
    -- (18/11, ordre de Nico, point 3A) une vente antérieure au suivi : notée (trace), jamais annoncée.
    if v_motif is null then
      begin v_motif := public.vente_avant_suivi(p_user, v_pf, p_vendu_le, p_job);
      exception when others then v_motif := null; end;          -- panne = comportement d'avant
    end if;
  end if;
  … case when p_declaree then 'declaree' when v_motif like 'avant_suivi:%' then 'ignoree'
         when v_motif is not null then 'doublon' else 'a_envoyer' end,
```
Pour la ligne `pg_net` (« not p_declaree and v_motif is null ») : inchangée. Une note `avant_suivi` n'appelle donc pas
push-ventes.

`push_noter_commande_vinted` (`prod_push_noter_commande_vinted.sql:46-47`). Avant :
```sql
  v_motif := push_vente_deja_signalee(p_user, 'vinted', v_cles, now(), NULL, false);
  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' ELSE 'doublon' END;
```
Après :
```sql
  v_motif := push_vente_deja_signalee(p_user, 'vinted', v_cles, now(), NULL, false);
  IF v_motif IS NULL THEN
    BEGIN v_motif := vente_avant_suivi(p_user, 'vinted', p_vendu_le, NULL); EXCEPTION WHEN others THEN v_motif := NULL; END;
  END IF;
  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' WHEN v_motif LIKE 'avant_suivi:%' THEN 'ignoree' ELSE 'doublon' END;
```

Ce qui ne change pas :
- `push_trg_ventes`, `push_trg_job`, `push_ventes_a_envoyer`, rafale, `push-ventes` ;
- les ventes, les retraits, la cadence, Stripe.

Coût et données :
- deux lectures par index, par note (environ 150 par jour) ;
- aucune donnée réécrite ;
- aucun cron.

Limite connue : une 2e boutique de la même plateforme, ajoutée tard, part du début de la plateforme et non de la
boutique (`vinted_sync_runs.compte_plateforme` permettrait d'affiner). C'est à trancher.

### 3.2 B : la désinscription vaut aussi pour les mails de vente
La règle vit dans la PORTE, pas chez l'appelant :
- nouvelle catégorie `notification` : un mail que la personne n'a pas demandé, déclenché par son activité ;
- elle est filtrée par la désinscription et porte l'en-tête List-Unsubscribe ;
- elle n'est pas soumise au plafond marketing, qui ne vit que dans envoi-ponctuel et ne change pas ;
- `support` reste réservé aux réponses à SA demande, à la sécurité et à la facturation.

Nouveau module pur `supabase/functions/_shared/mail-categorie.js` :
```js
// (18/11/2026, ordre de Nico, point 3B) La désinscription vaut pour tout mail que la personne n'a pas DEMANDÉ :
// marketing ET notifications (mails de vente). Seul 'support' (réponse à SA demande, sécurité, facturation) passe.
export const CATEGORIES = Object.freeze(['marketing', 'notification', 'support']);
const valide = (c) => (CATEGORIES.includes(c) ? c : 'marketing');
export const bloqueeParDesinscription = (c) => valide(c) !== 'support';
export function verdictMailVente(r) {           // un refus « désinscrit » est DÉFINITIF (jamais 3 réessais)
  if (r?.envoye) return { statut: 'envoye' };
  if (r?.motif === 'deja_envoye') return { statut: 'deja_envoye' };
  if (r?.motif === 'desinscrit') return { statut: 'echec', motif: 'desinscrit' };
  return { statut: 'a_reessayer', motif: String(r?.motif ?? 'inconnu').slice(0, 120) };
}
```

`_shared/desinscription.ts` :
- l. 63 : `"marketing" | "support"` devient `"marketing" | "notification" | "support"` ;
- l. 398 : `if (categorie === "marketing")` devient `if (bloqueeParDesinscription(categorie))` ;
- l. 439 : `if (categorie === "marketing" && userId)` devient `if (bloqueeParDesinscription(categorie) && userId)` ;
- l. 38-48 : l'en-tête est réécrit (trois catégories).

`push-ventes/index.ts` :
- l. 145 et 233 : `categorie: "support"` devient `categorie: "notification"` ;
- l. 147-150 et 235-237 : remplacées par `return verdictMailVente(r);`.

`push_ventes_resultat` range déjà tout statut inconnu en `echec` : un statut `echec` avec le motif `desinscrit` est
final, sans SQL à changer. Aucune fonction ne lit `mail_statut` hors de push-ventes.

Dans un groupe (A9), les réservations des autres notes sont relâchées, comme pour tout échec de la tête. La rafale suit
le même chemin.

`src/pages/Desinscription.jsx:156-169` (fr et en) : la page dit aussi « ni les mails de tes ventes ». La promesse
« liés à ton compte » ne cite plus que réponse, sécurité, facturation.

À trancher par Nico, hors du minimum :
- un lien VISIBLE « Se désinscrire » dans le mail de vente (la règle du 12/11 ne vise que le marketing) ;
- le sort de `job_pending_relaunch`.

Variante minimale, déconseillée : `categorie: "marketing"` dans push-ventes, avec le même `verdictMailVente`. L'effet
est identique, mais le nom est faux.

Docs du même commit :
- `docs/regles/ventes-et-retraits.md` : l. 87 réécrite, plus une section 18/11 (A et B) ;
- `docs/regles/mails-paiements-comptabilite.md` : la porte a trois catégories.

## 4. Selftests « verrou » proposés (rouges sur le code actuel, verts après)
1. **`selftest:vente-avant-suivi`**, `node scripts/vente-avant-suivi-selftest.mjs`. Il est statique, sur le modèle de
   `mail-a-chaque-vente-selftest.mjs`. Il vérifie :
   - la migration ne définit QUE `vente_avant_suivi`, `push_noter` et `push_noter_commande_vinted`, sans aucune
     écriture de données ;
   - l'INVERSE a le md5 de prod du § 3.1 ;
   - `push_noter` appelle la garde seulement si `not p_declaree` et `v_motif is null`, dans un bloc d'exception de
     repli ;
   - `'ignoree'` pour `avant_suivi:%` ; `pg_net` reste conditionné à `v_motif is null` ;
   - `push_noter_commande_vinted` passe `p_vendu_le` ;
   - le début vient de `profiles.created_at` et de `vinted_sync_runs`, jamais de `now()` ;
   - le numéro d'annonce est exact (aucun `titre` dans le corps) ;
   - `revoke` pour anon et authenticated.

   Il est ROUGE aujourd'hui, car la migration n'existe pas.
2. **`selftest:vente-avant-suivi-pg`**, `node scripts/cloud/pg-jetable.mjs scripts/ventes/preuve-vente-avant-suivi.mjs`.
   La base est jetable, avec le schéma public de prod lu en lecture seule (méthode de `preuve-mail-a-chaque-vente.mjs`)
   et `net.http_post` retenu. Les cas sont synthétiques et reproduisent les 3 formes réelles :

   | Cas | Mise en place | Attendu |
   |---|---|---|
   | S1, type 4e0a80fe | profil T0, relevé eBay à T0+9 min, vente relevée vendue à T0−8 h 29 | note `ignoree` `avant_suivi:date`, 0 appel net, 0 réservation |
   | S2 | vente vendue après le 1er relevé | `a_envoyer`, 1 appel |
   | S3 | compte ancien, 1er relevé Leboncoin, tâche importée, `premiere_lecture` dans ce relevé | `ignoree` `avant_suivi:etat_initial` ; vente et retraits armés inchangés |
   | S4 | « Achat en cours » lu en TRANSITION des jours après | `a_envoyer` |
   | S5 | tâche eBay importée, preuve Browse sans commande, vente relevée de la même annonce avant le début | `ignoree` `avant_suivi:vente_relevee` |
   | S5b | même annonce, 2e exemplaire avec SA commande | `a_envoyer` |
   | S6 | vente déclarée | `declaree` |
   | S7 | commande Vinted en lot avant le début | `ignoree` |
   | S8 | panne simulée de la garde | comportement d'avant |

   ROUGE sur les définitions de prod : S1, S3, S5 et S7 donnent `a_envoyer`.
3. **`selftest:mail-vente-desinscrit`**, `node scripts/mail-vente-desinscrit-selftest.mjs`. Il est en Node, sur le
   modèle de `lien-desinscription-visible-selftest.mjs`. Il vérifie :
   - (a) module `_shared/mail-categorie.js` : `bloqueeParDesinscription` vaut vrai pour `notification`, `marketing` et
     `undefined`, faux pour `support`. `verdictMailVente({envoye:false,motif:'desinscrit'})` rend
     `{statut:'echec',motif:'desinscrit'}`, jamais `a_reessayer` ; `envoye` et `deja_envoye` restent tels quels ;
     `resend_echec` donne `a_reessayer` ;
   - (b) `desinscription.ts` : le filtre de désinscription et l'en-tête List-Unsubscribe passent par
     `bloqueeParDesinscription`, et `support` n'est jamais filtré ;
   - (c) `push-ventes/index.ts` : chaque `envoyerEmail` de type `vente:` est en `"notification"` (0 `"support"`), et
     les deux verdicts passent par `verdictMailVente` ;
   - (d) `Desinscription.jsx` (fr et en) cite les mails de vente.

   ROUGE aujourd'hui : (a) le module est absent, et (c) trouve 2 fois `"support"`.

## 5. Déploiement impliqué
- **A : une migration SQL, sans fonction edge.**
  - Étapes : essai sur base jetable (le selftest pg), feu vert NOMMÉ de Nico, puis
    `npx supabase db query --linked -f supabase/migrations/2026111812xxxx_vente_avant_suivi.sql` et
    `npx supabase migration repair --linked --status applied 2026111812xxxx`.
  - Juste avant : relire `pg_get_functiondef` des deux fonctions (md5 du § 3.1).
  - Contenu : aucune donnée, aucun cron, aucun `db push`.
- **B : redéployer `push-ventes`** (lu le 18/11 : **version 35, `verify_jwt` false**, déployée le 15/11 à 12:06:20,
  dépôt conforme : dernier commit `b8d189c` du 15/11 à 12:05).
  - Appelants sans session : `push_noter` par pg_net, et le cron 34 avec `x-cron-secret`.
  - Commande : `npx supabase functions deploy push-ventes --no-verify-jwt`. Relire version et `verify_jwt` avant et
    après.
  - `_shared/desinscription.ts` change pour tous les expéditeurs, mais seulement à LEUR prochain déploiement.
    `marketing` et `support` restent identiques : c'est rétrocompatible.
- **Web** : `Desinscription.jsx`, servi par Vercel au push sur `main`. Pas d'OTA nécessaire pour la page web.
- **Rien à réparer en base.** Les mails partis ne se rattrapent pas, et aucun mail client ne part sans ordre de Nico.
  4e0a80fe est déjà désinscrite : le correctif B suffit pour elle.
