// Génère la migration 20261022100000_opla_plus_rien et son inverse DEPUIS LES DÉFINITIONS DE PROD
// (pg_get_functiondef, jamais le dépôt) : chaque fonction est reprise telle que lue en prod, avec une
// insertion ancrée (l'ancre doit exister UNE fois, sinon rien n'est écrit). Le fichier d'inverse rejoue les
// définitions lues, à l'identique.
//   node scripts/essais/20261022100000_generer.mjs <dossier des définitions lues en prod>
// (un fichier <nom>.sql.txt par fonction, sortie de pg_get_functiondef)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER = process.argv[2];
if (!DOSSIER) throw new Error('dossier des définitions de prod manquant');
const def = (nom) => {
  const t = readFileSync(path.join(DOSSIER, `${nom}.sql.txt`), 'utf8').replace(/\r\n/g, '\n');
  const corps = t.split('\n-- ----')[0].trim();
  if (!corps.startsWith('CREATE OR REPLACE FUNCTION public.' + nom + '(')) throw new Error(`définition inattendue pour ${nom}`);
  return corps;
};
const md5 = (s) => createHash('md5').update(s).digest('hex');
function inserer(nom, txt, ancre, ajout, { avant = false } = {}) {
  const n = txt.split(ancre).length - 1;
  if (n !== 1) throw new Error(`${nom} : ancre trouvée ${n} fois — ${ancre.slice(0, 90)}`);
  return txt.split(ancre).join(avant ? ajout + ancre : ancre + ajout);
}
function remplacer(nom, txt, ancre, nouveau) {
  const n = txt.split(ancre).length - 1;
  if (n !== 1) throw new Error(`${nom} : ancre trouvée ${n} fois — ${ancre.slice(0, 90)}`);
  return txt.split(ancre).join(nouveau);
}
const G = "opla_sortie_passee()";

const FONCTIONS = {};
// 1. armer_retrait_job_pour — point d'entrée unique des retraits armés par le serveur (7 appelants).
FONCTIONS.armer_retrait_job_pour = (t) => inserer('armer_retrait_job_pour', t,
`  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
`, `  -- (22/10, XEWER — OPLA : PLUS RIEN) Depuis la sortie d'Opla (10/10), AUCUN retrait Opla ne naît : FillSell ne
  -- touche plus Opla. Il naissait « cancelled » (garde_opla_sortie_jobs), et un retrait clos ne comptant pas dans
  -- le contrôle des doublons ci-dessous, chaque vente et chaque suppression en recréait 2 à 4 (59 chez XEWER du
  -- 11 au 22/10, 222 sur le parc). L'information « retire-la toi-même sur Opla » est posée UNE fois, sur la
  -- copie (opla_copie_a_retirer_noter) — après toutes les preuves ci-dessus, comme le retrait d'avant.
  if j.platform = 'opla' and public.${G} then
    perform public.opla_copie_a_retirer_noter(j.id, p_chemin);
    return null;
  end if;
`);
// 2. Le filet de la suppression d'une fiche : jamais de retrait Opla, l'information une fois sur la copie.
FONCTIONS.inventaire_arme_retraits_avant_suppression = (t) => inserer('inventaire_arme_retraits_avant_suppression',
  inserer('inventaire_arme_retraits_avant_suppression', t,
`         and nullif(btrim(j.listing_url), '') is not null
`, `         -- (22/10) Opla quittée : jamais de retrait Opla (l'information est posée sur la copie, plus haut).
         and not (j.platform = 'opla' and public.${G})
`),
`    for v_pub in
`, `    -- (22/10, XEWER) Opla quittée : la copie Opla d'une fiche supprimée porte l'information une fois
    -- (« retire-la toi-même sur Opla ») ; aucun retrait n'est créé.
    if public.${G} then
      perform public.opla_copie_a_retirer_noter(c.id, 'suppression_article')
         from public.cross_post_jobs c
        where c.user_id = old.user_id and c.inventaire_id = old.id and c.platform = 'opla'
          and coalesce(c.action, 'publish') in ('publish', 'republish') and c.status = 'published';
    end if;
`, { avant: true });
// 3. La garde : un RETRAIT Opla inséré (ancienne app) n'est plus écrit du tout ; relances : inchangé (clos).
FONCTIONS.garde_opla_sortie_jobs = (t) => inserer('garde_opla_sortie_jobs', t,
`  IF NOT public.opla_sortie_passee() THEN RETURN NEW; END IF;
`, `  -- (22/10, XEWER — OPLA : PLUS RIEN) Un RETRAIT Opla ne naît plus : avant, il naissait « cancelled » et chaque
  -- vente ou suppression en recréait (la boucle de XEWER). Toute insertion d'un retrait Opla (ancienne app, geste
  -- « retirer ») pose l'information UNE fois sur la copie et la ligne n'est pas écrite. Publication et relance
  -- d'un job Opla existant : closes comme avant.
  IF TG_OP = 'INSERT' AND NEW.action = 'delete' THEN
    PERFORM public.opla_copie_a_retirer_noter(c.id, 'retrait_demande')
       FROM public.cross_post_jobs c
      WHERE c.user_id = NEW.user_id AND c.platform = 'opla' AND c.status = 'published'
        AND coalesce(c.action, 'publish') IN ('publish', 'republish')
        AND ((NEW.inventaire_id IS NOT NULL AND c.inventaire_id = NEW.inventaire_id)
             OR public.listing_designe(coalesce(nullif(btrim(c.platform_listing_id), ''), c.listing_url), NEW.listing_url, NEW.platform_listing_id));
    RETURN NULL;
  END IF;
`);
// 4. Le moteur de rapprochement ne voit plus les annonces Opla orphelines (réimport en fiche de stock).
FONCTIONS.rapprochement_v3_lire = (t) => inserer('rapprochement_v3_lire', t,
`   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
`, `     -- (22/10, XEWER) Opla quittée : une annonce Opla ORPHELINE (fiche supprimée, jamais rattachée) n'est plus
     -- jamais importée ni rattachée ; les annonces Opla déjà rattachées restent lues (preuves du graphe).
     AND NOT (a.platform = 'opla' AND a.inventaire_id IS NULL AND ${G})
`);
FONCTIONS.rapprochement_fin_run = (t) => remplacer('rapprochement_fin_run', t,
`                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop'))`,
`                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
                     AND NOT (a.platform = 'opla' AND ${G}))   -- (22/10) une orpheline Opla ne relance plus de passe`);
FONCTIONS.annonces_en_rangement = (t) => inserer('annonces_en_rangement',
  inserer('annonces_en_rangement', t,
`       AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
`, `       AND NOT (a.platform = 'opla' AND ${G})   -- (22/10) Opla quittée : plus rien à ranger
`),
`     WHERE w.user_id = auth.uid() AND w.etat = 'attente'
`, `       AND NOT (w.platform = 'opla' AND ${G})
`);
FONCTIONS.rapprochement_v3_fiche_de = (t) => inserer('rapprochement_v3_fiche_de', t,
`  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
`, `  IF a.platform = 'opla' AND ${G} THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
`);
FONCTIONS.rapprochement_attacher = (t) => inserer('rapprochement_attacher', t,
`  IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN NULL; END IF;
`, `  IF a.platform = 'opla' AND ${G} THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais un job Opla neuf
`);
FONCTIONS.rapprocher_importer = (t) => inserer('rapprocher_importer', t,
`  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
`, `  -- (22/10, XEWER) Opla quittée : une annonce Opla ne devient jamais une fiche de stock (2 fiches revenues le
  -- 21/10 à 21:28, dont un article vendu la veille).
  IF a.platform = 'opla' AND ${G} THEN RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie'); END IF;
`);
FONCTIONS.rapprochement_decider = (t) => remplacer('rapprochement_decider', t,
`  IF p_decision IN ('attache', 'import') THEN
    IF a.disparu_le IS NOT NULL THEN`,
`  IF p_decision IN ('attache', 'import') THEN
    -- (22/10, XEWER) Opla quittée : ni rattachement ni import (l'écran ne les propose plus).
    IF a.platform = 'opla' AND ${G} THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'opla_sortie',
        'message', 'FillSell ne gère plus Opla : cette annonce ne se rattache plus et ne s''importe plus.');
    END IF;
    IF a.disparu_le IS NOT NULL THEN`);

// Le retrait des doublons d'insertion du point 2 (ancre plus large que l'insertion) : contrôle final.
const NOMS = Object.keys(FONCTIONS);
const avant = Object.fromEntries(NOMS.map((n) => [n, def(n)]));
const apres = Object.fromEntries(NOMS.map((n) => [n, FONCTIONS[n](avant[n])]));
for (const n of NOMS) {
  if (apres[n] === avant[n]) throw new Error(`${n} : rien n'a changé`);
  if ((apres[n].match(/\(22\/10/g) || []).length < 1) throw new Error(`${n} : marque du 22/10 absente`);
}
if ((apres.inventaire_arme_retraits_avant_suppression.match(/and not \(j\.platform = 'opla'/g) || []).length !== 1) throw new Error('filet : exclusion Opla attendue une fois');

const NOUVELLE = `CREATE OR REPLACE FUNCTION public.opla_copie_a_retirer_noter(p_job uuid, p_chemin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (22/10, XEWER — OPLA : PLUS RIEN) L'information « peut-être encore en ligne sur Opla : retire-la toi-même » est
-- posée UNE fois, sur la COPIE Opla (le job de publication), jamais par un job de plus. Rien n'est écrit si elle est
-- déjà là, si la personne a déjà dit « C'est fait » (sur la copie ou sur un ancien retrait clos de la même annonce),
-- ou si la copie n'est pas une publication Opla vivante. Aucune ligne inchangée n'est réécrite.
DECLARE
  c public.cross_post_jobs%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.cross_post_jobs WHERE id = p_job;
  IF c.id IS NULL OR c.platform IS DISTINCT FROM 'opla' OR c.status IS DISTINCT FROM 'published'
     OR coalesce(c.action, 'publish') NOT IN ('publish', 'republish') THEN
    RETURN false;
  END IF;
  IF coalesce(c.platform_fields, '{}'::jsonb) ? 'opla_a_retirer'
     OR coalesce(c.platform_fields, '{}'::jsonb) ? 'opla_retire_par_la_personne' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.user_id = c.user_id AND d.platform = 'opla' AND d.action = 'delete'
                AND coalesce(d.platform_fields, '{}'::jsonb) ? 'opla_retire_par_la_personne'
                AND ((c.inventaire_id IS NOT NULL AND d.inventaire_id = c.inventaire_id)
                     OR public.listing_designe(coalesce(nullif(btrim(c.platform_listing_id), ''), c.listing_url), d.listing_url, d.platform_listing_id))) THEN
    RETURN false;
  END IF;
  UPDATE public.cross_post_jobs
     SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
           || jsonb_build_object('opla_a_retirer', jsonb_build_object('le', now(), 'chemin', left(coalesce(p_chemin, ''), 60)))
   WHERE id = c.id AND status = 'published';
  RETURN FOUND;
END;
$function$`;

const tete = (titre) => `-- ═══════════════════════════════════════════════════════════════════════════
-- ${titre}
-- ═══════════════════════════════════════════════════════════════════════════
`;
const empreintes = NOMS.map((n) => `--   ${n.padEnd(46)} prod ${md5(avant[n])} → ${md5(apres[n])}`).join('\n');
const MIGRATION = `${tete('20261022100000_opla_plus_rien — OPLA : PLUS RIEN (22/10, XEWER ; rapport docs/enquetes/cinq-points-2210/RAPPORT.md § 3)')}-- Depuis la sortie d'Opla (10/10), FillSell ne touche plus Opla. Restaient deux trous :
--   (a) un retrait Opla naissait « cancelled » (garde_opla_sortie_jobs) au lieu de ne pas naître ; un retrait clos ne
--       compte pas dans les contrôles de doublon → 2 à 4 retraits par vente ou suppression (222 sur le parc depuis le
--       10/10, 59 chez XEWER) et une ligne « À régler » par job ;
--   (b) le moteur de rapprochement v3 lisait encore les annonces Opla déjà en base et réimportait en fiche de stock
--       toute annonce Opla dont la fiche avait été supprimée (XEWER : 21/10 01:14 et 21:28, dont un article vendu).
-- Règle : plus AUCUN job Opla ne naît (retrait : jamais écrit ; publication / relance : closes comme avant) ;
-- l'information « retire-la toi-même sur Opla » est posée UNE fois sur la copie (platform_fields.opla_a_retirer) ;
-- une annonce Opla orpheline n'est plus jamais importée, rattachée ni proposée au rangement. Tout est borné par
-- platform = 'opla' ET opla_sortie_passee() : interrupteur coin_config opla_sortie_le à 0 = comportement d'avant.
-- Les autres plateformes : aucune ligne de leur chemin ne change.
-- Corps repris de pg_get_functiondef (prod, 22/10) + une insertion ancrée chacun (scripts/essais/20261022100000_generer.mjs).
-- Empreintes md5 (avant → après) :
${empreintes}
-- Inverse : supabase/rollbacks/20261022100000_opla_plus_rien.sql. Essai : scripts/essais/20261022100000_essai.sql (ROLLBACK).
-- ═══ CORPS DE LA MIGRATION
BEGIN;

${NOUVELLE};
REVOKE ALL ON FUNCTION public.opla_copie_a_retirer_noter(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opla_copie_a_retirer_noter(uuid, text) TO service_role;

${NOMS.map((n) => apres[n] + ';').join('\n\n')}

COMMIT;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════
`;
const INVERSE = `${tete("INVERSE de 20261022100000_opla_plus_rien : les définitions lues en prod le 22/10, à l'identique")}-- Les marqueurs platform_fields.opla_a_retirer déjà posés restent (inertes pour l'ancienne app).
-- ═══ CORPS DE L'INVERSE
BEGIN;

${NOMS.map((n) => avant[n] + ';').join('\n\n')}

DROP FUNCTION IF EXISTS public.opla_copie_a_retirer_noter(uuid, text);

COMMIT;
-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════
`;
writeFileSync(path.join(RACINE, 'supabase/migrations/20261022100000_opla_plus_rien.sql'), MIGRATION, 'utf8');
writeFileSync(path.join(RACINE, 'supabase/rollbacks/20261022100000_opla_plus_rien.sql'), INVERSE, 'utf8');
writeFileSync(path.join(RACINE, 'scripts/essais/20261022100000_empreintes.json'),
  JSON.stringify(Object.fromEntries(NOMS.map((n) => [n, { prod: md5(avant[n]), apres: md5(apres[n]) }])), null, 2) + '\n', 'utf8');
console.log(`migration ${MIGRATION.length} car., inverse ${INVERSE.length} car. ; ${NOMS.length} fonctions reprises + 1 nouvelle`);
