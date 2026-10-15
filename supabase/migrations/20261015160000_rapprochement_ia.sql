-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — L'IA SUR LES DOUTES DU MOTEUR DE FUSION (décision 3 de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. rapprochement_ia_verdicts : UN verdict par paire (jamais deux appels pour
--    la même paire), tracé : question, verdict, raison, phase (texte/images),
--    modèle, jetons, coût, ce qui a été appliqué (ou le garde-fou qui a retenu).
-- 2. inventaire_doublon_decider_ia : la réponse de l'IA à « Est-ce le même
--    article ? », réservée au service (fonction edge rapprochement-ia). Mêmes
--    effets que la réponse de la personne, avec decide_par = 'ia', et des gardes
--    EN BASE en plus de ceux de la fonction (_shared/rapprochement/ia.js) :
--    jamais une paire d'une même plateforme, jamais une question liée à une
--    vente, jamais un « oui » chez un compte qui a déjà répondu « Non, deux
--    exemplaires », jamais un « oui » sur une fiche vendue.
-- Inverse : supabase/rollbacks/20261015160000_rapprochement_ia.sql.

create table if not exists public.rapprochement_ia_verdicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  doublon_id uuid,
  paire text not null,
  motif text,
  verdict text not null check (verdict in ('meme', 'different', 'incertain')),
  verdict_brut text,
  raison text,
  phase text not null check (phase in ('texte', 'images')),
  modele text not null,
  jetons_entree integer not null default 0,
  jetons_sortie integer not null default 0,
  cout_usd numeric(12, 6) not null default 0,
  mode text not null default 'mesure' check (mode in ('mesure', 'appliquer')),
  applique text,
  cree_le timestamptz not null default now(),
  unique (user_id, paire)
);
create index if not exists rapprochement_ia_verdicts_user_le on public.rapprochement_ia_verdicts (user_id, cree_le desc);
alter table public.rapprochement_ia_verdicts enable row level security;
drop policy if exists "verdicts ia : lecture de ses lignes" on public.rapprochement_ia_verdicts;
create policy "verdicts ia : lecture de ses lignes" on public.rapprochement_ia_verdicts
  for select to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.rapprochement_ia_verdicts to authenticated;
grant all on public.rapprochement_ia_verdicts to service_role;

create or replace function public.inventaire_doublon_decider_ia(p_id uuid, p_decision text, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d record;
  r jsonb;
begin
  select * into d from inventaire_doublons where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  if d.statut <> 'proposee' then return jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); end if;
  if d.motif in ('annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
                 'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
                 'annonce_remplacee', 'remise_en_ligne_titre_court', 'copie_non_prouvee', 'homonyme_vendu') then
    return jsonb_build_object('ok', false, 'reason', 'hors_ia', 'motif', d.motif);
  end if;
  if p_decision = 'non' then
    update inventaire_doublons
       set statut = 'refusee', decide_le = now(), decide_par = 'ia',
           preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'non', 'raison', p_raison, 'le', now()))
     where id = d.id;
    return jsonb_build_object('ok', true, 'decision', 'non');
  elsif p_decision = 'oui' then
    if exists (select 1 from inventaire_doublons x where x.user_id = d.user_id and x.statut = 'refusee' and x.decide_par = 'utilisateur') then
      return jsonb_build_object('ok', false, 'reason', 'compte_deux_exemplaires');
    end if;
    if not exists (select 1 from inventaire where id = d.garde and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu')
       or not exists (select 1 from inventaire where id = d.absorbe and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu') then
      return jsonb_build_object('ok', false, 'reason', 'fiche_vendue_ou_absente');
    end if;
    r := inventaire_fusionner_pour(d.user_id, d.garde, d.absorbe, 'ia (doublon proposé)');
    if coalesce((r ->> 'ok')::boolean, false) then
      update inventaire_doublons
         set statut = 'fusionnee', decide_le = now(), decide_par = 'ia', fusion_id = nullif(r ->> 'fusion_id', '')::uuid,
             preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'oui', 'raison', p_raison, 'le', now()))
       where id = d.id;
    end if;
    return r || jsonb_build_object('decision', 'oui');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
end;
$function$;
revoke all on function public.inventaire_doublon_decider_ia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.inventaire_doublon_decider_ia(uuid, text, text) to service_role;
