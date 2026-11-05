-- (05/11 soir, lot « Ouverture du Cloud », décision g précisée par Nico à 22:05 : « Deux comptes, Cloud jamais offert »)
-- LE COMPTE DE RELECTURE APPLE : test@fillsell.app (d6a9e726-b6f1-4b7f-a927-2487668d6d96, créé le 16/04, déjà saisi
-- dans App Store Connect — rien à ressaisir chez Apple). Google garde googlereview@fillsell.app
-- (scripts/reparations/20261105_compte_demo_relecteurs.sql) : le relecteur Google ne peut ni acheter ni prendre d'essai.
-- Relu le 05/11 à 22:06 (lecture seule) : Premium offert (is_premium, is_comped), beta_flags {}, Cloud jamais pris, 60
-- articles (14 en stock, 46 vendus, AUCUNE photo), 0 job, aucun poste ni IP Cloud.
-- Ce que fait le script (rien d'autre) :
--   1. sauvegarde : public._backup_0511_compte_relecture_apple (beta_flags d'avant ; les identifiants des articles ajoutés) ;
--   2. profiles.beta_flags.cloud = true : TÉMOIN de l'offre Cloud — elle se voit et s'ACHÈTE en bac à sable (le relecteur
--      Apple doit pouvoir l'acheter) ; rien n'est offert : is_cloud, cloud_canal, cloud_essai_* ne sont PAS touchés ;
--      Premium, is_comped, mot de passe, e-mail : intouchés ;
--   3. 7 articles de démo propres AJOUTÉS (photos de fillsell.app/landing) — les 60 articles d'avant ne bougent pas.
-- Garde : rien n'est écrit si le compte n'est plus dans l'état relu, ou si la sauvegarde existe déjà.
-- Inverse : scripts/reparations/20261105_compte_relecture_apple_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261105_compte_relecture_apple.sql
BEGIN;

DO $$
DECLARE v_u uuid := 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
BEGIN
  IF to_regclass('public._backup_0511_compte_relecture_apple') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0511_compte_relecture_apple existe déjà : script déjà passé, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_u AND lower(email) = 'test@fillsell.app') THEN
    RAISE EXCEPTION 'compte de relecture Apple introuvable : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_u AND p.is_premium IS TRUE AND p.is_comped IS TRUE
                   AND p.is_cloud IS NOT TRUE AND p.cloud_canal IS NULL AND p.cloud_essai_debut IS NULL
                   AND COALESCE((p.beta_flags->>'cloud')::boolean, false) = false) THEN
    RAISE EXCEPTION 'le profil n''est plus dans l''état relu le 05/11 (Premium offert, aucune trace de Cloud) : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE user_id = v_u) THEN
    RAISE EXCEPTION 'le compte a des jobs : rien n''est écrit';
  END IF;
END $$;

CREATE TABLE public._backup_0511_compte_relecture_apple AS
  SELECT 'profil_beta_flags'::text AS nature, p.id::text AS cle, COALESCE(p.beta_flags, '{}'::jsonb) AS avant, now() AS le
    FROM public.profiles p WHERE p.id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
ALTER TABLE public._backup_0511_compte_relecture_apple ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_compte_relecture_apple FROM PUBLIC, anon, authenticated;

UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"cloud": true}'::jsonb
 WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96' AND COALESCE((beta_flags->>'cloud')::boolean, false) = false;

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
       'd6a9e726-b6f1-4b7f-a927-2487668d6d96', a.titre, a.marque, 'Mode', 'stock', a.description, a.prix_achat, a.prix_vente, 1,
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

INSERT INTO public._backup_0511_compte_relecture_apple (nature, cle, avant, le)
SELECT 'article_ajoute', i.id::text, NULL, now() FROM public.inventaire i
 WHERE i.user_id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96' AND (i.photos->0->>'url') LIKE 'https://fillsell.app/landing/%';

COMMIT;

-- Relecture (une seule sortie).
SELECT jsonb_build_object(
  'beta_flags', (SELECT beta_flags FROM public.profiles WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96'),
  'premium', (SELECT jsonb_build_object('is_premium', is_premium, 'is_comped', is_comped, 'is_cloud', is_cloud, 'cloud_canal', cloud_canal)
                FROM public.profiles WHERE id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96'),
  'articles', (SELECT count(*) FROM public.inventaire WHERE user_id = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96'),
  'ajoutes', (SELECT count(*) FROM public._backup_0511_compte_relecture_apple WHERE nature = 'article_ajoute')) AS relecture;
