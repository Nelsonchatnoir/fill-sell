-- ═══════════════════════════════════════════════════════════════════════════
-- fiches_annonce.brouillon — un article généré n'est pas encore du stock
-- ═══════════════════════════════════════════════════════════════════════════
-- Depuis le lot du 2026-09-15, un scan Lens crée l'article AU DÉBIT. C'est ce
-- qu'il fallait — mais ça remplit le Stock d'articles sur lesquels l'utilisateur
-- n'a encore RIEN fait. Trois états, un seul critère de passage : un geste.
--
--   BROUILLON  l'article existe, l'utilisateur n'a rien fait dessus
--   EN STOCK   il l'a explicitement rangé, sans publier
--   EN LIGNE   au moins un job est parti
--
-- ⚠️ UN BROUILLON N'EST PAS UN ÉCHEC. L'app a déjà un état pour « l'annonce a
--    échoué » (cross_post_jobs.status = 'failed', et le bandeau qui va avec).
--    Un brouillon n'a JAMAIS été tenté : rien n'a échoué, rien n'est cassé.
--    Ne jamais confondre les deux, ni en base, ni à l'écran.
-- ⚠️ UN BROUILLON N'EST PAS UN ARTICLE IMPORTÉ. Les lignes origine='vinted_sync'
--    sont EN LIGNE sur Vinted. Elles n'ont pas de fiche, donc ne peuvent pas
--    entrer ici — mais la règle se dit quand même : elles ne deviennent jamais
--    des brouillons.
--
-- POURQUOI LE DÉFAUT EST `false`, ET POURQUOI C'EST IMPORTANT.
-- La colonne n'est posée à `true` que par le chemin qui CRÉE l'article
-- (lens-analysis mode annonce, generate-listing sur un corps item_data). Tous
-- les autres écrivains de la fiche — le stepper qui sauvegarde à chaque
-- modification, generate-listing sur un article DÉJÀ au stock — n'envoient pas
-- la clé du tout : sur conflit PostgREST ne met à jour que les colonnes
-- présentes dans la charge, donc l'état de brouillon survit intact à une
-- régénération, et un article déjà rangé ne peut pas y retomber.
-- Conséquence directe et voulue : les lignes DÉJÀ en base prennent `false`.
-- AUCUNE bascule rétroactive — une reprise de l'historique serait une décision
-- de Nico, sur une mesure, pas un effet de bord de migration.
--
-- LA SORTIE. Un seul chemin de code (src/utils/brouillon.js), deux points
-- d'entrée : le bouton « Ajouter au stock » de la carte, et la publication.
-- La suppression, elle, reste le geste existant (delItem → retrait_annonces),
-- et la cascade sur inventaire emporte la fiche.

alter table public.fiches_annonce
  add column if not exists brouillon boolean not null default false;

-- Le défaut ne vaut QUE pour les lignes à venir : celles d'avant restent à
-- false (cf. ci-dessus). Les créateurs d'article posent `true` explicitement,
-- ce qui rend le défaut inutile — il est laissé à false pour que l'oubli d'un
-- futur appelant produise « pas un brouillon » (visible dans le stock) plutôt
-- qu'un article qui disparaîtrait du stock sans que personne l'ait demandé.

comment on column public.fiches_annonce.brouillon is
  'true = l''article a été créé par une génération et l''utilisateur n''a encore rien fait dessus. Posé UNIQUEMENT par le chemin qui crée l''article ; jamais touché par une sauvegarde de stepper ni par une régénération. Sortie par un geste : « Ajouter au stock » ou publication. N''est PAS un état d''échec.';

-- La section Brouillons lit « mes brouillons » à chaque ouverture du Stock :
-- index partiel, il ne porte que les lignes concernées.
create index if not exists fiches_annonce_brouillon_idx
  on public.fiches_annonce (user_id)
  where brouillon;
