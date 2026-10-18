-- Inverse de 20261018200000_une_boutique_un_compte_comptes_lies.sql
drop trigger if exists a_une_copie_entre_comptes_lies on public.messagerie_conversations;
drop trigger if exists a_une_copie_entre_comptes_lies on public.plateforme_commandes;
drop function if exists public.une_copie_entre_comptes_lies();
-- (les fonctions réécrites reviennent à leur définition PROD du 18/10, lue par pg_get_functiondef)
drop trigger if exists inventaire_vente_fiche_liee on public.inventaire;
drop function if exists public.inventaire_vente_fiche_liee();
drop function if exists public.comptes_sont_lies(uuid, uuid);
drop table if exists public.fiches_liees_comptes;
drop table if exists public.comptes_lies;
drop index if exists public.ebay_accounts_un_compte_fillsell;
drop trigger if exists annonces_plateforme_a_un_compte on public.annonces_plateforme;
drop function if exists public.annonces_plateforme_un_compte();
drop trigger if exists profiles_pin_une_boutique_un_compte on public.profiles;
drop function if exists public.profiles_pin_une_boutique_un_compte();

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
    WHERE p.id=p_user AND p.vinted_sync_pin->>'v'='2' AND b->>'user_id'=btrim(p_boutique));
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
    'lots_en_doute', c_lots_en_doute);
END;
$function$;

drop function if exists public.boutique_vinted_autre_compte(uuid, text);
drop function if exists public.boutique_proprietaire(text, text);
drop table if exists public.boutiques_plateforme;

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
  ) then
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
drop function if exists public.vente_prouvee_fiche_liee(bigint, text);
