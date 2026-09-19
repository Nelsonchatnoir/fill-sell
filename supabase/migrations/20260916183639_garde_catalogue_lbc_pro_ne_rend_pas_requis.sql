-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — `garde_aspects_lbc_requis` fonction + trigger (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliquée en prod le 16/09/2026 à 20h36 sous la version
-- 20260916183639 (`garde_catalogue_lbc_pro_ne_rend_pas_requis`), sans fichier
-- dans le dépôt. 0 occurrence du nom avant celui-ci.
-- Le trigger porte le MÊME nom que la fonction. Les triggers de
-- platform_category_aspects s'exécutent par ordre alphabétique :
--   aspects_garde_corroboration_trg → garde_aspects_lbc_requis
--   → garde_aspects_question_posable → platform_category_aspects_garde_source
-- Ce rapatriement ne change AUCUN nom, donc aucun ordre d'exécution.
-- CE QUI SUIT EST LE SQL RÉEL, copié depuis
-- supabase_migrations.schema_migrations.statements — non réécrit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── LE CATALOGUE NE DISTINGUE PAS PRO ET PARTICULIER (2026-09-16) ───────────
-- CE QUE ÇA A COÛTÉ : Ornella bloquée au stepper sur « Taille » (Leboncoin,
-- Mode > Vêtements) à 20h32 — la PREMIÈRE fois que ce champ bloque, jamais vu
-- avant dans usage_logs. Cause : platform_category_aspects est indexé par
-- (plateforme, catégorie, champ) et par RIEN d'autre. Les relevés faits sur la
-- page d'un compte PRO (MeMiniandMove, 6 critères requis là où le formulaire
-- particulier n'en a qu'UN — mesuré le même soir sur les deux formulaires) y
-- écrasent `required`, et le stepper les réclame ensuite à TOUT LE MONDE.
--
-- Garde PROVISOIRE, en attendant que l'extension marque l'origine du relevé
-- (marqueur pro = présence de `custom_ref` sur la page) — ça, c'est un paquet
-- CWS. D'ici là, côté base, deux règles pour Leboncoin :
--   (a) les champs qui n'existent PAS dans le tunnel particulier
--       (estimated_parcel_weight, quantity, spare_parts_availability —
--       vérifié en ouvrant le formulaire) ne peuvent jamais être requis ;
--   (b) `required` ne peut plus PASSER de false à true sur une ligne
--       existante. L'apprentissage d'un nouveau requis est en PAUSE pour
--       Leboncoin : bloquer quelqu'un au stepper coûte plus cher que de
--       laisser Leboncoin trancher au dépôt (il rend alors un needs_user
--       nommé, avec sa liste).
-- Le reste continue normalement : libellés, options, seen_count, et les
-- autres plateformes ne sont pas touchées.
-- ⚠️ TROU RÉSIDUEL ASSUMÉ : une ligne CRÉÉE par une page pro sur une clé
-- inconnue passe encore (c'est ainsi que les 6 lignes de ce soir sont nées).
-- Seul le marqueur d'origine le fermera.
create or replace function public.garde_aspects_lbc_requis()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.platform is distinct from 'leboncoin' then
    return new;
  end if;

  -- (a) champs absents du formulaire particulier : jamais requis
  if new.field_key in ('estimated_parcel_weight', 'quantity', 'spare_parts_availability') then
    new.required := false;
    return new;
  end if;

  -- (b) pas de montée false → true sur une ligne déjà connue
  if tg_op = 'UPDATE' and coalesce(old.required, false) = false and coalesce(new.required, false) = true then
    new.required := false;
  end if;

  return new;
end;
$$;

drop trigger if exists garde_aspects_lbc_requis on public.platform_category_aspects;
create trigger garde_aspects_lbc_requis
  before insert or update on public.platform_category_aspects
  for each row execute function public.garde_aspects_lbc_requis();
