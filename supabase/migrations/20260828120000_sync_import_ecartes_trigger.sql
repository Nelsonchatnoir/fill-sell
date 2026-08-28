-- ✅ DÉJÀ APPLIQUÉE EN PROD — objets créés DIRECTEMENT en prod le 28/08/2026
-- (matin, suite au cas Joe0410). Ce fichier RETRANSCRIT l'existant à
-- l'identique, relevé le 28/08 via pg_get_functiondef, pg_get_triggerdef et
-- le catalogue (colonnes, contraintes, RLS, grants) : il ne crée rien de
-- neuf en prod, il rend le dépôt à nouveau source de vérité. Idempotente.
--
-- Rôle : la sync dressing importait les coquilles vides de Vinted (dépôts
-- commencés puis abandonnés : brouillons, articles sans photo) comme du
-- stock — jusqu'à consommer des créneaux de republication auto (Joe0410).
-- Ce trigger les ÉCARTE À L'ENTRÉE : la ligne est journalisée dans
-- sync_import_ecartes puis RETURN NULL — écartée silencieusement, la sync
-- continue sans erreur.
--
-- ⛔ GARDE-FOU ABSOLU : le filtre ne touche QUE origine='vinted_sync'.
-- La saisie manuelle (origine NULL) représente 1 074 articles sans photo
-- chez 239 comptes — du stock légitime. Ne JAMAIS élargir le filtre à eux.
--
-- Notes de relevé (état prod du 28/08, reproduit tel quel) :
--   · RLS DÉSACTIVÉE sur sync_import_ecartes, aucune policy ; les grants
--     viennent des default privileges Supabase (anon/authenticated/
--     service_role, tous droits). Signalé pour arbitrage — non modifié ici.
--   · Le trigger est BEFORE INSERT seulement : les PATCH de la sync
--     (patchLeger) et les UPDATE ne passent pas par lui. Sur l'upsert
--     merge-duplicates de la sync, RETURN NULL saute la ligne AVANT la
--     résolution de conflit : une coquille vide déjà en base n'est plus ni
--     créée ni mise à jour.
--   · Le journal reçoit UNE ligne par article écarté et PAR RUN (pas de
--     dédup) : croissance à surveiller, aucune purge en place.

create table if not exists public.sync_import_ecartes (
  id             bigserial primary key,
  user_id        uuid,
  vinted_item_id text,
  vinted_status  text,
  titre          text,
  motif          text,
  created_at     timestamptz not null default now()
);

grant select, insert, update, delete on public.sync_import_ecartes to authenticated;
grant usage, select on sequence public.sync_import_ecartes_id_seq to authenticated;

CREATE OR REPLACE FUNCTION public.inventaire_ecarte_import_sync()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_motif text;
begin
  -- Ne concerne QUE les lignes ecrites par la sync dressing.
  -- La saisie manuelle (origine NULL) n'est jamais touchee : un article
  -- cree a la main sans photo reste du stock legitime.
  if coalesce(new.origine,'') <> 'vinted_sync' then
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

  -- RETURN NULL : la ligne est ecartee silencieusement, la sync continue.
  return null;
end;
$function$
;

drop trigger if exists inventaire_ecarte_import_sync on public.inventaire;
CREATE TRIGGER inventaire_ecarte_import_sync BEFORE INSERT ON public.inventaire FOR EACH ROW EXECUTE FUNCTION inventaire_ecarte_import_sync();
