-- ═══════════════════════════════════════════════════════════════════════════
-- fiches_annonce — la fiche d'annonce survit à la génération (2026-09-15)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI SE PASSAIT. Le quota d'annonces est débité à la GÉNÉRATION. Ce que la
-- génération produit — les 4 annonces rédigées, les photos, les attributs lus,
-- les champs requis complétés au stepper, la catégorie résolue par plateforme —
-- ne vivait NULLE PART en base tant que l'utilisateur n'avait pas cliqué
-- Publier :
--   · generate-listing rend son texte au client et n'écrit qu'une ligne
--     usage_logs (son propre commentaire : « INSERT happens client-side ») ;
--   · le stepper garde tout dans sessionStorage fs_stepper_draft, mort à la
--     fermeture de l'onglet ;
--   · la ligne inventaire n'était créée QU'AU clic Publier.
-- Mesure du 15/09 : 654 générations facturées sur 1 697 (38,5 %), 405 comptes,
-- n'ont produit AUCUN job. Les gens paient et il ne leur reste rien.
--
-- CE QUE CETTE TABLE EST. La fiche de publication d'UN article du stock :
-- l'état complet et reprenable du stepper, écrit dès le débit par le serveur
-- (lens-analysis en mode annonce, generate-listing), puis tenu à jour par le
-- stepper à chaque modification de l'utilisateur. Rouvrir l'article trois jours
-- plus tard rend la fiche telle quelle — sans un seul appel à l'IA, sans un
-- seul débit de plus.
--
-- CE QU'ELLE N'EST PAS. Ni un cache (elle n'expire pas), ni un journal (une
-- seule ligne par article, écrasée). Elle ne porte AUCUNE facturation : le
-- décompte reste entièrement dans usage_logs, inchangé par ce lot.
--
-- DURÉE DE VIE. Exactement celle de l'article : `on delete cascade` sur
-- inventaire. La seule façon dont une fiche disparaît est que l'utilisateur
-- supprime son article — le chemin qui existe déjà (usage_logs
-- retrait_annonces), et qu'on ne touche pas.
--
-- POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE SUR inventaire. L'app charge
-- le stock avec `select('*')` limit 3000 à chaque démarrage (App.jsx). Une
-- colonne jsonb de plusieurs kilo-octets par article — 4 annonces complètes —
-- serait relue intégralement à chaque ouverture de l'app, pour un contenu dont
-- on n'a besoin qu'en ouvrant le stepper d'UN article. Table séparée, lue à la
-- demande, jointe par inventaire_id.

create table if not exists public.fiches_annonce (
  -- Un article, une fiche. La clé primaire EST le rattachement : impossible
  -- d'avoir deux fiches concurrentes pour le même article, et la cascade fait
  -- le ménage quand l'utilisateur supprime l'article.
  inventaire_id bigint primary key references public.inventaire(id) on delete cascade,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  -- L'état du stepper, même forme que le brouillon sessionStorage (un seul
  -- sérialiseur côté client : deux formes divergeraient au premier correctif).
  -- Contenu : photos, processedPhotos, platformListings, edited, sharedFields,
  -- sharedOverrides, selected, price, prixAchatSaisi, notes, photoOption,
  -- background, step, et la fiche canonique du scan (lens).
  fiche         jsonb  not null default '{}'::jsonb,
  -- 'lens_unifie' | 'generate_listing' | 'stepper' — qui a écrit en dernier.
  -- Informatif : sert à savoir si la fiche vient d'un geste facturé ou d'une
  -- simple édition, jamais à décider d'un débit.
  source        text,
  -- lens_scans.scan_id quand la fiche vient d'un scan unifié : le lien vers
  -- la réponse brute servie à l'utilisateur, qui vit 90 jours.
  scan_id       uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.fiches_annonce is
  'Fiche de publication d''un article du stock : état complet et reprenable du stepper (annonces rédigées par plateforme, photos, attributs, champs requis saisis, catégories résolues). Écrite au DÉBIT par lens-analysis / generate-listing, tenue à jour par le stepper. Rouvrir un article rend sa fiche sans aucun appel IA. Ne porte aucune facturation.';
comment on column public.fiches_annonce.fiche is
  'Même forme que le brouillon sessionStorage fs_stepper_draft (un seul sérialiseur côté client). sessionStorage reste un cache de confort ; cette colonne est la copie de référence.';
comment on column public.fiches_annonce.scan_id is
  'lens_scans.scan_id du scan unifié d''origine, quand il y en a un. Rétention lens_scans : 90 jours ; la fiche, elle, vit aussi longtemps que l''article.';

create index if not exists fiches_annonce_user_idx
  on public.fiches_annonce (user_id, updated_at desc);

-- updated_at tenu par la base : le client ne peut pas mentir sur la fraîcheur
-- d'une fiche, et un UPDATE partiel n'oublie jamais de le poser.
create or replace function public.fiches_annonce_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fiches_annonce_touch_trg on public.fiches_annonce;
create trigger fiches_annonce_touch_trg
  before update on public.fiches_annonce
  for each row execute function public.fiches_annonce_touch();

-- ── Accès ─────────────────────────────────────────────────────────────────
-- GRANT à authenticated : obligatoire depuis le breaking change Supabase de
-- mai 2026 (aucun privilège implicite sur une nouvelle table du schéma public).
-- Contrairement à lens_scans, l'app ÉCRIT ici : le stepper sauvegarde la fiche
-- à chaque modification. Rien de facturable ne se lit dans cette table, donc
-- rien à forger : elle ne porte que ce que l'utilisateur a déjà payé.
grant select, insert, update, delete on public.fiches_annonce to authenticated;

alter table public.fiches_annonce enable row level security;

drop policy if exists "Users manage own fiches_annonce" on public.fiches_annonce;
create policy "Users manage own fiches_annonce"
  on public.fiches_annonce
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
