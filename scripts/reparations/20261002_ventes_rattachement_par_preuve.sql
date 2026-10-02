-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE : VENTES RELIÉES À LEUR ARTICLE PAR UNE PREUVE, DOUBLONS FUSIONNÉS
-- (02/10 soir, point 9) — inverse : 20261002_ventes_rattachement_par_preuve_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : migration 20261002210000 (ventes.annonce_id, règle de la même
-- cession dans enregistrer_ventes_relevees).
-- MÊME RÈGLE que la RPC, appliquée au passé (ventes créées depuis le 19/09) :
--   1. une vente SAISIE dans l'app sans article (ancien confirmSell, avant le
--      26/09 ; ajout d'une fiche déjà vendue) est reliée à la fiche écrite PAR
--      LE MÊME GESTE : une seule fiche de ce compte passée « vendu » à ±2 s de
--      la vente (inventaire.date, horodatage écrit par ce geste), une seule
--      vente pour cette fiche dans cette fenêtre, aucune autre vente déjà liée
--      à la fiche, même titre (contrôle de cohérence, jamais la preuve) ;
--      ex. Romain 40915 (vente 08:30:58.323) ↔ fiche 1786391424133 (08:30:58.190) ;
--   2. une vente RELEVÉE déjà reliée à une fiche (par numéro d'annonce) et une
--      vente SAISIE reliée à la même fiche (commande absente, même plateforme ou
--      sans plateforme, seule vente saisie de la fiche, aucune autre commande sur
--      la fiche, fiche à pièce unique) sont la MÊME cession : la ligne relevée
--      est fusionnée dans la vente saisie, qui garde son prix, son prix d'achat,
--      sa date et son bénéfice (elle reçoit commande, plateforme, date réelle,
--      numéro d'annonce, frais).
-- Le reste (ventes relevées sans numéro d'annonce en base) se relie au fil du
-- second temps du relevé (extension ≥ 0.6.88, arriéré lu en base), par la RPC
-- elle-même : même règle, aucune écriture ici.
-- Jamais le titre seul. Multi-exemplaires : jamais fusionnés. Aucune vente
-- supprimée sans avoir été fusionnée : la ligne entière est gardée dans la
-- sauvegarde ET dans usage_logs 'vente_fusionnee'.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 0. SAUVEGARDE COMPLÈTE des ventes créées depuis le 19/09 (avant tout geste).
CREATE TABLE public._backup_0210_ventes_rattrapage AS
  SELECT v.*, now() AS sauvegarde_le FROM public.ventes v WHERE v.created_at >= '2026-09-19 00:00+02';
ALTER TABLE public._backup_0210_ventes_rattrapage ADD PRIMARY KEY (id);
ALTER TABLE public._backup_0210_ventes_rattrapage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0210_ventes_rattrapage FROM anon, authenticated;
CREATE TABLE public._rattrapage_0210_ventes (
  vente_id bigint NOT NULL, etape text NOT NULL, inventaire_id bigint, fusionnee_dans bigint,
  le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (vente_id, etape));
ALTER TABLE public._rattrapage_0210_ventes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._rattrapage_0210_ventes FROM anon, authenticated;

-- 1. VENTES SAISIES ↔ FICHE ÉCRITE PAR LE MÊME GESTE (±2 s).
WITH cand AS (
  SELECT v.id AS vid, i.id AS inv
    FROM public.ventes v
    JOIN public.inventaire i ON i.user_id = v.user_id AND i.statut = 'vendu' AND i.fusionne_dans IS NULL
     AND abs(extract(epoch FROM (v.created_at - public._ts_ou_null(i.date)))) <= 2
   WHERE v.created_at >= '2026-09-19 00:00+02' AND v.inventaire_id IS NULL AND v.source IS NULL
     AND public.beebs_titre_norm(lower(v.titre)) = public.beebs_titre_norm(lower(i.titre))
), une_fiche AS (
  SELECT vid, min(inv) AS inv FROM cand GROUP BY vid HAVING count(*) = 1
), bijection AS (
  SELECT u.* FROM une_fiche u
   WHERE (SELECT count(*) FROM une_fiche u2 WHERE u2.inv = u.inv) = 1
     AND NOT EXISTS (SELECT 1 FROM public.ventes x WHERE x.inventaire_id = u.inv)
), maj AS (
  UPDATE public.ventes v SET inventaire_id = b.inv
    FROM bijection b WHERE v.id = b.vid AND v.inventaire_id IS NULL
  RETURNING v.id, b.inv
)
INSERT INTO public._rattrapage_0210_ventes (vente_id, etape, inventaire_id)
SELECT id, 'reliee_meme_geste', inv FROM maj;

-- 2. MÊME CESSION : la ligne relevée fusionnée dans la vente saisie.
CREATE TEMP TABLE _paires ON COMMIT DROP AS
SELECT r.id AS rid, m.id AS mid, r.inventaire_id AS inv
  FROM public.ventes r
  JOIN public.ventes m ON m.user_id = r.user_id AND m.inventaire_id = r.inventaire_id
   AND m.commande_ref IS NULL AND m.id <> r.id
  JOIN public.inventaire i ON i.id = r.inventaire_id AND coalesce(i.quantite, 1) <= 1
 WHERE r.source = 'releve' AND r.commande_ref IS NOT NULL AND r.inventaire_id IS NOT NULL
   AND r.created_at >= '2026-09-19 00:00+02'
   AND coalesce(public.plateforme_normalisee(coalesce(m.plateforme_code, m.plateforme)), r.plateforme_code) = r.plateforme_code
   AND (SELECT count(*) FROM public.ventes m2 WHERE m2.inventaire_id = r.inventaire_id AND m2.commande_ref IS NULL) = 1
   AND (SELECT count(*) FROM public.ventes r2 WHERE r2.inventaire_id = r.inventaire_id AND r2.commande_ref IS NOT NULL) = 1;

INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT r.user_id, 'vente_fusionnee', jsonb_build_object('gardee', p.mid, 'fusionnee', to_jsonb(r), 'motif', 'rattrapage_0210',
       'plateforme', r.plateforme_code, 'commande', r.commande_ref, 'inventaire_id', p.inv,
       'par', 'scripts/reparations/20261002_ventes_rattachement_par_preuve.sql')
  FROM _paires p JOIN public.ventes r ON r.id = p.rid;

CREATE TEMP TABLE _fusionnees ON COMMIT DROP AS
SELECT r.*, p.mid FROM _paires p JOIN public.ventes r ON r.id = p.rid;
DELETE FROM public.ventes v USING _paires p WHERE v.id = p.rid;
UPDATE public.ventes m SET
  commande_ref       = f.commande_ref,
  plateforme_code    = f.plateforme_code,
  plateforme_origine = coalesce(m.plateforme_origine, m.plateforme),
  plateforme         = coalesce(m.plateforme, f.plateforme),
  vendu_le           = coalesce(m.vendu_le, f.vendu_le),
  date               = coalesce(m.date, f.date),
  prix_vente         = coalesce(m.prix_vente, f.prix_vente),
  prix_achat         = coalesce(m.prix_achat, f.prix_achat),
  benefice           = coalesce(m.benefice, f.benefice),
  devise             = coalesce(m.devise, f.devise),
  frais_plateforme   = coalesce(m.frais_plateforme, f.frais_plateforme),
  annonce_id         = coalesce(m.annonce_id, f.annonce_id),
  releve_le          = coalesce(m.releve_le, f.releve_le)
  FROM _fusionnees f WHERE m.id = f.mid;
INSERT INTO public._rattrapage_0210_ventes (vente_id, etape, inventaire_id, fusionnee_dans)
SELECT id, 'fusionnee', inventaire_id, mid FROM _fusionnees;
INSERT INTO public._rattrapage_0210_ventes (vente_id, etape, inventaire_id)
SELECT mid, 'gardee', inventaire_id FROM _fusionnees;

SELECT etape, count(*) FROM public._rattrapage_0210_ventes GROUP BY etape ORDER BY etape;
COMMIT;
