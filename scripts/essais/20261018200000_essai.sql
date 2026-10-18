-- Essai à blanc de 20261018200000 (18/10) : tout est annulé (ROLLBACK). npx supabase db query --linked -f scripts/essais/20261018200000_essai.sql
begin;
create temp table _r (essai text, ok boolean);
-- ═══════════════════════════════════════════════════════════════════════════
-- UNE BOUTIQUE = UN COMPTE FILLSELL ; DEUX COMPTES D'UNE MÊME PERSONNE RELIÉS (18/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis : louis@ttfamily.fr suivait ses DEUX boutiques Vinted (@neyenonie PRO,
-- @evat PERSO) ; son 2e compte louis-seller@ttfamily.fr a importé @evat (252
-- fiches, dont 212 déjà suivies par le 1er) et le Leboncoin du 1er (323 annonces).
-- Chaque vente @evat partait deux fois (mails vente:2682 et vente:2701).
-- Décisions de Nico (18/10) : chaque boutique (Vinted, Beebs, eBay, Leboncoin) à
-- UN seul compte, pour tout le parc ; les deux comptes de Louis RELIÉS : une vente
-- prouvée d'un côté retire les copies de la même fiche de l'autre côté.
--
-- 1. Registre `boutiques_plateforme` (platform, compte_ref) → user_id, serveur seul
--    (RLS, aucun accès client). Rempli avec les boutiques Vinted dont UN SEUL compte
--    a la boutique dans son pin ; une boutique déjà présente chez plusieurs comptes
--    (8 aujourd'hui) n'est PAS attribuée d'office : le doute devient une question.
-- 2. Une boutique déjà attribuée à un autre compte : jamais ajoutée au pin
--    (déclencheur sur profiles), jamais « confirmée » (boutique_vinted_confirmee),
--    aucun article importé (inventaire_ecarte_import_sync lève
--    [boutique_a_confirmer][boutique_autre_compte]), aucune vente enregistrée
--    (enregistrer_ventes_relevees rend motif boutique_autre_compte, 0 mail).
--    Une boutique libre ajoutée au pin est inscrite au registre ; retirée du pin
--    par son propriétaire, elle est libérée.
-- 3. Leboncoin, Beebs, Depop, eBay (relevés d'annonces) : une annonce déjà suivie
--    EN LIGNE par un autre compte n'est pas importée (annonces_plateforme, avant
--    insertion) — trace dans sync_import_ecartes (motif autre_compte:<plateforme>).
-- 4. eBay : un compte eBay relié (non révoqué) à un seul compte FillSell (index
--    unique ; le refus lisible est dans ebay-oauth-callback).
-- 5. Comptes reliés (`comptes_lies`) et fiches jumelles (`fiches_liees_comptes`) :
--    une fiche qui devient vendue rend sa jumelle de l'autre compte vendue — ce
--    qui arme, par le circuit existant (inventaire_vendu_retire_ses_copies), le
--    retrait de SES copies (Leboncoin, Beebs, Vinted). Une vente annulée rend la
--    jumelle disponible et annule ses retraits encore en file. Le filet
--    fillsell.sans_retrait='1' est respecté.
-- Inverse : supabase/rollbacks/20261018200000_une_boutique_un_compte_comptes_lies_INVERSE.sql

-- ── 1. Registre ─────────────────────────────────────────────────────────────
create table if not exists public.boutiques_plateforme (
  platform   text not null,
  compte_ref text not null,
  user_id    uuid not null,
  depuis     timestamptz not null default now(),
  source     text not null,
  primary key (platform, compte_ref)
);
create index if not exists boutiques_plateforme_user_idx on public.boutiques_plateforme (user_id);
alter table public.boutiques_plateforme enable row level security;
revoke all on public.boutiques_plateforme from anon, authenticated;

insert into public.boutiques_plateforme (platform, compte_ref, user_id, source)
select 'vinted', b.ref, min(b.uid::text)::uuid, 'pin_unique_1810'
from (
  select p.id as uid, btrim(x ->> 'user_id') as ref
  from public.profiles p,
       lateral jsonb_array_elements(case when jsonb_typeof(p.vinted_sync_pin -> 'boutiques') = 'array'
                                         then p.vinted_sync_pin -> 'boutiques' else '[]'::jsonb end) x
  where p.vinted_sync_pin ->> 'v' = '2' and nullif(btrim(x ->> 'user_id'), '') is not null
) b
group by b.ref
having count(distinct b.uid) = 1
on conflict (platform, compte_ref) do nothing;

create or replace function public.boutique_proprietaire(p_platform text, p_ref text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select r.user_id from public.boutiques_plateforme r
   where r.platform = lower(btrim(coalesce(p_platform, ''))) and r.compte_ref = btrim(coalesce(p_ref, ''))
$$;
revoke all on function public.boutique_proprietaire(text, text) from anon;

create or replace function public.boutique_vinted_autre_compte(p_user uuid, p_boutique text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select nullif(btrim(coalesce(p_boutique, '')), '') is not null and exists (
    select 1 from public.boutiques_plateforme r
     where r.platform = 'vinted' and r.compte_ref = btrim(p_boutique) and r.user_id is distinct from p_user)
$$;
revoke all on function public.boutique_vinted_autre_compte(uuid, text) from anon;

-- ── 2. Confirmation, import, ventes (réécrites depuis la prod) ─────────────
CREATE OR REPLACE FUNCTION public.boutique_vinted_confirmee(p_user uuid, p_boutique text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT nullif(btrim(p_boutique),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles p,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.vinted_sync_pin->'boutiques')='array'
        THEN p.vinted_sync_pin->'boutiques' ELSE '[]'::jsonb END) b
    WHERE p.id=p_user AND p.vinted_sync_pin->>'v'='2' AND b->>'user_id'=btrim(p_boutique))
    -- (18/10, Louis) une boutique n'appartient qu'à UN compte FillSell
    AND NOT public.boutique_vinted_autre_compte(p_user, p_boutique);
$function$;

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

  -- (08/10 soir) Une fiche du dressing qui LÂCHE son annonce Vinted n'importe
  -- rien : c'est la fusion qui fait passer l'identité Vinted à la fiche gardée
  -- (inventaire_fusionner_pour vide d'abord vinted_item_id ET vinted_account_id
  -- de la fiche fondue). Cette garde y voyait une boutique non confirmée et
  -- refusait la fusion : plus AUCUNE fusion déplaçant l'identité Vinted n'a
  -- abouti depuis le 28/09 (208 le 25/09, 0 depuis), à la main comme par le
  -- moteur. Seule cette écriture-là passe ; tout le reste est inchangé.
  if TG_OP = 'UPDATE' and new.vinted_item_id is null then
    return new;
  end if;

  -- Le contrôle précède aussi l'upsert : une ligne historique étrangère
  -- n'autorise pas un nouveau relevé. Lecture du profil par sa clé primaire.
  -- (18/10, Louis) Une boutique n'appartient qu'à UN compte FillSell : déjà suivie ailleurs,
  -- rien n'est importé ici. L'ancien marqueur reste en tête pour que les extensions d'avant
  -- s'arrêtent sans réessayer ; [boutique_autre_compte] dit la vraie raison à l'app.
  if public.boutique_vinted_autre_compte(new.user_id, new.vinted_account_id) then
    raise exception '[boutique_a_confirmer][boutique_autre_compte] Cette boutique Vinted est déjà suivie par un autre compte FillSell. Rien n’a été importé et rien n’a changé sur Vinted : une boutique se suit sur un seul compte.';
  end if;
  if not boutique_vinted_confirmee(new.user_id,new.vinted_account_id) then
    raise exception '[boutique_a_confirmer] Cette boutique Vinted n’est pas confirmée sur ton compte FillSell. Confirme-la dans « Actualiser mon dressing » si elle t’appartient. Aucun article n’a été importé.';
  end if;
  if TG_OP='UPDATE' then return new; end if;

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

  -- (05/10, règle de Nico) Un relevé AUTOMATIQUE du dressing (veille, retrait)
  -- n'importe rien : l'article neuf attend le prochain « Synchroniser ».
  if exists (
    select 1 from vinted_sync_runs r
    where r.user_id = new.user_id and r.kind = 'dressing' and r.status = 'running'
      and not releve_est_geste(r.declencheur)
  ) then
    raise log 'inventaire_ecarte_import_sync : article % non importé (relevé automatique en cours, user %)', new.vinted_item_id, new.user_id;
    return null;
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

CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees(p_platform text, p_rows jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_row    jsonb;
  v_ref    text; v_titre text; v_prix numeric; v_devise text; v_vendu timestamptz;
  v_statut text; v_classe text; v_listing text; v_url text;
  v_frais  numeric; v_lot boolean;
  v_inv    bigint; v_bande text; v_verdict jsonb;
  v_adopte bigint; v_nb_adoptables int;
  v_insere boolean; v_cle text;
  v_pa numeric; v_pai boolean; v_pc numeric; v_benef numeric; v_pct numeric;
  v_st text; v_pv numeric;
  v_meme boolean; v_rel_id bigint; v_rel_inv bigint; v_manu bigint;
  c_recues int := 0; c_sans_ref int := 0; c_annulees int := 0; c_en_cours int := 0;
  c_creees int := 0; c_adoptees int := 0; c_deja int := 0;
  c_rattachees int := 0; c_lots int := 0; c_inv_completes int := 0;
  c_fusionnees int := 0;
  c_supprimees int := 0;
  c_autre_compte int := 0;  -- (18/10, Louis) ventes du compte relié propriétaire
  v_rel record; v_q_fiche int; v_autres_cmd boolean;
  v_nb_ventes_fiche int; v_autre_pf boolean;
  v_vente_id bigint; v_ex jsonb; c_ex_vendues int := 0; c_ex_stock int := 0; c_ex_relire int := 0;
  c_annulees_retirees int := 0; c_annulees_signalees int := 0;
  v_inconnus jsonb := '{}'::jsonb;
  -- (17/10, lots Vinted — point 11)
  v_ex_lot jsonb; c_compositions int := 0; c_lots_eclates int := 0; c_lots_a_reparer int := 0; c_lots_en_doute int := 0;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla','depop') THEN
    RAISE EXCEPTION 'plateforme non relevable: %', coalesce(p_platform,'(null)');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;

  -- (18/10, Louis — une boutique = un compte) Les ventes Vinted lues par une session ouverte sur
  -- une boutique qui appartient à UN AUTRE compte FillSell ne s'enregistrent pas ici : ni vente,
  -- ni mail (louis@ttfamily.fr relevait la boutique de louis-seller : vente:2682 ET vente:2701).
  -- Identité inconnue ou trop vieille : comportement d'avant.
  IF p_platform = 'vinted'
     AND public.boutique_vinted_autre_compte(v_user, public.republish_boutique_connectee(v_user) ->> 'user_id') THEN
    RETURN jsonb_build_object('plateforme', p_platform, 'recues', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
      'creees', 0, 'refusees', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 'motif', 'boutique_autre_compte');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    c_recues := c_recues + 1;
    v_ref     := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    v_statut  := coalesce(v_row ->> 'statut', '');
    v_titre   := nullif(btrim(coalesce(v_row ->> 'titre', '')), '');
    v_prix    := nullif(v_row ->> 'prix', '')::numeric;
    v_devise  := nullif(btrim(coalesce(v_row ->> 'devise', '')), '');
    v_vendu   := nullif(v_row ->> 'vendu_le', '')::timestamptz;
    v_listing := nullif(btrim(coalesce(v_row ->> 'listing_id', '')), '');
    v_url     := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_frais   := nullif(v_row ->> 'frais', '')::numeric;
    v_lot     := coalesce((v_row ->> 'lot')::boolean, false);

    IF v_ref IS NULL THEN c_sans_ref := c_sans_ref + 1; CONTINUE; END IF;

    -- (18/10, Louis) UNE VENTE N'APPARTIENT QU'AU COMPTE PROPRIÉTAIRE : entre deux comptes RELIÉS (même
    -- personne), une commande déjà enregistrée sur l'autre compte ne l'est jamais une 2e fois (un seul mail),
    -- et une vente Leboncoin/Depop/eBay dont l'annonce n'est suivie QUE par le compte relié lui appartient.
    IF EXISTS (SELECT 1 FROM comptes_lies cl WHERE cl.user_a = v_user OR cl.user_b = v_user) THEN
      IF EXISTS (SELECT 1 FROM ventes w
                  WHERE w.plateforme_code = p_platform AND w.user_id <> v_user
                    AND split_part(w.commande_ref, ':', 1) = split_part(v_ref, ':', 1)
                    AND public.comptes_sont_lies(v_user, w.user_id)) THEN
        c_autre_compte := c_autre_compte + 1;
        CONTINUE;
      END IF;
      IF p_platform <> 'vinted' AND v_listing IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id = v_user AND a.platform = p_platform AND a.listing_id = v_listing)
         AND EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id <> v_user AND a.platform = p_platform AND a.listing_id = v_listing
                       AND public.comptes_sont_lies(v_user, a.user_id)) THEN
        c_autre_compte := c_autre_compte + 1;
        CONTINUE;
      END IF;
    END IF;

    -- (17/10, lots Vinted — point 11, Louis) LA COMPOSITION D'UNE COMMANDE VINTED : les
    -- numéros EXACTS de transaction.order.item_ids (le détail, lu par la session du
    -- vendeur), gardés quel que soit le statut — jamais le titre « Lot N articles ».
    IF p_platform = 'vinted' AND jsonb_typeof(v_row -> 'item_ids') = 'array'
       AND jsonb_array_length(v_row -> 'item_ids') >= 1 THEN
      IF public.vinted_lot_composer(v_user, v_ref, v_row -> 'item_ids', v_statut, NULL, v_prix, v_devise, v_vendu,
                                    v_row -> 'articles', 'releve') > 0 THEN
        c_compositions := c_compositions + 1;
      END IF;
    END IF;

    -- (04/10) UNE VENTE SUPPRIMÉE PAR LA PERSONNE NE REVIENT JAMAIS : même
    -- commande sur la même plateforme, ou — pour une vente supprimée qui
    -- n'avait pas de commande — même annonce.
    IF EXISTS (SELECT 1 FROM ventes_supprimees s
                WHERE s.user_id = v_user AND s.plateforme_code = p_platform
                  AND (s.commande_ref = v_ref
                       OR (s.commande_ref IS NULL AND v_listing IS NOT NULL AND s.annonce_id = v_listing))) THEN
      c_supprimees := c_supprimees + 1;
      CONTINUE;
    END IF;

    v_classe := ventes_statut_classe(p_platform, v_statut);
    IF v_classe = 'annulee' THEN
      c_annulees := c_annulees + 1;
      -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY REMBOURSÉE OU ANNULÉE APRÈS COUP :
      -- la vente née du relevé est retirée, une vente saisie seulement signalée
      -- (vente_commande_annulee) — jamais une remise en ligne, 0 mail.
      IF p_platform = 'ebay' THEN
        SELECT v.id INTO v_vente_id FROM ventes v
         WHERE v.user_id = v_user AND v.plateforme_code = 'ebay' AND v.commande_ref = v_ref LIMIT 1;
        IF v_vente_id IS NOT NULL THEN
          BEGIN
            v_ex := vente_commande_annulee(v_vente_id, v_statut);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END IF;
      END IF;
      -- (15/10, P1 — Louis) UNE COMMANDE VINTED ANNULÉE : la vente née d'une preuve
      -- est retirée, la fiche revient au stock (vente_commande_annulee_vinted).
      -- La commande se reconnaît par son numéro, ou par les numéros d'annonce
      -- qu'elle porte (lot : item_ids, extension 0.6.111) — jamais par le titre.
      IF p_platform = 'vinted' THEN
        FOR v_vente_id IN
          SELECT v.id FROM ventes v
           WHERE v.user_id = v_user AND v.plateforme_code = 'vinted'
             AND (v.commande_ref = v_ref
                  -- (17/10) les lignes d'une commande éclatée (une vente par article)
                  OR v.id IN (SELECT ca.vente_id FROM vinted_commandes_articles ca
                               WHERE ca.user_id = v_user AND ca.commande_ref = v_ref AND ca.vente_id IS NOT NULL)
                  OR (v.commande_ref IS NULL AND v.annonce_id IS NOT NULL
                      AND v.annonce_id = ANY (ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(
                            CASE WHEN v_lot THEN CASE WHEN jsonb_typeof(v_row -> 'item_ids') = 'array' THEN v_row -> 'item_ids' ELSE '[]'::jsonb END
                                 ELSE jsonb_build_array(v_listing) END) x WHERE x IS NOT NULL AND btrim(x) <> ''))
                      AND (v_vendu IS NULL OR v.created_at >= v_vendu - interval '3 days')))
           ORDER BY v.id
        LOOP
          BEGIN
            v_ex := vente_commande_annulee_vinted(v_vente_id, v_statut, v_ref, v_vendu);
            IF v_ex ->> 'action' = 'retiree' THEN c_annulees_retirees := c_annulees_retirees + 1;
            ELSIF v_ex ->> 'action' = 'signalee' THEN c_annulees_signalees := c_annulees_signalees + 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'vente_commande_annulee_vinted (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
          END;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;
    -- (17/10, R1 — point 12) Une commande Vinted ni vendue ni annulée laisse sa trace sur
    -- les ventes SANS commande qu'elle désigne par numéro (usage_logs
    -- 'vente_vinted_commande_lue', une fois) : rien d'autre n'est décidé.
    IF p_platform = 'vinted' AND v_classe NOT IN ('vente', 'annulee') THEN
      PERFORM public.vinted_commande_lue_tracer(v_user, v_ref, v_statut, v_row, v_listing);
    END IF;
    IF v_classe = 'en_cours' THEN c_en_cours := c_en_cours + 1; CONTINUE; END IF;
    IF v_classe <> 'vente' THEN
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
    END IF;

    -- (17/10, lots Vinted) Une commande déjà ÉCLATÉE (une vente par article) : la liste
    -- ne recrée jamais sa ligne d'attente.
    IF p_platform = 'vinted' AND EXISTS (SELECT 1 FROM vinted_commandes_articles ca
                                          WHERE ca.user_id = v_user AND ca.commande_ref = v_ref AND ca.eclatee_le IS NOT NULL) THEN
      c_deja := c_deja + 1;
      CONTINUE;
    END IF;
    -- (17/10) Une commande à UN article dont le détail est connu : son numéro EXACT quand la
    -- ligne n'en porte pas (la liste, ou un détail sans item_id).
    IF p_platform = 'vinted' AND v_listing IS NULL AND NOT v_lot THEN
      SELECT min(ca.item_id) INTO v_listing FROM vinted_commandes_articles ca
       WHERE ca.user_id = v_user AND ca.commande_ref = v_ref HAVING count(*) = 1;
    END IF;

    v_inv := NULL; v_bande := NULL;
    IF v_lot THEN
      c_lots := c_lots + 1;
      v_bande := 'lot';
    ELSE
      IF v_listing IS NOT NULL THEN
        IF p_platform = 'vinted' THEN
          SELECT i.id INTO v_inv FROM inventaire i
           WHERE i.user_id = v_user AND i.vinted_item_id = v_listing AND i.fusionne_dans IS NULL
           ORDER BY i.id DESC LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT ap.inventaire_id INTO v_inv FROM annonces_plateforme ap
           WHERE ap.user_id = v_user AND ap.platform = p_platform
             AND ap.listing_id = v_listing AND ap.inventaire_id IS NOT NULL
             AND public.retrait_job_prouve(ap.job_id)
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
             AND j.action IN ('publish', 'republish') AND public.retrait_job_prouve(j.id)
             AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
           ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
        END IF;
        IF v_inv IS NOT NULL THEN v_bande := 'identifiant'; END IF;
      END IF;

      IF v_inv IS NULL AND v_titre IS NOT NULL
         AND NOT coalesce((v_row ->> 'id_attendu')::boolean, false) THEN
        -- (09/10, Jocabroc) IDENTIFIANT SEULEMENT, TITRE VIDE. Seules les bandes
        -- « job » et « job_clos » sont retenues ci-dessous, et rapprocher_classer
        -- ne les rend que par l'identifiant, AVANT de lire le titre. Le titre
        -- n'ajoutait qu'une comparaison à toute la boutique dont le verdict était
        -- JETÉ : sur un gros compte, 8 s dépassées, l'appel entier annulé, aucune
        -- commande jamais écrite. Avec un titre vide la fonction s'arrête juste
        -- après ses deux recherches par identifiant : même résultat, sans le coût.
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), '', v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','job_clos') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN
      -- Même verrou que la confirmation manuelle : le relevé ne peut pas
      -- insérer une deuxième vente pendant la confirmation de la première.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_inv::text,0));
      PERFORM 1 FROM inventaire WHERE id=v_inv AND user_id=v_user FOR UPDATE;
      c_rattachees := c_rattachees + 1;
    END IF;

    v_pa := NULL; v_pai := NULL; v_pc := 0; v_benef := NULL; v_pct := NULL;
    IF v_inv IS NOT NULL THEN
      SELECT i.prix_achat, i.prix_achat_inconnu, coalesce(i.purchase_costs,0)
        INTO v_pa, v_pai, v_pc FROM inventaire i WHERE i.id = v_inv;
      IF coalesce(v_pai,false) THEN v_pa := NULL; END IF;
      IF v_pa IS NOT NULL AND v_prix IS NOT NULL THEN
        v_benef := v_prix - v_pa - v_pc - coalesce(v_frais,0);
        IF v_prix > 0 THEN v_pct := (v_benef / v_prix) * 100; END IF;
      END IF;
    END IF;

    v_adopte := NULL; v_autre_pf := false; v_vente_id := NULL;
    IF v_inv IS NOT NULL AND v_listing IS NOT NULL AND NOT v_lot THEN
      -- Un reçu lie cette vente à CET identifiant d'annonce, y compris une
      -- copie dont la confirmation est arrivée par une autre plateforme.
      SELECT v.id INTO v_adopte FROM ventes_operations o
      JOIN ventes v ON v.id=(o.resultat#>>'{ventes_ids,0}')::bigint AND v.user_id=v_user
      WHERE o.user_id=v_user AND o.inventaire_id=v_inv
        AND jsonb_array_length(o.resultat->'ventes_ids')=1
        AND (v.commande_ref IS NULL OR v.commande_ref=v_ref)
        AND (o.cle='annonce:'||p_platform||':'||v_listing OR EXISTS(
          SELECT 1 FROM cross_post_jobs j WHERE j.user_id=v_user AND j.inventaire_id=v_inv
            AND j.platform=p_platform AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
            AND j.platform_fields->>'vente_operation_cle'=o.cle))
      ORDER BY o.cree_le DESC LIMIT 1;
    END IF;
    -- (02/10 soir, point 9) La ligne que le relevé a DÉJÀ posée pour cette
    -- commande (premier temps Vinted : liste sans numéro d'annonce).
    v_rel := NULL;
    SELECT v.* INTO v_rel FROM ventes v
     WHERE v.user_id = v_user AND v.plateforme_code = p_platform AND v.commande_ref = v_ref;
    -- LA VENTE SAISIE DE LA MÊME CESSION (02/10 soir, point 9 — règle de Nico :
    -- « le relevé ne crée jamais une deuxième vente pour un article qui a déjà
    -- une vente enregistrée pour cette même cession ; il complète l'existante »).
    -- Preuve : la fiche, désignée par le NUMÉRO d'annonce (v_inv ci-dessus),
    -- porte UNE seule vente sans commande, de cette plateforme ou sans
    -- plateforme ; aucune autre commande n'y est déjà relevée ; et la fiche est
    -- à pièce unique (quantité ≤ 1, jamais une revente en plusieurs exemplaires).
    -- Jamais le titre. Sans preuve, deux lignes restent (la vente reste
    -- « à compléter », visible).
    IF v_adopte IS NULL AND v_inv IS NOT NULL AND NOT v_lot THEN
      SELECT coalesce(i.quantite, 1) INTO v_q_fiche FROM inventaire i WHERE i.id = v_inv;
      SELECT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv
                       AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref) INTO v_autres_cmd;
      SELECT count(*) INTO v_nb_adoptables FROM ventes v
       WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
         AND v.id IS DISTINCT FROM v_rel.id
         AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform;
      IF v_nb_adoptables = 1 AND NOT v_autres_cmd AND coalesce(v_q_fiche, 1) <= 1 THEN
        SELECT v.id INTO v_adopte FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
           AND v.id IS DISTINCT FROM v_rel.id
           AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform
         LIMIT 1;
      END IF;
      -- (09/10, audit eBay — XEWER, GO de Nico) LA MÊME CESSION, DÉCLARÉE SUR UNE AUTRE
      -- PLATEFORME : la commande désigne la fiche par le NUMÉRO de son annonce (v_inv),
      -- la fiche est ÉPUISÉE (quantité 0 : jamais une revente en plusieurs exemplaires,
      -- une vente partielle laisse une quantité) et porte UNE SEULE vente, sans
      -- commande, d'une autre plateforme → la commande s'y fond (sa plateforme, sa date
      -- réelle) ; la saisie de la personne prime pour le reste.
      IF v_adopte IS NULL AND coalesce(v_q_fiche, 1) <= 0 AND NOT v_autres_cmd AND v_rel.id IS NULL THEN
        SELECT count(*) INTO v_nb_ventes_fiche FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv;
        IF v_nb_ventes_fiche = 1 THEN
          SELECT v.id INTO v_adopte FROM ventes v
           WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
             AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), '') <> p_platform;
          IF v_adopte IS NOT NULL THEN
            v_autre_pf := true;
            INSERT INTO usage_logs (user_id, feature, metadata)
            VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
              'gardee', v_adopte, 'motif', 'meme_cession_autre_plateforme', 'plateforme', p_platform,
              'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
              'avant', (SELECT to_jsonb(v) FROM ventes v WHERE v.id = v_adopte), 'par', 'enregistrer_ventes_relevees'));
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- (02/10 soir, point 9) CE QUE LA PERSONNE A SAISI PRIME : prix de vente,
      -- prix d'achat, date et bénéfice saisis ne bougent pas ; le relevé ne
      -- remplit que ce qui est vide (date réelle vendu_le, plateforme, commande,
      -- numéro d'annonce, frais). La ligne que le relevé avait posée pour cette
      -- commande est FUSIONNÉE dans la vente gardée (trace complète dans
      -- usage_logs 'vente_fusionnee'), puis supprimée — AVANT de poser la
      -- commande sur la vente gardée : plus jamais la collision 23505 qui
      -- faisait échouer tout le relevé.
      IF v_rel.id IS NOT NULL AND v_rel.id <> v_adopte THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
          'gardee', v_adopte, 'fusionnee', to_jsonb(v_rel), 'motif', 'releve_dans_vente_saisie',
          'plateforme', p_platform, 'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
          'par', 'enregistrer_ventes_relevees'));
        DELETE FROM ventes WHERE id = v_rel.id AND user_id = v_user;
        c_fusionnees := c_fusionnees + 1;
      END IF;
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = CASE WHEN v_autre_pf THEN p_platform ELSE coalesce(v.plateforme, p_platform) END,
        vendu_le           = coalesce(v.vendu_le, v_vendu, v_rel.vendu_le),
        date               = coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_rel.date),
        prix_vente         = coalesce(v.prix_vente, v_prix, v_rel.prix_vente),
        prix_achat         = coalesce(v.prix_achat, v_pa),
        benefice           = coalesce(v.benefice,
                               CASE WHEN coalesce(v.prix_vente, v_prix) IS NOT NULL AND coalesce(v.prix_achat, v_pa) IS NOT NULL
                                    THEN coalesce(v.prix_vente, v_prix) - coalesce(v.prix_achat, v_pa) - v_pc
                                         - coalesce(v.frais_plateforme, v_frais, 0) END),
        devise             = coalesce(v.devise, v_devise, v_rel.devise),
        frais_plateforme   = coalesce(v.frais_plateforme, v_frais, v_rel.frais_plateforme),
        titre              = coalesce(nullif(btrim(v.titre),''), v_titre),
        inventaire_id      = coalesce(v.inventaire_id, v_inv),
        annonce_id         = coalesce(v.annonce_id, v_listing),
        releve_le          = now()
      WHERE v.id = v_adopte;
      c_adoptees := c_adoptees + 1;
      v_vente_id := v_adopte;
    ELSE
      INSERT INTO ventes (
        user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le,
        plateforme, plateforme_code, plateforme_origine, commande_ref,
        source, releve_le, devise, frais_plateforme, selling_fees,
        inventaire_id, quantite, statut, annonce_id
      ) VALUES (
        v_user, v_titre, v_prix, v_pa, v_benef,
        (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_vendu,
        p_platform, p_platform, NULL, v_ref,
        'releve', now(), v_devise, v_frais, coalesce(v_frais, 0),
        v_inv, 1, 'vendu', CASE WHEN v_lot THEN NULL ELSE v_listing END
      )
      ON CONFLICT (user_id, plateforme_code, commande_ref)
        WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
      DO UPDATE SET
        vendu_le         = coalesce(ventes.vendu_le, EXCLUDED.vendu_le),
        date             = coalesce(ventes.date, EXCLUDED.date),
        prix_vente       = coalesce(ventes.prix_vente, EXCLUDED.prix_vente),
        devise           = coalesce(ventes.devise, EXCLUDED.devise),
        frais_plateforme = coalesce(ventes.frais_plateforme, EXCLUDED.frais_plateforme),
        titre            = coalesce(nullif(btrim(ventes.titre),''), EXCLUDED.titre),
        inventaire_id    = coalesce(ventes.inventaire_id, EXCLUDED.inventaire_id),
        -- (02/10 soir) la fiche arrive au second temps : son prix d'achat et
        -- le bénéfice viennent avec (jamais un écrasement d'une valeur posée).
        prix_achat       = coalesce(ventes.prix_achat, EXCLUDED.prix_achat),
        benefice         = coalesce(ventes.benefice, EXCLUDED.benefice),
        annonce_id       = coalesce(ventes.annonce_id, EXCLUDED.annonce_id),
        releve_le        = now()
      RETURNING (xmax = 0), id INTO v_insere, v_vente_id;
      IF v_insere THEN c_creees := c_creees + 1; ELSE c_deja := c_deja + 1; END IF;

      -- (02/10 soir, point 9) L'ancien « passage détail » SUPPRIMAIT la vente
      -- saisie par la personne et gardait les valeurs du relevé : retiré. La
      -- même cession est désormais fusionnée DANS la vente saisie (plus haut).
    END IF;

    -- (17/10, lots Vinted — point 11) UNE COMMANDE VINTED À PLUSIEURS ARTICLES = UNE VENTE PAR
    -- ARTICLE (vente_vinted_lot_noter → vente_vinted_lot_eclater) : chaque article de la
    -- composition lue est vendu par le circuit normal, la ligne d'attente disparaît ; une
    -- ligne née avant la règle attend le script de réparation ; un doute ne change rien.
    IF p_platform = 'vinted' AND EXISTS (SELECT 1 FROM vinted_commandes_articles ca
                                          WHERE ca.user_id = v_user AND ca.commande_ref = v_ref HAVING count(*) >= 2) THEN
      v_ex_lot := public.vente_vinted_lot_noter(v_user, v_ref, v_statut, 'releve');
      IF v_ex_lot ->> 'issue' = 'eclatee' THEN c_lots_eclates := c_lots_eclates + 1;
      ELSIF v_ex_lot ->> 'issue' = 'a_reparer' THEN c_lots_a_reparer := c_lots_a_reparer + 1;
      ELSIF v_ex_lot ->> 'issue' = 'en_doute' THEN c_lots_en_doute := c_lots_en_doute + 1;
      END IF;
    END IF;

    -- (09/10 soir, règle de Nico) UNE COMMANDE eBAY = LA VENTE D'UN EXEMPLAIRE,
    -- PAS DE LA FICHE : la quantité eBay lue APRÈS la commande décide
    -- (ebay_commande_appliquer) — épuisée/terminée : fiche vendue + retrait des
    -- copies prouvées ; disponible : fiche en stock à la quantité eBay, aucun
    -- retrait ; inconnue : rien d'irréversible, relue au passage suivant.
    IF p_platform = 'ebay' AND v_inv IS NOT NULL AND NOT v_lot AND v_vente_id IS NOT NULL THEN
      BEGIN
        v_ex := ebay_commande_appliquer(v_vente_id);
        IF v_ex ->> 'decision' = 'vendue' THEN c_ex_vendues := c_ex_vendues + 1;
        ELSIF v_ex ->> 'decision' = 'en_stock' THEN c_ex_stock := c_ex_stock + 1;
        ELSIF v_ex ->> 'decision' = 'a_relire' THEN c_ex_relire := c_ex_relire + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'ebay_commande_appliquer (vente %) : % — relevé poursuivi', v_vente_id, sqlerrm;
      END;
    END IF;

    IF v_inv IS NOT NULL AND v_prix IS NOT NULL THEN
      SELECT i.statut, i.prix_vente INTO v_st, v_pv FROM inventaire i WHERE i.id = v_inv;
      IF v_st = 'vendu' AND v_pv IS NULL THEN
        UPDATE inventaire i SET prix_vente = v_prix,
               margin = coalesce(i.margin, v_benef), margin_pct = coalesce(i.margin_pct, v_pct)
         WHERE i.id = v_inv AND i.statut = 'vendu' AND i.prix_vente IS NULL;
        c_inv_completes := c_inv_completes + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'plateforme', p_platform, 'recues', c_recues, 'creees', c_creees,
    'adoptees', c_adoptees, 'deja_connues', c_deja, 'rattachees', c_rattachees,
    'lots', c_lots, 'annulees', c_annulees, 'en_cours', c_en_cours,
    'sans_ref', c_sans_ref, 'statuts_inconnus', v_inconnus,
    'articles_completes', c_inv_completes, 'saisies_fusionnees', c_fusionnees,
    'supprimees_par_la_personne', c_supprimees,
    'exemplaires_vendus', c_ex_vendues, 'exemplaires_en_stock', c_ex_stock, 'exemplaires_a_relire', c_ex_relire,
    'annulees_retirees', c_annulees_retirees, 'annulees_signalees', c_annulees_signalees,
    'compositions', c_compositions, 'lots_eclates', c_lots_eclates, 'lots_a_reparer', c_lots_a_reparer,
    'lots_en_doute', c_lots_en_doute, 'autre_compte_relie', c_autre_compte);
END;
$function$;

-- Le pin : une boutique d'un autre compte n'y entre jamais ; une boutique libre y est inscrite.
create or replace function public.profiles_pin_une_boutique_un_compte()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_ref text;
  v_prop uuid;
  v_avant text[];
  v_apres text[];
begin
  select coalesce(array_agg(distinct btrim(x ->> 'user_id')) filter (where nullif(btrim(x ->> 'user_id'), '') is not null), '{}')
    into v_avant
    from jsonb_array_elements(case when jsonb_typeof(old.vinted_sync_pin -> 'boutiques') = 'array'
                                   then old.vinted_sync_pin -> 'boutiques' else '[]'::jsonb end) x;
  select coalesce(array_agg(distinct btrim(x ->> 'user_id')) filter (where nullif(btrim(x ->> 'user_id'), '') is not null), '{}')
    into v_apres
    from jsonb_array_elements(case when jsonb_typeof(new.vinted_sync_pin -> 'boutiques') = 'array'
                                   then new.vinted_sync_pin -> 'boutiques' else '[]'::jsonb end) x;
  foreach v_ref in array v_apres loop
    if v_ref = any (v_avant) then continue; end if;
    v_prop := public.boutique_proprietaire('vinted', v_ref);
    if v_prop is not null and v_prop <> new.id then
      raise exception '[boutique_a_confirmer][boutique_autre_compte] Cette boutique Vinted est déjà suivie par un autre compte FillSell. Rien n’a été importé et rien n’a changé sur Vinted : une boutique se suit sur un seul compte.';
    end if;
    if v_prop is null then
      insert into public.boutiques_plateforme (platform, compte_ref, user_id, source)
      values ('vinted', v_ref, new.id, 'pin') on conflict (platform, compte_ref) do nothing;
    end if;
  end loop;
  -- Retirée du pin par son propriétaire : libérée.
  delete from public.boutiques_plateforme r
   where r.platform = 'vinted' and r.user_id = new.id
     and r.compte_ref = any (v_avant) and not (r.compte_ref = any (v_apres));
  return new;
end $$;
drop trigger if exists profiles_pin_une_boutique_un_compte on public.profiles;
create trigger profiles_pin_une_boutique_un_compte
  before update of vinted_sync_pin on public.profiles
  for each row when (old.vinted_sync_pin is distinct from new.vinted_sync_pin)
  execute function public.profiles_pin_une_boutique_un_compte();

-- ── 3. Annonces Leboncoin, Beebs, Depop, eBay : une annonce, un compte ─────
create or replace function public.annonces_plateforme_un_compte()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  -- Restauration par nous seuls (scripts de réparation, inverse) : même porte que inventaire_releve_par_decision.
  if coalesce(current_setting('fillsell.import_releve', true), '') = 'on' then return new; end if;
  if nullif(btrim(coalesce(new.listing_id, '')), '') is null or new.user_id is null then return new; end if;
  begin
    -- Upsert d'une annonce déjà suivie par CE compte : mise à jour normale.
    if exists (select 1 from public.annonces_plateforme a
                where a.user_id = new.user_id and a.platform = new.platform and a.listing_id = new.listing_id) then
      return new;
    end if;
    if exists (select 1 from public.annonces_plateforme a
                where a.platform = new.platform and a.listing_id = new.listing_id
                  and a.user_id <> new.user_id and a.disparu_le is null) then
      insert into public.sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
      values (new.user_id, new.listing_id, null, left(coalesce(new.titre, ''), 120), 'autre_compte:' || coalesce(new.platform, ''));
      return null;
    end if;
  exception when others then
    raise warning 'annonces_plateforme_un_compte : % — import inchangé', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists annonces_plateforme_a_un_compte on public.annonces_plateforme;
create trigger annonces_plateforme_a_un_compte
  before insert on public.annonces_plateforme
  for each row execute function public.annonces_plateforme_un_compte();

-- ── 4. eBay : un compte eBay relié à un seul compte FillSell ───────────────
do $eb$
begin
  if not exists (
    select lower(ebay_user_id) from public.ebay_accounts
     where revoked_at is null and nullif(btrim(coalesce(ebay_user_id, '')), '') is not null
     group by lower(ebay_user_id) having count(*) > 1) then
    create unique index if not exists ebay_accounts_un_compte_fillsell
      on public.ebay_accounts (lower(ebay_user_id)) where revoked_at is null and ebay_user_id is not null;
  else
    raise warning 'ebay_accounts : un compte eBay est relié à plusieurs comptes FillSell — index unique non posé';
  end if;
end $eb$;

-- ── 5. Comptes reliés et fiches jumelles ───────────────────────────────────
create table if not exists public.comptes_lies (
  user_a uuid not null,
  user_b uuid not null,
  lie_le timestamptz not null default now(),
  motif  text,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.comptes_lies enable row level security;
revoke all on public.comptes_lies from anon, authenticated;

create table if not exists public.fiches_liees_comptes (
  id         bigserial primary key,
  fiche_a    bigint not null,
  user_a     uuid not null,
  fiche_b    bigint not null,
  user_b     uuid not null,
  cree_le    timestamptz not null default now(),
  source     text,
  derniere_propagation jsonb,
  unique (fiche_a, fiche_b),
  check (fiche_a <> fiche_b)
);
create index if not exists fiches_liees_comptes_b_idx on public.fiches_liees_comptes (fiche_b);
alter table public.fiches_liees_comptes enable row level security;
revoke all on public.fiches_liees_comptes from anon, authenticated;

create or replace function public.comptes_sont_lies(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.comptes_lies c
                  where c.user_a = least(p_a, p_b) and c.user_b = greatest(p_a, p_b))
$$;
revoke all on function public.comptes_sont_lies(uuid, uuid) from anon;

create or replace function public.inventaire_vente_fiche_liee()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  l record;
  v_autre bigint;
  v_autre_user uuid;
  v_avant boolean;
  v_apres boolean;
  v_le timestamptz;
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then return new; end if;
  if new.fusionne_dans is not null then return new; end if;
  v_avant := old.statut = 'vendu' or (old.quantite is not null and old.quantite <= 0);
  v_apres := new.statut = 'vendu' or (new.quantite is not null and new.quantite <= 0);
  if v_avant = v_apres then return new; end if;
  begin
    for l in select * from public.fiches_liees_comptes f where f.fiche_a = new.id or f.fiche_b = new.id loop
      v_autre := case when l.fiche_a = new.id then l.fiche_b else l.fiche_a end;
      v_autre_user := case when l.fiche_a = new.id then l.user_b else l.user_a end;
      if not public.comptes_sont_lies(new.user_id, v_autre_user) then continue; end if;
      if v_apres then
        -- LA VENTE : la jumelle est vendue → son propre circuit retire ses copies.
        update public.inventaire set statut = 'vendu'
         where id = v_autre and user_id = v_autre_user and fusionne_dans is null and statut is distinct from 'vendu';
        if found then
          update public.fiches_liees_comptes
             set derniere_propagation = jsonb_build_object('type', 'vente', 'le', now(), 'de', new.id, 'vers', v_autre)
           where id = l.id;
          insert into public.usage_logs (user_id, feature, metadata)
          values (v_autre_user, 'vente_fiche_liee', jsonb_build_object('de_fiche', new.id::text, 'de_compte', new.user_id,
                  'vers_fiche', v_autre::text, 'motif', 'vente prouvée sur le compte relié : copies retirées ici aussi'));
        end if;
      elsif l.derniere_propagation ->> 'type' = 'vente' and (l.derniere_propagation ->> 'de')::bigint = new.id then
        -- LA VENTE ANNULÉE : la jumelle que NOUS avions dite vendue redevient disponible.
        v_le := (l.derniere_propagation ->> 'le')::timestamptz;
        update public.inventaire set statut = 'stock'
         where id = v_autre and user_id = v_autre_user and statut = 'vendu';
        update public.cross_post_jobs
           set status = 'cancelled',
               error = 'Retrait annulé : la vente a été annulée sur ton autre compte FillSell, l''article est de nouveau disponible. Ton annonce reste en ligne.',
               platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('retrait_annule',
                 jsonb_build_object('le', now(), 'motif', 'vente_annulee_compte_lie', 'pose_par', 'inventaire_vente_fiche_liee'))
         where inventaire_id = v_autre and user_id = v_autre_user and action = 'delete'
           and status in ('pending', 'needs_user') and created_at >= v_le - interval '1 minute';
        update public.fiches_liees_comptes
           set derniere_propagation = jsonb_build_object('type', 'annulation', 'le', now(), 'de', new.id, 'vers', v_autre)
         where id = l.id;
      end if;
    end loop;
  exception when others then
    raise warning 'inventaire_vente_fiche_liee (article %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists inventaire_vente_fiche_liee on public.inventaire;
create trigger inventaire_vente_fiche_liee
  after update of statut, quantite on public.inventaire
  for each row execute function public.inventaire_vente_fiche_liee();

-- ── 6. Point A tient entre comptes reliés : la vente prouvée de la jumelle vaut preuve ──
-- (incident Angel, règle inchangée : jamais un retrait sans VENTE prouvée.) Une vente non
-- annulée sur la fiche jumelle d'un compte relié, vendue, sur une autre plateforme que
-- l'annonce à retirer, est cette preuve — exactement comme sur un seul compte.
create or replace function public.vente_prouvee_fiche_liee(p_fiche bigint, p_platform text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
      from public.fiches_liees_comptes f
      join lateral (select case when f.fiche_a = p_fiche then f.fiche_b else f.fiche_a end as fiche,
                           case when f.fiche_a = p_fiche then f.user_b else f.user_a end as uid,
                           case when f.fiche_a = p_fiche then f.user_a else f.user_b end as moi) x on true
      join public.inventaire i on i.id = x.fiche and i.user_id = x.uid
      join public.ventes v on v.inventaire_id = x.fiche and v.user_id = x.uid
     where (f.fiche_a = p_fiche or f.fiche_b = p_fiche)
       and public.comptes_sont_lies(x.moi, x.uid)
       and i.statut = 'vendu'
       and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
       and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
       and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''))) <> lower(coalesce(p_platform, '')))
$$;
revoke all on function public.vente_prouvee_fiche_liee(bigint, text) from anon;

CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id for update;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;

  -- Point A, incident Angel : le dépôt prouve l'annonce, pas une vente.
  -- Lecture indexée ventes_user_inventaire_idx ; aucune réécriture de données.
  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) and not public.vente_prouvee_fiche_liee(j.inventaire_id, j.platform) then  -- (18/10) comptes reliés : la vente de la jumelle vaut preuve
    -- (2026-09-30, règle Louis partie 2 — décision Nico) Le geste de la
    -- personne vaut preuve de vente pour CE retrait-là seulement : « oui » à
    -- « Déjà vendu ? » sur l'annonce que l'app lui a montrée (preuve déjà
    -- reconnue le 27/09). La fiche doit être vendue, et jamais sur la
    -- plateforme de l'annonce retirée. Toutes les autres gardes restent.
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  -- (15/10, P16) Deux annonces vivantes sur la plateforme : rien d'office — sauf
  -- le « oui » de la personne à « Déjà vendu ? » sur CETTE annonce (montrée par
  -- l'écran, preuve par le geste) : c'est elle, et elle seule, qui part.
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 and not coalesce(p_preuve_geste, false) then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if coalesce(p_preuve_geste, false) then
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');   -- MODIF 2026-09-30
  end if;
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
$function$;

-- ── 7. Conversations et commandes : entre comptes reliés, une seule copie ───
-- (18/10, Louis) La VM de louis-seller et le PC de louis@ voient le même Leboncoin : une conversation ou une
-- commande déjà suivie par le compte relié n'est jamais recopiée sur l'autre (un seul fil, un seul bordereau).
create or replace function public.une_copie_entre_comptes_lies()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  -- Restauration par nous seuls (scripts de réparation, inverse) : même porte que inventaire_releve_par_decision.
  if coalesce(current_setting('fillsell.import_releve', true), '') = 'on' then return new; end if;
  if not exists (select 1 from public.comptes_lies cl where cl.user_a = new.user_id or cl.user_b = new.user_id) then
    return new;
  end if;
  if tg_table_name = 'messagerie_conversations' then
    if exists (select 1 from public.messagerie_conversations x
                where x.platform = new.platform and x.conversation_ref = new.conversation_ref
                  and x.user_id <> new.user_id and public.comptes_sont_lies(new.user_id, x.user_id)) then
      return null;
    end if;
  elsif tg_table_name = 'plateforme_commandes' then
    if exists (select 1 from public.plateforme_commandes x
                where x.platform = new.platform and x.commande_ref = new.commande_ref
                  and x.user_id <> new.user_id and public.comptes_sont_lies(new.user_id, x.user_id)) then
      return null;
    end if;
  end if;
  return new;
exception when others then
  raise warning 'une_copie_entre_comptes_lies (%) : % — insertion inchangée', tg_table_name, sqlerrm;
  return new;
end $$;
drop trigger if exists a_une_copie_entre_comptes_lies on public.messagerie_conversations;
create trigger a_une_copie_entre_comptes_lies before insert on public.messagerie_conversations
  for each row execute function public.une_copie_entre_comptes_lies();
drop trigger if exists a_une_copie_entre_comptes_lies on public.plateforme_commandes;
create trigger a_une_copie_entre_comptes_lies before insert on public.plateforme_commandes
  for each row execute function public.une_copie_entre_comptes_lies();

-- T1 : registre — @neyenonie (247512093) attribuée au compte principal, @evat (371531, dans deux pins) laissée en doute.
insert into _r select 'T1 registre : 247512093 → louis@', boutique_proprietaire('vinted','247512093') = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
insert into _r select 'T1 registre : 371531 en doute (non attribuée)', boutique_proprietaire('vinted','371531') is null;
insert into _r select 'T1 registre : boutiques attribuées > 0', (select count(*) from boutiques_plateforme) > 0;

-- T2 : le 2e compte ne peut pas ajouter @neyenonie à son pin.
do $t2$ begin
  update profiles set vinted_sync_pin = jsonb_set(vinted_sync_pin, '{boutiques}', (vinted_sync_pin -> 'boutiques') || '[{"user_id":"247512093","login":"neyenonie","source":"essai"}]'::jsonb)
   where id = '447d920c-976a-4d8f-aff4-a2998050358c';
  insert into _r select 'T2 pin : boutique d''un autre compte refusée', false;
exception when others then
  insert into _r select 'T2 pin : boutique d''un autre compte refusée', sqlerrm like '%boutique_autre_compte%';
end $t2$;

-- T3 : aucun article de @neyenonie importé sur le 2e compte.
do $t3$ begin
  insert into inventaire (id, user_id, titre, origine, vinted_item_id, listed_at_guess, vinted_account_id, plateforme, statut, photos)
  values (999000000000201, '447d920c-976a-4d8f-aff4-a2998050358c', 'essai', 'vinted_sync', '99000000201', now(), '247512093', 'vinted', 'stock', '["https://x/1.jpg"]');
  insert into _r select 'T3 import : refusé avec [boutique_autre_compte]', false;
exception when others then
  insert into _r select 'T3 import : refusé avec [boutique_autre_compte]', sqlerrm like '[boutique_a_confirmer][boutique_autre_compte]%';
end $t3$;

-- T4 : les ventes lues par une session ouverte sur @neyenonie ne s'enregistrent pas sur le 2e compte.
update profiles set extension_sessions = coalesce(extension_sessions, '{}'::jsonb)
  || jsonb_build_object('vinted_identite', jsonb_build_object('user_id','247512093','login','neyenonie'), 'checked_at', now())
 where id = '447d920c-976a-4d8f-aff4-a2998050358c';
insert into _r select 'T4 ventes : refusées (motif boutique_autre_compte, 0 créée)',
  (r ->> 'motif') = 'boutique_autre_compte' and (r ->> 'creees')::int = 0
  from (select enregistrer_ventes_relevees('vinted', '[{"ref":"99999999999","statut":"completed","titre":"essai","prix":"1"}]'::jsonb,
                                           '447d920c-976a-4d8f-aff4-a2998050358c') r) x;
insert into _r select 'T4 ventes : aucune vente écrite', not exists (select 1 from ventes where commande_ref = '99999999999');

-- T5 : une annonce Leboncoin suivie en ligne par louis@ n'est pas importée par un autre compte.
insert into annonces_plateforme (user_id, platform, listing_id, titre) values ('309d0787-9000-46cc-9c6a-51f7475d7d41', 'leboncoin', '3290751219', 'essai');
insert into _r select 'T5 annonce : non importée chez un autre compte', not exists (select 1 from annonces_plateforme where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and listing_id = '3290751219');
insert into _r select 'T5 annonce : tracée (autre_compte:leboncoin)', exists (select 1 from sync_import_ecartes where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and vinted_item_id = '3290751219' and motif = 'autre_compte:leboncoin');

-- T6 : comptes reliés — vente Vinted sur le 2e compte → la jumelle du compte principal est vendue, ses copies retirées.
insert into comptes_lies (user_a, user_b, motif) values (least('faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid),
  greatest('faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid), 'essai');
insert into fiches_liees_comptes (fiche_a, user_a, fiche_b, user_b, source)
values (1792333224774018, '447d920c-976a-4d8f-aff4-a2998050358c', 1789898266424, 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'essai');
create temp table _avant as select id from cross_post_jobs where inventaire_id = 1789898266424 and action = 'delete';
-- La vente Vinted prouvée sur le 2e compte (comme le relevé des ventes l'écrit : vente puis statut).
insert into ventes (id, user_id, inventaire_id, plateforme, plateforme_code, statut, prix_vente, commande_ref)
values (999000000000301, '447d920c-976a-4d8f-aff4-a2998050358c', 1792333224774018, 'vinted', 'vinted', 'vendu', 1, 'essai-301');
update inventaire set statut = 'vendu', vinted_status = 'sold' where id = 1792333224774018;
insert into _r select 'T6 vente : la jumelle du compte principal est vendue', (select statut from inventaire where id = 1789898266424) = 'vendu';
insert into _r select 'T6 vente : retraits armés sur ses copies (Leboncoin/Beebs), au nom du compte principal',
  (select count(*) from cross_post_jobs where inventaire_id = 1789898266424 and action = 'delete' and status in ('pending','needs_user')
     and user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and id not in (select id from _avant)) >= 1;
insert into _r select 'T6 vente : tracée (usage_logs vente_fiche_liee)', exists (select 1 from usage_logs where feature = 'vente_fiche_liee' and metadata ->> 'vers_fiche' = '1789898266424');

-- T7 : vente annulée → la jumelle redevient disponible, ses retraits en file sont annulés.
update inventaire set statut = 'stock', vinted_status = 'active' where id = 1792333224774018;
insert into _r select 'T7 annulation : jumelle de nouveau en stock', (select statut from inventaire where id = 1789898266424) = 'stock';
insert into _r select 'T7 annulation : ses retraits en file annulés',
  not exists (select 1 from cross_post_jobs where inventaire_id = 1789898266424 and action = 'delete' and status in ('pending','needs_user') and id not in (select id from _avant));

-- T9 : vente Leboncoin relevée par louis-seller pour une annonce suivie par le SEUL compte relié → pas enregistrée ici.
delete from annonces_plateforme where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and platform = 'leboncoin' and listing_id = '3290751219';
insert into _r select 'T9 vente LBC : laissée au compte propriétaire (relié)', (r ->> 'autre_compte_relie')::int = 1
  from (select enregistrer_ventes_relevees('leboncoin', '[{"ref":"lbc-essai-9","statut":"paid","titre":"essai","prix":"1","listing_id":"3290751219"}]'::jsonb,
        '447d920c-976a-4d8f-aff4-a2998050358c') r) x;
insert into _r select 'T9 vente LBC : aucune vente écrite sur louis-seller', not exists (select 1 from ventes where commande_ref = 'lbc-essai-9');

-- T10 : commande Vinted déjà enregistrée sur le compte relié → jamais une 2e fois (un seul mail).
update profiles set extension_sessions = coalesce(extension_sessions, '{}'::jsonb)
  || jsonb_build_object('vinted_identite', jsonb_build_object('user_id','371531','login','evat'), 'checked_at', now())
 where id = '447d920c-976a-4d8f-aff4-a2998050358c';
insert into ventes (id, user_id, plateforme, plateforme_code, statut, prix_vente, commande_ref)
values (999000000000310, 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'vinted', 'vinted', 'vendu', 1, 'essai-cmd-10');
insert into _r select 'T10 vente Vinted déjà sur le compte relié : ignorée', (r ->> 'autre_compte_relie')::int = 1
  from (select enregistrer_ventes_relevees('vinted', '[{"ref":"essai-cmd-10","statut":"completed","titre":"essai","prix":"1"}]'::jsonb,
        '447d920c-976a-4d8f-aff4-a2998050358c') r) x;
insert into _r select 'T10 : une seule vente pour cette commande', (select count(*) from ventes where commande_ref = 'essai-cmd-10') = 1;

-- T11 : la même conversation Leboncoin vue par les deux ordinateurs → une seule copie.
insert into messagerie_conversations (user_id, platform, conversation_ref) values ('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin', 'essai-conv-11');
insert into messagerie_conversations (user_id, platform, conversation_ref) values ('447d920c-976a-4d8f-aff4-a2998050358c', 'leboncoin', 'essai-conv-11');
insert into _r select 'T11 conversation : une seule copie entre comptes reliés', (select count(*) from messagerie_conversations where conversation_ref = 'essai-conv-11') = 1;
insert into plateforme_commandes (user_id, platform, commande_ref) values ('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin', 'essai-cmd-11');
insert into plateforme_commandes (user_id, platform, commande_ref) values ('447d920c-976a-4d8f-aff4-a2998050358c', 'leboncoin', 'essai-cmd-11');
insert into _r select 'T11 commande : une seule copie entre comptes reliés', (select count(*) from plateforme_commandes where commande_ref = 'essai-cmd-11') = 1;

-- T8 : comptes NON reliés → rien ne passe d'un compte à l'autre.
delete from comptes_lies;
update inventaire set statut = 'vendu' where id = 1792333224774018;
insert into _r select 'T8 sans lien de comptes : la jumelle reste en stock', (select statut from inventaire where id = 1789898266424) = 'stock';

select * from _r;
rollback;
