-- ═══════════════════════════════════════════════════════════════════════════
-- URGENCE LOUIS (30/10/2026, ~19:40 Paris) — PAUSE DE TOUTES LES ACTIONS LEBONCOIN DE SES DEUX COMPTES
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico (30/10, « Mets en pause TOUTES les actions Leboncoin de ses DEUX comptes […] tant que le blocage
-- dure. Reprise prudente ensuite, sans rafale. »), promis à Louis par mail vers 19:20.
-- Comptes : « Amiral » louis@ttfamily.fr (faf5021a-479a-4bb3-b3ec-c296770739b7, Brave) et louis-seller@ttfamily.fr
-- (447d920c-976a-4d8f-aff4-a2998050358c, machine virtuelle) — comptes liés depuis le 18/10, UN seul compte Leboncoin.
-- Preuves (base) : veille des commandes Leboncoin en 403 — Amiral 28/10 21:31 et 30/10 02:27, louis-seller 29/10
-- 05:35 ; trois republications d'Amiral en « vérification anti-robot » depuis 12:51 ; capture de Louis à 19:12 :
-- « Accès temporairement restreint », « un robot est sur le même réseau ».
-- EFFET : pose platform_settings.leboncoin.blocage_acces (même forme que la règle _shared/blocage-leboncoin.js) ;
-- get-pending-jobs v307 ne sert alors plus RIEN de Leboncoin à ces comptes (publications, republications, retraits,
-- relevés), dit la pause sur chaque tâche retenue, puis un essai unique au bout de 24 h (ou sur « Leboncoin
-- remarche »), puis reprise prudente (une action / 10 min pendant 6 h). Aucune annonce touchée, aucun job modifié ici.
-- SAUVEGARDE : la valeur d'avant est lue en tête (elle est absente : aucun blocage posé jusqu'ici).
-- INVERSE : scripts/reparations/20261030_louis_pause_leboncoin_INVERSE.sql (retire la clé blocage_acces).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Sauvegarde (lecture) : la valeur d'avant.
select id, email, platform_settings->'leboncoin'->'blocage_acces' as blocage_avant
  from profiles where id in ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c');

-- 2. La pause (écriture par la seule RPC autorisée sur platform_settings).
select p.id, public.platform_settings_fusionner(
  array['leboncoin', 'blocage_acces'],
  jsonb_build_object(
    'depuis', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'derniere_preuve', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'signe', 'acces_temporairement_restreint',
    'source', 'réparation 30/10 (ordre de Nico, urgence Louis)',
    'detail', '403 veille des commandes (28/10 21:31, 29/10 05:35, 30/10 02:27), vérification anti-robot depuis 12:51, « Accès temporairement restreint » vu par Louis à 19:12',
    'preuves', 1,
    'essai_apres', to_char((now() + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  '{}'::text[],
  p.id
) as resultat
from (values ('faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid), ('447d920c-976a-4d8f-aff4-a2998050358c'::uuid)) as p(id);

-- 3. Relecture.
select id, email, platform_settings->'leboncoin'->'blocage_acces' as blocage_apres
  from profiles where id in ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c');
