// ═══════════════════════════════════════════════════════════════════════════
// LOUIS (Amiral) — RETRAIT DES 4 ANNONCES « ARTICLE VENDU », PUIS LA REMISE PART (feu vert nommé de Nico, 07/11 nuit)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce à la fois, deux temps, chacun sur une lecture de la page publique faite JUSTE AVANT (Chrome de Nico,
// lecture seule), écrite sur la tâche :
//   retrait <annonce> <lecture.json>  → une tâche de retrait (action delete, pending) qui vise CETTE annonce par son
//       numéro et son lien (la ligne du relevé) : le chemin normal de l'extension. Gardes EN BASE au moment d'écrire :
//       une des 4 annonces du feu vert (jamais un des 4 achats en cours), annonce de Louis vivante, lue « active » et
//       transaction « sold » il y a moins de 15 min, aucun retrait déjà ouvert sur elle, sa remise tenue et en attente.
//   liberer <annonce> <lecture.json>  → la remise sort de sa série (et de la tenue de l'étape 0) : elle part seule au
//       passage suivant (règle A : vendue retirée). Gardes : l'annonce est notée retirée en base (retrait « deleted ») ET
//       lue hors ligne (410/404) sur sa page il y a moins de 15 min ; remise en attente.
// lecture.json : { "le": ISO, "http": 200|410|404, "status": "active"|null, "transaction": "sold"|…, "texte": "…" }
// Usage : node scripts/reparations/20261107_louis_retraits_vendues_closes.mjs <retrait|liberer> <annonce> <lecture.json>
// Étape 0 (tenue) : 20261107_louis_retraits_vendues_closes_tenue.sql ; inverse : …_INVERSE.sql.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const LOUIS = "faf5021a-479a-4bb3-b3ec-c296770739b7";
// Le périmètre du feu vert : annonce vendue → sa remise en attente.
const PERIMETRE = {
  "3297400164": "18af38a2-8b0d-4c93-b86e-db04086bf1d5", // Noir et Rouge
  "3298491503": "fdda158a-3bcf-4ac6-9695-8615379a035c", // Adaptateurs Orange
  "3280443604": "886605bf-8aaa-42d2-98ed-75b56756a5ae", // Blanc
  "3297299585": "951cc7fc-5fb1-4698-9895-6664ece9c21d", // Noir et Gris
};
// ⛔ Jamais touchées tant que leur vente n'est pas close (garde-fou de Nico).
const ACHATS_EN_COURS = ["3295743872", "3295398035", "3298021777", "3297234692"];

const [, , geste, annonce, fichier] = process.argv;
if (!["retrait", "liberer"].includes(geste ?? "") || !fichier) throw new Error("usage : <retrait|liberer> <annonce> <lecture.json>");
if (ACHATS_EN_COURS.includes(annonce)) throw new Error(`${annonce} : achat en cours — jamais touchée`);
const remise = PERIMETRE[annonce];
if (!remise) throw new Error(`${annonce} : hors du périmètre du feu vert`);
const lecture = JSON.parse(fs.readFileSync(fichier, "utf8"));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lec = `${q(JSON.stringify(lecture))}::jsonb`;

const sqlRetrait = `-- Produit par 20261107_louis_retraits_vendues_closes.mjs : RETRAIT de l'annonce vendue ${annonce} (remise ${remise.slice(0, 8)}).
-- Lecture de la page publique juste avant : ${JSON.stringify(lecture)}
BEGIN;
WITH cible AS (
  SELECT a.*, i.titre AS titre_fiche
    FROM public.annonces_plateforme a
    JOIN public.inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
   WHERE a.user_id = ${q(LOUIS)} AND a.platform = 'leboncoin' AND btrim(a.listing_id) = ${q(annonce)}
     AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL AND i.fusionne_dans IS NULL
     AND (${lec} ->> 'http') = '200' AND (${lec} ->> 'status') = 'active' AND (${lec} ->> 'transaction') = 'sold'
     AND (${lec} ->> 'le')::timestamptz > now() - interval '15 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                      WHERE d.user_id = a.user_id AND d.platform = 'leboncoin' AND d.action = 'delete'
                        AND d.status IN ('pending', 'processing', 'needs_user')
                        AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id))
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs r
                  WHERE r.id = ${q(remise)} AND r.status = 'pending'
                    AND r.platform_fields #>> '{remise_en_vente,annonce_vendue}' = ${q(annonce)}
                    AND r.platform_fields #>> '{serie_un_par_un,exige_version}' = '9.9.9')
), crees AS (
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  SELECT c.user_id, c.inventaire_id, 'leboncoin', 'delete', 'pending', 'original',
         COALESCE(NULLIF(btrim(COALESCE(c.titre, '')), ''), c.titre_fiche), NULLIF(btrim(COALESCE(c.url, '')), ''), btrim(c.listing_id),
         jsonb_build_object(
           'arme_par', jsonb_build_object('chemin', 'vendue_close_avant_remise_0711', 'le', now(), 'annonce', c.id,
             'depot', c.job_id, 'remise', ${q(remise)},
             'pose_par', 'réparation 07/11 nuit (feu vert nommé de Nico : retrait des 4 annonces « Article vendu » de Louis)'),
           'preuve', 'vente_close_transaction_sold', 'lecture_avant_retrait', ${lec})
    FROM cible c
  RETURNING id, user_id, inventaire_id, platform_listing_id
), journal AS (
  INSERT INTO public.usage_logs (user_id, feature, metadata)
  SELECT c.user_id, 'retrait_annonces', jsonb_build_object('chemin', 'vendue_close_avant_remise_0711',
           'plateformes', jsonb_build_array('leboncoin'), 'n_annonces', 1, 'n_articles', 1,
           'article_id', c.inventaire_id::text, 'listing_id', c.platform_listing_id)
    FROM crees c
  RETURNING 1
)
INSERT INTO public._backup_0711_louis_retraits_vendues (t, cle, ligne, retrait_cree)
SELECT 'retrait', c.platform_listing_id, ${lec}, c.id FROM crees c;
SELECT b.cle AS annonce, b.retrait_cree, j.status, j.listing_url
  FROM public._backup_0711_louis_retraits_vendues b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.t = 'retrait' AND b.cle = ${q(annonce)};
COMMIT;
`;

const sqlLiberer = `-- Produit par 20261107_louis_retraits_vendues_closes.mjs : LIBÉRATION de la remise ${remise.slice(0, 8)} (annonce vendue ${annonce} retirée).
-- Lecture de la page publique juste avant : ${JSON.stringify(lecture)}
BEGIN;
UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'serie_un_par_un') || jsonb_build_object('serie_sortie', jsonb_build_object(
         'le', now(), 'marqueur', j.platform_fields -> 'serie_un_par_un', 'lecture_vendue_hors_ligne', ${lec},
         'motif', 'annonce vendue ${annonce} retirée par FillSell (vente close) et relue hors ligne',
         'pose_par', 'réparation 07/11 nuit (feu vert nommé de Nico : retrait des vendues closes, la remise part seule)'))
 WHERE j.id = ${q(remise)} AND j.user_id = ${q(LOUIS)} AND j.status = 'pending'
   AND j.platform_fields #>> '{remise_en_vente,annonce_vendue}' = ${q(annonce)}
   AND (${lec} ->> 'http') IN ('410', '404') AND (${lec} ->> 'le')::timestamptz > now() - interval '15 minutes'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.platform = 'leboncoin' AND btrim(a.listing_id) = ${q(annonce)}
                  AND a.retiree_le IS NOT NULL);
SELECT left(j.id::text, 8) AS remise, j.status, j.platform_fields ? 'serie_un_par_un' AS encore_en_serie,
       j.platform_fields #>> '{serie_sortie,le}' AS liberee_le
  FROM public.cross_post_jobs j WHERE j.id = ${q(remise)};
COMMIT;
`;

const nom = `20261107_louis_retraits_vendues_closes_${geste}_${annonce}.sql`;
fs.writeFileSync(join(ICI, nom), geste === "retrait" ? sqlRetrait : sqlLiberer);
console.log(`écrit : ${nom}`);
