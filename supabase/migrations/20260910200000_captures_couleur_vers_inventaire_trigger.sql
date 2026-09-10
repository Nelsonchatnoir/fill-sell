-- ═══════════════════════════════════════════════════════════════════════════
-- CHAQUE CAPTURE VINTED ALIMENTE inventaire.attributs — EN CONTINU
-- (2026-09-10 soir, dossier « 5 annonces hors ligne, refus 400 Couleur »)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI MANQUAIT. La liste du dressing (/api/v2/wardrobe/{id}/items) ne
-- porte PAS la couleur : la sync n'écrit que taille / état / marque (source
-- 'vinted_liste'). La couleur ne vit que dans le payload d'ÉDITION de
-- l'annonce (natif.color1 / color2, en clair), lu par la capture de
-- republication (libelles.couleurs) et par le clic « Publier » (vinted_detail).
-- Le rattrapage du 07/09 (20260907140000) a recopié les captures d'alors dans
-- attributs UNE FOIS ; depuis, chaque nouvelle capture repartait au silence :
-- vérifié le 10/09 sur 3 articles capturés le jour même — attributs sans
-- couleur, source vinted_liste seulement.
--
-- RÈGLE. À chaque capture (insert, ou mise à jour de `libelles` — c'est aussi
-- par là que get-pending-jobs pose une couleur saisie dans l'app), les
-- libellés relevés partent dans inventaire.attributs avec la source 'capture'
-- (rang 3). C'est le trigger inventaire_attributs_fusion_trg qui applique la
-- priorité (manuel > vinted_detail > capture > vinted_liste > lens) : une
-- saisie de l'utilisateur ou un détail Vinted ne sont JAMAIS écrasés, la
-- liste du dressing l'est (elle ne connaît pas la couleur).
-- MARQUE : comme le 07/09, seulement si l'article n'en a aucune (Vinted range
-- sous des marques fourre-tout ce que la fiche nommait mieux).
-- Une capture 'incomplet' (photo non ré-hébergée, état absent) porte des
-- libellés VRAIS pour les clés qu'elle a : elles sont prises, les clés vides
-- ignorées (fusion : une valeur nulle ne remplace jamais une non nulle).
-- Idempotente : rejouer ne change rien (même source = même rang = mêmes
-- valeurs). Rattrapage des captures écrites depuis le 07/09 14:00 UTC inclus.
-- Sécurité : SECURITY INVOKER — l'INSERT vient de l'utilisateur (RLS : sa
-- propre ligne d'inventaire) ou du service role (get-pending-jobs) ; le
-- filtre user_id = NEW.user_id borne l'écriture à SON article dans tous les cas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.capture_vers_inventaire_attributs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_at text;
  v_lib jsonb;
  v_champs jsonb;
BEGIN
  IF NEW.inventaire_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_lib := COALESCE(NEW.libelles, '{}'::jsonb);
  IF jsonb_typeof(v_lib) <> 'object' THEN RETURN NEW; END IF;
  v_at := to_char(COALESCE(NEW.captured_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('v', v, 'source', 'capture', 'at', v_at)), '{}'::jsonb)
    INTO v_champs
    FROM (VALUES
      ('taille',   nullif(trim(v_lib->>'taille'), '')),
      ('etat',     nullif(trim(v_lib->>'etat'), '')),
      ('couleur',  nullif(trim(v_lib->'couleurs'->>0), '')),
      ('couleur2', nullif(trim(v_lib->'couleurs'->>1), '')),
      ('isbn',     nullif(trim(v_lib->>'isbn'), '')),
      ('colis',    nullif(trim(v_lib->>'colis'), '')),
      ('marque',   CASE WHEN EXISTS (SELECT 1 FROM public.inventaire i
                                      WHERE i.id = NEW.inventaire_id AND i.user_id = NEW.user_id
                                        AND coalesce(trim(i.marque), '') = '')
                        THEN nullif(trim(v_lib->>'marque'), '') END)
    ) AS champs(k, v)
   WHERE v IS NOT NULL;

  IF v_champs = '{}'::jsonb THEN RETURN NEW; END IF;

  -- La fusion par rang vit dans inventaire_attributs_fusion_trg (BEFORE UPDATE
  -- OF attributs) : on envoie les champs, la base arbitre.
  UPDATE public.inventaire
     SET attributs = v_champs
   WHERE id = NEW.inventaire_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_vers_inventaire_attributs_trg ON public.vinted_republish_captures;
CREATE TRIGGER capture_vers_inventaire_attributs_trg
  AFTER INSERT OR UPDATE OF libelles ON public.vinted_republish_captures
  FOR EACH ROW EXECUTE FUNCTION public.capture_vers_inventaire_attributs();

-- ── Rattrapage : dernière capture par article depuis le 07/09 14:00 UTC ──────
WITH derniere AS (
  SELECT DISTINCT ON (c.inventaire_id)
         c.inventaire_id, c.user_id, c.captured_at, c.libelles
    FROM public.vinted_republish_captures c
   WHERE c.inventaire_id IS NOT NULL AND c.captured_at >= '2026-09-07 14:00:00+00'
   ORDER BY c.inventaire_id, c.captured_at DESC
), champs AS (
  SELECT d.inventaire_id, d.user_id,
         (SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('v', v, 'source', 'capture',
                   'at', to_char(d.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))), '{}'::jsonb)
            FROM (VALUES
              ('taille',   nullif(trim(d.libelles->>'taille'), '')),
              ('etat',     nullif(trim(d.libelles->>'etat'), '')),
              ('couleur',  nullif(trim(d.libelles->'couleurs'->>0), '')),
              ('couleur2', nullif(trim(d.libelles->'couleurs'->>1), '')),
              ('isbn',     nullif(trim(d.libelles->>'isbn'), '')),
              ('colis',    nullif(trim(d.libelles->>'colis'), '')),
              ('marque',   CASE WHEN coalesce(trim(i.marque), '') = '' THEN nullif(trim(d.libelles->>'marque'), '') END)
            ) AS x(k, v) WHERE v IS NOT NULL) AS attrs
    FROM derniere d JOIN public.inventaire i ON i.id = d.inventaire_id AND i.user_id = d.user_id
)
UPDATE public.inventaire i
   SET attributs = c.attrs
  FROM champs c
 WHERE i.id = c.inventaire_id AND i.user_id = c.user_id AND c.attrs <> '{}'::jsonb;
