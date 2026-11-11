-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (11/11/2026, règle de Nico — L1) UN RETRAIT DEMANDÉ « PARTOUT » RETIRE AUSSI LES COPIES DE LA BOUTIQUE PARTAGÉE
-- AVEC UN COMPTE RELIÉ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/retrait-comptes-relies-1111/RAPPORT.md. Règle : docs/regles/ventes-et-retraits.md (§ 11/11).
--
-- LE DÉFAUT. « Retirer partout » = « Supprimer l'article » → « Retirer aussi les annonces … et supprimer ». L'app n'arme
-- que les retraits du compte qui agit (RLS de cross_post_jobs : auth.uid() = user_id), et le filet serveur à la
-- suppression (inventaire_arme_retraits_avant_suppression) ne lit que les dépôts de la fiche supprimée. La liaison
-- entre comptes (comptes_lies + fiches_liees_comptes) n'était branchée que sur la VENTE (inventaire_vente_fiche_liee).
-- Constaté le 11/11 sur la seule paire de comptes reliés : deux fiches supprimées « avec retrait » sur un compte, la
-- copie Leboncoin de chacune, suivie par la fiche jumelle de l'autre compte (même boutique Leboncoin), restée en ligne.
--
-- LA RÈGLE. Quand une personne supprime une fiche EN RETIRANT ses annonces, chez le compte relié qui suit le MÊME article
-- (fiche jumelle de fiches_liees_comptes, comptes reliés au moment du geste, jumelle ni fondue ni vendue) :
--   · PORTÉE (décision 1 de Nico, 11/11 15:15) : les BOUTIQUES PARTAGÉES seulement — une plateforme où
--     boutique_partagee_compte_relie(compte qui agit, compte relié, plateforme) est vrai (jamais Vinted : une boutique
--     par compte), tant que la fenêtre de suppression ne l'annonce pas à la personne. Ailleurs : rien n'est touché ;
--   · la copie CERTAINE (le dépôt « published » le plus récent de la plateforme dont le rattachement est prouvé : les
--     preuves de la vente, appelées telles quelles — retrait_job_prouve, rattachement_confirme, fiche_annonces_vivantes
--     < 2) reçoit son retrait ; jamais : annonce vendue (sale_signal) ou sous achat (leboncoin_transaction_lue), Opla
--     (l'information est posée une fois), copie sans numéro ni lien, deux annonces vivantes, une annonce déjà en retrait
--     chez ce compte OU chez un compte relié (jamais deux retraits du même numéro d'une boutique partagée — relecture M6) ;
--   · la copie rattachée au TITRE SEUL (rattachement non confirmé), ou d'une boutique partagée où la fiche supprimée porte
--     SA propre annonce, une AUTRE (deux_annonces_paire : deux annonces d'une plateforme = deux exemplaires, relecture
--     finale point 1) : la QUESTION « c'est le même article ? » posée au compte relié, par le mécanisme de la vente
--     (inventaire_doublons, motif copie_non_prouvee, source retrait_partout_compte_relie), sur l'annonce relevée qui porte
--     le numéro du dépôt (point 5) — rien n'est retiré sans sa réponse (décision 5) ; sa réponse :
--     copie_retrait_partout_repondre (« Oui » = le retrait de l'annonce montrée, « Non » = jamais reposée). Sur la
--     plateforme d'un doute (question, deux annonces vivantes, deux_annonces_paire), rien n'est annulé ni clos (point 4) ;
--   · ce qui attend chez la jumelle, sur ces plateformes (décisions 2 et 6) : publications en attente ou qui attendent un
--     geste, TOUTES les tâches échouées, republications non engagées ET engagées (« ancienne annonce supprimée » : la
--     nouvelle ne part pas) → « cancelled » + arret_utilisateur (les voies de « Ta file » et du 31/10) ; une tâche annulée
--     qui portait déjà un lien ou un numéro le dit (message vrai) et est nommée au bilan (annulees_avec_numero) ; remises
--     en vente à faire → « abandonnee » ; remises Leboncoin closes de moins de 14 jours → arret_utilisateur ;
--   · ⛔ jamais touchée, jamais verrouillée : une tâche EN COURS (processing). Elle est NOMMÉE dans le bilan
--     (taches_laissees, motif en_cours) : le filet serveur d'update-job-status (_shared/publication-apres-retrait.js, B)
--     retire ce que CET essai publierait (décision 2). Une tâche tenue par un autre geste (SKIP LOCKED), laissée faute de
--     temps ou en erreur est nommée aussi (son motif) et tracée dans « erreurs » ;
--   · la jumelle RESTE au stock et porte une MARQUE visible (jumelles_retirees_partout, décision 4 : l'app la montre et
--     la tient hors des lots à la prochaine OTA) — seulement si quelque chose a été fait (retrait armé ou déjà en cours,
--     tâche annulée, remise close ; point 3) ;
--   · « partout » = la suppression retire au moins une annonce de la fiche : un retrait de cette fiche ouvert depuis
--     moins de 2 MINUTES (décision 3), ou un dépôt publié que le filet arme. RIEN pour une fiche sans annonce, pour
--     « Supprimer la fiche, laisser les annonces en ligne », pour une réinitialisation ou une suppression de compte,
--     pour le retrait d'une seule plateforme par son logo (aucune fiche supprimée).
-- LES GARDE-FOUS DE TEMPS (relecture I1/M1 : authenticated a statement_timeout 8 s, une 57014 n'est jamais attrapée) :
-- verrous de lignes en NOWAIT / SKIP LOCKED, tous tracés ; lock_timeout 1 s pour les verrous implicites (clé étrangère,
-- déclencheurs) ; budget de 2 s pour la traversée (au-delà, le reste est tracé, nommé, jamais fait à moitié) ; une tâche
-- « processing » n'est jamais lue FOR UPDATE. Toute erreur d'une étape est tracée dans le bilan (clé « erreurs », I2) et
-- ne fait JAMAIS échouer la suppression.
--
-- EN AJOUT SEULEMENT : six fonctions neuves, une table neuve (la marque), un déclencheur neuf. Aucune fonction existante
-- n'est réécrite (la vente, ses preuves, le filet, la question de la vente et sa réponse : md5 contrôlés), aucune donnée
-- n'est écrite par la migration. fiches_liees_comptes.derniere_propagation n'est jamais écrit (la vente s'en sert).
-- Coût pour tous les autres comptes (sans fiche jumelle) : une lecture d'index de fiches_liees_comptes à la suppression.
-- ⛔ Deux chaînes tenues (selftest) : pose_par ne contient pas « armer_retrait_job » (l'app et handler-watch y lisent
-- un retrait d'article VENDU) ; chemin ne commence pas par « vente_ » (_shared/retrait-vente-prouvee.js).
-- Essai : base JETABLE seulement (scripts/essais/20261111140000_banc.mjs, définitions de prod). Verrou :
-- npm run selftest:retrait-partout-fiche-liee. Inverse : supabase/rollbacks/20261111140000_retrait_partout_fiche_liee_INVERSE.sql.
-- (Relecture B1) DDL sur inventaire (déclencheur) : jamais d'attente au-delà de 5 s derrière une écriture en cours.
SET lock_timeout = '5s';

-- ── 0. LA MARQUE DE LA JUMELLE (décision 4) : « retirée partout depuis ton autre compte », lue par l'app ─────────────
-- Une ligne par fiche jumelle traversée. Jamais une écriture sur la fiche elle-même (aucun déclencheur de inventaire ne
-- tire). Pas de clé étrangère vers inventaire (aucun verrou sur la fiche, aucune action à chaque suppression de fiche) :
-- une marque dont la fiche est partie ne sert plus à rien, l'app ne lit que les siennes.
CREATE TABLE IF NOT EXISTS public.jumelles_retirees_partout (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventaire_id bigint      NOT NULL,
  le            timestamptz NOT NULL DEFAULT now(),
  de_compte     uuid        NOT NULL,
  de_fiche      bigint      NOT NULL,
  chemin        text        NOT NULL,
  plateformes   text[]      NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, inventaire_id)
);
ALTER TABLE public.jumelles_retirees_partout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jumelles_retirees_partout FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.jumelles_retirees_partout TO authenticated;
GRANT ALL ON TABLE public.jumelles_retirees_partout TO service_role;
DROP POLICY IF EXISTS jumelles_retirees_partout_lecture ON public.jumelles_retirees_partout;
CREATE POLICY jumelles_retirees_partout_lecture ON public.jumelles_retirees_partout
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 1. LA LECTURE : les copies de la fiche jumelle d'un compte relié, et ce qui interdit d'en retirer une ────────────
-- Une seule source pour « ce qui est armé » (armer_retraits_fiche_liee) et, plus tard, « ce que l'app annonce ». Elle ne
-- lit pas la fiche p_fiche elle-même : elle répond aussi après sa suppression (le lien de fiches n'a pas de clé étrangère).
-- rang = 1 : le dépôt le plus récent de la plateforme parmi ceux dont le rattachement est certain (le choix de la vente).
-- motif_refus : la preuve d'abord (rattachement, deux annonces), puis l'état de l'annonce ; etat_refus : l'état seul (la
-- question d'une copie au titre seul n'est posée que sur une annonce vivante, à vendre, qui a un numéro ou un lien).
-- partagee : la boutique de cette plateforme est partagée entre les deux comptes (la portée de la décision 1).
CREATE OR REPLACE FUNCTION public.copies_fiche_liee(p_user uuid, p_fiche bigint)
 RETURNS TABLE(lien bigint, compte uuid, fiche bigint, job uuid, platform text, mise_en_ligne timestamp with time zone, rang integer, motif_refus text, etat_refus text, partagee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with jumelles as (
    select f.id as lien, x.compte, x.fiche
      from public.fiches_liees_comptes f
      cross join lateral (select case when f.fiche_a = p_fiche then f.fiche_b else f.fiche_a end as fiche,
                                 case when f.fiche_a = p_fiche then f.user_b else f.user_a end as compte,
                                 case when f.fiche_a = p_fiche then f.user_a else f.user_b end as moi) x
      join public.inventaire i on i.id = x.fiche and i.user_id = x.compte
     where (f.fiche_a = p_fiche or f.fiche_b = p_fiche)
       and x.moi = p_user and x.compte <> p_user
       and public.comptes_sont_lies(p_user, x.compte)
       and i.fusionne_dans is null
       and i.statut is distinct from 'vendu' and not (i.quantite is not null and i.quantite <= 0)
  ), depots as (
    select m.lien, m.compte, m.fiche, j.id as job, j.platform,
           coalesce(j.published_at, j.created_at) as mise_en_ligne, j.created_at as cree,
           -- Les preuves de la vente (armer_retraits_copies) : jamais un titre, jamais deux annonces vivantes.
           case
             when not public.retrait_job_prouve(j.id) or not public.rattachement_confirme(j.id) then 'rattachement_non_confirme'
             when public.fiche_annonces_vivantes(m.fiche, j.platform) >= 2 then 'deux_annonces_vivantes'
             -- (relecture finale, point 1) La fiche supprimée porte SA propre annonce, une AUTRE, sur la même plateforme :
             -- deux annonces d'une plateforme = deux exemplaires, jamais un retrait d'office (la question). Lue tant que les
             -- dépôts de la fiche la désignent encore (déclencheur BEFORE DELETE, avant le SET NULL de la clé étrangère).
             when exists (select 1 from public.cross_post_jobs pj
                           where pj.user_id = p_user and pj.inventaire_id = p_fiche and pj.platform = j.platform
                             and coalesce(pj.action, 'publish') in ('publish', 'republish') and pj.status = 'published'
                             and public.annonce_id_de_job(pj.platform_listing_id, pj.listing_url)
                                   is distinct from public.annonce_id_de_job(j.platform_listing_id, j.listing_url))
               then 'deux_annonces_paire'
           end as refus_preuve,
           -- L'état de l'annonce elle-même : vendue, sous achat, Opla, ou rien qui la désigne.
           case
             when coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then 'annonce_vendue'
             when exists (select 1 from public.annonces_plateforme a
                           where a.user_id = j.user_id and a.platform = j.platform
                             and (a.job_id = j.id or public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id))
                             and coalesce(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') in ('pending', 'sold'))
               then 'achat_en_cours'
             when j.platform = 'opla' and public.opla_sortie_passee() then 'opla_quittee'
             when nullif(btrim(coalesce(j.listing_url, '')), '') is null
              and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null then 'sans_numero_ni_lien'
           end as refus_etat,
           public.boutique_partagee_compte_relie(p_user, m.compte, j.platform) as partagee
      from jumelles m
      join public.cross_post_jobs j on j.user_id = m.compte and j.inventaire_id = m.fiche
       and coalesce(j.action, 'publish') in ('publish', 'republish') and j.status = 'published'
  )
  select d.lien, d.compte, d.fiche, d.job, d.platform, d.mise_en_ligne,
         case when d.refus_preuve is null
              then (row_number() over (partition by d.fiche, d.platform, (d.refus_preuve is null)
                                       order by d.mise_en_ligne desc, d.cree desc))::integer end as rang,
         coalesce(d.refus_preuve, d.refus_etat) as motif_refus,
         d.refus_etat as etat_refus,
         coalesce(d.partagee, false) as partagee
    from depots d
$function$;

-- ── 2. UNE ANNONCE DÉJÀ EN RETRAIT CHEZ UN COMPTE RELIÉ (relecture M6) ─────────────────────────────────────────────
-- Une boutique partagée = la MÊME annonce suivie par les deux comptes : si l'autre compte la retire déjà (retrait en
-- file, en cours, ou fait depuis la mise en ligne de ce dépôt), ce compte-ci n'en arme jamais un second.
CREATE OR REPLACE FUNCTION public.annonce_en_retrait_compte_relie(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.cross_post_jobs j
      join public.comptes_lies c on j.user_id in (c.user_a, c.user_b)
      join public.cross_post_jobs d on d.user_id = (case when c.user_a = j.user_id then c.user_b else c.user_a end)
       and d.platform = j.platform and d.action = 'delete'
     where j.id = p_job
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (public.listing_designe(public.annonce_id_de_job(j.platform_listing_id, j.listing_url), d.listing_url, d.platform_listing_id)
            or (nullif(btrim(coalesce(j.listing_url, '')), '') is not null and d.listing_url = j.listing_url)))
$function$;

-- ── 3. LE RETRAIT D'UNE COPIE (la traversée, et le « Oui » de la question) ─────────────────────────────────────────
-- Écrit pour le compte de la copie (l'appelant a pris son identité : les gardes de ses tâches lisent auth.uid()). Le dépôt
-- est verrouillé en NOWAIT (tenu ailleurs : « verrou », rien n'est écrit, l'appelant le trace). Jamais deux retraits de la
-- même annonce (la garde de armer_retrait_job_pour, mot pour mot), ni chez ce compte ni chez un compte relié. Rend
-- { statut : arme | deja | refus | verrou | saute, motif, retrait }. Son lock_timeout est celui de l'appelant (1 s pour
-- la traversée, 2 s pour la réponse de la personne).
CREATE OR REPLACE FUNCTION public.armer_retrait_copie_reliee(p_job uuid, p_chemin text, p_pose text, p_marque jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_url    text;
  v_pf     jsonb;
  v_del    uuid;
  v_statut text;
begin
  begin
    select * into j from public.cross_post_jobs where id = p_job for update nowait;
  exception when lock_not_available then
    return jsonb_build_object('statut', 'verrou', 'job', p_job);
  end;
  if not found or j.status is distinct from 'published' or coalesce(j.action, 'publish') not in ('publish', 'republish') then
    return jsonb_build_object('statut', 'saute', 'job', p_job, 'motif', 'plus_publiee');
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null then
    return jsonb_build_object('statut', 'refus', 'job', p_job, 'motif', 'sans_numero_ni_lien');
  end if;
  -- Jamais deux retraits de la même annonce, chez ce compte (la garde de armer_retrait_job_pour, mot pour mot).
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (public.listing_designe(coalesce(j.platform_listing_id, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return jsonb_build_object('statut', 'deja', 'job', p_job);
  end if;
  -- … ni chez un compte relié (boutique partagée : la MÊME annonce, déjà en retrait de l'autre côté).
  if public.annonce_en_retrait_compte_relie(j.id) then
    return jsonb_build_object('statut', 'refus', 'job', p_job, 'motif', 'annonce_en_retrait_compte_relie');
  end if;

  v_pf := jsonb_build_object('arme_par', jsonb_build_object('chemin', p_chemin, 'le', now(), 'depot', j.id, 'pose_par', p_pose)
                                         || coalesce(p_marque, '{}'::jsonb));
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'depop' and coalesce(j.platform_fields ->> 'depop_product_id', '') ~ '^[0-9]+$' then
    v_pf := v_pf || jsonb_build_object('depop_product_id', j.platform_fields -> 'depop_product_id');
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id, status into v_del, v_statut;
  -- Les gardes d'insertion ont le dernier mot : annonce déclarée retirée par la personne (aucune ligne), doublon (ligne
  -- née close).
  if v_del is null or v_statut not in ('pending', 'needs_user') then
    return jsonb_build_object('statut', 'saute', 'job', p_job, 'motif', 'garde_insertion', 'retrait', v_del);
  end if;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return jsonb_build_object('statut', 'arme', 'job', p_job, 'retrait', v_del, 'platform', j.platform);
end;
$function$;

-- ── 4. L'ÉCRITURE : chez le compte relié, ce que la règle fait pour UNE fiche supprimée ──────────────────────────────
-- Appelée par le déclencheur ci-dessous (et, sur ordre, par un script de réparation : elle répond après la suppression
-- de p_fiche). Rejouée, elle n'arme rien de plus et ne réécrit aucune ligne inchangée.
CREATE OR REPLACE FUNCTION public.armer_retraits_fiche_liee(p_user uuid, p_fiche bigint, p_chemin text DEFAULT 'suppression_article_compte_relie'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '1s'
AS $function$
declare
  -- Le budget court depuis le début de la REQUÊTE (statement_timestamp) : une suppression de plusieurs fiches en une
  -- requête partage les mêmes 2 s — la limite de 8 s de l'API vaut pour la requête entière.
  v_debut    constant timestamptz := statement_timestamp();
  v_entree   constant timestamptz := clock_timestamp();
  v_budget   constant interval := interval '2 seconds';
  v_jum      record;
  c          record;
  t          record;
  r          jsonb;
  v_chemin   text := coalesce(nullif(btrim(p_chemin), ''), 'suppression_article_compte_relie');
  v_pose     constant text := 'armer_retraits_fiche_liee (serveur)';
  v_le       text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_jwt      text;
  v_sub      text;
  v_part     text[];
  v_pf       jsonb;
  v_err      text;
  v_q        uuid;
  v_retrait  record;
  v_marque   jsonb;
  v_n        integer;
  v_restent  integer;
  v_avec_num boolean;
  v_supprime boolean;
  v_msg      text;
  v_marque_neuve boolean;
  v_sans     text;
  v_fait     boolean;
  -- le total, toutes jumelles
  v_jumelles integer := 0;
  v_hors     integer := 0;
  v_armes    integer := 0;
  v_pl       text[] := '{}';
  v_refus    integer := 0;
  v_questions integer := 0;
  v_deja     integer := 0;
  v_pub      integer := 0;
  v_repub    integer := 0;
  v_remises  integer := 0;
  v_marquees integer := 0;
  v_laissees jsonb := '[]'::jsonb;
  v_erreurs  jsonb := '[]'::jsonb;
  -- une jumelle
  v_armes_j  integer;
  v_pl_j     text[];
  v_refus_j  integer;
  v_q_j      integer;
  v_deja_j   integer;
  v_pub_j    integer;
  v_repub_j  integer;
  v_eng_j    integer;
  v_ech_j    integer;
  v_rem_j    integer;
  v_mar_j    integer;
  v_hp_j     integer;
  v_lais_j   jsonb;
  v_num_j    jsonb;
  v_err_j    jsonb;
  v_encours_j integer;
  v_doute_j  text[];
  v_gard_j   jsonb;
begin
  if p_user is null or p_fiche is null then
    return jsonb_build_object('jumelles', 0, 'armes', 0);
  end if;
  -- Lecture par les clés de la liaison : une fiche sans jumelle (tous les comptes sauf une paire reliée) sort ici.
  if not exists (select 1 from public.fiches_liees_comptes f where f.fiche_a = p_fiche or f.fiche_b = p_fiche) then
    return jsonb_build_object('jumelles', 0, 'armes', 0);
  end if;
  if v_chemin ~ '^vente_' then
    raise exception 'armer_retraits_fiche_liee : un chemin « vente_… » est réservé au circuit de la vente (%).', v_chemin;
  end if;

  for v_jum in
    select distinct x.compte, x.fiche
      from public.fiches_liees_comptes f
      cross join lateral (select case when f.fiche_a = p_fiche then f.fiche_b else f.fiche_a end as fiche,
                                 case when f.fiche_a = p_fiche then f.user_b else f.user_a end as compte,
                                 case when f.fiche_a = p_fiche then f.user_a else f.user_b end as moi) x
      join public.inventaire i on i.id = x.fiche and i.user_id = x.compte
     where (f.fiche_a = p_fiche or f.fiche_b = p_fiche)
       and x.moi = p_user and x.compte <> p_user
       and public.comptes_sont_lies(p_user, x.compte)
       and i.fusionne_dans is null
       and i.statut is distinct from 'vendu' and not (i.quantite is not null and i.quantite <= 0)
     order by x.compte, x.fiche
  loop
    -- La portée (décision 1) : les plateformes dont la boutique est partagée entre les deux comptes. Aucune : rien.
    v_part := array(select p from unnest(array['leboncoin', 'beebs', 'depop', 'ebay', 'opla']) as p
                     where public.boutique_partagee_compte_relie(p_user, v_jum.compte, p) order by p);
    if cardinality(v_part) = 0 then
      v_hors := v_hors + 1;
      continue;
    end if;
    v_jumelles := v_jumelles + 1;
    v_armes_j := 0; v_pl_j := '{}'; v_refus_j := 0; v_q_j := 0; v_deja_j := 0; v_pub_j := 0; v_repub_j := 0; v_eng_j := 0;
    v_ech_j := 0; v_rem_j := 0; v_mar_j := 0; v_hp_j := 0; v_lais_j := '[]'::jsonb; v_num_j := '[]'::jsonb; v_err_j := '[]'::jsonb;
    v_encours_j := 0; v_doute_j := '{}'; v_gard_j := '[]'::jsonb;
    v_marque := jsonb_build_object('le', now(), 'chemin', v_chemin, 'de_fiche', p_fiche::text, 'de_compte', p_user, 'pose_par', v_pose);
    -- Le compte relié écrit pour LUI-MÊME (même personne, comptes_lies) : les gardes de SES tâches lisent auth.uid()
    -- (garde_depop_acces → depop_autorise refuse un compte qui n'est pas celui de la session). Même geste que la vente
    -- Vinted entre comptes reliés (20261018230000) ; l'identité de la session est rendue telle quelle juste après.
    v_jwt := current_setting('request.jwt.claims', true);
    v_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_jum.compte::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_jum.compte::text, true);

    -- (a) Les copies : par plateforme partagée, la copie certaine la plus récente reçoit son retrait ; la copie au titre
    --     seul, la question ; les autres, un refus tracé.
    for c in
      select k.job, k.platform, k.rang, k.motif_refus, k.etat_refus, k.partagee
        from public.copies_fiche_liee(p_user, p_fiche) k
       where k.compte = v_jum.compte and k.fiche = v_jum.fiche
         and (k.rang = 1 or k.rang is null)
       order by k.platform, k.mise_en_ligne desc
    loop
      if not c.partagee then
        v_hp_j := v_hp_j + 1;
        continue;
      end if;
      if clock_timestamp() - v_debut > v_budget then
        v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'retrait', 'job', c.job, 'platform', c.platform, 'erreur', 'budget'));
        continue;
      end if;
      begin
        if c.motif_refus = 'opla_quittee' then
          -- Opla quittée : jamais un retrait ; l'information est posée une fois sur la copie (comme à la vente).
          perform public.opla_copie_a_retirer_noter(c.job, v_chemin);
          continue;
        end if;
        v_q := null; v_sans := null;
        -- (relecture finale, point 4) Une plateforme où la copie est un DOUTE (titre seul, deux annonces vivantes, une
        -- autre annonce sur la fiche supprimée) : rien n'y sera annulé ni clos chez la jumelle (étapes b et c).
        if c.motif_refus in ('rattachement_non_confirme', 'deux_annonces_vivantes', 'deux_annonces_paire')
           and not (c.platform = any(v_doute_j)) then
          v_doute_j := v_doute_j || c.platform;
        end if;
        if c.motif_refus in ('rattachement_non_confirme', 'deux_annonces_paire') and c.etat_refus is null then
          -- (décision 5 ; relecture finale, point 1) Le titre seul ou deux exemplaires ne décident jamais : la question de
          -- la vente, posée au compte relié (une par dépôt, jamais reposée). Elle montre l'annonce relevée qui porte le
          -- NUMÉRO du dépôt — celle qu'un « Oui » retirerait (point 5) ; aucune : pas de question. Pas de question non plus si
          -- l'annonce est déjà en retrait, ici ou chez un compte relié.
          insert into public.inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
          select v_jum.compte, v_jum.fiche, v_jum.fiche, 'probable', 'proposee', 'copie_non_prouvee',
                 jsonb_build_object(
                   'job', x.id, 'annonce_id', ap.id, 'platform', x.platform,
                   'url', coalesce(nullif(btrim(coalesce(ap.url, '')), ''), nullif(btrim(coalesce(x.listing_url, '')), '')),
                   'titre', coalesce(nullif(btrim(coalesce(ap.titre, '')), ''), nullif(btrim(coalesce(x.title, '')), '')),
                   'vendu_sur', null,
                   'rattachement', x.platform_fields -> 'rattachement',
                   'rattachement_automatique', c.motif_refus = 'rattachement_non_confirme',
                   'doute', c.motif_refus,
                   'retrait_partout', v_marque),
                 'retrait_partout_compte_relie'
            from public.cross_post_jobs x
            join lateral (
              select a.id, a.url, a.titre from public.annonces_plateforme a
               where a.job_id = x.id and a.user_id = x.user_id
                 and a.disparu_le is null and a.retiree_le is null and a.ignoree_le is null
                 and public.listing_designe(a.listing_id, x.listing_url, x.platform_listing_id)
               order by a.vu_le desc nulls last
               limit 1) ap on true
           where x.id = c.job and x.status = 'published'
             and not exists (select 1 from public.cross_post_jobs d
                              where d.user_id = x.user_id and d.inventaire_id = x.inventaire_id and d.platform = x.platform
                                and d.action = 'delete' and d.status in ('pending', 'processing', 'needs_user'))
             and not public.annonce_en_retrait_compte_relie(x.id)
          on conflict do nothing
          returning id into v_q;
          if v_q is not null then
            v_q_j := v_q_j + 1;
          else
            -- Pourquoi pas de question (tracé) ; un retrait déjà en cours de CETTE fiche compte comme fait (point 3).
            v_sans := case
              when exists (select 1 from public.cross_post_jobs d
                            where d.user_id = v_jum.compte and d.inventaire_id = v_jum.fiche and d.platform = c.platform
                              and d.action = 'delete' and d.status in ('pending', 'processing', 'needs_user'))
                   or public.annonce_en_retrait_compte_relie(c.job) then 'retrait_en_cours'
              when exists (select 1 from public.inventaire_doublons qd
                            where qd.user_id = v_jum.compte and qd.motif = 'copie_non_prouvee' and qd.preuves ->> 'job' = c.job::text) then 'deja_posee'
              when not exists (select 1 from public.annonces_plateforme a
                                where a.job_id = c.job and a.user_id = v_jum.compte
                                  and a.disparu_le is null and a.retiree_le is null and a.ignoree_le is null) then 'annonce_non_vivante'
              else 'annonce_non_designee' end;
            if v_sans = 'retrait_en_cours' then
              v_encours_j := v_encours_j + 1;
            end if;
          end if;
        end if;
        if c.motif_refus is not null then
          insert into public.usage_logs (user_id, feature, metadata)
          select v_jum.compte, 'retrait_refuse_compte_relie', jsonb_build_object(
                   'chemin', v_chemin, 'job', x.id, 'platform', x.platform, 'article_id', v_jum.fiche::text,
                   'motif', c.motif_refus, 'rattachement', x.platform_fields -> 'rattachement', 'question', v_q,
                   'sans_question', v_sans, 'de_fiche', p_fiche::text, 'de_compte', p_user)
            from public.cross_post_jobs x where x.id = c.job;
          v_refus_j := v_refus_j + 1;
          continue;
        end if;

        r := public.armer_retrait_copie_reliee(c.job, v_chemin, v_pose,
               jsonb_build_object('de_fiche', p_fiche::text, 'de_compte', p_user));
        if r ->> 'statut' = 'arme' then
          v_armes_j := v_armes_j + 1;
          v_pl_j := v_pl_j || c.platform;
        elsif r ->> 'statut' = 'deja' then
          v_deja_j := v_deja_j + 1;
        elsif r ->> 'statut' = 'refus' then
          insert into public.usage_logs (user_id, feature, metadata)
          values (v_jum.compte, 'retrait_refuse_compte_relie', jsonb_build_object(
            'chemin', v_chemin, 'job', c.job, 'platform', c.platform, 'article_id', v_jum.fiche::text,
            'motif', r ->> 'motif', 'de_fiche', p_fiche::text, 'de_compte', p_user));
          v_refus_j := v_refus_j + 1;
          -- La MÊME annonce, déjà en retrait chez l'autre compte : elle part (point 3 : c'est fait).
          if r ->> 'motif' = 'annonce_en_retrait_compte_relie' then
            v_encours_j := v_encours_j + 1;
          end if;
        elsif r ->> 'statut' = 'verrou' then
          v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'retrait', 'job', c.job, 'platform', c.platform, 'erreur', 'verrou'));
        end if;
      exception when others then
        -- Une copie qui échoue n'empêche jamais les autres (ni la suppression de l'article) : la cause est tracée.
        get stacked diagnostics v_err = message_text;
        raise warning 'armer_retraits_fiche_liee (fiche %, dépôt %) : %', v_jum.fiche, c.job, v_err;
        v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'retrait', 'job', c.job, 'platform', c.platform, 'erreur', left(v_err, 300)));
      end;
    end loop;

    -- (b) Ce qui attend chez la jumelle, sur les plateformes partagées. Lu SANS verrou ; une tâche en cours n'est jamais
    --     verrouillée ni écrite ; les autres sont prises une à une en SKIP LOCKED (tenue ailleurs : laissée, nommée).
    for t in
      select x.id, x.platform, coalesce(x.action, 'publish') as action, x.status, x.error, x.platform_listing_id, x.listing_url,
             coalesce(x.platform_fields, '{}'::jsonb) as pf
        from public.cross_post_jobs x
       where x.user_id = v_jum.compte and x.inventaire_id = v_jum.fiche
         and coalesce(x.action, 'publish') in ('publish', 'republish')
         and x.status in ('pending', 'processing', 'needs_user', 'failed')
       order by x.created_at, x.id
    loop
      if not (t.platform = any(v_part)) then
        v_hp_j := v_hp_j + 1;
        continue;
      end if;
      if t.platform = any(v_doute_j) then
        -- (relecture finale, point 4) La plateforme d'un doute : rien n'y est annulé ; la tâche est nommée au bilan.
        v_gard_j := v_gard_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status));
        continue;
      end if;
      v_avec_num := nullif(btrim(coalesce(t.listing_url, '')), '') is not null
                    or nullif(btrim(coalesce(t.platform_listing_id, '')), '') is not null;
      if t.status = 'processing' then
        -- Le format que lit le filet d'update-job-status (_shared/publication-apres-retrait.js, B) : { job, motif en_cours }.
        v_lais_j := v_lais_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status, 'motif', 'en_cours'));
        continue;
      end if;
      if clock_timestamp() - v_debut > v_budget then
        v_lais_j := v_lais_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status, 'motif', 'budget'));
        v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'taches_en_attente', 'job', t.id, 'erreur', 'budget'));
        continue;
      end if;
      begin
        perform 1 from public.cross_post_jobs y where y.id = t.id and y.status = t.status for update skip locked;
        if not found then
          v_lais_j := v_lais_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status, 'motif', 'verrouillee'));
          v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'taches_en_attente', 'job', t.id, 'erreur', 'verrou'));
          continue;
        end if;
        v_pf := t.pf
          || jsonb_build_object('arret_utilisateur', v_le,
               'needsUserAttempts', greatest(99, case when (t.pf ->> 'needsUserAttempts') ~ '^[0-9]{1,9}$' then (t.pf ->> 'needsUserAttempts')::integer else 0 end),
               'retrait_partout_compte_relie', v_marque || jsonb_build_object('statut_avant', t.status))
          || case when nullif(btrim(coalesce(t.error, '')), '') is not null
                  then jsonb_build_object('erreurs_archivees', (case when jsonb_typeof(t.pf -> 'erreurs_archivees') = 'array' then t.pf -> 'erreurs_archivees' else '[]'::jsonb end)
                         || jsonb_build_array(jsonb_build_object('le', now(), 'statut', t.status, 'erreur', left(t.error, 600), 'par', v_pose)))
                  else '{}'::jsonb end;
        if t.action = 'publish' then
          -- Publication en attente, qui attend un geste, ou échouée (TOUTES, décision 6) : l'annulation de « Ta file ». Une
          -- tâche qui porte déjà un lien ou un numéro (une annonce a pu partir) est annulée aussi, avec un message vrai, et
          -- nommée au bilan (annulees_avec_numero) : rien ne la relance, la personne vérifie.
          v_msg := case when v_avec_num
                        then 'Annulée : article retiré partout depuis ton autre compte — vérifie qu''aucune annonce n''est restée en ligne.'
                        else 'Annulée à ta demande — rien n''a été publié.' end;
          update public.cross_post_jobs
             set status = 'cancelled', error = v_msg,
                 platform_fields = v_pf || jsonb_build_object('annulee_dans_la_file', jsonb_build_object('le', v_le, 'par', v_pose))
           where id = t.id and status = t.status;
          get diagnostics v_n = row_count;
          v_pub_j := v_pub_j + v_n;
          if t.status = 'failed' then v_ech_j := v_ech_j + v_n; end if;
          if v_avec_num and v_n > 0 then
            v_num_j := v_num_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'statut_avant', t.status));
          end if;
        else
          v_pf := v_pf || jsonb_build_object('hors_quota', true);
          v_supprime := public.republication_retrait_engage(t.pf);
          -- Le retrait de CETTE annonce (même compte, même plateforme, même numéro — jamais un titre), armé à l'instant
          -- ou déjà là (la lecture de get-pending-jobs : retrait en attente, en cours ou fait, des 30 derniers jours).
          select d.id, coalesce(nullif(btrim(d.platform_listing_id), ''), public.annonce_id_de_job(d.platform_listing_id, d.listing_url)) as numero
            into v_retrait
            from public.cross_post_jobs d
           where d.user_id = v_jum.compte and d.platform = t.platform
             and d.action = 'delete' and d.status in ('pending', 'processing', 'needs_user', 'deleted')
             and d.created_at > now() - interval '30 days'
             and public.listing_designe(public.annonce_id_de_job(t.platform_listing_id, t.listing_url), d.listing_url, d.platform_listing_id)
           order by d.created_at desc
           limit 1;
          if v_supprime then
            -- (décision 2) Republication ENGAGÉE dont l'ancienne annonce est supprimée (ou sa suppression partie) : elle
            -- s'arrête là, la nouvelle ne part pas.
            update public.cross_post_jobs
               set status = 'cancelled',
                   error = 'Annulée : article retiré partout depuis ton autre compte — l''ancienne annonce est supprimée, la nouvelle ne sera pas publiée.',
                   platform_fields = v_pf || jsonb_build_object('republication_arretee_retrait_partout', jsonb_build_object(
                     'le', v_le, 'etape', coalesce(t.pf ->> 'republish_step', ''), 'par', v_pose))
             where id = t.id and status = t.status;
          elsif v_retrait.id is not null then
            update public.cross_post_jobs
               set status = 'cancelled',
                   error = 'Annonce retirée à ta demande : cette republication n''a plus d''objet. Rien n''a été retiré par elle, rien n''a été recréé.',
                   platform_fields = v_pf || jsonb_build_object('republication_retrait_demande', jsonb_build_object(
                     'le', v_le, 'retrait', v_retrait.id::text, 'annonce', coalesce(v_retrait.numero, ''), 'par', v_pose))
             where id = t.id and status = t.status;
          else
            update public.cross_post_jobs
               set status = 'cancelled', error = 'Annulée à ta demande — ton annonce est restée en ligne.',
                   platform_fields = v_pf || jsonb_build_object('annulee_dans_la_file', jsonb_build_object('le', v_le, 'par', v_pose))
             where id = t.id and status = t.status;
          end if;
          get diagnostics v_n = row_count;
          v_repub_j := v_repub_j + v_n;
          if coalesce(t.pf ->> 'republish_step', '') not in ('', 'a_capturer') or v_supprime then v_eng_j := v_eng_j + v_n; end if;
          if t.status = 'failed' then v_ech_j := v_ech_j + v_n; end if;
        end if;
        if v_n = 0 then
          v_lais_j := v_lais_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status, 'motif', 'changee_pendant_le_geste'));
        end if;
      exception when others then
        -- Une tâche qui échoue n'empêche jamais les autres : elle est laissée, nommée, la cause tracée.
        get stacked diagnostics v_err = message_text;
        raise warning 'armer_retraits_fiche_liee (fiche %, tâche %) : %', v_jum.fiche, t.id, v_err;
        v_lais_j := v_lais_j || jsonb_build_array(jsonb_build_object('job', t.id, 'platform', t.platform, 'action', t.action, 'statut', t.status, 'motif', 'erreur'));
        v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'taches_en_attente', 'job', t.id, 'erreur', left(v_err, 300)));
      end;
    end loop;

    -- (c) Les remises en vente des plateformes partagées : plus rien à faire, et une remise close ne revient pas en
    --     attente. SKIP LOCKED : une ligne tenue ailleurs reste, tracée.
    if clock_timestamp() - v_debut > v_budget then
      v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'remises_en_vente', 'erreur', 'budget'));
    else
      begin
        update public.remises_en_vente r
           set statut = 'abandonnee', motif = 'retrait_partout_compte_relie', traite_le = now()
         where r.id in (select y.id from public.remises_en_vente y
                         where y.user_id = v_jum.compte and y.inventaire_id = v_jum.fiche and y.statut = 'a_faire'
                           and y.platform = any(v_part) and not (y.platform = any(v_doute_j))
                         for update skip locked);
        get diagnostics v_rem_j = row_count;
        select count(*) into v_restent from public.remises_en_vente y
         where y.user_id = v_jum.compte and y.inventaire_id = v_jum.fiche and y.statut = 'a_faire' and y.platform = any(v_part)
           and not (y.platform = any(v_doute_j));
        if v_restent > 0 then
          v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'remises_en_vente', 'erreur', 'verrou', 'restent', v_restent));
        end if;
        if 'leboncoin' = any(v_part) and not ('leboncoin' = any(v_doute_j)) then
          update public.cross_post_jobs x
             set platform_fields = coalesce(x.platform_fields, '{}'::jsonb)
                   || jsonb_build_object('arret_utilisateur', v_le, 'retrait_partout_compte_relie', v_marque || jsonb_build_object('statut_avant', x.status))
           where x.id in (select y.id from public.cross_post_jobs y
                           where y.user_id = v_jum.compte and y.inventaire_id = v_jum.fiche
                             and y.platform = 'leboncoin' and coalesce(y.action, 'publish') = 'publish'
                             and y.status in ('cancelled', 'failed')
                             and coalesce(y.platform_fields, '{}'::jsonb) ? 'remise_en_vente'
                             and not (coalesce(y.platform_fields, '{}'::jsonb) ? 'arret_utilisateur')
                             and y.created_at > now() - interval '14 days'
                           for update skip locked);
          get diagnostics v_mar_j = row_count;
        end if;
      exception when others then
        get stacked diagnostics v_err = message_text;
        raise warning 'armer_retraits_fiche_liee (fiche %, remises en vente) : %', v_jum.fiche, v_err;
        v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'remises_en_vente', 'erreur', left(v_err, 300)));
        v_rem_j := 0; v_mar_j := 0;
      end;
    end if;

    -- (d) La marque de la jumelle (décision 4) : posée une fois, jamais réécrite — et SEULEMENT si quelque chose a été fait
    --     (relecture finale, point 3) : un retrait armé ou déjà en cours, une publication ou republication annulée, une
    --     remise close. Une question, un refus, un budget dépassé ne sont pas « retirée partout » (le bilan les dit).
    v_marque_neuve := false;
    v_fait := v_armes_j + v_deja_j + v_encours_j + v_pub_j + v_repub_j + v_rem_j > 0;
    begin
      if v_fait then
        insert into public.jumelles_retirees_partout (user_id, inventaire_id, de_compte, de_fiche, chemin, plateformes)
        values (v_jum.compte, v_jum.fiche, p_user, p_fiche, v_chemin, v_part)
        on conflict (user_id, inventaire_id) do nothing;
        get diagnostics v_n = row_count;
        v_marque_neuve := v_n > 0;
      end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      raise warning 'armer_retraits_fiche_liee (fiche %, marque) : %', v_jum.fiche, v_err;
      v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'marque', 'erreur', left(v_err, 300)));
    end;

    -- (e) Le journal, chez le compte relié : la même ligne que les autres chemins de retrait, puis le bilan du geste — que
    --     le filet d'update-job-status lit (taches_laissees : { job, … }) et la règle A de handler-watch (article_id).
    begin
      if v_armes_j > 0 then
        insert into public.usage_logs (user_id, feature, metadata)
        values (v_jum.compte, 'retrait_annonces', jsonb_build_object(
          'chemin', v_chemin,
          'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl_j) as p),
          'n_annonces', v_armes_j, 'n_articles', 1, 'article_id', v_jum.fiche::text,
          'de_fiche', p_fiche::text, 'de_compte', p_user,
          'publications_annulees', v_pub_j + v_repub_j));
      end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      raise warning 'armer_retraits_fiche_liee (fiche %, journal) : %', v_jum.fiche, v_err;
      v_err_j := v_err_j || jsonb_build_array(jsonb_build_object('etape', 'journal', 'erreur', left(v_err, 300)));
    end;
    begin
      if v_marque_neuve or v_armes_j + v_refus_j + v_q_j + v_pub_j + v_repub_j + v_rem_j + v_mar_j + v_hp_j
                           + jsonb_array_length(v_lais_j) + jsonb_array_length(v_gard_j) + jsonb_array_length(v_err_j) > 0 then
        insert into public.usage_logs (user_id, feature, metadata)
        values (v_jum.compte, 'retrait_partout_compte_relie', jsonb_build_object(
          'chemin', v_chemin, 'article_id', v_jum.fiche::text, 'de_fiche', p_fiche::text, 'de_compte', p_user,
          'plateformes_partagees', to_jsonb(v_part),
          'retraits', v_armes_j, 'refus', v_refus_j, 'questions', v_q_j, 'deja', v_deja_j,
          'publications_annulees', v_pub_j, 'republications_annulees', v_repub_j,
          'republications_engagees_annulees', v_eng_j, 'echouees_annulees', v_ech_j,
          'remises_closes', v_rem_j, 'remises_marquees', v_mar_j, 'hors_portee', v_hp_j,
          'plateformes_en_doute', to_jsonb(v_doute_j), 'taches_gardees_doute', v_gard_j, 'retrait_en_cours', v_encours_j,
          'retiree_partout', v_fait, 'marque', v_marque_neuve,
          'taches_laissees', v_lais_j, 'annulees_avec_numero', v_num_j, 'erreurs', v_err_j,
          'attente_avant_ms', round(extract(epoch from v_entree - v_debut) * 1000),
          'duree_ms', round(extract(epoch from clock_timestamp() - v_debut) * 1000)));
      end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      raise warning 'armer_retraits_fiche_liee (fiche %, bilan) : %', v_jum.fiche, v_err;
    end;

    perform set_config('request.jwt.claims', coalesce(v_jwt, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

    v_armes := v_armes + v_armes_j; v_pl := v_pl || v_pl_j; v_refus := v_refus + v_refus_j; v_questions := v_questions + v_q_j;
    v_deja := v_deja + v_deja_j; v_pub := v_pub + v_pub_j; v_repub := v_repub + v_repub_j;
    v_remises := v_remises + v_rem_j; v_marquees := v_marquees + v_mar_j;
    v_laissees := v_laissees || v_lais_j; v_erreurs := v_erreurs || v_err_j;
  end loop;

  return jsonb_build_object('jumelles', v_jumelles, 'hors_portee', v_hors, 'armes', v_armes, 'plateformes', to_jsonb(v_pl),
    'refus', v_refus, 'questions', v_questions, 'deja', v_deja, 'publications_annulees', v_pub, 'republications_annulees', v_repub,
    'remises_closes', v_remises, 'remises_marquees', v_marquees, 'taches_laissees', v_laissees, 'erreurs', v_erreurs,
    'attente_avant_ms', round(extract(epoch from v_entree - v_debut) * 1000),
    'duree_ms', round(extract(epoch from clock_timestamp() - v_debut) * 1000));
end;
$function$;

-- ── 5. LE DÉCLENCHEUR : à la suppression d'une fiche qui retire au moins une de ses annonces ─────────────────────────
-- Les trois portes du filet, mot pour mot (réinitialisation, suppression en cascade, service_role). ⛔ Il ne fait
-- JAMAIS échouer la suppression (une erreur est tracée, la suppression continue) et n'écrit jamais sur la ligne en
-- cours de suppression (seulement chez la jumelle : autres lignes, autre compte).
CREATE OR REPLACE FUNCTION public.inventaire_arme_retraits_fiche_liee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return old;
  end if;
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;
  if v_role = 'service_role' then
    return old;
  end if;

  begin
    -- Tous les comptes sans fiche jumelle sortent ici : une lecture d'index, rien d'autre.
    if not exists (select 1 from public.fiches_liees_comptes f where f.fiche_a = old.id or f.fiche_b = old.id) then
      return old;
    end if;
    -- « Supprimer la fiche, laisser les annonces en ligne » marque ses dépôts : jamais une traversée.
    if exists (select 1 from public.cross_post_jobs x
                where x.user_id = old.user_id and x.inventaire_id = old.id
                  and coalesce(x.platform_fields, '{}'::jsonb) ? 'annonces_laissees_en_ligne') then
      return old;
    end if;
    -- « Partout » : la suppression retire au moins une annonce de la fiche — un retrait de cette fiche encore ouvert,
    -- armé depuis moins de 2 MINUTES (décision 3 : l'app vient de le faire, ou le filet), ou un dépôt publié que le filet
    -- arme (même lecture que lui : indépendant de l'ordre des déclencheurs).
    if exists (select 1 from public.cross_post_jobs d
                where d.user_id = old.user_id and d.inventaire_id = old.id and d.action = 'delete'
                  and d.status in ('pending', 'processing', 'needs_user')
                  and d.created_at > now() - interval '2 minutes')
       or exists (select 1 from public.cross_post_jobs j
                   where j.user_id = old.user_id and j.inventaire_id = old.id
                     and coalesce(j.action, 'publish') in ('publish', 'republish') and j.status = 'published'
                     and nullif(btrim(j.listing_url), '') is not null
                     and not (j.platform = 'opla' and public.opla_sortie_passee())
                     and not exists (select 1 from public.cross_post_jobs d
                                      where d.user_id = old.user_id and d.inventaire_id = old.id and d.action = 'delete'
                                        and d.platform = j.platform and d.status in ('pending', 'processing', 'needs_user'))) then
      perform public.armer_retraits_fiche_liee(old.user_id, old.id, 'suppression_article_compte_relie');
    end if;
  exception when others then
    raise warning 'inventaire_arme_retraits_fiche_liee (article %) : % — suppression poursuivie', old.id, sqlerrm;
    begin
      insert into public.usage_logs (user_id, feature, metadata)
      values (old.user_id, 'retrait_partout_compte_relie_erreur', jsonb_build_object(
        'article_id', old.id::text, 'erreur', left(sqlerrm, 300)));
    exception when others then
      null;
    end;
  end;
  return old;
end;
$function$;

DROP TRIGGER IF EXISTS inventaire_arme_retraits_fiche_liee ON public.inventaire;
CREATE TRIGGER inventaire_arme_retraits_fiche_liee
  BEFORE DELETE ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_arme_retraits_fiche_liee();

-- ── 6. LA RÉPONSE À LA QUESTION POSÉE AU COMPTE RELIÉ (décision 5) ────────────────────────────────────────────────
-- L'app (prochaine OTA) l'appelle pour une question copie_non_prouvee de source « retrait_partout_compte_relie » ; la
-- réponse est celle de la personne, sur SA session (auth.uid() = le compte de la question). « Non » : jamais reposée.
-- « Oui » sur l'annonce MONTRÉE : le geste prouve que c'est le même article (rattachement 'utilisateur',
-- meme_article_confirme, comme le « Oui » de la vente), puis le retrait de CETTE annonce, toutes les gardes de la
-- traversée comprises ; sans retrait armé, rien n'est écrit et la question reste ouverte. La jumelle VENDUE entre-temps :
-- c'est la question de la vente (inventaire_doublon_decider_corps, appelée telle quelle).
CREATE OR REPLACE FUNCTION public.copie_retrait_partout_repondre(p_id uuid, p_decision text, p_annonce_montree uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user uuid := auth.uid();
  d      public.inventaire_doublons%rowtype;
  v_job  uuid;
  r      jsonb;
  v_del  uuid;
  v_detail text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  select * into d from public.inventaire_doublons where id = p_id and user_id = v_user for update;
  if d.id is null then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;
  if d.motif is distinct from 'copie_non_prouvee' or coalesce(d.source, '') not like 'retrait_partout_compte_relie%' then
    return jsonb_build_object('ok', false, 'reason', 'autre_question');
  end if;
  if d.statut <> 'proposee' then
    return jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut);
  end if;
  if exists (select 1 from public.inventaire i where i.id = d.garde and i.user_id = v_user and i.statut = 'vendu') then
    return public.inventaire_doublon_decider_corps(v_user, p_id, p_decision, p_annonce_montree);
  end if;
  if p_decision = 'non' then
    update public.inventaire_doublons set statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' where id = d.id;
    return jsonb_build_object('ok', true, 'decision', 'non');
  elsif p_decision is distinct from 'oui' then
    return jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
  end if;
  -- jamais un retrait sur une annonce que l'écran n'a pas montrée
  if p_annonce_montree is null or p_annonce_montree::text is distinct from (d.preuves ->> 'annonce_id') then
    return jsonb_build_object('ok', false, 'reason', 'annonce_non_montree');
  end if;
  v_job := nullif(d.preuves ->> 'job', '')::uuid;
  if v_job is null
     or not exists (select 1 from public.inventaire i where i.id = d.garde and i.user_id = v_user and i.fusionne_dans is null)
     or not exists (select 1 from public.cross_post_jobs j
                     where j.id = v_job and j.user_id = v_user and j.inventaire_id = d.garde
                       and j.status = 'published' and coalesce(j.action, 'publish') in ('publish', 'republish'))
     or not exists (select 1 from public.annonces_plateforme a, public.cross_post_jobs j
                     where a.id = p_annonce_montree and a.user_id = v_user and a.job_id = v_job and j.id = v_job
                       and a.disparu_le is null and a.retiree_le is null and a.ignoree_le is null
                       -- (relecture finale, point 5) l'annonce montrée porte le NUMÉRO que le « Oui » retirerait
                       and public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)) then
    update public.inventaire_doublons set statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' where id = d.id;
    return jsonb_build_object('ok', false, 'reason', 'sans_objet');
  end if;
  begin
    update public.cross_post_jobs
       set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('rattachement',
             coalesce(platform_fields -> 'rattachement', '{}'::jsonb) || jsonb_build_object(
               'par', 'utilisateur', 'motif', 'meme_article_confirme',
               'confirme', jsonb_build_object('question', d.id, 'le', now(),
                 'avant', jsonb_build_object('par', platform_fields #> '{rattachement,par}',
                                             'motif', platform_fields #> '{rattachement,motif}'))))
     where id = v_job;
    r := public.armer_retrait_copie_reliee(v_job, 'copie_confirmee_retrait_partout', 'copie_retrait_partout_repondre (geste de la personne)',
           jsonb_build_object('question', d.id, 'de_fiche', d.preuves #>> '{retrait_partout,de_fiche}', 'de_compte', d.preuves #>> '{retrait_partout,de_compte}'));
    if r ->> 'statut' = 'arme' then
      v_del := (r ->> 'retrait')::uuid;
    elsif r ->> 'statut' = 'deja' then
      select dj.id into v_del from public.cross_post_jobs j, public.cross_post_jobs dj
       where j.id = v_job and dj.user_id = j.user_id and dj.inventaire_id = j.inventaire_id and dj.platform = j.platform
         and dj.action = 'delete' and dj.status in ('pending', 'processing', 'needs_user')
         and public.listing_designe(public.annonce_id_de_job(j.platform_listing_id, j.listing_url), dj.listing_url, dj.platform_listing_id)
       order by dj.created_at limit 1;
    end if;
    if v_del is null then
      raise exception using errcode = 'P0R02', message = 'retrait_impossible', detail = coalesce(r ->> 'motif', r ->> 'statut', '');
    end if;
    update public.inventaire_doublons
       set statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
           preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del)
     where id = d.id;
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_user, 'retrait_annonces', jsonb_build_object(
      'chemin', 'copie_confirmee_retrait_partout', 'plateformes', jsonb_build_array(d.preuves ->> 'platform'),
      'n_annonces', 1, 'n_articles', 1, 'article_id', d.garde::text, 'question', d.id));
    return jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'retrait', v_del, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
  exception when sqlstate 'P0R02' then
    -- rattachement et retrait annulés ; la question reste ouverte
    get stacked diagnostics v_detail = pg_exception_detail;
    return jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui', 'motif', v_detail,
                              'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
  end;
end;
$function$;

-- ── 7. LES DROITS : le serveur seulement, sauf la réponse de la personne (sa session) ────────────────────────────────
REVOKE ALL ON FUNCTION public.copies_fiche_liee(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.annonce_en_retrait_compte_relie(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.armer_retrait_copie_reliee(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.armer_retraits_fiche_liee(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventaire_arme_retraits_fiche_liee() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copie_retrait_partout_repondre(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copies_fiche_liee(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.annonce_en_retrait_compte_relie(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.armer_retrait_copie_reliee(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.armer_retraits_fiche_liee(uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventaire_arme_retraits_fiche_liee() TO service_role;
GRANT EXECUTE ON FUNCTION public.copie_retrait_partout_repondre(uuid, text, uuid) TO authenticated, service_role;

RESET lock_timeout;
