-- (05/11 matin, point 4 — « Débloque le maintenant », ordre de Nico) LES VISITES DE CONTRÔLE LEBONCOIN PERDUES PAR LA v329
-- La migration 20261105010000 (appliquée le 05/11 vers 09:41, Paris) laisse enfin écrire la visite de contrôle d'une pause
-- Leboncoin. Mais get-pending-jobs v329 (encore en prod) la sert `devant: true` : l'extension ≥ 0.6.170 la lance alors avec
-- le déclencheur « serveur », que sa garde de pause refuse (seuls « bouton_distant » + numéro de relevé passent). La visite
-- reste en file, jamais lue, et l'essai noté dans blocage_acces compte 2 h « en cours » (etatBlocageLbc) : la pause ne se
-- teste qu'au deuxième passage. Amiral (faf5021a, délégué de louis-seller), 25caeedd, a3002ab6 et 7e1a0836 étaient dans ce
-- cas à 09:43.
-- La règle de ce script (jamais un compte nommé) : un essai de contrôle (essai.controle, sans issue, pause non levée) dont
-- le relevé est TOUJOURS en file, jamais réclamé (claimed_at vide), alors que l'extension du compte est revenue APRÈS
-- l'avoir reçu (extension_last_seen_at > essai.le + 1 min), n'a jamais eu lieu : il est retiré (et le compteur `essais`
-- remis d'un cran). Le compte revient à l'état « essai » : au passage suivant, le serveur ressert le MÊME relevé en file,
-- sans `devant` (lireCommandesEnFile), et l'extension le lance en bouton_distant — la vraie visite part. Aucun job, aucune
-- annonce, aucun relevé touché ; si Leboncoin refuse encore, la pause continue comme d'habitude.
-- Écriture par platform_settings_fusionner (CLAUDE.md). Sauvegarde : public._backup_0511_visites_controle_lbc.
-- Inverse : 20261105_visites_controle_lbc_servies_devant_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0511_visites_controle_lbc AS
SELECT now() AS le, p.id AS user_id, p.platform_settings #> '{leboncoin,blocage_acces}' AS blocage, r.id AS releve_id
  FROM public.profiles p
  JOIN public.vinted_sync_runs r ON r.id::text = p.platform_settings #>> '{leboncoin,blocage_acces,essai,releve_id}'
 WHERE (p.platform_settings #>> '{leboncoin,blocage_acces,essai,controle}') = 'true'
   AND p.platform_settings #> '{leboncoin,blocage_acces,essai,issue}' IS NULL
   AND p.platform_settings #> '{leboncoin,blocage_acces,leve_le}' IS NULL
   AND (p.platform_settings #>> '{leboncoin,blocage_acces,essai,le}')::timestamptz >= '2026-11-05 08:41:00+00'
   AND p.extension_last_seen_at > (p.platform_settings #>> '{leboncoin,blocage_acces,essai,le}')::timestamptz + interval '1 minute'
   AND r.user_id = p.id AND r.declencheur = 'controle_blocage_lbc' AND r.status = 'queued' AND r.claimed_at IS NULL;
ALTER TABLE public._backup_0511_visites_controle_lbc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_visites_controle_lbc FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v record;
  v_n int := 0;
  v_essais int;
BEGIN
  IF (SELECT count(*) FROM public._backup_0511_visites_controle_lbc) > 10 THEN
    RAISE EXCEPTION 'plus de 10 comptes : rien n''est écrit, à relire';
  END IF;
  FOR v IN SELECT * FROM public._backup_0511_visites_controle_lbc LOOP
    v_essais := COALESCE((v.blocage ->> 'essais')::int, 0);
    PERFORM public.platform_settings_fusionner(ARRAY['leboncoin', 'blocage_acces'],
      CASE WHEN v_essais > 1 THEN jsonb_build_object('essais', v_essais - 1) ELSE NULL END,
      CASE WHEN v_essais > 1 THEN ARRAY['essai'] ELSE ARRAY['essai', 'essais'] END,
      v.user_id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'visites de contrôle rendues : %', v_n;
END $$;
SELECT left(b.user_id::text, 8) AS compte, left(b.releve_id::text, 8) AS releve_en_file,
       p.platform_settings #> '{leboncoin,blocage_acces,essai}' AS essai_apres_reparation
  FROM public._backup_0511_visites_controle_lbc b JOIN public.profiles p ON p.id = b.user_id;
COMMIT;
