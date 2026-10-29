-- RÉCUPÉRATION DE LA DESCRIPTION D'ORIGINE — LA MESURE (lot C partie 1, 29/10/2026)
-- À relire à chaque check. Heure de Paris. Deux sources :
--   · usage_logs « recuperation_description » : UNE ligne par écran de récupération, écrite par l'app à sa fin
--     (issue : lue | ecrite | redigee | abandon ; motif du dernier échec vu ; lecteur ici | poste | aucun ; durée) ;
--   · lectures_origine_demandees : l'état tenu par l'extension ≥ 0.6.159 (prise_le, essai_le, motif, faite_le).

-- 1. Les écrans des 7 derniers jours : combien aboutissent, comment, en combien de temps.
select metadata->>'issue' as issue,
       coalesce(metadata->>'motif', '—') as motif,
       metadata->>'lecteur' as lecteur,
       count(*) as ecrans,
       count(distinct user_id) as comptes,
       percentile_disc(0.5) within group (order by (metadata->>'duree_ms')::numeric / 1000) as mediane_s,
       percentile_disc(0.9) within group (order by (metadata->>'duree_ms')::numeric / 1000) as p90_s
  from usage_logs
 where feature = 'recuperation_description' and created_at > now() - interval '7 days'
 group by 1, 2, 3
 order by ecrans desc;

-- 2. Les lectures demandées (extension ≥ 0.6.159) : délai demande → prise → lecture, et motifs d'échec.
select plateforme,
       count(*) as demandes,
       count(*) filter (where faite_le is not null and motif is null) as lues,
       count(*) filter (where motif = 'sans_texte') as sans_texte,
       count(*) filter (where motif = 'introuvable') as introuvables,
       count(*) filter (where faite_le is null and motif is not null) as en_echec,
       percentile_disc(0.5) within group (order by extract(epoch from prise_le - demandee_le)) filter (where prise_le >= demandee_le) as prise_mediane_s,
       percentile_disc(0.5) within group (order by extract(epoch from faite_le - demandee_le)) filter (where faite_le >= demandee_le and faite_le - demandee_le < interval '1 hour') as lecture_mediane_s
  from lectures_origine_demandees
 where demandee_le > now() - interval '7 days'
 group by 1;

select motif, count(*) as demandes, count(distinct user_id) as comptes
  from lectures_origine_demandees
 where demandee_le > now() - interval '7 days' and motif is not null
 group by 1 order by 2 desc;

-- 3. La voie de lecture prise par l'extension (usage_logs « lecture_fond », origine) : demandee_vite = sans le verrou,
--    demandee_tete = en tête de file, demandee = dans le poll (anciennes versions), page = demandée par l'écran.
select metadata->>'origine' as voie, metadata->>'resultat' as resultat, count(*) as lectures, count(distinct user_id) as comptes,
       percentile_disc(0.5) within group (order by (metadata->>'ms')::numeric) as ms_mediane
  from usage_logs
 where feature = 'lecture_fond' and created_at > now() - interval '7 days'
 group by 1, 2 order by 1, 3 desc;
