-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS : LES 4 DÉPÔTS CLOS PAR LE BALAYAGE DE NUIT REVIENNENT « EN
-- VÉRIFICATION » (27/09, règle A de Nico : la modération Beebs ne se juge pas)
-- APPLIQUÉE le 27/09 à 14:31 (GO nommé de Nico, CLI db query -f), après rejeu
-- annulé : 4/4 published, sans erreur, marqueur retiré, published_at intact.
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle A (20260927111000) a retiré au balayage de nuit
-- (fail_publish_without_listing_url, 03:30) le droit de clore un dépôt Beebs
-- sans lien — mais quatre dépôts avaient DÉJÀ été clos par lui, AVANT la règle,
-- et n'étaient pas dans les 13 restaurés de 20260927110500 (ceux-là avaient
-- été clos par beebs-lien v2 à 12:00) :
--   · f9af3430  ornellaracano        publié 16/09, clos 24/09 03:30
--   · 33ba3648  gabyaviat10700       publié 17/09, clos 25/09 03:30
--   · dc5863cd  ornellaracano        publié 19/09, clos 27/09 03:30
--   · ff51cea9  thomas.vinted590002  publié 20/09, clos 27/09 03:30
-- Tous : status 'failed', listing_url NULL, platform_listing_id NULL, marqueur
-- listing_url_abandon (refund « sans_reservation », 0 rendu — rien à
-- recréditer), message « Publication non confirmée … AVANT DE REPUBLIER ».
-- Relus le 27/09 (index public Beebs, 12:50 et 13:xx) : aucun des quatre n'y
-- figure — et c'est exactement ce que la règle A interdit d'interpréter.
--
-- CE QUE CETTE MIGRATION FAIT, et rien d'autre : status 'published', error
-- NULL, marqueur listing_url_abandon retiré (StockTab le lit comme « Voir mes
-- annonces Beebs » + jamais de relance ; beebs-lien surveille les 'published'
-- sans lien et posera le lien si l'annonce apparaît), trace
-- beebs_rouvert_2709. published_at intact. Aucun crédit, aucune relance,
-- aucun nouveau job. L'app les affiche « en vérification » (règle A).
-- Idempotente : ne touche que des jobs encore 'failed' porteurs du marqueur.

BEGIN;

CREATE TEMP TABLE _rouvrir_beebs (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _rouvrir_beebs VALUES
  ('f9af3430-78e1-4a67-aa44-737c604cadde'),
  ('33ba3648-47ab-4439-9d77-14a76ceae41a'),
  ('dc5863cd-fb3d-4aca-bd7e-1de68a64f5d2'),
  ('ff51cea9-b41d-47b6-8099-679feb7589d6');

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM cross_post_jobs c JOIN _rouvrir_beebs r ON r.id = c.id
   WHERE c.platform = 'beebs' AND c.action = 'publish' AND c.status = 'failed'
     AND c.listing_url IS NULL AND c.platform_listing_id IS NULL
     AND c.platform_fields ? 'listing_url_abandon'
     AND COALESCE((c.platform_fields->'listing_url_abandon'->'refund'->>'rembourse')::int, 0) = 0;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'attendu 4 dépôts Beebs clos par le balayage (failed, sans lien, 0 rendu), trouvé % : rien n''est écrit', v_n;
  END IF;
END $$;

UPDATE cross_post_jobs c SET
  status = 'published',
  error = NULL,
  platform_fields = (c.platform_fields - 'listing_url_abandon')
    || jsonb_build_object('beebs_rouvert_2709', jsonb_build_object(
         'le', now(),
         'clos_le', c.platform_fields->'listing_url_abandon'->>'at',
         'motif', 'clos par fail_publish_without_listing_url avant la règle A (20260927111000) — modération Beebs jamais jugée'))
  FROM _rouvrir_beebs r
 WHERE c.id = r.id AND c.platform = 'beebs' AND c.status = 'failed' AND c.listing_url IS NULL
   AND c.platform_fields ? 'listing_url_abandon';

COMMIT;
