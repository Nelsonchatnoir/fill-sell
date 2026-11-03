// GÉNÈRE la migration « grille à 3 jauges » (décisions de Nico du 03/11/2026) et son inverse, À PARTIR des
// définitions de PROD (scripts/quotas/fixtures/prod-0311-trois-jauges.sql, pg_get_functiondef du 03/11) : chaque
// fonction touchée est la définition de prod, plus des remplacements ciblés qui doivent tomber UNE fois chacun
// (sinon le script s'arrête). Rien n'est appliqué : le script écrit deux fichiers.
//
//   node scripts/quotas/generer-trois-jauges.mjs
//     → supabase/migrations/20261104000000_trois_jauges_interrupteur.sql
//     → supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql
//
// L'INTERRUPTEUR : coin_config.grille_trois_jauges (0 = règles actuelles, 1 = la grille). À 0, chaque fonction rend
// EXACTEMENT ce qu'elle rendait (prouvé par scripts/quotas/preuve-trois-jauges.mjs, cas par cas, avant / après).
import { readFileSync, writeFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FIXTURE = lire('./fixtures/prod-0311-trois-jauges.sql');

// Une définition de la fixture, par son nom.
function definition(nom) {
  const debut = FIXTURE.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (debut < 0) throw new Error(`fixture : ${nom} absente`);
  const fin = FIXTURE.indexOf('\n$function$;', debut);
  if (fin < 0) throw new Error(`fixture : fin de ${nom} introuvable`);
  return FIXTURE.slice(debut, fin + '\n$function$;'.length);
}

// Un remplacement qui tombe UNE fois, ou rien.
function remplacer(texte, avant, apres, nom) {
  const n = texte.split(avant).length - 1;
  if (n !== 1) throw new Error(`${nom} : « ${avant.slice(0, 70).replace(/\n/g, '⏎')} » trouvé ${n} fois (1 attendu)`);
  return texte.replace(avant, () => apres);
}

const MOTIF = '(03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d\'avant)';

// ── 1. Les clés (inertes tant que l'interrupteur est à 0) ─────────────────────
const CLES = [
  ['grille_trois_jauges', 0],
  ['jauge_annonces_free', 5], ['jauge_annonces_premium', 40], ['jauge_annonces_pro', 120], ['jauge_annonces_business', 0],
  ['jauge_publications_free', 50], ['jauge_publications_premium', 400], ['jauge_publications_pro', 1200], ['jauge_publications_business', 0],
  ['jauge_remontees_free', 30], ['jauge_remontees_premium', 1500], ['jauge_remontees_pro', 0], ['jauge_remontees_business', 0],
  ['jauge_lens_business', 600],
  ['garde_jour_publications', 2000], ['garde_jour_remontees', 2000], ['garde_jour_annonces', 800],
];

// ── 2. Les fonctions neuves ───────────────────────────────────────────────────
const AIDES = String.raw`
-- L'interrupteur. 1 = la grille à 3 jauges ; tout le reste = les règles d'avant.
CREATE OR REPLACE FUNCTION public.jauges_actives()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT value FROM coin_config WHERE key = 'grille_trois_jauges'), 0) = 1;
$function$;

-- Annonces (rédaction IA + Lens) : NULL = pas de compteur (illimité).
-- Interrupteur à 0 ou clé jauge_ absente : quota_annonces_compte, à l'identique (réglage du compte compris).
-- Grille : clé à 0 = illimité, le réglage du compte n'y change rien (Business) ; sinon le réglage du compte prime.
CREATE OR REPLACE FUNCTION public.jauge_annonces_plafond(p_user uuid, p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH k AS (SELECT (SELECT value FROM coin_config WHERE key = 'jauge_annonces_' || COALESCE(p_tier, 'free')) AS v)
  SELECT CASE
    WHEN NOT jauges_actives() OR k.v IS NULL THEN quota_annonces_compte(p_user, p_tier)
    WHEN k.v = 0 THEN NULL
    ELSE COALESCE((SELECT q.quota_annonces FROM quotas_par_compte q WHERE q.user_id = p_user), k.v)
  END FROM k;
$function$;

-- Remontées : le plafond du palier, NULL = pas de compteur (illimité).
-- Interrupteur à 0 : quota_republication_<palier> (0 = rien), Business sans compteur — comme avant.
CREATE OR REPLACE FUNCTION public.quota_remontees_plafond(p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH k AS (SELECT (SELECT value FROM coin_config WHERE key = 'jauge_remontees_' || COALESCE(p_tier, 'free')) AS v)
  SELECT CASE
    WHEN jauges_actives() AND k.v IS NOT NULL THEN NULLIF(k.v, 0)
    WHEN COALESCE(p_tier, 'free') = 'business' THEN NULL
    ELSE NULLIF((SELECT value FROM coin_config WHERE key = 'quota_republication_' || COALESCE(p_tier, 'free')), 0)
  END FROM k;
$function$;

-- Publications (chaque mise en ligne, 1 par plateforme) : NULL = pas de compteur. Rien du tout avant la grille.
CREATE OR REPLACE FUNCTION public.jauge_publications_plafond(p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN jauges_actives()
    THEN NULLIF((SELECT value FROM coin_config WHERE key = 'jauge_publications_' || COALESCE(p_tier, 'free')), 0)
  END;
$function$;

-- Lens : un compteur À PART pour le Business seulement (600 par mois affichés). Ailleurs, Lens compte dans les annonces.
CREATE OR REPLACE FUNCTION public.jauge_lens_plafond(p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN jauges_actives() AND COALESCE(p_tier, 'free') = 'business'
    THEN NULLIF((SELECT value FROM coin_config WHERE key = 'jauge_lens_business'), 0)
  END;
$function$;

-- Les publications d'un compte depuis une date : faites ou en cours, jamais une annulée jamais publiée, une synchro,
-- un import (relevé), une tâche hors quota ni une sortie d'Opla. Même règle que remontees_du_cycle (03/11).
CREATE OR REPLACE FUNCTION public.publications_du_cycle(p_user uuid, p_depuis timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
    FROM cross_post_jobs j
   WHERE j.user_id = p_user
     AND j.action = 'publish'
     AND j.created_at >= p_depuis
     AND (j.published_at IS NOT NULL OR j.status IN ('published', 'sold', 'pending', 'processing', 'needs_user'))
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota'])
     AND COALESCE(j.handler_build, '') !~ '(sync-dressing|releve-annonces)';
$function$;

-- Le garde-fou INVISIBLE du jour (heure de Paris), contre les boucles et pour protéger les comptes des restrictions
-- des plateformes : NULL = rien à dire ; sinon le refus, avec un message honnête (jamais un mur de vente).
CREATE OR REPLACE FUNCTION public.garde_fou_jour(p_user uuid, p_jauge text, p_ajout integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_garde  integer;
  v_minuit timestamptz;
  v_faites integer;
  v_nom    text;
BEGIN
  IF NOT jauges_actives() THEN
    RETURN NULL;
  END IF;
  SELECT NULLIF(value, 0) INTO v_garde FROM coin_config WHERE key = 'garde_jour_' || p_jauge;
  IF v_garde IS NULL THEN
    RETURN NULL;
  END IF;
  v_minuit := date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris';
  v_faites := CASE p_jauge
    WHEN 'publications' THEN publications_du_cycle(p_user, v_minuit)
    WHEN 'remontees'    THEN remontees_du_cycle(p_user, v_minuit)
    WHEN 'annonces'     THEN quota_annonces_consommees(p_user, v_minuit)
  END;
  IF v_faites IS NULL OR v_faites + GREATEST(COALESCE(p_ajout, 1), 0) <= v_garde THEN
    RETURN NULL;
  END IF;
  v_nom := CASE p_jauge WHEN 'remontees' THEN 'remontées' ELSE p_jauge END;
  RETURN jsonb_build_object(
    'allowed', false, 'reason', 'garde_fou_jour', 'jauge', p_jauge,
    'garde', v_garde, 'faites', v_faites, 'reprise_le', v_minuit + interval '1 day',
    'message', format('Pause de sécurité jusqu''à minuit : tu as fait %s %s aujourd''hui. Au-delà, les plateformes risquent de restreindre ton compte. Rien n''est perdu : tout reprend demain.',
                      replace(to_char(v_faites, 'FM999,999,999'), ',', ' '), v_nom));
END;
$function$;
`;

// ── 3. Les fonctions de prod, retouchées ─────────────────────────────────────
const sorties = [];

// 3a. quotas_etat
{
  const n = 'quotas_etat';
  let d = definition(n);
  d = remplacer(d, '  v_qa := quota_annonces_compte(v_user, v_tier);',
    `  -- ${MOTIF} : jauge_annonces_plafond (à 0 : quota_annonces_compte, à l'identique).\n  v_qa := jauge_annonces_plafond(v_user, v_tier);`, n);
  d = remplacer(d, `  ELSE\n    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;`,
    `  ELSIF jauges_actives() AND quota_remontees_plafond(v_tier) IS NULL THEN\n    -- ${MOTIF} : remontées illimitées (Pro).\n    v_repub := jsonb_build_object('mode', 'illimite');\n  ELSE\n    v_qrep := quota_remontees_plafond(v_tier);`, n);
  d = remplacer(d, `    'republication', v_repub\n  );\nEND;`,
    `    'republication', v_repub\n  ) || CASE WHEN jauges_actives() THEN jsonb_build_object(\n    -- ${MOTIF} : les publications, le mode des annonces et le Lens du Business.\n    'grille', 'trois_jauges',\n    'annonces_mode', CASE WHEN v_qa IS NULL THEN 'illimite' ELSE 'mensuel' END,\n    'publications', (SELECT jsonb_build_object('mode', CASE WHEN x.pl IS NULL THEN 'illimite' ELSE 'mensuel' END,\n                              'plafond', x.pl, 'consommes', x.c,\n                              'restantes', CASE WHEN x.pl IS NOT NULL THEN GREATEST(0, x.pl - x.c) END)\n                     FROM (SELECT jauge_publications_plafond(v_tier) AS pl, publications_du_cycle(v_user, v_cycle) AS c) x),\n    'lens', (SELECT CASE WHEN l.pl IS NULL THEN NULL\n                    ELSE jsonb_build_object('plafond', l.pl, 'consommes', v_cs, 'restantes', GREATEST(0, l.pl - v_cs)) END\n             FROM (SELECT jauge_lens_plafond(v_tier) AS pl) l)\n  ) ELSE '{}'::jsonb END;\nEND;`, n);
  sorties.push([n, d]);
}

// 3b. quota_republication_free_etat
{
  const n = 'quota_republication_free_etat';
  let d = definition(n);
  d = remplacer(d, `  SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_free';`,
    `  -- ${MOTIF} : 30 avec la grille, quota_republication_free avant.\n  v_plafond := quota_remontees_plafond('free');`, n);
  sorties.push([n, d]);
}

// 3c. spend_coins_for_generate
{
  const n = 'spend_coins_for_generate';
  let d = definition(n);
  d = remplacer(d, '  v_regen     boolean := false;\n', '  v_regen     boolean := false;\n  v_garde     jsonb;\n', n);
  d = remplacer(d, '    v_quota := quota_annonces_compte(p_user_id, v_tier);',
    `    -- ${MOTIF}\n    v_quota := jauge_annonces_plafond(p_user_id, v_tier);`, n);
  d = remplacer(d, `      END IF;\n    END IF;\n  END IF;\n\n  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';`,
    `      END IF;\n    END IF;\n    -- ${MOTIF} : le garde-fou du jour, sous le code que generate-listing relaie déjà avec son message.\n    v_garde := garde_fou_jour(p_user_id, 'annonces', 1);\n    IF v_garde IS NOT NULL THEN\n      RETURN jsonb_build_object('allowed', false, 'reason', 'pro_daily_cap_reached', 'garde_fou', true, 'jauge', 'annonces',\n                                'message', v_garde ->> 'message', 'cap', (v_garde ->> 'garde')::integer,\n                                'used', (v_garde ->> 'faites')::integer, 'reprise_le', v_garde -> 'reprise_le');\n    END IF;\n  END IF;\n\n  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';`, n);
  sorties.push([n, d]);
}

// 3d. spend_coins_for_lens
{
  const n = 'spend_coins_for_lens';
  let d = definition(n);
  d = remplacer(d, '  v_consommes integer;\nBEGIN', '  v_consommes integer;\n  v_garde     jsonb;\n  v_ql        integer;\n  v_cl        integer;\n  v_remise    timestamptz;\nBEGIN', n);
  d = remplacer(d, '  v_quota := quota_annonces_compte(p_user_id, v_tier);',
    `  -- ${MOTIF}\n  v_quota := jauge_annonces_plafond(p_user_id, v_tier);`, n);
  d = remplacer(d, `  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';`,
    `  -- ${MOTIF} : Lens du Business, 600 par mois affichés ; refus sous le code que lens-analysis relaie déjà.\n  v_ql := jauge_lens_plafond(v_tier);\n  IF v_ql IS NOT NULL THEN\n    SELECT count(*)::integer INTO v_cl FROM usage_logs\n     WHERE user_id = p_user_id AND feature = 'lens' AND created_at >= debut_cycle_quotas(p_user_id);\n    IF v_cl >= v_ql THEN\n      SELECT w.next_grant_at INTO v_remise FROM coin_wallets w WHERE w.user_id = p_user_id;\n      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_scan_atteint', 'jauge', 'lens',\n                                'plafond', v_ql, 'consommes', v_cl, 'remise_le', v_remise,\n                                'message', format('Tes %s scans Lens du mois sont faits%s. Tout le reste continue, sans limite.', v_ql,\n                                  CASE WHEN v_remise IS NOT NULL THEN ' : ils reviennent le ' || to_char(v_remise AT TIME ZONE 'Europe/Paris', 'DD/MM') ELSE '' END));\n    END IF;\n  END IF;\n  v_garde := garde_fou_jour(p_user_id, 'annonces', CASE WHEN p_unifie THEN 0 ELSE 1 END);\n  IF v_garde IS NOT NULL THEN\n    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_scan_atteint', 'garde_fou', true, 'jauge', 'annonces',\n                              'plafond', (v_garde ->> 'garde')::integer, 'consommes', (v_garde ->> 'faites')::integer,\n                              'message', v_garde ->> 'message', 'reprise_le', v_garde -> 'reprise_le');\n  END IF;\n\n  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';`, n);
  sorties.push([n, d]);
}

// 3e. spend_coins_and_publish
{
  const n = 'spend_coins_and_publish';
  let d = definition(n);
  d = remplacer(d, '  v_conflits_relie jsonb;\nBEGIN', '  v_conflits_relie jsonb;\n  v_pub_plafond   integer;\n  v_pub_faites    integer;\n  v_pub_remise    timestamptz;\n  v_garde         jsonb;\nBEGIN', n);
  d = remplacer(d, `  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;`,
    `  -- ${MOTIF} : la jauge Publications (1 par plateforme, avec ou sans IA) et le garde-fou du jour, AVANT tout débit.\n  IF jauges_actives() THEN\n    PERFORM pg_advisory_xact_lock(hashtextextended('publications:' || v_user::text, 0));\n    v_pub_plafond := jauge_publications_plafond(palier_de(v_user));\n    IF v_pub_plafond IS NOT NULL THEN\n      v_pub_faites := publications_du_cycle(v_user, debut_cycle_quotas(v_user));\n      IF v_pub_faites + v_job_count > v_pub_plafond THEN\n        SELECT w.next_grant_at INTO v_pub_remise FROM coin_wallets w WHERE w.user_id = v_user;\n        RETURN jsonb_build_object(\n          'allowed', false, 'reason', 'quota_publications_atteint', 'jauge', 'publications',\n          'plafond', v_pub_plafond, 'consommes', v_pub_faites,\n          'restantes', GREATEST(0, v_pub_plafond - v_pub_faites), 'demandees', v_job_count, 'remise_le', v_pub_remise,\n          'message', CASE WHEN v_pub_faites >= v_pub_plafond\n            THEN format('Tes %s publications du mois sont faites%s. Rien n''a été publié ni décompté.', v_pub_plafond,\n                   CASE WHEN v_pub_remise IS NOT NULL THEN ' : elles reviennent le ' || to_char(v_pub_remise AT TIME ZONE 'Europe/Paris', 'DD/MM') ELSE '' END)\n            ELSE format('Il te reste %s publication%s ce mois-ci, et cet article en demande %s : décoche une plateforme. Rien n''a été publié ni décompté.',\n                   v_pub_plafond - v_pub_faites, CASE WHEN v_pub_plafond - v_pub_faites > 1 THEN 's' ELSE '' END, v_job_count)\n          END);\n      END IF;\n    END IF;\n    v_garde := garde_fou_jour(v_user, 'publications', v_job_count);\n    IF v_garde IS NOT NULL THEN\n      RETURN v_garde;\n    END IF;\n  END IF;\n\n  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;`, n);
  d = remplacer(d, `      j->'platform_fields',\n      v_res_id`,
    `      -- ${MOTIF} : avec la grille, un appel de l'app ne pose jamais lui-même un marqueur hors quota.\n      CASE WHEN jauges_actives() THEN (j->'platform_fields') - 'hors_quota' - 'opla_sortie' ELSE j->'platform_fields' END,\n      v_res_id`, n);
  sorties.push([n, d]);
}

// 3f. spend_coins_and_republish
{
  const n = 'spend_coins_and_republish';
  let d = definition(n);
  d = remplacer(d, '  v_cycle    timestamptz;\n', '  v_cycle    timestamptz;\n  v_garde    jsonb;\n', n);
  d = remplacer(d, `    SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_' || v_tier;`,
    `    -- ${MOTIF} : 1 500 au Premium, illimité au Pro avec la grille.\n    v_plafond := quota_remontees_plafond(v_tier);`, n);
  d = remplacer(d, `        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',\n                                  'plafond', v_plafond, 'faites', v_faits);\n      END IF;\n    END IF;\n  END IF;\n`,
    `        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',\n                                  'plafond', v_plafond, 'faites', v_faits);\n      END IF;\n    END IF;\n  END IF;\n\n  -- ${MOTIF} : le garde-fou du jour. L'automatique reçoit le code que l'extension 0.6.169 connaît déjà.\n  v_garde := garde_fou_jour(v_user, 'remontees', 1);\n  IF v_garde IS NOT NULL THEN\n    IF p_source = 'auto' THEN\n      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'garde_fou', true,\n                                'plafond', (v_garde ->> 'garde')::integer);\n    END IF;\n    RETURN v_garde || jsonb_build_object('platform', v_platform);\n  END IF;\n`, n);
  sorties.push([n, d]);
}

// 3g. republish_planifiee_etat
{
  const n = 'republish_planifiee_etat';
  let d = definition(n);
  d = remplacer(d, `    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;`,
    `    -- ${MOTIF}\n    v_quota := quota_remontees_plafond(v_palier);`, n);
  sorties.push([n, d]);
}

// 3h. remise_en_vente_place
{
  const n = 'remise_en_vente_place';
  let d = definition(n);
  d = remplacer(d, `    SELECT NULLIF(value, 0) INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;`,
    `    -- ${MOTIF}\n    v_quota := quota_remontees_plafond(v_palier);`, n);
  sorties.push([n, d]);
}

const NOUVELLES = ['jauges_actives()', 'jauge_annonces_plafond(uuid, text)', 'quota_remontees_plafond(text)',
  'jauge_publications_plafond(text)', 'jauge_lens_plafond(text)',
  'publications_du_cycle(uuid, timestamp with time zone)', 'garde_fou_jour(uuid, text, integer)'];

const migration = `-- ═══════════════════════════════════════════════════════════════════════════
-- 20261104000000 — LA GRILLE À 3 JAUGES, DERRIÈRE UN INTERRUPTEUR (décisions de Nico du 03/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Généré par scripts/quotas/generer-trois-jauges.mjs depuis les définitions de PROD du 03/11
-- (scripts/quotas/fixtures/prod-0311-trois-jauges.sql). Preuve : PREUVE_PG=embarque node scripts/quotas/preuve-trois-jauges.mjs
-- Inverse : supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql
--
-- L'INTERRUPTEUR : coin_config.grille_trois_jauges, posé à 0. À 0, rien ne change pour personne : chaque fonction
-- rend ce qu'elle rendait. À 1 (décision de Nico, après l'avant / après des compteurs payants) :
--   Annonces (rédaction IA + Lens)  Free 5 · Premium 40 · Pro 120 · Business illimité (Lens 600 par mois, à part)
--   Publications (1 par plateforme)  Free 50 · Premium 400 · Pro 1 200 · Business illimité
--   Remontées (1 par plateforme)     Free 30 · Premium 1 500 · Pro illimité · Business illimité
--   Garde-fous INVISIBLES par jour (heure de Paris) : publications 2 000, remontées 2 000, annonces 800.
--   Imports, synchros, retraits et tâches annulées ne comptent jamais. Aucun plafond mensuel caché.
--   Retouches IA et voix : inchangées. Bordereaux : déjà Pro et Business seulement (bordereaux_ouverts_pour, 24/10).
-- Compatibilité (app actuelle, extension 0.6.169) : chaque refus neuf porte un « message » que l'app affiche déjà ;
-- generate-listing et lens-analysis relaient les codes réutilisés (pro_daily_cap_reached, quota_scan_atteint) ;
-- l'automatique reçoit plafond_auto_atteint.

INSERT INTO public.coin_config (key, value) VALUES
${CLES.map(([k, v]) => `  ('${k}', ${v})`).join(',\n')}
ON CONFLICT (key) DO NOTHING;
${AIDES}
${sorties.map(([n, d]) => `-- ── ${n} (définition de prod du 03/11, retouchée) ──\n${d}\n`).join('\n')}
-- Les fonctions neuves ne s'appellent que depuis les fonctions ci-dessus (SECURITY DEFINER, propriétaire postgres).
${NOUVELLES.map((f) => `REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.${f} TO service_role;`).join('\n')}
`;

const inverse = `-- INVERSE de 20261104000000_trois_jauges_interrupteur : les 8 fonctions reprennent leur définition de prod du 03/11,
-- les fonctions neuves et les clés neuves disparaissent. Généré par scripts/quotas/generer-trois-jauges.mjs.
-- (Plus simple encore : coin_config.grille_trois_jauges = 0 rend déjà les règles d'avant.)

${sorties.map(([n]) => definition(n)).join('\n\n')}

${NOUVELLES.slice().reverse().map((f) => `DROP FUNCTION IF EXISTS public.${f};`).join('\n')}

DELETE FROM public.coin_config WHERE key IN (${CLES.map(([k]) => `'${k}'`).join(', ')});
`;

writeFileSync(new URL('../../supabase/migrations/20261104000000_trois_jauges_interrupteur.sql', import.meta.url), migration);
writeFileSync(new URL('../../supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql', import.meta.url), inverse);
console.log(`migration : ${migration.length} caractères, ${sorties.length} fonctions de prod retouchées, ${NOUVELLES.length} neuves, ${CLES.length} clés`);
console.log(`inverse   : ${inverse.length} caractères`);
