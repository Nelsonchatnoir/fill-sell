-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260828063748 « sync_ecarte_brouillons_et_sans_photo » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists sync_import_ecartes (
  id bigserial primary key,
  user_id uuid,
  vinted_item_id text,
  vinted_status text,
  titre text,
  motif text,
  created_at timestamptz not null default now()
);

create or replace function inventaire_ecarte_import_sync()
returns trigger
language plpgsql
as $$
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
$$;

drop trigger if exists inventaire_ecarte_import_sync on inventaire;
create trigger inventaire_ecarte_import_sync
  before insert on inventaire
  for each row execute function inventaire_ecarte_import_sync();
