-- INVERSE de 20261023150000_remplacee_par_compte_relie_boutiques_distinctes : remet releve_clos_leve_alertes_disparues
-- telle que relue en prod le 23/10 à 19:32 (md5 153b0383be14997895e3a80f837294a0) et retire les deux fonctions de la règle.
-- Les questions déjà closes par la règle restent closes (leur état d'avant est dans platform_fields.copie_remplacee_par_compte_relie :
-- question_depuis) — aucune donnée n'est réécrite ici.
BEGIN;

CREATE OR REPLACE FUNCTION public.releve_clos_leve_alertes_disparues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_autre uuid; n integer;
BEGIN
  BEGIN
    v := alerte_lever_revues_plateformes(NEW.user_id, NEW.platform);
    IF COALESCE((v ->> 'levees')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % alerte(s) « plus en ligne » levée(s), annonces revues en ligne', NEW.id, NEW.platform, v ->> 'levees';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 3) Boutique partagée entre comptes reliés : ce relevé a aussi revu les annonces du compte relié.
  BEGIN
    FOR v_autre IN
      SELECT CASE WHEN cl.user_a = NEW.user_id THEN cl.user_b ELSE cl.user_a END
        FROM comptes_lies cl WHERE cl.user_a = NEW.user_id OR cl.user_b = NEW.user_id
    LOOP
      IF boutique_partagee_compte_relie(NEW.user_id, v_autre, NEW.platform) THEN
        v := alerte_lever_revues_plateformes(v_autre, NEW.platform);
        IF COALESCE((v ->> 'levees')::int, 0) + COALESCE((v ->> 'a_confirmer_levees')::int, 0) > 0 THEN
          RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → compte relié % : %', NEW.id, NEW.platform, v_autre, v;
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues (compte relié) : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 1e) Beebs : un retrait clos sans preuve dont l'annonce est revue en ligne repart.
  IF NEW.platform = 'beebs' THEN
    BEGIN
      n := retraits_beebs_rearmer_revus(NEW.user_id);
      IF n > 0 THEN
        RAISE LOG 'releve_clos_leve_alertes_disparues : run % (beebs) → % retrait(s) réarmé(s), annonces revues en ligne', NEW.id, n;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_leve_alertes_disparues (retraits Beebs) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$
;

DROP FUNCTION IF EXISTS public.questions_remplacees_par_compte_relie(uuid, text);
DROP FUNCTION IF EXISTS public.remplacee_par_compte_relie(uuid);

COMMIT;
