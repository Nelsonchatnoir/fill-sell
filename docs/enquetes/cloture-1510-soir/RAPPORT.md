# Mission de clôture — 15/10 soir (heure de Paris)

Mandat : 13 points (+ point 14 arrivé en cours), règles R1 → R12 de la mission du matin. État servi :
`docs/agents/etat-2026-10-01.md` § « 15/10 soir ». Les verdicts FAIT PROUVÉ / HYPOTHÈSE sont dans le compte rendu
donné à Nico ; ce fichier garde ce qu'un terminal doit retrouver.

## Requêtes laissées prêtes (point 13 — après la 0.6.112 servie)

```sql
-- 1. La 0.6.112 (ou 0.6.113) est-elle servie ? (postes vus depuis 2 jours)
select extension_build, count(*) from profiles
 where extension_last_seen_at > now() - interval '2 days' group by 1 order by 2 desc;

-- 2. Louis : ses 4 ventes Vinted annulées doivent disparaître (attendu : 0), articles revenus au stock.
select count(*) from ventes where id in (144011, 144012, 144013, 144014);
-- Les 4 fiches (relevées le 15/10 ~17:35, toutes « vendu » à cette heure) : attendu « stock ».
select id, titre, statut, quantite from inventaire
 where id in (1789889100417003, 1789889100417002, 1789889100063004, 1789889100063006);

-- 3. Louis : lectures Leboncoin de routine (avant/après) — usage_logs des vérifications d'état.
select date_trunc('hour', created_at at time zone 'Europe/Paris') h, count(*)
  from usage_logs
 where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and feature ilike '%leboncoin%etat%'
   and created_at > now() - interval '3 days'
 group by 1 order by 1;

-- 4. Marta : chemin vinted.it à sa première connexion.
select extension_build, extension_sessions -> 'vinted', platform_settings -> 'vinted' -> 'pays_appareil'
  from profiles where id = (select id from auth.users where email ilike 'marta%' limit 1);
```

## Fichiers et règles posés

| Point | Règle | Où |
|---|---|---|
| 1 | push de notes seules = pas de build | `scripts/vercel-ignorer-build.mjs`, `vercel.json` |
| 3 | IA sur les doutes, bornée, tracée | `_shared/rapprochement/ia.js`, `functions/rapprochement-ia`, migs 160000/170000/180000 |
| 4 | aperçu gratuit | `src/components/RepublicationPlanifiee.jsx`, `src/utils/apercuRepublication.js` |
| 6 | vente relevée sans annonce rattachée | mig 150000 |
| 7 | marque LBC citée, console_brand | `chrome-extension/content-scripts/leboncoin.js` (0.6.113) |
| 8 | poids main propre jamais repris | `_shared/lbc-poids-annonce.js` |
| 9 | une annonce hors ligne à la fois, motif levé | `_shared/retenue-hors-ligne.js` |
| 10 | republication mise de côté reprise (avant retrait) | `handler-watch` |
| 12 | mur « Opla quittée » | `src/utils/retraitsBloques.js` |
| 14 | lecture « plus en ligne » = pause | `_shared/introuvable-a-confirmer.js`, `update-job-status`, `handler-watch`, `_shared/pas-de-rouge.js` |

## Restes

- Cloudflare : FAIT le 15/10 ~17:50 (Cache Response Rule « Assets : jamais un 404 en cache », preuve : 404 `no-store`
  `BYPASS` trois fois de suite).
- 0.6.113 : à téléverser au Chrome Web Store (remplace la 0.6.112 en examen).
- Point 13 : mesures après service de la 0.6.112/0.6.113.
