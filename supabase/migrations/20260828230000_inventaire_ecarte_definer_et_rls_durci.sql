-- ✅ DÉJÀ APPLIQUÉE EN PROD — changements faits DIRECTEMENT en prod le
-- 28/08/2026 (resserrage INSERT PUR le matin, SECURITY DEFINER + durcissement
-- RLS le soir). Ce fichier RETRANSCRIT l'existant à l'identique (définition
-- relevée en base via pg_get_functiondef, RLS/grants au catalogue) : NO-OP
-- sur la prod actuelle, il rend le dépôt à nouveau source de vérité.
-- Idempotente. Remplace les « Notes de relevé » de
-- 20260828120000_sync_import_ecartes_trigger.sql (RLS désactivée, grants
-- larges) : cet état-là n'est plus celui de la prod.
--
-- A. Resserrage (matin) : le trigger ne s'applique plus qu'aux INSERTIONS
--    PURES. En PostgreSQL un BEFORE INSERT tire AVANT la résolution du
--    ON CONFLICT : sans ce resserrage, le RETURN NULL annulait aussi le
--    DO UPDATE de l'upsert de la sync et FIGEAIT la ligne existante (vues,
--    favoris, prix, statut) pour toujours.
-- B. SECURITY DEFINER (soir) : la fonction tournait avec les droits de
--    l'appelant (`authenticated`), qui n'a plus d'écriture sur
--    sync_import_ecartes depuis le durcissement RLS — son INSERT de journal
--    partait en permission denied et remontait en HTTP 403 à PostgREST au
--    lieu d'écarter la ligne en silence (notes « N article(s) non écrit(s)
--    → HTTP 403 » chez Allo Présence, chriseva67, Dylan Moeckes ;
--    sync_import_ecartes à zéro ligne depuis sa création). Le SET
--    search_path est INDISPENSABLE avec SECURITY DEFINER (escalade de
--    privilèges sinon) — ne jamais l'omettre.
-- C. Durcissement RLS de quatre tables créées sans protection (lisibles et
--    inscriptibles avec la clé anon) : RLS activée, ZÉRO policy — c'est
--    l'état voulu, seules les fonctions SECURITY DEFINER et le service_role
--    y écrivent. Ne PAS ajouter de policy.
--
-- ⛔ Le trigger inventaire_ecarte_import_sync existe déjà et est actif sur
-- public.inventaire : CREATE OR REPLACE sur la fonction suffit, on ne le
-- recrée pas. Les trois tables *_purge_20260828 contiennent les sauvegardes
-- des 465 articles supprimés le 28/08 au matin — on ne touche à AUCUNE
-- donnée.

CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est JAMAIS touchee : 1 074 articles
  -- manuels sans photo chez 239 comptes, c'est du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
    return new;
  end if;

  -- INSERT PUR UNIQUEMENT (28/08, resserrage).
  -- En PostgreSQL un BEFORE INSERT tire AVANT la resolution du ON CONFLICT :
  -- un RETURN NULL annulerait aussi le DO UPDATE de l'upsert de la sync, et
  -- figerait la ligne existante (vues, favoris, prix, statut) pour toujours.
  -- Si l'article existe deja, on laisse passer : la derive draft/hidden se
  -- traite a l'affichage, pas en gelant la donnee.
  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  if new.vinted_status = 'draft' then
    v_motif := 'brouillon';
  elsif new.photos is null
     or jsonb_typeof(new.photos) <> 'array'
     or jsonb_array_length(new.photos) = 0 then
    v_motif := 'sans_photo';
  else
    return new;
  end if;

  insert into sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
  values (new.user_id, new.vinted_item_id, new.vinted_status, left(coalesce(new.titre,''),120), v_motif);

  return null;
end;
$function$;

-- Durcissement RLS, état prod du 28/08 : RLS ACTIVÉE, zéro policy, droits
-- UNIQUEMENT postgres + service_role (anon et authenticated révoqués).
-- DO block : idempotent sur la prod (les 4 tables existent), et ne casse pas
-- un replay sur une base où les tables de purge n'ont jamais été créées
-- (elles sont nées directement en prod, leur DDL n'est pas dans le dépôt).
do $$
declare t text;
begin
  foreach t in array array[
    'sync_import_ecartes',
    'inventaire_purge_20260828',
    'jobs_purge_20260828',
    'captures_purge_20260828'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
