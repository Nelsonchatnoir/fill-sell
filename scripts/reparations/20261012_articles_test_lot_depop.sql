-- ═══════════════════════════════════════════════════════════════════════════
-- B3 (12/10) — 21 ARTICLES DE TEST, compte de Nico, pour la preuve RÉELLE du
-- lot de plus de 20 articles sur Depop (A1 : plus de plafond à 20).
-- ═══════════════════════════════════════════════════════════════════════════
-- Demande de Nico (11/10) : « publication en lot de plus de 20 articles au bon
-- rythme » ; plateforme du lot = Depop (réponse du 11/10). Articles de test à
-- 999 € (règle : jamais moins), titre « TEST FillSell ne pas acheter », photo
-- d'un article de test déjà existant (1791730353942). Ce script ne crée QUE des
-- fiches : les jobs naissent de la publication en lot de l'app, au geste.
-- Inverse : 20261012_articles_test_lot_depop_INVERSE.sql (une fois les
-- annonces Depop retirées — B4).
insert into public.inventaire (id, user_id, date, type, titre, description, photos, statut, quantite,
                               prix_achat, prix_vente, attributs, created_at)
select 1791800000000 + k,
       'f44b5917-bccc-4431-ba41-f40571a2ed18',
       now(), 'Mode',
       'TEST FillSell ne pas acheter - T-shirt homme blanc taille M n°' || k,
       'Article de TEST FillSell (vérification technique) : ne pas acheter, il sera retiré dans l''heure.',
       '[{"url":"https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/f44b5917-bccc-4431-ba41-f40571a2ed18/raw/1790963980785_0.jpg?v=1790963980785","type":"original"}]'::jsonb,
       'stock', 1, 1, 999,
       jsonb_build_object(
         'etat',    jsonb_build_object('v', 'Très bon état', 'at', now(), 'source', 'test_b3_1210'),
         'taille',  jsonb_build_object('v', 'M',             'at', now(), 'source', 'test_b3_1210'),
         'genre',   jsonb_build_object('v', 'Homme',         'at', now(), 'source', 'test_b3_1210'),
         'couleur', jsonb_build_object('v', 'Blanc',         'at', now(), 'source', 'test_b3_1210'),
         'objet',   jsonb_build_object('v', 'T-shirt',       'at', now(), 'source', 'test_b3_1210')),
       now() - (k || ' seconds')::interval
from generate_series(1, 21) as k
on conflict (id) do nothing
returning id, titre;
