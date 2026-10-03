-- ═══════════════════════════════════════════════════════════════════════════
-- nicolas.menar — RETRAIT eBay « DOUDOU NALA » EN FAILED OBSOLÈTE (03/10, 21:00)
-- ═══════════════════════════════════════════════════════════════════════════
-- La tâche be0395a6 (retrait eBay 377453677328, armée le 27/09 parce que la
-- fiche Vinted homonyme est VENDUE) restait en « failed » avec le message du
-- 01/10 (« clos retiré à tort »). Vérifié le 03/10 ~20:55 dans Chrome :
-- l'annonce eBay est TOUJOURS EN VENTE (27,74 €, bouton d'achat présent).
-- Rien ne prouve que c'est l'objet vendu sur Vinted (titre seul) : c'est la
-- question « Déjà vendu ? » (inventaire_doublons 2ccb288e, homonyme_vendu,
-- proposée depuis le 01/10) qui tranche — elle s'affiche désormais en TÊTE du
-- Stock (BandeauDejaVendu, OTA). « Oui » retire l'annonce montrée.
-- Ici : la tâche cesse d'être un échec muet ; elle dit où est la décision.
-- Seul retrait en échec de toute la base (vérifié : 1 sur toutes plateformes).
-- Sauvegarde : _backup_0310_retrait_nala. Inverse : _INVERSE.sql.
begin;
create table if not exists public._backup_0310_retrait_nala as
select now() as sauvegarde_le, j.* from public.cross_post_jobs j where false;
insert into public._backup_0310_retrait_nala
select now(), j.* from public.cross_post_jobs j where j.id = 'be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4';

update public.cross_post_jobs j
set status = 'cancelled',
    error = 'Retrait en attente de ta réponse : l''annonce eBay est toujours en vente, et rien ne prouve encore que c''est l''article vendu sur Vinted. Réponds à « Déjà vendu ? » en haut de ton Stock : « Oui » la retire tout de suite.',
    platform_fields = j.platform_fields || jsonb_build_object('remplace_par_question', jsonb_build_object(
      'doublon_id', '2ccb288e-75d5-48b3-9211-1163483f6188', 'le', now(),
      'annonce_verifiee_en_vente_le', '2026-10-03T18:55:00Z',
      'pose_par', 'scripts/reparations/20261003_retrait_ebay_nala_question.sql'))
where j.id = 'be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4' and j.status = 'failed';

select id, status, left(error, 80) from public.cross_post_jobs where id = 'be0395a6-d9aa-45d8-8ae2-5558c0f9f1e4';
commit;
