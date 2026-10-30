-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSITION (NON EXÉCUTÉE) — LES ANNONCES LEBONCOIN PARTIES AMPUTÉES (lot E, 30/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Depuis le 20/10 16:42 (Paris), Leboncoin sert une nouvelle page de dépôt que
-- l'extension ne savait pas lire : « nombre de photos gratuites illisible »,
-- repli silencieux sur 3 photos. Corrigé en 0.6.160 (leboncoin.js : lecture
-- dans la page + libellés de la nouvelle page ; illisible = rien ne part).
-- Mesure du 30/10 vers 17:05 : 192 annonces encore « published », 19 comptes,
-- 524 photos manquantes (thecloset72000 : 3 sur 15, trois fois).
--
-- ⛔ RIEN N'EST ÉCRIT ICI : ce fichier ne fait que LISTER. La remise à niveau
--    touche la cadence de republication (règle : décision de Nico) et des
--    annonces de clients : elle attend le feu vert de Nico, puis un script de
--    réparation dédié (sauvegarde + inverse), comme toujours.
--
-- REMISE À NIVEAU PROPOSÉE (à décider par Nico) :
--   1. Attendre que l'extension du compte porte 0.6.160 (profiles.extension_build
--      postérieur au build du lot E) : sinon la recréation repartirait à 3 photos.
--   2. Pour chaque ligne ci-dessous dont la fiche n'est pas vendue : une
--      REPUBLICATION Leboncoin (retrait + nouveau dépôt avec toutes les photos
--      gratuites, lues sur la page), marquée réparation (sans pièce ni quota
--      consommés), étalée dans les créneaux existants, 10 par compte et par jour
--      au plus — la file des comptes ne doit pas être noyée.
--   3. Variante plus douce : ne rien republier d'office, mais une ligne dans
--      l'app sur ces annonces (« partie avec 3 photos sur N — republier ? »),
--      la personne décide.
--   Alternative écartée pour l'instant : « Modifier » l'annonce chez Leboncoin
--   pour ajouter les photos (garde l'ancienneté) — l'extension n'a aucun geste
--   de modification Leboncoin aujourd'hui (chantier à part).
-- ═══════════════════════════════════════════════════════════════════════════

-- A. Le décompte (compte par compte).
select j.user_id,
       count(*)                                         as annonces_amputees_en_ligne,
       sum((j.platform_fields->'photos_lbc'->>'fiche')::int
         - (j.platform_fields->'photos_lbc'->>'envoyees')::int) as photos_manquantes,
       min((j.platform_fields->'photos_lbc'->>'at')::timestamptz at time zone 'Europe/Paris') as premiere,
       max((j.platform_fields->'photos_lbc'->>'at')::timestamptz at time zone 'Europe/Paris') as derniere,
       p.extension_build
from cross_post_jobs j
join profiles p on p.id = j.user_id
where j.platform = 'leboncoin'
  and j.status = 'published'
  and j.platform_fields->'photos_lbc'->>'source' = 'illisible'
  and (j.platform_fields->'photos_lbc'->>'fiche')::int > (j.platform_fields->'photos_lbc'->>'envoyees')::int
group by j.user_id, p.extension_build
order by annonces_amputees_en_ligne desc;

-- B. Les annonces, une par ligne (ce que la réparation viserait).
select j.id as job_id, j.user_id, j.inventaire_id, j.listing_url, j.vu_en_ligne_le at time zone 'Europe/Paris' as vue_en_ligne,
       (j.platform_fields->'photos_lbc'->>'fiche')::int    as photos_fiche,
       (j.platform_fields->'photos_lbc'->>'envoyees')::int as photos_envoyees,
       i.statut as statut_fiche
from cross_post_jobs j
left join inventaire i on i.id = j.inventaire_id
where j.platform = 'leboncoin'
  and j.status = 'published'
  and j.platform_fields->'photos_lbc'->>'source' = 'illisible'
  and (j.platform_fields->'photos_lbc'->>'fiche')::int > (j.platform_fields->'photos_lbc'->>'envoyees')::int
order by j.user_id, j.published_at;
