-- ═══════════════════════════════════════════════════════════════════════════
-- UNE COMMANDE eBAY = LA VENTE D'UN EXEMPLAIRE, PAS DE LA FICHE (09/10 soir, Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 09/10, le rattrapage des commandes eBay a écrit 247 ventes en compta sans
-- rien juger du stock ; et l'analyse qui a suivi a conclu sur la QUANTITÉ DE LA
-- FICHE (1) sans lire celle d'eBay : le maillot Flamengo de duport.leo3
-- (178537157210) avait 3 exemplaires sur eBay, la commande du 30/09 en a vendu
-- UN, il en reste 2 (quantite_ebay exacte, lue le 08/10) — sa copie Opla est
-- légitime. Deux fautes, une seule cause : la quantité eBay ne vit pas sur la
-- fiche (le relevé de l'API la lisait — QuantityAvailable — et la jetait).
--
-- RÈGLE (Nico, 09/10 soir) — source de vérité : la quantité eBay lue APRÈS la
-- commande (veille du job, relevé de l'API, ou lecture Browse par
-- ebay-ventes-sync si elle manque) :
--   · 0 disponible, ou annonce introuvable chez eBay, et aucune autre annonce
--     eBay vivante de la fiche → preuve : fiche vendue + retrait des copies
--     PROUVÉES (règle du 28/09), « Déjà vendu ? » sur les autres ; rien sur le titre ;
--   · disponible ≥ 1 → vente écrite, fiche EN STOCK à la quantité eBay, AUCUN retrait ;
--   · illisible → rien d'irréversible : la commande reste « à relire » (table
--     ventes_ebay_exemplaires), relue seule aux passages suivants. (Le drapeau
--     inventaire.a_verifier n'est PAS utilisé : il sort la fiche du stock vers
--     l'écran de rattachement.)
--   · vente de plus de 24 h : 0 mail, 0 notification (note éteinte dans la transaction).
-- À LA RACINE : le relevé de l'API eBay garde la quantité de chaque annonce
-- (annonces_plateforme.quantite) et la fiche en stock la suit, à l'import et à
-- chaque relevé (première lecture : la quantité eBay ; ensuite : l'écart
-- d'eBay), journalisé dans inventaire_journal.
-- Les autres chemins regardent DÉJÀ la quantité restante de la fiche
-- (enregistrer_vente_atomique : retraits seulement si restant = 0 ; preuve de
-- vente d'un job : rien au-delà d'1 exemplaire ; fiche vendue : quantité ≤ 0) —
-- leur faute venait de la quantité FAUSSE de la fiche, corrigée ici pour eBay.
-- Reste ouvert : Leboncoin pro (plusieurs unités par annonce) — son relevé ne
-- lit pas la quantité.
-- Définition de départ : enregistrer_ventes_relevees EN PROD le 09/10 soir
-- (pg_get_functiondef, après 20261009180000).
-- Inverse : scripts/reparations/20261009_inverse_ebay_commande_un_exemplaire.sql
-- Preuve : node scripts/ebay-commande-exemplaire-preuve.mjs (transaction annulée).

-- ── 1. La quantité eBay, lue par le relevé, gardée sur l'annonce ───────────
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS quantite integer;
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS quantite_le timestamptz;

-- ── 2. Le jugement de chaque commande eBay (une ligne par vente relevée) ────
CREATE TABLE IF NOT EXISTS public.ventes_ebay_exemplaires (
  vente_id       bigint PRIMARY KEY,
  user_id        uuid NOT NULL,
  inventaire_id  bigint,
  listing_id     text NOT NULL,
  vendu_le       timestamptz,
  decision       text NOT NULL CHECK (decision IN ('vendue', 'en_stock', 'a_relire', 'sans_objet')),
  motif          text,
  lecture        jsonb,
  essais         integer NOT NULL DEFAULT 0,
  prochain_essai timestamptz,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  decide_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ventes_ebay_exemplaires_a_relire
  ON public.ventes_ebay_exemplaires (user_id, prochain_essai) WHERE decision = 'a_relire';
CREATE INDEX IF NOT EXISTS ventes_ebay_exemplaires_annonce
  ON public.ventes_ebay_exemplaires (user_id, listing_id);
ALTER TABLE public.ventes_ebay_exemplaires ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes_ebay_exemplaires TO authenticated;
DROP POLICY IF EXISTS ventes_ebay_exemplaires_lecture ON public.ventes_ebay_exemplaires;
CREATE POLICY ventes_ebay_exemplaires_lecture ON public.ventes_ebay_exemplaires
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 3. Ce qu'eBay dit de l'annonce APRÈS la commande ───────────────────────
-- Une lecture ANTÉRIEURE à la commande ne dit rien d'elle (la dentelle de
-- lesmillesetunepepite : « 1 disponible, 0 vendu » lu le 07/10 17:48, commande
-- le 08/10 00:31). Sources, la plus récente l'emporte : la lecture fraîche
-- passée par l'appelant (Browse), la veille eBay du job (quantite_ebay,
-- vente_ebay), le relevé de l'API (annonces_plateforme.quantite).
-- États : epuisee (0 disponible) · terminee (annonce introuvable chez eBay) ·
-- disponible (n ≥ 1, exact) · disponible_non_exacte (en vente, « plus de N ») ·
-- inconnue.
CREATE OR REPLACE FUNCTION public.ebay_quantite_connue(p_user uuid, p_listing text, p_depuis timestamptz, p_lecture jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_depuis timestamptz := coalesce(p_depuis, '-infinity'::timestamptz);
  v_d integer; v_ex boolean; v_le timestamptz;
  v_meilleur jsonb := NULL; v_meilleur_le timestamptz := '-infinity'::timestamptz;
  r record;
BEGIN
  IF p_lecture IS NOT NULL THEN
    IF p_lecture ->> 'http' = '404' THEN
      RETURN jsonb_build_object('etat', 'terminee', 'source', 'lecture_ebay', 'lu_le', p_lecture ->> 'lu_le', 'motif', 'annonce_introuvable');
    END IF;
    IF p_lecture ->> 'http' = '200' THEN
      v_d := nullif(p_lecture ->> 'disponible', '')::integer;
      v_ex := coalesce((p_lecture ->> 'exacte')::boolean, false);
      IF coalesce((p_lecture ->> 'epuisee')::boolean, false) OR (v_ex AND v_d = 0) THEN
        RETURN jsonb_build_object('etat', 'epuisee', 'disponible', 0, 'source', 'lecture_ebay', 'lu_le', p_lecture ->> 'lu_le');
      ELSIF v_ex AND v_d >= 1 THEN
        RETURN jsonb_build_object('etat', 'disponible', 'disponible', v_d, 'source', 'lecture_ebay', 'lu_le', p_lecture ->> 'lu_le',
                                  'terminee', coalesce((p_lecture ->> 'terminee')::boolean, false));
      ELSIF NOT coalesce((p_lecture ->> 'terminee')::boolean, false) THEN
        RETURN jsonb_build_object('etat', 'disponible_non_exacte', 'source', 'lecture_ebay', 'lu_le', p_lecture ->> 'lu_le');
      END IF;
      RETURN jsonb_build_object('etat', 'inconnue', 'source', 'lecture_ebay', 'lu_le', p_lecture ->> 'lu_le', 'motif', 'terminee_quantite_illisible');
    END IF;
  END IF;
  -- La veille eBay des jobs de cette annonce.
  FOR r IN SELECT c.platform_fields AS pf FROM cross_post_jobs c
            WHERE c.user_id = p_user AND c.platform = 'ebay' AND btrim(c.platform_listing_id) = p_listing
              AND coalesce(c.action, 'publish') IN ('publish', 'republish') LOOP
    v_le := _ts_ou_null(r.pf #>> '{quantite_ebay,vu_le}');
    IF v_le > v_depuis AND v_le > v_meilleur_le THEN
      v_d := nullif(r.pf #>> '{quantite_ebay,disponible}', '')::integer;
      v_ex := coalesce((r.pf #>> '{quantite_ebay,exacte}')::boolean, false);
      v_meilleur_le := v_le;
      v_meilleur := CASE
        WHEN v_ex AND v_d = 0 THEN jsonb_build_object('etat', 'epuisee', 'disponible', 0)
        WHEN v_ex AND v_d >= 1 THEN jsonb_build_object('etat', 'disponible', 'disponible', v_d)
        ELSE jsonb_build_object('etat', 'disponible_non_exacte') END
        || jsonb_build_object('source', 'veille_ebay', 'lu_le', v_le);
    END IF;
    v_le := _ts_ou_null(r.pf #>> '{vente_ebay,vu_le}');
    IF v_le > v_depuis AND v_le > v_meilleur_le THEN
      v_meilleur_le := v_le;
      v_meilleur := jsonb_build_object('etat', 'epuisee', 'disponible', 0, 'source', 'veille_ebay_vente', 'lu_le', v_le);
    END IF;
  END LOOP;
  -- Le relevé de l'API eBay (QuantityAvailable).
  SELECT a.quantite, a.quantite_le INTO v_d, v_le FROM annonces_plateforme a
   WHERE a.user_id = p_user AND a.platform = 'ebay' AND a.listing_id = p_listing AND a.quantite IS NOT NULL
   ORDER BY a.quantite_le DESC NULLS LAST LIMIT 1;
  IF v_le > v_depuis AND v_le > v_meilleur_le THEN
    v_meilleur := CASE WHEN v_d = 0 THEN jsonb_build_object('etat', 'epuisee', 'disponible', 0)
                       ELSE jsonb_build_object('etat', 'disponible', 'disponible', v_d) END
                  || jsonb_build_object('source', 'releve_ebay', 'lu_le', v_le);
  END IF;
  RETURN coalesce(v_meilleur, jsonb_build_object('etat', 'inconnue', 'motif', 'aucune_lecture_apres_la_commande'));
END;
$function$;
REVOKE ALL ON FUNCTION public.ebay_quantite_connue(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 4. UNE COMMANDE eBAY = LA VENTE D'UN EXEMPLAIRE (règle de Nico du 09/10) ──
--  · eBay épuisée (0 disponible) ou annonce terminée (introuvable chez eBay),
--    et aucune autre annonce eBay vivante de la fiche → preuve : le job eBay
--    passe « vendu », la fiche « vendue » (quantité 0) — son déclencheur arme le
--    retrait des seules copies PROUVÉES (règle du 28/09) et pose « Déjà vendu ? »
--    sur les autres ; rien sur le titre ;
--  · eBay disponible ≥ 1 → la vente est écrite (déjà fait), la fiche reste en
--    stock, sa quantité = le disponible eBay, AUCUN retrait ;
--  · « plus de N » (non exact) → en stock, quantité inchangée, aucun retrait ;
--  · rien de lisible après la commande → rien d'irréversible : « à relire »,
--    ebay-ventes-sync relit l'annonce (Browse) aux passages suivants
--    (1 h, 2 h, 4 h… plafonné à 24 h).
-- Une vente de plus de 24 h n'annonce rien (note de vente éteinte dans la
-- transaction). Tout changement de quantité ou de statut → inventaire_journal.
CREATE OR REPLACE FUNCTION public.ebay_commande_appliquer(p_vente bigint, p_lecture jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; d ventes_ebay_exemplaires%ROWTYPE;
  v_listing text; q jsonb; v_dec text; v_motif text; v_autre boolean; v_jobs uuid[]; v_cible integer;
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND OR coalesce(v.plateforme_code, '') <> 'ebay' OR v.commande_ref IS NULL
     OR nullif(btrim(coalesce(v.annonce_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('decision', 'hors_regle');
  END IF;
  v_listing := btrim(v.annonce_id);
  SELECT * INTO d FROM ventes_ebay_exemplaires WHERE vente_id = p_vente;
  IF FOUND AND d.decision <> 'a_relire' THEN
    RETURN jsonb_build_object('decision', d.decision, 'motif', d.motif, 'deja', true);
  END IF;

  IF v.inventaire_id IS NOT NULL THEN
    -- Même verrou que toutes les ventes de la fiche.
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
  END IF;
  IF v.inventaire_id IS NULL OR i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
    v_dec := 'sans_objet'; v_motif := 'sans_fiche';
  ELSIF i.statut IS DISTINCT FROM 'stock' THEN
    v_dec := 'sans_objet'; v_motif := 'fiche_' || coalesce(i.statut, 'sans_statut');
  ELSE
    q := ebay_quantite_connue(v.user_id, v_listing, v.vendu_le, p_lecture);
    v_autre := EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.user_id = v.user_id AND c.inventaire_id = i.id AND c.platform = 'ebay'
                         AND c.status = 'published' AND coalesce(c.action, 'publish') IN ('publish', 'republish')
                         AND btrim(coalesce(c.platform_listing_id, '')) NOT IN ('', v_listing))
            OR EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.user_id = v.user_id AND a.inventaire_id = i.id AND a.platform = 'ebay'
                         AND a.listing_id <> v_listing AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL);
    IF q ->> 'etat' IN ('epuisee', 'terminee') AND v_autre THEN
      v_dec := 'en_stock'; v_motif := 'autre_annonce_ebay_vivante';
    ELSIF q ->> 'etat' IN ('epuisee', 'terminee') THEN
      WITH m AS (
        UPDATE cross_post_jobs c SET status = 'sold', sold_at = coalesce(c.sold_at, v.vendu_le, now()), last_checked_at = now(),
               platform_fields = coalesce(c.platform_fields, '{}'::jsonb) || jsonb_build_object('vente_commande_ebay',
                 jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'quantite', q, 'le', now()))
         WHERE c.user_id = v.user_id AND c.inventaire_id = i.id AND c.platform = 'ebay' AND c.status = 'published'
           AND coalesce(c.action, 'publish') IN ('publish', 'republish') AND btrim(c.platform_listing_id) = v_listing
        RETURNING c.id)
      SELECT coalesce(array_agg(id), '{}') INTO v_jobs FROM m;
      -- Une vente ancienne n'annonce rien : la note posée par le passage du job à
      -- « vendu » est éteinte dans la même transaction.
      IF coalesce(v.vendu_le, v.created_at) < now() - interval '24 hours' AND cardinality(v_jobs) > 0 THEN
        UPDATE push_ventes SET statut = 'ignoree', motif = 'vente_ancienne_commande_ebay', traite_le = now()
         WHERE user_id = v.user_id AND job_id = ANY (v_jobs) AND statut = 'a_envoyer' AND part_le IS NULL;
      END IF;
      UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = i.id AND statut = 'stock';
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'statut', i.statut, 'vendu', 'commande_ebay', 'ebay_' || (q ->> 'etat'),
         jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'annonce', v_listing, 'quantite_ebay', q, 'jobs', to_jsonb(v_jobs))),
        (v.user_id, i.id, 'quantite', i.quantite::text, '0', 'commande_ebay', 'ebay_' || (q ->> 'etat'),
         jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'annonce', v_listing, 'quantite_ebay', q));
      v_dec := 'vendue'; v_motif := 'ebay_' || (q ->> 'etat');
    ELSIF q ->> 'etat' = 'disponible' THEN
      v_cible := (q ->> 'disponible')::integer;
      IF i.quantite IS DISTINCT FROM v_cible THEN
        UPDATE inventaire SET quantite = v_cible WHERE id = i.id AND statut = 'stock';
        INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
          (v.user_id, i.id, 'quantite', i.quantite::text, v_cible::text, 'commande_ebay', 'quantite_ebay_disponible',
           jsonb_build_object('vente', v.id, 'commande', v.commande_ref, 'annonce', v_listing, 'quantite_ebay', q));
      END IF;
      v_dec := 'en_stock'; v_motif := 'ebay_disponible';
    ELSIF q ->> 'etat' = 'disponible_non_exacte' THEN
      v_dec := 'en_stock'; v_motif := 'ebay_disponible_non_exacte';
    ELSE
      v_dec := 'a_relire'; v_motif := coalesce(q ->> 'motif', 'quantite_ebay_inconnue');
    END IF;
  END IF;

  INSERT INTO ventes_ebay_exemplaires (vente_id, user_id, inventaire_id, listing_id, vendu_le, decision, motif, lecture, essais, prochain_essai, decide_le)
  VALUES (v.id, v.user_id, v.inventaire_id, v_listing, v.vendu_le, v_dec, v_motif, q,
          CASE WHEN v_dec = 'a_relire' THEN 1 ELSE 0 END,
          CASE WHEN v_dec = 'a_relire' THEN now() + interval '1 hour' END, now())
  ON CONFLICT (vente_id) DO UPDATE SET
    decision = EXCLUDED.decision, motif = EXCLUDED.motif, lecture = EXCLUDED.lecture, inventaire_id = EXCLUDED.inventaire_id,
    essais = ventes_ebay_exemplaires.essais + CASE WHEN EXCLUDED.decision = 'a_relire' THEN 1 ELSE 0 END,
    prochain_essai = CASE WHEN EXCLUDED.decision = 'a_relire'
                          THEN now() + least(interval '24 hours', interval '1 hour' * power(2, least(ventes_ebay_exemplaires.essais, 5)))
                          END,
    decide_le = now();
  RETURN jsonb_build_object('decision', v_dec, 'motif', v_motif, 'quantite_ebay', q);
END;
$function$;
REVOKE ALL ON FUNCTION public.ebay_commande_appliquer(bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- Les annonces dont une commande attend sa lecture (au plus p_limite).
CREATE OR REPLACE FUNCTION public.ebay_commandes_a_relire(p_user uuid, p_limite integer DEFAULT 10)
 RETURNS TABLE(listing_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT e.listing_id FROM ventes_ebay_exemplaires e
   WHERE e.user_id = p_user AND e.decision = 'a_relire' AND coalesce(e.prochain_essai, now()) <= now()
   GROUP BY e.listing_id ORDER BY min(e.prochain_essai) NULLS FIRST LIMIT greatest(coalesce(p_limite, 10), 0);
$function$;
REVOKE ALL ON FUNCTION public.ebay_commandes_a_relire(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Une lecture fraîche de l'annonce : chaque commande en attente sur elle est jugée.
CREATE OR REPLACE FUNCTION public.ebay_quantite_lue(p_user uuid, p_listing text, p_lecture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_out jsonb := '[]'::jsonb;
BEGIN
  FOR r IN SELECT e.vente_id FROM ventes_ebay_exemplaires e
            WHERE e.user_id = p_user AND e.listing_id = p_listing AND e.decision = 'a_relire'
            ORDER BY e.vendu_le NULLS FIRST, e.vente_id LOOP
    v_out := v_out || jsonb_build_object('vente', r.vente_id, 'resultat', ebay_commande_appliquer(r.vente_id, p_lecture));
  END LOOP;
  RETURN jsonb_build_object('annonce', p_listing, 'commandes', v_out);
END;
$function$;
REVOKE ALL ON FUNCTION public.ebay_quantite_lue(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 5. À L'IMPORT ET À CHAQUE RELEVÉ : la fiche suit la quantité eBay ──────
-- La fiche EN STOCK d'une annonce eBay (une seule annonce eBay vivante pour
-- elle : deux annonces = deux exemplaires, on ne choisit pas) prend la quantité
-- lue par le relevé : la PREMIÈRE lecture (ou un nouveau rattachement) donne la
-- quantité eBay telle quelle ; ensuite, seul l'ÉCART d'eBay est reporté (eBay
-- 3 → 2 : la fiche perd un exemplaire), pour ne jamais rendre à la fiche un
-- exemplaire vendu ailleurs dont eBay n'a pas été informé. Jamais en dessous de
-- 1 ici (vendre la fiche, c'est la règle des commandes), jamais une fiche
-- vendue, jamais une ligne inchangée. Journal : inventaire_journal.
CREATE OR REPLACE FUNCTION public.annonce_ebay_aligne_quantite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  i inventaire%ROWTYPE; v_n integer; v_cible integer; v_mode text;
BEGIN
  BEGIN
    IF new.disparu_le IS NOT NULL OR new.retiree_le IS NOT NULL OR new.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
    SELECT * INTO i FROM inventaire WHERE id = new.inventaire_id AND user_id = new.user_id;
    IF NOT FOUND OR i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'stock' THEN RETURN NULL; END IF;
    SELECT count(*) INTO v_n FROM annonces_plateforme a
     WHERE a.user_id = new.user_id AND a.platform = 'ebay' AND a.inventaire_id = new.inventaire_id
       AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL;
    IF v_n <> 1 THEN RETURN NULL; END IF;
    IF tg_op = 'UPDATE' AND old.quantite IS NOT NULL AND old.inventaire_id IS NOT DISTINCT FROM new.inventaire_id THEN
      v_cible := coalesce(i.quantite, 1) + (new.quantite - old.quantite); v_mode := 'ecart_ebay';
    ELSE
      v_cible := new.quantite; v_mode := 'quantite_ebay';
    END IF;
    IF v_cible < 1 OR v_cible IS NOT DISTINCT FROM i.quantite THEN RETURN NULL; END IF;
    UPDATE inventaire SET quantite = v_cible WHERE id = i.id AND statut = 'stock' AND quantite IS DISTINCT FROM v_cible;
    INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
    VALUES (new.user_id, i.id, 'quantite', i.quantite::text, v_cible::text, 'releve_ebay', v_mode,
            jsonb_build_object('annonce', new.listing_id, 'quantite_ebay', new.quantite,
                               'quantite_ebay_avant', CASE WHEN tg_op = 'UPDATE' THEN old.quantite END, 'lu_le', new.quantite_le));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_ebay_aligne_quantite (annonce %) : % — relevé poursuivi', new.listing_id, sqlerrm;
  END;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS annonces_plateforme_ebay_quantite_ins ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_ebay_quantite_ins
  AFTER INSERT ON public.annonces_plateforme FOR EACH ROW
  WHEN (new.platform = 'ebay' AND new.quantite IS NOT NULL AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.annonce_ebay_aligne_quantite();
DROP TRIGGER IF EXISTS annonces_plateforme_ebay_quantite_maj ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_ebay_quantite_maj
  AFTER UPDATE OF quantite, inventaire_id ON public.annonces_plateforme FOR EACH ROW
  WHEN (new.platform = 'ebay' AND new.quantite IS NOT NULL AND new.inventaire_id IS NOT NULL
        AND (old.quantite IS DISTINCT FROM new.quantite OR old.inventaire_id IS DISTINCT FROM new.inventaire_id))
  EXECUTE FUNCTION public.annonce_ebay_aligne_quantite();

-- ── 6. Le relevé des ventes applique la règle à chaque commande eBay ───────
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
  v_inconnus jsonb := '{}'::jsonb;
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
    IF v_classe = 'annulee' THEN c_annulees := c_annulees + 1; CONTINUE; END IF;
    IF v_classe = 'en_cours' THEN c_en_cours := c_en_cours + 1; CONTINUE; END IF;
    IF v_classe <> 'vente' THEN
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
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
    'exemplaires_vendus', c_ex_vendues, 'exemplaires_en_stock', c_ex_stock, 'exemplaires_a_relire', c_ex_relire);
END;
$function$;
