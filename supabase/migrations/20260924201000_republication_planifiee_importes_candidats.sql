-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE : UN ARTICLE IMPORTÉ EN LIGNE EST CANDIDAT (24/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Audit du 23/09, revérifié le 24/09 (toujours vrai après les correctifs de
-- créneaux de la nuit) : hors Vinted, republish_planifiee_candidats exigeait
-- des photos sur le JOB source. Un article importé ou rattaché par un relevé
-- a pour job source une ligne écrite par le relevé, photos = NULL : il sortait
-- de la CTE `base` sans motif ni note. Mesuré le 24/09 : 3 256 annonces en
-- ligne écartées (LBC 1 494, Beebs 138, Opla 1 624), dont Louis 61 + 41 + 2.
--
-- La RPC spend_coins_and_republish sait déjà prendre les photos de la FICHE
-- quand le job source n'en a pas (756f090, 19/09) ; la sœur `candidats` n'a
-- jamais été alignée. On l'aligne, avec UNE garde de plus :
--   · hors Opla, une republication RETIRE puis REDÉPOSE. Une photo hébergée
--     sur le CDN d'une plateforme (images1.vinted.net, img.leboncoin.fr…) ne
--     se télécharge pas depuis la page de dépôt : retrait, puis redépôt raté,
--     annonce perdue. La fiche n'est donc acceptée que si TOUTES ses photos
--     sont sur notre Storage ;
--   · Opla modifie EN PLACE et n'envoie pas d'images : toute photo non vide
--     suffit (le repli de la RPC).
-- Effet mesuré : LBC +1 101, Beebs +85, Opla +1 624 candidates, chacune dès
-- que l'âge de son rattachement dépasse age_jours du réglage. Les 392 LBC et
-- 53 Beebs dont une photo est sur un CDN restent écartées — voulu.
--
-- PATCH PAR ANCRE sur le corps LIVE (md5 9601131785403d0f5b2ff3ab54cb958c).
-- Idempotent ; échoue si l'ancre manque.

do $mig$
declare
  v_def   text := pg_get_functiondef('public.republish_planifiee_candidats(uuid,jsonb,text)'::regprocedure);
  v_avant text := $a$        -- Le redépôt copie les photos du JOB source : sans elles, la RPC
        -- refuserait 'article_sans_photo'. On ne les compte pas éligibles.
        AND jsonb_typeof(d.photos) = 'array' AND jsonb_array_length(d.photos) > 0$a$;
  v_apres text := $a$        -- 24/09 : alignée sur spend_coins_and_republish (756f090). Les photos
        -- viennent du job source, SINON de la fiche (article importé ou
        -- rattaché par un relevé). Hors Opla, la fiche n'est acceptée que si
        -- TOUTES ses photos sont sur notre Storage (retrait puis redépôt : une
        -- photo de CDN de plateforme ne se télécharge pas). Opla modifie en
        -- place et n'envoie pas d'images.
        AND (
          (jsonb_typeof(d.photos) = 'array' AND jsonb_array_length(d.photos) > 0)
          OR (
            jsonb_typeof(i.photos) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL)
            AND (v_pf = 'opla' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.photos) a(v)
              WHERE NULLIF(trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                                     THEN a.v #>> '{}' ELSE a.v ->> 'url' END), '') IS NOT NULL
                AND trim(CASE WHEN jsonb_typeof(a.v) = 'string'
                              THEN a.v #>> '{}' ELSE a.v ->> 'url' END)
                    !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/'))
          )
        )$a$;
begin
  if position('alignée sur spend_coins_and_republish' in v_def) > 0 then
    raise notice 'déjà appliquée : rien à faire';
    return;
  end if;
  if position(v_avant in v_def) = 0 then
    raise exception 'ancre introuvable dans le corps live de republish_planifiee_candidats';
  end if;
  execute replace(v_def, v_avant, v_apres);
end
$mig$;
