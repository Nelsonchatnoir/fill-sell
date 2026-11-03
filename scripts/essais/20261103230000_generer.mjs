// Génère la migration 20261103230000_rattachement_jamais_de_retrait et son inverse à partir des corps de PROD
// (pg_get_functiondef du 03/11 soir, scripts/essais/fixtures/prod-0311-retrait-rattachement/) : chaque ajout est posé
// sur un repère exact, trouvé UNE fois — sinon le générateur s'arrête. Jamais un corps réécrit de mémoire.
//   node scripts/essais/20261103230000_generer.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'scripts/essais/fixtures/prod-0311-retrait-rattachement');
const lire = (n) => readFileSync(join(FIX, `${n}.sql`), 'utf8').replace(/\r\n/g, '\n').trimEnd() + ';\n';
const poser = (corps, repere, ajout, ou = 'apres') => {
  const i = corps.indexOf(repere);
  if (i < 0 || corps.indexOf(repere, i + 1) >= 0) throw new Error(`repère absent ou double : ${repere.slice(0, 80)}`);
  return ou === 'apres' ? corps.slice(0, i + repere.length) + ajout + corps.slice(i + repere.length)
                        : corps.slice(0, i) + ajout + corps.slice(i);
};

const PROD = {
  armer: lire('armer_retrait_job_pour'),
  publie: lire('cross_post_jobs_publie_sur_article_vendu'),
  decider: lire('inventaire_doublon_decider'),
  noter: lire('leboncoin_transaction_noter'),
};

// ── 1. armer_retrait_job_pour : seule une vente APRÈS la mise en ligne d'une annonce importée ─────────────────────
const armer = poser(PROD.armer, `  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
`, `  -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT, Dylan Fontaine, louis-seller) SEULE UNE VENTE PROUVÉE, SURVENUE APRÈS LA
  -- MISE EN LIGNE DE L'ANNONCE, PEUT LA RETIRER. Une annonce importée par un relevé (née hors FillSell) mise en ligne
  -- après la vente n'est pas l'objet vendu : un autre exemplaire, une remise en vente. Mise en ligne = sa plus ancienne
  -- trace (annonce_mise_en_ligne) ; vente = vendu_le, sinon la fin de son jour (vente_instant). Une annonce que FillSell a
  -- déposée pour la fiche n'existait pas avant le dépôt : la règle d'avant (une vente vue en retard retire toujours la
  -- copie de l'objet). Jamais un retrait sans trace.
  if public.annonce_importee(j.id) and not public.vente_apres_mise_en_ligne(j.id) then
    insert into public.usage_logs (user_id, feature, metadata)
    values (j.user_id, 'retrait_refuse_vente_avant_mise_en_ligne', jsonb_build_object(
      'chemin', p_chemin, 'job', j.id, 'platform', j.platform, 'article_id', j.inventaire_id::text,
      'mise_en_ligne', public.annonce_mise_en_ligne(j.id)));
    return null;
  end if;
`);

// ── 2. Le déclencheur « publiée après la vente » : le dépôt de FillSell seulement, jamais un rattachement ─────────
const publie = poser(PROD.publie, `  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
`, `  -- ⛔ (03/11 soir, Nico) UN RATTACHEMENT NE DÉCLENCHE JAMAIS DE RETRAIT : une annonce importée par un relevé qui passe
  -- « published » sur une fiche vendue n'arme rien. Seul le dépôt de FillSell (réparé, refermé par son numéro, ou
  -- publié pendant la vente) garde la règle d'avant.
  if public.annonce_importee(new.id) then
    return new;
  end if;
`);

// ── 3. inventaire_doublon_decider : « oui » sur une fiche VENDUE qui a une annonce en ligne = un article à part ────
const decider = poser(PROD.decider, `    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN`, `    -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT 16:19, Dylan Fontaine 16:28) UNE ANNONCE EN LIGNE QUI RESSEMBLE À UN ARTICLE
    -- DÉJÀ VENDU N'EST JAMAIS RETIRÉE, ni réunie à la fiche vendue : elle entre dans le stock comme un article à part
    -- (des exemplaires de plus d'un vendeur de neuf ; une carte mise en ligne trois mois après la vente de l'autre).
    -- Le « oui » d'avant (30/09, règle Louis partie 2) réunissait les fiches et retirait l'annonce : 8 retraits à tort le
    -- 03/11. Une fiche sans annonce en ligne se réunit comme avant (rien à retirer). La copie interrogée à la vente du
    -- jour (copie_non_prouvee, plus haut) garde son « Oui, la retirer ».
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu')
       AND (EXISTS (SELECT 1 FROM annonces_plateforme ap
                     WHERE ap.user_id = v_user AND ap.inventaire_id = d.absorbe
                       AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL)
            OR EXISTS (SELECT 1 FROM cross_post_jobs j
                        WHERE j.user_id = v_user AND j.inventaire_id = d.absorbe AND j.status = 'published'
                          AND COALESCE(j.action, 'publish') IN ('publish', 'republish'))) THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur',
             preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object(
               'reponse', p_decision, 'issue', 'article_a_part_annonce_en_ligne', 'le', now())
       WHERE id = d.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (v_user, 'doublon_vendu_article_a_part', jsonb_build_object(
        'doublon', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'motif', d.motif, 'reponse', p_decision));
      RETURN jsonb_build_object('ok', true, 'decision', p_decision, 'retraits', 0, 'article_a_part', true);
    END IF;
`, 'avant');

// ── 4. leboncoin_transaction_noter : « Vendu » dès la première lecture d'une annonce importée = jamais une vente ────
const noter = poser(PROD.noter, `      ELSE
        v_issue := CASE WHEN v_ecrit THEN 'prouvee' ELSE 'aurait_prouve' END;`, `      -- ⛔ (03/11 soir, JEAN-LUC LASSARAT) « Vendu » dès la PREMIÈRE lecture d'une annonce importée (ou relu ainsi depuis,
      -- sans jamais d'autre état) : une vente d'avant le suivi — Leboncoin garde le badge sur une annonce encore en ligne
      -- (plusieurs exemplaires). FillSell ne la date pas : jamais une vente du jour, jamais un retrait de copie.
      ELSIF p_tx = 'sold' AND public.annonce_importee(j.id)
            AND (p_tx_avant IS NULL OR (p_tx_avant = 'sold' AND public.leboncoin_vendu_avant_suivi(a.user_id, a.listing_id))) THEN
        v_issue := 'vendu_avant_suivi';
`, 'avant');

const NOUVELLES = String.raw`
-- ── Les règles communes ─────────────────────────────────────────────────────────────────────────────────────────
-- Une annonce IMPORTÉE par un relevé (née hors FillSell) : même lecture que remises_en_vente_tick et que
-- _shared/lbc-vendu-avant-suivi.js (annonceImportee) — source = releve, ou rattachement.import.
CREATE OR REPLACE FUNCTION public.annonce_importee(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT COALESCE(j.platform_fields ->> 'source', '') = 'releve'
        OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true'
      FROM public.cross_post_jobs j WHERE j.id = p_job), false);
$function$;

-- La mise en ligne d'une annonce : sa plus ancienne trace connue — la date donnée par la plateforme, la première
-- lecture par un relevé, le premier relevé du dressing Vinted, le dépôt publié. Jamais plus tard que la tâche.
CREATE OR REPLACE FUNCTION public.annonce_mise_en_ligne(p_job uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(LEAST(
           (SELECT min(LEAST(a.publiee_le, a.created_at)) FROM public.annonces_plateforme a
             WHERE a.user_id = j.user_id AND a.platform = j.platform
               AND a.listing_id = NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '')),
           (SELECT min(LEAST(a.publiee_le, a.created_at)) FROM public.annonces_plateforme a
             WHERE a.user_id = j.user_id AND a.platform = j.platform AND a.job_id = j.id
               AND NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NULL),
           CASE WHEN j.platform = 'vinted' AND NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NOT NULL THEN
             (SELECT min(s.captured_at) FROM public.vinted_listing_snapshots s
               WHERE s.user_id = j.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)) END,
           j.published_at, j.created_at), j.created_at)
    FROM public.cross_post_jobs j WHERE j.id = p_job;
$function$;

-- L'instant d'une vente : l'heure lue (vendu_le), sinon la fin de son jour de vente à Paris, sinon son écriture.
CREATE OR REPLACE FUNCTION public.vente_instant(p_vendu_le timestamp with time zone, p_date date, p_cree timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_vendu_le, (((p_date + 1)::timestamp) AT TIME ZONE 'Europe/Paris') - interval '1 second', p_cree);
$function$;

-- Une vente prouvée (non annulée, sur une AUTRE plateforme que l'annonce) de la fiche — ou de sa jumelle d'un compte
-- relié (vente_prouvee_fiche_liee) — survenue APRÈS la mise en ligne de CETTE annonce.
CREATE OR REPLACE FUNCTION public.vente_apres_mise_en_ligne(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH j AS (SELECT c.id, c.user_id, c.inventaire_id, c.platform, public.annonce_mise_en_ligne(c.id) AS mise_en_ligne
               FROM public.cross_post_jobs c WHERE c.id = p_job)
  SELECT EXISTS (
           SELECT 1 FROM j JOIN public.ventes v ON v.user_id = j.user_id AND v.inventaire_id = j.inventaire_id
            WHERE lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
              AND COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, '')) IS NOT NULL
              AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) <> lower(j.platform)
              AND public.vente_instant(v.vendu_le, v.date, v.created_at) > j.mise_en_ligne)
      OR EXISTS (
           SELECT 1 FROM j
             JOIN public.fiches_liees_comptes f ON f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id
             JOIN LATERAL (SELECT CASE WHEN f.fiche_a = j.inventaire_id THEN f.fiche_b ELSE f.fiche_a END AS fiche,
                                  CASE WHEN f.fiche_a = j.inventaire_id THEN f.user_b ELSE f.user_a END AS uid,
                                  CASE WHEN f.fiche_a = j.inventaire_id THEN f.user_a ELSE f.user_b END AS moi) x ON true
             JOIN public.ventes v ON v.inventaire_id = x.fiche AND v.user_id = x.uid
            WHERE public.comptes_sont_lies(x.moi, x.uid)
              AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
              AND COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, '')) IS NOT NULL
              AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''))) <> lower(j.platform)
              AND public.vente_instant(v.vendu_le, v.date, v.created_at) > j.mise_en_ligne);
$function$;

-- Leboncoin : « Vendu » dès la PREMIÈRE lecture de CETTE annonce par la règle, et jamais un autre état depuis (même
-- lecture que _shared/lbc-vendu-avant-suivi.js). Aucune trace : faux (inconnu ≠ ancien).
CREATE OR REPLACE FUNCTION public.leboncoin_vendu_avant_suivi(p_user uuid, p_listing text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
           SELECT lower(btrim(COALESCE(u.metadata ->> 'transaction', ''))) = 'sold'
              AND NULLIF(btrim(COALESCE(u.metadata ->> 'avant', '')), '') IS NULL
             FROM public.usage_logs u
            WHERE u.user_id = p_user AND u.feature = 'vente_leboncoin_transaction'
              AND u.metadata ->> 'listing_id' = btrim(p_listing)
            ORDER BY u.created_at LIMIT 1), false)
     AND NOT EXISTS (
           SELECT 1 FROM public.usage_logs u
            WHERE u.user_id = p_user AND u.feature = 'vente_leboncoin_transaction'
              AND u.metadata ->> 'listing_id' = btrim(p_listing)
              AND (lower(COALESCE(u.metadata ->> 'transaction', '')) IN ('aucune', 'pending')
                   OR lower(COALESCE(u.metadata ->> 'avant', '')) IN ('aucune', 'pending')));
$function$;

-- Le drapeau « Vendue » d'une annonce Leboncoin IMPORTÉE, posé par la veille de l'extension (badge « Article vendu »
-- de la page publique) ou par la règle : écarté avant d'être écrit quand « Vendu » date d'avant le suivi. La veille le
-- repose à chaque passage : il est écarté dans la MÊME écriture (aucune ligne de plus), tracé une seule fois.
CREATE OR REPLACE FUNCTION public.cross_post_jobs_lbc_vendu_avant_suivi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_premiere timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.platform_fields ->> 'sale_signal', '') = 'sold' THEN RETURN NEW; END IF;
  IF NULLIF(btrim(COALESCE(NEW.platform_listing_id, '')), '') IS NULL THEN RETURN NEW; END IF;
  IF NOT (COALESCE(NEW.platform_fields ->> 'source', '') = 'releve'
          OR COALESCE(NEW.platform_fields #>> '{rattachement,import}', '') = 'true') THEN
    RETURN NEW;                                          -- déposée par FillSell : un « Vendu » est une vente après sa mise en ligne
  END IF;
  BEGIN
    IF public.leboncoin_vendu_avant_suivi(NEW.user_id, NEW.platform_listing_id) THEN
      SELECT min(u.created_at) INTO v_premiere FROM public.usage_logs u
       WHERE u.user_id = NEW.user_id AND u.feature = 'vente_leboncoin_transaction'
         AND u.metadata ->> 'listing_id' = btrim(NEW.platform_listing_id);
      NEW.platform_fields := (NEW.platform_fields
          - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'sale_evidence'])
        || jsonb_build_object('vendu_avant_suivi', jsonb_build_object(
             'le', now(), 'listing_id', btrim(NEW.platform_listing_id), 'premiere_lecture', v_premiere,
             'motif', 'leboncoin_vendu_des_la_premiere_lecture'));
      IF TG_OP = 'INSERT' OR NOT (COALESCE(OLD.platform_fields, '{}'::jsonb) ? 'vendu_avant_suivi') THEN
        INSERT INTO public.usage_logs (user_id, feature, metadata)
        VALUES (NEW.user_id, 'vente_leboncoin_ancienne_ecartee', jsonb_build_object(
          'job', NEW.id, 'listing_id', btrim(NEW.platform_listing_id), 'premiere_lecture', v_premiere));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cross_post_jobs_lbc_vendu_avant_suivi (job %) : %', NEW.id, SQLERRM;   -- jamais une écriture perdue
  END;
  RETURN NEW;
END;
$function$;
`;

const ENTETE = `-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- UN RATTACHEMENT NE DÉCLENCHE JAMAIS DE RETRAIT ; SEULE UNE VENTE PROUVÉE APRÈS LA MISE EN LIGNE (03/11 soir, Nico)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/retraits-a-tort-0311/RAPPORT.md. Généré par scripts/essais/20261103230000_generer.mjs depuis
-- les corps de PROD du 03/11 soir (scripts/essais/fixtures/prod-0311-retrait-rattachement/). Essai : base JETABLE
-- (scripts/essais/20261103230000_banc.mjs), jamais la prod. Inverse : supabase/rollbacks/…_INVERSE.sql.
--   1. Les déclencheurs de 13:52 (annonce insérée publiée / re-pointée sur une fiche vendue) sont retirés.
--   2. « Publiée après la vente » (cross_post_jobs_publie_sur_article_vendu) : le dépôt de FillSell seulement.
--   3. armer_retrait_job_pour (TOUS les chemins) : une annonce importée n'est retirée que pour une vente APRÈS sa mise
--      en ligne (Dylan : cartes mises en ligne le 02/11, ventes Vinted du 05/08 et du 11/10).
--   4. inventaire_doublon_decider : « oui » sur une fiche vendue dont l'autre a une annonce en ligne = un article à
--      part, jamais une fusion ni un retrait (JEAN-LUC 16:19, Dylan 16:28 : 8 retraits).
--   5. Leboncoin : « Vendu » dès la première lecture d'une annonce importée = une vente d'avant le suivi — jamais une
--      vente du jour (leboncoin_transaction_noter, et le drapeau de la veille écarté : JEAN-LUC 18:15, 5 ventes déjà
--      dans l'historique, 4 copies Vinted retirées).
-- Coût : une lecture indexée par retrait armé (annonces_plateforme_unique, vinted_snapshots_item_date,
-- ventes_user_inventaire_idx) ; Leboncoin : le déclencheur ne lit usage_logs (usage_logs_user_feature_created) que
-- quand une annonce importée passe « Vendue » — jamais une ligne de plus écrite.
`;

const migration = `${ENTETE}
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS cross_post_jobs_inseree_sur_article_vendu ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS cross_post_jobs_repointee_sur_article_vendu ON public.cross_post_jobs;
${NOUVELLES}
${armer}
${publie}
${decider}
${noter}
DROP TRIGGER IF EXISTS cross_post_jobs_lbc_vendu_avant_suivi ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_lbc_vendu_avant_suivi
  BEFORE INSERT OR UPDATE OF platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.platform = 'leboncoin' AND (new.platform_fields ->> 'sale_signal') = 'sold')
  EXECUTE FUNCTION public.cross_post_jobs_lbc_vendu_avant_suivi();

REVOKE ALL ON FUNCTION public.annonce_importee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.annonce_mise_en_ligne(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vente_apres_mise_en_ligne(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leboncoin_vendu_avant_suivi(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cross_post_jobs_lbc_vendu_avant_suivi() FROM PUBLIC, anon, authenticated;

COMMIT;
`;

const inverse = `-- INVERSE de 20261103230000_rattachement_jamais_de_retrait : les quatre corps de PROD d'avant (03/11 soir), les deux
-- déclencheurs de 13:52 (20261103140000), et rien de neuf. Généré par scripts/essais/20261103230000_generer.mjs.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS cross_post_jobs_lbc_vendu_avant_suivi ON public.cross_post_jobs;

${PROD.armer}
${PROD.publie}
${PROD.decider}
${PROD.noter}
DROP FUNCTION IF EXISTS public.cross_post_jobs_lbc_vendu_avant_suivi();
DROP FUNCTION IF EXISTS public.leboncoin_vendu_avant_suivi(uuid, text);
DROP FUNCTION IF EXISTS public.vente_apres_mise_en_ligne(uuid);
DROP FUNCTION IF EXISTS public.vente_instant(timestamp with time zone, date, timestamp with time zone);
DROP FUNCTION IF EXISTS public.annonce_mise_en_ligne(uuid);
DROP FUNCTION IF EXISTS public.annonce_importee(uuid);

DROP TRIGGER IF EXISTS cross_post_jobs_inseree_sur_article_vendu ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_inseree_sur_article_vendu
  AFTER INSERT ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.status = 'published' AND COALESCE(new.action, 'publish') IN ('publish', 'republish') AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();

DROP TRIGGER IF EXISTS cross_post_jobs_repointee_sur_article_vendu ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_repointee_sur_article_vendu
  AFTER UPDATE OF inventaire_id ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.status = 'published' AND new.inventaire_id IS NOT NULL AND new.inventaire_id IS DISTINCT FROM old.inventaire_id
        AND COALESCE(new.action, 'publish') IN ('publish', 'republish'))
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();

COMMIT;
`;

writeFileSync(join(ROOT, 'supabase/migrations/20261103230000_rattachement_jamais_de_retrait.sql'), migration);
writeFileSync(join(ROOT, 'supabase/rollbacks/20261103230000_rattachement_jamais_de_retrait_INVERSE.sql'), inverse);
console.log(`migration ${migration.length} car., inverse ${inverse.length} car.`);
