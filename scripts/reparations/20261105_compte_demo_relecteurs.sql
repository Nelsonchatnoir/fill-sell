-- (05/11 soir, lot « Ouverture du Cloud », décision g de Nico, précisée à 21:37) LE COMPTE DE DÉMO DES RELECTEURS APPLE
-- ET GOOGLE : googlereview@fillsell.app (953c1ca6-4851-41e7-b2b0-fb2a18551815, créé le 21/06), RÉUTILISÉ — aucun autre
-- compte créé. Ordre de Nico : « offre Cloud visible et ACHETABLE en bac à sable (pas offerte), articles de démo propres,
-- ajout à cloud-2 ; vérifie qu'il ne casse rien sur ce compte (son Premium actuel, les notes déjà saisies). »
-- Relu le 05/11 à 21:40 (lecture seule) : Premium offert (is_premium, is_comped), beta_flags {}, Cloud jamais pris, 1
-- article (« Robe » Zara, sans photo ni description, id 1782928830799), 0 job, aucun poste ni IP Cloud.
-- Ce que fait le script (rien d'autre) :
--   1. sauvegarde : public._backup_0511_compte_demo_relecteurs (beta_flags d'avant ; la ligne ENTIÈRE de l'article) ;
--   2. profiles.beta_flags.cloud = true : le compte devient TÉMOIN de l'offre Cloud (src/config/cloudOffer.js,
--      chargerTemoinCloud) — l'offre se voit et s'ACHÈTE (essai 7 j en bac à sable) ; rien n'est offert : is_cloud,
--      cloud_canal, cloud_essai_* NE sont PAS touchés. Premium, is_comped, mot de passe, e-mail : intouchés ;
--   3. l'article « Robe » (sans photo) part ; 7 articles de démo propres arrivent (photos de fillsell.app/landing, titres,
--      marques, tailles, états, descriptions, prix d'achat et de vente), en stock, aucun publié nulle part.
-- Garde : rien n'est écrit si le compte n'est plus dans l'état relu (Premium offert, aucune trace de Cloud, ce seul
-- article, aucun job) ou si la sauvegarde existe déjà (script déjà passé).
-- Inverse : scripts/reparations/20261105_compte_demo_relecteurs_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261105_compte_demo_relecteurs.sql
BEGIN;

DO $$
DECLARE v_u uuid := '953c1ca6-4851-41e7-b2b0-fb2a18551815';
BEGIN
  IF to_regclass('public._backup_0511_compte_demo_relecteurs') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0511_compte_demo_relecteurs existe déjà : script déjà passé, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_u AND lower(email) = 'googlereview@fillsell.app') THEN
    RAISE EXCEPTION 'compte de démo introuvable : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_u AND p.is_premium IS TRUE AND p.is_comped IS TRUE
                   AND p.is_cloud IS NOT TRUE AND p.cloud_canal IS NULL AND p.cloud_essai_debut IS NULL
                   AND COALESCE((p.beta_flags->>'cloud')::boolean, false) = false) THEN
    RAISE EXCEPTION 'le profil n''est plus dans l''état relu le 05/11 (Premium offert, aucune trace de Cloud) : rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public.inventaire WHERE user_id = v_u) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE user_id = v_u AND id = 1782928830799 AND titre = 'Robe') THEN
    RAISE EXCEPTION 'le stock n''est plus celui relu (un seul article « Robe ») : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE user_id = v_u) THEN
    RAISE EXCEPTION 'le compte a des jobs : rien n''est écrit';
  END IF;
END $$;

CREATE TABLE public._backup_0511_compte_demo_relecteurs AS
  SELECT 'profil_beta_flags'::text AS nature, p.id::text AS cle, COALESCE(p.beta_flags, '{}'::jsonb) AS avant, now() AS le
    FROM public.profiles p WHERE p.id = '953c1ca6-4851-41e7-b2b0-fb2a18551815'
  UNION ALL
  SELECT 'article', i.id::text, to_jsonb(i), now()
    FROM public.inventaire i WHERE i.user_id = '953c1ca6-4851-41e7-b2b0-fb2a18551815';
ALTER TABLE public._backup_0511_compte_demo_relecteurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_compte_demo_relecteurs FROM PUBLIC, anon, authenticated;

UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"cloud": true}'::jsonb
 WHERE id = '953c1ca6-4851-41e7-b2b0-fb2a18551815' AND COALESCE((beta_flags->>'cloud')::boolean, false) = false;

DELETE FROM public.inventaire WHERE user_id = '953c1ca6-4851-41e7-b2b0-fb2a18551815' AND id = 1782928830799;

WITH a(n, titre, marque, taille, couleur, etat, genre, matiere, prix_achat, prix_vente, image, description) AS (VALUES
  (1, 'Casquette beige brodée', 'Volcom', 'Taille unique', 'Beige', 'Très bon état', 'Homme', 'Coton', 4, 15, 'casquette-volcom',
   'Casquette Volcom beige, logo brodé sur l''avant, réglable à l''arrière. Portée quelques fois, très bon état, aucune tache.'),
  (2, 'Bottines en cuir camel', 'Cyrillus', '25', 'Marron', 'Neuf avec étiquette', 'Enfant', 'Cuir', 8, 29, 'chaussures-cyrillus',
   'Bottines Cyrillus pour enfant en cuir camel, lacets et bord festonné. Neuves, jamais portées, étiquette encore attachée.'),
  (3, 'Sweat à capuche noir logo jaune', 'Öhlins', 'L', 'Noir', 'Très bon état', 'Homme', 'Polyester', 6, 25, 'sweat-ohlins',
   'Sweat à capuche Öhlins noir, grand logo jaune sur la poitrine, poche kangourou. Très bon état, coupe confortable.'),
  (4, 'T-shirt noir petit logo', 'Patagonia', 'M', 'Noir', 'Très bon état', 'Homme', 'Coton', 5, 18, 'tshirt-patagonia',
   'T-shirt Patagonia noir, petit logo blanc sur la poitrine. Coton épais, très bon état, couleur bien gardée.'),
  (5, 'Short de bain blanc', 'Polo Ralph Lauren', 'M', 'Blanc', 'Neuf avec étiquette', 'Homme', 'Polyester', 12, 35, 'short-polo',
   'Short de bain Polo Ralph Lauren blanc, taille élastiquée avec cordon, logo brodé. Neuf avec étiquette.'),
  (6, 'Sweat à capuche gris Racing', 'Red Bull Racing', 'L', 'Gris', 'Bon état', 'Homme', 'Coton', 7, 28, 'sweat-redbull',
   'Sweat à capuche Red Bull Racing gris chiné, logos des partenaires sur l''avant, poche kangourou. Bon état général.'),
  (7, 'T-shirt gris imprimé ours', 'Picture Organic Clothing', 'M', 'Gris', 'Très bon état', 'Homme', 'Coton bio', 4, 14, 'tshirt-ours',
   'T-shirt Picture Organic Clothing gris chiné, imprimé ours « Climate Change ». Coton bio, très bon état.')
)
INSERT INTO public.inventaire (id, user_id, titre, marque, type, statut, description, prix_achat, prix_vente, quantite, photos, attributs, date)
SELECT (floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint + a.n,
       '953c1ca6-4851-41e7-b2b0-fb2a18551815', a.titre, a.marque, 'Mode', 'stock', a.description, a.prix_achat, a.prix_vente, 1,
       jsonb_build_array(jsonb_build_object('type', 'original', 'url', 'https://fillsell.app/landing/' || a.image || '.webp')),
       jsonb_build_object(
         'marque',  jsonb_build_object('v', a.marque,  'source', 'manuel', 'at', now()),
         'taille',  jsonb_build_object('v', a.taille,  'source', 'manuel', 'at', now()),
         'couleur', jsonb_build_object('v', a.couleur, 'source', 'manuel', 'at', now()),
         'etat',    jsonb_build_object('v', a.etat,    'source', 'manuel', 'at', now()),
         'genre',   jsonb_build_object('v', a.genre,   'source', 'manuel', 'at', now()),
         'matiere', jsonb_build_object('v', a.matiere, 'source', 'manuel', 'at', now())),
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  FROM a ORDER BY a.n;

COMMIT;

-- Relecture (une seule sortie).
SELECT jsonb_build_object(
  'beta_flags', (SELECT beta_flags FROM public.profiles WHERE id = '953c1ca6-4851-41e7-b2b0-fb2a18551815'),
  'premium', (SELECT jsonb_build_object('is_premium', is_premium, 'is_comped', is_comped, 'is_cloud', is_cloud, 'cloud_canal', cloud_canal)
                FROM public.profiles WHERE id = '953c1ca6-4851-41e7-b2b0-fb2a18551815'),
  'articles', (SELECT jsonb_agg(jsonb_build_object('id', id, 'titre', titre, 'marque', marque, 'prix_vente', prix_vente) ORDER BY id)
                 FROM public.inventaire WHERE user_id = '953c1ca6-4851-41e7-b2b0-fb2a18551815'),
  'sauvegarde', (SELECT count(*) FROM public._backup_0511_compte_demo_relecteurs)) AS relecture;
