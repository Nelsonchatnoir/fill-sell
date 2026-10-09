-- INVERSE de scripts/reparations/20261009_audit_ebay_reparations.sql (09/10).
-- Remet ce que la réparation a changé, depuis _backup_0910_audit_ebay :
--   · défait la fusion des deux fiches Xbox (inventaire_defusionner_pour), puis rend
--     aux trois fiches touchées leur ligne ENTIÈRE d'avant — la défusion standard ne
--     rend ni le type, ni le poids, ni un attribut repris (le déclencheur de fusion
--     des attributs n'efface jamais une clé) ;
--   · rend aux jobs eBay e7da7b7b / 8288182d leur ligne entière d'avant ;
--   · rend aux ventes 10170 / 35768 leurs champs d'avant, puis RECRÉE les ventes
--     30584, 76641, 78319, 96766, 42187 à l'identique (mêmes identifiants) et retire
--     leurs lignes de ventes_supprimees ;
--   · retire la question « Déjà vendu ? » posée si elle est encore ouverte.
-- Les restaurations passent SANS déclencheurs (session_replication_role = replica,
-- pour cette transaction seulement) : une ligne remise à l'identique ne doit ni
-- créer de note de vente, ni armer ou annuler de retrait, ni fusionner d'attributs.
-- ⚠️ Si la personne a déjà répondu « Oui » à la question, le retrait armé n'est PAS
--    défait ici (geste de la personne). Une modification faite par la personne sur
--    ces trois fiches ou ces deux jobs APRÈS la réparation serait écrasée.
-- Preuve (transaction annulée) : réparation puis inverse → ventes, fiches, jobs,
-- ventes_supprimees et questions identiques à l'avant (empreintes md5).
-- npx supabase db query --linked -f scripts/reparations/20261009_audit_ebay_reparations_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $f$
DECLARE v jsonb; f text;
BEGIN
  SELECT cle INTO f FROM _backup_0910_audit_ebay WHERE k = 'fusion';
  IF f IS NOT NULL THEN
    v := inventaire_defusionner_pour('de63ca45-63d9-4a3c-b65a-d1345acd8b2e', f::uuid, 'utilisateur:inverse_audit_ebay_0910');
    IF NOT coalesce((v ->> 'ok')::boolean, false) AND v ->> 'reason' IS DISTINCT FROM 'deja_defaite' THEN
      RAISE EXCEPTION 'défusion refusée : %', v;
    END IF;
  END IF;
END $f$;

SET LOCAL session_replication_role = replica;

DO $r$
DECLARE t text; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventaire', 'cross_post_jobs'] LOOP
    SELECT string_agg(format('%I = r.%I', column_name, column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name <> 'id' AND is_generated = 'NEVER';
    EXECUTE format(
      'UPDATE public.%I x SET %s FROM public._backup_0910_audit_ebay b, jsonb_populate_record(NULL::public.%I, b.ligne) r
        WHERE b.k = %L AND x.id = r.id',
      t, cols, t, CASE t WHEN 'inventaire' THEN 'inventaire' ELSE 'job' END);
  END LOOP;
END $r$;

UPDATE ventes v SET
  plateforme = r.plateforme, plateforme_code = r.plateforme_code, plateforme_origine = r.plateforme_origine,
  commande_ref = r.commande_ref, vendu_le = r.vendu_le, devise = r.devise, frais_plateforme = r.frais_plateforme,
  selling_fees = r.selling_fees, annonce_id = r.annonce_id, releve_le = r.releve_le
  FROM _backup_0910_audit_ebay b, jsonb_populate_record(NULL::ventes, b.ligne) r
 WHERE b.k = 'vente' AND b.cle IN ('10170', '35768') AND v.id = r.id;

INSERT INTO ventes
SELECT r.* FROM _backup_0910_audit_ebay b, jsonb_populate_record(NULL::ventes, b.ligne) r
 WHERE b.k = 'vente' AND b.cle IN ('30584', '76641', '78319', '96766', '42187')
   AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.id = r.id);

DELETE FROM ventes_supprimees WHERE vente_id IN (78319, 96766, 42187);

DELETE FROM inventaire_doublons WHERE source = 'reparation_0910_audit_ebay' AND statut = 'proposee';

SET LOCAL session_replication_role = origin;
COMMIT;
