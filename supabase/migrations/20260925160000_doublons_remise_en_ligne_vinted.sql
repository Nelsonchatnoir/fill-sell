-- ═══════════════════════════════════════════════════════════════════════════
-- DOUBLONS : LA REMISE EN LIGNE VINTED (2026-09-25 après-midi, point 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ON A TROUVÉ en vérifiant le recensement (61 paires certaines → 60
-- fusions : la 61e était un baigneur remis en ligne). Une vendeuse RETIRE son
-- annonce Vinted et la republie elle-même (ou par un autre outil) : Vinted
-- ferme l'ancienne (is_closed sans « sold » → vinted_status « closed ») et en
-- crée une nouvelle ; notre synchro du dressing date la disparition de
-- l'ancienne et IMPORTE la nouvelle comme une fiche neuve. L'objet a alors
-- deux fiches en stock — l'ancienne « plus en ligne », avec ses dépôts sur les
-- autres plateformes, la nouvelle en ligne sur Vinted seulement.
-- MESURÉ le 25/09 : 291 paires, 9 comptes, 211 remises en ligne dans l'heure,
-- 280 anciennes « closed » (retirées, pas vendues : une vente porte « sold »),
-- AUCUNE vente enregistrée sur les anciennes. La règle « deux annonces Vinted
-- = deux identités » les écartait toutes.
--
-- LA RÈGLE (vinted_remise_en_ligne) : une fiche porte une annonce Vinted
-- RETIRÉE (closed + disparue), l'autre une annonce VIVANTE (active), sur la
-- MÊME boutique, apparue APRÈS la disparition de la première (un jour de
-- marge : la synchro date les deux dans le même passage). Tout le reste de
-- l'évaluation est INCHANGÉ (titre, photo, prix, couleur, lot, fiche vendue,
-- quantité, freins) — et plusieurs exemplaires VIVANTS du même titre sur le
-- compte → la personne tranche (question), jamais une fusion.
-- Deux annonces vivantes, ou deux retirées : écarté, comme avant.
--
-- LA FUSION ÉCHANGE LES IDENTITÉS : la fiche gardée prend l'annonce VIVANTE
-- (elle redevient « en ligne sur Vinted »), l'absorbée garde l'annonce
-- RETIRÉE. ⛔ Jamais « effacée » : la synchro retrouve les fiches par
-- vinted_item_id — une annonce retirée qui reparaîtrait dans le dressing sans
-- fiche serait réimportée en fiche neuve (le doublon renaîtrait). Journalisé
-- (vinted_identite.echange) ; inventaire_defusionner rend chaque identité à sa
-- fiche, disparition et dernière synchro comprises.
--
-- LE BALAYAGE (cron doublons-balayage) : une fiche du dressing attend 30 min
-- avant d'être examinée (le même relevé date d'abord la disparition de
-- l'annonce qu'elle remplace), et une fiche vivante déjà examinée est REVUE
-- quand une homonyme de la même boutique est retirée après son examen (relevé
-- incomplet, course) — horodatage de revue à chaque passage, jamais deux fois
-- pour le même événement.
--
-- Corps PROD relus (md5), patchés en place, chaque ancre trouvée UNE fois :
--   inventaire_doublon_evaluer   eb8e65391629877bb095f1ce198c2664
--   inventaire_doublons_pour     75b6680066e1ce95de28cda863ad21ed
--   inventaire_fusionner_pour    a4d93d7f33c2c52504c32150f3469b60
--   inventaire_defusionner       5ff15c7e65a9a93f2c7424e299054e7a
--   doublons_fiches_a_examiner   084b897bb4d12644a4c0c20c190f3598
--   rapprochement_photos_decider cb71742581f38032917c1237a11accfc

DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.inventaire_doublon_evaluer(bigint,bigint)', 'eb8e65391629877bb095f1ce198c2664'),
    ('public.inventaire_doublons_pour(bigint)', '75b6680066e1ce95de28cda863ad21ed'),
    ('public.inventaire_fusionner_pour(uuid,bigint,bigint,text)', 'a4d93d7f33c2c52504c32150f3469b60'),
    ('public.inventaire_defusionner(uuid)', '5ff15c7e65a9a93f2c7424e299054e7a'),
    ('public.doublons_fiches_a_examiner(integer)', '084b897bb4d12644a4c0c20c190f3598'),
    ('public.rapprochement_photos_decider(integer)', 'cb71742581f38032917c1237a11accfc')) v(f, m) LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m THEN
      RAISE EXCEPTION '% a changé en prod depuis la lecture — ON S ARRETE', r.f;
    END IF;
  END LOOP;
END
$verif$;

-- ── La règle, une fois ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vinted_remise_en_ligne(p_retiree bigint, p_vivante bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m, inventaire n
     WHERE m.id = p_retiree AND n.id = p_vivante AND m.id <> n.id AND m.user_id = n.user_id
       AND m.vinted_item_id IS NOT NULL AND n.vinted_item_id IS NOT NULL AND m.vinted_item_id <> n.vinted_item_id
       AND m.vinted_status = 'closed' AND m.disparu_le IS NOT NULL
       AND n.vinted_status = 'active' AND n.disparu_le IS NULL
       AND COALESCE(m.vinted_account_id, '') = COALESCE(n.vinted_account_id, '')
       AND n.created_at >= m.disparu_le - interval '1 day');
$function$;
REVOKE ALL ON FUNCTION public.vinted_remise_en_ligne(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vinted_remise_en_ligne(bigint, bigint) TO service_role;

-- ── Petit outil : remplace une ancre présente UNE fois, sinon on s'arrête ──
CREATE OR REPLACE FUNCTION pg_temp.remplacer_une_fois(p_src text, p_ancre text, p_par text, p_nom text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE c int;
BEGIN
  c := (length(p_src) - length(replace(p_src, p_ancre, ''))) / length(p_ancre);
  IF c <> 1 THEN RAISE EXCEPTION '% : ancre trouvée % fois (attendu 1) — ON S ARRETE : %', p_nom, c, left(p_ancre, 80); END IF;
  RETURN replace(p_src, p_ancre, p_par);
END
$function$;

-- ── 1. L'évaluation ────────────────────────────────────────────────────────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_doublon_evaluer(bigint,bigint)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;$a$,
$b$  s jsonb; nv jsonb; v_niveau text; v_motif text; v_freins text[] := '{}'::text[]; v_meme_pf text;
  v_remise boolean := false;$b$, 'evaluer/declare');
  v := pg_temp.remplacer_une_fois(v,
$a$  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
  END IF;$a$,
$b$  -- Deux annonces Vinted = deux identités Vinted : hors de ce que la fusion sait représenter.
  -- SAUF (2026-09-25 après-midi, migration 20260925160000) la REMISE EN LIGNE :
  -- l'une retirée (closed + disparue), l'autre vivante, apparue après, même
  -- boutique — la fusion échange alors les identités.
  IF a.vinted_item_id IS NOT NULL AND b.vinted_item_id IS NOT NULL THEN
    v_remise := vinted_remise_en_ligne(a.id, b.id) OR vinted_remise_en_ligne(b.id, a.id);
    IF NOT v_remise THEN
      RETURN jsonb_build_object('niveau', 'ecarte', 'motif', 'deux_annonces_vinted');
    END IF;
  END IF;$b$, 'evaluer/vinted');
  v := pg_temp.remplacer_une_fois(v,
$a$  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.$a$,
$b$  -- (2026-09-25 après-midi) remise en ligne, mais PLUSIEURS exemplaires vivants
  -- du même titre sur le compte : lequel est la remise en ligne ? La personne tranche.
  IF v_remise AND v_niveau = 'certain' AND EXISTS (
       SELECT 1 FROM inventaire o
        WHERE o.user_id = a.user_id AND o.id <> a.id AND o.id <> b.id
          AND o.fusionne_dans IS NULL AND o.statut = 'stock'
          AND o.vinted_item_id IS NOT NULL AND o.disparu_le IS NULL
          AND lower(btrim(o.titre)) IN (lower(btrim(a.titre)), lower(btrim(b.titre)))) THEN
    v_niveau := 'probable'; v_motif := 'plusieurs_exemplaires_vivants';
  END IF;
  -- deux annonces VIVANTES distinctes sur la même plateforme → la personne tranche.$b$, 'evaluer/exemplaires');
  v := pg_temp.remplacer_une_fois(v,
$a$                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf);$a$,
$b$                            'signaux', s, 'freins', to_jsonb(v_freins), 'deux_annonces', v_meme_pf)
         || CASE WHEN v_remise THEN jsonb_build_object('remise_en_ligne_vinted', true) ELSE '{}'::jsonb END;$b$, 'evaluer/retour');
  EXECUTE v;
END
$patch$;

-- ── 2. Les candidats (même assouplissement, rien d'autre) ──────────────────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_doublons_pour(bigint)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$       AND NOT (i.vinted_item_id IS NOT NULL AND f.vinted_item_id IS NOT NULL)$a$,
$b$       AND (i.vinted_item_id IS NULL OR f.vinted_item_id IS NULL
            OR vinted_remise_en_ligne(i.id, f.id) OR vinted_remise_en_ligne(f.id, i.id))$b$, 'doublons_pour/vinted');
  EXECUTE v;
END
$patch$;

-- ── 3. La fusion : l'échange des identités ─────────────────────────────────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_fusionner_pour(uuid,bigint,bigint,text)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$                                  'listed_at_guess', a.listed_at_guess)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;$a$,
$b$                                  'listed_at_guess', a.listed_at_guess)));
  -- ── AJOUT 2026-09-25 après-midi : LA REMISE EN LIGNE — ÉCHANGE ─────────
  -- Le gardé porte l'annonce RETIRÉE, l'absorbé la VIVANTE qui l'a remplacée :
  -- le gardé prend la vivante (il redevient en ligne), l'absorbé GARDE la
  -- retirée — jamais effacée : la synchro retrouve les fiches par
  -- vinted_item_id, une retirée sans fiche serait réimportée. Ordre imposé par
  -- l'index unique (user_id, vinted_item_id) : libérer, poser, reposer.
  ELSIF g.vinted_item_id IS NOT NULL AND a.vinted_item_id IS NOT NULL AND vinted_remise_en_ligne(g.id, a.id) THEN
    UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = p_absorbe;
    UPDATE inventaire
       SET vinted_item_id = a.vinted_item_id, vinted_status = a.vinted_status, vinted_account_id = a.vinted_account_id,
           vinted_catalog_id = COALESCE(a.vinted_catalog_id, g.vinted_catalog_id),
           vinted_view_count = a.vinted_view_count, vinted_favourite_count = a.vinted_favourite_count,
           listed_at_guess = COALESCE(g.listed_at_guess, a.listed_at_guess),
           disparu_le = a.disparu_le, last_synced_at = COALESCE(a.last_synced_at, g.last_synced_at)
     WHERE id = p_garde;
    UPDATE inventaire
       SET vinted_item_id = g.vinted_item_id, vinted_status = g.vinted_status, vinted_account_id = g.vinted_account_id,
           disparu_le = g.disparu_le
     WHERE id = p_absorbe;
    v_champs := v_champs || jsonb_build_object('vinted_identite', jsonb_build_object(
      'echange', true,
      'avant', jsonb_build_object('vinted_item_id', g.vinted_item_id, 'vinted_status', g.vinted_status,
                                  'vinted_account_id', g.vinted_account_id, 'vinted_catalog_id', g.vinted_catalog_id,
                                  'vinted_view_count', g.vinted_view_count, 'vinted_favourite_count', g.vinted_favourite_count,
                                  'listed_at_guess', g.listed_at_guess, 'disparu_le', g.disparu_le, 'last_synced_at', g.last_synced_at),
      'apres', jsonb_build_object('vinted_item_id', a.vinted_item_id, 'vinted_status', a.vinted_status,
                                  'vinted_account_id', a.vinted_account_id, 'vinted_catalog_id', a.vinted_catalog_id,
                                  'vinted_view_count', a.vinted_view_count, 'vinted_favourite_count', a.vinted_favourite_count,
                                  'listed_at_guess', a.listed_at_guess, 'disparu_le', a.disparu_le, 'last_synced_at', a.last_synced_at)));
  END IF;

  UPDATE inventaire SET fusionne_dans = p_garde, fusionne_le = now() WHERE id = p_absorbe;$b$, 'fusionner_pour/echange');
  EXECUTE v;
END
$patch$;

-- ── 4. La défusion : défaire l'échange ─────────────────────────────────────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.inventaire_defusionner(uuid)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$    ELSIF v_cle = 'vinted_identite' THEN
$a$,
$b$    ELSIF v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false) THEN
      -- AJOUT 2026-09-25 après-midi : ÉCHANGE (remise en ligne). L'absorbé
      -- porte l'annonce RETIRÉE du gardé : on la libère d'abord (index unique),
      -- puis chacun reprend la sienne, disparition et dernière synchro comprises.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'vinted_identite' THEN
$b$, 'defusionner/echange');
  EXECUTE v;
END
$patch$;

-- ── 5. Le balayage : attendre la disparition, revoir après une retraite ────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.doublons_fiches_a_examiner(integer)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$  SELECT i.id FROM inventaire i
   WHERE (i.origine LIKE 'releve\_%' OR i.origine = 'vinted_sync')
     AND i.created_at > now() - interval '14 days'
     AND i.fusionne_dans IS NULL AND i.statut = 'stock'
     AND NOT EXISTS (SELECT 1 FROM inventaire_doublons_verifies v WHERE v.inventaire_id = i.id)
   ORDER BY i.created_at
   LIMIT greatest(p_limite, 0);$a$,
$b$  SELECT z.id FROM (
    SELECT i.id, i.created_at FROM inventaire i
     WHERE (i.origine LIKE 'releve\_%' OR i.origine = 'vinted_sync')
       AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       -- (2026-09-25 après-midi) une fiche du dressing attend 30 min : le même
       -- relevé date d'abord la disparition de l'annonce qu'elle remplace.
       AND (i.origine <> 'vinted_sync' OR i.created_at < now() - interval '30 minutes')
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons_verifies v WHERE v.inventaire_id = i.id)
    UNION
    -- (2026-09-25 après-midi) REVUE : une annonce Vinted vivante déjà examinée
    -- dont une homonyme de la même boutique a été RETIRÉE depuis l'examen
    -- (remise en ligne vue en retard). rapprochement_photos_decider réhorodate
    -- l'examen : une retraite ne déclenche qu'une revue.
    SELECT i.id, i.created_at FROM inventaire i
      JOIN inventaire_doublons_verifies v ON v.inventaire_id = i.id
     WHERE i.origine = 'vinted_sync' AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND i.vinted_status = 'active' AND i.disparu_le IS NULL
       AND EXISTS (SELECT 1 FROM inventaire m
                    WHERE m.user_id = i.user_id AND m.id <> i.id AND m.fusionne_dans IS NULL AND m.statut = 'stock'
                      AND m.vinted_status = 'closed' AND m.disparu_le > v.verifie_le
                      AND m.disparu_le > now() - interval '14 days'
                      AND m.created_at < i.created_at
                      AND titre_jetons(m.titre) && titre_jetons(i.titre)
                      AND vinted_remise_en_ligne(m.id, i.id))
  ) z
   ORDER BY z.created_at
   LIMIT greatest(p_limite, 0);$b$, 'examiner/remise');
  EXECUTE v;
END
$patch$;

-- ── 6. L'examen réhorodaté (la revue ne se rejoue pas) ─────────────────────
DO $patch$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.rapprochement_photos_decider(integer)'::regprocedure);
  v := pg_temp.remplacer_une_fois(v,
$a$    ON CONFLICT (inventaire_id) DO NOTHING;
  END LOOP;

  -- (c) propositions$a$,
$b$    ON CONFLICT (inventaire_id) DO UPDATE
      SET verifie_le = now(),
          resultat = inventaire_doublons_verifies.resultat || EXCLUDED.resultat || jsonb_build_object('revue_le', now());
  END LOOP;

  -- (c) propositions$b$, 'photos_decider/revue');
  EXECUTE v;
END
$patch$;
