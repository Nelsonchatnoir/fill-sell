-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — `garde_aspects_question_posable` fonction + trigger
-- (rapatrié le 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliquée en prod le 16/09/2026 à 21h06 sous la version
-- 20260916190613 (`garde_catalogue_aspects_question_posable`), sans fichier
-- dans le dépôt. 0 occurrence du nom avant celui-ci.
-- C'est CETTE garde qui épingle vinted/photos et vinted/description à
-- required=false depuis le 16/09 21h06 — le verrou serveur derrière la
-- neutralisation d'écran posée le 19/09 dans ListingPreviewScreen.jsx.
-- Le trigger porte le MÊME nom que la fonction ; aucun ordre d'exécution
-- n'est modifié par ce rapatriement.
-- CE QUI SUIT EST LE SQL RÉEL, copié depuis
-- supabase_migrations.schema_migrations.statements — non réécrit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── UN CHAMP QU'ON NE PEUT PAS POSER N'EST JAMAIS UNE QUESTION (2026-09-16) ──
-- CE QUE ÇA A COÛTÉ : Ornella s'est vu réclamer un champ « Photos » VIDE au
-- stepper, sur Vinted. Il n'y a rien à saisir dans un champ photos — ses
-- photos étaient sur l'article. Elle a tapé une valeur au hasard pour passer.
-- Origine : UN refus 400 de Vinted, à UN utilisateur, à UN moment (11/09
-- 18:52), écrit dans platform_category_aspects avec required=true et
-- input_type NULL. Le stepper lit toute ligne required=true de la catégorie,
-- pour TOUT LE MONDE, et sans input_type il tombe en saisie libre.
-- Même mécanisme que la contamination pro→particulier de Leboncoin le même
-- soir (cf. garde_catalogue_lbc_pro_ne_rend_pas_requis), sur une autre
-- plateforme : une observation PONCTUELLE devient une contrainte de PARC.
--
-- Cette garde-ci est une règle de FORME, valable pour les quatre plateformes,
-- et volontairement pas une liste de champs :
--   (a) le CONTENU de l'annonce n'est pas un attribut. photos, title,
--       description, price : FillSell les possède déjà, ils ne se demandent
--       jamais. Motif ancré (^…$) et non « contient » : `image_sound_product`
--       (« Produit » de Électronique > Photo, audio & vidéo) est un vrai
--       critère, il ne doit PAS être attrapé — vérifié avant d'écrire.
--   (b) un champ dont le LIBELLÉ est resté la clé technique en snake_case
--       (`package_size`, `language_book`) est un champ que la plateforme n'a
--       jamais nommé : on afficherait « package_size » à l'utilisateur avec
--       une zone de texte libre. Tant qu'il n'a pas de libellé humain, il ne
--       se pose pas. Le `~ '^[a-z0-9]+(_[a-z0-9]+)+$'` est délibérément
--       étroit : Beebs stocke 400 lignes où libellé = clé (« Taille »,
--       « Marque ») et elles doivent continuer à être posées — vérifié, la
--       règle n'en touche aucune.
-- ⛔ Ce qui reste posable continue de l'être : Univers, Marque, Taille,
--    Produit, Couleur, ISBN, État. Aucun n'est touché.
-- ⚠️ `required=false` ici ne veut pas dire « pas obligatoire chez eux » :
--    language_book EST exigé par Vinted sur les livres. Ça veut dire « on ne
--    le demande pas au stepper ». La plateforme tranche au dépôt et rend un
--    needs_user nommé avec sa liste — une question qu'on sait poser.
create or replace function public.garde_aspects_question_posable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.required, false) = false then
    return new;
  end if;

  -- (a) contenu de l'annonce, jamais un attribut
  if new.field_key ~* '^(photo|photos|image|images|picture|pictures|media|title|titre|description|price|prix)$' then
    new.required := false;
    return new;
  end if;

  -- (b) libellé jamais traduit : la clé technique brute
  if new.field_label = new.field_key and new.field_label ~ '^[a-z0-9]+(_[a-z0-9]+)+$' then
    new.required := false;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists garde_aspects_question_posable on public.platform_category_aspects;
create trigger garde_aspects_question_posable
  before insert or update on public.platform_category_aspects
  for each row execute function public.garde_aspects_question_posable();
