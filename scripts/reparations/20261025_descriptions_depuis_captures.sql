-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE 25/10 (chantier « importer son Vinted puis publier ailleurs ») — LES TEXTES QUE FILLSELL A DÉJÀ
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico (25/10, ~13:05) : « Rattrapage des articles déjà importés, comptes actifs et payants d'abord. »
-- Mesuré le 25/10 (lecture à blanc 20261025_descriptions_depuis_captures_LECTURE.sql) : 2 627 fiches importées de
-- Vinted, au stock, SANS description, dont FillSell a déjà le texte du vendeur — la capture de republication
-- (vinted_republish_captures, verdict « valide ») lue sur SON annonce — sur 74 comptes (2 335 sur des comptes actifs,
-- 1 728 sur des comptes payants). Personne ne le recopiait : le déclencheur capture_vers_inventaire_attributs ne pose
-- que les attributs, et l'app ne relit la capture qu'au clic « Publier ».
-- LA RÈGLE, celle de l'app à l'identique (src/publication/texteDuVendeur.js, « LE CACHE AVANT LE RÉSEAU », 07/09) :
-- capture valide de moins de 30 jours, article inchangé depuis (même titre ET même prix — l'identifiant d'annonce change
-- à chaque recréation, il n'est pas comparé). La fiche reçoit SA description seulement si elle est vide (jamais un texte
-- écrasé), marquée comme celle du vendeur (attributs.description_source, source « capture »), et le rayon Vinted s'il
-- manque. Aucune annonce touchée, aucun job créé, aucun quota, 0 mail. Sauvegarde : _backup_2510_descriptions_captures.
-- Inverse : 20261025_descriptions_depuis_captures_INVERSE.sql (remet description et attributs d'avant, si la fiche
-- n'a pas été retouchée depuis).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public._backup_2510_descriptions_captures AS
  SELECT now() AS sauve_le, i.id, i.user_id, i.description, i.attributs, i.vinted_catalog_id, 0::bigint AS capture_id
    FROM public.inventaire i WHERE false;
ALTER TABLE public._backup_2510_descriptions_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2510_descriptions_captures FROM PUBLIC, anon, authenticated;

CREATE TEMPORARY TABLE _a_poser ON COMMIT DROP AS
with derniere as (
  select distinct on (c.inventaire_id) c.inventaire_id, c.id as capture_id, c.captured_at,
         nullif(btrim(coalesce(c.payload->>'description', c.payload->'natif'->>'description')), '') as description,
         btrim(coalesce(c.payload->>'titre', c.payload->'natif'->>'title', '')) as titre_capture,
         nullif(c.payload->'natif'->'price'->>'amount', '')::numeric as prix_capture,
         coalesce(nullif(c.libelles->>'catalog_id_depot', ''), nullif(c.payload->'natif'->>'catalog_id', ''))::bigint as catalog_id
    from public.vinted_republish_captures c
   where c.verdict = 'valide' and c.captured_at > now() - interval '30 days'
   order by c.inventaire_id, c.captured_at desc
)
select i.id, d.capture_id, d.captured_at, d.description, d.catalog_id
  from public.inventaire i
  join derniere d on d.inventaire_id = i.id
 where i.origine = 'vinted_sync' and i.statut = 'stock' and i.disparu_le is null
   and coalesce(btrim(i.description), '') = '' and d.description is not null
   and d.titre_capture = btrim(coalesce(i.titre, ''))
   and (d.prix_capture is null or i.prix_vente is null or abs(d.prix_capture - i.prix_vente) < 0.005);

INSERT INTO public._backup_2510_descriptions_captures (sauve_le, id, user_id, description, attributs, vinted_catalog_id, capture_id)
SELECT now(), i.id, i.user_id, i.description, i.attributs, i.vinted_catalog_id, a.capture_id
  FROM public.inventaire i JOIN _a_poser a ON a.id = i.id
 WHERE NOT EXISTS (SELECT 1 FROM public._backup_2510_descriptions_captures b WHERE b.id = i.id);

DO $$
DECLARE n integer; attendu integer;
BEGIN
  SELECT count(*) INTO attendu FROM _a_poser;
  IF attendu > 3000 THEN RAISE EXCEPTION 'garde : % fiches (la lecture à blanc en voyait 2 627) — rien n''est fait', attendu; END IF;
  UPDATE public.inventaire i
     SET description = a.description,
         attributs = jsonb_build_object('description_source', jsonb_build_object(
                       'v', 'vinted', 'source', 'capture', 'at', a.captured_at, 'capture', a.capture_id,
                       'pose_par', 'scripts/reparations/20261025_descriptions_depuis_captures.sql')),
         vinted_catalog_id = coalesce(i.vinted_catalog_id, a.catalog_id)
    FROM _a_poser a
   WHERE i.id = a.id AND coalesce(btrim(i.description), '') = '';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% fiche(s) complétée(s) sur % attendue(s)', n, attendu;
END $$;

-- Les demandes de lecture de ces fiches : faites (le texte est là).
UPDATE public.lectures_origine_demandees d SET faite_le = now(), essais = d.essais + 1
  FROM _a_poser a WHERE d.inventaire_id = a.id AND d.faite_le IS NULL;

SELECT count(*) AS fiches_completees,
       count(*) FILTER (WHERE i.attributs->'description_source'->>'source' = 'capture') AS marquees_capture,
       (SELECT count(*) FROM public._backup_2510_descriptions_captures) AS sauvegardees,
       (SELECT count(*) FROM public.email_logs e WHERE e.sent_at > now() - interval '5 minutes') AS mails_5_min
  FROM public.inventaire i JOIN _a_poser a ON a.id = i.id
 WHERE i.description = a.description;
COMMIT;
