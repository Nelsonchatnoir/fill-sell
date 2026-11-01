-- INVERSE de 20261101100000 : vinted_lot_parts telle que relue en production le 01/11 avant la migration
-- (pg_get_functiondef, md5 a79190d317b946eff0bd82b9b43cb14d). Aucune donnée à remettre.
begin;

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

commit;
