-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 8 — Louis, suite) — ses autres annonces au texte réécrit, par le circuit normal
-- ═══════════════════════════════════════════════════════════════════════════
-- Audit du parc (depuis le 18/09) sur les deux comptes de Louis, après le lot Zombicide Green Horde :
--   · louis@ — 3 annonces Leboncoin « Zombicide Black Plague » dont le dépôt d'origine date du 19/09, AVANT la règle
--     « le texte du vendeur fait foi » (21/09) : chaque republication recopiait le texte rédigé. get-pending-jobs v269
--     impose désormais le texte du vendeur à une copie d'avant cette règle ;
--   · louis-seller — 2 annonces Beebs publiées avant que l'annonce d'origine soit lue (« Peluche Disney Daisy Duck »,
--     « Maison de poupées miniatures - le café ») : le texte du vendeur est imposé au départ.
-- Le geste : « Republier » (spend_coins_and_republish, source « manuel »), en tant que le compte qui a publié.
-- NON touchées (listées au rapport, décision de Nico) : 4 annonces Leboncoin « Rangement … pour 12 pots » de louis@ dont
-- la copie a été rédigée APRÈS la lecture du texte (peut-être les mots de Louis) ; les états « Très bon état » au lieu
-- de « Bon état » de louis-seller (Leboncoin, Beebs, Depop : choix possible au stepper) ; Opla (quittée).
-- Gardes vérifiées avant : aucune transaction en cours, aucune republication déjà en file. Aucun mail.
-- Sauvegarde : _backup_2210_soir_louis (jobs avant, résultat du geste). Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE _gestes2 (job uuid, inventaire_id bigint, compte uuid, plateforme text);
INSERT INTO _gestes2
SELECT j.id, j.inventaire_id, j.user_id, j.platform FROM cross_post_jobs j
 WHERE (j.id::text LIKE '3bb555b8%' AND j.inventaire_id = 1789817455986)
    OR (j.id::text LIKE '8268230f%' AND j.inventaire_id = 1789817467753)
    OR (j.id::text LIKE 'b4ac4079%' AND j.inventaire_id = 1789817452426)
    OR (j.id::text LIKE 'b2c218bc%' AND j.inventaire_id = 1792430732840003)
    OR (j.id::text LIKE '453a54f4%' AND j.inventaire_id = 1792507479750004);

INSERT INTO public._backup_2210_soir_louis (job, inventaire_id, status, error, platform_fields, description, photos, geste)
SELECT j.id, j.inventaire_id, j.status, j.error, j.platform_fields, j.description, to_jsonb(j.photos), 'republier_texte'
  FROM cross_post_jobs j JOIN _gestes2 g ON g.job = j.id
ON CONFLICT (job) DO NOTHING;

DO $$
DECLARE g record; r jsonb;
BEGIN
  FOR g IN SELECT * FROM _gestes2 LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g.compte, 'role', 'authenticated')::text, true);
    r := public.spend_coins_and_republish(g.inventaire_id, NULL, 'manuel', NULL, g.plateforme);
    UPDATE public._backup_2210_soir_louis SET resultat = r WHERE job = g.job;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT g.plateforme, g.inventaire_id, b.resultat::text AS resultat
  FROM _gestes2 g JOIN public._backup_2210_soir_louis b ON b.job = g.job ORDER BY 1, 2;
COMMIT;
