// ═══════════════════════════════════════════════════════════════════════════
// (06/11, feu vert de Nico, point 2) LES COUPLES « VRAIS » : une fiche, DEUX annonces vivantes du même article sur la
// même plateforme (tri photo du 06/11, docs/enquetes/rattachements-0511/ACTIONS-62-VRAIS.md) → l'annonce proposée au
// retrait est retirée par le CIRCUIT NORMAL : une tâche de retrait (action delete, pending) qui vise CETTE annonce par
// son numéro et son lien (la ligne du relevé) — la même que crée armer_retrait_annonce_pour (qui, elle, n'arme que les
// fiches VENDUES : ici la fiche reste en vente par l'annonce gardée). L'extension (ou l'API eBay) l'exécute.
//
// GARDE-FOUS (Nico) — vérifiés EN BASE au moment d'écrire, sinon la ligne n'est pas écrite :
//   · seulement les annonces de la liste (65 proposées) MOINS les 13 couples où « vrai » ne dit pas « un seul
//     exemplaire » (n° 1, 2, 3, 6, 12, 21, 23, 32, 34, 40, 44, 45, 75 : neufs, catalogue, timbres) ; jamais les
//     n° 20 et 22 (à trancher), jamais les 13 indécidables ;
//   · fiche en stock, quantité 1, non fusionnée ; annonce vivante (ni disparue, ni retirée, ni écartée), sans
//     transaction ; l'annonce GARDÉE vivante sur la même fiche ; aucun retrait déjà ouvert sur cette annonce ;
//   · chaque annonce relue EN VENTE sur sa page juste avant (Chrome de Nico, lecture seule) — la lecture est écrite
//     sur la tâche (lecture_avant_retrait), l'annonce gardée aussi.
// Usage : node scripts/reparations/20261106_couples_vrais_retraits.mjs <lot> <fichier lectures.json>
//   lectures.json : [{ ap, garde, lecture: { le, etat, detail } }] → écrit 20261106_couples_vrais_retraits_<lot>.sql ;
//   l'inverse (annule les retraits encore en attente) : 20261106_couples_vrais_retraits_INVERSE.sql.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const [, , lot, fichier] = process.argv;
if (!/^[a-z0-9]+$/.test(lot ?? "") || !fichier) throw new Error("usage : <lot> <lectures.json>");
const lectures = JSON.parse(fs.readFileSync(fichier, "utf8"));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const uuid = (s) => { if (!/^[0-9a-f-]{36}$/.test(s)) throw new Error("ap illisible : " + s); return q(s); };

const lignes = lectures.map(({ ap, garde, lecture }) => `
  -- ${ap} (garde ${garde}) : ${lecture.etat} — ${lecture.detail ?? ""}
  INSERT INTO pg_temp.a_armer VALUES (${uuid(ap)}, ${q(String(garde).trim())}, ${q(JSON.stringify(lecture))}::jsonb);`).join("");

const sql = `-- Produit par scripts/reparations/20261106_couples_vrais_retraits.mjs, lot « ${lot} » : ${lectures.length} annonce(s).
-- Inverse : 20261106_couples_vrais_retraits_INVERSE.sql (annule les retraits encore en attente).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_couples_retraits (
  le timestamptz NOT NULL DEFAULT now(), lot text NOT NULL, annonce uuid NOT NULL, listing_id text, ligne jsonb,
  garde text, lecture jsonb, retrait_cree uuid);
ALTER TABLE public._backup_0611_couples_retraits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_couples_retraits FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE a_armer (ap uuid, garde text, lecture jsonb) ON COMMIT DROP;${lignes}
-- Les gardes, en base, maintenant ; chaque annonce gardée ou non est sauvegardée telle quelle.
INSERT INTO public._backup_0611_couples_retraits (lot, annonce, listing_id, ligne, garde, lecture)
SELECT ${q(lot)}, a.id, a.listing_id, to_jsonb(a.*), x.garde, x.lecture
  FROM pg_temp.a_armer x JOIN public.annonces_plateforme a ON a.id = x.ap;
WITH cibles AS (
  SELECT a.*, x.garde, x.lecture, i.titre AS titre_fiche
    FROM pg_temp.a_armer x
    JOIN public.annonces_plateforme a ON a.id = x.ap
    JOIN public.inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
   WHERE a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
     AND length(btrim(COALESCE(a.listing_id, ''))) >= 4 AND a.platform <> 'opla'
     AND COALESCE(a.transaction_plateforme, '') NOT IN ('pending', 'sold')
     AND i.fusionne_dans IS NULL AND i.statut = 'stock' AND COALESCE(i.quantite, 1) = 1
     AND btrim(a.listing_id) <> btrim(x.garde)
     AND EXISTS (SELECT 1 FROM public.annonces_plateforme g
                  WHERE g.user_id = a.user_id AND g.platform = a.platform AND g.inventaire_id = a.inventaire_id
                    AND btrim(g.listing_id) = btrim(x.garde)
                    AND g.disparu_le IS NULL AND g.retiree_le IS NULL AND g.ignoree_le IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                      WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                        AND d.status IN ('pending', 'processing', 'needs_user')
                        AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id))
), crees AS (
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  SELECT c.user_id, c.inventaire_id, c.platform, 'delete', 'pending', 'original',
         COALESCE(NULLIF(btrim(COALESCE(c.titre, '')), ''), c.titre_fiche), NULLIF(btrim(COALESCE(c.url, '')), ''), btrim(c.listing_id),
         jsonb_build_object(
           'arme_par', jsonb_build_object('chemin', 'couple_vrai_meme_plateforme_0611', 'le', now(), 'annonce', c.id,
             'depot', c.job_id, 'garde', c.garde, 'pose_par', 'réparation 06/11 (feu vert de Nico, point 2 : couples vrais)'),
           'preuve', 'tri_photo_0611_couple_vrai', 'lecture_avant_retrait', c.lecture)
         || CASE WHEN NULLIF(btrim(COALESCE(c.url, '')), '') IS NULL THEN jsonb_build_object('removal_url_missing', true) ELSE '{}'::jsonb END
    FROM cibles c
  RETURNING id, platform_fields->'arme_par'->>'annonce' AS annonce, user_id, platform, inventaire_id, platform_listing_id
), journal AS (
  INSERT INTO public.usage_logs (user_id, feature, metadata)
  SELECT c.user_id, 'retrait_annonces', jsonb_build_object('chemin', 'couple_vrai_meme_plateforme_0611',
           'plateformes', jsonb_build_array(c.platform), 'n_annonces', 1, 'n_articles', 1,
           'article_id', c.inventaire_id::text, 'annonce', c.annonce, 'listing_id', c.platform_listing_id)
    FROM crees c
  RETURNING 1
)
UPDATE public._backup_0611_couples_retraits b SET retrait_cree = c.id
  FROM crees c WHERE b.lot = ${q(lot)} AND b.annonce::text = c.annonce;
SELECT b.lot, b.listing_id, b.garde, b.retrait_cree, j.platform, j.status, j.voie
  FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.lot = ${q(lot)} ORDER BY j.platform, b.listing_id;
COMMIT;
`;
fs.writeFileSync(join(ICI, `20261106_couples_vrais_retraits_${lot}.sql`), sql);
fs.writeFileSync(join(ICI, "20261106_couples_vrais_retraits_INVERSE.sql"), `-- Inverse de 20261106_couples_vrais_retraits_<lot>.sql : les retraits créés et ENCORE en attente sont annulés (rien
-- n'a encore été retiré chez la plateforme pour eux). Un retrait déjà fait ne se défait pas ici : l'annonce se republie.
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = 'cancelled', error = 'Retrait annulé (inverse de la réparation du 06/11, couples vrais).'
  FROM public._backup_0611_couples_retraits b
 WHERE j.id = b.retrait_cree AND j.action = 'delete' AND j.status = 'pending';
SELECT b.lot, b.listing_id, j.status FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree;
COMMIT;
`);
console.log(`écrit : 20261106_couples_vrais_retraits_${lot}.sql (${lectures.length}) et l'inverse`);
