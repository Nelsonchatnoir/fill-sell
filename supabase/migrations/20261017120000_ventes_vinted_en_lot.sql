-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — UNE VENTE VINTED EN LOT = UNE VENTE PAR ARTICLE (Amiral/Louis — point 11)
-- ═══════════════════════════════════════════════════════════════════════════
-- CAS PROUVÉ (lecture seule, 17/10) — compte Amiral (faf5021a…) :
--   1. 17/10 ~11:45 : lot de 2 articles (maillot nabaiji 10390869023 + une robe
--      jamais importée). Seul le maillot est vendu : la preuve de SA page (vente
--      188018, retrait Leboncoin 3286701048), mail « vente:2441 » qui ne cite que
--      lui. La robe n'a ni fiche ni annonce FillSell : rien.
--   2. vente 184415 « Lot 4 articles », 5,10 €, commande 23148630362 : UNE ligne,
--      sans fiche ni annonce ; ses 4 numéros d'annonce n'ont été gardés nulle part.
--   Cause (corps de prod) : le relevé lit transaction.order.item_ids, mais
--   enregistrer_ventes_relevees fait d'un lot UNE ligne « lot » (v_bande := 'lot',
--   annonce NULL) et n'utilise les numéros que pour une commande « failed » ; la
--   veille des commandes lit les numéros puis ne relit que les annonces FillSell
--   publiées, sans rien écrire en base ; le mail part note par note (un article).
--   Parc, 30 jours : 114 lignes « Lot N articles » (42 comptes), toutes sans fiche.
--
-- LA RÈGLE (décisions de Nico, 17/10)
--   · La COMMANDE Vinted est l'unité de vente ; sa composition = les numéros
--     EXACTS de transaction.order.item_ids (ou item_id) lus par la session du
--     vendeur — JAMAIS le titre « Lot N articles » (vinted_commandes_articles).
--   · Une ligne de vente PAR ARTICLE (commande_ref '<ref>:<item_id>', comme eBay
--     '<order>:<line>') ; chaque article qui a une fiche passe vendu par le circuit
--     normal (enregistrer_vente_atomique inchangée, ou la fiche vendue et
--     inventaire_vendu_retire_ses_copies) : ses copies PROUVÉES sont retirées ; un
--     article inconnu de FillSell = une vente sans fiche + la question (usage_logs
--     'vente_vinted_article_inconnu'), JAMAIS un retrait. Tout ou rien par commande :
--     au premier doute, rien n'est écrit (decision 'en_doute' + motif).
--   · Une commande PAYÉE (ni failed ni cancelled) vaut preuve pour chaque article,
--     comme la page « vendue » ; failed / cancelled : JAMAIS une vente prouvée (R4).
--     La veille des commandes (comptes payants, extension 0.6.123) l'envoie tout de
--     suite (commandes_vinted_noter) ; le relevé de nuit couvre tout le monde.
--   · UN mail par commande de moins de 24 h, qui liste TOUS ses articles
--     (push_ventes.articles) ; les notes nées pour ses articles ne partent jamais
--     seules ; une commande plus ancienne : aucun mail (fillsell.vente_declaree).
--   · Prix : le montant par article de Vinted s'il existe ; sinon le total au
--     prorata des prix d'annonce, centimes au plus grand reste, somme = total ; une
--     base manquante = NULL (inconnu), jamais 0 ; un prix saisi par la personne
--     garde son prix (vinted_lot_parts).
--   · Une ligne « lot » née AVANT cette migration attend le script de réparation
--     (sauvegarde + inverse) : scripts/reparations/20261017_ventes_vinted_en_lot.sql.
--   · R1 (point 12) : une commande Vinted ni vendue ni annulée laisse une trace
--     (usage_logs 'vente_vinted_commande_lue', une fois) sur les ventes sans
--     commande qu'elle désigne par numéro.
-- Les deux corps remplacés (enregistrer_ventes_relevees, push_ventes_a_envoyer) sont
-- ceux lus EN PROD le 17/10 (pg_get_functiondef ; md5 vérifiés ci-dessous : la
-- migration S'ARRÊTE si une définition a bougé) ; seules les lignes de la règle changent.
-- ⚠️ vente_commande_annulee_vinted et inventaire_vendu_vinted_par_la_vente (point 12,
-- migrations A et B) ne sont PAS touchées ici ; la signature de la première
-- (bigint, text, text, timestamptz) doit rester la même.
--
-- Essai à blanc (ROLLBACK) : scripts/essais/20261017120000_essai.sql.
-- Inverse : supabase/rollbacks/20261017120000_ventes_vinted_en_lot.sql.
-- ⛔ FEU VERT NOMMÉ DE NICO REQUIS. Application :
--   npx supabase db query --linked -f supabase/migrations/20261017120000_ventes_vinted_en_lot.sql
--   npx supabase migration repair --linked --status applied 20261017120000
-- Selftest : scripts/vente-vinted-en-lot-selftest.mjs.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ── 0. Les définitions de prod n'ont pas bougé depuis leur lecture (17/10) ──
DO $garde$
DECLARE
  v_attendu jsonb := '[["enregistrer_ventes_relevees(text,jsonb,uuid)","5d1980a5c3eda3f772c48d23803a7dbe"],["push_ventes_a_envoyer(integer)","369018f6704cb31ddb348183b333b368"]]'::jsonb;
  v_e jsonb;
BEGIN
  FOR v_e IN SELECT value FROM jsonb_array_elements(v_attendu) LOOP
    IF md5(pg_get_functiondef((v_e ->> 0)::regprocedure)) IS DISTINCT FROM (v_e ->> 1) THEN
      RAISE EXCEPTION 'définition de % changée en prod depuis le 17/10 : migration arrêtée, rien n''est écrit', v_e ->> 0;
    END IF;
  END LOOP;
  IF to_regclass('public.vinted_commandes_articles') IS NOT NULL THEN
    RAISE EXCEPTION 'vinted_commandes_articles existe déjà : migration déjà passée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 1. La composition d'une commande Vinted (transaction.order.item_ids) ──────
-- Une ligne PAR ARTICLE de la commande, écrite par le relevé des ventes (détail)
-- et par la veille des commandes (comptes payants) ; jamais déduite d'un titre.
CREATE TABLE public.vinted_commandes_articles (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commande_ref  text        NOT NULL CHECK (commande_ref ~ '^[0-9]{1,24}$'),
  item_id       text        NOT NULL CHECK (item_id ~ '^[0-9]{1,24}$'),
  position      integer     NOT NULL DEFAULT 1,
  nb_articles   integer     NOT NULL CHECK (nb_articles >= 1),
  statut        text,
  paye          boolean,
  total         numeric,
  devise        text,
  commande_le   timestamptz,
  prix_vinted   numeric,
  titre_vinted  text,
  source        text        NOT NULL,
  inventaire_id bigint,
  vente_id      bigint,
  prix_part     numeric,
  decision      text,
  motif         text,
  decide_le     timestamptz,
  eclatee_le    timestamptz,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  maj_le        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, commande_ref, item_id)
);
COMMENT ON TABLE public.vinted_commandes_articles IS
  '17/10 (point 11) : les articles d''une commande Vinted, lus dans transaction.order.item_ids par la session du vendeur — jamais un titre. Une commande à plusieurs articles = une vente par article (commande_ref ''<ref>:<item_id>'').';
CREATE INDEX vinted_commandes_articles_article ON public.vinted_commandes_articles (user_id, item_id);
ALTER TABLE public.vinted_commandes_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY vinted_commandes_articles_lire ON public.vinted_commandes_articles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.vinted_commandes_articles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vinted_commandes_articles TO authenticated;

-- ── 2. La note d'une commande porte SES articles (UN mail qui les liste tous) ──
ALTER TABLE public.push_ventes ADD COLUMN articles jsonb;
COMMENT ON COLUMN public.push_ventes.articles IS
  '17/10 (point 11) : les articles d''une commande Vinted [{titre, prix, inventaire_id, connu}] — push-ventes en fait UN mail ; NULL = la note est un article (comme avant).';

-- ── 3. Interrupteur et date d'effet : un en-tête « lot » né AVANT cette règle
--      attend le script de réparation (sauvegarde + inverse) ; 0 = règle coupée
--      (la composition est gardée, rien n'est éclaté).
INSERT INTO public.coin_config (key, value) VALUES ('ventes_vinted_lot_depuis', floor(extract(epoch FROM now()))::integer)
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

-- ── 4. (R4) Une commande Vinted failed / canceled / cancelled n'est JAMAIS une vente prouvée ──
CREATE OR REPLACE FUNCTION public.vinted_commande_annulee(p_statut text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(btrim(coalesce(p_statut, ''))) IN ('failed', 'canceled', 'cancelled')
$function$;

-- ── 5. Garder la composition (numéros EXACTS, dans l'ordre de Vinted) ─────────
-- Aucune ligne inchangée n'est réécrite ; une valeur connue n'est jamais
-- remplacée par un vide.
CREATE OR REPLACE FUNCTION public.vinted_lot_composer(p_user uuid, p_ref text, p_ids jsonb, p_statut text, p_paye boolean,
  p_total numeric, p_devise text, p_le timestamptz, p_articles jsonb, p_source text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ref text := nullif(btrim(coalesce(p_ref, '')), '');
  v_ids text[];
  v_n   integer;
BEGIN
  IF p_user IS NULL OR v_ref IS NULL OR v_ref !~ '^[0-9]{1,24}$' OR jsonb_typeof(p_ids) IS DISTINCT FROM 'array' THEN
    RETURN 0;
  END IF;
  SELECT array_agg(x.id ORDER BY x.o) INTO v_ids FROM (
    SELECT btrim(e.v) AS id, min(e.o) AS o
      FROM jsonb_array_elements_text(p_ids) WITH ORDINALITY AS e(v, o)
     WHERE btrim(e.v) ~ '^[0-9]{1,24}$'
     GROUP BY btrim(e.v)) x;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 OR v_n > 100 THEN RETURN 0; END IF;
  INSERT INTO vinted_commandes_articles AS c (user_id, commande_ref, item_id, position, nb_articles, statut, paye, total,
         devise, commande_le, prix_vinted, titre_vinted, source)
  SELECT p_user, v_ref, a.id, a.o::integer, v_n, nullif(btrim(coalesce(p_statut, '')), ''), p_paye,
         CASE WHEN p_total > 0 THEN p_total END, nullif(btrim(coalesce(p_devise, '')), ''), p_le,
         CASE WHEN (ar.art ->> 'prix') ~ '^[0-9]+([.][0-9]+)?$' AND (ar.art ->> 'prix')::numeric > 0
              THEN (ar.art ->> 'prix')::numeric END,
         nullif(btrim(coalesce(ar.art ->> 'titre', '')), ''),
         coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'releve')
    FROM unnest(v_ids) WITH ORDINALITY AS a(id, o)
    LEFT JOIN LATERAL (
      SELECT e AS art FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_articles) = 'array' THEN p_articles ELSE '[]'::jsonb END) e
       WHERE btrim(coalesce(e ->> 'item_id', '')) = a.id LIMIT 1) ar ON true
  ON CONFLICT (user_id, commande_ref, item_id) DO UPDATE SET
    position     = excluded.position,
    nb_articles  = excluded.nb_articles,
    statut       = coalesce(excluded.statut, c.statut),
    paye         = coalesce(excluded.paye, c.paye),
    total        = coalesce(excluded.total, c.total),
    devise       = coalesce(excluded.devise, c.devise),
    commande_le  = coalesce(c.commande_le, excluded.commande_le),
    prix_vinted  = coalesce(excluded.prix_vinted, c.prix_vinted),
    titre_vinted = coalesce(excluded.titre_vinted, c.titre_vinted),
    maj_le       = now()
  WHERE (c.position, c.nb_articles, c.statut, c.paye, c.total, c.devise, c.commande_le, c.prix_vinted, c.titre_vinted)
        IS DISTINCT FROM
        (excluded.position, excluded.nb_articles, coalesce(excluded.statut, c.statut), coalesce(excluded.paye, c.paye),
         coalesce(excluded.total, c.total), coalesce(excluded.devise, c.devise), coalesce(c.commande_le, excluded.commande_le),
         coalesce(excluded.prix_vinted, c.prix_vinted), coalesce(excluded.titre_vinted, c.titre_vinted));
  RETURN v_n;
END;
$function$;

-- ── 6. Le prix de chaque article (règle de Nico du 17/10) ─────────────────────
--   1. le montant de CHAQUE article donné par Vinted : tel quel ;
--   2. sinon le TOTAL de la commande (ce que touche le vendeur) : une vente déjà
--      enregistrée dont le prix vient de la PERSONNE (aucun reçu de son annonce)
--      garde son prix (02/10) et sort du total ; le reste se partage entre les
--      autres articles au prorata de leur prix d'annonce au moment de la commande
--      (relevé du dressing avant la commande, sinon le premier relevé, sinon le
--      prix du job, sinon le prix de la fiche) ; centimes : partie entière, puis
--      un centime à la fois aux plus grandes fractions (égalité : numéro
--      croissant) — la somme vaut le reste EXACTEMENT ; un seul article restant
--      prend le reste ;
--   3. une base manquante, un reste ≤ 0 ou un total inconnu : NULL (inconnu,
--      jamais 0).
CREATE OR REPLACE FUNCTION public.vinted_lot_parts(p_user uuid, p_ref text)
 RETURNS TABLE(item_id text, prix numeric, base numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids     text[];
  v_pv      numeric[];
  v_total   numeric;
  v_le      timestamptz;
  v_n       integer;
  v_k       integer;
  v_garde   numeric[];
  v_base    numeric[];
  v_prix    numeric[];
  v_src     text[];
  v_restants integer[] := '{}';
  v_vente   record;
  v_reste   numeric;
  v_reste_c bigint;
  v_somme   numeric;
  v_t       numeric;
  v_manque  integer := 0;
  v_alloue  bigint;
BEGIN
  SELECT array_agg(c.item_id ORDER BY c.position, c.item_id), array_agg(c.prix_vinted ORDER BY c.position, c.item_id),
         max(c.total), max(c.commande_le)
    INTO v_ids, v_pv, v_total, v_le
    FROM vinted_commandes_articles c
   WHERE c.user_id = p_user AND c.commande_ref = p_ref;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN RETURN; END IF;
  -- 1. Vinted donne le montant de chaque article : tel quel.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_pv) x WHERE x IS NULL OR x <= 0) THEN
    RETURN QUERY SELECT v_ids[k], round(v_pv[k], 2), NULL::numeric, 'vinted'::text FROM generate_series(1, v_n) AS k;
    RETURN;
  END IF;
  v_garde := array_fill(NULL::numeric, ARRAY[v_n]);
  v_base  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_prix  := array_fill(NULL::numeric, ARRAY[v_n]);
  v_src   := array_fill(NULL::text, ARRAY[v_n]);
  -- 2a. Une vente déjà enregistrée SANS reçu de son annonce (saisie, confirmation
  --     de la personne) garde son prix ; celle d'un job (reçu) reçoit sa part.
  FOR v_k IN 1..v_n LOOP
    SELECT v.id, v.prix_vente INTO v_vente FROM ventes v
     WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = v_ids[v_k]
     ORDER BY v.id LIMIT 1;
    IF v_vente.id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM ventes_operations o
          WHERE o.user_id = p_user AND o.cle = 'annonce:vinted:' || v_ids[v_k]
            AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v_vente.id])) THEN
      v_src[v_k] := 'saisie';
      v_garde[v_k] := v_vente.prix_vente;
      v_prix[v_k] := v_vente.prix_vente;
    ELSE
      v_restants := v_restants || v_k;
    END IF;
  END LOOP;
  IF cardinality(v_restants) > 0 AND v_total IS NOT NULL AND v_total > 0 THEN
    IF EXISTS (SELECT 1 FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie' AND v_garde[k] IS NULL) THEN
      v_reste := NULL;                                   -- une saisie sans prix : le reste est inconnu
    ELSE
      v_reste := v_total - coalesce((SELECT sum(v_garde[k]) FROM generate_series(1, v_n) AS k WHERE v_src[k] = 'saisie'), 0);
    END IF;
    IF v_reste IS NOT NULL AND v_reste > 0 THEN
      IF cardinality(v_restants) = 1 THEN
        v_prix[v_restants[1]] := round(v_reste, 2);
        v_src[v_restants[1]] := 'reste';
      ELSE
        FOREACH v_k IN ARRAY v_restants LOOP
          v_t := coalesce(
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
                AND (v_le IS NULL OR s.captured_at <= v_le)
              ORDER BY s.captured_at DESC LIMIT 1),
            (SELECT s.price FROM vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id = v_ids[v_k] AND s.price > 0
              ORDER BY s.captured_at ASC LIMIT 1),
            (SELECT coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'detected_price')::numeric END,
                             j.price,
                             CASE WHEN j.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields ->> 'prix_recreation')::numeric END,
                             CASE WHEN j.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                                  THEN (j.platform_fields #>> '{republish_snapshot,prix}')::numeric END)
               FROM cross_post_jobs j
              WHERE j.user_id = p_user AND j.platform = 'vinted' AND j.action IN ('publish', 'republish')
                AND btrim(coalesce(j.platform_listing_id, '')) = v_ids[v_k]
              ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1),
            (SELECT i.prix_vente FROM inventaire i
              WHERE i.user_id = p_user AND i.vinted_item_id = v_ids[v_k] AND i.fusionne_dans IS NULL));
          IF v_t IS NULL OR v_t <= 0 THEN
            v_manque := v_manque + 1;
          ELSE
            v_base[v_k] := v_t;
          END IF;
        END LOOP;
        IF v_manque = 0 THEN
          v_somme := (SELECT sum(v_base[k]) FROM unnest(v_restants) AS k);
          v_reste_c := round(v_reste * 100);
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := floor(v_reste_c * v_base[v_k] / v_somme);
          END LOOP;
          v_alloue := (SELECT sum(v_prix[k]) FROM unnest(v_restants) AS k);
          FOR v_k IN
            SELECT k FROM unnest(v_restants) AS k
             ORDER BY (v_reste_c * v_base[k] / v_somme) - floor(v_reste_c * v_base[k] / v_somme) DESC,
                      length(v_ids[k]), v_ids[k]
             LIMIT greatest(v_reste_c - v_alloue, 0)
          LOOP
            v_prix[v_k] := v_prix[v_k] + 1;
          END LOOP;
          FOREACH v_k IN ARRAY v_restants LOOP
            v_prix[v_k] := v_prix[v_k] / 100.0;
            v_src[v_k] := 'prorata';
          END LOOP;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_ids[k], round(v_prix[k], 2), v_base[k], v_src[k] FROM generate_series(1, v_n) AS k;
END;
$function$;

-- ── 7. La note de la commande : UN mail qui liste TOUS ses articles ────────────
-- Seulement pour une commande de moins de 24 h dont au moins un article est
-- suivi par FillSell. Les articles déjà annoncés avant (une page « vendue » lue
-- plus tôt) restent dans la liste du mail mais ne décident rien.
CREATE OR REPLACE FUNCTION public.push_noter_commande_vinted(p_user uuid, p_ref text, p_vente bigint, p_articles jsonb,
  p_total numeric, p_devise text, p_vendu_le timestamptz)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_xact   bigint := pg_current_xact_id()::text::bigint;
  v_n      integer;
  v_cles   text[] := ARRAY[]::text[];
  a        jsonb;
  v_ka     text[];
  v_motif  text;
  v_statut text;
  v_titre  text;
  v_id     bigint;
BEGIN
  IF p_user IS NULL OR p_ref IS NULL OR jsonb_typeof(p_articles) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  v_n := jsonb_array_length(p_articles);
  IF v_n = 0 THEN RETURN NULL; END IF;
  -- Aucun article suivi par FillSell : pas de mail (la vente et la question restent).
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_articles) x WHERE (x ->> 'inventaire_id') IS NOT NULL) THEN RETURN NULL; END IF;
  -- Une note de CETTE commande existe déjà : jamais deux.
  IF EXISTS (SELECT 1 FROM push_ventes o WHERE o.user_id = p_user AND o.statut <> 'ignoree'
              AND o.cles @> ARRAY['commande:vinted:' || p_ref]) THEN
    RETURN NULL;
  END IF;
  -- Ne décident que les articles NEUFS : vendus par CETTE commande (jamais une vente
  -- adoptée, déjà enregistrée) et jamais annoncés avant (leur annonce).
  FOR a IN SELECT value FROM jsonb_array_elements(p_articles) LOOP
    CONTINUE WHEN coalesce(a ->> 'decision', '') IN ('adoptee', 'supprimee_par_la_personne');
    v_ka := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(a -> 'cles') = 'array' THEN a -> 'cles' ELSE '[]'::jsonb END));
    IF cardinality(v_ka) > 0 AND NOT EXISTS (
         SELECT 1 FROM push_ventes o
          WHERE o.user_id = p_user AND o.lot IS DISTINCT FROM v_xact
            AND (o.part_le IS NOT NULL OR o.statut IN ('envoyee', 'en_envoi', 'declaree'))
            AND o.cles && ARRAY(SELECT k FROM unnest(v_ka) k WHERE k LIKE 'annonce:%')) THEN
      v_cles := v_cles || v_ka;
    END IF;
  END LOOP;
  -- Tout était déjà annoncé article par article : rien de neuf à dire.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_cles) k WHERE k LIKE 'annonce:vinted:%') THEN RETURN NULL; END IF;
  v_cles := ARRAY(SELECT DISTINCT k FROM unnest(v_cles || ('commande:vinted:' || p_ref)) AS k);
  v_titre := CASE WHEN v_n = 1 THEN coalesce(p_articles -> 0 ->> 'titre', 'Article Vinted')
                  ELSE 'Commande Vinted : ' || v_n || ' articles' END;
  v_motif := push_vente_deja_signalee(p_user, 'vinted', v_cles, now(), NULL, false);
  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' ELSE 'doublon' END;
  INSERT INTO push_ventes (user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id, titre,
                           prix, devise, vendu_le, cles, statut, motif, traite_le, lot, preuve_recente, articles)
  VALUES (p_user, 'commande', 'vinted', p_vente,
          CASE WHEN v_n = 1 THEN nullif(p_articles -> 0 ->> 'inventaire_id', '')::bigint END, NULL, p_ref,
          CASE WHEN v_n = 1 THEN p_articles -> 0 ->> 'item_id' END,
          left(v_titre, 200), CASE WHEN p_total > 0 THEN p_total END, p_devise, p_vendu_le, v_cles, v_statut, v_motif,
          CASE WHEN v_motif IS NOT NULL THEN now() END, v_xact,
          left('commande:' || coalesce(to_char(p_vendu_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI'), '?'), 120),
          (SELECT jsonb_agg(jsonb_build_object('titre', x ->> 'titre', 'prix', x -> 'prix',
                                               'inventaire_id', x -> 'inventaire_id', 'connu', (x ->> 'inventaire_id') IS NOT NULL)
                            ORDER BY o)
             FROM jsonb_array_elements(p_articles) WITH ORDINALITY AS t(x, o)))
  RETURNING id INTO v_id;
  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  IF v_statut = 'a_envoyer' AND coalesce(current_setting('fillsell.push_relance', true), '') <> '1' THEN
    PERFORM set_config('fillsell.push_relance', '1', true);
    PERFORM net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter_commande_vinted"}'::jsonb,
      timeout_milliseconds := 60000
    );
  END IF;
  RETURN v_id;
END;
$function$;

-- ── 8. UNE COMMANDE = SES ARTICLES : une vente par article, par le circuit normal ──
-- Tout ou rien pour une commande : au premier doute, rien n'est écrit (la ligne
-- d'attente du relevé reste), la composition dit pourquoi (decision 'en_doute',
-- motif) et usage_logs 'vente_vinted_lot_doute' le garde une fois.
--   D1 une vente de CET article existe (preuve de sa page, saisie) : adoptée,
--      jamais doublée ;
--   D2 sa fiche porte une annonce FillSell VIVANTE sur ce numéro : la commande
--      est sa preuve (comme la page « vendue ») et enregistrer_vente_atomique,
--      inchangée, écrit la vente, la fiche vendue et les retraits prouvés ;
--   D3 sa fiche est déjà « vendu » (relevé du dressing) sans aucune vente : la
--      vente s'y rattache, ses copies prouvées partent (armer_retraits_copies) ;
--   D4 sa fiche est en stock sans annonce FillSell sur ce numéro (import) : la
--      vente, puis la fiche vendue — ses copies prouvées partent par
--      inventaire_vendu_retire_ses_copies ;
--   D5 plusieurs fiches, plusieurs annonces, plusieurs exemplaires sans annonce,
--      autre commande : doute ;
--   D6 inconnu de FillSell : une vente sans fiche et la question (usage_logs
--      'vente_vinted_article_inconnu'), JAMAIS un retrait.
-- Les notes nées pour ces articles ne partent jamais seules : la commande a SA
-- note (moins de 24 h) ou aucune.
CREATE OR REPLACE FUNCTION public.vente_vinted_lot_eclater(p_user uuid, p_ref text, p_source text DEFAULT 'releve')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n         integer;
  v_total     numeric;
  v_devise    text;
  v_le        timestamptz;
  v_statut    text;
  v_hdr       ventes%ROWTYPE;
  c           record;
  p           record;
  i           inventaire%ROWTYPE;
  v_parts     jsonb := '{}'::jsonb;
  v_ref_art   text;
  v_part      numeric;
  v_inv       bigint;
  v_n_inv     integer;
  v_job       uuid;
  v_n_job     integer;
  v_vente     bigint;
  v_n_v       integer;
  v_r         jsonb;
  v_rets      jsonb;
  v_dec       text;
  v_pa        numeric;
  v_benef     numeric;
  v_pct       numeric;
  v_prix_job  numeric;
  v_prix_av   numeric;
  v_titre     text;
  v_cles_a    text[];
  v_cles      text[] := ARRAY[]::text[];
  v_articles  jsonb := '[]'::jsonb;
  v_nouvelles integer := 0;
  v_connus    integer := 0;
  v_premiere  bigint;
  v_note      bigint;
  v_motif     text;
  v_xact      bigint := pg_current_xact_id()::text::bigint;
  v_decl      text := current_setting('fillsell.vente_declaree', true);
BEGIN
  IF p_user IS NULL OR coalesce(p_ref, '') !~ '^[0-9]{1,24}$' THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'parametres');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':commande-vinted:' || p_ref, 0));
  SELECT count(*), max(x.total), max(x.devise), max(x.commande_le), max(x.statut)
    INTO v_n, v_total, v_devise, v_le, v_statut
    FROM vinted_commandes_articles x WHERE x.user_id = p_user AND x.commande_ref = p_ref;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'issue', 'sans_composition'); END IF;
  IF vinted_commande_annulee(v_statut) THEN RETURN jsonb_build_object('ok', false, 'issue', 'commande_annulee'); END IF;
  IF EXISTS (SELECT 1 FROM vinted_commandes_articles x
              WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.eclatee_le IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', true, 'issue', 'deja_eclatee');
  END IF;
  -- La personne a supprimé la vente de cette commande : elle ne revient jamais (04/10).
  IF EXISTS (SELECT 1 FROM ventes_supprimees s
              WHERE s.user_id = p_user AND s.plateforme_code = 'vinted' AND s.commande_ref = p_ref) THEN
    UPDATE vinted_commandes_articles SET decision = 'supprimee_par_la_personne', decide_le = now(), maj_le = now()
     WHERE user_id = p_user AND commande_ref = p_ref AND decision IS DISTINCT FROM 'supprimee_par_la_personne';
    RETURN jsonb_build_object('ok', false, 'issue', 'supprimee_par_la_personne');
  END IF;
  -- Un relevé en cours peut écrire l'inventaire : la vente attend sa fin (comme enregistrer_vente_prouvee).
  IF EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.user_id = p_user AND r.status = 'running') THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'releve_en_cours');
  END IF;
  SELECT * INTO v_hdr FROM ventes v WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.commande_ref = p_ref;
  -- Une commande à UN article déjà relevée reste l'affaire du relevé (une commande, une vente).
  IF v_n = 1 AND v_hdr.id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'issue', 'deja_relevee'); END IF;
  FOR p IN SELECT * FROM vinted_lot_parts(p_user, p_ref) LOOP
    v_parts := v_parts || jsonb_build_object(p.item_id, p.prix);
  END LOOP;

  BEGIN
    -- Les notes nées pendant l'éclatement sont « déclarées » (ni push ni mail) :
    -- la commande a SA note, plus bas.
    PERFORM set_config('fillsell.vente_declaree', '1', true);
    FOR c IN SELECT * FROM vinted_commandes_articles x
              WHERE x.user_id = p_user AND x.commande_ref = p_ref ORDER BY x.position, x.item_id LOOP
      v_ref_art := CASE WHEN v_n > 1 THEN p_ref || ':' || c.item_id ELSE p_ref END;
      v_part := nullif(v_parts ->> c.item_id, '')::numeric;
      v_dec := NULL; v_vente := NULL; v_inv := NULL; v_job := NULL; v_titre := NULL;
      v_cles_a := ARRAY['annonce:vinted:' || c.item_id];
      IF EXISTS (SELECT 1 FROM ventes_supprimees s
                  WHERE s.user_id = p_user AND s.plateforme_code = 'vinted'
                    AND (s.commande_ref = v_ref_art OR (s.commande_ref IS NULL AND s.annonce_id = c.item_id))) THEN
        v_dec := 'supprimee_par_la_personne';
      ELSE
        IF EXISTS (SELECT 1 FROM ventes v
                    WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = c.item_id
                      AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref_art AND v.commande_ref <> p_ref) THEN
          RAISE EXCEPTION 'doute:article_d_une_autre_commande:%', c.item_id;
        END IF;
        SELECT count(*), min(v.id) INTO v_n_v, v_vente FROM ventes v
         WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.annonce_id = c.item_id
           AND (v.commande_ref IS NULL OR v.commande_ref = v_ref_art);
        IF v_n_v > 1 THEN RAISE EXCEPTION 'doute:ventes_multiples:%', c.item_id; END IF;
        IF v_vente IS NOT NULL THEN
          -- (D1) adoptée : la commande se pose dessus ; son prix suit la règle (saisie gardée).
          SELECT v.prix_vente, v.inventaire_id, v.titre INTO v_prix_av, v_inv, v_titre FROM ventes v WHERE v.id = v_vente;
          IF v_part IS NOT NULL AND v_part IS DISTINCT FROM v_prix_av AND EXISTS (
               SELECT 1 FROM ventes_operations o
                WHERE o.user_id = p_user AND o.cle = 'annonce:vinted:' || c.item_id
                  AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v_vente])) THEN
            UPDATE ventes v SET prix_vente = v_part,
                   benefice = CASE WHEN v.prix_achat IS NOT NULL
                                   THEN v_part - v.prix_achat
                                        - coalesce((SELECT x.purchase_costs FROM inventaire x WHERE x.id = v.inventaire_id), 0)
                                        - coalesce(v.frais_plateforme, v.selling_fees, 0) END
             WHERE v.id = v_vente;
            UPDATE inventaire x SET prix_vente = v_part,
                   margin = CASE WHEN x.prix_achat IS NOT NULL AND NOT x.prix_achat_inconnu
                                 THEN v_part - x.prix_achat - coalesce(x.purchase_costs, 0) END,
                   margin_pct = CASE WHEN x.prix_achat IS NOT NULL AND NOT x.prix_achat_inconnu AND v_part > 0
                                     THEN (v_part - x.prix_achat - coalesce(x.purchase_costs, 0)) / v_part * 100 END
             WHERE x.id = v_inv AND x.user_id = p_user AND x.statut = 'vendu' AND x.prix_vente IS NOT DISTINCT FROM v_prix_av;
          END IF;
          UPDATE ventes v SET commande_ref = v_ref_art, vendu_le = coalesce(v.vendu_le, v_le), releve_le = now()
           WHERE v.id = v_vente;
          v_dec := 'adoptee';
        ELSE
          -- La fiche, par le NUMÉRO exact (jamais le titre).
          SELECT * INTO i FROM inventaire x
           WHERE x.user_id = p_user AND x.vinted_item_id = c.item_id AND x.fusionne_dans IS NULL;
          IF i.id IS NULL THEN
            SELECT count(DISTINCT jj.inventaire_id), min(jj.inventaire_id) INTO v_n_inv, v_inv FROM cross_post_jobs jj
             WHERE jj.user_id = p_user AND jj.platform = 'vinted' AND jj.action IN ('publish', 'republish')
               AND btrim(coalesce(jj.platform_listing_id, '')) = c.item_id AND jj.inventaire_id IS NOT NULL
               AND public.retrait_job_prouve(jj.id);
            IF v_n_inv > 1 THEN RAISE EXCEPTION 'doute:plusieurs_fiches:%', c.item_id; END IF;
            IF v_inv IS NOT NULL THEN
              SELECT * INTO i FROM inventaire x WHERE x.id = v_inv AND x.user_id = p_user;
              IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN RAISE EXCEPTION 'doute:fiche_fusionnee:%', c.item_id; END IF;
            END IF;
          END IF;
          v_inv := i.id;
          IF v_inv IS NOT NULL THEN
            SELECT count(*), (array_agg(jj.id ORDER BY jj.created_at DESC))[1] INTO v_n_job, v_job FROM cross_post_jobs jj
             WHERE jj.user_id = p_user AND jj.inventaire_id = v_inv AND jj.platform = 'vinted' AND jj.status = 'published'
               AND jj.action IN ('publish', 'republish') AND btrim(coalesce(jj.platform_listing_id, '')) = c.item_id;
            IF v_n_job > 1 THEN RAISE EXCEPTION 'doute:plusieurs_annonces:%', c.item_id; END IF;
            v_titre := i.titre;
            v_cles_a := v_cles_a || ('fiche:' || v_inv::text);
          END IF;
          IF v_inv IS NOT NULL AND v_job IS NOT NULL THEN
            -- (D2) la commande est la preuve de CETTE annonce ; le circuit normal écrit la vente.
            IF i.statut IS DISTINCT FROM 'stock' THEN RAISE EXCEPTION 'doute:fiche_deja_vendue:%', c.item_id; END IF;
            UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object(
                        'sale_signal', 'sold',
                        'unavailable_since', CASE
                           WHEN _ts_ou_null(platform_fields ->> 'unavailable_since') IS NOT NULL
                                AND _ts_ou_null(platform_fields ->> 'unavailable_since') <= coalesce(v_le, now())
                           THEN platform_fields ->> 'unavailable_since'
                           ELSE to_char(coalesce(v_le, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
                        'sale_evidence', jsonb_build_object('source', 'commande_vinted', 'commande', p_ref,
                           'listing_id', c.item_id, 'platform', 'vinted', 'state', 'sold', 'exact', true,
                           'lu_le', now(), 'pose_par', 'vente_vinted_lot_eclater:' || coalesce(p_source, '')))
                   || CASE WHEN v_part IS NOT NULL THEN jsonb_build_object('detected_price', v_part) ELSE '{}'::jsonb END
             WHERE id = v_job AND status = 'published';
            SELECT coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields ->> 'detected_price')::numeric END,
                            j.price,
                            CASE WHEN j.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields ->> 'prix_recreation')::numeric END,
                            CASE WHEN j.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                                 THEN (j.platform_fields #>> '{republish_snapshot,prix}')::numeric END)
              INTO v_prix_job FROM cross_post_jobs j WHERE j.id = v_job;
            v_r := enregistrer_vente_atomique(p_user, NULL, p_job := v_job, p_prix := coalesce(v_part, v_prix_job));
            IF coalesce(v_r ->> 'ok', 'false') <> 'true' THEN
              RAISE EXCEPTION 'doute:refus:%:%', c.item_id, left(coalesce(v_r ->> 'code', '') || ' ' || coalesce(v_r ->> 'reason', ''), 160);
            END IF;
            v_vente := nullif(v_r -> 'ventes_ids' ->> 0, '')::bigint;
            IF v_vente IS NULL THEN RAISE EXCEPTION 'doute:vente_absente:%', c.item_id; END IF;
            UPDATE ventes v SET commande_ref = v_ref_art, vendu_le = coalesce(v.vendu_le, v_le), releve_le = now()
             WHERE v.id = v_vente;
            v_cles_a := v_cles_a || ('job:' || v_job::text);
            v_dec := CASE WHEN coalesce(v_r ->> 'rejouee', 'false') = 'true' THEN 'adoptee' ELSE 'vente_par_annonce' END;
          ELSIF v_inv IS NOT NULL AND i.statut = 'vendu' THEN
            -- (D3) fiche déjà « vendu » sans aucune vente : la vente s'y rattache.
            IF EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = p_user AND v.inventaire_id = v_inv) THEN
              RAISE EXCEPTION 'doute:fiche_deja_vendue_ailleurs:%', c.item_id;
            END IF;
            v_pa := CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
            v_benef := CASE WHEN v_pa IS NOT NULL AND v_part IS NOT NULL THEN v_part - v_pa - coalesce(i.purchase_costs, 0) END;
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_achat, prix_vente, benefice, marque, type, description,
                                emplacement, date, vendu_le, plateforme, plateforme_code, commande_ref, annonce_id, source,
                                releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, v_inv, i.titre, v_pa, v_part, v_benef, i.marque, i.type, i.description, i.emplacement,
                    (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le, 'Vinted', 'vinted', v_ref_art, c.item_id,
                    'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, v_inv, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:recu_existant:%', c.item_id; END IF;
            v_rets := armer_retraits_copies(v_inv, 'vente_commande_vinted', NULL, 'vinted', interval '10 minutes');
            v_dec := 'vente_fiche_deja_vendue';
          ELSIF v_inv IS NOT NULL AND i.statut = 'stock' THEN
            -- (D4) fiche importée, sans annonce FillSell vivante sur ce numéro.
            IF coalesce(i.quantite, 1) > 1 THEN RAISE EXCEPTION 'doute:plusieurs_exemplaires_sans_annonce:%', c.item_id; END IF;
            v_pa := CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
            v_benef := CASE WHEN v_pa IS NOT NULL AND v_part IS NOT NULL THEN v_part - v_pa - coalesce(i.purchase_costs, 0) END;
            v_pct := CASE WHEN v_benef IS NOT NULL AND v_part > 0 THEN v_benef / v_part * 100 END;
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_achat, prix_vente, benefice, marque, type, description,
                                emplacement, date, vendu_le, plateforme, plateforme_code, commande_ref, annonce_id, source,
                                releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, v_inv, i.titre, v_pa, v_part, v_benef, i.marque, i.type, i.description, i.emplacement,
                    (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le, 'Vinted', 'vinted', v_ref_art, c.item_id,
                    'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, v_inv, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:recu_existant:%', c.item_id; END IF;
            UPDATE inventaire x SET statut = 'vendu', quantite = 0, prix_vente = coalesce(v_part, x.prix_vente),
                   margin = CASE WHEN v_part IS NOT NULL THEN v_benef ELSE x.margin END,
                   margin_pct = CASE WHEN v_part IS NOT NULL THEN v_pct ELSE x.margin_pct END,
                   plateforme = 'Vinted', date = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             WHERE x.id = v_inv AND x.user_id = p_user AND x.statut = 'stock';
            IF NOT FOUND THEN RAISE EXCEPTION 'doute:fiche_changee:%', c.item_id; END IF;
            v_dec := 'vente_fiche_importee';
          ELSIF v_inv IS NOT NULL THEN
            RAISE EXCEPTION 'doute:statut_fiche:%:%', c.item_id, coalesce(i.statut, '?');
          ELSE
            -- (D6) inconnu de FillSell : vente sans fiche, la question, JAMAIS un retrait.
            v_titre := coalesce(c.titre_vinted, 'Article Vinted ' || c.item_id || ' (pas suivi par FillSell)');
            INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code,
                                commande_ref, annonce_id, source, releve_le, devise, quantite, statut, selling_fees)
            VALUES (p_user, NULL, v_titre, v_part, (coalesce(v_le, now()) AT TIME ZONE 'Europe/Paris')::date, v_le,
                    'Vinted', 'vinted', v_ref_art, c.item_id, 'releve', now(), v_devise, 1, 'vendu', 0)
            RETURNING id INTO v_vente;
            INSERT INTO ventes_operations (user_id, cle, inventaire_id, job_id, resultat)
            VALUES (p_user, 'annonce:vinted:' || c.item_id, NULL, NULL, jsonb_build_object('ok', true, 'venteCreated', true,
                    'ventes_ids', jsonb_build_array(v_vente), 'par', 'vente_vinted_lot_eclater', 'commande', p_ref))
            ON CONFLICT (user_id, cle) DO NOTHING;
            IF NOT EXISTS (SELECT 1 FROM usage_logs u
                            WHERE u.user_id = p_user AND u.feature = 'vente_vinted_article_inconnu'
                              AND u.metadata ->> 'commande' = p_ref AND u.metadata ->> 'annonce' = c.item_id) THEN
              INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_article_inconnu',
                jsonb_build_object('commande', p_ref, 'annonce', c.item_id, 'vente', v_vente, 'prix', v_part,
                  'question', 'Article vendu sur Vinted que FillSell ne suit pas : s''il est en vente ailleurs hors FillSell, retire-le là-bas.',
                  'par', 'vente_vinted_lot_eclater', 'source', p_source));
            END IF;
            v_dec := 'article_inconnu';
          END IF;
          v_nouvelles := v_nouvelles + 1;
        END IF;
      END IF;
      IF v_inv IS NOT NULL THEN v_connus := v_connus + 1; END IF;
      UPDATE vinted_commandes_articles x
         SET inventaire_id = v_inv, vente_id = v_vente, prix_part = v_part, decision = v_dec, motif = NULL,
             decide_le = now(), maj_le = now()
       WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.item_id = c.item_id;
      IF v_vente IS NOT NULL THEN
        v_premiere := coalesce(v_premiere, v_vente);
        v_cles_a := v_cles_a || ('commande:vinted:' || v_ref_art);
        v_cles := v_cles || v_cles_a;
        v_articles := v_articles || jsonb_build_array(jsonb_build_object(
          'item_id', c.item_id, 'vente_id', v_vente, 'inventaire_id', v_inv, 'decision', v_dec,
          'titre', coalesce(v_titre, (SELECT v.titre FROM ventes v WHERE v.id = v_vente)),
          'prix', (SELECT v.prix_vente FROM ventes v WHERE v.id = v_vente), 'cles', to_jsonb(v_cles_a)));
      END IF;
    END LOOP;
    -- La ligne d'attente « Lot N articles » du relevé : remplacée par ses articles, trace complète.
    IF v_hdr.id IS NOT NULL AND v_n > 1 THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_lot_eclatee', jsonb_build_object(
        'commande', p_ref, 'avant', to_jsonb(v_hdr), 'articles', v_articles, 'par', 'vente_vinted_lot_eclater', 'source', p_source));
      DELETE FROM ventes WHERE id = v_hdr.id AND user_id = p_user;
    END IF;
    UPDATE vinted_commandes_articles x SET eclatee_le = now(), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref;
    PERFORM set_config('fillsell.vente_declaree', coalesce(v_decl, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('fillsell.vente_declaree', coalesce(v_decl, ''), true);
    v_motif := left(SQLERRM, 300);
    UPDATE vinted_commandes_articles x SET decision = 'en_doute', motif = v_motif, decide_le = now(), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref
       AND (x.decision IS DISTINCT FROM 'en_doute' OR x.motif IS DISTINCT FROM v_motif);
    IF NOT EXISTS (SELECT 1 FROM usage_logs u
                    WHERE u.user_id = p_user AND u.feature = 'vente_vinted_lot_doute'
                      AND u.metadata ->> 'commande' = p_ref AND u.metadata ->> 'motif' = v_motif) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_lot_doute',
        jsonb_build_object('commande', p_ref, 'motif', v_motif, 'source', p_source, 'par', 'vente_vinted_lot_eclater'));
    END IF;
    RETURN jsonb_build_object('ok', false, 'issue', 'en_doute', 'raison', v_motif);
  END;

  -- Aucune note d'article ne part seule : la commande a SA note (ou aucune).
  IF cardinality(v_cles) > 0 THEN
    UPDATE push_ventes SET statut = 'doublon', motif = 'dans_la_commande', traite_le = now()
     WHERE user_id = p_user AND lot = v_xact AND articles IS NULL AND statut IN ('a_envoyer', 'declaree')
       AND cles && v_cles;
  END IF;
  -- UN mail par commande de moins de 24 h, qui liste TOUS ses articles.
  IF v_nouvelles > 0 AND v_connus > 0 AND v_le IS NOT NULL AND v_le >= now() - interval '24 hours'
     AND coalesce(p_source, '') <> 'reparation' THEN
    v_note := push_noter_commande_vinted(p_user, p_ref, v_premiere, v_articles, v_total, v_devise, v_le);
  END IF;
  RETURN jsonb_build_object('ok', true, 'issue', 'eclatee', 'articles', v_articles, 'note', v_note,
                            'en_tete_retire', v_hdr.id, 'nouvelles', v_nouvelles);
END;
$function$;

-- ── 9. Le relevé de nuit : un lot FINALISÉ s'éclate ; un en-tête d'avant la règle attend la réparation ──
CREATE OR REPLACE FUNCTION public.vente_vinted_lot_noter(p_user uuid, p_ref text, p_statut text, p_source text DEFAULT 'releve')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n      integer;
  v_deja   boolean;
  v_depuis integer;
  v_hdr_le timestamptz;
BEGIN
  IF nullif(btrim(coalesce(p_statut, '')), '') IS NOT NULL THEN
    UPDATE vinted_commandes_articles x SET statut = btrim(p_statut), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.statut IS DISTINCT FROM btrim(p_statut);
  END IF;
  SELECT count(*), coalesce(bool_or(x.eclatee_le IS NOT NULL), false) INTO v_n, v_deja
    FROM vinted_commandes_articles x WHERE x.user_id = p_user AND x.commande_ref = p_ref;
  IF v_n < 2 THEN RETURN jsonb_build_object('ok', false, 'issue', 'pas_un_lot'); END IF;
  IF v_deja THEN RETURN jsonb_build_object('ok', true, 'issue', 'deja_eclatee'); END IF;
  IF public.ventes_statut_classe('vinted', p_statut) IS DISTINCT FROM 'vente' THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'pas_finalisee');
  END IF;
  SELECT value INTO v_depuis FROM coin_config WHERE key = 'ventes_vinted_lot_depuis';
  IF coalesce(v_depuis, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'issue', 'coupe'); END IF;
  SELECT v.created_at INTO v_hdr_le FROM ventes v
   WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.commande_ref = p_ref;
  IF v_hdr_le IS NOT NULL AND v_hdr_le < to_timestamp(v_depuis) THEN
    UPDATE vinted_commandes_articles x SET decision = 'a_reparer', decide_le = now(), maj_le = now()
     WHERE x.user_id = p_user AND x.commande_ref = p_ref AND x.decision IS DISTINCT FROM 'a_reparer' AND x.vente_id IS NULL;
    RETURN jsonb_build_object('ok', false, 'issue', 'a_reparer');
  END IF;
  RETURN public.vente_vinted_lot_eclater(p_user, p_ref, p_source);
END;
$function$;

-- ── 10. (R1, point 12) Une commande ni vendue ni annulée se TRACE sur les ventes sans commande qu'elle désigne ──
CREATE OR REPLACE FUNCTION public.vinted_commande_lue_tracer(p_user uuid, p_ref text, p_statut text, p_row jsonb, p_listing text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids text[];
  r     record;
  v_n   integer := 0;
BEGIN
  v_ids := ARRAY(SELECT DISTINCT btrim(x) FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(p_row -> 'item_ids') = 'array' THEN p_row -> 'item_ids' ELSE '[]'::jsonb END) x
           WHERE btrim(x) ~ '^[0-9]{1,24}$');
  IF nullif(btrim(coalesce(p_listing, '')), '') IS NOT NULL THEN v_ids := v_ids || btrim(p_listing); END IF;
  IF cardinality(v_ids) = 0 OR p_user IS NULL OR p_ref IS NULL THEN RETURN 0; END IF;
  FOR r IN SELECT v.id, v.annonce_id FROM ventes v
            WHERE v.user_id = p_user AND v.plateforme_code = 'vinted' AND v.commande_ref IS NULL
              AND v.annonce_id = ANY (v_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM usage_logs u
                    WHERE u.user_id = p_user AND u.feature = 'vente_vinted_commande_lue'
                      AND u.metadata ->> 'vente' = r.id::text AND u.metadata ->> 'commande' = p_ref
                      AND u.metadata ->> 'statut' = coalesce(p_statut, '')) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_commande_lue', jsonb_build_object(
        'vente', r.id::text, 'annonce', r.annonce_id, 'commande', p_ref, 'statut', coalesce(p_statut, ''),
        'par', 'enregistrer_ventes_relevees'));
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- ── 11. La veille des commandes (comptes payants) : une commande PAYÉE est la preuve de chaque article ──
-- Appelée par l'extension (0.6.123) à chaque commande neuve, 3 au plus par passage
-- (10 lignes au plus par appel). failed / cancelled : JAMAIS une vente (R4) ; une
-- preuve de commande encore posée sur une annonce est levée. Non payée : rien.
-- Plus de 48 h : le relevé de nuit tranche.
CREATE OR REPLACE FUNCTION public.commandes_vinted_noter(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_row    jsonb;
  v_ref    text;
  v_statut text;
  v_paye   boolean;
  v_le     timestamptz;
  v_prix   numeric;
  v_n      integer;
  v_r      jsonb;
  v_job    uuid;
  c_recues integer := 0; c_composees integer := 0; c_annulees integer := 0; c_levees integer := 0;
  c_non_payees integer := 0; c_anciennes integer := 0; c_deja integer := 0; c_eclatees integer := 0; c_doute integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('recues', 0); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
    c_recues := c_recues + 1;
    v_ref := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    IF v_ref IS NULL OR v_ref !~ '^[0-9]{1,24}$' THEN CONTINUE; END IF;
    v_statut := nullif(btrim(coalesce(v_row ->> 'statut', '')), '');
    v_paye := CASE WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('true', 't', '1') THEN true
                   WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('false', 'f', '0') THEN false END;
    v_le := _ts_ou_null(v_row ->> 'date');
    v_prix := CASE WHEN (v_row ->> 'prix') ~ '^[0-9]+([.][0-9]+)?$' THEN (v_row ->> 'prix')::numeric END;
    v_n := vinted_lot_composer(v_user, v_ref, v_row -> 'item_ids', v_statut, v_paye, v_prix,
                               v_row ->> 'devise', v_le, v_row -> 'articles', 'veille');
    IF v_n = 0 THEN CONTINUE; END IF;
    c_composees := c_composees + 1;
    IF vinted_commande_annulee(v_statut) THEN
      c_annulees := c_annulees + 1;
      FOR v_job IN SELECT j.id FROM cross_post_jobs j
                    WHERE j.user_id = v_user AND j.platform = 'vinted' AND j.status = 'published'
                      AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_vinted'
                      AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
        IF signal_vente_lever(v_job, 'commande_vinted_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
          c_levees := c_levees + 1;
        END IF;
      END LOOP;
      UPDATE vinted_commandes_articles x SET decision = 'commande_annulee', decide_le = now(), maj_le = now()
       WHERE x.user_id = v_user AND x.commande_ref = v_ref AND x.vente_id IS NULL
         AND x.decision IS DISTINCT FROM 'commande_annulee';
      CONTINUE;
    END IF;
    IF NOT coalesce(v_paye, false) THEN c_non_payees := c_non_payees + 1; CONTINUE; END IF;
    IF v_le IS NULL OR v_le < now() - interval '48 hours' THEN c_anciennes := c_anciennes + 1; CONTINUE; END IF;
    v_r := vente_vinted_lot_eclater(v_user, v_ref, 'veille');
    IF v_r ->> 'issue' = 'eclatee' THEN c_eclatees := c_eclatees + 1;
    ELSIF v_r ->> 'issue' IN ('deja_eclatee', 'deja_relevee') THEN c_deja := c_deja + 1;
    ELSIF v_r ->> 'issue' = 'en_doute' THEN c_doute := c_doute + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('recues', c_recues, 'composees', c_composees, 'annulees', c_annulees,
    'preuves_levees', c_levees, 'non_payees', c_non_payees, 'anciennes', c_anciennes, 'deja', c_deja,
    'eclatees', c_eclatees, 'en_doute', c_doute);
END;
$function$;

-- ── 12. enregistrer_ventes_relevees : corps de PROD du 17/10 + les seules lignes de la règle ──
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
$function$
;

-- ── 13. push_ventes_a_envoyer : corps de PROD du 17/10 + les articles de la note ──
CREATE OR REPLACE FUNCTION public.push_ventes_a_envoyer(p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_prof     record;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
  v_motif    text;
  v_prix     numeric;
  v_j        record;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus — par canal.
  -- Une note déjà décidée (part_le) ne repasse jamais par la décision : elle
  -- repart par la boucle des relances, plus bas, canal par canal.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  update public.push_ventes
     set mail_statut = case when mail_essais >= 3 then 'echec' else 'a_envoyer' end,
         mail_motif  = case when mail_essais >= 3 then 'envoi_interrompu' else mail_motif end
   where mail_statut = 'en_envoi' and mail_traite_le < now() - interval '3 minutes';
  -- (09/10, Bebertdeals) Une note de JOB attend que sa vente soit ENREGISTRÉE
  -- (push_vente_enregistree, plus bas) : 24 h au plus, puis elle se clôt SANS
  -- mail ni push.
  update public.push_ventes set statut = 'ignoree', motif = 'vente_non_enregistree', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and origine = 'job' and cree_le < now() - interval '24 hours';
  -- Une note jamais décidée en 2 h n'apprend plus rien à personne (hors notes
  -- de job : elles attendent leur vente, ci-dessus).
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and cree_le < now() - interval '2 hours'
     and origine is distinct from 'job';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select x.user_id from (
      select p.user_id, min(p.cree_le) as d from public.push_ventes p
       where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le < now() - interval '15 seconds'
         -- (09/10) une note de job qui attend sa vente ne prend pas la place
         -- des autres comptes : elle revient dès que la vente est enregistrée.
         and (p.origine is distinct from 'job' or p.job_id is null
              or p.cree_le > now() - interval '5 minutes' or public.push_vente_enregistree(p.job_id))
       group by p.user_id
      union all
      select p.user_id, min(coalesce(p.mail_traite_le, p.traite_le, p.cree_le)) from public.push_ventes p
       where p.part_le is not null and (p.statut = 'a_envoyer' or p.mail_statut = 'a_envoyer')
       group by p.user_id
    ) x group by x.user_id order by min(x.d) limit 20
  loop
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    if not pg_try_advisory_xact_lock(hashtextextended('push_ventes:' || v_user::text, 0)) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    select p.email, coalesce(p.lang, 'fr') as lang into v_prof from public.profiles p where p.id = v_user;

    -- Relances d'une vente déjà décidée « part » : chaque canal en attente
    -- repart seul ; la décision n'est jamais refaite.
    for r in
      select * from public.push_ventes
       where user_id = v_user and part_le is not null
         and (statut = 'a_envoyer' or mail_statut = 'a_envoyer')
       order by id
       for update skip locked
    loop
      update public.push_ventes set
        statut = case when statut = 'a_envoyer'
                      then case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end
                      else statut end,
        essais = essais + case when statut = 'a_envoyer' and jsonb_array_length(v_app) > 0 then 1 else 0 end,
        traite_le = case when statut = 'a_envoyer' then now() else traite_le end,
        mail_statut = case when mail_statut = 'a_envoyer' then 'en_envoi' else mail_statut end,
        mail_essais = mail_essais + case when mail_statut = 'a_envoyer' then 1 else 0 end,
        mail_traite_le = case when mail_statut = 'a_envoyer' then now() else mail_traite_le end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.
        'vente_id', r.vente_id, 'articles', r.articles,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang,
        -- (11/10) Vente détectée, pas encore enregistrée : le mail mène à la liste « à confirmer ».
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds'
       order by id
       for update skip locked
    loop
      v_cles := r.cles;
      -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
      if r.vente_id is not null then
        select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
        if found then
          if v_v.annonce_id is not null and r.plateforme is not null then
            v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
          end if;
          if v_v.inventaire_id is not null then
            select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
            if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
          end if;
        end if;
      end if;
      -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
      if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
         and r.cree_le > now() - interval '3 minutes' then
        continue;
      end if;
      v_cles := array(select distinct k from unnest(v_cles) k);
      -- (08/10, Louis) Le signal de vente d'un JOB doit tenir au moment de
      -- décider : la synchro du dressing dément en quelques secondes une vente
      -- collée au mauvais job (vinted_dressing_dement_signaux). Vinted attend
      -- donc 2 minutes ; un signal retiré n'annonce rien (ni push, ni mail).
      if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then
        continue;
      end if;
      if r.origine = 'job' and r.job_id is not null and not exists (
           select 1 from public.cross_post_jobs jj where jj.id = r.job_id
              and (jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')) then
        update public.push_ventes set statut = 'ignoree', motif = 'signal_dementi', traite_le = now() where id = r.id;
        continue;
      end if;
      -- (11/10, Louis) UNE ANNONCE VENDUE NE SE SIGNALE QU'UNE FOIS. Jusqu'ici,
      -- « même vente déjà annoncée » ne regardait que les notes des 3 DERNIERS
      -- JOURS et jamais le reçu de la vente (ventes_operations) : une fiche à
      -- quantité qui revoit une ancienne annonce Vinted « vendue » au relevé
      -- remailait une vente traitée 3 à 5 jours plus tôt. Désormais, sans limite
      -- de temps (push_vente_deja_signalee) : vente déjà enregistrée AVANT ce
      -- signal, ou même annonce / même commande déjà annoncée ou déclarée →
      -- doublon. eBay : la commande seule, jamais l'annonce (une annonce eBay en
      -- quantité se vend plusieurs fois).
      v_motif := public.push_vente_deja_signalee(v_user, r.plateforme, v_cles, r.cree_le, r.id, false);
      -- Même vente vue par son job ou par sa fiche (pièce unique) : fenêtre de
      -- 3 jours, inchangée (une fiche peut revenir en stock après une annulation).
      if v_motif is null and exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')) then
        v_motif := 'meme_job_ou_fiche';
      end if;
      if v_motif is not null then
        update public.push_ventes set statut = 'doublon', motif = v_motif, cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      -- (09/10, Bebertdeals) LE MAIL APRÈS LA VENTE, JAMAIS AVANT NI SANS. Un
      -- signal « vendue » posé sur un job (veilleur, synchro du dressing, API)
      -- n'annonce rien tant que la vente n'est pas ENREGISTRÉE. Une preuve
      -- exacte s'enregistre seule en quelques minutes (ventes_prouvees_tick,
      -- veilleur eBay) : la note part alors, après la vente et ses retraits. Un
      -- signal sans preuve reste une question (bandeau « Vendue ? ») : la note
      -- attend 24 h puis se clôt sans rien envoyer (en tête) ; si la personne
      -- confirme elle-même, sa note « declaree » rend celle-ci doublon (ci-dessus).
      if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then
        continue;
      end if;
      -- (16/10, C1) Le prix ANNONCÉ d'une note de JOB : celui de la vente
      -- ENREGISTRÉE (son reçu : le prix confirmé par la personne, ou la
      -- transaction relevée), à défaut celui de la note, à défaut
      -- prix_vente_du_job. Inconnu = NULL : le mail n'écrit alors aucun
      -- montant (push-ventes). Une panne de ce calcul garde le prix de la note.
      v_prix := r.prix;
      if r.origine = 'job' and r.job_id is not null then
        begin
          select jj.user_id, jj.platform, jj.platform_listing_id, jj.price, jj.platform_fields, jj.inventaire_id
            into v_j from public.cross_post_jobs jj where jj.id = r.job_id;
          if found then
            v_prix := coalesce(public.prix_vente_enregistree(v_j.user_id, v_j.platform, v_j.platform_listing_id, v_j.platform_fields),
                               r.prix,
                               public.prix_vente_du_job(v_j.user_id, v_j.platform, v_j.platform_listing_id,
                                                        v_j.price, v_j.platform_fields, v_j.inventaire_id));
          end if;
        exception when others then
          v_prix := r.prix;
        end;
      end if;
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(), prix = v_prix,
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', v_prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.
        'vente_id', r.vente_id, 'articles', r.articles, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang,
        'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null
                                                  and public.push_vente_enregistree(r.job_id)));
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer' and part_le is null;
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$
;

-- ── 14. Droits : la règle n'est appelable que par la base ; la veille, par son compte ──
REVOKE ALL ON FUNCTION public.vinted_commande_annulee(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vinted_lot_composer(uuid, text, jsonb, text, boolean, numeric, text, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vinted_lot_parts(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_noter_commande_vinted(uuid, text, bigint, jsonb, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vente_vinted_lot_eclater(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vente_vinted_lot_noter(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vinted_commande_lue_tracer(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commandes_vinted_noter(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vinted_commande_annulee(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vinted_lot_composer(uuid, text, jsonb, text, boolean, numeric, text, timestamptz, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vinted_lot_parts(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_noter_commande_vinted(uuid, text, bigint, jsonb, numeric, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.vente_vinted_lot_eclater(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vente_vinted_lot_noter(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vinted_commande_lue_tracer(uuid, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commandes_vinted_noter(jsonb) TO authenticated, service_role;

-- PostgREST voit la RPC neuve tout de suite (l'extension l'appelle).
NOTIFY pgrst, 'reload schema';

COMMIT;
