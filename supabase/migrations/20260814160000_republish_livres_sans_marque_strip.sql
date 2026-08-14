-- ─────────────────────────────────────────────────────────────────────────────
-- Pont TEMPORAIRE parc 0.6.2 : Livres « Sans marque » → clé retirée à l'écriture
-- (2026-08-14 — jobs needs_user de Lau Brzl, catégorie Livres, 5 captures déjà
-- corrigées à la main par Nico : 248, 249, 250, 253, 257.)
--
-- POURQUOI : le formulaire Vinted des Livres n'expose AUCUN champ Marque. Le
-- parc (0.6.2) tente pourtant de poser « Sans marque » (chemin natif
-- #empty-brand) → « Élément introuvable » → needs_user, Pépite consommée. Le
-- no-op est corrigé dans l'extension (401c649, paquet 0.6.5) mais BLOQUÉ
-- derrière la review CWS de la 0.6.4. Or la recréation RELIT la capture
-- depuis Postgres à chaque étape (background.js : SELECT sur
-- vinted_republish_captures aux étapes 'captured' et 'deleted'), et
-- fillListingForm SAUTE l'étape Marque quand libelles.marque est absent
-- (`if (fields.marque)`). Retirer la clé À L'ÉCRITURE débloque donc le parc
-- sans toucher ni l'extension ni les jobs.
--
-- PORTÉE VOLONTAIREMENT ÉTROITE (décision Nico 14/08, spec initiale resserrée) :
--   · marque = 'Sans marque' en égalité STRICTE (casse et accents compris) —
--     jamais NULL, jamais vide, jamais un LIKE, jamais une vraie marque ;
--   · ET racine categoryPath[0] = 'Livres et médias' en égalité STRICTE —
--     un vêtement « Sans marque » a un champ Marque et se remplit
--     correctement en 0.6.2 : lui retirer la clé le casserait APRÈS
--     suppression (#brand vide → 400, bug eb9d899) ;
--   · categoryPath absent, NULL ou non-tableau → NE RIEN FAIRE ;
--   · aucune autre clé de libelles touchée, aucune autre table touchée.
--
-- ⏳ À RETIRER dès l'acceptation CWS de la 0.6.5 : migration de suppression
-- prête dans 20260814160001_republish_livres_sans_marque_strip_retrait.sql
-- (NON appliquée, même commit) — pas de code mort en prod dans six mois.
-- Idempotent : rejouable sans effet de bord.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.republish_livres_sans_marque_strip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Garde-fou : libelles doit être un objet et categoryPath un TABLEAU jsonb ;
  -- sinon on ne touche à rien (pas de défaut, pas de repli).
  if new.libelles is null
     or jsonb_typeof(new.libelles) is distinct from 'object'
     or jsonb_typeof(new.libelles->'categoryPath') is distinct from 'array' then
    return new;
  end if;

  -- Égalités STRICTES des deux côtés. Clé 'marque' absente (captures déjà
  -- corrigées à la main) → ->> rend NULL → condition fausse → no-op.
  if (new.libelles->>'marque') = 'Sans marque'
     and (new.libelles->'categoryPath'->>0) = 'Livres et médias' then
    new.libelles := new.libelles - 'marque';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_republish_livres_sans_marque_strip on public.vinted_republish_captures;
create trigger trg_republish_livres_sans_marque_strip
  before insert or update on public.vinted_republish_captures
  for each row
  execute function public.republish_livres_sans_marque_strip();
