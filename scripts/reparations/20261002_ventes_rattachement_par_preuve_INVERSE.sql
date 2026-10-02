-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261002_ventes_rattachement_par_preuve.sql (02/10 soir, point 9)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ne touche QUE les lignes nommées dans _rattrapage_0210_ventes, et les remet
-- EXACTEMENT comme dans la sauvegarde _backup_0210_ventes_rattrapage :
--   · 'fusionnee' : la ligne relevée supprimée est réinsérée telle quelle ;
--   · 'gardee' et 'reliee_meme_geste' : la ligne est remise à son état sauvegardé.
-- ⛔ Une vente modifiée par la personne APRÈS le rattrapage serait, elle aussi,
--    remise à l'état d'avant : relire les lignes concernées avant d'exécuter.
BEGIN;
SET LOCAL lock_timeout = '3s';

INSERT INTO public.ventes
SELECT (jsonb_populate_record(NULL::public.ventes, to_jsonb(b) - 'sauvegarde_le')).*
  FROM public._backup_0210_ventes_rattrapage b
  JOIN public._rattrapage_0210_ventes t ON t.vente_id = b.id AND t.etape = 'fusionnee'
 WHERE NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = b.id);

UPDATE public.ventes v SET
  inventaire_id = b.inventaire_id, commande_ref = b.commande_ref, plateforme_code = b.plateforme_code,
  plateforme_origine = b.plateforme_origine, plateforme = b.plateforme, vendu_le = b.vendu_le, date = b.date,
  prix_vente = b.prix_vente, prix_achat = b.prix_achat, benefice = b.benefice, devise = b.devise,
  frais_plateforme = b.frais_plateforme, annonce_id = b.annonce_id, releve_le = b.releve_le
  FROM public._backup_0210_ventes_rattrapage b
  JOIN public._rattrapage_0210_ventes t ON t.vente_id = b.id AND t.etape IN ('gardee', 'reliee_meme_geste')
 WHERE v.id = b.id;

SELECT t.etape, count(*) FROM public._rattrapage_0210_ventes t GROUP BY 1;
COMMIT;
