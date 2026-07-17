-- Durcissement sécurité pré-soumission (audit RLS/storage) — 2 correctifs ciblés.
--
-- 1. Buckets storage listing-photos + lens-temp : la policy SELECT était large
--    (bucket_id = ... sans filtre user, rôle public) → n'importe qui, anon
--    inclus, pouvait ÉNUMÉRER et lister les photos de TOUS les utilisateurs
--    (advisor 0025_public_bucket_allows_listing). On restreint la lecture au
--    propriétaire du dossier, symétriquement aux policies INSERT/DELETE déjà
--    en place (path listing-photos = <uid>/... ; path lens-temp = lens/<uid>/...).
--
--    NB : les buckets restent public=true à dessein — l'app lit les photos via
--    getPublicUrl (chemin CDN /object/public/, qui NE consulte PAS ces policies)
--    et l'extension Chrome fetch ces URLs publiques depuis le contexte des sites
--    de dépôt (vinted.fr, ebay.fr…) sans l'auth Supabase de l'user. Restreindre
--    la policy SELECT ferme l'ÉNUMÉRATION cross-user sans casser ni l'affichage
--    ni le cross-post. Le résiduel (téléchargement par URL exacte connue) reste
--    couvert par des paths en UUID non devinables, l'énumération étant fermée.
--
-- 2. monitor_state : la table (journal d'incidents handler-watch) avait le RLS
--    DÉSACTIVÉ et des GRANTS complets à anon/authenticated hérités des default
--    privileges Supabase (la migration d'origine 20260716100000 comptait à tort
--    sur l'absence de GRANT explicite). N'importe qui pouvait lire/écrire/vider
--    (TRUNCATE) la table via l'API REST (advisor 0013_rls_disabled_in_public).
--    Elle n'est écrite QUE par la fonction handler-watch en service_role (qui
--    bypass RLS et conserve ses propres grants) — aucun accès client requis.
--    On active le RLS et on révoque tous les grants anon/authenticated ; sans
--    policy, seule la service_role peut désormais y accéder.

-- ── 1. Storage : lecture restreinte au propriétaire ──────────────────────────

drop policy if exists "listing_photos_select" on storage.objects;
create policy "listing_photos_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "lens_temp_select" on storage.objects;
create policy "lens_temp_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lens-temp'
    and (storage.foldername(name))[1] = 'lens'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

-- ── 2. monitor_state : RLS + révocation des grants client ────────────────────

alter table public.monitor_state enable row level security;

revoke all on public.monitor_state from anon;
revoke all on public.monitor_state from authenticated;
